import { BaseBlock } from './BaseBlock';

interface FilterBlockProps {
  id: string;
  data: any;
  selected: boolean;
  type?: string;
  onDelete?: (nodeId: string) => void;
  onAddOperation?: (nodeId: string) => void;
  showAddButton?: boolean;
}

export const FilterBlock = ({ id, data, selected, type, onDelete, onAddOperation, showAddButton }: FilterBlockProps) => {
  const config = data?.config || {};

  return (
    <BaseBlock id={id} data={data} selected={selected} type={type} onDelete={onDelete} onAddOperation={onAddOperation} showAddButton={showAddButton}>
      <div className="text-sm text-gray-600">
        <p>Filter: {config.column || 'Select column'}</p>
        <p className="text-xs mt-1">
          {config.operator || '='} {config.value || ''}
        </p>
      </div>
    </BaseBlock>
  );
};

