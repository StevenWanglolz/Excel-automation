# Quick Test - Transform Preview & Export

## 🚀 Quick Start (2 minutes)

1. **Open:** http://localhost:5173/flow-builder?type=excel&new=1

2. **Upload:** Click Data → Upload `test_upload.csv` → Close

3. **Add Block:** Click + → Select "Remove Columns/Rows"

4. **Configure:**
   - Click the Remove Columns/Rows block
   - Check the "id" checkbox
   - Click "Save"

5. **Preview:** Click eye icon 👁

6. **✅ PASS:** Preview shows 2 columns (name, age)
   **❌ FAIL:** Preview shows 3 columns (id, name, age)

---

## 🐛 If Test Fails

**Check backend terminal for:**
```
[DEBUG] Validation result: True
[DEBUG] Executing transform remove_columns_rows
[DEBUG] Transform executed. Result shape: (4, 2), columns: ['name', 'age']
```

**If you see `Validation result: False`:**
- Column names don't match (check spelling/case)
- Forgot to click "Save" button

**If you don't see [DEBUG] messages:**
- Transform not executing
- Check browser console (F12) for errors

---

## 📋 What Should Happen

| Step | Expected | Actual |
|------|----------|--------|
| Upload CSV | "1 file(s) uploaded" | ? |
| Configure | Checkboxes for id, name, age | ? |
| Save | "All changes saved" | ? |
| Preview | 2 columns (name, age) | ? |
| Export | Excel with 2 columns | ? |

---

## 📚 Full Documentation

- **TESTING_GUIDE.md** - Detailed testing steps
- **IMPLEMENTATION_SUMMARY.md** - What was changed
- **TRANSFORM_FIX.md** - Technical details

---

## ✉️ Report Results

After testing, tell me:
1. Did preview show 2 columns? (yes/no)
2. Any errors in console/logs? (paste them)

I'll fix any issues immediately! 🔧
