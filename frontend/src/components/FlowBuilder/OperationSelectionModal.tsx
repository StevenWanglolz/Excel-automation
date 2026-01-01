import { useState } from 'react';

interface Operation {
  id: string;
  label: string;
  type: string;
  category?: string;
}

interface OperationSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (operation: Operation) => void;
}

const OPERATIONS: Operation[] = [
  // Column Operations
  { id: 'remove-columns-rows', label: 'Remove Columns/Rows', type: 'columns', category: 'Column Operations' },
  { id: 'rename-column', label: 'Rename Columns', type: 'columns', category: 'Column Operations' },
  { id: 'rearrange-column', label: 'Rearrange Columns', type: 'columns', category: 'Column Operations' },
  
  // Row Operations
  { id: 'sort-rows', label: 'Sort Rows', type: 'rows', category: 'Row Operations' },
  { id: 'remove-duplicates', label: 'Remove Duplicates', type: 'rows', category: 'Row Operations' },
  
  // Filters
  { id: 'filter-rows', label: 'Filter Rows', type: 'filter', category: 'Filters' },
  { id: 'delete-rows', label: 'Delete Rows', type: 'filter', category: 'Filters' },
  
  // Transforms
  { id: 'join-lookup', label: 'Join/Lookup', type: 'transform', category: 'Transforms' },

  // Output
  { id: 'output', label: 'Output', type: 'output', category: 'Output' },
];

export const OperationSelectionModal = ({ isOpen, onClose, onSelect }: OperationSelectionModalProps) => {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  if (!isOpen) return null;

  // Group operations by category
  const operationsByCategory = OPERATIONS.reduce((acc, op) => {
    const category = op.category || 'Other';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(op);
    return acc;
  }, {} as Record<string, Operation[]>);

  // Get operations to display (filtered by category if selected)
  const displayOperations = selectedCategory
    ? operationsByCategory[selectedCategory] || []
    : OPERATIONS;

  // Split into two columns
  const leftColumn = displayOperations.filter((_, index) => index % 2 === 0);
  const rightColumn = displayOperations.filter((_, index) => index % 2 === 1);

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
          <div className="p-6 h-[calc(100%-73px)] overflow-y-auto">
            {/* Category Filter (optional) */}
            <div className="mb-4 flex gap-2 flex-wrap">
              <button
                onClick={() => setSelectedCategory(null)}
                className={`px-3 py-1 rounded-md text-sm ${
                  selectedCategory === null
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                All
              </button>
              {Object.keys(operationsByCategory).map((category) => (
                <button
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  className={`px-3 py-1 rounded-md text-sm ${
                    selectedCategory === category
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>

            {/* Two-column grid */}
            <div className="grid grid-cols-2 gap-3">
              {/* Left Column */}
              <div className="space-y-2">
                {leftColumn.map((operation) => (
                  <button
                    key={operation.id}
                    onClick={() => handleSelect(operation)}
                    className="w-full bg-[#d9d9d9] h-12 rounded-md flex items-center px-3 hover:bg-gray-400 transition-colors text-left"
                  >
                    <span className="text-sm text-gray-900">{operation.label}</span>
                  </button>
                ))}
              </div>

              {/* Right Column */}
              <div className="space-y-2">
                {rightColumn.map((operation) => (
                  <button
                    key={operation.id}
                    onClick={() => handleSelect(operation)}
                    className="w-full bg-[#d9d9d9] h-12 rounded-md flex items-center px-3 hover:bg-gray-400 transition-colors text-left"
                  >
                    <span className="text-sm text-gray-900">{operation.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </dialog>
      </div>
    </>
  );
};
