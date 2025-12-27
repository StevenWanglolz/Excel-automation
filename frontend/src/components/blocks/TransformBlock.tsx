import { BaseBlock } from './BaseBlock';

interface TransformBlockProps {
  id: string;
  data: any;
  selected: boolean;
  type?: string;
  onDelete?: (nodeId: string) => void;
  onAddOperation?: (nodeId: string) => void;
  showAddButton?: boolean;
}

export const TransformBlock = ({ id, data, selected, type, onDelete, onAddOperation, showAddButton }: TransformBlockProps) => {
  const blockType = data?.blockType || 'transform';

  return (
    <BaseBlock id={id} data={data} selected={selected} type={type} onDelete={onDelete} onAddOperation={onAddOperation} showAddButton={showAddButton}>
      <div className="text-sm text-gray-600">
        <p>{blockType}</p>
      </div>
    </BaseBlock>
  );
};

