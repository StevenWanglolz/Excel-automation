import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FlowCanvas } from './FlowCanvas';
import { BlockPalette } from './BlockPalette';
import { useFlowStore } from '../../store/flowStore';
import { flowsApi, type Flow } from '../../api/flows';

export const FlowBuilder = () => {
  const navigate = useNavigate();
  const { nodes, edges, getFlowData, clearFlow, loadFlowData } = useFlowStore();
  const [flowName, setFlowName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [savedFlows, setSavedFlows] = useState<Flow[]>([]);
  const [selectedFlowId, setSelectedFlowId] = useState<number | null>(null);
  const [isLoadingFlows, setIsLoadingFlows] = useState(false);
  const [showFlowList, setShowFlowList] = useState(false);

  useEffect(() => {
    loadFlows();
  }, []);

  useEffect(() => {
    // Close dropdown when clicking outside
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.flow-list-dropdown')) {
        setShowFlowList(false);
      }
    };

    if (showFlowList) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showFlowList]);

  const loadFlows = async () => {
    setIsLoadingFlows(true);
    try {
      const flows = await flowsApi.list();
      setSavedFlows(flows);
    } catch (error) {
      console.error('Failed to load flows:', error);
    } finally {
      setIsLoadingFlows(false);
    }
  };

  const handleSave = async () => {
    if (!flowName.trim()) {
      alert('Please enter a flow name');
      return;
    }

    setIsSaving(true);
    try {
      const flowData = getFlowData();
      
      if (selectedFlowId) {
        // Update existing flow
        await flowsApi.update(selectedFlowId, {
          name: flowName,
          description: '',
          flow_data: flowData,
        });
        alert('Flow updated successfully!');
      } else {
        // Create new flow
      await flowsApi.create({
        name: flowName,
        description: '',
        flow_data: flowData,
      });
      alert('Flow saved successfully!');
      setFlowName('');
        setSelectedFlowId(null);
      }
      
      await loadFlows();
    } catch (error) {
      console.error('Failed to save flow:', error);
      alert('Failed to save flow');
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoadFlow = async (flow: Flow) => {
    try {
      const fullFlow = await flowsApi.get(flow.id);
      loadFlowData(fullFlow.flow_data);
      setFlowName(fullFlow.name);
      setSelectedFlowId(fullFlow.id);
      setShowFlowList(false);
    } catch (error) {
      console.error('Failed to load flow:', error);
      alert('Failed to load flow');
    }
  };

  const handleNewFlow = () => {
    clearFlow();
    setFlowName('');
    setSelectedFlowId(null);
    setShowFlowList(false);
  };

  const handleDeleteFlow = async (flowId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this flow?')) {
      return;
    }

    try {
      await flowsApi.delete(flowId);
      if (selectedFlowId === flowId) {
        handleNewFlow();
      }
      await loadFlows();
      alert('Flow deleted successfully!');
    } catch (error) {
      console.error('Failed to delete flow:', error);
      alert('Failed to delete flow');
    }
  };

  return (
    <div className="flex h-screen bg-gray-100">
      <BlockPalette />
      <div className="flex-1 flex flex-col">
        <div className="bg-white border-b border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate('/')}
                className="px-3 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
                title="Back to Dashboard"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </button>
            <h1 className="text-xl font-bold">Flow Builder</h1>
            </div>
            <div className="flex items-center space-x-4">
              <div className="relative flow-list-dropdown">
                <button
                  onClick={() => setShowFlowList(!showFlowList)}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm flex items-center space-x-2"
                >
                  <span>📋 Saved Flows</span>
                  <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded">
                    {savedFlows.length}
                  </span>
                </button>
                {showFlowList && (
                  <div className="absolute top-full right-0 mt-2 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto flow-list-dropdown">
                    <div className="p-2 border-b border-gray-200">
                      <button
                        onClick={handleNewFlow}
                        className="w-full px-3 py-2 text-left text-sm text-indigo-600 hover:bg-indigo-50 rounded"
                      >
                        + New Flow
                      </button>
                    </div>
                    {isLoadingFlows ? (
                      <div className="p-4 text-center text-sm text-gray-500">Loading...</div>
                    ) : savedFlows.length === 0 ? (
                      <div className="p-4 text-center text-sm text-gray-500">No saved flows</div>
                    ) : (
                      <div className="divide-y divide-gray-200">
                        {savedFlows.map((flow) => (
                          <div
                            key={flow.id}
                            onClick={() => handleLoadFlow(flow)}
                            className={`p-3 cursor-pointer hover:bg-gray-50 ${
                              selectedFlowId === flow.id ? 'bg-indigo-50' : ''
                            }`}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <p className="text-sm font-medium text-gray-900">{flow.name}</p>
                                {flow.description && (
                                  <p className="text-xs text-gray-500 mt-1">{flow.description}</p>
                                )}
                                <p className="text-xs text-gray-400 mt-1">
                                  {new Date(flow.created_at).toLocaleDateString()}
                                </p>
                              </div>
                              <button
                                onClick={(e) => handleDeleteFlow(flow.id, e)}
                                className="ml-2 text-red-600 hover:text-red-800 text-sm"
                                title="Delete flow"
                              >
                                ×
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <input
                type="text"
                placeholder="Flow name"
                value={flowName}
                onChange={(e) => setFlowName(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
              <button
                onClick={handleSave}
                disabled={isSaving || !flowName.trim()}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? 'Saving...' : selectedFlowId ? 'Update Flow' : 'Save Flow'}
              </button>
              <button
                onClick={clearFlow}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
              >
                Clear
              </button>
            </div>
          </div>
        </div>
        <div className="flex-1 relative">
          <FlowCanvas />
        </div>
      </div>
    </div>
  );
};

