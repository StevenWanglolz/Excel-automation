/**
 * Responsible for:
 * - Rendering the sequential pipeline with per-step previews.
 * - Handling drag-and-drop reordering using @dnd-kit.
 * - Emitting selection, delete, and insert-after events.
 *
 * Key assumptions:
 * - Nodes are ordered in execution sequence.
 * - The first node is the source and must not move.
 *
 * Be careful:
 * - Reordering must keep the source at index 0.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Node } from '@xyflow/react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  pointerWithin,
  type CollisionDetection,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import type { Batch, File, FilePreview, OutputConfig, OutputFileConfig, OutputSheetMapping, TableTarget } from '../../types';
import { DataPreview } from '../Preview/DataPreview';
import { PipelineNodeCard } from './PipelineNodeCard';
import { SortableNode } from './SortableNode';
import { OutputPreviewSelector } from './OutputPreviewSelector';

interface FlowPipelineProps {
  nodes: Node[];
  selectedNodeId: string | null;
  activePreviewNodeIds: Set<string>;
  fileSourceNodeId: string | null;
  viewAction: { type: 'fit' | 'reset'; id: number } | null;
  isInteractionDisabled: boolean;
  previewFiles: File[];
  previewBatches: Batch[];
  previewSheetsByFileId: Record<number, string[]>;
  sourceFileId: number | null;
  sourceFileIds: number[];
  sourceSheetName: string | null;
  previewOverrides: Record<string, TableTarget>;
  outputPreviewTargets?: Record<string, TableTarget[]>;
  previews: Record<string, FilePreview | null>;
  previewLoading: Record<string, boolean>;
  previewErrors: Record<string, string | null>;
  onNodeClick: (nodeId: string) => void;
  onAddOperation: (afterNodeId: string) => void;
  onDeleteNode: (nodeId: string) => void;
  onReorderNodes: (nextNodes: Node[]) => void;
  onSourceSheetChange: (sheetName: string) => void;
  onSourceFileChange: (fileId: number, batchId?: number | null) => void;
  onSourceBatchChange: (batchId: number | null) => void;
  onPreviewFileChange: (nodeId: string, fileId: number) => void;
  onPreviewSheetChange: (nodeId: string, sheetName: string) => void;
  onPreviewTargetChange: (nodeId: string, target: TableTarget) => void;
  onTogglePreview: (nodeId: string) => void;
  onApplyPreviewTarget: (nodeId: string, targetOverride?: TableTarget) => void;
  onUpload: (nodeId: string) => void;
  onExport: () => void;
}

const getConfigSummary = (config: Record<string, unknown> | undefined) => {
  if (!config || typeof config !== 'object') {
    return 'No configuration';
  }
  const entries = Object.entries(config).filter(([, value]) => value !== undefined && value !== null && value !== '');
  if (entries.length === 0) {
    return 'No configuration';
  }
  const previewEntries = entries.slice(0, 3).map(([key, value]) => {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return `${key}: ${value}`;
    }
    return `${key}: set`;
  });
  const extraCount = entries.length - previewEntries.length;
  return extraCount > 0 ? `${previewEntries.join(', ')} +${extraCount} more` : previewEntries.join(', ');
};

const formatTarget = (target?: TableTarget) => {
  try {
    if (!target || !target.fileId) {
      if (target?.virtualId && typeof target.virtualId === 'string' && target.virtualId.startsWith('output:')) {
        const label = target.virtualName || target.sheetName || 'Output sheet';
        return `Target: ${label}`;
      }
      return null;
    }
    const sheetLabel = target.sheetName ? ` / ${target.sheetName}` : '';
    return `Target: File ${target.fileId}${sheetLabel}`;
  } catch (err) {
    console.warn('Error formatting target:', err, target);
    return 'Target: Error';
  }
};

const formatOutput = (output?: OutputConfig) => {
  if (!output) {
    return null;
  }
  const outputs = output.outputs ?? [];
  if (outputs.length === 0) {
    return 'Output: no files';
  }
  if (outputs.length === 1) {
    const sheetCount = outputs[0].sheets?.length ?? 0;
    return sheetCount > 0 ? `Output: ${sheetCount} sheet(s)` : 'Output: empty workbook';
  }
  return `Output: ${outputs.length} files`;
};

const collisionDetectionStrategy: CollisionDetection = (args) => {
  // Prioritize pointer collision so "drop under cursor" feels natural when zoomed.
  const pointerHits = pointerWithin(args);
  if (pointerHits.length > 0) {
    return pointerHits;
  }
  // Fall back to closest center for reliable reordering when pointer misses thin targets.
  return closestCenter(args);
};

export const FlowPipeline = ({
  nodes,
  selectedNodeId,
  activePreviewNodeIds,
  fileSourceNodeId,
  viewAction,
  isInteractionDisabled,
  previewFiles,
  previewBatches,
  previewSheetsByFileId,
  sourceFileId,
  sourceFileIds,
  sourceSheetName,
  previewOverrides,
  outputPreviewTargets,
  previews,
  previewLoading,
  previewErrors,
  onNodeClick,
  onAddOperation,
  onDeleteNode,
  onReorderNodes,
  onSourceSheetChange,
  onSourceFileChange,
  onSourceBatchChange,
  onPreviewFileChange,
  onPreviewSheetChange,
  onPreviewTargetChange,
  onTogglePreview,
  onApplyPreviewTarget,
  onUpload,
  onExport,
}: FlowPipelineProps) => {
  // Canvas scale/pan are owned here so the pipeline can zoom independently of the app shell.
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [previewBatchId, setPreviewBatchId] = useState<number | null>(null);
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Avoid immediate drag jumps by requiring slight movement first.
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const orderedNodes = useMemo(() => nodes, [nodes]);
  // Pin the first node so it never shifts during drag sorting.
  const pinnedNode = orderedNodes[0] || null;
  const sortableNodes = orderedNodes.slice(1);
  const activePreviewNodeId = useMemo(() => {
    const [first] = Array.from(activePreviewNodeIds);
    return first ?? null;
  }, [activePreviewNodeIds]);
  const activePreviewNode = activePreviewNodeId
    ? orderedNodes.find((node) => node.id === activePreviewNodeId) || null
    : null;
  const isSourcePreview = activePreviewNode
    ? activePreviewNode.id === fileSourceNodeId || activePreviewNode.type === 'source'
    : false;
  const isOutputPreview = activePreviewNode
    ? activePreviewNode.data?.blockType === 'output' || activePreviewNode.type === 'output'
    : false;
  const isOperationPreview = Boolean(activePreviewNode && !isSourcePreview && !isOutputPreview);
  const previewOverride = activePreviewNode ? previewOverrides[activePreviewNode.id] : undefined;

  const nodeTarget = activePreviewNode?.data?.target as TableTarget | undefined;
  const nodeDestination = activePreviewNode?.data?.destination as TableTarget | undefined;
  const resolvedOutputVirtualId = previewOverride?.virtualId ?? nodeDestination?.virtualId ?? nodeTarget?.virtualId ?? null;
  const isOutputSheetPreview = Boolean(previewOverride?.virtualId?.startsWith('output:')) ||
    (isOutputPreview && !previewOverride?.fileId);
  


  const activePreviewSourceTargets = useMemo<TableTarget[]>(() => {
    if (!activePreviewNode) {
      return [];
    }
    const payload = activePreviewNode.data?.sourceTargets;
    if (!Array.isArray(payload)) {
      return [];
    }
    return payload as TableTarget[];
  }, [activePreviewNode]);

  const normalizedNodeDestinationTargets = useMemo(() => {
    if (!activePreviewNode) {
      return [];
    }
    const payload = activePreviewNode.data?.destinationTargets as TableTarget[] | undefined;
    if (Array.isArray(payload) && payload.length > 0) {
      return payload;
    }
    if (nodeDestination?.fileId || nodeDestination?.virtualId) {
      return [nodeDestination];
    }
    return [];
  }, [activePreviewNode, nodeDestination]);
  const autoGeneratedDestinationTargets = useMemo(() => {
    if (!activePreviewNode || !isOperationPreview) {
      return [];
    }
    if (activePreviewSourceTargets.length === 0) {
      return [];
    }
    const hasBatchSource = activePreviewSourceTargets.some((target) => target.batchId != null);
    if (!hasBatchSource) {
      return [];
    }
    return activePreviewSourceTargets.map((target, index) => {
      const sheetName = target.sheetName || 'Sheet1';
      const outputId = `auto:${activePreviewNode.id}:${target.batchId ?? 'single'}:${index}`;
      return {
        fileId: null,
        sheetName,
        batchId: target.batchId ?? null,
        virtualId: `output:${outputId}:${sheetName}`,
        virtualName: target.virtualName ?? `Auto output ${index + 1}`,
        sourceId: target.fileId ?? null,
        linkedSourceIds: target.fileId != null ? [target.fileId] : [],
        isFinalOutput: true,
        isFutureSource: false,
      };
    });
  }, [activePreviewNode, activePreviewSourceTargets, isOperationPreview]);
  
  const destinationTargetsForPreview = useMemo(() => {
    return normalizedNodeDestinationTargets.length > 0
      ? normalizedNodeDestinationTargets
      : autoGeneratedDestinationTargets;
  }, [normalizedNodeDestinationTargets, autoGeneratedDestinationTargets]);

  const outputConfig = useMemo(() => {
    // Aggregate all Final Outputs from upstream nodes
    const outputs: OutputFileConfig[] = [];
    const outputFilesMap = new Map<string, OutputFileConfig>();

    nodes.forEach((node) => {
        if (!node.data) return;
        // Check for manual destination targets
        const targets = node.data.destinationTargets as TableTarget[] | undefined;
        // Check if G2G auto-generation applies (if targets is empty and has batch inputs)
        // Note: Global auto-generation check is complex without execution context, 
        // relying on 'destinationTargets' being populated or 'isFinalOutput' flag.
        // For strictly auto-generated G2G that hasn't been saved, we might miss it here
        // unless we replicate the G2G check. 
        // Strategy: Only include explicit 'isFinalOutput' targets for now. 
        // G2G flows usually require at least viewing the node which might trigger save, 
        // or we rely on the user to "Add Destination" if they want explicit control.
        // If "System automatically creates...", we assume they are virtual until saved?
        // Let's stick to explicit targets for the global Output Config to avoid ghost files.
        
        if (Array.isArray(targets)) {
            targets.forEach((target) => {
                if (target.isFinalOutput) {
                   const fileId = target.virtualId || `node-${node.id}-output`;
                   // Grouping logic: 
                   // If virtualId starts with "output:", we can try to extract a file ID for grouping 
                   // or just treat each entry as a file/sheet.
                   // Simple approach: Each target is a file unless we strictly group.
                   // Given "Add Destination" creates "New Destination" virtualName, let's use that as filename.
                   
                   const fileName = target.virtualName || `Output from ${node.data.label || 'Step'}`;
                   const sheetName = target.sheetName || 'Sheet1';
                   
                   // Deduplication or grouping could happen here if we forced users to reuse File IDs.
                   // For now, list them as flat entries or grouped by virtualId prefix if applicable.
                   
                   let existing = outputFilesMap.get(fileId);
                   if (!existing) {
                       existing = {
                           id: fileId,
                           fileName: fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`,
                           sheets: []
                       };
                       outputFilesMap.set(fileId, existing);
                       outputs.push(existing);
                   }
                   
                   // Avoid duplicate sheets
                   if (!existing.sheets.some(s => s.sheetName === sheetName)) {
                       existing.sheets.push({ sheetName });
                   }
                }
            });
        }
    });
    
    // Also include legacy/explicit Output Node config if we want to support backward compat
    // or if the Output Node strictly defines additional files (though Business Logic says Transform defines it).
    // effectively replacing the old config.
    
    return { outputs };
  }, [nodes]);

  const outputFiles = useMemo(() => {
    if (!outputConfig) {
      return [];
    }
    return (outputConfig as OutputConfig).outputs || [];
  }, [outputConfig]);
  const outputFileOptions = useMemo(
    () =>
      outputFiles.map((outputFile, index) => ({
        id: index + 1,
        outputId: outputFile.id,
        label: outputFile.fileName || `output-${index + 1}.xlsx`,
        sheets: outputFile.sheets,
      })),
    [outputFiles]
  );
  const parseOutputVirtualId = useCallback((virtualId?: string | null) => {
    if (!virtualId || !virtualId.startsWith('output:')) {
      return null;
    }
    const raw = virtualId.slice('output:'.length);
    const [outputId, sheetName] = raw.split(':');
    if (!outputId || !sheetName) {
      return null;
    }
    return { outputId, sheetName };
  }, []);

  const destinationOutputFileOptions = useMemo(() => {
    const destTargets = destinationTargetsForPreview;
    if (destTargets.length === 0) {
      return [];
    }
    const seen = new Set<string>();
    return destTargets
      .map((target, index) => {
        const sheetName = target.sheetName || 'Sheet1';
        const parsed = parseOutputVirtualId(target.virtualId);
        const outputId = parsed?.outputId ?? `auto:${activePreviewNode.id}:${index}`;
        return {
          id: -(index + 1),
          outputId,
          label: target.virtualName || `Destination ${index + 1}`,
          sheets: [{ sheetName }],
        };
      })
      .filter((option) => {
        if (seen.has(option.outputId)) {
          return false;
        }
        seen.add(option.outputId);
        return true;
      });
  }, [destinationTargetsForPreview, activePreviewNode, parseOutputVirtualId]);

  const previewOutputFileOptions = useMemo(() => {
    const combined = [...outputFileOptions];
    const seenOutputIds = new Set(combined.map((option) => option.outputId));
    destinationOutputFileOptions.forEach((option) => {
      if (!seenOutputIds.has(option.outputId)) {
        combined.push(option);
        seenOutputIds.add(option.outputId);
      }
    });
    return combined;
  }, [outputFileOptions, destinationOutputFileOptions]);
  const outputFileOptionById = useMemo(
    () => new Map(previewOutputFileOptions.map((option) => [option.id, option])),
    [previewOutputFileOptions]
  );

  const outputFileOptionByOutputId = useMemo(
    () => new Map(previewOutputFileOptions.map((option) => [option.outputId, option])),
    [previewOutputFileOptions]
  );
  const outputPreviewEnabled = previewOutputFileOptions.some((option) => (option.sheets?.length ?? 0) > 0);
  const isActualOutputSheetPreview = isOutputSheetPreview && outputPreviewEnabled;

  const activeOutputFileOption = useMemo(() => {
    if (previewOutputFileOptions.length === 0) {
      return null;
    }
    const parsed = parseOutputVirtualId(resolvedOutputVirtualId);
    if (parsed?.outputId) {
      return outputFileOptionByOutputId.get(parsed.outputId) ?? previewOutputFileOptions[0];
    }
    return isOutputSheetPreview || isOutputPreview ? previewOutputFileOptions[0] : null;
  }, [
    isOutputPreview,
    outputFileOptionByOutputId,
    previewOutputFileOptions,
    parseOutputVirtualId,
    resolvedOutputVirtualId,
  ]);

  const outputSheetLabels = useMemo(() => {
    if (!activeOutputFileOption) {
      return [];
    }
    return (activeOutputFileOption.sheets ?? []).map(
      (sheet, index) => sheet.sheetName || `Sheet ${index + 1}`
    );
  }, [activeOutputFileOption]);

  const activeOutputSheetName = useMemo(() => {
    if (!activeOutputFileOption || outputSheetLabels.length === 0) {
      return null;
    }
    const parsed = parseOutputVirtualId(resolvedOutputVirtualId);
    const candidate = previewOverride?.sheetName ?? parsed?.sheetName;
    if (candidate && outputSheetLabels.includes(candidate)) {
      return candidate;
    }
    return outputSheetLabels[0] ?? null;
  }, [
    activeOutputFileOption,
    outputSheetLabels,
    parseOutputVirtualId,
    previewOverride?.sheetName,
    resolvedOutputVirtualId,
  ]);
  const canPreviewOutputSheets = true;
  const canPreviewSourceFile = Boolean(sourceFileId || activePreviewNode?.data?.target);
  const previewSelectionTarget = useMemo<TableTarget | null>(() => {
    if (!activePreviewNode) {
      return null;
    }
    if (isActualOutputSheetPreview) {
      return previewOverride?.virtualId
        ? previewOverride
        : nodeDestination?.virtualId
          ? nodeDestination
            : nodeTarget?.virtualId
              ? nodeTarget
              : null;
    }
    if (isSourcePreview) {
      return sourceFileId
        ? { fileId: sourceFileId, sheetName: sourceSheetName ?? null }
        : null;
    }
    const target = previewOverride ?? nodeDestination ?? (activePreviewNode.data?.target as TableTarget | undefined);
    return target?.fileId || target?.virtualId ? target : null;
  }, [
    activePreviewNode,
    isActualOutputSheetPreview,
    isSourcePreview,
    previewOverride,
    nodeDestination,
    nodeTarget,
    sourceFileId,
    sourceSheetName,
  ]);
  const canApplyPreviewTarget = Boolean(
    isOperationPreview &&
      (previewSelectionTarget?.fileId || previewSelectionTarget?.virtualId)
  );
  const hasSelectedSource = Boolean(
    isOperationPreview &&
      activePreviewSourceTargets.some((target) => Boolean(target?.fileId || target?.virtualId))
  );
  const sourceBatchId = nodeTarget?.batchId ?? null;
  const showNoOutputSheetsMessage =
    isOutputSheetPreview &&
    !outputPreviewEnabled;
  const filteredSourceFileIds = useMemo(() => {
    const hasBatchFiles = previewFiles.some((file) => file.batch_id);
    const hasIndividualFiles = previewFiles.some((file) => !file.batch_id);

    if (sourceBatchId === null && hasBatchFiles && hasIndividualFiles) {
      const validIds = new Set(
        previewFiles
          .filter((file) => !file.batch_id)
          .map((file) => file.id)
      );
      return sourceFileIds.filter((fileId) => validIds.has(fileId));
    }

    if (sourceBatchId === null) {
      return sourceFileIds;
    }

    const validIds = new Set(
      previewFiles
        .filter((file) => file.batch_id === sourceBatchId)
        .map((file) => file.id)
    );
    return sourceFileIds.filter((fileId) => validIds.has(fileId));
  }, [previewFiles, sourceBatchId, sourceFileIds]);
  const activePreviewFileId = useMemo(() => {
    if (!activePreviewNode) {
      return null;
    }
    if (isSourcePreview) {
      return sourceFileId ?? null;
    }
    if (isActualOutputSheetPreview) {
      return null;
    }
    const target = activePreviewNode.data?.target as TableTarget | undefined;
    return previewOverride?.fileId ?? nodeDestination?.fileId ?? target?.fileId ?? null;
  }, [
    activePreviewNode,
    isActualOutputSheetPreview,
    isSourcePreview,
    nodeDestination?.fileId,
    previewOverride?.fileId,
    sourceFileId,
    filteredSourceFileIds,
  ]);
  const previewSheetOptions = activePreviewFileId
    ? previewSheetsByFileId[activePreviewFileId]
    : undefined;

  const previewBatchOptions = useMemo(() => {
    const batchesWithFiles = previewBatches.filter((batch) =>
      previewFiles.some((file) => file.batch_id === batch.id)
    );
    const options: { id: number | null; label: string }[] = batchesWithFiles.map((batch) => ({
      id: batch.id,
      label: batch.name,
    }));
    const hasIndividualFiles = previewFiles.some((file) => !file.batch_id);
    if (hasIndividualFiles) {
      options.unshift({ id: null, label: 'Single files' });
    }
    return options;
  }, [previewBatches, previewFiles]);
  const operationBatchOptions = useMemo((): { id: number | null; label: string }[] => {
    const actualBatches = previewBatchOptions.filter((option) => option.id !== null) as { id: number; label: string }[];
    if (actualBatches.length <= 1) {
      return [];
    }
    return [{ id: null, label: 'All batches' }, ...actualBatches];
  }, [previewBatchOptions]);

  const previewSourceFileIds = useMemo(
    () =>
      activePreviewSourceTargets
        .map((target) => target.fileId)
        .filter((fileId): fileId is number => typeof fileId === 'number'),
    [activePreviewSourceTargets]
  );
  const previewBatchSourceFileIds = useMemo(
    () =>
      new Set(
        activePreviewSourceTargets
          .filter((target) => typeof target.batchId === 'number')
          .map((target) => target.fileId)
          .filter((fileId): fileId is number => typeof fileId === 'number')
      ),
    [activePreviewSourceTargets]
  );
  const previewIndividualSourceFileIds = useMemo(
    () =>
      new Set(
        activePreviewSourceTargets
          .filter((target) => target.batchId == null)
          .map((target) => target.fileId)
          .filter((fileId): fileId is number => typeof fileId === 'number')
      ),
    [activePreviewSourceTargets]
  );
  const hasBatchPreviewSources = previewBatchSourceFileIds.size > 0;
  const hasIndividualPreviewSources = previewIndividualSourceFileIds.size > 0;
  const [previewSourceFilter, setPreviewSourceFilter] = useState<'all' | 'batch' | 'individual'>('all');

  useEffect(() => {
    setPreviewSourceFilter('all');
    setPreviewBatchId(null);
  }, [activePreviewSourceTargets]);

  useEffect(() => {
    if (previewSourceFilter === 'individual') {
      setPreviewBatchId(null);
    }
  }, [previewSourceFilter]);

  useEffect(() => {
    if (operationBatchOptions.length <= 1) {
      setPreviewBatchId(null);
      return;
    }
    setPreviewBatchId((prev) => {
      if (prev === null) {
        return prev;
      }
      const exists = operationBatchOptions.some((option) => option.id === prev);
      return exists ? prev : null;
    });
  }, [operationBatchOptions]);

  useEffect(() => {
    setPreviewBatchId(null);
  }, [activePreviewNodeId]);

  const previewFileOptions = useMemo(() => {
    if (!activePreviewNode) {
      return [];
    }
    if (isActualOutputSheetPreview) {
      return previewOutputFileOptions;
    }
    const fileIds = (() => {
      if (isOperationPreview) {
        let ids: number[] = [];
        if (previewSourceFilter === 'batch') {
          ids = Array.from(previewBatchSourceFileIds);
        } else if (previewSourceFilter === 'individual') {
          ids = Array.from(previewIndividualSourceFileIds);
        } else {
          ids = previewSourceFileIds;
        }
        if (ids.length === 0) {
          return [];
        }
        if (previewBatchId !== null) {
          const batchSet = new Set(
            previewFiles
              .filter((file) => file.batch_id === previewBatchId)
              .map((file) => file.id)
          );
          ids = ids.filter((fileId) => batchSet.has(fileId));
          if (ids.length === 0) {
            return [];
          }
        }
        return ids;
      }
      if (sourceBatchId !== null) {
        return previewFiles
          .filter((file) => file.batch_id === sourceBatchId)
          .map((file) => file.id);
      }
      return previewFiles
        .filter((file) => file.batch_id === null || file.batch_id === undefined)
        .map((file) => file.id);
    })();

    if (fileIds.length === 0) {
      return [];
    }
    const filesById = new Map(previewFiles.map((file) => [file.id, file]));
    return fileIds.map((id) => ({
      id,
      label: filesById.get(id)?.original_filename ?? `File ${id}`,
    }));
  }, [
    activePreviewNode,
    filteredSourceFileIds,
    isActualOutputSheetPreview,
    isSourcePreview,
    previewOutputFileOptions,
    previewFiles,
    sourceBatchId,
    previewSourceFilter,
    previewSourceFileIds,
    previewBatchSourceFileIds,
    previewIndividualSourceFileIds,
    previewBatchId,
  ]);

  const showPreviewSourceToggle =
    isOperationPreview && (hasBatchPreviewSources || hasIndividualPreviewSources);
  const previewBatchDropdownOptions = isSourcePreview
    ? previewBatchOptions
    : previewSourceFilter === 'individual'
      ? []
      : operationBatchOptions;
  const showPreviewBatchDropdown = previewBatchDropdownOptions.length > 1;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey) {
        return;
      }
      if (event.key !== '=' && event.key !== '-' && event.key !== '+') {
        return;
      }
      event.preventDefault();
      // Keyboard zoom keeps the user's hands on the shortcut flow.
      const nextScale = event.key === '-' ? scale - 0.1 : scale + 0.1;
      setScale(Math.min(1.6, Math.max(0.6, nextScale)));
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [scale]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const handleWheel = (event: WheelEvent) => {
      if (isInteractionDisabled) {
        return;
      }
      if (!event.ctrlKey && !event.metaKey) {
        return;
      }
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      // Zoom around the cursor so users feel like they're "pointing" at the target.
      const scaleDelta = event.deltaY > 0 ? -0.1 : 0.1;
      const nextScale = Math.min(1.6, Math.max(0.6, scale + scaleDelta));
      const cursorX = event.clientX - rect.left;
      const cursorY = event.clientY - rect.top;
      const scaleRatio = nextScale / scale;
      const nextPan = {
        x: cursorX - (cursorX - pan.x) * scaleRatio,
        y: cursorY - (cursorY - pan.y) * scaleRatio,
      };
      setScale(nextScale);
      setPan(nextPan);
    };
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', handleWheel);
    };
  }, [isInteractionDisabled, pan.x, pan.y, scale]);

  useEffect(() => {
    if (!viewAction) {
      return;
    }
    if (viewAction.type === 'reset') {
      // Reset is explicit so the toolbar can snap back to the default scale.
      setScale(1);
      setPan({ x: 0, y: 0 });
      return;
    }

    const canvas = canvasRef.current;
    const content = contentRef.current;
    if (!canvas || !content) {
      return;
    }

    const canvasRect = canvas.getBoundingClientRect();
    // Fit-to-view uses the unscaled content bounds as the baseline.
    const baseWidth = Math.max(content.scrollWidth, 1);
    const baseHeight = Math.max(content.scrollHeight, 1);
    const paddingFactor = 0.9;
    const scaleX = (canvasRect.width * paddingFactor) / baseWidth;
    const scaleY = (canvasRect.height * paddingFactor) / baseHeight;
    const nextScale = Math.min(1.6, Math.max(0.6, Math.min(scaleX, scaleY)));
    const nextPan = {
      x: (canvasRect.width - baseWidth * nextScale) / 2,
      y: (canvasRect.height - baseHeight * nextScale) / 2,
    };
    setScale(nextScale);
    setPan(nextPan);
  }, [viewAction]);

  const handleDragEnd = (event: DragEndEvent) => {
    if (isInteractionDisabled) {
      return;
    }
    const { active, over } = event;

    // Only reorder when we drop over a different item in the sortable list.
    if (active.id !== over?.id && over) {
      const oldIndex = sortableNodes.findIndex((node) => node.id === active.id);
      const newIndex = sortableNodes.findIndex((node) => node.id === over.id);

      if (oldIndex === -1 || newIndex === -1 || !pinnedNode) {
        return;
      }

      // Rebuild the ordered list with the pinned source still first.
      const nextSortable = arrayMove(sortableNodes, oldIndex, newIndex);
      onReorderNodes([pinnedNode, ...nextSortable]);
    }
  };

  return (
    <div
      ref={canvasRef}
      className={`h-full overflow-hidden bg-gray-50 ${isInteractionDisabled ? 'cursor-default' : isPanning ? 'cursor-grabbing' : 'cursor-grab'}`}
      onMouseDown={(event) => {
        if (isInteractionDisabled) {
          return;
        }
        if (event.button !== 0) {
          return;
        }
        const target = event.target as HTMLElement | null;
        if (!target) {
          return;
        }
        // Only pan when dragging empty canvas space.
        if (
          target.closest('.pipeline-block') ||
          target.closest('.pipeline-toolbar') ||
          target.closest('button, input, textarea, select, a, [role="button"]')
        ) {
          return;
        }
        // Capture the start position so we can offset pan by drag distance.
        event.preventDefault();
        setIsPanning(true);
        panStartRef.current = {
          x: event.clientX,
          y: event.clientY,
          panX: pan.x,
          panY: pan.y,
        };
      }}
      onMouseMove={(event) => {
        if (isInteractionDisabled) {
          return;
        }
        if (!panStartRef.current) {
          return;
        }
        // Translate based on pointer delta from the initial pan anchor.
        const nextX = panStartRef.current.panX + (event.clientX - panStartRef.current.x);
        const nextY = panStartRef.current.panY + (event.clientY - panStartRef.current.y);
        setPan({ x: nextX, y: nextY });
      }}
      onMouseUp={() => {
        if (isInteractionDisabled) {
          return;
        }
        setIsPanning(false);
        panStartRef.current = null;
      }}
      onMouseLeave={() => {
        if (isInteractionDisabled) {
          return;
        }
        setIsPanning(false);
        panStartRef.current = null;
      }}
    >
      <div
        className="h-full w-full"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
          transformOrigin: '0 0',
        }}
      >
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetectionStrategy}
          onDragEnd={handleDragEnd}
        >
          {/* Content wrapper defines the bounds used for fit-to-view. */}
          <div ref={contentRef} className="mx-auto flex w-full max-w-xs flex-col gap-2 px-6 py-4">
            {pinnedNode && (
              <PipelineNodeCard
                node={pinnedNode}
                isFileSource={true}
                isSelected={selectedNodeId === pinnedNode.id}
                isPreviewOpen={activePreviewNodeIds.has(pinnedNode.id)}
                canPreview={true}
                canUpload={true}
                uploadLabel="Upload"
                uploadCount={Array.isArray(pinnedNode.data?.fileIds) ? pinnedNode.data.fileIds.length : 0}
                configSummary={[
                  formatTarget(pinnedNode.data?.target as TableTarget | undefined),
                  getConfigSummary(pinnedNode.data?.config as Record<string, unknown> | undefined),
                  formatOutput(pinnedNode.data?.output as OutputConfig | undefined),
                ]
                  .filter(Boolean)
                  .join(' • ')}
                onNodeClick={onNodeClick}
                onAddOperation={onAddOperation}
                onDeleteNode={onDeleteNode}
                onTogglePreview={onTogglePreview}
                onUpload={onUpload}
                onExport={onExport}
              />
            )}
            {/* DnD-kit expects stable IDs; keep the list keyed by node IDs. */}
            <SortableContext items={sortableNodes.map((node) => node.id)} strategy={verticalListSortingStrategy}>
              {sortableNodes.map((node) => {
                const isFileSource = fileSourceNodeId === node.id || node.type === 'source';
                const isOutputNode = node.data?.blockType === 'output' || node.type === 'output';
                const isMappingNode = node.data?.blockType === 'mapping' || node.type === 'mapping';
                const configSummary = [
                  formatTarget(node.data?.target as TableTarget | undefined),
                  getConfigSummary(node.data?.config as Record<string, unknown> | undefined),
                  formatOutput(node.data?.output as OutputConfig | undefined),
                ]
                  .filter(Boolean)
                  .join(' • ');
                const isSelected = selectedNodeId === node.id;
                const isPreviewOpen = activePreviewNodeIds.has(node.id);
                const nodeSourceTargets = Array.isArray(node.data?.sourceTargets)
                  ? (node.data?.sourceTargets as TableTarget[])
                  : [];
                const hasOperationSources = nodeSourceTargets.some((target) =>
                  Boolean(target?.fileId || target?.virtualId)
                );
                const isOperationNode = !isFileSource && !isOutputNode && !isMappingNode;
                const canPreview = !isMappingNode && (!isOperationNode || hasOperationSources);
                const uploadCount = Array.isArray(node.data?.fileIds) ? node.data.fileIds.length : 0;

                return (
                  <SortableNode
                    key={node.id}
                    node={node}
                    scale={scale}
                    isInteractionDisabled={isInteractionDisabled}
                    isFileSource={isFileSource}
                    isSelected={isSelected}
                    isPreviewOpen={isPreviewOpen}
                    canPreview={canPreview}
                    canUpload={isMappingNode}
                    uploadLabel="Upload mappings"
                    uploadHint="Click to upload mapping files"
                    uploadCount={uploadCount}
                    configSummary={configSummary}
                    onNodeClick={onNodeClick}
                    onAddOperation={onAddOperation}
                    onDeleteNode={onDeleteNode}
                    onTogglePreview={onTogglePreview}
                    onUpload={onUpload}
                    onExport={onExport}
                  />
                );
              })}
            </SortableContext>
          </div>
        </DndContext>
      </div>
      {activePreviewNode && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
          onClick={(event) => {
            if (event.target !== event.currentTarget) {
              return;
            }
            onTogglePreview(activePreviewNode.id);
          }}
        >
          <div
            className="w-full max-w-6xl rounded-2xl bg-white shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <div>
                <div className="text-sm font-semibold text-gray-900">Full Screen Preview</div>
                <div className="text-xs text-gray-500">
                  {(activePreviewNode.data?.label as string) || activePreviewNode.type || 'Step'}
                </div>
                {isOutputPreview && !outputPreviewEnabled && (
                  <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-700">
                    Create at least one output sheet to preview export results.
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                {canPreviewOutputSheets && !isOutputSheetPreview && isOperationPreview && (
                  <button
                    type="button"
                    onClick={() => {
                      const fileOption = previewOutputFileOptions[0];
                      if (!fileOption) {
                        onPreviewTargetChange(activePreviewNode.id, {
                          fileId: null,
                          sheetName: 'Sheet 1',
                          virtualId: 'output:empty:Sheet 1',
                          virtualName: 'Output (empty)',
                        });
                        return;
                      }
                      const firstSheet = fileOption.sheets[0]?.sheetName || 'Sheet 1';
                      onPreviewTargetChange(activePreviewNode.id, {
                        fileId: null,
                        sheetName: firstSheet,
                        virtualId: `output:${fileOption.outputId}:${firstSheet}`,
                        virtualName: `${fileOption.label} / ${firstSheet}`,
                      });
                    }}
                    className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    Preview output sheets
                  </button>
                )}
                {canPreviewSourceFile && isActualOutputSheetPreview && isOperationPreview && (
                  <button
                    type="button"
                    onClick={() => {
                      const fallbackTarget = activePreviewNode.data?.target as TableTarget | undefined;
                      onPreviewTargetChange(activePreviewNode.id, {
                        fileId: fallbackTarget?.fileId ?? sourceFileId ?? null,
                        sheetName: fallbackTarget?.sheetName ?? sourceSheetName ?? null,
                        virtualId: null,
                        virtualName: null,
                      });
                    }}
                    className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    Preview source file
                  </button>
                )}
                {canApplyPreviewTarget && (
                  <button
                    type="button"
                    onClick={() => onApplyPreviewTarget(activePreviewNode.id, previewSelectionTarget ?? undefined)}
                    className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                    title="Update the block source to match this preview selection"
                  >
                    Use as source
                  </button>
                )}
                <button
                  type="button"
                  className="rounded-md p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
                  onClick={() => onTogglePreview(activePreviewNode.id)}
                  title="Close preview"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="h-[70vh] p-5">
              {previewErrors[activePreviewNode.id] ? (
                <div className="flex h-full items-center justify-center text-sm text-red-600">
                  {previewErrors[activePreviewNode.id]}
                </div>
              ) : !hasSelectedSource && isOperationPreview && !isActualOutputSheetPreview ? (
                <div className="flex h-full items-center justify-center text-sm text-amber-700">
                  No data source selected for this block.
                </div>
              ) : showNoOutputSheetsMessage ? (
                <div className="flex h-full items-center justify-center text-sm text-amber-700">
                  No output sheets available yet.
                </div>
              ) : (
                <div className="space-y-3 h-full flex flex-col">
                  {isOutputPreview && outputPreviewTargets && outputPreviewTargets[activePreviewNode.id] && (
                    <OutputPreviewSelector
                      targets={outputPreviewTargets[activePreviewNode.id]}
                      onSelect={(target) => onPreviewTargetChange(activePreviewNode.id, target)}
                      selectedTarget={previewOverrides[activePreviewNode.id] || null}
                    />
                  )}
                  {showPreviewSourceToggle && (
                    <div className="flex flex-wrap gap-2 text-[11px] font-semibold uppercase text-gray-500">
                      {hasBatchPreviewSources && (
                        <button
                          type="button"
                          className={`rounded-full px-3 py-1 transition ${
                            previewSourceFilter === 'batch'
                              ? 'bg-indigo-600 text-white'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                          onClick={() => setPreviewSourceFilter('batch')}
                        >
                          Batch files
                        </button>
                      )}
                      {hasIndividualPreviewSources && (
                        <button
                          type="button"
                          className={`rounded-full px-3 py-1 transition ${
                            previewSourceFilter === 'individual'
                              ? 'bg-indigo-600 text-white'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                          onClick={() => setPreviewSourceFilter('individual')}
                        >
                          Individual files
                        </button>
                      )}
                      <button
                        type="button"
                        className={`rounded-full px-3 py-1 transition ${
                          previewSourceFilter === 'all'
                            ? 'bg-indigo-600 text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                        onClick={() => setPreviewSourceFilter('all')}
                      >
                        All selected
                      </button>
                    </div>
                  )}
                  <div className="flex-1 overflow-hidden">
                    <DataPreview
                      preview={(() => {
                        const EMPTY_SHEET_COLUMNS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
                        const emptyPreview = {
                          columns: EMPTY_SHEET_COLUMNS,
                          row_count: 0,
                          preview_rows: [],
                          dtypes: {},
                          is_placeholder: true,
                          current_sheet: activeOutputSheetName ?? null,
                        };
                        const basePreview = previews[activePreviewNode.id] || null;
                        if (!isActualOutputSheetPreview) {
                          return basePreview;
                        }
                        if (!basePreview) {
                          return emptyPreview;
                        }
                        if (basePreview.columns.length === 0 && basePreview.preview_rows.length === 0) {
                          return emptyPreview;
                        }
                        return basePreview;
                      })()}
                      isLoading={previewLoading[activePreviewNode.id] || false}
                      fileOptions={previewFileOptions}
                      currentFileId={
                        isSourcePreview
                          ? sourceFileId ?? null
                          : isActualOutputSheetPreview
                            ? activeOutputFileOption?.id ?? null
                            : previewOverride?.fileId ??
                              nodeDestination?.fileId ??
                              (activePreviewNode.data?.target as TableTarget | undefined)?.fileId ??
                              null
                      }
                      sheetOptions={isActualOutputSheetPreview ? outputSheetLabels : previewSheetOptions}
                      currentSheet={
                        isActualOutputSheetPreview
                          ? activeOutputSheetName
                          : isSourcePreview
                            ? sourceSheetName
                            : previewOverride?.sheetName ??
                              nodeDestination?.sheetName ??
                              (activePreviewNode.data?.target as TableTarget | undefined)?.sheetName ??
                              null
                      }
                      onFileChange={
                        isActualOutputSheetPreview
                          ? (fileId) => {
                              const fileOption = outputFileOptionById.get(fileId);
                              if (!fileOption) {
                                return;
                              }
                              const nextSheet = fileOption.sheets[0]?.sheetName || 'Sheet 1';
                              onPreviewTargetChange(activePreviewNode.id, {
                                fileId: null,
                                sheetName: nextSheet,
                                virtualId: `output:${fileOption.outputId}:${nextSheet}`,
                                virtualName: `${fileOption.label} / ${nextSheet}`,
                              });
                            }
                          : (fileId) => {
                            if (isSourcePreview) {
                              const selectedFile = previewFiles.find((file) => file.id === fileId);
                              const nextBatchId = selectedFile?.batch_id ?? sourceBatchId ?? null;
                              onSourceFileChange(fileId, nextBatchId);
                              return;
                            }
                            onPreviewFileChange(activePreviewNode.id, fileId);
                          }
                      }
                      onBatchChange={
                        isSourcePreview
                          ? (batchId) => {
                              onSourceBatchChange(batchId);
                            }
                          : showPreviewBatchDropdown
                            ? (batchId) => {
                                setPreviewBatchId(batchId ?? null);
                              }
                            : undefined
                      }
                      onSheetChange={
                        isActualOutputSheetPreview
                          ? (sheetName) => {
                              if (!activeOutputFileOption) {
                                return;
                              }
                              onPreviewTargetChange(activePreviewNode.id, {
                                fileId: null,
                                sheetName,
                                virtualId: `output:${activeOutputFileOption.outputId}:${sheetName}`,
                                virtualName: `${activeOutputFileOption.label} / ${sheetName}`,
                              });
                            }
                          : isSourcePreview
                            ? onSourceSheetChange
                            : (sheetName) => onPreviewSheetChange(activePreviewNode.id, sheetName)
                      }
                      allowEmptyFileSelection={isSourcePreview}
                      batchOptions={showPreviewBatchDropdown ? previewBatchDropdownOptions : undefined}
                      currentBatchId={isSourcePreview ? sourceBatchId : previewBatchId}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
