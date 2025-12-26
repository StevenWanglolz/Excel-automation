import { useCallback } from 'react';
import { useFlowStore } from '../../store/flowStore';
import { Node } from '@xyflow/react';

const blockTemplates = [
  { id: 'upload', type: 'upload', label: 'Upload File', category: 'upload' },
  { id: 'filter', type: 'filter', label: 'Filter Rows', category: 'filter' },
  { id: 'delete_rows', type: 'transform', label: 'Delete Rows', category: 'rows' },
  { id: 'rename_columns', type: 'transform', label: 'Rename Columns', category: 'columns' },
  { id: 'remove_duplicates', type: 'transform', label: 'Remove Duplicates', category: 'rows' },
  { id: 'join', type: 'transform', label: 'Join/Lookup', category: 'transform' },
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

  return (
    <div className="w-64 bg-white border-r border-gray-200 p-4 h-full overflow-y-auto">
      <h2 className="text-lg font-semibold mb-4">Blocks</h2>
      <div className="space-y-2">
        {blockTemplates.map((block) => (
          <div
            key={block.id}
            draggable
            onDragStart={(e) => onDragStart(e, block)}
            onClick={() => handleAddBlock(block)}
            className="p-3 border border-gray-300 rounded-lg cursor-move hover:bg-gray-50 hover:border-indigo-500 transition-colors"
          >
            <div className="font-medium text-sm">{block.label}</div>
            <div className="text-xs text-gray-500 mt-1">{block.category}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

