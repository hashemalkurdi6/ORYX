import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
} from 'react-native';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import {
  getMe,
  getActivities,
  getDailyDiagnosis,
  getWorkoutAutopsy,
  getHealthSnapshots,
  getStravaAuthUrl,
  uploadHealthSnapshots,
  getWhoopAuthUrl,
  getOuraAuthUrl,
  getWhoopData,
  getOuraData,
  getWellnessCheckins,
  getTodayNutrition,
  submitWellnessCheckin,
  logNutrition,
  deleteNutritionLog,
  Activity,
  HealthSnapshot,
  DiagnosisResult,
  WhoopData,
  OuraData,
  WellnessCheckin,
  NutritionLog,
} from '@/services/api';
import { useAuthStore } from '@/services/authStore';
import { fetchLast7DaysHealthData } from '@/services/healthKit';
import RecoveryIndicator from '@/components/RecoveryIndicator';
import DiagnosisCard from '@/components/DiagnosisCard';
import WorkoutAutopsyCard from '@/components/WorkoutAutopsyCard';
import SleepHRVChart from '@/components/SleepHRVChart';

// ── Helpers ────────────────────────────────────────────────────────────────

function todayISODate(): string {
  return new Date().toISOString().split('T')[0];
}

function wellnessDotColor(value: number): string {
  if (value >= 4) return '#27ae60';
  if (value === 3) return '#888888';
  return '#c0392b';
}

// ── Component ──────────────────────────────────────────────────────────────

export default function DashboardScreen() {
  const { user, setAuth, clearAuth, token } = useAuthStore();

  // Phase 1 state
  const [diagnosis, setDiagnosis] = useState<DiagnosisResult | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [autopsyMap, setAutopsyMap] = useState<Record<string, string | null>>({});
  const [autopsyLoading, setAutopsyLoading] = useState<Record<string, boolean>>({});
  const [healthSnapshots, setHealthSnapshots] = useState<HealthSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [diagnosisLoading, setDiagnosisLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Phase 2 state
  const [whoopData, setWhoopData] = useState<WhoopData[]>([]);
  const [ouraData, setOuraData] = useState<OuraData[]>([]);
  const [todayCheckin, setTodayCheckin] = useState<WellnessCheckin | null>(null);
  const [todayNutrition, setTodayNutrition] = useState<NutritionLog[]>([]);
  const [showWellnessModal, setShowWellnessModal] = useState(false);
  const [showNutritionModal, setShowNutritionModal] = useState(false);
  const [wellnessForm, setWellnessForm] = useState({
    mood: 3,
    energy: 3,
    soreness: 3,
    notes: '',
  });
  const [nutritionForm, setNutritionForm] = useState({
    meal_name: '',
    calories: '',
    protein_g: '',
    carbs_g: '',
    fat_g: '',
  });
  const [wellnessSaving, setWellnessSaving] = useState(false);
  const [nutritionSaving, setNutritionSaving] = useState(false);

  // ── Data loading ─────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    try {
      setError(null);

      // 1. Check auth and get user
      const me = await getMe();
      if (token) {
        setAuth(token, {
          id: me.id,
          email: me.email,
          strava_connected: me.strava_connected,
          whoop_connected: me.whoop_connected,
          oura_connected: me.oura_connected,
        });
      }

      // 2. Upload HealthKit data on iOS
      if (Platform.OS === 'ios') {
        try {
          const healthData = await fetchLast7DaysHealthData();
          if (healthData.length > 0) {
            await uploadHealthSnapshots(healthData);
          }
        } catch {
          // Non-fatal — continue without HealthKit data
        }
      }

      // 3. Get daily diagnosis
      setDiagnosisLoading(true);
      const [
        diagnosisResult,
        activitiesResult,
        snapshotsResult,
        whoopResult,
        ouraResult,
        wellnessResult,
        nutritionResult,
      ] = await Promise.allSettled([
        getDailyDiagnosis(),
        getActivities(1, 20),
        getHealthSnapshots(7),
        getWhoopData(7),
        getOuraData(7),
        getWellnessCheckins(1),
        getTodayNutrition(),
      ]);

      if (diagnosisResult.status === 'fulfilled') {
        setDiagnosis(diagnosisResult.value);
      }
      setDiagnosisLoading(false);

      const top3Activities: Activity[] = [];
      if (activitiesResult.status === 'fulfilled') {
        top3Activities.push(...activitiesResult.value.slice(0, 3));
        setActivities(top3Activities);
      }

      if (snapshotsResult.status === 'fulfilled') {
        setHealthSnapshots(snapshotsResult.value);
      }

      if (whoopResult.status === 'fulfilled') {
        setWhoopData(whoopResult.value);
      }

      if (ouraResult.status === 'fulfilled') {
        setOuraData(ouraResult.value);
      }

      if (wellnessResult.status === 'fulfilled') {
        const checkins = wellnessResult.value;
        const today = todayISODate();
        const todayEntry = checkins.find((c) => c.date === today) ?? null;
        setTodayCheckin(todayEntry);
      }

      if (nutritionResult.status === 'fulfilled') {
        setTodayNutrition(nutritionResult.value);
      }

      // 4. Generate autopsies for activities that don't have one yet
      for (const act of top3Activities) {
        if (!act.autopsy_text) {
          setAutopsyLoading((prev) => ({ ...prev, [act.id]: true }));
          try {
            const result = await getWorkoutAutopsy(act.id);
            setAutopsyMap((prev) => ({ ...prev, [act.id]: result.autopsy }));
          } catch {
            setAutopsyMap((prev) => ({ ...prev, [act.id]: null }));
          } finally {
            setAutopsyLoading((prev) => ({ ...prev, [act.id]: false }));
          }
        } else {
          setAutopsyMap((prev) => ({ ...prev, [act.id]: act.autopsy_text }));
        }
      }
    } catch (err: unknown) {
      const axiosError = err as { response?: { status?: number } };
      if (axiosError?.response?.status === 401) {
        clearAuth();
        router.replace('/(auth)/login');
        return;
      }
      setError('Failed to load data. Pull down to retry.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, setAuth, clearAuth]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  // ── Phase 1 handlers ──────────────────────────────────────────────────────

  const handleConnectStrava = async () => {
    try {
      const { url } = await getStravaAuthUrl();
      await WebBrowser.openBrowserAsync(url);
    } catch {
      Alert.alert('Error', 'Could not open Strava authorization. Please try again.');
    }
  };

  const handleLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: () => {
          clearAuth();
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  // ── Phase 2 handlers ──────────────────────────────────────────────────────

  const handleConnectWhoop = async () => {
    try {
      const { url } = await getWhoopAuthUrl();
      await WebBrowser.openBrowserAsync(url);
    } catch {
      Alert.alert('Error', 'Could not open WHOOP authorization. Please try again.');
    }
  };

  const handleConnectOura = async () => {
    try {
      const { url } = await getOuraAuthUrl();
      await WebBrowser.openBrowserAsync(url);
    } catch {
      Alert.alert('Error', 'Could not open Oura Ring authorization. Please try again.');
    }
  };

  const handleWellnessAdjust = (
    field: 'mood' | 'energy' | 'soreness',
    delta: number
  ) => {
    setWellnessForm((prev) => ({
      ...prev,
      [field]: Math.min(5, Math.max(1, prev[field] + delta)),
    }));
  };

  const handleSaveWellness = async () => {
    setWellnessSaving(true);
    try {
      const saved = await submitWellnessCheckin({
        date: todayISODate(),
        mood: wellnessForm.mood,
        energy: wellnessForm.energy,
        soreness: wellnessForm.soreness,
        notes: wellnessForm.notes.trim() || undefined,
      });
      setTodayCheckin(saved);
      setShowWellnessModal(false);
    } catch {
      Alert.alert('Error', 'Could not save check-in. Please try again.');
    } finally {
      setWellnessSaving(false);
    }
  };

  const handleLogMeal = async () => {
    if (!nutritionForm.meal_name.trim()) {
      Alert.alert('Required', 'Please enter a meal name.');
      return;
    }
    setNutritionSaving(true);
    try {
      const parseOptional = (val: string): number | undefined => {
        const n = parseFloat(val);
        return isNaN(n) ? undefined : n;
      };
      const saved = await logNutrition({
        meal_name: nutritionForm.meal_name.trim(),
        calories: parseOptional(nutritionForm.calories),
        protein_g: parseOptional(nutritionForm.protein_g),
        carbs_g: parseOptional(nutritionForm.carbs_g),
        fat_g: parseOptional(nutritionForm.fat_g),
      });
      setTodayNutrition((prev) => [...prev, saved]);
      setNutritionForm({
        meal_name: '',
        calories: '',
        protein_g: '',
        carbs_g: '',
        fat_g: '',
      });
      setShowNutritionModal(false);
    } catch {
      Alert.alert('Error', 'Could not log meal. Please try again.');
    } finally {
      setNutritionSaving(false);
    }
  };

  const handleDeleteNutrition = (id: string) => {
    Alert.alert('Delete Entry', 'Remove this meal from today\'s log?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteNutritionLog(id);
            setTodayNutrition((prev) => prev.filter((n) => n.id !== id));
          } catch {
            Alert.alert('Error', 'Could not delete entry. Please try again.');
          }
        },
      },
    ]);
  };

  // ── Computed values ────────────────────────────────────────────────────────

  const totalCalories = todayNutrition.reduce((sum, n) => {
    return sum + (n.calories ?? 0);
  }, 0);
  const hasCalories = todayNutrition.some((n) => n.calories !== null);

  // ── Loading screen ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#e0e0e0" />
        <Text style={styles.loadingText}>Loading your fitness data…</Text>
      </View>
    );
  }

  const recoveryScore = diagnosis?.recovery_score ?? 0;
  const recoveryColor = diagnosis?.recovery_color ?? 'yellow';

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#e0e0e0"
            colors={['#e0e0e0']}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.appTitle}>ORYX</Text>
            <Text style={styles.userEmail}>{user?.email ?? ''}</Text>
          </View>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
            <Ionicons name="log-out-outline" size={22} color="#888888" />
          </TouchableOpacity>
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* Recovery Score */}
        <View style={styles.section}>
          <RecoveryIndicator
            score={recoveryScore}
            color={recoveryColor}
            loading={diagnosisLoading}
          />
        </View>

        {/* Diagnosis Card */}
        <View style={styles.section}>
          <DiagnosisCard
            diagnosis={diagnosis?.diagnosis ?? ''}
            mainFactor={diagnosis?.main_factor ?? ''}
            recommendation={diagnosis?.recommendation ?? ''}
            loading={diagnosisLoading}
          />
        </View>

        {/* ── Phase 2 sections ── */}

        {/* Wellness Check-in Card */}
        <View style={styles.section}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Today's Wellness</Text>
            {todayCheckin ? (
              <View style={styles.wellnessRow}>
                {(['mood', 'energy', 'soreness'] as const).map((field) => (
                  <View key={field} style={styles.wellnessMetric}>
                    <View
                      style={[
                        styles.wellnessDot,
                        { backgroundColor: wellnessDotColor(todayCheckin[field]) },
                      ]}
                    />
                    <Text style={styles.wellnessMetricLabel}>
                      {field.charAt(0).toUpperCase() + field.slice(1)}
                    </Text>
                    <Text style={styles.wellnessMetricValue}>
                      {todayCheckin[field]}/5
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <TouchableOpacity
                style={styles.wellnessPromptButton}
                onPress={() => setShowWellnessModal(true)}
                activeOpacity={0.8}
              >
                <Ionicons name="add-circle-outline" size={18} color="#e0e0e0" />
                <Text style={styles.wellnessPromptText}>Log Today's Wellness</Text>
              </TouchableOpacity>
            )}
            {todayCheckin && (
              <TouchableOpacity
                style={styles.wellnessEditButton}
                onPress={() => {
                  setWellnessForm({
                    mood: todayCheckin.mood,
                    energy: todayCheckin.energy,
                    soreness: todayCheckin.soreness,
                    notes: todayCheckin.notes ?? '',
                  });
                  setShowWellnessModal(true);
                }}
              >
                <Text style={styles.wellnessEditText}>Update</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Connect WHOOP Banner — only when not connected */}
        {user && !user.whoop_connected && (
          <TouchableOpacity
            style={styles.whoopButton}
            onPress={handleConnectWhoop}
            activeOpacity={0.85}
          >
            <Ionicons name="pulse-outline" size={20} color="#FFFFFF" />
            <Text style={styles.deviceButtonText}>Connect WHOOP</Text>
          </TouchableOpacity>
        )}

        {/* WHOOP latest data — only when connected and data available */}
        {user?.whoop_connected && whoopData.length > 0 && (() => {
          const latest = whoopData[0];
          return (
            <View style={styles.section}>
              <View style={[styles.card, styles.whoopCard]}>
                <Text style={styles.cardTitle}>WHOOP · Latest</Text>
                <View style={styles.deviceDataRow}>
                  {latest.recovery_score !== null && (
                    <View style={styles.deviceDataItem}>
                      <Text style={styles.deviceDataValue}>
                        {Math.round(latest.recovery_score)}%
                      </Text>
                      <Text style={styles.deviceDataLabel}>Recovery</Text>
                    </View>
                  )}
                  {latest.hrv_rmssd !== null && (
                    <View style={styles.deviceDataItem}>
                      <Text style={styles.deviceDataValue}>
                        {Math.round(latest.hrv_rmssd)}ms
                      </Text>
                      <Text style={styles.deviceDataLabel}>HRV</Text>
                    </View>
                  )}
                  {latest.strain_score !== null && (
                    <View style={styles.deviceDataItem}>
                      <Text style={styles.deviceDataValue}>
                        {latest.strain_score.toFixed(1)}
                      </Text>
                      <Text style={styles.deviceDataLabel}>Strain</Text>
                    </View>
                  )}
                  {latest.sleep_performance_pct !== null && (
                    <View style={styles.deviceDataItem}>
                      <Text style={styles.deviceDataValue}>
                        {Math.round(latest.sleep_performance_pct)}%
                      </Text>
                      <Text style={styles.deviceDataLabel}>Sleep</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.deviceDataDate}>{latest.date}</Text>
              </View>
            </View>
          );
        })()}

        {/* Connect Oura Ring Banner — only when not connected */}
        {user && !user.oura_connected && (
          <TouchableOpacity
            style={styles.ouraButton}
            onPress={handleConnectOura}
            activeOpacity={0.85}
          >
            <Ionicons name="radio-button-on-outline" size={20} color="#FFFFFF" />
            <Text style={styles.deviceButtonText}>Connect Oura Ring</Text>
          </TouchableOpacity>
        )}

        {/* Oura latest data — only when connected and data available */}
        {user?.oura_connected && ouraData.length > 0 && (() => {
          const latest = ouraData[0];
          return (
            <View style={styles.section}>
              <View style={[styles.card, styles.ouraCard]}>
                <Text style={styles.cardTitle}>Oura Ring · Latest</Text>
                <View style={styles.deviceDataRow}>
                  {latest.readiness_score !== null && (
                    <View style={styles.deviceDataItem}>
                      <Text style={styles.deviceDataValue}>
                        {latest.readiness_score}
                      </Text>
                      <Text style={styles.deviceDataLabel}>Readiness</Text>
                    </View>
                  )}
                  {latest.sleep_score !== null && (
                    <View style={styles.deviceDataItem}>
                      <Text style={styles.deviceDataValue}>
                        {latest.sleep_score}
                      </Text>
                      <Text style={styles.deviceDataLabel}>Sleep</Text>
                    </View>
                  )}
                  {latest.hrv_average !== null && (
                    <View style={styles.deviceDataItem}>
                      <Text style={styles.deviceDataValue}>
                        {Math.round(latest.hrv_average)}ms
                      </Text>
                      <Text style={styles.deviceDataLabel}>HRV</Text>
                    </View>
                  )}
                  {latest.sleep_efficiency !== null && (
                    <View style={styles.deviceDataItem}>
                      <Text style={styles.deviceDataValue}>
                        {Math.round(latest.sleep_efficiency)}%
                      </Text>
                      <Text style={styles.deviceDataLabel}>Efficiency</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.deviceDataDate}>{latest.date}</Text>
              </View>
            </View>
          );
        })()}

        {/* Today's Nutrition */}
        <View style={styles.section}>
          <View style={styles.card}>
            <View style={styles.nutritionHeader}>
              <Text style={styles.cardTitle}>Today's Nutrition</Text>
              <TouchableOpacity
                style={styles.addMealButton}
                onPress={() => setShowNutritionModal(true)}
                activeOpacity={0.8}
              >
                <Ionicons name="add" size={16} color="#e0e0e0" />
                <Text style={styles.addMealText}>Add Meal</Text>
              </TouchableOpacity>
            </View>

            {todayNutrition.length === 0 ? (
              <Text style={styles.nutritionEmptyText}>No meals logged yet today.</Text>
            ) : (
              <>
                {todayNutrition.map((entry) => (
                  <View key={entry.id} style={styles.nutritionEntry}>
                    <View style={styles.nutritionEntryInfo}>
                      <Text style={styles.nutritionMealName}>{entry.meal_name}</Text>
                      {entry.calories !== null && (
                        <Text style={styles.nutritionCalories}>
                          {entry.calories} kcal
                        </Text>
                      )}
                    </View>
                    <TouchableOpacity
                      onPress={() => handleDeleteNutrition(entry.id)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="trash-outline" size={16} color="#555" />
                    </TouchableOpacity>
                  </View>
                ))}
                {hasCalories && (
                  <View style={styles.nutritionTotalRow}>
                    <Text style={styles.nutritionTotalLabel}>Total</Text>
                    <Text style={styles.nutritionTotalValue}>
                      {totalCalories} kcal
                    </Text>
                  </View>
                )}
              </>
            )}
          </View>
        </View>

        {/* Connect Strava Banner */}
        {user && !user.strava_connected && (
          <TouchableOpacity
            style={styles.stravaButton}
            onPress={handleConnectStrava}
            activeOpacity={0.85}
          >
            <Ionicons name="fitness-outline" size={20} color="#FFFFFF" />
            <Text style={styles.stravaButtonText}>Connect Strava to Import Workouts</Text>
          </TouchableOpacity>
        )}

        {/* Recent Workouts */}
        {activities.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recent Workouts</Text>
            {activities.map((act) => (
              <WorkoutAutopsyCard
                key={act.id}
                activity={act}
                autopsy={autopsyMap[act.id] ?? act.autopsy_text}
                loading={autopsyLoading[act.id] ?? false}
              />
            ))}
          </View>
        )}

        {/* Sleep & HRV Chart */}
        {healthSnapshots.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Sleep & HRV (7 Days)</Text>
            <SleepHRVChart snapshots={healthSnapshots} />
          </View>
        )}

        {activities.length === 0 && !user?.strava_connected && (
          <View style={styles.emptyState}>
            <Ionicons name="barbell-outline" size={48} color="#2a2a2a" />
            <Text style={styles.emptyTitle}>No workouts yet</Text>
            <Text style={styles.emptySubtitle}>
              Connect Strava above to import your training history.
            </Text>
          </View>
        )}

        <View style={styles.bottomPadding} />
      </ScrollView>

      {/* ── Wellness Modal ── */}
      <Modal
        visible={showWellnessModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowWellnessModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerStyle={styles.modalContent}>
            <Text style={styles.modalTitle}>How are you feeling today?</Text>

            {(['mood', 'energy', 'soreness'] as const).map((field) => (
              <View key={field} style={styles.wellnessSliderRow}>
                <Text style={styles.wellnessSliderLabel}>
                  {field.charAt(0).toUpperCase() + field.slice(1)}
                </Text>
                <View style={styles.wellnessControls}>
                  <TouchableOpacity
                    style={styles.wellnessStepButton}
                    onPress={() => handleWellnessAdjust(field, -1)}
                  >
                    <Text style={styles.wellnessStepButtonText}>−</Text>
                  </TouchableOpacity>
                  <View
                    style={[
                      styles.wellnessValueBadge,
                      { borderColor: wellnessDotColor(wellnessForm[field]) },
                    ]}
                  >
                    <Text
                      style={[
                        styles.wellnessValueText,
                        { color: wellnessDotColor(wellnessForm[field]) },
                      ]}
                    >
                      {wellnessForm[field]}/5
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.wellnessStepButton}
                    onPress={() => handleWellnessAdjust(field, 1)}
                  >
                    <Text style={styles.wellnessStepButtonText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}

            <Text style={styles.modalFieldLabel}>Notes (optional)</Text>
            <TextInput
              style={styles.modalTextArea}
              placeholder="Any notes about today…"
              placeholderTextColor="#555"
              multiline
              numberOfLines={3}
              value={wellnessForm.notes}
              onChangeText={(val) =>
                setWellnessForm((prev) => ({ ...prev, notes: val }))
              }
            />

            <TouchableOpacity
              style={[styles.modalPrimaryButton, wellnessSaving && styles.buttonDisabled]}
              onPress={handleSaveWellness}
              disabled={wellnessSaving}
              activeOpacity={0.85}
            >
              {wellnessSaving ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Text style={styles.modalPrimaryButtonText}>Save Check-in</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalCancelButton}
              onPress={() => setShowWellnessModal(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Nutrition Modal ── */}
      <Modal
        visible={showNutritionModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowNutritionModal(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerStyle={styles.modalContent}>
            <Text style={styles.modalTitle}>Log a Meal</Text>

            <Text style={styles.modalFieldLabel}>Meal Name *</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. Chicken & rice"
              placeholderTextColor="#555"
              value={nutritionForm.meal_name}
              onChangeText={(val) =>
                setNutritionForm((prev) => ({ ...prev, meal_name: val }))
              }
            />

            <Text style={styles.modalFieldLabel}>Calories (kcal)</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Optional"
              placeholderTextColor="#555"
              keyboardType="numeric"
              value={nutritionForm.calories}
              onChangeText={(val) =>
                setNutritionForm((prev) => ({ ...prev, calories: val }))
              }
            />

            <Text style={styles.modalFieldLabel}>Protein (g)</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Optional"
              placeholderTextColor="#555"
              keyboardType="numeric"
              value={nutritionForm.protein_g}
              onChangeText={(val) =>
                setNutritionForm((prev) => ({ ...prev, protein_g: val }))
              }
            />

            <Text style={styles.modalFieldLabel}>Carbs (g)</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Optional"
              placeholderTextColor="#555"
              keyboardType="numeric"
              value={nutritionForm.carbs_g}
              onChangeText={(val) =>
                setNutritionForm((prev) => ({ ...prev, carbs_g: val }))
              }
            />

            <Text style={styles.modalFieldLabel}>Fat (g)</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Optional"
              placeholderTextColor="#555"
              keyboardType="numeric"
              value={nutritionForm.fat_g}
              onChangeText={(val) =>
                setNutritionForm((prev) => ({ ...prev, fat_g: val }))
              }
            />

            <TouchableOpacity
              style={[styles.modalPrimaryButton, nutritionSaving && styles.buttonDisabled]}
              onPress={handleLogMeal}
              disabled={nutritionSaving}
              activeOpacity={0.85}
            >
              {nutritionSaving ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Text style={styles.modalPrimaryButtonText}>Log Meal</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalCancelButton}
              onPress={() => setShowNutritionModal(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.modalCancelText}>Cancel</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // ── Layout ──
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  contentContainer: {
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    color: '#888888',
    fontSize: 15,
  },
  // ── Header ──
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
  },
  appTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#e0e0e0',
    letterSpacing: 4,
  },
  userEmail: {
    fontSize: 13,
    color: '#555555',
    marginTop: 2,
  },
  logoutButton: {
    padding: 8,
  },
  // ── Error ──
  errorBox: {
    marginHorizontal: 20,
    marginBottom: 12,
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 14,
    borderLeftWidth: 3,
    borderLeftColor: '#c0392b',
  },
  errorText: {
    color: '#c0392b',
    fontSize: 13,
  },
  // ── Section wrapper ──
  section: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f0f0f0',
    marginBottom: 14,
  },
  // ── Generic card ──
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#f0f0f0',
    marginBottom: 12,
  },
  // ── Wellness card ──
  wellnessRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  wellnessMetric: {
    alignItems: 'center',
    gap: 6,
  },
  wellnessDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  wellnessMetricLabel: {
    color: '#888888',
    fontSize: 12,
  },
  wellnessMetricValue: {
    color: '#f0f0f0',
    fontSize: 15,
    fontWeight: '700',
  },
  wellnessPromptButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  wellnessPromptText: {
    color: '#e0e0e0',
    fontSize: 15,
    fontWeight: '600',
  },
  wellnessEditButton: {
    marginTop: 12,
    alignSelf: 'flex-end',
  },
  wellnessEditText: {
    color: '#e0e0e0',
    fontSize: 13,
    fontWeight: '600',
  },
  // ── Device connect buttons ──
  whoopButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginHorizontal: 20,
    marginBottom: 20,
    backgroundColor: '#FF6B35',
    borderRadius: 12,
    paddingVertical: 14,
    shadowColor: '#FF6B35',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 4,
  },
  ouraButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginHorizontal: 20,
    marginBottom: 20,
    backgroundColor: '#00B894',
    borderRadius: 12,
    paddingVertical: 14,
    shadowColor: '#00B894',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 4,
  },
  deviceButtonText: {
    color: '#f0f0f0',
    fontSize: 15,
    fontWeight: '700',
  },
  // ── Strava button ──
  stravaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginHorizontal: 20,
    marginBottom: 20,
    backgroundColor: '#FC4C02',
    borderRadius: 12,
    paddingVertical: 14,
    shadowColor: '#FC4C02',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 4,
  },
  stravaButtonText: {
    color: '#f0f0f0',
    fontSize: 15,
    fontWeight: '700',
  },
  // ── Nutrition section ──
  nutritionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  addMealButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addMealText: {
    color: '#e0e0e0',
    fontSize: 14,
    fontWeight: '600',
  },
  nutritionEmptyText: {
    color: '#555555',
    fontSize: 14,
  },
  nutritionEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
  },
  nutritionEntryInfo: {
    flex: 1,
    gap: 2,
  },
  nutritionMealName: {
    color: '#f0f0f0',
    fontSize: 14,
    fontWeight: '600',
  },
  nutritionCalories: {
    color: '#888888',
    fontSize: 12,
  },
  nutritionTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#2a2a2a',
  },
  nutritionTotalLabel: {
    color: '#888888',
    fontSize: 14,
    fontWeight: '600',
  },
  nutritionTotalValue: {
    color: '#f0f0f0',
    fontSize: 14,
    fontWeight: '700',
  },
  // ── Empty state ──
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingVertical: 48,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#555555',
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#555555',
    textAlign: 'center',
    lineHeight: 20,
  },
  bottomPadding: {
    height: 20,
  },
  // ── Modals ──
  modalContainer: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  modalContent: {
    padding: 24,
    paddingBottom: 48,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#f0f0f0',
    marginBottom: 28,
  },
  modalFieldLabel: {
    color: '#888888',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 14,
  },
  modalInput: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#f0f0f0',
    fontSize: 15,
  },
  modalTextArea: {
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#f0f0f0',
    fontSize: 15,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  // ── Wellness modal controls ──
  wellnessSliderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  wellnessSliderLabel: {
    color: '#f0f0f0',
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  wellnessControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  wellnessStepButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  wellnessStepButtonText: {
    color: '#f0f0f0',
    fontSize: 22,
    fontWeight: '600',
    lineHeight: 24,
  },
  wellnessValueBadge: {
    width: 52,
    height: 36,
    borderRadius: 8,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  wellnessValueText: {
    fontSize: 14,
    fontWeight: '700',
  },
  // ── Modal buttons ──
  modalPrimaryButton: {
    backgroundColor: '#e0e0e0',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 28,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  modalPrimaryButtonText: {
    color: '#f0f0f0',
    fontSize: 16,
    fontWeight: '700',
  },
  modalCancelButton: {
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  modalCancelText: {
    color: '#555555',
    fontSize: 15,
    fontWeight: '600',
  },
  // ── Device data cards ──
  whoopCard: {
    borderLeftWidth: 3,
    borderLeftColor: '#FF6B35',
  },
  ouraCard: {
    borderLeftWidth: 3,
    borderLeftColor: '#00B894',
  },
  deviceDataRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 10,
  },
  deviceDataItem: {
    alignItems: 'center',
    gap: 4,
  },
  deviceDataValue: {
    color: '#f0f0f0',
    fontSize: 18,
    fontWeight: '700',
  },
  deviceDataLabel: {
    color: '#888888',
    fontSize: 11,
    fontWeight: '500',
  },
  deviceDataDate: {
    color: '#555555',
    fontSize: 11,
    textAlign: 'right',
    marginTop: 2,
  },
});
