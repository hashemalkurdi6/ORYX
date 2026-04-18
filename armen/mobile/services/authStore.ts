import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

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

interface AuthState {
  token: string | null;
  user: User | null;
  setAuth: (token: string, user: User) => void;
  updateUser: (partial: Partial<User>) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setAuth: (token: string, user: User) => set({ token, user }),
      updateUser: (partial: Partial<User>) =>
        set((state) => ({ user: state.user ? { ...state.user, ...partial } : state.user })),
      clearAuth: () => set({ token: null, user: null }),
    }),
    {
      name: 'oryx-auth-storage',
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
