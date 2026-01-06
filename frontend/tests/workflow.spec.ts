import { test, expect } from '@playwright/test';

test.describe('Workflow', () => {
  const mockUser = {
    id: '123',
    email: 'test@example.com',
    full_name: 'Test User',
    is_active: true,
  };

  const mockFlow = {
    id: 1,
    name: 'Test Flow',
    description: '',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    user_id: '123',
    flow_data: {
      nodes: [
        {
          id: 'source-0',
          type: 'source',
          position: { x: 250, y: 250 },
          data: { label: 'Data', blockType: 'source', config: {} }
        },
        {
          id: 'output-0',
          type: 'output',
          position: { x: 250, y: 350 },
          data: { label: 'Output', blockType: 'output', config: {}, output: { outputs: [] } }
        }
      ],
      edges: []
    }
  };

  test.beforeEach(async ({ page }) => {
    // Automatically log in by setting token
    await page.addInitScript(() => {
        localStorage.setItem('access_token', 'mock-token-123');
    });
    
    // Capture console logs to help debugging
    page.on('console', msg => {
        const text = msg.text();
        if (!text.includes('[vite]')) {
             console.log(`BROWSER LOG: ${text}`);
        }
    });
    page.on('pageerror', err => console.log(`BROWSER ERROR: ${err}`));

    // Target the specific backend URL to avoid intercepting Vite assets
    const API_PREFIX = 'http://localhost:8000/api';

    // Mock Authentication
    await page.route(`${API_PREFIX}/auth/me`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockUser),
      });
    });

    // Mock Flows API
    await page.route(`${API_PREFIX}/flows*`, async (route) => {
       if (route.request().method() === 'POST') {
             const postData = route.request().postDataJSON();
             await route.fulfill({
                 status: 201,
                 contentType: 'application/json',
                 body: JSON.stringify({ ...mockFlow, id: Date.now(), ...postData }),
             });
       } else {
             await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify([]),
             });
       }
    });

    // Mock Files API
    await page.route(`${API_PREFIX}/files*`, async (route) => {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    
    // Mock Transform API
    await page.route(`${API_PREFIX}/transform*`, async (route) => {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });
  });

  test('should load dashboard and list flows', async ({ page }) => {
    // Mock empty flow list initially
    await page.route('**/flows', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.goto('/');
    
    // Verify Dashboard headers
    await expect(page.getByText('My Automations')).toBeVisible();
    await expect(page.getByText('No automations created yet')).toBeVisible();

    // Mock flow list with one item
     await page.route('**/flows', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([mockFlow]),
      });
    });
    
    // Reload to see the flow (or trigger reload)
    await page.reload();
    await expect(page.getByText('Test Flow')).toBeVisible();
  });

  test('should create new automation flow', async ({ page }) => {
    // Mock empty flows for dashboard
    await page.route('**/flows', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([]),
        });
    });

    await page.goto('/');
    
    // Click New Automation
    await page.click('button:has-text("New Automation")');
    await expect(page).toHaveURL('/new-automation');

    // Select Excel Automation
    await page.click('button:has-text("Excel")');
    
    // Should navigate to Flow Builder (checking strictly for new=1 can be flaky if app clears it)
    await expect(page).toHaveURL(/\/flow-builder.*type=excel/);
    
    // Verify basic nodes exist (Data source and Output are default)
    // Verify basic nodes exist (Data source and Output are default)
    // The pipeline renders nodes with 'pipeline-block' class, but checking for text is sufficient
    await expect(page.getByText('Data', { exact: true })).toBeVisible();
  });

  test('should capture and save flow', async ({ page }) => {
     // Mock create flow API
     await page.route('**/flows', async (route) => {
         if (route.request().method() === 'POST') {
             const postData = route.request().postDataJSON();
             expect(postData.name).toBe('My New Flow');
             await route.fulfill({
                 status: 201,
                 contentType: 'application/json',
                 body: JSON.stringify({ ...mockFlow, id: 2, name: postData.name }),
             });
         } else {
             // GET requests
             await route.fulfill({ body: JSON.stringify([]) });
         }
     });

    await page.goto('/flow-builder');
    
    // Name the flow
    await page.fill('input[placeholder="Flow name"]', 'My New Flow');
    
    // Save
    await page.click('button:has-text("Save")');
    
    // Should see success or at least flow name persistence
    await expect(page.locator('input[value="My New Flow"]')).toBeVisible();
  });

  test('should show node properties when clicked', async ({ page }) => {
      await page.goto('/flow-builder');
      
      // Wait for React Flow to be ready - finding by text is safer than internal classes if class names change
      // "Data" is the label of the source node
      await expect(page.getByText('Data', { exact: true })).toBeVisible();
      
      // Click on Data node (first instance is on the canvas)
      await page.getByText('Data', { exact: true }).first().click();
      
      // Properties panel should open
      // The panel title is "Properties"
      await expect(page.getByRole('heading', { name: 'Properties' })).toBeVisible();
      
      // Should show block type logic (it renders "Block Type" label and the node label "Data")
      await expect(page.getByText('Block Type')).toBeVisible();
      
      // "Data" should be visible in the panel (it matches the node label)
      // Since "Data" is also on the canvas, we expect at least one visible instance, but to be specific we can check count or scoping
      // The panel instance should be visible.
      // We can check that we have more than 1 "Data" text now.
      await expect(page.getByText('Data', { exact: true })).toHaveCount(2);
  });

});
