/**
 * Responsible for:
 * - Editing per-step targets (file + sheet) and output file/sheet structure.
 * - Surfacing file/sheet metadata needed to configure the pipeline.
 *
 * Key assumptions:
 * - Targets are stored on the node data and default from the last selection.
 * - Output blocks define the files/sheets available for export.
 *
 * Be careful:
 * - Loading sheets is async; avoid wiping user selections when lists refresh.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { filesApi } from '../../api/files';
import { transformApi } from '../../api/transform';
import { useFlowStore } from '../../store/flowStore';
import type {
  BlockData,
  Batch,
  File,
  OutputConfig,
  OutputFileConfig,
  OutputSheetMapping,
  TableTarget,
} from '../../types';

interface PropertiesPanelProps {
  selectedNodeId: string | null;
  onClose: () => void;
  lastTarget: TableTarget;
  onUpdateLastTarget: (target: TableTarget) => void;
  refreshKey?: number;
}

// Sentinel for CSV files where sheet selection doesn't apply.
const SINGLE_SHEET_VALUE = '__single__';

const normalizeTarget = (target?: TableTarget): TableTarget => ({
  fileId: target?.fileId ?? null,
  sheetName: target?.sheetName ?? null,
  batchId: target?.batchId ?? null,
  virtualId: target?.virtualId ?? null,
  virtualName: target?.virtualName ?? null,
});

const emptyTarget: TableTarget = {
  fileId: null,
  sheetName: null,
  batchId: null,
  virtualId: null,
  virtualName: null,
};

const toSheetValue = (sheetName: string | null) => sheetName ?? SINGLE_SHEET_VALUE;
const fromSheetValue = (value: string) => (value === SINGLE_SHEET_VALUE ? null : value);

type RowFilterOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'greater_than'
  | 'less_than'
  | 'is_blank'
  | 'is_not_blank';

interface RowFilterConfig {
  column: string;
  operator: RowFilterOperator;
  value: string;
}

const rowFilterOperators: Array<{ value: RowFilterOperator; label: string }> = [
  { value: 'equals', label: 'Equals' },
  { value: 'not_equals', label: 'Does not equal' },
  { value: 'contains', label: 'Contains' },
  { value: 'not_contains', label: 'Does not contain' },
  { value: 'greater_than', label: 'Greater than' },
  { value: 'less_than', label: 'Less than' },
  { value: 'is_blank', label: 'Is blank' },
  { value: 'is_not_blank', label: 'Is not blank' },
];

const rowOperatorsRequiringValue = new Set<RowFilterOperator>([
  'equals',
  'not_equals',
  'contains',
  'not_contains',
  'greater_than',
  'less_than',
]);

const defaultRowFilterConfig: RowFilterConfig = {
  column: '',
  operator: 'equals',
  value: '',
};

const buildUniqueFilename = (name: string, counts: Map<string, number>) => {
  const normalized = name.trim() || 'output.xlsx';
  const existingCount = counts.get(normalized);
  if (!existingCount) {
    counts.set(normalized, 1);
    return normalized;
  }
  const nextCount = existingCount + 1;
  counts.set(normalized, nextCount);
  const dotIndex = normalized.lastIndexOf('.');
  if (dotIndex === -1) {
    return `${normalized} (${nextCount})`;
  }
  const base = normalized.slice(0, dotIndex);
  const ext = normalized.slice(dotIndex);
  return `${base} (${nextCount})${ext}`;
};

export const PropertiesPanel = ({
  selectedNodeId,
  onClose,
  lastTarget,
  onUpdateLastTarget,
  refreshKey,
}: PropertiesPanelProps) => {
  const { nodes, edges, updateNode, getFlowData } = useFlowStore();
  const [files, setFiles] = useState<File[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [sheetsByFileId, setSheetsByFileId] = useState<Record<number, string[]>>({});
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [isLoadingBatches, setIsLoadingBatches] = useState(false);
  const [isLoadingSheets, setIsLoadingSheets] = useState(false);
  const [sourcesCollapsed, setSourcesCollapsed] = useState(false);
  const [destinationsCollapsed, setDestinationsCollapsed] = useState(false);
  const [expandedSourceGroups, setExpandedSourceGroups] = useState<Record<number, boolean>>({});
  const [showGroupedDestinations, setShowGroupedDestinations] = useState(false);
  const [showOutputGroups, setShowOutputGroups] = useState(false);
  const precomputeTimeoutRef = useRef<number | null>(null);
  
  const node = useMemo(() => nodes.find((n) => n.id === selectedNodeId), [nodes, selectedNodeId]);
  
  // Generate unique IDs for form elements based on selectedNodeId
  const formIds = useMemo(() => ({
    sourceType: `source-type-${selectedNodeId}`,
    sourcePicker: `source-picker-${selectedNodeId}`,
    outputFile: `output-file-${selectedNodeId}`,
    outputSheet: `output-sheet-${selectedNodeId}`,
    sourceOutputFile: `source-output-file-${selectedNodeId}`,
    sourceOutputSheet: `source-output-sheet-${selectedNodeId}`,
    file: `file-${selectedNodeId}`,
    sheet: `sheet-${selectedNodeId}`,
    destinationOutputFile: `destination-output-file-${selectedNodeId}`,
    destinationOutputSheet: `destination-output-sheet-${selectedNodeId}`,
    filterColumn: `filter-column-${selectedNodeId}`,
    filterOperator: `filter-operator-${selectedNodeId}`,
    filterValue: `filter-value-${selectedNodeId}`,
    removeMode: `remove-mode-${selectedNodeId}`,
    removeColumnsManual: `remove-columns-manual-${selectedNodeId}`,
    removeColumnsIndices: `remove-columns-indices-${selectedNodeId}`,
    removeColumnsMatch: `remove-columns-match-${selectedNodeId}`,
    removeColumnsValue: `remove-columns-value-${selectedNodeId}`,
    removeColumnsCaseSensitive: `remove-columns-case-${selectedNodeId}`,
    removeRowsIndices: `remove-rows-indices-${selectedNodeId}`,
    removeRowsRangeStart: `remove-rows-range-start-${selectedNodeId}`,
    removeRowsRangeEnd: `remove-rows-range-end-${selectedNodeId}`,
    removeRowsMatch: `remove-rows-match-${selectedNodeId}`,
    removeRowsRuleColumn: (index: number) => `remove-rows-rule-column-${selectedNodeId}-${index}`,
    removeRowsRuleOperator: (index: number) => `remove-rows-rule-operator-${selectedNodeId}-${index}`,
    removeRowsRuleValue: (index: number) => `remove-rows-rule-value-${selectedNodeId}-${index}`,
    outputFileName: (fileIndex: number) => `output-file-name-${selectedNodeId}-${fileIndex}`,
    outputSheetName: (fileIndex: number, sheetIndex: number) => `output-sheet-name-${selectedNodeId}-${fileIndex}-${sheetIndex}`,
  }), [selectedNodeId]);
  
  const nodeType = node?.type || '';
  const nodeData = useMemo(() => (node?.data || {}) as unknown as BlockData, [node]);
  const outputBatchId = typeof nodeData.outputBatchId === 'number' ? nodeData.outputBatchId : null;
  const target = normalizeTarget(nodeData.target);
  const destination = normalizeTarget(nodeData.destination);
  const sourceTargets = useMemo(() => {
    if (Array.isArray(nodeData.sourceTargets) && nodeData.sourceTargets.length > 0) {
      return nodeData.sourceTargets.map(normalizeTarget);
    }
    if (target.fileId || target.virtualId) {
      return [target];
    }
    return [];
  }, [nodeData.sourceTargets, target]);
const destinationTargets = useMemo(() => {
  if (Array.isArray(nodeData.destinationTargets) && nodeData.destinationTargets.length > 0) {
    return nodeData.destinationTargets.map(normalizeTarget);
  }
  if (destination.fileId || destination.virtualId) {
    return [destination];
  }
  return [];
}, [nodeData.destinationTargets, destination]);
const isRowFilterNode = nodeData.blockType === 'filter_rows';
const resolvedRowFilterConfig = useMemo<RowFilterConfig>(() => {
  const raw = nodeData.config ?? {};
  const column = typeof raw.column === 'string' ? raw.column : '';
  const operator = typeof raw.operator === 'string' && rowFilterOperators.some((option) => option.value === raw.operator)
    ? (raw.operator as RowFilterOperator)
    : defaultRowFilterConfig.operator;
  const value = typeof raw.value === 'string' ? raw.value : '';
  return { column, operator, value };
}, [nodeData.config]);
const updateRowFilterConfig = useCallback((partial: Partial<RowFilterConfig>) => {
  if (!node) {
    return;
  }
  const nextConfig: RowFilterConfig = {
    ...resolvedRowFilterConfig,
    ...partial,
  };
  if (!rowOperatorsRequiringValue.has(nextConfig.operator)) {
    nextConfig.value = '';
  }
  updateNode(node.id, {
    data: {
      ...nodeData,
      config: nextConfig,
    },
  });
}, [node, nodeData, resolvedRowFilterConfig, updateNode]);
  const isOutputNode = nodeData.blockType === 'output' || nodeType === 'output';
  const isMappingNode = nodeData.blockType === 'mapping' || nodeType === 'mapping';
  const isSourceBlock =
    nodeType === 'source' ||
    nodeType === 'data' ||
    nodeData.blockType === 'source' ||
    nodeData.blockType === 'data';
  const normalizeOutputConfig = useCallback((rawOutput: OutputConfig | { fileName?: string; sheets?: OutputSheetMapping[] } | undefined) => {
    if (rawOutput && Array.isArray((rawOutput as OutputConfig).outputs)) {
      return rawOutput as OutputConfig;
    }
    if (rawOutput && (rawOutput as { fileName?: string }).fileName) {
      const legacySheets = (rawOutput as { sheets?: OutputSheetMapping[] }).sheets ?? [];
      return {
        outputs: [
          {
            id: `output-legacy`,
            fileName: (rawOutput as { fileName?: string }).fileName || 'output.xlsx',
            sheets: legacySheets.length > 0
              ? legacySheets.map((sheet) => ({ sheetName: sheet.sheetName }))
              : [{ sheetName: 'Sheet 1' }],
          },
        ],
      };
    }
    return { outputs: [] };
  }, []);

  const outputConfig = useMemo<OutputConfig>(
    () => normalizeOutputConfig(nodeData.output as OutputConfig | { fileName?: string; sheets?: OutputSheetMapping[] } | undefined),
    [nodeData.output, normalizeOutputConfig]
  );

  const buildOutputsFromFiles = useCallback((filesToCopy: File[]) => {
    const nameCounts = new Map<string, number>();
    return {
      outputs: filesToCopy.map((file, index) => ({
        id: `output-${Date.now()}-${file.id}-${index}`,
        fileName: buildUniqueFilename(
          file.original_filename || file.filename || `output-${index + 1}.xlsx`,
          nameCounts
        ),
        sheets: [{ sheetName: 'Sheet 1' }],
      })),
    };
  }, []);

  const outputFiles = useMemo(() => {
    const outputNode = nodes.find((n) => n.data?.blockType === 'output' || n.type === 'output');
    const output = outputNode?.data?.output as OutputConfig | { fileName?: string; sheets?: OutputSheetMapping[] } | undefined;
    if (!output) {
      return [];
    }
    if (Array.isArray((output as OutputConfig).outputs)) {
      return (output as OutputConfig).outputs;
    }
    const legacy = output as { fileName?: string; sheets?: OutputSheetMapping[] };
    return [
      {
        id: 'legacy-output',
        fileName: legacy.fileName || 'output.xlsx',
        sheets: legacy.sheets?.length
          ? legacy.sheets.map((sheet) => ({ sheetName: sheet.sheetName }))
          : [{ sheetName: 'Sheet 1' }],
      },
    ];
  }, [nodes]);

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

  const outputFileOptionById = useMemo(
    () => new Map(outputFileOptions.map((option) => [option.id, option])),
    [outputFileOptions]
  );

  const parseOutputVirtualId = useMemo(() => {
    return (virtualId?: string | null) => {
      if (!virtualId?.startsWith('output:')) {
        return null;
      }
      const raw = virtualId.slice('output:'.length);
      const [outputId, sheetName] = raw.split(':');
      if (!outputId || !sheetName) {
        return null;
      }
      return { outputId, sheetName };
    };
  }, []);

  const updateDestinationTargets = useCallback((nextTargets: TableTarget[]) => {
    if (!node) return;
    const normalized = nextTargets.map(normalizeTarget);
    const primary = normalized[0] ?? emptyTarget;
    updateNode(node.id, {
      data: {
        ...nodeData,
        destinationTargets: normalized,
        destination: primary.fileId || primary.virtualId ? primary : emptyTarget,
      },
    });
  }, [node, nodeData, updateNode]);

  const handleUseFileAsDestination = useCallback((sourceIndex: number) => {
    if (!node) {
      return;
    }
    updateDestinationTargets([
      ...destinationTargets,
      { ...emptyTarget, sourceId: sourceIndex },
    ]);
  }, [destinationTargets, node, updateDestinationTargets]);

  const buildOutputTarget = useCallback(
    (fileOption: { outputId: string; label: string }, sheetName: string): TableTarget => ({
      fileId: null,
      sheetName,
      virtualId: `output:${fileOption.outputId}:${sheetName}`,
      virtualName: `${fileOption.label} / ${sheetName}`,
    }),
    []
  );

  const sourceNodeFileIds = useMemo(() => {
    const ids = new Set<number>();
    nodes.forEach((n) => {
      if (n.data?.fileIds && Array.isArray(n.data.fileIds)) {
        n.data.fileIds.forEach((id: number) => ids.add(id));
      }
    });
    return Array.from(ids).sort((a, b) => a - b);
  }, [nodes]);

  const sourceNodeTarget = useMemo(() => {
    const sourceNode = nodes.find((candidate) => {
      const blockType = candidate.data?.blockType || candidate.type;
      return blockType === 'source' || blockType === 'data';
    });
    return normalizeTarget(sourceNode?.data?.target as TableTarget | undefined);
  }, [nodes]);

  const filesById = useMemo(() => {
    return new Map(files.map((file) => [file.id, file]));
  }, [files]);

  const batchesById = useMemo(() => {
    return new Map(batches.map((batch) => [batch.id, batch]));
  }, [batches]);

  const sourcePickerGroups = useMemo(() => {
    const groupedFiles = new Map<number, File[]>();
    const singles: File[] = [];
    files.forEach((file) => {
      if (typeof file.batch_id === 'number') {
        const bucket = groupedFiles.get(file.batch_id) ?? [];
        bucket.push(file);
        groupedFiles.set(file.batch_id, bucket);
      } else {
        singles.push(file);
      }
    });
    const result: Array<{ label: string; files: File[] }> = [];
    Array.from(groupedFiles.entries())
      .sort((a, b) => a[0] - b[0])
      .forEach(([batchId, groupFiles]) => {
        const label = batchesById.get(batchId)?.name ?? `Batch ${batchId}`;
        result.push({ label, files: groupFiles });
      });
    if (singles.length > 0) {
      result.push({ label: 'Single files', files: singles });
    }
    return result;
  }, [files, batchesById]);

  const flowSourceTargets = useMemo(() => {
    const operationNode = nodes.find((candidate) => {
      const blockType = candidate.data?.blockType || candidate.type;
      if (blockType === 'output' || blockType === 'source' || blockType === 'data') {
        return false;
      }
      const targets = candidate.data?.sourceTargets;
      return Array.isArray(targets) && targets.length > 0;
    });
    const targets = operationNode?.data?.sourceTargets;
    if (!Array.isArray(targets)) {
      return [];
    }
    return targets
      .map((target) => normalizeTarget(target as TableTarget))
      .filter((target) => target.fileId || target.virtualId);
  }, [nodes]);

  const processedSourceOptions = useMemo(() => (
    flowSourceTargets.map((target, index) => ({
      label: `${target.virtualName ?? 'Processed stream'} (processed)`,
      value: `stream:${index}`,
    }))
  ), [flowSourceTargets]);

  const sourceGroupFiles = useMemo(() => {
    if (sourceNodeTarget.batchId) {
      return files.filter((file) => file.batch_id === sourceNodeTarget.batchId);
    }
    const fileTargets = flowSourceTargets.filter((target) => target.fileId).map((target) => target.fileId as number);
    if (fileTargets.length === 0) {
      return [];
    }
    return fileTargets
      .map((fileId) => filesById.get(fileId))
      .filter((file): file is File => Boolean(file));
  }, [files, filesById, flowSourceTargets, sourceNodeTarget.batchId]);

  const sourceSingleFile = useMemo(() => {
    if (sourceNodeTarget.fileId) {
      return filesById.get(sourceNodeTarget.fileId) ?? null;
    }
    const singleTarget = flowSourceTargets.find((target) => target.fileId);
    if (!singleTarget?.fileId) {
      return null;
    }
    return filesById.get(singleTarget.fileId) ?? null;
  }, [filesById, flowSourceTargets, sourceNodeTarget.fileId]);

  /* eslint-disable-next-line @typescript-eslint/no-unused-vars */
  const [expandedDestinationGroups, setExpandedDestinationGroups] = useState<Record<number, boolean>>({});

  const sourceItems = useMemo(() => {
    const items: any[] = [];
    
    let currentGroup: { batchId: number; targets: { target: TableTarget; index: number }[]; seenFileIds: Set<number> } | null = null;

    for (const [index, target] of sourceTargets.entries()) {
      if (target.batchId) {
        if (currentGroup && currentGroup.batchId === target.batchId) {
          if (target.fileId && currentGroup.seenFileIds.has(target.fileId)) {
            items.push({ 
              type: 'group', 
              batchId: currentGroup.batchId, 
              targets: currentGroup.targets,
              id: `group-${currentGroup.batchId}-${currentGroup.targets[0].index}`
            });
            const seen = new Set<number>();
            if (target.fileId) seen.add(target.fileId);
            currentGroup = { batchId: target.batchId, targets: [{ target, index }], seenFileIds: seen };
          } else {
            currentGroup.targets.push({ target, index });
            if (target.fileId) currentGroup.seenFileIds.add(target.fileId);
          }
        } else {
          if (currentGroup) {
            items.push({ 
              type: 'group', 
              batchId: currentGroup.batchId, 
              targets: currentGroup.targets,
              id: `group-${currentGroup.batchId}-${currentGroup.targets[0].index}`
            });
          }
          const seen = new Set<number>();
          if (target.fileId) seen.add(target.fileId);
          currentGroup = { batchId: target.batchId, targets: [{ target, index }], seenFileIds: seen };
        }
      } else {
        if (currentGroup) {
          items.push({ 
            type: 'group', 
            batchId: currentGroup.batchId, 
            targets: currentGroup.targets, 
            id: `group-${currentGroup.batchId}-${currentGroup.targets[0].index}`
          });
          currentGroup = null;
        }
        items.push({ type: 'single', target, index, id: `single-${index}` });
      }
    }

    if (currentGroup) {
      items.push({ 
        type: 'group', 
        batchId: currentGroup.batchId, 
        targets: currentGroup.targets,
        id: `group-${currentGroup.batchId}-${currentGroup.targets[0].index}`
      });
    }

    return items;
  }, [sourceTargets]);

  const destinationItems = useMemo(() => {
    const items: any[] = [];
    
    let currentGroup: { batchId: number; targets: { target: TableTarget; index: number }[]; seenFileIds: Set<number> } | null = null;

    for (const [index, target] of destinationTargets.entries()) {
      // Resolve batchId from outputId if possible
      let batchId: number | null = null;
      let fileId: number | null = null;
      
      const parsed = parseOutputVirtualId(target.virtualId);
      if (parsed) {
         // Output ID format: output-{timestamp}-{fileId}-{index}
         const match = parsed.outputId.match(/output-\d+-(\d+)-\d+/);
         if (match) {
           fileId = Number(match[1]);
           const file = filesById.get(fileId);
           if (file && file.batch_id) {
             batchId = file.batch_id;
           }
         }
      }

      if (batchId) {
        if (currentGroup && currentGroup.batchId === batchId) {
          if (fileId && currentGroup.seenFileIds.has(fileId)) {
             // Duplicate file in same batch sequence -> separate group
            items.push({ 
              type: 'group', 
              batchId: currentGroup.batchId, 
              targets: currentGroup.targets,
              id: `dest-group-${currentGroup.batchId}-${currentGroup.targets[0].index}`
            });
            const seen = new Set<number>();
            if (fileId) seen.add(fileId);
            currentGroup = { batchId: batchId, targets: [{ target, index }], seenFileIds: seen };
          } else {
            currentGroup.targets.push({ target, index });
            if (fileId) currentGroup.seenFileIds.add(fileId);
          }
        } else {
          if (currentGroup) {
            items.push({ 
              type: 'group', 
              batchId: currentGroup.batchId, 
              targets: currentGroup.targets,
              id: `dest-group-${currentGroup.batchId}-${currentGroup.targets[0].index}`
            });
          }
          const seen = new Set<number>();
          if (fileId) seen.add(fileId);
          currentGroup = { batchId: batchId, targets: [{ target, index }], seenFileIds: seen };
        }
      } else {
        if (currentGroup) {
          items.push({ 
            type: 'group', 
            batchId: currentGroup.batchId, 
            targets: currentGroup.targets, 
            id: `dest-group-${currentGroup.batchId}-${currentGroup.targets[0].index}`
          });
          currentGroup = null;
        }
        items.push({ type: 'single', target, index, id: `dest-single-${index}` });
      }
    }

    if (currentGroup) {
      items.push({ 
        type: 'group', 
        batchId: currentGroup.batchId, 
        targets: currentGroup.targets,
        id: `dest-group-${currentGroup.batchId}-${currentGroup.targets[0].index}`
      });
    }
    return items;
  }, [destinationTargets, parseOutputVirtualId, filesById]);

  const hasGroupedSources = sourceItems.some(item => item.type === 'group');

  const destinationSummary = useMemo(() => {
    if (destinationTargets.length === 0) {
      return 'No destinations configured.';
    }
    return `${destinationTargets.length} destination${destinationTargets.length > 1 ? 's' : ''} configured.`;
  }, [destinationTargets.length]);

  const sourceSummary = useMemo(() => {
    if (sourceTargets.length === 0) {
      return 'No sources selected.';
    }
    const groupCount = sourceItems.filter(i => i.type === 'group').length;
    const singleCount = sourceItems.filter(i => i.type === 'single').length;
    
    const parts = [];
    if (singleCount > 0) {
      parts.push(`${singleCount} single file${singleCount > 1 ? 's' : ''}`);
    }
    if (groupCount > 0) {
      parts.push(`${groupCount} group${groupCount > 1 ? 's' : ''}`);
    }
    return `${sourceTargets.length} source${sourceTargets.length > 1 ? 's' : ''} (${parts.join(', ')})`;
  }, [sourceTargets.length, sourceItems]);

  // --- Stream-Centric Architecture: Resolve Upstream Streams ---
  const upstreamStreams = useMemo(() => {
    if (!selectedNodeId) return [];

    // 1. Find all incoming edges
    const incomingEdges = edges.filter(e => e.target === selectedNodeId);
    
    // 2. Map to Source Nodes
    const streamGroups = incomingEdges.map(edge => {
        const sourceNode = nodes.find(n => n.id === edge.source);
        if (!sourceNode) return null;

        const sourceLabel = sourceNode.data?.label || sourceNode.type || 'Unknown Source';
        
        // 3. Resolve "Outputs" of this Source Node
        let streams: { label: string; value: number; fileId: number | null }[] = [];
        const sourceData = sourceNode.data as BlockData;

        // Condition A: Data/Source Block -> Outputs are the Files
        if (sourceNode.type === 'data' || sourceNode.type === 'source' || sourceData.blockType === 'data') {
            const fileIds = sourceData.fileIds || [];
            streams = fileIds.map((fid, idx) => {
                const file = filesById.get(fid);
                return {
                    label: file ? file.original_filename : `File ${fid}`,
                    value: idx, // This index needs to be globally unique or relative. 
                                // CAUTION: Current `sourceTargets` uses flattened index. 
                                // We might need to map this back to the current node's `sourceTargets` list
                                // to ensure the `value` matches what the rest of the app expects.
                    fileId: fid
                };
            });
        } 
        // Condition B: Operation Block -> Outputs are its Destination Targets
        else {
             const opDestinations = sourceData.destinationTargets || [];
             streams = opDestinations.map((t, idx) => {
                  const file = t.fileId ? filesById.get(t.fileId) : null;
                  const label = file ? file.original_filename : (t.virtualName || `Stream ${idx + 1}`);
                  return {
                      label: `[Stream] ${label}`,
                      value: idx, // Again, this is relative to the parent.
                      fileId: t.fileId || null
                  };
             });
        }

        return {
            sourceId: sourceNode.id,
            sourceLabel,
            streams
        };
    }).filter((group): group is { sourceId: string; sourceLabel: string; streams: { label: string; value: number; fileId: number | null }[] } => !!group);

    return streamGroups;
  }, [edges, nodes, selectedNodeId, filesById]);


  // CAUTION: The current application logic expects `sourceTargets` (array) to be the source of truth for execution.
  // The indices `0, 1, 2...` in `availableSourceOptions` MUST correspond to the indices in `sourceTargets`.
  // We need to correlate our "Graph-Aware" streams with the actual `sourceTargets` list.
  // We will iterate `sourceTargets` and try to match them to the Upstream Groups for labeling purposes.
  
  const availableSourceOptions = useMemo(() => {
    const options: { group: string; items: { label: string; value: number }[] }[] = [];
    
    // We'll create a single "All Sources" group if we can't perfectly map back to graph topology,
    // but ideally we map it.
    // Given the complexity of existing data flow (flattening), let's stick to grouping the *current* 
    // `sourceItems` but try to annotate them if possible.
    
    // Actually, looking at `FlowPipeline.tsx` (not shown but inferred), `sourceTargets` are likely 
    // aggregated from upstream nodes IN ORDER of connection.
    // Let's rely on the `sourceItems` order but try to Inject "Origin" info if we can.
    
    // SIMPLIFIED APPROACH: Just use `sourceItems` but group by Batch ID/Name for now since we have that.
    // The previous implementation used `batchId`. 
    // IF we want "From Parent Node", we need to know which batch belongs to which node.
    // `batchesById` usually comes from `filesApi`. Batch Name often reflects upload.
    // For generated streams (virtualId), the batch info might be missing or generic.
    
    // Let's stick to the flattening logic but visual separation by Batch is roughly accurate to "Topology" 
    // if every upstream block produces a new batch.
    
    // Refined Plan: Group by Batch Name.
    const groupedOptions = new Map<string, { label: string; value: number }[]>();
    
    sourceItems.forEach(item => {
        let groupName = 'Uncategorized Sources';
        let batchId: number | null = null;
        
        if (item.type === 'group') batchId = item.batchId;
        else if (item.target.batchId) batchId = item.target.batchId;
        
        if (batchId) {
             const batch = batchesById.get(batchId);
             if (batch) groupName = batch.name; // This effectively groups by "Upload Batch" or "Generated Stream Batch"
        }

        // Add index info
        const itemsToAdd: { label: string; value: number }[] = [];
        
        if (item.type === 'group') {
             item.targets.forEach((t: { target: TableTarget; index: number }) => {
                 const file = t.target.fileId ? filesById.get(t.target.fileId) : null;
                 const label = file ? file.original_filename : (t.target.virtualName || `Source ${t.index + 1}`);
                 itemsToAdd.push({ label, value: t.index });
             });
        } else {
             const file = item.target.fileId ? filesById.get(item.target.fileId) : null;
             const label = file ? file.original_filename : (item.target.virtualName || `Source ${item.index + 1}`);
             itemsToAdd.push({ label, value: item.index });
        }
        
        if (!groupedOptions.has(groupName)) {
            groupedOptions.set(groupName, []);
        }
        groupedOptions.get(groupName)?.push(...itemsToAdd);
    });
    
    // Array-ify
    return Array.from(groupedOptions.entries()).map(([group, items]) => ({
        group,
        items
    }));
  }, [sourceItems, filesById, batchesById]);

  const renderDestinationTargets = (items = destinationItems) => {
    return items.map((item) => {
      if (item.type === 'group') {
        const group = item;
        const batchLabel = batchesById.get(group.batchId)?.name ?? 'Unnamed group';
        const groupKey = group.targets[0].index;
        const isExpanded = expandedDestinationGroups[groupKey] ?? false;

        return (
          <div key={group.id} className="rounded-md border border-gray-200 bg-white p-3 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-medium text-gray-500">Group outputs</div>
                <div className="text-sm font-semibold text-gray-900">{batchLabel}</div>
                <div className="text-xs text-gray-500">{group.targets.length} destinations</div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <button
                  type="button"
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                  onClick={() => {
                    setExpandedDestinationGroups((prev) => ({
                      ...prev,
                      [groupKey]: !isExpanded,
                    }));
                  }}
                >
                  {isExpanded ? 'Hide outputs' : 'Show outputs'}
                </button>
                <button
                  type="button"
                  className="text-xs font-semibold text-red-600 hover:text-red-700"
                  onClick={() => {
                    const indicesToRemove = new Set(group.targets.map((t: { index: number }) => t.index));
                    const nextTargets = destinationTargets.filter(
                      (_, index) => !indicesToRemove.has(index)
                    );
                    updateDestinationTargets(nextTargets);
                  }}
                >
                  Remove group
                </button>
              </div>
            </div>

            {isExpanded && (
              <div className="space-y-2">
                {group.targets.map(({ target: destTarget, index }: { target: TableTarget; index: number }) => {
                  const parsedOutput = parseOutputVirtualId(destTarget.virtualId);
                  const activeOutputOption = parsedOutput
                    ? outputFileOptions.find((option) => option.outputId === parsedOutput.outputId) ?? outputFileOptions[0] ?? null
                    : outputFileOptions[0] ?? null;
                  const outputSheets = activeOutputOption?.sheets?.map((sheet) => sheet.sheetName || 'Sheet 1') ?? [];
                  const fileId = parsedOutput?.outputId.match(/output-\d+-(\d+)-\d+/)?.[1];
                  const file = fileId ? filesById.get(Number(fileId)) : null;
                  const fileLabel = file?.original_filename || file?.filename || 'Unnamed file';

                  return (
                    <div key={`group-dest-${index}`} className="pl-2 border-l-2 border-gray-100 space-y-2">
                      <div className="flex items-center justify-between">
                         <div className="text-xs text-gray-600 truncate max-w-[150px]" title={fileLabel}>
                            {fileLabel}
                         </div>
                         <button
                            type="button"
                            className="text-xs text-red-600 hover:text-red-700"
                            onClick={() => {
                              const nextTargets = destinationTargets.filter((_, targetIndex) => targetIndex !== index);
                              updateDestinationTargets(nextTargets);
                            }}
                          >
                            Remove
                          </button>
                      </div>

                      <div className="space-y-2">
                        {/* Source Selector (Source-Destination Pair) */}
                        <div>
                            <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">Source</label>
                            <select
                                value={destTarget.sourceId ?? ''}
                                onChange={(event) => {
                                    const nextTargets = [...destinationTargets];
                                    const sourceIndex = event.target.value ? Number(event.target.value) : null;
                                    // Update the target with the selected source index
                                    nextTargets[index] = { ...destTarget, sourceId: sourceIndex };
                                    updateDestinationTargets(nextTargets);
                                }}
                                className="w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            >
                                <option value="">Select source...</option>
                                {availableSourceOptions.map((group) => (
                                    <optgroup key={group.group} label={group.group}>
                                        {group.items.map((opt) => (
                                            <option key={opt.value} value={opt.value}>
                                                {opt.label}
                                            </option>
                                        ))}
                                    </optgroup>
                                ))}
                            </select>
                        </div>

                        <div>
                        <label className="block text-[10px] uppercase font-bold text-gray-500 mb-1">Destination</label>
                        <select
                          value={activeOutputOption?.id ?? ''}
                          onChange={(event) => {
                            const fileOption = outputFileOptionById.get(Number(event.target.value));
                            if (!fileOption) return;
                            const sheetName = fileOption.sheets?.[0]?.sheetName || 'Sheet 1';
                            const nextTargets = [...destinationTargets];
                            // Preserve sourceId when changing destination file
                            nextTargets[index] = { 
                                ...buildOutputTarget(fileOption, sheetName),
                                sourceId: destTarget.sourceId 
                            };
                            updateDestinationTargets(nextTargets);
                          }}
                          className="w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700"
                          disabled={outputFileOptions.length === 0}
                        >
                          <option value="">Select output file</option>
                          {outputFileOptions.map((option) => (
                            <option key={option.outputId} value={String(option.id)}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        </div>
                      </div>
                      <div>
                        <select
                          value={destTarget.sheetName ?? ''}
                          onChange={(event) => {
                            if (!activeOutputOption) return;
                            const sheetName = event.target.value;
                            const nextTargets = [...destinationTargets];
                            nextTargets[index] = buildOutputTarget(activeOutputOption, sheetName);
                            updateDestinationTargets(nextTargets);
                          }}
                          className="w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700"
                          disabled={outputSheets.length === 0}
                        >
                          {outputSheets.length === 0 ? (
                            <option value="">No output sheets</option>
                          ) : (
                            outputSheets.map((sheetName) => (
                              <option key={sheetName} value={sheetName}>
                                {sheetName}
                              </option>
                            ))
                          )}
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      } else {
        const { target: destTarget, index } = item;
        const parsedOutput = parseOutputVirtualId(destTarget.virtualId);
        const activeOutputOption = parsedOutput
          ? outputFileOptions.find((option) => option.outputId === parsedOutput.outputId) ?? outputFileOptions[0] ?? null
          : outputFileOptions[0] ?? null;
        const outputSheets = activeOutputOption?.sheets?.map((sheet) => sheet.sheetName || 'Sheet 1') ?? [];

        return (
          <div key={item.id} className="rounded-md border border-gray-200 bg-white p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-medium text-gray-500">Destination {index + 1}</div>
              <button
                type="button"
                className="text-xs text-red-600 hover:text-red-700"
                onClick={() => {
                  const nextTargets = destinationTargets.filter((_, targetIndex) => targetIndex !== index);
                  updateDestinationTargets(nextTargets);
                }}
              >
                Remove
              </button>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Output file</label>
              <select
                value={activeOutputOption?.id ?? ''}
                onChange={(event) => {
                  const fileOption = outputFileOptionById.get(Number(event.target.value));
                  if (!fileOption) return;
                  const sheetName = fileOption.sheets?.[0]?.sheetName || 'Sheet 1';
                  const nextTargets = [...destinationTargets];
                  nextTargets[index] = buildOutputTarget(fileOption, sheetName);
                  updateDestinationTargets(nextTargets);
                }}
                className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
                disabled={outputFileOptions.length === 0}
              >
                <option value="">Select output file</option>
                {outputFileOptions.map((option) => (
                  <option key={option.outputId} value={String(option.id)}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Output sheet</label>
              <select
                value={destTarget.sheetName ?? ''}
                onChange={(event) => {
                  if (!activeOutputOption) return;
                  const sheetName = event.target.value;
                  const nextTargets = [...destinationTargets];
                  nextTargets[index] = buildOutputTarget(activeOutputOption, sheetName);
                  updateDestinationTargets(nextTargets);
                }}
                className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
                disabled={outputSheets.length === 0}
              >
                {outputSheets.length === 0 ? (
                  <option value="">No output sheets</option>
                ) : (
                  outputSheets.map((sheetName) => (
                    <option key={sheetName} value={sheetName}>
                      {sheetName}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>
        );
      }
    });
  };


  const resolvedTargetFile = useMemo(() => {
    if (!target.fileId) {
      return null;
    }
    return files.find((file) => file.id === target.fileId) ?? null;
  }, [files, target.fileId]);


  const [columns, setColumns] = useState<string[]>([]);
  const [isLoadingColumns, setIsLoadingColumns] = useState(false);

  const sheetOptions = useMemo(() => {
    if (!resolvedTargetFile) {
      return [];
    }
    const sheets = sheetsByFileId[resolvedTargetFile.id] ?? [];
    return sheets.length > 0 ? sheets : [SINGLE_SHEET_VALUE];
  }, [resolvedTargetFile, sheetsByFileId]);

  const hasSheetList = sheetOptions.length > 0 && sheetOptions[0] !== SINGLE_SHEET_VALUE;

  const [removeDraftConfig, setRemoveDraftConfig] = useState<Record<string, any>>({});
  const [isRemoveDirty, setIsRemoveDirty] = useState(false);

  const removeConfig = removeDraftConfig || {};
  const removeMode = removeConfig.mode || 'columns';
  const columnSelection = removeConfig.columnSelection || { names: [], indices: [], match: {} };
  const rowSelection = removeConfig.rowSelection || { indices: [], range: {}, rules: [], match: 'any' };

  const updateRemoveConfig = (next: Record<string, any>) => {
    if (!node) return;
    updateNode(node.id, {
      data: {
        ...nodeData,
        config: next,
      },
    });
  };

  const updateRemoveDraft = (next: Record<string, any>) => {
    setRemoveDraftConfig(next);
    setIsRemoveDirty(true);
  };

  const parseNumberList = (value: string) => value
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .map(Number)
    .filter((part) => Number.isInteger(part) && part >= 0);

  useEffect(() => {
    if (!node || nodeData.blockType !== 'remove_columns_rows') {
      return;
    }
    setRemoveDraftConfig(nodeData.config || {});
    setIsRemoveDirty(false);
  }, [node, node?.id, nodeData.blockType, nodeData.config]);

  useEffect(() => {
    if (!selectedNodeId) {
      return;
    }
    setIsLoadingFiles(true);
    setIsLoadingBatches(true);
    // Load files once when the panel opens so the target dropdown is ready.
    filesApi.list()
      .then((result) => {
        // Keep the full file list so group selections can pull in new files.
        setFiles(result);
      })
      .catch(() => setFiles([]))
      .finally(() => setIsLoadingFiles(false));
    filesApi.listBatches()
      .then((result) => setBatches(result))
      .catch(() => setBatches([]))
      .finally(() => setIsLoadingBatches(false));
  }, [selectedNodeId, refreshKey]);

  useEffect(() => {
    return () => {
      if (precomputeTimeoutRef.current) {
        window.clearTimeout(precomputeTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!target.fileId) {
      setColumns([]);
      return;
    }
    setIsLoadingColumns(true);
    filesApi.preview(target.fileId, target.sheetName || undefined)
      .then((result) => {
        setColumns(result.columns || []);
      })
      .catch(() => setColumns([]))
      .finally(() => setIsLoadingColumns(false));
  }, [target.fileId, target.sheetName]);

  useEffect(() => {
    if (!target.fileId) {
      return;
    }
    if (sheetsByFileId[target.fileId]) {
      return;
    }
    setIsLoadingSheets(true);
    // Fetch sheet names lazily per file so we avoid parsing every Excel upfront.
    filesApi.sheets(target.fileId)
      .then((sheets) => {
        setSheetsByFileId((prev) => ({ ...prev, [target.fileId as number]: sheets }));
      })
      .finally(() => setIsLoadingSheets(false));
  }, [target.fileId, sheetsByFileId]);

  useEffect(() => {
    const fileIds = sourceTargets
      .map((entry) => entry.fileId)
      .filter((fileId): fileId is number => typeof fileId === 'number');
    fileIds.forEach((fileId) => {
      if (sheetsByFileId[fileId]) {
        return;
      }
      setIsLoadingSheets(true);
      filesApi
        .sheets(fileId)
        .then((sheets) => {
          setSheetsByFileId((prev) => ({ ...prev, [fileId]: sheets }));
        })
        .finally(() => setIsLoadingSheets(false));
    });
  }, [sourceTargets, sheetsByFileId]);

  const updateSourceTargets = useCallback((nextTargets: TableTarget[]) => {
    if (!node) return;
    const normalized = nextTargets.map(normalizeTarget);
    const primary = normalized[0] ?? emptyTarget;
    updateNode(node.id, {
      data: {
        ...nodeData,
        sourceTargets: normalized,
        target: primary.fileId || primary.virtualId ? primary : emptyTarget,
      },
    });
    if (primary.fileId && !primary.virtualId) {
      onUpdateLastTarget(primary);
    }
  }, [node, nodeData, onUpdateLastTarget, updateNode]);

  const handleSourcePickerChange = useCallback((event: ChangeEvent<HTMLSelectElement>) => {
    const selectedValue = event.target.value;
    if (!selectedValue) {
      return;
    }
    const [type, rawId] = selectedValue.split(':');
    if (type === 'file') {
      const fileId = Number(rawId);
      if (Number.isNaN(fileId)) {
        return;
      }
      const file = filesById.get(fileId);
      const nextTargets = [
        ...sourceTargets,
        {
          fileId,
          sheetName: null,
          batchId: file?.batch_id ?? null,
          virtualId: null,
          virtualName: file?.original_filename ?? null,
        },
      ];
      updateSourceTargets(nextTargets);
    } else if (type === 'stream') {
      const streamIndex = Number(rawId);
      if (Number.isNaN(streamIndex)) {
        return;
      }
      const streamTarget = flowSourceTargets[streamIndex];
      if (!streamTarget) {
        return;
      }
      updateSourceTargets([...sourceTargets, streamTarget]);
    }
    event.target.value = '';
  }, [filesById, flowSourceTargets, sourceTargets, updateSourceTargets]);









  const updateOutputConfig = useCallback((nextConfig: OutputConfig) => {
    if (!node) return;
    updateNode(node.id, {
      data: {
        ...nodeData,
        output: nextConfig,
      },
    });
  }, [node, nodeData, updateNode]);

  const updateOutputBatchId = useCallback((nextBatchId: number | null) => {
    if (!node) return;
    updateNode(node.id, {
      data: {
        ...nodeData,
        outputBatchId: nextBatchId,
      },
    });
  }, [node, nodeData, updateNode]);

  const handleCopyGroupToOutput = useCallback(() => {
    if (!node || !isOutputNode) {
      return;
    }
    if (sourceGroupFiles.length === 0) {
      return;
    }
    updateNode(node.id, {
      data: {
        ...nodeData,
        output: buildOutputsFromFiles(sourceGroupFiles),
      },
    });
  }, [
    buildOutputsFromFiles,
    isOutputNode,
    node,
    nodeData,
    sourceGroupFiles,
    updateNode,
  ]);

  const handleCopySingleToOutput = useCallback(() => {
    if (!node || !isOutputNode) {
      return;
    }
    if (!sourceSingleFile) {
      return;
    }
    updateNode(node.id, {
      data: {
        ...nodeData,
        output: buildOutputsFromFiles([sourceSingleFile]),
      },
    });
  }, [
    buildOutputsFromFiles,
    isOutputNode,
    node,
    nodeData,
    sourceSingleFile,
    updateNode,
  ]);

  const triggerPrecompute = useCallback(() => {
    const flowData = getFlowData();
    if (!flowData) {
      return;
    }
    const fileIds = Array.from(sourceNodeFileIds);
    if (precomputeTimeoutRef.current) {
      window.clearTimeout(precomputeTimeoutRef.current);
    }
    precomputeTimeoutRef.current = window.setTimeout(() => {
      void transformApi.precompute({
        file_id: fileIds[0] ?? 0,
        file_ids: fileIds.length > 0 ? fileIds : undefined,
        flow_data: flowData,
      }).catch(() => {
        // Ignore precompute failures so we don't block configuration changes.
      });
    }, 200);
  }, [getFlowData, sourceNodeFileIds]);

  const addOutputFile = () => {
    const nextOutputs = [
      ...outputConfig.outputs,
      {
        id: `output-${Date.now()}`,
        fileName: `output-${outputConfig.outputs.length + 1}.xlsx`,
        sheets: [{ sheetName: 'Sheet 1' }],
      },
    ];
    updateOutputConfig({ outputs: nextOutputs });
  };

  const updateOutputFile = useCallback((index: number, updater: (file: OutputFileConfig) => OutputFileConfig) => {
    const nextOutputs = outputConfig.outputs.map((file, fileIndex) =>
      fileIndex === index ? updater(file) : file
    );
    updateOutputConfig({ outputs: nextOutputs });
  }, [outputConfig.outputs, updateOutputConfig]);

  const removeOutputFile = (index: number) => {
    const nextOutputs = outputConfig.outputs.filter((_, fileIndex) => fileIndex !== index);
    updateOutputConfig({ outputs: nextOutputs });
  };

  const addOutputSheet = (fileIndex: number) => {
    updateOutputFile(fileIndex, (file) => ({
      ...file,
      sheets: [
        ...file.sheets,
        { sheetName: `Sheet ${file.sheets.length + 1}` },
      ],
    }));
  };

  const updateOutputSheet = useCallback((
    fileIndex: number,
    sheetIndex: number,
    updater: (sheet: OutputSheetMapping) => OutputSheetMapping
  ) => {
    updateOutputFile(fileIndex, (file) => ({
      ...file,
      sheets: file.sheets.map((sheet, index) => (index === sheetIndex ? updater(sheet) : sheet)),
    }));
  }, [updateOutputFile]);

  const removeOutputSheet = (fileIndex: number, sheetIndex: number) => {
    updateOutputFile(fileIndex, (file) => {
      if (file.sheets.length <= 1) {
        return file;
      }
      return {
        ...file,
        sheets: file.sheets.filter((_, index) => index !== sheetIndex),
      };
    });
  };

  // Handler for output file name changes to avoid deep nesting
  const handleOutputFileNameChange = useCallback((fileIndex: number) => {
    return (event: ChangeEvent<HTMLInputElement>) => {
      updateOutputFile(fileIndex, (current) => ({
        ...current,
        fileName: event.target.value,
      }));
    };
  }, [updateOutputFile]);

  // Handler for output sheet name changes to avoid deep nesting
  const handleOutputSheetNameChange = useCallback((fileIndex: number, sheetIndex: number) => {
    return (event: ChangeEvent<HTMLInputElement>) => {
      updateOutputSheet(fileIndex, sheetIndex, (current) => ({
        ...current,
        sheetName: event.target.value,
      }));
    };
  }, [updateOutputSheet]);

  useEffect(() => {
    if (isOutputNode) {
      return;
    }
    if (destinationTargets.length === 0) {
      return;
    }
    const validTargets = destinationTargets.filter((destTarget) => {
      if (!destTarget.virtualId) {
        return true;
      }
      const parsed = parseOutputVirtualId(destTarget.virtualId);
      if (!parsed?.outputId) {
        return false;
      }
      return outputFileOptions.some((option) => option.outputId === parsed.outputId);
    });
    if (validTargets.length !== destinationTargets.length) {
      updateDestinationTargets(validTargets);
    }
  }, [
    destinationTargets,
    isOutputNode,
    outputFileOptions,
    parseOutputVirtualId,
    updateDestinationTargets,
  ]);

  const sourceMode = useMemo(() => {
    if (target.virtualId) {
      return 'output';
    }
    return 'original';
  }, [target.virtualId]);

  if (!selectedNodeId || !node) {
    return null;
  }

  return (
    <div id="properties-panel" className="w-80 bg-white border-l border-gray-200 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">Properties</h2>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 transition-colors"
          title="Close"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="mb-4">
          <div className="block text-sm font-medium text-gray-700 mb-2">
            Block Type
          </div>
          <div className="text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded-md">
            {nodeData.label || nodeType || 'Unknown'}
          </div>
        </div>


        <div className="space-y-5">
          {!isOutputNode && nodeType !== 'source' && !isMappingNode && (
            <>
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">Sources</h3>
                    <p className="text-xs text-gray-500">
                      Select single files or file groups that feed this operation.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSourcesCollapsed((prev) => !prev)}
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                  >
                    {sourcesCollapsed ? 'Show sources' : 'Hide sources'}
                  </button>
                </div>
                {sourcesCollapsed ? (
                  <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500">
                    {sourceSummary}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {sourceTargets.length === 0 && (
                      <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500">
                        No sources yet. Add one or more sources to run this operation.
                      </div>
                    )}
                    <div className="rounded-md border border-gray-200 bg-white px-3 py-2 space-y-2">
                      <label htmlFor={formIds.sourcePicker} className="block text-xs font-medium text-gray-500">
                        Source
                      </label>
                      <select
                        id={formIds.sourcePicker}
                        onChange={handleSourcePickerChange}
                        className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
                        defaultValue=""
                      >
                        <option value="">Select source...</option>
                        {sourcePickerGroups.map((group) => (
                          <optgroup key={group.label} label={group.label}>
                            {group.files.map((file) => (
                              <option key={file.id} value={`file:${file.id}`}>
                                {file.original_filename}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                        {processedSourceOptions.length > 0 && (
                          <optgroup label="Processed streams">
                            {processedSourceOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                      {sourceGroupFiles.length > 0 && (
                        <div className="rounded-md border border-indigo-100 bg-indigo-50 px-2 py-1 text-xs text-gray-700">
                          <div className="text-[10px] uppercase tracking-wide text-gray-500">Batch info</div>
                          <div className="text-sm font-semibold text-gray-900">Export Batch</div>
                          <div>
                            Auto-generating {sourceGroupFiles.length} destination
                            {sourceGroupFiles.length === 1 ? '' : 's'}
                          </div>
                        </div>
                      )}
                    </div>
                    {/* Unified Source List */}
                    <div className="space-y-4">
                      {sourceItems.map((item) => {
                        if (item.type === 'group') {
                          // Render Group
                          const group = item; 
                          const batchLabel = batchesById.get(group.batchId)?.name ?? 'Unnamed group';
                          // Use the index of the first item as part of the unique key for expansion state
                          const groupKey = group.targets[0].index;
                          const isExpanded = expandedSourceGroups[groupKey] ?? false;

                          return (
                            <div key={group.id} className="rounded-md border border-gray-200 bg-white p-3 space-y-3">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <div className="text-xs font-medium text-gray-500">Group</div>
                                  <div className="text-sm font-semibold text-gray-900">{batchLabel}</div>
                                  <div className="text-xs text-gray-500">{group.targets.length} files selected</div>
                                </div>
                                <div className="flex flex-col items-end gap-2">
                                  <button
                                    type="button"
                                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                                    onClick={() => {
                                      setExpandedSourceGroups((prev) => ({
                                        ...prev,
                                        [groupKey]: !isExpanded,
                                      }));
                                    }}
                                  >
                                    {isExpanded ? 'Hide files' : 'Show files'}
                                  </button>
                                  <button
                                    type="button"
                                    className="text-xs font-semibold text-red-600 hover:text-red-700"
                                    onClick={() => {
                                      // Remove only the targets belonging to THIS group instance
                                      const indicesToRemove = new Set(group.targets.map((t: { index: number }) => t.index));
                                      const nextTargets = sourceTargets.filter(
                                        (_, index) => !indicesToRemove.has(index)
                                      );
                                      updateSourceTargets(nextTargets);
                                    }}
                                  >
                                    Remove group
                                  </button>
                                </div>
                              </div>
                              
                              {/* Group Actions: Set all sheets */}
                              <div className="pt-2 border-t border-gray-100">
                                <label className="block text-[10px] font-medium text-gray-500 mb-1 uppercase tracking-wide">
                                  Set all sheets
                                </label>
                                {(() => {
                                  // Check if all files in the group have the same sheet selected
                                  const firstSheet = group.targets[0]?.target.sheetName;
                                  const allSame = group.targets.every(({ target }) => target.sheetName === firstSheet);
                                  const commonSheetName = allSame ? firstSheet : "";

                                  return (
                                    <select
                                      className="w-full rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs text-gray-700 focus:bg-white transition-colors"
                                      onChange={(e) => {
                                        const sheetName = e.target.value;
                                        if (!sheetName) return;
                                        
                                        // Update all targets in this group ONLY if they have the sheet
                                        const groupIndices = new Set(group.targets.map((t: { index: number }) => t.index));
                                        
                                        const nextTargets = sourceTargets.map((target, idx) => {
                                          if (groupIndices.has(idx) && target.fileId) {
                                            const availableSheets = sheetsByFileId[target.fileId] ?? [];
                                            if (availableSheets.includes(sheetName)) {
                                              return {
                                                ...target,
                                                sheetName,
                                                virtualId: null,
                                                virtualName: null
                                              };
                                            }
                                          }
                                          return target;
                                        });
                                        updateSourceTargets(nextTargets);
                                      }}
                                      value={commonSheetName || ""}
                                    >
                                      <option value="">{commonSheetName ? "Mixed selection..." : "Select to apply to all..."}</option>
                                      {Array.from(new Set(
                                        group.targets.flatMap(({ target }: { target: TableTarget }) => 
                                          target.fileId ? (sheetsByFileId[target.fileId] ?? []) : []
                                        )
                                      )).sort().map((sheet) => (
                                        <option key={sheet} value={sheet}>
                                          {sheet}
                                        </option>
                                      ))}
                                    </select>
                                  );
                                })()}
                              </div>
                              
                              {isExpanded && (
                                <div className="space-y-2">
                                  {group.targets.map(({ target, index }: { target: TableTarget; index: number }) => {
                                    const file = target.fileId ? filesById.get(target.fileId) : null;
                                    const fileLabel =
                                      file?.original_filename || file?.filename || 'Unnamed file';
                                    const sheetOptionsForGroupTarget = target.fileId
                                      ? sheetsByFileId[target.fileId] ?? []
                                      : [];
                                    const hasGroupSheets = sheetOptionsForGroupTarget.length > 0;
                                    return (
                                      <div key={`group-target-${index}`} className="pl-2 border-l-2 border-gray-100">
                                        <div className="flex items-center justify-between mb-1">
                                          <div className="text-xs text-gray-600 truncate max-w-[120px]" title={fileLabel}>
                                            {fileLabel}
                                          </div>
                                          <button
                                            type="button"
                                            className="text-xs text-red-600 hover:text-red-700"
                                            onClick={() => {
                                              const nextTargets = sourceTargets.filter(
                                                (_, targetIndex) => targetIndex !== index
                                              );
                                              updateSourceTargets(nextTargets);
                                            }}
                                          >
                                            Remove
                                          </button>
                                        </div>
                                        <select
                                          value={target.sheetName ?? ''}
                                          onChange={(event) => {
                                            const sheetName = event.target.value;
                                            const nextTargets = [...sourceTargets];
                                            nextTargets[index] = {
                                              ...nextTargets[index],
                                              sheetName,
                                              virtualId: null,
                                              virtualName: null,
                                            };
                                            updateSourceTargets(nextTargets);
                                          }}
                                          className="w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700"
                                          disabled={!hasGroupSheets}
                                        >
                                          {!hasGroupSheets ? (
                                            <option value="">No sheets</option>
                                          ) : (
                                            sheetOptionsForGroupTarget.map((sheet) => (
                                              <option key={sheet} value={sheet}>
                                                {sheet}
                                              </option>
                                            ))
                                          )}
                                        </select>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        } else {
                          // Render Single Item
                          const { target, index } = item;
                          const sourceTarget = target;
                          const isOutputSource = Boolean(sourceTarget.virtualId);
                          const parsedOutput = parseOutputVirtualId(sourceTarget.virtualId);
                          const activeOutputOption = parsedOutput
                            ? outputFileOptions.find((option) => option.outputId === parsedOutput.outputId) ?? outputFileOptions[0] ?? null
                            : outputFileOptions[0] ?? null;
                          const outputSheets = activeOutputOption?.sheets?.map((sheet) => sheet.sheetName || 'Sheet 1') ?? [];
                          const sheetOptionsForSource = sourceTarget.fileId ? (sheetsByFileId[sourceTarget.fileId] ?? []) : [];
                          const hasSourceSheets = sheetOptionsForSource.length > 0;
                          const selectedBatchId =
                            sourceTarget.batchId ??
                            (sourceTarget.fileId ? filesById.get(sourceTarget.fileId)?.batch_id ?? null : null);
                          const batchOptions = batches.filter((batch) =>
                            files.some((file) => file.batch_id === batch.id)
                          );
                          const hasIndividualFiles = files.some((file) => !file.batch_id);
                          const availableFiles = selectedBatchId
                            ? files.filter((file) => file.batch_id === selectedBatchId)
                            : files.filter((file) => !file.batch_id);

                          return (
                            <div key={item.id} className="rounded-md border border-gray-200 bg-white p-3 space-y-2">
                              <div className="flex items-center justify-between">
                                <div className="text-xs font-medium text-gray-500">Source</div>
                                <button
                                  type="button"
                                  className="text-xs text-red-600 hover:text-red-700"
                                  onClick={() => {
                                    const nextTargets = sourceTargets.filter((_, targetIndex) => targetIndex !== index);
                                    updateSourceTargets(nextTargets);
                                  }}
                                >
                                  Remove
                                </button>
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">Source type</label>
                                <select
                                  value={isOutputSource ? 'output' : 'original'}
                                  onChange={(event) => {
                                    const nextTargets = [...sourceTargets];
                                    if (event.target.value === 'output') {
                                      if (!activeOutputOption) {
                                        nextTargets[index] = emptyTarget;
                                      } else {
                                        const sheetName = outputSheets[0] || 'Sheet 1';
                                        nextTargets[index] = buildOutputTarget(activeOutputOption, sheetName);
                                      }
                                    } else {
                                      nextTargets[index] = emptyTarget;
                                    }
                                    updateSourceTargets(nextTargets);
                                  }}
                                  className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
                                >
                                  <option value="original">Original file</option>
                                  <option value="output">Output sheet</option>
                                </select>
                              </div>
                              {isOutputSource ? (
                                <>
                                  <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1">Output file</label>
                                    <select
                                      value={activeOutputOption?.id ?? ''}
                                      onChange={(event) => {
                                        const fileOption = outputFileOptionById.get(Number(event.target.value));
                                        if (!fileOption) {
                                          return;
                                        }
                                        const sheetName = fileOption.sheets?.[0]?.sheetName || 'Sheet 1';
                                        const nextTargets = [...sourceTargets];
                                        nextTargets[index] = buildOutputTarget(fileOption, sheetName);
                                        updateSourceTargets(nextTargets);
                                      }}
                                      className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
                                      disabled={outputFileOptions.length === 0}
                                    >
                                      <option value="">Select output file</option>
                                      {outputFileOptions.map((option) => (
                                        <option key={option.outputId} value={String(option.id)}>
                                          {option.label}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1">Output sheet</label>
                                    <select
                                      value={sourceTarget.sheetName ?? ''}
                                      onChange={(event) => {
                                        if (!activeOutputOption) {
                                          return;
                                        }
                                        const sheetName = event.target.value;
                                        const nextTargets = [...sourceTargets];
                                        nextTargets[index] = buildOutputTarget(activeOutputOption, sheetName);
                                        updateSourceTargets(nextTargets);
                                      }}
                                      className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
                                      disabled={outputSheets.length === 0}
                                    >
                                      {outputSheets.length === 0 ? (
                                        <option value="">No output sheets</option>
                                      ) : (
                                        outputSheets.map((sheetName) => (
                                          <option key={sheetName} value={sheetName}>
                                            {sheetName}
                                          </option>
                                        ))
                                      )}
                                    </select>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1">File group</label>
                                    <select
                                      value={selectedBatchId ? String(selectedBatchId) : ''}
                                      onChange={(event) => {
                                        const nextBatchId = event.target.value ? Number(event.target.value) : null;
                                        if (nextBatchId) {
                                          const groupFiles = files.filter((file) => file.batch_id === nextBatchId);
                                          const groupTargets = groupFiles.map((file) => ({
                                            fileId: file.id,
                                            sheetName: null,
                                            batchId: nextBatchId,
                                            virtualId: null,
                                            virtualName: null,
                                          }));
                                          const nextSourceTargets = [...sourceTargets];
                                          if (groupTargets.length > 0) {
                                            nextSourceTargets.splice(index, 1, ...groupTargets);
                                          } else {
                                            nextSourceTargets[index] = {
                                              ...sourceTarget,
                                              batchId: nextBatchId,
                                              fileId: null,
                                              sheetName: null,
                                              virtualId: null,
                                              virtualName: null,
                                            };
                                          }
                                          // Note: Omitted complex destination propagation logic for brevity/safety in this view
                                          updateSourceTargets(nextSourceTargets);
                                          return;
                                        }
                                        const nextTargets = [...sourceTargets];
                                        nextTargets[index] = {
                                          ...sourceTarget,
                                          batchId: null,
                                          fileId: null,
                                          sheetName: null,
                                          virtualId: null,
                                          virtualName: null,
                                        };
                                        updateSourceTargets(nextTargets);
                                      }}
                                      className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
                                      disabled={batchOptions.length === 0 && !hasIndividualFiles}
                                    >
                                      <option value="">Single files</option>
                                      {batchOptions.map((batch) => (
                                        <option key={batch.id} value={String(batch.id)}>
                                          {batch.name}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1">File</label>
                                    <select
                                      value={sourceTarget.fileId ? String(sourceTarget.fileId) : ''}
                                      onChange={(event) => {
                                        const nextFileId = event.target.value ? Number(event.target.value) : null;
                                        const nextTargets = [...sourceTargets];
                                        nextTargets[index] = {
                                          ...sourceTarget,
                                          batchId: selectedBatchId,
                                          fileId: nextFileId,
                                          sheetName: null,
                                          virtualId: null,
                                          virtualName: null,
                                        };
                                        updateSourceTargets(nextTargets);
                                      }}
                                      className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
                                      disabled={isLoadingFiles}
                                    >
                                      <option value="">
                                        {isLoadingFiles
                                          ? 'Loading files...'
                                          : availableFiles.length === 0
                                            ? 'No files in this group'
                                            : 'Select a file'}
                                      </option>
                                      {availableFiles.map((file) => (
                                        <option key={file.id} value={String(file.id)}>
                                          {file.original_filename}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1">Sheet</label>
                                    <select
                                      value={toSheetValue(sourceTarget.sheetName)}
                                      onChange={(event) => {
                                        const nextTargets = [...sourceTargets];
                                        nextTargets[index] = {
                                          ...sourceTarget,
                                          sheetName: fromSheetValue(event.target.value),
                                          virtualId: null,
                                          virtualName: null,
                                        };
                                        updateSourceTargets(nextTargets);
                                      }}
                                      className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
                                      disabled={!sourceTarget.fileId || isLoadingSheets}
                                    >
                                      {!hasSourceSheets && (
                                        <option value={SINGLE_SHEET_VALUE}>
                                          {isLoadingSheets ? 'Loading sheets...' : 'CSV (single sheet)'}
                                        </option>
                                      )}
                                      {hasSourceSheets && (
                                        <option value={SINGLE_SHEET_VALUE} disabled>
                                          Select a sheet
                                        </option>
                                      )}
                                      {sheetOptionsForSource.map((sheet) => (
                                        <option key={sheet} value={sheet}>
                                          {sheet}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <div className="flex items-center justify-between mt-2">
                                    <button
                                      type="button"
                                      className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                                      onClick={() => handleUseFileAsDestination(index)}
                                      disabled={!sourceTarget.fileId}
                                    >
                                      Create destination from this file
                                    </button>
                                    <span className="text-[10px] text-gray-400">
                                      Opens the destination editor for this source.
                                    </span>
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        }
                      })}
                    </div>
                    
                    <button
                      type="button"
                      onClick={() => updateSourceTargets([...sourceTargets, emptyTarget])}
                      className="w-full rounded-md border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-600 hover:border-indigo-300 hover:text-indigo-600"
                    >
                      Add source
                    </button>
                  </div>
                )}
              </div>

              {isRowFilterNode && (
                <div className="space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">Operation</h3>
                      <p className="text-xs text-gray-500">
                        Filter rows before downstream steps receive the data.
                      </p>
                    </div>
                  </div>
                  <div className="rounded-md border border-gray-200 bg-white p-3 space-y-4">
                    <div className="space-y-1">
                      <label htmlFor={formIds.filterColumn} className="block text-xs font-medium text-gray-500 mb-1">
                        Column
                      </label>
                      <select
                        id={formIds.filterColumn}
                        value={resolvedRowFilterConfig.column}
                        onChange={(event) => updateRowFilterConfig({ column: event.target.value })}
                        className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
                        disabled={isLoadingColumns || columns.length === 0}
                      >
                        <option value="">
                          {isLoadingColumns ? 'Loading columns...' : 'Select a column'}
                        </option>
                        {columns.map((column) => (
                          <option key={column} value={column}>
                            {column}
                          </option>
                        ))}
                      </select>
                      {!isLoadingColumns && columns.length === 0 && (
                        <p className="text-[10px] text-gray-400">
                          Select a source file to list the available columns.
                        </p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <label htmlFor={formIds.filterOperator} className="block text-xs font-medium text-gray-500 mb-1">
                        Operator
                      </label>
                      <select
                        id={formIds.filterOperator}
                        value={resolvedRowFilterConfig.operator}
                        onChange={(event) =>
                          updateRowFilterConfig({ operator: event.target.value as RowFilterOperator })
                        }
                        className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
                      >
                        {rowFilterOperators.map((operator) => (
                          <option key={operator.value} value={operator.value}>
                            {operator.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label htmlFor={formIds.filterValue} className="block text-xs font-medium text-gray-500 mb-1">
                          Value
                        </label>
                        {!rowOperatorsRequiringValue.has(resolvedRowFilterConfig.operator) && (
                          <span className="text-[10px] text-gray-400">Not required</span>
                        )}
                      </div>
                      <input
                        id={formIds.filterValue}
                        type="text"
                        value={resolvedRowFilterConfig.value}
                        onChange={(event) => updateRowFilterConfig({ value: event.target.value })}
                        className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
                        placeholder="Enter comparison value"
                        disabled={!rowOperatorsRequiringValue.has(resolvedRowFilterConfig.operator)}
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">Destinations</h3>
                    <p className="text-xs text-gray-500">
                      Choose the output sheets where this block writes data.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDestinationsCollapsed((prev) => !prev)}
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                  >
                    {destinationsCollapsed ? 'Show destinations' : 'Hide destinations'}
                  </button>
                </div>
                {destinationsCollapsed ? (
                  <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500">
                    {destinationSummary}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {outputFileOptions.length === 0 && (
                      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                        Add output files in the Output block to set destinations.
                      </div>
                    )}
                    {outputFileOptions.length > 0 && (
                      <div className="space-y-3">
                        {destinationTargets.length === 0 && (
                          <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500">
                            No destinations yet. Add one or more output sheets.
                          </div>
                        )}
                        {destinationTargets.length > 0 && hasGroupedSources && destinationTargets.length > 1 ? (
                          <div className="rounded-md border border-gray-200 bg-white p-3 space-y-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="text-xs font-medium text-gray-500">Group outputs</div>
                                <div className="text-sm font-semibold text-gray-900">Generated destinations</div>
                                <div className="text-xs text-gray-500">
                                  {destinationItems.filter(i => i.type === 'group').length} groups mapped
                                </div>
                              </div>
                              <button
                                type="button"
                                className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                                onClick={() => setShowGroupedDestinations((prev) => !prev)}
                              >
                                {showGroupedDestinations ? 'Hide outputs' : 'Show outputs'}
                              </button>
                            </div>
                            
                            {/* Grouped Items */}
                            {showGroupedDestinations && (
                              <div className="space-y-3">
                                {renderDestinationTargets(destinationItems.filter(i => i.type === 'group'))}
                              </div>
                            )}

                            {/* Single Items & Add Button */}
                            <div className="pt-2 border-t border-gray-100 space-y-3">
                                {renderDestinationTargets(destinationItems.filter(i => i.type === 'single'))}
                                <button
                                  type="button"
                                  onClick={() => updateDestinationTargets([...destinationTargets, emptyTarget])}
                                  className="w-full rounded-md border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-600 hover:border-indigo-300 hover:text-indigo-600"
                                >
                                  Add destination
                                </button>
                            </div>
                          </div>
                        ) : destinationTargets.length > 0 ? (
                          <>
                            {renderDestinationTargets()}
                            <button
                                type="button"
                                onClick={() => updateDestinationTargets([...destinationTargets, emptyTarget])}
                                className="w-full rounded-md border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-600 hover:border-indigo-300 hover:text-indigo-600"
                              >
                                Add destination
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => updateDestinationTargets([...destinationTargets, emptyTarget])}
                            className="w-full rounded-md border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-600 hover:border-indigo-300 hover:text-indigo-600"
                          >
                            Add destination
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
          
          {isOutputNode && (
            <div className="space-y-6">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Output Configuration</h3>
                  <p className="text-xs text-gray-500">
                    Define the Excel files and sheets that will be generated.
                  </p>
                </div>
              </div>

              {/* Group Files Section (Read-Only) */}
              {sourceItems.some(i => i.type === 'group') && (
                <div className="rounded-md border border-gray-200 bg-gray-50 p-3 space-y-3">
                   <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Group Files</h4>
                        <p className="text-[10px] text-gray-500">Auto-generated from input batches</p>
                      </div>
                      <button
                        type="button"
                        className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                        onClick={() => setShowOutputGroups((prev) => !prev)}
                      >
                        {showOutputGroups ? 'Hide' : 'Show'}
                      </button>
                   </div>
                   
                   {showOutputGroups && (
                      <div className="space-y-2 pt-2 border-t border-gray-200">
                        {sourceItems.filter(i => i.type === 'group').map(group => {
                            const g = group as { type: 'group'; batchId: number; targets: any[] };
                            const batchName = batchesById.get(g.batchId)?.name || 'Unnamed Batch';
                            return (
                              <div key={`output-group-${g.batchId}`} className="flex items-center justify-between p-2 bg-white rounded border border-gray-100">
                                <div>
                                  <div className="text-sm font-medium text-gray-900">{batchName}</div>
                                  <div className="text-xs text-gray-500">Generates {g.targets.length} files</div>
                                </div>
                                <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-1 rounded">Read-only</span>
                              </div>
                            );
                        })}
                      </div>
                   )}
                </div>
              )}

              {/* Single Files Section (Editable) */}
              <div className="space-y-4">
                <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Single Files</h4>
                {outputConfig.outputs.map((file, fileIndex) => (
                  <div key={file.id} className="rounded-md border border-gray-200 bg-white p-3 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1">
                        <label className="block text-xs font-medium text-gray-500 mb-1">File Name</label>
                        <input
                          type="text"
                          value={file.fileName}
                          onChange={handleOutputFileNameChange(fileIndex)}
                          className="w-full rounded-md border border-gray-200 px-2 py-1 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          placeholder="output.xlsx"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeOutputFile(fileIndex)}
                        className="mt-4 text-xs font-medium text-red-600 hover:text-red-700"
                        title="Remove file"
                      >
                        Remove
                      </button>
                    </div>

                    <div className="pl-3 border-l-2 border-gray-100 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-medium text-gray-500">Sheets</label>
                        <button
                          type="button"
                          onClick={() => addOutputSheet(fileIndex)}
                          className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
                        >
                          + Add Sheet
                        </button>
                      </div>
                      
                      {file.sheets.map((sheet, sheetIndex) => (
                        <div key={sheetIndex} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={sheet.sheetName}
                            onChange={handleOutputSheetNameChange(fileIndex, sheetIndex)}
                            className="flex-1 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            placeholder="Sheet Name"
                          />
                          {file.sheets.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeOutputSheet(fileIndex, sheetIndex)}
                              className="text-gray-400 hover:text-red-600"
                              title="Remove sheet"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={addOutputFile}
                  className="w-full rounded-md border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-600 hover:border-indigo-300 hover:text-indigo-600"
                >
                  Add output file
                </button>
              </div>
            </div>
          )}
        </div>





      </div>
    </div>
  );
};
