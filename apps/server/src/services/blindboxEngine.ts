import { eq, and, sql, desc } from 'drizzle-orm';
import Decimal from 'decimal.js';
import {
  blindboxes,
  blindboxItems,
  blindboxProducts,
  blindboxRecords,
  userInventory,
  userPityCounter,
} from '../db/schema.js';
import { db } from '../db/client.js';
import { freezeBalance, unfreezeBalance, consumeFrozenBalance, changeBalance } from './walletService.js';
import { secureRandom } from '../utils/crypto.js';
import { AppError } from '../middleware/errorHandler.js';
import { distributeCommission } from './agentService.js';
import { getConfig } from './featureService.js';
import { CONFIG_KEYS, DEFAULT_CONFIG, WS_EVENTS } from '@app/shared';
import { publisher, CHANNELS } from '../redis.js';
import { logger } from '../logger.js';

const PITY_THRESHOLD = DEFAULT_CONFIG.PITY_THRESHOLD;
const PITY_RARITIES = ['epic', 'legendary', 'mythic'];

/**
 * 列出所有上架盲盒
 */
export async function listBlindboxes() {
  const rows = await db
    .select()
    .from(blindboxes)
    .where(eq(blindboxes.isActive, true))
    .orderBy(desc(blindboxes.sortOrder), desc(blindboxes.id));
  return rows;
}

/**
 * 盲盒详情（含奖品池公示）
 */
export async function getBlindboxDetail(id: number) {
  const box = await db.select().from(blindboxes).where(eq(blindboxes.id, id)).limit(1);
  if (!box[0]) throw new AppError('BLINDBOX_NOT_FOUND', '盲盒不存在', 404);

  const items = await db
    .select({
      id: blindboxItems.id,
      blindboxId: blindboxItems.blindboxId,
      productId: blindboxItems.productId,
      probability: blindboxItems.probability,
      stock: blindboxItems.stock,
      initialStock: blindboxItems.initialStock,
      product: blindboxProducts,
    })
    .from(blindboxItems)
    .leftJoin(blindboxProducts, eq(blindboxItems.productId, blindboxProducts.id))
    .where(eq(blindboxItems.blindboxId, id));

  return { ...box[0], items };
}

/**
 * 加权随机抽奖
 * - 应用保底机制：连续 N 次未出 epic+ 时强制出 epic+
 */
async function drawProduct(
  userId: number,
  blindboxId: number,
  itemRows: Array<{
    productId: number;
    probability: string;
    stock: number;
    rarity: string;
  }>
): Promise<{ productId: number; rarity: string; isPity: boolean }> {
  // 取保底计数
  const counterRows = await db
    .select()
    .from(userPityCounter)
    .where(and(eq(userPityCounter.userId, userId), eq(userPityCounter.blindboxId, blindboxId)))
    .limit(1);
  const counter = counterRows[0]?.counter ?? 0;
  const needPity = counter >= PITY_THRESHOLD - 1; // 即将命中保底

  // 过滤库存 > 0
  const available = itemRows.filter((it) => it.stock > 0);
  if (available.length === 0) {
    throw new AppError('OUT_OF_STOCK', '所有奖品库存已售罄', 400);
  }

  let pool = available;
  if (needPity) {
    const pityPool = available.filter((it) => PITY_RARITIES.includes(it.rarity));
    if (pityPool.length > 0) pool = pityPool;
  }

  // 加权随机
  const total = pool.reduce((s, it) => s + Number(it.probability), 0);
  if (total <= 0) {
    // 兜底：均分
    const idx = Math.floor(secureRandom() * pool.length);
    const picked = pool[idx]!;
    return { productId: picked.productId, rarity: picked.rarity, isPity: needPity };
  }
  const r = secureRandom() * total;
  let acc = 0;
  for (const it of pool) {
    acc += Number(it.probability);
    if (r <= acc) {
      return {
        productId: it.productId,
        rarity: it.rarity,
        isPity: needPity && PITY_RARITIES.includes(it.rarity),
      };
    }
  }
  const last = pool[pool.length - 1]!;
  return { productId: last.productId, rarity: last.rarity, isPity: needPity };
}

/**
 * 购买并开盲盒（支持一次开多个）
 */
export async function openBlindbox(
  userId: number,
  blindboxId: number,
  count = 1
): Promise<Array<{ recordId: number; product: any; isPity: boolean }>> {
  if (count < 1 || count > 10) throw new AppError('INVALID_COUNT', '一次最多开 10 个', 400);

  const box = await db.select().from(blindboxes).where(eq(blindboxes.id, blindboxId)).limit(1);
  if (!box[0]) throw new AppError('BLINDBOX_NOT_FOUND', '盲盒不存在', 404);
  if (!box[0].isActive) throw new AppError('BLINDBOX_DISABLED', '盲盒已下架', 400);
  if (box[0].isLimited && box[0].limitCount && box[0].soldCount >= box[0].limitCount) {
    throw new AppError('SOLD_OUT', '盲盒已售罄', 400);
  }
  const now = new Date();
  if (box[0].startAt && box[0].startAt > now) {
    throw new AppError('NOT_STARTED', '盲盒未开始', 400);
  }
  if (box[0].endAt && box[0].endAt < now) {
    throw new AppError('ENDED', '盲盒已结束', 400);
  }

  const totalCost = new Decimal(box[0].price).mul(count);

  // 冻结资金
  await freezeBalance(
    userId,
    totalCost.toFixed(6),
    'blindbox_buy',
    'blindbox',
    blindboxId,
    `购买 ${box[0].name} x${count}`
  );

  const results: Array<{ recordId: number; product: any; isPity: boolean }> = [];
  let totalRefund = new Decimal(0);

  try {
    for (let i = 0; i < count; i++) {
      // 取奖品池（每次重新取以反映最新库存）
      const items = await db
        .select({
          productId: blindboxItems.productId,
          probability: blindboxItems.probability,
          stock: blindboxItems.stock,
          rarity: blindboxProducts.rarity,
        })
        .from(blindboxItems)
        .leftJoin(blindboxProducts, eq(blindboxItems.productId, blindboxProducts.id))
        .where(eq(blindboxItems.blindboxId, blindboxId));

      const itemRows = items.map((it) => ({
        productId: it.productId,
        probability: it.probability,
        stock: it.stock,
        rarity: (it.rarity ?? 'common') as string,
      }));

      const draw = await drawProduct(userId, blindboxId, itemRows);

      // 库存扣减 + 创建记录 + 入背包 + 更新保底计数（事务内）
      const recordId: number = await db.transaction(async (tx) => {
        const upd = await tx
          .update(blindboxItems)
          .set({ stock: sql`${blindboxItems.stock} - 1` })
          .where(
            and(
              eq(blindboxItems.blindboxId, blindboxId),
              eq(blindboxItems.productId, draw.productId),
              sql`${blindboxItems.stock} > 0`
            )
          )
          .returning({ stock: blindboxItems.stock });
        if (upd.length === 0) throw new AppError('OUT_OF_STOCK', '抽中商品已售罄', 400);

        await tx
          .update(blindboxes)
          .set({ soldCount: sql`${blindboxes.soldCount} + 1`, updatedAt: new Date() })
          .where(eq(blindboxes.id, blindboxId));

        const [rec] = await tx
          .insert(blindboxRecords)
          .values({
            userId,
            blindboxId,
            productId: draw.productId,
            rarity: draw.rarity,
            cost: box[0]!.price,
            isPity: draw.isPity,
            action: 'kept',
          })
          .returning({ id: blindboxRecords.id });

        await tx.insert(userInventory).values({
          userId,
          productId: draw.productId,
          sourceRecordId: rec!.id,
          status: 'owned',
        });

        // 更新保底计数：抽到 epic+ 重置；否则 +1
        if (PITY_RARITIES.includes(draw.rarity)) {
          await tx
            .insert(userPityCounter)
            .values({ userId, blindboxId, counter: 0 })
            .onConflictDoUpdate({
              target: [userPityCounter.userId, userPityCounter.blindboxId],
              set: { counter: 0, updatedAt: new Date() },
            });
        } else {
          await tx
            .insert(userPityCounter)
            .values({ userId, blindboxId, counter: 1 })
            .onConflictDoUpdate({
              target: [userPityCounter.userId, userPityCounter.blindboxId],
              set: {
                counter: sql`${userPityCounter.counter} + 1`,
                updatedAt: new Date(),
              },
            });
        }

        return rec!.id;
      });

      // 取商品详情
      const productRow = await db
        .select()
        .from(blindboxProducts)
        .where(eq(blindboxProducts.id, draw.productId))
        .limit(1);

      results.push({ recordId, product: productRow[0]!, isPity: draw.isPity });

      // 全站广播稀有以上中奖
      if (['legendary', 'mythic'].includes(draw.rarity)) {
        void publisher.publish(
          CHANNELS.BROADCAST,
          JSON.stringify({
            event: WS_EVENTS.BROADCAST_BLINDBOX,
            data: {
              userId,
              blindboxName: box[0].name,
              productName: productRow[0]?.name,
              rarity: draw.rarity,
              ts: Date.now(),
            },
          })
        );
      }
    }

    // 消费冻结资金（购买实际产生的费用）
    await consumeFrozenBalance(
      userId,
      totalCost.toFixed(6),
      'blindbox_buy',
      'blindbox',
      blindboxId,
      `购买 ${box[0].name} x${count}`
    );

    // 代理佣金（按 baseAmount = totalCost * platform_fee_rate 给上级）
    const feeRate =
      (await getConfig<number>('platform.fee_rate', DEFAULT_CONFIG.PLATFORM_FEE_RATE)) ??
      DEFAULT_CONFIG.PLATFORM_FEE_RATE;
    const baseAmount = totalCost.mul(feeRate).toNumber();
    if (baseAmount > 0) {
      await distributeCommission({
        fromUserId: userId,
        sourceType: 'blindbox',
        sourceId: blindboxId,
        baseAmount,
      });
    }
  } catch (e) {
    // 失败：把已冻结但还未抽完的资金部分退还
    if (results.length < count) {
      const refundCount = count - results.length;
      const refund = new Decimal(box[0].price).mul(refundCount);
      totalRefund = refund;
      await unfreezeBalance(
        userId,
        refund.toFixed(6),
        'blindbox_buy',
        'blindbox',
        blindboxId,
        `退还未抽中部分 (x${refundCount})`
      );
      // 已抽到的部分仍要扣款
      const consumed = totalCost.minus(refund);
      if (consumed.greaterThan(0)) {
        await consumeFrozenBalance(
          userId,
          consumed.toFixed(6),
          'blindbox_buy',
          'blindbox',
          blindboxId,
          `购买 ${box[0].name} x${results.length}`
        );
      }
    }
    throw e;
  }

  logger.info({ userId, blindboxId, count, refund: totalRefund.toFixed(6) }, '[blindbox] opened');
  return results;
}

/**
 * 兑换背包物品为 USDT
 */
export async function exchangeInventory(userId: number, inventoryIds: number[]) {
  if (inventoryIds.length === 0) throw new AppError('NO_ITEMS', '请选择要兑换的物品', 400);

  return db.transaction(async (tx) => {
    const items = await tx
      .select({
        invId: userInventory.id,
        productId: userInventory.productId,
        status: userInventory.status,
        value: blindboxProducts.value,
        name: blindboxProducts.name,
      })
      .from(userInventory)
      .leftJoin(blindboxProducts, eq(userInventory.productId, blindboxProducts.id))
      .where(and(eq(userInventory.userId, userId), sql`${userInventory.id} = ANY(${inventoryIds})`))
      .for('update');

    if (items.length !== inventoryIds.length) {
      throw new AppError('ITEM_NOT_FOUND', '部分物品不存在', 400);
    }
    for (const it of items) {
      if (it.status !== 'owned') {
        throw new AppError('ALREADY_EXCHANGED', '部分物品已兑换', 400);
      }
    }

    const total = items.reduce((s, it) => s.plus(it.value ?? 0), new Decimal(0));

    await tx
      .update(userInventory)
      .set({ status: 'exchanged', exchangedAt: new Date() })
      .where(sql`${userInventory.id} = ANY(${inventoryIds})`);

    // 兑换记录写入 blindbox_records 的 action
    // 这里简化：在钱包流水中体现
    return total;
  })
    .then(async (total) => {
      if (total.greaterThan(0)) {
        await changeBalance({
          userId,
          amount: total.toFixed(6),
          type: 'blindbox_exchange',
          refType: 'inventory',
          refId: inventoryIds.join(','),
          description: `背包物品兑换 (${inventoryIds.length} 件)`,
        });
      }
      return { totalValue: total.toFixed(6), count: inventoryIds.length };
    });
}

/**
 * 用户背包
 */
export async function getUserInventory(userId: number, page = 1, pageSize = 20) {
  const offset = (page - 1) * pageSize;
  const [items, totalRow] = await Promise.all([
    db
      .select({
        id: userInventory.id,
        productId: userInventory.productId,
        status: userInventory.status,
        createdAt: userInventory.createdAt,
        product: blindboxProducts,
      })
      .from(userInventory)
      .leftJoin(blindboxProducts, eq(userInventory.productId, blindboxProducts.id))
      .where(eq(userInventory.userId, userId))
      .orderBy(desc(userInventory.id))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(userInventory)
      .where(eq(userInventory.userId, userId)),
  ]);
  return { items, total: totalRow[0]?.count ?? 0, page, pageSize };
}

/**
 * 用户开箱记录
 */
export async function getUserBlindboxRecords(userId: number, page = 1, pageSize = 20) {
  const offset = (page - 1) * pageSize;
  const [items, totalRow] = await Promise.all([
    db
      .select({
        id: blindboxRecords.id,
        blindboxId: blindboxRecords.blindboxId,
        productId: blindboxRecords.productId,
        rarity: blindboxRecords.rarity,
        cost: blindboxRecords.cost,
        isPity: blindboxRecords.isPity,
        action: blindboxRecords.action,
        createdAt: blindboxRecords.createdAt,
        product: blindboxProducts,
        boxName: blindboxes.name,
      })
      .from(blindboxRecords)
      .leftJoin(blindboxProducts, eq(blindboxRecords.productId, blindboxProducts.id))
      .leftJoin(blindboxes, eq(blindboxRecords.blindboxId, blindboxes.id))
      .where(eq(blindboxRecords.userId, userId))
      .orderBy(desc(blindboxRecords.id))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(blindboxRecords)
      .where(eq(blindboxRecords.userId, userId)),
  ]);
  return { items, total: totalRow[0]?.count ?? 0, page, pageSize };
}
