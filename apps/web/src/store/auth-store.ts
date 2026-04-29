import { create } from "zustand";

export type AuthUser = {
  id: string;
  firstName: string;
  lastName: string | null;
  username: string;
  email: string;
  displayName: string | null;
  bio: string | null;
  nameEmoji: string | null;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt?: string;
};

type AuthState = {
  accessToken: string | null;
  currentUser: AuthUser | null;
  user: AuthUser | null;
  getAccessToken: () => string | null;
  setAccessToken: (accessToken: string | null) => void;
  setCurrentUser: (user: AuthUser | null) => void;
  setUser: (user: AuthUser | null) => void;
  clearAuth: () => void;
};

export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: null,
  currentUser: null,
  user: null,
  getAccessToken: () => get().accessToken,
  setAccessToken: (accessToken) => set({ accessToken }),
  setCurrentUser: (user) => set({ currentUser: user, user }),
  setUser: (user) => set({ currentUser: user, user }),
  clearAuth: () => set({ accessToken: null, currentUser: null, user: null }),
}));

export function getAccessToken() {
  return useAuthStore.getState().getAccessToken();
}

export function setAccessToken(accessToken: string | null) {
  useAuthStore.getState().setAccessToken(accessToken);
}
