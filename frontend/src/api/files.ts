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
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
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
