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
  summary_polyline: string | null;
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
  // Hooper Index fields (1–7, 1=best)
  sleep_quality: number | null;
  fatigue: number | null;
  stress: number | null;
  muscle_soreness: number | null;
  // Legacy fields
  mood: number | null;
  energy: number | null;
  soreness: number | null;
  notes: string | null;
  created_at: string;
}

export interface WellnessCheckinIn {
  date: string;
  // Hooper Index fields (1–7, 1=best)
  sleep_quality?: number;
  fatigue?: number;
  stress?: number;
  muscle_soreness?: number;
  // Legacy fields (backward compat)
  mood?: number;
  energy?: number;
  soreness?: number;
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
  sugar_g: number | null;
  sodium_mg: number | null;
  vitamin_d_iu: number | null;
  magnesium_mg: number | null;
  iron_mg: number | null;
  calcium_mg: number | null;
  zinc_mg: number | null;
  omega3_g: number | null;
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
  sugar_g?: number;
  sodium_mg?: number;
  vitamin_d_iu?: number;
  magnesium_mg?: number;
  iron_mg?: number;
  calcium_mg?: number;
  zinc_mg?: number;
  omega3_g?: number;
  meal_type?: string;
  source?: string;
  notes?: string;
}

// ── Nutrition Targets & Summary ────────────────────────────────────────────

export interface NutritionTargets {
  daily_calorie_target: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fibre_g: number | null;
  sugar_max_g: number | null;
  sodium_max_mg: number | null;
  potassium_mg: number | null;
  calcium_mg: number | null;
  iron_mg: number | null;
  vitamin_d_iu: number | null;
  magnesium_mg: number | null;
  zinc_mg: number | null;
  omega3_g: number | null;
  is_carb_cycling: boolean;
  training_day_carbs_g: number | null;
  rest_day_carbs_g: number | null;
  is_intermittent_fasting: boolean;
  calculated_at?: string;
}

export interface DailyNutritionSummary {
  calories_consumed: number;
  protein_consumed_g: number;
  carbs_consumed_g: number;
  fat_consumed_g: number;
  fibre_consumed_g: number;
  sugar_consumed_g: number;
  sodium_consumed_mg: number;
  vitamin_d_consumed_iu: number;
  magnesium_consumed_mg: number;
  iron_consumed_mg: number;
  calcium_consumed_mg: number;
  zinc_consumed_mg: number;
  omega3_consumed_g: number;
}

export interface TodayNutritionResponse {
  logs: NutritionLog[];
  summary: DailyNutritionSummary;
  targets: NutritionTargets | null;
}

export interface AssistantResponse {
  response_text: string;
  meal_modified: boolean;
  modified_meal: MealPlanMeal | null;
  updated_daily_totals: {
    total_calories: number;
    total_protein_g: number;
    total_carbs_g: number;
    total_fat_g: number;
  } | null;
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
  sugar_g: number;
  sodium_mg: number;
  vitamin_d_iu: number;
  magnesium_mg: number;
  iron_mg: number;
  calcium_mg: number;
  zinc_mg: number;
  omega3_g: number;
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
  vitamin_d_100g: number;
  magnesium_100g: number;
  iron_100g: number;
  calcium_100g: number;
  zinc_100g: number;
  omega3_100g: number;
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

// ── Athlete Profile & Insight ──────────────────────────────────────────────

export interface AthleteProfile {
  id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  sport_tags: string[];
  location: string | null;
  bio: string | null;
  followers_count: number;
  following_count: number;
  is_private: boolean;
  is_following: boolean;
  is_blocked: boolean;
  total_workouts: number;
  current_streak: number;
  best_streak: number;
  member_since: string; // "YYYY-MM"
  recent_achievements: any[];
}

export interface InsightData {
  current_readiness: { score: number | null; label: string; color: string };
  today_diagnosis: { diagnosis_text: string | null; contributing_factors: string[]; recommendation: string | null; readiness_score: number | null };
  last_session: { id: string; activity_type: string; sport_category: string | null; duration_minutes: number; training_load: number | null; rpe: number | null; autopsy_text: string | null; logged_at: string; source: string } | null;
  recent_sessions: Array<{ id: string; activity_type: string; sport_category: string | null; duration_minutes: number; training_load: number | null; rpe: number | null; logged_at: string; source: string }>;
  weekly_recap: { sessions: number; total_load: number; avg_readiness: number | null; calories_hit_days: number };
  today_nutrition: { calories_consumed: number | null; calories_target: number | null; protein_consumed_g: number | null; carbs_consumed_g: number | null; fat_consumed_g: number | null };
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

export async function generateStravaAutopsy(activityId: string): Promise<{ autopsy: string }> {
  const response = await apiClient.post<{ autopsy: string }>(`/diagnosis/autopsy/${activityId}`);
  return response.data;
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

export async function getTodayNutrition(): Promise<TodayNutritionResponse> {
  const response = await apiClient.get<TodayNutritionResponse>('/nutrition/today');
  return response.data;
}

export async function getNutritionTargets(): Promise<NutritionTargets> {
  const response = await apiClient.get<NutritionTargets>('/nutrition/targets');
  return response.data;
}

export async function recalculateNutritionTargets(): Promise<NutritionTargets> {
  const response = await apiClient.post<NutritionTargets>('/nutrition/targets/recalculate');
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
  days_until_acwr?: number | null;
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

// ── Home Dashboard ─────────────────────────────────────────────────────────

export interface LastSession {
  id: string;
  name: string;
  sport_type: string;
  date: string;
  duration_minutes: number;
  training_load: number | null;
  rpe: number | null;
  autopsy_snippet: string | null;
}

export interface ReadinessBreakdown {
  [component: string]: {
    name: string;
    score: number;
    default_weight: number;
    adjusted_weight: number;
    data_source: string;
  };
}

export interface HardwareAvailable {
  apple_watch: boolean;
  whoop: boolean;
  oura: boolean;
  hrv_available: boolean;
  sleep_available: boolean;
}

export interface DashboardData {
  display_name: string;
  primary_goal: string | null;
  sport_tags: string[];
  weekly_training_goal: number | null;
  // Readiness — from single shared calculation service
  readiness_score: number;
  readiness_label: string;
  readiness_color: 'green' | 'amber' | 'red';
  readiness_primary_factor: string;
  data_confidence: string;
  components_used: string[];
  breakdown: ReadinessBreakdown;
  hardware_available: HardwareAvailable;
  last_session: LastSession | null;
  sessions_this_week: number;
  active_days_this_week: number;
  weekly_load: number;
  last_week_load: number;
  four_week_avg_load: number;
  days_since_rest: number;
  current_streak: number;
  weekly_goal_progress: number;
  acwr: number | null;
  acwr_status: string;
  calories_today: number;
  protein_today: number;
  carbs_today: number;
  fat_today: number;
  calorie_target: number | null;
  protein_target: number | null;
  carbs_target: number | null;
  fat_target: number | null;
  calorie_deficit: number | null;
  meals_logged_today: boolean;
  calories_this_week: number;
  sleep_hours: number | null;
  hrv_ms: number | null;
  resting_heart_rate: number | null;
  steps_today: number;
  // Wellness — Hooper Index
  sleep_quality_today: number | null;
  fatigue_today: number | null;
  stress_today: number | null;
  muscle_soreness_today: number | null;
  wellness_logged_today: boolean;
  // Legacy wellness fields
  energy_today: number | null;
  soreness_today: number | null;
  mood_today: number | null;
  // Weight
  current_weight_kg: number | null;
  weight_trend: 'losing' | 'gaining' | 'stable' | null;
  weekly_weight_change_kg: number | null;
  weight_goal_alignment: 'on_track' | 'off_track' | 'neutral';
  weight_logged_today: boolean;
  weight_unit: 'kg' | 'lbs';
}

export interface DiagnosisData {
  diagnosis_text: string;
  contributing_factors: string[];
  recommendation: string;
  tone: 'positive' | 'cautionary' | 'warning';
  generated_at: string;
  cached?: boolean;
  rate_limited?: boolean;
}

export async function getDashboard(): Promise<DashboardData> {
  const response = await apiClient.get<DashboardData>('/home/dashboard');
  return response.data;
}

export async function getDiagnosis(force?: boolean): Promise<DiagnosisData> {
  const response = await apiClient.post<DiagnosisData>(
    '/home/diagnosis',
    null,
    force ? { params: { force: true } } : {},
  );
  return response.data;
}

// ── Nutrition Profile & Meal Plan ──────────────────────────────────────────────

export interface NutritionProfile {
  id: string;
  user_id: string;
  cuisines_liked: string[] | null;
  foods_loved: string[] | null;
  foods_disliked: string[] | null;
  foods_hated: string | null; // deprecated, kept for type safety
  diet_type: string | null;
  allergies: string[] | null;
  nutrition_goal: string | null;
  strictness_level: string | null;
  cheat_day_preference: string | null;
  sugar_preference: string | null;
  carb_approach: string | null;
  intermittent_fasting: string | null;
  fasting_start_time: string | null;
  fasting_end_time: string | null;
  meals_per_day: number | null;
  eats_breakfast: string | null;
  meal_times: string[] | null;
  pre_workout_nutrition: string | null;
  post_workout_nutrition: string | null;
  meal_prep: string | null;
  cooking_skill: string | null;
  time_per_meal: string | null;
  weekly_budget: string | null;
  kitchen_access: string | null;
  region: string | null;
  nutrition_survey_complete: boolean;
  created_at: string;
  updated_at: string;
}

export interface MealPlanMeal {
  meal_name: string;
  meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'pre_workout' | 'post_workout';
  time: string;
  description: string;
  ingredients: string[];
  prep_time_minutes: number;
  prep_note: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fibre_g?: number;
  sugar_g?: number;
  sodium_mg?: number;
  vitamin_d_iu?: number;
  magnesium_mg?: number;
  iron_mg?: number;
  calcium_mg?: number;
  zinc_mg?: number;
  omega3_g?: number;
  can_meal_prep: boolean;
}

export interface MealPlan {
  id: string;
  date: string;
  generated_at: string;
  regeneration_count: number;
  is_cheat_day: boolean;
  total_calories: number | null;
  total_protein: number | null;
  total_carbs: number | null;
  total_fat: number | null;
  cheat_day_note: string | null;
  meals: MealPlanMeal[];
  grocery_items: string[];
  nutrition_note: string;
}

export interface SavedMeal {
  id: string;
  user_id: string;
  meal_name: string;
  meal_type: string | null;
  description: string | null;
  ingredients: string[] | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  prep_time_minutes: number | null;
  prep_note: string | null;
  saved_at: string;
}

export async function getNutritionProfile(): Promise<NutritionProfile> {
  const response = await apiClient.get<NutritionProfile>('/nutrition/profile');
  return response.data;
}

export async function updateNutritionProfile(data: Partial<NutritionProfile> & { nutrition_survey_complete?: boolean }): Promise<NutritionProfile> {
  const response = await apiClient.patch<NutritionProfile>('/nutrition/profile', data);
  return response.data;
}

export async function getTodayMealPlan(): Promise<MealPlan> {
  const response = await apiClient.get<MealPlan>('/nutrition/meal-plan/today');
  return response.data;
}

export async function regenerateMealPlan(): Promise<MealPlan> {
  const response = await apiClient.post<MealPlan>('/nutrition/meal-plan/regenerate');
  return response.data;
}

export async function saveMealToCollection(meal: Omit<SavedMeal, 'id' | 'user_id' | 'saved_at'>): Promise<SavedMeal> {
  const response = await apiClient.post<SavedMeal>('/nutrition/meals/save', meal);
  return response.data;
}

export async function getSavedMeals(): Promise<SavedMeal[]> {
  const response = await apiClient.get<SavedMeal[]>('/nutrition/meals/saved');
  return response.data;
}

export async function deleteSavedMeal(id: string): Promise<void> {
  await apiClient.delete(`/nutrition/meals/saved/${id}`);
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function askNutritionAssistant(
  userMessage: string,
  conversationHistory: ChatMessage[],
): Promise<AssistantResponse> {
  const response = await apiClient.post<AssistantResponse>('/nutrition/assistant', {
    user_message: userMessage,
    conversation_history: conversationHistory.slice(-5),
  });
  return response.data;
}

// ── Water tracking ────────────────────────────────────────────────────────────

export interface WaterStatus {
  amount_ml: number;
  target_ml: number;
  container_size_ml: number;
  percentage: number;
  recommended_ml: number;
}

export interface WaterPatchPayload {
  amount_ml: number;
  container_size_ml?: number;
}

export interface WaterSettingsPayload {
  target_ml?: number | null;  // null = reset to recommended
  container_size_ml?: number;
  water_input_mode?: 'glasses' | 'ml';
}

export async function getWaterToday(): Promise<WaterStatus> {
  const response = await apiClient.get<WaterStatus>('/nutrition/water/today');
  return response.data;
}

export async function patchWaterToday(payload: WaterPatchPayload): Promise<WaterStatus> {
  const response = await apiClient.patch<WaterStatus>('/nutrition/water/today', payload);
  return response.data;
}

export async function patchWaterSettings(payload: WaterSettingsPayload): Promise<{ target_ml: number; recommended_ml: number; container_size_ml: number }> {
  const response = await apiClient.patch('/nutrition/water/settings', payload);
  return response.data;
}

// ── Weekly calorie chart ──────────────────────────────────────────────────────

export interface WeeklyCalorieDay {
  date: string;
  calories_logged: number;
  target: number;
  day_label: string;
}

export async function getWeeklyCalories(): Promise<WeeklyCalorieDay[]> {
  const response = await apiClient.get<WeeklyCalorieDay[]>('/nutrition/weekly-calories');
  return response.data;
}

// ── Weekly nutrition summary ──────────────────────────────────────────────────

export interface WeeklyNutritionSummary {
  avg_daily_calories: number;
  avg_daily_protein: number;
  days_calorie_target_hit: number;
  days_protein_target_hit: number;
  last_week_avg_calories: number;
  last_week_avg_protein: number;
}

export async function getWeeklyNutritionSummary(): Promise<WeeklyNutritionSummary> {
  const response = await apiClient.get<WeeklyNutritionSummary>('/nutrition/weekly-summary');
  return response.data;
}

// ── Weight Tracking ───────────────────────────────────────────────────────────

export interface WeightLogEntry {
  date: string;
  weight_kg: number;
  display_value: number;
  note: string | null;
}

export interface WeightRollingAvgEntry {
  date: string;
  rolling_avg: number;
}

export interface WeightWeeklyAvg {
  week_start: string;
  avg_kg: number;
  display_avg: number;
  count: number;
}

export interface WeightHistory {
  entries: WeightLogEntry[];
  rolling_avg: WeightRollingAvgEntry[];
  weekly_averages: WeightWeeklyAvg[];
  rate_of_change_kg_per_week: number | null;
  display_unit: 'kg' | 'lbs';
  days_with_data: number;
  fell_back_to_all: boolean;
  first_log_date: string | null;
}

export interface WeightSummary {
  current_weight_kg: number | null;
  current_weight_display: number | null;
  display_unit: 'kg' | 'lbs';
  rate_of_change_kg_per_week: number | null;
  weekly_change_display: number | null;
  goal_alignment: 'on_track' | 'off_track' | 'neutral' | null;
  data_confidence: 'insufficient' | 'early' | 'limited' | 'sufficient';
  days_logged_this_month: number;
  current_streak: number;
  longest_streak: number;
  logged_today: boolean;
  total_logs: number;
}

export interface WeightLogResult {
  id: string;
  weight_kg: number;
  display_value: number;
  display_unit: 'kg' | 'lbs';
  logged_at: string;
  note: string | null;
}

export async function logWeight(weight_kg: number, note?: string, logged_at?: string): Promise<WeightLogResult> {
  const response = await apiClient.post<WeightLogResult>('/weight/log', { weight_kg, note, logged_at });
  return response.data;
}

export async function getWeightHistory(days = 30, range?: string): Promise<WeightHistory> {
  const params: Record<string, unknown> = { days };
  if (range) params.range = range;
  const response = await apiClient.get<WeightHistory>('/weight/history', { params });
  return response.data;
}

export async function getWeightSummary(): Promise<WeightSummary> {
  const response = await apiClient.get<WeightSummary>('/weight/summary');
  return response.data;
}

export async function updateWeightSettings(weight_unit: 'kg' | 'lbs'): Promise<{ weight_unit: string }> {
  const response = await apiClient.post<{ weight_unit: string }>('/weight/settings', { weight_unit });
  return response.data;
}

// ── Community Types ────────────────────────────────────────────────────────────

export interface UserPreview {
  id: string;
  display_name: string;
  username: string;
  sport_tags: string[];
  avatar_url: string | null;
  initials: string;
  followers_count: number;
  following_count: number;
  is_following?: boolean;
}

export interface PostAuthor {
  id: string;
  display_name: string;
  username: string;
  avatar_url: string | null;
  initials: string;
  sport_tags: string[];
}

export interface PostReactions {
  fire: number;
  muscle: number;
  heart: number;
}

export interface Post {
  id: string;
  user_id: string;
  photo_url: string | null;
  caption: string | null;
  oryx_data_card_json: {
    post_type: 'workout' | 'insight' | 'recap' | 'milestone' | 'generic';
    [key: string]: any;
  } | null;
  also_shared_as_story: boolean;
  story_id: string | null;
  club_id: string | null;
  is_deleted: boolean;
  created_at: string;
  time_ago: string;
  author: {
    id: string;
    display_name: string;
    username: string;
    avatar_url: string | null;
    initials: string;
    sport_tags: string[];
  };
  reactions: { fire: number; muscle: number; heart: number; };
  my_reactions: string[];
  comment_count: number;
  location_text: string | null;
  is_saved: boolean;
  is_pinned: boolean;
  is_archived: boolean;
  like_count: number;
  is_liked_by_current_user: boolean;
}

// Backward compat alias
export type SocialPost = Post & {
  post_type?: string;
  content_json?: any;
  user_caption?: string | null;
  is_public?: boolean;
};

export interface FeedResponse {
  posts: Post[];
  page: number;
  has_more: boolean;
  following_count: number;
}

export interface CommunityClub {
  id: string;
  name: string;
  sport_type: string;
  cover_image: string | null;
  description: string | null;
  member_count: number;
  is_member: boolean;
}

export interface ClubMember {
  id: string;
  display_name: string;
  username: string;
  sport_tags: string[];
  initials: string;
  avatar_url: string | null;
}

export interface ClubDetail {
  club: CommunityClub;
  members: ClubMember[];
}

export interface LeaderboardEntry {
  rank: number;
  user_id: string;
  display_name: string;
  initials: string;
  avatar_url: string | null;
  sport_tags: string[];
  value: number;
  is_current_user: boolean;
}

export interface LeaderboardResponse {
  leaderboard: LeaderboardEntry[];
  my_rank: number | null;
  my_entry: LeaderboardEntry | null;
  week_start: string;
  countdown: string;
  metric: string;
  last_week_top3: { rank: number; display_name: string; value: number }[];
}

export interface PostComment {
  id: string;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  initials: string;
  comment_text: string;
  created_at: string;
  time_ago: string;
  is_own: boolean;
  parent_comment_id: string | null;
  like_count: number;
  is_liked_by_me: boolean;
  replies: PostComment[];
  total_reply_count: number;
}

export interface CheckinStatus {
  has_checkin: boolean;
  window_active: boolean;
  window_expires_at: string | null;
  checkin: {
    id: string;
    photo_url: string | null;
    caption: string | null;
    stats_overlay_json: any;
    influence_tags: string[] | null;
    created_at: string;
  } | null;
}

// ── Community API Functions ────────────────────────────────────────────────────

export const followUser = async (userId: string) =>
  (await apiClient.post(`/social/follow/${userId}`)).data;

export const unfollowUser = async (userId: string) =>
  (await apiClient.delete(`/social/follow/${userId}`)).data;

export const getFollowers = async (): Promise<{ followers: UserPreview[] }> =>
  (await apiClient.get('/social/followers')).data;

export const getFollowing = async (): Promise<{ following: UserPreview[] }> =>
  (await apiClient.get('/social/following')).data;

export const getAthleteFollowers = async (userId: string): Promise<{ followers: UserPreview[] }> =>
  (await apiClient.get(`/social/followers/${userId}`)).data;

export const getAthleteFollowing = async (userId: string): Promise<{ following: UserPreview[] }> =>
  (await apiClient.get(`/social/following/${userId}`)).data;

export const getSuggestions = async (): Promise<{ suggestions: UserPreview[] }> =>
  (await apiClient.get('/social/suggestions')).data;

export const searchUsers = async (q: string): Promise<{ users: UserPreview[] }> =>
  (await apiClient.get('/social/search', { params: { q } })).data;

export const getFeed = async (page = 0, limit = 20): Promise<FeedResponse> =>
  (await apiClient.get('/feed', { params: { page, limit } })).data;

export const createPost = async (data: {
  photo_url?: string;
  caption?: string;
  oryx_data_card_json?: object;
  also_shared_as_story?: boolean;
  club_id?: string;
  insight_type?: string;
  session_id?: string;
  custom_title?: string;
  location_text?: string;
  privacy_settings?: Record<string, boolean>;
  background_style?: string;
}): Promise<{ post: Post }> =>
  (await apiClient.post('/posts', data)).data;

export const deletePost = async (id: string) =>
  (await apiClient.delete(`/posts/${id}`)).data;

export const getUserPosts = async (userId: string, page = 0, limit = 30): Promise<{ posts: Post[]; page: number; has_more: boolean }> =>
  (await apiClient.get(`/posts/user/${userId}`, { params: { page, limit } })).data;

export const getPostDetail = async (postId: string): Promise<{ post: Post }> =>
  (await apiClient.get(`/posts/${postId}`)).data;

export const editPostCaption = async (id: string, caption: string) =>
  (await apiClient.patch(`/posts/${id}`, { caption })).data;

export const toggleReaction = async (postId: string, reactionType: string) =>
  (await apiClient.post(`/posts/${postId}/react`, null, { params: { reaction_type: reactionType } })).data;

export const getPostComments = async (postId: string): Promise<{ comments: PostComment[] }> =>
  (await apiClient.get(`/posts/${postId}/comments`)).data;

export const addComment = async (postId: string, commentText: string, parentCommentId?: string): Promise<{ comment: PostComment }> =>
  (await apiClient.post(`/posts/${postId}/comments`, { comment_text: commentText, parent_comment_id: parentCommentId ?? null })).data;

export const deleteComment = async (postId: string, commentId: string) =>
  (await apiClient.delete(`/posts/${postId}/comments/${commentId}`)).data;

export const editComment = async (postId: string, commentId: string, commentText: string): Promise<{ comment: PostComment }> =>
  (await apiClient.patch(`/posts/${postId}/comments/${commentId}`, { comment_text: commentText })).data;

export const likeComment = async (postId: string, commentId: string): Promise<{ liked: boolean; like_count: number }> =>
  (await apiClient.post(`/posts/${postId}/comments/${commentId}/like`)).data;

export const likePost = async (postId: string): Promise<{ liked: boolean; like_count: number }> =>
  (await apiClient.post(`/posts/${postId}/like`)).data;

export const unlikePost = async (postId: string): Promise<{ liked: boolean; like_count: number }> =>
  (await apiClient.delete(`/posts/${postId}/like`)).data;

export const savePost = async (postId: string): Promise<void> =>
  (await apiClient.post(`/posts/${postId}/save`)).data;

export const unsavePost = async (postId: string): Promise<void> =>
  (await apiClient.delete(`/posts/${postId}/save`)).data;

export const hidePost = async (postId: string): Promise<void> =>
  (await apiClient.post(`/posts/${postId}/hide`)).data;

export const getPostInsights = async (postId: string): Promise<{
  total_views: number;
  fire_count: number;
  muscle_count: number;
  heart_count: number;
  total_reactions: number;
  total_comments: number;
  total_saves: number;
}> => (await apiClient.get(`/posts/${postId}/insights`)).data;

export const patchPost = async (postId: string, data: { caption?: string; is_pinned?: boolean; is_archived?: boolean }): Promise<{ post: Post }> =>
  (await apiClient.patch(`/posts/${postId}`, data)).data;

export const getClubs = async (): Promise<{ clubs: CommunityClub[] }> =>
  (await apiClient.get('/clubs')).data;

export const getMyClubs = async (): Promise<{ clubs: CommunityClub[] }> =>
  (await apiClient.get('/clubs/mine')).data;

export const getClubDetail = async (id: string): Promise<ClubDetail> =>
  (await apiClient.get(`/clubs/${id}`)).data;

export const joinClub = async (id: string) =>
  (await apiClient.post(`/clubs/${id}/join`)).data;

export const leaveClub = async (id: string) =>
  (await apiClient.delete(`/clubs/${id}/leave`)).data;

export const getClubLeaderboard = async (id: string, metric = 'training_load'): Promise<LeaderboardResponse> =>
  (await apiClient.get(`/clubs/${id}/leaderboard`, { params: { metric } })).data;

export const autoJoinClubs = async (): Promise<{ joined: string[] }> =>
  (await apiClient.post('/clubs/auto-join')).data;

export const getTodayCheckin = async (): Promise<CheckinStatus> =>
  (await apiClient.get('/checkin/today')).data;

export const saveCheckin = async (data: {
  photo_url?: string;
  caption?: string;
  stats_overlay_json?: any;
  influence_tags?: string[];
  is_public?: boolean;
}): Promise<{ checkin: any; post_id: string }> =>
  (await apiClient.post('/checkin', data)).data;

export const deleteCheckin = async (): Promise<void> =>
  (await apiClient.delete('/checkin/today')).data;

export const generateCheckinCaption = async (data: {
  name: string;
  readiness?: number;
  steps?: number;
  calories_consumed?: number;
  calories_target?: number;
  session_name?: string;
  sport_tags?: string[];
  time_of_day?: string;
}): Promise<{ caption: string }> =>
  (await apiClient.post('/checkin/caption', data)).data;

// ── Athlete Profile & Social ───────────────────────────────────────────────────

export const getAthleteProfile = async (userId: string): Promise<AthleteProfile> =>
  (await apiClient.get(`/users/${userId}/profile`)).data;

export const getAthletePublicPosts = async (userId: string, page = 0): Promise<{ posts: Post[]; is_private?: boolean; page: number; has_more: boolean }> =>
  (await apiClient.get(`/users/${userId}/posts`, { params: { page } })).data;

export const reportUser = async (userId: string, reason?: string) =>
  (await apiClient.post(`/users/${userId}/report`, { reason })).data;

export const blockUser = async (userId: string) =>
  (await apiClient.post(`/users/${userId}/block`)).data;

export const unblockUser = async (userId: string) =>
  (await apiClient.delete(`/users/${userId}/block`)).data;

export const getInsightData = async (): Promise<InsightData> =>
  (await apiClient.get('/posts/insight-data')).data;

// ── Stories Types ──────────────────────────────────────────────────────────────

export interface StoryItem {
  id: string;
  user_id: string;
  photo_url: string;  // always present, never null
  caption: string | null;
  oryx_data_overlay_json: {
    readiness?: number;
    steps?: number;
    calories?: number;
    calories_target?: number;
    training_load?: number;
    readiness_color?: string;
    readiness_label?: string;
    x_ratio?: number;
    y_ratio?: number;
  } | null;
  text_overlay: string | null;
  source_post_id: string | null;
  checkin_id: string | null;
  created_at: string;
  expires_at: string;
  is_expired: boolean;
  is_seen?: boolean;
  author?: {
    id: string | null;
    display_name: string;
    initials: string;
    avatar_url: string | null;
  };
}

export interface StoryGroup {
  user_id: string;
  display_name: string;
  initials: string;
  avatar_url: string | null;
  has_unseen_story: boolean;
  stories: StoryItem[];
  is_own: boolean;
}

// ── Stories API Functions ──────────────────────────────────────────────────────

export const getStoriesFeed = async (): Promise<{ story_groups: StoryGroup[] }> =>
  (await apiClient.get('/stories/feed')).data;

export const getMyStories = async (
  params?: { start_date?: string; end_date?: string },
): Promise<{ stories: StoryItem[] }> =>
  (await apiClient.get('/stories/my', { params })).data;

export const getStory = async (storyId: string): Promise<{ story: StoryItem }> =>
  (await apiClient.get(`/stories/${storyId}`)).data;

export const createStory = async (data: {
  photo_url: string;
  caption?: string;
  oryx_data_overlay_json?: object;
  text_overlay?: string;
  checkin_id?: string;
  source_post_id?: string;
}): Promise<{ story: StoryItem }> =>
  (await apiClient.post('/stories', data)).data;

// Upload media — compresses image if expo-image-manipulator is available, sends as multipart
export const uploadMedia = async (uri: string, maxWidth = 1080): Promise<{ url: string }> => {
  let uploadUri = uri;

  // Try expo-image-manipulator for compression
  try {
    const ImageManipulator = await import('expo-image-manipulator');
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: maxWidth } }],
      { compress: maxWidth <= 720 ? 0.8 : 0.85, format: ImageManipulator.SaveFormat.JPEG }
    );
    uploadUri = result.uri;
  } catch {
    // manipulator unavailable — use original uri
  }

  // Send as multipart/form-data — React Native FormData accepts { uri, type, name }
  const formData = new FormData();
  formData.append('file', { uri: uploadUri, type: 'image/jpeg', name: 'upload.jpg' } as any);

  const response = await apiClient.post<{ url: string }>('/media/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

export const deleteStory = async (storyId: string): Promise<{ message: string }> =>
  (await apiClient.delete(`/stories/${storyId}`)).data;

// ── Highlights ─────────────────────────────────────────────────────────────

export type HighlightFeaturedStat = 'sessions' | 'load' | 'prs' | 'readiness';

export interface Highlight {
  id: string;
  user_id: string;
  title: string;
  cover_photo_url: string | null;
  start_date: string;   // ISO date (YYYY-MM-DD)
  end_date: string;     // ISO date
  featured_stat: HighlightFeaturedStat;
  story_ids: string[];
  position: number;
  stat_value: number | null;
  created_at: string;
  updated_at: string;
}

export interface HighlightStory {
  id: string;
  user_id: string;
  photo_url: string | null;
  caption: string | null;
  oryx_data_overlay_json: any | null;
  text_overlay: string | null;
  created_at: string;
}

export const getUserHighlights = async (userId: string): Promise<{ highlights: Highlight[] }> =>
  (await apiClient.get(`/users/${userId}/highlights`)).data;

export const createHighlight = async (data: {
  title: string;
  start_date: string;
  end_date: string;
  story_ids: string[];
  cover_photo_url?: string | null;
  featured_stat?: HighlightFeaturedStat;
}): Promise<{ highlight: Highlight }> =>
  (await apiClient.post('/highlights', data)).data;

export const patchHighlight = async (
  id: string,
  data: Partial<{
    title: string;
    start_date: string;
    end_date: string;
    story_ids: string[];
    cover_photo_url: string | null;
    featured_stat: HighlightFeaturedStat;
    position: number;
  }>,
): Promise<{ highlight: Highlight }> =>
  (await apiClient.patch(`/highlights/${id}`, data)).data;

export const deleteHighlight = async (id: string): Promise<{ ok: boolean }> =>
  (await apiClient.delete(`/highlights/${id}`)).data;

export const reorderHighlights = async (
  items: { id: string; position: number }[],
): Promise<{ ok: boolean }> =>
  (await apiClient.post('/highlights/reorder', { items })).data;

export const getHighlightStories = async (id: string): Promise<{ highlight_id: string; stories: HighlightStory[] }> =>
  (await apiClient.get(`/highlights/${id}/stories`)).data;

export const getHighlightStats = async (id: string): Promise<{
  highlight_id: string;
  featured_stat: HighlightFeaturedStat;
  sessions: number;
  load: number;
  prs: number;
  readiness: number | null;
}> =>
  (await apiClient.get(`/highlights/${id}/stats`)).data;

export const updateMyProfile = async (data: {
  display_name?: string;
  bio?: string;
  location?: string;
  sport_tags?: string[];
  avatar_url?: string;
}): Promise<any> => {
  const response = await apiClient.patch('/users/me/profile', data);
  return response.data;
};

// ── Wellness Trends ───────────────────────────────────────────────────────────

export interface HrvDataPoint {
  date: string;
  hrv_ms: number;
}

export interface SleepDataPoint {
  date: string;
  duration_hours: number;
  bedtime: string | null;
}

export interface ReadinessDataPoint {
  date: string;
  score: number;
}

export interface HooperiDataPoint {
  date: string;
  sleep_quality: number;
  fatigue: number;
  stress: number;
  soreness: number;
  total: number;
}

export interface WellnessTrends {
  hrv_data: HrvDataPoint[];
  sleep_data: SleepDataPoint[];
  readiness_history: ReadinessDataPoint[];
  hooper_history: HooperiDataPoint[];
  hrv_stats: {
    current_hrv: number | null;
    seven_day_avg: number | null;
    thirty_day_avg: number | null;
    trend_direction: 'up' | 'down' | 'stable';
  };
  sleep_stats: {
    last_night_hours: number | null;
    seven_day_avg: number | null;
    best_this_month: number | null;
    avg_bedtime_variance_minutes: number | null;
  };
  readiness_stats: {
    best_day_this_month: { date: string; score: number } | null;
    worst_day_this_month: { date: string; score: number } | null;
    monthly_average: number | null;
  };
  hooper_stats: {
    current_total: number | null;
    seven_day_avg: number | null;
  };
  data_availability: {
    has_hrv_data: boolean;
    has_sleep_data: boolean;
    has_readiness_history: boolean;
    has_hooper_history: boolean;
  };
}

export async function getWellnessTrends(days = 30): Promise<WellnessTrends> {
  const response = await apiClient.get<WellnessTrends>('/wellness/trends', { params: { days } });
  return response.data;
}

// ── Direct Messages (Phase 1) ───────────────────────────────────────────────

export type DmMessageType =
  | 'text'
  | 'image'
  | 'workout_card'
  | 'daily_insight'
  | 'weekly_recap'
  | 'story_reply'
  | 'post_share';

export interface DmParticipant {
  id: string;
  display_name: string;
  username: string | null;
  avatar_url: string | null;
  initials: string;
}

export interface DmMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  message_type: DmMessageType;
  metadata: any | null;
  created_at: string;
  deleted_at: string | null;
}

export interface DmConversation {
  id: string;
  type: 'direct' | 'group';
  other_participant: DmParticipant | null;
  last_message: DmMessage | null;
  last_message_at: string | null;
  unread_count: number;
  muted: boolean;
  is_archived: boolean;
  is_request: boolean;
}

export async function listConversations(opts?: { page?: number; limit?: number; include_archived?: boolean }): Promise<DmConversation[]> {
  const params: Record<string, any> = { page: opts?.page ?? 1, limit: opts?.limit ?? 20 };
  if (opts?.include_archived) params.include_archived = true;
  const res = await apiClient.get<{ conversations: DmConversation[] }>('/messages/conversations', { params });
  return res.data.conversations;
}

export async function listMessageRequests(): Promise<DmConversation[]> {
  const res = await apiClient.get<{ conversations: DmConversation[] }>('/messages/conversations/requests');
  return res.data.conversations;
}

export async function listMessages(conversationId: string, opts?: { before?: string; limit?: number }): Promise<{ messages: DmMessage[]; has_more: boolean }> {
  const params: Record<string, any> = { limit: opts?.limit ?? 20 };
  if (opts?.before) params.before = opts.before;
  const res = await apiClient.get<{ messages: DmMessage[]; has_more: boolean }>(
    `/messages/conversations/${conversationId}/messages`,
    { params },
  );
  return res.data;
}

export async function sendMessage(
  conversationId: string,
  body: { content: string; message_type?: DmMessageType; metadata?: any },
): Promise<DmMessage> {
  const res = await apiClient.post<DmMessage>(
    `/messages/conversations/${conversationId}/messages`,
    {
      content: body.content,
      message_type: body.message_type ?? 'text',
      metadata: body.metadata ?? null,
    },
  );
  return res.data;
}

export async function startConversation(body: { recipient_id: string; initial_message?: string }): Promise<DmConversation> {
  const res = await apiClient.post<DmConversation>('/messages/conversations/start', body);
  return res.data;
}

export async function markConversationRead(conversationId: string): Promise<void> {
  await apiClient.post(`/messages/conversations/${conversationId}/read`);
}

export async function deleteMessage(conversationId: string, messageId: string): Promise<void> {
  await apiClient.delete(`/messages/conversations/${conversationId}/messages/${messageId}`);
}

export async function muteConversation(conversationId: string): Promise<void> {
  await apiClient.post(`/messages/conversations/${conversationId}/mute`);
}

export async function unmuteConversation(conversationId: string): Promise<void> {
  await apiClient.post(`/messages/conversations/${conversationId}/unmute`);
}

export async function archiveConversation(conversationId: string): Promise<void> {
  await apiClient.post(`/messages/conversations/${conversationId}/archive`);
}

export async function unarchiveConversation(conversationId: string): Promise<void> {
  await apiClient.post(`/messages/conversations/${conversationId}/unarchive`);
}

export async function getDmUnreadCount(): Promise<number> {
  const res = await apiClient.get<{ unread_count: number }>('/messages/unread-count');
  return res.data.unread_count;
}

export interface DmCandidate {
  id: string;
  display_name: string;
  username: string | null;
  avatar_url: string | null;
  initials: string;
}

export async function getDmCandidates(query?: string): Promise<DmCandidate[]> {
  const params: Record<string, any> = { limit: 50 };
  if (query) params.q = query;
  const res = await apiClient.get<{ users: DmCandidate[] }>('/messages/dm-candidates', { params });
  return res.data.users;
}

export default apiClient;
