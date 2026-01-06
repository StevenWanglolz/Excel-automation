import type { ComponentType } from 'react';

export interface BlockDefinition {
  id: string;
  name: string;
  description: string;
  category: 'upload' | 'filter' | 'transform' | 'columns' | 'rows' | 'output';
  icon?: string;
  component: ComponentType<any>;
  defaultConfig: Record<string, any>;
  configSchema?: Record<string, any>;
}

