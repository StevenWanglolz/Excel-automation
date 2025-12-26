import { test, expect } from '@playwright/test';
import path from 'path';
import { existsSync } from 'fs';

test('File Upload Test - Check for errors', async ({ page }) => {
  // Navigate to login page
  await page.goto('http://localhost:5173/login');
  await page.waitForLoadState('networkidle');
  
  // Login
  await page.fill('input[type="email"]', 'test@gmail.com');
  await page.fill('input[type="password"]', 'test');
  await page.click('button:has-text("Sign in")');
  
  // Wait for navigation to dashboard
  await page.waitForURL('http://localhost:5173/', { timeout: 15000 });
  await page.waitForLoadState('networkidle');
  
  // Navigate to flow builder
  await page.goto('http://localhost:5173/flow-builder');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000); // Give time for canvas to render
  
  // Add Upload File block
  const uploadFileButton = page.locator('text=Upload File').first();
  await uploadFileButton.waitFor({ timeout: 5000 });
  await uploadFileButton.click();
  
  // Wait a bit for node to render
  await page.waitForTimeout(1000);
  
  // Try to click on the upload node to open modal
  // Look for the node in the canvas
  const canvas = page.locator('.react-flow');
  await canvas.waitFor({ timeout: 5000 });
  
  // Click on the canvas where the node should be
  await canvas.click({ position: { x: 400, y: 300 } });
  await page.waitForTimeout(500);
  
  // Wait for modal to open
  try {
    await page.waitForSelector('text=Upload Data File', { timeout: 10000 });
  } catch (e) {
    // Take screenshot to see what's on screen
    await page.screenshot({ path: 'test-results/modal-not-opened.png', fullPage: true });
    throw new Error('Modal did not open. Screenshot saved.');
  }
  
  // Get the file input (it's hidden, so we don't wait for visibility)
  const fileInput = page.locator('input[type="file"]');
  
  // Check if file input exists and has multiple attribute
  const fileInputCount = await fileInput.count();
  if (fileInputCount === 0) {
    throw new Error('File input not found');
  }
  
  const hasMultiple = await fileInput.getAttribute('multiple');
  console.log('File input has multiple attribute:', hasMultiple !== null);
  
  // Find test file
  const testFilePath = path.join(process.cwd(), '../Test Files/example data 1.xlsx');
  const altTestFilePath = path.join(process.cwd(), 'Test Files/example data 1.xlsx');
  const altTestFilePath2 = path.join(process.cwd(), '../../Test Files/example data 1.xlsx');
  
  let fileToUpload = '';
  if (existsSync(testFilePath)) {
    fileToUpload = testFilePath;
  } else if (existsSync(altTestFilePath)) {
    fileToUpload = altTestFilePath;
  } else if (existsSync(altTestFilePath2)) {
    fileToUpload = altTestFilePath2;
  } else {
    throw new Error(`Test file not found. Tried: ${testFilePath}, ${altTestFilePath}, ${altTestFilePath2}`);
  }
  
  console.log('Uploading file:', fileToUpload);
  
  // Set up error monitoring
  const errors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });
  
  page.on('pageerror', error => {
    errors.push(error.message);
  });
  
  // Upload the file
  await fileInput.setInputFiles(fileToUpload);
  
  // Wait and check for errors
  await page.waitForTimeout(3000);
  
  // Check for error messages in the UI (specifically error containers, not delete buttons)
  const errorMessages = page.locator('.bg-red-50, [role="alert"]').filter({ hasText: /valid|failed|error/i });
  const errorCount = await errorMessages.count();
  
  if (errorCount > 0) {
    const errorTexts: string[] = [];
    for (let i = 0; i < errorCount; i++) {
      const text = await errorMessages.nth(i).textContent();
      if (text && !text.includes('×')) { // Exclude delete button text
        errorTexts.push(text);
      }
    }
    if (errorTexts.length > 0) {
      console.error('UI Errors found:', errorTexts);
      await page.screenshot({ path: 'test-results/upload-error.png', fullPage: true });
      throw new Error(`Upload failed with UI errors: ${errorTexts.join(', ')}`);
    }
  }
  
  // Check console errors
  if (errors.length > 0) {
    console.error('Console errors:', errors);
    await page.screenshot({ path: 'test-results/console-errors.png', fullPage: true });
  }
  
  // Wait for file to appear in list
  try {
    await page.waitForSelector('text=example data 1.xlsx', { timeout: 15000 });
    console.log('✅ File uploaded successfully!');
    await page.screenshot({ path: 'test-results/upload-success.png', fullPage: true });
  } catch (e) {
    await page.screenshot({ path: 'test-results/upload-timeout.png', fullPage: true });
    throw new Error('File did not appear in uploaded files list. Screenshot saved.');
  }
  
  // Verify file appears in the uploaded files list (button, not option)
  const uploadedFile = page.locator('button:has-text("example data 1.xlsx")').first();
  await expect(uploadedFile).toBeVisible();
  
  // Also verify it appears in the select dropdown (options are hidden by default, so just check it exists)
  const fileInSelect = page.locator('select option:has-text("example data 1.xlsx")').first();
  await expect(fileInSelect).toHaveCount(1);
});

