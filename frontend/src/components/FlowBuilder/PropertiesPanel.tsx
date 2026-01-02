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
import type { BlockData, File, OutputConfig, OutputFileConfig, OutputSheetMapping, TableTarget } from '../../types';

interface PropertiesPanelProps {
  selectedNodeId: string | null;
  onClose: () => void;
  lastTarget: TableTarget;
  onUpdateLastTarget: (target: TableTarget) => void;
}

// Sentinel for CSV files where sheet selection doesn't apply.
const SINGLE_SHEET_VALUE = '__single__';

const normalizeTarget = (target?: TableTarget): TableTarget => ({
  fileId: target?.fileId ?? null,
  sheetName: target?.sheetName ?? null,
  virtualId: target?.virtualId ?? null,
  virtualName: target?.virtualName ?? null,
});

const toSheetValue = (sheetName: string | null) => sheetName ?? SINGLE_SHEET_VALUE;
const fromSheetValue = (value: string) => (value === SINGLE_SHEET_VALUE ? null : value);

export const PropertiesPanel = ({
  selectedNodeId,
  onClose,
  lastTarget,
  onUpdateLastTarget,
}: PropertiesPanelProps) => {
  const { nodes, updateNode, getFlowData } = useFlowStore();
  const [files, setFiles] = useState<File[]>([]);
  const [sheetsByFileId, setSheetsByFileId] = useState<Record<number, string[]>>({});
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [isLoadingSheets, setIsLoadingSheets] = useState(false);
  const precomputeTimeoutRef = useRef<number | null>(null);
  
  const node = useMemo(() => nodes.find((n) => n.id === selectedNodeId), [nodes, selectedNodeId]);
  
  // Generate unique IDs for form elements based on selectedNodeId
  const formIds = useMemo(() => ({
    sourceType: `source-type-${selectedNodeId}`,
    outputFile: `output-file-${selectedNodeId}`,
    outputSheet: `output-sheet-${selectedNodeId}`,
    sourceOutputFile: `source-output-file-${selectedNodeId}`,
    sourceOutputSheet: `source-output-sheet-${selectedNodeId}`,
    file: `file-${selectedNodeId}`,
    sheet: `sheet-${selectedNodeId}`,
    destinationOutputFile: `destination-output-file-${selectedNodeId}`,
    destinationOutputSheet: `destination-output-sheet-${selectedNodeId}`,
    filterColumn: `filter-column-${selectedNodeId}`,
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
  const target = normalizeTarget(nodeData.target);
  const destination = normalizeTarget(nodeData.destination);
  const isOutputNode = nodeData.blockType === 'output' || nodeType === 'output';
  const outputConfig = useMemo<OutputConfig>(() => {
    const rawOutput = nodeData.output as OutputConfig | { fileName?: string; sheets?: OutputSheetMapping[] } | undefined;
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
  }, [nodeData.output]);

  const sourceNodeFileIds = useMemo(() => {
    const ids = new Set<number>();
    nodes.forEach((n) => {
      if (n.data?.fileIds && Array.isArray(n.data.fileIds)) {
        n.data.fileIds.forEach((id: number) => ids.add(id));
      }
    });
    return ids;
  }, [nodes]);

  const resolvedTargetFile = useMemo(() => {
    if (!target.fileId) {
      return null;
    }
    return files.find((file) => file.id === target.fileId) ?? null;
  }, [files, target.fileId]);

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
  const activeDestinationFileOption = useMemo(() => {
    if (!destination.virtualId) {
      return outputFileOptions[0] ?? null;
    }
    const parsed = parseOutputVirtualId(destination.virtualId);
    if (!parsed?.outputId) {
      return outputFileOptions[0] ?? null;
    }
    return outputFileOptions.find((option) => option.outputId === parsed.outputId) ?? outputFileOptions[0] ?? null;
  }, [destination.virtualId, outputFileOptions, parseOutputVirtualId]);
  const destinationSheetOptions = useMemo(() => {
    if (!activeDestinationFileOption) {
      return [];
    }
    return (activeDestinationFileOption.sheets ?? []).map(
      (sheet, index) => sheet.sheetName || `Sheet ${index + 1}`
    );
  }, [activeDestinationFileOption]);

  const activeSourceOutputFileOption = useMemo(() => {
    if (!target.virtualId) {
      return outputFileOptions[0] ?? null;
    }
    const parsed = parseOutputVirtualId(target.virtualId);
    if (!parsed?.outputId) {
      return outputFileOptions[0] ?? null;
    }
    return outputFileOptions.find((option) => option.outputId === parsed.outputId) ?? outputFileOptions[0] ?? null;
  }, [target.virtualId, outputFileOptions, parseOutputVirtualId]);

  const sourceOutputSheetOptions = useMemo(() => {
    if (!activeSourceOutputFileOption) {
      return [];
    }
    return (activeSourceOutputFileOption.sheets ?? []).map(
      (sheet, index) => sheet.sheetName || `Sheet ${index + 1}`
    );
  }, [activeSourceOutputFileOption]);

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

  const rowOperatorsRequiringValue = new Set([
    'equals',
    'not_equals',
    'contains',
    'not_contains',
    'greater_than',
    'less_than',
  ]);

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
    // Load files once when the panel opens so the target dropdown is ready.
    filesApi.list()
      .then((result) => {
        // Sync the local files list with the files actually referenced in the flow
        const filtered = result.filter((f) => sourceNodeFileIds.has(f.id));
        setFiles(filtered);
      })
      .catch(() => setFiles([]))
      .finally(() => setIsLoadingFiles(false));
  }, [selectedNodeId, sourceNodeFileIds]);

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


  const updateTarget = useCallback((nextTarget: TableTarget) => {
    if (!node) return;
    updateNode(node.id, {
      data: {
        ...nodeData,
        target: nextTarget,
      },
    });
    if (nextTarget.fileId) {
      onUpdateLastTarget(nextTarget);
    }
  }, [node, nodeData, onUpdateLastTarget, updateNode]);

  const updateDestination = useCallback((nextDestination: TableTarget) => {
    if (!node) return;
    updateNode(node.id, {
      data: {
        ...nodeData,
        destination: nextDestination,
      },
    });
  }, [node, nodeData, updateNode]);

  const updateOutputConfig = useCallback((nextConfig: OutputConfig) => {
    if (!node) return;
    updateNode(node.id, {
      data: {
        ...nodeData,
        output: nextConfig,
      },
    });
  }, [node, nodeData, updateNode]);

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
    if (!destination.virtualId && destination.fileId === null && destination.sheetName === null) {
      return;
    }
    if (!outputFileOptions.find((option) => option.outputId === parseOutputVirtualId(destination.virtualId)?.outputId)) {
      updateDestination({ fileId: null, sheetName: null, virtualId: null, virtualName: null });
    }
  }, [destination.fileId, destination.sheetName, destination.virtualId, isOutputNode, outputFileOptions, parseOutputVirtualId, updateDestination]);

  useEffect(() => {
    if (isOutputNode) {
      return;
    }
    if (destination.virtualId || destination.fileId || destination.sheetName) {
      return;
    }
    const firstOutput = outputFileOptions[0];
    if (!firstOutput) {
      return;
    }
    const sheetName = firstOutput.sheets?.[0]?.sheetName || 'Sheet 1';
    updateDestination({
      fileId: null,
      sheetName,
      virtualId: `output:${firstOutput.outputId}:${sheetName}`,
      virtualName: `${firstOutput.label} / ${sheetName}`,
    });
  }, [destination.fileId, destination.sheetName, destination.virtualId, isOutputNode, outputFileOptions, updateDestination]);

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
    <div className="w-80 bg-white border-l border-gray-200 flex flex-col h-full">
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
          {!isOutputNode && nodeType !== 'source' && (
            <>
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Source</h3>
                <div className="space-y-3">
                  <div>
                  <label htmlFor={formIds.sourceType} className="block text-xs font-medium text-gray-500 mb-1">Source type</label>
                  <select
                    id={formIds.sourceType}
                    value={sourceMode}
                    onChange={(event) => {
                      const nextMode = event.target.value;
                      if (nextMode === 'output') {
                        const fileOption = outputFileOptions[0];
                        if (!fileOption) {
                          updateTarget({ fileId: null, sheetName: null, virtualId: null, virtualName: null });
                            return;
                          }
                          const sheetName = fileOption.sheets[0]?.sheetName || 'Sheet 1';
                          updateTarget({
                            fileId: null,
                            sheetName,
                            virtualId: `output:${fileOption.outputId}:${sheetName}`,
                            virtualName: `${fileOption.label} / ${sheetName}`,
                          });
                          return;
                        }
                        const fallback = lastTarget.fileId ? lastTarget : { fileId: null, sheetName: null };
                        updateTarget({
                          fileId: fallback.fileId,
                          sheetName: fallback.sheetName,
                          virtualId: null,
                          virtualName: null,
                        });
                    }}
                    className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
                  >
                    <option value="original">Original file</option>
                    <option value="output">Output sheet</option>
                  </select>
                </div>
                  {sourceMode === 'output' && (
                    <>
                      <div>
                        <label htmlFor={formIds.sourceOutputFile} className="block text-xs font-medium text-gray-500 mb-1">Output file</label>
                        <select
                          id={formIds.sourceOutputFile}
                          value={activeSourceOutputFileOption?.id ?? ''}
                          onChange={(event) => {
                            const fileOption = outputFileOptionById.get(Number(event.target.value));
                            if (!fileOption) {
                              return;
                            }
                            const sheetName = fileOption.sheets?.[0]?.sheetName || 'Sheet 1';
                            updateTarget({
                              fileId: null,
                              sheetName,
                              virtualId: `output:${fileOption.outputId}:${sheetName}`,
                              virtualName: `${fileOption.label} / ${sheetName}`,
                            });
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
                        <label htmlFor={formIds.sourceOutputSheet} className="block text-xs font-medium text-gray-500 mb-1">Output sheet</label>
                        <select
                          id={formIds.sourceOutputSheet}
                          value={target.sheetName ?? ''}
                          onChange={(event) => {
                            if (!activeSourceOutputFileOption) {
                              return;
                            }
                            const sheetName = event.target.value;
                            updateTarget({
                              fileId: null,
                              sheetName,
                              virtualId: `output:${activeSourceOutputFileOption.outputId}:${sheetName}`,
                              virtualName: `${activeSourceOutputFileOption.label} / ${sheetName}`,
                            });
                          }}
                          className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
                          disabled={sourceOutputSheetOptions.length === 0}
                        >
                          {sourceOutputSheetOptions.length === 0 ? (
                            <option value="">No output sheets</option>
                          ) : (
                            sourceOutputSheetOptions.map((sheetName) => (
                              <option key={sheetName} value={sheetName}>
                                {sheetName}
                              </option>
                            ))
                          )}
                        </select>
                      </div>
                    </>
                  )}
                  {sourceMode === 'original' && (
                    <>
                      <div>
                        <label htmlFor={formIds.file} className="block text-xs font-medium text-gray-500 mb-1">File</label>
                        <select
                          id={formIds.file}
                          value={target.fileId ? String(target.fileId) : ''}
                          onChange={(event) => {
                            const nextFileId = event.target.value ? Number(event.target.value) : null;
                            updateTarget({ fileId: nextFileId, sheetName: null });
                          }}
                          className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
                          disabled={isLoadingFiles}
                        >
                          <option value="">{isLoadingFiles ? 'Loading files...' : 'Select a file'}</option>
                          {files.map((file) => (
                            <option key={file.id} value={String(file.id)}>
                              {file.original_filename}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label htmlFor={formIds.sheet} className="block text-xs font-medium text-gray-500 mb-1">Sheet</label>
                        <select
                          id={formIds.sheet}
                          value={toSheetValue(target.sheetName)}
                          onChange={(event) => {
                            updateTarget({
                              fileId: target.fileId,
                              sheetName: fromSheetValue(event.target.value),
                            });
                          }}
                          className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
                          disabled={!target.fileId || isLoadingSheets}
                        >
                          {!hasSheetList && (
                            <option value={SINGLE_SHEET_VALUE}>
                              {isLoadingSheets ? 'Loading sheets...' : 'CSV (single sheet)'}
                            </option>
                          )}
                          {sheetOptions
                            .filter((sheet) => sheet !== SINGLE_SHEET_VALUE)
                            .map((sheet) => (
                              <option key={sheet} value={sheet}>
                                {sheet}
                              </option>
                            ))}
                        </select>
                      </div>
                    </>
                  )}
                </div>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Destination</h3>
                {outputFileOptions.length === 0 ? (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    Add output files in the Output block to set a destination.
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label htmlFor={formIds.destinationOutputFile} className="block text-xs font-medium text-gray-500 mb-1">Output file</label>
                      <select
                        id={formIds.destinationOutputFile}
                        value={activeDestinationFileOption?.id ?? ''}
                        onChange={(event) => {
                          const fileOption = outputFileOptionById.get(Number(event.target.value));
                          if (!fileOption) {
                            return;
                          }
                          const sheetName = fileOption.sheets?.[0]?.sheetName || 'Sheet 1';
                          updateDestination({
                            fileId: null,
                            sheetName,
                            virtualId: `output:${fileOption.outputId}:${sheetName}`,
                            virtualName: `${fileOption.label} / ${sheetName}`,
                          });
                        }}
                        className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
                      >
                        {outputFileOptions.map((option) => (
                          <option key={option.outputId} value={String(option.id)}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor={formIds.destinationOutputSheet} className="block text-xs font-medium text-gray-500 mb-1">Output sheet</label>
                      <select
                        id={formIds.destinationOutputSheet}
                        value={destination.sheetName ?? ''}
                        onChange={(event) => {
                          if (!activeDestinationFileOption) {
                            return;
                          }
                          const sheetName = event.target.value;
                          updateDestination({
                            fileId: null,
                            sheetName,
                            virtualId: `output:${activeDestinationFileOption.outputId}:${sheetName}`,
                            virtualName: `${activeDestinationFileOption.label} / ${sheetName}`,
                          });
                        }}
                        className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
                      >
                        {destinationSheetOptions.map((sheetName) => (
                          <option key={sheetName} value={sheetName}>
                            {sheetName}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {nodeData.blockType === 'filter_rows' && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-900 border-b pb-2">Filter Rows</h3>
              <div className="space-y-4">
                <div>
                  <label htmlFor={formIds.filterColumn} className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wider">
                    Column to filter
                  </label>
                  <select
                    id={formIds.filterColumn}
                    value={nodeData.config?.column || ''}
                    onChange={(event) => {
                      updateNode(node.id, {
                        data: {
                          ...nodeData,
                          config: { ...nodeData.config, column: event.target.value },
                        },
                      });
                    }}
                    className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition"
                    disabled={isLoadingColumns}
                  >
                    <option value="">Select a column</option>
                    {columns.map((col) => (
                      <option key={col} value={col}>
                        {col}
                      </option>
                    ))}
                  </select>
                  {isLoadingColumns && (
                    <div className="mt-1 text-[10px] text-gray-400 animate-pulse">
                      Refetching columns...
                    </div>
                  )}
                  {columns.length === 0 && !isLoadingColumns && target.fileId && (
                    <div className="mt-1 text-[10px] text-amber-600">
                      No columns found for this target.
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wider">
                    Operator
                  </label>
                  <div className="grid grid-cols-1 gap-2">
                    <select
                      value={nodeData.config?.operator || 'equals'}
                      onChange={(event) => {
                        updateNode(node.id, {
                          data: {
                            ...nodeData,
                            config: { ...nodeData.config, operator: event.target.value },
                          },
                        });
                      }}
                      className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition"
                    >
                      <optgroup label="Text">
                        <option value="equals">is exactly</option>
                        <option value="not_equals">is not</option>
                        <option value="contains">contains</option>
                        <option value="not_contains">does not contain</option>
                      </optgroup>
                      <optgroup label="Numbers">
                        <option value="greater_than">is greater than</option>
                        <option value="less_than">is less than</option>
                      </optgroup>
                      <optgroup label="Empty Values">
                        <option value="is_blank">is blank</option>
                        <option value="is_not_blank">is not blank</option>
                      </optgroup>
                    </select>
                  </div>
                </div>

                {!(nodeData.config?.operator === 'is_blank' || nodeData.config?.operator === 'is_not_blank') && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wider">
                      Comparison Value
                    </label>
                    <input
                      type="text"
                      value={nodeData.config?.value || ''}
                      onChange={(event) => {
                        updateNode(node.id, {
                          data: {
                            ...nodeData,
                            config: { ...nodeData.config, value: event.target.value },
                          },
                        });
                      }}
                      className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition"
                      placeholder="e.g. 100, pending, etc."
                    />
                  </div>
                )}
              </div>
              
              <div className="pt-4 mt-4 border-t border-gray-100">
                 <div className="rounded-lg bg-indigo-50 p-3 text-[11px] text-indigo-700 flex items-start gap-2">
                    <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>
                      The filter will be applied to the <strong>{target.sheetName || 'default sheet'}</strong> of{' '}
                      <strong>{resolvedTargetFile?.original_filename || 'the selected file'}</strong>.
                    </span>
                 </div>
              </div>
            </div>
          )}

          {nodeData.blockType === 'remove_columns_rows' && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-900 border-b pb-2">
                Remove Columns / Rows
              </h3>

              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                Preview uses the last saved configuration.
              </div>

              <div>
                <label htmlFor={formIds.removeMode} className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wider">
                  Mode
                </label>
                <div className="grid grid-cols-2 gap-2" role="group" aria-labelledby={formIds.removeMode}>
                  {['columns', 'rows'].map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => updateRemoveDraft({ ...removeConfig, mode })}
                      className={`rounded-md px-3 py-2 text-sm font-medium ${
                        removeMode === mode
                          ? 'bg-indigo-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {mode === 'columns' ? 'Columns' : 'Rows'}
                    </button>
                  ))}
                </div>
              </div>

              {removeMode === 'columns' && (
                <div className="space-y-4">
                  <div>
                    <label htmlFor={formIds.removeColumnsManual} className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wider">
                      Select Columns (manual)
                    </label>
                    <div id={formIds.removeColumnsManual} className="max-h-40 overflow-y-auto rounded-md border border-gray-200 bg-white p-2 space-y-1" role="group">
                      {columns.length === 0 && (
                        <div className="text-xs text-gray-400">Select a file to load columns.</div>
                      )}
                      {columns.map((col) => {
                        const selected = (columnSelection.names || []).includes(col);
                        const checkboxId = `${formIds.removeColumnsManual}-${col}`;
                        return (
                          <label key={col} htmlFor={checkboxId} className="flex items-center gap-2 text-sm text-gray-700">
                            <input
                              id={checkboxId}
                              type="checkbox"
                              checked={selected}
                              onChange={() => {
                                const nextNames = selected
                                  ? (columnSelection.names || []).filter((name: string) => name !== col)
                                  : [...(columnSelection.names || []), col];
                                updateRemoveDraft({
                                  ...removeConfig,
                                  columnSelection: { ...columnSelection, names: nextNames },
                                });
                              }}
                            />
                            <span className="truncate">{col}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label htmlFor={formIds.removeColumnsIndices} className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wider">
                      Select by Index (0-based, comma separated)
                    </label>
                    <input
                      id={formIds.removeColumnsIndices}
                      type="text"
                      value={(columnSelection.indices || []).join(', ')}
                      onChange={(event) => {
                        updateRemoveDraft({
                          ...removeConfig,
                          columnSelection: {
                            ...columnSelection,
                            indices: parseNumberList(event.target.value),
                          },
                        });
                      }}
                      className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
                      placeholder="e.g. 0, 2, 5"
                    />
                  </div>

                  <div className="space-y-2">
                    <label htmlFor={formIds.removeColumnsMatch} className="block text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Select by Name Rule
                    </label>
                    <div className="grid grid-cols-1 gap-2">
                      <select
                      id={formIds.removeColumnsMatch}
                      value={columnSelection.match?.operator || 'contains'}
                      onChange={(event) => {
                        updateRemoveDraft({
                          ...removeConfig,
                          columnSelection: {
                            ...columnSelection,
                            match: { ...columnSelection.match, operator: event.target.value },
                          },
                          });
                        }}
                        className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
                      >
                        <option value="contains">contains</option>
                        <option value="starts_with">starts with</option>
                        <option value="ends_with">ends with</option>
                        <option value="equals">is exactly</option>
                        <option value="regex">matches regex</option>
                      </select>
                      <input
                        id={formIds.removeColumnsValue}
                        type="text"
                      value={columnSelection.match?.value || ''}
                      onChange={(event) => {
                        updateRemoveDraft({
                          ...removeConfig,
                          columnSelection: {
                            ...columnSelection,
                            match: { ...columnSelection.match, value: event.target.value },
                          },
                          });
                        }}
                        className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
                        placeholder="e.g. temp_, ^Q\\d+"
                      />
                      <label htmlFor={formIds.removeColumnsCaseSensitive} className="flex items-center gap-2 text-xs text-gray-600">
                        <input
                          id={formIds.removeColumnsCaseSensitive}
                          type="checkbox"
                          checked={Boolean(columnSelection.match?.caseSensitive)}
                          onChange={(event) => {
                            updateRemoveDraft({
                              ...removeConfig,
                              columnSelection: {
                                ...columnSelection,
                                match: { ...columnSelection.match, caseSensitive: event.target.checked },
                              },
                            });
                          }}
                        />
                        Case sensitive
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {removeMode === 'rows' && (
                <div className="space-y-4">
                  <div>
                    <label htmlFor={formIds.removeRowsIndices} className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wider">
                      Select Rows by Index (0-based, comma separated)
                    </label>
                    <input
                      id={formIds.removeRowsIndices}
                      type="text"
                      value={(rowSelection.indices || []).join(', ')}
                      onChange={(event) => {
                        updateRemoveDraft({
                          ...removeConfig,
                          rowSelection: {
                            ...rowSelection,
                            indices: parseNumberList(event.target.value),
                          },
                        });
                      }}
                      className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
                      placeholder="e.g. 0, 4, 10"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label htmlFor={formIds.removeRowsRangeStart} className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wider">
                        Range Start
                      </label>
                      <input
                        id={formIds.removeRowsRangeStart}
                        type="number"
                      value={rowSelection.range?.start ?? ''}
                      onChange={(event) => {
                        const value = event.target.value === '' ? null : Number(event.target.value);
                        updateRemoveDraft({
                          ...removeConfig,
                          rowSelection: {
                            ...rowSelection,
                            range: { ...rowSelection.range, start: value },
                            },
                          });
                        }}
                        className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
                        placeholder="0"
                        min={0}
                      />
                    </div>
                    <div>
                      <label htmlFor={formIds.removeRowsRangeEnd} className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wider">
                        Range End
                      </label>
                      <input
                        id={formIds.removeRowsRangeEnd}
                        type="number"
                      value={rowSelection.range?.end ?? ''}
                      onChange={(event) => {
                        const value = event.target.value === '' ? null : Number(event.target.value);
                        updateRemoveDraft({
                          ...removeConfig,
                          rowSelection: {
                            ...rowSelection,
                            range: { ...rowSelection.range, end: value },
                            },
                          });
                        }}
                        className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
                        placeholder="10"
                        min={0}
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor={formIds.removeRowsMatch} className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wider">
                      Remove rows matching
                    </label>
                    <select
                      id={formIds.removeRowsMatch}
                      value={rowSelection.match || 'any'}
                      onChange={(event) => {
                        updateRemoveDraft({
                          ...removeConfig,
                          rowSelection: { ...rowSelection, match: event.target.value },
                        });
                      }}
                      className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
                    >
                      <option value="any">Any rule</option>
                      <option value="all">All rules</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Rules
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          const nextRules = [...(rowSelection.rules || []), { column: '', operator: 'equals', value: '' }];
                          updateRemoveDraft({
                            ...removeConfig,
                            rowSelection: { ...rowSelection, rules: nextRules },
                          });
                        }}
                        className="text-xs text-indigo-600 hover:text-indigo-700"
                      >
                        + Add rule
                      </button>
                    </div>

                    {(rowSelection.rules || []).length === 0 && (
                      <div className="text-xs text-gray-400">No rules added yet.</div>
                    )}

                    {(rowSelection.rules || []).map((rule: any, index: number) => {
                      // Use index as key since rules don't have stable IDs
                      // This is acceptable here as rules are added/removed by index
                      return (
                      <div key={`remove-rule-${index}`} className="space-y-2 rounded-md border border-gray-200 p-2">
                        <div className="flex items-center justify-between">
                          <div className="text-xs font-semibold text-gray-600">Rule {index + 1}</div>
                          <button
                            type="button"
                          onClick={() => {
                            const nextRules = (rowSelection.rules || []).filter((_: any, i: number) => i !== index);
                            updateRemoveDraft({
                              ...removeConfig,
                              rowSelection: { ...rowSelection, rules: nextRules },
                            });
                          }}
                            className="text-xs text-red-500 hover:text-red-600"
                          >
                            Remove
                          </button>
                        </div>
                        <label htmlFor={formIds.removeRowsRuleColumn(index)} className="block text-xs font-medium text-gray-500 mb-1">Column</label>
                        <select
                          id={formIds.removeRowsRuleColumn(index)}
                          value={rule.column || ''}
                          onChange={(event) => {
                            const nextRules = [...(rowSelection.rules || [])];
                            nextRules[index] = { ...rule, column: event.target.value };
                            updateRemoveDraft({
                              ...removeConfig,
                              rowSelection: { ...rowSelection, rules: nextRules },
                            });
                          }}
                          className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
                          disabled={isLoadingColumns}
                        >
                          <option value="">Select column</option>
                          {columns.map((col) => (
                            <option key={col} value={col}>
                              {col}
                            </option>
                          ))}
                        </select>
                        <label htmlFor={formIds.removeRowsRuleOperator(index)} className="block text-xs font-medium text-gray-500 mb-1">Operator</label>
                        <select
                          id={formIds.removeRowsRuleOperator(index)}
                          value={rule.operator || 'equals'}
                          onChange={(event) => {
                            const nextRules = [...(rowSelection.rules || [])];
                            nextRules[index] = { ...rule, operator: event.target.value };
                            updateRemoveDraft({
                              ...removeConfig,
                              rowSelection: { ...rowSelection, rules: nextRules },
                            });
                          }}
                          className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
                        >
                          <optgroup label="Text">
                            <option value="equals">is exactly</option>
                            <option value="not_equals">is not</option>
                            <option value="contains">contains</option>
                            <option value="not_contains">does not contain</option>
                          </optgroup>
                          <optgroup label="Numbers">
                            <option value="greater_than">is greater than</option>
                            <option value="less_than">is less than</option>
                          </optgroup>
                          <optgroup label="Empty Values">
                            <option value="is_blank">is blank</option>
                            <option value="is_not_blank">is not blank</option>
                          </optgroup>
                        </select>
                        <label htmlFor={formIds.removeRowsRuleValue(index)} className="block text-xs font-medium text-gray-500 mb-1">Value</label>
                        <input
                          id={formIds.removeRowsRuleValue(index)}
                          type="text"
                          value={rule.value ?? ''}
                          onChange={(event) => {
                            const nextRules = [...(rowSelection.rules || [])];
                            nextRules[index] = { ...rule, value: event.target.value };
                            updateRemoveDraft({
                              ...removeConfig,
                              rowSelection: { ...rowSelection, rules: nextRules },
                            });
                          }}
                          className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
                          placeholder="Value"
                          disabled={!rowOperatorsRequiringValue.has(rule.operator)}
                        />
                      </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {isOutputNode && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Output</h3>
              <div className="space-y-4">
                <div className="space-y-3">
                  {outputConfig.outputs.length === 0 && (
                    <div className="rounded-md border border-dashed border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                      No output files yet. Add a file to enable export and destination selection.
                    </div>
                  )}
                  {outputConfig.outputs.map((outputFile, fileIndex) => (
                    <div key={outputFile.id} className="rounded-md border border-gray-200 p-3">
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-medium text-gray-500">File {fileIndex + 1}</div>
                        <button
                          type="button"
                          onClick={() => removeOutputFile(fileIndex)}
                          className="text-xs text-red-600 hover:text-red-700"
                        >
                          Remove file
                        </button>
                      </div>
                      <div className="mt-3 space-y-3">
                        <div>
                          <label htmlFor={formIds.outputFileName(fileIndex)} className="block text-xs font-medium text-gray-500 mb-1">Output file name</label>
                          <input
                            id={formIds.outputFileName(fileIndex)}
                            value={outputFile.fileName}
                            onChange={handleOutputFileNameChange(fileIndex)}
                            className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
                            placeholder="output.xlsx"
                          />
                        </div>
                        <div className="space-y-2">
                          {(outputFile.sheets ?? []).map((sheet, sheetIndex) => (
                            <div key={`${outputFile.id}-${sheetIndex}`} className="rounded-md border border-gray-100 p-2">
                              <div className="flex items-center justify-between">
                                <div className="text-xs font-medium text-gray-500">Sheet {sheetIndex + 1}</div>
                                {outputFile.sheets.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => removeOutputSheet(fileIndex, sheetIndex)}
                                    className="text-xs text-red-600 hover:text-red-700"
                                  >
                                    Remove
                                  </button>
                                )}
                              </div>
                              <div className="mt-2">
                                <label htmlFor={formIds.outputSheetName(fileIndex, sheetIndex)} className="block text-xs font-medium text-gray-500 mb-1">Sheet name</label>
                                <input
                                  id={formIds.outputSheetName(fileIndex, sheetIndex)}
                                  value={sheet.sheetName}
                                  onChange={handleOutputSheetNameChange(fileIndex, sheetIndex)}
                                  className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
                                />
                              </div>
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={() => addOutputSheet(fileIndex)}
                            className="w-full rounded-md border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-600 hover:border-indigo-300 hover:text-indigo-600"
                          >
                            Add output sheet
                          </button>
                        </div>
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
            </div>
          )}

          {nodeType === 'source' && (
            <div className="mt-2">
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Files</h3>
              {nodeData.fileIds && Array.isArray(nodeData.fileIds) && nodeData.fileIds.length > 0 ? (
                <div className="text-sm text-gray-600">
                  {nodeData.fileIds.length} file(s) attached
                </div>
              ) : (
                <div className="text-sm text-gray-400">No files attached</div>
              )}
            </div>
          )}
        </div>
      </div>

      {nodeData.blockType === 'remove_columns_rows' && (
        <div className="border-t border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <div className="text-xs text-gray-500">
              {isRemoveDirty ? 'Unsaved changes' : 'All changes saved'}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setRemoveDraftConfig(nodeData.config || {});
                  setIsRemoveDirty(false);
                }}
                className="rounded-md border border-gray-200 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={() => {
                  updateRemoveConfig(removeDraftConfig);
                  setIsRemoveDirty(false);
                  triggerPrecompute();
                }}
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                disabled={!isRemoveDirty}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
