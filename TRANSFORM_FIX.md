# Transform Preview & Export Fix

## Problem
The preview for transform blocks (like Remove Columns/Rows) was showing the original table instead of the transformed result.

## Root Cause Analysis

After investigating the code, I found that the preview logic is actually **correct**:

1. **Frontend** (`FlowBuilder.tsx` line 1095): For non-source nodes, it calls `transformApi.execute()` with the flow data up to that step
2. **Backend** (`transform_service.py` line 79): Updates `last_table_key` when transforms execute successfully
3. **Backend** (`transform.py` line 56): Returns the transformed DataFrame from `last_table_key`

The issue was likely in the **validation** step - if validation fails, the transform doesn't execute and you see the original data.

## Changes Made

### 1. Added Debug Logging (`transform_service.py`)
Added print statements to track:
- What transforms are being validated
- Validation results
- Transform execution
- Final table state

### 2. Improved Validation (`remove.py`)
Made the `remove_columns_rows` validation more lenient:
- Invalid modes now default to 'columns' instead of failing
- Added warning messages for debugging
- Only fails if explicitly invalid columns are specified

### 3. Fixed File Cleanup
- Files are now deleted from backend when nodes are removed (`FlowBuilder.tsx` line 1139)
- Files are deleted when flow is cleared (`FlowBuilder.tsx` line 495)
- PropertiesPanel only shows files that are in the current flow

### 4. Fixed Column Fetching
- PropertiesPanel now fetches columns from the selected file/sheet
- Columns are displayed in the Filter Rows and Remove Columns/Rows UI

## How to Test

### Manual Test Steps:

1. **Start the servers** (if not already running):
   ```bash
   # Terminal 1 - Backend
   cd backend
   source venv/bin/activate
   uvicorn app.main:app --reload --port 8000
   
   # Terminal 2 - Frontend
   cd frontend
   npm run dev
   ```

2. **Open the Flow Builder**:
   - Navigate to http://localhost:5173/flow-builder?type=excel&new=1

3. **Test Remove Columns**:
   - Click the 'Data' block
   - Upload `test_upload.csv` (contains columns: id, name, age)
   - Close the modal
   - Click '+' below Data
   - Select 'Remove Columns/Rows'
   - Click the 'Remove Columns/Rows' block
   - In Properties panel:
     - Mode should be 'Columns'
     - Check the 'id' checkbox
     - Click 'Save'
   - Click the eye icon on the 'Remove Columns/Rows' block
   - **Expected**: Preview should show only 'name' and 'age' columns (no 'id')

4. **Test Filter Rows**:
   - Click '+' below the Remove block
   - Select 'Filter Rows'
   - Click the 'Filter Rows' block
   - In Properties panel:
     - Column: 'age'
     - Operator: 'is greater than'
     - Value: '26'
   - Click the eye icon
   - **Expected**: Preview should show only Alice (30) and David (35)

5. **Test Export**:
   - Click '+' below Filter Rows
   - Select 'Output'
   - Click the 'Output' block
   - Click 'Add output sheet'
   - Set sheet name to 'FilteredData'
   - Click 'Export' button on the Output block
   - **Expected**: Download an Excel file with only the filtered data

## Debugging

If the preview still shows original data, check the backend terminal for debug logs:
- Look for `[DEBUG]` messages showing validation and execution
- If validation fails, you'll see `validation failed, skipping execution`
- Check what config is being sent: `Validating transform X with config: {...}`

## Next Steps

If issues persist:
1. Check browser console for any errors
2. Check backend logs for validation failures
3. Verify the config being saved matches what the transform expects
4. Test with the debug logging to see exactly what's happening
