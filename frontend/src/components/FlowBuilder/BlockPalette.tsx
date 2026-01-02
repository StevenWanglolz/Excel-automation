import { useCallback, useMemo, useState } from 'react';
import { useFlowStore } from '../../store/flowStore';
import { Node } from '@xyflow/react';

const blockTemplates = [
  // Upload
  { id: 'upload', type: 'upload', label: 'Upload File', category: 'upload', icon: '📤' },

  // Selection & Row Filtering
  { id: 'filter_rows', type: 'transform', label: 'Row Filter', category: 'selection', icon: '🔍' },
  { id: 'sort_rows', type: 'transform', label: 'Sort Rows', category: 'selection', icon: '⬆️' },
  { id: 'remove_duplicates', type: 'transform', label: 'Remove Duplicates', category: 'selection', icon: '🔁' },

  // Column Structure
  { id: 'column_manager', type: 'transform', label: 'Column Manager', category: 'columns', icon: '📊' },

  // Text & Cleanup
  { id: 'text_cleanup', type: 'transform', label: 'Text Cleanup', category: 'text', icon: '🧽' },

  // Calculations & Logic
  { id: 'calculated_column', type: 'transform', label: 'Calculated Column', category: 'math', icon: '🧮' },
  { id: 'type_and_format', type: 'transform', label: 'Type & Format', category: 'math', icon: '🔢' },

  // Split & Merge
  { id: 'split_merge', type: 'transform', label: 'Split / Merge Columns', category: 'split_merge', icon: '🔀' },
  { id: 'reshape_table', type: 'transform', label: 'Reshape (Pivot/Transpose)', category: 'split_merge', icon: '🔄' },

  // Multi-file & Lookup
  { id: 'lookup_map', type: 'transform', label: 'Lookup & Map', category: 'multi_file', icon: '🧩' },
  { id: 'append_files', type: 'transform', label: 'Append Files', category: 'multi_file', icon: '🧵' },

  // Sheet & Output Structure
  { id: 'sheet_manager', type: 'transform', label: 'Sheet Manager', category: 'output', icon: '📑' },

  // Validation & QA
  { id: 'qa_checks', type: 'transform', label: 'QA Checks', category: 'qa', icon: '✅' },

  // Data Entry
  { id: 'data_entry', type: 'transform', label: 'Data Entry', category: 'data_entry', icon: '🧾' },
];

export const BlockPalette = () => {
  const { addNode } = useFlowStore();
  const implementedBlocks = useMemo(() => new Set(['filter_rows']), []);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [devFilter, setDevFilter] = useState<'all' | 'implemented' | 'unimplemented'>('all');

  const onDragStart = useCallback(
    (event: React.DragEvent, blockTemplate: typeof blockTemplates[0]) => {
      event.dataTransfer.setData('application/reactflow', JSON.stringify(blockTemplate));
      event.dataTransfer.effectAllowed = 'move';
    },
    []
  );

  const handleAddBlock = useCallback(
    (template: typeof blockTemplates[0]) => {
      const configDefaults: Record<string, Record<string, unknown>> = {
        filter_rows: {
          column: '',
          operator: 'equals',
          value: '',
        },
      };
      const newNode: Node = {
        id: `${template.type}-${Date.now()}`,
        type: template.type,
        position: { x: Math.random() * 400, y: Math.random() * 400 },
        data: {
          blockType: template.id,
          label: template.label,
          config: configDefaults[template.id] ?? {},
        },
      };
      addNode(newNode);
    },
    [addNode]
  );

  const categories = useMemo(
    () => [
      { id: 'upload', label: 'Upload', icon: '📤' },
      { id: 'selection', label: 'Selection & Rows', icon: '🧲' },
      { id: 'columns', label: 'Column Structure', icon: '📊' },
      { id: 'text', label: 'Text & Cleanup', icon: '🧽' },
      { id: 'math', label: 'Calculations & Logic', icon: '🧮' },
      { id: 'split_merge', label: 'Split & Merge', icon: '🔀' },
      { id: 'multi_file', label: 'Multi-File & Lookup', icon: '🧩' },
      { id: 'output', label: 'Sheet & Output', icon: '📑' },
      { id: 'qa', label: 'Validation & QA', icon: '✅' },
      { id: 'data_entry', label: 'Data Entry', icon: '✍️' },
    ],
    []
  );

  const categoryBlocks = useMemo(() => {
    if (!activeCategoryId) {
      return blockTemplates;
    }
    return blockTemplates.filter((block) => block.category === activeCategoryId);
  }, [activeCategoryId]);

  const filteredBlocks = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const bySearch = term
      ? categoryBlocks.filter((block) => block.label.toLowerCase().includes(term))
      : categoryBlocks;
    if (devFilter === 'implemented') {
      return bySearch.filter((block) => implementedBlocks.has(block.id));
    }
    if (devFilter === 'unimplemented') {
      return bySearch.filter((block) => !implementedBlocks.has(block.id));
    }
    return bySearch;
  }, [categoryBlocks, devFilter, implementedBlocks, searchTerm]);

  const blocksByCategory = useMemo(() => {
    if (activeCategoryId) {
      return [
        {
          id: activeCategoryId,
          label: categories.find((category) => category.id === activeCategoryId)?.label ?? 'Blocks',
          blocks: filteredBlocks,
        },
      ];
    }
    return categories
      .map((category) => ({
        id: category.id,
        label: category.label,
        blocks: filteredBlocks.filter((block) => block.category === category.id),
      }))
      .filter((group) => group.blocks.length > 0);
  }, [activeCategoryId, categories, filteredBlocks]);

  return (
    <div className="w-[420px] bg-white border-r border-gray-200 h-full flex">
      <div className="w-44 border-r border-gray-200 p-4 flex flex-col">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Categories</h2>
        <div className="flex-1 overflow-y-auto space-y-1 pr-1">
          <button
            type="button"
            onClick={() => setActiveCategoryId(null)}
            className={`w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
              activeCategoryId === null
                ? 'bg-indigo-100 text-indigo-800'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            🌈 All Blocks
          </button>
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => setActiveCategoryId(category.id)}
              className={`w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
                activeCategoryId === category.id
                  ? 'bg-indigo-100 text-indigo-800'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <span className="mr-2">{category.icon}</span>
              {category.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 flex flex-col">
        <div className="border-b border-gray-200 px-4 py-3 space-y-3">
          <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
            <span className="text-gray-400">🔎</span>
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search blocks..."
              className="w-full text-sm text-gray-700 outline-none placeholder:text-gray-400"
            />
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-500 font-semibold uppercase tracking-wide">Dev</span>
            <button
              type="button"
              onClick={() => setDevFilter('all')}
              className={`rounded-full px-2.5 py-1 font-semibold transition ${
                devFilter === 'all'
                  ? 'bg-gray-900 text-white'
                  : 'border border-gray-200 text-gray-600 hover:bg-gray-100'
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setDevFilter('implemented')}
              className={`rounded-full px-2.5 py-1 font-semibold transition ${
                devFilter === 'implemented'
                  ? 'bg-emerald-600 text-white'
                  : 'border border-emerald-200 text-emerald-700 hover:bg-emerald-50'
              }`}
            >
              Implemented
            </button>
            <button
              type="button"
              onClick={() => setDevFilter('unimplemented')}
              className={`rounded-full px-2.5 py-1 font-semibold transition ${
                devFilter === 'unimplemented'
                  ? 'bg-amber-500 text-white'
                  : 'border border-amber-200 text-amber-700 hover:bg-amber-50'
              }`}
            >
              Not Yet
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {blocksByCategory.map((group) => (
            <div key={group.id}>
              <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                {group.label}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {group.blocks.map((block) => (
                  <button
                    key={block.id}
                    draggable
                    onDragStart={(e) => onDragStart(e, block)}
                    onClick={() => handleAddBlock(block)}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-0 ${
                      implementedBlocks.has(block.id)
                        ? 'border-emerald-300 bg-emerald-50 hover:bg-emerald-100 hover:border-emerald-500 focus:ring-emerald-400'
                        : 'border-gray-200 bg-white hover:bg-gray-50 hover:border-indigo-500 focus:ring-indigo-500'
                    }`}
                  >
                    {block.icon && <span className="text-base">{block.icon}</span>}
                    <span className="text-gray-900">{block.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
          {blocksByCategory.length === 0 && (
            <div className="text-sm text-gray-500">No blocks match this category.</div>
          )}
          {blocksByCategory.length > 0 && blocksByCategory.every((group) => group.blocks.length === 0) && (
            <div className="text-sm text-gray-500">No blocks match your search.</div>
          )}
        </div>
      </div>
    </div>
  );
};
