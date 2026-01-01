import { test, expect } from '@playwright/test';
import path from 'path';
import { existsSync, unlinkSync, writeFileSync } from 'fs';

test.describe('File Upload Tests', () => {
  const ensureAuthenticated = async (page: any) => {
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
      return;
    }

    const hasBypass = await authBypassBanner.isVisible({ timeout: 2000 }).catch(() => false);
    const hasLogout = await logoutButton.isVisible({ timeout: 2000 }).catch(() => false);
    if (hasBypass || hasLogout) {
      await page.waitForURL('http://localhost:5173/', { timeout: 10000 });
      return;
    }

    throw new Error('Unable to determine authentication state. Login form and bypass markers not found.');
  };

  const goToFlowBuilder = async (page: any) => {
    // Navigate straight to a fresh Excel flow first.
    await page.goto('/flow-builder?type=excel&new=1', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    if (!page.url().includes('/flow-builder')) {
      await page.goto('/', { waitUntil: 'domcontentloaded' });
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
    await page.waitForSelector('text=Click to upload a file', { timeout: 15000 });
  };

  const openUploadModal = async (page: any) => {
    await page.waitForLoadState('networkidle');

    await page.waitForSelector('text=Flow Builder', { timeout: 15000 });

    const uploadHint = page.locator('text=Click to upload a file').first();
    await uploadHint.waitFor({ timeout: 15000 });
    await uploadHint.click();
  };

  test.beforeEach(async ({ page }) => {
    await ensureAuthenticated(page);
    await goToFlowBuilder(page);
  });

  test('should upload a file successfully', async ({ page }) => {
    // Wait for flow builder to load
    await page.waitForLoadState('networkidle');
    
    await openUploadModal(page);
    
    // Wait for modal to open (heading or file input)
    await page.waitForSelector('text=Upload Data File, input[type="file"]', { timeout: 15000 });
    
    // Get the file input
    const fileInput = page.locator('input[type="file"]');
    await fileInput.waitFor({ timeout: 5000 });
    
    // Check if file input has multiple attribute
    const hasMultiple = await fileInput.getAttribute('multiple');
    expect(hasMultiple).toBeDefined();
    
    // Upload a test file - check if test file exists
    const testFilePath = path.join(process.cwd(), '../Test Files/example data 1.xlsx');
    const altTestFilePath = path.join(__dirname, '../../Test Files/example data 1.xlsx');
    
    let fileToUpload = '';
    if (existsSync(testFilePath)) {
      fileToUpload = testFilePath;
    } else if (existsSync(altTestFilePath)) {
      fileToUpload = altTestFilePath;
    } else {
      test.skip();
      return;
    }
    
    await fileInput.setInputFiles(fileToUpload);
    
    // Wait for upload to complete (check for uploaded file in list)
    // Look for the file name in the uploaded files list
    try {
      await page.waitForSelector('text=example data 1.xlsx', { timeout: 15000 });
    } catch (e) {
      // Check for error messages
      const errorMessage = page.locator('.bg-red-50, [role="alert"], .text-red-600');
      if (await errorMessage.isVisible({ timeout: 2000 })) {
        const errorText = await errorMessage.textContent();
        console.error('Error during upload:', errorText);
        throw new Error(`Upload failed with error: ${errorText}`);
      }
      throw e;
    }
    
    // Verify file appears in uploaded files list
    const uploadedFile = page.locator('text=example data 1.xlsx');
    await expect(uploadedFile).toBeVisible();
    
    // Check for any error messages
    const errorMessage = page.locator('.bg-red-50, [role="alert"]');
    const errorCount = await errorMessage.count();
    
    if (errorCount > 0) {
      const errorText = await errorMessage.first().textContent();
      console.error('Error during upload:', errorText);
      throw new Error(`Upload failed with error: ${errorText}`);
    }
    
    // Take screenshot for documentation
    await page.screenshot({ path: 'test-results/file-upload-success.png', fullPage: true });
  });

  test('should display error for invalid file type', async ({ page }) => {
    await openUploadModal(page);
    
    // Wait for modal to open
    await page.waitForSelector('text=Upload Data File, input[type="file"]', { timeout: 10000 });
    
    // Create a temporary invalid file (text file)
    const fileInput = page.locator('input[type="file"]');
    
    // Try to upload an invalid file type (we'll use a text file if available, or create one)
    const invalidFilePath = path.join(__dirname, '../../test-invalid.txt');
    
    // Create a temporary invalid file for testing
    if (!existsSync(invalidFilePath)) {
      writeFileSync(invalidFilePath, 'This is not a valid Excel file');
    }
    
    await fileInput.setInputFiles(invalidFilePath);
    
    // Wait for error message
    await page.waitForSelector('.bg-red-50, [role="alert"]', { timeout: 5000 });
    
    // Verify error message appears
    const errorMessage = page.locator('.bg-red-50');
    await expect(errorMessage).toBeVisible();
    
    const errorText = await errorMessage.textContent();
    expect(errorText).toContain('valid Excel');
    
    // Cleanup
    if (existsSync(invalidFilePath)) {
      unlinkSync(invalidFilePath);
    }
  });

  test('should show file in select dropdown after upload', async ({ page }) => {
    await openUploadModal(page);
    
    // Wait for modal to open
    await page.waitForSelector('text=Upload Data File, input[type="file"]', { timeout: 10000 });
    
    // Upload a file
    const fileInput = page.locator('input[type="file"]');
    const testFilePath = path.join(__dirname, '../../Test Files/example data 1.xlsx');
    await fileInput.setInputFiles(testFilePath);
    
    // Wait for upload to complete
    await page.waitForSelector('text=example data 1.xlsx', { timeout: 10000 });
    
    // Check that file appears in the preview select dropdown
    const previewSelect = page.locator('select').first();
    await expect(previewSelect).toBeVisible();
    
    // Check that the uploaded file is in the dropdown options
    const fileOption = previewSelect.locator('option:has-text("example data 1.xlsx")');
    await expect(fileOption).toBeVisible();
  });

  test('should handle file upload errors gracefully', async ({ page, context }) => {
    // Intercept the upload request to simulate an error
    await context.route('**/api/files/upload', route => {
      route.fulfill({
        status: 500,
        body: JSON.stringify({ detail: 'Server error' }),
      });
    });
    
    await openUploadModal(page);
    
    // Wait for modal to open
    await page.waitForSelector('text=Upload Data File, input[type="file"]', { timeout: 10000 });
    
    // Try to upload a file
    const fileInput = page.locator('input[type="file"]');
    const testFilePath = path.join(__dirname, '../../Test Files/example data 1.xlsx');
    await fileInput.setInputFiles(testFilePath);
    
    // Wait for error message
    await page.waitForSelector('.bg-red-50', { timeout: 10000 });
    
    // Verify error message is displayed
    const errorMessage = page.locator('.bg-red-50');
    await expect(errorMessage).toBeVisible();
  });
});
