/**
 * Responsible for:
 * - Orchestrating the flow builder state and lifecycle (load/save/reset).
 * - Managing per-step previews and undo/redo history.
 * - Coordinating modal interactions and pipeline events.
 *
 * Key assumptions:
 * - Flow nodes are stored in execution order (sequential pipeline).
 * - The first node is a source node that anchors file input.
 *
 * Be careful:
 * - Reordering or config changes should trigger preview updates from the changed step onward.
 * - Source file changes invalidate all downstream previews.
 */
import { useState, useEffect, useRef, useCallback, useLayoutEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FlowPipeline } from './FlowPipeline';
import { DataUploadModal } from './DataUploadModal';
import { PropertiesPanel } from './PropertiesPanel';
import { OperationSelectionModal } from './OperationSelectionModal';
import { ConfirmationModal, type ModalType } from '../Common/ConfirmationModal';
import { useFlowStore } from '../../store/flowStore';
import { flowsApi } from '../../api/flows';
import { filesApi } from '../../api/files';
import { transformApi } from '../../api/transform';
import type {
  BlockData,
  File,
  FilePreview,
  Flow,
  FlowData,
  OutputConfig,
  TableTarget,
} from '../../types';
import { Node } from '@xyflow/react';
import { useUndoRedo } from '../../hooks/useUndoRedo';

export const FlowBuilder = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { nodes, edges, getFlowData, loadFlowData, updateNode, deleteNode, setNodes, setEdges } = useFlowStore();
  const [flowName, setFlowName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [savedFlows, setSavedFlows] = useState<Flow[]>([]);
  const [selectedFlowId, setSelectedFlowId] = useState<number | null>(null);
  const [isLoadingFlows, setIsLoadingFlows] = useState(false);
  const [showFlowList, setShowFlowList] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  // #region agent log
  useEffect(() => {
    fetch('http://127.0.0.1:7242/ingest/bd312fdf-db3f-4a62-825b-88f171eacd92',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'FlowBuilder.tsx:42',message:'isModalOpen state changed',data:{isModalOpen,selectedNodeId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'F'})}).catch(()=>{});
  }, [isModalOpen, selectedNodeId]);
  // #endregion
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
    confirmDisabled?: boolean;
    discardText?: string;
  } | null>(null);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isFileUploading, setIsFileUploading] = useState(false);
  const [stepPreviews, setStepPreviews] = useState<Record<string, FilePreview | null>>({});
  const [previewLoading, setPreviewLoading] = useState<Record<string, boolean>>({});
  const [previewErrors, setPreviewErrors] = useState<Record<string, string | null>>({});
  const [sourceSheetName, setSourceSheetName] = useState<string | null>(null);
  const [sourceFileId, setSourceFileId] = useState<number | null>(null);
  const [sourceSheetByFileId, setSourceSheetByFileId] = useState<Record<number, string | null>>({});
  const [previewFiles, setPreviewFiles] = useState<File[]>([]);
  const [sheetOptionsByFileId, setSheetOptionsByFileId] = useState<Record<number, string[]>>({});
  const [previewOverrides, setPreviewOverrides] = useState<Record<string, TableTarget>>({});
  const [activePreviewNodeIds, setActivePreviewNodeIds] = useState<Set<string>>(new Set());
  const [viewAction, setViewAction] = useState<{ type: 'fit' | 'reset'; id: number } | null>(null);
  const [lastTarget, setLastTarget] = useState<TableTarget>({ fileId: null, sheetName: null });
  const savedFlowDataRef = useRef<string>('');
  const hasUnsavedChangesRef = useRef(false);
  const historyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isUndoRedoInProgressRef = useRef(false);
  const hasInitializedRef = useRef(false);
  const previewSignatureRef = useRef<Record<string, string>>({});
  const previewUpdateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewRunIdRef = useRef(0);
  // Cache raw file previews by file+sheet to avoid re-fetching when users switch tabs.
  const previewCacheRef = useRef<Map<string, FilePreview>>(new Map());
  // Track in-flight preview requests so rapid sheet clicks share the same promise.
  const previewInFlightRef = useRef<Map<string, Promise<FilePreview>>>(new Map());

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
      setActivePreviewNodeIds(new Set());
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

  const loadFlows = useCallback(async () => {
    setIsLoadingFlows(true);
    try {
      const flows = await flowsApi.list();
      setSavedFlows(flows);
    } catch (error) {
      console.error('Failed to load flows:', error);
    } finally {
      setIsLoadingFlows(false);
    }
  }, []);

  useEffect(() => {
    loadFlows();
    
    // Initialize saved flow data reference on mount
    savedFlowDataRef.current = JSON.stringify(getFlowData());
    hasUnsavedChangesRef.current = false;
    setHasUnsavedChanges(false);
  }, [loadFlows, getFlowData]);

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
      setActivePreviewNodeIds(new Set());
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
    // #region cleanup all files from all nodes from backend if they exist
    nodes.forEach((node) => {
      if (node.data?.fileIds && Array.isArray(node.data.fileIds)) {
        node.data.fileIds.forEach((fileId: number) => {
          filesApi.delete(fileId).catch((err) => {
            console.error(`Failed to delete file ${fileId} on flow clear:`, err);
          });
        });
      }
    });
    // #endregion

    // Initialize with source + output nodes (required for the flow design)
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
    const outputNode: Node = {
      id: 'output-0',
      type: 'output',
      position: { x: 250, y: 350 },
      data: {
        blockType: 'output',
        config: {},
        label: 'Output',
        output: {
          outputs: [],
        },
      },
    };
    
    // Use setNodes for atomic state update
    // Always reset to source + output nodes when starting a new flow
    setNodes([sourceNode, outputNode]);
    setEdges([]);
    
    // Reset other state
    setFlowName('');
    setSelectedFlowId(null);
    setShowFlowList(false);
    setActivePreviewNodeIds(new Set());
    setLastTarget({ fileId: null, sheetName: null });
    savedFlowDataRef.current = '';
    hasUnsavedChangesRef.current = false;
    hasInitializedRef.current = true;
    
    // Reset undo/redo history
    reset({
      nodes: [
        {
          id: sourceNode.id,
          type: sourceNode.type || 'source',
          position: sourceNode.position,
          data: {
            blockType: 'source',
            config: {},
            label: 'Data',
          },
        },
        {
          id: outputNode.id,
          type: outputNode.type || 'output',
          position: outputNode.position,
          data: {
            blockType: 'output',
            config: {},
            label: 'Output',
            output: outputNode.data.output,
          },
        },
      ],
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
    // #region agent log
    const shouldOpen = nodeType === 'upload' || nodeType === 'data' || nodeType === 'source';
    fetch('http://127.0.0.1:7242/ingest/bd312fdf-db3f-4a62-825b-88f171eacd92',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'FlowBuilder.tsx:565',message:'handleNodeClick called',data:{nodeId,nodeType,shouldOpenModal:shouldOpen},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
    // #endregion
    // Set selected node for properties panel
    setSelectedNodeId(nodeId);
    
    // Open modal for upload/data/source nodes (for file upload)
    if (shouldOpen) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/bd312fdf-db3f-4a62-825b-88f171eacd92',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'FlowBuilder.tsx:571',message:'Opening modal - before setState',data:{nodeId,nodeType,currentIsModalOpen:isModalOpen,currentSelectedNodeId:selectedNodeId},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      setIsModalOpen(true);
      // #region agent log
      // Use setTimeout to log after state update has been scheduled
      setTimeout(() => {
        fetch('http://127.0.0.1:7242/ingest/bd312fdf-db3f-4a62-825b-88f171eacd92',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'FlowBuilder.tsx:583',message:'After setIsModalOpen(true) scheduled',data:{nodeId,nodeType},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'G'})}).catch(()=>{});
      }, 0);
      // #endregion
    } else {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/bd312fdf-db3f-4a62-825b-88f171eacd92',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'FlowBuilder.tsx:573',message:'Modal NOT opened - nodeType mismatch',data:{nodeId,nodeType,expectedTypes:['upload','data','source']},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
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
      'remove-column': { type: 'transform', blockType: 'remove_columns_rows' },
      'remove-columns-rows': { type: 'transform', blockType: 'remove_columns_rows' },
      'rename-column': { type: 'transform', blockType: 'rename_columns' },
      'rearrange-column': { type: 'transform', blockType: 'rearrange_columns' },
      'sort-rows': { type: 'transform', blockType: 'sort_rows' },
      'remove-duplicates': { type: 'transform', blockType: 'remove_duplicates' },
      'filter-rows': { type: 'filter', blockType: 'filter' },
      'delete-rows': { type: 'filter', blockType: 'delete_rows' },
      'join-lookup': { type: 'transform', blockType: 'join' },
      'output': { type: 'output', blockType: 'output' },
    };
    return mapping[operationId] || { type: 'transform', blockType: operationId };
  };

  // Handle operation selection from modal
  const handleOperationSelect = (operation: { id: string; label: string; type: string }) => {
    if (!operationAfterNodeId) return;

    const afterNode = nodes.find((n) => n.id === operationAfterNodeId);
    if (!afterNode) return;

    const { type, blockType } = getNodeTypeFromOperation(operation.id);
    const defaultTarget = {
      fileId: null,
      sheetName: null,
      virtualId: null,
      virtualName: null,
    };
    const targetForNode = operation.id === 'output'
      ? { fileId: null, sheetName: null }
      : defaultTarget;
    const outputConfig: OutputConfig | undefined = operation.id === 'output'
      ? {
          outputs: [],
        }
      : undefined;

    const newNode: Node = {
      id: `${type}-${Date.now()}`,
      type: type,
      position: { x: 0, y: 0 },
      data: {
        blockType: blockType,
        label: operation.label,
        config: {},
        target: targetForNode,
        destination: operation.id === 'output' ? undefined : undefined,
        output: outputConfig,
      },
    };

    const insertAfterIndex = nodes.findIndex((node) => node.id === afterNode.id);
    if (insertAfterIndex === -1) {
      return;
    }
    const nextNodes = [...nodes];
    nextNodes.splice(insertAfterIndex + 1, 0, newNode);
    setNodes(nextNodes);
    setEdges([]);

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
        const previousFileIds = Array.isArray(node.data?.fileIds) ? node.data.fileIds : [];
        const hasFileIdChanges = JSON.stringify(previousFileIds) !== JSON.stringify(fileIds);
        // Store file IDs array in node data so it persists when flow is saved
        updateNode(selectedNodeId, {
          data: {
            ...node.data,
            fileIds: fileIds
          }
        });
        // Mark as unsaved changes when files are uploaded
        // This allows the user to save the flow after uploading or deleting files
        if (hasFileIdChanges) {
          hasUnsavedChangesRef.current = true;
          setHasUnsavedChanges(true);
        }
      }
    }
  };

  const getNodeFileIds = useCallback((nodeId: string): number[] => {
    const node = nodes.find((n) => n.id === nodeId);
    if (node?.data?.fileIds && Array.isArray(node.data.fileIds)) {
      return node.data.fileIds;
    }
    // Backward compatibility: check for single fileId
    if (node?.data?.fileId && typeof node.data.fileId === 'number') {
      return [node.data.fileId];
    }
    return [];
  }, [nodes]);

  const fileSourceNode = useMemo(() => {
    // Prefer the first node with file IDs so legacy flows still preview correctly.
    const nodeWithFiles = nodes.find((node) => {
      const fileIds = getNodeFileIds(node.id);
      return fileIds.length > 0;
    });
    if (nodeWithFiles) {
      return nodeWithFiles;
    }
    // Fall back to known source-like types if no file IDs are attached yet.
    return (
      nodes.find((node) => node.type === 'source' || node.type === 'upload' || node.type === 'data') || null
    );
  }, [nodes, getNodeFileIds]);
  const sourceFileIds = useMemo(
    () => (fileSourceNode ? getNodeFileIds(fileSourceNode.id) : []),
    [fileSourceNode, getNodeFileIds]
  );
  const resolvedSourceFileId = sourceFileId ?? (sourceFileIds[0] ?? null);

  useEffect(() => {
    if (!fileSourceNode) {
      setSourceFileId(null);
      return;
    }
    const sourceTarget = fileSourceNode.data?.target as TableTarget | undefined;
    const targetFileId = sourceTarget?.fileId ?? null;
    setSourceFileId((prev) => {
      if (prev && sourceFileIds.includes(prev)) {
        return prev;
      }
      if (targetFileId && sourceFileIds.includes(targetFileId)) {
        return targetFileId;
      }
      return sourceFileIds[0] ?? null;
    });
  }, [fileSourceNode, sourceFileIds]);

  useEffect(() => {
    if (!fileSourceNode) {
      return;
    }
    const sourceTarget = fileSourceNode.data?.target as TableTarget | undefined;
    if (!sourceTarget?.sheetName || sourceSheetName) {
      return;
    }
    // Restore the saved sheet selection so previews match the stored target.
    if (sourceTarget.fileId) {
      setSourceSheetByFileId((prev) => ({
        ...prev,
        [sourceTarget.fileId as number]: sourceTarget.sheetName,
      }));
    }
    setSourceSheetName(sourceTarget.sheetName);
  }, [fileSourceNode, sourceSheetName]);

  useEffect(() => {
    if (!resolvedSourceFileId) {
      return;
    }
    const defaultTarget: TableTarget = {
      fileId: resolvedSourceFileId,
      sheetName: sourceSheetName ?? null,
    };
    // Backfill targets for legacy nodes so multi-sheet execution stays deterministic.
    nodes.forEach((node) => {
      const nodeData = node.data || {};
      const hasConfig = nodeData.config && Object.keys(nodeData.config).length > 0;
      if (nodeData.target || nodeData.blockType === 'output' || node.type === 'source') {
        return;
      }
      if (!hasConfig) {
        return;
      }
      updateNode(node.id, {
        data: {
          ...nodeData,
          target: defaultTarget,
        },
      });
    });
  }, [nodes, resolvedSourceFileId, sourceSheetName, updateNode]);

  useEffect(() => {
    if (!fileSourceNode || !resolvedSourceFileId) {
      return;
    }
    const sourceTarget: TableTarget = {
      fileId: resolvedSourceFileId,
      sheetName: sourceSheetName ?? null,
    };
    const existingTarget = fileSourceNode.data?.target as TableTarget | undefined;
    const hasChanged =
      existingTarget?.fileId !== sourceTarget.fileId ||
      existingTarget?.sheetName !== sourceTarget.sheetName;
    if (hasChanged) {
      // Keep the source node target aligned with the active sheet selection.
      updateNode(fileSourceNode.id, {
        data: {
          ...fileSourceNode.data,
          target: sourceTarget,
        },
      });
    }
    setLastTarget(sourceTarget);
  }, [fileSourceNode, resolvedSourceFileId, sourceSheetName, updateNode]);

  useEffect(() => {
    if (!resolvedSourceFileId) {
      return;
    }
    const rememberedSheet = sourceSheetByFileId[resolvedSourceFileId] ?? null;
    setSourceSheetName(rememberedSheet);
  }, [resolvedSourceFileId, sourceSheetByFileId]);

  const buildFlowData = useCallback(
    (subset: Node[]): FlowData => ({
      nodes: subset.map((node) => ({
        id: node.id,
        type: node.type || 'default',
        position: node.position,
        data: node.data as unknown as BlockData,
      })),
      edges: [],
    }),
    []
  );

  const getOutputPreviewTarget = useCallback((node: Node): TableTarget | null => {
    const output = node.data?.output as OutputConfig | { fileName?: string; sheets?: { sheetName?: string }[] } | undefined;
    const outputFile = (output as OutputConfig | undefined)?.outputs?.[0];
    const legacySheets = (output as { sheets?: { sheetName?: string }[] } | undefined)?.sheets;
    if (!outputFile && (!legacySheets || legacySheets.length === 0)) {
      return null;
    }
    const sheetName = outputFile?.sheets?.[0]?.sheetName || legacySheets?.[0]?.sheetName || 'Sheet 1';
    const fileName = outputFile?.fileName || (output as { fileName?: string } | undefined)?.fileName || 'output.xlsx';
    const outputId = outputFile?.id || 'legacy';
    return {
      fileId: null,
      sheetName,
      virtualId: `output:${outputId}:${sheetName}`,
      virtualName: `${fileName} / ${sheetName}`,
    };
  }, []);

  const collectFileIds = useCallback((subset: Node[]) => {
    const fileIds = new Set<number>();
    subset.forEach((node) => {
      const data = node.data || {};
      const nodeFileIds = Array.isArray(data.fileIds) ? data.fileIds : [];
      nodeFileIds.forEach((fileId) => {
        if (typeof fileId === 'number') {
          fileIds.add(fileId);
        }
      });
      const target = data.target as TableTarget | undefined;
      if (target?.fileId) {
        fileIds.add(target.fileId);
      }
      const output = data.output as OutputConfig | undefined;
      // Handle modern 'outputs' array structure
      if (output?.outputs && Array.isArray(output.outputs)) {
        output.outputs.forEach((outputFile) => {
          (outputFile.sheets || []).forEach((sheet) => {
             // In the current types, OutputSheetMapping doesn't strictly have 'source', 
             // but if we are collecting file dependencies, we should check safe properties if they exist.
             // Based on types, sheets is just { sheetName: string }.
             // The original code was seemingly trying to read sheet.source?.fileId?
             // Let's preserve intent but be safe.
             // If strict types say no 'source', this might be legacy data logic.
             // I will comment out the unsafe access if it's not in types, or cast to any if needed to support legacy.
             const legacySheet = sheet as any;
             if (legacySheet.source?.fileId) {
               fileIds.add(legacySheet.source.fileId);
             }
          });
        });
      }
      // Handle legacy structure where sheets might be directly on output
      else {
          const legacyOutput = output as any;
          if (legacyOutput?.sheets && Array.isArray(legacyOutput.sheets)) {
            legacyOutput.sheets.forEach((sheet: any) => {
                if (sheet.source?.fileId) {
                    fileIds.add(sheet.source.fileId);
                }
            });
          }
      }
    });
    return Array.from(fileIds);
  }, []);

  const normalizePreviewState = useCallback(() => {
    const nodeIds = new Set(nodes.map((node) => node.id));
    setStepPreviews((prev) => {
      const next: Record<string, FilePreview | null> = {};
      nodeIds.forEach((id) => {
        next[id] = prev[id] ?? null;
      });
      return next;
    });
    setPreviewLoading((prev) => {
      const next: Record<string, boolean> = {};
      nodeIds.forEach((id) => {
        next[id] = prev[id] ?? false;
      });
      return next;
    });
    setPreviewErrors((prev) => {
      const next: Record<string, string | null> = {};
      nodeIds.forEach((id) => {
        next[id] = prev[id] ?? null;
      });
      return next;
    });
  }, [nodes]);

  const makePreviewCacheKey = useCallback((fileId: number, sheetName?: string) => {
    return `${fileId}:${sheetName ?? '__default__'}`;
  }, []);

  const getCachedPreview = useCallback(
    (fileId: number, sheetName?: string) => {
      const cacheKey = makePreviewCacheKey(fileId, sheetName);
      return previewCacheRef.current.get(cacheKey) ?? null;
    },
    [makePreviewCacheKey]
  );

  const fetchFilePreview = useCallback(
    async (fileId: number, sheetName?: string) => {
      const cacheKey = makePreviewCacheKey(fileId, sheetName);
      const cached = previewCacheRef.current.get(cacheKey);
      if (cached) {
        return cached;
      }

      const inFlight = previewInFlightRef.current.get(cacheKey);
      if (inFlight) {
        return inFlight;
      }

      // Fetch + cache so subsequent clicks are instant.
      const request = filesApi.preview(fileId, sheetName).then((preview) => {
        previewCacheRef.current.set(cacheKey, preview);
        return preview;
      });

      previewInFlightRef.current.set(cacheKey, request);
      try {
        return await request;
      } finally {
        previewInFlightRef.current.delete(cacheKey);
      }
    },
    [makePreviewCacheKey]
  );

  const prefetchSheetPreviews = useCallback(
    (fileId: number, sheetNames: string[], currentSheet?: string | null) => {
      const remainingSheets = sheetNames.filter((sheet) => sheet !== (currentSheet ?? null));
      remainingSheets.forEach((sheet) => {
        const cacheKey = makePreviewCacheKey(fileId, sheet);
        if (previewCacheRef.current.has(cacheKey) || previewInFlightRef.current.has(cacheKey)) {
          return;
        }
        // Prefetch runs in the background; failures shouldn't block UI.
        const request = filesApi.preview(fileId, sheet).then((preview) => {
          previewCacheRef.current.set(cacheKey, preview);
          return preview;
        });
        previewInFlightRef.current.set(cacheKey, request);
        request.finally(() => previewInFlightRef.current.delete(cacheKey));
      });
    },
    [makePreviewCacheKey]
  );

  useEffect(() => {
    if (!resolvedSourceFileId || !fileSourceNode) {
      return;
    }
    if (!activePreviewNodeIds.has(fileSourceNode.id)) {
      return;
    }

    const cached = getCachedPreview(resolvedSourceFileId, sourceSheetName || undefined);
    if (!cached) {
      return;
    }

    // Apply cached source previews immediately so sheet switches feel instant.
    setStepPreviews((prev) => ({ ...prev, [fileSourceNode.id]: cached }));
    setPreviewErrors((prev) => ({ ...prev, [fileSourceNode.id]: null }));
    setPreviewLoading((prev) => ({ ...prev, [fileSourceNode.id]: false }));

    // Align the signature so the main effect doesn't re-fetch the cached sheet.
    const sourceIndex = nodes.findIndex((node) => node.id === fileSourceNode.id);
    if (sourceIndex === -1) {
      return;
    }
    const signature = JSON.stringify({
      fileId: resolvedSourceFileId,
      sheetName: sourceSheetName || undefined,
      nodes: nodes.slice(0, sourceIndex + 1).map((node) => ({
        id: node.id,
        type: node.type,
        blockType: node.data?.blockType,
        config: node.data?.config || {},
        target: node.data?.target || null,
      })),
    });
    previewSignatureRef.current = { ...previewSignatureRef.current, [fileSourceNode.id]: signature };
  }, [activePreviewNodeIds, fileSourceNode, getCachedPreview, nodes, resolvedSourceFileId, sourceSheetName]);

  useEffect(() => {
    normalizePreviewState();
  }, [normalizePreviewState]);

  useEffect(() => {
    if (nodes.length === 0) {
      setStepPreviews({});
      setPreviewLoading({});
      setPreviewErrors({});
      previewSignatureRef.current = {};
      setActivePreviewNodeIds(new Set());
      return;
    }

    // Only recompute previews for steps the user has expanded.
    const activeNodeIds = Array.from(activePreviewNodeIds).filter((nodeId) =>
      nodes.some((node) => node.id === nodeId)
    );

    // Avoid network churn when no previews are expanded.
    if (activeNodeIds.length === 0) {
      return;
    }

    if (!resolvedSourceFileId && collectFileIds(nodes).length === 0) {
      // Cancel any in-flight preview runs when the file source disappears.
      previewRunIdRef.current += 1;
      setStepPreviews((prev) => ({ ...prev }));
      setPreviewErrors((prev) => {
        const next = { ...prev };
        activeNodeIds.forEach((nodeId) => {
          const node = nodes.find((item) => item.id === nodeId);
          next[nodeId] = node?.id === fileSourceNode?.id ? 'Upload a file to see preview' : prev[nodeId] ?? null;
        });
        return next;
      });
      setPreviewLoading((prev) => {
        const next = { ...prev };
        activeNodeIds.forEach((nodeId) => {
          next[nodeId] = false;
        });
        return next;
      });
      return;
    }

    // Snapshot state so the async preview loop is deterministic.
    const nodesSnapshot = [...nodes];
    const fileIdSnapshot = resolvedSourceFileId;
    const sheetSnapshot = sourceSheetName || undefined;
    const fileIdsSnapshot = collectFileIds(nodesSnapshot);

    // Signature map lets us recompute only when upstream config/order changes.
    const signaturesToUpdate = new Set<string>();
    const signatureMap = { ...previewSignatureRef.current };

    activeNodeIds.forEach((nodeId) => {
      const index = nodesSnapshot.findIndex((node) => node.id === nodeId);
      if (index === -1) {
        return;
      }
      const node = nodesSnapshot[index];
      const override = previewOverrides[nodeId];
      const nodeTarget = node.data?.target as TableTarget | undefined;
      const nodeDestination = node.data?.destination as TableTarget | undefined;
      const isOutputNode = node.data?.blockType === 'output' || node.type === 'output';
      const outputPreviewTarget = isOutputNode ? getOutputPreviewTarget(node) : null;
      const previewTarget = override ??
        outputPreviewTarget ??
        (nodeDestination?.fileId || nodeDestination?.virtualId
          ? nodeDestination
          : nodeTarget ?? null);
      const nodesForSignature = nodesSnapshot.slice(0, index + 1);
      const signature = JSON.stringify({
        fileId: fileIdSnapshot,
        sheetName: sheetSnapshot,
        previewTarget,
        nodes: nodesForSignature.map((node) => ({
          id: node.id,
          type: node.type,
          blockType: node.data?.blockType,
          config: node.data?.config || {},
          target: node.data?.target || null,
          destination: node.data?.destination || null,
        })),
      });
      if (signatureMap[nodeId] !== signature) {
        signatureMap[nodeId] = signature;
        signaturesToUpdate.add(nodeId);
      }
    });

    // If nothing changed upstream, skip recompute for all active previews.
    if (signaturesToUpdate.size === 0) {
      return;
    }

    previewSignatureRef.current = signatureMap;

    // Debounce recomputations so typing in config fields doesn't spam the API.
    if (previewUpdateTimeoutRef.current) {
      clearTimeout(previewUpdateTimeoutRef.current);
    }

    // Short debounce keeps previews responsive while still coalescing rapid edits.
    previewUpdateTimeoutRef.current = setTimeout(() => {
      // runId guards against out-of-order responses overwriting newer previews.
      const runId = previewRunIdRef.current + 1;
      previewRunIdRef.current = runId;

      const nextLoading: Record<string, boolean> = {};
      signaturesToUpdate.forEach((nodeId) => {
        nextLoading[nodeId] = true;
      });
      setPreviewLoading((prev) => ({ ...prev, ...nextLoading }));

      (async () => {
        for (const nodeId of signaturesToUpdate) {
          if (previewRunIdRef.current !== runId) {
            return;
          }
          const index = nodesSnapshot.findIndex((node) => node.id === nodeId);
          if (index === -1) {
            continue;
          }
          const node = nodesSnapshot[index];
          const override = previewOverrides[nodeId];
          const isOutputNode = node.data?.blockType === 'output' || node.type === 'output';
          try {
            if (index === 0) {
              // Source preview reads the file directly, no transforms applied yet.
              const sourceTarget = node.data?.target as TableTarget | undefined;
              const targetFileId = sourceTarget?.fileId ?? fileIdSnapshot;
              const targetSheetName = sourceTarget?.sheetName ?? sheetSnapshot;
              if (!targetFileId) {
                throw new Error('Source target file is missing');
              }
              const preview = await fetchFilePreview(targetFileId, targetSheetName);
              if (previewRunIdRef.current !== runId) {
                return;
              }
              setStepPreviews((prev) => ({ ...prev, [node.id]: preview }));
              setPreviewErrors((prev) => ({ ...prev, [node.id]: null }));
              if (preview.sheets && preview.sheets.length > 1) {
                // Warm the cache so sheet switches feel instant.
                prefetchSheetPreviews(
                  targetFileId,
                  preview.sheets,
                  preview.current_sheet ?? targetSheetName ?? undefined
                );
              }
            } else {
              // Downstream previews execute the pipeline up to this step.
              const nodeTarget = node.data?.target as TableTarget | undefined;
              const nodeDestination = node.data?.destination as TableTarget | undefined;
              const outputPreviewTarget = isOutputNode ? getOutputPreviewTarget(node) : null;
              if (isOutputNode && !override && !outputPreviewTarget) {
                setStepPreviews((prev) => ({
                  ...prev,
                  [node.id]: {
                    columns: [],
                    row_count: 0,
                    preview_rows: [],
                    dtypes: {},
                  },
                }));
                setPreviewErrors((prev) => ({ ...prev, [node.id]: null }));
                continue;
              }
              const previewTarget = override ??
                outputPreviewTarget ??
                (nodeDestination?.fileId || nodeDestination?.virtualId
                  ? nodeDestination
                  : nodeTarget ?? {
                      fileId: fileIdSnapshot ?? null,
                      sheetName: sheetSnapshot ?? null,
                    });
              const hasSource =
                Boolean(nodeTarget?.fileId || nodeTarget?.virtualId) ||
                Boolean(override?.fileId || override?.virtualId) ||
                Boolean(fileIdSnapshot);
              if (!hasSource) {
                setStepPreviews((prev) => ({ ...prev, [node.id]: null }));
                setPreviewErrors((prev) => ({
                  ...prev,
                  [node.id]: 'Select a source file or output sheet to preview.',
                }));
                continue;
              }
              const previewFileIds = [...fileIdsSnapshot];
              if (previewTarget?.fileId && !previewFileIds.includes(previewTarget.fileId)) {
                previewFileIds.push(previewTarget.fileId);
              }
              const nodesForPreview = nodesSnapshot.slice(0, index + 1);
              const flowData = buildFlowData(nodesForPreview);
              const result = await transformApi.execute({
                file_id: previewFileIds[0] ?? fileIdSnapshot ?? 0,
                file_ids: previewFileIds,
                flow_data: flowData,
                preview_target: previewTarget?.fileId
                  ? {
                      file_id: previewTarget.fileId,
                      sheet_name: previewTarget.sheetName ?? undefined,
                    }
                  : previewTarget?.virtualId
                    ? {
                        virtual_id: previewTarget.virtualId,
                        sheet_name: previewTarget.sheetName ?? undefined,
                      }
                    : undefined,
              });
              if (previewRunIdRef.current !== runId) {
                return;
              }
              setStepPreviews((prev) => ({ ...prev, [node.id]: result.preview }));
              setPreviewErrors((prev) => ({ ...prev, [node.id]: null }));
            }
          } catch (_error) {
            if (previewRunIdRef.current !== runId) {
              return;
            }
            setStepPreviews((prev) => ({ ...prev, [node.id]: null }));
            setPreviewErrors((prev) => ({
              ...prev,
              [node.id]: 'Preview failed. Check the step configuration.',
            }));
          } finally {
            if (previewRunIdRef.current === runId) {
              setPreviewLoading((prev) => ({ ...prev, [node.id]: false }));
            }
          }
        }
      })();
    }, 150);

    return () => {
      if (previewUpdateTimeoutRef.current) {
        clearTimeout(previewUpdateTimeoutRef.current);
      }
    };
  }, [
    nodes,
    resolvedSourceFileId,
    sourceSheetName,
    activePreviewNodeIds,
    buildFlowData,
    collectFileIds,
    fileSourceNode,
    fetchFilePreview,
    prefetchSheetPreviews,
    previewOverrides,
    getOutputPreviewTarget,
  ]);

  const handleSourceSheetChange = useCallback((sheetName: string) => {
    if (!resolvedSourceFileId) {
      return;
    }
    setSourceSheetByFileId((prev) => ({
      ...prev,
      [resolvedSourceFileId]: sheetName,
    }));
    setSourceSheetName(sheetName);
  }, [resolvedSourceFileId]);

  const handleSourceFileChange = useCallback((fileId: number) => {
    setSourceFileId(fileId);
  }, []);

  // Preview selectors should update the target so previews + exports stay consistent.
  const handlePreviewFileChange = useCallback((nodeId: string, fileId: number) => {
    setPreviewOverrides((prev) => ({
      ...prev,
      [nodeId]: { fileId, sheetName: null, virtualId: null, virtualName: null },
    }));
  }, []);

  const handlePreviewSheetChange = useCallback((nodeId: string, sheetName: string) => {
    const fallback = nodes.find((item) => item.id === nodeId)?.data?.target as TableTarget | undefined;
    setPreviewOverrides((prev) => ({
      ...prev,
      [nodeId]: {
        fileId: prev[nodeId]?.fileId ?? fallback?.fileId ?? null,
        sheetName,
        virtualId: null,
        virtualName: null,
      },
    }));
  }, [nodes]);

  const handlePreviewTargetChange = useCallback((nodeId: string, target: TableTarget) => {
    setPreviewOverrides((prev) => ({
      ...prev,
      [nodeId]: target,
    }));
  }, []);

  useEffect(() => {
    const fileIds = collectFileIds(nodes);
    if (fileIds.length === 0) {
      setPreviewFiles([]);
      return;
    }
    const fileIdSet = new Set(fileIds);
    filesApi.list()
      .then((files) => {
        const filtered = files.filter((file) => fileIdSet.has(file.id));
        setPreviewFiles(filtered);
      })
      .catch(() => setPreviewFiles([]));
  }, [collectFileIds, nodes]);

  useEffect(() => {
    const fileIds = collectFileIds(nodes);
    if (fileIds.length === 0) {
      if (Object.keys(sheetOptionsByFileId).length > 0) {
        setSheetOptionsByFileId({});
      }
      return;
    }
    fileIds.forEach((fileId) => {
      if (sheetOptionsByFileId[fileId]) {
        return;
      }
      filesApi.sheets(fileId)
        .then((sheets) => {
          setSheetOptionsByFileId((prev) => ({ ...prev, [fileId]: sheets }));
        })
        .catch(() => {
          setSheetOptionsByFileId((prev) => ({ ...prev, [fileId]: [] }));
        });
    });
  }, [collectFileIds, nodes, sheetOptionsByFileId]);


  const handleTogglePreview = (nodeId: string) => {
    setActivePreviewNodeIds((prev) => {
      // Full-screen preview is single-instance; toggle replaces the active one.
      if (prev.has(nodeId)) {
        return new Set();
      }
      return new Set([nodeId]);
    });
    const node = nodes.find((item) => item.id === nodeId);
    const isOutputNode = node?.data?.blockType === 'output' || node?.type === 'output';
    if (!node) {
      return;
    }
    if (previewOverrides[nodeId]) {
      return;
    }
    if (isOutputNode) {
      const outputPreviewTarget = getOutputPreviewTarget(node);
      if (outputPreviewTarget) {
        setPreviewOverrides((prev) => ({
          ...prev,
          [nodeId]: outputPreviewTarget,
        }));
      }
      return;
    }
    const destinationTarget = node.data?.destination as TableTarget | undefined;
    if (destinationTarget?.virtualId) {
      setPreviewOverrides((prev) => ({
        ...prev,
        [nodeId]: destinationTarget,
      }));
    }
  };

  const handleApplyPreviewTarget = useCallback(
    (nodeId: string, targetOverride?: TableTarget) => {
      const previewTarget = targetOverride ?? previewOverrides[nodeId];
      if (!previewTarget?.fileId && !previewTarget?.virtualId) {
        return;
      }
      const node = nodes.find((item) => item.id === nodeId);
      if (!node) {
        return;
      }
      updateNode(nodeId, {
        data: {
          ...node.data,
          target: previewTarget,
        },
      });
      if (previewTarget.fileId) {
        setLastTarget(previewTarget);
      }
    },
    [nodes, previewOverrides, updateNode]
  );

  const handleDeleteNode = (nodeId: string) => {
    // #region cleanup files from backend if it's a source/data node
    const nodeToDelete = nodes.find((n) => n.id === nodeId);
    if (nodeToDelete?.data?.blockType === 'output' || nodeToDelete?.type === 'output') {
      return;
    }
    if (nodeToDelete?.data?.fileIds && Array.isArray(nodeToDelete.data.fileIds)) {
      nodeToDelete.data.fileIds.forEach((fileId: number) => {
        filesApi.delete(fileId).catch((err) => {
          console.error(`Failed to delete file ${fileId} on node deletion:`, err);
        });
      });
    }
    // #endregion

    deleteNode(nodeId);
    if (selectedNodeId === nodeId) {
      setSelectedNodeId(null);
    }
    setActivePreviewNodeIds((prev) => {
      const next = new Set(prev);
      next.delete(nodeId);
      return next;
    });
    hasUnsavedChangesRef.current = true;
    setHasUnsavedChanges(true);
  };

  const getOutputFileName = useCallback(() => {
    const outputNode = nodes.find((node) => node.data?.blockType === 'output');
    const outputConfig = outputNode?.data?.output as OutputConfig | undefined;
    const outputs = outputConfig?.outputs ?? [];
    if (outputs.length > 1) {
      return 'outputs.zip';
    }
    return outputs[0]?.fileName || 'output.xlsx';
  }, [nodes]);

  const getFirstOutputSheetTarget = useCallback((): TableTarget | null => {
    const outputNode = nodes.find((node) => node.data?.blockType === 'output' || node.type === 'output');
    const outputConfig = outputNode?.data?.output as OutputConfig | { fileName?: string; sheets?: { sheetName?: string }[] } | undefined;
    const outputFile = (outputConfig as OutputConfig | undefined)?.outputs?.[0];
    const legacySheets = (outputConfig as { sheets?: { sheetName?: string }[] } | undefined)?.sheets;
    if (!outputFile && (!legacySheets || legacySheets.length === 0)) {
      return null;
    }
    const sheetName = outputFile?.sheets?.[0]?.sheetName || legacySheets?.[0]?.sheetName || 'Sheet 1';
    const fileName = outputFile?.fileName || (outputConfig as { fileName?: string } | undefined)?.fileName || 'output.xlsx';
    const outputId = outputFile?.id || 'legacy';
    return {
      fileId: null,
      sheetName,
      virtualId: `output:${outputId}:${sheetName}`,
      virtualName: `${fileName} / ${sheetName}`,
    };
  }, [nodes]);

  useEffect(() => {
    const fallbackOutputTarget = getFirstOutputSheetTarget();
    if (!fallbackOutputTarget) {
      return;
    }
    setPreviewOverrides((prev) => {
      let changed = false;
      const next = { ...prev };
      Object.entries(prev).forEach(([nodeId, target]) => {
        if (target?.virtualId?.startsWith('output:empty')) {
          // Swap placeholder output previews to the first real output sheet once it exists.
          next[nodeId] = fallbackOutputTarget;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [getFirstOutputSheetTarget]);

  const handleExport = async () => {
    const fileIds = collectFileIds(nodes);
    try {
      const blob = await transformApi.export({
        file_id: fileIds[0] ?? 0,
        file_ids: fileIds,
        flow_data: getFlowData(),
      });
      const fileName = getOutputFileName();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      // Use the output block filename to keep the export predictable.
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export flow:', error);
      showModal('error', 'Export failed', 'We could not export the output file.');
    }
  };

  const handleReorderNodes = (nextNodes: Node[]) => {
    setNodes(nextNodes);
    setEdges([]);
    hasUnsavedChangesRef.current = true;
    setHasUnsavedChanges(true);
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
                      message: flowName.trim()
                        ? 'You have unsaved changes. Do you want to save before leaving?'
                        : 'You have unsaved changes. Enter a flow name to save before leaving.',
                      confirmText: 'Save & Leave',
                      confirmDisabled: !flowName.trim(),
                      onConfirm: () => {
                        (async () => {
                          if (!flowName.trim()) {
                            showModal('alert', 'Flow name required', 'Please enter a flow name before saving.');
                            return;
                          }
                          await handleSave();
                          if (flowName.trim()) {
                            hasUnsavedChangesRef.current = false;
                            setHasUnsavedChanges(false);
                            navigate('/');
                          }
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
                                className="relative w-full"
                              >
                                <button
                                  onClick={() => handleLoadFlow(flow)}
                                  className={`w-full text-left p-3 hover:bg-gray-50 transition-colors ${
                                    isSelected ? 'bg-indigo-50' : ''
                                  }`}
                                  type="button"
                                >
                                  <div className="pr-6">
                                    <p className="text-sm font-medium text-gray-900">{flow.name}</p>
                                    {flow.description && (
                                      <p className="text-xs text-gray-500 mt-1">{flow.description}</p>
                                    )}
                                    <p className="text-xs text-gray-400 mt-1">
                                      {new Date(flow.created_at).toLocaleDateString()}
                                    </p>
                                  </div>
                                </button>
                                <button
                                  onClick={(e) => handleDeleteFlow(flow.id, e)}
                                  className="absolute top-3 right-3 text-red-600 hover:text-red-800 text-sm p-1 leading-none rounded hover:bg-red-50"
                                  title="Delete flow"
                                  type="button"
                                >
                                  ×
                                </button>
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
                  !hasUnsavedChanges
                }
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                title={(() => {
                  if (!flowName.trim()) {
                    return 'Enter a flow name to save';
                  }
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
          <div className="pipeline-toolbar absolute left-6 bottom-6 z-50 flex items-center gap-2 rounded-full border border-gray-200 bg-white/95 p-2 shadow-md backdrop-blur">
            <button
              onClick={handleUndo}
              disabled={!canUndo}
              className="p-2 bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              title="Undo (Ctrl+Z / Cmd+Z)"
            >
              <img 
                src="/assets/icons/back-icon.svg" 
                alt="Undo" 
                className="w-4 h-4 scale-y-[-1]"
              />
            </button>
            <button
              onClick={handleRedo}
              disabled={!canRedo}
              className="p-2 bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              title="Redo (Ctrl+Shift+Z / Cmd+Shift+Z)"
            >
              <img 
                src="/assets/icons/return-icon.svg" 
                alt="Redo" 
                className="w-4 h-4 rotate-180"
              />
            </button>
            <button
              onClick={() => setViewAction({ type: 'reset', id: Date.now() })}
              className="p-2 bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200 flex items-center justify-center"
              title="Reset zoom"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12a9 9 0 0115.3-6.36M21 12a9 9 0 01-15.3 6.36" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3v6h6M21 21v-6h-6" />
              </svg>
            </button>
          </div>
        <FlowPipeline
          nodes={nodes}
          selectedNodeId={selectedNodeId}
          activePreviewNodeIds={activePreviewNodeIds}
          fileSourceNodeId={fileSourceNode?.id || null}
          viewAction={viewAction}
          previewFiles={previewFiles}
          previewSheetsByFileId={sheetOptionsByFileId}
          sourceFileId={resolvedSourceFileId}
          sourceFileIds={sourceFileIds}
          sourceSheetName={sourceSheetName}
          previewOverrides={previewOverrides}
          previews={stepPreviews}
          previewLoading={previewLoading}
          previewErrors={previewErrors}
          onNodeClick={handleNodeClick}
          onAddOperation={handleAddOperation}
          onDeleteNode={handleDeleteNode}
          onReorderNodes={handleReorderNodes}
          onSourceSheetChange={handleSourceSheetChange}
          onSourceFileChange={handleSourceFileChange}
          onPreviewFileChange={handlePreviewFileChange}
          onPreviewSheetChange={handlePreviewSheetChange}
          onPreviewTargetChange={handlePreviewTargetChange}
          onTogglePreview={handleTogglePreview}
          onApplyPreviewTarget={handleApplyPreviewTarget}
          onExport={handleExport}
        />
        </div>
      </div>
      
      {/* Right Sidebar - Properties Panel */}
      <PropertiesPanel 
        selectedNodeId={selectedNodeId} 
        onClose={handleClosePropertiesPanel}
        lastTarget={lastTarget}
        onUpdateLastTarget={setLastTarget}
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
          confirmDisabled={confirmModalConfig.confirmDisabled}
        />
      )}
    </div>
  );
};
