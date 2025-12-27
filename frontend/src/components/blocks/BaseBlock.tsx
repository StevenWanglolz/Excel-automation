import type { BlockData } from '../../types';

interface BaseBlockProps {
  id: string;
  data: BlockData;
  selected: boolean;
  type?: string;
  children?: React.ReactNode;
  onDelete?: (nodeId: string) => void;
  onAddOperation?: (nodeId: string) => void;
  showAddButton?: boolean;
}

export const BaseBlock = ({ id, data, selected, type, children, onDelete, onAddOperation, showAddButton = true }: BaseBlockProps) => {
  if (!data) {
    return null;
  }

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDelete) {
      onDelete(id);
    }
  };

  const handleAddClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onAddOperation) {
      onAddOperation(id);
    }
  };

  return (
    <div className="relative">
      <div
        className={`min-w-[200px] bg-white border-2 rounded-lg shadow-md p-4 ${
          selected ? 'border-indigo-500' : 'border-gray-300'
        }`}
      >
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-sm text-gray-900">{data.label || type || 'Block'}</h3>
          <div className="flex items-center space-x-2">
            {onDelete && (
              <button
                onClick={handleDelete}
                className="text-red-600 hover:text-red-800 text-lg font-bold transition-colors"
                title="Delete block"
              >
                ×
              </button>
            )}
            <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
          </div>
        </div>
        {children && <div className="mt-2">{children}</div>}
        <div className="mt-2 text-xs text-gray-500">
          {type || 'block'}
        </div>
      </div>
      
      {/* Plus button after block */}
      {showAddButton && onAddOperation && (
        <div className="absolute left-1/2 -bottom-5 transform -translate-x-1/2 z-10">
          <button
            onClick={handleAddClick}
            className="w-10 h-10 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full flex items-center justify-center shadow-lg transition-colors"
            title="Add operation"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
};

