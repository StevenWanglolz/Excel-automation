import type { BlockDefinition } from '../types/block';

// This will be populated as we create block components
export const blockRegistry: Record<string, BlockDefinition> = {};

export const registerBlock = (definition: BlockDefinition) => {
  blockRegistry[definition.id] = definition;
};

export const getBlockDefinition = (blockId: string): BlockDefinition | undefined => {
  return blockRegistry[blockId];
};

export const getAllBlocks = (): BlockDefinition[] => {
  return Object.values(blockRegistry);
};

export const getBlocksByCategory = (category: string): BlockDefinition[] => {
  return Object.values(blockRegistry).filter((block) => block.category === category);
};

