import { useNavigate } from 'react-router-dom';

export const AutomationTypeSelection = () => {
  const navigate = useNavigate();

  const handleSelectAutomation = (automationType: string) => {
    // Navigate to flow builder with the selected automation type
    navigate(`/flow-builder?type=${automationType}`);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center space-x-8">
              <button
                onClick={() => navigate('/')}
                className="text-xl font-bold text-gray-900 hover:text-indigo-600 transition-colors"
              >
                SheetPilot
              </button>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate('/')}
                className="text-sm text-gray-600 hover:text-gray-900 font-medium"
              >
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div>
          {/* Header */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Select Automation Type</h2>
            <p className="text-gray-600">Choose the type of automation you want to create</p>
          </div>

          {/* Automation Type Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {/* Excel Automation Card */}
            <button
              type="button"
              onClick={() => handleSelectAutomation('excel')}
              className="bg-white rounded-lg border-2 border-gray-200 hover:border-indigo-500 transition-all cursor-pointer p-6 min-h-[180px] flex flex-col justify-center items-center shadow-sm hover:shadow-md group"
            >
              <div className="text-5xl mb-4">📊</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Excel</h3>
              <p className="text-sm text-gray-500 text-center">Excel automation and data processing</p>
            </button>

            {/* Placeholder cards for future automations */}
            {[1, 2, 3, 4, 5, 6, 7].map((i) => (
              <div
                key={i}
                className="bg-gray-50 rounded-lg border-2 border-dashed border-gray-300 p-6 min-h-[180px] flex flex-col justify-center items-center opacity-60 cursor-not-allowed"
              >
                <div className="text-3xl mb-3 text-gray-400">+</div>
                <p className="text-sm text-gray-400">Coming soon</p>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
};

