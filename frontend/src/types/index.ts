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
