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
  Batch,
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
  const [flowName, setFlowName] = useState('Untitled');
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
  const [previewBatches, setPreviewBatches] = useState<Batch[]>([]);
  const [sheetOptionsByFileId, setSheetOptionsByFileId] = useState<Record<number, string[]>>({});
  const [previewOverrides, setPreviewOverrides] = useState<Record<string, TableTarget>>({});
  const [activePreviewNodeIds, setActivePreviewNodeIds] = useState<Set<string>>(new Set());
  const [previewRefreshTokens, setPreviewRefreshTokens] = useState<Record<string, number>>({});
  const [viewAction, setViewAction] = useState<{ type: 'fit' | 'reset'; id: number } | null>(null);
  const [lastTarget, setLastTarget] = useState<TableTarget>({ fileId: null, sheetName: null });
  const [filesRefreshKey, setFilesRefreshKey] = useState(0);
  const savedFlowDataRef = useRef<string>('');
  const hasUnsavedChangesRef = useRef(false);
  const historyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isUndoRedoInProgressRef = useRef(false);
  const hasInitializedRef = useRef(false);
  const hasInitializedFlowStateRef = useRef(false);
  const previewSignatureRef = useRef<Record<string, string>>({});
  const previewRefreshTokenRef = useRef<Record<string, number>>({});
  const stepPreviewsRef = useRef<Record<string, FilePreview | null>>({});
  const previewUpdateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewRunIdRef = useRef(0);
  const previewPrecomputeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewPrecomputeSignatureRef = useRef<string | null>(null);
  // Guard against concurrent auto-save calls creating duplicate flows
  const creatingFlowRef = useRef<Promise<number> | null>(null);
  const searchParamsKey = useMemo(() => searchParams.toString(), [searchParams]);
  // Cache raw file previews by file+sheet to avoid re-fetching when users switch tabs.
  const previewCacheRef = useRef<Map<string, FilePreview>>(new Map());
  // Track in-flight preview requests so rapid sheet clicks share the same promise.
  const previewInFlightRef = useRef<Map<string, Promise<FilePreview>>>(new Map());
  // Cache transform previews by signature so sheet switches can reuse results.
  const transformPreviewCacheRef = useRef<Map<string, FilePreview>>(new Map());

  useEffect(() => {
    // If a batch is selected before previewFiles load, pick the first batch file once available.
    const shouldLockScroll =
      isModalOpen ||
      isOperationModalOpen ||
      showConfirmModal ||
      activePreviewNodeIds.size > 0;
    if (!shouldLockScroll) {
      document.body.style.overflow = '';
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [activePreviewNodeIds.size, isModalOpen, isOperationModalOpen, showConfirmModal]);

  // Undo/Redo system
  const { addToHistory, undo, redo, canUndo, canRedo, reset } = useUndoRedo({
    nodes: getFlowData().nodes,
    edges: getFlowData().edges,
  });

  // Source selection is explicit; avoid auto-picking a file from uploads.

  const applySourceTargetSelection = useCallback((nodeId: string, target: TableTarget) => {
    const currentNode = useFlowStore.getState().nodes.find((node) => node.id === nodeId);
    if (!currentNode) {
      return;
    }

    // Update node data in one place so source selection stays consistent with previews.
    updateNode(nodeId, {
      data: {
        ...currentNode.data,
        target,
      },
    });

    setSourceFileId(target.fileId);
    if (target.sheetName) {
      setSourceSheetByFileId((prev) => ({
        ...prev,
        [target.fileId as number]: target.sheetName,
      }));
      setSourceSheetName(target.sheetName);
    } else if (sourceFileId !== target.fileId) {
      // Reset sheet if the file changed and no explicit sheet was chosen.
      setSourceSheetName(null);
    }
  }, [updateNode, sourceFileId]);

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

    if (hasInitializedFlowStateRef.current) {
      return;
    }

    // Snapshot once; getFlowData dependency would retrigger the effect on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    savedFlowDataRef.current = JSON.stringify(getFlowData());
    hasUnsavedChangesRef.current = false;
    setHasUnsavedChanges(false);
    hasInitializedFlowStateRef.current = true;
  }, [loadFlows]);

  // Track unsaved changes
  useEffect(() => {
    // For new flows (no selectedFlowId), allow saving if anything differs from the clean base state
    if (!selectedFlowId) {
      // Base state: exactly 2 nodes (source-0 + output-0), no edges, name is "Untitled" or empty
      const isBaseSourceNode = 
        nodes[0]?.id === 'source-0' && 
        nodes[0]?.type === 'source';
      const isBaseOutputNode = 
        nodes[1]?.id === 'output-0' && 
        nodes[1]?.type === 'output';
      const isBaseNodeStructure = 
        nodes.length === 2 && 
        isBaseSourceNode && 
        isBaseOutputNode;
      
      const sourceData = nodes[0]?.data;
      const hasUploadedFiles =
        Array.isArray(sourceData?.fileIds) ? sourceData.fileIds.length > 0 : Boolean(sourceData?.fileId);
      
      // Check if name is non-empty AND not the default "Untitled"
      const hasNameChange = flowName.trim().length > 0 && flowName !== 'Untitled Flow' && flowName !== 'Untitled';

      // Mark as unsaved if any of these are true:
      // - Name changed from default
      // - There are edges (blocks are connected)
      // - Node structure differs from base (more/fewer nodes, different IDs)
      // - Files have been uploaded to the source
      const hasChanges =
        hasNameChange ||
        edges.length > 0 ||
        !isBaseNodeStructure ||
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
    
    // Get saved flow data
    const savedFlowData = JSON.parse(savedFlowDataRef.current);
    
    // Compare flow data excluding positions (position changes don't count as unsaved changes)
    const currentForComparison = {
      nodes: nodes.map((node) => {
        const { position: _position, ...rest } = node;
        return rest;
      }),
      edges: edges,
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
  }, [nodes, edges, flowName, selectedFlowId]);

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
      setFlowName('Untitled'); 
      hasInitializedRef.current = true;
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
    if (!selectedFlowId && !hasInitializedRef.current) {
      // Check store state directly to avoid dependency loop
      const currentNodes = useFlowStore.getState().nodes;
      const hasSourceNode = currentNodes.some((node) => node.id === 'source-0' && node.type === 'source');
      const hasOutputNode = currentNodes.some((node) => node.id === 'output-0' && node.type === 'output');
      const hasBaseNodes = currentNodes.length === 2 && hasSourceNode && hasOutputNode;

      if (!hasBaseNodes) {
        clearFlowInternal();
        setFlowName('Untitled');
      } else {
        hasInitializedRef.current = true;
        if (!flowName) setFlowName('Untitled');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParamsKey, selectedFlowId]);

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
    setFlowName('Untitled');
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
            output: (outputNode.data as unknown as BlockData).output,
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

  const handleNodeClick = (nodeId: string) => {
    // Set selected node for properties panel.
    setSelectedNodeId(nodeId);
  };

  const handleUploadClick = (nodeId: string) => {
    setSelectedNodeId(nodeId);
    setIsModalOpen(true);
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
      'row-filter': { type: 'transform', blockType: 'filter_rows' },
      'sort-rows': { type: 'transform', blockType: 'sort_rows' },
      'remove-duplicates': { type: 'transform', blockType: 'remove_duplicates' },
      'column-manager': { type: 'transform', blockType: 'column_manager' },
      'text-cleanup': { type: 'transform', blockType: 'text_cleanup' },
      'calculated-column': { type: 'transform', blockType: 'calculated_column' },
      'type-format': { type: 'transform', blockType: 'type_and_format' },
      'split-merge': { type: 'transform', blockType: 'split_merge' },
      'reshape-table': { type: 'transform', blockType: 'reshape_table' },
      'lookup-map': { type: 'transform', blockType: 'lookup_map' },
      'append-files': { type: 'transform', blockType: 'append_files' },
      'sheet-manager': { type: 'transform', blockType: 'sheet_manager' },
      'qa-checks': { type: 'transform', blockType: 'qa_checks' },
      'data-entry': { type: 'transform', blockType: 'data_entry' },
      'mapping-input': { type: 'mapping', blockType: 'mapping' },
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
    const configDefaults: Record<string, Record<string, unknown>> = {
      filter_rows: {
        column: '',
        operator: 'equals',
        value: '',
      },
      sort_rows: {
        sortBy: [],
      },
      remove_duplicates: {
        columns: [],
        keep: 'first',
      },
      column_manager: {
        actions: [],
      },
      text_cleanup: {
        trimWhitespace: true,
        normalizeSpaces: true,
        standardizeCase: null,
        findReplace: [],
        replaceNulls: null,
      },
      calculated_column: {
        outputColumn: '',
        formula: '',
      },
      type_and_format: {
        column: '',
        targetType: '',
        format: '',
      },
      split_merge: {
        mode: 'split',
        sourceColumn: '',
        targetColumns: [],
        delimiter: '',
      },
      reshape_table: {
        mode: 'transpose',
        idColumns: [],
        valueColumns: [],
        variableColumnName: 'field',
        valueColumnName: 'value',
        indexColumns: [],
        columnField: '',
        valueField: '',
        aggregation: 'first',
      },
      lookup_map: {
        mode: 'lookup',
        sourceColumn: '',
        lookupFile: null,
        lookupSheet: null,
        keyColumn: '',
        valueColumn: '',
        mappingPairs: [],
        defaultValue: null,
      },
      append_files: {
        fileIds: [],
      },
      sheet_manager: {
        actions: [],
      },
      qa_checks: {
        checks: [],
      },
      data_entry: {
        rows: [],
      },
    };

    const newNode: Node = {
      id: `${type}-${Date.now()}`,
      type: type,
      position: { x: 0, y: 0 },
      data: {
        blockType: blockType,
        label: operation.label,
        config: configDefaults[blockType] ?? {},
        target: targetForNode,
        destination: operation.id === 'output' ? undefined : undefined,
        sourceTargets: operation.id === 'output' ? undefined : [],
        destinationTargets: operation.id === 'output' ? undefined : [],
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

  const handleFileUploaded = async (fileIds: number[]) => {
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
        // Source selection is manual; uploading files should not auto-pick a source.
        // Mark as unsaved changes when files are uploaded
        // This allows the user to save the flow after uploading or deleting files
        if (hasFileIdChanges) {
          hasUnsavedChangesRef.current = true;
          setHasUnsavedChanges(true);
          queuePreviewPrecompute();
          // Trigger refresh of file list in PropertiesPanel
          setFilesRefreshKey((prev) => prev + 1);
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
      const blockType = node.data?.blockType || node.type;
      if (blockType === 'mapping') {
        return false;
      }
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
  const resolvedSourceFileId = sourceFileId;

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
      // Fallback: Default to first available file if no target is explicitly set
      if (sourceFileIds.length > 0) {
          return sourceFileIds[0];
      }
      return null;
    });
  }, [fileSourceNode, sourceFileIds.join(',')]);

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

  // Source targets are chosen per operation; avoid auto-populating defaults.

  useEffect(() => {
    if (!fileSourceNode || !resolvedSourceFileId) {
      return;
    }
    const sourceTarget: TableTarget = {
      fileId: resolvedSourceFileId,
      sheetName: sourceSheetName ?? null,
      batchId: (fileSourceNode.data?.target as TableTarget | undefined)?.batchId ?? null,
    };
    const existingTarget = fileSourceNode.data?.target as TableTarget | undefined;
    const hasChanged =
      existingTarget?.fileId !== sourceTarget.fileId ||
      existingTarget?.sheetName !== sourceTarget.sheetName ||
      existingTarget?.batchId !== sourceTarget.batchId;
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
    if (!fileSourceNode) {
      return;
    }
    const sourceTarget = fileSourceNode.data?.target as TableTarget | undefined;
    const sourceBatchId = sourceTarget?.batchId ?? null;
    if (!sourceBatchId) {
      return;
    }
    // Avoid clearing batch selection while preview files are still loading.
    if (previewFiles.length === 0) {
      return;
    }
    const batchFileIds = previewFiles
      .filter((file) => file.batch_id === sourceBatchId)
      .map((file) => file.id);
    if (batchFileIds.length === 0) {
      if (sourceFileId !== null) {
        setSourceFileId(null);
      }
      return;
    }
    if (sourceTarget?.fileId && batchFileIds.includes(sourceTarget.fileId)) {
      return;
    }
    // Prevent infinite loop if already cleared
    if (!sourceTarget?.fileId && !sourceTarget?.sheetName) {
      if (sourceFileId !== null) setSourceFileId(null);
      return;
    }
    // Selected file is no longer in the group; clear selection so the user picks again.
    applySourceTargetSelection(fileSourceNode.id, {
      fileId: null,
      sheetName: null,
      batchId: sourceBatchId,
    });
    setSourceFileId(null);
  }, [applySourceTargetSelection, fileSourceNode, previewFiles, sourceFileId]);

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

  /*
  useEffect(() => {
    const fallbackOutput = getFirstOutputSheetTarget();
    if (!fallbackOutput) {
      return;
    }
    nodes.forEach((node) => {
      const blockType = node.data?.blockType || node.type;
      if (blockType === 'output' || blockType === 'source' || blockType === 'data' || blockType === 'upload') {
        return;
      }
      const destinationTargets = node.data?.destinationTargets as TableTarget[] | undefined;
      if (Array.isArray(destinationTargets)) {
        return;
      }
      const destination = node.data?.destination as TableTarget | undefined;
      if (destination?.fileId || destination?.virtualId) {
        return;
      }
      updateNode(node.id, {
        data: {
          ...node.data,
          destination: fallbackOutput,
          destinationTargets: [fallbackOutput],
        },
      });
    });
  }, [nodes, getFirstOutputSheetTarget, updateNode]);
  */

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
      const sourceTargets = data.sourceTargets as TableTarget[] | undefined;
      if (Array.isArray(sourceTargets)) {
        sourceTargets.forEach((sourceTarget) => {
          if (sourceTarget?.fileId) {
            fileIds.add(sourceTarget.fileId);
          }
        });
      }
      const destinationTargets = data.destinationTargets as TableTarget[] | undefined;
      if (Array.isArray(destinationTargets)) {
        destinationTargets.forEach((destTarget) => {
          if (destTarget?.fileId) {
            fileIds.add(destTarget.fileId);
          }
        });
      }
      const mappingTargets = data.mappingTargets as { fileId?: number | null }[] | undefined;
      if (Array.isArray(mappingTargets)) {
        mappingTargets.forEach((mappingTarget) => {
          if (mappingTarget?.fileId) {
            fileIds.add(mappingTarget.fileId);
          }
        });
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

  // Precompute output previews to keep first preview open/sheet switching responsive.
  const queuePreviewPrecompute = useCallback(() => {
    const flowData = getFlowData();
    const fileIds = collectFileIds(nodes);
    const signature = JSON.stringify({
      fileIds,
      flowData,
    });
    if (previewPrecomputeSignatureRef.current === signature) {
      return;
    }
    if (previewPrecomputeTimeoutRef.current) {
      clearTimeout(previewPrecomputeTimeoutRef.current);
    }
    previewPrecomputeTimeoutRef.current = setTimeout(() => {
      previewPrecomputeSignatureRef.current = signature;
      void transformApi.precompute({
        file_id: fileIds[0],
        file_ids: fileIds.length > 0 ? fileIds : undefined,
        flow_data: flowData,
      }).catch(() => {
        // Precompute is best-effort; ignore failures to keep UI responsive.
      });
    }, 200);
  }, [collectFileIds, getFlowData, nodes]);


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
    async (fileId: number, sheetName?: string, forceRefresh = false) => {
      const cacheKey = makePreviewCacheKey(fileId, sheetName);
      const cached = previewCacheRef.current.get(cacheKey);
      if (cached && !forceRefresh) {
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
    stepPreviewsRef.current = stepPreviews;
  }, [stepPreviews]);

  useEffect(() => {
    if (nodes.length === 0) {
      // Only clear if we actually have data to clear, to avoid infinite loops
      if (Object.keys(stepPreviews).length > 0) {
        setStepPreviews({});
        setPreviewLoading({});
        setPreviewErrors({});
        previewSignatureRef.current = {};
        setActivePreviewNodeIds(new Set());
      }
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
      setStepPreviews((prev) => {
        const next = { ...prev };
        activeNodeIds.forEach((nodeId) => {
          next[nodeId] = null;
        });
        return next;
      });
      setPreviewErrors((prev) => {
        const next = { ...prev };
        activeNodeIds.forEach((nodeId) => {
          const node = nodes.find((item) => item.id === nodeId);
          next[nodeId] = node?.id === fileSourceNode?.id
            ? 'Select a source file to preview.'
            : prev[nodeId] ?? null;
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
    const fileIdSnapshot = resolvedSourceFileId ?? sourceFileIds[0] ?? null;
    const sheetSnapshot = sourceSheetName || undefined;
    const fileIdsSnapshot = collectFileIds(nodesSnapshot);

    // Signature map lets us recompute only when upstream config/order changes.
    const signaturesToUpdate = new Set<string>();
    const signatureMap = { ...previewSignatureRef.current };
    const forceRefreshNodes = new Set<string>();

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
      const refreshToken = previewRefreshTokens[nodeId] ?? 0;
      const lastRefreshToken = previewRefreshTokenRef.current[nodeId] ?? 0;
      const shouldRefresh = refreshToken !== lastRefreshToken;
      if (shouldRefresh) {
        previewRefreshTokenRef.current[nodeId] = refreshToken;
        forceRefreshNodes.add(nodeId);
      }
      if (signatureMap[nodeId] !== signature) {
        signatureMap[nodeId] = signature;
        signaturesToUpdate.add(nodeId);
        return;
      }
      if (shouldRefresh) {
        signaturesToUpdate.add(nodeId);
      }
    });

    // If nothing changed upstream, skip recompute for all active previews.
    if (signaturesToUpdate.size === 0) {
      return;
    }

    previewSignatureRef.current = signatureMap;

    const cachedPreviews: Record<string, FilePreview> = {};
    const cachedLoading: Record<string, boolean> = {};
    const cachedErrors: Record<string, string | null> = {};
    const uncachedNodes = new Set(signaturesToUpdate);

    signaturesToUpdate.forEach((nodeId) => {
      const index = nodesSnapshot.findIndex((node) => node.id === nodeId);
      if (index <= 0) {
        return;
      }
      const signature = signatureMap[nodeId];
      if (!signature) {
        return;
      }
      if (forceRefreshNodes.has(nodeId)) {
        return;
      }
      const cached = transformPreviewCacheRef.current.get(signature);
      if (!cached) {
        return;
      }
      cachedPreviews[nodeId] = cached;
      cachedLoading[nodeId] = false;
      cachedErrors[nodeId] = null;
      uncachedNodes.delete(nodeId);
    });

    if (Object.keys(cachedPreviews).length > 0) {
      setStepPreviews((prev) => ({ ...prev, ...cachedPreviews }));
      setPreviewErrors((prev) => ({ ...prev, ...cachedErrors }));
      setPreviewLoading((prev) => ({ ...prev, ...cachedLoading }));
    }

    if (uncachedNodes.size === 0) {
      return;
    }

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
      uncachedNodes.forEach((nodeId) => {
        nextLoading[nodeId] = !stepPreviewsRef.current[nodeId];
      });
      setPreviewLoading((prev) => ({ ...prev, ...nextLoading }));

      (async () => {
        for (const nodeId of uncachedNodes) {
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
              const targetFileId = sourceTarget?.fileId ?? fileIdSnapshot ?? sourceFileIds[0];
              const rememberedSheet = targetFileId ? sourceSheetByFileId[targetFileId] : null;
              const targetSheetName = sourceTarget?.sheetName ?? sheetSnapshot ?? rememberedSheet ?? undefined;
              if (!targetFileId) {
                setStepPreviews((prev) => ({ ...prev, [node.id]: null }));
                setPreviewErrors((prev) => ({
                  ...prev,
                  [node.id]: 'Select a source file and sheet to preview.',
                }));
                continue;
              }
              const preview = await fetchFilePreview(
                targetFileId,
                targetSheetName,
                forceRefreshNodes.has(nodeId)
              );
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
              const signature = signatureMap[nodeId];
              if (signature) {
                transformPreviewCacheRef.current.set(signature, result.preview);
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
    previewRefreshTokens,
    previewOverrides,
    getOutputPreviewTarget,
    sheetOptionsByFileId,
    sourceFileIds,
    sourceSheetByFileId,
  ]);

  useEffect(() => {
    return () => {
      if (previewPrecomputeTimeoutRef.current) {
        clearTimeout(previewPrecomputeTimeoutRef.current);
      }
    };
  }, []);

  const handleSourceSheetChange = useCallback((sheetName: string) => {
    const targetFileId = resolvedSourceFileId;
    if (!targetFileId) {
      return;
    }
    setSourceSheetByFileId((prev) => ({
      ...prev,
      [targetFileId]: sheetName,
    }));
    setSourceSheetName(sheetName);
  }, [resolvedSourceFileId]);

  const bumpPreviewRefresh = useCallback((nodeId: string) => {
    setPreviewRefreshTokens((prev) => ({
      ...prev,
      [nodeId]: (prev[nodeId] ?? 0) + 1,
    }));
  }, []);

  const handleSourceFileChange = useCallback((fileId: number, batchId?: number | null) => {
    setSourceFileId(fileId);
    if (!fileSourceNode) {
      return;
    }
    const sheetName = sourceSheetByFileId[fileId] ?? null;
    applySourceTargetSelection(fileSourceNode.id, {
      fileId,
      sheetName,
      batchId: batchId ?? null,
    });
    bumpPreviewRefresh(fileSourceNode.id);
  }, [applySourceTargetSelection, bumpPreviewRefresh, fileSourceNode, sourceSheetByFileId]);

  const handleSourceBatchChange = useCallback((batchId: number | null) => {
    if (!fileSourceNode) {
      return;
    }

    if (batchId === null) {
      applySourceTargetSelection(fileSourceNode.id, {
        fileId: null,
        sheetName: null,
        batchId: null,
      });
      setSourceFileId(null);
      return;
    }

    // Selecting a group should immediately pick a file so previews don't blank out.
    const firstBatchFile = previewFiles.find((file) => file.batch_id === batchId) ?? null;
    const sheetName = firstBatchFile ? sourceSheetByFileId[firstBatchFile.id] ?? null : null;

    applySourceTargetSelection(fileSourceNode.id, {
      fileId: firstBatchFile?.id ?? null,
      sheetName,
      batchId,
    });
    setSourceFileId(firstBatchFile?.id ?? null);
    bumpPreviewRefresh(fileSourceNode.id);
  }, [applySourceTargetSelection, bumpPreviewRefresh, fileSourceNode, previewFiles, sourceSheetByFileId]);

  useEffect(() => {
    if (!fileSourceNode) {
      return;
    }
    const sourceTarget = fileSourceNode.data?.target as TableTarget | undefined;
    if (!sourceTarget?.batchId || sourceTarget.fileId) {
      return;
    }
    const firstBatchFile = previewFiles.find((file) => file.batch_id === sourceTarget.batchId) ?? null;
    if (!firstBatchFile) {
      return;
    }
    applySourceTargetSelection(fileSourceNode.id, {
      fileId: firstBatchFile.id,
      sheetName: sourceSheetByFileId[firstBatchFile.id] ?? null,
      batchId: sourceTarget.batchId,
    });
    setSourceFileId(firstBatchFile.id);
    bumpPreviewRefresh(fileSourceNode.id);
  }, [applySourceTargetSelection, bumpPreviewRefresh, fileSourceNode, previewFiles, sourceSheetByFileId]);

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
      setPreviewBatches([]);
      return;
    }
    const fileIdSet = new Set(fileIds);
    Promise.all([filesApi.list(), filesApi.listBatches(selectedFlowId ?? undefined)])
      .then(([files, batches]) => {
        const filtered = files.filter((file) => fileIdSet.has(file.id));
        setPreviewFiles(filtered);
        setPreviewBatches(batches);
      })
      .catch(() => {
        setPreviewFiles([]);
        setPreviewBatches([]);
      });
  }, [collectFileIds, nodes, selectedFlowId]);

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
    const isCurrentlyOpen = activePreviewNodeIds.has(nodeId);
    if (!isCurrentlyOpen) {
      const cachedPreview = stepPreviews[nodeId];
      if (cachedPreview) {
        setPreviewLoading((prev) => ({ ...prev, [nodeId]: false }));
        setPreviewErrors((prev) => ({ ...prev, [nodeId]: null }));
      }
      // Force a background refresh so reopened previews stay fresh.
      setPreviewRefreshTokens((prev) => ({
        ...prev,
        [nodeId]: (prev[nodeId] ?? 0) + 1,
      }));
      const node = nodes.find((item) => item.id === nodeId);
      if (node?.data?.blockType === 'output' || node?.type === 'output') {
        queuePreviewPrecompute();
      }
    }
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
    if (!destinationTarget?.virtualId && !destinationTarget?.fileId) {
      const fallbackOutput = getFirstOutputSheetTarget();
      if (fallbackOutput) {
        setPreviewOverrides((prev) => ({
          ...prev,
          [nodeId]: fallbackOutput,
        }));
        return;
      }
    }
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

  const getOutputBatchId = useCallback(() => {
    const outputNode = nodes.find((node) => node.data?.blockType === 'output');
    const outputBatchId = outputNode?.data?.outputBatchId;
    return typeof outputBatchId === 'number' ? outputBatchId : null;
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
        output_batch_id: getOutputBatchId(),
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
    } catch (error: any) {
      console.error('Failed to export flow:', error);
      const message = error.response?.data?.detail || 'We could not export the output file.';
      showModal('error', 'Export failed', message);
    }
  };

  const handleReorderNodes = (nextNodes: Node[]) => {
    setNodes(nextNodes);
    setEdges([]);
    hasUnsavedChangesRef.current = true;
    setHasUnsavedChanges(true);
  };

  const handleAutoSave = async (): Promise<number> => {
    // Return existing flow ID if already saved
    if (selectedFlowId) {
      return selectedFlowId;
    }

    // If a creation is already in progress, wait for it instead of creating a duplicate
    if (creatingFlowRef.current) {
      return creatingFlowRef.current;
    }

    setIsSaving(true);
    
    // Create the promise and store it in ref before awaiting
    const createPromise = (async () => {
      try {
        const flowData = getFlowData();
        const defaultName = flowName.trim() || 'Untitled';
        
        const createdFlow = await flowsApi.create({
          name: defaultName,
          description: '',
          flow_data: flowData,
        });

        // Save state
        setFlowName(createdFlow.name);
        setSelectedFlowId(createdFlow.id);
        savedFlowDataRef.current = JSON.stringify({ ...flowData, flowName: createdFlow.name });
        hasUnsavedChangesRef.current = false;
        setHasUnsavedChanges(false);
        
        await loadFlows();
        return createdFlow.id;
      } catch (error) {
        console.error('Failed to auto-save flow:', error);
        showModal('error', 'Error', 'Failed to save flow automatically');
        throw error;
      } finally {
        setIsSaving(false);
        creatingFlowRef.current = null;
      }
    })();

    creatingFlowRef.current = createPromise;
    return createPromise;
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
                  if (selectedFlowId && !hasUnsavedChanges) {
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
                  if (selectedFlowId && !hasUnsavedChanges) return 'Saved';
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
          isInteractionDisabled={isModalOpen || isOperationModalOpen}
          previewFiles={previewFiles}
          previewBatches={previewBatches}
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
          onSourceBatchChange={handleSourceBatchChange}
          onPreviewFileChange={handlePreviewFileChange}
          onPreviewSheetChange={handlePreviewSheetChange}
          onPreviewTargetChange={handlePreviewTargetChange}
          onTogglePreview={handleTogglePreview}
          onApplyPreviewTarget={handleApplyPreviewTarget}
          onUpload={handleUploadClick}
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
        refreshKey={filesRefreshKey}
        flowId={selectedFlowId ?? undefined}
      />
      
      {/* Data Upload Modal */}
      <DataUploadModal
        isOpen={isModalOpen}
        onClose={() => {
          // hasUnsavedChanges is already set in handleFileUploaded when files are uploaded
          // No need to check again here - the useEffect will also detect changes
          setIsModalOpen(false);
          setIsFileUploading(false);
        }}
        nodeId={selectedNodeId || ''}
        onFileUploaded={handleFileUploaded}
        initialFileIds={selectedNodeId ? getNodeFileIds(selectedNodeId) : []}
        onUploadStart={() => setIsFileUploading(true)}
        onUploadEnd={() => setIsFileUploading(false)}
        flowId={selectedFlowId ?? undefined}
        onEnsureFlowSaved={handleAutoSave}
        onFlowModified={() => {
          hasUnsavedChangesRef.current = true;
          setHasUnsavedChanges(true);
        }}
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
