import { create } from 'zustand';
import type { FlowData } from '../types';
import { Node, Edge } from '@xyflow/react';

const normalizeNodes = (nodes: Node[]): Node[] => {
  const seen = new Set<string>();
  const unique: Node[] = [];

  for (let i = nodes.length - 1; i >= 0; i -= 1) {
    const node = nodes[i];
    if (!node?.id || seen.has(node.id)) {
      continue;
    }
    seen.add(node.id);
    unique.unshift(node);
  }

  return unique;
};

const normalizeEdges = (edges: Edge[], nodeIds: Set<string>): Edge[] => {
  const seen = new Set<string>();
  const unique: Edge[] = [];

  for (let i = edges.length - 1; i >= 0; i -= 1) {
    const edge = edges[i];
    if (!edge?.id || seen.has(edge.id)) {
      continue;
    }
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      continue;
    }
    seen.add(edge.id);
    unique.unshift(edge);
  }

  return unique;
};

interface FlowState {
  nodes: Node[];
  edges: Edge[];
  selectedNode: Node | null;
  addNode: (node: Node) => void;
  updateNode: (nodeId: string, updates: Partial<Node>) => void;
  deleteNode: (nodeId: string) => void;
  addEdge: (edge: Edge) => void;
  deleteEdge: (edgeId: string) => void;
  setNodes: (nodes: Node[]) => void;
  setEdges: (edges: Edge[]) => void;
  setSelectedNode: (node: Node | null) => void;
  clearFlow: () => void;
  getFlowData: () => FlowData;
  loadFlowData: (flowData: FlowData) => void;
}

export const useFlowStore = create<FlowState>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNode: null,

  addNode: (node: Node) => {
    set((state) => {
      const existingIndex = state.nodes.findIndex((existing) => existing.id === node.id);
      if (existingIndex === -1) {
        return { nodes: [...state.nodes, node] };
      }
      const updatedNodes = [...state.nodes];
      updatedNodes[existingIndex] = node;
      return { nodes: updatedNodes };
    });
  },

  updateNode: (nodeId: string, updates: Partial<Node>) => {
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === nodeId ? { ...node, ...updates } : node
      ),
    }));
  },

  deleteNode: (nodeId: string) => {
    set((state) => ({
      nodes: state.nodes.filter((node) => node.id !== nodeId),
      edges: state.edges.filter(
        (edge) => edge.source !== nodeId && edge.target !== nodeId
      ),
    }));
  },

  addEdge: (edge: Edge) => {
    set((state) => ({
      edges: [...state.edges, edge],
    }));
  },

  deleteEdge: (edgeId: string) => {
    set((state) => ({
      edges: state.edges.filter((edge) => edge.id !== edgeId),
    }));
  },

  setNodes: (nodes: Node[]) => {
    set({ nodes: normalizeNodes(nodes) });
  },

  setEdges: (edges: Edge[]) => {
    set({ edges });
  },

  setSelectedNode: (node: Node | null) => {
    set({ selectedNode: node });
  },

  clearFlow: () => {
    set({ nodes: [], edges: [], selectedNode: null });
  },

  getFlowData: (): FlowData => {
    const state = get();
    return {
      nodes: state.nodes.map((node) => ({
        id: node.id,
        type: node.type,
        position: node.position,
        data: node.data,
      })),
      edges: state.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
      })),
    };
  },

  loadFlowData: (flowData: FlowData) => {
    const nodes: Node[] = flowData.nodes.map((node) => ({
      id: node.id,
      type: node.type,
      position: node.position,
      data: node.data,
    }));

    const edges: Edge[] = flowData.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle,
      targetHandle: edge.targetHandle,
    }));

    const normalizedNodes = normalizeNodes(nodes);
    const nodeIds = new Set(normalizedNodes.map((node) => node.id));
    const normalizedEdges = normalizeEdges(edges, nodeIds);

    set({ nodes: normalizedNodes, edges: normalizedEdges });
  },
}));
