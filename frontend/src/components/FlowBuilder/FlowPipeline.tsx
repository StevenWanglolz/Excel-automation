/**
 * Responsible for:
 * - Rendering the sequential pipeline with per-step previews.
 * - Handling drag-and-drop reordering using @dnd-kit.
 * - Emitting selection, delete, and insert-after events.
 *
 * Key assumptions:
 * - Nodes are ordered in execution sequence.
 * - The first node is the source and must not move.
 *
 * Be careful:
 * - Reordering must keep the source at index 0.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Node } from '@xyflow/react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  pointerWithin,
  type CollisionDetection,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import type { FilePreview } from '../../types';
import { DataPreview } from '../Preview/DataPreview';
import { PipelineNodeCard } from './PipelineNodeCard';
import { SortableNode } from './SortableNode';

interface FlowPipelineProps {
  nodes: Node[];
  selectedNodeId: string | null;
  activePreviewNodeIds: Set<string>;
  fileSourceNodeId: string | null;
  viewAction: { type: 'fit' | 'reset'; id: number } | null;
  previews: Record<string, FilePreview | null>;
  previewLoading: Record<string, boolean>;
  previewErrors: Record<string, string | null>;
  onNodeClick: (nodeId: string, nodeType: string) => void;
  onAddOperation: (afterNodeId: string) => void;
  onDeleteNode: (nodeId: string) => void;
  onReorderNodes: (nextNodes: Node[]) => void;
  onSourceSheetChange: (sheetName: string) => void;
  onTogglePreview: (nodeId: string) => void;
}

const getConfigSummary = (config: Record<string, unknown> | undefined) => {
  if (!config || typeof config !== 'object') {
    return 'No configuration';
  }
  const entries = Object.entries(config).filter(([, value]) => value !== undefined && value !== null && value !== '');
  if (entries.length === 0) {
    return 'No configuration';
  }
  const previewEntries = entries.slice(0, 3).map(([key, value]) => {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return `${key}: ${value}`;
    }
    return `${key}: set`;
  });
  const extraCount = entries.length - previewEntries.length;
  return extraCount > 0 ? `${previewEntries.join(', ')} +${extraCount} more` : previewEntries.join(', ');
};


const collisionDetectionStrategy: CollisionDetection = (args) => {
  // Prioritize pointer collision so "drop under cursor" feels natural when zoomed.
  const pointerHits = pointerWithin(args);
  if (pointerHits.length > 0) {
    return pointerHits;
  }
  // Fall back to closest center for reliable reordering when pointer misses thin targets.
  return closestCenter(args);
};

export const FlowPipeline = ({
  nodes,
  selectedNodeId,
  activePreviewNodeIds,
  fileSourceNodeId,
  viewAction,
  previews,
  previewLoading,
  previewErrors,
  onNodeClick,
  onAddOperation,
  onDeleteNode,
  onReorderNodes,
  onSourceSheetChange,
  onTogglePreview,
}: FlowPipelineProps) => {
  // Canvas scale/pan are owned here so the pipeline can zoom independently of the app shell.
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Avoid immediate drag jumps by requiring slight movement first.
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const orderedNodes = useMemo(() => nodes, [nodes]);
  // Pin the first node so it never shifts during drag sorting.
  const pinnedNode = orderedNodes[0] || null;
  const sortableNodes = orderedNodes.slice(1);
  const activePreviewNodeId = useMemo(() => {
    const [first] = Array.from(activePreviewNodeIds);
    return first ?? null;
  }, [activePreviewNodeIds]);
  const activePreviewNode = activePreviewNodeId
    ? orderedNodes.find((node) => node.id === activePreviewNodeId) || null
    : null;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey) {
        return;
      }
      if (event.key !== '=' && event.key !== '-' && event.key !== '+') {
        return;
      }
      event.preventDefault();
      // Keyboard zoom keeps the user's hands on the shortcut flow.
      const nextScale = event.key === '-' ? scale - 0.1 : scale + 0.1;
      setScale(Math.min(1.6, Math.max(0.6, nextScale)));
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [scale]);

  useEffect(() => {
    if (!viewAction) {
      return;
    }
    if (viewAction.type === 'reset') {
      // Reset is explicit so the toolbar can snap back to the default scale.
      setScale(1);
      setPan({ x: 0, y: 0 });
      return;
    }

    const canvas = canvasRef.current;
    const content = contentRef.current;
    if (!canvas || !content) {
      return;
    }

    const canvasRect = canvas.getBoundingClientRect();
    // Fit-to-view uses the unscaled content bounds as the baseline.
    const baseWidth = Math.max(content.scrollWidth, 1);
    const baseHeight = Math.max(content.scrollHeight, 1);
    const paddingFactor = 0.9;
    const scaleX = (canvasRect.width * paddingFactor) / baseWidth;
    const scaleY = (canvasRect.height * paddingFactor) / baseHeight;
    const nextScale = Math.min(1.6, Math.max(0.6, Math.min(scaleX, scaleY)));
    const nextPan = {
      x: (canvasRect.width - baseWidth * nextScale) / 2,
      y: (canvasRect.height - baseHeight * nextScale) / 2,
    };
    setScale(nextScale);
    setPan(nextPan);
  }, [viewAction]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    // Only reorder when we drop over a different item in the sortable list.
    if (active.id !== over?.id && over) {
      const oldIndex = sortableNodes.findIndex((node) => node.id === active.id);
      const newIndex = sortableNodes.findIndex((node) => node.id === over.id);

      if (oldIndex === -1 || newIndex === -1 || !pinnedNode) {
        return;
      }

      // Rebuild the ordered list with the pinned source still first.
      const nextSortable = arrayMove(sortableNodes, oldIndex, newIndex);
      onReorderNodes([pinnedNode, ...nextSortable]);
    }
  };

  return (
    <div
      ref={canvasRef}
      className={`h-full overflow-hidden bg-gray-50 ${isPanning ? 'cursor-grabbing' : 'cursor-grab'}`}
      onMouseDown={(event) => {
        if (event.button !== 0) {
          return;
        }
        const target = event.target as HTMLElement | null;
        if (!target) {
          return;
        }
        // Only pan when dragging empty canvas space.
        if (
          target.closest('.pipeline-block') ||
          target.closest('.pipeline-toolbar') ||
          target.closest('button, input, textarea, select, a, [role="button"]')
        ) {
          return;
        }
        // Capture the start position so we can offset pan by drag distance.
        event.preventDefault();
        setIsPanning(true);
        panStartRef.current = {
          x: event.clientX,
          y: event.clientY,
          panX: pan.x,
          panY: pan.y,
        };
      }}
      onMouseMove={(event) => {
        if (!panStartRef.current) {
          return;
        }
        // Translate based on pointer delta from the initial pan anchor.
        const nextX = panStartRef.current.panX + (event.clientX - panStartRef.current.x);
        const nextY = panStartRef.current.panY + (event.clientY - panStartRef.current.y);
        setPan({ x: nextX, y: nextY });
      }}
      onMouseUp={() => {
        setIsPanning(false);
        panStartRef.current = null;
      }}
      onMouseLeave={() => {
        setIsPanning(false);
        panStartRef.current = null;
      }}
      onWheel={(event) => {
        if (!event.ctrlKey && !event.metaKey) {
          return;
        }
        event.preventDefault();
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) {
          return;
        }
        // Zoom around the cursor so users feel like they're "pointing" at the target.
        const scaleDelta = event.deltaY > 0 ? -0.1 : 0.1;
        const nextScale = Math.min(1.6, Math.max(0.6, scale + scaleDelta));
        const cursorX = event.clientX - rect.left;
        const cursorY = event.clientY - rect.top;
        const scaleRatio = nextScale / scale;
        const nextPan = {
          x: cursorX - (cursorX - pan.x) * scaleRatio,
          y: cursorY - (cursorY - pan.y) * scaleRatio,
        };
        setScale(nextScale);
        setPan(nextPan);
      }}
    >
      <div
        className="h-full w-full"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
          transformOrigin: '0 0',
        }}
      >
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetectionStrategy}
          onDragEnd={handleDragEnd}
        >
          {/* Content wrapper defines the bounds used for fit-to-view. */}
          <div ref={contentRef} className="mx-auto flex w-full max-w-xs flex-col gap-2 px-6 py-4">
            {pinnedNode && (
              <PipelineNodeCard
                node={pinnedNode}
                isFileSource={true}
                isSelected={selectedNodeId === pinnedNode.id}
                isPreviewOpen={activePreviewNodeIds.has(pinnedNode.id)}
                configSummary={getConfigSummary(pinnedNode.data?.config as Record<string, unknown> | undefined)}
                onNodeClick={onNodeClick}
                onAddOperation={onAddOperation}
                onDeleteNode={onDeleteNode}
                onTogglePreview={onTogglePreview}
              />
            )}
            {/* DnD-kit expects stable IDs; keep the list keyed by node IDs. */}
            <SortableContext items={sortableNodes.map((node) => node.id)} strategy={verticalListSortingStrategy}>
              {sortableNodes.map((node, index) => {
                const isFileSource = fileSourceNodeId === node.id || node.type === 'source';
                const configSummary = getConfigSummary(node.data?.config as Record<string, unknown> | undefined);
                const isSelected = selectedNodeId === node.id;
                const isPreviewOpen = activePreviewNodeIds.has(node.id);

                return (
                  <SortableNode
                    key={node.id}
                    node={node}
                    index={index + 1}
                    scale={scale}
                    isFileSource={isFileSource}
                    isSelected={isSelected}
                    isPreviewOpen={isPreviewOpen}
                    configSummary={configSummary}
                    onNodeClick={onNodeClick}
                    onAddOperation={onAddOperation}
                    onDeleteNode={onDeleteNode}
                    onTogglePreview={onTogglePreview}
                  />
                );
              })}
            </SortableContext>
          </div>
        </DndContext>
      </div>
      {activePreviewNode && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
          onClick={() => onTogglePreview(activePreviewNode.id)}
        >
          <div
            className="w-full max-w-6xl rounded-2xl bg-white shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
              <div>
                <div className="text-sm font-semibold text-gray-900">Full Screen Preview</div>
                <div className="text-xs text-gray-500">
                  {activePreviewNode.data?.label || activePreviewNode.type || 'Step'}
                </div>
              </div>
              <button
                type="button"
                className="rounded-md p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
                onClick={() => onTogglePreview(activePreviewNode.id)}
                title="Close preview"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="h-[70vh] p-5">
              {previewErrors[activePreviewNode.id] ? (
                <div className="flex h-full items-center justify-center text-sm text-red-600">
                  {previewErrors[activePreviewNode.id]}
                </div>
              ) : (
                <DataPreview
                  preview={previews[activePreviewNode.id] || null}
                  isLoading={previewLoading[activePreviewNode.id] || false}
                  onSheetChange={
                    activePreviewNode.id === fileSourceNodeId || activePreviewNode.type === 'source'
                      ? onSourceSheetChange
                      : undefined
                  }
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
