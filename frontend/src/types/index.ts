export interface User {
  id: number;
  email: string;
  full_name: string | null;
  is_active: boolean;
}

export interface File {
  id: number;
  filename: string;
  original_filename: string;
  file_size: number;
  mime_type: string;
  batch_id?: number | null;
  created_at: string;
}

export interface Batch {
  id: number;
  name: string;
  description: string | null;
  file_count: number;
  created_at: string;
  flow_id?: number | null;
}

export interface Flow {
  id: number;
  user_id: number;
  name: string;
  description: string | null;
  flow_data: FlowData;
  created_at: string;
  updated_at: string | null;
}

export interface FlowData {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export interface FlowNode {
  id: string;
  type?: string;
  position: { x: number; y: number };
  data: BlockData;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

// Determines how batch sources map to destinations
// 'separate' = N inputs → N outputs (1:1)
// 'merge' = N inputs → 1 output (all data combined)
// FUTURE: 'custom' = user-defined N→M mapping
export type DestinationMode = 'separate' | 'merge';

// FUTURE: Strategy for how data is merged when destinationMode is 'merge'
// 'stack_rows' = all data into one sheet (append rows)
// 'preserve_sheets' = each source → separate sheet in same file
// export type MergeStrategy = 'stack_rows' | 'preserve_sheets';

export interface BlockData {
  [key: string]: any;
  blockType: string;
  config: Record<string, any>;
  label?: string;
  target?: TableTarget;
  destination?: TableTarget;
  sourceTargets?: TableTarget[];
  destinationTargets?: TableTarget[];
  mappingTargets?: MappingTarget[];
  output?: OutputConfig;
  outputBatchId?: number | null;
  fileIds?: number[];
  sourceRule?: SourceRule;
  destinationMode?: DestinationMode; // How batch sources map to destinations
}

export type SourceRuleMode =
  | 'latest'
  | 'filename'
  | 'pattern'
  | 'sheet-name'
  | 'cell-value'
  | 'column-value'
  | 'header-contains';

export interface SourceRule {
  mode: SourceRuleMode;
  fileName?: string;
  pattern?: string;
  patternIsRegex?: boolean;
  sheetMatch?: {
    type: 'equals' | 'contains';
    value: string;
  };
  cellMatch?: {
    sheetName?: string;
    cell: string;
    operator: 'equals' | 'contains';
    value: string;
  };
  columnMatch?: {
    sheetName?: string;
    column: string;
    operator: 'equals' | 'contains';
    value: string;
  };
  headerMatch?: {
    sheetName?: string;
    columns: string[];
    match: 'all' | 'any';
  };
}

export interface TableTarget {
  fileId: number | null;
  sheetName: string | null;
  batchId?: number | null;
  virtualId?: string | null;
  virtualName?: string | null;
  sourceId?: string | number | null; // ID of the source file this target is mapped to
  linkedSourceIds?: Array<string | number>;
  isFinalOutput?: boolean;
  isFutureSource?: boolean;
  writeMode?: 'overwrite' | 'append';
}

export interface MappingTarget {
  mappingNodeId: string | null;
  fileId: number | null;
  sheetName?: string | null;
}

export interface OutputSheetMapping {
  sheetName: string;
  templateData?: Record<string, string>[];
  columns?: string[];
}

export interface OutputFileConfig {
  id: string;
  creatorNodeId?: string; // ID of the node that created/owns this file
  fileName: string;
  sheets: OutputSheetMapping[];
}

export interface OutputConfig {
  outputs: OutputFileConfig[];
  mode?: 'fixed' | 'batch_template';
  batchNamingPattern?: string;
  writeMode?: 'create' | 'append';
  baseFileId?: number | null;
}

export interface FilePreview {
  columns: string[];
  row_count: number;
  preview_rows: Record<string, any>[];
  dtypes: Record<string, string>;
  is_placeholder?: boolean;
  sheets?: string[];  // List of sheet names (for Excel files)
  current_sheet?: string | null;  // Current sheet being previewed
}
