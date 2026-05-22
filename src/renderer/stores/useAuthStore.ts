import { create } from 'zustand';
import { UserRole } from '../../shared/types';
import { api } from '../bridge/api';

interface AuthStore {
  isAuthenticated: boolean;
  role: UserRole | null;
  isLoading: boolean;
  error: string | null;
  login: (password: string) => Promise<boolean>;
  logout: () => void;
  setPassword: (role: UserRole, password: string) => Promise<void>;
}

export const useAuthStore = create<AuthStore>((set) => ({
  isAuthenticated: false,
  role: null,
  isLoading: false,
  error: null,

  login: async (password: string) => {
    set({ isLoading: true, error: null });
    const result = await api.login(password);
    if (result.success) {
      set({ isAuthenticated: true, role: result.role, isLoading: false });
      return true;
    }
    set({ error: result.error ?? 'ログインに失敗しました', isLoading: false });
    return false;
  },

  logout: () => {
    api.logout();
    set({ isAuthenticated: false, role: null });
  },

  setPassword: async (role: UserRole, password: string) => {
    await api.setPassword(role, password);
  },
}));
