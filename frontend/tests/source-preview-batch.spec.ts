import { test, expect } from '@playwright/test';
import path from 'path';
import { existsSync } from 'fs';

test('source preview supports batch and individual selection', async ({ page }) => {
  await page.goto('/login');
  await page.waitForLoadState('networkidle');

  const emailInput = page.locator('input[type="email"], input[name="email"]');
  const authBypassBanner = page.locator('text=Auth bypass enabled');
  const logoutButton = page.locator('button:has-text("Logout")');

  const hasLoginForm = await emailInput.isVisible({ timeout: 2000 }).catch(() => false);
  if (hasLoginForm) {
    const passwordInput = page.locator('input[type="password"], input[name="password"]');
    await emailInput.fill('test@gmail.com');
    await passwordInput.fill('test');

    const loginButton = page.locator('button:has-text("Sign in"), button[type="submit"]').first();
    await loginButton.click();
    await page.waitForURL('http://localhost:5173/', { timeout: 10000 });
  } else {
    const hasBypass = await authBypassBanner.isVisible({ timeout: 2000 }).catch(() => false);
    const hasLogout = await logoutButton.isVisible({ timeout: 2000 }).catch(() => false);
    if (!hasBypass && !hasLogout) {
      throw new Error('Unable to determine authentication state. Login form and bypass markers not found.');
    }
  }

  await page.goto('/flow-builder?type=excel&new=1', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=Flow Builder', { timeout: 15000 });

  const uploadButton = page.locator('button:has-text("Upload")').first();
  await uploadButton.waitFor({ timeout: 15000 });
  await uploadButton.click();

  await page.getByRole('heading', { name: 'Upload Data' }).waitFor({ timeout: 15000 });

  const candidatePaths = [
    path.join(process.cwd(), '../Test Files/example data 1.xlsx'),
    path.join(process.cwd(), 'Test Files/example data 1.xlsx'),
    path.join(process.cwd(), '../../Test Files/example data 1.xlsx'),
  ];
  const candidateCopyPaths = [
    path.join(process.cwd(), '../Test Files/example data 1 copy.xlsx'),
    path.join(process.cwd(), 'Test Files/example data 1 copy.xlsx'),
    path.join(process.cwd(), '../../Test Files/example data 1 copy.xlsx'),
  ];
  const fileOne = candidatePaths.find((candidate) => existsSync(candidate));
  const fileTwo = candidateCopyPaths.find((candidate) => existsSync(candidate));
  if (!fileOne || !fileTwo) {
    test.skip();
    return;
  }

  await page.getByPlaceholder('New batch name').fill('Preview Batch');
  await page.getByRole('button', { name: 'Create batch' }).click();

  await page.waitForSelector('text=Upload to batch', { timeout: 10000 });
  const batchInput = page.locator('label:has-text("Upload to batch") input[type="file"]');
  await batchInput.setInputFiles([fileOne, fileTwo]);

  const individualInput = page.locator('label:has-text("Upload individual files") input[type="file"]');
  await individualInput.setInputFiles([fileOne, fileTwo]);

  const closeButton = page.locator('button[aria-label="Close"]').first();
  await closeButton.click();

  const previewButton = page.locator('button[title="Show preview"]').first();
  await previewButton.click();

  await page.getByText('Full Screen Preview').waitFor({ timeout: 10000 });

  const batchSelect = page.getByRole('combobox', { name: 'Batch' });
  await expect(batchSelect).toBeVisible();
  await batchSelect.selectOption({ label: 'Preview Batch' });

  const fileSelect = page.getByRole('combobox', { name: 'File' });
  await expect(fileSelect).toBeVisible();
  await expect(fileSelect.locator('option', { hasText: 'example data 1.xlsx' })).toHaveCount(1);
  await expect(fileSelect.locator('option', { hasText: 'example data 1 copy.xlsx' })).toHaveCount(1);

  await batchSelect.selectOption({ label: 'Individual files' });
  await expect(fileSelect.locator('option', { hasText: 'example data 1.xlsx' })).toHaveCount(1);
  await expect(fileSelect.locator('option', { hasText: 'example data 1 copy.xlsx' })).toHaveCount(1);
});
