import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

// Types for virtual file templates
export interface SheetTemplate {
  name: string;
  data: Record<string, string>[]; // Array of row objects
  columns: string[];
}

export interface VirtualFileTemplate {
  id: string; // virtual:uuid
  name: string;
  sheets: SheetTemplate[];
}

interface ExcelTemplateEditorProps {
  initialTemplate?: VirtualFileTemplate;
  onSave: (template: VirtualFileTemplate) => void;
  onCancel: () => void;
  isOpen: boolean;
}

const DEFAULT_ROWS = 20;
const DEFAULT_COLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

export const ExcelTemplateEditor = ({ initialTemplate, onSave, onCancel, isOpen }: ExcelTemplateEditorProps) => {
  const [fileName, setFileName] = useState('New File.xlsx');
  const [sheets, setSheets] = useState<SheetTemplate[]>([
    { name: 'Sheet1', data: Array(DEFAULT_ROWS).fill({}), columns: DEFAULT_COLS }
  ]);
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);

  useEffect(() => {
    if (initialTemplate) {
      setFileName(initialTemplate.name);
      setSheets(initialTemplate.sheets);
      // Reset active sheet to 0 to safeguard against out-of-bounds if new template has fewer sheets
      setActiveSheetIndex(0);
    } else {
        // Reset to defaults
        setFileName('New File.xlsx');
        setSheets([{ name: 'Sheet1', data: Array(DEFAULT_ROWS).fill({}), columns: DEFAULT_COLS }]);
        setActiveSheetIndex(0);
    }
  }, [initialTemplate, isOpen]);

  if (!isOpen) return null;

  const activeSheet = sheets[activeSheetIndex];

  const handleCellChange = (rowIndex: number, col: string, value: string) => {
    const newSheets = [...sheets];
    const newSheet = { ...newSheets[activeSheetIndex] };
    const newData = [...newSheet.data];
    
    // Ensure row exists
    if (!newData[rowIndex]) newData[rowIndex] = {};
    
    newData[rowIndex] = { ...newData[rowIndex], [col]: value };
    newSheet.data = newData;
    newSheets[activeSheetIndex] = newSheet;
    setSheets(newSheets);
  };

  const handleAddSheet = () => {
    const newSheetName = `Sheet${sheets.length + 1}`;
    setSheets([
      ...sheets,
      { name: newSheetName, data: Array(DEFAULT_ROWS).fill({}), columns: DEFAULT_COLS }
    ]);
    setActiveSheetIndex(sheets.length);
  };

  const handleSave = () => {
    const template: VirtualFileTemplate = {
      id: initialTemplate?.id || `virtual:${crypto.randomUUID()}`,
      name: fileName,
      sheets: sheets
    };
    onSave(template);
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] overflow-y-auto" aria-labelledby="modal-title" role="dialog" aria-modal="true">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:p-0">
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" aria-hidden="true" onClick={onCancel}></div>

        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-5xl sm:w-full h-[80vh] flex flex-col">
          
            {/* Header */}
            <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4 border-b border-gray-200 flex justify-between items-center">
                <div className="flex items-center gap-4">
                    <h3 className="text-lg leading-6 font-medium text-gray-900" id="modal-title">
                        Create Destination File
                    </h3>
                    <input 
                        type="text" 
                        value={fileName}
                        onChange={(e) => setFileName(e.target.value)}
                        className="px-2 py-1 border border-gray-300 rounded text-sm font-semibold text-gray-700 focus:ring-indigo-500 focus:border-indigo-500"
                        placeholder="File Name"
                    />
                </div>
                <div className="flex gap-2">
                    <button 
                        onClick={onCancel}
                        className="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={handleSave}
                        className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none"
                    >
                        Save File
                    </button>
                </div>
            </div>

            {/* Editor Area */}
            <div className="flex-1 overflow-hidden flex flex-col bg-gray-50">
                {/* Toolbar */}
                <div className="px-4 py-2 bg-white border-b border-gray-200 flex text-xs text-gray-500">
                    <span className="mr-4">Define the template for your output file. You can pre-fill headers or data.</span>
                </div>

                {/* Grid */}
                <div className="flex-1 overflow-auto relative">
                    <table className="min-w-full divide-y divide-gray-200 border-separate" style={{ borderSpacing: 0 }}>
                        <thead className="bg-gray-50 sticky top-0 z-10">
                            <tr>
                                <th className="sticky left-0 z-20 w-10 bg-gray-50 border-b border-r border-gray-200"></th>
                                {activeSheet.columns.map(col => (
                                    <th key={col} className="px-1 py-1 text-center text-xs font-medium text-gray-500 bg-gray-50 border-b border-r border-gray-200 w-24 min-w-[6rem]">
                                        {col}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="bg-white">
                            {activeSheet.data.map((row, rowIndex) => (
                                <tr key={rowIndex}>
                                    <td className="sticky left-0 z-10 bg-gray-50 px-2 py-1 text-xs text-gray-400 text-right border-b border-r border-gray-200 select-none">
                                        {rowIndex + 1}
                                    </td>
                                    {activeSheet.columns.map(col => (
                                        <td key={col} className="p-0 border-b border-r border-gray-200 relative">
                                            <input 
                                                type="text"
                                                value={row[col] || ''}
                                                onChange={(e) => handleCellChange(rowIndex, col, e.target.value)}
                                                className="w-full h-full px-2 py-1 text-sm border-none focus:ring-2 focus:ring-indigo-500 focus:z-10 absolute inset-0"
                                            />
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Sheet Tabs */}
                <div className="bg-gray-100 flex items-end border-t border-gray-200 px-2 pt-1 gap-1 overflow-x-auto">
                    {sheets.map((sheet, idx) => (
                        <div 
                            key={idx}
                            onClick={() => setActiveSheetIndex(idx)}
                            className={`
                                group relative px-4 py-1.5 text-sm font-medium cursor-pointer border-t border-l border-r rounded-t-lg
                                ${idx === activeSheetIndex ? 'bg-white border-b-transparent text-gray-900 pb-2 -mb-px z-10' : 'bg-gray-200 text-gray-600 hover:bg-gray-100 border-gray-300'}
                            `}
                        >
                            {/* Renaming could go here, for now just text */}
                            {sheet.name}
                        </div>
                    ))}
                    <button 
                        onClick={handleAddSheet}
                        className="px-3 py-1 text-gray-500 hover:text-indigo-600 font-bold text-lg"
                        title="Add Sheet"
                    >
                        +
                    </button>
                </div>
            </div>

        </div>
      </div>
    </div>
  , document.body);
};
