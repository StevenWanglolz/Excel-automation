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
  created_at: string;
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
  type: string;
  position: { x: number; y: number };
  data: BlockData;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface BlockData {
  blockType: string;
  config: Record<string, any>;
  label?: string;
  target?: TableTarget;
  destination?: TableTarget;
  output?: OutputConfig;
  fileIds?: number[];
}

export interface TableTarget {
  fileId: number | null;
  sheetName: string | null;
  virtualId?: string | null;
  virtualName?: string | null;
}

export interface OutputSheetMapping {
  sheetName: string;
}

export interface OutputFileConfig {
  id: string;
  fileName: string;
  sheets: OutputSheetMapping[];
}

export interface OutputConfig {
  outputs: OutputFileConfig[];
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
