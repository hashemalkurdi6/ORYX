import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { router } from 'expo-router';
import {
  getDashboard,
  getDiagnosis,
  submitWellnessCheckin,
  uploadHealthSnapshots,
  upsertDailySteps,
  logRestDay,
  DashboardData,
  DiagnosisData,
} from '@/services/api';
import { Pedometer } from 'expo-sensors';
import { fetchLast7DaysHealthData } from '@/services/healthKit';
import { useTheme } from '@/contexts/ThemeContext';
import { ThemeColors } from '@/services/theme';

// ── Ring geometry ────────────────────────────────────────────────────────────

const RING_R = 54;
const RING_SW = 12;
const RING_C = 2 * Math.PI * RING_R;

// ── Helpers ──────────────────────────────────────────────────────────────────

function readinessHex(c: 'green' | 'amber' | 'red'): string {
  if (c === 'green') return '#22c55e';
  if (c === 'amber') return '#f59e0b';
  return '#ef4444';
}

function toneHex(tone: string): string {
  if (tone === 'positive') return '#22c55e';
  if (tone === 'warning') return '#ef4444';
  return '#f59e0b';
}

function wellnessHex(v: number): string {
  if (v >= 4) return '#22c55e';
  if (v === 3) return '#888888';
  return '#ef4444';
}

function acwrHex(status: string): string {
  if (status === 'optimal') return '#22c55e';
  if (status === 'undertraining') return '#888888';
  if (status === 'caution') return '#f59e0b';
  return '#ef4444';
}

function relativeDate(iso: string): string {
  const d = new Date(iso);
  const diff = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return `${diff}d ago`;
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning,';
  if (h < 18) return 'Good afternoon,';
  return 'Good evening,';
}

function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

function formatFullDate(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

// ── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonBlock({
  width,
  height,
  style,
}: {
  width: string | number;
  height: number;
  style?: object;
}) {
  const opacity = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);
  return (
    <Animated.View
      style={[{ width, height, borderRadius: 8, backgroundColor: '#2a2a2a', opacity }, style]}
    />
  );
}

function SkeletonCard({ s }: { s: ReturnType<typeof createStyles> }) {
  return (
    <View style={s.card}>
      <SkeletonBlock width="50%" height={10} style={{ marginBottom: 14 }} />
      <SkeletonBlock width="100%" height={13} style={{ marginBottom: 8 }} />
      <SkeletonBlock width="80%" height={13} style={{ marginBottom: 8 }} />
      <SkeletonBlock width="60%" height={13} />
    </View>
  );
}

// ── Readiness Ring ────────────────────────────────────────────────────────────

function ReadinessRing({
  score,
  color,
  loading,
}: {
  score: number;
  color: 'green' | 'amber' | 'red';
  loading: boolean;
}) {
  const hex = readinessHex(color);
  const pct = loading ? 0 : Math.max(0, Math.min(100, score)) / 100;
  const offset = RING_C * (1 - pct);

  return (
    <View style={{ width: 144, height: 144, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={144} height={144} style={{ position: 'absolute' }}>
        <Circle cx={72} cy={72} r={RING_R} stroke="#2a2a2a" strokeWidth={RING_SW} fill="none" />
        {!loading && (
          <Circle
            cx={72}
            cy={72}
            r={RING_R}
            stroke={hex}
            strokeWidth={RING_SW}
            fill="none"
            strokeDasharray={RING_C}
            strokeDashoffset={offset}
            strokeLinecap="round"
            rotation={-90}
            origin="72, 72"
          />
        )}
      </Svg>
      {loading ? (
        <ActivityIndicator color="#555" />
      ) : (
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 38, fontWeight: '800', color: hex, lineHeight: 42 }}>
            {score}
          </Text>
          <Text
            style={{
              fontSize: 9,
              color: '#888',
              textTransform: 'uppercase',
              letterSpacing: 1.5,
            }}
          >
            Readiness
          </Text>
        </View>
      )}
    </View>
  );
}

// ── Macro bar ─────────────────────────────────────────────────────────────────

function MacroBar({
  label,
  value,
  target,
  color,
}: {
  label: string;
  value: number;
  target: number | null;
  color: string;
}) {
  const pct = target && target > 0 ? Math.min(1, value / target) : 0;
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
        <Text style={{ fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {label}
        </Text>
        <Text style={{ fontSize: 10, fontWeight: '600', color: '#ccc' }}>
          {value}g{target ? `/${target}` : ''}
        </Text>
      </View>
      <View style={{ height: 4, backgroundColor: '#2a2a2a', borderRadius: 2, overflow: 'hidden' }}>
        <View
          style={{
            width: `${pct * 100}%` as any,
            height: 4,
            backgroundColor: color,
            borderRadius: 2,
          }}
        />
      </View>
    </View>
  );
}

// ── HomeScreen ────────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const { theme } = useTheme();
  const s = useMemo(() => createStyles(theme), [theme]);

  // Data state
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [diagnosis, setDiagnosis] = useState<DiagnosisData | null>(null);
  const [dashLoading, setDashLoading] = useState(true);
  const [diagLoading, setDiagLoading] = useState(true);
  const [diagRefreshing, setDiagRefreshing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pedometer
  const [stepCount, setStepCount] = useState(0);
  const [pedometerReady, setPedometerReady] = useState(false);

  // Wellness modal
  const [showWellnessModal, setShowWellnessModal] = useState(false);
  const [wellnessLogged, setWellnessLogged] = useState(false);
  const [wellnessValues, setWellnessValues] = useState({ mood: 3, energy: 3, soreness: 3 });
  const [wellnessForm, setWellnessForm] = useState({ mood: 3, energy: 3, soreness: 3, notes: '' });
  const [submittingWellness, setSubmittingWellness] = useState(false);

  // ── Loaders ────────────────────────────────────────────────────────────────

  const loadDashboard = useCallback(async () => {
    try {
      const data = await getDashboard();
      setDashboard(data);
      if (data.mood_today != null) {
        setWellnessLogged(true);
        setWellnessValues({
          mood: data.mood_today,
          energy: data.energy_today ?? 3,
          soreness: data.soreness_today ?? 3,
        });
      } else {
        setWellnessLogged(false);
      }
    } catch {
      setError('Failed to load dashboard. Pull down to retry.');
    } finally {
      setDashLoading(false);
    }
  }, []);

  const loadDiagnosis = useCallback(async (force = false) => {
    if (!force) setDiagLoading(true);
    try {
      const data = await getDiagnosis(force || undefined);
      setDiagnosis(data);
    } catch {
      // Non-fatal — diagnosis card stays empty
    } finally {
      setDiagLoading(false);
      setDiagRefreshing(false);
    }
  }, []);

  const loadAll = useCallback(async () => {
    setError(null);
    setDashLoading(true);
    setDiagLoading(true);

    if (Platform.OS === 'ios') {
      try {
        const hk = await fetchLast7DaysHealthData();
        if (hk.length > 0) await uploadHealthSnapshots(hk);
      } catch {
        // Non-fatal
      }
    }

    await Promise.all([loadDashboard(), loadDiagnosis()]);
    setRefreshing(false);
  }, [loadDashboard, loadDiagnosis]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // ── Pedometer ─────────────────────────────────────────────────────────────

  useEffect(() => {
    let sub: any;
    (async () => {
      const { status } = await Pedometer.requestPermissionsAsync();
      if (status !== 'granted') return;
      const avail = await Pedometer.isAvailableAsync();
      if (!avail) return;
      setPedometerReady(true);
      const end = new Date();
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const result = await Pedometer.getStepCountAsync(start, end);
      setStepCount(result.steps);
      sub = Pedometer.watchStepCount((r) => setStepCount((p) => p + r.steps));
      upsertDailySteps(end.toISOString().split('T')[0], result.steps).catch(() => {});
    })();
    return () => sub?.remove();
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadAll();
  }, [loadAll]);

  const handleRefreshDiagnosis = useCallback(async () => {
    if (diagRefreshing || diagnosis?.rate_limited) return;
    setDiagRefreshing(true);
    await loadDiagnosis(true);
  }, [diagRefreshing, diagnosis, loadDiagnosis]);

  const handleLogRestDay = useCallback(async () => {
    try {
      await logRestDay();
      Alert.alert('Rest Day Logged', 'Recovery is training too. Good call.');
      loadDashboard();
    } catch {
      Alert.alert('Error', 'Could not log rest day. Try again.');
    }
  }, [loadDashboard]);

  const openWellnessModal = () => {
    setWellnessForm({ ...wellnessValues, notes: '' });
    setShowWellnessModal(true);
  };

  const handleWellnessAdjust = (field: 'mood' | 'energy' | 'soreness', delta: number) => {
    setWellnessForm((p) => ({ ...p, [field]: Math.min(5, Math.max(1, p[field] + delta)) }));
  };

  const handleSaveWellness = async () => {
    setSubmittingWellness(true);
    try {
      await submitWellnessCheckin({
        date: todayISO(),
        mood: wellnessForm.mood,
        energy: wellnessForm.energy,
        soreness: wellnessForm.soreness,
        notes: wellnessForm.notes.trim() || undefined,
      });
      setWellnessValues({
        mood: wellnessForm.mood,
        energy: wellnessForm.energy,
        soreness: wellnessForm.soreness,
      });
      setWellnessLogged(true);
      setShowWellnessModal(false);
      loadDashboard();
    } catch {
      Alert.alert('Error', 'Could not save check-in. Please try again.');
    } finally {
      setSubmittingWellness(false);
    }
  };

  // ── Derived ───────────────────────────────────────────────────────────────

  const displayName = dashboard?.display_name ?? 'Athlete';
  const rColor = dashboard?.readiness_color ?? 'amber';
  const rScore = dashboard?.readiness_score ?? 0;

  const liveSteps = pedometerReady ? stepCount : (dashboard?.steps_today ?? 0);

  const calorieTarget = dashboard?.calorie_target ?? null;
  const caloriesToday = dashboard?.calories_today ?? 0;
  const caloriePct = calorieTarget ? Math.min(1, caloriesToday / calorieTarget) : 0;

  const maxLoad = Math.max(1, dashboard?.weekly_load ?? 0, dashboard?.last_week_load ?? 0);
  const thisWeekPct = Math.round(((dashboard?.weekly_load ?? 0) / maxLoad) * 100);
  const lastWeekPct = Math.round(((dashboard?.last_week_load ?? 0) / maxLoad) * 100);

  const showSleepCard =
    dashboard?.sleep_hours != null ||
    dashboard?.hrv_ms != null ||
    dashboard?.resting_heart_rate != null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <ScrollView
        style={s.container}
        contentContainerStyle={s.content}
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
            <View style={s.notifBtn}>
              <Ionicons name="notifications-outline" size={20} color={theme.text.secondary} />
            </View>
          </View>
          <Text style={s.dateLabel}>{formatFullDate()}</Text>
        </SafeAreaView>

        {/* Error banner */}
        {error ? (
          <View style={s.errorBox}>
            <Text style={s.errorText}>{error}</Text>
            <TouchableOpacity onPress={loadAll} style={s.retryBtn}>
              <Text style={s.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* ── Card 1: Readiness Hero ─────────────────────────────────────── */}
        <View style={s.heroCard}>
          <ReadinessRing score={rScore} color={rColor} loading={dashLoading} />

          {dashLoading ? (
            <View style={{ alignItems: 'center', gap: 8, marginTop: 10 }}>
              <SkeletonBlock width={140} height={12} />
              <SkeletonBlock width={100} height={10} />
            </View>
          ) : (
            <View style={s.heroInfo}>
              <Text style={[s.heroLabel, { color: readinessHex(rColor) }]}>
                {(dashboard?.readiness_label ?? '').toUpperCase()}
              </Text>
              {dashboard?.readiness_primary_factor ? (
                <Text style={s.heroFactor} numberOfLines={2}>
                  {dashboard.readiness_primary_factor}
                </Text>
              ) : null}
            </View>
          )}

          {/* Mini stats row */}
          <View style={s.miniRow}>
            <View style={s.miniStat}>
              <Text style={s.miniVal}>
                {dashboard?.sleep_hours != null
                  ? `${dashboard.sleep_hours.toFixed(1)}h`
                  : '--'}
              </Text>
              <Text style={s.miniLabel}>Sleep</Text>
            </View>
            <View style={s.miniDivider} />
            <View style={s.miniStat}>
              <Text style={s.miniVal}>
                {dashboard?.hrv_ms != null ? `${Math.round(dashboard.hrv_ms)}ms` : '--'}
              </Text>
              <Text style={s.miniLabel}>HRV</Text>
            </View>
            <View style={s.miniDivider} />
            <View style={s.miniStat}>
              <Text style={s.miniVal}>
                {liveSteps > 0 ? liveSteps.toLocaleString() : '--'}
              </Text>
              <Text style={s.miniLabel}>Steps</Text>
            </View>
          </View>
        </View>

        {/* ── Quick Actions ──────────────────────────────────────────────── */}
        <View style={s.quickActions}>
          <TouchableOpacity
            style={s.qaBtn}
            onPress={() => router.push('/(tabs)/activity')}
            activeOpacity={0.75}
          >
            <Ionicons name="barbell-outline" size={22} color="#fff" />
            <Text style={s.qaLabel}>Log{'\n'}Workout</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.qaBtn}
            onPress={() => router.push('/(tabs)/nutrition')}
            activeOpacity={0.75}
          >
            <Ionicons name="restaurant-outline" size={22} color="#fff" />
            <Text style={s.qaLabel}>Log{'\n'}Food</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.qaBtn} onPress={handleLogRestDay} activeOpacity={0.75}>
            <Ionicons name="bed-outline" size={22} color="#fff" />
            <Text style={s.qaLabel}>Rest{'\n'}Day</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.qaBtn, s.qaBtnAccent]}
            onPress={openWellnessModal}
            activeOpacity={0.75}
          >
            <Ionicons name="happy-outline" size={22} color="#fff" />
            <Text style={s.qaLabel}>Check{'\n'}In</Text>
          </TouchableOpacity>
        </View>

        {/* ── Card 2: AI Diagnosis ───────────────────────────────────────── */}
        <Text style={s.sectionHeader}>ORYX INTELLIGENCE</Text>
        {diagLoading ? (
          <SkeletonCard s={s} />
        ) : (
          <View
            style={[
              s.card,
              s.diagCard,
              { borderLeftColor: diagnosis ? toneHex(diagnosis.tone) : '#555' },
            ]}
          >
            <View style={s.diagHeader}>
              <View>
                <Text style={s.cardLabel}>TODAY'S DIAGNOSIS</Text>
                {diagnosis?.generated_at ? (
                  <Text style={s.diagMeta}>
                    {diagnosis.cached ? 'Cached · ' : ''}
                    {new Date(diagnosis.generated_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                ) : null}
              </View>
              <TouchableOpacity
                style={[s.refreshBtn, (diagRefreshing || diagnosis?.rate_limited) && s.refreshBtnOff]}
                onPress={handleRefreshDiagnosis}
                disabled={diagRefreshing || diagnosis?.rate_limited === true}
                activeOpacity={0.7}
              >
                {diagRefreshing ? (
                  <ActivityIndicator size="small" color="#888" />
                ) : (
                  <Ionicons
                    name="refresh-outline"
                    size={16}
                    color={diagnosis?.rate_limited ? '#444' : theme.text.secondary}
                  />
                )}
              </TouchableOpacity>
            </View>

            <Text style={s.diagText}>
              {diagnosis?.diagnosis_text ||
                'No diagnosis available yet. Log activities and wellness to get started.'}
            </Text>

            {diagnosis?.contributing_factors && diagnosis.contributing_factors.length > 0 ? (
              <View style={s.factorsRow}>
                {diagnosis.contributing_factors.map((f, i) => (
                  <View key={i} style={s.factorChip}>
                    <Text style={s.factorText} numberOfLines={1}>
                      {f}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            {diagnosis?.recommendation ? (
              <View style={s.recBox}>
                <Ionicons
                  name="bulb-outline"
                  size={13}
                  color="#f59e0b"
                  style={{ marginRight: 6, marginTop: 1 }}
                />
                <Text style={s.recText}>{diagnosis.recommendation}</Text>
              </View>
            ) : null}
          </View>
        )}

        {/* ── Card 3: Training ──────────────────────────────────────────── */}
        <Text style={s.sectionHeader}>TRAINING</Text>
        {dashLoading ? (
          <SkeletonCard s={s} />
        ) : (
          <View style={s.card}>
            {/* Last session */}
            {dashboard?.last_session ? (
              <View style={s.lastSessionRow}>
                <View style={s.lastSessionIcon}>
                  <Ionicons name="fitness-outline" size={17} color={theme.text.secondary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.lastSessionName} numberOfLines={1}>
                    {dashboard.last_session.name}
                  </Text>
                  <Text style={s.lastSessionMeta}>
                    {relativeDate(dashboard.last_session.date)}
                    {dashboard.last_session.duration_minutes
                      ? ` · ${dashboard.last_session.duration_minutes}min`
                      : ''}
                    {dashboard.last_session.rpe
                      ? ` · RPE ${dashboard.last_session.rpe}`
                      : ''}
                  </Text>
                </View>
                {dashboard.last_session.training_load ? (
                  <View style={s.loadBadge}>
                    <Text style={s.loadBadgeVal}>{dashboard.last_session.training_load}</Text>
                    <Text style={s.loadBadgeLbl}>load</Text>
                  </View>
                ) : null}
              </View>
            ) : (
              <Text style={s.emptyHint}>No sessions logged yet</Text>
            )}

            {/* Week stats row */}
            <View style={s.weekStatsRow}>
              <View style={s.weekStat}>
                <Text style={s.weekStatVal}>{dashboard?.sessions_this_week ?? 0}</Text>
                <Text style={s.weekStatLabel}>
                  {dashboard?.weekly_training_goal
                    ? `of ${dashboard.weekly_training_goal} sessions`
                    : 'sessions'}
                </Text>
              </View>
              <View style={s.weekStat}>
                <Text style={s.weekStatVal}>{dashboard?.current_streak ?? 0}</Text>
                <Text style={s.weekStatLabel}>day streak</Text>
              </View>
              <View style={s.weekStat}>
                <Text style={s.weekStatVal}>{dashboard?.days_since_rest ?? 0}</Text>
                <Text style={s.weekStatLabel}>since rest</Text>
              </View>
            </View>

            {/* Load bars */}
            {((dashboard?.weekly_load ?? 0) > 0 || (dashboard?.last_week_load ?? 0) > 0) ? (
              <View style={s.loadBarsRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.loadBarLabel}>This week</Text>
                  <View style={s.loadBarBg}>
                    <View
                      style={[s.loadBarFill, { width: `${thisWeekPct}%` as any, backgroundColor: '#818cf8' }]}
                    />
                  </View>
                  <Text style={s.loadBarVal}>{dashboard?.weekly_load ?? 0}</Text>
                </View>
                <View style={{ width: 12 }} />
                <View style={{ flex: 1 }}>
                  <Text style={s.loadBarLabel}>Last week</Text>
                  <View style={s.loadBarBg}>
                    <View
                      style={[s.loadBarFill, { width: `${lastWeekPct}%` as any, backgroundColor: '#555' }]}
                    />
                  </View>
                  <Text style={s.loadBarVal}>{dashboard?.last_week_load ?? 0}</Text>
                </View>
              </View>
            ) : null}

            {/* ACWR */}
            {dashboard?.acwr != null ? (
              <View style={[s.acwrRow, { borderColor: acwrHex(dashboard.acwr_status) }]}>
                <Text style={[s.acwrVal, { color: acwrHex(dashboard.acwr_status) }]}>
                  ACWR {dashboard.acwr.toFixed(2)}
                </Text>
                <Text style={s.acwrStatus}>
                  {dashboard.acwr_status.replace('_', ' ')}
                </Text>
              </View>
            ) : null}
          </View>
        )}

        {/* ── Card 4: Nutrition ─────────────────────────────────────────── */}
        <Text style={s.sectionHeader}>NUTRITION</Text>
        {dashLoading ? (
          <SkeletonCard s={s} />
        ) : (
          <View style={s.card}>
            <View style={s.nutritionHeader}>
              <Text style={s.cardLabel}>TODAY</Text>
              <Text style={s.calTotal}>
                {caloriesToday} kcal{calorieTarget ? ` / ${calorieTarget}` : ''}
              </Text>
            </View>

            {/* Calorie bar */}
            <View style={[s.loadBarBg, { marginBottom: 16 }]}>
              <View
                style={[
                  s.loadBarFill,
                  {
                    width: `${Math.min(100, caloriePct * 100)}%` as any,
                    backgroundColor:
                      caloriePct > 1.05
                        ? '#ef4444'
                        : caloriePct > 0.85
                        ? '#22c55e'
                        : '#818cf8',
                  },
                ]}
              />
            </View>

            {/* Macro bars */}
            <View style={s.macrosRow}>
              <MacroBar
                label="Protein"
                value={Math.round(dashboard?.protein_today ?? 0)}
                target={dashboard?.protein_target ?? null}
                color="#ef4444"
              />
              <MacroBar
                label="Carbs"
                value={Math.round(dashboard?.carbs_today ?? 0)}
                target={dashboard?.carbs_target ?? null}
                color="#f59e0b"
              />
              <MacroBar
                label="Fat"
                value={Math.round(dashboard?.fat_today ?? 0)}
                target={dashboard?.fat_target ?? null}
                color="#22c55e"
              />
            </View>

            {!dashboard?.meals_logged_today ? (
              <Text style={[s.emptyHint, { marginTop: 10 }]}>No meals logged today</Text>
            ) : null}
          </View>
        )}

        {/* ── Card 5: Wellness ──────────────────────────────────────────── */}
        <Text style={s.sectionHeader}>WELLNESS</Text>
        {dashLoading ? (
          <SkeletonCard s={s} />
        ) : wellnessLogged ? (
          <TouchableOpacity style={s.card} onPress={openWellnessModal} activeOpacity={0.8}>
            <Text style={s.cardLabel}>FEELING TODAY</Text>
            <View style={s.wellnessChips}>
              {(['mood', 'energy', 'soreness'] as const).map((f) => (
                <View
                  key={f}
                  style={[s.wellnessChip, { borderColor: wellnessHex(wellnessValues[f]) }]}
                >
                  <Text style={[s.chipVal, { color: wellnessHex(wellnessValues[f]) }]}>
                    {wellnessValues[f]}/5
                  </Text>
                  <Text style={s.chipLabel}>
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </Text>
                </View>
              ))}
            </View>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={s.card} onPress={openWellnessModal} activeOpacity={0.8}>
            <View style={s.wellnessPromptRow}>
              <View style={s.wellnessIcons}>
                <Ionicons name="happy-outline" size={18} color={theme.text.secondary} />
                <Ionicons name="flash-outline" size={18} color={theme.text.secondary} />
                <Ionicons name="body-outline" size={18} color={theme.text.secondary} />
              </View>
              <Text style={s.wellnessPromptText}>Log how you feel today</Text>
              <Ionicons name="chevron-forward" size={16} color={theme.text.secondary} />
            </View>
          </TouchableOpacity>
        )}

        {/* ── Card 6: Sleep & Recovery (conditional) ────────────────────── */}
        {showSleepCard && !dashLoading ? (
          <>
            <Text style={s.sectionHeader}>SLEEP & RECOVERY</Text>
            <View style={s.card}>
              <View style={s.sleepRow}>
                <View style={s.sleepStat}>
                  <Text style={s.sleepVal}>
                    {dashboard?.sleep_hours != null
                      ? `${dashboard.sleep_hours.toFixed(1)}h`
                      : '--'}
                  </Text>
                  <Text style={s.sleepLabel}>Sleep</Text>
                </View>
                <View style={s.miniDivider} />
                <View style={s.sleepStat}>
                  <Text style={s.sleepVal}>
                    {dashboard?.hrv_ms != null
                      ? `${Math.round(dashboard.hrv_ms)}ms`
                      : '--'}
                  </Text>
                  <Text style={s.sleepLabel}>HRV</Text>
                </View>
                <View style={s.miniDivider} />
                <View style={s.sleepStat}>
                  <Text style={s.sleepVal}>
                    {dashboard?.resting_heart_rate != null
                      ? `${Math.round(dashboard.resting_heart_rate)}`
                      : '--'}
                  </Text>
                  <Text style={s.sleepLabel}>Resting HR</Text>
                </View>
              </View>
            </View>
          </>
        ) : null}

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* ── Wellness Modal ────────────────────────────────────────────────── */}
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
          <ScrollView
            contentContainerStyle={s.modalContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>How are you feeling today?</Text>
            <Text style={s.modalSubtitle}>{formatFullDate()}</Text>

            {(['mood', 'energy', 'soreness'] as const).map((field) => (
              <View key={field} style={s.wellnessRow}>
                <Text style={s.wellnessRowLabel}>
                  {field.charAt(0).toUpperCase() + field.slice(1)}
                </Text>
                <View style={s.wellnessControls}>
                  <TouchableOpacity
                    style={s.stepBtn}
                    onPress={() => handleWellnessAdjust(field, -1)}
                    activeOpacity={0.7}
                  >
                    <Text style={s.stepBtnText}>−</Text>
                  </TouchableOpacity>
                  <View
                    style={[s.valueBadge, { borderColor: wellnessHex(wellnessForm[field]) }]}
                  >
                    <Text style={[s.valueText, { color: wellnessHex(wellnessForm[field]) }]}>
                      {wellnessForm[field]}/5
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={s.stepBtn}
                    onPress={() => handleWellnessAdjust(field, 1)}
                    activeOpacity={0.7}
                  >
                    <Text style={s.stepBtnText}>+</Text>
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
              onChangeText={(v) => setWellnessForm((p) => ({ ...p, notes: v }))}
            />

            <TouchableOpacity
              style={[s.saveBtn, submittingWellness && s.btnDisabled]}
              onPress={handleSaveWellness}
              disabled={submittingWellness}
              activeOpacity={0.85}
            >
              {submittingWellness ? (
                <ActivityIndicator size="small" color={theme.bg.primary} />
              ) : (
                <Text style={s.saveBtnText}>Save Check-in</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={s.cancelBtn}
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
    content: {
      paddingHorizontal: 20,
      paddingBottom: 40,
    },
    safeHeader: {
      paddingBottom: 16,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    greeting: {
      fontSize: 13,
      color: t.text.muted,
      marginBottom: 3,
    },
    userName: {
      fontSize: 22,
      fontWeight: '700',
      color: t.text.primary,
    },
    notifBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: t.bg.elevated,
      borderWidth: 1,
      borderColor: t.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dateLabel: {
      fontSize: 13,
      color: t.text.muted,
      marginTop: 6,
    },
    errorBox: {
      backgroundColor: 'rgba(239,68,68,0.1)',
      borderLeftWidth: 3,
      borderLeftColor: t.status.danger,
      borderRadius: 10,
      padding: 14,
      marginBottom: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    errorText: {
      color: t.status.danger,
      fontSize: 14,
      flex: 1,
    },
    retryBtn: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      backgroundColor: 'rgba(239,68,68,0.12)',
      borderRadius: 8,
      marginLeft: 8,
    },
    retryText: {
      color: t.status.danger,
      fontSize: 13,
      fontWeight: '600',
    },
    // ── Hero card ────────────────────────────────────────────────────────────
    heroCard: {
      backgroundColor: '#1a1a1a',
      borderRadius: 20,
      padding: 20,
      borderWidth: 1,
      borderColor: '#2a2a2a',
      marginBottom: 16,
      alignItems: 'center',
      gap: 10,
    },
    heroInfo: {
      alignItems: 'center',
      gap: 4,
    },
    heroLabel: {
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 2,
      textTransform: 'uppercase',
    },
    heroFactor: {
      fontSize: 13,
      color: t.text.muted,
      textAlign: 'center',
      lineHeight: 18,
    },
    miniRow: {
      flexDirection: 'row',
      alignItems: 'center',
      width: '100%',
      paddingHorizontal: 8,
      marginTop: 4,
    },
    miniStat: {
      flex: 1,
      alignItems: 'center',
      gap: 2,
    },
    miniVal: {
      fontSize: 16,
      fontWeight: '700',
      color: t.text.primary,
    },
    miniLabel: {
      fontSize: 9,
      color: t.text.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    miniDivider: {
      width: 1,
      height: 28,
      backgroundColor: t.border,
    },
    // ── Quick Actions ────────────────────────────────────────────────────────
    quickActions: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: 24,
    },
    qaBtn: {
      flex: 1,
      backgroundColor: t.bg.elevated,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: t.border,
      paddingVertical: 14,
      alignItems: 'center',
      gap: 6,
    },
    qaBtnAccent: {
      backgroundColor: '#1e3a5f',
      borderColor: '#2563eb',
    },
    qaLabel: {
      fontSize: 10,
      color: '#ccc',
      textAlign: 'center',
      lineHeight: 14,
      letterSpacing: 0.3,
    },
    // ── Section header ───────────────────────────────────────────────────────
    sectionHeader: {
      fontSize: 10,
      fontWeight: '600',
      color: t.text.muted,
      textTransform: 'uppercase',
      letterSpacing: 2,
      marginBottom: 10,
    },
    // ── Card shared ──────────────────────────────────────────────────────────
    card: {
      backgroundColor: t.bg.elevated,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: t.border,
      marginBottom: 20,
    },
    cardLabel: {
      fontSize: 9,
      fontWeight: '600',
      color: t.text.secondary,
      textTransform: 'uppercase',
      letterSpacing: 1.2,
      marginBottom: 10,
    },
    emptyHint: {
      fontSize: 13,
      color: t.text.muted,
      fontStyle: 'italic',
    },
    // ── Diagnosis card ───────────────────────────────────────────────────────
    diagCard: {
      borderLeftWidth: 3,
    },
    diagHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    diagMeta: {
      fontSize: 10,
      color: t.text.muted,
      marginTop: 2,
    },
    refreshBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: t.bg.secondary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    refreshBtnOff: {
      opacity: 0.4,
    },
    diagText: {
      fontSize: 15,
      color: t.text.primary,
      lineHeight: 22,
      marginBottom: 12,
    },
    factorsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginBottom: 12,
    },
    factorChip: {
      backgroundColor: t.bg.secondary,
      borderRadius: 20,
      paddingHorizontal: 10,
      paddingVertical: 4,
      maxWidth: '80%',
    },
    factorText: {
      fontSize: 11,
      color: t.text.secondary,
    },
    recBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor: 'rgba(245,158,11,0.08)',
      borderRadius: 10,
      padding: 10,
    },
    recText: {
      flex: 1,
      fontSize: 13,
      color: '#f59e0b',
      lineHeight: 18,
    },
    // ── Training card ────────────────────────────────────────────────────────
    lastSessionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 14,
      paddingBottom: 14,
      borderBottomWidth: 1,
      borderBottomColor: t.border,
    },
    lastSessionIcon: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: t.bg.secondary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    lastSessionName: {
      fontSize: 14,
      fontWeight: '600',
      color: t.text.primary,
      marginBottom: 2,
    },
    lastSessionMeta: {
      fontSize: 12,
      color: t.text.muted,
    },
    loadBadge: {
      alignItems: 'center',
      backgroundColor: t.bg.secondary,
      borderRadius: 10,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    loadBadgeVal: {
      fontSize: 16,
      fontWeight: '700',
      color: t.text.primary,
    },
    loadBadgeLbl: {
      fontSize: 9,
      color: t.text.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    weekStatsRow: {
      flexDirection: 'row',
      marginBottom: 16,
    },
    weekStat: {
      flex: 1,
      alignItems: 'center',
      gap: 3,
    },
    weekStatVal: {
      fontSize: 22,
      fontWeight: '700',
      color: t.text.primary,
    },
    weekStatLabel: {
      fontSize: 10,
      color: t.text.muted,
      textAlign: 'center',
      lineHeight: 14,
    },
    loadBarsRow: {
      flexDirection: 'row',
      marginBottom: 12,
    },
    loadBarLabel: {
      fontSize: 10,
      color: t.text.muted,
      marginBottom: 4,
    },
    loadBarBg: {
      height: 6,
      backgroundColor: '#2a2a2a',
      borderRadius: 3,
      overflow: 'hidden',
    },
    loadBarFill: {
      height: 6,
      borderRadius: 3,
    },
    loadBarVal: {
      fontSize: 11,
      color: t.text.secondary,
      marginTop: 4,
    },
    acwrRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderWidth: 1,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    acwrVal: {
      fontSize: 13,
      fontWeight: '700',
    },
    acwrStatus: {
      fontSize: 11,
      color: t.text.muted,
      textTransform: 'capitalize',
    },
    // ── Nutrition card ───────────────────────────────────────────────────────
    nutritionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    calTotal: {
      fontSize: 15,
      fontWeight: '700',
      color: t.text.primary,
    },
    macrosRow: {
      flexDirection: 'row',
      gap: 12,
    },
    // ── Wellness card ────────────────────────────────────────────────────────
    wellnessChips: {
      flexDirection: 'row',
      gap: 10,
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
    chipVal: {
      fontSize: 15,
      fontWeight: '700',
    },
    chipLabel: {
      fontSize: 10,
      color: t.text.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    wellnessPromptRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    wellnessIcons: {
      flexDirection: 'row',
      gap: 4,
    },
    wellnessPromptText: {
      flex: 1,
      fontSize: 14,
      color: t.text.muted,
    },
    // ── Sleep card ───────────────────────────────────────────────────────────
    sleepRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    sleepStat: {
      flex: 1,
      alignItems: 'center',
      gap: 4,
    },
    sleepVal: {
      fontSize: 22,
      fontWeight: '700',
      color: t.text.primary,
    },
    sleepLabel: {
      fontSize: 10,
      color: t.text.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    // ── Wellness Modal ───────────────────────────────────────────────────────
    modalWrapper: {
      flex: 1,
      backgroundColor: t.bg.primary,
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
    stepBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: t.bg.elevated,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepBtnText: {
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
    saveBtn: {
      backgroundColor: t.text.primary,
      borderRadius: 12,
      paddingVertical: 16,
      alignItems: 'center',
      marginBottom: 12,
    },
    saveBtnText: {
      color: t.bg.primary,
      fontSize: 16,
      fontWeight: '700',
    },
    btnDisabled: {
      opacity: 0.5,
    },
    cancelBtn: {
      alignItems: 'center',
      paddingVertical: 12,
    },
    cancelText: {
      color: t.text.muted,
      fontSize: 15,
    },
  });
}
