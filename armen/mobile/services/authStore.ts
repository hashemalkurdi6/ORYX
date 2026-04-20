import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';

export interface User {
  id: string;
  email: string;
  strava_connected: boolean;
  whoop_connected: boolean;
  oura_connected: boolean;
  hevy_connected?: boolean;
  username: string | null;
  full_name: string | null;
  bio: string | null;
  location: string | null;
  sports: string[] | null;
  weight_kg?: number | null;
  followers_count: number;
  following_count: number;
  created_at: string;
  avatar_url?: string | null;
  // Onboarding fields
  display_name?: string | null;
  sport_tags?: string[] | null;
  primary_goal?: string | null;
  fitness_level?: string | null;
  weekly_training_days?: string | null;
  age?: number | null;
  height_cm?: number | null;
  biological_sex?: string | null;
  daily_calorie_target?: number | null;
  preferred_training_time?: string | null;
  onboarding_complete?: boolean;
  current_onboarding_step?: number;
}

// ── Token storage (SecureStore on native, localStorage on web) ────────────────
// SecureStore persists to iOS Keychain / Android Keystore — encrypted at rest.
// Web fallback uses localStorage since SecureStore isn't available.
const TOKEN_KEY = 'oryx_auth_token';
const isWeb = Platform.OS === 'web';

export async function getStoredToken(): Promise<string | null> {
  if (isWeb) {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  }
  try { return await SecureStore.getItemAsync(TOKEN_KEY); } catch { return null; }
}

async function setStoredToken(token: string): Promise<void> {
  if (isWeb) {
    try { localStorage.setItem(TOKEN_KEY, token); } catch {}
    return;
  }
  try { await SecureStore.setItemAsync(TOKEN_KEY, token); } catch {}
}

async function clearStoredToken(): Promise<void> {
  if (isWeb) {
    try { localStorage.removeItem(TOKEN_KEY); } catch {}
    return;
  }
  try { await SecureStore.deleteItemAsync(TOKEN_KEY); } catch {}
}

// ── User profile storage (AsyncStorage, non-sensitive) ────────────────────────
const userStorage: StateStorage = {
  getItem: (name) => AsyncStorage.getItem(name),
  setItem: (name, value) => AsyncStorage.setItem(name, value),
  removeItem: (name) => AsyncStorage.removeItem(name),
};

interface AuthState {
  token: string | null;
  user: User | null;
  setAuth: (token: string, user: User) => void;
  updateUser: (partial: Partial<User>) => void;
  clearAuth: () => void;
  hydrateToken: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setAuth: (token: string, user: User) => {
        void setStoredToken(token);
        set({ token, user });
      },
      updateUser: (partial: Partial<User>) =>
        set((state) => ({ user: state.user ? { ...state.user, ...partial } : state.user })),
      clearAuth: () => {
        void clearStoredToken();
        set({ token: null, user: null });
      },
      hydrateToken: async () => {
        const token = await getStoredToken();
        if (token) set({ token });
      },
    }),
    {
      name: 'oryx-auth-storage',
      storage: createJSONStorage(() => userStorage),
      // Only persist user profile to AsyncStorage. Token lives in SecureStore.
      partialize: (state) => ({ user: state.user }) as AuthState,
    }
  )
);
