import { test, expect, type Page, type Route } from '@playwright/test';

const API_BASE = 'http://localhost:8000/api';
let lastTransformPayload: any = null;

const mockUser = { id: '123', email: 'test@example.com', full_name: 'Test User', is_active: true };
const mockBatch = { id: 1, name: 'Group Batch', file_count: 3, created_at: new Date().toISOString() };
const mockGroupFiles = [
  { id: 101, original_filename: 'group_a.xlsx', batch_id: mockBatch.id, created_at: new Date().toISOString() },
  { id: 102, original_filename: 'group_b.xlsx', batch_id: mockBatch.id, created_at: new Date().toISOString() },
  { id: 103, original_filename: 'group_c.xlsx', batch_id: mockBatch.id, created_at: new Date().toISOString() },
];
const mockSingleFiles = [
  { id: 201, original_filename: 'single_a.xlsx', batch_id: null, created_at: new Date().toISOString() },
  { id: 202, original_filename: 'single_b.xlsx', batch_id: null, created_at: new Date().toISOString() },
];

const mockPreview = {
  columns: ['Name', 'Amount', 'Status'],
  preview_rows: [
    { Name: 'Item A', Amount: 100, Status: 'Active' },
    { Name: 'Item B', Amount: 200, Status: 'Inactive' },
  ],
  row_count: 2,
};

const allFileIds = [...mockGroupFiles, ...mockSingleFiles].map((file) => file.id);

const createOutputFile = (outputId: string, fileName: string) => ({
  id: outputId,
  fileName,
  sheets: [{ sheetName: 'Sheet1' }],
});

const createDestinationTarget = (outputId: string, label: string, sourceId?: string) => ({
  virtualId: `output:${outputId}:Sheet1`,
  virtualName: `${label} / Sheet1`,
  sheetName: 'Sheet1',
  sourceId: sourceId ?? null,
});

const rowFilterConfig = {
  column: 'Amount',
  operator: 'contains',
  value: 'Item',
};

const buildTransformFlow = ({
  id,
  name,
  sourceTargets,
  destinationTargets,
  outputFiles,
}: {
  id: number;
  name: string;
  sourceTargets: Array<Record<string, unknown>>;
  destinationTargets: Array<Record<string, unknown>>;
  outputFiles: Array<{ id: string; fileName: string; sheets: { sheetName: string }[] }>;
}) => ({
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
        position: { x: 250, y: 150 },
        data: {
          label: 'Data',
          blockType: 'source',
          config: {},
          fileIds: allFileIds,
        },
      },
      {
        id: `transform-${id}`,
        type: 'transform',
        position: { x: 450, y: 250 },
        data: {
          label: 'Row Filter',
          blockType: 'filter_rows',
          config: rowFilterConfig,
          sourceTargets,
          destinationTargets,
        },
      },
      {
        id: 'output-0',
        type: 'output',
        position: { x: 650, y: 250 },
        data: {
          label: 'Output',
          blockType: 'output',
          config: {},
          output: {
            outputs: outputFiles,
          },
          outputBatchId: null,
        },
      },
    ],
    edges: [
      { id: `e-${id}-1`, source: 'source-0', target: `transform-${id}` },
      { id: `e-${id}-2`, source: `transform-${id}`, target: 'output-0' },
    ],
  },
});

const g2gDestinations = mockGroupFiles.map((file, index) =>
  createDestinationTarget(`g2g-${index + 1}`, `g2g-${index + 1}`, `original:${file.id}:0`)
);
const g2gOutputs = g2gDestinations.map((dest, index) =>
  createOutputFile(`g2g-${index + 1}`, `g2g-output-${index + 1}.xlsx`)
);
const g2gFlow = buildTransformFlow({
  id: 3001,
  name: 'Group to Group Transform',
  sourceTargets: mockGroupFiles.map((file) => ({
    fileId: file.id,
    sheetName: 'Sheet1',
    batchId: mockBatch.id,
  })),
  destinationTargets: g2gDestinations,
  outputFiles: g2gOutputs,
});

const g2mDestinations = [
  createDestinationTarget('g2m-1', 'g2m-output-a.xlsx'),
  createDestinationTarget('g2m-2', 'g2m-output-b.xlsx'),
];
const g2mOutputs = g2mDestinations.map((dest, index) =>
  createOutputFile(`g2m-${index + 1}`, `g2m-output-${index + 1}.xlsx`)
);
const g2mFlow = buildTransformFlow({
  id: 3002,
  name: 'Group to Many Transform',
  sourceTargets: mockGroupFiles.map((file) => ({
    fileId: file.id,
    sheetName: 'Sheet1',
    batchId: mockBatch.id,
  })),
  destinationTargets: g2mDestinations,
  outputFiles: g2mOutputs,
});

const m2mDestinations = mockSingleFiles.map((file, index) =>
  createDestinationTarget(`m2m-${index + 1}`, `m2m-output-${index + 1}.xlsx`, `original:${file.id}:0`)
);
const m2mOutputs = m2mDestinations.map((dest, index) =>
  createOutputFile(`m2m-${index + 1}`, `m2m-output-${index + 1}.xlsx`)
);
const m2mFlow = buildTransformFlow({
  id: 3003,
  name: 'Many to Many Transform',
  sourceTargets: mockSingleFiles.map((file) => ({
    fileId: file.id,
    sheetName: 'Sheet1',
    batchId: null,
  })),
  destinationTargets: m2mDestinations,
  outputFiles: m2mOutputs,
});

const flowsList = [g2gFlow, g2mFlow, m2mFlow];

const mockJson = async (route: Route, json: any, status = 200) => {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(json) });
};

test.describe('Group operation workflows', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.addInitScript(() => localStorage.setItem('access_token', 'mock-token'));
    lastTransformPayload = null;

    await page.route(`${API_BASE}/auth/me`, (route) => mockJson(route, mockUser));
    await page.route(`${API_BASE}/flows`, async (route) => {
      if (route.request().method() === 'POST') {
        const data = route.request().postDataJSON();
        await mockJson(route, { id: Date.now(), ...data }, 201);
        return;
      }
      await mockJson(route, flowsList);
    });
    for (const flow of flowsList) {
      await page.route(`${API_BASE}/flows/${flow.id}`, (route) => mockJson(route, flow));
    }
    await page.route(`${API_BASE}/files`, (route) => mockJson(route, [...mockGroupFiles, ...mockSingleFiles]));
    await page.route(`${API_BASE}/files/batches`, (route) => mockJson(route, [mockBatch]));
    await page.route(`${API_BASE}/files/*/sheets`, (route) => mockJson(route, ['Sheet1', 'Sheet2']));
    await page.route(`${API_BASE}/files/*/preview*`, (route) => mockJson(route, mockPreview));
    await page.route(`${API_BASE}/transform/preview-step`, (route) => mockJson(route, mockPreview));
    await page.route(`${API_BASE}/transform/execute`, async (route) => {
      lastTransformPayload = route.request().postDataJSON();
      await mockJson(route, {
        preview: { columns: ['Name', 'Amount'], preview_rows: [], row_count: 0 },
        row_count: 0,
        column_count: 2,
      });
    });
    await page.route(`${API_BASE}/transform/precompute`, (route) => mockJson(route, { status: 'ok' }));
  });
  const openRowFilterPreview = async (page: Page) => {
    const block = page.locator('.pipeline-block').filter({ hasText: 'Row Filter' }).first();
    await expect(block).toBeVisible({ timeout: 10000 });
    await block.locator('button[title="Show preview"]').click({ force: true });
    await expect.poll(
      () => lastTransformPayload,
      { message: 'transform payload never sent', timeout: 10000 }
    ).not.toBeNull();
    return lastTransformPayload;
  };

  test('Group to Group uses a 1:1 mapping', async ({ page }) => {
    await page.goto(`/flow-builder?flow=${g2gFlow.id}`);
    const payload = await openRowFilterPreview(page);
    const transformNode = payload?.flow_data?.nodes?.find((node: any) => node?.data?.blockType === 'filter_rows');
    expect(transformNode).toBeTruthy();
    const sourceTargets = transformNode.data?.sourceTargets ?? [];
    const destinationTargets = transformNode.data?.destinationTargets ?? [];
    expect(sourceTargets.length).toBe(mockGroupFiles.length);
    expect(destinationTargets.length).toBe(mockGroupFiles.length);
    expect(sourceTargets.every((target: any) => target.batchId === mockBatch.id)).toBe(true);
    expect(destinationTargets.every((target: any) => target.virtualId?.includes('g2g-'))).toBe(true);
  });

  test('Group to Many triggers append-style execution', async ({ page }) => {
    await page.goto(`/flow-builder?flow=${g2mFlow.id}`);
    const payload = await openRowFilterPreview(page);
    const transformNode = payload?.flow_data?.nodes?.find((node: any) => node?.data?.blockType === 'filter_rows');
    expect(transformNode).toBeTruthy();
    const sourceTargets = transformNode.data?.sourceTargets ?? [];
    const destinationTargets = transformNode.data?.destinationTargets ?? [];
    expect(sourceTargets.length).toBeGreaterThan(destinationTargets.length);
    expect(destinationTargets.length).toBe(g2mDestinations.length);
    expect(destinationTargets.every((target: any) => target.virtualId?.includes('g2m-'))).toBe(true);
  });

  test('Many to Many keeps individual outputs aligned', async ({ page }) => {
    await page.goto(`/flow-builder?flow=${m2mFlow.id}`);
    const payload = await openRowFilterPreview(page);
    const transformNode = payload?.flow_data?.nodes?.find((node: any) => node?.data?.blockType === 'filter_rows');
    expect(transformNode).toBeTruthy();
    const sourceTargets = transformNode.data?.sourceTargets ?? [];
    const destinationTargets = transformNode.data?.destinationTargets ?? [];
    expect(sourceTargets.length).toBe(mockSingleFiles.length);
    expect(destinationTargets.length).toBe(mockSingleFiles.length);
    expect(sourceTargets.every((target: any) => target.batchId === null)).toBe(true);
    expect(destinationTargets.every((target: any) => target.virtualId?.includes('m2m-'))).toBe(true);
  });
});
