import { test, expect } from '@playwright/test';

test.describe('smoke público', () => {
  test('home carrega', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();
  });

  test('programação carrega', async ({ page }) => {
    await page.goto('/eventos');
    await expect(page.locator('body')).toBeVisible();
  });

  test('meus ingressos login carrega', async ({ page }) => {
    await page.goto('/ingressos');
    await expect(page.getByRole('heading', { name: /Meus Ingressos/i })).toBeVisible();
  });
});
