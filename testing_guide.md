# SheetPilot Input/Output Testing Guide

This guide details step-by-step instructions for testing core input/output features of the SheetPilot application.

## Prerequisites

1.  **Backend Running**: Ensure the backend server is running on `http://localhost:8000`.
2.  **Frontend Running**: Ensure the frontend server is running on `http://localhost:5173`.
3.  **Test Credentials**:
    *   **Email**: `test@gmail.com`
    *   **Password**: `test`
4.  **Test Files**: Have access to `Test Files/example data 1.xlsx`.

---

## 1. Authentication Check

**Goal**: Verify user can log in and access the dashboard.

1.  Navigate to `http://localhost:5173`.
2.  **Login Screen**:
    *   Enter Email: `test@gmail.com`
    *   Enter Password: `test`
    *   Click **Sign In**.
3.  **Verification**:
    *   Confirm you are redirected to the **Dashboard**.
    *   Check for the "My Automations" or "New Automation" view.

---

## 2. File Upload (Input)

**Goal**: Verify file upload mechanisms (Single File & Grouping).

1.  On the Dashboard, click **+ New Automation**.
2.  Select **Excel** flow type.
3.  In the Flow Builder, locate the **Data** node (initial node).
4.  Click **Upload** or **Manage Files**.
5.  **New Group Upload**:
    *   In the modal, click "Upload details" or simply drag/drop a file.
    *   Select `example data 1.xlsx`.
    *   **Action**: Create a new group name (e.g., "VerificationGroup") in the "New group name" field.
    *   Click **Create group**.
6.  **Verification**:
    *   Confirm "VerificationGroup" appears in the list with a checkbox.
    *   Confirm `example data 1.xlsx` is listed under it.
    *   Check the box for "VerificationGroup".
    *   Click **Close**.

---

## 3. Transformation & Output

**Goal**: Verify data can be processed and exported.

1.  **Add Step**:
    *   Click the **+** (plus) button after the Data node.
    *   Select **Row Filter** (or "Remove Columns").
2.  **Configure Step**:
    *   Click on the new **Row Filter** node to open the **Properties Panel** (right sidebar).
    *   **Source Selection**:
        *   **Source Type**: Select "Original file".
        *   **File group**: Select "VerificationGroup".
        *   **File**: Select `example data 1.xlsx`.
        *   **Sheet**: Select `Sheet1` (or relevant sheet).
    *   **Filter Logic**:
        *   **Column**: Choose a column (e.g., "First Name").
        *   **Operator**: Choose "is not empty".
3.  **Preview**:
    *   Click the **Eye Icon** (Preview) on the Row Filter node.
    *   **Verification**: Ensure a data table appears at the bottom of the screen showing filtered results.
4.  **Export (Output)**:
    *   Go to the **Output** node (green node at the end).
    *   Click **Export**.
    *   **Verification**:
    *   Verify that a file download is triggered or the output file appears in the valid outputs list.

---

## 4. Advanced I/O Scenarios

**Goal**: Verify complex input/output mappings.

### A. Group In -> Group Out (1:1)
**Concept**: Process a batch of files individually and output one file per input.
1.  **Source**: In Source 1, select a **File group** (e.g., "MultiGroup") but **Do not** select a specific "File" (or select the group name if it appears in file list).
    *   *Note: If the UI forces a file selection, the "Group" selection itself acts as the filter for the batch.*
2.  **Output**: Check the Output node. It should indicate it will generate files corresponding to the input group.

### B. Many to One (Merge)
**Concept**: Combine multiple source files into a single destination file (Append mode).
1.  **Source 1**: Select File A.
2.  **Add Source**: Click "Add source" button.
3.  **Source 2**: Select File B.
4.  **Destination**: Ensure only one destination target is set.
5.  **Result**: The application will append Source 2 to Source 1. Output is 1 file.

### C. One to Many (Fan-out)
**Concept**: One source file feeds into multiple output files.
1.  **Output Node**: Click the Output node and click **"Add output file"** to create a second output (e.g., "output-2.xlsx").
2.  **Transform Node**:
    *   **Source 1**: Select File A.
    *   **Destination 1**: Mapped to "output-1.xlsx".
    *   **Add Destination**: Click "Add destination".
    *   **Destination 2**: Map to "output-2.xlsx".
3.  **Result**: The transformed data from File A is written to both Output 1 and Output 2.

### D. Many to Many
**Concept**: Explicitly map N sources to N destinations.
1.  **Setup**: Configure 2 Sources (File A, File B) and 2 Outputs (Output 1, Output 2).
2.  **Transform Node**:
    *   **Source 1** -> **Destination 1**
    *   **Source 2** -> **Destination 2**
3.  **Result**: Independent processing or 1-to-1 mapping where File A -> Output 1 and File B -> Output 2.
