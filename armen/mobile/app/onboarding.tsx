/**
 * ORYX Onboarding — 10-screen flow.
 * Runs once after signup; never shown again once onboarding_complete = true.
 */

import { useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { ThemeColors } from '@/services/theme';
import { patchOnboarding, getMe } from '@/services/api';
import { useAuthStore } from '@/services/authStore';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const TOTAL_STEPS = 10;

// ── Sport options ─────────────────────────────────────────────────────────────
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

// Activity multipliers for TDEE (Mifflin St Jeor)
const ACTIVITY_MULTIPLIERS: Record<string, number> = {
  '1 to 2 days': 1.375,
  '3 to 4 days': 1.55,
  '5 to 6 days': 1.725,
  'Every day': 1.9,
};

const GOAL_ADJUSTMENTS: Record<string, number> = {
  'Build Muscle': 200,
  'Lose Fat': -300,
  'Improve Endurance': 100,
  'Enhance Recovery': 0,
  'Compete in a Sport': 150,
  'General Fitness': 0,
};

function calcTDEE(
  weightKg: number,
  heightCm: number,
  age: number,
  sex: string,
  trainingDays: string,
  goal: string,
): { bmr: number; tdee: number; multiplier: number; goalAdj: number } {
  const sexBonus = sex === 'Male' ? 5 : sex === 'Female' ? -161 : -78;
  const bmr = Math.round(10 * weightKg + 6.25 * heightCm - 5 * age + sexBonus);
  const multiplier = ACTIVITY_MULTIPLIERS[trainingDays] ?? 1.55;
  const goalAdj = GOAL_ADJUSTMENTS[goal] ?? 0;
  const tdee = Math.round(bmr * multiplier + goalAdj);
  return { bmr, tdee, multiplier, goalAdj };
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function OnboardingScreen() {
  const { theme } = useTheme();
  const s = createStyles(theme);
  const setAuth = useAuthStore((s) => s.setAuth);
  const authToken = useAuthStore((s) => s.token);

  const [step, setStep] = useState(1);

  // Form data accumulated across screens
  const [displayName, setDisplayName] = useState('');
  const [sportTags, setSportTags] = useState<string[]>([]);
  const [primaryGoal, setPrimaryGoal] = useState('');
  const [fitnessLevel, setFitnessLevel] = useState('');
  const [weeklyDays, setWeeklyDays] = useState('');

  // Body stats
  const [ageStr, setAgeStr] = useState('');
  const [weightStr, setWeightStr] = useState('');
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lbs'>('kg');
  const [heightStr, setHeightStr] = useState('');
  const [heightUnit, setHeightUnit] = useState<'cm' | 'ft'>('cm');
  const [biologicalSex, setBiologicalSex] = useState('');

  // Calorie target
  const [useCustomCalories, setUseCustomCalories] = useState(false);
  const [customCaloriesStr, setCustomCaloriesStr] = useState('');

  // Training time
  const [trainingTime, setTrainingTime] = useState('');

  // Slide animation
  const slideAnim = useRef(new Animated.Value(0)).current;

  const navigate = (nextStep: number) => {
    Animated.timing(slideAnim, {
      toValue: nextStep > step ? -SCREEN_WIDTH : SCREEN_WIDTH,
      duration: 220,
      useNativeDriver: true,
    }).start(() => {
      setStep(nextStep);
      slideAnim.setValue(nextStep > step ? SCREEN_WIDTH : -SCREEN_WIDTH);
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }).start();
    });
  };

  const saveProgress = (extraFields: Record<string, unknown> = {}) => {
    patchOnboarding({ current_onboarding_step: step, ...extraFields } as any).catch(() => {});
  };

  const goNext = (fields: Record<string, unknown> = {}) => {
    saveProgress(fields);
    navigate(step + 1);
  };

  const goBack = () => navigate(step - 1);

  const skip = () => {
    saveProgress();
    navigate(step + 1);
  };

  // ── Derived calorie target ─────────────────────────────────────────────────
  const weightKg = weightUnit === 'kg'
    ? parseFloat(weightStr) || 0
    : (parseFloat(weightStr) || 0) * 0.453592;

  const heightCm = heightUnit === 'cm'
    ? parseFloat(heightStr) || 0
    : (parseFloat(heightStr) || 0) * 30.48;

  const age = parseInt(ageStr) || 0;

  const tdeeData = (weightKg > 0 && heightCm > 0 && age > 0 && biologicalSex && weeklyDays && primaryGoal)
    ? calcTDEE(weightKg, heightCm, age, biologicalSex, weeklyDays, primaryGoal)
    : null;

  const finalCalorieTarget = useCustomCalories
    ? (parseInt(customCaloriesStr) || tdeeData?.tdee || 2000)
    : (tdeeData?.tdee || 2000);

  // ── Complete onboarding ────────────────────────────────────────────────────
  const handleFinish = () => {
    // Immediately mark complete in local store so the user gets into the app
    // regardless of backend connectivity. Backend sync happens in background.
    const currentUser = useAuthStore.getState().user;
    if (authToken && currentUser) {
      setAuth(authToken, {
        ...currentUser,
        onboarding_complete: true,
        display_name: displayName.trim() || currentUser.display_name,
        daily_calorie_target: finalCalorieTarget,
      });
    }
    router.replace('/(tabs)/');

    // Sync to backend in background
    const payload = {
      display_name: displayName.trim() || undefined,
      sport_tags: sportTags.length > 0 ? sportTags : undefined,
      primary_goal: primaryGoal || undefined,
      fitness_level: fitnessLevel || undefined,
      weekly_training_days: weeklyDays || undefined,
      age: age > 0 ? age : undefined,
      weight_kg: weightKg > 0 ? Math.round(weightKg * 10) / 10 : undefined,
      height_cm: heightCm > 0 ? Math.round(heightCm * 10) / 10 : undefined,
      biological_sex: biologicalSex || undefined,
      daily_calorie_target: finalCalorieTarget,
      preferred_training_time: trainingTime || undefined,
      onboarding_complete: true,
      current_onboarding_step: 10,
    };
    patchOnboarding(payload)
      .then(() => getMe())
      .then((updatedUser) => { if (authToken) setAuth(authToken, updatedUser); })
      .catch(() => {});
  };

  const canSkip = step !== 6 && step !== 7;
  const progress = step / TOTAL_STEPS;

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      {/* ── Progress bar ── */}
      <View style={s.progressContainer}>
        {step > 1 && (
          <TouchableOpacity onPress={goBack} style={s.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="chevron-back" size={22} color={theme.text.primary} />
          </TouchableOpacity>
        )}
        <View style={s.progressBarTrack}>
          <View style={[s.progressBarFill, { width: `${Math.round(progress * 100)}%` as any }]} />
        </View>
        {canSkip ? (
          <TouchableOpacity onPress={skip} style={s.skipBtn}>
            <Text style={s.skipText}>Skip</Text>
          </TouchableOpacity>
        ) : (
          <View style={s.skipBtn} />
        )}
      </View>

      <Animated.View style={[s.screenContainer, { transform: [{ translateX: slideAnim }] }]}>
        {step === 1 && <Screen1Name displayName={displayName} setDisplayName={setDisplayName} onNext={() => goNext({ display_name: displayName.trim() || undefined })} s={s} theme={theme} />}
        {step === 2 && <Screen2Sports sportTags={sportTags} setSportTags={setSportTags} onNext={() => goNext({ sport_tags: sportTags.length > 0 ? sportTags : undefined })} s={s} theme={theme} />}
        {step === 3 && <Screen3Goal primaryGoal={primaryGoal} setPrimaryGoal={setPrimaryGoal} onNext={() => goNext({ primary_goal: primaryGoal || undefined })} s={s} theme={theme} />}
        {step === 4 && <Screen4Level fitnessLevel={fitnessLevel} setFitnessLevel={setFitnessLevel} onNext={() => goNext({ fitness_level: fitnessLevel || undefined })} s={s} theme={theme} />}
        {step === 5 && <Screen5Frequency weeklyDays={weeklyDays} setWeeklyDays={setWeeklyDays} onNext={() => goNext({ weekly_training_days: weeklyDays || undefined })} s={s} theme={theme} />}
        {step === 6 && <Screen6BodyStats ageStr={ageStr} setAgeStr={setAgeStr} weightStr={weightStr} setWeightStr={setWeightStr} weightUnit={weightUnit} setWeightUnit={setWeightUnit} heightStr={heightStr} setHeightStr={setHeightStr} heightUnit={heightUnit} setHeightUnit={setHeightUnit} biologicalSex={biologicalSex} setBiologicalSex={setBiologicalSex} onNext={() => goNext({ age: age > 0 ? age : undefined, weight_kg: weightKg > 0 ? Math.round(weightKg * 10) / 10 : undefined, height_cm: heightCm > 0 ? Math.round(heightCm * 10) / 10 : undefined, biological_sex: biologicalSex || undefined })} s={s} theme={theme} />}
        {step === 7 && <Screen7Calories tdeeData={tdeeData} useCustom={useCustomCalories} setUseCustom={setUseCustomCalories} customStr={customCaloriesStr} setCustomStr={setCustomCaloriesStr} finalTarget={finalCalorieTarget} primaryGoal={primaryGoal} onNext={() => goNext({ daily_calorie_target: finalCalorieTarget })} s={s} theme={theme} />}
        {step === 8 && <Screen8Connections s={s} theme={theme} onNext={() => goNext()} />}
        {step === 9 && <Screen9Time trainingTime={trainingTime} setTrainingTime={setTrainingTime} onNext={() => goNext({ preferred_training_time: trainingTime || undefined })} s={s} theme={theme} />}
        {step === 10 && <Screen10Done displayName={displayName} sportTags={sportTags} primaryGoal={primaryGoal} finalCalorieTarget={finalCalorieTarget} onFinish={handleFinish} s={s} theme={theme} />}
      </Animated.View>
    </SafeAreaView>
  );
}

// ── Screen 1: Name ─────────────────────────────────────────────────────────────

function Screen1Name({ displayName, setDisplayName, onNext, s, theme }: any) {
  return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.screenContent} keyboardShouldPersistTaps="handled">
        <Text style={s.stepLabel}>01 / 10</Text>
        <Text style={s.screenTitle}>What should we call you?</Text>
        <Text style={s.screenSubtitle}>Your first name personalises all AI insights in ORYX.</Text>
        <TextInput
          style={s.bigInput}
          placeholder="First name"
          placeholderTextColor={theme.text.muted}
          value={displayName}
          onChangeText={setDisplayName}
          autoFocus
          autoCapitalize="words"
          returnKeyType="done"
          onSubmitEditing={onNext}
        />
        <TouchableOpacity style={[s.cta, !displayName.trim() && s.ctaDim]} onPress={onNext} activeOpacity={0.85}>
          <Text style={s.ctaText}>Continue</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Screen 2: Sports ──────────────────────────────────────────────────────────

function Screen2Sports({ sportTags, setSportTags, onNext, s, theme }: any) {
  const toggle = (label: string) => {
    setSportTags((prev: string[]) =>
      prev.includes(label) ? prev.filter((x: string) => x !== label) : [...prev, label]
    );
  };
  return (
    <ScrollView contentContainerStyle={s.screenContent}>
      <Text style={s.stepLabel}>02 / 10</Text>
      <Text style={s.screenTitle}>What is your main sport or activity?</Text>
      <Text style={s.screenSubtitle}>Select all that apply.</Text>
      <View style={s.tileGrid}>
        {SPORTS.map(({ label, icon }) => {
          const selected = sportTags.includes(label);
          return (
            <TouchableOpacity
              key={label}
              style={[s.tile, selected && s.tileSelected]}
              onPress={() => toggle(label)}
              activeOpacity={0.8}
            >
              <Ionicons name={icon as any} size={22} color={selected ? '#fff' : theme.text.secondary} />
              <Text style={[s.tileLabel, selected && s.tileLabelSelected]}>{label}</Text>
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

// ── Screen 3: Goal ────────────────────────────────────────────────────────────

function Screen3Goal({ primaryGoal, setPrimaryGoal, onNext, s, theme }: any) {
  return (
    <ScrollView contentContainerStyle={s.screenContent}>
      <Text style={s.stepLabel}>03 / 10</Text>
      <Text style={s.screenTitle}>What is your main goal?</Text>
      <Text style={s.screenSubtitle}>ORYX frames all recommendations around this.</Text>
      <View style={s.listOptions}>
        {GOALS.map(({ label, icon }) => {
          const selected = primaryGoal === label;
          return (
            <TouchableOpacity
              key={label}
              style={[s.listOption, selected && s.listOptionSelected]}
              onPress={() => setPrimaryGoal(label)}
              activeOpacity={0.8}
            >
              <Ionicons name={icon as any} size={20} color={selected ? '#fff' : theme.text.secondary} style={{ marginRight: 12 }} />
              <Text style={[s.listOptionText, selected && s.listOptionTextSelected]}>{label}</Text>
              {selected && <Ionicons name="checkmark-circle" size={20} color="#fff" style={{ marginLeft: 'auto' }} />}
            </TouchableOpacity>
          );
        })}
      </View>
      <TouchableOpacity style={[s.cta, !primaryGoal && s.ctaDim]} onPress={onNext} activeOpacity={0.85}>
        <Text style={s.ctaText}>Continue</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ── Screen 4: Fitness Level ───────────────────────────────────────────────────

function Screen4Level({ fitnessLevel, setFitnessLevel, onNext, s, theme }: any) {
  return (
    <ScrollView contentContainerStyle={s.screenContent}>
      <Text style={s.stepLabel}>04 / 10</Text>
      <Text style={s.screenTitle}>How would you describe your fitness level?</Text>
      <Text style={s.screenSubtitle}>Affects strength standards and AI coaching tone.</Text>
      <View style={s.listOptions}>
        {FITNESS_LEVELS.map(({ label, sub }) => {
          const selected = fitnessLevel === label;
          return (
            <TouchableOpacity
              key={label}
              style={[s.listOption, selected && s.listOptionSelected]}
              onPress={() => setFitnessLevel(label)}
              activeOpacity={0.8}
            >
              <View style={{ flex: 1 }}>
                <Text style={[s.listOptionText, selected && s.listOptionTextSelected]}>{label}</Text>
                <Text style={[s.listOptionSub, selected && { color: 'rgba(255,255,255,0.65)' }]}>{sub}</Text>
              </View>
              {selected && <Ionicons name="checkmark-circle" size={20} color="#fff" />}
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

// ── Screen 5: Training Frequency ──────────────────────────────────────────────

function Screen5Frequency({ weeklyDays, setWeeklyDays, onNext, s, theme }: any) {
  return (
    <ScrollView contentContainerStyle={s.screenContent}>
      <Text style={s.stepLabel}>05 / 10</Text>
      <Text style={s.screenTitle}>How many days per week do you train?</Text>
      <Text style={s.screenSubtitle}>Used for deload detection and recovery recommendations.</Text>
      <View style={s.listOptions}>
        {TRAINING_DAYS.map(({ label, sub }) => {
          const selected = weeklyDays === label;
          return (
            <TouchableOpacity
              key={label}
              style={[s.listOption, selected && s.listOptionSelected]}
              onPress={() => setWeeklyDays(label)}
              activeOpacity={0.8}
            >
              <View style={{ flex: 1 }}>
                <Text style={[s.listOptionText, selected && s.listOptionTextSelected]}>{label}</Text>
                <Text style={[s.listOptionSub, selected && { color: 'rgba(255,255,255,0.65)' }]}>{sub}</Text>
              </View>
              {selected && <Ionicons name="checkmark-circle" size={20} color="#fff" />}
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

// ── Screen 6: Body Stats ──────────────────────────────────────────────────────

function Screen6BodyStats({
  ageStr, setAgeStr, weightStr, setWeightStr, weightUnit, setWeightUnit,
  heightStr, setHeightStr, heightUnit, setHeightUnit, biologicalSex, setBiologicalSex,
  onNext, s, theme,
}: any) {
  const isValid = ageStr.trim() && weightStr.trim() && heightStr.trim() && biologicalSex;
  return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.screenContent} keyboardShouldPersistTaps="handled">
        <Text style={s.stepLabel}>06 / 10</Text>
        <Text style={s.screenTitle}>Tell us about your body.</Text>
        <Text style={s.screenSubtitle}>Required for calorie calculations and strength standards.</Text>

        {/* Age */}
        <Text style={s.fieldLabel}>Age</Text>
        <TextInput
          style={s.fieldInput}
          placeholder="e.g. 24"
          placeholderTextColor={theme.text.muted}
          keyboardType="number-pad"
          value={ageStr}
          onChangeText={setAgeStr}
          returnKeyType="next"
        />

        {/* Weight */}
        <View style={s.unitRow}>
          <Text style={s.fieldLabel}>Weight</Text>
          <View style={s.unitToggle}>
            {(['kg', 'lbs'] as const).map((u) => (
              <TouchableOpacity key={u} style={[s.unitBtn, weightUnit === u && s.unitBtnActive]} onPress={() => setWeightUnit(u)}>
                <Text style={[s.unitBtnText, weightUnit === u && s.unitBtnTextActive]}>{u}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <TextInput
          style={s.fieldInput}
          placeholder={weightUnit === 'kg' ? 'e.g. 80' : 'e.g. 176'}
          placeholderTextColor={theme.text.muted}
          keyboardType="decimal-pad"
          value={weightStr}
          onChangeText={setWeightStr}
          returnKeyType="next"
        />

        {/* Height */}
        <View style={s.unitRow}>
          <Text style={s.fieldLabel}>Height</Text>
          <View style={s.unitToggle}>
            {(['cm', 'ft'] as const).map((u) => (
              <TouchableOpacity key={u} style={[s.unitBtn, heightUnit === u && s.unitBtnActive]} onPress={() => setHeightUnit(u)}>
                <Text style={[s.unitBtnText, heightUnit === u && s.unitBtnTextActive]}>{u}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <TextInput
          style={s.fieldInput}
          placeholder={heightUnit === 'cm' ? 'e.g. 180' : 'e.g. 5.11'}
          placeholderTextColor={theme.text.muted}
          keyboardType="decimal-pad"
          value={heightStr}
          onChangeText={setHeightStr}
        />

        {/* Sex */}
        <Text style={s.fieldLabel}>Biological Sex</Text>
        <View style={s.sexRow}>
          {['Male', 'Female', 'Prefer not to say'].map((opt) => (
            <TouchableOpacity
              key={opt}
              style={[s.sexBtn, biologicalSex === opt && s.sexBtnActive]}
              onPress={() => setBiologicalSex(opt)}
            >
              <Text style={[s.sexBtnText, biologicalSex === opt && s.sexBtnTextActive]}>{opt}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={[s.cta, !isValid && s.ctaDim]} onPress={onNext} activeOpacity={0.85} disabled={!isValid}>
          <Text style={s.ctaText}>Continue</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Screen 7: Calorie Target ──────────────────────────────────────────────────

function Screen7Calories({
  tdeeData, useCustom, setUseCustom, customStr, setCustomStr,
  finalTarget, primaryGoal, onNext, s, theme,
}: any) {
  return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.screenContent} keyboardShouldPersistTaps="handled">
        <Text style={s.stepLabel}>07 / 10</Text>
        <Text style={s.screenTitle}>Your daily calorie target.</Text>
        <Text style={s.screenSubtitle}>Calculated using the Mifflin St Jeor formula.</Text>

        {/* Big calorie number */}
        <View style={s.calorieHero}>
          <Text style={s.calorieHeroNumber}>{finalTarget}</Text>
          <Text style={s.calorieHeroUnit}>kcal / day</Text>
        </View>

        {/* Breakdown */}
        {tdeeData && (
          <View style={s.breakdownCard}>
            <View style={s.breakdownRow}>
              <Text style={s.breakdownLabel}>Base Metabolic Rate</Text>
              <Text style={s.breakdownValue}>{tdeeData.bmr} kcal</Text>
            </View>
            <View style={s.breakdownRow}>
              <Text style={s.breakdownLabel}>Activity multiplier</Text>
              <Text style={s.breakdownValue}>× {tdeeData.multiplier.toFixed(3)}</Text>
            </View>
            {tdeeData.goalAdj !== 0 && (
              <View style={s.breakdownRow}>
                <Text style={s.breakdownLabel}>{primaryGoal} adjustment</Text>
                <Text style={[s.breakdownValue, { color: tdeeData.goalAdj > 0 ? '#27ae60' : '#e74c3c' }]}>
                  {tdeeData.goalAdj > 0 ? '+' : ''}{tdeeData.goalAdj} kcal
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Custom override */}
        <TouchableOpacity
          style={s.customToggleBtn}
          onPress={() => setUseCustom((v: boolean) => !v)}
          activeOpacity={0.75}
        >
          <Ionicons name={useCustom ? 'close-circle-outline' : 'pencil-outline'} size={16} color={theme.text.muted} />
          <Text style={s.customToggleText}>{useCustom ? 'Use calculated target' : 'Set a custom target'}</Text>
        </TouchableOpacity>

        {useCustom && (
          <TextInput
            style={s.fieldInput}
            placeholder="e.g. 2400"
            placeholderTextColor={theme.text.muted}
            keyboardType="number-pad"
            value={customStr}
            onChangeText={setCustomStr}
            autoFocus
          />
        )}

        <TouchableOpacity style={s.cta} onPress={onNext} activeOpacity={0.85}>
          <Text style={s.ctaText}>Use {finalTarget} kcal / day</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Screen 8: App Connections ─────────────────────────────────────────────────

function Screen8Connections({ s, theme, onNext }: any) {
  const user = useAuthStore((s) => s.user);
  const INTEGRATIONS = [
    { label: 'Strava', icon: 'walk-outline', connected: !!user?.strava_connected },
    { label: 'Hevy', icon: 'barbell-outline', connected: !!user?.hevy_connected },
    { label: 'Whoop', icon: 'pulse-outline', connected: !!user?.whoop_connected },
    { label: 'Oura Ring', icon: 'bed-outline', connected: !!user?.oura_connected },
  ];
  return (
    <ScrollView contentContainerStyle={s.screenContent}>
      <Text style={s.stepLabel}>08 / 10</Text>
      <Text style={s.screenTitle}>Connect your existing apps.</Text>
      <Text style={s.screenSubtitle}>ORYX gets smarter with more data. You can connect later from Profile.</Text>
      <View style={s.tileGrid}>
        {INTEGRATIONS.map(({ label, icon, connected }) => (
          <TouchableOpacity
            key={label}
            style={[s.tile, connected && s.tileSelected]}
            onPress={() => Alert.alert('Connect later', `Connect ${label} from your Profile after onboarding.`)}
            activeOpacity={0.8}
          >
            <Ionicons name={icon as any} size={22} color={connected ? '#fff' : theme.text.secondary} />
            <Text style={[s.tileLabel, connected && s.tileLabelSelected]}>{label}</Text>
            {connected && <Ionicons name="checkmark-circle" size={14} color="#27ae60" style={{ position: 'absolute', top: 8, right: 8 }} />}
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity style={s.cta} onPress={onNext} activeOpacity={0.85}>
        <Text style={s.ctaText}>Continue</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ── Screen 9: Training Time ───────────────────────────────────────────────────

function Screen9Time({ trainingTime, setTrainingTime, onNext, s, theme }: any) {
  return (
    <ScrollView contentContainerStyle={s.screenContent}>
      <Text style={s.stepLabel}>09 / 10</Text>
      <Text style={s.screenTitle}>When do you usually train?</Text>
      <Text style={s.screenSubtitle}>Used for workout reminders and pre-workout nutrition timing.</Text>
      <View style={s.listOptions}>
        {TRAINING_TIMES.map(({ label, sub }) => {
          const selected = trainingTime === label;
          return (
            <TouchableOpacity
              key={label}
              style={[s.listOption, selected && s.listOptionSelected]}
              onPress={() => setTrainingTime(label)}
              activeOpacity={0.8}
            >
              <View style={{ flex: 1 }}>
                <Text style={[s.listOptionText, selected && s.listOptionTextSelected]}>{label}</Text>
                <Text style={[s.listOptionSub, selected && { color: 'rgba(255,255,255,0.65)' }]}>{sub}</Text>
              </View>
              {selected && <Ionicons name="checkmark-circle" size={20} color="#fff" />}
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

// ── Screen 10: All Set ────────────────────────────────────────────────────────

function Screen10Done({ displayName, sportTags, primaryGoal, finalCalorieTarget, onFinish, s, theme }: any) {
  const name = displayName.trim() || 'Athlete';
  const sportSummary = sportTags.length > 0 ? sportTags.join(', ') : 'your training';
  const goalLine = primaryGoal ? `your goal: ${primaryGoal.toLowerCase()}` : 'your fitness goals';
  return (
    <ScrollView contentContainerStyle={[s.screenContent, { alignItems: 'center' }]}>
      <View style={s.doneIconWrap}>
        <Ionicons name="checkmark-circle" size={64} color={theme.accent} />
      </View>
      <Text style={s.doneTitle}>{name}, ORYX is ready.</Text>
      <Text style={s.doneSubtitle}>
        We will track your {sportSummary}, monitor your recovery, and tell you exactly why your body performs the way it does.
      </Text>

      {/* Summary card */}
      <View style={s.summaryCard}>
        <SummaryRow icon="trophy-outline" label="Goal" value={primaryGoal || 'Not set'} theme={theme} />
        <View style={s.summaryDivider} />
        <SummaryRow icon="flame-outline" label="Calorie target" value={`${finalCalorieTarget} kcal / day`} theme={theme} />
        <View style={s.summaryDivider} />
        <SummaryRow icon="link-outline" label="Connected apps" value="Connect from Profile" theme={theme} />
      </View>

      <TouchableOpacity
        style={[s.cta, { marginTop: 32 }]}
        onPress={onFinish}
        activeOpacity={0.85}
      >
        <Text style={s.ctaText}>Enter ORYX</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function SummaryRow({ icon, label, value, theme }: { icon: string; label: string; value: string; theme: ThemeColors }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 }}>
      <Ionicons name={icon as any} size={18} color={theme.accent} />
      <Text style={{ fontSize: 13, color: theme.text.muted, width: 110 }}>{label}</Text>
      <Text style={{ fontSize: 14, fontWeight: '600', color: theme.text.primary, flex: 1 }}>{value}</Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function createStyles(t: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg.primary },
    progressContainer: {
      flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 10,
    },
    backBtn: { width: 32, alignItems: 'center' },
    progressBarTrack: {
      flex: 1, height: 4, backgroundColor: t.border, borderRadius: 2, overflow: 'hidden',
    },
    progressBarFill: {
      height: '100%', backgroundColor: t.accent, borderRadius: 2,
    },
    skipBtn: { width: 40, alignItems: 'flex-end' },
    skipText: { fontSize: 13, color: t.text.muted, fontWeight: '500' },

    screenContainer: { flex: 1 },
    screen: { flex: 1 },
    screenContent: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 48, flexGrow: 1 },

    stepLabel: { fontSize: 12, color: t.text.muted, fontWeight: '600', letterSpacing: 1, marginBottom: 16 },
    screenTitle: { fontSize: 26, fontWeight: '800', color: t.text.primary, marginBottom: 8, lineHeight: 34 },
    screenSubtitle: { fontSize: 14, color: t.text.muted, lineHeight: 20, marginBottom: 28 },

    bigInput: {
      backgroundColor: t.bg.elevated,
      borderWidth: 1, borderColor: t.border, borderRadius: 16,
      paddingHorizontal: 20, paddingVertical: 18,
      fontSize: 22, fontWeight: '700', color: t.text.primary,
      marginBottom: 32, textAlign: 'center',
    },

    // Tile grid (2 columns)
    tileGrid: {
      flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 28,
    },
    tile: {
      width: (SCREEN_WIDTH - 48 - 12) / 2 - 6,
      backgroundColor: t.bg.elevated, borderWidth: 1, borderColor: t.border,
      borderRadius: 16, padding: 16,
      alignItems: 'center', gap: 8,
    },
    tileSelected: { borderColor: '#fff', backgroundColor: '#1a1a1a' },
    tileLabel: { fontSize: 13, fontWeight: '600', color: t.text.secondary, textAlign: 'center' },
    tileLabelSelected: { color: '#fff' },

    // List options
    listOptions: { gap: 10, marginBottom: 28 },
    listOption: {
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: t.bg.elevated, borderWidth: 1, borderColor: t.border,
      borderRadius: 14, padding: 16,
    },
    listOptionSelected: { borderColor: '#fff', backgroundColor: '#1c1c1c' },
    listOptionText: { fontSize: 15, fontWeight: '600', color: t.text.primary },
    listOptionTextSelected: { color: '#fff' },
    listOptionSub: { fontSize: 12, color: t.text.muted, marginTop: 2 },

    // CTA button
    cta: {
      backgroundColor: t.text.primary, borderRadius: 14,
      paddingVertical: 16, alignItems: 'center',
    },
    ctaDim: { opacity: 0.35 },
    ctaText: { fontSize: 16, fontWeight: '700', color: t.bg.primary },

    // Body stats
    fieldLabel: { fontSize: 13, color: t.text.secondary, fontWeight: '600', marginBottom: 8, marginTop: 16 },
    fieldInput: {
      backgroundColor: t.bg.elevated, borderWidth: 1, borderColor: t.border,
      borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
      fontSize: 16, color: t.text.primary,
    },
    unitRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    unitToggle: { flexDirection: 'row', gap: 6 },
    unitBtn: {
      paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8,
      backgroundColor: t.bg.elevated, borderWidth: 1, borderColor: t.border,
    },
    unitBtnActive: { backgroundColor: t.text.primary, borderColor: t.text.primary },
    unitBtnText: { fontSize: 12, fontWeight: '600', color: t.text.muted },
    unitBtnTextActive: { color: t.bg.primary },
    sexRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
    sexBtn: {
      flex: 1, paddingVertical: 12, borderRadius: 10,
      backgroundColor: t.bg.elevated, borderWidth: 1, borderColor: t.border, alignItems: 'center',
    },
    sexBtnActive: { backgroundColor: t.text.primary, borderColor: t.text.primary },
    sexBtnText: { fontSize: 13, fontWeight: '600', color: t.text.secondary },
    sexBtnTextActive: { color: t.bg.primary },

    // Calorie screen
    calorieHero: { alignItems: 'center', marginBottom: 24 },
    calorieHeroNumber: { fontSize: 64, fontWeight: '900', color: t.text.primary, lineHeight: 72 },
    calorieHeroUnit: { fontSize: 16, color: t.text.muted, marginTop: 4 },
    breakdownCard: {
      backgroundColor: t.bg.elevated, borderRadius: 14, padding: 16,
      borderWidth: 1, borderColor: t.border, marginBottom: 20,
    },
    breakdownRow: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8,
    },
    breakdownLabel: { fontSize: 13, color: t.text.muted },
    breakdownValue: { fontSize: 14, fontWeight: '700', color: t.text.primary },
    customToggleBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 },
    customToggleText: { fontSize: 13, color: t.text.muted },

    // Done screen
    doneIconWrap: { marginTop: 24, marginBottom: 20, alignItems: 'center' },
    doneTitle: { fontSize: 26, fontWeight: '800', color: t.text.primary, textAlign: 'center', marginBottom: 12 },
    doneSubtitle: { fontSize: 15, color: t.text.muted, textAlign: 'center', lineHeight: 22, marginBottom: 28 },
    summaryCard: {
      backgroundColor: t.bg.elevated, borderRadius: 16, padding: 8,
      borderWidth: 1, borderColor: t.border, width: '100%',
      paddingHorizontal: 16,
    },
    summaryDivider: { height: 1, backgroundColor: t.border },
  });
}
