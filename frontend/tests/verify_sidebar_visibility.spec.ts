
import { test, expect } from '@playwright/test';

test.describe('Flow Builder Sidebar', () => {
  test('should always display the Flow Summary sidebar', async ({ page }) => {
    // Navigate to Flow Builder
    // Navigate to Flow Builder
    await page.goto('/flow-builder?type=excel');

    // Verify sidebar exists and is visible
    const sidebar = page.locator('text=Flow Overview');
    await expect(sidebar).toBeVisible();

    // Verify it shows the "No sources" placeholder initially
    const placeholder = page.locator('text=No sources or outputs configured yet.');
    await expect(placeholder).toBeVisible();

    // Verify collapse/expand functionality
    const toggleButton = page.getByRole('button', { name: /Flow Overview/i });
    
    // Collapse
    await toggleButton.click();
    await expect(placeholder).not.toBeVisible();
    await expect(page.locator('text=Flow Overview')).not.toBeVisible(); // text is hidden when collapsed
    
    // Expand
    const collapsedSidebar = page.getByTestId('sidebar-toggle');
    await collapsedSidebar.click();
    
    await expect(placeholder).toBeVisible();
    await expect(page.locator('text=Flow Overview')).toBeVisible();
  });
});
