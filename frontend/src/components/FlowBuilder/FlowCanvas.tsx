import { useCallback, useMemo, useRef, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  Connection,
  NodeTypes,
  Node,
  NodeMouseHandler,
  ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useFlowStore } from '../../store/flowStore';
import { UploadBlock } from '../blocks/UploadBlock';
import { FilterBlock } from '../blocks/FilterBlock';
import { TransformBlock } from '../blocks/TransformBlock';
import { SourceBlock } from '../blocks/SourceBlock';

interface FlowCanvasProps {
  onNodeClick?: (nodeId: string, nodeType: string) => void;
  onAddOperation?: (afterNodeId: string) => void;
}

export const FlowCanvas = ({ onNodeClick, onAddOperation }: FlowCanvasProps) => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const {
    nodes: storeNodes,
    edges: storeEdges,
    setNodes,
    setEdges,
    addEdge: addStoreEdge,
    addNode,
    deleteNode,
  } = useFlowStore();

  const [nodes, setNodesState, onNodesChange] = useNodesState(storeNodes);
  const [edges, setEdgesState, onEdgesChange] = useEdgesState(storeEdges);
  const storeNodesRef = useRef(storeNodes);

  // Keep ref in sync with store nodes
  useEffect(() => {
    storeNodesRef.current = storeNodes;
  }, [storeNodes]);

  // Sync with store
  useEffect(() => {
    setNodesState(storeNodes);
  }, [storeNodes, setNodesState]);

  useEffect(() => {
    setEdgesState(storeEdges);
  }, [storeEdges, setEdgesState]);

  // Handle node deletion - use ref to avoid dependency on storeNodes
  const handleDeleteNode = useCallback((nodeId: string) => {
    deleteNode(nodeId);
    // Use ref to get latest nodes without adding dependency
    const updatedNodes = storeNodesRef.current.filter(n => n.id !== nodeId);
    setNodesState(updatedNodes);
    setNodes(updatedNodes);
  }, [deleteNode, setNodesState, setNodes]);

  // Create node types with delete handler and add operation button
  const nodeTypes: NodeTypes = useMemo(() => ({
    source: (props: any) => (
      <SourceBlock 
        {...props} 
        onDelete={undefined}
        onAddOperation={onAddOperation}
        showAddButton={true}
      />
    ),
    upload: (props: any) => (
      <UploadBlock 
        {...props} 
        onDelete={handleDeleteNode}
        onAddOperation={onAddOperation}
        showAddButton={true}
      />
    ),
    filter: (props: any) => (
      <FilterBlock 
        {...props} 
        onDelete={handleDeleteNode}
        onAddOperation={onAddOperation}
        showAddButton={true}
      />
    ),
    transform: (props: any) => (
      <TransformBlock 
        {...props} 
        onDelete={handleDeleteNode}
        onAddOperation={onAddOperation}
        showAddButton={true}
      />
    ),
  }), [handleDeleteNode, onAddOperation]);

  // Sync changes back to store
  const handleNodesChange = useCallback(
    (changes: any) => {
      // Filter out position changes for source nodes (make them unmovable)
      const filteredChanges = changes.filter((change: any) => {
        if (change.type === 'position') {
          const node = nodes.find((n) => n.id === change.id);
          if (node?.type === 'source') {
            return false; // Prevent position changes for source nodes
          }
        }
        return true;
      });
      
      onNodesChange(filteredChanges);
      // Update store after changes
      const updatedNodes = nodes.map((node) => {
        const change = filteredChanges.find((c: any) => c.id === node.id);
        if (change) {
          if (change.type === 'position' && change.position && node.type !== 'source') {
            return { ...node, position: change.position };
          }
          if (change.type === 'select') {
            return { ...node, selected: change.selected };
          }
        }
        return node;
      });
      setNodes(updatedNodes);
    },
    [nodes, onNodesChange, setNodes]
  );

  const handleEdgesChange = useCallback(
    (changes: any) => {
      onEdgesChange(changes);
      setEdges(edges);
    },
    [edges, onEdgesChange, setEdges]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const reactFlowBounds = reactFlowWrapper.current?.getBoundingClientRect();
      if (!reactFlowWrapper.current || !reactFlowBounds) return;

      const data = event.dataTransfer.getData('application/reactflow');
      if (!data) return;

      try {
        const blockTemplate = JSON.parse(data);
        const position = {
          x: event.clientX - reactFlowBounds.left,
          y: event.clientY - reactFlowBounds.top,
        };

        const newNode: Node = {
          id: `${blockTemplate.type}-${Date.now()}`,
          type: blockTemplate.type,
          position,
          data: {
            blockType: blockTemplate.id,
            label: blockTemplate.label,
            config: {},
          },
        };

        addNode(newNode);
        setNodesState([...nodes, newNode]);
      } catch (e) {
        console.error('Error parsing dropped data:', e);
      }
    },
    [nodes, addNode, setNodesState]
  );

  const onConnect = useCallback(
    (params: Connection) => {
      const newEdge = addEdge(params, edges);
      setEdgesState(newEdge);
      setEdges(newEdge);
      addStoreEdge(newEdge[newEdge.length - 1]);
    },
    [edges, setEdgesState, setEdges, addStoreEdge]
  );

  const handleNodeClick: NodeMouseHandler = useCallback(
    (event, node) => {
      if (onNodeClick) {
        onNodeClick(node.id, node.type || '');
      }
    },
    [onNodeClick]
  );

  // Store React Flow instance reference
  const reactFlowInstanceRef = useRef<ReactFlowInstance | null>(null);

  const onInit = useCallback((instance: ReactFlowInstance) => {
    reactFlowInstanceRef.current = instance;
  }, []);

  // Custom wheel handler that checks for modifier keys (Cmd/Ctrl)
  // When modifier is pressed: zoom
  // When no modifier: manually pan the canvas
  const onWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    if (!reactFlowInstanceRef.current) return;
    
    const isModifierPressed = event.metaKey || event.ctrlKey;
    
    if (isModifierPressed) {
      // Prevent default scroll behavior when zooming
      event.preventDefault();
      event.stopPropagation();
      
      // Calculate zoom delta from wheel event
      // Negative deltaY = scroll up = zoom in
      // Positive deltaY = scroll down = zoom out
      const zoomSensitivity = 0.1;
      const delta = event.deltaY > 0 ? -zoomSensitivity : zoomSensitivity;
      const currentZoom = reactFlowInstanceRef.current.getZoom();
      const newZoom = Math.max(0.1, Math.min(2, currentZoom + delta));
      
      // Get mouse position relative to the viewport
      const rect = event.currentTarget.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      
      // Convert screen coordinates to flow coordinates
      const flowPosition = reactFlowInstanceRef.current.screenToFlowPosition({ x, y });
      
      // Zoom to the point under the cursor
      reactFlowInstanceRef.current.zoomTo(newZoom, {
        x: flowPosition.x,
        y: flowPosition.y,
        duration: 0,
      });
    } else {
      // When no modifier, pan the canvas
      event.preventDefault();
      
      // Get pan speed from scroll delta
      // Negative values because we want to pan in the direction of scroll
      const panSpeed = 1;
      const deltaX = -event.deltaX * panSpeed;
      const deltaY = -event.deltaY * panSpeed;
      
      // Pan the viewport
      reactFlowInstanceRef.current.panBy({ x: deltaX, y: deltaY });
    }
  }, []);

  return (
    <div className="w-full h-full" ref={reactFlowWrapper}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={onConnect}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onNodeClick={handleNodeClick}
        onInit={onInit}
        onWheel={onWheel}
        nodeTypes={nodeTypes}
        fitView
        zoomOnScroll={false}
        zoomOnPinch={true}
        panOnScroll={true}
        panOnScrollMode="free"
        panOnScrollSpeed={1}
      >
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  );
};
