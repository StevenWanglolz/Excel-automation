import { test, expect, type Route } from '@playwright/test';

test.describe('New Output Preview Workflow', () => {
    
    const mockUser = { id: '123', email: 'test@example.com', full_name: 'Test User', is_active: true };

    test.beforeEach(async ({ page }) => {
        await page.setViewportSize({ width: 1920, height: 1080 });

        await page.addInitScript(() => {
            localStorage.setItem('access_token', 'mock-token-123');
            localStorage.setItem('auth-storage', '{"state":{"user":{"id":"123","email":"test@example.com"},"isAuthenticated":true},"version":0}');
        });
        
        const mockJson = async (route: Route, json: any, status = 200) => {
            await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(json) });
        };

        await page.route('**/api/auth/me', route => mockJson(route, mockUser));
        await page.route('**/api/flows', route => mockJson(route, []));
        await page.route('**/api/files', route => mockJson(route, []));
        await page.route('**/api/files/batches', route => mockJson(route, []));

        // Mock file upload response
        await page.route('**/api/files/upload', async (route) => {
            await mockJson(route, { id: 1, filename: 'test1.csv', original_filename: 'test1.csv' }, 201);
        });
    });

    test('should automatically preview the single terminal output', async ({ page }) => {
        // Mock the new /list-outputs endpoint
        await page.route('**/api/transform/list-outputs', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                    outputs: [
                        { virtualId: 'virtual:transform-123', virtualName: 'Final Result' }
                    ]
                }),
            });
        });

        // Mock the /execute endpoint for when the preview is requested
        await page.route('**/api/transform/execute', async (route) => {
            const requestBody = route.request().postDataJSON();
            if (requestBody.preview_target?.virtual_id === 'virtual:transform-123') {
                await route.fulfill({
                    status: 200,
                    contentType: 'application/json',
                    body: JSON.stringify({
                        preview: {
                            columns: ['ID', 'Name', 'Amount'],
                            preview_rows: [{ 'ID': 2, 'Name': 'Beta', 'Amount': 200 }, { 'ID': 3, 'Name': 'Gamma', 'Amount': 300 }],
                            row_count: 2
                        }
                    }),
                });
            } else {
                await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ preview: { columns: [], preview_rows: [], row_count: 0 }}) });
            }
        });

        await page.goto('http://localhost:5173/flow-builder?new=1');

        const sourceNode = page.locator('.pipeline-block').first();
        await expect(sourceNode).toBeVisible({ timeout: 10000 });

        // Upload a file
        await sourceNode.getByTestId('upload-button').click();
        const modal = page.locator('div[role="dialog"]').filter({ hasText: 'Upload Data' });
        await modal.locator('input[type="file"]').first().setInputFiles({
            name: 'test1.csv',
            mimeType: 'text/csv',
            buffer: Buffer.from('ID,Name,Amount\n1,Alpha,100\n2,Beta,200\n3,Gamma,300')
        });

        // Verify the file appears in the modal, which signals the upload API call has completed
        await expect(modal.getByText('test1.csv')).toBeVisible({timeout: 10000});

        // Now close the modal
        await modal.getByLabel('Close').click();

        // Add a transform step
        await sourceNode.getByTitle('Add step after this').click();
        await page.getByText('Filter Rows').click();

        // Click preview on the output node
        const outputNode = page.locator('.pipeline-block').last();
        await outputNode.getByTitle('Show preview').click();

        // Assertions
        const previewModal = page.locator('.fixed.inset-0.z-50');
        await expect(previewModal).toBeVisible();

        // The preview data from the execute mock should be visible
        await expect(previewModal.locator('.rdg-row')).toHaveCount(2, { timeout: 10000 });
        await expect(previewModal.getByText('Beta')).toBeVisible();
        await expect(previewModal.getByText('300')).toBeVisible();
    });
});
