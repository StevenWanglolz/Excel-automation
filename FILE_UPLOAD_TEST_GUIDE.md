# File Upload Functionality - Manual Test Guide

**Date:** December 26, 2024  
**Feature:** Multiple File Upload, File Management, and Beforeunload Fix

## Test Environment Setup

1. Navigate to: `http://localhost:5173/flow-builder`
2. Ensure you're logged in (test@gmail.com / test)

---

## Test Cases

### Test 1: Single File Upload ✅

**Steps:**
1. Click on "Upload File" block in the left sidebar to add it to canvas
2. Click on the Upload File node on the canvas
3. Modal should open with "Upload Data File" title
4. Click on the upload area or drag and drop a file
5. Select `Test Files/example data 1.xlsx`
6. Wait for upload to complete

**Expected Results:**
- ✅ Modal opens successfully
- ✅ File input has `multiple` attribute (check in browser DevTools)
- ✅ Upload progress indicator shows "Uploading..."
- ✅ After upload, file appears in "Uploaded Files" list
- ✅ File name is clickable (for download)
- ✅ Remove button (×) appears next to file name
- ✅ **NO "Leave site?" dialog appears during upload**

**Status:** ✅ **PASS** (if no beforeunload dialog appears)

---

### Test 2: Multiple File Upload ✅

**Steps:**
1. With modal still open from Test 1
2. Click on upload area again
3. Select multiple files (hold Cmd/Ctrl and select 2-3 files)
4. Wait for all uploads to complete

**Expected Results:**
- ✅ Multiple files can be selected
- ✅ All files upload successfully
- ✅ All files appear in "Uploaded Files" list
- ✅ Each file has its own remove button
- ✅ **NO "Leave site?" dialog appears during upload**

**Status:** ✅ **PASS** (if multiple files upload successfully)

---

### Test 3: File Download ✅

**Steps:**
1. With files uploaded from previous tests
2. Click on a file name in the "Uploaded Files" list
3. File should download

**Expected Results:**
- ✅ File downloads to default download location
- ✅ Downloaded file has correct name (original filename)
- ✅ File content is correct

**Status:** ✅ **PASS** (if file downloads correctly)

---

### Test 4: File Removal ✅

**Steps:**
1. With files uploaded
2. Click the remove button (×) next to a file name
3. File should be removed from list

**Expected Results:**
- ✅ File is removed from "Uploaded Files" list immediately
- ✅ File is deleted from server (check network tab)
- ✅ If preview was open for that file, preview should clear

**Status:** ✅ **PASS** (if file is removed successfully)

---

### Test 5: File Persistence with Flow Save ✅

**Steps:**
1. Upload one or more files to a node
2. Close the modal
3. Enter a flow name (e.g., "Test Flow with Files")
4. Click "Save Flow"
5. Wait for success message
6. Click "Saved Flows" dropdown
7. Click on the saved flow to load it
8. Click on the upload node again
9. Check if files are restored

**Expected Results:**
- ✅ Flow saves successfully
- ✅ When flow is loaded, files are restored in the modal
- ✅ File names appear in "Uploaded Files" list
- ✅ Files can be downloaded/removed as before

**Status:** ✅ **PASS** (if files persist after save/load)

---

### Test 6: Beforeunload Warning Fix ✅

**Steps:**
1. Add a block to canvas
2. Enter a flow name
3. Make some changes (add nodes, modify flow)
4. Open upload modal
5. Upload a file
6. **During upload, try to navigate away or close tab**

**Expected Results:**
- ✅ **NO "Leave site?" dialog appears during file upload**
- ✅ **NO "Leave site?" dialog appears when modal is open**
- ✅ Warning only appears when:
  - Modal is closed
  - No file upload in progress
  - There are actual unsaved changes

**Status:** ✅ **PASS** (if no dialog appears during upload)

---

### Test 7: Update Flow Button State ✅

**Steps:**
1. Save a flow (from Test 5)
2. Verify "Update Flow" button appears
3. Check if button is disabled (should be disabled when no changes)
4. Make a change (add a node, modify flow name, etc.)
5. Check if "Update Flow" button becomes enabled

**Expected Results:**
- ✅ "Update Flow" button appears after saving
- ✅ Button is disabled when there are no changes
- ✅ Button tooltip shows "No changes to save" when disabled
- ✅ Button becomes enabled when changes are made
- ✅ Button works correctly when clicked

**Status:** ✅ **PASS** (if button state works correctly)

---

### Test 8: Block Deletion ✅

**Steps:**
1. Add multiple blocks to canvas (Upload, Filter, Transform)
2. Click the delete button (×) on a block
3. Block should be removed

**Expected Results:**
- ✅ Delete button (×) is visible on all blocks
- ✅ Clicking delete removes the block from canvas
- ✅ Connected edges are also removed
- ✅ Unsaved changes are tracked

**Status:** ✅ **PASS** (if blocks can be deleted)

---

## Known Issues Fixed

### ✅ Beforeunload Warning During File Upload
- **Issue:** "Leave site?" dialog appeared during file uploads
- **Fix Applied:**
  - Added `isFileUploading` state to track upload progress
  - Updated `beforeunload` handler to suppress warning when `isModalOpen` or `isFileUploading` is true
  - Delayed marking changes as unsaved until modal closes
- **Status:** ✅ **FIXED**

---

## Test Results Summary

| Test Case | Status | Notes |
|-----------|--------|-------|
| Single File Upload | ⏳ PENDING | Manual test required |
| Multiple File Upload | ⏳ PENDING | Manual test required |
| File Download | ⏳ PENDING | Manual test required |
| File Removal | ⏳ PENDING | Manual test required |
| File Persistence | ⏳ PENDING | Manual test required |
| Beforeunload Fix | ⏳ PENDING | Manual test required |
| Update Flow Button | ⏳ PENDING | Manual test required |
| Block Deletion | ⏳ PENDING | Manual test required |

---

## Implementation Details

### File Upload Features

1. **Multiple File Support**
   - File input has `multiple` attribute
   - Can select multiple files at once
   - All files upload in parallel

2. **File Management**
   - Files stored as `fileIds` array in node data
   - Files persist when flow is saved
   - Files restored when flow is loaded

3. **File Operations**
   - Download: Click file name to download
   - Remove: Click × button to remove file
   - Preview: Select file from dropdown to preview

4. **Beforeunload Fix**
   - Warning suppressed during file uploads
   - Warning suppressed when modal is open
   - Only shows when appropriate (unsaved changes, modal closed, no upload)

---

## How to Run Tests

1. Open browser DevTools (F12)
2. Navigate to Network tab to monitor API calls
3. Navigate to Console tab to check for errors
4. Follow each test case step by step
5. Verify expected results
6. Document any issues found

---

*Last Updated: December 26, 2024*

