import { useState, useCallback, useRef } from 'react';
import type { FlowData } from '../types';

interface HistoryState {
  nodes: FlowData['nodes'];
  edges: FlowData['edges'];
}

const MAX_HISTORY = 50; // Maximum number of undo/redo steps

export const useUndoRedo = (initialState: HistoryState) => {
  const [history, setHistory] = useState<HistoryState[]>([initialState]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const isUndoRedoRef = useRef(false);
  const historyRef = useRef<HistoryState[]>([initialState]);
  const currentIndexRef = useRef(0);

  // Keep refs in sync with state
  historyRef.current = history;
  currentIndexRef.current = currentIndex;

  const canUndo = currentIndex > 0;
  const canRedo = currentIndex < history.length - 1;

  const addToHistory = useCallback((state: HistoryState) => {
    // Don't add to history if we're in the middle of undo/redo
    if (isUndoRedoRef.current) {
      isUndoRedoRef.current = false;
      return;
    }

    setHistory((prev) => {
      // Remove any future history if we're not at the end
      const idx = currentIndexRef.current;
      const newHistory = prev.slice(0, idx + 1);
      
      // Check if the new state is different from the current state
      const currentState = newHistory[idx];
      if (currentState && 
          JSON.stringify(currentState.nodes) === JSON.stringify(state.nodes) &&
          JSON.stringify(currentState.edges) === JSON.stringify(state.edges)) {
        // State hasn't changed, don't add to history
        return prev;
      }
      
      // Add new state (deep copy to avoid reference issues)
      const newState = {
        nodes: JSON.parse(JSON.stringify(state.nodes)),
        edges: JSON.parse(JSON.stringify(state.edges)),
      };
      const updated = [...newHistory, newState];
      
      // Limit history size
      if (updated.length > MAX_HISTORY) {
        return updated.slice(-MAX_HISTORY);
      }
      
      return updated;
    });
    
    setCurrentIndex((prev) => {
      const newIndex = prev + 1;
      // Limit index to history size
      const maxIndex = Math.min(newIndex, MAX_HISTORY - 1);
      currentIndexRef.current = maxIndex;
      return maxIndex;
    });
  }, []);

  const undo = useCallback((): HistoryState | null => {
    const idx = currentIndexRef.current;
    const hist = historyRef.current;
    
    if (idx <= 0) return null;
    
    isUndoRedoRef.current = true;
    const newIndex = idx - 1;
    const previousState = hist[newIndex];
    
    if (!previousState) {
      return null;
    }
    
    setCurrentIndex(newIndex);
    currentIndexRef.current = newIndex;
    
    // Return a deep copy to avoid reference issues
    return {
      nodes: JSON.parse(JSON.stringify(previousState.nodes)),
      edges: JSON.parse(JSON.stringify(previousState.edges)),
    };
  }, []);

  const redo = useCallback((): HistoryState | null => {
    const idx = currentIndexRef.current;
    const hist = historyRef.current;
    
    if (idx >= hist.length - 1) return null;
    
    isUndoRedoRef.current = true;
    const newIndex = idx + 1;
    const nextState = hist[newIndex];
    
    if (!nextState) {
      return null;
    }
    
    setCurrentIndex(newIndex);
    currentIndexRef.current = newIndex;
    
    // Return a deep copy to avoid reference issues
    return {
      nodes: JSON.parse(JSON.stringify(nextState.nodes)),
      edges: JSON.parse(JSON.stringify(nextState.edges)),
    };
  }, []);

  const reset = useCallback((state: HistoryState) => {
    setHistory([state]);
    setCurrentIndex(0);
    historyRef.current = [state];
    currentIndexRef.current = 0;
    isUndoRedoRef.current = false;
  }, []);

  return {
    addToHistory,
    undo,
    redo,
    canUndo,
    canRedo,
    reset,
  };
};

