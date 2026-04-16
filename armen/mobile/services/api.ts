import axios, { AxiosInstance } from 'axios';
import { router } from 'expo-router';
import { useAuthStore } from './authStore';

// ── Types ──────────────────────────────────────────────────────────────────

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

export interface OnboardingData {
  display_name?: string;
  sport_tags?: string[];
  primary_goal?: string;
  fitness_level?: string;
  weekly_training_days?: string;
  age?: number;
  weight_kg?: number;
  height_cm?: number;
  biological_sex?: string;
  daily_calorie_target?: number;
  preferred_training_time?: string;
  onboarding_complete?: boolean;
  current_onboarding_step?: number;
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

export interface WhoopData {
  id: string;
  user_id: string;
  date: string;
  recovery_score: number | null;
  hrv_rmssd: number | null;
  resting_heart_rate: number | null;
  sleep_performance_pct: number | null;
  strain_score: number | null;
  created_at: string;
}

export interface OuraData {
  id: string;
  user_id: string;
  date: string;
  readiness_score: number | null;
  sleep_score: number | null;
  hrv_average: number | null;
  rem_sleep_minutes: number | null;
  deep_sleep_minutes: number | null;
  light_sleep_minutes: number | null;
  sleep_efficiency: number | null;
  created_at: string;
}

export interface WellnessCheckin {
  id: string;
  user_id: string;
  date: string;
  mood: number;
  energy: number;
  soreness: number;
  notes: string | null;
  created_at: string;
}

export interface WellnessCheckinIn {
  date: string;
  mood: number;
  energy: number;
  soreness: number;
  notes?: string;
}

export interface NutritionLog {
  id: string;
  user_id: string;
  logged_at: string;
  meal_name: string;
  description: string | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fibre_g: number | null;
  meal_type: string | null;
  source: string | null;
  photo_url: string | null;
  notes: string | null;
  created_at: string;
}

export interface NutritionLogIn {
  meal_name: string;
  description?: string;
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fat_g?: number;
  fibre_g?: number;
  meal_type?: string;
  source?: string;
  notes?: string;
}

export interface FoodScanResult {
  food_name: string;
  description: string;
  serving_estimate: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fibre_g: number;
  confidence: 'low' | 'medium' | 'high';
  low_confidence: boolean;
}

// ── Food Database ──────────────────────────────────────────────────────────

export interface FoodItem {
  id: string;
  name: string;
  brand: string | null;
  source: 'openfoodfacts' | 'usda' | 'custom';
  calories_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
  fibre_100g: number;
  sugar_100g: number;
  sodium_100g: number;
  serving_size_g: number | null;
  serving_unit: string | null;
}

export interface FoodSearchResponse {
  query: string;
  results: FoodItem[];
  cached: boolean;
}

export interface RecentFoodItem {
  meal_name: string;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fibre_g: number | null;
  last_logged: string;
}

export interface FrequentFoodItem {
  meal_name: string;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fibre_g: number | null;
  log_count: number;
}

export interface CustomFoodIn {
  food_name: string;
  brand?: string;
  calories_100g?: number;
  protein_100g?: number;
  carbs_100g?: number;
  fat_100g?: number;
  fibre_100g?: number;
  sugar_100g?: number;
  sodium_100g?: number;
  serving_size_g?: number;
  serving_unit?: string;
}

export interface CustomFoodOut {
  id: string;
  user_id: string;
  food_name: string;
  brand?: string | null;
  calories_100g: number;
  protein_100g: number;
  carbs_100g: number;
  fat_100g: number;
  fibre_100g: number;
  sugar_100g: number;
  sodium_100g: number;
  serving_size_g?: number | null;
  serving_unit?: string | null;
  created_at: string;
}

// ── Deload Detector ────────────────────────────────────────────────────────

export interface SignalScore {
  score: number;
  label: string;
  explanation: string;
  data_available: boolean;
}

export interface DeloadRecommendation {
  overall_score: number;
  recommendation: 'none' | 'consider' | 'recommended' | 'urgent';
  confidence: 'low' | 'medium' | 'high';
  primary_reason: string;
  signals: SignalScore[];
  suggested_duration_days: number;
  data_days: number;
  analysis_date: string;
}

// ── Warm-Up Personalizer ───────────────────────────────────────────────────

export interface WarmUpExercise {
  name: string;
  detail: string;
  note?: string;
}

export interface WarmUpPhase {
  phase: string;
  exercises: WarmUpExercise[];
}

export interface WarmUpProtocol {
  summary: string;
  duration_minutes: number;
  phases: WarmUpPhase[];
}

export interface WarmUpRequest {
  muscle_groups: string[];
  session_type: string;
  sleep_score?: number;
  soreness?: number;
  energy?: number;
  recent_muscle_work?: Record<string, number>;
}

export interface UserProfileUpdate {
  username?: string;
  full_name?: string;
  bio?: string;
  location?: string;
  sports?: string[];
  weight_kg?: number;
}

// ── Axios Instance ─────────────────────────────────────────────────────────

const apiClient: AxiosInstance = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL || 'http://192.168.1.160:8000',
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

export async function signupWithProfile(
  email: string,
  password: string,
  username?: string,
  full_name?: string,
  sports?: string[]
): Promise<AuthResponse> {
  const response = await apiClient.post<AuthResponse>('/auth/signup', {
    email,
    password,
    username,
    full_name,
    sports,
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

export async function updateProfile(data: UserProfileUpdate): Promise<User> {
  const response = await apiClient.put<User>('/auth/profile', data);
  return response.data;
}

export interface SignupCompletePayload {
  email: string;
  password: string;
  username?: string;
  full_name?: string;
  display_name?: string;
  sport_tags?: string[];
  primary_goal?: string;
  fitness_level?: string;
  weekly_training_days?: string;
  age?: number;
  date_of_birth?: string;
  weight_kg?: number;
  height_cm?: number;
  biological_sex?: string;
  daily_calorie_target?: number;
  preferred_training_time?: string;
}

export async function signupComplete(data: SignupCompletePayload): Promise<AuthResponse> {
  const response = await apiClient.post<AuthResponse>('/auth/signup', data);
  return response.data;
}

export async function checkUsername(username: string): Promise<{ available: boolean }> {
  const response = await apiClient.get<{ available: boolean }>(
    `/auth/check-username?username=${encodeURIComponent(username)}`
  );
  return response.data;
}

export async function patchOnboarding(data: OnboardingData): Promise<User> {
  const response = await apiClient.patch<User>('/auth/me/onboarding', data);
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

// ── WHOOP ──────────────────────────────────────────────────────────────────

export async function getWhoopAuthUrl(): Promise<{ url: string; state: string }> {
  const response = await apiClient.get<{ url: string; state: string }>(
    '/whoop/auth-url'
  );
  return response.data;
}

export async function syncWhoop(): Promise<{ synced: number }> {
  const response = await apiClient.post<{ synced: number }>('/whoop/sync');
  return response.data;
}

export async function getWhoopData(days = 7): Promise<WhoopData[]> {
  const response = await apiClient.get<WhoopData[]>('/whoop/data', {
    params: { days },
  });
  return response.data;
}

// ── Oura ───────────────────────────────────────────────────────────────────

export async function getOuraAuthUrl(): Promise<{ url: string; state: string }> {
  const response = await apiClient.get<{ url: string; state: string }>(
    '/oura/auth-url'
  );
  return response.data;
}

export async function syncOura(): Promise<{ synced: number }> {
  const response = await apiClient.post<{ synced: number }>('/oura/sync');
  return response.data;
}

export async function getOuraData(days = 7): Promise<OuraData[]> {
  const response = await apiClient.get<OuraData[]>('/oura/data', {
    params: { days },
  });
  return response.data;
}

// ── Wellness ───────────────────────────────────────────────────────────────

export async function submitWellnessCheckin(
  data: WellnessCheckinIn
): Promise<WellnessCheckin> {
  const response = await apiClient.post<WellnessCheckin>(
    '/wellness/checkin',
    data
  );
  return response.data;
}

export async function getWellnessCheckins(
  days = 7
): Promise<WellnessCheckin[]> {
  const response = await apiClient.get<WellnessCheckin[]>(
    '/wellness/checkins',
    { params: { days } }
  );
  return response.data;
}

// ── Nutrition ──────────────────────────────────────────────────────────────

export async function logNutrition(data: NutritionLogIn): Promise<NutritionLog> {
  const response = await apiClient.post<NutritionLog>('/nutrition/log', data);
  return response.data;
}

export async function getTodayNutrition(): Promise<NutritionLog[]> {
  const response = await apiClient.get<NutritionLog[]>('/nutrition/today');
  return response.data;
}

export async function deleteNutritionLog(id: string): Promise<void> {
  await apiClient.delete(`/nutrition/log/${id}`);
}

export async function scanFoodPhoto(
  base64Image: string,
  mediaType = 'image/jpeg'
): Promise<FoodScanResult> {
  const response = await apiClient.post<FoodScanResult>('/nutrition/scan', {
    image: base64Image,
    media_type: mediaType,
  });
  return response.data;
}

export async function searchFoods(query: string): Promise<FoodSearchResponse> {
  const response = await apiClient.get<FoodSearchResponse>('/nutrition/search', { params: { q: query } });
  return response.data;
}

export async function lookupBarcode(barcode: string): Promise<FoodItem> {
  const response = await apiClient.get<FoodItem>(`/nutrition/barcode/${barcode}`);
  return response.data;
}

export async function getRecentFoods(): Promise<RecentFoodItem[]> {
  const response = await apiClient.get<RecentFoodItem[]>('/nutrition/recent');
  return response.data;
}

export async function getFrequentFoods(): Promise<FrequentFoodItem[]> {
  const response = await apiClient.get<FrequentFoodItem[]>('/nutrition/frequent');
  return response.data;
}

export async function createCustomFood(data: CustomFoodIn): Promise<CustomFoodOut> {
  const response = await apiClient.post<CustomFoodOut>('/nutrition/foods/custom', data);
  return response.data;
}

export async function getCustomFoods(): Promise<CustomFoodOut[]> {
  const response = await apiClient.get<CustomFoodOut[]>('/nutrition/foods/custom');
  return response.data;
}

// ── Activity Logging ───────────────────────────────────────────────────────

export interface UserActivity {
  id: string;
  user_id: string;
  activity_type: string;
  duration_minutes: number;
  intensity: 'Easy' | 'Moderate' | 'Hard' | 'Max';
  notes: string | null;
  calories_burned: number | null;
  autopsy_text: string | null;
  exercise_data: Array<{ name: string; muscleGroup: string; muscles: string[]; sets: Array<{ type: string; weight: string; reps: string; rpe: string; completed: boolean }> }> | null;
  distance_meters: number | null;
  sport_category: string | null;
  muscle_groups: string[] | null;
  rpe: number | null;
  training_load: number | null;
  is_rest_day: boolean;
  logged_at: string;
  created_at: string;
}

export interface UserActivityIn {
  activity_type: string;
  duration_minutes: number;
  intensity: string;
  notes?: string;
  exercise_data?: Array<Record<string, unknown>>;
  distance_meters?: number;
  sport_category?: string;
  muscle_groups?: string[];
  rpe?: number;
}

export interface WeeklyLoad {
  this_week_load: number;
  last_week_load: number;
  four_week_average: number;
  percentage_change: number;
  status: 'normal' | 'elevated' | 'high';
  acwr: number | null;
  acwr_status: 'undertraining' | 'optimal' | 'caution' | 'high_risk' | 'insufficient_data';
}

export interface ReadinessScore {
  score: number;
  label: string;
  color: 'green' | 'amber' | 'red';
  explanation: string;
}

export interface ActivityStats {
  total_workouts: number;
  total_hours: number;
  current_streak: number;
  longest_streak: number;
}

export interface HeatmapEntry {
  date: string;
  count: number;
  total_minutes: number;
}

export interface DailySteps {
  id: string;
  user_id: string;
  date: string;
  steps: number;
  created_at: string;
}

export interface HevyWorkout {
  id: string;
  hevy_workout_id: string;
  title: string;
  started_at: string;
  duration_seconds: number | null;
  exercises: Array<{ title: string; sets: Array<{ reps: number; weight_kg: number }> }>;
  volume_kg: number | null;
  autopsy_text: string | null;
  created_at: string;
}

export async function logActivity(data: UserActivityIn): Promise<UserActivity> {
  const response = await apiClient.post<UserActivity>('/activities/', data);
  return response.data;
}

export async function getMyActivities(): Promise<UserActivity[]> {
  const response = await apiClient.get<UserActivity[]>('/activities/');
  return response.data;
}

export async function retryActivityAutopsy(activityId: string): Promise<UserActivity> {
  const response = await apiClient.post<UserActivity>(`/activities/${activityId}/autopsy`);
  return response.data;
}

export async function deleteActivity(id: string): Promise<void> {
  await apiClient.delete(`/activities/${id}`);
}

export async function getWeeklyLoad(): Promise<WeeklyLoad> {
  const response = await apiClient.get<WeeklyLoad>('/activities/weekly-load');
  return response.data;
}

export async function getReadiness(): Promise<ReadinessScore> {
  const response = await apiClient.get<ReadinessScore>('/activities/readiness');
  return response.data;
}

export async function updateActivityRPE(activityId: string, rpe: number): Promise<UserActivity> {
  const response = await apiClient.patch<UserActivity>(`/activities/${activityId}/rpe`, { rpe });
  return response.data;
}

export async function logRestDay(): Promise<UserActivity> {
  const response = await apiClient.post<UserActivity>('/activities/rest');
  return response.data;
}

// ── Steps ──────────────────────────────────────────────────────────────────

export async function upsertDailySteps(date: string, steps: number): Promise<DailySteps> {
  const response = await apiClient.post<DailySteps>('/steps/', { date, steps });
  return response.data;
}

export async function getWeeklySteps(): Promise<DailySteps[]> {
  const response = await apiClient.get<DailySteps[]>('/steps/weekly');
  return response.data;
}

// ── Hevy ───────────────────────────────────────────────────────────────────

export async function connectHevy(apiKey: string): Promise<{ connected: boolean }> {
  const response = await apiClient.post<{ connected: boolean }>('/hevy/connect', { api_key: apiKey });
  return response.data;
}

export async function syncHevy(): Promise<{ synced: number; total: number }> {
  const response = await apiClient.post<{ synced: number; total: number }>('/hevy/sync');
  return response.data;
}

export async function getHevyWorkouts(): Promise<HevyWorkout[]> {
  const response = await apiClient.get<HevyWorkout[]>('/hevy/workouts');
  return response.data;
}

export async function disconnectHevy(): Promise<void> {
  await apiClient.delete('/hevy/disconnect');
}

// ── Activity Stats & Heatmap ───────────────────────────────────────────────

export async function getActivityStats(): Promise<ActivityStats> {
  const response = await apiClient.get<ActivityStats>('/activities/stats');
  return response.data;
}

export async function getActivityHeatmap(days = 84): Promise<HeatmapEntry[]> {
  const response = await apiClient.get<HeatmapEntry[]>('/activities/heatmap', { params: { days } });
  return response.data;
}

// ── Deload Detector ────────────────────────────────────────────────────────

export async function getDeloadStatus(): Promise<DeloadRecommendation> {
  const response = await apiClient.get<DeloadRecommendation>('/deload/status');
  return response.data;
}

// ── Warm-Up Personalizer ───────────────────────────────────────────────────

export async function generateWarmUp(data: WarmUpRequest): Promise<WarmUpProtocol> {
  const response = await apiClient.post<WarmUpProtocol>('/warmup/generate', data);
  return response.data;
}

export default apiClient;
