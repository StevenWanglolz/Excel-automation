import { Handle, Position } from '@xyflow/react';
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
      {/* Target handle (input) at the top */}
      <Handle
        type="target"
        position={Position.Top}
        id="target"
        style={{ top: -5 }}
      />
      
      <div
        className={`min-w-[200px] bg-white border-2 rounded-lg shadow-lg p-4 ${
          selected ? 'border-indigo-500 shadow-xl' : 'border-gray-300'
        }`}
        style={{
          boxShadow: selected 
            ? '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)' 
            : '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)'
        }}
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
      
      {/* Source handle (output) at the bottom */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="source"
        style={{ bottom: -5 }}
      />
      
      {/* Plus button integrated with the source handle */}
      {showAddButton && onAddOperation && (
        <div className="absolute left-1/2 transform -translate-x-1/2 z-10" style={{ top: '100%' }}>
          {/* Subtle connecting line from source handle to plus button */}
          <div 
            className="absolute left-1/2 transform -translate-x-1/2 bg-gray-400 opacity-40" 
            style={{ 
              top: '5px', 
              height: '12px',
              width: '2px'
            }} 
          />
          
          {/* Plus button styled as extension of connection point */}
          <div className="relative" style={{ top: '17px' }}>
            <button
              onClick={handleAddClick}
              className="w-7 h-7 bg-indigo-500 hover:bg-indigo-600 text-white rounded-full flex items-center justify-center shadow-sm hover:shadow-md transition-all duration-200 border-2 border-white ring-2 ring-indigo-200 hover:ring-indigo-300"
              title="Add operation"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

