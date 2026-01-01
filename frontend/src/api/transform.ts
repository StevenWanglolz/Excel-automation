import apiClient from './client';
import type { FlowData, FilePreview } from '../types';

export interface FlowExecuteRequest {
  file_id: number;
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

export const transformApi = {
  execute: async (request: FlowExecuteRequest): Promise<FlowExecuteResponse> => {
    const response = await apiClient.post('/transform/execute', request);
    return response.data;
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
