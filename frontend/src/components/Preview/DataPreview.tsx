import type { FilePreview } from '../../types';

interface DataPreviewProps {
  preview: FilePreview | null;
  isLoading?: boolean;
  fileId?: number;
  onSheetChange?: (sheetName: string) => void;
}

export const DataPreview = ({ preview, isLoading, fileId, onSheetChange }: DataPreviewProps) => {
  const handleSheetChange = (sheetName: string) => {
    if (onSheetChange) {
      onSheetChange(sheetName);
    }
  };

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

  const hasMultipleSheets = preview.sheets && preview.sheets.length > 1;

  return (
    <div className="w-full overflow-auto">
      <div className="mb-4 flex items-center justify-between">
        <div className="text-sm text-gray-600">
          <span className="font-semibold">{preview.row_count}</span> rows,{' '}
          <span className="font-semibold">{preview.columns.length}</span> columns
          {preview.current_sheet && (
            <span className="ml-2 text-gray-500">
              (Sheet: {preview.current_sheet})
            </span>
          )}
        </div>
        {hasMultipleSheets && (
          <div className="flex items-center space-x-2">
            <label className="text-xs text-gray-600 font-medium">Sheet:</label>
            <select
              key={`sheet-select-${preview.current_sheet || ''}`}
              value={String(preview.current_sheet || (preview.sheets && preview.sheets.length > 0 ? preview.sheets[0] : ''))}
              onChange={(e) => handleSheetChange(e.target.value)}
              className="px-3 py-1 text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              {preview.sheets.map((sheet) => (
                <option key={sheet} value={String(sheet)}>
                  {sheet}
                </option>
              ))}
            </select>
          </div>
        )}
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

