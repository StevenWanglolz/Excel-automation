import { useMemo, useState } from 'react';

interface Operation {
  id: string;
  label: string;
  type: string;
  category?: string;
  icon?: string;
}

interface OperationSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (operation: Operation) => void;
}

const OPERATIONS: Operation[] = [
  // Selection & Row Filtering
  { id: 'row-filter', label: 'Row Filter', type: 'transform', category: 'Selection & Rows', icon: '🔍' },
  { id: 'sort-rows', label: 'Sort Rows', type: 'transform', category: 'Selection & Rows', icon: '⬆️' },
  { id: 'remove-duplicates', label: 'Remove Duplicates', type: 'transform', category: 'Selection & Rows', icon: '🔁' },

  // Column Structure
  { id: 'column-manager', label: 'Column Manager', type: 'transform', category: 'Column Structure', icon: '📊' },

  // Text & Cleanup
  { id: 'text-cleanup', label: 'Text Cleanup', type: 'transform', category: 'Text & Cleanup', icon: '🧽' },

  // Calculations & Logic
  { id: 'calculated-column', label: 'Calculated Column', type: 'transform', category: 'Calculations & Logic', icon: '🧮' },
  { id: 'type-format', label: 'Type & Format', type: 'transform', category: 'Calculations & Logic', icon: '🔢' },

  // Split & Merge
  { id: 'split-merge', label: 'Split / Merge Columns', type: 'transform', category: 'Split & Merge', icon: '🔀' },
  { id: 'reshape-table', label: 'Reshape (Pivot/Transpose)', type: 'transform', category: 'Split & Merge', icon: '🔄' },

  // Multi-file & Lookup
  { id: 'lookup-map', label: 'Lookup & Map', type: 'transform', category: 'Multi-File & Lookup', icon: '🧩' },
  { id: 'append-files', label: 'Append Files', type: 'transform', category: 'Multi-File & Lookup', icon: '🧵' },

  // Sheet & Output Structure
  { id: 'sheet-manager', label: 'Sheet Manager', type: 'transform', category: 'Sheet & Output', icon: '📑' },

  // Validation & QA
  { id: 'qa-checks', label: 'QA Checks', type: 'transform', category: 'Validation & QA', icon: '✅' },

  // Data Entry
  { id: 'data-entry', label: 'Data Entry', type: 'transform', category: 'Data Entry', icon: '🧾' },

  // Output
  { id: 'output', label: 'Output', type: 'output', category: 'Output', icon: '📦' },
];

export const OperationSelectionModal = ({ isOpen, onClose, onSelect }: OperationSelectionModalProps) => {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const implementedOperations = useMemo(
    () => new Set(['row-filter', 'remove-columns-rows', 'remove_columns_rows']),
    []
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [devFilter, setDevFilter] = useState<'all' | 'implemented' | 'unimplemented'>('all');

  const categories = useMemo(
    () => [
      { id: 'Selection & Rows', icon: '🧲' },
      { id: 'Column Structure', icon: '📊' },
      { id: 'Text & Cleanup', icon: '🧽' },
      { id: 'Calculations & Logic', icon: '🧮' },
      { id: 'Split & Merge', icon: '🔀' },
      { id: 'Multi-File & Lookup', icon: '🧩' },
      { id: 'Sheet & Output', icon: '📑' },
      { id: 'Validation & QA', icon: '✅' },
      { id: 'Data Entry', icon: '✍️' },
      { id: 'Output', icon: '📦' },
    ],
    []
  );

  const filteredOperations = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const bySearch = term
      ? OPERATIONS.filter((operation) => operation.label.toLowerCase().includes(term))
      : OPERATIONS;
    if (devFilter === 'implemented') {
      return bySearch.filter((operation) => implementedOperations.has(operation.id));
    }
    if (devFilter === 'unimplemented') {
      return bySearch.filter((operation) => !implementedOperations.has(operation.id));
    }
    return bySearch;
  }, [devFilter, implementedOperations, searchTerm]);

  const groupedOperations = useMemo(() => {
    if (selectedCategory) {
      return [
        {
          id: selectedCategory,
          operations: filteredOperations.filter((op) => op.category === selectedCategory),
        },
      ];
    }
    return categories
      .map((category) => ({
        id: category.id,
        operations: filteredOperations.filter((op) => op.category === category.id),
      }))
      .filter((group) => group.operations.length > 0);
  }, [categories, filteredOperations, selectedCategory]);

  if (!isOpen) return null;

  const handleSelect = (operation: Operation) => {
    onSelect(operation);
    onClose();
  };

  return (
    <>
      {/* Overlay */}
      <button
        type="button"
        className="fixed inset-0 bg-black bg-opacity-50 z-50 border-0 p-0 cursor-pointer"
        onClick={onClose}
        aria-label="Close modal"
      />
      
      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
        <dialog
          open
          className="bg-white rounded-lg shadow-xl w-[1181px] h-[601px] pointer-events-auto relative border-0 p-0 m-0"
          onClick={(e) => e.stopPropagation()}
          onCancel={onClose}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Select Operation</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              title="Close"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="flex h-[calc(100%-73px)]">
            <div className="w-56 border-r border-gray-200 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
                Categories
              </div>
              <div className="flex flex-col gap-1 overflow-y-auto pr-1 h-full">
                <button
                  onClick={() => setSelectedCategory(null)}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
                    selectedCategory === null
                      ? 'bg-indigo-100 text-indigo-800'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  🌈 All Operations
                </button>
                {categories.map((category) => (
                  <button
                    key={category.id}
                    onClick={() => setSelectedCategory(category.id)}
                    className={`w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
                      selectedCategory === category.id
                        ? 'bg-indigo-100 text-indigo-800'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <span className="mr-2">{category.icon}</span>
                    {category.id}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 flex flex-col">
              <div className="border-b border-gray-200 px-6 py-3 space-y-3">
                <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2">
                  <span className="text-gray-400">🔎</span>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Search operations..."
                    className="w-full text-sm text-gray-700 outline-none placeholder:text-gray-400"
                  />
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-gray-500 font-semibold uppercase tracking-wide">Dev</span>
                  <button
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
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
                {groupedOperations.map((group) => (
                  <div key={group.id}>
                    <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      {group.id}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {group.operations.map((operation) => (
                        <button
                          key={operation.id}
                          onClick={() => handleSelect(operation)}
                          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors ${
                            implementedOperations.has(operation.id)
                              ? 'border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100'
                              : 'border-gray-200 bg-white text-gray-900 hover:bg-gray-50'
                          }`}
                        >
                          {operation.icon && <span className="text-base">{operation.icon}</span>}
                          <span>{operation.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                {groupedOperations.length === 0 && (
                  <div className="text-sm text-gray-500">No operations match your search.</div>
                )}
              </div>
            </div>
          </div>
        </dialog>
      </div>
    </>
  );
};
