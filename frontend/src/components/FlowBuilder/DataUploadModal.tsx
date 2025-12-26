import { useState } from 'react';
import { filesApi } from '../../api/files';
import { DataPreview } from '../Preview/DataPreview';
import type { FilePreview } from '../../types';

interface DataUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  nodeId: string;
  onFileUploaded?: (fileId: number) => void;
}

export const DataUploadModal = ({
  isOpen,
  onClose,
  nodeId,
  onFileUploaded,
}: DataUploadModalProps) => {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedFileId, setUploadedFileId] = useState<number | null>(null);
  const [preview, setPreview] = useState<FilePreview | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
    ];
    const allowedExtensions = ['.xlsx', '.xls', '.csv'];
    const fileExtension = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));

    if (
      !allowedTypes.includes(file.type) &&
      !allowedExtensions.includes(fileExtension)
    ) {
      setError('Please upload a valid Excel (.xlsx, .xls) or CSV file');
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const uploadedFile = await filesApi.upload(file);
      setUploadedFileId(uploadedFile.id);
      if (onFileUploaded) {
        onFileUploaded(uploadedFile.id);
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to upload file');
    } finally {
      setIsUploading(false);
    }
  };

  const handlePreview = async () => {
    if (!uploadedFileId) {
      alert('Please upload a file first');
      return;
    }

    setIsLoadingPreview(true);
    try {
      const filePreview = await filesApi.preview(uploadedFileId);
      setPreview(filePreview);
    } catch (error) {
      console.error('Failed to load preview:', error);
      alert('Failed to load preview');
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleClose = () => {
    setError(null);
    setPreview(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm z-40 transition-opacity"
        onClick={handleClose}
      />
      
      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="bg-white rounded-xl shadow-2xl w-full max-w-2xl relative transform transition-all"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Upload Data File</h2>
            <button
              onClick={handleClose}
              className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Close"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Modal Content */}
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              {/* Upload File Section */}
              <div className="flex flex-col">
                <label className="flex-1 flex flex-col items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-indigo-400 hover:from-indigo-50 hover:to-indigo-100 transition-all duration-200 min-h-[280px] p-8 group">
                  <div className="flex flex-col items-center justify-center text-center">
                    {isUploading ? (
                      <>
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div>
                        <div className="text-gray-700 font-medium">Uploading...</div>
                      </>
                    ) : (
                      <>
                        <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mb-4 group-hover:bg-indigo-200 transition-colors">
                          <svg
                            className="w-8 h-8 text-indigo-600"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                            />
                          </svg>
                        </div>
                        <p className="text-lg font-semibold text-gray-900 mb-2">
                          Upload file
                        </p>
                        <p className="text-sm text-gray-500 mb-1">
                          Click to browse or drag and drop
                        </p>
                        <p className="text-xs text-gray-400">
                          Excel (.xlsx, .xls) or CSV
                        </p>
                      </>
                    )}
                  </div>
                  <input
                    type="file"
                    className="hidden"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleFileChange}
                    disabled={isUploading}
                  />
                </label>
                {error && (
                  <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-600">{error}</p>
                  </div>
                )}
                {uploadedFileId && (
                  <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-sm text-green-700 font-medium">
                      ✓ File uploaded successfully
                    </p>
                  </div>
                )}
              </div>

              {/* Preview Section */}
              <div className="flex flex-col">
                <div className="flex-1 flex flex-col justify-center">
                  <button
                    onClick={handlePreview}
                    disabled={!uploadedFileId || isLoadingPreview}
                    className="w-full px-6 py-4 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors shadow-sm hover:shadow-md flex items-center justify-center space-x-2"
                  >
                    {isLoadingPreview ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                        <span>Loading...</span>
                      </>
                    ) : (
                      <>
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                          />
                        </svg>
                        <span>Preview Data</span>
                      </>
                    )}
                  </button>
                  {!uploadedFileId && (
                    <p className="mt-3 text-xs text-gray-500 text-center">
                      Upload a file to enable preview
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Preview Data */}
            {preview && (
              <div className="mt-6 border-t border-gray-200 pt-6">
                <h3 className="text-sm font-semibold text-gray-900 mb-4">Data Preview</h3>
                <div className="max-h-[300px] overflow-y-auto border border-gray-200 rounded-lg">
                  <DataPreview preview={preview} isLoading={isLoadingPreview} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

