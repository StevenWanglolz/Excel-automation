import apiClient from './client';
import type { Batch, File, FilePreview } from '../types';

export const filesApi = {
  upload: async (file: globalThis.File, batchId?: number | null): Promise<File> => {
    const formData = new FormData();
    formData.append('file', file);
    const params = batchId ? `?batch_id=${batchId}` : '';
    
    // Content-Type will be set automatically by axios for FormData
    const response = await apiClient.post(`/files/upload${params}`, formData);
    return response.data;
  },

  list: async (options?: { batchId?: number | null; unbatched?: boolean }): Promise<File[]> => {
    const params = new URLSearchParams();
    if (typeof options?.batchId === 'number') {
      params.set('batch_id', String(options.batchId));
    }
    if (options?.unbatched) {
      params.set('unbatched', 'true');
    }
    const query = params.toString();
    const response = await apiClient.get(`/files${query ? `?${query}` : ''}`);
    return response.data;
  },

  listBatches: async (): Promise<Batch[]> => {
    const response = await apiClient.get('/files/batches');
    return response.data;
  },

  createBatch: async (payload: { name: string; description?: string | null }): Promise<Batch> => {
    const response = await apiClient.post('/files/batches', payload);
    return response.data;
  },

  deleteBatch: async (batchId: number): Promise<void> => {
    await apiClient.delete(`/files/batches/${batchId}`);
  },

  preview: async (fileId: number, sheetName?: string): Promise<FilePreview> => {
    // Ensure sheetName is a valid string before using it
    const validSheetName = sheetName && typeof sheetName === 'string' ? sheetName : undefined;
    const url = validSheetName 
      ? `/files/${fileId}/preview?sheet_name=${encodeURIComponent(validSheetName)}`
      : `/files/${fileId}/preview`;
    const response = await apiClient.get(url);
    return response.data;
  },

  sheets: async (fileId: number): Promise<string[]> => {
    const response = await apiClient.get(`/files/${fileId}/sheets`);
    return response.data;
  },

  delete: async (fileId: number): Promise<void> => {
    await apiClient.delete(`/files/${fileId}`);
  },

  download: async (fileId: number, filename: string): Promise<void> => {
    // Use fetch with proper authorization to download file
    const token = localStorage.getItem('access_token');
    const baseURL = apiClient.defaults.baseURL || '';
    const downloadUrl = `${baseURL}/files/${fileId}/download`;
    
    if (!token) {
      throw new Error('Authentication required. Please log in again.');
    }
    
    try {
      const response = await fetch(downloadUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        credentials: 'include',
      });
      
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Authentication required. Please log in again.');
        }
        throw new Error(`Download failed: ${response.statusText}`);
      }
      
      const blob = await response.blob();
      const url = globalThis.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      globalThis.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download file:', error);
      throw error;
    }
  },

  get: async (fileId: number): Promise<File> => {
    const response = await apiClient.get(`/files/${fileId}`);
    return response.data;
  },
};
