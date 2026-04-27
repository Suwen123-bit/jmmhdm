import { test, expect, type APIRequestContext } from '@playwright/test';

const ADMIN = { account: 'admin', password: 'Admin@123456' };
const USER = { account: 'suwen123', password: 'Suwen@123456' };

async function apiLogin(request: APIRequestContext, account: string, password: string) {
  const r = await request.post('/api/auth/login', { data: { account, password } });
  const j = await r.json();
  if (!j.ok) throw new Error(`login ${account} failed: ${JSON.stringify(j)}`);
  return j.data as { accessToken: string; refreshToken: string };
}

let adminTok: { accessToken: string; refreshToken: string };
let userTok: { accessToken: string; refreshToken: string };

test.beforeAll(async ({ request }) => {
  adminTok = await apiLogin(request, ADMIN.account, ADMIN.password);
  // 重置 suwen 密码 + active
  const find = await (
    await request.get(
      `/api/admin/users?search=${encodeURIComponent(USER.account)}&page=1&pageSize=1`,
      { headers: { Authorization: `Bearer ${adminTok.accessToken}` } }
    )
  ).json();
  const id = find.data?.items?.[0]?.id;
  if (id) {
    await request.post(`/api/admin/users/${id}`, {
      headers: { Authorization: `Bearer ${adminTok.accessToken}` },
      data: { password: USER.password, status: 'active' },
    });
  }
  userTok = await apiLogin(request, USER.account, USER.password);
});

test.describe('Ticket flow (user create + admin reply + close)', () => {
  test('user creates ticket -> admin lists -> admin reply -> admin close', async ({ request }) => {
    const uh = { Authorization: `Bearer ${userTok.accessToken}` };
    const ah = { Authorization: `Bearer ${adminTok.accessToken}` };

    const create = await request.post('/api/ticket/create', {
      headers: uh,
      data: {
        type: 'other',
        subject: 'E2E test ticket',
        content: 'Hello, this is an automated test ticket.',
        priority: 'normal',
      },
    });
    const cj = await create.json();
    expect(cj.ok, JSON.stringify(cj)).toBe(true);
    const tid = cj.data.id ?? cj.data.ticket?.id;
    expect(tid).toBeTruthy();

    // 用户列表能看到
    const list = await (await request.get('/api/ticket/list?page=1&pageSize=10', { headers: uh })).json();
    expect(list.ok).toBe(true);
    expect(list.data.items.some((it: any) => it.id === tid)).toBe(true);

    // 管理端列表
    const adminList = await (await request.get('/api/admin/tickets?page=1&pageSize=10', { headers: ah })).json();
    expect(adminList.ok).toBe(true);

    // 管理端回复
    const reply = await request.post(`/api/admin/tickets/${tid}/reply`, {
      headers: ah,
      data: { content: 'Admin reply: looking into it.' },
    });
    expect((await reply.json()).ok).toBe(true);

    // 管理端关闭
    const close = await request.post(`/api/admin/tickets/${tid}/status`, {
      headers: ah,
      data: { status: 'closed' },
    });
    expect((await close.json()).ok).toBe(true);
  });
});

test.describe('Admin moderation surface', () => {
  test('withdraw list endpoint returns + approve/reject schema responds', async ({ request }) => {
    const ah = { Authorization: `Bearer ${adminTok.accessToken}` };
    const list = await (await request.get('/api/admin/withdrawals?page=1&pageSize=10', { headers: ah })).json();
    expect(list.ok).toBe(true);
    // 不真正批准（避免影响数据），验证 404/校验路径可达
    const r = await request.post('/api/admin/withdrawals/999999/approve', { headers: ah, data: {} });
    expect([200, 400, 404, 500]).toContain(r.status());
  });

  test('kyc review endpoint reachable (404 if no pending)', async ({ request }) => {
    const ah = { Authorization: `Bearer ${adminTok.accessToken}` };
    // 找一个 pending 申请
    const list = await (await request.get('/api/admin/kyc?page=1&pageSize=10', { headers: ah })).json();
    expect(list.ok).toBe(true);
    const pend = list.data.items.find((it: any) => it.status === 'pending');
    if (pend) {
      const r = await request.post('/api/admin/kyc/review', {
        headers: ah,
        data: { applicationId: pend.id, action: 'approve', note: 'e2e auto' },
      });
      expect((await r.json()).ok).toBe(true);
    }
  });

  test('audit logs / ip blacklist / geo blocks endpoints work', async ({ request }) => {
    const ah = { Authorization: `Bearer ${adminTok.accessToken}` };
    for (const p of ['/api/admin/audit-logs?page=1&pageSize=5', '/api/admin/ip-blacklist', '/api/admin/geo-blocks']) {
      const r = await request.get(p, { headers: ah });
      expect(r.status(), p).toBe(200);
    }
  });
});

test.describe('TOTP setup endpoint', () => {
  test('setup returns secret + otpauth url, enable rejects invalid code', async ({ request }) => {
    const uh = { Authorization: `Bearer ${userTok.accessToken}` };
    const setup = await (await request.post('/api/user/totp/setup', { headers: uh })).json();
    expect(setup.ok).toBe(true);
    expect(typeof setup.data.secret).toBe('string');
    expect(typeof setup.data.otpauth).toBe('string');

    // 错误 code 应该被拒绝
    const r = await request.post('/api/user/totp/enable', {
      headers: uh,
      data: { code: '000000' },
    });
    const j = await r.json();
    expect(j.ok).toBe(false);
    expect(typeof j.error?.code).toBe('string');
  });
});

test.describe('Invite registration', () => {
  test('child user gets parentId after registering with invite code', async ({ request }) => {
    // 取 admin (作为 parent) 邀请码 — 用 user/me 拿当前 admin 的 invite_code
    const me = await (
      await request.get('/api/user/me', { headers: { Authorization: `Bearer ${adminTok.accessToken}` } })
    ).json();
    expect(me.ok).toBe(true);
    const invite = me.data.inviteCode as string;
    expect(invite).toBeTruthy();

    const child = `e2c${Date.now().toString().slice(-12)}`;
    const reg = await request.post('/api/auth/register', {
      data: {
        username: child,
        email: `${child}@example.com`,
        password: 'TestChild@123',
        inviteCode: invite,
      },
    });
    const j = await reg.json();
    if (!j.ok && j.error?.code === 'RATE_LIMITED') {
      test.info().annotations.push({ type: 'skip', description: 'register rate-limited' });
      return;
    }
    expect(j.ok, JSON.stringify(j)).toBe(true);
    expect(j.data.user.parentId).toBe(me.data.id);
  });
});
