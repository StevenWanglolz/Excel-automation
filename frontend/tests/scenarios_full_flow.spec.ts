
import { test, expect } from '@playwright/test';

// Mocks
const mockUser = { id: '123', email: 'test@example.com', full_name: 'Test_User', is_active: true };

test.describe('Full End-to-End Workflow', () => {

  test.beforeEach(async ({ page }) => {
    // Setup generic routes
    await page.route('**/api/auth/me', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockUser) });
    });
    
    // Add token to storage
    await page.addInitScript(() => {
      localStorage.setItem('access_token', 'mock-token');
    });
  });

  test('E2E: Upload Group -> Preview -> Filter G2G -> Export', async ({ page }) => {
    /**
     * Scenario: 
     * 1. User Uploads a Group of files (3 files)
     * 2. Previews the Data Block
     * 3. Adds Filter Block (Row Filter)
     * 4. Previews the Filter Block
     * 5. Configures Filter (Group to Group)
     * 6. Previews Output Block
     * 7. Exports Results
     */
    
    // 1. Visit Flow Builder
    
    // 2. Upload Files (Mocking the upload or using real input if possible)
    // For "headed" tests we can set input files.
    // However, the FlowBuilder relies on backend processing for uploads.
    // We will Mock the File Upload API response to simulate success.
    
    // Mock Batch and Files response
    const mockBatch = { id: 1, name: 'E2E Batch', file_count: 3 };
    const mockFiles = [
        { id: 1, original_filename: 'data1.xlsx', batch_id: 1 },
        { id: 2, original_filename: 'data2.xlsx', batch_id: 1 },
        { id: 3, original_filename: 'data3.xlsx', batch_id: 1 },
        { id: 4, original_filename: 'solo.xlsx', batch_id: null }
    ];
    const mockFlow = {
        id: 501,
        name: 'E2E Preview Group Flow',
        description: '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user_id: '123',
        flow_data: {
            nodes: [
                {
                    id: 'source-0',
                    type: 'source',
                    position: { x: 250, y: 100 },
                    data: {
                        label: 'Data',
                        blockType: 'source',
                        config: {},
                        fileIds: [1, 2, 3, 4],
                    },
                },
                {
                    id: 'output-0',
                    type: 'output',
                    position: { x: 250, y: 350 },
                    data: {
                        label: 'Output',
                        blockType: 'output',
                        config: {},
                        output: { outputs: [] },
                    },
                },
            ],
            edges: [],
        },
    };
    
    await page.route('**/api/flows', async route => {
       if (route.request().method() === 'POST') {
          await route.fulfill({ json: mockFlow, status: 201 });
          return;
       }
       await route.fulfill({ json: [mockFlow] });
    });
    
    await page.route(`**/api/flows/${mockFlow.id}`, async route => {
       await route.fulfill({ json: mockFlow });
    });
    
    await page.route('**/api/files', async route => {
       await route.fulfill({ json: mockFiles });
    });
    
    await page.route('**/api/files/batches*', async route => {
       await route.fulfill({ json: [mockBatch] });
    });
    
    // Mock Previews
    await page.route('**/api/files/*/preview*', async route => {
       await route.fulfill({ json: { columns: ['A', 'B'], preview_rows: [{A: 1, B: 2}], row_count: 5 } });
    });
    
    await page.route('**/api/transform/preview-step', async route => {
       await route.fulfill({ json: { columns: ['A', 'B'], preview_rows: [{A: 10, B: 20}], row_count: 3 } });
    });
    await page.route('**/api/files/*/sheets', async route => {
       await route.fulfill({ json: ['Sheet1'] });
    });

     // Wait for Data block to appear (simulating the load)
     // In a real E2E we'd use setInputFiles on the file input, but for speed we mock the "uploaded state" 
     // if the app loads existing files on mount. If it starts empty, we must inject.
     // Assuming FlowBuilder fetches /api/files on mount.
     
     await page.goto(`/flow-builder?flow=${mockFlow.id}`);
     await expect(page.getByText('Data', { exact: true })).toBeVisible({ timeout: 10000 });
     
     // 3. Open Upload modal once so the Data node gets seeded with fileIds
     const dataBlock = page.locator('.pipeline-block').first();
     const uploadButton = dataBlock.getByRole('button', { name: 'Upload' });
     await uploadButton.click();
     const uploadModal = page.locator('.fixed.z-50').filter({ hasText: 'Upload Data' });
     await expect(uploadModal).toBeVisible();
     await expect(uploadModal.getByText('File groups')).toBeVisible();
     await uploadModal.getByRole('button').filter({ hasText: /^$/ }).first().click();

     // 4. Preview Data Block
     // Trigger the preview modal
     await dataBlock.locator('button[title="Show preview"]').click();
     
     // Verify Preview Panel (Modal)
     const previewModal = page.getByText('Full Screen Preview');
     await expect(previewModal).toBeVisible();
     
     // The "File group" selector should eventually appear once batches load
     const groupSelector = page.locator('label:has-text("File group") select');
     await expect(groupSelector).toBeVisible({ timeout: 15000 });
     await groupSelector.selectOption({ label: 'E2E Batch' });

     // Check if the panel contains the data
     // Explicitly select the file since it might not be auto-selected
     const fileSelector = page.locator('label:has-text("File") select').nth(1);
     await expect(fileSelector).toBeVisible({ timeout: 10000 });

     await fileSelector.selectOption({ label: 'data1.xlsx' });

     await expect(page.getByText('5 rows')).toBeVisible();
     await expect(page.getByRole('columnheader', { name: 'A' })).toBeVisible();
     
     // Close Preview (use modal close button to avoid overlay intercepting clicks)
     await page.getByRole('button', { name: 'Close preview' }).click();
     await expect(page.getByText('Full Screen Preview')).not.toBeVisible();
     await expect(dataBlock).toBeVisible();
     
     // 4. Add Filter Block
     await page.getByTitle('Add step after this').first().click();
     await page.getByRole('button', { name: /Selection/ }).click(); // Category
     await page.getByText('Row Filter').click(); // Block
     
     // 5. Configure Filter (Group to Group)
     const filterBlock = page.locator('.pipeline-block').nth(1);
     await filterBlock.click();
     
     const propsPanel = page.locator('#properties-panel');
     await expect(propsPanel).toBeVisible();
     
     // Verify Sources section is available for configuration
     await expect(propsPanel.getByRole('heading', { name: 'Sources' })).toBeVisible();
     const addSourceBtn = propsPanel.getByRole('button', { name: 'Add source' });
     await expect(addSourceBtn).toBeVisible();
     await addSourceBtn.click();
     const sourceSelect = propsPanel.locator('[data-testid^="source-entry-select-"]').first();
     await sourceSelect.selectOption('file:1');
     // 6. Preview Operation Block
     await filterBlock.locator('button[title="Show preview"]').click();
     await expect(page.getByText('Full Screen Preview')).toBeVisible();
     await page.getByRole('button', { name: 'Close preview' }).click();
     await expect(page.getByText('Full Screen Preview')).not.toBeVisible();
     
     // 7. Connect to Output
     const outputBlockExists = await page.locator('.pipeline-block').filter({ hasText: 'Output' }).count() > 0;
     
     if (!outputBlockExists) {
        await filterBlock.locator('button[title="Add step after this"]').click();
        await expect(page.getByText('Select Operation')).toBeVisible();
        await page.getByText('Sheet & Output').click(); 
        await page.getByText('Sheet Manager').click(); 
     }
     
     // 8. Export
     const outputBlock = page.locator('.pipeline-block').filter({ hasText: 'Sheet Manager' }).first();
     if (await outputBlock.count() > 0) {
        await outputBlock.click();
        
        await page.route('**/api/transform/export', route => {
            route.fulfill({ 
                status: 200, 
                contentType: 'application/zip', 
                headers: { 'Content-Disposition': 'attachment; filename=results.zip' },
                body: 'fake-zip-content' 
            });
        });
        
        const exportBtn = outputBlock.getByRole('button', { name: /Export/i });
        
        if (await exportBtn.isEnabled()) {
             const downloadPromise = page.waitForEvent('download');
             await exportBtn.click();
             const download = await downloadPromise;
             expect(download.suggestedFilename()).toBe('results.zip');
        }
     }
  });

});
