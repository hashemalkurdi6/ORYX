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
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Path } from 'react-native-svg';
import { router } from 'expo-router';
import {
  getDashboard,
  getDiagnosis,
  submitWellnessCheckin,
  uploadHealthSnapshots,
  upsertDailySteps,
  logRestDay,
  getWeightHistory,
  getWeightSummary,
  DashboardData,
  DiagnosisData,
  WeightLogResult,
  WeightHistory,
  WeightSummary,
} from '@/services/api';
import WeightLogSheet from '@/components/WeightLogSheet';
import GlassCard from '@/components/GlassCard';
import AmbientBackdrop from '@/components/AmbientBackdrop';
import { Pedometer } from 'expo-sensors';
import { LinearGradient } from 'expo-linear-gradient';
import { fetchLast7DaysHealthData } from '@/services/healthKit';
import { useTheme } from '@/contexts/ThemeContext';
import { ThemeColors, theme as T, type as TY, radius as R, space as SP } from '@/services/theme';
import { useCountUp } from '@/services/animations';

// ── Palette (ORYX design tokens) ──────────────────────────────────────────────
// All colour values route through services/theme so the design system is the
// single source of truth. Names kept for backward compat with the rest of the
// file.
const CLR_GREEN  = T.readiness.high;  // chartreuse-leaning high readiness
const CLR_AMBER  = T.readiness.mid;
const CLR_RED    = T.readiness.low;
const CLR_LOAD   = T.signal.load;     // electric blue for load arcs
const CLR_ACCENT = T.accent;          // chartreuse brand accent

const SCREEN_WIDTH = Dimensions.get('window').width;

// ── Ring geometry (Design v2: 260 outer, dual concentric, inner offset 6px) ──
const RSIZE   = 260;
const RCX     = 130;
const RCY     = 130;
const OUTER_SW = 12;
const OUTER_R = (RSIZE - OUTER_SW) / 2;          // 124
const INNER_R = OUTER_R - OUTER_SW - 6;           // 106
const INNER_SW = OUTER_SW * 0.55;                 // ~6.6
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
  if (status === 'undertraining') return T.text.secondary;
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

// Mono ticker for the top-of-screen header — e.g. "TUE · APR 19 · WK 04".
function formatTicker(): string {
  const d = new Date();
  const dow = d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
  const mon = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
  const day = d.getDate();
  // ISO week number
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (tmp.getUTCDay() + 6) % 7;
  tmp.setUTCDate(tmp.getUTCDate() - dayNum + 3);
  const firstThu = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 4));
  const wk = 1 + Math.round(((tmp.getTime() - firstThu.getTime()) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
  return `${dow} · ${mon} ${day} · WK ${String(wk).padStart(2, '0')}`;
}

// ── Animation hooks ───────────────────────────────────────────────────────────
// useCountUp moved to services/animations.ts — imported at the top of this file
// with cacheKey support so modal opens / tab switches don't replay the animation.

/**
 * Stagger-entrance wrapper — fades + slides up children by `delay` ms.
 * Mirrors the design's `oryx-up` keyframe applied with incremental per-card
 * delays (60ms / 120ms / 180ms / ...).
 */
function AnimatedCard({ delay = 0, children, style }: {
  delay?: number;
  children: React.ReactNode;
  style?: any;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 380, delay, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 380, delay, useNativeDriver: true }),
    ]).start();
  }, []);
  return (
    <Animated.View style={[{ opacity, transform: [{ translateY }] }, style]}>
      {children}
    </Animated.View>
  );
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
  return <Animated.View style={[{ width, height, borderRadius: 6, backgroundColor: T.bg.subtle, opacity }, style]} />;
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
      <Circle cx={size/2} cy={size/2} r={r} stroke={T.bg.subtle} strokeWidth={sw} fill="none" />
      {pct > 0 && (
        <Circle cx={size/2} cy={size/2} r={r} stroke={color} strokeWidth={sw} fill="none"
          strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round"
          rotation={-90} origin={`${size/2}, ${size/2}`} />
      )}
    </Svg>
  );
}

// ── Concentric Hero ───────────────────────────────────────────────────────────
// Dual concentric — outer = readiness (0-100, readiness-spectrum colour),
// inner = weekly load (0-100, load-blue). Count-up number, animated arc draw,
// and an in-ring delta chip ("+6% vs 7D") sitting at the bottom of the ring
// body. Matches Claude Design v2's hero motif 1:1.
function ConcentricHero({
  score, color, outerPct, innerPct, delta,
}: {
  score: number;
  color: 'green' | 'amber' | 'red';
  outerPct: number;
  innerPct: number;
  delta?: number | null;
}) {
  const { resolvedScheme, theme } = useTheme();
  const isLight = resolvedScheme === 'light';
  // Ring track (the unfilled portion of the circle). Very subtle — guides the
  // eye, doesn't compete with the arc.
  const trackOuter = isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.06)';
  const trackInner = isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)';
  const oHex  = readinessHex(color);
  // Light mode bumps stroke width +2 and draws a soft glow halo behind the arc
  // to compensate for the missing translucent-glow treatment dark mode gets.
  const outerSw = isLight ? OUTER_SW + 2 : OUTER_SW;
  const innerSw = isLight ? INNER_SW + 1 : INNER_SW;
  // No cacheKey → animation replays every time the hero mounts.
  const displayScore = useCountUp(score, 1000, 200);
  const displayLoad  = useCountUp(Math.round(innerPct * 100), 1000, 400);

  // Draw-in: dasharray grows from 0 to final fill length as numbers count up.
  const outerFill = (OUTER_C * Math.min(displayScore, score)) / 100;
  const innerFill = (INNER_C * Math.min(displayLoad, Math.round(innerPct * 100))) / 100;
  const fontNum  = Math.round(RSIZE * 0.32);          // 83 at 260
  const fontLbl  = Math.max(10, Math.round(RSIZE * 0.055));

  return (
    <View style={{ width: RSIZE, height: RSIZE, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={RSIZE} height={RSIZE} style={{ position: 'absolute' }}>
        {/* Outer track */}
        <Circle cx={RCX} cy={RCY} r={OUTER_R} stroke={trackOuter} strokeWidth={outerSw} fill="none" />
        {/* Light-mode glow halo — thicker, semi-transparent stroke behind the
            arc giving it the depth that the dark-mode translucent glow provides */}
        {isLight ? (
          <Circle cx={RCX} cy={RCY} r={OUTER_R} stroke={oHex} strokeWidth={outerSw + 6}
            fill="none" opacity={0.18}
            strokeDasharray={`${outerFill} ${OUTER_C}`} strokeLinecap="round"
            rotation={-90} origin={`${RCX}, ${RCY}`} />
        ) : null}
        {/* Outer progress — readiness, rounded cap */}
        <Circle cx={RCX} cy={RCY} r={OUTER_R} stroke={oHex} strokeWidth={outerSw} fill="none"
          strokeDasharray={`${outerFill} ${OUTER_C}`} strokeLinecap="round"
          rotation={-90} origin={`${RCX}, ${RCY}`} />
        {/* Inner track */}
        <Circle cx={RCX} cy={RCY} r={INNER_R} stroke={trackInner} strokeWidth={innerSw} fill="none" />
        {/* Inner progress — weekly load */}
        {innerPct > 0 && (
          <Circle cx={RCX} cy={RCY} r={INNER_R} stroke={theme.signal.load} strokeWidth={innerSw} fill="none"
            strokeDasharray={`${innerFill} ${INNER_C}`} strokeLinecap="round"
            rotation={-90} origin={`${RCX}, ${RCY}`} />
        )}
      </Svg>

      {/* Centre: count-up number + READINESS label */}
      <View style={{ alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{
          fontSize: fontNum, color: theme.text.primary,
          fontFamily: TY.mono.medium, letterSpacing: -fontNum * 0.04, lineHeight: fontNum * 1.04,
          ...TY.tabular,
        }}>{displayScore}</Text>
        <Text style={{
          fontSize: fontLbl, color: theme.text.primary, fontFamily: TY.mono.medium,
          textTransform: 'uppercase', letterSpacing: fontLbl * 0.12, marginTop: 4,
        }}>Readiness</Text>
      </View>

      {/* Bottom-of-ring delta chip — "+6% vs 7D" */}
      {typeof delta === 'number' && delta !== 0 ? (
        <View style={{
          position: 'absolute', bottom: 18,
          flexDirection: 'row', alignItems: 'center', gap: 6,
        }}>
          <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: oHex }} />
          <Text style={{
            fontFamily: TY.mono.medium, fontSize: 11, color: oHex,
            letterSpacing: 0.9,
          }}>
            {delta > 0 ? '+' : ''}{delta}% vs 7D
          </Text>
        </View>
      ) : null}
    </View>
  );
}

// ── Vital Tile (HRV / RHR / SLEEP) ────────────────────────────────────────────
// Three-up row of small GlassCards under the ring. When a value exists we
// render label + big number + unit. When it doesn't, we render a soft
// onboarding nudge ("Connect Apple Health →") instead of a broken "-- ms".
function VitalTile({
  label, value, unit, icon,
}: {
  label: string;
  value: number | string | null;
  unit: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
}) {
  // Pull from context so text colors actually flip when the user toggles light
  // mode (module-level T is frozen at the dark palette at bundle load).
  const { theme } = useTheme();
  const hasValue = value != null && value !== '';
  return (
    <GlassCard style={{ flex: 1 }} padding={14}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <Text style={{
          fontFamily: TY.mono.medium, fontSize: 10,
          color: theme.text.label, letterSpacing: 1.8,
        }}>{label}</Text>
        <Ionicons name={icon} size={13} color={theme.text.muted} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
        <Text style={{
          fontSize: 22, color: hasValue ? theme.text.primary : theme.text.muted,
          fontFamily: TY.sans.semibold, letterSpacing: -0.4,
          ...TY.tabular,
        }}>{hasValue ? String(value) : '—'}</Text>
        {hasValue ? (
          <Text style={{
            fontFamily: TY.mono.regular, fontSize: 11, color: theme.text.muted,
            letterSpacing: 0.5,
          }}>{unit}</Text>
        ) : null}
      </View>
    </GlassCard>
  );
}

// RingHalo intentionally removed — the coloured bloom was creating a visible
// tinted shadow ring around the arc. The ring now sits directly on the app bg.

// ── Scan sweep ────────────────────────────────────────────────────────────────
// Thin 60-wide bright column that translates left→right across the parent
// every ~4 seconds, mirroring the design's `oryx-scan` keyframe on the
// ORYX Intelligence card.
function ScanSweep() {
  const x = useRef(new Animated.Value(-0.6)).current;
  const [w, setW] = useState(0);
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(x, { toValue: 1.1, duration: 3000, delay: 1000, useNativeDriver: true }),
        Animated.timing(x, { toValue: -0.6, duration: 0, useNativeDriver: true }),
        Animated.timing(x, { toValue: -0.6, duration: 1000, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const translateX = w > 0
    ? x.interpolate({ inputRange: [-0.6, 1.1], outputRange: [-w * 0.6, w * 1.1] })
    : 0;

  return (
    <View
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      pointerEvents="none"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}
    >
      <Animated.View style={{
        position: 'absolute', top: 0, bottom: 0, width: 60,
        transform: [{ translateX }],
      }}>
        <LinearGradient
          colors={['transparent', 'rgba(222,255,71,0.15)', 'transparent']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={{ flex: 1 }}
        />
      </Animated.View>
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
  const [weightHistory7d, setWeightHistory7d]   = useState<WeightHistory | null>(null);
  const [weightSummary, setWeightSummary]       = useState<WeightSummary | null>(null);
  const [weightCardLoading, setWeightCardLoading] = useState(false);
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
      // Load weight card data in background
      setWeightCardLoading(true);
      Promise.allSettled([getWeightHistory(7, '7d'), getWeightSummary()]).then(([histRes, sumRes]) => {
        if (histRes.status === 'fulfilled') setWeightHistory7d(histRes.value);
        if (sumRes.status === 'fulfilled') setWeightSummary(sumRes.value);
      }).finally(() => setWeightCardLoading(false));
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
    // Refresh weight card
    Promise.allSettled([getWeightHistory(7, '7d'), getWeightSummary()]).then(([histRes, sumRes]) => {
      if (histRes.status === 'fulfilled') setWeightHistory7d(histRes.value);
      if (sumRes.status === 'fulfilled') setWeightSummary(sumRes.value);
    });
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
  // Use startsWith instead of === because last_session.date may be a full ISO
  // timestamp ("2026-04-20T12:30:00Z"), not just "YYYY-MM-DD". With ===, the
  // strain gauge never renders after a workout.
  const hadSessionToday    = dashboard?.last_session?.date?.startsWith(todayISO()) ?? false;
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
      <AmbientBackdrop />
      <ScrollView
        style={s.container}
        contentContainerStyle={[
          s.content,
          {
            // Respect Dynamic Island / status bar
            paddingTop: insets.top + SP[2],
            // Clear the floating glass tab bar (height 64 + bottom inset 16 + safeArea)
            paddingBottom: insets.bottom + 96,
          },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={T.text.muted} colors={[CLR_ACCENT]} />
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
          <View style={{ flex: 1 }}>
            <Text style={s.greeting}>{formatTicker()}</Text>
            <Text style={s.userName}>{getGreeting()} {displayName}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={s.notifBtn}>
              <Ionicons name="notifications-outline" size={16} color={T.text.body} />
            </View>
            <View style={[s.notifBtn, { backgroundColor: T.accent, borderColor: 'transparent' }]}>
              <Ionicons name="sparkles" size={14} color={T.accentInk} />
            </View>
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
          <AnimatedCard delay={0} style={s.heroContainer}>
            <TouchableOpacity style={s.infoBtn} onPress={() => setShowReadinessInfo(true)} activeOpacity={0.7}>
              <Ionicons name="information-circle-outline" size={17} color={T.text.secondary} />
            </TouchableOpacity>

            {/* Centred 260px dual-concentric ring with inline delta chip */}
            <View style={{ alignItems: 'center', justifyContent: 'center' }}>
              <ConcentricHero
                score={rScore}
                color={rColor}
                outerPct={rScore / 100}
                innerPct={weeklyLoadPct}
                delta={dashboard?.readiness_delta_7d ?? null}
              />
            </View>
          </AnimatedCard>
        )}

        {/* ─── SECTION 2b: VITALS ROW (HRV / RHR / SLEEP) ─────────────────── */}
        {!dashLoading ? (() => {
          const hrv   = dashboard?.hrv_ms ?? null;
          const rhr   = dashboard?.resting_heart_rate ?? null;
          const sleep = dashboard?.sleep_hours != null ? Number(dashboard.sleep_hours).toFixed(1) : null;
          const allMissing = hrv == null && rhr == null && sleep == null;
          return (
            <AnimatedCard delay={60}>
              <View style={s.vitalsRow}>
                <VitalTile label="HRV"   value={hrv}   unit="ms"  icon="heart-outline" />
                <VitalTile label="RHR"   value={rhr}   unit="bpm" icon="flash-outline" />
                <VitalTile label="SLEEP" value={sleep} unit="hr"  icon="moon-outline" />
              </View>
              {allMissing ? (
                <TouchableOpacity style={s.connectHint} activeOpacity={0.7}>
                  <Text style={s.connectHintText}>Connect Apple Health</Text>
                  <Ionicons name="arrow-forward" size={12} color={T.text.primary} />
                </TouchableOpacity>
              ) : null}
            </AnimatedCard>
          );
        })() : null}

        {/* ─── SECTION 3: STRAIN GAUGE (only when a session has been logged) ── */}
        {!dashLoading && todaySessionLoad > 0 ? (
          <GlassCard padding={SP[4]} style={{ marginBottom: SP[3] }}>
            <View style={s.strainHeaderRow}>
              <Text style={s.strainLeftLabel}>TODAY'S LOAD</Text>
              <Text style={s.strainRightLabel}>{todaySessionLoad} / {dailyRecLoad}</Text>
            </View>
            <View style={s.strainBarBg}>
              <LinearGradient
                colors={[T.signal.load, T.readiness.high, T.accent]}
                locations={[0, 0.55, 1]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={{
                  height: 6,
                  width: `${Math.min(100, strainPct * 100)}%` as any,
                  borderRadius: R.pill,
                }}
              />
              {/* Target marker */}
              <View style={{
                position: 'absolute', top: -2, bottom: -2,
                left: '100%', width: 2,
                backgroundColor: T.text.secondary, opacity: 0.4,
              }}/>
            </View>
            {/* Zone ticks (0 / 7 / 14 / 21) — design's strain scale */}
            <View style={s.strainTicks}>
              <Text style={s.strainTickText}>0</Text>
              <Text style={s.strainTickText}>7</Text>
              <Text style={s.strainTickText}>14</Text>
              <Text style={s.strainTickText}>21</Text>
            </View>
          </GlassCard>
        ) : null}

        {/* ─── SECTION 4: QUICK ACTION PILLS ───────────────────────────────── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.pillRow}
          style={s.pillScroll}
        >
          <TouchableOpacity style={s.pill} onPress={() => router.push('/(tabs)/activity')} activeOpacity={0.75}>
            <Ionicons name="barbell-outline" size={14} color={T.text.body} />
            <Text style={s.pillLabel}>Workout</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.pill} onPress={() => router.push('/(tabs)/nutrition')} activeOpacity={0.75}>
            <Ionicons name="restaurant-outline" size={14} color={T.text.body} />
            <Text style={s.pillLabel}>Food</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.pill} onPress={handleLogRestDay} activeOpacity={0.75}>
            <Ionicons name="bed-outline" size={14} color={T.text.body} />
            <Text style={s.pillLabel}>Rest</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.pill, !wellnessLogged && s.pillHighlight]}
            onPress={openWellnessModal}
            activeOpacity={0.75}
          >
            <Ionicons name="journal-outline" size={14} color={T.text.body} />
            <Text style={s.pillLabel}>Check-in</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.pill, weightLoggedToday && s.pillDone]}
            onPress={() => setShowWeightSheet(true)}
            activeOpacity={0.75}
          >
            <Ionicons
              name={weightLoggedToday ? 'checkmark' : 'scale-outline'}
              size={14}
              color={weightLoggedToday ? T.accentInk : T.text.body}
            />
            <Text style={[s.pillLabel, weightLoggedToday && { color: T.accentInk }]}>
              Weight
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
          (() => {
            // Split "headline. body text..." — first sentence-ending becomes the
            // bold mono headline; the rest flows as body. Mirrors Claude Design's
            // ORYX Intelligence layout (headline + supporting body + chips).
            const full = diagnosis?.diagnosis_text || 'No diagnosis yet. Log activities and wellness to get started.';
            const m = full.match(/^([^.!?]+[.!?])\s+(.+)$/s);
            const headline = m ? m[1].trim() : full;
            const body     = m ? m[2].trim() : '';
            const stamp    = diagnosis?.generated_at
              ? new Date(diagnosis.generated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
              : '';
            return (
              <AnimatedCard delay={120}>
              <GlassCard variant="hi" accentEdge="left" accentThickness={3} padding={SP[4]} style={{ marginBottom: SP[3] }}>
                {/* Animated scan sweep — thin bright column travels across every 4s */}
                <ScanSweep />
                {/* Header: lime sigil + label, timestamp on right */}
                <View style={s.diagHeaderRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="sparkles" size={12} color={T.text.primary} />
                    <Text style={s.diagTitleLabel}>ORYX INTELLIGENCE</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    {stamp ? <Text style={s.diagStamp}>{stamp}</Text> : null}
                    <TouchableOpacity
                      style={[s.refreshBtn, (diagRefreshing || diagnosis?.rate_limited) && s.refreshBtnOff]}
                      onPress={handleRefreshDiagnosis}
                      disabled={diagRefreshing || diagnosis?.rate_limited === true}
                      activeOpacity={0.7}
                    >
                      {diagRefreshing
                        ? <ActivityIndicator size="small" color={T.text.muted} />
                        : <Ionicons name="refresh-outline" size={14} color={diagnosis?.rate_limited ? T.text.muted : T.text.secondary} />}
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Headline: mono, bold, white */}
                <Text style={s.diagHeadline}>{headline}</Text>

                {/* Body: sans regular, dim */}
                {body ? (
                  <Text style={s.diagBody} numberOfLines={diagExpanded ? undefined : 5}>{body}</Text>
                ) : null}
                {body.length > 180 ? (
                  <TouchableOpacity onPress={() => setDiagExpanded((p) => !p)}>
                    <Text style={s.readMoreText}>{diagExpanded ? 'Show less' : 'Read more'}</Text>
                  </TouchableOpacity>
                ) : null}

                {/* Factor chips — glass pills, mono */}
                {diagnosis?.contributing_factors && diagnosis.contributing_factors.length > 0 ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: SP[3] }}>
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
              </GlassCard>
              </AnimatedCard>
            );
          })()
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

        {/* ─── WEIGHT CARD ─────────────────────────────────────────────────── */}
        <Text style={s.sectionLabel}>WEIGHT</Text>
        {weightCardLoading && !weightSummary ? (
          <View style={[s.card, { gap: 8 }]}>
            <SkeletonBlock width="100%" height={10} />
            <SkeletonBlock width="100%" height={24} />
          </View>
        ) : (
          <TouchableOpacity
            style={s.card}
            activeOpacity={0.85}
            onPress={() => router.push('/weight')}
          >
            {/* Header row */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 10, color: '#555', textTransform: 'uppercase', letterSpacing: 2 }}>WEIGHT</Text>
                {weightSummary?.current_weight_display != null && (
                  <>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>
                      {weightSummary.current_weight_display}{weightSummary.display_unit}
                    </Text>
                    {(() => {
                      const goal = weightSummary.goal_alignment;
                      const rate = weightSummary.rate_of_change_kg_per_week;
                      if (!rate || Math.abs(rate) < 0.05) return <Text style={{ fontSize: 12, color: '#888' }}>→</Text>;
                      if (goal === 'on_track') return <Text style={{ fontSize: 12, color: CLR_GREEN }}>{rate < 0 ? '↓' : '↑'}</Text>;
                      if (goal === 'off_track') return <Text style={{ fontSize: 12, color: '#c0392b' }}>{rate < 0 ? '↓' : '↑'}</Text>;
                      return <Text style={{ fontSize: 12, color: '#888' }}>{rate < 0 ? '↓' : '↑'}</Text>;
                    })()}
                  </>
                )}
              </View>
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: weightLoggedToday ? 'rgba(39,174,96,0.12)' : 'rgba(255,255,255,0.08)', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5 }}
                onPress={(e) => { e.stopPropagation(); setShowWeightSheet(true); }}
                activeOpacity={0.7}
              >
                <Ionicons name={weightLoggedToday ? 'checkmark' : 'add'} size={12} color={weightLoggedToday ? CLR_GREEN : '#ccc'} />
                <Text style={{ fontSize: 11, fontWeight: '600', color: weightLoggedToday ? CLR_GREEN : '#ccc' }}>
                  {weightLoggedToday ? 'Logged' : 'Log Weight'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Sparkline or empty state */}
            {weightHistory7d && weightHistory7d.entries.length >= 3 ? (() => {
              const unit = weightHistory7d.display_unit;
              const factor = unit === 'lbs' ? 2.20462 : 1.0;
              const vals = weightHistory7d.entries.map(e => e.weight_kg * factor);
              const minV = Math.min(...vals);
              const maxV = Math.max(...vals);
              const range = maxV - minV || 1;
              const H = 24;
              const W = SCREEN_WIDTH - 64;
              const pts = vals.map((v, i) => {
                const x = vals.length === 1 ? W / 2 : (i / (vals.length - 1)) * W;
                const y = H - ((v - minV) / range) * H;
                return `${x},${y}`;
              });
              const pathD = `M ${pts.join(' L ')}`;
              const lineColor = weightSummary?.goal_alignment === 'on_track' ? CLR_GREEN : weightSummary?.goal_alignment === 'off_track' ? '#c0392b' : '#555';
              const weekAvg = vals.reduce((a, b) => a + b, 0) / vals.length;
              const firstVal = vals[0];
              const lastVal = vals[vals.length - 1];
              const change = lastVal - firstVal;
              return (
                <>
                  <Svg width={W} height={H} style={{ marginBottom: 6 }}>
                    <Path d={pathD} stroke={lineColor} strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </Svg>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 11, color: '#555' }}>Avg: {weekAvg.toFixed(1)}{unit}</Text>
                    <Text style={{ fontSize: 11, color: change === 0 ? '#555' : change < 0 ? CLR_GREEN : '#888' }}>
                      {change >= 0 ? '+' : ''}{change.toFixed(1)}{unit} this week
                    </Text>
                  </View>
                </>
              );
            })() : (
              <Text style={{ fontSize: 12, color: '#555', fontStyle: 'italic' }}>
                {(weightHistory7d?.entries.length ?? 0) < 3 ? 'Keep logging to see your trend' : 'No weight data yet'}
              </Text>
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
// All style values route through the ORYX theme tokens. Liquid-glass surfaces
// use translucent bg + rim highlight + subtle bottom shade.
function createStyles(t: ThemeColors) {
  const cardBase = {
    backgroundColor: t.glass.card,
    borderWidth: 1,
    borderColor: t.border,
    borderRadius: R.xl,
  } as const;
  return StyleSheet.create({
    container: {
      flex: 1,
      // Transparent so the AmbientBackdrop shines through the scroll view.
      // The app-level container is the one that holds the real near-black bg.
      backgroundColor: 'transparent',
    },
    content: {
      paddingHorizontal: SP[4],
      // Extra bottom padding so content clears the floating glass tab bar (~90px)
      paddingBottom: SP[10] + SP[6],
    },

    // ── Section 2: Hero (transparent, centred, halo behind ring) ──────────────
    heroContainer: {
      paddingTop: SP[1],
      paddingBottom: SP[4],
      alignItems: 'stretch',
      position: 'relative',
    },
    heroTriplet: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: SP[3],
    },
    heroStat: {
      flex: 1,
      gap: 2,
      paddingHorizontal: SP[2],
    },
    heroStatLabel: {
      fontFamily: TY.mono.medium,
      fontSize: 10,
      color: t.text.label,
      letterSpacing: 1.8,
      textTransform: 'uppercase',
    },
    heroStatVal: {
      fontFamily: TY.sans.semibold,
      fontSize: 20,
      color: t.text.primary,
      letterSpacing: -0.4,
      ...TY.tabular,
    },
    vitalsRow: {
      flexDirection: 'row',
      gap: SP[2],
      marginBottom: SP[2],
    },
    connectHint: {
      alignSelf: 'center',
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingVertical: 6, paddingHorizontal: SP[3],
      marginBottom: SP[3],
      backgroundColor: t.glass.card,
      borderWidth: 1, borderColor: t.border,
      borderRadius: R.pill,
    },
    connectHintText: {
      fontFamily: TY.mono.semibold, fontSize: 10,
      color: t.text.primary, letterSpacing: 1.4, textTransform: 'uppercase',
    },

    // Error
    errorBox: {
      backgroundColor: 'rgba(242,122,92,0.12)',
      borderLeftWidth: 3,
      borderLeftColor: CLR_RED,
      borderRadius: R.sm,
      padding: SP[3],
      marginBottom: SP[3],
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    errorText: { color: CLR_RED, fontSize: 13, flex: 1 },
    retryBtn: { paddingHorizontal: SP[3], paddingVertical: 5, backgroundColor: 'rgba(242,122,92,0.15)', borderRadius: R.xs, marginLeft: SP[2] },
    retryText: { color: CLR_RED, fontSize: 12, fontWeight: '600' },

    // ── Section 1: Header ──────────────────────────────────────────────────────
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      paddingTop: SP[2],
      paddingBottom: SP[3],
    },
    greeting: {
      fontSize: 10, color: t.text.muted, marginBottom: 4,
      fontFamily: TY.mono.medium, letterSpacing: 2, textTransform: 'uppercase',
    },
    userName: {
      fontSize: 22, fontWeight: '500', color: t.text.primary, marginBottom: 2,
      letterSpacing: -0.4,
    },
    dateLabel: { fontSize: 12, color: t.text.muted },
    notifBtn: {
      width: 34, height: 34, borderRadius: 17,
      backgroundColor: t.glass.card, borderWidth: 1, borderColor: t.glass.border,
      alignItems: 'center', justifyContent: 'center', marginTop: 4,
    },

    // ── Section 2: Hero ────────────────────────────────────────────────────────
    heroCard: {
      ...cardBase,
      padding: SP[4],
      marginBottom: SP[3],
    },
    infoBtn: {
      position: 'absolute', top: SP[3], right: SP[3],
      width: 28, height: 28, borderRadius: 14,
      alignItems: 'center', justifyContent: 'center', zIndex: 1,
    },
    heroRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    heroDivider: {
      width: 1, height: 80, backgroundColor: t.divider, marginHorizontal: SP[4],
    },
    heroCallouts: {
      flex: 1, gap: SP[3],
    },
    calloutVal: {
      fontSize: 22, fontWeight: '500', color: t.text.primary,
      fontFamily: TY.mono.medium, letterSpacing: -0.4,
    },
    calloutLabel: {
      fontSize: 10, color: t.text.secondary, textTransform: 'uppercase',
      letterSpacing: 1.6, marginTop: 2, fontFamily: TY.mono.medium,
    },
    calloutInnerDivider: {
      height: 1, backgroundColor: t.divider,
    },
    heroLabel: {
      marginTop: SP[1],
      fontSize: 11, letterSpacing: 2,
      fontFamily: TY.mono.medium, textTransform: 'uppercase',
    },
    confidencePill: {
      backgroundColor: t.glass.pill, borderRadius: R.pill,
      paddingHorizontal: SP[3], paddingVertical: 4,
      borderWidth: 1, borderColor: t.glass.border,
    },
    confidenceText: {
      fontSize: 10, color: t.text.body, fontFamily: TY.mono.medium,
      letterSpacing: 0.8, textTransform: 'uppercase',
    },
    heroFactor: {
      fontSize: 13, color: t.text.body, marginTop: SP[2], lineHeight: 18,
      fontFamily: TY.sans.regular,
    },

    // End of day
    eodHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: SP[2] },
    eodTitle: {
      fontSize: 10, color: t.text.secondary, textTransform: 'uppercase',
      letterSpacing: 2, fontWeight: '500', fontFamily: TY.mono.medium,
    },
    eodText: { fontSize: 14, color: t.text.primary, lineHeight: 21, marginBottom: SP[3] },
    eodStats: { flexDirection: 'row', alignItems: 'center', marginBottom: SP[3] },
    eodStat: { flex: 1, alignItems: 'center' },
    eodStatVal: {
      fontSize: 22, fontWeight: '500', color: t.text.primary, marginBottom: 2,
      fontFamily: TY.mono.medium, letterSpacing: -0.4,
    },
    eodStatLabel: { fontSize: 9, color: t.text.secondary, textTransform: 'uppercase', letterSpacing: 1.4, fontFamily: TY.mono.medium },
    eodDivider: { width: 1, height: 32, backgroundColor: t.divider },
    eodTomorrow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: SP[3], borderTopWidth: 1, borderTopColor: t.divider },
    eodTomorrowText: { fontSize: 12, color: t.text.secondary },

    // ── Section 3: Strain ─────────────────────────────────────────────────────
    strainCard: {
      ...cardBase,
      paddingHorizontal: SP[4],
      paddingVertical: SP[3],
      marginBottom: SP[3],
    },
    strainHeaderRow: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SP[2],
    },
    strainLeftLabel: {
      fontSize: 10, color: t.text.secondary, textTransform: 'uppercase',
      letterSpacing: 2, fontFamily: TY.mono.medium,
    },
    strainRightLabel: { fontSize: 12, color: t.text.primary, fontWeight: '500', fontFamily: TY.mono.medium },
    strainBarBg: {
      height: 6, backgroundColor: t.glass.pill, borderRadius: R.pill,
      position: 'relative', overflow: 'visible',
    },
    strainBarFill: { height: 6, borderRadius: R.pill },
    strainEmptyLabel: { fontSize: 11, color: t.text.muted, marginTop: 4, fontStyle: 'italic' },
    strainTicks: {
      flexDirection: 'row', justifyContent: 'space-between',
      marginTop: 6,
    },
    strainTickText: {
      fontFamily: TY.mono.regular, fontSize: 10, color: t.text.muted,
      letterSpacing: 1,
    },

    // ── Section 4: Quick actions ──────────────────────────────────────────────
    pillScroll: { marginBottom: SP[3], marginHorizontal: -SP[4] },
    pillRow: {
      flexDirection: 'row',
      gap: SP[2],
      paddingVertical: 2,
      paddingHorizontal: SP[4],
      paddingRight: SP[6],
    },
    pill: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      height: 34, paddingHorizontal: SP[3],
      backgroundColor: t.glass.pill, borderRadius: R.pill,
      borderWidth: 1, borderColor: t.glass.border,
    },
    pillHighlight: { borderColor: t.accent, backgroundColor: t.accentDim },
    pillDone: { borderColor: t.accent, backgroundColor: t.accent },
    pillLabel: { fontSize: 13, color: t.text.primary, fontWeight: '500' },

    // ── Section label shared ──────────────────────────────────────────────────
    sectionLabel: {
      fontSize: 11, fontWeight: '500', color: t.text.secondary,
      textTransform: 'uppercase', letterSpacing: 2,
      marginBottom: SP[2], marginTop: SP[1], fontFamily: TY.mono.medium,
      paddingHorizontal: SP[1],
    },

    // ── Card shared ───────────────────────────────────────────────────────────
    card: {
      ...cardBase,
      padding: SP[4],
      marginBottom: SP[3],
    },
    emptyHint: { fontSize: 13, color: t.text.muted, fontStyle: 'italic' },
    emptyHintCenter: { fontSize: 13, color: t.text.muted, fontStyle: 'italic', textAlign: 'center' },

    // ── Section 5: Diagnosis (ORYX Intelligence) ─────────────────────────────
    diagCard: {
      backgroundColor: t.glass.cardHi,
      borderWidth: 1, borderColor: t.glass.rim,
      borderRadius: R.xl,
      padding: SP[4],
      marginBottom: SP[3],
      // chartreuse accent line is drawn inline in JSX via borderTopColor override
    },
    diagHeaderRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      marginBottom: SP[3],
    },
    diagStamp: {
      fontSize: 10, color: t.text.muted, fontFamily: TY.mono.medium,
      letterSpacing: 1.2,
    },
    refreshBtn: {
      width: 26, height: 26, borderRadius: 13,
      backgroundColor: t.glass.pill,
      borderWidth: 1, borderColor: t.glass.border,
      alignItems: 'center', justifyContent: 'center',
    },
    refreshBtnOff: { opacity: 0.35 },
    diagTitleLabel: {
      fontSize: 10, color: t.text.primary,
      textTransform: 'uppercase', letterSpacing: 2.6,
      fontFamily: TY.mono.medium,
    },
    diagHeadline: {
      fontSize: 17, lineHeight: 23, color: t.text.primary,
      fontFamily: TY.sans.bold, letterSpacing: -0.2,
      marginBottom: SP[3],
    },
    diagBody: {
      fontSize: 13.5, lineHeight: 20, color: t.text.body,
      fontFamily: TY.sans.regular, letterSpacing: -0.1,
    },
    readMoreText: {
      fontSize: 12, color: t.text.secondary, marginTop: 4,
      fontFamily: TY.mono.medium, letterSpacing: 0.5,
    },
    factorChip: {
      backgroundColor: t.glass.pill, borderRadius: R.pill,
      paddingHorizontal: SP[3], paddingVertical: 5,
      borderWidth: 1, borderColor: t.glass.border,
    },
    factorText: {
      fontSize: 11, color: t.text.body, fontFamily: TY.mono.medium,
      letterSpacing: 0.4,
    },
    recBox: {
      flexDirection: 'row', alignItems: 'flex-start',
      backgroundColor: t.bg.tint,
      borderRadius: R.sm, padding: SP[3], marginTop: SP[3],
      borderWidth: 1, borderColor: t.divider,
    },
    recText: { flex: 1, fontSize: 13, color: t.readiness.mid, lineHeight: 19 },

    // ── Section 6: Training ───────────────────────────────────────────────────
    trainingCard: { gap: 0, padding: 0, overflow: 'hidden' },
    trainZone: { paddingHorizontal: SP[4], paddingVertical: SP[3] },
    trainDividerH: { height: 1, backgroundColor: t.divider },
    trainStatsRow: { flexDirection: 'row', alignItems: 'center' },
    lastSessionIcon: {
      width: 40, height: 40, borderRadius: R.sm,
      backgroundColor: CLR_ACCENT, alignItems: 'center', justifyContent: 'center',
    },
    lastSessionName: { fontSize: 16, fontWeight: '500', color: t.text.primary, marginBottom: 2, letterSpacing: -0.3 },
    lastSessionMeta: { fontSize: 12, color: t.text.secondary, fontFamily: TY.mono.medium, letterSpacing: 0.4 },
    rpePill: {
      backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: R.xs,
      paddingHorizontal: SP[2], paddingVertical: 4,
      borderWidth: 1, borderColor: t.divider,
    },
    rpePillText: { fontSize: 10, color: t.text.secondary, fontWeight: '500', fontFamily: TY.mono.medium, letterSpacing: 0.8 },
    trainStat: { flex: 1, alignItems: 'center' },
    trainStatVal: {
      fontSize: 22, fontWeight: '500', color: t.text.primary, marginBottom: 2,
      fontFamily: TY.mono.medium, letterSpacing: -0.4,
    },
    trainStatLabel: { fontSize: 9, color: t.text.secondary, textTransform: 'uppercase', letterSpacing: 1.4, fontFamily: TY.mono.medium },
    trainDivider: { width: 1, height: 30, backgroundColor: t.divider },
    dualBarBg: { height: 3, backgroundColor: t.bg.subtle, borderRadius: 2, overflow: 'hidden' },
    dualBarFill: { height: 3, borderRadius: 2 },

    // ── Section 7: Nutrition ──────────────────────────────────────────────────
    nutritionCard: { gap: 0 },
    nutRow1: {
      flexDirection: 'row', alignItems: 'baseline',
      justifyContent: 'space-between', marginBottom: SP[2],
    },
    nutTodayLabel: {
      fontSize: 10, color: t.text.secondary, textTransform: 'uppercase',
      letterSpacing: 2, fontFamily: TY.mono.medium,
    },
    nutCalories: { fontSize: 18, fontWeight: '500', color: t.text.primary, fontFamily: TY.mono.medium, letterSpacing: -0.4 },
    nutCalTarget: { fontSize: 11, color: t.text.secondary, fontFamily: TY.mono.medium },
    nutMacrosRow: { flexDirection: 'row', gap: SP[3], marginBottom: SP[2] },
    nutMacro: { flex: 1, flexDirection: 'row', alignItems: 'center' },
    nutMacroLabel: { fontSize: 9, color: t.text.secondary, textTransform: 'uppercase', letterSpacing: 1, fontFamily: TY.mono.medium },
    nutMacroVal: { fontSize: 11, color: t.text.primary, fontWeight: '500', fontFamily: TY.mono.medium },
    nutBarBg: { height: 4, backgroundColor: t.bg.subtle, borderRadius: R.pill, overflow: 'hidden' },
    nutBarFill: { height: 4, borderRadius: R.pill },

    // ── Section 8: Wellness ───────────────────────────────────────────────────
    wellnessCard: {
      ...cardBase,
      marginBottom: SP[3],
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: SP[3],
      paddingHorizontal: SP[4],
      minHeight: 64,
    },
    wellnessCol: { flex: 1, alignItems: 'center', position: 'relative' },
    wellnessColDivider: {
      position: 'absolute', left: 0, top: 4, width: 1, height: 32, backgroundColor: t.divider,
    },
    wellnessVal: { fontSize: 18, fontWeight: '500', marginBottom: 2, fontFamily: TY.mono.medium, letterSpacing: -0.3 },
    wellnessColLabel: { fontSize: 9, color: t.text.secondary, textTransform: 'uppercase', letterSpacing: 1, fontFamily: TY.mono.medium },

    // ── Section 9: Weekly ─────────────────────────────────────────────────────
    weekCard: {
      ...cardBase,
      marginBottom: SP[3],
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: SP[3],
      paddingHorizontal: SP[4],
    },
    weekStat: { flex: 1, alignItems: 'center' },
    weekStatVal: {
      fontSize: 22, fontWeight: '500', color: t.text.primary, marginBottom: 2,
      fontFamily: TY.mono.medium, letterSpacing: -0.4,
    },
    weekStatLabel: { fontSize: 9, color: t.text.secondary, textTransform: 'uppercase', letterSpacing: 1.2, fontFamily: TY.mono.medium },
    weekDivider: { width: 1, height: 30, backgroundColor: t.divider },

    // ── Wellness Modal ────────────────────────────────────────────────────────
    modalWrapper: { flex: 1, backgroundColor: t.bg.primary },
    modalContent: { padding: SP[6], paddingBottom: SP[9] },
    modalHandle: {
      width: 40, height: 4, backgroundColor: t.bg.subtle,
      borderRadius: 2, alignSelf: 'center', marginBottom: SP[6],
    },
    modalTitle: { fontSize: 22, fontWeight: '500', color: t.text.primary, marginBottom: 6, letterSpacing: -0.4 },
    modalSubtitle: { fontSize: 13, color: t.text.secondary, marginBottom: SP[7] },
    wellnessRow: {
      flexDirection: 'row', alignItems: 'flex-start',
      justifyContent: 'space-between', marginBottom: SP[6], gap: SP[3],
    },
    wellnessRowText: { flex: 1, paddingTop: 4 },
    wellnessRowLabel: { fontSize: 15, color: t.text.primary, fontWeight: '500', lineHeight: 20, marginBottom: 3 },
    hooperScale: { fontSize: 11, color: t.text.secondary, lineHeight: 16 },
    wellnessControls: { flexDirection: 'row', alignItems: 'center', gap: SP[3] },
    stepBtn: {
      width: 36, height: 36, borderRadius: 18,
      backgroundColor: t.bg.elevated, alignItems: 'center', justifyContent: 'center',
      borderWidth: 1, borderColor: t.divider,
    },
    stepBtnText: { fontSize: 20, color: t.text.primary, lineHeight: 24 },
    valueBadge: {
      width: 52, height: 36, borderRadius: R.sm,
      borderWidth: 1, alignItems: 'center', justifyContent: 'center',
    },
    valueText: { fontSize: 14, fontWeight: '500', fontFamily: TY.mono.medium },
    modalFieldLabel: { fontSize: 13, color: t.text.secondary, marginBottom: SP[2], fontWeight: '500' },
    modalTextArea: {
      backgroundColor: t.bg.elevated, borderRadius: R.md,
      paddingHorizontal: SP[4], paddingVertical: SP[3],
      fontSize: 16, color: t.text.primary, borderWidth: 1, borderColor: t.divider,
      minHeight: 80, textAlignVertical: 'top', marginBottom: SP[6],
    },
    saveBtn: {
      backgroundColor: CLR_ACCENT, borderRadius: R.md,
      paddingVertical: 15, alignItems: 'center', marginBottom: SP[3],
    },
    saveBtnText: { color: T.accentInk, fontSize: 16, fontWeight: '600' },
    btnDisabled: { opacity: 0.5 },
    cancelBtn: { alignItems: 'center', paddingVertical: SP[3] },
    cancelText: { color: t.text.secondary, fontSize: 14 },

    // ── Readiness Info Modal ──────────────────────────────────────────────────
    infoRow: {
      flexDirection: 'row', alignItems: 'flex-start', gap: SP[3],
      paddingVertical: SP[3], borderBottomWidth: 1, borderBottomColor: t.divider,
    },
    infoIcon: {
      width: 34, height: 34, borderRadius: R.sm,
      backgroundColor: 'rgba(255,255,255,0.04)',
      borderWidth: 1, borderColor: t.divider,
      alignItems: 'center', justifyContent: 'center',
    },
    infoLabel: { fontSize: 14, fontWeight: '500', color: t.text.primary, marginBottom: 4 },
    infoScore: { fontSize: 17, fontWeight: '500', color: t.text.primary, fontFamily: TY.mono.medium },
    infoDesc: { fontSize: 12, color: t.text.secondary, lineHeight: 17 },

    // ── Weight toast ──────────────────────────────────────────────────────────
    weightToast: {
      position: 'absolute',
      bottom: 100,
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      gap: SP[2],
      backgroundColor: t.glass.chrome,
      borderWidth: 1,
      borderColor: CLR_ACCENT,
      borderRadius: R.pill,
      paddingHorizontal: SP[5],
      paddingVertical: SP[3],
    },
    weightToastText: { fontSize: 14, fontWeight: '500', color: t.text.primary },
  });
}
