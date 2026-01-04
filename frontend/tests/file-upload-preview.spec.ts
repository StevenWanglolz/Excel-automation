import { test, expect } from '@playwright/test';
import path from 'path';
import { existsSync } from 'fs';

test('File Upload Preview Test', async ({ page }) => {
  // Navigate to login page
  await page.goto('http://localhost:5173/login');
  await page.waitForLoadState('networkidle');

  // Handle Auth
  const emailInput = page.locator('input[type="email"], input[name="email"]');
  const authBypassBanner = page.locator('text=Auth bypass enabled');
  const logoutButton = page.locator('button:has-text("Logout")');

  const hasLoginForm = await emailInput.isVisible({ timeout: 2000 }).catch(() => false);
  if (hasLoginForm) {
    await page.fill('input[type="email"]', 'test@gmail.com');
    await page.fill('input[type="password"]', 'test');
    await page.click('button:has-text("Sign in")');
  }

  // Ensure we are on the dashboard after auth
  await page.waitForURL('http://localhost:5173/', { timeout: 15000 });
  await page.waitForLoadState('networkidle');

  // Navigate straight to a fresh Excel flow, fall back to UI navigation if needed.
  await page.goto('http://localhost:5173/flow-builder?type=excel&new=1', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);

  if (!page.url().includes('/flow-builder')) {
    await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
    const newAutomationButton = page
      .locator('button:has-text("New Automation"), button:has-text("Create Your First Automation")')
      .first();
    await newAutomationButton.waitFor({ timeout: 10000 });
    await newAutomationButton.click();

    await page.waitForURL('**/new-automation**', { timeout: 10000 });
    const excelCard = page.locator('button:has-text("Excel")').first();
    await excelCard.waitFor({ timeout: 10000 });
    await excelCard.click();
  }

  await page.waitForSelector('text=Flow Builder', { timeout: 15000 });
  await page.waitForSelector('button:has-text("Upload")', { timeout: 15000 });
  await page.waitForTimeout(2000); // Give time for canvas to render

  // Open Upload Modal
  const uploadButton = page.locator('button:has-text("Upload")').first();
  await uploadButton.waitFor({ timeout: 15000 });
  await uploadButton.click();

  // Wait for modal to open
  await page.getByRole('heading', { name: 'Upload Data' }).waitFor({ timeout: 15000 });

  // Upload File
  const fileInput = page.locator('label:has-text("Upload individual files") input[type="file"]');
  const testFilePath = path.join(process.cwd(), '../Test Files/example data 1.xlsx');
  
  if (!existsSync(testFilePath)) {
      // Fallback for different CWD
      if (existsSync(path.join(process.cwd(), 'Test Files/example data 1.xlsx'))) {
        await fileInput.setInputFiles(path.join(process.cwd(), 'Test Files/example data 1.xlsx'));
      } else {
        throw new Error(`Test file not found at ${testFilePath}`);
      }
  } else {
      await fileInput.setInputFiles(testFilePath);
  }

  // Wait for file to appear
  await page.waitForSelector('text=example data 1.xlsx', { timeout: 15000 });

  // Locate the preview button (the eye icon) - Using a more specific locator if possible, or the title
  // I used title="Preview file" in the implementation
  const previewButton = page.locator('button[title="Preview file"]').first();
  await expect(previewButton).toBeVisible();

  // Click Preview
  await previewButton.click();

  // Verify Preview Modal
  const previewModal = page.locator('text=File Preview');
  await expect(previewModal).toBeVisible();
  
  // Verify Data Grid - wait for loading to finish
  // The DataPreview component shows columns. 
  // We can look for column 'A' or 'B' th
  await page.waitForSelector('th:has-text("A")', { timeout: 10000 });
  
  // Verify rows are loaded
  const gridRow = page.locator('table tbody tr').first();
  await expect(gridRow).toBeVisible();

  // Close Preview
  const closeButton = page.locator('button[aria-label="Close preview"]');
  await closeButton.click();

  await expect(previewModal).not.toBeVisible();
});
