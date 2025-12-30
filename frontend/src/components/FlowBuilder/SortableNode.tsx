
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DataPreview } from '../Preview/DataPreview';
import type { Node } from '@xyflow/react';
import type { FilePreview } from '../../types';

interface SortableNodeProps {
  node: Node;
  index: number;
  isFileSource: boolean;
  isSelected: boolean;
  isPreviewOpen: boolean;
  preview: FilePreview | null;
  isLoading: boolean;
  errorMessage: string | null;
  stepLabel: string;
  configSummary: string;
  onNodeClick: (nodeId: string, nodeType: string) => void;
  onAddOperation: (afterNodeId: string) => void;
  onDeleteNode: (nodeId: string) => void;
  onTogglePreview: (nodeId: string) => void;
  onSourceSheetChange: (sheetName: string) => void;
}

export const SortableNode = ({
  node,
  isFileSource,
  isSelected,
  isPreviewOpen,
  preview,
  isLoading,
  errorMessage,
  stepLabel,
  configSummary,
  onNodeClick,
  onAddOperation,
  onDeleteNode,
  onTogglePreview,
  onSourceSheetChange,
}: SortableNodeProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: node.id,
    disabled: isFileSource, // Source node cannot be dragged
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 999 : 'auto',
    position: 'relative' as const,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex flex-col touch-none">
      <div
        className={`pipeline-block w-full rounded-lg border bg-white px-3 py-2 transition ${
          isSelected ? 'border-indigo-500 shadow-md' : 'border-gray-200'
        }`}
        onClick={() => onNodeClick(node.id, node.type || '')}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            {/* Drag Handle */}
            <button
              type="button"
              className={`cursor-grab rounded-md p-1 text-gray-400 hover:text-gray-600 ${
                isFileSource ? 'opacity-40 cursor-not-allowed' : ''
              }`}
              {...attributes}
              {...listeners}
              onClick={(event) => event.stopPropagation()}
              title={isFileSource ? 'Source stays at the top' : 'Drag to reorder'}
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 6h8M8 12h8M8 18h8" />
              </svg>
            </button>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-indigo-500">{stepLabel}</div>
              <div className="text-sm font-semibold text-gray-900">
                {node.data?.label || node.type || 'Block'}
              </div>
              <div className="text-xs text-gray-500">{configSummary}</div>
              {isFileSource && (
                <div className="mt-1 text-[11px] text-gray-400">
                  {Array.isArray(node.data?.fileIds) && node.data.fileIds.length > 0
                    ? `${node.data.fileIds.length} file(s) uploaded`
                    : 'Click to upload a file'}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
              onClick={(event) => {
                event.stopPropagation();
                onTogglePreview(node.id);
              }}
            >
              {isPreviewOpen ? 'Hide preview' : 'Preview'}
            </button>
            {!isFileSource && (
              <button
                type="button"
                className="text-xs font-semibold text-red-600 hover:text-red-800"
                onClick={(event) => {
                  event.stopPropagation();
                  onDeleteNode(node.id);
                }}
              >
                Delete
              </button>
            )}
          </div>
        </div>
        {isPreviewOpen && (
          <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
            {errorMessage ? (
              <div className="flex items-center justify-center text-sm text-red-600">{errorMessage}</div>
            ) : (
              <div className="h-56">
                <DataPreview
                  preview={preview}
                  isLoading={isLoading}
                  onSheetChange={isFileSource ? onSourceSheetChange : undefined}
                />
              </div>
            )}
          </div>
        )}
      </div>
      <div className="flex flex-col items-center gap-2 py-3">
        <div className="h-4 w-px bg-gray-200" />
        <button
          type="button"
          className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
          onClick={() => onAddOperation(node.id)}
        >
          + Add step
        </button>
        {/* Only show bottom connector line if strictly needed, dnd-kit gap is nicer */}
         <div className="h-4 w-px bg-gray-200" />
      </div>
    </div>
  );
};
