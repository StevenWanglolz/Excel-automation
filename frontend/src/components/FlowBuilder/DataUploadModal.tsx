import { useState, useEffect } from 'react';
import { filesApi } from '../../api/files';
import { DataPreview } from '../Preview/DataPreview';
import { ConfirmationModal } from '../Common/ConfirmationModal';
import type { FilePreview } from '../../types';

interface DataUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  nodeId: string;
  onFileUploaded?: (fileIds: number[]) => void;
  initialFileIds?: number[];
  onUploadStart?: () => void;
  onUploadEnd?: () => void;
}

export const DataUploadModal = ({
  isOpen,
  onClose,
  nodeId,
  onFileUploaded,
  initialFileIds = [],
  onUploadStart,
  onUploadEnd,
}: DataUploadModalProps) => {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<Array<{ id: number; name: string; originalName: string }>>([]);
  const [preview, setPreview] = useState<FilePreview | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewFileId, setPreviewFileId] = useState<number | null>(null);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [isFullScreenPreview, setIsFullScreenPreview] = useState(false);

  // Load initial files when modal opens
  useEffect(() => {
    if (isOpen && initialFileIds.length > 0) {
      loadInitialFiles();
    } else if (isOpen) {
      setUploadedFiles([]);
    }
  }, [isOpen, initialFileIds]);

  const loadInitialFiles = async () => {
    setIsLoadingFiles(true);
    try {
      const filePromises = initialFileIds.map(id => filesApi.get(id));
      const files = await Promise.all(filePromises);
      setUploadedFiles(files.map(f => ({
        id: f.id,
        name: f.filename,
        originalName: f.original_filename,
      })));
    } catch (error) {
      console.error('Failed to load files:', error);
      setAlertMessage('Failed to load files');
      setShowAlertModal(true);
    } finally {
      setIsLoadingFiles(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Validate file types
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
    ];
    const allowedExtensions = ['.xlsx', '.xls', '.csv'];

    const invalidFiles = files.filter(file => {
      const fileExtension = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
      return !allowedTypes.includes(file.type) && !allowedExtensions.includes(fileExtension);
    });

    if (invalidFiles.length > 0) {
      setError('Please upload valid Excel (.xlsx, .xls) or CSV files');
      return;
    }

    setIsUploading(true);
    setError(null);
    if (onUploadStart) {
      onUploadStart();
    }

    try {
      const uploadPromises = files.map(file => filesApi.upload(file));
      const uploadedFileResults = await Promise.all(uploadPromises);
      
      const newFiles = uploadedFileResults.map(f => ({
        id: f.id,
        name: f.filename,
        originalName: f.original_filename,
      }));

      setUploadedFiles(prev => {
        const updatedFiles = [...prev, ...newFiles];
        
        // Call callback with fresh file IDs from updated state
        if (onFileUploaded) {
          const allFileIds = updatedFiles.map(f => f.id);
          onFileUploaded(allFileIds);
        }
        
        return updatedFiles;
      });
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to upload file(s)');
    } finally {
      setIsUploading(false);
      if (onUploadEnd) {
        onUploadEnd();
      }
      // Reset file input
      e.target.value = '';
    }
  };

  const handlePreview = async (fileId: number, sheetName?: string) => {
    setIsLoadingPreview(true);
    setPreviewFileId(fileId);
    try {
      const filePreview = await filesApi.preview(fileId, sheetName);
      setPreview(filePreview);
    } catch (error) {
      console.error('Failed to load preview:', error);
      setAlertMessage('Failed to load preview');
      setShowAlertModal(true);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleRemoveFile = async (fileId: number) => {
    try {
      await filesApi.delete(fileId);
      setUploadedFiles(prev => prev.filter(f => f.id !== fileId));
      if (previewFileId === fileId) {
        setPreview(null);
        setPreviewFileId(null);
      }
      if (onFileUploaded) {
        const remainingFileIds = uploadedFiles.filter(f => f.id !== fileId).map(f => f.id);
        onFileUploaded(remainingFileIds);
      }
    } catch (error: any) {
      console.error('Failed to delete file:', error);
      setAlertMessage(
        error.response?.data?.detail?.message || 
        error.response?.data?.detail || 
        'Failed to delete file'
      );
      setShowAlertModal(true);
    }
  };

  const handleDownloadFile = async (fileId: number, filename: string) => {
    try {
      await filesApi.download(fileId, filename);
    } catch (error) {
      console.error('Failed to download file:', error);
      setAlertMessage('Failed to download file');
      setShowAlertModal(true);
    }
  };

  const handleSheetChange = async (sheetName: string) => {
    if (previewFileId) {
      await handlePreview(previewFileId, sheetName);
    }
  };

  const handleClose = () => {
    setError(null);
    setPreview(null);
    setPreviewFileId(null);
    // Save current file IDs before closing
    if (onFileUploaded && uploadedFiles.length > 0) {
      onFileUploaded(uploadedFiles.map(f => f.id));
    }
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
                          Upload files
                        </p>
                        <p className="text-sm text-gray-500 mb-1">
                          Click to browse or drag and drop
                        </p>
                        <p className="text-xs text-gray-400">
                          Excel (.xlsx, .xls) or CSV (multiple files)
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
                    multiple
                  />
                </label>
                {error && (
                  <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-600">{error}</p>
                  </div>
                )}
                {/* Uploaded Files List */}
                {isLoadingFiles ? (
                  <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                    <p className="text-sm text-gray-600">Loading files...</p>
                  </div>
                ) : uploadedFiles.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <p className="text-sm font-medium text-gray-700">Uploaded Files ({uploadedFiles.length}):</p>
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {uploadedFiles.map((file) => (
                        <div
                          key={file.id}
                          className="flex items-center justify-between p-2 bg-gray-50 border border-gray-200 rounded-md hover:bg-gray-100"
                        >
                          <button
                            onClick={() => handleDownloadFile(file.id, file.originalName)}
                            className="flex-1 text-left text-sm text-indigo-600 hover:text-indigo-800 hover:underline truncate"
                            title={`Download ${file.originalName}`}
                          >
                            {file.originalName}
                          </button>
                          <button
                            onClick={() => handleRemoveFile(file.id)}
                            className="ml-2 text-red-600 hover:text-red-800 text-sm font-bold"
                            title="Remove file"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Preview Section */}
              <div className="flex flex-col">
                {uploadedFiles.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-gray-700 mb-2">Preview File:</p>
                    <select
                      onChange={(e) => {
                        const fileId = parseInt(e.target.value);
                        if (fileId) {
                          handlePreview(fileId);
                        }
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
                      value={previewFileId ? String(previewFileId) : ''}
                    >
                      <option value="">Select a file to preview</option>
                      {uploadedFiles.map((file) => (
                        <option key={file.id} value={String(file.id)}>
                          {file.originalName}
                        </option>
                      ))}
                    </select>
                    {previewFileId && (
                      <button
                        onClick={() => handlePreview(previewFileId)}
                        disabled={isLoadingPreview}
                        className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors shadow-sm hover:shadow-md flex items-center justify-center space-x-2"
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
                    )}
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col justify-center">
                    <p className="text-sm text-gray-500 text-center">
                      Upload files to enable preview
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Preview Data */}
            {preview && (
              <div className="mt-6 border-t border-gray-200 pt-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-gray-900">Data Preview</h3>
                  <button
                    onClick={() => setIsFullScreenPreview(true)}
                    className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors flex items-center space-x-2"
                    title="View full screen"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                    </svg>
                    <span>Full Screen</span>
                  </button>
                </div>
                <div className="max-h-[300px] overflow-y-auto border border-gray-200 rounded-lg p-4">
                  <DataPreview 
                    preview={preview} 
                    isLoading={isLoadingPreview}
                    fileId={previewFileId || undefined}
                    onSheetChange={handleSheetChange}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Alert Modal */}
      <ConfirmationModal
        isOpen={showAlertModal}
        onClose={() => setShowAlertModal(false)}
        title="Alert"
        message={alertMessage}
        type="alert"
        showCancel={false}
      />

      {/* Full Screen Preview Modal */}
      {isFullScreenPreview && preview && (
        <>
          {/* Overlay */}
          <div
            className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm z-50"
            onClick={() => setIsFullScreenPreview(false)}
          />
          
          {/* Full Screen Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="bg-white rounded-xl shadow-2xl w-full h-full max-w-[95vw] max-h-[95vh] flex flex-col relative"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900">Data Preview - Full Screen</h2>
                <button
                  onClick={() => setIsFullScreenPreview(false)}
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

              {/* Preview Content */}
              <div className="flex-1 overflow-auto p-6">
                <DataPreview 
                  preview={preview} 
                  isLoading={isLoadingPreview}
                  fileId={previewFileId || undefined}
                  onSheetChange={handleSheetChange}
                />
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
};

