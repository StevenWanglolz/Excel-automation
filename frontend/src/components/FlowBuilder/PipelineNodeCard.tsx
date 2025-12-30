/**
 * Responsible for:
 * - Rendering a pipeline node card with actions and preview.
 *
 * Key assumptions:
 * - Parent controls selection, preview state, and ordering.
 *
 * Be careful:
 * - Stop event propagation on action buttons to avoid unwanted selection.
 */
import type { Node } from '@xyflow/react';

interface PipelineNodeCardProps {
  node: Node;
  isFileSource: boolean;
  isSelected: boolean;
  isPreviewOpen: boolean;
  configSummary: string;
  onNodeClick: (nodeId: string, nodeType: string) => void;
  onAddOperation: (afterNodeId: string) => void;
  onDeleteNode: (nodeId: string) => void;
  onTogglePreview: (nodeId: string) => void;
  dragAttributes?: Record<string, unknown>;
  dragListeners?: Record<string, unknown>;
}

export const PipelineNodeCard = ({
  node,
  isFileSource,
  isSelected,
  isPreviewOpen,
  configSummary,
  onNodeClick,
  onAddOperation,
  onDeleteNode,
  onTogglePreview,
  dragAttributes,
  dragListeners,
}: PipelineNodeCardProps) => {
  return (
    <div className="flex flex-col">
      <div
        className={`pipeline-block w-full rounded-lg border bg-white px-3 py-2 transition ${
          isSelected ? 'border-indigo-500 shadow-md' : 'border-gray-200'
        }`}
        onClick={() => onNodeClick(node.id, node.type || '')}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2">
            <button
              type="button"
              className={`cursor-grab rounded-md p-1 text-gray-400 hover:text-gray-600 ${
                isFileSource ? 'opacity-40 cursor-not-allowed' : ''
              }`}
              {...dragAttributes}
              {...dragListeners}
              onClick={(event) => event.stopPropagation()}
              title={isFileSource ? 'Source stays at the top' : 'Drag to reorder'}
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 6h8M8 12h8M8 18h8" />
              </svg>
            </button>
            <div>
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
              className={`rounded-md p-1.5 transition ${
                isPreviewOpen
                  ? 'bg-indigo-100 text-indigo-700 shadow-sm'
                  : 'text-gray-400 hover:bg-gray-100 hover:text-indigo-600'
              }`}
              onClick={(event) => {
                event.stopPropagation();
                onTogglePreview(node.id);
              }}
              title={isPreviewOpen ? 'Hide preview' : 'Show preview'}
            >
              {/* Preview is explicit to avoid heavy work on every step by default. */}
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            </button>
            {!isFileSource && (
              <button
                type="button"
                className="rounded-md p-1.5 text-gray-400 transition hover:bg-red-50 hover:text-red-600"
                onClick={(event) => {
                  event.stopPropagation();
                  onDeleteNode(node.id);
                }}
                title="Delete block"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="flex flex-col items-center gap-1 py-1.5">
        <div className="h-1.5 w-px bg-gray-200" />
        <button
          type="button"
          className="group flex h-6 w-6 items-center justify-center rounded-full border border-indigo-200 bg-white text-indigo-600 shadow-sm transition-all hover:scale-110 hover:bg-indigo-50 hover:text-indigo-700"
          onClick={() => onAddOperation(node.id)}
          title="Add step after this"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
        <div className="h-1.5 w-px bg-gray-200" />
      </div>
    </div>
  );
};
