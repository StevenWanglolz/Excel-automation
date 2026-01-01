/**
 * Responsible for:
 * - Editing per-step targets (file + sheet) and output sheet mappings.
 * - Surfacing file/sheet metadata needed to configure the pipeline.
 *
 * Key assumptions:
 * - Targets are stored on the node data and default from the last selection.
 * - Output blocks map existing tables into export sheets.
 *
 * Be careful:
 * - Loading sheets is async; avoid wiping user selections when lists refresh.
 */
import { useEffect, useMemo, useState } from 'react';
import { filesApi } from '../../api/files';
import { useFlowStore } from '../../store/flowStore';
import type { BlockData, File, OutputConfig, OutputSheetMapping, TableTarget } from '../../types';

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
});

const toSheetValue = (sheetName: string | null) => sheetName ?? SINGLE_SHEET_VALUE;
const fromSheetValue = (value: string) => (value === SINGLE_SHEET_VALUE ? null : value);

export const PropertiesPanel = ({
  selectedNodeId,
  onClose,
  lastTarget,
  onUpdateLastTarget,
}: PropertiesPanelProps) => {
  const { nodes, updateNode } = useFlowStore();
  const [files, setFiles] = useState<File[]>([]);
  const [sheetsByFileId, setSheetsByFileId] = useState<Record<number, string[]>>({});
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [isLoadingSheets, setIsLoadingSheets] = useState(false);
  
  const node = useMemo(() => nodes.find((n) => n.id === selectedNodeId), [nodes, selectedNodeId]);
  
  const nodeType = node?.type || '';
  const nodeData = (node?.data || {}) as unknown as BlockData;
  const target = normalizeTarget(nodeData.target);
  const isOutputNode = nodeData.blockType === 'output' || nodeType === 'output';
  const outputConfig = (nodeData.output as OutputConfig | undefined) ?? {
    fileName: 'output.xlsx',
    sheets: [],
  };

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

  const removeConfig = (removeDraftConfig || {}) as Record<string, any>;
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
    .map((part) => Number(part))
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
    setRemoveDraftConfig((nodeData.config || {}) as Record<string, any>);
    setIsRemoveDirty(false);
  }, [node?.id, nodeData.blockType, nodeData.config]);

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
    if (!isOutputNode) {
      return;
    }
    const sourceFileIds = outputConfig.sheets
      .map((sheet) => sheet.source?.fileId)
      .filter((fileId): fileId is number => typeof fileId === 'number');
    sourceFileIds.forEach((fileId) => {
      if (sheetsByFileId[fileId]) {
        return;
      }
      // Output mappings may reference different files, so hydrate their sheet lists.
      filesApi.sheets(fileId)
        .then((sheets) => {
          setSheetsByFileId((prev) => ({ ...prev, [fileId]: sheets }));
        })
        .catch(() => {
          setSheetsByFileId((prev) => ({ ...prev, [fileId]: [] }));
        });
    });
  }, [isOutputNode, outputConfig.sheets, sheetsByFileId]);

  const updateTarget = (nextTarget: TableTarget) => {
    if (!node) return;
    updateNode(node.id, {
      data: {
        ...nodeData,
        target: nextTarget,
      },
    });
    onUpdateLastTarget(nextTarget);
  };

  const updateOutputConfig = (nextConfig: OutputConfig) => {
    if (!node) return;
    updateNode(node.id, {
      data: {
        ...nodeData,
        output: nextConfig,
      },
    });
  };

  const addOutputSheet = () => {
    const nextSheets = [
      ...outputConfig.sheets,
      {
        sheetName: `Sheet ${outputConfig.sheets.length + 1}`,
        source: normalizeTarget(lastTarget),
      },
    ];
    updateOutputConfig({ ...outputConfig, sheets: nextSheets });
  };

  const updateOutputSheet = (index: number, updater: (sheet: OutputSheetMapping) => OutputSheetMapping) => {
    const nextSheets = outputConfig.sheets.map((sheet, sheetIndex) =>
      sheetIndex === index ? updater(sheet) : sheet
    );
    updateOutputConfig({ ...outputConfig, sheets: nextSheets });
  };

  const removeOutputSheet = (index: number) => {
    const nextSheets = outputConfig.sheets.filter((_, sheetIndex) => sheetIndex !== index);
    updateOutputConfig({ ...outputConfig, sheets: nextSheets });
  };

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
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Target Table</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">File</label>
                  <select
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
                  <label className="block text-xs font-medium text-gray-500 mb-1">Sheet</label>
                  <select
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
              </div>
            </div>
          )}

          {nodeData.blockType === 'filter_rows' && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-900 border-b pb-2">Filter Rows</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wider">
                    Column to filter
                  </label>
                  <select
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
                      The filter will be applied to the <strong>{target.sheetName || 'default sheet'}</strong> of 
                      <strong> {resolvedTargetFile?.original_filename || 'the selected file'}</strong>.
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

              <div className="flex items-center justify-between">
                <div className="text-xs text-gray-500">
                  {isRemoveDirty ? 'Unsaved changes' : 'All changes saved'}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setRemoveDraftConfig((nodeData.config || {}) as Record<string, any>);
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
                    }}
                    className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                    disabled={!isRemoveDirty}
                  >
                    Save
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wider">
                  Mode
                </label>
                <div className="grid grid-cols-2 gap-2">
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
                    <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wider">
                      Select Columns (manual)
                    </label>
                    <div className="max-h-40 overflow-y-auto rounded-md border border-gray-200 bg-white p-2 space-y-1">
                      {columns.length === 0 && (
                        <div className="text-xs text-gray-400">Select a file to load columns.</div>
                      )}
                      {columns.map((col) => {
                        const selected = (columnSelection.names || []).includes(col);
                        return (
                          <label key={col} className="flex items-center gap-2 text-sm text-gray-700">
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={(event) => {
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
                    <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wider">
                      Select by Index (0-based, comma separated)
                    </label>
                    <input
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
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Select by Name Rule
                    </label>
                    <div className="grid grid-cols-1 gap-2">
                      <select
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
                      <label className="flex items-center gap-2 text-xs text-gray-600">
                        <input
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
                    <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wider">
                      Select Rows by Index (0-based, comma separated)
                    </label>
                    <input
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
                      <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wider">
                        Range Start
                      </label>
                      <input
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
                      <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wider">
                        Range End
                      </label>
                      <input
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
                    <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wider">
                      Remove rows matching
                    </label>
                    <select
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

                    {(rowSelection.rules || []).map((rule: any, index: number) => (
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
                        <select
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
                            <option key={`${col}-${index}`} value={col}>
                              {col}
                            </option>
                          ))}
                        </select>
                        <select
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
                        <input
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
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {isOutputNode && (
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Output</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Output file name</label>
                  <input
                    value={outputConfig.fileName}
                    onChange={(event) => updateOutputConfig({ ...outputConfig, fileName: event.target.value })}
                    className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
                    placeholder="output.xlsx"
                  />
                </div>
                <div className="space-y-3">
                  {outputConfig.sheets.map((sheet, index) => (
                    <div key={`${sheet.sheetName}-${index}`} className="rounded-md border border-gray-200 p-3">
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-medium text-gray-500">Sheet {index + 1}</div>
                        <button
                          type="button"
                          onClick={() => removeOutputSheet(index)}
                          className="text-xs text-red-600 hover:text-red-700"
                        >
                          Remove
                        </button>
                      </div>
                      <div className="mt-3 space-y-2">
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Output sheet name</label>
                          <input
                            value={sheet.sheetName}
                            onChange={(event) =>
                              updateOutputSheet(index, (current) => ({
                                ...current,
                                sheetName: event.target.value,
                              }))
                            }
                            className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Source file</label>
                          <select
                            value={sheet.source.fileId ? String(sheet.source.fileId) : ''}
                            onChange={(event) => {
                              const nextFileId = event.target.value ? Number(event.target.value) : null;
                              updateOutputSheet(index, (current) => ({
                                ...current,
                                source: { fileId: nextFileId, sheetName: null },
                              }));
                            }}
                            className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
                          >
                            <option value="">Select a file</option>
                            {files.map((file) => (
                              <option key={file.id} value={String(file.id)}>
                                {file.original_filename}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Source sheet</label>
                          <select
                            value={toSheetValue(sheet.source.sheetName)}
                            onChange={(event) =>
                              updateOutputSheet(index, (current) => ({
                                ...current,
                                source: {
                                  ...current.source,
                                  sheetName: fromSheetValue(event.target.value),
                                },
                              }))
                            }
                            className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
                            disabled={!sheet.source.fileId}
                          >
                            {(() => {
                              const sourceSheets = sheet.source.fileId
                                ? sheetsByFileId[sheet.source.fileId] ?? []
                                : [];
                              if (sourceSheets.length === 0) {
                                return (
                                  <option value={SINGLE_SHEET_VALUE}>
                                    CSV (single sheet)
                                  </option>
                                );
                              }
                              return sourceSheets.map((sheetName) => (
                                <option key={sheetName} value={sheetName}>
                                  {sheetName}
                                </option>
                              ));
                            })()}
                          </select>
                        </div>
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addOutputSheet}
                    className="w-full rounded-md border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-600 hover:border-indigo-300 hover:text-indigo-600"
                  >
                    Add output sheet
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
    </div>
  );
};
