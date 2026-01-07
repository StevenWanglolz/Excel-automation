/**
 * Responsible for:
 * - Testing the Save Flow button functionality
 * - Verifying unsaved changes detection works correctly
 * - Testing flow creation, update, and state persistence
 * 
 * Key assumptions:
 * - Frontend dev server is running
 * - Auth is properly set up via beforeEach
 */
import { test, expect } from '@playwright/test';

const API_BASE = 'http://localhost:8000/api';

// Helper to mock common JSON responses
const mockJson = (route: any, json: any) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(json) });

// Test user for mocking
const mockUser = { id: 1, email: 'test@example.com' };

// Mock flows
const existingFlow = {
  id: 1,
  name: 'Existing Flow',
  description: '',
  flow_data: {
    nodes: [
      { id: 'source-0', type: 'source', position: { x: 250, y: 250 }, data: { blockType: 'source', config: {}, label: 'Data' } },
      { id: 'output-0', type: 'output', position: { x: 250, y: 350 }, data: { blockType: 'output', config: {}, label: 'Output' } }
    ],
    edges: []
  },
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z'
};

test.describe('Save Flow Button', () => {
  test.beforeEach(async ({ page }) => {
    // Set auth token in localStorage before page loads
    await page.addInitScript(() => {
      localStorage.setItem('access_token', 'mock-token-123');
    });
    
    // Capture console logs for debugging
    page.on('console', msg => {
      const text = msg.text();
      if (!text.includes('[vite]')) {
        console.log(`BROWSER LOG: ${text}`);
      }
    });
    
    // Mock auth
    await page.route(`${API_BASE}/auth/me`, (route) => mockJson(route, mockUser));
    
    // Mock flows list endpoint - use glob pattern to catch all flow routes
    // The ** pattern matches any path segment
    await page.route(`${API_BASE}/flows/**`, async (route) => {
      const url = route.request().url();
      const method = route.request().method();
      console.log(`MOCK: ${method} ${url}`);
      
      // Handle specific flow ID requests (e.g., /flows/1)
      if (url.match(/\/flows\/\d+$/)) {
        if (method === 'GET') {
          return mockJson(route, existingFlow);
        }
        if (method === 'PUT') {
          const body = route.request().postDataJSON();
          return mockJson(route, {
            ...existingFlow,
            ...body,
            updated_at: new Date().toISOString()
          });
        }
      }
      
      // Fallback
      return mockJson(route, existingFlow);
    });
    
    // Mock flows list/create at base endpoint
    await page.route(`${API_BASE}/flows`, async (route) => {
      const method = route.request().method();
      console.log(`MOCK: ${method} flows list`);
      
      if (method === 'GET') {
        return mockJson(route, [existingFlow]);
      }
      if (method === 'POST') {
        const body = route.request().postDataJSON();
        return mockJson(route, {
          id: 2,
          name: body.name,
          description: body.description || '',
          flow_data: body.flow_data,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      }
    });
    
    // Mock files and batches
    await page.route(`${API_BASE}/files*`, (route) => mockJson(route, []));
  });

  // Helper to get the save button - it's the indigo button with specific text
  const getSaveButton = (page: any) => page.locator('button.bg-indigo-600');

  test('Save button should be disabled for base state (new flow with default name)', async ({ page }) => {
    // Navigate to fresh flow builder
    await page.goto('/flow-builder?new=1');
    
    // Wait for the flow builder to load
    await page.waitForSelector('input[placeholder="Flow name"]');
    
    // The flow name should be Untitled
    const flowNameInput = page.locator('input[placeholder="Flow name"]');
    await expect(flowNameInput).toHaveValue('Untitled');
    
    // The save button should be disabled (no changes from base state)
    const saveButton = getSaveButton(page);
    await expect(saveButton).toBeDisabled();
    
    // Button should show "Save Flow" (not "Saved" or "Update Flow")
    await expect(saveButton).toHaveText('Save Flow');
  });

  test('Save button should be enabled when flow name is changed from Untitled', async ({ page }) => {
    await page.goto('/flow-builder?new=1');
    await page.waitForSelector('input[placeholder="Flow name"]');
    
    const flowNameInput = page.locator('input[placeholder="Flow name"]');
    const saveButton = getSaveButton(page);
    
    // Initially disabled
    await expect(saveButton).toBeDisabled();
    
    // Change the name
    await flowNameInput.fill('My New Flow');
    
    // Now save button should be enabled
    await expect(saveButton).toBeEnabled();
    await expect(saveButton).toHaveText('Save Flow');
  });

  test('Save button should work when clicking it', async ({ page }) => {
    await page.goto('/flow-builder?new=1');
    await page.waitForSelector('input[placeholder="Flow name"]');
    
    const flowNameInput = page.locator('input[placeholder="Flow name"]');
    const saveButton = getSaveButton(page);
    
    // Change the name to enable save
    await flowNameInput.fill('My New Flow');
    await expect(saveButton).toBeEnabled();
    
    // Click save
    await saveButton.click();
    
    // Button should show "Saving..." briefly then go to "Saved" state
    // Wait for the save to complete
    await expect(saveButton).toHaveText('Saved', { timeout: 5000 });
    await expect(saveButton).toBeDisabled();
  });

  test('Save button should enable for existing flow when name is changed', async ({ page }) => {
    // Load an existing flow
    await page.goto(`/flow-builder?flow=${existingFlow.id}`);
    await page.waitForSelector('input[placeholder="Flow name"]');
    
    const flowNameInput = page.locator('input[placeholder="Flow name"]');
    const saveButton = getSaveButton(page);
    
    // Wait for flow to load - should show "Saved" initially
    await expect(flowNameInput).toHaveValue(existingFlow.name, { timeout: 5000 });
    await expect(saveButton).toBeDisabled();
    await expect(saveButton).toHaveText('Saved');
    
    // Change the name
    await flowNameInput.fill('Updated Flow Name');
    
    // Now save button should be enabled with "Update Flow" text
    await expect(saveButton).toBeEnabled();
    await expect(saveButton).toHaveText('Update Flow');
  });

  test('Save button should show correct states through the save lifecycle', async ({ page }) => {
    await page.goto('/flow-builder?new=1');
    await page.waitForSelector('input[placeholder="Flow name"]');
    
    const flowNameInput = page.locator('input[placeholder="Flow name"]');
    const saveButton = getSaveButton(page);
    
    // 1. Initial state: Disabled "Save Flow"
    await expect(saveButton).toBeDisabled();
    await expect(saveButton).toHaveText('Save Flow');
    
    // 2. After making changes: Enabled "Save Flow"
    await flowNameInput.fill('Test Flow');
    await expect(saveButton).toBeEnabled();
    await expect(saveButton).toHaveText('Save Flow');
    
    // 3. After clicking save: Goes to "Saving..." then "Saved"
    await saveButton.click();
    
    // 4. After save completes: Disabled "Saved"
    await expect(saveButton).toHaveText('Saved', { timeout: 5000 });
    await expect(saveButton).toBeDisabled();
    
    // 5. After making more changes: Enabled "Update Flow"
    await flowNameInput.fill('Test Flow Updated');
    await expect(saveButton).toBeEnabled();
    await expect(saveButton).toHaveText('Update Flow');
  });
});
