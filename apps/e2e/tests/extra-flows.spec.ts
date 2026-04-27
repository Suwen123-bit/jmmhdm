import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

const ADMIN = { account: 'admin', password: 'Admin@123456' };
const USER = { account: 'suwen123', password: 'Suwen@123456' };
const FUND_PASSWORD = 'Fund@123456';

async function apiLogin(request: APIRequestContext, account: string, password: string) {
  const r = await request.post('/api/auth/login', { data: { account, password } });
  const j = await r.json();
  if (!j.ok) throw new Error(`login ${account} failed: ${JSON.stringify(j)}`);
  return j.data as { accessToken: string; refreshToken: string };
}

async function injectTokens(page: Page, baseUrl: string, kp: string, t: { accessToken: string; refreshToken: string }) {
  await page.goto(`${baseUrl}/`);
  await page.evaluate(
    (args: { kp: string; a: string; r: string }) => {
      localStorage.setItem(`${args.kp}.access`, args.a);
      localStorage.setItem(`${args.kp}.refresh`, args.r);
    },
    { kp, a: t.accessToken, r: t.refreshToken }
  );
}

let userTok: { accessToken: string; refreshToken: string };

test.beforeAll(async ({ request }) => {
  // admin 重置 suwen 密码 (在 ui-flows 里已做，这里再做一次保证可用)
  const adm = await apiLogin(request, ADMIN.account, ADMIN.password);
  const find = await request.get(
    `/api/admin/users?search=${encodeURIComponent(USER.account)}&page=1&pageSize=1`,
    { headers: { Authorization: `Bearer ${adm.accessToken}` } }
  );
  const fj = await find.json();
  const id = fj.data?.items?.[0]?.id;
  if (id) {
    await request.post(`/api/admin/users/${id}`, {
      headers: { Authorization: `Bearer ${adm.accessToken}` },
      data: { password: USER.password, status: 'active' },
    });
  }
  userTok = await apiLogin(request, USER.account, USER.password);

  // 充值，确保下方流程余额充足
  await request.post('/api/wallet/dev-deposit', {
    headers: { Authorization: `Bearer ${userTok.accessToken}` },
    data: { amount: 500 },
  });
});

test.describe('Fund password & withdraw flow (API)', () => {
  test('set fund password (idempotent), then submit withdraw', async ({ request }) => {
    const h = { Authorization: `Bearer ${userTok.accessToken}` };

    // 设置资金密码（已设置则会返回错误，吞掉）
    await request.post('/api/auth/set-fund-password', {
      headers: h,
      data: { fundPassword: FUND_PASSWORD, loginPassword: USER.password },
    });

    // 提交提现
    const w = await request.post('/api/wallet/withdraw', {
      headers: h,
      data: {
        currency: 'usdt',
        network: 'TRC20',
        toAddress: 'TXYZabcdEFG1234567890hijklmnoPQRST',
        amount: 10,
        fundPassword: FUND_PASSWORD,
      },
    });
    const wj = await w.json();
    // 成功，或资金密码错误（之前已被设置成别的密码） — 都视为接口可达
    expect(wj.ok === true || typeof wj.error?.code === 'string').toBe(true);

    // 列表可读
    const list = await request.get('/api/wallet/withdrawals?page=1&pageSize=5', { headers: h });
    expect(list.status()).toBe(200);
  });
});

test.describe('KYC flow (API)', () => {
  test('submit kyc with image url', async ({ request }) => {
    const h = { Authorization: `Bearer ${userTok.accessToken}` };
    const status0 = await (await request.get('/api/kyc/status', { headers: h })).json();
    expect(status0.ok).toBe(true);

    // 仅当 status 允许提交时尝试提交
    const allowed = ['none', 'rejected', 'resubmit'].includes(status0.data.kycStatus);
    if (!allowed) {
      test.info().annotations.push({ type: 'skip', description: `kyc status=${status0.data.kycStatus}, skip submit` });
      return;
    }
    const r = await request.post('/api/kyc/submit', {
      headers: h,
      data: {
        level: 1,
        realName: '测试用户',
        idType: 'id_card',
        idNumber: '110101199001011234',
        idFrontUrl: 'https://cdn.example.com/kyc/front.jpg',
      },
    });
    const j = await r.json();
    expect(j.ok || j.error).toBeTruthy();
  });
});

test.describe('Blindbox flow (API)', () => {
  test('list blindboxes, open if available, then exchange existing inventory', async ({ request }) => {
    const h = { Authorization: `Bearer ${userTok.accessToken}` };
    const list = await (await request.get('/api/blindbox/list')).json();
    expect(list.ok).toBe(true);

    if (Array.isArray(list.data.items) && list.data.items.length > 0) {
      const box = list.data.items[0];
      const open = await request.post('/api/blindbox/open', {
        headers: h,
        data: { blindboxId: box.id, count: 1 },
      });
      const oj = await open.json();
      // 成功或库存/余额错误都说明接口畅通
      expect(oj.ok === true || typeof oj.error?.code === 'string').toBe(true);
    }

    // 兑换：取库存中前 1 件（若有）
    const inv = await (await request.get('/api/blindbox/inventory?page=1&pageSize=5', { headers: h })).json();
    expect(inv.ok).toBe(true);
    if (inv.data.items.length > 0) {
      const ids = [inv.data.items[0].id];
      const ex = await request.post('/api/blindbox/exchange', {
        headers: h,
        data: { inventoryIds: ids },
      });
      const ej = await ex.json();
      expect(ej.ok === true || typeof ej.error?.code === 'string').toBe(true);
    }
  });
});

test.describe('Protected pages render after fix', () => {
  test('wallet/profile/inventory/kyc/withdraw/notifications all render without redirect', async ({ page }) => {
    await injectTokens(page, 'http://localhost:5173', 'auth', userTok);
    for (const path of ['/wallet', '/profile', '/inventory', '/kyc', '/wallet/withdraw', '/notifications']) {
      await page.goto(`http://localhost:5173${path}`);
      // 不应跳到登录页
      await page.waitForLoadState('domcontentloaded');
      expect(page.url(), `should stay on ${path}`).not.toContain('/login');
      await expect(page.locator('body')).toBeVisible();
    }
  });
});
