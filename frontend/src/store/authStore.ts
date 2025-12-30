import { create } from 'zustand';
import type { User } from '../types';
import { authApi, type LoginCredentials, type RegisterData } from '../api/auth';

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAuthBypass: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  // Load token from localStorage on store initialization
  // This allows app to remember login state across page refreshes
  token: localStorage.getItem('access_token'),
  isLoading: false,
  // Check if token exists to determine auth state
  // !! converts truthy/falsy to boolean
  isAuthenticated: !!localStorage.getItem('access_token'),
  isAuthBypass: false,

  login: async (credentials: LoginCredentials) => {
    set({ isLoading: true });
    try {
      const response = await authApi.login(credentials);
      // Store token in localStorage for persistence across page refreshes
      // Token is used by API client interceptor to authenticate requests
      localStorage.setItem('access_token', response.access_token);
      // Fetch user data after login to populate user info in store
      const user = await authApi.getCurrentUser();
      set({
        user,
        token: response.access_token,
        isAuthenticated: true,
        isLoading: false,
        isAuthBypass: false,
      });
    } catch (error) {
      set({ isLoading: false });
      // Re-throw error so component can handle it (show error message)
      throw error;
    }
  },

  register: async (data: RegisterData) => {
    set({ isLoading: true });
    try {
      await authApi.register(data);
      // Auto-login after registration - better UX than forcing user to login again
      // Uses same credentials they just registered with
      const response = await authApi.login({
        username: data.email,
        password: data.password,
      });
      localStorage.setItem('access_token', response.access_token);
      const user = await authApi.getCurrentUser();
      set({
        user,
        token: response.access_token,
        isAuthenticated: true,
        isLoading: false,
        isAuthBypass: false,
      });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  logout: () => {
    // Remove token from localStorage - prevents automatic re-authentication
    localStorage.removeItem('access_token');
    // Clear all auth state - user must login again to access protected routes
    set({
      user: null,
      token: null,
      isAuthenticated: false,
      isAuthBypass: false,
    });
  },

  checkAuth: async () => {
    // Verify if stored token is still valid by calling API
    // Called on app startup to restore auth state
    const token = localStorage.getItem('access_token');
    try {
      set({ isLoading: true });
      if (!token) {
        // Backend auth bypass may allow this request without a token.
        const user = await authApi.getCurrentUser();
        set({
          user,
          token: null,
          isAuthenticated: true,
          isLoading: false,
          isAuthBypass: true,
        });
        return;
      }
      // If API call succeeds, token is valid and user is authenticated
      const user = await authApi.getCurrentUser();
      set({
        user,
        token,
        isAuthenticated: true,
        isLoading: false,
        isAuthBypass: false,
      });
    } catch (error) {
      // Token is invalid (expired, tampered, etc.) - clear it and log user out
      // Prevents app from thinking user is logged in when they're not
      localStorage.removeItem('access_token');
      set({
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
        isAuthBypass: false,
      });
    }
  },
}));
