import { test, expect } from '@playwright/test';

test.describe('Public pages', () => {
  test('home renders banner + nav', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/合约|盲盒/i).first()).toBeVisible();
  });

  test('config public endpoint works', async ({ page, request }) => {
    const r = await request.get('/api/config/public');
    expect(r.ok()).toBeTruthy();
    const json = await r.json();
    expect(json.ok).toBe(true);
    expect(json.data.features).toBeTruthy();
    expect(Array.isArray(json.data.symbols)).toBe(true);
  });

  test('agreement current versions reachable', async ({ request }) => {
    const r = await request.get('/api/agreement/current');
    expect(r.ok()).toBeTruthy();
    const json = await r.json();
    expect(json.ok).toBe(true);
    expect(json.data).toHaveProperty('terms');
  });

  test('health endpoints ok', async ({ request }) => {
    const r = await request.get('/health');
    expect(r.ok()).toBeTruthy();
    const ready = await request.get('/health/ready');
    // 503 也合法（HTX 未连），只要响应有效
    expect([200, 503]).toContain(ready.status());
  });
});
