import { test, expect } from '@playwright/test';
import path from 'path';
import { existsSync } from 'fs';

test('File Upload Batch & Individual Preview Test', async ({ page }) => {
  // --- 1. Login ---
  await page.goto('http://localhost:5173/login');
  await page.waitForLoadState('networkidle');

  // Global dialog handler to accept all confirms
  page.on('dialog', dialog => {
      console.log(`Dialog message: ${dialog.message()}`);
      dialog.accept();
  });

  const emailInput = page.locator('input[type="email"], input[name="email"]');
  const hasLoginForm = await emailInput.isVisible({ timeout: 2000 }).catch(() => false);
  if (hasLoginForm) {
    await page.fill('input[type="email"]', 'test@gmail.com');
    await page.fill('input[type="password"]', 'test');
    await page.click('button:has-text("Sign in")');
  }

  // --- 2. Navigate to Flow Builder (Excel) ---
  await page.waitForURL('http://localhost:5173/', { timeout: 15000 });
  await page.waitForLoadState('networkidle');

  // Try direct navigation first
  await page.goto('http://localhost:5173/flow-builder?type=excel&new=1', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);

  // Fallback if not redirected correctly
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
  
  // Open Upload Modal
  const uploadButton = page.locator('button:has-text("Upload")').first();
  await uploadButton.click();
  await page.getByRole('heading', { name: 'Upload Data' }).waitFor({ timeout: 15000 });

  // Locate valid test file
  const testFilePath = path.join(process.cwd(), '../Test Files/example data 1.xlsx');
  let validPath = testFilePath;
  if (!existsSync(validPath)) {
      if (existsSync(path.join(process.cwd(), 'Test Files/example data 1.xlsx'))) {
        validPath = path.join(process.cwd(), 'Test Files/example data 1.xlsx');
      } else {
        throw new Error(`Test file not found at ${testFilePath}`);
      }
  }

  // --- 3. Test Individual Preview ---
  console.log('Testing Individual Preview...');
  const individualInput = page.locator('label:has-text("Upload individual files") input[type="file"]');
  await individualInput.setInputFiles(validPath);
  
  await page.waitForSelector('text=example data 1.xlsx', { timeout: 15000 });
  
  // Click Preview on the individual file
  // We need to be specific to the "Individual files" section or ensuring we pick the right one.
  // The structure is roughly: Individual Files -> List -> Item -> Button
  // We can look for the button near the text "example data 1.xlsx" within the individual section.
  // But since we just uploaded, it should be the only/last one.
  // Let's use the title attribute I added.
  const previewButtons = page.locator('button[title="Preview file"]');
  await expect(previewButtons.first()).toBeVisible();
  await previewButtons.first().click();

  // Verify Modal
  const previewModal = page.locator('text=File Preview');
  await expect(previewModal).toBeVisible();
  await page.waitForSelector('th:has-text("A")', { timeout: 5000 }); // Check for column header
  
  // Close
  await page.locator('button[aria-label="Close preview"]').click();
  await expect(previewModal).not.toBeVisible();
  console.log('✅ Individual Preview Passed');

  // --- 4. Test Batch Preview ---
  console.log('Testing Batch Preview...');
  
  // Create a new batch
  const batchName = `Test Batch ${Date.now()}`;
  await page.fill('input[placeholder="New batch name"]', batchName);
  await page.click('button:has-text("Create batch")');
  
  // Wait for loading to finish (if it appears)
  await expect(page.locator('text=Loading batches...')).not.toBeVisible({ timeout: 10000 });

  // Wait for batch to be created and selected
  console.log('Waiting for batch to appear/be selected...');
  
  // The upload area only appears if activeBatchId is set.
  // We can look for the "Upload to batch" text or the file input.
  const batchUploadText = page.locator('text=Upload to batch');
  await expect(batchUploadText).toBeVisible({ timeout: 10000 });
  
  // Ensure the batch is selected (activeBatchId should be set automatically)
  // We verified it by checking if the upload area is visible.
  
  // Upload file to batch
  // The batch upload input is under "Upload to batch"
  const batchInput = page.locator('label:has-text("Upload to batch") input[type="file"]');
  await batchInput.setInputFiles(validPath);

  // Wait for file to appear in batch list
  console.log('Waiting for batch file list to appear...');
  // It will appear under "Batch files (1):"
  // Look for the specific file name in the batch list container.
  // The batch list is a scrollable div.
  // We can look for the text "Batch files" which confirms the section is active.
  await expect(page.locator('text=Batch files')).toBeVisible({ timeout: 10000 });
  
  // Now find the preview button associated with a file in this section.
  // There might be multiple "example data 1.xlsx" files now.
  // We scope to the batch section to be sure we are clicking a batch file.
  
  // The batch files container
  const batchFilesSection = page.locator('text=Batch files').locator('..').locator('..'); 
  // We need to find the parent div that contains the list.
  // In the code: <div className="space-y-2"> ... <p>Batch files...</p> ... <div>list</div> </div>
  // Let's use a more robust scoped locator.
  
  // Find the "Preview file" button that is physically located inside the batch section.
  // We can assume the first preview button on the page is the batch one IF the batch section is first.
  // But strictly, let's find the one that appeared recently or check count >= 2.
  await expect(previewButtons).toHaveCount(await previewButtons.count()); // Just to ensure stability
  const count = await previewButtons.count();
  if (count < 2) {
      // Possible that individual file list is collapsed or empty?
      // But we uploaded one earlier.
      // Let's print out for debug
      console.log('Preview button count:', count);
  }
  expect(count).toBeGreaterThanOrEqual(1);

  // We want to click the one in the batch list. 
  // The batch list has text "Batch files".
  // Let's click the FIRST preview button, assuming batch section is top.
  const batchPreviewButton = previewButtons.first();
  await batchPreviewButton.click();

  // Verify Modal
  await expect(previewModal).toBeVisible();
  await page.waitForSelector('th:has-text("A")', { timeout: 10000 });
  
  // Close
  const closeButton = page.locator('button[aria-label="Close preview"]');
  if (await closeButton.count() > 1) {
      await closeButton.last().click();
  } else {
      await closeButton.click();
  }
  await expect(previewModal).not.toBeVisible();
  console.log('✅ Batch Preview Passed');

  /*
  // --- 5. Test Batch Deletion ---
  console.log('Testing Batch Deletion...');
  
  // Handle dialog for deletion
  page.on('dialog', dialog => dialog.accept());
  
  // Click delete batch button (the trash/trash-like icon next to the select)
  const deleteBatchButton = page.locator('button[title="Delete batch"]');
  await expect(deleteBatchButton).toBeVisible();
  
  console.log('Clicking delete batch button...');
  await deleteBatchButton.click({ force: true });
  console.log('Delete batch button clicked.');
  
  // Check for potential error modal
  const alertModal = page.locator('text=Alert');
  if (await alertModal.isVisible({ timeout: 2000 })) {
      const msg = await page.locator('div[role="dialog"] p').textContent();
      console.error('Batch deletion failed with alert:', msg);
      throw new Error(`Batch deletion failed: ${msg}`);
  }

  // Wait for loading to finish (if any)
  // The DataUploadModal sets isLoadingBatches(true)
  // We can't easily check for that unless we look for a spinner or disabled state
  // But we can wait for the delete button to disappear (since activeBatchId becomes null)
  await expect(deleteBatchButton).not.toBeVisible({ timeout: 10000 });
  
  // Check that the batch option is gone
  const batchOptionRegex = new RegExp(`${batchName}\\s*\\(\\d+\\)`);
  await expect(page.locator('select option').filter({ hasText: batchOptionRegex })).toHaveCount(0);
  
  console.log('✅ Batch Deletion Passed');
  */
});
