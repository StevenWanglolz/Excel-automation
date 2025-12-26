import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { filesApi, type File } from '../../api/files';
import { FileUploader } from '../FileUpload/FileUploader';
import { DataPreview } from '../Preview/DataPreview';
import type { FilePreview } from '../../types';

export const Dashboard = () => {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [files, setFiles] = useState<File[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<number | null>(null);
  const [preview, setPreview] = useState<FilePreview | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  useEffect(() => {
    loadFiles();
  }, []);

  useEffect(() => {
    if (selectedFileId) {
      loadPreview(selectedFileId);
    }
  }, [selectedFileId]);

  const loadFiles = async () => {
    try {
      const fileList = await filesApi.list();
      setFiles(fileList);
    } catch (error) {
      console.error('Failed to load files:', error);
    }
  };

  const loadPreview = async (fileId: number) => {
    setIsLoadingPreview(true);
    try {
      const filePreview = await filesApi.preview(fileId);
      setPreview(filePreview);
    } catch (error) {
      console.error('Failed to load preview:', error);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleUploadSuccess = (fileId: number) => {
    loadFiles();
    setSelectedFileId(fileId);
  };

  const handleFileSelect = (fileId: number) => {
    setSelectedFileId(fileId);
  };

  const handleDeleteFile = async (fileId: number) => {
    try {
      await filesApi.delete(fileId);
      if (selectedFileId === fileId) {
        setSelectedFileId(null);
        setPreview(null);
      }
      loadFiles();
    } catch (error) {
      console.error('Failed to delete file:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center space-x-4">
              <h1 className="text-xl font-bold text-gray-900">SheetPilot</h1>
              <button
                onClick={() => navigate('/flow-builder')}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm"
              >
                Flow Builder
              </button>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-700">{user?.email}</span>
              <button
                onClick={logout}
                className="text-sm text-indigo-600 hover:text-indigo-500"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4">Upload File</h2>
              <FileUploader onUploadSuccess={handleUploadSuccess} />

              <div className="mt-6">
                <h3 className="text-md font-semibold mb-3">Your Files</h3>
                <div className="space-y-2">
                  {files.map((file) => (
                    <div
                      key={file.id}
                      className={`p-3 border rounded cursor-pointer hover:bg-gray-50 ${
                        selectedFileId === file.id ? 'border-indigo-500 bg-indigo-50' : ''
                      }`}
                      onClick={() => handleFileSelect(file.id)}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900">
                            {file.original_filename}
                          </p>
                          <p className="text-xs text-gray-500">
                            {(file.file_size / 1024).toFixed(2)} KB
                          </p>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteFile(file.id);
                          }}
                          className="text-red-600 hover:text-red-800 text-sm"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                  {files.length === 0 && (
                    <p className="text-sm text-gray-500">No files uploaded yet</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4">Data Preview</h2>
              <DataPreview preview={preview} isLoading={isLoadingPreview} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

