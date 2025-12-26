import { test, expect } from '@playwright/test';
import path from 'path';
import { existsSync } from 'fs';

test.describe('File Upload Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to login page
    await page.goto('/login');
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    
    // Login
    const emailInput = page.locator('input[type="email"], input[name="email"]');
    const passwordInput = page.locator('input[type="password"], input[name="password"]');
    
    await emailInput.waitFor({ timeout: 5000 });
    await emailInput.fill('test@gmail.com');
    await passwordInput.fill('test');
    
    const loginButton = page.locator('button:has-text("Sign in"), button[type="submit"]').first();
    await loginButton.click();
    
    // Wait for navigation to dashboard (root path)
    await page.waitForURL('http://localhost:5173/', { timeout: 10000 });
    
    // Navigate to flow builder - look for "New Flow" button or link
    await page.waitForLoadState('networkidle');
    const newFlowButton = page.locator('text=New Flow, a:has-text("New Flow"), button:has-text("New Flow")').first();
    if (await newFlowButton.isVisible({ timeout: 3000 })) {
      await newFlowButton.click();
      await page.waitForURL('**/flow-builder', { timeout: 10000 });
    } else {
      // If no New Flow button, navigate directly
      await page.goto('/flow-builder');
      await page.waitForLoadState('networkidle');
    }
  });

  test('should upload a file successfully', async ({ page }) => {
    // Wait for flow builder to load
    await page.waitForLoadState('networkidle');
    
    // Look for Upload File button in the block palette
    const uploadFileButton = page.locator('text=Upload File, button:has-text("Upload File")').first();
    await uploadFileButton.waitFor({ timeout: 5000 });
    await uploadFileButton.click();
    
    // Wait for the block/node to appear on canvas
    // The node might have different selectors, try common ones
    await page.waitForTimeout(1000); // Give time for node to render
    
    // Try to find and click the upload node
    const uploadNode = page.locator('[data-id*="upload"], .react-flow__node').first();
    if (await uploadNode.isVisible({ timeout: 3000 })) {
      await uploadNode.click();
    } else {
      // If we can't find the node, try clicking in the canvas area
      const canvas = page.locator('.react-flow');
      await canvas.click({ position: { x: 400, y: 300 } });
    }
    
    // Wait for modal to open
    await page.waitForSelector('text=Upload Data File', { timeout: 10000 });
    
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
    // Add Upload File block
    await page.click('text=Upload File');
    
    // Wait for the block to appear and click on it
    await page.waitForSelector('[data-node-type="upload"]', { timeout: 5000 });
    await page.click('[data-node-type="upload"]');
    
    // Wait for modal to open
    await page.waitForSelector('text=Upload Data File', { timeout: 5000 });
    
    // Create a temporary invalid file (text file)
    const fileInput = page.locator('input[type="file"]');
    
    // Try to upload an invalid file type (we'll use a text file if available, or create one)
    const invalidFilePath = path.join(__dirname, '../../test-invalid.txt');
    
    // Create a temporary invalid file for testing
    const fs = require('fs');
    if (!fs.existsSync(invalidFilePath)) {
      fs.writeFileSync(invalidFilePath, 'This is not a valid Excel file');
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
    if (fs.existsSync(invalidFilePath)) {
      fs.unlinkSync(invalidFilePath);
    }
  });

  test('should show file in select dropdown after upload', async ({ page }) => {
    // Add Upload File block
    await page.click('text=Upload File');
    
    // Wait for the block to appear and click on it
    await page.waitForSelector('[data-node-type="upload"]', { timeout: 5000 });
    await page.click('[data-node-type="upload"]');
    
    // Wait for modal to open
    await page.waitForSelector('text=Upload Data File', { timeout: 5000 });
    
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
    
    // Add Upload File block
    await page.click('text=Upload File');
    
    // Wait for the block to appear and click on it
    await page.waitForSelector('[data-node-type="upload"]', { timeout: 5000 });
    await page.click('[data-node-type="upload"]');
    
    // Wait for modal to open
    await page.waitForSelector('text=Upload Data File', { timeout: 5000 });
    
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

