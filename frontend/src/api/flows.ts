import apiClient from './client';
import type { Flow, FlowData } from '../types';

export interface FlowCreate {
  name: string;
  description?: string;
  flow_data: FlowData;
}

export interface FlowUpdate {
  name?: string;
  description?: string;
  flow_data?: FlowData;
}

export const flowsApi = {
  create: async (data: FlowCreate): Promise<Flow> => {
    const response = await apiClient.post('/flows', data);
    return response.data;
  },

  list: async (): Promise<Flow[]> => {
    const response = await apiClient.get('/flows');
    return response.data;
  },

  get: async (flowId: number): Promise<Flow> => {
    const response = await apiClient.get(`/flows/${flowId}`);
    return response.data;
  },

  update: async (flowId: number, data: FlowUpdate): Promise<Flow> => {
    const response = await apiClient.put(`/flows/${flowId}`, data);
    return response.data;
  },

  delete: async (flowId: number): Promise<void> => {
    await apiClient.delete(`/flows/${flowId}`);
  },
};

