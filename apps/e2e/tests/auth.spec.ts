import { test, expect } from '@playwright/test';

const ts = Date.now();
const TEST_USER = {
  username: `e2e_${ts}`,
  email: `e2e_${ts}@example.com`,
  password: 'Test1234!',
};

test.describe('Auth flow', () => {
  test('register, logout, login', async ({ page }) => {
    // 注册
    await page.goto('/register');
    await page.getByLabel(/用户名/).fill(TEST_USER.username);
    await page.getByLabel(/邮箱/).fill(TEST_USER.email);
    const pwds = page.locator('input[type="password"]');
    await pwds.nth(0).fill(TEST_USER.password);
    await pwds.nth(1).fill(TEST_USER.password);
    // 同意协议
    const checkboxes = page.locator('input[type="checkbox"]');
    await checkboxes.first().check();
    await checkboxes.nth(1).check();
    await page.getByRole('button', { name: /^注册$|注册中/ }).click();

    // 注册成功跳转首页
    await expect(page).toHaveURL(/\/$/);

    // 登出（点击退出图标）
    await page.locator('button[title="退出"]').click();
    await page.waitForURL(/login/);

    // 登录
    await page.getByLabel(/用户名|账号/i).fill(TEST_USER.username);
    await page.locator('input[type="password"]').fill(TEST_USER.password);
    await page.getByRole('button', { name: /^登录$|登录中/ }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test('register fails without agreement', async ({ page }) => {
    await page.goto('/register');
    await page.getByLabel(/用户名/).fill(`e2e_x_${Date.now()}`);
    await page.getByLabel(/邮箱/).fill(`x_${Date.now()}@example.com`);
    const pwds = page.locator('input[type="password"]');
    await pwds.nth(0).fill('Test1234!');
    await pwds.nth(1).fill('Test1234!');
    // 故意不勾选协议
    const btn = page.getByRole('button', { name: /注册/ });
    await expect(btn).toBeDisabled();
  });
});
