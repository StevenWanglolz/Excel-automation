/**
 * Responsible for:
 * - Managing group and single uploads for a flow.
 * - Keeping node file IDs in sync with the selected groups and files.
 *
 * Key assumptions:
 * - Group membership determines which files are grouped together.
 * - Single uploads are not attached to any group.
 *
 * Be careful:
 * - Group inclusion toggles update the flow's file list.
 * - Deleting a file removes it from the group and the flow.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { filesApi } from '../../api/files';
import { ConfirmationModal } from '../Common/ConfirmationModal';
import type { Batch, FilePreview } from '../../types';
import { DataPreview } from '../Preview/DataPreview';

interface DataUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  nodeId: string;
  onFileUploaded?: (fileIds: number[]) => void;
  initialFileIds?: number[];
  onUploadStart?: () => void;
  onUploadEnd?: () => void;
  flowId?: number;
  onEnsureFlowSaved?: () => Promise<number>;
  /** Called whenever the flow is modified (batch created/deleted, files added/removed) */
  onFlowModified?: () => void;
}

export const DataUploadModal = ({
  isOpen,
  onClose,
  nodeId,
  onFileUploaded,
  initialFileIds = [],
  onUploadStart,
  onUploadEnd,
  flowId,
  onEnsureFlowSaved,
  onFlowModified,
}: DataUploadModalProps) => {
  type UploadedFile = {
    id: number;
    name: string;
    originalName: string;
    batchId?: number | null;
  };

  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [individualFiles, setIndividualFiles] = useState<UploadedFile[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [activeBatchId, setActiveBatchId] = useState<number | null>(null);
  const [batchFilesById, setBatchFilesById] = useState<Record<number, UploadedFile[]>>({});
  const [batchNameDraft, setBatchNameDraft] = useState('');
  const [showAllBatchFiles, setShowAllBatchFiles] = useState(false);
  const [showAllIndividualFiles, setShowAllIndividualFiles] = useState(false);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [alertMessage, setAlertMessage] = useState('');
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    confirmText?: string;
    onConfirm: () => void;
  } | null>(null);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [isLoadingBatches, setIsLoadingBatches] = useState(false);
  
  // Preview state
  const [previewData, setPreviewData] = useState<FilePreview | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewFileId, setPreviewFileId] = useState<number | null>(null);

  const lastLoadedNodeIdRef = useRef<string | null>(null);
  const lastEmittedFileIdsRef = useRef<number[]>([]);
  const MAX_VISIBLE_FILES = 10;

  const getIncludedFileIds = useCallback((
    nextIndividuals: UploadedFile[],
    nextBatchFiles: Record<number, UploadedFile[]>
  ) => {
    const ids = new Set<number>();
    nextIndividuals.forEach((file) => ids.add(file.id));
    Object.values(nextBatchFiles).forEach((batchFiles) => {
      batchFiles.forEach((file) => ids.add(file.id));
    });
    return Array.from(ids);
  }, []);

  const emitFileIds = useCallback((nextFileIds: number[]) => {
    if (!onFileUploaded) {
      return;
    }
    const normalized = [...new Set(nextFileIds)].sort((a, b) => a - b);
    const previous = lastEmittedFileIdsRef.current;
    const isSame =
      previous.length === normalized.length &&
      previous.every((value, index) => value === normalized[index]);
    if (isSame) {
      return;
    }
    lastEmittedFileIdsRef.current = normalized;
    onFileUploaded(normalized);
  }, [onFileUploaded]);

  const loadInitialFiles = useCallback(async () => {
    setIsLoadingFiles(true);
    setIsLoadingBatches(true);
    try {
      const [allFiles, batchList] = await Promise.all([
        filesApi.list(),
        filesApi.listBatches(flowId),
      ]);

      const filesById = new Map(allFiles.map((file) => [file.id, file]));
      const resolvedFiles = initialFileIds
        .map((id) => filesById.get(id))
        .filter((file): file is NonNullable<typeof file> => Boolean(file));

      const nextBatchFiles: Record<number, UploadedFile[]> = {};
      allFiles.forEach((file) => {
        if (!file.batch_id) {
          return;
        }
        if (!nextBatchFiles[file.batch_id]) {
          nextBatchFiles[file.batch_id] = [];
        }
        nextBatchFiles[file.batch_id].push({
          id: file.id,
          name: file.filename,
          originalName: file.original_filename,
          batchId: file.batch_id,
        });
      });

      const nextIndividuals = resolvedFiles
        .filter((file) => !file.batch_id)
        .map((file) => ({
          id: file.id,
          name: file.filename,
          originalName: file.original_filename,
          batchId: null,
        }));

      setBatches(batchList);
      setBatchFilesById(nextBatchFiles);
      setIndividualFiles(nextIndividuals);

      setActiveBatchId((prev) => {
        if (prev && batchList.some((batch) => batch.id === prev)) {
          return prev;
        }
        return batchList[0]?.id ?? null;
      });

      const nextFileIds = getIncludedFileIds(nextIndividuals, nextBatchFiles);
      emitFileIds(nextFileIds);
    } catch (_error) {
      setAlertMessage('Failed to load files');
      setShowAlertModal(true);
    } finally {
      setIsLoadingFiles(false);
      setIsLoadingBatches(false);
    }
  }, [emitFileIds, getIncludedFileIds, initialFileIds, flowId]);

  // Load initial files once per modal open for the selected node
  useEffect(() => {
    if (!isOpen) {
      lastLoadedNodeIdRef.current = null;
      return;
    }

    if (lastLoadedNodeIdRef.current === nodeId) {
      return;
    }

    lastLoadedNodeIdRef.current = nodeId;
    setShowAllBatchFiles(false);
    setShowAllIndividualFiles(false);

    try {
      loadInitialFiles().catch((err) => {
        console.error('Error loading initial files:', err);
      });
    } catch (err) {
      console.error('Exception in useEffect:', err);
    }
  }, [isOpen, nodeId, initialFileIds, loadInitialFiles]);

  useEffect(() => {
    setShowAllBatchFiles(false);
  }, [activeBatchId]);

  const validateFiles = (files: globalThis.File[]) => {
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
    ];
    const allowedExtensions = ['.xlsx', '.xls', '.csv'];

    const invalidFiles = files.filter((file) => {
      const fileExtension = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
      return !allowedTypes.includes(file.type) && !allowedExtensions.includes(fileExtension);
    });

    if (invalidFiles.length > 0) {
      setError('Please upload valid Excel (.xlsx, .xls) or CSV files');
      return false;
    }
    return true;
  };

  const uploadFiles = async (
    files: globalThis.File[],
    batchId?: number | null
  ): Promise<UploadedFile[]> => {
    const uploadPromises = files.map((file) => filesApi.upload(file, batchId ?? undefined));
    const uploadedFileResults = await Promise.all(uploadPromises);
    return uploadedFileResults.map((file) => ({
      id: file.id,
      name: file.filename,
      originalName: file.original_filename,
      batchId: file.batch_id ?? null,
    }));
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    if (!validateFiles(files)) {
      return;
    }

    setIsUploading(true);
    setError(null);
    if (onUploadStart) {
      onUploadStart();
    }

    try {
      const newFiles = await uploadFiles(files);
      const updatedIndividuals = [...individualFiles, ...newFiles];
      setIndividualFiles(updatedIndividuals);
      const nextFileIds = getIncludedFileIds(updatedIndividuals, batchFilesById);
      emitFileIds(nextFileIds);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to upload file(s)');
    } finally {
      setIsUploading(false);
      if (onUploadEnd) {
        onUploadEnd();
      }
      e.target.value = '';
    }
  };

  const handleBatchFileChange = async (
    batchId: number,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    if (!validateFiles(files)) {
      return;
    }

    setIsUploading(true);
    setError(null);
    if (onUploadStart) {
      onUploadStart();
    }

    try {
      const newFiles = await uploadFiles(files, batchId);
      setBatchFilesById((prev) => {
        const existing = prev[batchId] || [];
        return { ...prev, [batchId]: [...existing, ...newFiles] };
      });
      const nextFileIds = getIncludedFileIds(
        individualFiles,
        {
          ...batchFilesById,
          [batchId]: [...(batchFilesById[batchId] || []), ...newFiles],
        }
      );
      emitFileIds(nextFileIds);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to upload file(s)');
    } finally {
      setIsUploading(false);
      if (onUploadEnd) {
        onUploadEnd();
      }
      e.target.value = '';
    }
  };

  const handleCreateBatch = async () => {
    const name = batchNameDraft.trim();
    if (!name) {
      setError('Group name is required');
      return;
    }

    let currentFlowId = flowId;

    if (!currentFlowId) {
      if (onEnsureFlowSaved) {
        try {
          setIsLoadingBatches(true);
          currentFlowId = await onEnsureFlowSaved();
        } catch (saveErr) {
          setIsLoadingBatches(false);
          // Surface error to user instead of silently swallowing
          const errMessage = saveErr instanceof Error ? saveErr.message : 'Failed to save flow';
          setAlertMessage(errMessage);
          setShowAlertModal(true);
          return;
        }
      } else {
        setAlertMessage('Please save the flow before creating a group.');
        setShowAlertModal(true);
        return;
      }
    }

    try {
      setIsLoadingBatches(true);
      const created = await filesApi.createBatch({ name, flow_id: currentFlowId });
      setBatches(prev => [created, ...prev]);
      setBatchNameDraft('');
      
      // Auto-select the newly created batch
      setActiveBatchId(created.id);
      
      if (onFlowModified) {
        onFlowModified();
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create group');
    } finally {
      setIsLoadingBatches(false);
    }
  };

  const handleRemoveFile = async (fileId: number) => {
    try {
      await filesApi.delete(fileId);
      const nextIndividuals = individualFiles.filter((file) => file.id !== fileId);
      const nextBatchFiles = { ...batchFilesById };
      Object.entries(nextBatchFiles).forEach(([batchId, files]) => {
        const filtered = files.filter((file) => file.id !== fileId);
        if (filtered.length !== files.length) {
          nextBatchFiles[Number(batchId)] = filtered;
        }
      });

      setIndividualFiles(nextIndividuals);
      setBatchFilesById(nextBatchFiles);

      const nextFileIds = getIncludedFileIds(nextIndividuals, nextBatchFiles);
      emitFileIds(nextFileIds);
      
      if (onFlowModified) {
        onFlowModified();
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

  const handlePreview = async (fileId: number, sheetName?: string) => {
    setPreviewFileId(fileId);
    setIsPreviewLoading(true);
    try {
      const data = await filesApi.preview(fileId, sheetName);
      setPreviewData(data);
    } catch (error: any) {
      console.error('Failed to load preview:', error);
      setAlertMessage(error.response?.data?.detail || 'Failed to load preview');
      setShowAlertModal(true);
      setPreviewFileId(null);
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const handlePreviewSheetChange = (sheetName: string) => {
    if (previewFileId) {
      handlePreview(previewFileId, sheetName);
    }
  };

  const closePreview = () => {
    setPreviewData(null);
    setPreviewFileId(null);
  };

  const handleDeleteAllBatchFiles = async (batchId: number) => {
    const batchFiles = batchFilesById[batchId] || [];
    if (batchFiles.length === 0) {
      return;
    }

    setIsLoadingFiles(true);
    try {
      const fileIds = batchFiles.map((file) => file.id);
      await Promise.all(fileIds.map((fileId) => filesApi.delete(fileId)));

      const nextBatchFiles = {
        ...batchFilesById,
        [batchId]: [],
      };
      setBatchFilesById(nextBatchFiles);
      setBatches((prev) => prev.map((batch) => (
        batch.id === batchId ? { ...batch, file_count: 0 } : batch
      )));

      if (previewFileId && fileIds.includes(previewFileId)) {
        closePreview();
      }

      const nextFileIds = getIncludedFileIds(individualFiles, nextBatchFiles);
      emitFileIds(nextFileIds);
      
      if (onFlowModified) {
        onFlowModified();
      }
    } catch (error: any) {
      console.error('Failed to delete group files:', error);
      setAlertMessage(error.response?.data?.detail || 'Failed to delete group files');
      setShowAlertModal(true);
    } finally {
      setIsLoadingFiles(false);
    }
  };

  const handleDeleteAllBatches = async () => {
    if (batches.length === 0) return;

    setConfirmModal({
      title: 'Delete all groups?',
      message: `This will delete ${batches.length} group(s) and all files inside them. This cannot be undone.`,
      confirmText: 'Delete all groups',
      onConfirm: () => {
        (async () => {
          const allFileIdsInBatches = Object.values(batchFilesById).flat().map(f => f.id);

          setIsLoadingBatches(true);
          try {
            await Promise.all(batches.map(batch => filesApi.deleteBatch(batch.id)));
            
            setBatches([]);
            setBatchFilesById({});
            setActiveBatchId(null);
            
            if (previewFileId && allFileIdsInBatches.includes(previewFileId)) {
                closePreview();
            }

            // Only individual files remain
            const nextFileIds = getIncludedFileIds(individualFiles, {});
            emitFileIds(nextFileIds);
            
            if (onFlowModified) {
              onFlowModified();
            }
          } catch (error: any) {
            console.error('Failed to delete all groups:', error);
            setAlertMessage(error.response?.data?.detail || 'Failed to delete all groups');
            setShowAlertModal(true);
          } finally {
            setIsLoadingBatches(false);
          }
        })();
      }
    });
  };

  const handleDeleteAllIndividualFiles = async () => {
    if (individualFiles.length === 0) {
      return;
    }

    setIsLoadingFiles(true);
    try {
      const fileIds = individualFiles.map((file) => file.id);
      await Promise.all(fileIds.map((fileId) => filesApi.delete(fileId)));

      setIndividualFiles([]);
      if (previewFileId && fileIds.includes(previewFileId)) {
        closePreview();
      }

      const nextFileIds = getIncludedFileIds([], batchFilesById);
      emitFileIds(nextFileIds);
      
      if (onFlowModified) {
        onFlowModified();
      }
    } catch (error: any) {
      console.error('Failed to delete individual files:', error);
      setAlertMessage(error.response?.data?.detail || 'Failed to delete individual files');
      setShowAlertModal(true);
    } finally {
      setIsLoadingFiles(false);
    }
  };

  const handleClose = () => {
    setError(null);
    const nextFileIds = getIncludedFileIds(individualFiles, batchFilesById);
    emitFileIds(nextFileIds);
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
          className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] relative transform transition-all flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Upload Data</h2>
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
          <div className="p-6 overflow-y-auto">
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}
            {/* Previews are handled from the pipeline icon, not inside this modal. */}
            <div className="grid grid-cols-1 gap-6 mb-6">
              {/* Batch Section */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">File groups</h3>
                    <p className="text-xs text-gray-500">
                      Group related uploads and reuse them together.
                    </p>
                  </div>
                  {batches.length > 0 && (
                    <button
                      type="button"
                      onClick={handleDeleteAllBatches}
                      className="text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded transition-colors"
                      disabled={isUploading || isLoadingBatches}
                    >
                      Delete all groups
                    </button>
                  )}
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    type="text"
                    value={batchNameDraft}
                    onChange={(event) => setBatchNameDraft(event.target.value)}
                    placeholder="New group name"
                    className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
                    disabled={isUploading}
                  />
                  <button
                    type="button"
                    onClick={handleCreateBatch}
                    className="rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100"
                    disabled={isUploading || isLoadingBatches}
                  >
                    Create group
                  </button>
                </div>

                {isLoadingBatches ? (
                  <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                    <p className="text-sm text-gray-600">Loading groups...</p>
                  </div>
                ) : batches.length === 0 ? (
                  <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                    <p className="text-sm text-gray-600">No groups yet. Create one to start grouping files.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Active group</label>
                      <div className="flex gap-2">
                        <select
                          value={activeBatchId ?? ''}
                          onChange={(event) => {
                            const nextId = event.target.value ? Number(event.target.value) : null;
                            setActiveBatchId(nextId);
                          }}
                          className="flex-1 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
                        >
                          <option value="">Select a group</option>
                          {batches.map((batch) => (
                            <option key={batch.id} value={String(batch.id)}>
                              {batch.name} ({batch.file_count})
                            </option>
                          ))}
                        </select>
                        {activeBatchId && (
                          <button
                            type="button"
                            onClick={() => {
                              if (!activeBatchId) {
                                return;
                              }
                              setConfirmModal({
                                title: 'Delete group?',
                                message: 'This deletes the group and all files inside it. This cannot be undone.',
                                confirmText: 'Delete group',
                                onConfirm: () => {
                                  (async () => {
                                    try {
                                      setIsLoadingBatches(true);
                                      await filesApi.deleteBatch(activeBatchId);

                                      setBatches((prev) => prev.filter((batch) => batch.id !== activeBatchId));
                                      setBatchFilesById((prev) => {
                                        const next = { ...prev };
                                        delete next[activeBatchId];
                                        return next;
                                      });
                                      setActiveBatchId(null);

                                      const nextFileIds = getIncludedFileIds(
                                        individualFiles,
                                        { ...batchFilesById, [activeBatchId]: [] }
                                      );
                                      emitFileIds(nextFileIds);
                                      
                                      if (onFlowModified) {
                                        onFlowModified();
                                      }
                                    } catch (err: any) {
                                      console.error('Failed to delete group:', err);
                                      setAlertMessage(err.response?.data?.detail || 'Failed to delete group');
                                      setShowAlertModal(true);
                                    } finally {
                                      setIsLoadingBatches(false);
                                    }
                                  })();
                                },
                              });
                            }}
                            className="px-3 py-2 text-red-600 bg-red-50 hover:bg-red-100 rounded-md border border-red-200 transition-colors"
                            title="Delete group"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>

                  </div>
                )}

                {activeBatchId ? (
                  <div className="space-y-3">
                    <label className="flex flex-col items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-indigo-400 hover:from-indigo-50 hover:to-indigo-100 transition-all duration-200 min-h-[220px] p-6 group">
                      <div className="flex flex-col items-center justify-center text-center">
                        {isUploading ? (
                          <>
                            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mb-3"></div>
                            <div className="text-gray-700 font-medium">Uploading...</div>
                          </>
                        ) : (
                          <>
                            <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center mb-3 group-hover:bg-indigo-200 transition-colors">
                              <svg
                                className="w-6 h-6 text-indigo-600"
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
                            <p className="text-sm font-semibold text-gray-900 mb-1">
                              Upload to group
                            </p>
                            <p className="text-xs text-gray-500">
                              Excel (.xlsx, .xls) or CSV (multiple files)
                            </p>
                          </>
                        )}
                      </div>
                      <input
                        type="file"
                        className="hidden"
                        accept=".xlsx,.xls,.csv"
                        onChange={(event) => handleBatchFileChange(activeBatchId, event)}
                        disabled={isUploading}
                        multiple
                      />
                    </label>

                    {isLoadingFiles ? (
                      <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                        <p className="text-sm text-gray-600">Loading files...</p>
                      </div>
                    ) : (batchFilesById[activeBatchId] || []).length > 0 ? (
                      <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-gray-700">
                          Group files ({(batchFilesById[activeBatchId] || []).length}):
                        </p>
                        <div className="flex items-center gap-3">
                          {(batchFilesById[activeBatchId] || []).length > MAX_VISIBLE_FILES && (
                            <button
                              type="button"
                              onClick={() => setShowAllBatchFiles((prev) => !prev)}
                              className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                            >
                              {showAllBatchFiles
                                ? 'Show less'
                                : `Show all (${(batchFilesById[activeBatchId] || []).length})`}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              const batchFiles = batchFilesById[activeBatchId] || [];
                              if (batchFiles.length === 0) {
                                return;
                              }
                              setConfirmModal({
                                title: 'Delete all group files?',
                                message: `This removes ${batchFiles.length} file(s) from this group and the flow. This cannot be undone.`,
                                confirmText: 'Delete all',
                                onConfirm: () => {
                                  void handleDeleteAllBatchFiles(activeBatchId);
                                },
                              });
                            }}
                            className="text-xs font-semibold text-red-600 hover:text-red-700 disabled:text-gray-300"
                            disabled={isUploading || isLoadingFiles}
                          >
                            Delete all
                          </button>
                        </div>
                      </div>
                        <div className="max-h-40 overflow-y-auto space-y-1">
                          {(showAllBatchFiles
                            ? (batchFilesById[activeBatchId] || [])
                            : (batchFilesById[activeBatchId] || []).slice(0, MAX_VISIBLE_FILES)
                          ).map((file) => (
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
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => handlePreview(file.id)}
                                  className="text-gray-400 hover:text-indigo-600"
                                  title="Preview file"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                  </svg>
                                </button>
                                <button
                                  onClick={() => handleRemoveFile(file.id)}
                                  className="text-red-600 hover:text-red-800 text-sm font-bold"
                                  title="Remove file"
                                >
                                  ×
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg">
                        <p className="text-sm text-gray-600">No files in this group yet.</p>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>

              {/* Individual Section */}
              <div className="flex flex-col">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">Single files</h3>
                    <p className="text-xs text-gray-500">
                      Upload one-offs that are not part of a group.
                    </p>
                  </div>
                </div>
                <label className="flex-1 flex flex-col items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-indigo-400 hover:from-indigo-50 hover:to-indigo-100 transition-all duration-200 min-h-[240px] p-6 group">
                  <div className="flex flex-col items-center justify-center text-center">
                    {isUploading ? (
                      <>
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mb-3"></div>
                        <div className="text-gray-700 font-medium">Uploading...</div>
                      </>
                    ) : (
                      <>
                        <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center mb-3 group-hover:bg-indigo-200 transition-colors">
                          <svg
                            className="w-6 h-6 text-indigo-600"
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
                        <p className="text-sm font-semibold text-gray-900 mb-1">
                          Upload single files
                        </p>
                        <p className="text-xs text-gray-500">
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
                {isLoadingFiles ? (
                  <div className="mt-3 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                    <p className="text-sm text-gray-600">Loading files...</p>
                  </div>
                ) : individualFiles.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-700">
                        Single files ({individualFiles.length}):
                      </p>
                      <div className="flex items-center gap-3">
                        {individualFiles.length > MAX_VISIBLE_FILES && (
                          <button
                            type="button"
                            onClick={() => setShowAllIndividualFiles((prev) => !prev)}
                            className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                          >
                            {showAllIndividualFiles
                              ? 'Show less'
                              : `Show all (${individualFiles.length})`}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            if (individualFiles.length === 0) {
                              return;
                            }
                            setConfirmModal({
                              title: 'Delete all individual files?',
                              message: `This removes ${individualFiles.length} file(s) from the flow. This cannot be undone.`,
                              confirmText: 'Delete all',
                              onConfirm: () => {
                                void handleDeleteAllIndividualFiles();
                              },
                            });
                          }}
                          className="text-xs font-semibold text-red-600 hover:text-red-700 disabled:text-gray-300"
                          disabled={isUploading || isLoadingFiles}
                        >
                          Delete all
                        </button>
                      </div>
                    </div>
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {(showAllIndividualFiles
                        ? individualFiles
                        : individualFiles.slice(0, MAX_VISIBLE_FILES)
                      ).map((file) => (
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
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handlePreview(file.id)}
                              className="text-gray-400 hover:text-indigo-600"
                              title="Preview file"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleRemoveFile(file.id)}
                              className="text-red-600 hover:text-red-800 text-sm font-bold"
                              title="Remove file"
                            >
                              ×
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
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

      {/* Confirm Modal */}
      <ConfirmationModal
        isOpen={Boolean(confirmModal)}
        onClose={() => setConfirmModal(null)}
        onConfirm={confirmModal?.onConfirm}
        title={confirmModal?.title ?? ''}
        message={confirmModal?.message ?? ''}
        type="confirm"
        confirmText={confirmModal?.confirmText ?? 'Confirm'}
      />

      {/* Preview Modal Overlay */}
      {(previewData || isPreviewLoading) && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl h-[80vh] flex flex-col relative animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                File Preview
                {previewData?.current_sheet && (
                  <span className="ml-2 text-sm font-normal text-gray-500">
                    - {previewData.current_sheet}
                  </span>
                )}
              </h3>
              <button
                onClick={closePreview}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label="Close preview"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="flex-1 overflow-hidden p-4">
              <DataPreview
                preview={previewData}
                isLoading={isPreviewLoading}
                onSheetChange={handlePreviewSheetChange}
                currentSheet={previewData?.current_sheet}
              />
            </div>
          </div>
        </div>
      )}

    </>
  );
};
