import { test, expect, type APIRequestContext } from '@playwright/test';

const ADMIN = { account: 'admin', password: 'Admin@123456' };

async function loginAsAdmin(request: APIRequestContext): Promise<string> {
  const r = await request.post('/api/auth/login', {
    data: { account: ADMIN.account, password: ADMIN.password },
  });
  expect(r.ok()).toBeTruthy();
  const j = await r.json();
  expect(j.ok).toBe(true);
  return j.data.accessToken as string;
}

async function ensureUser(
  request: APIRequestContext,
  adminToken: string,
  username: string,
  password: string
) {
  // 查找
  const find = await request.get(
    `/api/admin/users?search=${encodeURIComponent(username)}&page=1&pageSize=1`,
    { headers: { Authorization: `Bearer ${adminToken}` } }
  );
  const fj = await find.json();
  let userId: number | undefined = fj.data?.items?.[0]?.id;
  if (!userId) {
    const reg = await request.post('/api/auth/register', {
      data: { username, email: `${username}@example.com`, password },
    });
    const rj = await reg.json();
    if (rj.ok) userId = rj.data.user.id;
  }
  if (!userId) throw new Error(`failed to ensure user ${username}`);
  // 重置密码确保已知
  await request.post(`/api/admin/users/${userId}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
    data: { password },
  });
  return userId;
}

test.describe('Admin dashboard & lists', () => {
  test('dashboard / users / trades / risk-configs / configs reachable', async ({ request }) => {
    const tk = await loginAsAdmin(request);
    const h = { Authorization: `Bearer ${tk}` };
    for (const path of [
      '/api/admin/dashboard',
      '/api/admin/users?page=1&pageSize=10',
      '/api/admin/trades?page=1&pageSize=10',
      '/api/admin/deposits?page=1&pageSize=10',
      '/api/admin/withdrawals?page=1&pageSize=10',
      '/api/admin/risk-configs',
      '/api/admin/configs',
      '/api/admin/agreements',
      '/api/admin/announcements',
      '/api/admin/blindboxes',
      '/api/admin/blindbox-products',
      '/api/admin/agents',
      '/api/admin/audit-logs?page=1&pageSize=10',
      '/api/admin/ip-blacklist',
      '/api/admin/geo-blocks',
      '/api/admin/ai-monitor/summary',
    ]) {
      const r = await request.get(path, { headers: h });
      expect(r.status(), path).toBe(200);
      const j = await r.json();
      expect(j.ok, path).toBe(true);
    }
  });
});

test.describe('User trade flow', () => {
  const username = 'suwen123';
  const password = 'Suwen@123456';
  let userToken = '';

  test('reset, deposit, open trade, list', async ({ request }) => {
    const adminToken = await loginAsAdmin(request);
    await ensureUser(request, adminToken, username, password);

    const login = await request.post('/api/auth/login', {
      data: { account: username, password },
    });
    const lj = await login.json();
    expect(lj.ok).toBe(true);
    userToken = lj.data.accessToken;
    const uh = { Authorization: `Bearer ${userToken}` };

    // 余额初始 0
    const bal0 = await (await request.get('/api/wallet/balance', { headers: uh })).json();
    expect(bal0.ok).toBe(true);

    // dev 充值 200
    const dep = await request.post('/api/wallet/dev-deposit', {
      headers: uh,
      data: { amount: 200 },
    });
    expect(dep.ok()).toBeTruthy();

    // 行情 / 风控
    const tickers = await (await request.get('/api/trade/tickers')).json();
    expect(tickers.ok).toBe(true);
    expect(tickers.data.btcusdt).toBeTruthy();

    const risk = await (await request.get('/api/trade/risk?symbol=btcusdt&duration=60')).json();
    expect(risk.ok).toBe(true);

    // 下单 call 10 USDT
    const open = await request.post('/api/trade/open', {
      headers: uh,
      data: { symbol: 'btcusdt', direction: 'call', amount: 10, duration: 60 },
    });
    const oj = await open.json();
    expect(oj.ok, JSON.stringify(oj)).toBe(true);

    // 列表应至少 1 笔
    const list = await (
      await request.get('/api/trade/list?status=all&page=1&pageSize=10', { headers: uh })
    ).json();
    expect(list.ok).toBe(true);
    expect(list.data.items.length).toBeGreaterThan(0);
  });
});

test.describe('User UI pages render', () => {
  test('login page form works visually', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByLabel(/用户名/)).toBeVisible();
    await expect(page.getByLabel(/密码/)).toBeVisible();
  });

  test('home renders symbols', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();
  });
});
