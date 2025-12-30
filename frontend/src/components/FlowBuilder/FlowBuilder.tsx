import { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FlowCanvas } from './FlowCanvas';
import { DataUploadModal } from './DataUploadModal';
import { PropertiesPanel } from './PropertiesPanel';
import { OperationSelectionModal } from './OperationSelectionModal';
import { ConfirmationModal, type ModalType } from '../Common/ConfirmationModal';
import { useFlowStore } from '../../store/flowStore';
import { flowsApi } from '../../api/flows';
import type { Flow } from '../../types';
import { Node } from '@xyflow/react';
import { useUndoRedo } from '../../hooks/useUndoRedo';

export const FlowBuilder = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { nodes, edges, getFlowData, loadFlowData, updateNode, addNode, setNodes, setEdges, addEdge } = useFlowStore();
  const [flowName, setFlowName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [savedFlows, setSavedFlows] = useState<Flow[]>([]);
  const [selectedFlowId, setSelectedFlowId] = useState<number | null>(null);
  const [isLoadingFlows, setIsLoadingFlows] = useState(false);
  const [showFlowList, setShowFlowList] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isOperationModalOpen, setIsOperationModalOpen] = useState(false);
  const [operationAfterNodeId, setOperationAfterNodeId] = useState<string | null>(null);
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
  const historyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isUndoRedoInProgressRef = useRef(false);
  const hasInitializedRef = useRef(false);

  // Undo/Redo system
  const { addToHistory, undo, redo, canUndo, canRedo, reset } = useUndoRedo({
    nodes: getFlowData().nodes,
    edges: getFlowData().edges,
  });

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
      // Save state including flowName for comparison
      savedFlowDataRef.current = JSON.stringify({ ...fullFlow.flow_data, flowName: fullFlow.name });
      hasUnsavedChangesRef.current = false;
      setHasUnsavedChanges(false);
    } catch (error) {
      console.error('Failed to load flow:', error);
      showModal('error', 'Error', 'Failed to load flow');
    }
  };

  // Track changes for undo/redo (debounced to avoid too many history entries)
  useEffect(() => {
    // Don't track history if we're in the middle of an undo/redo operation
    if (isUndoRedoInProgressRef.current) {
      return;
    }
    
    // Clear existing timeout
    if (historyTimeoutRef.current) {
      clearTimeout(historyTimeoutRef.current);
    }
    
    // Debounce history updates to avoid excessive entries
    historyTimeoutRef.current = setTimeout(() => {
      // Double-check flag in case it was set during the timeout
      if (!isUndoRedoInProgressRef.current) {
        const flowData = getFlowData();
        addToHistory({
          nodes: flowData.nodes,
          edges: flowData.edges,
        });
      }
    }, 300);

    return () => {
      if (historyTimeoutRef.current) {
        clearTimeout(historyTimeoutRef.current);
      }
    };
  }, [nodes, edges, addToHistory, getFlowData]);

  const handleUndo = useCallback(() => {
    if (!canUndo) {
      return;
    }
    const previousState = undo();
    if (previousState?.nodes && previousState?.edges) {
      // Set flag to prevent history tracking during undo
      isUndoRedoInProgressRef.current = true;
      // Use loadFlowData to ensure proper formatting
      loadFlowData({
        nodes: previousState.nodes,
        edges: previousState.edges,
      });
      hasUnsavedChangesRef.current = true;
      setHasUnsavedChanges(true);
      // Reset flag after a delay to allow state to settle
      setTimeout(() => {
        isUndoRedoInProgressRef.current = false;
      }, 500);
    }
  }, [canUndo, undo, loadFlowData]);

  const handleRedo = useCallback(() => {
    if (!canRedo) {
      return;
    }
    const nextState = redo();
    if (nextState?.nodes && nextState?.edges) {
      // Set flag to prevent history tracking during redo
      isUndoRedoInProgressRef.current = true;
      // Use loadFlowData to ensure proper formatting
      loadFlowData({
        nodes: nextState.nodes,
        edges: nextState.edges,
      });
      hasUnsavedChangesRef.current = true;
      setHasUnsavedChanges(true);
      // Reset flag after a delay to allow state to settle
      setTimeout(() => {
        isUndoRedoInProgressRef.current = false;
      }, 500);
    }
  }, [canRedo, redo, loadFlowData]);

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Ctrl+Z (Windows/Linux) or Cmd+Z (Mac) for undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
      // Check for Ctrl+Shift+Z or Cmd+Shift+Z for redo
      else if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z') && e.shiftKey) {
        e.preventDefault();
        handleRedo();
      }
    };

    globalThis.addEventListener('keydown', handleKeyDown);
    return () => globalThis.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

  useEffect(() => {
    loadFlows();
    
    // Initialize saved flow data reference on mount
    savedFlowDataRef.current = JSON.stringify(getFlowData());
    hasUnsavedChangesRef.current = false;
    setHasUnsavedChanges(false);
  }, []);

  // Track unsaved changes
  useEffect(() => {
    // For new flows (no selectedFlowId), always allow saving if there are nodes
    if (!selectedFlowId) {
      const isSingleSource =
        nodes.length === 1 &&
        nodes[0]?.id === 'source-0' &&
        nodes[0]?.type === 'source';
      const sourceData = nodes[0]?.data;
      const hasUploadedFiles =
        Array.isArray(sourceData?.fileIds) ? sourceData.fileIds.length > 0 : Boolean(sourceData?.fileId);
      const hasChanges =
        flowName.trim().length > 0 ||
        edges.length > 0 ||
        nodes.length > 1 ||
        !isSingleSource ||
        hasUploadedFiles;

      hasUnsavedChangesRef.current = hasChanges;
      setHasUnsavedChanges(hasChanges);
      return;
    }
    
    // For existing flows, compare with saved state
    // Skip change detection if we're loading a flow or if there's no saved state yet
    if (!savedFlowDataRef.current) {
      // Don't mark as unsaved if we haven't loaded the saved state yet
      return;
    }
    
    // Get current flow data and saved flow data
    const currentFlowData = getFlowData();
    const savedFlowData = JSON.parse(savedFlowDataRef.current);
    
    // Compare flow data excluding positions (position changes don't count as unsaved changes)
    const currentForComparison = {
      nodes: currentFlowData.nodes.map((node: { position: { x: number; y: number }; [key: string]: any }) => {
        const { position: _position, ...rest } = node;
        return rest;
      }),
      edges: currentFlowData.edges,
      flowName: flowName
    };
    
    const savedForComparison = {
      nodes: (savedFlowData.nodes || []).map((node: { position: { x: number; y: number }; [key: string]: any }) => {
        const { position: _position, ...rest } = node;
        return rest;
      }),
      edges: savedFlowData.edges || [],
      flowName: savedFlowData.flowName || ''
    };
    
    // Only mark as unsaved if there's a meaningful difference (excluding positions)
    const hasChanges = JSON.stringify(currentForComparison) !== JSON.stringify(savedForComparison);
    hasUnsavedChangesRef.current = hasChanges;
    setHasUnsavedChanges(hasChanges);
  }, [nodes, edges, flowName, selectedFlowId, getFlowData]);

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

  useLayoutEffect(() => {
    const isNewFlow = searchParams.get('new') === '1';

    if (isNewFlow) {
      clearFlowInternal();
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('new');
      const nextQuery = nextParams.toString();
      navigate(nextQuery ? `/flow-builder?${nextQuery}` : '/flow-builder', { replace: true });
      return;
    }

    // Load flow from URL parameter if present
    const flowIdParam = searchParams.get('flow');
    if (flowIdParam) {
      const flowId = Number.parseInt(flowIdParam, 10);
      if (!Number.isNaN(flowId) && flowId !== selectedFlowId) {
        // Only load if it's a different flow than currently selected
        handleLoadFlowById(flowId);
        hasInitializedRef.current = true;
      }
      return;
    }
    // No flow parameter - ensure a clean, single-source starting state
    // This prevents stale nodes from a previous flow from carrying over
    if (!selectedFlowId) {
      const hasSingleSource =
        nodes.length === 1 &&
        nodes[0]?.id === 'source-0' &&
        nodes[0]?.type === 'source';

      if (!hasSingleSource) {
        clearFlowInternal();
      } else {
        hasInitializedRef.current = true;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, selectedFlowId]);

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
        // Save state including flowName for comparison
        savedFlowDataRef.current = JSON.stringify({ ...flowData, flowName });
        hasUnsavedChangesRef.current = false;
      setHasUnsavedChanges(false);
        showModal('success', 'Success', 'Flow updated successfully!');
      } else {
        // Create new flow
        const createdFlow = await flowsApi.create({
          name: flowName,
          description: '',
          flow_data: flowData,
        });
        // Save state including flowName for comparison
        savedFlowDataRef.current = JSON.stringify({ ...flowData, flowName });
        hasUnsavedChangesRef.current = false;
        setHasUnsavedChanges(false);
        setSelectedFlowId(createdFlow.id);
        setFlowName(createdFlow.name);
        showModal('success', 'Success', 'Flow saved successfully!');
      }
      
      await loadFlows();
      
              // Reset undo/redo history after save
              reset({
                nodes: flowData.nodes,
                edges: flowData.edges,
              });
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
        onConfirm: () => {
          (async () => {
            if (flowName.trim()) {
              await handleSave();
            }
            await loadFlowInternal(flow);
          })();
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
      // Save state including flowName for comparison
      savedFlowDataRef.current = JSON.stringify({ ...fullFlow.flow_data, flowName: fullFlow.name });
      hasUnsavedChangesRef.current = false;
      setHasUnsavedChanges(false);
      
      // Reset undo/redo history when loading a flow
      reset({
        nodes: fullFlow.flow_data.nodes,
        edges: fullFlow.flow_data.edges,
      });
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
        onConfirm: () => {
          (async () => {
            if (flowName.trim()) {
              await handleSave();
            }
            clearFlowInternal();
          })();
        },
      });
      return;
    }
    clearFlowInternal();
  };

  const clearFlowInternal = () => {
    // Initialize with source node (required for the flow design)
    const sourceNode: Node = {
      id: 'source-0',
      type: 'source',
      position: { x: 250, y: 250 },
      data: {
        blockType: 'source',
        config: {},
        label: 'Data',
      },
    };
    
    // Use setNodes for atomic state update
    // Always reset to a single source node when starting a new flow
    setNodes([sourceNode]);
    setEdges([]);
    
    // Reset other state
    setFlowName('');
    setSelectedFlowId(null);
    setShowFlowList(false);
    savedFlowDataRef.current = '';
    hasUnsavedChangesRef.current = false;
    hasInitializedRef.current = true;
    
    // Reset undo/redo history
    reset({
      nodes: [{
        id: sourceNode.id,
        type: sourceNode.type || 'source',
        position: sourceNode.position,
        data: {
          blockType: 'source',
          config: {},
          label: 'Data',
        },
      }],
      edges: [],
    });
    
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
      onConfirm: () => {
        (async () => {
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
        })();
      },
    });
  };

  const handleNodeClick = (nodeId: string, nodeType: string) => {
    // Set selected node for properties panel
    setSelectedNodeId(nodeId);
    
    // Open modal for upload/data/source nodes (for file upload)
    if (nodeType === 'upload' || nodeType === 'data' || nodeType === 'source') {
      setIsModalOpen(true);
    }
  };

  const handleClosePropertiesPanel = () => {
    setSelectedNodeId(null);
  };

  // Handle add operation button click
  const handleAddOperation = useCallback((nodeId: string) => {
    setOperationAfterNodeId(nodeId);
    setIsOperationModalOpen(true);
  }, []);

  // Map operation ID to node type and blockType
  const getNodeTypeFromOperation = (operationId: string): { type: string; blockType: string } => {
    const mapping: Record<string, { type: string; blockType: string }> = {
      'remove-column': { type: 'transform', blockType: 'remove_column' },
      'rename-column': { type: 'transform', blockType: 'rename_columns' },
      'rearrange-column': { type: 'transform', blockType: 'rearrange_columns' },
      'sort-rows': { type: 'transform', blockType: 'sort_rows' },
      'remove-duplicates': { type: 'transform', blockType: 'remove_duplicates' },
      'filter-rows': { type: 'filter', blockType: 'filter' },
      'delete-rows': { type: 'filter', blockType: 'delete_rows' },
      'join-lookup': { type: 'transform', blockType: 'join' },
    };
    return mapping[operationId] || { type: 'transform', blockType: operationId };
  };

  // Handle operation selection from modal
  const handleOperationSelect = (operation: { id: string; label: string; type: string }) => {
    if (!operationAfterNodeId) return;

    const afterNode = nodes.find((n) => n.id === operationAfterNodeId);
    if (!afterNode) return;

    const { type, blockType } = getNodeTypeFromOperation(operation.id);
    
    // Node dimensions for collision detection
    const NODE_WIDTH = 200;
    const NODE_HEIGHT = 150;
    const HORIZONTAL_SPACING = 80; // Spacing between nodes horizontally
    const PADDING = 20; // Minimum padding between nodes
    
    // Helper function to check if two rectangles overlap
    const checkOverlap = (pos1: { x: number; y: number }, pos2: { x: number; y: number }): boolean => {
      return !(
        pos1.x + NODE_WIDTH + PADDING < pos2.x ||
        pos2.x + NODE_WIDTH + PADDING < pos1.x ||
        pos1.y + NODE_HEIGHT + PADDING < pos2.y ||
        pos2.y + NODE_HEIGHT + PADDING < pos1.y
      );
    };
    
    // Find all child nodes of the afterNode (nodes connected from afterNode)
    const childNodeIds = new Set(
      edges
        .filter(edge => edge.source === afterNode.id)
        .map(edge => edge.target)
    );
    
    const childNodes = nodes.filter(node => childNodeIds.has(node.id));
    
    // Find the rightmost child node (node with maximum x + width)
    const rightmostChildNode = childNodes.length > 0
      ? childNodes.reduce((rightmost, node) => {
          const rightmostRight = rightmost.position.x + NODE_WIDTH;
          const nodeRight = node.position.x + NODE_WIDTH;
          return nodeRight > rightmostRight ? node : rightmost;
        }, childNodes[0])
      : null;
    
    // If there are no child nodes, position below the parent
    // Otherwise, position at the same y level as the rightmost child, to the right of it
    let candidateY: number;
    let candidateX: number;
    
    if (rightmostChildNode) {
      // Position at same y level as rightmost child, to the right of it
      candidateY = rightmostChildNode.position.y;
      candidateX = rightmostChildNode.position.x + NODE_WIDTH + HORIZONTAL_SPACING;
    } else {
      // No children yet, position below the parent
      candidateY = afterNode.position.y + 200;
      candidateX = afterNode.position.x;
    }
    
    // Find a position that doesn't overlap with existing nodes
    let foundPosition = false;
    let maxAttempts = 20; // Prevent infinite loop
    let attempts = 0;
    
    while (!foundPosition && attempts < maxAttempts) {
      const candidatePosition = { x: candidateX, y: candidateY };
      
      // Check if this position overlaps with any existing node
      const overlaps = nodes.some(node => {
        if (node.id === afterNode.id) return false; // Skip the node we're adding after
        return checkOverlap(candidatePosition, node.position);
      });
      
      if (overlaps) {
        // Move down and try again (fallback if horizontal position overlaps)
        candidateY += NODE_HEIGHT + PADDING;
        attempts++;
      } else {
        foundPosition = true;
      }
    }
    
    const newNodePosition = {
      x: candidateX,
      y: candidateY,
    };

    const newNode: Node = {
      id: `${type}-${Date.now()}`,
      type: type,
      position: newNodePosition,
      data: {
        blockType: blockType,
        label: operation.label,
        config: {},
      },
    };

    addNode(newNode);
    
    // Create edge from afterNode to newNode with handle IDs
    const newEdge = {
      id: `edge-${afterNode.id}-${newNode.id}`,
      source: afterNode.id,
      sourceHandle: 'source', // Use the source handle at the bottom
      target: newNode.id,
      targetHandle: 'target', // Use the target handle at the top
    };
    
    // Add edge using store method
    addEdge(newEdge);

    setIsOperationModalOpen(false);
    setOperationAfterNodeId(null);
    
    // Mark as unsaved changes
    hasUnsavedChangesRef.current = true;
    setHasUnsavedChanges(true);
  };

  const handleFileUploaded = (fileIds: number[]) => {
    // Update the node data with the file IDs array
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
        // Mark as unsaved changes when files are uploaded
        // This allows the user to save the flow after uploading files
        if (fileIds.length > 0) {
          hasUnsavedChangesRef.current = true;
          setHasUnsavedChanges(true);
        }
      }
    }
  };

  const getNodeFileIds = (nodeId: string): number[] => {
    const node = nodes.find((n) => n.id === nodeId);
    if (node?.data?.fileIds && Array.isArray(node.data.fileIds)) {
      return node.data.fileIds;
    }
    // Backward compatibility: check for single fileId
    if (node?.data?.fileId && typeof node.data.fileId === 'number') {
      return [node.data.fileId];
    }
    return [];
  };

  return (
    <div className="flex h-screen bg-gray-100">
      
      {/* Center - Canvas */}
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
                      onConfirm: () => {
                        (async () => {
                          if (flowName.trim()) {
                            await handleSave();
                          }
                          hasUnsavedChangesRef.current = false;
                          setHasUnsavedChanges(false);
                          navigate('/');
                        })();
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
                    {(() => {
                      if (isLoadingFlows) {
                        return <div className="p-4 text-center text-sm text-gray-500">Loading...</div>;
                      }
                      if (savedFlows.length === 0) {
                        return <div className="p-4 text-center text-sm text-gray-500">No saved flows</div>;
                      }
                      return (
                        <div className="divide-y divide-gray-200">
                          {savedFlows.map((flow) => {
                            const isSelected = selectedFlowId === flow.id;
                            return (
                              <div
                                key={flow.id}
                                onClick={() => handleLoadFlow(flow)}
                                className={`w-full text-left p-3 cursor-pointer hover:bg-gray-50 ${
                                  isSelected ? 'bg-indigo-50' : ''
                                }`}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    handleLoadFlow(flow);
                                  }
                                }}
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
                                    type="button"
                              >
                                ×
                              </button>
                            </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
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
                disabled={
                  isSaving || 
                  !flowName.trim() || 
                  (selectedFlowId ? !hasUnsavedChanges : nodes.length === 0)
                }
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                title={(() => {
                  if (selectedFlowId && !hasUnsavedChangesRef.current) {
                    return 'No changes to save';
                  }
                  if (!selectedFlowId && nodes.length === 0) {
                    return 'Add at least one block to save';
                  }
                  return '';
                })()}
              >
                {(() => {
                  if (isSaving) return 'Saving...';
                  if (selectedFlowId) return 'Update Flow';
                  return 'Save Flow';
                })()}
              </button>
              {/* Previous and Next buttons with Figma icons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleUndo}
                  disabled={!canUndo}
                  className="p-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                  title="Previous (Ctrl+Z / Cmd+Z)"
                >
                  <img 
                    src="/assets/icons/back-icon.svg" 
                    alt="Previous" 
                    className="w-5 h-5 scale-y-[-1]"
                  />
                </button>
                <button
                  onClick={handleRedo}
                  disabled={!canRedo}
                  className="p-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                  title="Next (Ctrl+Shift+Z / Cmd+Shift+Z)"
                >
                  <img 
                    src="/assets/icons/return-icon.svg" 
                    alt="Next" 
                    className="w-5 h-5 rotate-180"
                  />
                </button>
              </div>
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
          <FlowCanvas onNodeClick={handleNodeClick} onAddOperation={handleAddOperation} />
        </div>
      </div>
      
      {/* Right Sidebar - Properties Panel */}
      <PropertiesPanel 
        selectedNodeId={selectedNodeId} 
        onClose={handleClosePropertiesPanel}
      />
      
      {/* Data Upload Modal */}
      <DataUploadModal
        isOpen={isModalOpen}
        onClose={() => {
          // hasUnsavedChanges is already set in handleFileUploaded when files are uploaded
          // No need to check again here - the useEffect will also detect changes
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
      
      {/* Operation Selection Modal */}
      <OperationSelectionModal
        isOpen={isOperationModalOpen}
        onClose={() => {
          setIsOperationModalOpen(false);
          setOperationAfterNodeId(null);
        }}
        onSelect={handleOperationSelect}
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
