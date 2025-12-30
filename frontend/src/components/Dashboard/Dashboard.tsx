import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { ConfirmationModal } from '../Common/ConfirmationModal';
import { flowsApi } from '../../api/flows';
import type { Flow } from '../../types';

export const Dashboard = () => {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [flows, setFlows] = useState<Flow[]>([]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showAlertModal, setShowAlertModal] = useState(false);
  const [flowToDelete, setFlowToDelete] = useState<number | null>(null);
  const [alertMessage, setAlertMessage] = useState('');

  useEffect(() => {
    // Load all flows by default
    loadFlows();
  }, []);

  const loadFlows = async () => {
    try {
      const flowList = await flowsApi.list();
      setFlows(flowList);
    } catch (error) {
      console.error('Failed to load flows:', error);
    }
  };

  const handleFlowClick = (flowId: number) => {
    navigate(`/flow-builder?flow=${flowId}`);
  };

  const handleCreateNewFlow = () => {
    navigate('/new-automation');
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
        <div>
          {/* Header with New Automation Button */}
          <div className="mb-6 flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">My Automations</h2>
              <p className="text-gray-600">View and manage your saved automation flows</p>
            </div>
            <button
              onClick={handleCreateNewFlow}
              className="px-6 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm font-medium shadow-sm hover:shadow-md transition-all flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Automation
            </button>
          </div>

          {/* Flows Grid */}
          {flows.length === 0 ? (
            <div className="bg-white rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
              <div className="text-4xl mb-4">📋</div>
              <p className="text-gray-600 mb-4">No automations created yet</p>
              <button
                onClick={handleCreateNewFlow}
                className="px-6 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm font-medium shadow-sm hover:shadow-md transition-all"
              >
                Create Your First Automation
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {flows.map((flow) => (
                <div
                  key={flow.id}
                  className="bg-white rounded-lg border-2 border-gray-200 hover:border-indigo-500 transition-all cursor-pointer p-6 min-h-[136px] shadow-sm hover:shadow-md group relative text-left w-full"
                  onClick={() => handleFlowClick(flow.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      handleFlowClick(flow.id);
                    }
                  }}
                  role="button"
                  tabIndex={0}
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
