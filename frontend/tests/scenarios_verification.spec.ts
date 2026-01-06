
import { test, expect, type Route } from '@playwright/test';
import { Buffer } from 'buffer';

test.describe('Advanced Data Flow Scenarios', () => {

    // Helper Mocks
    const mockUser = { id: '123', email: 'test@example.com', full_name: 'Test_User', is_active: true };
    const mockFile1 = { id: 101, original_filename: 'file1.xlsx', batch_id: 1, created_at: new Date().toISOString() };
    const mockFile2 = { id: 102, original_filename: 'file2.xlsx', batch_id: 1, created_at: new Date().toISOString() };
    const mockFiles = [mockFile1, mockFile2];
    const mockBatch = { id: 1, name: 'Test Batch', file_count: 2, created_at: new Date().toISOString() };

    // Complex Flow Mock: Source -> Op1 -> Op2 -> Output
    const mockFlow = {
        id: 999,
        name: 'Advanced Flow',
        user_id: '123',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        flow_data: {
            nodes: [
                { 
                    id: 'source-node', 
                    type: 'source', 
                    position: { x: 100, y: 100 }, 
                    data: { 
                        label: 'Data Source', 
                        blockType: 'source', 
                        // Simulate a batch selection
                        target: { batchId: 1 }, 
                        fileIds: [101, 102]
                    } 
                },
                { 
                    id: 'op-1', 
                    type: 'transform', 
                    position: { x: 300, y: 100 }, 
                    data: { 
                        label: 'Step 1 (Group Process)', 
                        blockType: 'transform', 
                        config: {},
                        // Implicitly linked to source in test via UI check
                        // But let's pre-configure it to test existing state:
                        sourceTargets: [
                            { fileId: 101, batchId: 1 },
                            { fileId: 102, batchId: 1 }
                        ],
                        destinationTargets: [
                            { virtualId: 'output:op-1:0', batchId: 1 },
                            { virtualId: 'output:op-1:1', batchId: 1 }
                        ]
                    } 
                },
                { 
                    id: 'op-2', 
                    type: 'transform', 
                    position: { x: 500, y: 100 }, 
                    data: { 
                        label: 'Step 2 (Chaining)', 
                        blockType: 'transform',
                        config: {},
                        destination: { virtualId: 'output:op-2', batchId: 1 }
                    } 
                },
                { 
                    id: 'output-node', 
                    type: 'output', 
                    position: { x: 700, y: 100 }, 
                    data: { 
                        label: 'Final Output', 
                        blockType: 'output', 
                        output: { 
                            outputs: [
                                { id: 'out-1', fileName: 'result.zip', sheets: [{ sourceId: 'op-2:output:op-2', sourceSheet: 'Sheet1', targetSheet: 'Sheet1' }] }
                            ] 
                        } 
                    } 
                }
            ],
            edges: []
        }
    };

    test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: 1920, height: 1080 });
        await page.addInitScript(() => localStorage.setItem('access_token', 'mock-token'));

        const mockJson = async (route: Route, json: any, status = 200) => {
            await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(json) });
        };

        await page.route('**/api/auth/me', route => mockJson(route, mockUser));
        await page.route('**/api/flows', route => mockJson(route, [mockFlow]));
        await page.route(`**/api/flows/${mockFlow.id}`, route => mockJson(route, mockFlow));
        
        // Files & Batches
        await page.route('**/api/files', route => mockJson(route, mockFiles));
        await page.route('**/api/files/batches', route => mockJson(route, [mockBatch]));
        await page.route('**/api/files/*/sheets', route => mockJson(route, ['Sheet1']));

        // Preview Mocks
        await page.route('**/api/files/*/preview*', route => mockJson(route, { 
            columns: ['A', 'B'], preview_rows: [{A: 1, B: 2}], row_count: 1 
        }));
        await page.route('**/api/transform/preview-step', route => mockJson(route, { 
            columns: ['A', 'B'], preview_rows: [{A: 10, B: 20}], row_count: 1 
        }));
    });

    test('Scenario 1: Verify Group-to-Group Configuration in UI', async ({ page }) => {
        // Monitor console for errors
        page.on('console', msg => console.log(`[Browser]: ${msg.text()}`));

        await page.goto(`/flow-builder?flow=${mockFlow.id}`);
        
        // Select Op-1 to open Properties Panel
        const op1 = page.locator('.pipeline-block').filter({ hasText: 'Step 1 (Group Process)' }).first();
        await op1.waitFor({ state: 'attached', timeout: 10000 });
        // Small wait for render stability
        await page.waitForTimeout(1000); 
        await op1.click({ force: true });

        // Define panel scope using stable ID
        const panel = page.locator('#properties-panel');
        await expect(panel).toBeVisible();

        // 2. Verify Destination Group Display
        // Should show "Group outputs" and "Test Batch"
        await expect(panel.getByText(/Test Batch/).last()).toBeVisible();
        await expect(panel.getByRole('heading', { name: 'Destinations' })).toBeVisible();
        await expect(panel.getByRole('heading', { name: 'Destinations' })).toBeVisible();
        // Checks for batch name in destinations
        await expect(panel.getByText(/Test Batch/).last()).toBeVisible();
    });

    test('Scenario 2: Verify Chaining (Processed Files Selection)', async ({ page }) => {
        await page.goto(`/flow-builder?flow=${mockFlow.id}`);

        // Select Op-2 (which is empty)
        const op2 = page.locator('.pipeline-block').filter({ hasText: 'Step 2 (Chaining)' }).first();
        await op2.click({ force: true });
        
        // Verify Properties Panel opens
        const panel = page.locator('#properties-panel');
        await expect(panel).toBeVisible();
        
        // Open Source Dropdown (Assuming it's a select element inside the panel)
        // If no sources are present, click "Add source" first
        const addSourceBtn = panel.getByRole('button', { name: 'Add source' });
        if (await addSourceBtn.isVisible()) {
            await addSourceBtn.click();
        }
        // Based on PropertiesPanel.tsx: it renders a select with options from 'availableSourceOptions'.
        // We look for a select that contains "From Previous Step" or similar labels.
        
        // Since Op-1 is "previous", we expect to see sources from Op-1.
        // Op-1 has 2 outputs.
        const sourceSelect = panel.locator('select').first();  
        
        // We might need to find the SPECIFIC select for "Source"
        // PropertiesPanel renders: <label>Source</label> followed by <select>
        // But the "Add Source" or initial source selection might be different.
        // Let's look for text "Original Files (Data)" or "From"
        
        // Actually, if Op-2 is new, it might default to "Select source..."
        // Let's verify the OPTIONS exist in the dropdown.
        
        // We'll add a new source target to verify options appearing
        // There is usually an "Add source" button if it's empty, OR a single select if 1-1.
        
        // Let's check if the dropdown contains the expected option group
        // "From "Step 1 (Group Process)""
        
        // Wait for select to be populated
        await expect(sourceSelect).toBeVisible();
        const content = await sourceSelect.textContent();
        
        // Check for presence of source files
        expect(content).toContain('file1.xlsx');
        
        // Expect Processed Streams from Step 1 (usually denoted by processed or step name)
        // logic might append (processed) or group by step name.
        expect(content).toContain('(processed)'); 
    });

    test('Scenario 3: Verify Export Functionality', async ({ page }) => {
        await page.goto(`/flow-builder?flow=${mockFlow.id}`);
        
        const outputNode = page.locator('.pipeline-block').filter({ hasText: 'Final Output' }).first();
        await outputNode.click({ force: true });

        // Mock Export API
        let exportCalled = false;
        await page.route('**/api/transform/export', async (route) => {
            exportCalled = true;
            await route.fulfill({ 
                status: 200, 
                contentType: 'application/zip', 
                body: Buffer.from('mock-zip-content') 
            });
        });

        const exportBtn = outputNode.getByRole('button', { name: /Export/i });
        await exportBtn.click({ force: true });

        // Wait for call
        await page.waitForTimeout(500);
        expect(exportCalled).toBe(true);
    });

});
