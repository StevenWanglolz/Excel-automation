
import { test, expect } from '@playwright/test';

test.describe('Excel Template Editor Integration', () => {
  test.setTimeout(60000); // Increase timeout to 60s
  test('should create, update destination, and allow editing of virtual file', async ({ page }) => {
    // 1. Navigate to Flow Builder
    // 1. Navigate to Flow Builder
    await page.goto('/flow-builder?type=excel');

    // 2. Add Row Filter Node
    await page.getByRole('button', { name: 'Add step after this' }).click();
    await page.getByText('Row Filter').click();
    
    // 3. Open Properties
    await page.getByText('Row Filter').click();
    
    // 4. Add Destination
    await page.getByRole('button', { name: 'Add a destination' }).click();
    
    // 5. Select "Create new file" from the dropdown
    // We need to find the specific select for the new destination (likely the last one)
    // Assuming it's the first one created
    const fileSelect = page.locator('select').filter({ hasText: 'Select output file' }).last();
    await fileSelect.selectOption('NEW_FILE');
    
    // 6. Verify Editor Opens
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByText('Create Destination File')).toBeVisible();
    
    // 7. Save File with unique name
    const fileName = `Test File ${Date.now()}.xlsx`;
    await page.getByPlaceholder('File Name').fill(fileName);
    await page.getByRole('button', { name: 'Save File' }).click();
    
    // 8. Verify Editor Closes and Destination is Updated
    await expect(page.getByRole('dialog')).not.toBeVisible();
    // The select should now have the file selected. 
    // Since the select value is the ID, we check the text content of the selected option or the select trigger.
    // However, basic HTML selects show the text of the selected option.
    await expect(fileSelect).toHaveValue(/^[0-9a-f-]+$/); // Expect a UUID-like value
    // Or check if the dropdown text contains the filename
    // Actually, `toHaveValue` checks value. Let's check `locator('option:checked')`.
    await expect(fileSelect.locator('option:checked')).toHaveText(fileName);
    
    // 9. Verify Edit Button Appears
    const editButton = page.getByTitle('Edit Template');
    await expect(editButton).toBeVisible();
    
    // 10. Click Edit and Verify Editor Reopens with Data
    await editButton.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.locator(`input[value="${fileName}"]`)).toBeVisible();
    
    // 11. Change Name and Save Again
    const newFileName = fileName + " Updated";
    await page.getByPlaceholder('File Name').fill(newFileName);
    await page.getByRole('button', { name: 'Save File' }).click();
    
    // 12. Verify Update
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(fileSelect.locator('option:checked')).toHaveText(newFileName);
    
    // 13. Verify NO new destination was added (still only 1 destination)
    const destinationCards = page.locator('text=/Destination \\d+/'); 
    await expect(destinationCards).toHaveCount(1);
  });
});
