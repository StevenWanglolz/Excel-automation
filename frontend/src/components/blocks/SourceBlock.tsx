import { BaseBlock } from './BaseBlock';

interface SourceBlockProps {
  id: string;
  data: any;
  selected: boolean;
  type?: string;
  onDelete?: (nodeId: string) => void;
  onAddOperation?: (nodeId: string) => void;
  showAddButton?: boolean;
}

export const SourceBlock = ({ id, data, selected, type, onDelete, onAddOperation, showAddButton }: SourceBlockProps) => {
  const fileIds = data?.fileIds || [];
  const hasFiles = Array.isArray(fileIds) && fileIds.length > 0;

  return (
    <BaseBlock 
      id={id} 
      data={{ ...data, label: data?.label || 'Data' }} 
      selected={selected} 
      type={type}
      onDelete={onDelete}
      onAddOperation={onAddOperation}
      showAddButton={showAddButton}
    >
      <div className="text-sm text-gray-600">
        {hasFiles ? (
          <p>{fileIds.length} file(s) uploaded</p>
        ) : (
          <p>Click to upload file</p>
        )}
      </div>
    </BaseBlock>
  );
};

