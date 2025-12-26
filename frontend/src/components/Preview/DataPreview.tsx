import type { FilePreview } from '../../types';

interface DataPreviewProps {
  preview: FilePreview | null;
  isLoading?: boolean;
}

export const DataPreview = ({ preview, isLoading }: DataPreviewProps) => {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading preview...</div>
      </div>
    );
  }

  if (!preview) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">No preview available</div>
      </div>
    );
  }

  return (
    <div className="w-full overflow-auto">
      <div className="mb-4">
        <div className="text-sm text-gray-600">
          <span className="font-semibold">{preview.row_count}</span> rows,{' '}
          <span className="font-semibold">{preview.columns.length}</span> columns
        </div>
      </div>
      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {preview.columns.map((column) => (
                <th
                  key={column}
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {preview.preview_rows.map((row, idx) => (
              <tr key={idx} className="hover:bg-gray-50">
                {preview.columns.map((column) => (
                  <td key={column} className="px-4 py-3 text-sm text-gray-900">
                    {row[column] !== null && row[column] !== undefined
                      ? String(row[column])
                      : ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

