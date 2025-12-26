import type { BlockData } from '../../types';

interface BaseBlockProps {
  id: string;
  data: BlockData;
  selected: boolean;
  type?: string;
  children?: React.ReactNode;
}

export const BaseBlock = ({ id, data, selected, type, children }: BaseBlockProps) => {
  if (!data) {
    return null;
  }

  return (
    <div
      className={`min-w-[200px] bg-white border-2 rounded-lg shadow-md p-4 ${
        selected ? 'border-indigo-500' : 'border-gray-300'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-sm text-gray-900">{data.label || type || 'Block'}</h3>
        <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
      </div>
      {children && <div className="mt-2">{children}</div>}
      <div className="mt-2 text-xs text-gray-500">
        {type || 'block'}
      </div>
    </div>
  );
};

