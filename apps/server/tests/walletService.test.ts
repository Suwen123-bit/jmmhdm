import { describe, it, expect, beforeAll } from 'vitest';

/**
 * 资金路径集成测试（需 dockerized PG + Redis；CI 通过 services 启动）
 *
 * 运行：
 *   DATABASE_URL=postgres://app:app_password@localhost:5432/crypto_platform_test \
 *   REDIS_URL=redis://localhost:6379/15 \
 *   pnpm --filter @app/server test -- walletService
 *
 * 由于这些测试依赖真实 PG/Redis，CI 上需要在 service 容器准备好后再跑。
 * 若环境变量未提供，跳过整组。
 */

// 仅当显式 INTEGRATION_TESTS=1 时执行（CI 在准备好 PG/Redis 之后设置该变量）
const RUN = process.env.INTEGRATION_TESTS === '1';

describe.skipIf(!RUN)('walletService integration', () => {
  let walletService: typeof import('../src/services/walletService.js');
  let db: typeof import('../src/db/client.js')['db'];
  let schema: typeof import('../src/db/schema.js');

  beforeAll(async () => {
    walletService = await import('../src/services/walletService.js');
    ({ db } = await import('../src/db/client.js'));
    schema = await import('../src/db/schema.js');
  });

  async function createTestUser(): Promise<number> {
    const inserted = await db
      .insert(schema.users)
      .values({
        username: `test_${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
        email: `t_${Date.now()}_${Math.floor(Math.random() * 1e6)}@test.local`,
        passwordHash: 'x',
        inviteCode: `INV${Date.now().toString(36).slice(-8)}`,
        balance: '0',
        status: 'active',
      })
      .returning({ id: schema.users.id });
    return inserted[0]!.id;
  }

  it('changeBalance 增加 + 流水入账', async () => {
    const userId = await createTestUser();
    await walletService.changeBalance({
      userId,
      amount: '100',
      type: 'deposit',
      refType: 'test',
      refId: 'tc1',
      description: 'test deposit',
    });
    const b = await walletService.getBalance(userId);
    expect(Number(b.balance)).toBe(100);
  });

  it('freezeBalance 冻结 + 余额下移', async () => {
    const userId = await createTestUser();
    await walletService.changeBalance({
      userId,
      amount: '50',
      type: 'deposit',
      description: 'fund',
    });
    await walletService.freezeBalance(userId, '20', 'trade_open', 'test', 'tc2', 'freeze');
    const b = await walletService.getBalance(userId);
    expect(Number(b.balance)).toBe(30);
    expect(Number(b.frozen)).toBe(20);
  });

  it('unfreezeBalance 解冻 + 不可超额解冻', async () => {
    const userId = await createTestUser();
    await walletService.changeBalance({
      userId,
      amount: '10',
      type: 'deposit',
      description: 'fund',
    });
    await walletService.freezeBalance(userId, '10', 'trade_open', 'test', 'tc3', 'freeze');
    await walletService.unfreezeBalance(userId, '10', 'trade_refund', 'test', 'tc3', 'release');
    const b = await walletService.getBalance(userId);
    expect(Number(b.balance)).toBe(10);
    expect(Number(b.frozen)).toBe(0);

    await expect(
      walletService.unfreezeBalance(userId, '1', 'trade_refund', 'test', 'tc3', 'over')
    ).rejects.toThrow();
  });

  it('changeBalance 拒绝负余额', async () => {
    const userId = await createTestUser();
    await expect(
      walletService.changeBalance({ userId, amount: '-1', type: 'admin_adjust', description: 'no' })
    ).rejects.toThrow();
  });
});
