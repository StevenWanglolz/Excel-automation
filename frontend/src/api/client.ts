import axios from 'axios';

// Get API URL from environment variable or use default
// VITE_ prefix is required for Vite to expose env vars to client code
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';

// Create axios instance with base configuration
// All API calls use this client, ensuring consistent base URL and headers
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: Add auth token to every request
// This ensures authenticated requests automatically include the token
// Without this, we'd need to manually add token to every API call
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    // Add Bearer token to Authorization header (JWT standard)
    config.headers.Authorization = `Bearer ${token}`;
  }
  // Don't set Content-Type for FormData - browser needs to set it with boundary
  // If we set it manually, file uploads will fail
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  }
  return config;
});

// Response interceptor: Handle authentication errors
// Automatically logs user out if token is invalid (401 Unauthorized)
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // 401 means token is invalid/expired - user needs to login again
    if (error.response?.status === 401) {
      // Clear invalid token
      localStorage.removeItem('access_token');
      // Redirect to login page
      // Using window.location instead of navigate() because this runs outside React context
      window.location.href = '/login';
    }
    // Re-throw error so calling code can handle it
    return Promise.reject(error);
  }
);

export default apiClient;

