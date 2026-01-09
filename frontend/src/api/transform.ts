import apiClient from './client';
import type { FlowData, FilePreview, TableTarget } from '../types';

export interface FlowExecuteRequest {
  file_id: number;
  file_ids?: number[];
  flow_data: FlowData;
  preview_target?: {
    file_id?: number;
    sheet_name?: string;
    virtual_id?: string;
  };
  output_batch_id?: number | null;
}

export interface FlowPrecomputeRequest {
  file_id?: number;
  file_ids?: number[];
  flow_data: FlowData;
}

export interface StepPreviewRequest {
  file_id: number;
  step_config: {
    blockType: string;
    config: Record<string, any>;
  };
}

export interface FlowExecuteResponse {
  preview: FilePreview;
  row_count: number;
  column_count: number;
}

export interface ListOutputsResponse {
  outputs: TableTarget[];
}

export const transformApi = {
  listOutputs: async (request: FlowPrecomputeRequest): Promise<ListOutputsResponse> => {
    const response = await apiClient.post('/transform/list-outputs', request);
    return response.data;
  },

  execute: async (request: FlowExecuteRequest): Promise<FlowExecuteResponse> => {
    const response = await apiClient.post('/transform/execute', request);
    return response.data;
  },

  precompute: async (request: FlowPrecomputeRequest): Promise<void> => {
    await apiClient.post('/transform/precompute', request);
  },

  previewStep: async (request: StepPreviewRequest): Promise<FilePreview> => {
    const response = await apiClient.post('/transform/preview-step', request);
    return response.data;
  },

  export: async (request: FlowExecuteRequest): Promise<Blob> => {
    const response = await apiClient.post('/transform/export', request, {
      responseType: 'blob',
    });
    return response.data;
  },
};
