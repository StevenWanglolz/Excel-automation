import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FlowCanvas } from './FlowCanvas';
import { BlockPalette } from './BlockPalette';
import { DataUploadModal } from './DataUploadModal';
import { ConfirmationModal, type ModalType } from '../Common/ConfirmationModal';
import { useFlowStore } from '../../store/flowStore';
import { flowsApi, type Flow } from '../../api/flows';

export const FlowBuilder = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { nodes, edges, getFlowData, clearFlow, loadFlowData, updateNode } = useFlowStore();
  const [flowName, setFlowName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [savedFlows, setSavedFlows] = useState<Flow[]>([]);
  const [selectedFlowId, setSelectedFlowId] = useState<number | null>(null);
  const [isLoadingFlows, setIsLoadingFlows] = useState(false);
  const [showFlowList, setShowFlowList] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmModalConfig, setConfirmModalConfig] = useState<{
    type: ModalType;
    title: string;
    message: string;
    onConfirm?: () => void;
    onDiscard?: () => void;
    confirmText?: string;
    discardText?: string;
  } | null>(null);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isFileUploading, setIsFileUploading] = useState(false);
  const savedFlowDataRef = useRef<string>('');
  const hasUnsavedChangesRef = useRef(false);

  const showModal = (type: ModalType, title: string, message: string, onConfirm?: () => void, confirmText?: string) => {
    setConfirmModalConfig({ type, title, message, onConfirm, confirmText });
    setShowConfirmModal(true);
  };

  const handleLoadFlowById = async (flowId: number) => {
    try {
      const fullFlow = await flowsApi.get(flowId);
      loadFlowData(fullFlow.flow_data);
      setFlowName(fullFlow.name);
      setSelectedFlowId(fullFlow.id);
      savedFlowDataRef.current = JSON.stringify(fullFlow.flow_data);
      hasUnsavedChangesRef.current = false;
      setHasUnsavedChanges(false);
    } catch (error) {
      console.error('Failed to load flow:', error);
      showModal('error', 'Error', 'Failed to load flow');
    }
  };

  useEffect(() => {
    loadFlows();
    // Initialize saved flow data reference on mount
    savedFlowDataRef.current = JSON.stringify(getFlowData());
    hasUnsavedChangesRef.current = false;
    setHasUnsavedChanges(false);
  }, []);

  // Track unsaved changes
  useEffect(() => {
    const currentFlowData = JSON.stringify(getFlowData());
    // Only mark as unsaved if there's a meaningful difference from saved state
    // Don't mark as unsaved just because there are nodes - wait for actual changes
    const hasChanges = currentFlowData !== savedFlowDataRef.current;
    hasUnsavedChangesRef.current = hasChanges;
    setHasUnsavedChanges(hasChanges);
  }, [nodes, edges, flowName, selectedFlowId, getFlowData]);

  // Update saved flow data reference after save/load
  useEffect(() => {
    if (selectedFlowId && nodes.length > 0) {
      savedFlowDataRef.current = JSON.stringify(getFlowData());
      hasUnsavedChangesRef.current = false;
      setHasUnsavedChanges(false);
    }
  }, [selectedFlowId]);

  // Handle browser back/forward and page unload
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Always suppress warning when modal is open or file is uploading
      // This prevents the dialog from appearing during file operations
      if (isModalOpen || isFileUploading) {
        return; // Don't prevent default, just return early
      }
      
      // Only show warning if there are unsaved changes and modal is closed
      if (hasUnsavedChangesRef.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isFileUploading, isModalOpen]);

  const handleCancelNavigation = () => {
    setShowConfirmModal(false);
    setPendingNavigation(null);
  };

  const handleDiscardAndLeave = () => {
    hasUnsavedChangesRef.current = false;
    if (pendingNavigation) {
      navigate(pendingNavigation);
    }
    setShowConfirmModal(false);
    setPendingNavigation(null);
  };

  useEffect(() => {
    // Load flow from URL parameter if present
    const flowIdParam = searchParams.get('flow');
    if (flowIdParam) {
      const flowId = parseInt(flowIdParam, 10);
      if (!isNaN(flowId) && flowId !== selectedFlowId) {
        // Only load if it's a different flow than currently selected
        handleLoadFlowById(flowId);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    // Close dropdown when clicking outside
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.flow-list-dropdown')) {
        setShowFlowList(false);
      }
    };

    if (showFlowList) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showFlowList]);

  const loadFlows = async () => {
    setIsLoadingFlows(true);
    try {
      const flows = await flowsApi.list();
      setSavedFlows(flows);
    } catch (error) {
      console.error('Failed to load flows:', error);
    } finally {
      setIsLoadingFlows(false);
    }
  };

  const handleSave = async () => {
    if (!flowName.trim()) {
      showModal('alert', 'Validation Error', 'Please enter a flow name');
      return;
    }

    setIsSaving(true);
    try {
      const flowData = getFlowData();
      
      if (selectedFlowId) {
        // Update existing flow
        await flowsApi.update(selectedFlowId, {
          name: flowName,
          description: '',
          flow_data: flowData,
        });
        savedFlowDataRef.current = JSON.stringify(flowData);
        hasUnsavedChangesRef.current = false;
      setHasUnsavedChanges(false);
        showModal('success', 'Success', 'Flow updated successfully!');
      } else {
        // Create new flow
      await flowsApi.create({
        name: flowName,
        description: '',
        flow_data: flowData,
      });
        savedFlowDataRef.current = JSON.stringify(flowData);
        hasUnsavedChangesRef.current = false;
      setHasUnsavedChanges(false);
        showModal('success', 'Success', 'Flow saved successfully!');
      setFlowName('');
        setSelectedFlowId(null);
      }
      
      await loadFlows();
    } catch (error) {
      console.error('Failed to save flow:', error);
      showModal('error', 'Error', 'Failed to save flow');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoadFlow = async (flow: Flow) => {
    // Check for unsaved changes before loading
    if (hasUnsavedChangesRef.current) {
      setShowConfirmModal(true);
      setConfirmModalConfig({
        type: 'confirm',
        title: 'Unsaved Changes',
        message: 'You have unsaved changes. Do you want to save before loading a different flow?',
        confirmText: 'Save & Load',
        onConfirm: async () => {
          if (flowName.trim()) {
            await handleSave();
          }
          await loadFlowInternal(flow);
        },
      });
      return;
    }
    await loadFlowInternal(flow);
  };

  const loadFlowInternal = async (flow: Flow) => {
    try {
      const fullFlow = await flowsApi.get(flow.id);
      loadFlowData(fullFlow.flow_data);
      setFlowName(fullFlow.name);
      setSelectedFlowId(fullFlow.id);
      setShowFlowList(false);
      savedFlowDataRef.current = JSON.stringify(fullFlow.flow_data);
      hasUnsavedChangesRef.current = false;
      setHasUnsavedChanges(false);
    } catch (error) {
      console.error('Failed to load flow:', error);
      showModal('error', 'Error', 'Failed to load flow');
    }
  };

  const handleNewFlow = () => {
    if (hasUnsavedChangesRef.current) {
      setShowConfirmModal(true);
      setConfirmModalConfig({
        type: 'confirm',
        title: 'Unsaved Changes',
        message: 'You have unsaved changes. Do you want to save before creating a new flow?',
        confirmText: 'Save & New',
        onConfirm: async () => {
          if (flowName.trim()) {
            await handleSave();
          }
          clearFlowInternal();
        },
      });
      return;
    }
    clearFlowInternal();
  };

  const clearFlowInternal = () => {
    clearFlow();
    setFlowName('');
    setSelectedFlowId(null);
    setShowFlowList(false);
    savedFlowDataRef.current = '';
    hasUnsavedChangesRef.current = false;
    // Clear the flow parameter from URL to prevent auto-reloading
    if (searchParams.get('flow')) {
      navigate('/flow-builder', { replace: true });
    }
  };

  const handleDeleteFlow = async (flowId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setShowConfirmModal(true);
    setConfirmModalConfig({
      type: 'confirm',
      title: 'Delete Flow',
      message: 'Are you sure you want to delete this flow? This action cannot be undone.',
      confirmText: 'Delete',
      onConfirm: async () => {
        try {
          await flowsApi.delete(flowId);
          if (selectedFlowId === flowId) {
            clearFlowInternal();
          }
          await loadFlows();
          showModal('success', 'Success', 'Flow deleted successfully!');
        } catch (error) {
          console.error('Failed to delete flow:', error);
          showModal('error', 'Error', 'Failed to delete flow');
        }
      },
    });
  };

  const handleNodeClick = (nodeId: string, nodeType: string) => {
    // Open modal for upload/data nodes
    if (nodeType === 'upload' || nodeType === 'data') {
      setSelectedNodeId(nodeId);
      setIsModalOpen(true);
    }
  };

  const handleFileUploaded = (fileIds: number[]) => {
    // Update the node data with the file IDs array
    // Note: Don't mark as unsaved changes here - wait until modal closes
    // This prevents beforeunload from triggering during file operations
    if (selectedNodeId) {
      const node = nodes.find((n) => n.id === selectedNodeId);
      if (node) {
        // Store file IDs array in node data so it persists when flow is saved
        updateNode(selectedNodeId, {
          data: {
            ...node.data,
            fileIds: fileIds
          }
        });
        // Mark as unsaved changes only after upload completes and modal is still open
        // This will be handled when the modal closes
        console.log(`Files ${fileIds.join(', ')} uploaded for node ${selectedNodeId}`);
      }
    }
  };

  const getNodeFileIds = (nodeId: string): number[] => {
    const node = nodes.find((n) => n.id === nodeId);
    if (node?.data?.fileIds && Array.isArray(node.data.fileIds)) {
      return node.data.fileIds;
    }
    // Backward compatibility: check for single fileId
    if (node?.data?.fileId) {
      return [node.data.fileId];
    }
    return [];
  };

  return (
    <div className="flex h-screen bg-gray-100">
      <BlockPalette />
      <div className="flex-1 flex flex-col">
        <div className="bg-white border-b border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => {
                  if (hasUnsavedChangesRef.current) {
                    setPendingNavigation('/');
                    setShowConfirmModal(true);
                    setConfirmModalConfig({
                      type: 'confirm',
                      title: 'Unsaved Changes',
                      message: 'You have unsaved changes. Do you want to save before leaving?',
                      confirmText: 'Save & Leave',
                      onConfirm: async () => {
                        if (flowName.trim()) {
                          await handleSave();
                        }
                        hasUnsavedChangesRef.current = false;
      setHasUnsavedChanges(false);
                        navigate('/');
                      },
                      onDiscard: () => {
                        hasUnsavedChangesRef.current = false;
      setHasUnsavedChanges(false);
                        navigate('/');
                      },
                      discardText: 'Discard',
                    });
                  } else {
                    navigate('/');
                  }
                }}
                className="px-3 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
                title="Back to Dashboard"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </button>
            <h1 className="text-xl font-bold">Flow Builder</h1>
            </div>
            <div className="flex items-center space-x-4">
              <div className="relative flow-list-dropdown">
                <button
                  onClick={() => setShowFlowList(!showFlowList)}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm flex items-center space-x-2"
                >
                  <span>📋 Saved Flows</span>
                  <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded">
                    {savedFlows.length}
                  </span>
                </button>
                {showFlowList && (
                  <div className="absolute top-full right-0 mt-2 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto flow-list-dropdown">
                    <div className="p-2 border-b border-gray-200">
                      <button
                        onClick={handleNewFlow}
                        className="w-full px-3 py-2 text-left text-sm text-indigo-600 hover:bg-indigo-50 rounded"
                      >
                        + New Flow
                      </button>
                    </div>
                    {isLoadingFlows ? (
                      <div className="p-4 text-center text-sm text-gray-500">Loading...</div>
                    ) : savedFlows.length === 0 ? (
                      <div className="p-4 text-center text-sm text-gray-500">No saved flows</div>
                    ) : (
                      <div className="divide-y divide-gray-200">
                        {savedFlows.map((flow) => (
                          <div
                            key={flow.id}
                            onClick={() => handleLoadFlow(flow)}
                            className={`p-3 cursor-pointer hover:bg-gray-50 ${
                              selectedFlowId === flow.id ? 'bg-indigo-50' : ''
                            }`}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <p className="text-sm font-medium text-gray-900">{flow.name}</p>
                                {flow.description && (
                                  <p className="text-xs text-gray-500 mt-1">{flow.description}</p>
                                )}
                                <p className="text-xs text-gray-400 mt-1">
                                  {new Date(flow.created_at).toLocaleDateString()}
                                </p>
                              </div>
                              <button
                                onClick={(e) => handleDeleteFlow(flow.id, e)}
                                className="ml-2 text-red-600 hover:text-red-800 text-sm"
                                title="Delete flow"
                              >
                                ×
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <input
                type="text"
                placeholder="Flow name"
                value={flowName}
                onChange={(e) => setFlowName(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
              <button
                onClick={handleSave}
                disabled={isSaving || !flowName.trim() || (selectedFlowId && !hasUnsavedChanges)}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                title={selectedFlowId && !hasUnsavedChangesRef.current ? 'No changes to save' : ''}
              >
                {isSaving ? 'Saving...' : selectedFlowId ? 'Update Flow' : 'Save Flow'}
              </button>
              <button
                onClick={() => {
                  if (hasUnsavedChangesRef.current) {
                    setShowConfirmModal(true);
                    setConfirmModalConfig({
                      type: 'confirm',
                      title: 'Clear Flow',
                      message: 'Are you sure you want to clear the current flow? All unsaved changes will be lost.',
                      confirmText: 'Clear',
                      onConfirm: () => {
                        clearFlowInternal();
                      },
                    });
                  } else {
                    clearFlowInternal();
                  }
                }}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
              >
                Clear
              </button>
            </div>
          </div>
        </div>
        <div className="flex-1 relative">
          <FlowCanvas onNodeClick={handleNodeClick} />
        </div>
      </div>
      
      {/* Data Upload Modal */}
      <DataUploadModal
        isOpen={isModalOpen}
        onClose={() => {
          // Mark as unsaved changes when modal closes if files were uploaded
          if (selectedNodeId) {
            const node = nodes.find((n) => n.id === selectedNodeId);
            if (node?.data?.fileIds && Array.isArray(node.data.fileIds) && node.data.fileIds.length > 0) {
              hasUnsavedChangesRef.current = true;
              setHasUnsavedChanges(true);
            }
          }
          setIsModalOpen(false);
          setSelectedNodeId(null);
          setIsFileUploading(false);
        }}
        nodeId={selectedNodeId || ''}
        onFileUploaded={handleFileUploaded}
        initialFileIds={selectedNodeId ? getNodeFileIds(selectedNodeId) : []}
        onUploadStart={() => setIsFileUploading(true)}
        onUploadEnd={() => setIsFileUploading(false)}
      />

      {/* Confirmation Modal */}
      {showConfirmModal && confirmModalConfig && (
        <ConfirmationModal
          isOpen={showConfirmModal}
          onClose={() => {
            if (pendingNavigation) {
              handleCancelNavigation();
            } else {
              setShowConfirmModal(false);
            }
          }}
          onConfirm={() => {
            if (confirmModalConfig.onConfirm) {
              confirmModalConfig.onConfirm();
            } else if (pendingNavigation) {
              handleDiscardAndLeave();
            } else {
              setShowConfirmModal(false);
            }
          }}
          title={confirmModalConfig.title}
          message={confirmModalConfig.message}
          type={confirmModalConfig.type}
          onDiscard={confirmModalConfig.onDiscard}
          discardText={confirmModalConfig.discardText}
          showCancel={confirmModalConfig.type !== 'alert' && confirmModalConfig.type !== 'success'}
          cancelText="Cancel"
          confirmText={confirmModalConfig.type === 'success' ? 'OK' : confirmModalConfig.confirmText}
        />
      )}
    </div>
  );
};


