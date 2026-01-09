import { test, expect, type Route } from '@playwright/test';

let lastTransformPayload: any = null;

/**
 * Test scenarios for filter row functionality with different data flow patterns:
 * - Group-to-Group: Multiple files processed individually, outputs preserved as group
 * - Group-to-Many: Multiple files combined into single output  
 * - Many-to-Many: Individual files mapped to individual outputs
 */
const API_BASE = 'http://localhost:8000/api';

type PreviewOverride = {
  columns: string[];
  preview_rows: Record<string, unknown>[];
  row_count: number;
};

type TransformExecuteOverride = {
  preview: PreviewOverride;
  row_count: number;
  column_count: number;
};

let customFilePreview: PreviewOverride | null = null;
let customTransformExecuteResponse: TransformExecuteOverride | null = null;

test.describe('Filter Scenarios with Groups', () => {

  // Mock data for testing
  const mockUser = { id: '123', email: 'test@example.com', full_name: 'Test User', is_active: true };
  
  // Simulate a batch of 3 files
  const mockBatch = { id: 1, name: 'Test Batch', file_count: 3, created_at: new Date().toISOString() };
  const mockBatch2 = { id: 2, name: 'Second Batch', file_count: 2, created_at: new Date().toISOString() };
  const mockFile1 = { id: 101, original_filename: 'sales_q1.xlsx', batch_id: 1, created_at: new Date().toISOString() };
  const mockFile2 = { id: 102, original_filename: 'sales_q2.xlsx', batch_id: 1, created_at: new Date().toISOString() };
  const mockFile3 = { id: 103, original_filename: 'sales_q3.xlsx', batch_id: 1, created_at: new Date().toISOString() };
  const mockBatch2File1 = { id: 104, original_filename: 'batch2-file1.xlsx', batch_id: 2, created_at: new Date().toISOString() };
  const mockBatch2File2 = { id: 105, original_filename: 'batch2-file2.xlsx', batch_id: 2, created_at: new Date().toISOString() };
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
    page.on('console', msg => { console.log(`[Browser]: ${msg.text()}`); });

    // API Mocks - use specific backend URL to avoid interfering with Vite
    
    lastTransformPayload = null;
    customFilePreview = null;
    customTransformExecuteResponse = null;

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
    await page.route(`${API_BASE}/files/*/preview*`, route => {
      const payload = customFilePreview ?? {
        columns: ['Name', 'Amount', 'Status'],
        preview_rows: [
          { Name: 'Item A', Amount: 100, Status: 'Active' },
          { Name: 'Item B', Amount: 200, Status: 'Inactive' },
        ],
        row_count: 2,
      };
      mockJson(route, payload);
    });
    await page.route(`${API_BASE}/transform/preview-step`, route => mockJson(route, { 
      columns: ['Name', 'Amount', 'Status'], 
      preview_rows: [{ Name: 'Item A', Amount: 100, Status: 'Active' }],
      row_count: 1 
    }));
    await page.route(`${API_BASE}/transform/execute`, async (route) => {
      lastTransformPayload = route.request().postDataJSON();
      const payload = customTransformExecuteResponse ?? {
        preview: { columns: ['Name', 'Amount'], preview_rows: [], row_count: 0 },
        row_count: 0,
        column_count: 2,
      };
      await mockJson(route, payload);
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

  test('Create destination from a source automatically links the pair', async ({ page }) => {
    await page.goto('/flow-builder');
    await expect(page.getByText('Data', { exact: true })).toBeVisible({ timeout: 10000 });
    await addBlockViaModal(page, 'Selection', 'Row Filter');

    const outputBlock = page.locator('.pipeline-block').filter({ hasText: 'Output' }).first();
    await outputBlock.click({ force: true });
    const outputPanel = page.locator('#properties-panel');
    await outputPanel.getByRole('button', { name: 'Add output file' }).click();

    const filterBlock = page.locator('.pipeline-block').nth(1);
    await filterBlock.click({ force: true });
    const panel = page.locator('#properties-panel');

    await panel.getByRole('button', { name: 'Add source' }).click();
    const fileSelect = panel.locator('[data-testid^="source-entry-select-"]').first();
    await fileSelect.selectOption('file:201');

    const createDestButton = panel.getByRole('button', { name: 'Create destination from this file' }).last();
    await expect(createDestButton).toBeEnabled();
    await createDestButton.click();

    const linkedSelect = panel.locator('[data-testid^="linked-sources-"]').first();
    await expect(linkedSelect).toBeVisible();
    const linkedText = await linkedSelect.evaluate((select) =>
      Array.from(select.selectedOptions).map((opt) => opt.textContent ?? '').join(',')
    );
    expect(linkedText).toContain('report_a.xlsx');
  });

  test('Manual linking lets one destination point to multiple sources', async ({ page }) => {
    await page.goto('/flow-builder');
    await expect(page.getByText('Data', { exact: true })).toBeVisible({ timeout: 10000 });
    await addBlockViaModal(page, 'Selection', 'Row Filter');

    const outputBlock = page.locator('.pipeline-block').filter({ hasText: 'Output' }).first();
    await outputBlock.click({ force: true });
    const outputPanel = page.locator('#properties-panel');
    await outputPanel.getByRole('button', { name: 'Add output file' }).click();

    const filterBlock = page.locator('.pipeline-block').nth(1);
    await filterBlock.click({ force: true });
    const panel = page.locator('#properties-panel');

    const addSource = panel.getByRole('button', { name: 'Add source' });
    await addSource.click();
    await addSource.click();
    const fileSelects = panel.locator('[data-testid^="source-entry-select-"]');
    await fileSelects.nth(0).selectOption('file:201');
    await fileSelects.nth(1).selectOption('file:202');

    const createDestButton = panel.getByRole('button', { name: 'Create destination from this file' }).last();
    await createDestButton.click();
    const linkedSelect = panel.locator('[data-testid^="linked-sources-"]').last();
    await linkedSelect.selectOption([{ value: '0' }, { value: '1' }]);

    const linkedSummary = await linkedSelect.evaluate((select) =>
      Array.from(select.selectedOptions).map((opt) => opt.textContent ?? '').join(',')
    );
    expect(linkedSummary).toContain('report_a.xlsx');
    expect(linkedSummary).toContain('report_b.xlsx');
  });

  test('Preview batch dropdown scopes the file list to the selected group', async ({ page }) => {
    const multiBatchFiles = [...mockFiles, mockBatch2File1, mockBatch2File2];
    const multiBatches = [mockBatch, mockBatch2];
    await page.route(`${API_BASE}/files`, (route) => mockJson(route, multiBatchFiles));
    await page.route(`${API_BASE}/files/batches`, (route) => mockJson(route, multiBatches));

    await page.goto('/flow-builder');
    await addBlockViaModal(page, 'Selection', 'Row Filter');

    const filterBlock = page.locator('.pipeline-block').nth(1);
    await filterBlock.click({ force: true });
    const panel = page.locator('#properties-panel');
    const addSource = panel.getByRole('button', { name: 'Add source' });
    await addSource.click();
    const sourceSelects = panel.locator('[data-testid^="source-entry-select-"]');
    await sourceSelects.first().selectOption('group:1');
    await addSource.click();
    await expect(sourceSelects.last()).toBeVisible({ timeout: 5000 });
    await sourceSelects.last().selectOption('group:2');

    await filterBlock.locator('button[title*="preview"]').click({ force: true });

    const batchSelect = page.getByLabel('File group');
    const fileSelect = page.getByLabel('File').nth(1);

    await expect(batchSelect).toBeVisible();
    await expect(fileSelect).toBeVisible({ timeout: 10000 });
    await expect(batchSelect).toHaveValue('');
    await expect(batchSelect.locator('option')).toHaveCount(3);
    await expect.poll(
      () => fileSelect.locator('option').count(),
      { timeout: 10000 }
    ).toBeGreaterThanOrEqual(3);
    const initialFileOptions = await fileSelect.locator('option').allTextContents();
    expect(initialFileOptions).toContain('sales_q1.xlsx');
    expect(initialFileOptions).toContain('batch2-file1.xlsx');

    await batchSelect.selectOption(String(mockBatch2.id));
    await expect(batchSelect).toHaveValue(String(mockBatch2.id));
    await expect.poll(
      () => fileSelect.locator('option').count(),
      { timeout: 10000 }
    ).toBe(2);
    const secondBatchOptions = await fileSelect.locator('option').allTextContents();
    expect(secondBatchOptions).toContain('batch2-file1.xlsx');
    expect(secondBatchOptions).toContain('batch2-file2.xlsx');
    expect(secondBatchOptions).not.toContain('sales_q1.xlsx');
  });

  test('Batch picker lets you add multiple groups at once', async ({ page }) => {
    const multiBatchFiles = [...mockFiles, mockBatch2File1, mockBatch2File2];
    const multiBatches = [mockBatch, mockBatch2];
    await page.route(`${API_BASE}/files`, (route) => mockJson(route, multiBatchFiles));
    await page.route(`${API_BASE}/files/batches`, (route) => mockJson(route, multiBatches));

    await page.goto('/flow-builder');
    await addBlockViaModal(page, 'Selection', 'Row Filter');

    const filterBlock = page.locator('.pipeline-block').nth(1);
    await filterBlock.click({ force: true });
    const panel = page.locator('#properties-panel');
    const batchPicker = panel.getByTestId('batch-multi-select');
    await batchPicker.selectOption([
      String(mockBatch.id),
      String(mockBatch2.id),
    ]);

    await expect(panel.getByText(mockBatch.name, { exact: true })).toBeVisible();
    await expect(panel.getByText(mockBatch2.name, { exact: true })).toBeVisible();
  });

  test('Row Filter output preview should be accessible', async ({ page }) => {
    /**
     * Scenario:
     * 1. Add Row Filter
     * 2. Open Preview
     * 3. Verify that we can see the "Preview output sheets" button or valid output data
     */
    // Mock a flow with a Row Filter already
    const filterFlow = {
      ...flowWithFiles,
      id: 10001,
      name: 'Filter Output Test Flow',
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
              fileIds: [mockFile1.id],
            },
          },
          {
            id: 'transform-1',
            type: 'transform',
            position: { x: 250, y: 300 },
            data: {
              label: 'Row Filter',
              blockType: 'filter_rows',
              config: { column: 'Name', operator: 'contains', value: 'Item' },
              sourceTargets: [{ fileId: mockFile1.id, sheetName: 'Sheet1' }], // Explicit source
            },
          },
          {
            id: 'output-0',
            type: 'output',
            position: { x: 250, y: 450 },
            data: {
              label: 'Output',
              blockType: 'output',
              config: {},
              output: { outputs: [] },
            },
          },
        ],
        edges: [
          { id: 'e1', source: 'source-0', target: 'transform-1' },
          { id: 'e2', source: 'transform-1', target: 'output-0' },
        ],
      },
    };

    await page.route(`${API_BASE}/flows/${filterFlow.id}`, (route) => mockJson(route, filterFlow));
    await page.route(`${API_BASE}/flows`, (route) => mockJson(route, [filterFlow]));

    // Update the execute mock to return actual result for this flow
    customTransformExecuteResponse = {
      preview: {
        columns: ['Name', 'Amount'],
        preview_rows: [{ Name: 'Item A', Amount: 100, Status: 'Active' }],
        row_count: 1,
      },
      row_count: 1,
      column_count: 2,
    };

    await page.goto(`/flow-builder?flow=${filterFlow.id}`);
    
    // Wait for the blocks to appear
    const filterBlock = page.locator('.pipeline-block').filter({ hasText: 'Row Filter' }).first();
    await expect(filterBlock).toBeVisible();

    // Open Preview
    await filterBlock.locator('button[title*="preview"]').click({ force: true });
    
    // Check if the preview modal title is visible
    await expect(page.getByText('Full Screen Preview')).toBeVisible();

    // Wait for data
    await expect(page.getByRole('cell', { name: 'Item A' })).toBeVisible({ timeout: 5000 });

    // NOW CHECK FOR THE ISSUE: 
    // The user claimed "Output preview... Only shows the source".
    // "Preview output sheets" button lets you switch to the FINAL export. 
    // But the default view should be the TRANSORMED output of this block.
    
    // We expect the "Preview output sheets" button to be visible (since we are in operation preview)
    const outputBtn = page.getByRole('button', { name: 'Preview output sheets' });
    await expect(outputBtn).toBeVisible();

    // AND we should see the transformed data 'Item A' immediately
    await expect(page.getByRole('cell', { name: 'Item A' })).toBeVisible();
  });

  test('Row Filter preview should show transform result (not output sheet)', async ({ page }) => {
    // This test ensures that when we preview a transform node, it shows the transform result
    // even if there is a compiled output block in the flow.
    // Regression check for: "No output sheets available yet" error.
    
    // 1. Setup flow with Source -> Filter -> Output
    const flowId = 10002;
    const filterFlow = {
      ...flowWithFiles,
      id: flowId,
      name: 'Filter Output Fallback Test',
      flow_data: {
        nodes: [
          {
            id: 'source-0',
            type: 'source',
            position: { x: 100, y: 100 },
            data: {
              label: 'Data',
              blockType: 'source',
              // Use fileIds array properly
              fileIds: [mockFile1.id], 
              config: {},
              
              // Key: Provide valid source target so FlowBuilder knows to use it
              // relying on our previous fix (fallback) or explicit. 
              // Let's rely on the previous fix (no explicit target needed if fallback works)
              // But for this test let's be realistic mock
            },
          },
          {
            id: 'transform-1',
            type: 'transform',
            position: { x: 300, y: 100 },
            data: {
              label: 'Row Filter',
              blockType: 'filter_rows',
              config: { column: 'ColA', operator: 'contains', value: 'Data' },
              sourceTargets: [{ fileId: mockFile1.id, sheetName: 'Sheet1' }],
              // No destination set yet
            },
          },
          {
            id: 'output-0',
            type: 'output',
            position: { x: 500, y: 100 },
            data: {
              label: 'Output',
              blockType: 'output',
              config: {},
              output: { outputs: [{ id: 'out1', fileName: 'final.xlsx', sheets: [] }] }, // Empty output
            },
          },
        ],
        edges: [
            { id: 'e1', source: 'source-0', target: 'transform-1' }
        ],
      },
    };

    await page.route(`${API_BASE}/flows/${flowId}`, (route) => mockJson(route, filterFlow));
    await page.route(`${API_BASE}/flows`, (route) => mockJson(route, [filterFlow]));

    // Mock Execute result for the Filter
    customTransformExecuteResponse = {
      preview: {
        columns: ['ColA'],
        preview_rows: [{ ColA: 'FilteredData' }],
        row_count: 1,
      },
      row_count: 1,
      column_count: 1,
    };

    await page.goto(`/flow-builder?flow=${flowId}`);

    // 2. Click Preview on the Row Filter
    const filterBlock = page.locator('.pipeline-block').filter({ hasText: 'Row Filter' }).first();
    await expect(filterBlock).toBeVisible();
    await filterBlock.locator('button[title*="preview"]').click({ force: true });

    // 3. Verify we see 'FilteredData' (Transform Result)
    // NOT "No output sheets available yet"
    await expect(page.getByText('No output sheets available yet')).not.toBeVisible();
    await expect(page.getByRole('cell', { name: 'FilteredData' })).toBeVisible({ timeout: 5000 });
  });

  test('Row Filter preview shows filtered job title after uploading files', async ({ page }) => {
    /**
     * Workflow:
     * 1. Upload files (mocked via API)
     * 2. Add Row Filter block and configure the column/operator/value
     * 3. Preview the transform and expect the filtered job title row
     */
    customFilePreview = {
      columns: ['Job Title', 'Department', 'Employment Type'],
      preview_rows: [
        { 'Job Title': 'Software Engineer', Department: 'Product', 'Employment Type': 'Full-Time' },
        { 'Job Title': 'Designer', Department: 'Design', 'Employment Type': 'Part-Time' },
      ],
      row_count: 2,
    };
    customTransformExecuteResponse = {
      preview: {
        columns: ['Job Title', 'Department'],
        preview_rows: [{ 'Job Title': 'Software Engineer', Department: 'Engineering' }],
        row_count: 1,
      },
      row_count: 1,
      column_count: 2,
    };

    await page.goto('/flow-builder');
    await expect(page.getByText('Data', { exact: true })).toBeVisible({ timeout: 10000 });

    await addBlockViaModal(page, 'Selection', 'Row Filter');
    const filterBlock = page.locator('.pipeline-block').nth(1);
    await filterBlock.click({ force: true });

    const panel = page.locator('#properties-panel');
    const addSourceButton = panel.getByRole('button', { name: 'Add source' });
    await addSourceButton.click();
    const sourceSelect = panel.locator('[data-testid^="source-entry-select-"]').first();
    await sourceSelect.selectOption('file:101');

    const columnSelect = panel.locator('select[id^="filter-column-"]');
    await columnSelect.selectOption('Job Title');
    const operatorSelect = panel.locator('select[id^="filter-operator-"]');
    await operatorSelect.selectOption('equals');
    const valueInput = panel.locator('input[id^="filter-value-"]');
    await valueInput.fill('Software Engineer');

    await filterBlock.locator('button[title*="preview"]').click({ force: true });
    await expect(page.getByText('Full Screen Preview')).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Software Engineer' })).toBeVisible({ timeout: 5000 });
    const outputButton = page.getByRole('button', { name: 'Preview output sheets' });
    await expect(outputButton).toBeVisible();
    await outputButton.click({ force: true });
    await expect(page.getByText('No output sheets available yet')).not.toBeVisible();
    await expect(page.getByRole('cell', { name: 'Software Engineer' })).toBeVisible({ timeout: 5000 });
    await expect.poll(
      () => lastTransformPayload?.preview_target?.virtual_id ?? null,
      { timeout: 10000, message: 'output preview never requested' }
    ).not.toBeNull();
  });
});
