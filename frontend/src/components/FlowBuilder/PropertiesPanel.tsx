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

import { useFlowStore } from '../../store/flowStore';
import { outputFileOptionById, outputFileOptions as getOutputFileOptions } from './utils';
import { ExcelTemplateEditor, VirtualFileTemplate, SheetTemplate } from './ExcelTemplateEditor';
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
  flowId?: number;
}

// Sentinel for CSV files where sheet selection doesn't apply.
const SINGLE_SHEET_VALUE = '__single__';

const normalizeTarget = (target?: TableTarget): TableTarget => ({
  fileId: target?.fileId ?? null,
  sheetName: target?.sheetName ?? null,
  batchId: target?.batchId ?? null,
  virtualId: target?.virtualId ?? null,
  virtualName: target?.virtualName ?? null,
  sourceId: target?.sourceId ?? null,
  linkedSourceIds: target?.linkedSourceIds ?? [],
  isFinalOutput: target?.isFinalOutput,
  isFutureSource: target?.isFutureSource,
  writeMode: target?.writeMode ?? 'overwrite',
});

const emptyTarget: TableTarget = {
  fileId: null,
  sheetName: null,
  batchId: null,
  virtualId: null,
  virtualName: null,
  sourceId: null,
  linkedSourceIds: [],
};

const EMPTY_ARRAY: any[] = [];

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


export const PropertiesPanel = ({
  selectedNodeId,
  onClose,
  lastTarget: _lastTarget,
  onUpdateLastTarget,
  refreshKey,
  flowId,
}: PropertiesPanelProps) => {
  const { nodes, updateNode } = useFlowStore();
  const [files, setFiles] = useState<File[]>([]);
  const [lastTarget, setLastTarget] = useState<TableTarget | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingDestinationIndex, setEditingDestinationIndex] = useState<number | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [sheetsByFileId, setSheetsByFileId] = useState<Record<number, string[]>>({});
  const [isLoadingSheets, setIsLoadingSheets] = useState(false);
  const [sourcesCollapsed, setSourcesCollapsed] = useState(false);
  const [destinationsCollapsed, setDestinationsCollapsed] = useState(false);
  const [expandedSourceGroups, setExpandedSourceGroups] = useState<Record<number, boolean>>({});
  const [showGroupedDestinations, setShowGroupedDestinations] = useState(false);
  const [showOutputGroups, setShowOutputGroups] = useState(false);
  const precomputeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const node = useMemo(() => nodes.find((n) => n.id === selectedNodeId), [nodes, selectedNodeId]);
  
  // Detect if any source node in the flow has a batch configured
  // This is used to enable "Batch Output Mode" in the output node's panel
  const hasUpstreamBatch = useMemo(() => {
    return nodes.some((n) => {
      if (n.type !== 'source') return false;
      const data = n.data as BlockData | undefined;
      const target = data?.target;
      // Check if target has a batchId or if fileIds contains files from a batch
      return target?.batchId != null && target.batchId > 0;
    });
  }, [nodes]);
  
  // Get the batch ID from the first source node that has one (for output node preview)
  // Get the batch ID from source nodes (check all, not just first)
  const upstreamBatchId = useMemo(() => {
    const batchIds = new Set<number>();
    for (const n of nodes) {
      if (n.type !== 'source') continue;
      const data = n.data as BlockData | undefined;
      const target = data?.target;
      if (target?.batchId != null && target.batchId > 0) {
        batchIds.add(target.batchId);
      }
    }
    // For now, return the first one found if any, or handle multiple?
    // The UI currently seems designed for singular upstream logic in some spots, 
    // but improving this to at least be consistent with `hasUpstreamBatch` is good.
    return batchIds.size > 0 ? Array.from(batchIds)[0] : null;
  }, [nodes]);
  
  // Generate unique IDs for form elements based on selectedNodeId
  const formIds = useMemo(() => ({
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
    sourceEntrySheet: (index: number) => `source-sheet-${selectedNodeId ?? 'source'}-${index}`,
    sourceEntrySelect: (index: number) => `source-entry-select-${selectedNodeId ?? 'source'}-${index}`,
  }), [selectedNodeId]);
  
  const nodeType = node?.type || '';
  const nodeData = useMemo(() => (node?.data || {}) as unknown as BlockData, [node]);
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
const addedBatchIds = useMemo(() => {
  const batchSet = new Set<number>();
  sourceTargets.forEach((target) => {
    if (typeof target.batchId === 'number') {
      batchSet.add(target.batchId);
    }
  });
  return batchSet;
}, [sourceTargets]);
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

  const globalOutputConfig = useMemo<OutputConfig>(() => {
    const outputNode = nodes.find((n) => n.data?.blockType === 'output' || n.type === 'output');
    return normalizeOutputConfig(outputNode?.data?.output as OutputConfig | { fileName?: string; sheets?: OutputSheetMapping[] } | undefined);
  }, [nodes, normalizeOutputConfig]);

  // Removed getOutputFileOptions(outputConfig) and outputFileOptionById useMemo blocks as they are now imported functions.

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

  // Removed handleUseFileAsDestination

  const buildOutputTarget = useCallback(
    (
      fileOption: { outputId: string; label: string },
      sheetName: string,
      prev?: TableTarget
    ): TableTarget => ({
      fileId: null,
      sheetName,
      virtualId: `output:${fileOption.outputId}:${sheetName}`,
      virtualName: `${fileOption.label} / ${sheetName}`,
      sourceId: prev?.sourceId ?? null,
      linkedSourceIds: prev?.linkedSourceIds ?? [],
    }),
    []
  );

  const handleLinkedSourcesChange = useCallback(
    (destIndex: number, event: ChangeEvent<HTMLSelectElement>) => {
      const selectedValues = Array.from(event.target.selectedOptions)
        .map((option) => Number(option.value))
        .filter((value) => !Number.isNaN(value));
      const nextTargets = [...destinationTargets];
      const target = nextTargets[destIndex];
      nextTargets[destIndex] = {
        ...target,
        linkedSourceIds: selectedValues,
        sourceId: selectedValues[0] ?? null,
      };
      updateDestinationTargets(nextTargets);
    },
    [destinationTargets, updateDestinationTargets]
  );

  const renderLinkedSourcesControl = (destTarget: TableTarget, index: number) => {
    if (sourceLinkOptions.length === 0) {
      return null;
    }
    const selectedValues = (destTarget.linkedSourceIds ?? [])
      .map((value) => Number(value))
      .filter((value) => !Number.isNaN(value))
      .map((value) => String(value));
    const size = Math.max(2, Math.min(4, sourceLinkOptions.length));
    const controlId = `linked-sources-${selectedNodeId ?? 'link'}-${index}`;
    return (
      <div>
        <label
          htmlFor={controlId}
          className="block text-xs font-medium text-gray-500 mb-1"
        >
          Linked sources
        </label>
        <select
          id={controlId}
          multiple
          size={size}
          className="w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700"
          value={selectedValues}
          onChange={(event) => handleLinkedSourcesChange(index, event)}
          data-testid={`linked-sources-${index}`}
        >
          {sourceLinkOptions.map((option) => (
            <option key={option.value} value={String(option.value)}>
              {option.label}
            </option>
          ))}
        </select>
        <p className="text-[10px] text-gray-400 mt-1">Select all sources forwarded to this destination.</p>
      </div>
    );
  };

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

  const getSourceLabel = useCallback((target: TableTarget, index: number) => {
    const file = target.fileId ? filesById.get(target.fileId) : null;
    if (file?.original_filename) {
      return file.original_filename;
    }
    if (target.virtualName) {
      return target.virtualName;
    }
    return `Source ${index + 1}`;
  }, [filesById]);

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
    const result: Array<{ label: string; files: File[]; batchId: number | null }> = [];
    Array.from(groupedFiles.entries())
      .sort((a, b) => a[0] - b[0])
      .forEach(([batchId, groupFiles]) => {
        const label = batchesById.get(batchId)?.name ?? `Batch ${batchId}`;
        result.push({ label, files: groupFiles, batchId });
      });
    if (singles.length > 0) {
      result.push({ label: 'Single files', files: singles, batchId: null });
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

  const sourceLinkOptions = useMemo(
    () =>
      sourceTargets.map((target, index) => ({
        value: index,
        label: getSourceLabel(target, index),
      })),
    [getSourceLabel, sourceTargets]
  );




  const sourceGroupFiles = useMemo(() => {
    // Collect all unique batch IDs from source targets
    const batchIds = new Set<number>();
    sourceTargets.forEach(t => {
      if (t.batchId) {
        batchIds.add(t.batchId);
      }
    });

    // If no batch IDs in current node's targets, check the primary source node
    if (batchIds.size === 0 && sourceNodeTarget.batchId) {
      batchIds.add(sourceNodeTarget.batchId);
    }

    if (batchIds.size > 0) {
      // Use the first batch ID found for the "Export Batch" info box
      const firstBatchId = Array.from(batchIds)[0];
      return files.filter((file) => file.batch_id === firstBatchId);
    }
    return [];
  }, [files, sourceTargets, sourceNodeTarget.batchId]);


  const [expandedDestinationGroups, setExpandedDestinationGroups] = useState<Record<number, boolean>>({});

  const availableBatchOptions = useMemo(() => {
    const batchMap = new Map<number, string>();
    files.forEach((file) => {
      if (typeof file.batch_id !== 'number') {
        return;
      }
      if (!batchMap.has(file.batch_id)) {
        batchMap.set(
          file.batch_id,
          batchesById.get(file.batch_id)?.name ?? `Batch ${file.batch_id}`
        );
      }
    });
    return Array.from(batchMap.entries()).map(([id, label]) => ({ id, label }));
  }, [files, batchesById]);

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
      let batchId: number | null = target.batchId ?? null;
      let fileId: number | null = null;
      
      const parsed = parseOutputVirtualId(target.virtualId);
      if (parsed) {
         // Output ID format: output-{timestamp}-{fileId}-{index}
         const match = parsed.outputId?.match(/output-\d+-(\d+)-\d+/);
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



  // Removed destinationSummary and sourceSummary

  // CAUTION: The current application logic expects `sourceTargets` (array) to be the source of truth for execution.
  // The indices `0, 1, 2...` in `availableSourceOptions` MUST correspond to the indices in `sourceTargets`.
  // We need to correlate our "Graph-Aware" streams with the actual `sourceTargets` list.
  // We will iterate `sourceTargets` and try to match them to the Upstream Groups for labeling purposes.
  
  const availableSourceOptions = useMemo(() => {
    
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
                  disabled={typeof group.batchId === 'number'}
                  className={`text-xs font-semibold ${typeof group.batchId === 'number' ? 'text-gray-400 cursor-not-allowed' : 'text-red-600 hover:text-red-700'}`}
                  onClick={() => {
                    if (typeof group.batchId === 'number') return;
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
            
            {/* Batch Output Flags */}
            <div className="flex items-center gap-4 px-1">
               <label className="flex items-center gap-2 cursor-pointer">
                 <input 
                   type="checkbox"
                   className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-600"
                   checked={group.targets.every((t: { target: TableTarget }) => t.target.isFinalOutput)}
                   onChange={(e) => {
                      const isChecked = e.target.checked;
                      const groupIndices = new Set(group.targets.map((t: { index: number }) => t.index));
                      const nextTargets = destinationTargets.map((t, idx) => 
                        groupIndices.has(idx) ? { ...t, isFinalOutput: isChecked } : t
                      );
                      updateDestinationTargets(nextTargets);
                   }}
                 />
                 <span className="text-xs text-gray-700">Final Output</span>
               </label>
               <label className="flex items-center gap-2 cursor-pointer">
                 <input 
                   type="checkbox"
                   className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-600"
                   checked={group.targets.every((t: { target: TableTarget }) => t.target.isFutureSource)}
                   onChange={(e) => {
                      const isChecked = e.target.checked;
                      const groupIndices = new Set(group.targets.map((t: { index: number }) => t.index));
                      const nextTargets = destinationTargets.map((t, idx) => 
                        groupIndices.has(idx) ? { ...t, isFutureSource: isChecked } : t
                      );
                      updateDestinationTargets(nextTargets);
                   }}
                 />
                 <span className="text-xs text-gray-700">Future Source</span>
               </label>
            </div>

            {isExpanded && (
              <div className="space-y-2">
                {group.targets.map(({ target: destTarget, index }: { target: TableTarget; index: number }) => {
                  const parsedOutput = parseOutputVirtualId(destTarget.virtualId);
                  const activeOutputOption = parsedOutput
                    ? getOutputFileOptions(globalOutputConfig).find((option) => option.outputId === parsedOutput.outputId) ?? getOutputFileOptions(globalOutputConfig)[0] ?? null
                    : getOutputFileOptions(globalOutputConfig)[0] ?? null;
                  const outputSheets = activeOutputOption?.sheets?.map((sheet) => sheet.sheetName || 'Sheet 1') ?? [];
                  const fileId = parsedOutput?.outputId.match(/output-\d+-(\d+)-\d+/)?.[1];
                  const file = fileId ? filesById.get(Number(fileId)) : null;
                  const fileLabel = file?.original_filename || file?.filename || 'Unnamed file';
                  const isBatch = typeof group.batchId === 'number';

                  return (
                    <div key={`group-dest-${index}`} className="pl-2 border-l-2 border-gray-100 space-y-2">
                      <div className="flex items-center justify-between">
                         <div className="text-xs text-gray-600 truncate max-w-[200px]" title={fileLabel}>
                            {fileLabel}
                         </div>
                         {!isBatch && (
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
                         )}
                      </div>

                      {!isBatch && (
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
                              const fileOption = outputFileOptionById(globalOutputConfig).get(Number(event.target.value));
                              if (!fileOption) return;
                              const sheetName = fileOption.sheets?.[0]?.sheetName || 'Sheet 1';
                              const nextTargets = [...destinationTargets];
                              nextTargets[index] = buildOutputTarget(fileOption, sheetName, destTarget);
                              updateDestinationTargets(nextTargets);
                            }}
                            className="w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700"
                            disabled={false}
                          >
                            <option value="">Select output file</option>
                            {getOutputFileOptions(globalOutputConfig).map((option) => (
                              <option key={option.outputId} value={String(option.id)}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          </div>
                          <div>
                            <select
                              value={destTarget.sheetName ?? ''}
                              onChange={(event) => {
                                if (!activeOutputOption) return;
                                const sheetName = event.target.value;
                                const nextTargets = [...destinationTargets];
                                nextTargets[index] = buildOutputTarget(activeOutputOption, sheetName, destTarget);
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
                      )}
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
          ? getOutputFileOptions(globalOutputConfig).find((option) => option.outputId === parsedOutput.outputId) ?? getOutputFileOptions(globalOutputConfig)[0] ?? null
          : getOutputFileOptions(globalOutputConfig)[0] ?? null;
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
            {/* Single Destination Flags */}
            <div className="flex items-center gap-4 mb-2">
               <label className="flex items-center gap-2 cursor-pointer">
                 <input 
                   type="checkbox"
                   className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-600"
                   checked={destTarget.isFinalOutput || false}
                   onChange={(e) => {
                      const nextTargets = [...destinationTargets];
                      nextTargets[index] = { ...destTarget, isFinalOutput: e.target.checked };
                      updateDestinationTargets(nextTargets);
                   }}
                 />
                 <span className="text-xs text-gray-700">Final Output</span>
               </label>
               <label className="flex items-center gap-2 cursor-pointer">
                 <input 
                   type="checkbox"
                   className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-600"
                   checked={destTarget.isFutureSource || false}
                   onChange={(e) => {
                      const nextTargets = [...destinationTargets];
                      nextTargets[index] = { ...destTarget, isFutureSource: e.target.checked };
                      updateDestinationTargets(nextTargets);
                   }}
                 />
                 <span className="text-xs text-gray-700">Future Source</span>
               </label>
            </div>
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Output file</label>
                  <select
                    value={activeOutputOption?.id ?? ''}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (value === 'NEW_FILE') {
                          setEditingDestinationIndex(index);
                          setIsEditorOpen(true);
                          return; 
                      }
    
                      const fileOption = outputFileOptionById(globalOutputConfig).get(Number(value) || String(value)); 
                      if (!fileOption) return;
                      const sheetName = fileOption.sheets?.[0]?.sheetName || 'Sheet 1';
                      const nextTargets = [...destinationTargets];
                      nextTargets[index] = buildOutputTarget(fileOption, sheetName, destTarget);
                      updateDestinationTargets(nextTargets);
                    }}
                    className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
                    disabled={false}
                  >
                    <option value="">Select output file</option>
                    <option value="NEW_FILE">+ Create new file</option>
                    {getOutputFileOptions(globalOutputConfig)
                      .filter(option => !option.creatorNodeId || option.creatorNodeId === selectedNodeId)
                      .map((option) => (
                      <option key={option.outputId} value={String(option.id)}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                {/* Edit Button for Virtual Files */}
                {activeOutputOption && String(activeOutputOption.outputId).length > 10 && (
                   <div className="flex gap-1">
                    <button
                        type="button"
                        onClick={() => {
                            setEditingDestinationIndex(index);
                            setIsEditorOpen(true);
                        }}
                        className="p-2 text-gray-400 hover:text-indigo-600 border border-gray-200 rounded-md bg-white mb-[1px]"
                        title="Edit Template"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                    </button>
                    {/* Delete Button - Only for owned files */}
                    {(activeOutputOption.creatorNodeId === selectedNodeId) && (
                        <button
                            type="button"
                            onClick={() => {
                                // Find output node and remove the file config
                                const outputNode = nodes.find((n) => n.data?.blockType === 'output' || n.type === 'output');
                                if (!outputNode) return;
                                
                                // Confirm deletion? For now direct delete as requested "Users should be able to delete"
                                const currentOutputConfig = (outputNode.data?.output as OutputConfig) || { outputs: [], mode: 'single' };
                                const nextOutputs = currentOutputConfig.outputs.filter(o => o.id !== activeOutputOption.outputId);
                                
                                updateNode(outputNode.id, {
                                    data: {
                                        ...outputNode.data,
                                        output: { ...currentOutputConfig, outputs: nextOutputs }
                                    }
                                });
                                
                                // Reset selection for this target
                                const nextTargets = [...destinationTargets];
                                nextTargets[index] = { ...destTarget, virtualId: null, sheetName: null };
                                updateDestinationTargets(nextTargets);
                            }}
                            className="p-2 text-gray-400 hover:text-red-600 border border-gray-200 rounded-md bg-white mb-[1px]"
                            title="Delete File"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                        </button>
                    )}
                   </div>
                )}
              </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Output sheet</label>
              <select
                value={destTarget.sheetName ?? ''}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === 'NEW_SHEET') {
                      // Logic to create new sheet in the active output file
                      if (!activeOutputOption) return;
                      const outputNode = nodes.find((n) => n.data?.blockType === 'output' || n.type === 'output');
                      if (!outputNode || !outputNode.data?.output) return;

                      const currentOutputConfig = outputNode.data.output as OutputConfig;
                      const fileIndex = currentOutputConfig.outputs.findIndex(o => o.id === activeOutputOption.id);
                      if (fileIndex === -1) return;

                      const nextOutputs = [...currentOutputConfig.outputs];
                      const newSheetName = `Sheet ${nextOutputs[fileIndex].sheets.length + 1}`;
                      nextOutputs[fileIndex] = {
                          ...nextOutputs[fileIndex],
                          sheets: [...nextOutputs[fileIndex].sheets, { sheetName: newSheetName }]
                      };
                      
                      const newOutputConfig = { ...currentOutputConfig, outputs: nextOutputs };
                       updateNode(outputNode.id, {
                        data: {
                          ...outputNode.data,
                          output: newOutputConfig
                        }
                      });
                      
                      // Auto-select the NEW sheet
                       const nextTargets = [...destinationTargets];
                       nextTargets[index] = buildOutputTarget(activeOutputOption, newSheetName, destTarget);
                       updateDestinationTargets(nextTargets);
                      return;
                  }
                  
                  if (!activeOutputOption) return;
                  const sheetName = event.target.value;
                  const nextTargets = [...destinationTargets];
                  nextTargets[index] = buildOutputTarget(activeOutputOption, sheetName, destTarget);
                  updateDestinationTargets(nextTargets);
                }}
                className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
                disabled={outputSheets.length === 0}
              >
                <option value="NEW_SHEET">+ Create new sheet</option>
                {outputSheets.length === 0 ? (
                  <option value="" disabled>No output sheets</option>
                ) : (
                  outputSheets.map((sheetName) => (
                    <option key={sheetName} value={sheetName}>
                      {sheetName}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Write Mode Selection (Append vs Overwrite) */}
            <div className="mt-3">
               <label className="block text-xs font-medium text-gray-500 mb-2">WRITE MODE</label>
               <div className="flex items-center space-x-4">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input 
                      type="radio" 
                      name={`writeMode-${destTarget.id || index}`}
                      checked={destTarget.writeMode !== 'append'} // Default to overwrite
                      onChange={() => {
                          const nextTargets = [...destinationTargets];
                          nextTargets[index] = { ...destTarget, writeMode: 'overwrite' };
                          updateDestinationTargets(nextTargets);
                      }}
                      className="text-emerald-600 focus:ring-emerald-600"
                    />
                    <span className="text-sm text-gray-700">Overwrite</span>
                  </label>
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input 
                      type="radio" 
                      name={`writeMode-${destTarget.id || index}`}
                      checked={destTarget.writeMode === 'append'}
                      onChange={() => {
                          const nextTargets = [...destinationTargets];
                          nextTargets[index] = { ...destTarget, writeMode: 'append' };
                          updateDestinationTargets(nextTargets);
                      }}
                      className="text-emerald-600 focus:ring-emerald-600"
                    />
                    <span className="text-sm text-gray-700">Append</span>
                  </label>
               </div>
            </div>
          </div>
        );
      }
    });
  };




  const [columns, setColumns] = useState<string[]>([]);
  const [isLoadingColumns, setIsLoadingColumns] = useState(false);





  useEffect(() => {
    if (!selectedNodeId) {
      return;
    }
    // Load files once when the panel opens so the target dropdown is ready.
    filesApi.list()
      .then((result) => {
        // Keep the full file list so group selections can pull in new files.
        setFiles(result);
      })
      .catch((err) => {
        console.error('Failed to list files:', err, { selectedNodeId, refreshKey });
        setFiles([]);
      });

    filesApi.listBatches(flowId)
      .then((result) => setBatches(result))
      .catch((err) => {
        console.error('Failed to list batches:', err, { flowId, selectedNodeId, refreshKey });
        setBatches([]);
      });
  }, [selectedNodeId, refreshKey, flowId]);

  useEffect(() => {
    return () => {
      if (precomputeTimeoutRef.current) {
        window.clearTimeout(precomputeTimeoutRef.current);
      }
    };
  }, []);

  const primaryColumnSource = sourceTargets[0] ?? target;
  useEffect(() => {
    if (!primaryColumnSource.fileId) {
      setColumns([]);
      return;
    }
    setIsLoadingColumns(true);
    filesApi.preview(primaryColumnSource.fileId, primaryColumnSource.sheetName || undefined)
      .then((result) => {
        setColumns(result.columns || []);
      })
      .catch(() => setColumns([]))
      .finally(() => setIsLoadingColumns(false));
  }, [primaryColumnSource.fileId, primaryColumnSource.sheetName]);

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

  // Calculate stable key for file dependencies to prevent infinite loops
  const sourceFileIdsKey = useMemo(() => {
     return sourceTargets
        .map((entry) => entry.fileId)
        .filter((fileId): fileId is number => typeof fileId === 'number')
        .sort()
        .join(',');
  }, [sourceTargets]);

  useEffect(() => {
    const fileIds = sourceFileIdsKey ? sourceFileIdsKey.split(',').map(Number) : [];

    fileIds.forEach((fileId) => {
      // Check if we already have sheets OR if we already tried and failed (to avoid loop)
      if (sheetsByFileId[fileId] !== undefined) {
        return;
      }
      setIsLoadingSheets(true);
      filesApi
        .sheets(fileId)
        .then((sheets) => {
          setSheetsByFileId((prev) => ({ ...prev, [fileId]: sheets }));
        })
        .catch(() => {
             // on error, set empty to prevent infinite retry loop
             setSheetsByFileId((prev) => ({ ...prev, [fileId]: [] }));
        })
        .finally(() => setIsLoadingSheets(false));
    });
  }, [sourceFileIdsKey, sheetsByFileId]); // Dependent on primitive string key now



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

  const getSourceEntrySelectValue = useCallback(
    (target: TableTarget) => {
      if (target.virtualId) {
        const streamIndex = flowSourceTargets.findIndex(
          (stream) => stream.virtualId === target.virtualId && stream.sheetName === target.sheetName
        );
        if (streamIndex >= 0) {
          return `stream:${streamIndex}`;
        }
      }
      if (target.fileId) {
        return `file:${target.fileId}`;
      }
      if (target.batchId) {
        return `group:${target.batchId}`;
      }
      return '';
    },
    [flowSourceTargets]
  );

  const handleSourceEntrySelect = useCallback(
    (index: number, optionValue: string) => {
      if (!optionValue) {
        return;
      }
      const [type, rawId] = optionValue.split(':');
      const nextTargets = [...sourceTargets];
      if (type === 'file') {
        const fileId = Number(rawId);
        if (Number.isNaN(fileId)) {
          return;
        }
        const file = filesById.get(fileId);
        nextTargets[index] = {
          ...nextTargets[index],
          fileId,
          batchId: file?.batch_id ?? nextTargets[index].batchId ?? null,
          sheetName: null,
          virtualId: null,
          virtualName: file?.original_filename ?? null,
        };
        updateSourceTargets(nextTargets);
      } else if (type === 'group') {
        const batchId = Number(rawId);
        if (Number.isNaN(batchId)) {
          return;
        }
        const groupFiles = files.filter((file) => file.batch_id === batchId);
        const existingFileIds = new Set<number>(
          sourceTargets
            .map((target) => target.fileId)
            .filter((fileId): fileId is number => typeof fileId === 'number')
        );
        const newFiles = groupFiles.filter((file) => !existingFileIds.has(file.id));
        if (newFiles.length === 0) {
          return;
        }
        const groupTargets = newFiles.map((file) => ({
          fileId: file.id,
          sheetName: null,
          batchId,
          virtualId: null,
          virtualName: file.original_filename,
        }));
        nextTargets.splice(index, 1, ...groupTargets);
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
        nextTargets[index] = streamTarget;
        updateSourceTargets(nextTargets);
      }
    },
    [files, filesById, flowSourceTargets, sourceTargets, updateSourceTargets]
  );

const renderSourceOptions = useCallback(
  () => (
    <>
        <option value="">Select source...</option>
        {sourcePickerGroups.map((group) => (
          <optgroup key={group.label} label={group.label}>
            {typeof group.batchId === 'number' && (
              <option value={`group:${group.batchId}`}>
                Use all {group.label}
              </option>
            )}
            {group.files.map((file) => (
              <option key={file.id} value={`file:${file.id}`}>
                {file.original_filename}
              </option>
            ))}
          </optgroup>
        ))}

      </>
    ),
    [sourcePickerGroups]
  );

  const handleAddBatchSources = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const selected = Array.from(event.target.selectedOptions)
        .map((option) => Number(option.value))
        .filter((value): value is number => !Number.isNaN(value));
      if (selected.length === 0) {
        return;
      }
      const nextTargets = [...sourceTargets];
      const existingBatches = new Set(addedBatchIds);
      selected.forEach((batchId) => {
        // Find if this batch is already fully represented? 
        // Logic: Add all files from this batch. 
        // If some files from this batch are already added, we should probably add the missing ones or ignore duplicates.
        // Simplified: Just check which files from this batch are NOT in sourceTargets.
        const batchFiles = files.filter((file) => file.batch_id === batchId);
        
        // Helper to check if file is already a source
        const currentFileIds = new Set(sourceTargets.map(t => t.fileId).filter(Boolean));
        
        batchFiles.forEach((file) => {
          if (!currentFileIds.has(file.id)) {
             nextTargets.push({
                fileId: file.id,
                sheetName: null,
                batchId,
                virtualId: null,
                virtualName: file.original_filename,
             });
          }
        });
        // We track addedBatches separately but purely for UI disabling often. 
        // If we want to allow re-selection if user removed files, avoid blocking based on `existingBatches`.
        existingBatches.add(batchId);
      });
      if (nextTargets.length !== sourceTargets.length) {
        updateSourceTargets(nextTargets);
      }
      event.target.selectedIndex = -1;
    },
    [addedBatchIds, files, sourceTargets, updateSourceTargets]
  );









  const updateOutputConfig = useCallback((nextConfig: OutputConfig) => {
    if (!node) return;
    updateNode(node.id, {
      data: {
        ...nodeData,
        output: nextConfig,
      },
    });
  }, [node, nodeData, updateNode]);





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
    if (getOutputFileOptions(outputConfig).length === 0) {
      // Even if no options, we should validate to clean up invalid links if any?
      // Or we wait. But returning here prevents validation if we have destinations.
      // Let's proceed to filter.
    }
    const validTargets = destinationTargets.filter((destTarget) => {
      // Allow implicit auto-generated outputs for batches
      if (destTarget.virtualId?.startsWith('output:auto:')) {
        return true;
      }
      // Allow newly created custom destinations (using random UUID)
      if (destTarget.virtualId?.startsWith('output:')) {
          return true;
      }
      if (!destTarget.virtualId) {
        return true;
      }
      const parsed = parseOutputVirtualId(destTarget.virtualId);
      if (!parsed?.outputId) {
        return false;
      }
      return getOutputFileOptions(outputConfig).some((option) => option.outputId === parsed.outputId);
    });
    if (validTargets.length !== destinationTargets.length) {
      updateDestinationTargets(validTargets);
    }
  }, [
    destinationTargets,
    isOutputNode,
    getOutputFileOptions(outputConfig),
    parseOutputVirtualId,
    updateDestinationTargets,
  ]);


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
        {/* Destination Management Section */}



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
                    {sourceTargets.length} selected
                  </div>
                ) : (
                  <div className="space-y-3">
                    {sourceTargets.length === 0 && (
                      <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500">
                        No sources yet. Add one or more sources to run this operation.
                      </div>
                    )}
                    <div className="rounded-md border border-gray-200 bg-white px-3 py-2 space-y-2">
                      <p className="text-xs text-gray-500">
                        Use “Add source” to append a row, then pick a file or stream in that row’s dropdown below.
                      </p>
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
                                  const allSame = group.targets.every(({ target }: { target: TableTarget }) => target.sheetName === firstSheet);
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
                                      )).sort().map((sheet: any) => (
                                        <option key={String(sheet)} value={String(sheet)}>
                                          {String(sheet)}
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
                          const sheetSelectId = formIds.sourceEntrySheet(index);
                          const sourceSelectId = formIds.sourceEntrySelect(index);
                          const sourceTarget = target;
                          const sheetOptionsForSource = sourceTarget.fileId ? (sheetsByFileId[sourceTarget.fileId] ?? []) : [];
                          const hasSourceSheets = sheetOptionsForSource.length > 0;

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
                                <label
                                  htmlFor={sourceSelectId}
                                  className="block text-xs font-medium text-gray-500 mb-1"
                                >
                                  Source
                                </label>
                                <select
                                  id={sourceSelectId}
                                  data-testid={`source-entry-select-${index}`}
                                  value={getSourceEntrySelectValue(sourceTarget)}
                                  onChange={(event) =>
                                    handleSourceEntrySelect(index, event.target.value)
                                  }
                                  className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
                                >
                                  {renderSourceOptions()}
                                </select>
                              </div>
                              <div>
                                <label
                                  htmlFor={sheetSelectId}
                                      className="block text-xs font-medium text-gray-500 mb-1"
                                    >
                                      Sheet
                                    </label>
                                    <select
                                      id={sheetSelectId}
                                      data-testid={`source-sheet-${index}`}
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
                    {availableBatchOptions.length > 0 && (
                      <div className="space-y-2 mt-2">
                        <p className="text-[10px] text-gray-500">
                          Add batch groups (select one or more batches to append their files).
                        </p>
                        <select
                          id="batch-multi-select"
                          data-testid="batch-multi-select"
                          multiple
                          size={Math.min(4, availableBatchOptions.length)}
                          className="w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700"
                          onChange={handleAddBatchSources}
                        >
                          {availableBatchOptions.map((option) => (
                            <option
                              key={option.id}
                              value={option.id}
                              disabled={addedBatchIds.has(option.id)}
                            >
                              {option.label}
                              {addedBatchIds.has(option.id) ? ' (added)' : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
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
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">Destinations</h3>
                    <p className="text-xs text-gray-500">
                      Configure where data goes after this step.
                    </p>
                  </div>
                </div>


                {destinationsCollapsed ? (
                  <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500">
                    <button 
                        className="w-full text-left"
                        onClick={() => setDestinationsCollapsed(false)}
                    >
                        {destinationTargets.length} destination{destinationTargets.length !== 1 ? 's' : ''} configured
                    </button>
                  </div>
                ) : destinationTargets.length === 0 ? (
                   <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-4 text-center">
                      <p className="text-xs text-gray-500 mb-2">No destinations configured.</p>
                      {hasUpstreamBatch ? (
                          <div className="text-xs text-indigo-600 bg-indigo-50 px-2 py-1 rounded inline-block">
                             Auto-generating destinations to match upstream batch.
                          </div>
                      ) : (
                          <button
                            onClick={() => {
                                const newTarget: TableTarget = {
                                    fileId: null,
                                    sheetName: null,
                                    batchId: null,
                                    virtualId: `output:${crypto.randomUUID()}:Sheet1`,
                                    virtualName: `Destination 1`,
                                    isFinalOutput: true,
                                    isFutureSource: false
                                };
                                updateDestinationTargets([newTarget]);
                            }}
                            className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                          >
                             Add a destination
                          </button>
                      )}
                   </div>
                ) : (
                                   <div className="space-y-4">
                      {renderDestinationTargets()}
                      <button
                         onClick={() => {
                            const newTarget: TableTarget = {
                                fileId: null,
                                sheetName: null,
                                batchId: null,
                                virtualId: `output:${crypto.randomUUID()}:Sheet1`,
                                virtualName: `New Destination`,
                                isFinalOutput: true,
                                isFutureSource: false
                            };
                            updateDestinationTargets([...destinationTargets, newTarget]);
                         }}
                         className="w-full rounded-md border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-600 hover:border-indigo-300 hover:text-indigo-600 flex items-center justify-center gap-2"
                      >
                         <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                         </svg>
                         Add Destination
                      </button>
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

              {/* Batch Output Mode */}
              {hasUpstreamBatch ? (
                <div className="space-y-4">
                  <div className="rounded-md border border-purple-200 bg-purple-50 p-3 mb-2">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">
                        <svg className="h-4 w-4 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                        </svg>
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-purple-900">Batch Output Mode</h4>
                        <p className="text-xs text-purple-700 mt-1">
                          Since the input is a group, this block will generate one file per input file.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-md border border-gray-200 bg-white p-3 space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">
                        File Naming Pattern
                      </label>
                      <input
                        type="text"
                        data-testid="batch-naming-pattern-input"
                        value={outputConfig.batchNamingPattern ?? '{original_name}_processed.xlsx'}
                        onChange={(e) => {
                          updateNode(node.id, {
                            data: {
                              ...nodeData,
                              output: {
                                ...outputConfig,
                                batchNamingPattern: e.target.value,
                                mode: 'batch_template'
                              }
                            }
                          });
                        }}
                        className="w-full rounded-md border border-gray-200 px-2 py-1 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                        placeholder="{original_name}_processed.xlsx"
                      />
                      <p className="text-[10px] text-gray-400 mt-1">
                        Use <code className="bg-gray-100 px-1 rounded text-gray-600">{`{original_name}`}</code> to reference the input filename.
                      </p>
                    </div>

                    <div className="pl-3 border-l-2 border-gray-100 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-medium text-gray-500">Output Sheets (Template)</label>
                        <button
                          type="button"
                          onClick={() => {
                            // Add sheet to the template (first output item)
                            const templateOutput = outputConfig.outputs[0] || { id: 'template', fileName: 'template', sheets: [] };
                            const nextOutputs = [...outputConfig.outputs];
                            if (nextOutputs.length === 0) nextOutputs.push(templateOutput);
                            
                            nextOutputs[0] = {
                              ...nextOutputs[0],
                              sheets: [...(nextOutputs[0].sheets || []), { sheetName: `Sheet ${nextOutputs[0].sheets.length + 1}` }]
                            };

                            updateNode(node.id, {
                              data: {
                                ...nodeData,
                                output: {
                                  ...outputConfig,
                                  outputs: nextOutputs,
                                  mode: 'batch_template'
                                }
                              }
                            });
                          }}
                          className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
                        >
                          + Add Sheet
                        </button>
                      </div>
                      
                      {/* Render sheets of the first output item as the template */}
                      {(outputConfig.outputs[0]?.sheets || []).map((sheet: any, sheetIndex: number) => (
                        <div key={sheetIndex} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={sheet.sheetName}
                            onChange={(e) => {
                                const nextOutputs = [...outputConfig.outputs];
                                const nextSheets = [...nextOutputs[0].sheets];
                                nextSheets[sheetIndex] = { ...nextSheets[sheetIndex], sheetName: e.target.value };
                                nextOutputs[0] = { ...nextOutputs[0], sheets: nextSheets };

                                updateNode(node.id, {
                                  data: {
                                    ...nodeData,
                                    output: {
                                      ...outputConfig,
                                      outputs: nextOutputs
                                    }
                                  }
                                });
                            }}
                            className="flex-1 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            placeholder="Sheet Name"
                          />
                          <button
                            type="button"
                            onClick={() => {
                                const nextOutputs = [...outputConfig.outputs];
                                const nextSheets = nextOutputs[0].sheets.filter((_, idx) => idx !== sheetIndex);
                                nextOutputs[0] = { ...nextOutputs[0], sheets: nextSheets };

                                updateNode(node.id, {
                                  data: {
                                    ...nodeData,
                                    output: {
                                      ...outputConfig,
                                      outputs: nextOutputs
                                    }
                                  }
                                });
                            }}
                            className="text-gray-400 hover:text-red-600"
                            title="Remove sheet"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ))}
                      {(outputConfig.outputs[0]?.sheets?.length ?? 0) === 0 && (
                        <div className="text-[10px] text-amber-600 italic">
                          Add at least one sheet to generate valid files.
                        </div>
                      )}
                    </div>
                    
                    {/* Generated Files Preview Section */}
                    {upstreamBatchId && (() => {
                      // Get files from this batch for preview
                      const batchFiles = files.filter(f => f.batch_id === upstreamBatchId);
                      const namingPattern = outputConfig.batchNamingPattern ?? '{original_name}_processed.xlsx';
                      
                      // Calculate generated file names
                      const generatedNames = batchFiles.map(f => {
                        const baseName = f.original_filename?.replace(/\.[^/.]+$/, '') ?? f.filename.replace(/\.[^/.]+$/, '');
                        return namingPattern.replace('{original_name}', baseName);
                      });
                      
                      return batchFiles.length > 0 ? (
                        <div className="rounded-md border border-gray-200 bg-gray-50 p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-gray-700">
                              📁 Generated Files Preview ({batchFiles.length} files)
                            </span>
                          </div>
                          <div className="pl-3 border-l-2 border-gray-200 space-y-1 max-h-32 overflow-y-auto">
                            {generatedNames.map((name, idx) => (
                              <div 
                                key={idx} 
                                className="text-xs text-gray-600 font-mono flex items-center gap-1"
                                data-testid={`generated-file-${idx}`}
                              >
                                <span className="text-gray-400">└</span>
                                <span title={`From: ${batchFiles[idx]?.original_filename ?? batchFiles[idx]?.filename}`}>{name}</span>
                              </div>
                            ))}
                          </div>
                          <div className="text-[10px] text-gray-400 mt-1">
                            Each input file will create a corresponding output file.
                          </div>
                        </div>
                      ) : null;
                    })()}
                  </div>
                </div>
              ) : (
                <>

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


              </div>
              </>
            )}
            </div>
          )}
        </div>





      </div>

      <ExcelTemplateEditor
        isOpen={isEditorOpen}
        initialTemplate={(() => {
            if (editingDestinationIndex === null) return undefined;
            const target = destinationTargets[editingDestinationIndex];
            if (!target) return undefined;
            
            // Find the output file config
            // parseOutputVirtualId helps if we have virtualId
            // Or we look up via active option?
            // The cleanest way is to look in `outputConfig.outputs` for matching ID.
            const parsed = parseOutputVirtualId(target.virtualId);
            // If we have parsed.outputId (which is the UUID for virtual files), look it up.
            // But wait, `target.fileId` is null for virtual files.
            
            let fileId = null;
            if (parsed) {
                 // The regex in `parseOutputVirtualId` extracts what we call `outputId`.
                 // But `OutputFileConfig.id` might be that UUID.
                 // Let's look at `getOutputFileOptions`: it maps `file.id` to `option.id`.
                 // Let's iterate `outputConfig.outputs` and find match.
                 // Actually `parseOutputVirtualId` implementation (not shown completely) likely returns the ID string.
                 const match = target.virtualId?.match(/output:([^:]+):.*/);
                 if (match) fileId = match[1];
            }
            
            if (!fileId) return undefined;
            
            const fileConfig = globalOutputConfig.outputs.find(o => String(o.id) === fileId);
            if (!fileConfig) return undefined;
            
            return {
                id: String(fileConfig.id),
                name: fileConfig.fileName,
                sheets: fileConfig.sheets.map(s => ({
                    name: s.sheetName,
                    data: s.templateData || [],
                    columns: s.columns || []
                }))
            };
        })()}
        onSave={(template) => {
             // 1. Find or create Output Node
            const outputNode = nodes.find((n) => n.data?.blockType === 'output' || n.type === 'output');
            if (!outputNode) return;

            const currentOutputConfig = (outputNode.data?.output as OutputConfig) || { outputs: [], mode: 'single' };
            
            // Map sheets
            const mappedSheets = template.sheets.map(s => ({
                sheetName: s.name,
                templateData: s.data,
                columns: s.columns
            }));

            // Create new ID
            const newFileId = crypto.randomUUID();

            const newFile: OutputFileConfig = {
                id: newFileId,
                creatorNodeId: selectedNodeId || undefined,
                fileName: template.name,
                sheets: mappedSheets
            };

            const newOutputConfig = {
                ...currentOutputConfig,
                outputs: [...currentOutputConfig.outputs, newFile]
            };

            updateNode(outputNode.id, {
                data: {
                  ...outputNode.data,
                  output: newOutputConfig
                }
            });
            
            // Construct target
            // ID matches what getOutputFileOptions generates: `output-${outputNode.id}-${file.id}-${sheetName}-${sheetIndex}`
            // But getOutputFileOptions is complex.
            // Let's assume the dropdown option value is just `file.id` (String(option.id) in the render loop) if it comes from `getOutputFileOptions`.
            // Wait, previous code map `option.id` to value.
            // Let's re-read line 2377: virtualId: `output:${newFileId}:0`
            
            // In render loop (line 1021): <option value={String(option.id)}>{option.label}</option>
            // getOutputFileOptions returns options where .id is unique.
            // We need to match THAT structure if we want `activeOutputOption` to work.
            // Construct target
            const newTarget: TableTarget = {
                fileId: null,
                sheetName: template.sheets[0]?.name || null,
                batchId: null,
                virtualId: `output:${newFileId}:${template.sheets[0]?.name || 'Sheet 1'}`, 
                virtualName: template.name,
                isFinalOutput: false,
                isFutureSource: false
            };
            
            if (editingDestinationIndex !== null && editingDestinationIndex >= 0 && editingDestinationIndex < destinationTargets.length) {
                // Update existing target
                const nextTargets = [...destinationTargets];
                // Preserve flags
                const existing = nextTargets[editingDestinationIndex];
                nextTargets[editingDestinationIndex] = {
                    ...newTarget,
                    isFinalOutput: existing.isFinalOutput,
                    isFutureSource: existing.isFutureSource,
                    writeMode: existing.writeMode,
                    sourceId: existing.sourceId
                };
                updateDestinationTargets(nextTargets);
            } else {
                // Append new target
                updateDestinationTargets([...destinationTargets, newTarget]);
            }
            
            setIsEditorOpen(false);
            setEditingDestinationIndex(null);
        }}
        onCancel={() => {
            setIsEditorOpen(false);
            setEditingDestinationIndex(null);
        }}
      />
    </div>
  );
};
