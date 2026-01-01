
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Node } from '@xyflow/react';
import { PipelineNodeCard } from './PipelineNodeCard';

interface SortableNodeProps {
  node: Node;
  index: number;
  scale: number;
  isFileSource: boolean;
  isSelected: boolean;
  isPreviewOpen: boolean;
  configSummary: string;
  onNodeClick: (nodeId: string, nodeType: string) => void;
  onAddOperation: (afterNodeId: string) => void;
  onDeleteNode: (nodeId: string) => void;
  onTogglePreview: (nodeId: string) => void;
  onExport: () => void;
}

export const SortableNode = ({
  node,
  isFileSource,
  isSelected,
  isPreviewOpen,
  configSummary,
  onNodeClick,
  onAddOperation,
  onDeleteNode,
  onTogglePreview,
  onExport,
  scale,
}: SortableNodeProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: node.id,
    disabled: isFileSource, // Source node cannot be dragged
  });

  // Compensate for canvas scale so drag offsets stay consistent.
  const adjustedTransform = transform
    ? { ...transform, x: transform.x / scale, y: transform.y / scale }
    : null;

  const style = {
    transform: CSS.Transform.toString(adjustedTransform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 999 : 'auto',
    position: 'relative' as const,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex flex-col touch-none">
      <PipelineNodeCard
        node={node}
        isFileSource={isFileSource}
        isSelected={isSelected}
        isPreviewOpen={isPreviewOpen}
        configSummary={configSummary}
        onNodeClick={onNodeClick}
        onAddOperation={onAddOperation}
        onDeleteNode={onDeleteNode}
        onTogglePreview={onTogglePreview}
        onExport={onExport}
        dragAttributes={attributes}
        dragListeners={listeners}
      />
    </div>
  );
};
