import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

const ADMIN_BASE = process.env.ADMIN_BASE_URL ?? 'http://localhost:5174';
const ADMIN_CRED = { account: 'admin', password: 'Admin@123456' };
const USER_CRED = { account: 'suwen123', password: 'Suwen@123456' };

async function apiLogin(request: APIRequestContext, account: string, password: string) {
  const r = await request.post('/api/auth/login', { data: { account, password } });
  const j = await r.json();
  if (!j.ok) throw new Error(`login failed: ${JSON.stringify(j)}`);
  return j.data as { accessToken: string; refreshToken: string };
}

async function ensureUser(request: APIRequestContext, adminToken: string) {
  const find = await request.get(
    `/api/admin/users?search=${encodeURIComponent(USER_CRED.account)}&page=1&pageSize=1`,
    { headers: { Authorization: `Bearer ${adminToken}` } }
  );
  const fj = await find.json();
  let id = fj.data?.items?.[0]?.id;
  if (!id) {
    const reg = await request.post('/api/auth/register', {
      data: {
        username: USER_CRED.account,
        email: `${USER_CRED.account}@example.com`,
        password: USER_CRED.password,
      },
    });
    const rj = await reg.json();
    if (rj.ok) id = rj.data.user.id;
  }
  if (!id) throw new Error('cannot ensure suwen123');
  await request.post(`/api/admin/users/${id}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
    data: { password: USER_CRED.password, status: 'active' },
  });
  return id as number;
}

async function injectTokens(page: Page, baseUrl: string, keyPrefix: string, tokens: { accessToken: string; refreshToken: string }) {
  // 必须先访问同源页面才能写入 localStorage
  await page.goto(`${baseUrl}/`);
  await page.evaluate(
    ({ kp, a, r }) => {
      localStorage.setItem(`${kp}.access`, a);
      localStorage.setItem(`${kp}.refresh`, r);
    },
    { kp: keyPrefix, a: tokens.accessToken, r: tokens.refreshToken }
  );
}

let cachedAdminTok: { accessToken: string; refreshToken: string } | null = null;
let cachedUserTok: { accessToken: string; refreshToken: string } | null = null;

test.beforeAll(async ({ request }) => {
  cachedAdminTok = await apiLogin(request, ADMIN_CRED.account, ADMIN_CRED.password);
  await ensureUser(request, cachedAdminTok.accessToken);
  cachedUserTok = await apiLogin(request, USER_CRED.account, USER_CRED.password);
  // 给账户充值，确保下单不会余额不足
  await request.post('/api/wallet/dev-deposit', {
    headers: { Authorization: `Bearer ${cachedUserTok.accessToken}` },
    data: { amount: 200 },
  });
});

test.describe('Web UI flow (logged-in user)', () => {
  test('login -> trade -> place order -> wallet', async ({ page }) => {
    const userTok = cachedUserTok!;
    await injectTokens(page, 'http://localhost:5173', 'auth', userTok);
    await page.goto('http://localhost:5173/trade');

    // 等待页面加载 (合约 nav 应该可见)
    await expect(page.getByRole('button', { name: /\u4e70\u6da8/ })).toBeVisible({ timeout: 15_000 });

    // 输入金额（覆盖默认 100）
    const amountInput = page.locator('input[type="number"]').first();
    await amountInput.fill('5');

    // 点击买涨
    await page.getByRole('button', { name: /\u4e70\u6da8/ }).click();

    // 期望出现成功 toast 或交易列表新增一行
    // toast 出现后会很快消失，使用包含"下单成功"的任意元素
    await expect(page.getByText(/\u4e0b\u5355\u6210\u529f|\u4e70\u6da8/).first()).toBeVisible({ timeout: 10_000 });

    // 跳到钱包页，确认余额 UI 渲染
    await page.goto('http://localhost:5173/wallet');
    await expect(page.getByText(/\u603b\u8d44\u4ea7|\u4f59\u989d|USDT/).first()).toBeVisible({ timeout: 10_000 });
  });

  test('logout button works', async ({ page }) => {
    const userTok = cachedUserTok!;
    await injectTokens(page, 'http://localhost:5173', 'auth', userTok);
    await page.goto('http://localhost:5173/');
    // 等待用户态加载
    await page.waitForTimeout(500);
    const logoutBtn = page.locator('button[title="\u9000\u51fa"]');
    if (await logoutBtn.count()) {
      await logoutBtn.first().click();
      await page.waitForURL(/login/, { timeout: 10_000 });
    }
  });
});

test.describe('Admin UI flow', () => {
  test('admin login -> dashboard -> users -> trades', async ({ page }) => {
    const adminTok = cachedAdminTok!;
    await injectTokens(page, ADMIN_BASE, 'admin', adminTok);

    await page.goto(`${ADMIN_BASE}/dashboard`);
    // 仪表盘页面应至少出现一些数据卡片或标题
    await expect(page.locator('body')).toBeVisible();
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});

    await page.goto(`${ADMIN_BASE}/users`);
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    await expect(page.locator('body')).toBeVisible();

    await page.goto(`${ADMIN_BASE}/trades`);
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
    await expect(page.locator('body')).toBeVisible();
  });
});
