import { BaseBlock } from './BaseBlock';

interface TransformBlockProps {
  id: string;
  data: any;
  selected: boolean;
  type?: string;
}

export const TransformBlock = ({ id, data, selected, type }: TransformBlockProps) => {
  const blockType = data?.blockType || 'transform';

  return (
    <BaseBlock id={id} data={data} selected={selected} type={type}>
      <div className="text-sm text-gray-600">
        <p>{blockType}</p>
      </div>
    </BaseBlock>
  );
};

