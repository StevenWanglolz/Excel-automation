import { test, expect } from '@playwright/test';

// Define the flow data needed for our tests
const singleFileFlow = {
  id: 1,
  user_id: 123,
  name: 'Single File Flow',
  description: '',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  flow_data: {
    nodes: [
      {
        id: 'source-single',
        type: 'source',
        position: { x: 100, y: 100 },
        data: {
          label: 'Single File',
          blockType: 'source',
          config: {},
          target: { fileId: 101, sheetName: null, batchId: null }
        }
      },
      {
        id: 'output-single',
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
        { id: 'e1', source: 'source-single', target: 'output-single' }
    ]
  }
};

const batchFlow = {
  id: 2,
  user_id: 123,
  name: 'Batch Flow Test',
  description: '',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  flow_data: {
    nodes: [
      {
        id: 'source-batch',
        type: 'source',
        position: { x: 100, y: 100 },
        data: {
          label: 'Batch Data',
          blockType: 'source',
          config: {},
          // Batch configuration
          target: { fileId: null, sheetName: null, batchId: 999, fileIds: [102, 103] },
        }
      },
      {
        id: 'output-batch',
        type: 'output',
        position: { x: 100, y: 300 },
        data: {
          label: 'Batch Output',
          blockType: 'output',
          config: {},
          output: { outputs: [] }
        }
      }
    ],
    edges: [
        { id: 'e2', source: 'source-batch', target: 'output-batch' }
    ]
  }
};

test.describe('Flow Builder Scenarios', () => {
  // API Base URL - matching what the frontend actually hits
  // The frontend seems to be using 127.0.0.1:8000 based on error logs
  const API_BASE_PATTERN = /http:\/\/(localhost|127\.0\.0\.1):8000\/api/;

  test.beforeEach(async ({ page }) => {
    // 1. Mock Login & User
    await page.addInitScript(() => localStorage.setItem('access_token', 'mock-token'));
    await page.route(new RegExp(`${API_BASE_PATTERN.source}/users/me`), async (route) => route.fulfill({ json: { id: 123, email: 'test@example.com' } }));
    await page.route(new RegExp(`${API_BASE_PATTERN.source}/auth/me`), async (route) => route.fulfill({ json: { id: 123, email: 'test@example.com' } }));

    // 2. Mock Global Files & Batches
    await page.route(new RegExp(`${API_BASE_PATTERN.source}/files$`), async (route) => {
       await route.fulfill({ json: [
            { id: 101, filename: 'single_file.xlsx', original_filename: 'single_file.xlsx', batch_id: null },
            { id: 102, filename: 'batch_1.xlsx', original_filename: 'batch_1.xlsx', batch_id: 999 },
            { id: 103, filename: 'batch_2.xlsx', original_filename: 'batch_2.xlsx', batch_id: 999 }
       ] });
    });
    await page.route(new RegExp(`${API_BASE_PATTERN.source}/files/batches.*`), async (route) => {
        await route.fulfill({ json: [
            { id: 999, name: 'Test Batch', file_count: 2 }
        ] });
    });

    // 3. Mock Flow Endpoints
    await page.route(new RegExp(`${API_BASE_PATTERN.source}/flows/1$`), async (route) => {
        if (route.request().method() === 'GET') await route.fulfill({ json: singleFileFlow });
        else await route.fulfill({ json: { ...singleFileFlow, ...route.request().postDataJSON() } });
    });
    await page.route(new RegExp(`${API_BASE_PATTERN.source}/flows/2$`), async (route) => {
        if (route.request().method() === 'GET') await route.fulfill({ json: batchFlow });
        else await route.fulfill({ json: { ...batchFlow, ...route.request().postDataJSON() } });
    });
    
    // Mock Sheets & Previews
    await page.route(new RegExp(`${API_BASE_PATTERN.source}/files/.*/sheets`), async (route) => route.fulfill({ json: ['Sheet1'] }));
    await page.route(new RegExp(`${API_BASE_PATTERN.source}/files/.*/preview.*`), async (route) => route.fulfill({ json: { columns: ['A'], row_count: 10, preview_rows: [] } }));

    page.on('console', msg => console.log(msg.text()));
  });

  test('Scenario 1: Single File -> Single File', async ({ page }) => {
    await page.goto('/flow-builder?flow=1');
    
    const outputNode = page.locator('.pipeline-block').filter({ hasText: 'Output' });
    await expect(outputNode).toBeVisible();
    await outputNode.click();
    
    // Check for Output Configuration header (proves we are in output node)
    await expect(page.getByText('Output Configuration')).toBeVisible();

    // Verify default output name
    // Note: Single File UI elements might need time to hydrate from mock store
    const nameInput = page.getByPlaceholder('output.xlsx');
    await expect(nameInput).toBeVisible();
    
    // Check we don't see batch stuff
    await expect(page.getByText('Batch Output Mode')).not.toBeVisible();
  });

  test('Scenario 2: Batch -> Batch (G2G)', async ({ page }) => {
    await page.goto('/flow-builder?flow=2');
    
    const outputNode = page.locator('.pipeline-block').filter({ hasText: 'Batch Output' });
    await expect(outputNode).toBeVisible();
    await outputNode.click();
    
    // Check we are in Batch Output Mode
    await expect(page.getByText('Batch Output Mode')).toBeVisible();
    
    // Verify separate mode is selected by default (or we select it)
    await expect(page.getByText('Separate files')).toBeVisible();
    
    // Check Naming Pattern input
    const patternInput = page.getByTestId('batch-naming-pattern-input');
    await expect(patternInput).toBeVisible();
    await expect(patternInput).toHaveValue('{original_name}_processed.xlsx');
    
    // Check Preview
    await expect(page.getByText('Generated Files Preview')).toBeVisible();
    await expect(page.getByText('batch_1_processed.xlsx')).toBeVisible();
    await expect(page.getByText('batch_2_processed.xlsx')).toBeVisible();
  });

  test('Scenario 3: Batch -> Single (G2M)', async ({ page }) => {
    await page.goto('/flow-builder?flow=2');
    
    const outputNode = page.locator('.pipeline-block').filter({ hasText: 'Batch Output' });
    await expect(outputNode).toBeVisible();
    await outputNode.click();
    
    // Check we are in Batch Output Mode
    await expect(page.getByText('Batch Output Mode')).toBeVisible();
    
    // Switch to Merge Mode
    await page.locator('input[value="merge"]').click({force: true});
    
    // Verify UI changes
    await expect(page.getByText('Batch Merge Mode')).toBeVisible();
    await expect(page.getByText('Batch Output Mode')).not.toBeVisible(); // Replaced title
    
    // Verify Naming Pattern is GONE
    await expect(page.getByTestId('batch-naming-pattern-input')).not.toBeVisible();
    
    // Verify Generated Preview is GONE
    await expect(page.getByText('Generated Files Preview')).not.toBeVisible();
    
    // Verify Merged Filename Input is PRESENT
    const mergedInput = page.getByTestId('merged-filename-input');
    await expect(mergedInput).toBeVisible();
    await expect(mergedInput).toHaveValue('Merged Output.xlsx');
    
    // Test update
    await mergedInput.fill('Final_Report.xlsx');
    await expect(mergedInput).toHaveValue('Final_Report.xlsx');
  });

});
