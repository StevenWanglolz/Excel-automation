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
    await page.goto(`/flow-builder?flow=${flow1.id}`);
    
    // Open Data Upload Modal (need to locate a way to open it, usually clicking a node or add button)
    // Assuming we can trigger listBatches via PropertiesPanel or similar.
    // FlowBuilder calls listBatches on mount/update of nodes, so we should verify the request was made.
    
    // Actually, FlowBuilder calls listBatches automatically if there are fileIds.
    // If no nodes, maybe not?
    // Let's add a dummy node to flow1 so it triggers file collection and listing.
    
    // Wait, FlowBuilder calls `filesApi.listBatches(selectedFlowId)` in useEffect if fileIds > 0 OR just always?
    // Let's check FlowBuilder.tsx:
    // useEffect at line 1787: if (fileIds.length === 0) return;
    // So we need at least one node with files or we need to open the modal.
    
    // Let's open the Data Upload Modal. 
    // We first need to add a node to be able to click "Upload".
    // Or we can rely on `PropertiesPanel` loading if we select a node.
  });
  
  test('Should request batches with correct flow_id', async ({ page }) => {
    const listBatchesRequestPromise = page.waitForRequest(req => 
      req.url().includes('/files/batches') && req.url().includes(`flow_id=${flow1.id}`)
    );

    // We need to trigger the fetch.
    // Adding a source node with a file should trigger `listBatches`.
    // Let's mock the flow to have a source node.
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
    await page.route(`${API_BASE}/files`, (route) => mockJson(route, [{id: 999, filename: 'test.xlsx'}]));

    await page.goto(`/flow-builder?flow=${flow1.id}`);
    
    await listBatchesRequestPromise;
  });
});
