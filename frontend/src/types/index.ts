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
  output?: OutputConfig;
  fileIds?: number[];
}

export interface TableTarget {
  fileId: number | null;
  sheetName: string | null;
}

export interface OutputSheetMapping {
  sheetName: string;
  source: TableTarget;
}

export interface OutputConfig {
  fileName: string;
  sheets: OutputSheetMapping[];
}

export interface FilePreview {
  columns: string[];
  row_count: number;
  preview_rows: Record<string, any>[];
  dtypes: Record<string, string>;
  sheets?: string[];  // List of sheet names (for Excel files)
  current_sheet?: string | null;  // Current sheet being previewed
}
