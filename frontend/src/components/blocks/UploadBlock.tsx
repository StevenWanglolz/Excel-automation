import { BaseBlock } from './BaseBlock';

interface UploadBlockProps {
  id: string;
  data: any;
  selected: boolean;
  type?: string;
  onDelete?: (nodeId: string) => void;
}

export const UploadBlock = ({ id, data, selected, type, onDelete }: UploadBlockProps) => {
  return (
    <BaseBlock 
      id={id} 
      data={{ ...data, label: data?.label || 'Data' }} 
      selected={selected} 
      type={type}
      onDelete={onDelete}
    >
      <div className="text-sm text-gray-600">
        <p>Click to upload file</p>
      </div>
    </BaseBlock>
  );
};

