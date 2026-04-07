import axios, { AxiosInstance } from 'axios';
import { router } from 'expo-router';
import { useAuthStore } from './authStore';

// ── Types ──────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  strava_connected: boolean;
  created_at: string;
}

export interface Activity {
  id: string;
  user_id: string;
  strava_id: number;
  name: string;
  sport_type: string;
  start_date: string;
  distance_meters: number | null;
  elapsed_time_seconds: number;
  moving_time_seconds: number;
  avg_heart_rate: number | null;
  max_heart_rate: number | null;
  avg_pace_seconds_per_km: number | null;
  total_elevation_gain: number | null;
  autopsy_text: string | null;
  autopsy_generated_at: string | null;
  created_at: string;
  pace_per_km_str: string;
}

export interface HealthSnapshotIn {
  date: string; // ISO date string YYYY-MM-DD
  sleep_duration_hours?: number | null;
  sleep_quality_score?: number | null;
  hrv_ms?: number | null;
  resting_heart_rate?: number | null;
  steps?: number | null;
  active_energy_kcal?: number | null;
}

export interface HealthSnapshot {
  id: string;
  user_id: string;
  date: string;
  sleep_duration_hours: number | null;
  sleep_quality_score: number | null;
  hrv_ms: number | null;
  resting_heart_rate: number | null;
  steps: number | null;
  active_energy_kcal: number | null;
  created_at: string;
}

export interface DiagnosisResult {
  diagnosis: string;
  main_factor: string;
  recommendation: string;
  recovery_score: number;
  recovery_color: 'green' | 'yellow' | 'red';
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
}

export interface ActivityListResponse {
  activities: Activity[];
  total: number;
}

// ── Axios Instance ─────────────────────────────────────────────────────────

const apiClient: AxiosInstance = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: attach Bearer token if available
apiClient.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().token;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: handle 401 by clearing auth and redirecting
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().clearAuth();
      try {
        router.replace('/(auth)/login');
      } catch {
        // Router may not be ready during initialization — ignore
      }
    }
    return Promise.reject(error);
  }
);

// ── Auth ───────────────────────────────────────────────────────────────────

export async function signup(
  email: string,
  password: string
): Promise<AuthResponse> {
  const response = await apiClient.post<AuthResponse>('/auth/signup', {
    email,
    password,
  });
  return response.data;
}

export async function login(
  email: string,
  password: string
): Promise<AuthResponse> {
  const response = await apiClient.post<AuthResponse>('/auth/login', {
    email,
    password,
  });
  return response.data;
}

export async function getMe(): Promise<User> {
  const response = await apiClient.get<User>('/auth/me');
  return response.data;
}

// ── Strava ─────────────────────────────────────────────────────────────────

export async function getStravaAuthUrl(): Promise<{ url: string; state: string }> {
  const response = await apiClient.get<{ url: string; state: string }>(
    '/strava/auth-url'
  );
  return response.data;
}

export async function syncStrava(): Promise<void> {
  await apiClient.post('/strava/sync');
}

export async function getActivities(
  page = 1,
  perPage = 20
): Promise<Activity[]> {
  const response = await apiClient.get<ActivityListResponse>(
    '/strava/activities',
    { params: { page, per_page: perPage } }
  );
  return response.data.activities;
}

// ── Health ─────────────────────────────────────────────────────────────────

export async function uploadHealthSnapshots(
  snapshots: HealthSnapshotIn[]
): Promise<void> {
  await apiClient.post('/health/snapshots', { snapshots });
}

export async function getHealthSnapshots(
  days = 7
): Promise<HealthSnapshot[]> {
  const response = await apiClient.get<HealthSnapshot[]>(
    '/health/snapshots',
    { params: { days } }
  );
  return response.data;
}

// ── Diagnosis ──────────────────────────────────────────────────────────────

export async function getDailyDiagnosis(): Promise<DiagnosisResult> {
  const response = await apiClient.get<DiagnosisResult>('/diagnosis/daily');
  return response.data;
}

export async function getWorkoutAutopsy(
  activityId: string
): Promise<{ autopsy: string }> {
  const response = await apiClient.post<{ autopsy: string }>(
    `/diagnosis/autopsy/${activityId}`
  );
  return response.data;
}

export default apiClient;
