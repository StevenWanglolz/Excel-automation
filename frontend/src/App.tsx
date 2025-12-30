import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { Login } from './components/Auth/Login';
import { Register } from './components/Auth/Register';
import { ProtectedRoute } from './components/Auth/ProtectedRoute';
import { Dashboard } from './components/Dashboard/Dashboard';
import { FlowBuilder } from './components/FlowBuilder/FlowBuilder';
import { AutomationTypeSelection } from './components/AutomationTypeSelection/AutomationTypeSelection';

function App() {
  const { checkAuth, isAuthenticated, isAuthBypass } = useAuthStore();

  // Check authentication status on app mount
  // Verifies if stored token is still valid and restores user session
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return (
    <BrowserRouter
      // Enable React Router v7 features for better performance
      future={{
        v7_startTransition: true,  // Use startTransition for route changes
        v7_relativeSplatPath: true,  // Improved relative path handling
      }}
    >
      {isAuthBypass && (
        <div className="fixed bottom-4 right-4 z-50 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800 shadow-sm">
          Auth bypass enabled
        </div>
      )}
      <Routes>
        {/* Public routes - redirect to dashboard if already logged in */}
        <Route path="/login" element={isAuthenticated ? <Navigate to="/" /> : <Login />} />
        <Route path="/register" element={isAuthenticated ? <Navigate to="/" /> : <Register />} />
        
        {/* Protected routes - require authentication */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/new-automation"
          element={
            <ProtectedRoute>
              <AutomationTypeSelection />
            </ProtectedRoute>
          }
        />
        <Route
          path="/flow-builder"
          element={
            <ProtectedRoute>
              <FlowBuilder />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
