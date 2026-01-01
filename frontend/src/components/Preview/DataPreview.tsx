import type { FilePreview } from '../../types';

interface FileOption {
  id: number;
  label: string;
}

interface DataPreviewProps {
  preview: FilePreview | null;
  isLoading?: boolean;
  fileId?: number;
  fileOptions?: FileOption[];
  currentFileId?: number | null;
  onFileChange?: (fileId: number) => void;
  onSheetChange?: (sheetName: string) => void;
}

export const DataPreview = ({
  preview,
  isLoading,
  fileId: _fileId,
  fileOptions,
  currentFileId,
  onFileChange,
  onSheetChange,
}: DataPreviewProps) => {
  const handleSheetChange = (sheetName: string) => {
    if (onSheetChange) {
      onSheetChange(sheetName);
    }
  };

  const handleFileChange = (value: string) => {
    if (!onFileChange) {
      return;
    }
    const nextId = Number(value);
    if (Number.isFinite(nextId)) {
      onFileChange(nextId);
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

  const hasMultipleFiles = Boolean(fileOptions && fileOptions.length > 1 && onFileChange);
  const hasMultipleSheets = preview.sheets && preview.sheets.length > 1;
  const currentSheet = preview.current_sheet || (preview.sheets && preview.sheets.length > 0 ? preview.sheets[0] : null);

  return (
    <div className="w-full flex flex-col h-full">
      {/* Header with row/column info */}
      <div className="mb-2 flex flex-wrap items-center gap-3">
        {hasMultipleFiles && (
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wider">
            File
            <select
              className="ml-2 rounded-md border border-gray-200 bg-white px-2 py-1 text-sm text-gray-700"
              value={currentFileId ?? fileOptions?.[0]?.id ?? ''}
              onChange={(event) => handleFileChange(event.target.value)}
            >
              {fileOptions?.map((file) => (
                <option key={file.id} value={String(file.id)}>
                  {file.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="text-sm text-gray-600">
          <span className="font-semibold">{preview.row_count}</span> rows,{' '}
          <span className="font-semibold">{preview.columns.length}</span> columns
        </div>
      </div>

      {/* Table container - takes available space with proper scrollbar placement */}
      {/* Vertical scrollbar inside table area, horizontal scrollbar always visible when needed */}
      <div className={`flex-1 overflow-x-auto overflow-y-auto border-l border-r border-t border-gray-300 ${hasMultipleSheets ? 'rounded-t-lg' : 'rounded-lg border-b'}`}>
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50 sticky top-0 z-10">
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
            {preview.preview_rows.map((row, idx) => {
              // Create a unique key from row data and index
              const rowKey = preview.columns.length > 0 
                ? `${idx}-${String(row[preview.columns[0]] ?? '')}`
                : `row-${idx}`;
              return (
              <tr key={rowKey} className="hover:bg-gray-50">
                {preview.columns.map((column) => (
                  <td key={column} className="px-4 py-3 text-sm text-gray-900">
                    {row[column] !== null && row[column] !== undefined
                      ? String(row[column])
                      : ''}
                  </td>
                ))}
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Sheet tabs at the bottom (Excel-style) - horizontal scroll only */}
      {hasMultipleSheets && preview.sheets && (
        <div className="flex items-end border-l border-r border-b border-gray-300 bg-gray-100 rounded-b-lg overflow-x-auto overflow-y-hidden">
          {preview.sheets.map((sheet) => {
            const isActive = sheet === currentSheet;
            return (
              <button
                key={sheet}
                onClick={() => handleSheetChange(sheet)}
                className={`
                  px-4 py-1.5 text-sm font-medium whitespace-nowrap
                  border-r border-gray-300
                  transition-colors
                  ${isActive 
                    ? 'bg-white border-b-2 border-b-transparent text-gray-900 shadow-sm' 
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }
                `}
                style={{
                  borderBottom: isActive ? '2px solid white' : '2px solid transparent',
                  marginBottom: isActive ? '-2px' : '0',
                }}
              >
                {sheet}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
