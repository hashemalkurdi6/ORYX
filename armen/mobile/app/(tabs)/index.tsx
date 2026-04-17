// ORYX
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  WeightLogResult,
} from '@/services/api';
import WeightLogSheet from '@/components/WeightLogSheet';
import { Pedometer } from 'expo-sensors';
import { fetchLast7DaysHealthData } from '@/services/healthKit';
import { useTheme } from '@/contexts/ThemeContext';
import { ThemeColors } from '@/services/theme';

// ── Palette ───────────────────────────────────────────────────────────────────
const CLR_GREEN  = '#27ae60';
const CLR_AMBER  = '#e67e22';
const CLR_RED    = '#c0392b';
const CLR_LOAD   = '#e0e0e0';

// ── Ring geometry ─────────────────────────────────────────────────────────────
const RSIZE   = 140;
const RCX     = 70;
const RCY     = 70;
const OUTER_R = 54;
const OUTER_SW = 12;
const INNER_R = 36;
const INNER_SW = 6;
const OUTER_C  = 2 * Math.PI * OUTER_R;
const INNER_C  = 2 * Math.PI * INNER_R;

// ── Helpers ───────────────────────────────────────────────────────────────────
function readinessHex(c: 'green' | 'amber' | 'red'): string {
  if (c === 'green') return CLR_GREEN;
  if (c === 'amber') return CLR_AMBER;
  return CLR_RED;
}

function toneHex(tone: string): string {
  if (tone === 'positive') return CLR_GREEN;
  if (tone === 'warning')  return CLR_RED;
  return CLR_AMBER;
}

function hooperHex(v: number): string {
  if (v <= 2) return CLR_GREEN;
  if (v <= 4) return CLR_AMBER;
  return CLR_RED;
}

function acwrHex(status: string): string {
  if (status === 'optimal')       return CLR_GREEN;
  if (status === 'undertraining') return '#888888';
  if (status === 'caution')       return CLR_AMBER;
  return CLR_RED;
}

function getTrainingIcon(sportType: string): string {
  const map: Record<string, string> = {
    strength: 'barbell-outline',
    cardio: 'walk-outline',
    run: 'walk-outline', running: 'walk-outline',
    cycling: 'bicycle-outline', ride: 'bicycle-outline',
    swim: 'water-outline', swimming: 'water-outline',
    combat: 'body-outline', mma: 'body-outline', boxing: 'body-outline', bjj: 'body-outline',
    sport: 'football-outline',
    yoga: 'leaf-outline', mindbody: 'leaf-outline',
    other: 'fitness-outline',
  };
  return map[sportType?.toLowerCase()] ?? 'fitness-outline';
}

function getTrainingRecommendation(
  readiness: number,
  acwr: number | null,
  acwrStatus: string,
  daysSinceRest: number,
  hadSessionToday: boolean,
): string {
  // Priority 1: overdue rest
  if (daysSinceRest >= 6) {
    return `Consider a rest day. You've trained ${daysSinceRest} days without a break.`;
  }
  // Priority 2: ACWR overload
  if (acwr !== null && acwr > 1.5) {
    return 'Rest day recommended. Your body needs recovery.';
  }
  if (acwr !== null && acwr >= 1.3) {
    return 'Train lighter today. Reduce intensity by 20%.';
  }
  // Priority 3: readiness-based
  if (readiness >= 85 && (acwr === null || (acwr >= 0.8 && acwr <= 1.2))) {
    return 'Push hard today. Your body is primed for a strong session.';
  }
  if (readiness >= 70 && (acwr === null || acwr < 1.3)) {
    return 'Good to train. Normal intensity recommended.';
  }
  if (readiness >= 55) {
    return 'Train lighter today. Reduce intensity by 20%.';
  }
  if (readiness > 0 && readiness < 55) {
    return 'Rest day recommended. Your body needs recovery.';
  }
  // Priority 4: no session and late
  if (!hadSessionToday && new Date().getHours() >= 18) {
    return 'No session logged yet today.';
  }
  return 'Log a session to get a personalised recommendation.';
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

// ── Skeleton ──────────────────────────────────────────────────────────────────
function SkeletonBlock({ width, height, style }: { width: string | number; height: number; style?: object }) {
  const opacity = useRef(new Animated.Value(0.3)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.6, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 700, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);
  return <Animated.View style={[{ width, height, borderRadius: 6, backgroundColor: '#2a2a2a', opacity }, style]} />;
}

// ── Trend Arrow ───────────────────────────────────────────────────────────────
function TrendArrow({ up }: { up: boolean | null }) {
  if (up === null) return null;
  return <Text style={{ fontSize: 10, color: up ? CLR_GREEN : CLR_AMBER, marginLeft: 2 }}>{up ? '↑' : '↓'}</Text>;
}

// ── Mini Arc ──────────────────────────────────────────────────────────────────
function MiniArc({ pct, color }: { pct: number; color: string }) {
  const r = 7; const sw = 2; const size = 18;
  const c  = 2 * Math.PI * r;
  const off = c * (1 - Math.min(1, Math.max(0, pct)));
  return (
    <Svg width={size} height={size}>
      <Circle cx={size/2} cy={size/2} r={r} stroke="#2a2a2a" strokeWidth={sw} fill="none" />
      {pct > 0 && (
        <Circle cx={size/2} cy={size/2} r={r} stroke={color} strokeWidth={sw} fill="none"
          strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round"
          rotation={-90} origin={`${size/2}, ${size/2}`} />
      )}
    </Svg>
  );
}

// ── Concentric Hero ───────────────────────────────────────────────────────────
function ConcentricHero({
  score, color, outerPct, innerPct,
}: { score: number; color: 'green' | 'amber' | 'red'; outerPct: number; innerPct: number }) {
  const oHex  = readinessHex(color);
  const oOff  = OUTER_C * (1 - Math.min(1, Math.max(0, outerPct)));
  const iOff  = INNER_C * (1 - Math.min(1, Math.max(0, innerPct)));
  return (
    <View style={{ width: RSIZE, height: RSIZE, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={RSIZE} height={RSIZE} style={{ position: 'absolute' }}>
        <Circle cx={RCX} cy={RCY} r={OUTER_R} stroke="#2a2a2a" strokeWidth={OUTER_SW} fill="none" />
        <Circle cx={RCX} cy={RCY} r={INNER_R} stroke="#2a2a2a" strokeWidth={INNER_SW} fill="none" />
        <Circle cx={RCX} cy={RCY} r={OUTER_R} stroke={oHex} strokeWidth={OUTER_SW} fill="none"
          strokeDasharray={OUTER_C} strokeDashoffset={oOff} strokeLinecap="round"
          rotation={-90} origin={`${RCX}, ${RCY}`} />
        {innerPct > 0 && (
          <Circle cx={RCX} cy={RCY} r={INNER_R} stroke={CLR_LOAD} strokeWidth={INNER_SW} fill="none"
            strokeDasharray={INNER_C} strokeDashoffset={iOff} strokeLinecap="round"
            rotation={-90} origin={`${RCX}, ${RCY}`} />
        )}
      </Svg>
      {/* Safe inner diameter: inner ring inner edge = (36 - 3) × 2 = 66px. Use 52px for clear margin. */}
      <View style={{ width: 52, height: 52, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <Text style={{ fontSize: 26, fontWeight: '700', color: '#fff', lineHeight: 30 }}>{score}</Text>
        <Text style={{ fontSize: 7, color: '#888888', textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 1 }}>Readiness</Text>
      </View>
    </View>
  );
}

// ── Hooper fields ─────────────────────────────────────────────────────────────
const HOOPER_FIELDS = [
  { key: 'sleep_quality'   as const, label: 'Sleep'    },
  { key: 'fatigue'         as const, label: 'Fatigue'  },
  { key: 'stress'          as const, label: 'Stress'   },
  { key: 'muscle_soreness' as const, label: 'Soreness' },
] as const;

// ── HomeScreen ────────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const { theme } = useTheme();
  const s = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();

  const [dashboard, setDashboard]         = useState<DashboardData | null>(null);
  const [diagnosis, setDiagnosis]         = useState<DiagnosisData | null>(null);
  const [dashLoading, setDashLoading]     = useState(true);
  const [diagLoading, setDiagLoading]     = useState(true);
  const [diagRefreshing, setDiagRefreshing] = useState(false);
  const [refreshing, setRefreshing]       = useState(false);
  const [error, setError]                 = useState<string | null>(null);
  const [diagExpanded, setDiagExpanded]   = useState(false);

  const [stepCount, setStepCount]         = useState(0);
  const [pedometerReady, setPedometerReady] = useState(false);

  const [showWellnessModal, setShowWellnessModal]   = useState(false);
  const [wellnessLogged, setWellnessLogged]         = useState(false);
  const [showWeightSheet, setShowWeightSheet]       = useState(false);
  const [weightLoggedToday, setWeightLoggedToday]   = useState(false);
  const [weightToast, setWeightToast]               = useState<string | null>(null);
  const weightToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [wellnessValues, setWellnessValues]         = useState({ sleep_quality: 4, fatigue: 4, stress: 4, muscle_soreness: 4 });
  const [wellnessForm, setWellnessForm]             = useState({ sleep_quality: 4, fatigue: 4, stress: 4, muscle_soreness: 4, notes: '' });
  const [submittingWellness, setSubmittingWellness] = useState(false);
  const [showReadinessInfo, setShowReadinessInfo]   = useState(false);

  // ── Loaders ────────────────────────────────────────────────────────────────
  const loadDashboard = useCallback(async () => {
    try {
      const data = await getDashboard();
      setDashboard(data);
      if (data.wellness_logged_today) {
        setWellnessLogged(true);
        setWellnessValues({
          sleep_quality:   data.sleep_quality_today   ?? 4,
          fatigue:         data.fatigue_today         ?? 4,
          stress:          data.stress_today          ?? 4,
          muscle_soreness: data.muscle_soreness_today ?? 4,
        });
      } else {
        setWellnessLogged(false);
      }
      setWeightLoggedToday(data.weight_logged_today ?? false);
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
    } catch { /* non-fatal */ } finally {
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
      } catch { /* non-fatal */ }
    }
    await Promise.all([loadDashboard(), loadDiagnosis()]);
    setRefreshing(false);
  }, [loadDashboard, loadDiagnosis]);

  useEffect(() => { loadAll(); }, [loadAll]);

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
  const handleRefresh = useCallback(() => { setRefreshing(true); loadAll(); }, [loadAll]);

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

  const handleWeightLogged = useCallback((result: WeightLogResult) => {
    setWeightLoggedToday(true);
    const unit = result.display_unit;
    const val = result.display_value;
    const msg = `Weight saved: ${val} ${unit}`;
    setWeightToast(msg);
    if (weightToastTimer.current) clearTimeout(weightToastTimer.current);
    weightToastTimer.current = setTimeout(() => setWeightToast(null), 2800);
  }, []);

  const openWellnessModal = () => {
    setWellnessForm({ ...wellnessValues, notes: '' });
    setShowWellnessModal(true);
  };

  const handleWellnessAdjust = (field: 'sleep_quality' | 'fatigue' | 'stress' | 'muscle_soreness', delta: number) => {
    setWellnessForm((p) => ({ ...p, [field]: Math.min(7, Math.max(1, p[field] + delta)) }));
  };

  const handleSaveWellness = async () => {
    setSubmittingWellness(true);
    try {
      await submitWellnessCheckin({
        date: todayISO(),
        sleep_quality:   wellnessForm.sleep_quality,
        fatigue:         wellnessForm.fatigue,
        stress:          wellnessForm.stress,
        muscle_soreness: wellnessForm.muscle_soreness,
        notes:           wellnessForm.notes.trim() || undefined,
      });
      setWellnessValues({
        sleep_quality:   wellnessForm.sleep_quality,
        fatigue:         wellnessForm.fatigue,
        stress:          wellnessForm.stress,
        muscle_soreness: wellnessForm.muscle_soreness,
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
  const displayName  = dashboard?.display_name ?? 'Athlete';
  const rColor       = dashboard?.readiness_color ?? 'amber';
  const rScore       = dashboard?.readiness_score ?? 0;
  const rHex         = readinessHex(rColor);
  const liveSteps    = pedometerReady ? stepCount : (dashboard?.steps_today ?? 0);

  const calorieTarget  = dashboard?.calorie_target ?? null;
  const caloriesToday  = dashboard?.calories_today ?? 0;
  const caloriePct     = calorieTarget ? Math.min(1.1, caloriesToday / calorieTarget) : 0;

  const weeklyTrainingDays = Math.max(1, dashboard?.weekly_training_goal ?? 4);
  const weeklyLoadTarget   = weeklyTrainingDays * 300;
  const weeklyLoadPct      = Math.min(1, (dashboard?.weekly_load ?? 0) / weeklyLoadTarget);
  const dailyRecLoad       = Math.round((weeklyLoadTarget / weeklyTrainingDays) * (rScore >= 70 ? 1.0 : 0.8));
  const hadSessionToday    = dashboard?.last_session?.date === todayISO();
  const todaySessionLoad   = hadSessionToday ? (dashboard?.last_session?.training_load ?? 0) : 0;
  const strainPct          = dailyRecLoad > 0 ? todaySessionLoad / dailyRecLoad : 0;

  const weekLoadTrend = dashboard
    ? (dashboard.weekly_load > dashboard.last_week_load ? true
      : dashboard.weekly_load < dashboard.last_week_load ? false
      : null)
    : null;

  const isEvening    = new Date().getHours() >= 20;
  const showEndOfDay = isEvening && hadSessionToday && (dashboard?.meals_logged_today ?? false);

  function strainBarColor(pct: number): string {
    if (pct < 0.8)  return '#555';
    if (pct <= 1.0) return CLR_GREEN;
    if (pct <= 1.3) return CLR_AMBER;
    return CLR_RED;
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <ScrollView
        style={[s.container, { paddingTop: insets.top }]}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#555" colors={[CLR_GREEN]} />
        }
      >
        {/* Error banner */}
        {error ? (
          <View style={s.errorBox}>
            <Text style={s.errorText}>{error}</Text>
            <TouchableOpacity onPress={loadAll} style={s.retryBtn}>
              <Text style={s.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* ─── SECTION 1: HEADER ──────────────────────────────────────────── */}
        <View style={s.header}>
          <View>
            <Text style={s.greeting}>{getGreeting()}</Text>
            <Text style={s.userName}>{displayName}</Text>
            <Text style={s.dateLabel}>{formatFullDate()}</Text>
          </View>
          <View style={s.notifBtn}>
            <Ionicons name="notifications-outline" size={19} color="#888" />
          </View>
        </View>

        {/* ─── SECTION 2: HERO ─────────────────────────────────────────────── */}
        {dashLoading ? (
          <View style={s.heroCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
              <SkeletonBlock width={140} height={140} style={{ borderRadius: 70 }} />
              <View style={{ flex: 1, gap: 12 }}>
                <SkeletonBlock width="80%" height={14} />
                <SkeletonBlock width="50%" height={9} />
                <SkeletonBlock width="80%" height={14} />
                <SkeletonBlock width="50%" height={9} />
              </View>
            </View>
            <View style={{ alignItems: 'center', gap: 8, marginTop: 10 }}>
              <SkeletonBlock width={140} height={10} />
              <SkeletonBlock width={200} height={10} />
            </View>
          </View>
        ) : showEndOfDay ? (
          <View style={s.heroCard}>
            <View style={s.eodHeader}>
              <Ionicons name="moon-outline" size={13} color="#888" />
              <Text style={s.eodTitle}>DAILY SUMMARY</Text>
            </View>
            <Text style={s.eodText} numberOfLines={2}>
              {diagnosis?.diagnosis_text || 'Great work today. Rest up and recover for tomorrow.'}
            </Text>
            <View style={s.eodStats}>
              <View style={s.eodStat}>
                <Text style={s.eodStatVal}>{hadSessionToday ? '1' : '0'}</Text>
                <Text style={s.eodStatLabel}>Sessions</Text>
              </View>
              <View style={s.eodDivider} />
              <View style={s.eodStat}>
                <Text style={s.eodStatVal}>
                  {calorieTarget ? `${Math.round((caloriesToday / calorieTarget) * 100)}%` : `${caloriesToday}`}
                </Text>
                <Text style={s.eodStatLabel}>Calories</Text>
              </View>
              <View style={s.eodDivider} />
              <View style={s.eodStat}>
                <Text style={[s.eodStatVal, { color: rHex }]}>{rScore}</Text>
                <Text style={s.eodStatLabel}>Readiness</Text>
              </View>
            </View>
            {dashboard?.acwr_status ? (
              <View style={s.eodTomorrow}>
                <Ionicons name="today-outline" size={11} color="#888" />
                <Text style={s.eodTomorrowText}>
                  Tomorrow: {acwrHex(dashboard.acwr_status) === CLR_GREEN
                    ? 'Full intensity'
                    : acwrHex(dashboard.acwr_status) === CLR_AMBER
                    ? 'Moderate load'
                    : 'Recovery focus'}
                </Text>
              </View>
            ) : null}
          </View>
        ) : (
          <View style={s.heroCard}>
            <TouchableOpacity style={s.infoBtn} onPress={() => setShowReadinessInfo(true)} activeOpacity={0.7}>
              <Ionicons name="information-circle-outline" size={17} color="#555" />
            </TouchableOpacity>

            {/* Ring + callouts */}
            <View style={s.heroRow}>
              <ConcentricHero
                score={rScore}
                color={rColor}
                outerPct={rScore / 100}
                innerPct={weeklyLoadPct}
              />
              <View style={s.heroDivider} />
              <View style={s.heroCallouts}>
                <View>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                    <Text style={[s.calloutVal, { color: CLR_LOAD }]}>{dashboard?.weekly_load ?? 0}</Text>
                    <TrendArrow up={weekLoadTrend} />
                  </View>
                  <Text style={s.calloutLabel}>WEEKLY LOAD</Text>
                </View>
                <View style={s.calloutInnerDivider} />
                <View>
                  <Text style={s.calloutVal}>{liveSteps > 0 ? liveSteps.toLocaleString() : '--'}</Text>
                  <Text style={s.calloutLabel}>STEPS TODAY</Text>
                </View>
              </View>
            </View>

            {/* Ring legend */}
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16, marginTop: 8, marginBottom: 4 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: rHex }} />
                <Text style={{ fontSize: 10, color: '#666', textTransform: 'uppercase', letterSpacing: 0.8 }}>Readiness</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: CLR_LOAD }} />
                <Text style={{ fontSize: 10, color: '#666', textTransform: 'uppercase', letterSpacing: 0.8 }}>Weekly Load</Text>
              </View>
            </View>

            {/* Label row */}
            <View style={s.heroLabelRow}>
              <Text style={[s.heroLabel, { color: rHex }]}>
                {(dashboard?.readiness_label ?? '').toUpperCase()}
              </Text>
              {dashboard?.data_confidence ? (
                <View style={s.confidencePill}>
                  <Text style={s.confidenceText}>{dashboard.data_confidence}</Text>
                </View>
              ) : null}
            </View>

            {dashboard?.readiness_primary_factor ? (
              <Text style={s.heroFactor} numberOfLines={1} ellipsizeMode="tail">
                {dashboard.readiness_primary_factor}
              </Text>
            ) : null}
          </View>
        )}

        {/* ─── SECTION 3: STRAIN GAUGE ─────────────────────────────────────── */}
        {dashLoading ? (
          <View style={s.strainCard}>
            <SkeletonBlock width="100%" height={5} />
          </View>
        ) : (
          <View style={s.strainCard}>
            <View style={s.strainHeaderRow}>
              <Text style={s.strainLeftLabel}>TODAY'S LOAD</Text>
              <Text style={s.strainRightLabel}>
                {todaySessionLoad > 0 ? `${todaySessionLoad} / ${dailyRecLoad}` : '—'}
              </Text>
            </View>
            <View style={s.strainBarBg}>
              {todaySessionLoad > 0 ? (
                <View style={[s.strainBarFill, {
                  width: `${Math.min(100, strainPct * 100)}%` as any,
                  backgroundColor: strainBarColor(strainPct),
                }]} />
              ) : null}
            </View>
            {todaySessionLoad === 0 ? (
              <Text style={s.strainEmptyLabel}>No activity logged yet</Text>
            ) : null}
          </View>
        )}

        {/* ─── SECTION 4: QUICK ACTION PILLS ───────────────────────────────── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.pillRow}
          style={s.pillScroll}
        >
          <TouchableOpacity style={s.pill} onPress={() => router.push('/(tabs)/activity')} activeOpacity={0.75}>
            <Ionicons name="barbell-outline" size={14} color="#ccc" />
            <Text style={s.pillLabel}>Log Workout</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.pill} onPress={() => router.push('/(tabs)/nutrition')} activeOpacity={0.75}>
            <Ionicons name="restaurant-outline" size={14} color="#ccc" />
            <Text style={s.pillLabel}>Log Food</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.pill} onPress={handleLogRestDay} activeOpacity={0.75}>
            <Ionicons name="bed-outline" size={14} color="#ccc" />
            <Text style={s.pillLabel}>Rest Day</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.pill, !wellnessLogged && s.pillHighlight]}
            onPress={openWellnessModal}
            activeOpacity={0.75}
          >
            <Ionicons name="happy-outline" size={14} color="#ccc" />
            <Text style={s.pillLabel}>Check In</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.pill, weightLoggedToday && s.pillDone]}
            onPress={() => setShowWeightSheet(true)}
            activeOpacity={0.75}
          >
            <Ionicons
              name={weightLoggedToday ? 'checkmark' : 'scale-outline'}
              size={14}
              color={weightLoggedToday ? CLR_GREEN : '#ccc'}
            />
            <Text style={[s.pillLabel, weightLoggedToday && { color: CLR_GREEN }]}>
              {weightLoggedToday ? 'Weight ✓' : 'Log Weight'}
            </Text>
          </TouchableOpacity>
        </ScrollView>

        {/* ─── SECTION 5: DIAGNOSIS ────────────────────────────────────────── */}
        {diagLoading ? (
          <View style={[s.card, { gap: 8 }]}>
            <SkeletonBlock width="40%" height={9} />
            <SkeletonBlock width="100%" height={12} />
            <SkeletonBlock width="90%" height={12} />
            <SkeletonBlock width="65%" height={12} />
          </View>
        ) : (
          <View style={[s.card, s.diagCard, { borderLeftColor: diagnosis ? toneHex(diagnosis.tone) : '#444' }]}>
            <View style={s.diagHeaderRow}>
              <View>
                <Text style={s.sectionLabel}>ORYX INTELLIGENCE</Text>
                {diagnosis?.generated_at ? (
                  <Text style={s.diagMeta}>
                    {diagnosis.cached ? 'Cached · ' : ''}
                    {new Date(diagnosis.generated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                ) : null}
              </View>
              <TouchableOpacity
                style={[s.refreshBtn, (diagRefreshing || diagnosis?.rate_limited) && s.refreshBtnOff]}
                onPress={handleRefreshDiagnosis}
                disabled={diagRefreshing || diagnosis?.rate_limited === true}
                activeOpacity={0.7}
              >
                {diagRefreshing
                  ? <ActivityIndicator size="small" color="#888" />
                  : <Ionicons name="refresh-outline" size={15} color={diagnosis?.rate_limited ? '#444' : '#888'} />}
              </TouchableOpacity>
            </View>

            <Text style={s.diagTitleLabel}>TODAY'S DIAGNOSIS</Text>
            <Text style={s.diagText} numberOfLines={diagExpanded ? undefined : 3}>
              {diagnosis?.diagnosis_text || 'No diagnosis yet. Log activities and wellness to get started.'}
            </Text>
            {(diagnosis?.diagnosis_text?.length ?? 0) > 160 ? (
              <TouchableOpacity onPress={() => setDiagExpanded((p) => !p)}>
                <Text style={s.readMoreText}>{diagExpanded ? 'Show less' : 'Read more'}</Text>
              </TouchableOpacity>
            ) : null}

            {diagnosis?.contributing_factors && diagnosis.contributing_factors.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {diagnosis.contributing_factors.map((f, i) => (
                    <View key={i} style={s.factorChip}>
                      <Text style={s.factorText} numberOfLines={1}>{f}</Text>
                    </View>
                  ))}
                </View>
              </ScrollView>
            ) : null}

            {diagnosis?.recommendation ? (
              <View style={s.recBox}>
                <Ionicons name="bulb-outline" size={12} color={CLR_AMBER} style={{ marginRight: 6, marginTop: 1 }} />
                <Text style={s.recText}>{diagnosis.recommendation}</Text>
              </View>
            ) : null}
          </View>
        )}

        {/* ─── SECTION 6: TRAINING ─────────────────────────────────────────── */}
        <Text style={s.sectionLabel}>TRAINING</Text>
        {dashLoading ? (
          <View style={[s.card, { gap: 8 }]}>
            <SkeletonBlock width="60%" height={12} />
            <SkeletonBlock width="100%" height={6} />
            <SkeletonBlock width="80%" height={10} />
          </View>
        ) : (() => {
          const sessions   = dashboard?.sessions_this_week ?? 0;
          const goal       = dashboard?.weekly_training_goal ?? 0;
          const goalHit    = goal > 0 && sessions >= goal;
          const goalOver   = goal > 0 && sessions > goal;
          const sessColor  = goalHit ? CLR_GREEN : '#fff';

          const streak     = dashboard?.current_streak ?? 0;
          const activeDays = dashboard?.active_days_this_week ?? sessions;

          const dsr        = Math.max(0, dashboard?.days_since_rest ?? 0);
          const dsrColor   = dsr === 0 ? CLR_GREEN : dsr >= 6 ? CLR_RED : dsr >= 5 ? CLR_AMBER : '#fff';

          const thisWeek   = dashboard?.weekly_load ?? 0;
          const lastWeek   = dashboard?.last_week_load ?? 0;
          const avg4w      = dashboard?.four_week_avg_load ?? 0;
          const maxScale   = Math.max(1, avg4w > 0 ? avg4w * 1.5 : Math.max(thisWeek, lastWeek) * 1.5);
          const thisPct    = Math.min(100, (thisWeek / maxScale) * 100);
          const lastPct    = Math.min(100, (lastWeek / maxScale) * 100);
          const trendUp    = thisWeek > lastWeek;
          const trendDown  = thisWeek < lastWeek;
          const trendColor = trendUp ? CLR_GREEN : trendDown ? CLR_AMBER : '#888888';

          const hadToday   = dashboard?.last_session?.date?.startsWith(todayISO()) ?? false;
          const rec        = getTrainingRecommendation(
            dashboard?.readiness_score ?? 0,
            dashboard?.acwr ?? null,
            dashboard?.acwr_status ?? 'insufficient_data',
            dsr,
            hadToday,
          );

          return (
            <TouchableOpacity
              style={[s.card, s.trainingCard]}
              onPress={() => router.push('/(tabs)/activity')}
              activeOpacity={0.85}
            >
              {/* ── Zone 1: Last session ── */}
              <View style={s.trainZone}>
                {dashboard?.last_session ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={s.lastSessionIcon}>
                      <Ionicons name={getTrainingIcon(dashboard.last_session.sport_type) as any} size={16} color="#888" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.lastSessionName} numberOfLines={1}>{dashboard.last_session.name}</Text>
                      <Text style={s.lastSessionMeta}>
                        {relativeDate(dashboard.last_session.date)}
                        {dashboard.last_session.duration_minutes ? ` · ${dashboard.last_session.duration_minutes}min` : ''}
                      </Text>
                    </View>
                    {dashboard.last_session.rpe ? (
                      <View style={s.rpePill}>
                        <Text style={s.rpePillText}>RPE {dashboard.last_session.rpe}</Text>
                      </View>
                    ) : null}
                  </View>
                ) : (
                  <Text style={s.emptyHint}>No sessions logged yet</Text>
                )}
              </View>

              <View style={s.trainDividerH} />

              {/* ── Zone 2: Stats row ── */}
              <View style={[s.trainZone, s.trainStatsRow]}>
                {/* Sessions */}
                <View style={s.trainStat}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                    <Text style={[s.trainStatVal, { color: sessColor }]}>
                      {sessions}{goal > 0 ? `/${goal}` : ''}{goalOver ? ` (+${sessions - goal})` : ''}
                    </Text>
                    {goalHit && <Ionicons name="checkmark-circle" size={12} color={CLR_GREEN} />}
                  </View>
                  <Text style={s.trainStatLabel}>SESSIONS</Text>
                </View>

                <View style={s.trainDivider} />

                {/* Streak / Active days */}
                <View style={s.trainStat}>
                  {streak > 0 ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <Text style={[s.trainStatVal, { color: '#fff' }]}>{streak}</Text>
                      <Ionicons name="flame" size={11} color={CLR_AMBER} />
                    </View>
                  ) : (
                    <Text style={[s.trainStatVal, { color: '#fff' }]}>{activeDays}</Text>
                  )}
                  <Text style={s.trainStatLabel}>{streak > 0 ? 'STREAK' : 'DAYS ACTIVE'}</Text>
                </View>

                <View style={s.trainDivider} />

                {/* Since rest */}
                <View style={s.trainStat}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                    <Text style={[s.trainStatVal, { color: dsrColor }]}>{dsr}</Text>
                    {dsr >= 5 && <Ionicons name="moon" size={10} color={dsrColor} />}
                  </View>
                  <Text style={s.trainStatLabel}>SINCE REST</Text>
                </View>
              </View>

              <View style={s.trainDividerH} />

              {/* ── Zone 3: Weekly load comparison ── */}
              {(thisWeek > 0 || lastWeek > 0) ? (
                <View style={[s.trainZone, { flexDirection: 'row', alignItems: 'flex-start' }]}>
                  {/* This week */}
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#fff' }}>{thisWeek}</Text>
                      {trendUp   && <Ionicons name="arrow-up"   size={11} color={CLR_GREEN} />}
                      {trendDown && <Ionicons name="arrow-down" size={11} color={CLR_AMBER} />}
                      <Text style={{ fontSize: 10, color: '#888' }}>this week</Text>
                    </View>
                    {/* Stacked dual bars */}
                    <View style={{ gap: 2 }}>
                      <View style={s.dualBarBg}>
                        <View style={[s.dualBarFill, { width: `${thisPct}%` as any, backgroundColor: trendColor }]} />
                      </View>
                      {lastWeek > 0 && (
                        <View style={s.dualBarBg}>
                          <View style={[s.dualBarFill, { width: `${lastPct}%` as any, backgroundColor: '#2a2a2a' }]} />
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Divider */}
                  <View style={{ width: 1, height: 38, backgroundColor: '#2a2a2a', marginHorizontal: 12, marginTop: 2 }} />

                  {/* Last week */}
                  <View style={{ flex: 1, alignItems: 'flex-end', paddingTop: 2 }}>
                    {lastWeek > 0 ? (
                      <Text style={{ fontSize: 12, color: '#888' }}>{lastWeek} last week</Text>
                    ) : (
                      <Text style={{ fontSize: 10, color: '#555', fontStyle: 'italic' }}>First week of data</Text>
                    )}
                  </View>
                </View>
              ) : null}

              {(thisWeek > 0 || lastWeek > 0) && <View style={s.trainDividerH} />}

              {/* ── Zone 4: Recommendation ── */}
              <View style={[s.trainZone, { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingBottom: 0 }]}>
                <Ionicons name="flash" size={12} color="#555" style={{ marginTop: 2 }} />
                <Text style={{ flex: 1, fontSize: 12, color: '#888', fontStyle: 'italic' }}>{rec}</Text>
                <Ionicons name="chevron-forward" size={13} color="#555" style={{ marginTop: 2 }} />
              </View>
            </TouchableOpacity>
          );
        })()}

        {/* ─── SECTION 7: NUTRITION ────────────────────────────────────────── */}
        <Text style={s.sectionLabel}>NUTRITION</Text>
        {dashLoading ? (
          <View style={[s.card, { gap: 6 }]}>
            <SkeletonBlock width="100%" height={10} />
            <SkeletonBlock width="100%" height={5} />
          </View>
        ) : (
          <TouchableOpacity
            style={[s.card, s.nutritionCard]}
            onPress={() => router.push('/(tabs)/nutrition')}
            activeOpacity={0.85}
          >
            {!dashboard?.meals_logged_today ? (
              <Text style={s.emptyHintCenter}>No meals logged today</Text>
            ) : (
              <>
                <View style={s.nutRow1}>
                  <Text style={s.nutTodayLabel}>TODAY</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                    <Text style={s.nutCalories}>{caloriesToday}</Text>
                    {calorieTarget
                      ? <Text style={s.nutCalTarget}> / {calorieTarget} kcal</Text>
                      : <Text style={s.nutCalTarget}> kcal</Text>}
                  </View>
                </View>

                <View style={s.nutMacrosRow}>
                  {[
                    { label: 'PROTEIN', val: Math.round(dashboard?.protein_today ?? 0), target: dashboard?.protein_target, color: '#ef4444' },
                    { label: 'CARBS',   val: Math.round(dashboard?.carbs_today   ?? 0), target: dashboard?.carbs_target,   color: '#f59e0b' },
                    { label: 'FAT',     val: Math.round(dashboard?.fat_today     ?? 0), target: dashboard?.fat_target,     color: CLR_GREEN },
                  ].map((m) => (
                    <View key={m.label} style={s.nutMacro}>
                      <MiniArc pct={m.target && m.target > 0 ? m.val / m.target : 0} color={m.color} />
                      <View style={{ marginLeft: 5 }}>
                        <Text style={s.nutMacroLabel}>{m.label}</Text>
                        <Text style={s.nutMacroVal}>{m.val}{m.target ? `/${m.target}g` : 'g'}</Text>
                      </View>
                    </View>
                  ))}
                </View>

                <View style={s.nutBarBg}>
                  <View style={[s.nutBarFill, {
                    width: `${Math.min(100, caloriePct * 100)}%` as any,
                    backgroundColor: caloriePct > 1.0 ? CLR_RED : caloriePct > 0.9 ? CLR_AMBER : CLR_GREEN,
                  }]} />
                </View>
              </>
            )}
          </TouchableOpacity>
        )}

        {/* ─── SECTION 8: WELLNESS ROW ─────────────────────────────────────── */}
        <Text style={s.sectionLabel}>WELLNESS</Text>
        {dashLoading ? (
          <View style={s.wellnessCard}>
            {[0,1,2,3].map((i) => <SkeletonBlock key={i} width={40} height={32} style={{ borderRadius: 6 }} />)}
          </View>
        ) : (
          <TouchableOpacity style={s.wellnessCard} onPress={openWellnessModal} activeOpacity={0.85}>
            {!wellnessLogged ? (
              <Text style={s.emptyHintCenter}>Tap to log how you feel today</Text>
            ) : (
              HOOPER_FIELDS.map(({ key, label }, i) => (
                <View key={key} style={s.wellnessCol}>
                  {i > 0 && <View style={s.wellnessColDivider} />}
                  <Text style={[s.wellnessVal, { color: hooperHex(wellnessValues[key]) }]}>
                    {wellnessValues[key]}/7
                  </Text>
                  <Text style={s.wellnessColLabel}>{label.toUpperCase()}</Text>
                </View>
              ))
            )}
          </TouchableOpacity>
        )}

        {/* ─── SECTION 9: WEEKLY PROGRESS ──────────────────────────────────── */}
        <Text style={s.sectionLabel}>THIS WEEK</Text>
        {dashLoading ? (
          <View style={s.weekCard}>
            {[0,1,2].map((i) => <SkeletonBlock key={i} width={60} height={26} />)}
          </View>
        ) : (
          <View style={s.weekCard}>
            <View style={s.weekStat}>
              <Text style={s.weekStatVal}>
                {dashboard?.sessions_this_week ?? 0}
                {dashboard?.weekly_training_goal ? `/${dashboard.weekly_training_goal}` : ''}
              </Text>
              <Text style={s.weekStatLabel}>SESSIONS</Text>
            </View>
            <View style={s.weekDivider} />
            <View style={s.weekStat}>
              <Text style={s.weekStatVal}>{(dashboard?.calories_this_week ?? 0).toLocaleString()}</Text>
              <Text style={s.weekStatLabel}>CAL THIS WEEK</Text>
            </View>
            <View style={s.weekDivider} />
            <View style={s.weekStat}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                <Text style={s.weekStatVal}>{dashboard?.current_streak ?? 0}</Text>
                <Ionicons name="flame" size={11} color={CLR_AMBER} style={{ marginLeft: 3 }} />
              </View>
              <Text style={s.weekStatLabel}>DAY STREAK</Text>
            </View>
          </View>
        )}

        <View style={{ height: insets.bottom + 16 }} />
      </ScrollView>

      {/* ─── WELLNESS MODAL ──────────────────────────────────────────────────── */}
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
            <Text style={s.modalSubtitle}>{formatFullDate()}</Text>

            {HOOPER_FIELDS.map(({ key }) => {
              const questions: Record<string, string> = {
                sleep_quality:   'How well did you sleep?',
                fatigue:         'How fatigued do you feel?',
                stress:          'How stressed do you feel?',
                muscle_soreness: 'How sore are your muscles?',
              };
              const scaleHints: Record<string, string> = {
                sleep_quality:   '1 = Very well  ·  7 = Very poorly',
                fatigue:         '1 = Not at all  ·  7 = Extremely fatigued',
                stress:          '1 = Not at all  ·  7 = Very stressed',
                muscle_soreness: '1 = No soreness  ·  7 = Extremely sore',
              };
              return (
                <View key={key} style={s.wellnessRow}>
                  <View style={s.wellnessRowText}>
                    <Text style={s.wellnessRowLabel}>{questions[key]}</Text>
                    <Text style={s.hooperScale}>{scaleHints[key]}</Text>
                  </View>
                  <View style={s.wellnessControls}>
                    <TouchableOpacity style={s.stepBtn} onPress={() => handleWellnessAdjust(key, -1)} activeOpacity={0.7}>
                      <Text style={s.stepBtnText}>−</Text>
                    </TouchableOpacity>
                    <View style={[s.valueBadge, { borderColor: hooperHex(wellnessForm[key]) }]}>
                      <Text style={[s.valueText, { color: hooperHex(wellnessForm[key]) }]}>{wellnessForm[key]}/7</Text>
                    </View>
                    <TouchableOpacity style={s.stepBtn} onPress={() => handleWellnessAdjust(key, 1)} activeOpacity={0.7}>
                      <Text style={s.stepBtnText}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}

            <Text style={s.modalFieldLabel}>Notes (optional)</Text>
            <TextInput
              style={s.modalTextArea}
              placeholder="Any notes about today…"
              placeholderTextColor="#555"
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
              {submittingWellness
                ? <ActivityIndicator size="small" color="#0a0a0a" />
                : <Text style={s.saveBtnText}>Save Check-in</Text>}
            </TouchableOpacity>

            <TouchableOpacity style={s.cancelBtn} onPress={() => setShowWellnessModal(false)} activeOpacity={0.7}>
              <Text style={s.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* ─── READINESS INFO MODAL ────────────────────────────────────────────── */}
      <Modal
        visible={showReadinessInfo}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowReadinessInfo(false)}
      >
        <ScrollView style={s.modalWrapper} contentContainerStyle={s.modalContent}>
          <View style={s.modalHandle} />
          <Text style={s.modalTitle}>Score Breakdown</Text>
          <Text style={s.modalSubtitle}>What's powering your readiness score</Text>

          {dashboard?.components_used && dashboard.components_used.length > 0 ? (
            dashboard.components_used.map((comp: string) => {
              const META: Record<string, { icon: string; label: string; desc: string }> = {
                hooper:        { icon: 'happy-outline',      label: 'Hooper Index',        desc: 'Clinically validated self-report: sleep quality, fatigue, stress, muscle soreness rated 1–7. Default weight: 40%.' },
                training_load: { icon: 'barbell-outline',    label: 'Training Load',       desc: 'EWMA acute:chronic workload ratio (7-day vs 28-day). Penalises monotony and back-to-back rest days. Default weight: 35%.' },
                nutrition:     { icon: 'restaurant-outline', label: 'Nutritional Recovery', desc: 'Protein adequacy (≥1.6 g/kg), caloric intake, and post-workout meal timing. Default weight: 15%.' },
                sleep:         { icon: 'moon-outline',       label: 'Sleep Score',         desc: 'Sleep duration from Apple Health. Default weight: 10%.' },
                hrv:           { icon: 'pulse-outline',      label: 'HRV',                 desc: 'Heart rate variability from connected hardware.' },
                rhr:           { icon: 'heart-outline',      label: 'Resting HR',          desc: 'Resting heart rate from connected hardware.' },
                spo2:          { icon: 'water-outline',      label: 'SpO2',                desc: 'Blood oxygen from connected hardware.' },
              };
              const info = META[comp] ?? { icon: 'ellipse-outline', label: comp, desc: '' };
              const breakdown = dashboard.breakdown?.[comp];
              return (
                <View key={comp} style={s.infoRow}>
                  <View style={s.infoIcon}>
                    <Ionicons name={info.icon as any} size={17} color="#888" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Text style={s.infoLabel}>{info.label}</Text>
                      {breakdown?.score != null ? (
                        <Text style={s.infoScore}>{Math.round(breakdown.score)}</Text>
                      ) : null}
                    </View>
                    <Text style={s.infoDesc}>{info.desc}</Text>
                  </View>
                </View>
              );
            })
          ) : (
            <Text style={s.emptyHint}>Log wellness, activities, and meals to unlock score components.</Text>
          )}

          <TouchableOpacity
            style={[s.saveBtn, { marginTop: 28 }]}
            onPress={() => setShowReadinessInfo(false)}
            activeOpacity={0.85}
          >
            <Text style={s.saveBtnText}>Done</Text>
          </TouchableOpacity>
        </ScrollView>
      </Modal>

      {/* ─── WEIGHT LOG SHEET ────────────────────────────────────────────────── */}
      <WeightLogSheet
        visible={showWeightSheet}
        onClose={() => setShowWeightSheet(false)}
        onLogged={handleWeightLogged}
        currentWeightKg={dashboard?.current_weight_kg ?? undefined}
        displayUnit={dashboard?.weight_unit ?? 'kg'}
      />

      {/* ─── WEIGHT TOAST ────────────────────────────────────────────────────── */}
      {weightToast ? (
        <View style={s.weightToast} pointerEvents="none">
          <Ionicons name="checkmark-circle" size={16} color={CLR_GREEN} />
          <Text style={s.weightToastText}>{weightToast}</Text>
        </View>
      ) : null}
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
function createStyles(t: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: '#0a0a0a',
    },
    content: {
      paddingHorizontal: 16,
      paddingBottom: 24,
    },

    // Error
    errorBox: {
      backgroundColor: 'rgba(192,57,43,0.12)',
      borderLeftWidth: 3,
      borderLeftColor: CLR_RED,
      borderRadius: 10,
      padding: 12,
      marginBottom: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    errorText: { color: CLR_RED, fontSize: 13, flex: 1 },
    retryBtn: { paddingHorizontal: 10, paddingVertical: 5, backgroundColor: 'rgba(192,57,43,0.15)', borderRadius: 8, marginLeft: 8 },
    retryText: { color: CLR_RED, fontSize: 12, fontWeight: '600' },

    // ── Section 1: Header ──────────────────────────────────────────────────────
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      paddingTop: 8,
      paddingBottom: 12,
    },
    greeting: { fontSize: 12, color: '#888', marginBottom: 2 },
    userName: { fontSize: 22, fontWeight: '700', color: '#fff', marginBottom: 2 },
    dateLabel: { fontSize: 12, color: '#555' },
    notifBtn: {
      width: 36, height: 36, borderRadius: 18,
      backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a',
      alignItems: 'center', justifyContent: 'center', marginTop: 4,
    },

    // ── Section 2: Hero ────────────────────────────────────────────────────────
    heroCard: {
      backgroundColor: '#1a1a1a',
      borderRadius: 18,
      padding: 14,
      borderWidth: 1,
      borderColor: '#2a2a2a',
      marginBottom: 10,
    },
    infoBtn: {
      position: 'absolute', top: 10, right: 10,
      width: 28, height: 28, borderRadius: 14,
      alignItems: 'center', justifyContent: 'center', zIndex: 1,
    },
    heroRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    heroDivider: {
      width: 1, height: 80, backgroundColor: '#2a2a2a', marginHorizontal: 14,
    },
    heroCallouts: {
      flex: 1, gap: 12,
    },
    calloutVal: {
      fontSize: 22, fontWeight: '800', color: '#fff',
    },
    calloutLabel: {
      fontSize: 9, color: '#888', textTransform: 'uppercase', letterSpacing: 1, marginTop: 1,
    },
    calloutInnerDivider: {
      height: 1, backgroundColor: '#2a2a2a',
    },
    heroLabelRow: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      marginTop: 10, flexWrap: 'wrap',
    },
    heroLabel: {
      fontSize: 11, fontWeight: '700', letterSpacing: 2,
    },
    confidencePill: {
      backgroundColor: '#2a2a2a', borderRadius: 20,
      paddingHorizontal: 8, paddingVertical: 3,
    },
    confidenceText: { fontSize: 10, color: '#fff', fontWeight: '600' },
    heroFactor: {
      fontSize: 12, color: '#888', fontStyle: 'italic', marginTop: 4,
    },

    // End of day
    eodHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
    eodTitle: { fontSize: 10, color: '#888', textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: '600' },
    eodText: { fontSize: 14, color: '#ccc', lineHeight: 20, marginBottom: 12 },
    eodStats: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
    eodStat: { flex: 1, alignItems: 'center' },
    eodStatVal: { fontSize: 22, fontWeight: '700', color: '#fff', marginBottom: 2 },
    eodStatLabel: { fontSize: 9, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5 },
    eodDivider: { width: 1, height: 32, backgroundColor: '#2a2a2a' },
    eodTomorrow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#2a2a2a' },
    eodTomorrowText: { fontSize: 12, color: '#888' },

    // ── Section 3: Strain ─────────────────────────────────────────────────────
    strainCard: {
      backgroundColor: '#1a1a1a',
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: '#2a2a2a',
      marginBottom: 10,
    },
    strainHeaderRow: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8,
    },
    strainLeftLabel: { fontSize: 9, color: '#888', textTransform: 'uppercase', letterSpacing: 1 },
    strainRightLabel: { fontSize: 12, color: '#ccc', fontWeight: '600' },
    strainBarBg: {
      height: 6, backgroundColor: '#2a2a2a', borderRadius: 3, overflow: 'hidden',
    },
    strainBarFill: { height: 6, borderRadius: 3 },
    strainEmptyLabel: { fontSize: 11, color: '#555', marginTop: 4, fontStyle: 'italic' },

    // ── Section 4: Quick actions ──────────────────────────────────────────────
    pillScroll: { marginBottom: 12 },
    pillRow: { flexDirection: 'row', gap: 8, paddingVertical: 2 },
    pill: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      height: 40, paddingHorizontal: 14,
      backgroundColor: '#1a1a1a', borderRadius: 20,
      borderWidth: 1, borderColor: '#2a2a2a',
    },
    pillHighlight: { borderColor: '#fff' },
    pillDone: { borderColor: CLR_GREEN },
    pillLabel: { fontSize: 13, color: '#ccc' },

    // ── Section label shared ──────────────────────────────────────────────────
    sectionLabel: {
      fontSize: 9, fontWeight: '600', color: '#555',
      textTransform: 'uppercase', letterSpacing: 2,
      marginBottom: 8, marginTop: 2,
    },

    // ── Card shared ───────────────────────────────────────────────────────────
    card: {
      backgroundColor: '#1a1a1a',
      borderRadius: 14,
      padding: 14,
      borderWidth: 1,
      borderColor: '#2a2a2a',
      marginBottom: 10,
    },
    emptyHint: { fontSize: 13, color: '#555', fontStyle: 'italic' },
    emptyHintCenter: { fontSize: 13, color: '#555', fontStyle: 'italic', textAlign: 'center' },

    // ── Section 5: Diagnosis ──────────────────────────────────────────────────
    diagCard: { borderLeftWidth: 3 },
    diagHeaderRow: {
      flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6,
    },
    diagMeta: { fontSize: 10, color: '#555', marginTop: 2 },
    refreshBtn: {
      width: 30, height: 30, borderRadius: 15,
      backgroundColor: '#222', alignItems: 'center', justifyContent: 'center',
    },
    refreshBtnOff: { opacity: 0.35 },
    diagTitleLabel: {
      fontSize: 11, fontWeight: '600', color: '#fff',
      textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6,
    },
    diagText: { fontSize: 14, color: '#ccc', lineHeight: 20, marginBottom: 6 },
    readMoreText: { fontSize: 12, color: '#888', marginBottom: 6 },
    factorChip: {
      backgroundColor: '#222', borderRadius: 20,
      paddingHorizontal: 9, paddingVertical: 3,
    },
    factorText: { fontSize: 11, color: '#888' },
    recBox: {
      flexDirection: 'row', alignItems: 'flex-start',
      backgroundColor: '#222', borderRadius: 10, padding: 10, marginTop: 10,
    },
    recText: { flex: 1, fontSize: 13, color: CLR_AMBER, lineHeight: 18 },

    // ── Section 6: Training ───────────────────────────────────────────────────
    trainingCard: { gap: 0, padding: 0, overflow: 'hidden' },
    trainZone: { paddingHorizontal: 14, paddingVertical: 12 },
    trainDividerH: { height: 1, backgroundColor: '#2a2a2a' },
    trainStatsRow: { flexDirection: 'row', alignItems: 'center' },
    lastSessionIcon: {
      width: 32, height: 32, borderRadius: 9,
      backgroundColor: '#222', alignItems: 'center', justifyContent: 'center',
    },
    lastSessionName: { fontSize: 14, fontWeight: '700', color: '#fff', marginBottom: 2 },
    lastSessionMeta: { fontSize: 12, color: '#888' },
    rpePill: {
      backgroundColor: '#222', borderRadius: 8,
      paddingHorizontal: 8, paddingVertical: 4,
      borderWidth: 1, borderColor: '#333',
    },
    rpePillText: { fontSize: 10, color: '#888', fontWeight: '700' },
    trainStat: { flex: 1, alignItems: 'center' },
    trainStatVal: { fontSize: 20, fontWeight: '700', color: '#fff', marginBottom: 2 },
    trainStatLabel: { fontSize: 9, color: '#888', textTransform: 'uppercase', letterSpacing: 0.8 },
    trainDivider: { width: 1, height: 30, backgroundColor: '#2a2a2a' },
    dualBarBg: { height: 3, backgroundColor: '#1a1a1a', borderRadius: 2, overflow: 'hidden' },
    dualBarFill: { height: 3, borderRadius: 2 },

    // ── Section 7: Nutrition ──────────────────────────────────────────────────
    nutritionCard: { gap: 0 },
    nutRow1: {
      flexDirection: 'row', alignItems: 'baseline',
      justifyContent: 'space-between', marginBottom: 8,
    },
    nutTodayLabel: { fontSize: 9, color: '#888', textTransform: 'uppercase', letterSpacing: 1 },
    nutCalories: { fontSize: 16, fontWeight: '700', color: '#fff' },
    nutCalTarget: { fontSize: 11, color: '#888' },
    nutMacrosRow: { flexDirection: 'row', gap: 12, marginBottom: 8 },
    nutMacro: { flex: 1, flexDirection: 'row', alignItems: 'center' },
    nutMacroLabel: { fontSize: 8, color: '#888', textTransform: 'uppercase', letterSpacing: 0.5 },
    nutMacroVal: { fontSize: 10, color: '#ccc', fontWeight: '600' },
    nutBarBg: { height: 4, backgroundColor: '#2a2a2a', borderRadius: 2, overflow: 'hidden' },
    nutBarFill: { height: 4, borderRadius: 2 },

    // ── Section 8: Wellness ───────────────────────────────────────────────────
    wellnessCard: {
      backgroundColor: '#1a1a1a',
      borderRadius: 14,
      borderWidth: 1,
      borderColor: '#2a2a2a',
      marginBottom: 10,
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 14,
      minHeight: 64,
    },
    wellnessCol: { flex: 1, alignItems: 'center', position: 'relative' },
    wellnessColDivider: {
      position: 'absolute', left: 0, top: 4, width: 1, height: 32, backgroundColor: '#2a2a2a',
    },
    wellnessVal: { fontSize: 18, fontWeight: '700', marginBottom: 2 },
    wellnessColLabel: { fontSize: 9, color: '#888', textTransform: 'uppercase', letterSpacing: 0.3 },

    // ── Section 9: Weekly ─────────────────────────────────────────────────────
    weekCard: {
      backgroundColor: '#1a1a1a',
      borderRadius: 14,
      borderWidth: 1,
      borderColor: '#2a2a2a',
      marginBottom: 10,
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 14,
    },
    weekStat: { flex: 1, alignItems: 'center' },
    weekStatVal: { fontSize: 20, fontWeight: '700', color: '#fff', marginBottom: 2 },
    weekStatLabel: { fontSize: 9, color: '#888', textTransform: 'uppercase', letterSpacing: 0.3 },
    weekDivider: { width: 1, height: 30, backgroundColor: '#2a2a2a' },

    // ── Wellness Modal ────────────────────────────────────────────────────────
    modalWrapper: { flex: 1, backgroundColor: '#0a0a0a' },
    modalContent: { padding: 24, paddingBottom: 48 },
    modalHandle: {
      width: 40, height: 4, backgroundColor: '#2a2a2a',
      borderRadius: 2, alignSelf: 'center', marginBottom: 24,
    },
    modalTitle: { fontSize: 22, fontWeight: '700', color: '#fff', marginBottom: 6 },
    modalSubtitle: { fontSize: 13, color: '#888', marginBottom: 28 },
    wellnessRow: {
      flexDirection: 'row', alignItems: 'flex-start',
      justifyContent: 'space-between', marginBottom: 22, gap: 12,
    },
    wellnessRowText: { flex: 1, paddingTop: 4 },
    wellnessRowLabel: { fontSize: 15, color: '#fff', fontWeight: '500', lineHeight: 20, marginBottom: 3 },
    hooperScale: { fontSize: 11, color: '#888', lineHeight: 16 },
    wellnessControls: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    stepBtn: {
      width: 36, height: 36, borderRadius: 18,
      backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center',
    },
    stepBtnText: { fontSize: 20, color: '#fff', lineHeight: 24 },
    valueBadge: {
      width: 52, height: 36, borderRadius: 10,
      borderWidth: 1, alignItems: 'center', justifyContent: 'center',
    },
    valueText: { fontSize: 14, fontWeight: '700' },
    modalFieldLabel: { fontSize: 13, color: '#888', marginBottom: 8, fontWeight: '500' },
    modalTextArea: {
      backgroundColor: '#1a1a1a', borderRadius: 12,
      paddingHorizontal: 16, paddingVertical: 14,
      fontSize: 16, color: '#fff', borderWidth: 1, borderColor: '#2a2a2a',
      minHeight: 80, textAlignVertical: 'top', marginBottom: 24,
    },
    saveBtn: {
      backgroundColor: '#fff', borderRadius: 12,
      paddingVertical: 15, alignItems: 'center', marginBottom: 12,
    },
    saveBtnText: { color: '#0a0a0a', fontSize: 16, fontWeight: '700' },
    btnDisabled: { opacity: 0.5 },
    cancelBtn: { alignItems: 'center', paddingVertical: 10 },
    cancelText: { color: '#888', fontSize: 14 },

    // ── Readiness Info Modal ──────────────────────────────────────────────────
    infoRow: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 12,
      paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#2a2a2a',
    },
    infoIcon: {
      width: 34, height: 34, borderRadius: 9,
      backgroundColor: '#222', alignItems: 'center', justifyContent: 'center',
    },
    infoLabel: { fontSize: 14, fontWeight: '600', color: '#fff', marginBottom: 4 },
    infoScore: { fontSize: 17, fontWeight: '700', color: '#fff' },
    infoDesc: { fontSize: 12, color: '#888', lineHeight: 17 },

    // ── Weight toast ──────────────────────────────────────────────────────────
    weightToast: {
      position: 'absolute',
      bottom: 100,
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: 'rgba(15,15,15,0.92)',
      borderWidth: 1,
      borderColor: CLR_GREEN,
      borderRadius: 24,
      paddingHorizontal: 18,
      paddingVertical: 10,
    },
    weightToastText: { fontSize: 14, fontWeight: '600', color: '#fff' },
  });
}
