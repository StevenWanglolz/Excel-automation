import apiClient from './client';
import type { File, FilePreview } from '../types';

export const filesApi = {
  upload: async (file: File): Promise<File> => {
    const formData = new FormData();
    formData.append('file', file);
    
    // Content-Type will be set automatically by axios for FormData
    const response = await apiClient.post('/files/upload', formData);
    return response.data;
  },

  list: async (): Promise<File[]> => {
    const response = await apiClient.get('/files');
    return response.data;
  },

  preview: async (fileId: number): Promise<FilePreview> => {
    const response = await apiClient.get(`/files/${fileId}/preview`);
    return response.data;
  },

  delete: async (fileId: number): Promise<void> => {
    await apiClient.delete(`/files/${fileId}`);
  },
};

