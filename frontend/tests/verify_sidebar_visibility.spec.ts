
import { test, expect } from '@playwright/test';

test.describe('Flow Builder Sidebar', () => {
  test('should always display the Flow Summary sidebar', async ({ page }) => {
    // Navigate to Flow Builder
    await page.goto('http://localhost:5173/flow-builder?type=excel');

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
    // The toggle button is the header div, when collapsed it shows an icon but it is still the same click handler.
    // However, the text "Flow Overview" might be gone, so we need to find the clickable element again.
    // The clickable div has class "cursor-pointer".
    const collapsedSidebar = page.locator('.cursor-pointer').first();
    await collapsedSidebar.click();
    
    await expect(placeholder).toBeVisible();
    await expect(page.locator('text=Flow Overview')).toBeVisible();
  });
});
