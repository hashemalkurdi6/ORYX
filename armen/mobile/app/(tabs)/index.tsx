import { useCallback, useEffect, useMemo, useState } from 'react';
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
  ImageBackground,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const IMG_RECOVERY_HIGH = require('../../assets/images/cards/recovery_high.jpg');
const IMG_RECOVERY_LOW = require('../../assets/images/cards/recovery_low.jpg');
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  getDailyDiagnosis,
  getWellnessCheckins,
  submitWellnessCheckin,
  uploadHealthSnapshots,
  getTodayNutrition,
  upsertDailySteps,
  getDeloadStatus,
  DiagnosisResult,
  WellnessCheckin,
  NutritionLog,
  DeloadRecommendation,
} from '@/services/api';
import DeloadCard from '@/components/DeloadCard';
import { Pedometer } from 'expo-sensors';
import { useAuthStore } from '@/services/authStore';
import { fetchLast7DaysHealthData } from '@/services/healthKit';
import RecoveryIndicator from '@/components/RecoveryIndicator';
import { useTheme } from '@/contexts/ThemeContext';
import { ThemeColors } from '@/services/theme';

// ── Helpers ─────────────────────────────────────────────────────────────────

function todayISODate(): string {
  return new Date().toISOString().split('T')[0];
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning,';
  if (hour < 18) return 'Good afternoon,';
  return 'Good evening,';
}

function recoveryLabel(color: 'green' | 'yellow' | 'red'): string {
  if (color === 'green') return 'READY TO PERFORM';
  if (color === 'yellow') return 'MODERATE RECOVERY';
  return 'REST & RECOVER';
}

function recoveryHexColor(color: 'green' | 'yellow' | 'red'): string {
  if (color === 'green') return '#27ae60';
  if (color === 'yellow') return '#888888';
  return '#c0392b';
}

function wellnessDotColor(value: number): string {
  if (value >= 4) return '#27ae60';
  if (value === 3) return '#888888';
  return '#c0392b';
}

function actionIconName(color: 'green' | 'yellow' | 'red'): React.ComponentProps<typeof Ionicons>['name'] {
  if (color === 'green') return 'play-circle';
  if (color === 'yellow') return 'partly-sunny';
  return 'bed';
}

function formatTodayDate(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

// ── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonCard({ s }: { s: ReturnType<typeof createStyles> }) {
  return (
    <View style={s.card}>
      <View style={s.skeletonLabel} />
      <View style={s.skeletonLine100} />
      <View style={s.skeletonLine80} />
      <View style={s.skeletonLine60} />
    </View>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const { user } = useAuthStore();
  const { theme } = useTheme();
  const s = useMemo(() => createStyles(theme), [theme]);

  const [stepCount, setStepCount] = useState(0);
  const [pedometerAvailable, setPedometerAvailable] = useState(false);

  const [diagnosis, setDiagnosis] = useState<DiagnosisResult | null>(null);
  const [diagnosisLoading, setDiagnosisLoading] = useState(true);
  const [deloadRec, setDeloadRec] = useState<DeloadRecommendation | null>(null);
  const [deloadDismissed, setDeloadDismissed] = useState(false);
  const [todayCheckin, setTodayCheckin] = useState<WellnessCheckin | null>(null);
  const [todayNutrition, setTodayNutrition] = useState<NutritionLog[]>([]);
  const [showWellnessModal, setShowWellnessModal] = useState(false);
  const [wellnessForm, setWellnessForm] = useState({
    mood: 3,
    energy: 3,
    soreness: 3,
    notes: '',
  });
  const [submittingWellness, setSubmittingWellness] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    try {
      setError(null);
      setDiagnosisLoading(true);

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

      const [diagnosisResult, wellnessResult, nutritionResult, deloadResult] = await Promise.allSettled([
        getDailyDiagnosis(),
        getWellnessCheckins(1),
        getTodayNutrition(),
        getDeloadStatus(),
      ]);

      if (diagnosisResult.status === 'fulfilled') {
        setDiagnosis(diagnosisResult.value);
      } else {
        setDiagnosis(null);
      }

      if (wellnessResult.status === 'fulfilled') {
        const today = todayISODate();
        const todayEntry = wellnessResult.value.find((c) => c.date === today) ?? null;
        setTodayCheckin(todayEntry);
      }

      if (nutritionResult.status === 'fulfilled') {
        setTodayNutrition(nutritionResult.value);
      }

      if (deloadResult.status === 'fulfilled') {
        setDeloadRec(deloadResult.value);
        setDeloadDismissed(false);
      }
    } catch {
      setError('Failed to load data. Pull down to retry.');
    } finally {
      setDiagnosisLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    let sub: any;
    (async () => {
      const { status } = await Pedometer.requestPermissionsAsync();
      if (status === 'granted') {
        const isAvail = await Pedometer.isAvailableAsync();
        setPedometerAvailable(isAvail);
        if (isAvail) {
          const end = new Date();
          const start = new Date();
          start.setHours(0, 0, 0, 0);
          const result = await Pedometer.getStepCountAsync(start, end);
          setStepCount(result.steps);
          sub = Pedometer.watchStepCount((r) => setStepCount((prev) => prev + r.steps));
          const today = end.toISOString().split('T')[0];
          upsertDailySteps(today, result.steps).catch(() => {});
        }
      }
    })();
    return () => sub?.remove();
  }, []);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  // ── Wellness handlers ─────────────────────────────────────────────────────

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
    setSubmittingWellness(true);
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
      setSubmittingWellness(false);
    }
  };

  const openWellnessModal = () => {
    if (todayCheckin) {
      setWellnessForm({
        mood: todayCheckin.mood,
        energy: todayCheckin.energy,
        soreness: todayCheckin.soreness,
        notes: todayCheckin.notes ?? '',
      });
    } else {
      setWellnessForm({ mood: 3, energy: 3, soreness: 3, notes: '' });
    }
    setShowWellnessModal(true);
  };

  // ── Computed ──────────────────────────────────────────────────────────────

  const recoveryScore = diagnosis?.recovery_score ?? 0;
  const recoveryColorKey = diagnosis?.recovery_color ?? 'yellow';
  const accentColor = recoveryHexColor(recoveryColorKey);

  const displayName =
    user?.full_name ||
    user?.username ||
    user?.email?.split('@')[0] ||
    'Athlete';

  const totalCalories = todayNutrition.reduce(
    (sum, log) => sum + (log.calories ?? 0),
    0
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <ScrollView
        style={s.container}
        contentContainerStyle={s.contentContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.text.secondary}
            colors={[theme.accent]}
          />
        }
      >
        {/* Header */}
        <SafeAreaView edges={['top']} style={s.safeHeader}>
          <View style={s.headerRow}>
            <View>
              <Text style={s.greeting}>{getGreeting()}</Text>
              <Text style={s.userName}>{displayName}</Text>
            </View>
            <View style={s.notifIconPlaceholder}>
              <Ionicons name="notifications-outline" size={22} color={theme.text.secondary} />
            </View>
          </View>
        </SafeAreaView>

        {/* Step Counter Card */}
        {pedometerAvailable && (
          <View style={s.stepCard}>
            <Ionicons name="walk-outline" size={20} color={theme.status.success} />
            <View style={s.stepCardInfo}>
              <Text style={s.stepCardLabel}>TODAY'S STEPS</Text>
              <Text style={s.stepCardCount}>{stepCount.toLocaleString()}</Text>
              <View style={s.stepProgressBar}>
                <View
                  style={[
                    s.stepProgressFill,
                    { width: `${Math.min(100, (stepCount / 10000) * 100)}%` as any },
                  ]}
                />
              </View>
              <Text style={s.stepGoalText}>Goal: 10,000</Text>
            </View>
          </View>
        )}

        {/* Error banner */}
        {error ? (
          <View style={s.errorBox}>
            <Text style={s.errorText}>{error}</Text>
            <TouchableOpacity onPress={loadData} style={s.retryButton}>
              <Text style={s.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Recovery Hero Card */}
        <ImageBackground
          source={recoveryColorKey === 'green' ? IMG_RECOVERY_HIGH : IMG_RECOVERY_LOW}
          style={s.photoCard}
          imageStyle={s.photoCardImage}
        >
          <LinearGradient
            colors={['rgba(0,0,0,0.1)', 'rgba(0,0,0,0.88)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={s.photoGradient}
          >
            <View style={s.photoChevron} pointerEvents="none">
              <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.5)" />
            </View>

            <RecoveryIndicator
              score={recoveryScore}
              color={recoveryColorKey}
              loading={diagnosisLoading}
            />
            {!diagnosisLoading && (
              <>
                <Text style={s.photoStatusLabel}>
                  {recoveryLabel(recoveryColorKey)}
                </Text>
                {diagnosis?.diagnosis ? (
                  <Text style={s.photoBodyText} numberOfLines={2}>
                    {diagnosis.diagnosis.split('.')[0].trim() + '.'}
                  </Text>
                ) : null}
              </>
            )}

            <View style={s.photoMiniStatsRow}>
              <View style={s.miniStatItem}>
                <Text style={s.photoStatValue}>--</Text>
                <Text style={s.photoStatLabel}>HRV</Text>
              </View>
              <View style={s.photoStatDivider} />
              <View style={s.miniStatItem}>
                <Text style={s.photoStatValue}>--</Text>
                <Text style={s.photoStatLabel}>Sleep</Text>
              </View>
              <View style={s.photoStatDivider} />
              <View style={s.miniStatItem}>
                <Text style={s.photoStatValue}>--</Text>
                <Text style={s.photoStatLabel}>Strain</Text>
              </View>
            </View>
          </LinearGradient>
        </ImageBackground>

        {/* Deload Detector card — only visible when a recommendation is active */}
        {!deloadDismissed && (
          <DeloadCard
            recommendation={deloadRec}
            loading={diagnosisLoading}
            onDismiss={() => setDeloadDismissed(true)}
          />
        )}

        {/* Section header: Today's Intelligence */}
        <Text style={s.sectionHeader}>TODAY'S INTELLIGENCE</Text>

        {diagnosisLoading ? (
          <>
            <SkeletonCard s={s} />
            <SkeletonCard s={s} />
            <SkeletonCard s={s} />
          </>
        ) : (
          <>
            {/* Card 1 — How is my body? */}
            <View style={[s.card, s.intelligenceCard, { borderLeftColor: accentColor }]}>
              <Text style={s.cardQuestionLabel}>HOW IS MY BODY?</Text>
              <Text style={s.intelligenceText}>
                {diagnosis?.diagnosis || 'No diagnosis available yet. Connect a health device to get started.'}
              </Text>
            </View>

            {/* Card 2 — What should I do? */}
            <View style={[s.card, s.intelligenceCard, { borderLeftColor: theme.accent }]}>
              <View style={s.recommendationHeader}>
                <Text style={s.cardQuestionLabel}>WHAT SHOULD I DO?</Text>
                <Ionicons
                  name={actionIconName(recoveryColorKey)}
                  size={18}
                  color={accentColor}
                />
              </View>
              <Text style={s.intelligenceText}>
                {diagnosis?.recommendation || 'Keep your training consistent and listen to your body.'}
              </Text>
            </View>

            {/* Card 3 — Why do I feel this? */}
            <View style={[s.card, s.intelligenceCard, { borderLeftColor: theme.text.secondary }]}>
              <Text style={s.cardQuestionLabel}>WHY DO I FEEL THIS?</Text>
              {diagnosis?.main_factor ? (
                <>
                  <Text style={s.mainFactorText}>{diagnosis.main_factor}</Text>
                  <Text style={s.intelligenceSubText}>
                    This is the primary driver of your current recovery state.
                  </Text>
                </>
              ) : (
                <Text style={s.intelligenceText}>
                  Not enough data to determine the main factor yet.
                </Text>
              )}
            </View>
          </>
        )}

        {/* Wellness Check-In */}
        <Text style={s.sectionHeader}>WELLNESS</Text>
        {todayCheckin ? (
          <TouchableOpacity style={s.card} onPress={openWellnessModal} activeOpacity={0.8}>
            <Text style={s.cardQuestionLabel}>FEELING TODAY</Text>
            <View style={s.wellnessChipsRow}>
              {(['mood', 'energy', 'soreness'] as const).map((field) => (
                <View
                  key={field}
                  style={[
                    s.wellnessChip,
                    { borderColor: wellnessDotColor(todayCheckin[field]) },
                  ]}
                >
                  <Text style={[s.wellnessChipValue, { color: wellnessDotColor(todayCheckin[field]) }]}>
                    {todayCheckin[field]}/5
                  </Text>
                  <Text style={s.wellnessChipLabel}>
                    {field.charAt(0).toUpperCase() + field.slice(1)}
                  </Text>
                </View>
              ))}
            </View>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[s.card, s.wellnessPromptCard]}
            onPress={openWellnessModal}
            activeOpacity={0.8}
          >
            <View style={s.wellnessPromptRow}>
              <View style={s.wellnessPromptIcons}>
                <Ionicons name="happy-outline" size={18} color={theme.text.secondary} />
                <Ionicons name="flash-outline" size={18} color={theme.text.secondary} />
                <Ionicons name="body-outline" size={18} color={theme.text.secondary} />
              </View>
              <Text style={s.wellnessPromptText}>Log how you feel today</Text>
              <Ionicons name="chevron-forward" size={16} color={theme.text.secondary} />
            </View>
          </TouchableOpacity>
        )}

        {/* Today's Nutrition */}
        <Text style={s.sectionHeader}>NUTRITION</Text>
        {todayNutrition.length > 0 ? (
          <View style={s.card}>
            <View style={s.nutritionHeaderRow}>
              <Text style={s.cardQuestionLabel}>TODAY'S MEALS</Text>
              <Text style={s.nutritionCaloriesTotal}>{totalCalories} kcal</Text>
            </View>
            {todayNutrition.slice(0, 3).map((log) => (
              <View key={log.id} style={s.nutritionRow}>
                <Ionicons name="restaurant-outline" size={14} color={theme.text.secondary} />
                <Text style={s.nutritionMealName} numberOfLines={1}>
                  {log.meal_name}
                </Text>
                {log.calories ? (
                  <Text style={s.nutritionMealCal}>{log.calories} kcal</Text>
                ) : null}
              </View>
            ))}
            {todayNutrition.length > 3 && (
              <Text style={s.nutritionMore}>
                +{todayNutrition.length - 3} more meals
              </Text>
            )}
          </View>
        ) : (
          <View style={s.card}>
            <View style={s.nutritionEmptyRow}>
              <Ionicons name="restaurant-outline" size={20} color={theme.text.secondary} />
              <Text style={s.nutritionEmptyText}>No meals logged yet</Text>
            </View>
          </View>
        )}

        <View style={s.bottomPadding} />
      </ScrollView>

      {/* Wellness Modal */}
      <Modal
        visible={showWellnessModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowWellnessModal(false)}
      >
        <KeyboardAvoidingView
          style={s.modalWrapper}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerStyle={s.modalContent} keyboardShouldPersistTaps="handled">
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>How are you feeling today?</Text>
            <Text style={s.modalSubtitle}>{formatTodayDate()}</Text>

            {(['mood', 'energy', 'soreness'] as const).map((field) => (
              <View key={field} style={s.wellnessRow}>
                <Text style={s.wellnessRowLabel}>
                  {field.charAt(0).toUpperCase() + field.slice(1)}
                </Text>
                <View style={s.wellnessControls}>
                  <TouchableOpacity
                    style={s.stepButton}
                    onPress={() => handleWellnessAdjust(field, -1)}
                    activeOpacity={0.7}
                  >
                    <Text style={s.stepButtonText}>−</Text>
                  </TouchableOpacity>
                  <View
                    style={[
                      s.valueBadge,
                      { borderColor: wellnessDotColor(wellnessForm[field]) },
                    ]}
                  >
                    <Text
                      style={[
                        s.valueText,
                        { color: wellnessDotColor(wellnessForm[field]) },
                      ]}
                    >
                      {wellnessForm[field]}/5
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={s.stepButton}
                    onPress={() => handleWellnessAdjust(field, 1)}
                    activeOpacity={0.7}
                  >
                    <Text style={s.stepButtonText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}

            <Text style={s.modalFieldLabel}>Notes (optional)</Text>
            <TextInput
              style={s.modalTextArea}
              placeholder="Any notes about today…"
              placeholderTextColor={theme.text.muted}
              multiline
              numberOfLines={3}
              value={wellnessForm.notes}
              onChangeText={(val) =>
                setWellnessForm((prev) => ({ ...prev, notes: val }))
              }
            />

            <TouchableOpacity
              style={[s.saveButton, submittingWellness && s.buttonDisabled]}
              onPress={handleSaveWellness}
              disabled={submittingWellness}
              activeOpacity={0.85}
            >
              {submittingWellness ? (
                <ActivityIndicator size="small" color={theme.bg.primary} />
              ) : (
                <Text style={s.saveButtonText}>Save Check-in</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={s.cancelButton}
              onPress={() => setShowWellnessModal(false)}
              activeOpacity={0.7}
            >
              <Text style={s.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function createStyles(t: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: t.bg.primary,
    },
    contentContainer: {
      paddingHorizontal: 20,
      paddingBottom: 40,
    },
    safeHeader: {
      paddingBottom: 20,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    greeting: {
      fontSize: 14,
      color: t.text.muted,
      marginBottom: 4,
    },
    userName: {
      fontSize: 22,
      fontWeight: '700',
      color: t.text.primary,
    },
    notifIconPlaceholder: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: t.bg.elevated,
      borderWidth: 1,
      borderColor: t.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      backgroundColor: t.bg.elevated,
      borderRadius: 16,
      padding: 14,
      borderWidth: 1,
      borderColor: t.border,
      marginBottom: 12,
    },
    stepCardInfo: {
      flex: 1,
      gap: 4,
    },
    stepCardLabel: {
      fontSize: 10,
      fontWeight: '600',
      color: t.text.muted,
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    stepCardCount: {
      fontSize: 22,
      fontWeight: '700',
      color: t.text.primary,
    },
    stepProgressBar: {
      height: 4,
      backgroundColor: t.border,
      borderRadius: 2,
      overflow: 'hidden',
      marginTop: 2,
    },
    stepProgressFill: {
      height: 4,
      backgroundColor: t.status.success,
      borderRadius: 2,
    },
    stepGoalText: {
      fontSize: 11,
      color: t.text.muted,
    },
    errorBox: {
      backgroundColor: 'rgba(192,57,43,0.12)',
      borderLeftWidth: 3,
      borderLeftColor: t.status.danger,
      borderRadius: 10,
      padding: 14,
      marginBottom: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    errorText: {
      color: t.status.danger,
      fontSize: 14,
      flex: 1,
    },
    retryButton: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      backgroundColor: 'rgba(192,57,43,0.12)',
      borderRadius: 8,
      marginLeft: 8,
    },
    retryText: {
      color: t.status.danger,
      fontSize: 13,
      fontWeight: '600',
    },
    card: {
      backgroundColor: t.bg.elevated,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: t.border,
      marginBottom: 12,
    },
    // ── Photo card styles ────────────────────────────────────────────────────
    photoCard: {
      borderRadius: 20,
      overflow: 'hidden',
      minHeight: 240,
      marginBottom: 20,
    },
    photoCardImage: { borderRadius: 20 },
    photoGradient: {
      minHeight: 240,
      padding: 20,
      justifyContent: 'flex-end',
      gap: 8,
    },
    photoChevron: {
      position: 'absolute',
      top: 16,
      right: 16,
    },
    photoStatusLabel: {
      fontSize: 13,
      fontWeight: '700',
      letterSpacing: 2,
      textTransform: 'uppercase',
      color: 'rgba(255,255,255,0.7)',
    },
    photoBodyText: {
      fontSize: 14,
      color: 'rgba(255,255,255,0.75)',
      lineHeight: 20,
      textAlign: 'center',
    },
    photoMiniStatsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 4,
      width: '100%',
      backgroundColor: 'rgba(0,0,0,0.3)',
      borderRadius: 12,
      padding: 14,
    },
    photoStatValue: {
      fontSize: 18,
      fontWeight: '700',
      color: '#FFFFFF',
    },
    photoStatLabel: {
      fontSize: 10,
      color: 'rgba(255,255,255,0.6)',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    photoStatDivider: {
      width: 1,
      height: 28,
      backgroundColor: 'rgba(255,255,255,0.2)',
    },
    // ── Legacy (kept for non-photo uses) ─────────────────────────────────────
    miniStatsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 6,
      width: '100%',
      paddingHorizontal: 16,
    },
    miniStatItem: {
      flex: 1,
      alignItems: 'center',
      gap: 3,
    },
    miniStatDivider: {
      width: 1,
      height: 28,
      backgroundColor: t.border,
    },
    miniStatValue: {
      fontSize: 18,
      fontWeight: '700',
      color: t.text.primary,
    },
    miniStatLabel: {
      fontSize: 10,
      color: t.text.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    sectionHeader: {
      fontSize: 11,
      fontWeight: '600',
      color: t.text.muted,
      textTransform: 'uppercase',
      letterSpacing: 2,
      marginBottom: 10,
      marginTop: 4,
    },
    intelligenceCard: {
      borderLeftWidth: 3,
    },
    cardQuestionLabel: {
      fontSize: 10,
      fontWeight: '600',
      color: t.text.secondary,
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginBottom: 8,
    },
    intelligenceText: {
      fontSize: 15,
      color: t.text.primary,
      lineHeight: 22,
    },
    intelligenceSubText: {
      fontSize: 13,
      color: t.text.secondary,
      marginTop: 4,
      lineHeight: 18,
    },
    recommendationHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    mainFactorText: {
      fontSize: 18,
      fontWeight: '700',
      color: t.text.primary,
      marginBottom: 4,
    },
    wellnessChipsRow: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 4,
    },
    wellnessChip: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 10,
      borderRadius: 10,
      borderWidth: 1,
      backgroundColor: t.bg.secondary,
      gap: 2,
    },
    wellnessChipValue: {
      fontSize: 15,
      fontWeight: '700',
    },
    wellnessChipLabel: {
      fontSize: 11,
      color: t.text.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    wellnessPromptCard: {
      padding: 16,
    },
    wellnessPromptRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    wellnessPromptIcons: {
      flexDirection: 'row',
      gap: 4,
    },
    wellnessPromptText: {
      flex: 1,
      fontSize: 15,
      color: t.text.muted,
    },
    nutritionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    nutritionCaloriesTotal: {
      fontSize: 16,
      fontWeight: '700',
      color: t.status.success,
    },
    nutritionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 6,
      borderTopWidth: 1,
      borderTopColor: t.border,
    },
    nutritionMealName: {
      flex: 1,
      fontSize: 14,
      color: t.text.primary,
    },
    nutritionMealCal: {
      fontSize: 13,
      color: t.text.secondary,
    },
    nutritionMore: {
      fontSize: 12,
      color: t.text.muted,
      marginTop: 8,
      textAlign: 'center',
    },
    nutritionEmptyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 4,
    },
    nutritionEmptyText: {
      fontSize: 14,
      color: t.text.muted,
    },
    // Skeleton styles
    skeletonLabel: {
      height: 11,
      width: '50%',
      backgroundColor: t.border,
      borderRadius: 6,
      marginBottom: 14,
    },
    skeletonLine100: {
      height: 14,
      width: '100%',
      backgroundColor: t.border,
      borderRadius: 6,
      marginBottom: 10,
    },
    skeletonLine80: {
      height: 14,
      width: '80%',
      backgroundColor: t.border,
      borderRadius: 6,
      marginBottom: 10,
    },
    skeletonLine60: {
      height: 14,
      width: '60%',
      backgroundColor: t.border,
      borderRadius: 6,
    },
    // Modal styles
    modalWrapper: {
      flex: 1,
      backgroundColor: t.bg.primary,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
    },
    modalContent: {
      padding: 24,
      paddingBottom: 48,
    },
    modalHandle: {
      width: 40,
      height: 4,
      backgroundColor: t.border,
      borderRadius: 2,
      alignSelf: 'center',
      marginBottom: 24,
    },
    modalTitle: {
      fontSize: 22,
      fontWeight: '700',
      color: t.text.primary,
      marginBottom: 6,
    },
    modalSubtitle: {
      fontSize: 14,
      color: t.text.secondary,
      marginBottom: 28,
    },
    wellnessRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 20,
    },
    wellnessRowLabel: {
      fontSize: 16,
      color: t.text.primary,
      fontWeight: '500',
    },
    wellnessControls: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    stepButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: t.bg.elevated,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepButtonText: {
      fontSize: 20,
      color: t.text.primary,
      lineHeight: 24,
    },
    valueBadge: {
      width: 52,
      height: 36,
      borderRadius: 10,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    valueText: {
      fontSize: 14,
      fontWeight: '700',
    },
    modalFieldLabel: {
      fontSize: 13,
      color: t.text.secondary,
      marginBottom: 8,
      fontWeight: '500',
    },
    modalTextArea: {
      backgroundColor: t.bg.elevated,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 16,
      color: t.text.primary,
      borderWidth: 1,
      borderColor: t.border,
      minHeight: 80,
      textAlignVertical: 'top',
      marginBottom: 24,
    },
    saveButton: {
      backgroundColor: t.text.primary,
      borderRadius: 12,
      paddingVertical: 16,
      alignItems: 'center',
      marginBottom: 12,
    },
    saveButtonText: {
      color: t.bg.primary,
      fontSize: 16,
      fontWeight: '700',
    },
    cancelButton: {
      alignItems: 'center',
      paddingVertical: 12,
    },
    cancelText: {
      color: t.text.muted,
      fontSize: 15,
    },
    buttonDisabled: {
      opacity: 0.5,
    },
    bottomPadding: {
      height: 24,
    },
  });
}
