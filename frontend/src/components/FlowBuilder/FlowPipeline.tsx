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
  DragOverlay,
  defaultDropAnimationSideEffects,
  type DragEndEvent,
  type DropAnimation,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import type { FilePreview } from '../../types';
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

const buildStepLabel = (index: number, isSource: boolean) => {
  if (isSource) {
    return 'Source';
  }
  return `Step ${index}`;
};

const dropAnimation: DropAnimation = {
  sideEffects: defaultDropAnimationSideEffects({
    styles: {
      active: {
        opacity: '0.4',
      },
    },
  }),
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
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const orderedNodes = useMemo(() => nodes, [nodes]);

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

  const handleDragStart = (event: any) => {
    setActiveDragId(event.active.id);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragId(null);

    if (active.id !== over?.id && over) {
      const oldIndex = nodes.findIndex((node) => node.id === active.id);
      const newIndex = nodes.findIndex((node) => node.id === over.id);

      // Prevent moving anything to the source position (index 0)
      if (newIndex === 0) {
        return;
      }

      // Prevent moving source node is handled by SortableNode disabled prop, 
      // but double check here.
      if (oldIndex === 0) {
        return;
      }

      const nextNodes = arrayMove(nodes, oldIndex, newIndex);
      onReorderNodes(nextNodes);
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
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          {/* Content wrapper defines the bounds used for fit-to-view. */}
          <div ref={contentRef} className="mx-auto flex w-full max-w-4xl flex-col gap-3 px-6 py-6">
            <SortableContext items={orderedNodes} strategy={verticalListSortingStrategy}>
              {orderedNodes.map((node, index) => {
                const isFileSource = fileSourceNodeId === node.id || node.type === 'source';
                const stepLabel = buildStepLabel(isFileSource ? 0 : index, isFileSource);
                const preview = previews[node.id] || null;
                const isLoading = previewLoading[node.id] || false;
                const errorMessage = previewErrors[node.id];
                const configSummary = getConfigSummary(node.data?.config as Record<string, unknown> | undefined);
                const isSelected = selectedNodeId === node.id;
                const isPreviewOpen = activePreviewNodeIds.has(node.id);

                return (
                  <SortableNode
                    key={node.id}
                    node={node}
                    index={index}
                    isFileSource={isFileSource}
                    isSelected={isSelected}
                    isPreviewOpen={isPreviewOpen}
                    preview={preview}
                    isLoading={isLoading}
                    errorMessage={errorMessage}
                    stepLabel={stepLabel}
                    configSummary={configSummary}
                    onNodeClick={onNodeClick}
                    onAddOperation={onAddOperation}
                    onDeleteNode={onDeleteNode}
                    onTogglePreview={onTogglePreview}
                    onSourceSheetChange={onSourceSheetChange}
                  />
                );
              })}
            </SortableContext>
            <DragOverlay dropAnimation={dropAnimation}>
            {activeDragId ? (
                (() => {
                  const node = nodes.find((n) => n.id === activeDragId);
                  if (!node) return null;
                  const index = nodes.findIndex((n) => n.id === activeDragId);
                  const isFileSource = fileSourceNodeId === node.id || node.type === 'source';
                  const stepLabel = buildStepLabel(isFileSource ? 0 : index, isFileSource);
                  const preview = previews[node.id] || null;
                  const isLoading = previewLoading[node.id] || false;
                  const errorMessage = previewErrors[node.id];
                  const configSummary = getConfigSummary(node.data?.config as Record<string, unknown> | undefined);
                  
                  return (
                    <SortableNode
                      node={node}
                      index={index}
                      isFileSource={isFileSource}
                      isSelected={true}
                      isPreviewOpen={false} // Collapsed during drag for cleanliness
                      preview={null}
                      isLoading={false}
                      errorMessage={null}
                      stepLabel={stepLabel}
                      configSummary={configSummary}
                      onNodeClick={() => {}}
                      onAddOperation={() => {}}
                      onDeleteNode={() => {}}
                      onTogglePreview={() => {}}
                      onSourceSheetChange={() => {}}
                    />
                  );
                })()
              ) : null}
            </DragOverlay>
          </div>
        </DndContext>
      </div>
    </div>
  );
};
