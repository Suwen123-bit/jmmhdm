import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { db } from './client.js';
import {
  users,
  blindboxes,
  blindboxItems,
  blindboxProducts,
  tradeRiskConfig,
} from './schema.js';
import { ensureDefaultConfigs } from '../services/featureService.js';
import { randomInviteCode } from '../utils/crypto.js';

async function seed() {
  console.log('[seed] start');

  // 1. 默认配置
  await ensureDefaultConfigs();
  console.log('[seed] default configs ensured');

  // 2. 默认风控配置
  const defaultRisk = [
    { symbol: 'btcusdt' as const, durations: [60, 300, 600] },
    { symbol: 'ethusdt' as const, durations: [60, 300, 600] },
    { symbol: 'solusdt' as const, durations: [60, 300, 600] },
    { symbol: 'bnbusdt' as const, durations: [60, 300, 600] },
    { symbol: 'dogeusdt' as const, durations: [60, 300, 600] },
    { symbol: 'xrpusdt' as const, durations: [60, 300, 600] },
  ];
  for (const { symbol, durations } of defaultRisk) {
    for (const d of durations) {
      const payoutRate = d === 60 ? 0.85 : d === 300 ? 0.92 : 0.95;
      await db
        .insert(tradeRiskConfig)
        .values({
          symbol,
          duration: d,
          payoutRate: payoutRate.toFixed(4),
          priceOffsetBps: 0,
          trendBias: '0',
          delayMs: 0,
          maxSingleBet: '5000.000000',
          maxTotalExposure: '500000.000000',
          enabled: true,
        })
        .onConflictDoNothing({ target: [tradeRiskConfig.symbol, tradeRiskConfig.duration] });
    }
  }
  console.log('[seed] risk configs ensured');

  // 3. 超管账户
  const adminUsername = 'admin';
  const adminEmail = 'admin@example.com';
  const existing = await db.select().from(users).where(eq(users.username, adminUsername)).limit(1);
  if (!existing[0]) {
    const passwordHash = await bcrypt.hash('Admin@123456', 10);
    await db.insert(users).values({
      username: adminUsername,
      email: adminEmail,
      passwordHash,
      inviteCode: randomInviteCode(8),
      role: 'super_admin',
      status: 'active',
      balance: '0',
    });
    console.log('[seed] admin user created (admin / Admin@123456)');
  } else {
    console.log('[seed] admin user already exists');
  }

  // 4. 示例盲盒商品
  const sampleProducts = [
    { name: '黄金钥匙', imageUrl: '/products/gold-key.png', rarity: 'legendary' as const, value: 200 },
    { name: '银色护符', imageUrl: '/products/silver-amulet.png', rarity: 'epic' as const, value: 80 },
    { name: '魔法宝石', imageUrl: '/products/gem.png', rarity: 'rare' as const, value: 25 },
    { name: '神秘卷轴', imageUrl: '/products/scroll.png', rarity: 'common' as const, value: 5 },
    { name: '幸运币', imageUrl: '/products/coin.png', rarity: 'common' as const, value: 1 },
  ];
  const productIds: number[] = [];
  for (const p of sampleProducts) {
    const r = await db.select().from(blindboxProducts).where(eq(blindboxProducts.name, p.name)).limit(1);
    if (r[0]) {
      productIds.push(r[0].id);
    } else {
      const inserted = await db
        .insert(blindboxProducts)
        .values({
          name: p.name,
          imageUrl: p.imageUrl,
          rarity: p.rarity,
          value: p.value.toFixed(6),
          description: `稀有度: ${p.rarity}`,
        })
        .returning();
      productIds.push(inserted[0]!.id);
    }
  }

  // 5. 示例盲盒
  const boxName = '幸运初体验盲盒';
  const existingBox = await db.select().from(blindboxes).where(eq(blindboxes.name, boxName)).limit(1);
  if (!existingBox[0]) {
    const ins = await db
      .insert(blindboxes)
      .values({
        name: boxName,
        price: '10.000000',
        coverUrl: '/blindboxes/starter.png',
        description: '新手入门盲盒，包含 5 种不同稀有度奖品',
        tags: ['新手', '热门'],
        isActive: true,
        sortOrder: 100,
      })
      .returning();
    const boxId = ins[0]!.id;
    const probs = [0.02, 0.08, 0.2, 0.4, 0.3]; // 对应 sampleProducts
    const stocks = [50, 200, 500, 2000, 5000];
    for (let i = 0; i < productIds.length; i++) {
      await db.insert(blindboxItems).values({
        blindboxId: boxId,
        productId: productIds[i]!,
        probability: probs[i]!.toFixed(4),
        stock: stocks[i]!,
        initialStock: stocks[i]!,
      });
    }
    console.log('[seed] sample blindbox created');
  } else {
    console.log('[seed] sample blindbox already exists');
  }

  console.log('[seed] done');
}

seed()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('[seed] failed:', e);
    process.exit(1);
  });
