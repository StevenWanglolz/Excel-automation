import { test, expect, type Route } from '@playwright/test';

const mockUser = { id: '123', email: 'test@example.com', full_name: 'Test User', is_active: true };

const mockBatch = { id: 1, name: 'Export Batch', file_count: 3, created_at: new Date().toISOString() };
const mockGroupFiles = [
  { id: 101, original_filename: 'group_a.xlsx', batch_id: 1, created_at: new Date().toISOString() },
  { id: 102, original_filename: 'group_b.xlsx', batch_id: 1, created_at: new Date().toISOString() },
  { id: 103, original_filename: 'group_c.xlsx', batch_id: 1, created_at: new Date().toISOString() },
];
const mockSingleFiles = [
  { id: 201, original_filename: 'solo_a.xlsx', batch_id: null, created_at: new Date().toISOString() },
  { id: 202, original_filename: 'solo_b.xlsx', batch_id: null, created_at: new Date().toISOString() },
];

const mockPreview = {
  columns: ['Name', 'Amount'],
  preview_rows: [{ Name: 'Example', Amount: 10 }],
  row_count: 1,
};

const mockSheets = ['Sheet1'];

const mockJson = async (route: Route, json: any, status = 200) => {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(json) });
};

const buildFlow = ({
  id,
  name,
  outputFiles,
  sourceTargets,
  destinationTargets,
  outputBatchId,
}: {
  id: number;
  name: string;
  outputFiles: Array<{ id: string; fileName: string; sheets: Array<{ sheetName: string }> }>;
  sourceTargets: Array<{ fileId: number | null; sheetName: string | null; batchId?: number | null }>;
  destinationTargets?: Array<{ fileId: number | null; sheetName: string | null; virtualId?: string | null }>;
  outputBatchId?: number | null;
}) => {
  const outputData = {
    outputs: outputFiles,
  };

  return {
    id,
    name,
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
            fileIds: [...mockGroupFiles, ...mockSingleFiles].map((file) => file.id),
          },
        },
        {
          id: 'transform-1',
          type: 'transform',
          position: { x: 250, y: 250 },
                data: {
                    label: 'Row Filter',
                    blockType: 'filter_rows',
                    config: { column: 'Amount', operator: 'greater_than', value: 0 },
                    sourceTargets,
                    destinationTargets,
                },
        },
        {
          id: 'output-0',
          type: 'output',
          position: { x: 250, y: 400 },
          data: {
            label: 'Output',
            blockType: 'output',
            config: {},
            output: outputData,
            outputBatchId: outputBatchId ?? null,
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'source-0', target: 'transform-1' },
        { id: 'e2', source: 'transform-1', target: 'output-0' },
      ],
    },
  };
};

const groupToGroupFlow = buildFlow({
  id: 1101,
  name: 'Group to Group Export',
  outputFiles: [
    { id: 'out-1', fileName: 'group_a_filtered.xlsx', sheets: [{ sheetName: 'Sheet1' }] },
    { id: 'out-2', fileName: 'group_b_filtered.xlsx', sheets: [{ sheetName: 'Sheet1' }] },
    { id: 'out-3', fileName: 'group_c_filtered.xlsx', sheets: [{ sheetName: 'Sheet1' }] },
  ],
  sourceTargets: mockGroupFiles.map((file) => ({
    fileId: file.id,
    sheetName: 'Sheet1',
    batchId: file.batch_id,
  })),
  destinationTargets: mockGroupFiles.map((file, index) => ({
    fileId: file.id,
    sheetName: 'Sheet1',
    virtualId: `output:out-${index + 1}:Sheet1`,
  })),
  outputBatchId: mockBatch.id,
});

const groupToManyFlow = buildFlow({
  id: 1102,
  name: 'Group to Many Export',
  outputFiles: [
    { id: 'out-1', fileName: 'merged_group.xlsx', sheets: [{ sheetName: 'Sheet1' }] },
  ],
  sourceTargets: mockGroupFiles.map((file) => ({
    fileId: file.id,
    sheetName: 'Sheet1',
    batchId: file.batch_id,
  })),
  outputBatchId: mockBatch.id,
});

const manyToManyFlow = buildFlow({
  id: 1103,
  name: 'Many to Many Export',
  outputFiles: [
    { id: 'out-1', fileName: 'solo_a_filtered.xlsx', sheets: [{ sheetName: 'Sheet1' }] },
    { id: 'out-2', fileName: 'solo_b_filtered.xlsx', sheets: [{ sheetName: 'Sheet1' }] },
  ],
  sourceTargets: mockSingleFiles.map((file) => ({
    fileId: file.id,
    sheetName: 'Sheet1',
    batchId: null,
  })),
});

const flowById = new Map<number, any>([
  [groupToGroupFlow.id, groupToGroupFlow],
  [groupToManyFlow.id, groupToManyFlow],
  [manyToManyFlow.id, manyToManyFlow],
]);

test.describe('Export scenarios with grouped sources', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.addInitScript(() => localStorage.setItem('access_token', 'mock-token'));

    await page.route('**/api/auth/me', (route) => mockJson(route, mockUser));

    await page.route('**/api/flows', async (route) => {
      const method = route.request().method();
      if (method === 'POST') {
        const data = route.request().postDataJSON();
        await mockJson(route, { ...groupToGroupFlow, id: Date.now(), ...data }, 201);
        return;
      }
      await mockJson(route, [groupToGroupFlow, groupToManyFlow, manyToManyFlow]);
    });

    await page.route('**/api/flows/*', async (route) => {
      const url = route.request().url();
      const match = url.match(/\/api\/flows\/(\d+)/);
      const flowId = match ? Number(match[1]) : null;
      const flow = flowId ? flowById.get(flowId) : null;
      await mockJson(route, flow ?? groupToGroupFlow);
    });

    await page.route('**/api/files', (route) => mockJson(route, [...mockGroupFiles, ...mockSingleFiles]));
    await page.route('**/api/files/batches', (route) => mockJson(route, [mockBatch]));
    await page.route('**/api/files/*/preview*', (route) => mockJson(route, mockPreview));
    await page.route('**/api/files/*/sheets', (route) => mockJson(route, mockSheets));
    await page.route('**/api/transform/preview-step', (route) => mockJson(route, mockPreview));
    await page.route('**/api/transform/precompute', (route) => mockJson(route, { status: 'ok' }));
  });

  test('Group to Group export keeps batch outputs together', async ({ page }) => {
    let exportPayload: any = null;
    await page.route('**/api/transform/export', async (route) => {
      exportPayload = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/zip',
        body: 'fake-zip-content',
      });
    });

    await page.goto(`/flow-builder?flow=${groupToGroupFlow.id}`);

    const filterBlock = page.locator('.pipeline-block').filter({ hasText: 'Row Filter' }).first();
    await filterBlock.click({ force: true });

    const propertiesPanel = page.locator('#properties-panel');
    await expect(propertiesPanel.getByText('Export Batch', { exact: true }).first()).toBeVisible();
    await expect(propertiesPanel.getByText('Auto-generating 3 destinations')).toBeVisible();

    const outputBlock = page.locator('.pipeline-block').filter({ hasText: 'Output' }).first();
    const downloadPromise = page.waitForEvent('download');
    await outputBlock.getByRole('button', { name: 'Export' }).click();
    const download = await downloadPromise;

    expect(exportPayload?.output_batch_id).toBe(mockBatch.id);
    expect(download.suggestedFilename()).toBe('outputs.zip');
  });

  test('Group to Many export downloads a single file', async ({ page }) => {
    let exportPayload: any = null;
    await page.route('**/api/transform/export', async (route) => {
      exportPayload = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        body: 'fake-xlsx-content',
      });
    });

    await page.goto(`/flow-builder?flow=${groupToManyFlow.id}`);

    const filterBlock = page.locator('.pipeline-block').filter({ hasText: 'Row Filter' }).first();
    await filterBlock.click({ force: true });

    const propertiesPanel = page.locator('#properties-panel');
    await expect(propertiesPanel.getByText('Export Batch', { exact: true }).first()).toBeVisible();
    await expect(propertiesPanel.getByText('Auto-generating 3 destinations')).toBeVisible();

    const outputBlock = page.locator('.pipeline-block').filter({ hasText: 'Output' }).first();
    const downloadPromise = page.waitForEvent('download');
    await outputBlock.getByRole('button', { name: 'Export' }).click();
    const download = await downloadPromise;

    expect(exportPayload?.output_batch_id).toBe(mockBatch.id);
    expect(download.suggestedFilename()).toBe('merged_group.xlsx');
  });

  test('Many to Many export uses zip without batch grouping', async ({ page }) => {
    let exportPayload: any = null;
    await page.route('**/api/transform/export', async (route) => {
      exportPayload = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/zip',
        body: 'fake-zip-content',
      });
    });

    await page.goto(`/flow-builder?flow=${manyToManyFlow.id}`);

    const filterBlock = page.locator('.pipeline-block').filter({ hasText: 'Row Filter' }).first();
    await filterBlock.click({ force: true });

    const propertiesPanel = page.locator('#properties-panel');
    const soloOptions = propertiesPanel.getByRole('option', { name: 'solo_a.xlsx' });
    const soloOptionCount = await soloOptions.count();
    await expect(soloOptionCount).toBeGreaterThanOrEqual(2);

    const outputBlock = page.locator('.pipeline-block').filter({ hasText: 'Output' }).first();
    const downloadPromise = page.waitForEvent('download');
    await outputBlock.getByRole('button', { name: 'Export' }).click();
    const download = await downloadPromise;

    expect(exportPayload?.output_batch_id).toBeNull();
    expect(download.suggestedFilename()).toBe('outputs.zip');
  });
});
