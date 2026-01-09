import { test, expect } from '@playwright/test';

// Inline mock data representing a flow with a batch source
const initialFlowData = {
  id: 1,
  user_id: 123,
  name: 'Batch Flow Test',
  description: '',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  flow_data: {
    nodes: [
      {
        id: 'source-0',
        type: 'source',
        position: { x: 100, y: 100 },
        data: {
          label: 'Data',
          blockType: 'source',
          config: {},
          // Pre-configured with a batch
          target: { fileId: null, sheetName: null, batchId: 999, fileIds: [101, 102] },
        }
      },
      {
        id: 'output-0',
        type: 'output',
        position: { x: 100, y: 300 },
        data: {
          label: 'Output',
          blockType: 'output',
          config: {},
          output: { outputs: [] }
        }
      }
    ],
    edges: [
        { id: 'e1', source: 'source-0', target: 'output-0' }
    ]
  }
};

test.describe('G2G (Group-to-Group) Batch Flow', () => {
  // API Base URL
  const API_BASE = 'http://localhost:8000/api';

  test.beforeEach(async ({ page }) => {
    // 1. Mock Login
    await page.addInitScript(() => localStorage.setItem('access_token', 'mock-token'));

    // 2. Mock User
    await page.route(`${API_BASE}/users/me`, async (route) => {
        await route.fulfill({ json: { id: 123, email: 'test@example.com' } });
    });
    await page.route(`${API_BASE}/auth/me`, async (route) => {
        await route.fulfill({ json: { id: 123, email: 'test@example.com' } });
    });

    // 3. Mock Flow API - Specific flow endpoint first
    await page.route(new RegExp(`${API_BASE.replace(/\//g, '\\/')}\\/flows\\/\\d+$`), async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ json: initialFlowData });
      } else if (route.request().method() === 'PUT') {
        let body = {};
        try {
          body = route.request().postDataJSON() || {};
        } catch (e) {
            console.warn('Failed to parse JSON body', e);
        }
        await route.fulfill({ json: { ...body, id: 1 } });
      } else {
        await route.continue();
      }
    });
    
    // Mock Flow list endpoint
    await page.route(`${API_BASE}/flows`, async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ json: [ initialFlowData ] });
      } else {
        await route.continue();
      }
    });

    // 4. Mock Files and Batches
    await page.route(`${API_BASE}/files`, async (route) => {
       await route.fulfill({ json: [
            { id: 101, filename: 'batch_file_1.xlsx', original_filename: 'batch_file_1.xlsx', batch_id: 999 },
            { id: 102, filename: 'batch_file_2.xlsx', original_filename: 'batch_file_2.xlsx', batch_id: 999 }
       ] });
    });

    await page.route(`${API_BASE}/files/batches*`, async (route) => {
        await route.fulfill({ json: [
            { id: 999, name: 'Test Batch', file_count: 2 }
        ] });
    });
    
    // Mock Get File
    await page.route(`${API_BASE}/files/*`, async (route) => {
         const url = route.request().url();
         if (url.includes('/batches') || url.includes('/preview') || url.includes('/sheets')) {
            return route.continue();
         }
         await route.fulfill({ json: { id: 101, filename: 'batch_file_1.xlsx', original_filename: 'batch_file_1.xlsx', batch_id: 999 } });
    });

    // Mock Preview
    await page.route(`${API_BASE}/files/*/preview*`, async (route) => {
        await route.fulfill({ json: { columns: ['A'], row_count: 10, preview_rows: [] } });
    });

    // Mock Sheets Endpoint
    await page.route(`${API_BASE}/files/*/sheets`, async (route) => {
        await route.fulfill({ json: ['Sheet1'] });
    });

    // Mock Precompute (optional, avoids 404s)
    await page.route(`${API_BASE}/transform/precompute`, async (route) => {
        await route.fulfill({ json: { success: true } });
    });

    // Log all requests for debugging
    page.on('request', request => console.log('>>', request.method(), request.url()));
    page.on('response', response => console.log('<<', response.status(), response.url()));

    // Navigate to Flow with the pre-configured flow loaded
    await page.goto('/flow-builder?flow=1');
  });

  test('should detect batch mode and show template configuration in output', async ({ page }) => {
    // Wait for the flow to load - source node should show "Batch" badge
    const sourceNode = page.locator('.pipeline-block').filter({ hasText: 'Data' });
    await expect(sourceNode).toBeVisible({ timeout: 10000 });

    // 1. Verify Batch Indicator on Source Node (pre-configured)
    await expect(sourceNode.getByText('Batch', { exact: true })).toBeVisible({ timeout: 5000 });

    // 2. Select Output Block
    const outputNode = page.locator('.pipeline-block').filter({ hasText: 'Output' });
    await expect(outputNode).toBeVisible();
    await outputNode.click();
    
    // 3. Verify Batch Output UI
    await expect(page.getByText('Batch Output Mode')).toBeVisible({ timeout: 5000 });
    
    // 4. Output Pattern
    const patternInput = page.getByTestId('batch-naming-pattern-input');
    await expect(patternInput).toBeVisible();
    await expect(patternInput).toHaveValue('{original_name}_processed.xlsx');
    
    // 5. Test Pattern Update
    await patternInput.fill('prefix_{original_name}.xlsx');
    await expect(patternInput).toHaveValue('prefix_{original_name}.xlsx');
    
    // 6. Verify Generated Files Preview section
    await expect(page.getByText('Generated Files Preview (2 files)')).toBeVisible();
    // Check that generated file names reflect the pattern
    await expect(page.getByTestId('generated-file-0')).toContainText('prefix_batch_file_1.xlsx');
    await expect(page.getByTestId('generated-file-1')).toContainText('prefix_batch_file_2.xlsx');
    
    // 7. Template Sheet
    await expect(page.getByText('Output Sheets (Template)')).toBeVisible();
    await page.getByRole('button', { name: '+ Add Sheet' }).click();
    // Verify a sheet name placeholder appears after adding
    await expect(page.getByPlaceholder('Sheet name')).toBeVisible();
  });
});

