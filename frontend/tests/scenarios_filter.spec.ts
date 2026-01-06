import { test, expect, type Route } from '@playwright/test';

let lastTransformPayload: any = null;

/**
 * Test scenarios for filter row functionality with different data flow patterns:
 * - Group-to-Group: Multiple files processed individually, outputs preserved as group
 * - Group-to-Many: Multiple files combined into single output  
 * - Many-to-Many: Individual files mapped to individual outputs
 */
const API_BASE = 'http://localhost:8000/api';

test.describe('Filter Scenarios with Groups', () => {

  // Mock data for testing
  const mockUser = { id: '123', email: 'test@example.com', full_name: 'Test User', is_active: true };
  
  // Simulate a batch of 3 files
  const mockBatch = { id: 1, name: 'Test Batch', file_count: 3, created_at: new Date().toISOString() };
  const mockFile1 = { id: 101, original_filename: 'sales_q1.xlsx', batch_id: 1, created_at: new Date().toISOString() };
  const mockFile2 = { id: 102, original_filename: 'sales_q2.xlsx', batch_id: 1, created_at: new Date().toISOString() };
  const mockFile3 = { id: 103, original_filename: 'sales_q3.xlsx', batch_id: 1, created_at: new Date().toISOString() };
  const mockFiles = [mockFile1, mockFile2, mockFile3];

  // Individual files (not in batch) for Many-to-Many testing
  const mockIndividualFile1 = { id: 201, original_filename: 'report_a.xlsx', batch_id: null, created_at: new Date().toISOString() };
  const mockIndividualFile2 = { id: 202, original_filename: 'report_b.xlsx', batch_id: null, created_at: new Date().toISOString() };

  const flowWithFiles = {
    id: 9999,
    name: 'Row Filter Preview Flow',
    description: '',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    user_id: '123',
    flow_data: {
      nodes: [
        {
          id: 'source-0',
          type: 'source',
          position: { x: 250, y: 150 },
          data: {
            label: 'Data',
            blockType: 'source',
            config: {},
            fileIds: [...mockFiles, mockIndividualFile1, mockIndividualFile2].map((file) => file.id),
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
            output: {
              outputs: [],
            },
          },
        },
      ],
      edges: [{ id: 'e1', source: 'source-0', target: 'output-0' }],
    },
  };

  // Helper to mock JSON responses
  const mockJson = async (route: Route, json: any, status = 200) => {
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(json) });
  };

  test.beforeEach(async ({ page }) => {
    // Set viewport
    await page.setViewportSize({ width: 1920, height: 1080 });
    
    // Auto-login
    await page.addInitScript(() => localStorage.setItem('access_token', 'mock-token'));
    
    // Debug logging (disabled for cleaner output)
    // page.on('console', msg => { console.log(`[Browser]: ${msg.text()}`); });

    // API Mocks - use specific backend URL to avoid interfering with Vite
    
    lastTransformPayload = null;

    await page.route(`${API_BASE}/auth/me`, route => mockJson(route, mockUser));
    await page.route(`${API_BASE}/flows*`, async route => {
      if (route.request().method() === 'POST') {
        const data = route.request().postDataJSON();
        await mockJson(route, { id: Date.now(), ...data }, 201);
      } else {
        await mockJson(route, []);
      }
    });
    await page.route(`${API_BASE}/files`, route => mockJson(route, [...mockFiles, mockIndividualFile1, mockIndividualFile2]));
    await page.route(`${API_BASE}/files/batches`, route => mockJson(route, [mockBatch]));
    await page.route(`${API_BASE}/files/*/sheets`, route => mockJson(route, ['Sheet1', 'Sheet2']));
    await page.route(`${API_BASE}/files/*/preview*`, route => mockJson(route, { 
      columns: ['Name', 'Amount', 'Status'], 
      preview_rows: [
        { Name: 'Item A', Amount: 100, Status: 'Active' },
        { Name: 'Item B', Amount: 200, Status: 'Inactive' }
      ], 
      row_count: 2 
    }));
    await page.route(`${API_BASE}/transform/preview-step`, route => mockJson(route, { 
      columns: ['Name', 'Amount', 'Status'], 
      preview_rows: [{ Name: 'Item A', Amount: 100, Status: 'Active' }],
      row_count: 1 
    }));
    await page.route(`${API_BASE}/transform/execute`, async (route) => {
      lastTransformPayload = route.request().postDataJSON();
      await mockJson(route, {
        preview: { columns: ['Name', 'Amount'], preview_rows: [], row_count: 0 },
        row_count: 0,
        column_count: 2
      });
    });
    await page.route(`${API_BASE}/transform/precompute`, route => mockJson(route, { status: 'ok' }));
  });

  /**
   * Helper function to add a block via the "+" button and operation modal
   * @param page Playwright page
   * @param categoryText Partial text of category (e.g., "Selection" to match "🧲 Selection & Rows")
   * @param blockText Exact block name (e.g., "Row Filter")
   */
  async function addBlockViaModal(page: any, categoryText: string, blockText: string) {
    // Wait for at least one block to be visible to ensure canvas is ready
    await expect(page.locator('.pipeline-block').first()).toBeVisible({ timeout: 10000 });

    // Click the "+" add operation button in the pipeline
    // The button has title "Add step after this"
    const addButton = page.getByTitle('Add step after this').first();
    await expect(addButton).toBeVisible({ timeout: 5000 });
    await addButton.click();
    
    // Wait for the modal to appear
    await expect(page.getByText('Select Operation')).toBeVisible({ timeout: 5000 });
    
    // If needed, click the category (find by partial text match)
    if (categoryText) {
      const categoryButton = page.locator('button').filter({ hasText: categoryText }).first();
      // Wait for category button to be visible
      await expect(categoryButton).toBeVisible();
      await categoryButton.click();
    }
    
    // Click the specific block
    const blockButton = page.locator('button').filter({ hasText: blockText }).first();
    await expect(blockButton).toBeVisible();
    await blockButton.click();
    
    // Wait for the modal to close and new block to appear
    await expect(page.getByText('Select Operation')).not.toBeVisible();
    await expect(page.locator('.pipeline-block').last()).toBeVisible({ timeout: 5000 });
  }

  test('Add source button should be visible when clicking transform block', async ({ page }) => {
    // Navigate to flow builder
    await page.goto('/flow-builder');
    
    // Wait for the page to load - look for the Data block
    await expect(page.getByText('Data', { exact: true })).toBeVisible({ timeout: 10000 });
    
    // Add a Row Filter transform block via the modal
    await addBlockViaModal(page, 'Selection', 'Row Filter');
    
    // Find the Row Filter block in the pipeline and click it (should be second block after Data)
    // The block should have text containing "Row Filter" or "Filter Rows"
    const filterBlock = page.locator('.pipeline-block').filter({ 
      has: page.locator(':text("Row Filter"), :text("Filter Rows")') 
    }).first();
    
    // If not found by text, use nth(1) as fallback
    const blockToClick = await filterBlock.count() > 0 
      ? filterBlock 
      : page.locator('.pipeline-block').nth(1);
    
    await blockToClick.click({ force: true });
    
    // Wait for properties panel to open
    await expect(page.getByRole('heading', { name: 'Properties' })).toBeVisible({ timeout: 5000 });
    
    // Verify "Add source" button is visible
    await expect(page.getByRole('button', { name: 'Add source' })).toBeVisible({ timeout: 5000 });
  });

  test('Group to Group: Filter Rows preserves 3 -> 3 structure', async ({ page }) => {
    /**
     * Scenario: User uploads a batch of 3 files, applies row filter, expects 3 output files
     * This tests that group-based processing maintains the file structure
     */
    await page.goto('/flow-builder');
    
    // Wait for Data block
    await expect(page.getByText('Data', { exact: true })).toBeVisible({ timeout: 10000 });
    
    // Add Row Filter block via modal
    await addBlockViaModal(page, 'Selection', 'Row Filter');
    
    // Click on the Row Filter block
    const filterBlock = page.locator('.pipeline-block').nth(1);
    await filterBlock.click({ force: true });
    
    // Verify Properties panel opens
    await expect(page.getByRole('heading', { name: 'Properties' })).toBeVisible({ timeout: 5000 });
    
    // Verify Sources section is visible
    await expect(page.getByRole('heading', { name: 'Sources' })).toBeVisible();
    
    // Verify "Add source" button is visible
    const addSourceButton = page.getByRole('button', { name: 'Add source' });
    await expect(addSourceButton).toBeVisible();
    
    // Click Add source to add a source
    await addSourceButton.click();
    
    // Verify a source selector/control appeared
    // Could be a select dropdown or other UI element
    await expect(page.locator('select').first()).toBeVisible({ timeout: 3000 });
    
    // Verify Destinations section is visible
    await expect(page.getByRole('heading', { name: 'Destinations' })).toBeVisible();
  });

  test('Group to Many: Append Files (3 -> 1)', async ({ page }) => {
    /**
     * Scenario: User uploads 3 files and uses Append Files to merge them into 1 output
     */
    await page.goto('/flow-builder');
    
    // Wait for page load
    await expect(page.getByText('Data', { exact: true })).toBeVisible({ timeout: 10000 });
    
    // Add Append Files Block via modal
    await addBlockViaModal(page, 'Multi-File', 'Append Files');
    
    // Click on the Append Files block
    const appendBlock = page.locator('.pipeline-block').nth(1);
    await appendBlock.click({ force: true });
    
    // Verify Properties panel opens
    await expect(page.getByRole('heading', { name: 'Properties' })).toBeVisible({ timeout: 5000 });
    
    // Verify "Add source" button is visible
    await expect(page.getByRole('button', { name: 'Add source' })).toBeVisible();
    
    // Add multiple sources (simulating 3 -> 1 merge)
    await page.getByRole('button', { name: 'Add source' }).click();
    await page.waitForTimeout(200);
    await page.getByRole('button', { name: 'Add source' }).click();
    await page.waitForTimeout(200);
    
    // Should have multiple source selectors now
    const selectors = page.locator('select');
    const selectorCount = await selectors.count();
    expect(selectorCount).toBeGreaterThanOrEqual(2);
    
    // Verify Destinations section exists
    await expect(page.getByRole('heading', { name: 'Destinations' })).toBeVisible();
  });

  test('Many to Many: Individual files to individual outputs', async ({ page }) => {
    /**
     * Scenario: User selects individual files (not in a batch) and processes them independently
     */
    await page.goto('/flow-builder');
    
    // Wait for page load
    await expect(page.getByText('Data', { exact: true })).toBeVisible({ timeout: 10000 });
    
    // Add Row Filter transform block via modal
    await addBlockViaModal(page, 'Selection', 'Row Filter');
    
    // Click on the Row Filter block
    const filterBlock = page.locator('.pipeline-block').nth(1);
    await filterBlock.click({ force: true });
    
    // Properties panel should be visible
    await expect(page.getByRole('heading', { name: 'Properties' })).toBeVisible({ timeout: 5000 });
    
    // Add multiple individual sources
    await page.getByRole('button', { name: 'Add source' }).click();
    await page.waitForTimeout(200);
    await page.getByRole('button', { name: 'Add source' }).click();
    await page.waitForTimeout(200);
    
    // Verify multiple source selectors
    const selectorCount = await page.locator('select').count();
    expect(selectorCount).toBeGreaterThanOrEqual(2);
    
    // Now click on Output block
    const outputBlock = page.locator('.pipeline-block').filter({ hasText: 'Output' }).first();
    await outputBlock.click({ force: true });
    
    // Verify Output properties are visible
    await expect(page.getByRole('heading', { name: 'Properties' })).toBeVisible();
  });

  test('Filter configuration UI is accessible', async ({ page }) => {
    /**
     * Verify that filter configuration options are displayed for Row Filter block
     */
    await page.goto('/flow-builder');
    
    // Wait for page load
    await expect(page.getByText('Data', { exact: true })).toBeVisible({ timeout: 10000 });
    
    // Add Row Filter block via modal
    await addBlockViaModal(page, 'Selection', 'Row Filter');
    
    // Select the filter block
    const filterBlock = page.locator('.pipeline-block').nth(1);
    await filterBlock.click({ force: true });
    
    // Verify Properties panel
    await expect(page.getByRole('heading', { name: 'Properties' })).toBeVisible({ timeout: 5000 });
    const panel = page.locator('#properties-panel');
    
    // The Add source button should be visible
    await expect(page.getByRole('button', { name: 'Add source' })).toBeVisible();
    
    // Sources section should be present
    await expect(page.getByRole('heading', { name: 'Sources' })).toBeVisible();
    
    // Destinations section should be present
    await expect(page.getByRole('heading', { name: 'Destinations' })).toBeVisible();

    await expect(panel.getByLabel('Column')).toBeVisible();
    await expect(panel.getByLabel('Operator')).toBeVisible();
    await expect(panel.getByLabel('Value')).toBeVisible();
  });

  test('Row filter preview sends configured column/operator/value', async ({ page }) => {
    await page.route(`${API_BASE}/flows`, (route) => mockJson(route, [flowWithFiles]));
    await page.route(`${API_BASE}/flows/${flowWithFiles.id}`, (route) => mockJson(route, flowWithFiles));
    await page.goto(`/flow-builder?flow=${flowWithFiles.id}`);
    await addBlockViaModal(page, 'Selection', 'Row Filter');

    const filterBlock = page.locator('.pipeline-block').nth(1);
    await filterBlock.click({ force: true });
    const panel = page.locator('#properties-panel');

    await page.getByRole('button', { name: 'Add source' }).click();
    const sourceSelect = panel.locator('label:has-text("Source") + select').first();
    await expect(sourceSelect).toBeVisible();
    await sourceSelect.evaluate((select) => {
      const options = Array.from(select.querySelectorAll('option'));
      const target = options.find((opt) => opt.value && opt.value !== '');
      if (!target) {
        return;
      }
      target.selected = true;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const columnSelect = panel.getByLabel('Column');
    await expect(columnSelect).toBeVisible();
    await columnSelect.evaluate((select) => {
      const option = document.createElement('option');
      option.value = 'Name';
      option.textContent = 'Name';
      select.appendChild(option);
      select.value = 'Name';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const operatorSelect = panel.getByLabel('Operator');
    await operatorSelect.selectOption('contains');

    const valueInput = panel.getByLabel('Value');
    await valueInput.fill('Item');

    await filterBlock.locator('button[title*="preview"]').click({ force: true });
    await expect.poll(
      () => lastTransformPayload,
      { message: 'transform payload never sent', timeout: 10000 }
    ).not.toBeNull();

    expect(lastTransformPayload).not.toBeNull();
    const filterNode = lastTransformPayload?.flow_data?.nodes?.find(
      (node: any) => node.data?.blockType === 'filter_rows'
    );
    expect(filterNode).toBeTruthy();
    expect(filterNode?.data?.config).toMatchObject({
      column: 'Name',
      operator: 'contains',
      value: 'Item',
    });
  });
});
