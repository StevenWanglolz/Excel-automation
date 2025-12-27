import { useFlowStore } from '../../store/flowStore';

interface PropertiesPanelProps {
  selectedNodeId: string | null;
  onClose: () => void;
}

export const PropertiesPanel = ({ selectedNodeId, onClose }: PropertiesPanelProps) => {
  const { nodes } = useFlowStore();
  
  if (!selectedNodeId) {
    return null;
  }

  const node = nodes.find((n) => n.id === selectedNodeId);
  if (!node) {
    return null;
  }

  const nodeType = node.type || '';
  const nodeData = node.data || {};

  return (
    <div className="w-80 bg-white border-l border-gray-200 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">Properties</h2>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 transition-colors"
          title="Close"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="mb-4">
          <div className="block text-sm font-medium text-gray-700 mb-2">
            Block Type
          </div>
          <div className="text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded-md">
            {nodeData.label || nodeType || 'Unknown'}
          </div>
        </div>

        {/* Two-column configuration layout */}
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Configuration</h3>
            <div className="grid grid-cols-2 gap-3">
              {/* Left Column */}
              <div className="space-y-2">
                <div className="bg-gray-100 h-12 rounded-md flex items-center px-3">
                  <span className="text-sm text-gray-600">Option 1</span>
                </div>
                <div className="bg-gray-100 h-12 rounded-md flex items-center px-3">
                  <span className="text-sm text-gray-600">Option 2</span>
                </div>
                <div className="bg-gray-100 h-12 rounded-md flex items-center px-3">
                  <span className="text-sm text-gray-600">Option 3</span>
                </div>
              </div>

              {/* Right Column */}
              <div className="space-y-2">
                <div className="bg-gray-100 h-12 rounded-md flex items-center px-3">
                  <span className="text-sm text-gray-600">Option 4</span>
                </div>
                <div className="bg-gray-100 h-12 rounded-md flex items-center px-3">
                  <span className="text-sm text-gray-600">Option 5</span>
                </div>
                <div className="bg-gray-100 h-12 rounded-md flex items-center px-3">
                  <span className="text-sm text-gray-600">Option 6</span>
                </div>
              </div>
            </div>
          </div>

          {/* Node-specific content */}
          {nodeType === 'upload' && (
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Files</h3>
              {nodeData.fileIds && Array.isArray(nodeData.fileIds) && nodeData.fileIds.length > 0 ? (
                <div className="text-sm text-gray-600">
                  {nodeData.fileIds.length} file(s) attached
                </div>
              ) : (
                <div className="text-sm text-gray-400">No files attached</div>
              )}
            </div>
          )}

          {nodeType === 'filter' && (
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Filter Settings</h3>
              <div className="text-sm text-gray-400">Configure filter conditions</div>
            </div>
          )}

          {nodeType === 'transform' && (
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Transform Settings</h3>
              <div className="text-sm text-gray-400">Configure transform operations</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

