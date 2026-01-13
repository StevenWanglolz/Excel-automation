
import { test, expect } from '@playwright/test';

test.describe('Scoped Destinations and Delete Functionality', () => {
  test.setTimeout(60000);

  test('should scope destination files to creator node and allow deletion', async ({ page }) => {
    // 1. Navigate to Flow Builder
    await page.goto('http://localhost:5173/flow-builder?type=excel');

    // 2. Add Node A (Row Filter)
    await page.getByRole('button', { name: '+' }).click();
    await page.getByText('Row Filter').click();
    // Re-title usage of "Row Filter" might be ambiguous if multiple exist, but first one is fine.
    // The first one is the one we just added? Wait, standard flow starts with Source -> Output.
    // + button adds after selected? By default Source is selected?
    // Let's assume there is now Source -> Row Filter -> Output.
    
    // 3. Open Node A properties
    // Using text "Row Filter" might click on the node in the canvas.
    // Canvas nodes usually have class 'react-flow__node'.
    // Let's be reasonably robust.
    const nodes = page.locator('.react-flow__node');
    // Expect at least 3 nodes now (Source, Output, New Node).
    // The new node should be the last one or explicitly named.
    await page.waitForTimeout(1000);
    const rowFilterNode = page.locator('.react-flow__node').filter({ hasText: 'Row Filter' }).first();
    await rowFilterNode.click();

    // 4. Create File A in Node A
    await page.getByRole('button', { name: 'Add a destination' }).click();
    const fileSelect = page.locator('select').filter({ hasText: 'Select output file' }).last();
    await fileSelect.selectOption('NEW_FILE');
    
    const fileNameA = `Scoped File A ${Date.now()}.xlsx`;
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByPlaceholder('File Name').fill(fileNameA);
    // Add dummy header
    await page.getByRole('button', { name: 'Save File' }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // Verify selected in A
    await expect(fileSelect.locator('option:checked')).toHaveText(fileNameA);
    
    // Verify Delete button exists
    const deleteButton = page.getByTitle('Delete File');
    await expect(deleteButton).toBeVisible();

    // 5. Add Node B (another Row Filter)
    // Click + again.
    // Need to make sure we select the right place. 
    // Let's click the Row Filter node again to ensure it's selected (it is).
    // Actually, let's close panel first to avoid UI overlap issues?
    // Close panel
    await page.getByTitle('Close').click();
    
    await page.getByRole('button', { name: '+' }).click();
    // Click Row Filter again
    await page.getByText('Row Filter').nth(0).click(); 
    // Now we have two Row Filter nodes.

    // 6. Open Node B properties
    // It should be the new one.
    const rowFilterNodeB = page.locator('.react-flow__node').filter({ hasText: 'Row Filter' }).last();
    // Ensure we are clicking the generic label if needed, or just the node.
    await rowFilterNodeB.click();
    
    // 7. Check dropdown in B
    await page.getByRole('button', { name: 'Add a destination' }).click();
    const fileSelectB = page.locator('select').filter({ hasText: 'Select output file' }).last();
    
    // Verify File A is NOT present
    const options = await fileSelectB.locator('option').allTextContents();
    const isFileAPresent = options.some(opt => opt.includes(fileNameA));
    expect(isFileAPresent).toBe(false);

    // 8. Go back to Node A to Delete
    await page.getByTitle('Close').click();
    await rowFilterNode.click();
    
    // 9. Delete File A
    await page.getByTitle('Delete File').click();
    
    // 10. Verify Removed from Dropdown
    // The select should likely reset to "Select output file" or empty
    await expect(fileSelect.locator('option:checked')).not.toHaveText(fileNameA);
    
    // Verify it's gone from options entirely
    const optionsAfterDelete = await fileSelect.locator('option').allTextContents();
    const isFileAGone = !optionsAfterDelete.some(opt => opt.includes(fileNameA));
    expect(isFileAGone).toBe(true);
  });
});
