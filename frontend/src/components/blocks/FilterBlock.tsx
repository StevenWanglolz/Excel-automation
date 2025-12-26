import { BaseBlock } from './BaseBlock';

interface FilterBlockProps {
  id: string;
  data: any;
  selected: boolean;
  type?: string;
}

export const FilterBlock = ({ id, data, selected, type }: FilterBlockProps) => {
  const config = data?.config || {};

  return (
    <BaseBlock id={id} data={data} selected={selected} type={type}>
      <div className="text-sm text-gray-600">
        <p>Filter: {config.column || 'Select column'}</p>
        <p className="text-xs mt-1">
          {config.operator || '='} {config.value || ''}
        </p>
      </div>
    </BaseBlock>
  );
};

