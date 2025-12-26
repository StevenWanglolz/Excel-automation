import { useCallback } from 'react';
import { useFlowStore } from '../../store/flowStore';
import { Node } from '@xyflow/react';

const blockTemplates = [
  // Upload
  { id: 'upload', type: 'upload', label: 'Upload File', category: 'upload', icon: '📤' },
  
  // Filters
  { id: 'filter', type: 'filter', label: 'Filter Rows', category: 'filter', icon: '🔍' },
  { id: 'delete_rows', type: 'transform', label: 'Delete Rows', category: 'filter', icon: '🗑️' },
  
  // Row Operations
  { id: 'sort_rows', type: 'transform', label: 'Sort Rows', category: 'rows', icon: '⬆️' },
  { id: 'remove_duplicates', type: 'transform', label: 'Remove Duplicates', category: 'rows', icon: '🔁' },
  
  // Column Operations
  { id: 'rename_columns', type: 'transform', label: 'Rename Columns', category: 'columns', icon: '✏️' },
  { id: 'rearrange_columns', type: 'transform', label: 'Rearrange Columns', category: 'columns', icon: '↔️' },
  
  // Transform Operations
  { id: 'join', type: 'transform', label: 'Join/Lookup', category: 'transform', icon: '🔗' },
];

export const BlockPalette = () => {
  const { addNode } = useFlowStore();

  const onDragStart = useCallback(
    (event: React.DragEvent, blockTemplate: typeof blockTemplates[0]) => {
      event.dataTransfer.setData('application/reactflow', JSON.stringify(blockTemplate));
      event.dataTransfer.effectAllowed = 'move';
    },
    []
  );

  const handleAddBlock = useCallback(
    (template: typeof blockTemplates[0]) => {
      const newNode: Node = {
        id: `${template.type}-${Date.now()}`,
        type: template.type,
        position: { x: Math.random() * 400, y: Math.random() * 400 },
        data: {
          blockType: template.id,
          label: template.label,
          config: {},
        },
      };
      addNode(newNode);
    },
    [addNode]
  );

  const categories = [
    { id: 'upload', label: 'Upload', icon: '📤' },
    { id: 'filter', label: 'Filters', icon: '🔍' },
    { id: 'rows', label: 'Row Operations', icon: '📋' },
    { id: 'columns', label: 'Column Operations', icon: '📊' },
    { id: 'transform', label: 'Transforms', icon: '⚙️' },
  ];

  const getBlocksByCategory = (category: string) => {
    return blockTemplates.filter((block) => block.category === category);
  };

  return (
    <div className="w-64 bg-white border-r border-gray-200 p-4 h-full overflow-y-auto">
      <h2 className="text-lg font-semibold mb-4">Blocks</h2>
      <div className="space-y-4">
        {categories.map((category) => {
          const categoryBlocks = getBlocksByCategory(category.id);
          if (categoryBlocks.length === 0) return null;
          
          return (
            <div key={category.id} className="mb-4">
              <div className="flex items-center space-x-2 mb-2">
                <span className="text-sm">{category.icon}</span>
                <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
                  {category.label}
                </h3>
              </div>
              <div className="space-y-2">
                {categoryBlocks.map((block) => (
                  <div
                    key={block.id}
                    draggable
                    onDragStart={(e) => onDragStart(e, block)}
                    onClick={() => handleAddBlock(block)}
                    className="p-3 border border-gray-300 rounded-lg cursor-move hover:bg-gray-50 hover:border-indigo-500 transition-colors"
                  >
                    <div className="flex items-center space-x-2">
                      {block.icon && <span className="text-base">{block.icon}</span>}
                      <div className="flex-1">
                        <div className="font-medium text-sm">{block.label}</div>
                        <div className="text-xs text-gray-500 mt-0.5">{block.category}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

