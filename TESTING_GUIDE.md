# Transform Preview & Export - Testing Guide

## Quick Test (5 minutes)

### Prerequisites
- Backend running on http://localhost:8000
- Frontend running on http://localhost:5173
- File `test_upload.csv` exists with columns: id, name, age

### Test Steps

#### 1. Open Flow Builder
```
URL: http://localhost:5173/flow-builder?type=excel&new=1
```

#### 2. Upload Data
- Click **Data** block
- Upload `test_upload.csv`
- Close modal
- ✓ You should see "1 file(s) uploaded" under the Data block

#### 3. Add Remove Columns Block
- Click **+** button below Data
- Select **Remove Columns/Rows**
- ✓ New block appears in the pipeline

#### 4. Configure Remove Columns
- Click the **Remove Columns/Rows** block (it should highlight)
- In the **Properties Panel** (right side):
  - Mode: **Columns** (should be selected by default)
  - Under "Select Columns (manual)":
    - ✓ You should see checkboxes for: id, name, age
    - Check the **id** checkbox
  - Click **Save** button
  - ✓ "All changes saved" should appear

#### 5. Preview the Transform
- Click the **eye icon** (👁) on the Remove Columns/Rows block
- ✓ Preview modal opens
- **EXPECTED RESULT:**
  - Columns shown: **name, age** (only 2 columns)
  - Rows shown: Alice, Bob, Charlie, David
  - **id column should be MISSING**
- **FAIL IF:**
  - You see 3 columns (id, name, age)
  - This means the transform didn't execute

#### 6. Test Export
- Click **+** below Remove Columns/Rows
- Select **Output**
- Click the **Output** block
- In Properties Panel:
  - Click **Add output sheet**
  - Sheet name: `Result`
  - Source file: (should auto-select)
- Click **Export** button on the Output block
- ✓ Excel file downloads
- Open the file:
  - **EXPECTED:** Only 'name' and 'age' columns
  - **FAIL IF:** 'id' column is present

---

## Debugging

### If Preview Shows Original Data (3 columns)

**Check Backend Logs:**

Look for these debug messages in your backend terminal:

```
[DEBUG] Validating transform remove_columns_rows with config: {'mode': 'columns', 'columnSelection': {'names': ['id']}}
[DEBUG] Validation result: True
[DEBUG] Executing transform remove_columns_rows
[DEBUG] Transform executed. Result shape: (4, 2), columns: ['name', 'age']
[DEBUG] Updated last_table_key to: 1:__default__
[DEBUG] Final last_table_key: 1:__default__
```

**If you see `Validation result: False`:**
- The config is invalid
- Check that column names match exactly (case-sensitive)
- Verify you clicked the "Save" button

**If you don't see any [DEBUG] messages:**
- The transform isn't being executed
- Check browser console for errors
- Verify the block type is `remove_columns_rows`

**Check Browser Console (F12):**

Look for:
- Network errors when calling `/api/transform/execute`
- JavaScript errors
- The request payload should include:
  ```json
  {
    "file_id": 1,
    "file_ids": [1],
    "flow_data": {
      "nodes": [
        {...},
        {
          "data": {
            "blockType": "remove_columns_rows",
            "config": {
              "mode": "columns",
              "columnSelection": {
                "names": ["id"]
              }
            }
          }
        }
      ]
    }
  }
  ```

### Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| Columns not showing in dropdown | File not selected or columns not fetched | Ensure Data block has file uploaded; check target is set |
| Preview shows original data | Validation failed or config not saved | Check backend logs; click Save button |
| "All changes saved" doesn't appear | Config not updating | Check console for errors |
| Export button disabled | Output config missing | Click "Add output sheet" |
| Export has original data | Same as preview issue | Fix preview first, then export will work |

---

## Advanced Test: Filter Rows

After the Remove Columns test works:

1. Click **+** below Remove Columns/Rows
2. Select **Filter Rows**
3. Configure:
   - Column: `age`
   - Operator: `is greater than`
   - Value: `26`
4. Click eye icon
5. **EXPECTED:** Only Alice (30) and David (35)
6. **FAIL IF:** All 4 rows shown

---

## What Should Happen

### Data Flow:
```
Original CSV (id, name, age, 4 rows)
    ↓
Remove Columns (remove 'id')
    ↓
Result (name, age, 4 rows)  ← This is what preview should show
    ↓
Filter Rows (age > 26)
    ↓
Final Result (name, age, 2 rows)  ← Alice & David only
```

### Backend Processing:
1. Frontend calls `/api/transform/execute` with flow_data
2. Backend loads the CSV file
3. Backend validates the remove_columns_rows config
4. Backend executes: `df.drop(columns=['id'])`
5. Backend returns preview of transformed DataFrame
6. Frontend displays the preview

---

## Success Criteria

✅ **Test Passes If:**
- Remove Columns preview shows 2 columns (name, age)
- Filter Rows preview shows 2 rows (Alice, David)
- Export downloads file with transformed data
- Backend logs show successful validation and execution

❌ **Test Fails If:**
- Preview shows original data (3 columns, 4 rows)
- Backend logs show validation failures
- Export contains original data

---

## Next Steps

After testing, please report:

1. **Did the Remove Columns preview work?** (yes/no)
2. **Did the Filter Rows preview work?** (yes/no)
3. **Did the export work?** (yes/no)
4. **Any errors in console or logs?** (paste them)

If any test fails, I'll investigate and fix the specific issue.
