/**
 * Unified signup + onboarding flow — 12 screens, one continuous experience.
 *
 * Screen  1 — Welcome (Create Account / Log In)
 * Screen  2 — Account details (name, username, email, password)
 * Screen  3 — Display name
 * Screen  4 — Primary sport
 * Screen  5 — Main goal
 * Screen  6 — Fitness level
 * Screen  7 — Training frequency
 * Screen  8 — Body stats (required)
 * Screen  9 — Calorie target (required)
 * Screen 10 — App connections
 * Screen 11 — Training time
 * Screen 12 — All set → single API call creates account + saves onboarding
 */

import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
  ViewStyle,
  StyleProp,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Reanimated, {
  Easing,
  interpolateColor,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '@/contexts/ThemeContext';
import { ThemeColors, type as TY, radius as R, space as SP } from '@/services/theme';
import { signupComplete, checkUsername, getMe } from '@/services/api';
import { useAuthStore } from '@/services/authStore';

// Soft-import expo-haptics — no-op if not yet installed. The plan asks for
// haptics throughout; wiring them now means they activate the moment the dep
// lands (`npx expo install expo-haptics`) without further code changes. Same
// soft-require pattern GlassCard uses for expo-blur.
let HapticsModule: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  HapticsModule = require('expo-haptics');
} catch {
  HapticsModule = null;
}
function tap(kind: 'light' | 'medium' | 'success' = 'light') {
  if (!HapticsModule) return;
  try {
    if (kind === 'success') {
      HapticsModule.notificationAsync?.(HapticsModule.NotificationFeedbackType?.Success);
    } else {
      HapticsModule.impactAsync?.(
        kind === 'medium'
          ? HapticsModule.ImpactFeedbackStyle?.Medium
          : HapticsModule.ImpactFeedbackStyle?.Light
      );
    }
  } catch {
    /* haptics are nice-to-have; never let them break the flow */
  }
}

const ReanimatedTextInput = Reanimated.createAnimatedComponent(TextInput);

// Entry-stagger primitive — fades + slides up on mount. Respects OS reduced-motion.
// One instance per element you want staggered. Re-mounts when the parent step
// changes (the conditional `step === N && <Screen />` block remounts on switch),
// so the animation re-fires per screen advance with no extra wiring.
function FadeSlideIn({
  delay = 0,
  style,
  children,
}: {
  delay?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(12);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) {
      opacity.value = 1;
      translateY.value = 0;
      return;
    }
    opacity.value = withDelay(delay, withTiming(1, { duration: 380, easing: Easing.out(Easing.cubic) }));
    translateY.value = withDelay(delay, withTiming(0, { duration: 380, easing: Easing.out(Easing.cubic) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return <Reanimated.View style={[animStyle, style]}>{children}</Reanimated.View>;
}

// Selection chip with scale-bump on toggle and animated bg/border between
// glass-pill and lime-fill states. Used for the multi-select sport tiles.
function SportChip({
  label, icon, selected, onToggle, s, theme,
}: {
  label: string;
  icon: string;
  selected: boolean;
  onToggle: () => void;
  s: any;
  theme: ThemeColors;
}) {
  const scale = useSharedValue(1);
  const sel = useSharedValue(selected ? 1 : 0);
  const reduced = useReducedMotion();

  useEffect(() => {
    sel.value = reduced
      ? (selected ? 1 : 0)
      : withTiming(selected ? 1 : 0, { duration: 200, easing: Easing.out(Easing.cubic) });
  }, [selected, reduced, sel]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    backgroundColor: interpolateColor(sel.value, [0, 1], [theme.glass.pill, theme.accent]),
    borderColor: interpolateColor(sel.value, [0, 1], [theme.glass.border, theme.accent]),
  }));

  const handlePress = () => {
    tap('light');
    if (!reduced) {
      scale.value = withSequence(
        withTiming(1.04, { duration: 110, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: 130, easing: Easing.out(Easing.quad) }),
      );
    }
    onToggle();
  };

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={1}>
      <Reanimated.View style={[s.tile, animStyle]}>
        <Ionicons name={icon as any} size={22} color={selected ? theme.accentInk : theme.text.secondary} />
        <Text style={[s.tileLabel, selected && s.tileLabelOn]}>{label}</Text>
      </Reanimated.View>
    </TouchableOpacity>
  );
}

// Stacked option card with scale-bump on tap, animated lift to cardHi when
// selected, and animated dim to 60% when a sibling is the active choice.
function GoalRow({
  selected, dim, onPress, s, theme, children,
}: {
  selected: boolean;
  dim: boolean;
  onPress: () => void;
  s: any;
  theme: ThemeColors;
  children: React.ReactNode;
}) {
  const scale = useSharedValue(1);
  const sel = useSharedValue(selected ? 1 : 0);
  const opacity = useSharedValue(dim ? 0.6 : 1);
  const reduced = useReducedMotion();

  useEffect(() => {
    sel.value = reduced
      ? (selected ? 1 : 0)
      : withTiming(selected ? 1 : 0, { duration: 200, easing: Easing.out(Easing.cubic) });
  }, [selected, reduced, sel]);

  useEffect(() => {
    opacity.value = reduced
      ? (dim ? 0.6 : 1)
      : withTiming(dim ? 0.6 : 1, { duration: 200, easing: Easing.out(Easing.cubic) });
  }, [dim, reduced, opacity]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
    backgroundColor: interpolateColor(sel.value, [0, 1], [theme.glass.card, theme.glass.cardHi]),
    borderColor: interpolateColor(sel.value, [0, 1], [theme.glass.border, theme.accent]),
  }));

  const handlePress = () => {
    tap('light');
    if (!reduced) {
      scale.value = withSequence(
        withTiming(1.02, { duration: 100, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: 130, easing: Easing.out(Easing.quad) }),
      );
    }
    onPress();
  };

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={1}>
      <Reanimated.View style={[s.row, animStyle]}>{children}</Reanimated.View>
    </TouchableOpacity>
  );
}

// Primary CTA with press-scale, plus a one-shot pulse when state flips from
// disabled → enabled (the button noticing it's now actionable).
function PrimaryCTA({
  label, onPress, disabled, saving, s, theme,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  saving?: boolean;
  s: any;
  theme: ThemeColors;
}) {
  const scale = useSharedValue(1);
  const pulse = useSharedValue(0);
  const prevDisabled = useRef<boolean>(!!disabled);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (prevDisabled.current && !disabled && !reduced) {
      pulse.value = withSequence(
        withTiming(1, { duration: 180, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 320, easing: Easing.in(Easing.quad) }),
      );
    }
    prevDisabled.current = !!disabled;
  }, [disabled, reduced, pulse]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value * (1 + pulse.value * 0.025) }],
  }));

  const handlePressIn = () => {
    if (!reduced && !disabled) scale.value = withSpring(0.98, { damping: 22, stiffness: 380 });
  };
  const handlePressOut = () => {
    if (!reduced) scale.value = withSpring(1, { damping: 18, stiffness: 320 });
  };

  return (
    <Reanimated.View style={animStyle}>
      <TouchableOpacity
        style={[s.cta, disabled && s.ctaDim]}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled || saving}
        activeOpacity={1}
      >
        {saving
          ? <ActivityIndicator color={theme.accentInk} size="small" />
          : <Text style={s.ctaText}>{label}</Text>}
      </TouchableOpacity>
    </Reanimated.View>
  );
}

// Input with focus-state animation: border lerps from glass.border to lime
// over 150ms and a faint lime glow appears beneath. iOS draws the glow via
// shadow*; Android falls back to just the border (RN can't tint elevation).
function GlassInput({
  s, theme, style, ...props
}: {
  s: any;
  theme: ThemeColors;
} & React.ComponentProps<typeof TextInput>) {
  const focused = useSharedValue(0);
  const reduced = useReducedMotion();

  const animStyle = useAnimatedStyle(() => ({
    borderColor: interpolateColor(focused.value, [0, 1], [theme.glass.border, theme.accent]),
    shadowOpacity: focused.value * 0.35,
    shadowRadius: 4 + focused.value * 6,
  }));

  const handleFocus = (e: any) => {
    focused.value = reduced ? 1 : withTiming(1, { duration: 150, easing: Easing.out(Easing.cubic) });
    props.onFocus?.(e);
  };
  const handleBlur = (e: any) => {
    focused.value = reduced ? 0 : withTiming(0, { duration: 150, easing: Easing.out(Easing.cubic) });
    props.onBlur?.(e);
  };

  return (
    <ReanimatedTextInput
      {...props}
      onFocus={handleFocus}
      onBlur={handleBlur}
      style={[
        s.input,
        // iOS shadow is the lime glow; harmless no-op on Android.
        { shadowColor: theme.accent, shadowOffset: { width: 0, height: 0 } },
        animStyle,
        style,
      ]}
    />
  );
}

// Animated username availability indicator. Crossfades between idle (empty),
// checking (amber pulse), available (lime check), and taken (red X).
function UsernameStatus({
  status, theme,
}: {
  status: 'idle' | 'checking' | 'available' | 'taken';
  theme: ThemeColors;
}) {
  const reduced = useReducedMotion();
  const pulse = useSharedValue(0.5);

  useEffect(() => {
    if (status === 'checking' && !reduced) {
      pulse.value = withSequence(
        withTiming(1, { duration: 600, easing: Easing.inOut(Easing.quad) }),
        withTiming(0.4, { duration: 600, easing: Easing.inOut(Easing.quad) }),
      );
    } else {
      pulse.value = 1;
    }
  }, [status, reduced, pulse]);

  const checkingStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  if (status === 'idle') return <View style={{ width: 18 }} />;

  if (status === 'checking') {
    return (
      <Reanimated.View style={checkingStyle}>
        <ActivityIndicator size="small" color={theme.status.warn} />
      </Reanimated.View>
    );
  }

  // FadeSlideIn re-fires on each status flip because the icon component remounts
  // (different children pass through the conditional below).
  if (status === 'available') {
    return (
      <FadeSlideIn delay={0}>
        <Ionicons name="checkmark-circle" size={18} color={theme.status.success} />
      </FadeSlideIn>
    );
  }
  return (
    <FadeSlideIn delay={0}>
      <Ionicons name="close-circle" size={18} color={theme.status.danger} />
    </FadeSlideIn>
  );
}

const { width: SW } = Dimensions.get('window');
// Welcome screen is now its own route at /(auth)/landing — signup proper
// starts on the account-details step. Step 1 = account, step 11 = Done.
const TOTAL = 11;

// ── Option data ───────────────────────────────────────────────────────────────

const SPORTS = [
  { label: 'Gym', icon: 'barbell-outline' },
  { label: 'Running', icon: 'walk-outline' },
  { label: 'MMA', icon: 'fitness-outline' },
  { label: 'Football', icon: 'american-football-outline' },
  { label: 'Basketball', icon: 'basketball-outline' },
  { label: 'Cycling', icon: 'bicycle-outline' },
  { label: 'Swimming', icon: 'water-outline' },
  { label: 'Tennis', icon: 'tennisball-outline' },
  { label: 'Combat Sports', icon: 'shield-outline' },
  { label: 'Other', icon: 'ellipsis-horizontal-outline' },
] as const;

const GOALS = [
  { label: 'Build Muscle', icon: 'barbell-outline' },
  { label: 'Lose Fat', icon: 'flame-outline' },
  { label: 'Improve Endurance', icon: 'pulse-outline' },
  { label: 'Enhance Recovery', icon: 'bed-outline' },
  { label: 'Compete in a Sport', icon: 'trophy-outline' },
  { label: 'General Fitness', icon: 'body-outline' },
] as const;

const FITNESS_LEVELS = [
  { label: 'Beginner', sub: 'Just getting started' },
  { label: 'Intermediate', sub: 'Training consistently' },
  { label: 'Advanced', sub: 'Years of dedicated training' },
  { label: 'Competitive Athlete', sub: 'Competing regularly' },
] as const;

const TRAINING_DAYS = [
  { label: '1 to 2 days', sub: 'Light schedule' },
  { label: '3 to 4 days', sub: 'Moderate training' },
  { label: '5 to 6 days', sub: 'High frequency' },
  { label: 'Every day', sub: 'Elite commitment' },
] as const;

const TRAINING_TIMES = [
  { label: 'Early Morning', sub: '5am – 8am' },
  { label: 'Morning', sub: '8am – 11am' },
  { label: 'Afternoon', sub: '12pm – 4pm' },
  { label: 'Evening', sub: '5pm – 9pm' },
  { label: 'Varies', sub: 'No fixed time' },
] as const;

const ACTIVITY_MULT: Record<string, number> = {
  '1 to 2 days': 1.375, '3 to 4 days': 1.55,
  '5 to 6 days': 1.725, 'Every day': 1.9,
};

// Goal multiplier — must match backend nutrition_service._compute_tdee so the
// preview shown here matches the value persisted server-side. See
// docs/bugs/calorie-target-inconsistency.md.
function goalMultiplier(primaryGoal: string): number {
  const g = primaryGoal.toLowerCase();
  if (['fat', 'loss', 'cut', 'lose', 'lean'].some(k => g.includes(k))) return 0.85;
  if (['muscle', 'build', 'bulk', 'gain', 'mass'].some(k => g.includes(k))) return 1.10;
  if (['perform', 'athlete', 'sport', 'endurance'].some(k => g.includes(k))) return 1.05;
  return 1.0;
}

// Cut-rate selector kept for UX continuity (the user picks an aspirational
// pace), but it no longer drives the displayed calorie target. The backend
// uses a single ×0.85 multiplier for any "Lose Fat" goal — adding per-rate
// granularity here would require a new persisted field. Subtitles are
// illustrative.
const FAT_LOSS_RATES = [
  { label: 'Light cut',      sub: 'gradual deficit'  },
  { label: 'Moderate cut',   sub: '~0.5 kg / week'   },
  { label: 'Aggressive cut', sub: 'larger deficit'   },
] as const;

function calcAgeFromBirthday(day: string, month: string, year: string): number {
  const d = parseInt(day), m = parseInt(month), y = parseInt(year);
  if (!d || !m || !y || y < 1900) return 0;
  const birth = new Date(y, m - 1, d);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const mo = today.getMonth() - birth.getMonth();
  if (mo < 0 || (mo === 0 && today.getDate() < birth.getDate())) age--;
  return Math.max(0, age);
}

function calcTDEE(wKg: number, hCm: number, age: number, sex: string, days: string, primaryGoal: string) {
  const bonus = sex === 'Male' ? 5 : sex === 'Female' ? -161 : -78;
  const bmr = Math.round(10 * wKg + 6.25 * hCm - 5 * age + bonus);
  const mult = ACTIVITY_MULT[days] ?? 1.55;
  const goalMult = goalMultiplier(primaryGoal);
  const maintenance = bmr * mult;
  return {
    bmr,
    tdee: Math.round(maintenance * goalMult),
    multiplier: mult,
    goalMult,
    goalAdj: Math.round(maintenance * (goalMult - 1)), // for breakdown display
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

// ── Main component ─────────────────────────────────────────────────────────────

export default function SignupFlow() {
  const { theme } = useTheme();
  const s = styles(theme);
  const setAuth = useAuthStore((st) => st.setAuth);

  const [step, setStep] = useState(1);

  // — Account fields (step 2)
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const usernameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [step2Error, setStep2Error] = useState<string | null>(null);

  // — Onboarding fields (steps 3-11)
  const [displayName, setDisplayName] = useState('');
  const [sportTags, setSportTags] = useState<string[]>([]);
  const [primaryGoal, setPrimaryGoal] = useState('');
  const [fatLossRate, setFatLossRate] = useState('');
  const [fitnessLevel, setFitnessLevel] = useState('');
  const [weeklyDays, setWeeklyDays] = useState('');
  // Birthday (replaces plain age)
  const [bdDay, setBdDay] = useState('');
  const [bdMonth, setBdMonth] = useState('');
  const [bdYear, setBdYear] = useState('');
  const [weightStr, setWeightStr] = useState('');
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lbs'>('kg');
  const [heightStr, setHeightStr] = useState('');
  const [heightUnit, setHeightUnit] = useState<'cm' | 'ft'>('cm');
  const [biologicalSex, setBiologicalSex] = useState('');
  const [trainingTime, setTrainingTime] = useState('');

  // — Step 12
  const [saving, setSaving] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);

  // — Animation. Reanimated spring physics for the inter-screen slide; the
  // legacy Animated.Value version was a linear timing tween, which felt brittle
  // on a multi-step flow. Light damping = a settle, not a snap.
  const slideX = useSharedValue(0);
  const slideOpacity = useSharedValue(1);
  const reducedMotion = useReducedMotion();

  // ── Derived ──────────────────────────────────────────────────────────────────
  const weightKg = weightUnit === 'kg'
    ? parseFloat(weightStr) || 0
    : (parseFloat(weightStr) || 0) * 0.453592;
  // Parse "5.11" as 5 feet 11 inches (not 5.11 feet). Decimal part = inches, capped at 11.
  const parseFtIn = (s: string): number => {
    const [ftStr, inStr] = s.trim().split('.');
    const feet = parseInt(ftStr || '0') || 0;
    const inches = Math.min(11, parseInt(inStr || '0') || 0);
    return (feet * 12 + inches) * 2.54;
  };
  const heightCm = heightUnit === 'cm'
    ? parseFloat(heightStr) || 0
    : parseFtIn(heightStr);
  const age = calcAgeFromBirthday(bdDay, bdMonth, bdYear);
  const dateOfBirth = (parseInt(bdYear) >= 1900 && parseInt(bdMonth) >= 1 && parseInt(bdDay) >= 1)
    ? `${bdYear.padStart(4, '0')}-${bdMonth.padStart(2, '0')}-${bdDay.padStart(2, '0')}`
    : undefined;
  const tdeeData = (weightKg > 0 && heightCm > 0 && age > 0 && biologicalSex && weeklyDays && primaryGoal)
    ? calcTDEE(weightKg, heightCm, age, biologicalSex, weeklyDays, primaryGoal)
    : null;
  // Display-only — backend computes and persists the canonical value using
  // the same formula. See docs/bugs/calorie-target-inconsistency.md.
  const finalCalories = tdeeData?.tdee || 2000;

  // ── Navigation ────────────────────────────────────────────────────────────────
  const navigate = (next: number) => {
    // Medium haptic on every step advance (forward, back, or skip). Lighter
    // taps on selections/buttons get layered separately via the per-component
    // tap() calls.
    tap('medium');
    if (reducedMotion) {
      setStep(next);
      return;
    }
    const dirOut = next > step ? -SW : SW;
    const dirIn = next > step ? SW : -SW;
    slideOpacity.value = withTiming(0, { duration: 140, easing: Easing.in(Easing.quad) });
    slideX.value = withTiming(
      dirOut,
      { duration: 180, easing: Easing.in(Easing.quad) },
      (finished) => {
        'worklet';
        if (!finished) return;
        runOnJS(setStep)(next);
        slideX.value = dirIn;
        slideOpacity.value = 0;
        slideX.value = withSpring(0, { damping: 22, stiffness: 220, mass: 0.6 });
        slideOpacity.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) });
      }
    );
  };

  const slideStyle = useAnimatedStyle(() => ({
    flex: 1,
    transform: [{ translateX: slideX.value }],
    opacity: slideOpacity.value,
  }));

  const goNext = () => navigate(step + 1);
  // On step 1, back exits the signup stack and lands the user on the landing
  // screen. The Welcome step that used to live at step 1 has been promoted to
  // its own route (app/(auth)/landing.tsx).
  const goBack = () => {
    if (step <= 1) {
      if (router.canGoBack()) router.back();
      else router.replace('/(auth)/landing');
    } else navigate(step - 1);
  };
  const skip = () => navigate(step + 1);

  // ── Username check ────────────────────────────────────────────────────────────
  const handleUsernameChange = (val: string) => {
    const clean = val.toLowerCase().replace(/[^a-z0-9_]/g, '');
    setUsername(clean);
    if (usernameTimer.current) clearTimeout(usernameTimer.current);
    if (!clean || clean.length < 3) { setUsernameStatus('idle'); return; }
    if (!USERNAME_RE.test(clean)) { setUsernameStatus('idle'); return; }
    setUsernameStatus('checking');
    usernameTimer.current = setTimeout(async () => {
      try {
        const res = await checkUsername(clean);
        setUsernameStatus(res.available ? 'available' : 'taken');
      } catch { setUsernameStatus('idle'); }
    }, 500);
  };

  // ── Step 2 validation ─────────────────────────────────────────────────────────
  const validateStep2 = (): string | null => {
    if (!email.trim()) return 'Email is required.';
    if (!EMAIL_RE.test(email.trim())) return 'Enter a valid email address.';
    if (!password) return 'Password is required.';
    if (password.length < 8) return 'Password must be at least 8 characters.';
    if (!/[A-Za-z]/.test(password)) return 'Password must contain at least one letter.';
    if (!/[0-9]/.test(password)) return 'Password must contain at least one number.';
    if (password !== confirmPassword) return 'Passwords do not match.';
    if (!username.trim()) return 'Username is required.';
    if (!USERNAME_RE.test(username)) return 'Username must be 3–20 characters: letters, numbers, underscores.';
    if (usernameStatus === 'taken') return 'That username is already taken.';
    if (usernameStatus === 'checking') return 'Checking username availability…';
    return null;
  };

  const handleStep2Continue = () => {
    const err = validateStep2();
    if (err) { setStep2Error(err); return; }
    setStep2Error(null);
    goNext();
  };

  // ── Final signup ──────────────────────────────────────────────────────────────
  const handleFinish = async () => {
    setSaving(true);
    setFinishError(null);
    try {
      // TODO BUG (audit 1.10): signup auto-sets onboarding_complete=True; should be False until onboarding finishes.
      const tokenResp = await signupComplete({
        email: email.trim().toLowerCase(),
        password,
        username: username.trim(),
        full_name: fullName.trim() || undefined,
        display_name: displayName.trim() || undefined,
        sport_tags: sportTags.length > 0 ? sportTags : undefined,
        primary_goal: primaryGoal || undefined,
        fitness_level: fitnessLevel || undefined,
        weekly_training_days: weeklyDays || undefined,
        age: age > 0 ? age : undefined,
        date_of_birth: dateOfBirth,
        weight_kg: weightKg > 0 ? Math.round(weightKg * 10) / 10 : undefined,
        height_cm: heightCm > 0 ? Math.round(heightCm * 10) / 10 : undefined,
        biological_sex: biologicalSex || undefined,
        // daily_calorie_target intentionally omitted — backend computes it
        // from the inputs above so mobile and backend can never diverge.
        preferred_training_time: trainingTime || undefined,
      });
      useAuthStore.setState({ token: tokenResp.access_token });
      const user = await getMe();
      setAuth(tokenResp.access_token, user);
      // Auto-join default clubs matching sport_tags so the community tab isn't
      // empty for a fresh account. Non-fatal.
      try {
        const { autoJoinClubs } = await import('@/services/api');
        await autoJoinClubs();
      } catch { /* non-fatal */ }
      router.replace('/(tabs)/');
    } catch (err: any) {
      if (!err.response) {
        setFinishError('Cannot reach the server. Make sure your backend is running and you are on the same network.');
      } else {
        const detail = err?.response?.data?.detail;
        const msg = typeof detail === 'string' ? detail
          : Array.isArray(detail) ? ((detail[0] as any)?.msg || 'Sign up failed.')
          : `Server error (${err.response.status}). Please try again.`;
        setFinishError(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  // ── Layout helpers ────────────────────────────────────────────────────────────
  // Welcome step is gone — progress + back are visible on every signup step
  // (back on step 1 exits to the landing screen). Skip is hidden on the
  // account-details step (1), the calorie step (8 — needs the value), the
  // calorie review (9 — same), and the Done step (11).
  const showProgress = true;
  const showBack = true;
  const canSkip = step !== 1 && step !== 7 && step !== 8 && step !== 11;
  const progress = step / TOTAL;

  // Animate the progress bar fill smoothly between steps. Width as a percentage
  // doesn't natively animate via Reanimated (no interpolatable shorthand), but
  // we can spring a shared value 0..1 and convert in the animated style.
  const progressValue = useSharedValue(progress);
  useEffect(() => {
    progressValue.value = reducedMotion
      ? progress
      : withTiming(progress, { duration: 380, easing: Easing.out(Easing.cubic) });
  }, [progress, reducedMotion, progressValue]);
  const progressFillStyle = useAnimatedStyle(() => ({
    width: `${Math.round(progressValue.value * 100)}%`,
  }));

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      {/* Progress bar row */}
      {showProgress && (
        <View style={s.progressRow}>
          {showBack ? (
            <TouchableOpacity
              onPress={goBack}
              activeOpacity={0.75}
              style={s.backBtn}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="chevron-back" size={20} color={theme.text.primary} />
            </TouchableOpacity>
          ) : <View style={s.backBtnPlaceholder} />}
          <View style={s.progressTrack}>
            <Reanimated.View style={[s.progressFill, progressFillStyle]} />
          </View>
          {canSkip ? (
            <TouchableOpacity onPress={skip} style={s.skipBtn}>
              <Text style={s.skipText}>Skip</Text>
            </TouchableOpacity>
          ) : <View style={s.skipBtn} />}
        </View>
      )}

      <Reanimated.View style={[s.screenWrap, slideStyle]}>
        {step === 1 && (
          <S2Account
            fullName={fullName} setFullName={setFullName}
            username={username} onUsernameChange={handleUsernameChange} usernameStatus={usernameStatus}
            email={email} setEmail={setEmail}
            password={password} setPassword={setPassword}
            confirmPassword={confirmPassword} setConfirmPassword={setConfirmPassword}
            error={step2Error} onContinue={handleStep2Continue}
            s={s} theme={theme}
          />
        )}
        {step === 2 && <S3Name displayName={displayName} setDisplayName={setDisplayName} onNext={goNext} s={s} theme={theme} />}
        {step === 3 && <S4Sports sportTags={sportTags} setSportTags={setSportTags} onNext={goNext} s={s} theme={theme} />}
        {step === 4 && (
          <S5Goal
            primaryGoal={primaryGoal} setPrimaryGoal={setPrimaryGoal}
            fatLossRate={fatLossRate} setFatLossRate={setFatLossRate}
            onNext={goNext} s={s} theme={theme}
          />
        )}
        {step === 5 && <S6Level fitnessLevel={fitnessLevel} setFitnessLevel={setFitnessLevel} onNext={goNext} s={s} theme={theme} />}
        {step === 6 && <S7Frequency weeklyDays={weeklyDays} setWeeklyDays={setWeeklyDays} onNext={goNext} s={s} theme={theme} />}
        {step === 7 && (
          <S8Body
            bdDay={bdDay} setBdDay={setBdDay}
            bdMonth={bdMonth} setBdMonth={setBdMonth}
            bdYear={bdYear} setBdYear={setBdYear}
            weightStr={weightStr} setWeightStr={setWeightStr} weightUnit={weightUnit} setWeightUnit={setWeightUnit}
            heightStr={heightStr} setHeightStr={setHeightStr} heightUnit={heightUnit} setHeightUnit={setHeightUnit}
            biologicalSex={biologicalSex} setBiologicalSex={setBiologicalSex}
            onNext={goNext} s={s} theme={theme}
          />
        )}
        {step === 8 && (
          <S9Calories
            tdeeData={tdeeData}
            finalTarget={finalCalories} primaryGoal={primaryGoal} fatLossRate={fatLossRate}
            onNext={goNext} s={s} theme={theme}
          />
        )}
        {step === 9 && <S10Connections s={s} theme={theme} onNext={goNext} />}
        {step === 10 && <S11Time trainingTime={trainingTime} setTrainingTime={setTrainingTime} onNext={goNext} s={s} theme={theme} />}
        {step === 11 && (
          <S12Done
            displayName={displayName} sportTags={sportTags} primaryGoal={primaryGoal}
            finalCalories={finalCalories} saving={saving} error={finishError}
            onFinish={handleFinish} s={s} theme={theme}
          />
        )}
      </Reanimated.View>
    </SafeAreaView>
  );
}

// ── Screen 2: Account details ─────────────────────────────────────────────────

function S2Account({
  fullName, setFullName, username, onUsernameChange, usernameStatus,
  email, setEmail, password, setPassword, confirmPassword, setConfirmPassword,
  error, onContinue, s, theme,
}: any) {
  return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <FadeSlideIn delay={0}>
          <Text style={s.stepLabel}>01 / {TOTAL}</Text>
          <Text style={s.title}>Create your account.</Text>
        </FadeSlideIn>

        {error && (
          <FadeSlideIn delay={80}>
            <View style={s.errorBox}>
              <Text style={s.errorText}>{error}</Text>
            </View>
          </FadeSlideIn>
        )}

        <FadeSlideIn delay={150}>
          <Text style={s.label}>Full Name</Text>
          <GlassInput
            s={s} theme={theme}
            value={fullName} onChangeText={setFullName}
            placeholder="Your full name" placeholderTextColor={theme.text.muted}
            autoCapitalize="words" returnKeyType="next"
          />
        </FadeSlideIn>

        <FadeSlideIn delay={200}>
          <Text style={s.label}>Username</Text>
          <View style={s.usernameRow}>
            <Text style={s.usernameAt}>@</Text>
            <TextInput
              style={s.usernameInput} value={username} onChangeText={onUsernameChange}
              placeholder="yourhandle" placeholderTextColor={theme.text.muted}
              autoCapitalize="none" autoCorrect={false} returnKeyType="next"
            />
            <View style={{ width: 24, alignItems: 'center' }}>
              <UsernameStatus status={usernameStatus} theme={theme} />
            </View>
          </View>
        </FadeSlideIn>

        <FadeSlideIn delay={250}>
          <Text style={s.label}>Email</Text>
          <GlassInput
            s={s} theme={theme}
            value={email} onChangeText={setEmail}
            placeholder="you@example.com" placeholderTextColor={theme.text.muted}
            keyboardType="email-address" autoCapitalize="none" autoCorrect={false}
            autoComplete="email" returnKeyType="next"
          />
        </FadeSlideIn>

        <FadeSlideIn delay={300}>
          <Text style={s.label}>Password</Text>
          <GlassInput
            s={s} theme={theme}
            value={password} onChangeText={setPassword}
            placeholder="8+ chars, with a letter and a number" placeholderTextColor={theme.text.muted}
            secureTextEntry autoComplete="new-password" returnKeyType="next"
          />
        </FadeSlideIn>

        <FadeSlideIn delay={350}>
          <Text style={s.label}>Confirm Password</Text>
          <GlassInput
            s={s} theme={theme}
            value={confirmPassword} onChangeText={setConfirmPassword}
            placeholder="Re-enter your password" placeholderTextColor={theme.text.muted}
            secureTextEntry autoComplete="new-password" returnKeyType="done"
            onSubmitEditing={onContinue}
          />
        </FadeSlideIn>

        <FadeSlideIn delay={420}>
          <PrimaryCTA label="Continue" onPress={onContinue} s={s} theme={theme} />
        </FadeSlideIn>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Screen 3: Display name ────────────────────────────────────────────────────

function S3Name({ displayName, setDisplayName, onNext, s, theme }: any) {
  return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Text style={s.stepLabel}>02 / {TOTAL}</Text>
        <Text style={s.title}>What should we call you?</Text>
        <Text style={s.subtitle}>Your first name personalises all AI insights in ORYX.</Text>
        <TextInput
          style={s.bigInput} placeholder="First name" placeholderTextColor={theme.text.muted}
          value={displayName} onChangeText={setDisplayName}
          autoFocus autoCapitalize="words" returnKeyType="done" onSubmitEditing={onNext}
        />
        <TouchableOpacity style={s.cta} onPress={onNext} activeOpacity={0.85}>
          <Text style={s.ctaText}>Continue</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Screen 4: Sports ──────────────────────────────────────────────────────────

function S4Sports({ sportTags, setSportTags, onNext, s, theme }: any) {
  const toggle = (label: string) =>
    setSportTags((p: string[]) => p.includes(label) ? p.filter((x: string) => x !== label) : [...p, label]);
  return (
    <ScrollView contentContainerStyle={s.content}>
      <FadeSlideIn delay={0}>
        <Text style={s.stepLabel}>03 / {TOTAL}</Text>
        <Text style={s.title}>What is your main sport or activity?</Text>
        <Text style={s.subtitle}>Select all that apply.</Text>
      </FadeSlideIn>
      <View style={s.tileGrid}>
        {SPORTS.map(({ label, icon }, i) => (
          <FadeSlideIn key={label} delay={200 + i * 50}>
            <SportChip
              label={label}
              icon={icon}
              selected={sportTags.includes(label)}
              onToggle={() => toggle(label)}
              s={s}
              theme={theme}
            />
          </FadeSlideIn>
        ))}
      </View>
      <FadeSlideIn delay={420}>
        <PrimaryCTA
          label={sportTags.length > 0 ? 'Continue' : 'Skip for now'}
          onPress={onNext}
          s={s}
          theme={theme}
        />
      </FadeSlideIn>
    </ScrollView>
  );
}

// ── Screen 5: Goal ────────────────────────────────────────────────────────────

function S5Goal({ primaryGoal, setPrimaryGoal, fatLossRate, setFatLossRate, onNext, s, theme }: any) {
  const needsCutRate = primaryGoal === 'Lose Fat';
  const canContinue = !!primaryGoal && (!needsCutRate || !!fatLossRate);
  return (
    <ScrollView contentContainerStyle={s.content}>
      <FadeSlideIn delay={0}>
        <Text style={s.stepLabel}>04 / {TOTAL}</Text>
        <Text style={s.title}>What is your main goal?</Text>
        <Text style={s.subtitle}>ORYX frames all recommendations around this.</Text>
      </FadeSlideIn>
      <View style={s.list}>
        {GOALS.map(({ label, icon }, i) => {
          const sel = primaryGoal === label;
          // Sibling-dim: when something is picked, fade the un-picked options
          // back to 60% so the active choice reads as the focus of the screen.
          const dim = !!primaryGoal && !sel;
          return (
            <FadeSlideIn key={label} delay={200 + i * 50}>
              <GoalRow
                selected={sel}
                dim={dim}
                onPress={() => { setPrimaryGoal(label); if (label !== 'Lose Fat') setFatLossRate(''); }}
                s={s}
                theme={theme}
              >
                <Ionicons
                  name={icon as any}
                  size={20}
                  color={sel ? theme.accent : theme.text.secondary}
                  style={{ marginRight: 12 }}
                />
                <Text style={[s.rowText, sel && s.rowTextOn]}>{label}</Text>
                {sel && <Ionicons name="checkmark-circle" size={20} color={theme.accent} style={{ marginLeft: 'auto' as any }} />}
              </GoalRow>
            </FadeSlideIn>
          );
        })}
      </View>

      {needsCutRate && (
        <View style={{ marginBottom: 24 }}>
          <FadeSlideIn delay={120}>
            <Text style={[s.label, { marginTop: 4 }]}>How aggressively do you want to cut?</Text>
          </FadeSlideIn>
          <View style={[s.list, { marginTop: 10, marginBottom: 0 }]}>
            {FAT_LOSS_RATES.map(({ label, sub }, i) => {
              const sel = fatLossRate === label;
              const dim = !!fatLossRate && !sel;
              return (
                <FadeSlideIn key={label} delay={180 + i * 50}>
                  <GoalRow
                    selected={sel}
                    dim={dim}
                    onPress={() => setFatLossRate(label)}
                    s={s}
                    theme={theme}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[s.rowText, sel && s.rowTextOn]}>{label}</Text>
                      <Text style={[s.rowSub, sel && s.rowSubOn]}>{sub}</Text>
                    </View>
                    {sel && <Ionicons name="checkmark-circle" size={20} color={theme.accent} />}
                  </GoalRow>
                </FadeSlideIn>
              );
            })}
          </View>
        </View>
      )}

      <FadeSlideIn delay={500}>
        <PrimaryCTA label="Continue" onPress={onNext} disabled={!canContinue} s={s} theme={theme} />
      </FadeSlideIn>
    </ScrollView>
  );
}

// ── Screen 6: Fitness level ───────────────────────────────────────────────────

function S6Level({ fitnessLevel, setFitnessLevel, onNext, s, theme }: any) {
  return (
    <ScrollView contentContainerStyle={s.content}>
      <Text style={s.stepLabel}>05 / {TOTAL}</Text>
      <Text style={s.title}>How would you describe your fitness level?</Text>
      <Text style={s.subtitle}>Affects strength standards and AI coaching tone.</Text>
      <View style={s.list}>
        {FITNESS_LEVELS.map(({ label, sub }) => {
          const sel = fitnessLevel === label;
          return (
            <TouchableOpacity key={label} style={[s.row, sel && s.rowOn]} onPress={() => setFitnessLevel(label)} activeOpacity={0.8}>
              <View style={{ flex: 1 }}>
                <Text style={[s.rowText, sel && s.rowTextOn]}>{label}</Text>
                <Text style={[s.rowSub, sel && s.rowSubOn]}>{sub}</Text>
              </View>
              {sel && <Ionicons name="checkmark-circle" size={20} color={theme.accent} />}
            </TouchableOpacity>
          );
        })}
      </View>
      <TouchableOpacity style={[s.cta, !fitnessLevel && s.ctaDim]} onPress={onNext} activeOpacity={0.85}>
        <Text style={s.ctaText}>Continue</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ── Screen 7: Training frequency ──────────────────────────────────────────────

function S7Frequency({ weeklyDays, setWeeklyDays, onNext, s, theme }: any) {
  return (
    <ScrollView contentContainerStyle={s.content}>
      <Text style={s.stepLabel}>06 / {TOTAL}</Text>
      <Text style={s.title}>How many days per week do you train?</Text>
      <Text style={s.subtitle}>Used for deload detection and recovery recommendations.</Text>
      <View style={s.list}>
        {TRAINING_DAYS.map(({ label, sub }) => {
          const sel = weeklyDays === label;
          return (
            <TouchableOpacity key={label} style={[s.row, sel && s.rowOn]} onPress={() => setWeeklyDays(label)} activeOpacity={0.8}>
              <View style={{ flex: 1 }}>
                <Text style={[s.rowText, sel && s.rowTextOn]}>{label}</Text>
                <Text style={[s.rowSub, sel && s.rowSubOn]}>{sub}</Text>
              </View>
              {sel && <Ionicons name="checkmark-circle" size={20} color={theme.accent} />}
            </TouchableOpacity>
          );
        })}
      </View>
      <TouchableOpacity style={[s.cta, !weeklyDays && s.ctaDim]} onPress={onNext} activeOpacity={0.85}>
        <Text style={s.ctaText}>Continue</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ── Screen 8: Body stats (required) ──────────────────────────────────────────

function S8Body({
  bdDay, setBdDay, bdMonth, setBdMonth, bdYear, setBdYear,
  weightStr, setWeightStr, weightUnit, setWeightUnit,
  heightStr, setHeightStr, heightUnit, setHeightUnit, biologicalSex, setBiologicalSex,
  onNext, s, theme,
}: any) {
  const dayN = parseInt(bdDay), monthN = parseInt(bdMonth), yearN = parseInt(bdYear);
  const currentYear = new Date().getFullYear();
  const bdValid = dayN >= 1 && dayN <= 31 && monthN >= 1 && monthN <= 12
    && yearN >= 1900 && yearN <= currentYear - 13;
  const valid = bdValid && weightStr.trim() && heightStr.trim() && biologicalSex;
  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
          <Text style={s.stepLabel}>07 / {TOTAL}</Text>
          <Text style={s.title}>Tell us about your body.</Text>
          <Text style={s.subtitle}>Required for calorie calculations and strength standards.</Text>

          <Text style={s.label}>Date of Birth</Text>
          <View style={s.bdRow}>
            <TextInput
              style={[s.input, s.bdInput]}
              placeholder="DD" placeholderTextColor={theme.text.muted}
              keyboardType="number-pad" maxLength={2}
              value={bdDay} onChangeText={setBdDay} returnKeyType="next"
            />
            <TextInput
              style={[s.input, s.bdInput]}
              placeholder="MM" placeholderTextColor={theme.text.muted}
              keyboardType="number-pad" maxLength={2}
              value={bdMonth} onChangeText={setBdMonth} returnKeyType="next"
            />
            <TextInput
              style={[s.input, s.bdInputYear]}
              placeholder="YYYY" placeholderTextColor={theme.text.muted}
              keyboardType="number-pad" maxLength={4}
              value={bdYear} onChangeText={setBdYear} returnKeyType="next"
            />
          </View>

          <View style={s.unitRow}>
            <Text style={s.label}>Weight</Text>
            <View style={s.unitToggle}>
              {(['kg', 'lbs'] as const).map((u) => (
                <TouchableOpacity key={u} style={[s.unitBtn, weightUnit === u && s.unitBtnOn]} onPress={() => setWeightUnit(u)}>
                  <Text style={[s.unitBtnTxt, weightUnit === u && s.unitBtnTxtOn]}>{u}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <TextInput style={s.input} placeholder={weightUnit === 'kg' ? 'e.g. 80' : 'e.g. 176'}
            placeholderTextColor={theme.text.muted} keyboardType="decimal-pad"
            value={weightStr} onChangeText={setWeightStr} returnKeyType="next" />

          <View style={s.unitRow}>
            <Text style={s.label}>Height</Text>
            <View style={s.unitToggle}>
              {(['cm', 'ft'] as const).map((u) => (
                <TouchableOpacity key={u} style={[s.unitBtn, heightUnit === u && s.unitBtnOn]} onPress={() => setHeightUnit(u)}>
                  <Text style={[s.unitBtnTxt, heightUnit === u && s.unitBtnTxtOn]}>{u}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          {/* TODO BUG (audit 1.1): single "ft" input causes 5'11" to be stored as 5'1". Needs separate feet + inches inputs. */}
          <TextInput
            style={s.input}
            placeholder={heightUnit === 'cm' ? 'e.g. 180' : 'e.g. 5.11'}
            placeholderTextColor={theme.text.muted} keyboardType="decimal-pad"
            value={heightStr} onChangeText={setHeightStr}
            returnKeyType="done" onSubmitEditing={Keyboard.dismiss}
          />

          <Text style={s.label}>Biological Sex</Text>
          <View style={s.sexRow}>
            {['Male', 'Female', 'Prefer not to say'].map((opt) => (
              <TouchableOpacity key={opt} style={[s.sexBtn, biologicalSex === opt && s.sexBtnOn]} onPress={() => setBiologicalSex(opt)}>
                <Text style={[s.sexBtnTxt, biologicalSex === opt && s.sexBtnTxtOn]}>{opt}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={[s.cta, !valid && s.ctaDim]} onPress={onNext} disabled={!valid} activeOpacity={0.85}>
            <Text style={s.ctaText}>Continue</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </TouchableWithoutFeedback>
  );
}

// ── Screen 9: Calorie target (required) ───────────────────────────────────────

function S9Calories({ tdeeData, finalTarget, primaryGoal, fatLossRate, onNext, s, theme }: any) {
  const goalLabel = primaryGoal === 'Lose Fat' && fatLossRate ? fatLossRate : primaryGoal;
  return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Text style={s.stepLabel}>08 / {TOTAL}</Text>
        <Text style={s.title}>Your daily calorie target.</Text>
        <Text style={s.subtitle}>Calculated using the Mifflin St Jeor formula.</Text>

        <View style={s.calHero}>
          <Text style={s.calNum}>{finalTarget}</Text>
          <Text style={s.calUnit}>kcal / day</Text>
        </View>

        {tdeeData && (
          <View style={s.breakCard}>
            <BRow label="Base Metabolic Rate" value={`${tdeeData.bmr} kcal`} theme={theme} />
            <BRow label="Activity multiplier" value={`× ${tdeeData.multiplier.toFixed(3)}`} theme={theme} />
            {tdeeData.goalMult !== 1 && (
              <BRow
                label={`${goalLabel} adjustment`}
                value={`× ${tdeeData.goalMult.toFixed(2)} (${tdeeData.goalAdj > 0 ? '+' : ''}${tdeeData.goalAdj} kcal)`}
                color={tdeeData.goalAdj > 0 ? theme.status.success : theme.status.danger}
                theme={theme}
              />
            )}
          </View>
        )}

        <TouchableOpacity style={s.cta} onPress={onNext} activeOpacity={0.85}>
          <Text style={s.ctaText}>Use {finalTarget} kcal / day</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function BRow({ label, value, color, theme }: { label: string; value: string; color?: string; theme: ThemeColors }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 }}>
      <Text style={{ fontSize: 13, color: theme.text.muted }}>{label}</Text>
      <Text style={{ fontSize: 14, fontFamily: TY.sans.bold, color: color ?? theme.text.primary }}>{value}</Text>
    </View>
  );
}

// ── Screen 10: App connections ────────────────────────────────────────────────

function S10Connections({ s, theme, onNext }: any) {
  const user = useAuthStore((st) => st.user);
  const APPS = [
    { label: 'Strava', icon: 'walk-outline', connected: !!user?.strava_connected },
    { label: 'Hevy', icon: 'barbell-outline', connected: !!user?.hevy_connected },
    { label: 'Whoop', icon: 'pulse-outline', connected: !!user?.whoop_connected },
    { label: 'Oura Ring', icon: 'bed-outline', connected: !!user?.oura_connected },
  ];
  return (
    <ScrollView contentContainerStyle={s.content}>
      <Text style={s.stepLabel}>09 / {TOTAL}</Text>
      <Text style={s.title}>Connect your existing apps.</Text>
      <Text style={s.subtitle}>ORYX gets smarter with more data. Connect later from Profile.</Text>
      <View style={s.tileGrid}>
        {APPS.map(({ label, icon, connected }) => (
          <TouchableOpacity key={label}
            style={[s.tile, connected && s.tileOn]}
            onPress={() => Alert.alert('Connect later', `Connect ${label} from your Profile after setup.`)}
            activeOpacity={0.8}
          >
            <Ionicons name={icon as any} size={22} color={connected ? theme.accent : theme.text.secondary} />
            <Text style={[s.tileLabel, connected && s.tileLabelOn]}>{label}</Text>
            {connected && <Ionicons name="checkmark-circle" size={14} color={theme.status.success} style={{ position: 'absolute', top: 8, right: 8 }} />}
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity style={s.cta} onPress={onNext} activeOpacity={0.85}>
        <Text style={s.ctaText}>Continue</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ── Screen 11: Training time ──────────────────────────────────────────────────

function S11Time({ trainingTime, setTrainingTime, onNext, s, theme }: any) {
  return (
    <ScrollView contentContainerStyle={s.content}>
      <Text style={s.stepLabel}>10 / {TOTAL}</Text>
      <Text style={s.title}>When do you usually train?</Text>
      <Text style={s.subtitle}>Used for workout reminders and nutrition timing suggestions.</Text>
      <View style={s.list}>
        {TRAINING_TIMES.map(({ label, sub }) => {
          const sel = trainingTime === label;
          return (
            <TouchableOpacity key={label} style={[s.row, sel && s.rowOn]} onPress={() => setTrainingTime(label)} activeOpacity={0.8}>
              <View style={{ flex: 1 }}>
                <Text style={[s.rowText, sel && s.rowTextOn]}>{label}</Text>
                <Text style={[s.rowSub, sel && s.rowSubOn]}>{sub}</Text>
              </View>
              {sel && <Ionicons name="checkmark-circle" size={20} color={theme.accent} />}
            </TouchableOpacity>
          );
        })}
      </View>
      <TouchableOpacity style={[s.cta, !trainingTime && s.ctaDim]} onPress={onNext} activeOpacity={0.85}>
        <Text style={s.ctaText}>Continue</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ── Screen 12: All set ────────────────────────────────────────────────────────

function S12Done({ displayName, sportTags, primaryGoal, finalCalories, saving, error, onFinish, s, theme }: any) {
  const name = displayName.trim() || 'Athlete';
  const sport = sportTags.length > 0 ? sportTags.join(', ') : 'your training';
  return (
    <ScrollView contentContainerStyle={[s.content, { alignItems: 'center' }]}>
      <View style={s.doneIcon}>
        <Ionicons name="checkmark-circle" size={64} color={theme.accent} />
      </View>
      <Text style={s.doneTitle}>{name}, ORYX is ready.</Text>
      <Text style={s.doneSub}>
        We will track your {sport}, monitor your recovery, and tell you exactly why your body performs the way it does.
      </Text>

      <View style={s.summaryCard}>
        <SRow icon="trophy-outline" label="Goal" value={primaryGoal || 'Not set'} theme={theme} />
        <View style={s.summaryDiv} />
        <SRow icon="flame-outline" label="Calorie target" value={`${finalCalories} kcal / day`} theme={theme} />
        <View style={s.summaryDiv} />
        <SRow icon="link-outline" label="Integrations" value="Connect from Profile" theme={theme} />
      </View>

      {error && (
        <View style={[s.errorBox, { marginTop: 16 }]}>
          <Text style={s.errorText}>{error}</Text>
        </View>
      )}

      <TouchableOpacity
        style={[s.cta, { marginTop: 24, width: '100%' }, saving && s.ctaDim]}
        onPress={onFinish}
        disabled={saving}
        activeOpacity={0.85}
      >
        {saving
          ? <ActivityIndicator color={theme.accentInk} size="small" />
          : <Text style={s.ctaText}>Enter ORYX</Text>
        }
      </TouchableOpacity>
    </ScrollView>
  );
}

function SRow({ icon, label, value, theme }: { icon: string; label: string; value: string; theme: ThemeColors }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 }}>
      <Ionicons name={icon as any} size={18} color={theme.accent} />
      <Text style={{ fontSize: 13, color: theme.text.muted, width: 110 }}>{label}</Text>
      <Text style={{ fontSize: 14, fontFamily: TY.sans.semibold, color: theme.text.primary, flex: 1 }}>{value}</Text>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

function styles(t: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg.primary },

    progressRow: {
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: 16, paddingVertical: 12, gap: 12,
    },
    // Circular glass back button — sits at top-left on every step.
    backBtn: {
      width: 36, height: 36, borderRadius: 18,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: t.glass.card, borderWidth: 1, borderColor: t.glass.border,
    },
    backBtnPlaceholder: { width: 36, height: 36 },
    progressTrack: { flex: 1, height: 4, backgroundColor: t.glass.cardLo, borderRadius: 2, overflow: 'hidden' },
    progressFill: { height: '100%', backgroundColor: t.accent, borderRadius: 2 },
    skipBtn: { minWidth: 40, alignItems: 'flex-end' },
    skipText: { fontSize: 13, color: t.text.muted, fontFamily: TY.sans.medium },

    screenWrap: { flex: 1 },
    screen: { flex: 1 },
    content: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 48, flexGrow: 1 },

    // Welcome

    // Typography
    stepLabel: { fontSize: 12, color: t.text.muted, fontFamily: TY.sans.semibold, letterSpacing: 1, marginBottom: 16 },
    title: { fontSize: 26, fontFamily: TY.sans.bold, color: t.text.primary, marginBottom: 8, lineHeight: 34 },
    subtitle: { fontSize: 14, color: t.text.muted, lineHeight: 20, marginBottom: 24 },

    // Form — glass-tinted input surfaces with rim border. The translucent fill
    // reads as "premium" against the dark slate bg; on light mode it falls back
    // to solid white via the theme tokens.
    label: { fontSize: 13, color: t.text.secondary, fontFamily: TY.sans.semibold, marginBottom: 8, marginTop: 14 },
    input: {
      backgroundColor: t.glass.card, borderWidth: 1, borderColor: t.glass.border,
      borderRadius: R.md, paddingHorizontal: 16, paddingVertical: 14,
      fontSize: 16, color: t.text.primary,
    },
    usernameRow: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: t.glass.card, borderWidth: 1, borderColor: t.glass.border,
      borderRadius: R.md, paddingHorizontal: 16,
    },
    usernameAt: { fontSize: 16, color: t.text.secondary, marginRight: 4, fontFamily: TY.sans.medium },
    usernameInput: { flex: 1, paddingVertical: 14, fontSize: 16, color: t.text.primary },
    bigInput: {
      backgroundColor: t.glass.cardHi, borderWidth: 1, borderColor: t.glass.border, borderRadius: R.lg,
      paddingHorizontal: 20, paddingVertical: 18,
      fontSize: 22, fontFamily: TY.sans.bold, color: t.text.primary,
      marginBottom: 28, textAlign: 'center',
    },
    errorBox: {
      backgroundColor: t.status.dangerSoft, borderLeftWidth: 3, borderLeftColor: t.status.danger,
      borderRadius: R.sm, padding: 14, marginBottom: 16,
    },
    errorText: { color: t.status.danger, fontSize: 14, lineHeight: 20 },

    // Tiles (2-col chip grid). Glass pill when unselected; lime fill with dark
    // ink when selected — the standard chip pattern across the app.
    tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
    tile: {
      width: (SW - 48 - 12) / 2 - 6,
      backgroundColor: t.glass.pill, borderWidth: 1, borderColor: t.glass.border,
      borderRadius: R.md, padding: 16, alignItems: 'center', gap: 8,
    },
    tileOn: { borderColor: t.accent, backgroundColor: t.accent },
    tileLabel: { fontSize: 13, fontFamily: TY.sans.semibold, color: t.text.body, textAlign: 'center' },
    tileLabelOn: { color: t.accentInk },

    // Stacked option cards. Glass surface; selected card lifts to cardHi + lime
    // accent border. Siblings dim to 60% opacity when one is picked (applied
    // inline at the call site).
    list: { gap: 10, marginBottom: 24 },
    row: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: t.glass.card, borderWidth: 1, borderColor: t.glass.border,
      borderRadius: R.md, padding: 16,
    },
    rowOn: { borderColor: t.accent, backgroundColor: t.glass.cardHi },
    rowText: { fontSize: 15, fontFamily: TY.sans.semibold, color: t.text.primary },
    rowTextOn: { color: t.text.primary },
    rowSub: { fontSize: 12, color: t.text.muted, marginTop: 2 },
    rowSubOn: { color: t.text.secondary },
    rowDim: { opacity: 0.6 },

    // CTA
    cta: { backgroundColor: t.accent, borderRadius: R.sm, paddingVertical: SP[4], alignItems: 'center' },
    ctaDim: { opacity: 0.35 },
    ctaText: { fontSize: TY.size.body + 2, fontFamily: TY.sans.bold, color: t.accentInk, letterSpacing: TY.tracking.tight },

    // Birthday inputs
    bdRow: { flexDirection: 'row', gap: 10, marginBottom: 4 },
    bdInput: { flex: 1, textAlign: 'center' },
    bdInputYear: { flex: 1.6, textAlign: 'center' },

    // Body stats helpers
    unitRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    unitToggle: { flexDirection: 'row', gap: 6 },
    unitBtn: {
      paddingHorizontal: 12, paddingVertical: 5, borderRadius: R.xs,
      backgroundColor: t.bg.elevated, borderWidth: 1, borderColor: t.border,
    },
    unitBtnOn: { backgroundColor: t.text.primary, borderColor: t.text.primary },
    unitBtnTxt: { fontSize: 12, fontFamily: TY.sans.semibold, color: t.text.muted },
    unitBtnTxtOn: { color: t.bg.primary },
    sexRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
    sexBtn: {
      flex: 1, paddingVertical: 12, borderRadius: R.sm,
      backgroundColor: t.bg.elevated, borderWidth: 1, borderColor: t.border, alignItems: 'center',
    },
    sexBtnOn: { backgroundColor: t.text.primary, borderColor: t.text.primary },
    sexBtnTxt: { fontSize: 13, fontFamily: TY.sans.semibold, color: t.text.secondary },
    sexBtnTxtOn: { color: t.bg.primary },

    // Calorie screen
    calHero: { alignItems: 'center', marginBottom: 20 },
    calNum: { fontSize: 64, fontFamily: TY.sans.bold, color: t.text.primary, lineHeight: 72 },
    calUnit: { fontSize: 16, color: t.text.muted, marginTop: 4 },
    breakCard: {
      backgroundColor: t.bg.elevated, borderRadius: R.sm, padding: 16,
      borderWidth: 1, borderColor: t.border, marginBottom: 16,
    },
    // Done screen
    doneIcon: { marginTop: 16, marginBottom: 16, alignItems: 'center' },
    doneTitle: { fontSize: 26, fontFamily: TY.sans.bold, color: t.text.primary, textAlign: 'center', marginBottom: 12 },
    doneSub: { fontSize: 15, color: t.text.muted, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
    summaryCard: {
      backgroundColor: t.bg.elevated, borderRadius: R.md, borderWidth: 1, borderColor: t.border,
      width: '100%', paddingHorizontal: 16,
    },
    summaryDiv: { height: 1, backgroundColor: t.border },
  });
}
