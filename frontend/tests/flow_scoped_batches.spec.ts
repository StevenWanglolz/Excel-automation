import { test, expect, type Route } from '@playwright/test';

const API_BASE = 'http://localhost:8000/api';
const mockUser = { id: '123', email: 'test@example.com', full_name: 'Test User', is_active: true };

const flow1 = {
  id: 101,
  name: 'Flow One',
  description: '',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  user_id: '123',
  flow_data: { nodes: [], edges: [] },
};

const flow2 = {
  id: 102,
  name: 'Flow Two',
  description: '',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  user_id: '123',
  flow_data: { nodes: [], edges: [] },
};

const batchFlow1 = { id: 10, name: 'Batch Flow 1', file_count: 1, created_at: new Date().toISOString(), flow_id: 101 };
const batchFlow2 = { id: 20, name: 'Batch Flow 2', file_count: 1, created_at: new Date().toISOString(), flow_id: 102 };

const mockJson = async (route: Route, json: any, status = 200) => {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(json) });
};

test.describe('Flow Scoped Batches', () => {
  test.beforeEach(async ({ page }) => {
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.addInitScript(() => localStorage.setItem('access_token', 'mock-token'));

    await page.route(`${API_BASE}/auth/me`, (route) => mockJson(route, mockUser));
    await page.route(`${API_BASE}/flows`, (route) => mockJson(route, [flow1, flow2]));
    await page.route(`${API_BASE}/flows/${flow1.id}`, (route) => mockJson(route, flow1));
    await page.route(`${API_BASE}/flows/${flow2.id}`, (route) => mockJson(route, flow2));
    
    // Mock batches endpoint to check for flow_id param
    await page.route(`${API_BASE}/files/batches*`, async (route) => {
      const url = new URL(route.request().url());
      const flowId = url.searchParams.get('flow_id');
      
      try {
        if (flowId === String(flow1.id)) {
          await mockJson(route, [batchFlow1]);
        } else if (flowId === String(flow2.id)) {
          await mockJson(route, [batchFlow2]);
        } else {
          await mockJson(route, []);
        }
      } catch (e) {
        console.log('ROUTE HANDLER ERROR:', e);
        route.abort(); // or fulfill with 500 explicitly
      }
    });

    await page.route(`${API_BASE}/files`, (route) => mockJson(route, []));
    
  });

  test('Should load batches specific to Flow 1', async ({ page }) => {
    // We need a source node to trigger the batches fetch when opening the modal
    const flowWithNode1 = {
      ...flow1,
      flow_data: {
        nodes: [{
          id: 'source-1',
          type: 'source',
          data: { blockType: 'source', fileIds: [999] }
        }],
        edges: []
      }
    };
    
    // 1. Navigate to Flow 1
    await page.route(`${API_BASE}/flows/${flow1.id}`, (route) => mockJson(route, flowWithNode1));
    await page.route(`${API_BASE}/files`, (route) => mockJson(route, [{id: 999, original_filename: 'test.xlsx'}]));

    await page.goto(`/flow-builder?flow=${flow1.id}`);
    
    // Use a more direct CSS selector
    const flowNameInput = page.locator('input[placeholder="Flow name"]');
    // Wait until the input value is actually populated with the flow name
    await expect(flowNameInput).toHaveValue('Flow One', { timeout: 20000 });

    // 2. Open Data Upload Modal
    await page.click('button:has-text("Upload")');
    
    // 3. Wait for batches request and verify UI
    // Options in a closed select are considered hidden by Playwright, so we wait for attached
    await page.waitForSelector('option:has-text("Batch Flow 1")', { state: 'attached', timeout: 10000 });
    await expect(page.locator('option:has-text("Batch Flow 1")')).toBeAttached();
    await expect(page.locator('option:has-text("Batch Flow 2")')).not.toBeAttached();
    
    // Close modal before navigating
    // Use a more specific selector to avoid ambiguity with the Properties panel Close button
    await page.getByRole('heading', { name: 'Upload Data' }).locator('..').getByRole('button', { name: 'Close' }).click();
    await page.waitForSelector('text=Upload Data', { state: 'hidden' });
    
    // 4. Now navigate to Flow 2 and verify
    const flowWithNode2 = {
      ...flow2,
      flow_data: {
        nodes: [{
          id: 'source-2',
          type: 'source',
          data: { blockType: 'source', fileIds: [1000] }
        }],
        edges: []
      }
    };
    await page.route(`${API_BASE}/flows/${flow2.id}`, (route) => mockJson(route, flowWithNode2));
    await page.route(`${API_BASE}/files`, (route) => mockJson(route, [{id: 1000, original_filename: 'test2.xlsx'}]));

    await page.goto(`/flow-builder?flow=${flow2.id}`);
    
    // IMPORTANT: Wait for navigation to complete by checking flow name
    await expect(flowNameInput).toHaveValue('Flow Two', { timeout: 20000 });
    
    await page.click('button:has-text("Upload")');
    await page.waitForSelector('option:has-text("Batch Flow 2")', { state: 'attached', timeout: 10000 });
    await expect(page.locator('option:has-text("Batch Flow 2")')).toBeAttached();
    await expect(page.locator('option:has-text("Batch Flow 1")')).not.toBeAttached();
  });
  
  test('Should request batches with correct flow_id', async ({ page }) => {
    const listBatchesRequestPromise = page.waitForRequest(req => 
      req.url().includes('/files/batches') && req.url().includes(`flow_id=${flow1.id}`)
    );

    const flowWithNode = {
      ...flow1,
      flow_data: {
        nodes: [{
          id: 'source-1',
          type: 'source',
          data: { blockType: 'source', fileIds: [999] }
        }],
        edges: []
      }
    };
    
    await page.route(`${API_BASE}/flows/${flow1.id}`, (route) => mockJson(route, flowWithNode));
    await page.route(`${API_BASE}/files`, (route) => mockJson(route, [{id: 999, original_filename: 'test.xlsx'}]));

    await page.goto(`/flow-builder?flow=${flow1.id}`);
    
    // Opening the modal triggers listBatches
    await page.click('button:has-text("Upload")');
    
    const request = await listBatchesRequestPromise;
    const url = new URL(request.url());
    expect(url.searchParams.get('flow_id')).toBe(String(flow1.id));
  });
});
