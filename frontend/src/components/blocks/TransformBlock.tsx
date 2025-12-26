import { BaseBlock } from './BaseBlock';

interface TransformBlockProps {
  id: string;
  data: any;
  selected: boolean;
  type?: string;
  onDelete?: (nodeId: string) => void;
}

export const TransformBlock = ({ id, data, selected, type, onDelete }: TransformBlockProps) => {
  const blockType = data?.blockType || 'transform';

  return (
    <BaseBlock id={id} data={data} selected={selected} type={type} onDelete={onDelete}>
      <div className="text-sm text-gray-600">
        <p>{blockType}</p>
      </div>
    </BaseBlock>
  );
};

