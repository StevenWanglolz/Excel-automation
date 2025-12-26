import { BaseBlock } from './BaseBlock';

interface UploadBlockProps {
  id: string;
  data: any;
  selected: boolean;
  type?: string;
}

export const UploadBlock = ({ id, data, selected, type }: UploadBlockProps) => {
  return (
    <BaseBlock 
      id={id} 
      data={{ ...data, label: data?.label || 'Data' }} 
      selected={selected} 
      type={type}
    >
      <div className="text-sm text-gray-600">
        <p>Click to upload file</p>
      </div>
    </BaseBlock>
  );
};

