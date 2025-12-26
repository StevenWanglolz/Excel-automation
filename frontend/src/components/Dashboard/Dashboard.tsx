import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { ConfirmationModal } from '../Common/ConfirmationModal';
import { flowsApi, type Flow } from '../../api/flows';

export const Dashboard = () => {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [flows, setFlows] = useState<Flow[]>([]);
  const [selectedAutomation, setSelectedAutomation] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [flowToDelete, setFlowToDelete] = useState<number | null>(null);
  const [alertMessage, setAlertMessage] = useState('');

  useEffect(() => {
    if (selectedAutomation) {
      loadFlows();
    }
  }, [selectedAutomation]);

  const loadFlows = async () => {
    try {
      const flowList = await flowsApi.list();
      setFlows(flowList);
    } catch (error) {
      console.error('Failed to load flows:', error);
    }
  };

  const handleAutomationClick = (automationType: string) => {
    setSelectedAutomation(automationType);
  };

  const handleBackToAutomations = () => {
    setSelectedAutomation(null);
  };

  const handleFlowClick = (flowId: number) => {
    navigate(`/flow-builder?flow=${flowId}`);
  };

  const handleCreateNewFlow = () => {
    navigate('/flow-builder');
  };

  const handleDeleteFlow = async (flowId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setFlowToDelete(flowId);
    setShowDeleteModal(true);
  };

  const confirmDeleteFlow = async () => {
    if (!flowToDelete) return;
    
    try {
      await flowsApi.delete(flowToDelete);
      loadFlows();
      setShowDeleteModal(false);
      setFlowToDelete(null);
    } catch (error) {
      console.error('Failed to delete flow:', error);
      setShowDeleteModal(false);
      setAlertMessage('Failed to delete flow');
      setShowAlertModal(true);
      setFlowToDelete(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center space-x-8">
              <h1 className="text-xl font-bold text-gray-900">SheetPilot</h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-700">{user?.email}</span>
              <button
                onClick={logout}
                className="text-sm text-indigo-600 hover:text-indigo-500 font-medium"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!selectedAutomation ? (
          <div>
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Automations</h2>
              <p className="text-gray-600">Select an automation type to view your flows</p>
            </div>

            {/* Automation Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {/* Excel Automation Card */}
              <div
                className="bg-white rounded-lg border-2 border-gray-200 hover:border-indigo-500 transition-colors cursor-pointer p-6 min-h-[136px] flex flex-col justify-center items-center shadow-sm hover:shadow-md"
                onClick={() => handleAutomationClick('excel')}
              >
                <div className="text-4xl mb-2">📊</div>
                <h3 className="text-lg font-semibold text-gray-900">Excel</h3>
                <p className="text-sm text-gray-500 mt-1">Excel automation</p>
              </div>

              {/* Placeholder cards for future automations */}
              {[1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="bg-gray-50 rounded-lg border-2 border-dashed border-gray-300 p-6 min-h-[136px] flex flex-col justify-center items-center opacity-60"
                >
                  <div className="text-2xl mb-2 text-gray-400">+</div>
                  <p className="text-sm text-gray-400">Coming soon</p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <div className="mb-6">
              <button
                onClick={handleBackToAutomations}
                className="mb-4 flex items-center text-sm text-gray-600 hover:text-gray-900 transition-colors"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Back to Automations
              </button>
              <h2 className="text-2xl font-bold text-gray-900 mb-2 capitalize">
                {selectedAutomation} Flows
              </h2>
              <p className="text-gray-600">Your saved {selectedAutomation} automation flows</p>
            </div>

            {/* Flows Grid */}
            {flows.length === 0 ? (
              <div className="bg-white rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
                <div className="text-4xl mb-4">📋</div>
                <p className="text-gray-600 mb-4">No flows created yet</p>
                <button
                  onClick={handleCreateNewFlow}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm font-medium"
                >
                  Create Your First Flow
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {flows.map((flow) => (
                  <div
                    key={flow.id}
                    className="bg-white rounded-lg border-2 border-gray-200 hover:border-indigo-500 transition-all cursor-pointer p-6 min-h-[136px] shadow-sm hover:shadow-md group relative"
                    onClick={() => handleFlowClick(flow.id)}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">{flow.name}</h3>
                      <button
                        onClick={(e) => handleDeleteFlow(flow.id, e)}
                        className="opacity-0 group-hover:opacity-100 text-red-600 hover:text-red-800 text-lg font-bold transition-opacity"
                        title="Delete flow"
                      >
                        ×
                      </button>
                    </div>
                    {flow.description && (
                      <p className="text-sm text-gray-500 mb-3">{flow.description}</p>
                    )}
                    <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
                      <p className="text-xs text-gray-400">
                        {new Date(flow.created_at).toLocaleDateString()}
                      </p>
                      <span className="text-xs text-indigo-600 font-medium">View →</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setFlowToDelete(null);
        }}
        onConfirm={confirmDeleteFlow}
        title="Delete Flow"
        message="Are you sure you want to delete this flow? This action cannot be undone."
        type="confirm"
        confirmText="Delete"
      />

      {/* Alert Modal */}
      <ConfirmationModal
        isOpen={showAlertModal}
        onClose={() => setShowAlertModal(false)}
        title="Error"
        message={alertMessage}
        type="error"
        showCancel={false}
      />
    </div>
  );
};
