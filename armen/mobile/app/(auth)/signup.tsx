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

import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
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
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { ThemeColors, type as TY, radius as R, space as SP } from '@/services/theme';
import { signupComplete, checkUsername, getMe } from '@/services/api';
import { useAuthStore } from '@/services/authStore';

const { width: SW } = Dimensions.get('window');
const TOTAL = 12;

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
const GOAL_ADJ: Record<string, number> = {
  'Build Muscle': 200,
  'Improve Endurance': 100, 'Enhance Recovery': 0,
  'Compete in a Sport': 150, 'General Fitness': 0,
};

const FAT_LOSS_RATES = [
  { label: 'Light cut',      sub: 'lose ~0.2 kg / week',  adj: -200 },
  { label: 'Moderate cut',   sub: 'lose ~0.5 kg / week',  adj: -400 },
  { label: 'Aggressive cut', sub: 'lose ~0.7 kg / week',  adj: -600 },
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

function calcTDEE(wKg: number, hCm: number, age: number, sex: string, days: string, goalAdj: number) {
  const bonus = sex === 'Male' ? 5 : sex === 'Female' ? -161 : -78;
  const bmr = Math.round(10 * wKg + 6.25 * hCm - 5 * age + bonus);
  const mult = ACTIVITY_MULT[days] ?? 1.55;
  return { bmr, tdee: Math.round(bmr * mult + goalAdj), multiplier: mult, goalAdj };
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
  const [useCustomCal, setUseCustomCal] = useState(false);
  const [customCalStr, setCustomCalStr] = useState('');
  const [trainingTime, setTrainingTime] = useState('');

  // — Step 12
  const [saving, setSaving] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);

  // — Animation
  const slideAnim = useRef(new Animated.Value(0)).current;

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
  const effectiveGoalAdj = primaryGoal === 'Lose Fat'
    ? (FAT_LOSS_RATES.find(r => r.label === fatLossRate)?.adj ?? -400)
    : (GOAL_ADJ[primaryGoal] ?? 0);
  const tdeeData = (weightKg > 0 && heightCm > 0 && age > 0 && biologicalSex && weeklyDays && primaryGoal)
    ? calcTDEE(weightKg, heightCm, age, biologicalSex, weeklyDays, effectiveGoalAdj)
    : null;
  const finalCalories = useCustomCal
    ? (parseInt(customCalStr) || tdeeData?.tdee || 2000)
    : (tdeeData?.tdee || 2000);

  // ── Navigation ────────────────────────────────────────────────────────────────
  const navigate = (next: number) => {
    Animated.timing(slideAnim, {
      toValue: next > step ? -SW : SW, duration: 220, useNativeDriver: true,
    }).start(() => {
      setStep(next);
      slideAnim.setValue(next > step ? SW : -SW);
      Animated.timing(slideAnim, { toValue: 0, duration: 220, useNativeDriver: true }).start();
    });
  };

  const goNext = () => navigate(step + 1);
  const goBack = () => navigate(step - 1);
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
    if (username && !USERNAME_RE.test(username)) return 'Username must be 3–20 characters: letters, numbers, underscores.';
    if (username && usernameStatus === 'taken') return 'That username is already taken.';
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
      const tokenResp = await signupComplete({
        email: email.trim().toLowerCase(),
        password,
        username: username.trim() || undefined,
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
        daily_calorie_target: finalCalories,
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
  const showProgress = step > 1;
  const showBack = step > 1;
  const canSkip = step > 2 && step !== 8 && step !== 9 && step !== 12;
  const progress = step / TOTAL;

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      {/* Progress bar row */}
      {showProgress && (
        <View style={s.progressRow}>
          {showBack ? (
            <TouchableOpacity onPress={goBack} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="chevron-back" size={22} color={theme.text.primary} />
            </TouchableOpacity>
          ) : <View style={s.backBtn} />}
          <View style={s.progressTrack}>
            <View style={[s.progressFill, { width: `${Math.round(progress * 100)}%` as any }]} />
          </View>
          {canSkip ? (
            <TouchableOpacity onPress={skip} style={s.skipBtn}>
              <Text style={s.skipText}>Skip</Text>
            </TouchableOpacity>
          ) : <View style={s.skipBtn} />}
        </View>
      )}

      <Animated.View style={[s.screenWrap, { transform: [{ translateX: slideAnim }] }]}>
        {step === 1 && <S1Welcome onCreateAccount={goNext} s={s} theme={theme} />}
        {step === 2 && (
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
        {step === 3 && <S3Name displayName={displayName} setDisplayName={setDisplayName} onNext={goNext} s={s} theme={theme} />}
        {step === 4 && <S4Sports sportTags={sportTags} setSportTags={setSportTags} onNext={goNext} s={s} theme={theme} />}
        {step === 5 && (
          <S5Goal
            primaryGoal={primaryGoal} setPrimaryGoal={setPrimaryGoal}
            fatLossRate={fatLossRate} setFatLossRate={setFatLossRate}
            onNext={goNext} s={s} theme={theme}
          />
        )}
        {step === 6 && <S6Level fitnessLevel={fitnessLevel} setFitnessLevel={setFitnessLevel} onNext={goNext} s={s} theme={theme} />}
        {step === 7 && <S7Frequency weeklyDays={weeklyDays} setWeeklyDays={setWeeklyDays} onNext={goNext} s={s} theme={theme} />}
        {step === 8 && (
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
        {step === 9 && (
          <S9Calories
            tdeeData={tdeeData} useCustom={useCustomCal} setUseCustom={setUseCustomCal}
            customStr={customCalStr} setCustomStr={setCustomCalStr}
            finalTarget={finalCalories} primaryGoal={primaryGoal} fatLossRate={fatLossRate}
            onNext={goNext} s={s} theme={theme}
          />
        )}
        {step === 10 && <S10Connections s={s} theme={theme} onNext={goNext} />}
        {step === 11 && <S11Time trainingTime={trainingTime} setTrainingTime={setTrainingTime} onNext={goNext} s={s} theme={theme} />}
        {step === 12 && (
          <S12Done
            displayName={displayName} sportTags={sportTags} primaryGoal={primaryGoal}
            finalCalories={finalCalories} saving={saving} error={finishError}
            onFinish={handleFinish} s={s} theme={theme}
          />
        )}
      </Animated.View>
    </SafeAreaView>
  );
}

// ── Screen 1: Welcome ─────────────────────────────────────────────────────────

function S1Welcome({ onCreateAccount, s, theme }: any) {
  return (
    <View style={[s.screen, { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }]}>
      <Text style={s.wordmark}>ORYX</Text>
      <Text style={s.tagline}>Know your body.</Text>
      <TouchableOpacity style={[s.cta, { width: '100%', marginTop: 56 }]} onPress={onCreateAccount} activeOpacity={0.85}>
        <Text style={s.ctaText}>Create Account</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={s.loginLinkBtn}
        onPress={() => router.push('/(auth)/login')}
        activeOpacity={0.75}
      >
        <Text style={s.loginLinkText}>Already have an account? <Text style={{ color: theme.text.primary, fontFamily: TY.sans.bold }}>Log In</Text></Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Screen 2: Account details ─────────────────────────────────────────────────

function S2Account({
  fullName, setFullName, username, onUsernameChange, usernameStatus,
  email, setEmail, password, setPassword, confirmPassword, setConfirmPassword,
  error, onContinue, s, theme,
}: any) {
  const statusIcon = usernameStatus === 'checking' ? null
    : usernameStatus === 'available' ? <Ionicons name="checkmark-circle" size={18} color={theme.status.success} />
    : usernameStatus === 'taken' ? <Ionicons name="close-circle" size={18} color={theme.status.danger} />
    : null;

  return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Text style={s.stepLabel}>02 / {TOTAL}</Text>
        <Text style={s.title}>Create your account.</Text>

        {error && (
          <View style={s.errorBox}>
            <Text style={s.errorText}>{error}</Text>
          </View>
        )}

        <Text style={s.label}>Full Name</Text>
        <TextInput
          style={s.input} value={fullName} onChangeText={setFullName}
          placeholder="Your full name" placeholderTextColor={theme.text.muted}
          autoCapitalize="words" returnKeyType="next"
        />

        <Text style={s.label}>Username <Text style={s.labelOpt}>(optional)</Text></Text>
        <View style={s.usernameRow}>
          <Text style={s.usernameAt}>@</Text>
          <TextInput
            style={s.usernameInput} value={username} onChangeText={onUsernameChange}
            placeholder="yourhandle" placeholderTextColor={theme.text.muted}
            autoCapitalize="none" autoCorrect={false} returnKeyType="next"
          />
          <View style={{ width: 24, alignItems: 'center' }}>
            {usernameStatus === 'checking'
              ? <ActivityIndicator size="small" color={theme.text.muted} />
              : statusIcon}
          </View>
        </View>

        <Text style={s.label}>Email</Text>
        <TextInput
          style={s.input} value={email} onChangeText={setEmail}
          placeholder="you@example.com" placeholderTextColor={theme.text.muted}
          keyboardType="email-address" autoCapitalize="none" autoCorrect={false}
          autoComplete="email" returnKeyType="next"
        />

        <Text style={s.label}>Password</Text>
        <TextInput
          style={s.input} value={password} onChangeText={setPassword}
          placeholder="8+ chars, with a letter and a number" placeholderTextColor={theme.text.muted}
          secureTextEntry autoComplete="new-password" returnKeyType="next"
        />

        <Text style={s.label}>Confirm Password</Text>
        <TextInput
          style={s.input} value={confirmPassword} onChangeText={setConfirmPassword}
          placeholder="Re-enter your password" placeholderTextColor={theme.text.muted}
          secureTextEntry autoComplete="new-password" returnKeyType="done"
          onSubmitEditing={onContinue}
        />

        <TouchableOpacity style={s.cta} onPress={onContinue} activeOpacity={0.85}>
          <Text style={s.ctaText}>Continue</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Screen 3: Display name ────────────────────────────────────────────────────

function S3Name({ displayName, setDisplayName, onNext, s, theme }: any) {
  return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Text style={s.stepLabel}>03 / {TOTAL}</Text>
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
      <Text style={s.stepLabel}>04 / {TOTAL}</Text>
      <Text style={s.title}>What is your main sport or activity?</Text>
      <Text style={s.subtitle}>Select all that apply.</Text>
      <View style={s.tileGrid}>
        {SPORTS.map(({ label, icon }) => {
          const sel = sportTags.includes(label);
          return (
            <TouchableOpacity key={label} style={[s.tile, sel && s.tileOn]} onPress={() => toggle(label)} activeOpacity={0.8}>
              <Ionicons name={icon as any} size={22} color={sel ? theme.accent : theme.text.secondary} />
              <Text style={[s.tileLabel, sel && s.tileLabelOn]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <TouchableOpacity style={s.cta} onPress={onNext} activeOpacity={0.85}>
        <Text style={s.ctaText}>{sportTags.length > 0 ? 'Continue' : 'Skip for now'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ── Screen 5: Goal ────────────────────────────────────────────────────────────

function S5Goal({ primaryGoal, setPrimaryGoal, fatLossRate, setFatLossRate, onNext, s, theme }: any) {
  const needsCutRate = primaryGoal === 'Lose Fat';
  const canContinue = primaryGoal && (!needsCutRate || fatLossRate);
  return (
    <ScrollView contentContainerStyle={s.content}>
      <Text style={s.stepLabel}>05 / {TOTAL}</Text>
      <Text style={s.title}>What is your main goal?</Text>
      <Text style={s.subtitle}>ORYX frames all recommendations around this.</Text>
      <View style={s.list}>
        {GOALS.map(({ label, icon }) => {
          const sel = primaryGoal === label;
          return (
            <TouchableOpacity
              key={label}
              style={[s.row, sel && s.rowOn]}
              onPress={() => { setPrimaryGoal(label); if (label !== 'Lose Fat') setFatLossRate(''); }}
              activeOpacity={0.8}
            >
              <Ionicons name={icon as any} size={20} color={sel ? theme.accent : theme.text.secondary} style={{ marginRight: 12 }} />
              <Text style={[s.rowText, sel && s.rowTextOn]}>{label}</Text>
              {sel && <Ionicons name="checkmark-circle" size={20} color={theme.accent} style={{ marginLeft: 'auto' as any }} />}
            </TouchableOpacity>
          );
        })}
      </View>

      {needsCutRate && (
        <View style={{ marginBottom: 24 }}>
          <Text style={[s.label, { marginTop: 4 }]}>How aggressively do you want to cut?</Text>
          <View style={[s.list, { marginTop: 10, marginBottom: 0 }]}>
            {FAT_LOSS_RATES.map(({ label, sub, adj }) => {
              const sel = fatLossRate === label;
              return (
                <TouchableOpacity key={label} style={[s.row, sel && s.rowOn]} onPress={() => setFatLossRate(label)} activeOpacity={0.8}>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.rowText, sel && s.rowTextOn]}>{label}</Text>
                    <Text style={[s.rowSub, sel && s.rowSubOn]}>
                      {sub}  ·  {adj} kcal/day
                    </Text>
                  </View>
                  {sel && <Ionicons name="checkmark-circle" size={20} color={theme.accent} />}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      <TouchableOpacity style={[s.cta, !canContinue && s.ctaDim]} onPress={onNext} disabled={!canContinue} activeOpacity={0.85}>
        <Text style={s.ctaText}>Continue</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ── Screen 6: Fitness level ───────────────────────────────────────────────────

function S6Level({ fitnessLevel, setFitnessLevel, onNext, s, theme }: any) {
  return (
    <ScrollView contentContainerStyle={s.content}>
      <Text style={s.stepLabel}>06 / {TOTAL}</Text>
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
      <Text style={s.stepLabel}>07 / {TOTAL}</Text>
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
          <Text style={s.stepLabel}>08 / {TOTAL}</Text>
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

function S9Calories({ tdeeData, useCustom, setUseCustom, customStr, setCustomStr, finalTarget, primaryGoal, fatLossRate, onNext, s, theme }: any) {
  const goalLabel = primaryGoal === 'Lose Fat' && fatLossRate ? fatLossRate : primaryGoal;
  return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Text style={s.stepLabel}>09 / {TOTAL}</Text>
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
            {tdeeData.goalAdj !== 0 && (
              <BRow
                label={`${goalLabel} adjustment`}
                value={`${tdeeData.goalAdj > 0 ? '+' : ''}${tdeeData.goalAdj} kcal`}
                color={tdeeData.goalAdj > 0 ? theme.status.success : theme.status.danger}
                theme={theme}
              />
            )}
          </View>
        )}

        <TouchableOpacity style={s.customToggle} onPress={() => setUseCustom((v: boolean) => !v)} activeOpacity={0.75}>
          <Ionicons name={useCustom ? 'close-circle-outline' : 'pencil-outline'} size={16} color={theme.text.muted} />
          <Text style={s.customToggleTxt}>{useCustom ? 'Use calculated target' : 'Set a custom target'}</Text>
        </TouchableOpacity>

        {useCustom && (
          <TextInput style={s.input} placeholder="e.g. 2400" placeholderTextColor={theme.text.muted}
            keyboardType="number-pad" value={customStr} onChangeText={setCustomStr} autoFocus />
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
      <Text style={s.stepLabel}>10 / {TOTAL}</Text>
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
      <Text style={s.stepLabel}>11 / {TOTAL}</Text>
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
      paddingHorizontal: 16, paddingVertical: 12, gap: 10,
    },
    backBtn: { width: 32, alignItems: 'center' },
    progressTrack: { flex: 1, height: 4, backgroundColor: t.border, borderRadius: 2, overflow: 'hidden' },
    progressFill: { height: '100%', backgroundColor: t.accent, borderRadius: 2 },
    skipBtn: { width: 40, alignItems: 'flex-end' },
    skipText: { fontSize: 13, color: t.text.muted, fontFamily: TY.sans.medium },

    screenWrap: { flex: 1 },
    screen: { flex: 1 },
    content: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 48, flexGrow: 1 },

    // Welcome
    wordmark: { fontSize: 38, fontFamily: TY.sans.bold, color: t.text.primary, letterSpacing: 6 },
    tagline: { fontSize: 15, color: t.text.muted, marginTop: 10, letterSpacing: 0.5 },
    loginLinkBtn: { marginTop: 20 },
    loginLinkText: { fontSize: 14, color: t.text.muted, textAlign: 'center' },

    // Typography
    stepLabel: { fontSize: 12, color: t.text.muted, fontFamily: TY.sans.semibold, letterSpacing: 1, marginBottom: 16 },
    title: { fontSize: 26, fontFamily: TY.sans.bold, color: t.text.primary, marginBottom: 8, lineHeight: 34 },
    subtitle: { fontSize: 14, color: t.text.muted, lineHeight: 20, marginBottom: 24 },

    // Form
    label: { fontSize: 13, color: t.text.secondary, fontFamily: TY.sans.semibold, marginBottom: 8, marginTop: 14 },
    labelOpt: { fontFamily: TY.sans.regular, color: t.text.muted },
    input: {
      backgroundColor: t.bg.elevated, borderWidth: 1, borderColor: t.border,
      borderRadius: R.sm, paddingHorizontal: 16, paddingVertical: 14,
      fontSize: 16, color: t.text.primary,
    },
    usernameRow: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: t.bg.elevated, borderWidth: 1, borderColor: t.border,
      borderRadius: R.sm, paddingHorizontal: 16,
    },
    usernameAt: { fontSize: 16, color: t.text.secondary, marginRight: 4 },
    usernameInput: { flex: 1, paddingVertical: 14, fontSize: 16, color: t.text.primary },
    bigInput: {
      backgroundColor: t.bg.elevated, borderWidth: 1, borderColor: t.border, borderRadius: R.md,
      paddingHorizontal: 20, paddingVertical: 18,
      fontSize: 22, fontFamily: TY.sans.bold, color: t.text.primary,
      marginBottom: 28, textAlign: 'center',
    },
    errorBox: {
      backgroundColor: 'rgba(192,57,43,0.12)', borderLeftWidth: 3, borderLeftColor: t.status.danger,
      borderRadius: R.sm, padding: 14, marginBottom: 16,
    },
    errorText: { color: t.status.danger, fontSize: 14, lineHeight: 20 },

    // Tiles (2-col grid)
    tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
    tile: {
      width: (SW - 48 - 12) / 2 - 6,
      backgroundColor: t.bg.elevated, borderWidth: 1, borderColor: t.border,
      borderRadius: R.md, padding: 16, alignItems: 'center', gap: 8,
    },
    tileOn: { borderColor: t.accent, backgroundColor: t.bg.tint },
    tileLabel: { fontSize: 13, fontFamily: TY.sans.semibold, color: t.text.secondary, textAlign: 'center' },
    tileLabelOn: { color: t.accent },

    // List options
    list: { gap: 10, marginBottom: 24 },
    row: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: t.bg.elevated, borderWidth: 1, borderColor: t.border,
      borderRadius: R.sm, padding: 16,
    },
    rowOn: { borderColor: t.accent, backgroundColor: t.bg.tint },
    rowText: { fontSize: 15, fontFamily: TY.sans.semibold, color: t.text.primary },
    rowTextOn: { color: t.accent },
    rowSub: { fontSize: 12, color: t.text.muted, marginTop: 2 },
    rowSubOn: { color: t.text.secondary },

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
    customToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
    customToggleTxt: { fontSize: 13, color: t.text.muted },

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
