import { useCallback, useMemo, useRef } from 'react';
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
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useFlowStore } from '../../store/flowStore';
import { UploadBlock } from '../blocks/UploadBlock';
import { FilterBlock } from '../blocks/FilterBlock';
import { TransformBlock } from '../blocks/TransformBlock';

const nodeTypes: NodeTypes = {
  upload: UploadBlock,
  filter: FilterBlock,
  transform: TransformBlock,
};

export const FlowCanvas = () => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const {
    nodes: storeNodes,
    edges: storeEdges,
    setNodes,
    setEdges,
    addEdge: addStoreEdge,
    addNode,
  } = useFlowStore();

  const [nodes, setNodesState, onNodesChange] = useNodesState(storeNodes);
  const [edges, setEdgesState, onEdgesChange] = useEdgesState(storeEdges);

  // Sync with store
  useMemo(() => {
    setNodesState(storeNodes);
  }, [storeNodes, setNodesState]);

  useMemo(() => {
    setEdgesState(storeEdges);
  }, [storeEdges, setEdgesState]);

  // Sync changes back to store
  const handleNodesChange = useCallback(
    (changes: any) => {
      onNodesChange(changes);
      // Update store after changes
      const updatedNodes = nodes.map((node) => {
        const change = changes.find((c: any) => c.id === node.id);
        if (change) {
          if (change.type === 'position' && change.position) {
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
        nodeTypes={nodeTypes}
        fitView
      >
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  );
};

