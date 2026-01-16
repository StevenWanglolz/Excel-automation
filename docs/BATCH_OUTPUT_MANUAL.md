# Batch Processing & Output Manual

This guide details how to configure the Flow Builder for different batch processing scenarios. 

**Summary of Supported Modes**

| Scenarios | Description | Output Mode |
| :--- | :--- | :--- |
| **Single -> Single** | One input file processed to one output file. | `Single Files` |
| **Batch -> Batch (G2G)** | N input files processed to N output files (1:1). | `Batch Output Mode` → `Separate files` |
| **Batch -> Merge (G2M)** | N input files merged into 1 output file. | `Batch Output Mode` → `Merge into one` |
| **N-to-M Split** | Specific inputs routed to specific outputs. | `Condition Routing` |

---

## 1. Single File → Single File
**Goal:** Process a single Excel file and output a single result.

1.  **Add Source:** Drag a **Single File** source onto the canvas.
2.  **Add Logic:** Connect it to a transform block (e.g., Row Filter) if needed.
3.  **Configure Output (in Transform Block):**
    *   Click your transform block (e.g., **Row Filter**).
    *   In the Properties Panel, scroll to the **Destinations** section.
    *   Click **Add a destination**.
    *   **File Name**: Rename the output file (default: `output.xlsx`).
    *   **Sheets**: Add or remove sheets as needed.

---

## 2. Batch → Batch (G2G) - "Separate Files"
**Goal:** Process a group of files (Batch) and generate a separate output file for each input file (1:1 mapping).

1.  **Add Source:** Drag a **Batch Group** source onto the canvas.
2.  **Add Logic:** Connect it to your transform blocks. The batch structure is preserved through the flow.
3.  **Configure Output (in Transform Block):**
    *   Click your transform block.
    *   In the Properties Panel, go to **Destinations**.
    *   The panel will display **Batch Output Mode**.
    *   **Select Mode:** Choose **Separate files**.
    *   **Automatic Naming**: Files are automatically named `{original_name}_processed.xlsx`.
    *   **Preview**: Check the "Generated Files Preview" to see the list of files that will be created.

---

## 3. Batch → Merge (G2M) - "Merge into One"
**Goal:** Process a group of files (Batch) and merge all their data into a single output file.

1.  **Add Source:** Drag a **Batch Group** source onto the canvas.
2.  **Add Logic:** Connect it to your transform blocks.
3.  **Configure Output (in Transform Block):**
    *   Click your transform block.
    *   In the Properties Panel, go to **Destinations**.
    *   The panel will display **Batch Output Mode**.
    *   **Select Mode:** Choose **Merge into one**.
    *   **Merged File Name**: Enter the name for the single output file (e.g., `Consolidated_Report.xlsx`).
    *   **Important**: All data from all processed batch files will be appended into the single sheet defined in this output.

---

## 4. Append to Existing File Mode
**Goal:** Add filtered or processed data to an Excel file that already exists in your workspace.

1.  **Configure Output (in Transform Block):**
    *   Click the transform block you want to save data from (e.g., **Row Filter**).
    *   In the Properties Panel, scroll to the **Destinations** section.
    *   Click **Add a destination**.
    *   Look for **Write Mode** within the destination block.
    *   Select **Append to Existing**.
2.  **Select Base File:**
    *   A file picker will appear. Select the file you want to modify (e.g., `Database.xlsx`).
3.  **Run Flow:**
    *   The result will be a file containing all sheets from the original `Database.xlsx` plus your new data.

---

## 5. Single File All-Sheets Batch
**Goal:** Process EVERY sheet in a single Excel file as if they were separate files.

1.  **Add Source:** Drag a **Single File** source.
2.  **Configuration:**
    *   Select your file (e.g. `Monthly_Data.xlsx`).
    *   In the **Sheet** dropdown, select the special option: `** All Sheets (Batch) **`.
3.  **Behavior:**
    *   The single source node now acts like a Batch Group.
    *   Downstream nodes will process each sheet individually.

---

## 6. Conditional Output Routing (N-to-M)
**Goal:** Split a batch of input files into specific output files based on their source.

**Scenario:** You have a batch of 10 files. You want files A and B to go to `Output_AB.xlsx`, and files C and D to go to `Output_CD.xlsx`.

### Step-by-Step
1.  **Configure Transform Block:**
    *   Click your transform block.
    *   In **Destinations**, delete any default destinations if needed.
2.  **Add First Destination (`Output_AB.xlsx`):**
    *   Click **Add a destination**.
    *   Set Name: `Output_AB.xlsx`.
    *   Find **APPLIES TO SOURCES**.
    *   Uncheck "All Sources".
    *   Check `File A` and `File B`.
    *   Set **Write Mode** to **Merge into one** (if you want them merged) or **Separate files** (if you want them processed 1:1 but only for these 2).
3.  **Add Second Destination (`Output_CD.xlsx`):**
    *   Click **Add a destination**.
    *   Set Name: `Output_CD.xlsx`.
    *   Uncheck "All Sources".
    *   Check `File C` and `File D`.
    *   Set Logic as needed.
4.  **Run Flow:**
    *   The system will generate 2 files (or more depending on modes), respecting your specific source mapping.
