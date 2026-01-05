# Design Proposal: Stream-Centric Data Flow & Pipeline Architecture

## Problem Statement
The current Flow Builder exposes "Sources" and "Destinations" in a way that creates ambiguity in complex pipelines:
1.  **Continuity vs. Branching**: Users are unsure if they are operating on the "Original" file or a "Modified" version from a previous step.
2.  **Complex Assembly**: Scenarios like "Filter X, Append to Y, then Process Y" are difficult to visualize and configure.
3.  **Group vs. Single Ambiguity**: It's unclear how batch operations interact with single-file exceptions.

## Core Concept: Stream-Centric Architecture

We will shift the mental model from "Files" to **"Data Streams"**.

### 1. Graph Topology as Source of Truth
Availability of data is strictly determined by **Node Connections**.
- **Chaining (Continuity)**: `Data` -> `Op A` -> `Op B`.
    - `Op B` sees only the *Output Stream* of `Op A`.
    - It does *not* see the original `Data` inputs unless explicitly passed through.
- **Branching (Accessing Originals)**:
    - User connects: `Data` -> `Op A`.
    - User *also* connects: `Data` -> `Op B`.
    - `Op B` now has access to the **Original** source files (Stream 1) AND potentially `Op A`'s output (Stream 2) if connected.

### 2. "Virtual Streams" instead of "Output Files"
Intermediate blocks (Operation Blocks) do not produce physical "Files". They produce **Virtual Streams**.
- **Naming**: `[Block Name] Output - [Original Filename]` (e.g., "Row Filter 1 - data.xlsx").
- **Batching**: A Group of files flowing through a block produces a **Stream Group**.

### 3. The Output Block as "The Assembler"
The Output Block is the only place where "Physical Files" are defined. It acts as a **Stream Mapper**.
- **Inputs**: It receives all Active Streams from connected blocks.
- **Configuration**:
    1.  **Auto-Map (Batch)**: "Write [Stream Group A] to corresponding files".
    2.  **Manual Assembly (Single)**:
        - User creates `Final_Report.xlsx`.
        - User maps `Stream X (Header)` -> `Sheet 1`.
        - User maps `Stream Y (Data)` -> `Sheet 1` (Append Mode).

## UI/UX Redesign Proposal

### A. Properties Panel: "Incoming Streams"
Instead of a generic "Sources" list, we explicitly group inputs by their **Origin Node**.

**Example UI**:
```text
INPUTS
▼ From "Row Filter 1" (Group: "Test Batch", 4 streams)
  • data_1.xlsx (filtered)
  • data_2.xlsx (filtered)
▼ From "Raw Data" (3 streams)
  • reference.xlsx
```

### B. Operation Block: "Transform vs. Merge"
Each Destination in an Operation Block behaves as a **Transformation Definition**.
- **Condition 1: One-to-One (Batch)**
    - "Select Group: From Row Filter 1".
    - Action: Apply logic to all items.
    - Output: "New Group Stream".
- **Condition 2: Explicit Pairing (Source -> Dest)**
    - User selects "Manual Mode".
    - Adds Pair: Source `reference.xlsx` -> Dest `StreamRef 1`.

### C. Output Block: Two Distinct Modes
1.  **Direct Dump (Group Output)**:
    - Lists incoming *Stream Groups*.
    - toggle "Save to Disk".
    - Read-only names (derived from upstream).
2.  **Custom Assembly (Single Files)**:
    - User "Add Output File".
    - **Source Selector**: Pick *any* individual active stream (e.g., "Row Filter 1 > file_A.xlsx").
    - **Action**: Write to File / Append to File.

## Addressing User's "Complicated Scenario"
*Scenario: "Make changes to files ... append to empty file ... continue to make changes to that file."*

**Solution**:
1.  **Step 1 (Modify)**: `Row Filter` block. Transforms `Original` -> `Filtered Stream`.
2.  **Step 2 (Assembler/Merge)**: A new **"Merge / Append" Block** or explicit Output mapping.
    - *Clarification*: If the user wants to *process* the result of an append, we need an intermediate **Merge Block** that takes multiple streams and produces ONE stream.
    - **New Block Recommendation**: **"Merge Block"** (or "Joins").
        - Inputs: Stream A, Stream B.
        - Config: Append A then B.
        - Output: Composite Stream C.
    - **Step 3 (Continue Processing)**: Connect `Merge Block` -> `Next Op Block`.

## Implementation Priority
1.  **Graph-Aware Source Listing**: Update Properties Panel to group "Sources" by their **Parent Node**.
2.  **Stream Naming**: Ensure properly formatted labels (e.g. `[Node Name] - [File Name]`).
3.  **Strict "Source -> Dest" Pairing**: As implemented in the previous refactor, but enhanced with the "Incoming Streams" grouping visual.

This design solves the ambiguity by visualizing *where* data comes from.
