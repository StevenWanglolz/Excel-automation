
export interface BlockDefinition {
  id: string;
  name: string;
  category: 'data' | 'transform' | 'output';
  description?: string;
  // Metadata for the UI/Builder
}
