import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  ActivityIndicator,
  Platform,
  Dimensions,
  Image,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import {
  getTodayNutrition,
  logNutrition,
  deleteNutritionLog,
  scanFoodPhoto,
  getNutritionTargets,
  NutritionLog,
  NutritionTargets,
  DailyNutritionSummary,
  FoodScanResult,
  getNutritionProfile,
  getTodayMealPlan,
  regenerateMealPlan,
  saveMealToCollection,
  getSavedMeals,
  deleteSavedMeal,
  MealPlan,
  MealPlanMeal,
  SavedMeal,
  ChatMessage,
  askNutritionAssistant,
  getWaterToday,
  patchWaterToday,
  patchWaterSettings,
  WaterSettingsPayload,
  getWeeklyNutritionSummary,
  WeeklyNutritionSummary,
  getWeeklyCalories,
  WeeklyCalorieDay,
} from '@/services/api';
import { useTheme } from '@/contexts/ThemeContext';
import { ThemeColors } from '@/services/theme';
import FoodSearchModal from '@/components/FoodSearchModal';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 40;

// ── Micronutrient metadata ────────────────────────────────────────────────────

interface MicroDef {
  key: keyof NutritionTargets;
  consumedKey: keyof DailyNutritionSummary | null;
  label: string;
  unit: string;
  goalLabel: (t: NutritionTargets) => string;
  info: string;
}

const MICRO_DEFS: MicroDef[] = [
  {
    key: 'fibre_g', consumedKey: 'fibre_consumed_g', label: 'Fibre', unit: 'g',
    goalLabel: (t) => `${t.fibre_g ?? 28}g`,
    info: 'Supports gut health, slows carb absorption, and reduces recovery inflammation.',
  },
  {
    key: 'sugar_max_g', consumedKey: 'sugar_consumed_g', label: 'Sugar', unit: 'g',
    goalLabel: (t) => `max ${t.sugar_max_g ?? 50}g`,
    info: 'Excessive added sugar impairs insulin sensitivity and recovery quality.',
  },
  {
    key: 'sodium_max_mg', consumedKey: 'sodium_consumed_mg', label: 'Sodium', unit: 'mg',
    goalLabel: (t) => `max ${t.sodium_max_mg ?? 2300}mg`,
    info: 'Essential electrolyte for hydration and muscle contraction. Limit excess.',
  },
  {
    key: 'vitamin_d_iu', consumedKey: 'vitamin_d_consumed_iu', label: 'Vitamin D', unit: 'IU',
    goalLabel: (t) => `${t.vitamin_d_iu ?? 600} IU`,
    info: 'Commonly deficient in athletes. Critical for bone strength and immune function.',
  },
  {
    key: 'magnesium_mg', consumedKey: 'magnesium_consumed_mg', label: 'Magnesium', unit: 'mg',
    goalLabel: (t) => `${t.magnesium_mg ?? 355}mg`,
    info: 'Important for muscle recovery, sleep quality, and energy production.',
  },
  {
    key: 'iron_mg', consumedKey: 'iron_consumed_mg', label: 'Iron', unit: 'mg',
    goalLabel: (t) => `${t.iron_mg ?? 13}mg`,
    info: 'Carries oxygen to muscles. Deficiency causes fatigue and reduced performance.',
  },
  {
    key: 'calcium_mg', consumedKey: 'calcium_consumed_mg', label: 'Calcium', unit: 'mg',
    goalLabel: (t) => `${t.calcium_mg ?? 1000}mg`,
    info: 'Essential for bone density, muscle contraction, and nerve function.',
  },
  {
    key: 'zinc_mg', consumedKey: 'zinc_consumed_mg', label: 'Zinc', unit: 'mg',
    goalLabel: (t) => `${t.zinc_mg ?? 9.5}mg`,
    info: 'Supports testosterone production, immune function, and tissue repair.',
  },
  {
    key: 'omega3_g', consumedKey: 'omega3_consumed_g', label: 'Omega-3', unit: 'g',
    goalLabel: (t) => `${t.omega3_g ?? 1.35}g`,
    info: 'Reduces exercise-induced inflammation and supports cardiovascular health.',
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayDisplayDate(): string {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

// ── Macro Circle ─────────────────────────────────────────────────────────────

interface MacroCircleProps {
  label: string;
  value: number;
  target: number;
  unit: string;
  color: string;
  size?: number;
}

function MacroCircle({ label, value, target, unit, color, size = 76 }: MacroCircleProps) {
  const { theme } = useTheme();
  const strokeWidth = 5;
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(value / target, 1);
  const strokeDashoffset = circumference * (1 - progress);
  const cx = size / 2;
  const cy = size / 2;

  return (
    <View style={{ alignItems: 'center', gap: 6 }}>
      <View style={{ position: 'relative', width: size, height: size }}>
        <Svg width={size} height={size}>
          <Circle cx={cx} cy={cy} r={radius} stroke={theme.border} strokeWidth={strokeWidth} fill="none" />
          <Circle
            cx={cx} cy={cy} r={radius}
            stroke={color} strokeWidth={strokeWidth} fill="none"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        </Svg>
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: theme.text.primary }}>
            {Math.round(value)}{unit}
          </Text>
        </View>
      </View>
      <View style={{ alignItems: 'center', gap: 1 }}>
        <Text style={{ fontSize: 12, fontWeight: '600', color: color }}>{label}</Text>
        <Text style={{ fontSize: 10, color: theme.text.muted }}>/ {target}{unit}</Text>
        {target > 0 && (() => {
          const pct = value / target;
          if (pct > 1.1) return <Text style={{ fontSize: 9, color: '#c0392b', fontWeight: '600' }}>Over</Text>;
          if (pct >= 0.8) return <Text style={{ fontSize: 9, color: '#e67e22', fontWeight: '600' }}>On Track</Text>;
          return <Text style={{ fontSize: 9, color: '#666', fontWeight: '600' }}>Low</Text>;
        })()}
      </View>
    </View>
  );
}

// ── Progress Bar ──────────────────────────────────────────────────────────────

function ProgressBar({ value, color }: { value: number; color: string }) {
  const { theme } = useTheme();
  return (
    <View style={{ flex: 1, height: 5, backgroundColor: theme.border, borderRadius: 3, overflow: 'hidden' }}>
      <View style={{ width: `${Math.round(Math.min(value, 1) * 100)}%` as any, height: '100%', backgroundColor: color, borderRadius: 3 }} />
    </View>
  );
}

// ── Scan Loading Dots ─────────────────────────────────────────────────────────

function ScanLoadingDots() {
  const { theme } = useTheme();
  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const anim = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0.3, duration: 400, useNativeDriver: true }),
        ])
      );
    const a1 = anim(dot1, 0);
    const a2 = anim(dot2, 200);
    const a3 = anim(dot3, 400);
    a1.start(); a2.start(); a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, [dot1, dot2, dot3]);

  return (
    <View style={{ flexDirection: 'row', gap: 6, marginTop: 16 }}>
      {[dot1, dot2, dot3].map((dot, i) => (
        <Animated.View
          key={i}
          style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.accent, opacity: dot }}
        />
      ))}
    </View>
  );
}

// ── Unified Calorie + Macro Card ─────────────────────────────────────────────

interface CalorieMacroCardProps {
  totalCalories: number;
  calorieTarget: number;
  totalProtein: number;
  proteinTarget: number;
  totalCarbs: number;
  carbsTarget: number;
  totalFat: number;
  fatTarget: number;
}

function CalorieMacroCard({
  totalCalories, calorieTarget,
  totalProtein, proteinTarget,
  totalCarbs, carbsTarget,
  totalFat, fatTarget,
}: CalorieMacroCardProps) {
  const { theme } = useTheme();

  const RING_SIZE = 140;
  const STROKE_W = 14;
  const radius = (RING_SIZE - STROKE_W) / 2;
  const circumference = 2 * Math.PI * radius;
  const cx = RING_SIZE / 2;
  const cy = RING_SIZE / 2;

  const pct = calorieTarget > 0 ? totalCalories / calorieTarget : 0;
  const fillPct = Math.min(pct, 1);
  const strokeDashoffset = circumference * (1 - fillPct);

  const ringColor = pct > 1 ? '#c0392b' : pct >= 0.9 ? '#e67e22' : '#e0e0e0';
  const isOver = totalCalories > calorieTarget;
  const diff = Math.abs(Math.round(totalCalories - calorieTarget));

  return (
    <View style={{ backgroundColor: '#1a1a1a', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#2a2a2a', marginBottom: 16 }}>
      {/* Calorie ring */}
      <View style={{ alignItems: 'center', paddingTop: 4 }}>
        <View style={{ width: RING_SIZE, height: RING_SIZE }}>
          <Svg width={RING_SIZE} height={RING_SIZE}>
            {/* Track */}
            <Circle
              cx={cx} cy={cy} r={radius}
              stroke="#2a2a2a" strokeWidth={STROKE_W} fill="none"
            />
            {/* Fill */}
            <Circle
              cx={cx} cy={cy} r={radius}
              stroke={ringColor} strokeWidth={STROKE_W} fill="none"
              strokeDasharray={`${circumference} ${circumference}`}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              transform={`rotate(-90 ${cx} ${cy})`}
            />
          </Svg>
          {/* Center text */}
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 28, fontWeight: '700', color: '#fff', lineHeight: 32 }}>
              {Math.round(totalCalories)}
            </Text>
            <Text style={{ fontSize: 12, color: theme.text.muted, marginTop: 1 }}>kcal</Text>
            <Text style={{ fontSize: 11, color: isOver ? '#c0392b' : theme.text.muted, marginTop: 3 }}>
              {isOver ? `${diff}kcal over` : `${diff}kcal left`}
            </Text>
          </View>
        </View>
        {/* Below ring */}
        <Text style={{ fontSize: 12, color: theme.text.muted, marginTop: 10 }}>
          Daily goal: {calorieTarget}kcal
        </Text>
        <View style={{
          marginTop: 6, paddingHorizontal: 10, paddingVertical: 3,
          borderRadius: 10, backgroundColor: `${ringColor}22`,
          borderWidth: 1, borderColor: `${ringColor}55`,
        }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: ringColor }}>
            {Math.round(fillPct * 100)}%
          </Text>
        </View>
      </View>

      {/* Divider */}
      <View style={{ height: 1, backgroundColor: '#2a2a2a', marginTop: 20, marginBottom: 20 }} />

      {/* Macro circles */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' }}>
        <MacroCircle label="Protein" value={totalProtein} target={proteinTarget} unit="g" color={theme.accent} />
        <MacroCircle label="Carbs" value={totalCarbs} target={carbsTarget} unit="g" color="#888888" />
        <MacroCircle label="Fat" value={totalFat} target={fatTarget} unit="g" color="#FF6B35" />
      </View>
    </View>
  );
}

// ── Weekly Calorie Trend ──────────────────────────────────────────────────────

interface WeeklyCalorieTrendProps {
  days: { date: string; calories_logged: number; target: number; day_label: string }[];
}

function WeeklyCalorieTrend({ days }: WeeklyCalorieTrendProps) {
  const { theme } = useTheme();

  if (!days.length) return null;

  const CHART_H = 56; // bar area height
  const target = days[0]?.target ?? 2000;
  const avg = days.length ? Math.round(days.reduce((s, d) => s + d.calories_logged, 0) / days.length) : 0;

  // Max bar height: cap at 120% of target for visual scale
  const maxCal = target * 1.2;

  return (
    <View style={{ backgroundColor: '#1a1a1a', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#2a2a2a', marginBottom: 16 }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <Text style={{ fontSize: 10, fontWeight: '600', color: theme.text.muted, textTransform: 'uppercase', letterSpacing: 1 }}>
          THIS WEEK
        </Text>
        <Text style={{ fontSize: 12, color: theme.text.muted }}>
          Avg {avg}kcal
        </Text>
      </View>

      {/* Bar chart */}
      <View style={{ height: CHART_H + 18 }}>
        {/* Target dashed line — positioned at target height */}
        <View style={{
          position: 'absolute',
          top: CHART_H * (1 - target / maxCal),
          left: 0, right: 0, height: 1,
          borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.2)',
          borderStyle: 'dashed',
        }} />

        {/* Bars + labels */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: CHART_H, gap: 4 }}>
          {days.map((d, i) => {
            const barH = d.calories_logged > 0
              ? Math.max(3, Math.round((d.calories_logged / maxCal) * CHART_H))
              : 0;
            const ratio = target > 0 ? d.calories_logged / target : 0;
            const barColor = d.calories_logged === 0 ? '#2a2a2a'
              : ratio > 1 ? '#e67e22'
              : ratio >= 0.9 ? '#e0e0e0'
              : '#555';
            return (
              <View key={i} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: CHART_H }}>
                <View style={{
                  width: '70%', height: barH,
                  backgroundColor: barColor,
                  borderRadius: 3,
                }} />
              </View>
            );
          })}
        </View>

        {/* Day labels */}
        <View style={{ flexDirection: 'row', gap: 4, marginTop: 4 }}>
          {days.map((d, i) => (
            <View key={i} style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ fontSize: 10, color: theme.text.muted }}>{d.day_label}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function NutritionScreen() {
  const { theme } = useTheme();
  const s = useMemo(() => createStyles(theme), [theme]);

  // Nutrition state
  const [todayLogs, setTodayLogs] = useState<NutritionLog[]>([]);
  const [targets, setTargets] = useState<NutritionTargets | null>(null);
  const [summary, setSummary] = useState<DailyNutritionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Meal modification banner
  const [mealModifiedBanner, setMealModifiedBanner] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showFoodSearchModal, setShowFoodSearchModal] = useState(false);
  const [showExtra, setShowExtra] = useState(false);
  const [nutritionForm, setNutritionForm] = useState({
    meal_name: '', calories: '', protein_g: '', carbs_g: '', fat_g: '', fibre_g: '', notes: '',
  });
  const [submitting, setSubmitting] = useState(false);

  // Meal plan state
  const [mealPlan, setMealPlan] = useState<MealPlan | null>(null);
  const [mealPlanLoading, setMealPlanLoading] = useState(true);
  const [surveyComplete, setSurveyComplete] = useState(false);
  const [expandedMealId, setExpandedMealId] = useState<string | null>(null);
  const [mealPlanExpanded, setMealPlanExpanded] = useState(true);
  const [savedMeals, setSavedMeals] = useState<SavedMeal[]>([]);
  const [groceryChecked, setGroceryChecked] = useState<Record<string, boolean>>({});
  const [groceryExpanded, setGroceryExpanded] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  // Ask ORYX chat
  const [chatExpanded, setChatExpanded] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatScrollRef = useRef<ScrollView>(null);
  const [mealPlanError, setMealPlanError] = useState<string | null>(null);

  // Micronutrients expand state
  const [microsExpanded, setMicrosExpanded] = useState(false);

  // Water tracking state
  const [waterAmountMl, setWaterAmountMl] = useState(0);
  const [waterTargetMl, setWaterTargetMl] = useState(2500);
  const [waterContainerSizeMl, setWaterContainerSizeMl] = useState(250);
  const [waterRecommendedMl, setWaterRecommendedMl] = useState(2500);
  const [waterInputMode, setWaterInputMode] = useState<'glasses' | 'ml'>('glasses');
  const [waterLoading, setWaterLoading] = useState(false);
  // Water settings sheet
  const [waterSettingsOpen, setWaterSettingsOpen] = useState(false);
  const [settingsTargetInput, setSettingsTargetInput] = useState('');
  const [settingsContainerSize, setSettingsContainerSize] = useState(250);
  const [settingsInputMode, setSettingsInputMode] = useState<'glasses' | 'ml'>('glasses');

  // Weekly summary state
  const [weeklySummary, setWeeklySummary] = useState<WeeklyNutritionSummary | null>(null);
  const [weeklyCalorieDays, setWeeklyCalorieDays] = useState<WeeklyCalorieDay[]>([]);

  // Scan state
  const [scanLoading, setScanLoading] = useState(false);
  const [scanResult, setScanResult] = useState<FoodScanResult | null>(null);
  const [scanImageUri, setScanImageUri] = useState<string | null>(null);
  const [showScanModal, setShowScanModal] = useState(false);
  const [scanForm, setScanForm] = useState({
    meal_name: '', calories: '', protein_g: '', carbs_g: '', fat_g: '', fibre_g: '',
  });
  const [scanSubmitting, setScanSubmitting] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    try {
      const [todayData, tgts, waterData, weeklyData, calDays] = await Promise.all([
        getTodayNutrition(),
        getNutritionTargets().catch(() => null),
        getWaterToday().catch(() => null),
        getWeeklyNutritionSummary().catch(() => null),
        getWeeklyCalories().catch(() => [] as WeeklyCalorieDay[]),
      ]);
      setTodayLogs(todayData.logs);
      setSummary(todayData.summary);
      if (todayData.targets) setTargets(todayData.targets);
      else if (tgts) setTargets(tgts);
      if (waterData) {
        setWaterAmountMl(waterData.amount_ml);
        setWaterTargetMl(waterData.target_ml);
        setWaterContainerSizeMl(waterData.container_size_ml);
        setWaterRecommendedMl(waterData.recommended_ml);
      }
      if (weeklyData) setWeeklySummary(weeklyData);
      if (calDays?.length) setWeeklyCalorieDays(calDays);
    } catch {
      // Silent — show empty state
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const loadMealPlan = useCallback(async () => {
    setMealPlanLoading(true);
    setMealPlanError(null);
    try {
      // Fetch profile first — 404 means survey not done yet
      let profile;
      try {
        profile = await getNutritionProfile();
      } catch {
        setSurveyComplete(false);
        setMealPlan(null);
        try { setSavedMeals(await getSavedMeals()); } catch {}
        return;
      }

      const complete = !!profile.nutrition_survey_complete;
      setSurveyComplete(complete);
      if (complete) {
        setMealPlanError(null);
        try {
          const [plan, saved] = await Promise.all([getTodayMealPlan(), getSavedMeals()]);
          setMealPlan(plan);
          setSavedMeals(saved);
        } catch (err: any) {
          const msg = err?.response?.data?.detail || 'Could not load meal plan.';
          setMealPlanError(msg);
          setMealPlan(null);
          try { setSavedMeals(await getSavedMeals()); } catch {}
        }
      } else {
        try { setSavedMeals(await getSavedMeals()); } catch {}
      }
    } catch {
      setMealPlan(null);
    } finally {
      setMealPlanLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); loadMealPlan(); }, [loadData, loadMealPlan]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
    loadMealPlan();
  }, [loadData, loadMealPlan]);

  // ── Manual log handlers ───────────────────────────────────────────────────

  const resetForm = () =>
    setNutritionForm({ meal_name: '', calories: '', protein_g: '', carbs_g: '', fat_g: '', fibre_g: '', notes: '' });

  const handleLogMeal = async () => {
    if (!nutritionForm.meal_name.trim()) {
      Alert.alert('Required', 'Please enter a meal name.');
      return;
    }
    setSubmitting(true);
    try {
      const parseOpt = (v: string): number | undefined => {
        const n = parseFloat(v);
        return isNaN(n) ? undefined : n;
      };
      const saved = await logNutrition({
        meal_name: nutritionForm.meal_name.trim(),
        calories: parseOpt(nutritionForm.calories),
        protein_g: parseOpt(nutritionForm.protein_g),
        carbs_g: parseOpt(nutritionForm.carbs_g),
        fat_g: parseOpt(nutritionForm.fat_g),
        fibre_g: parseOpt(nutritionForm.fibre_g),
        notes: nutritionForm.notes.trim() || undefined,
        source: 'manual',
      });
      setTodayLogs((prev) => [...prev, saved]);
      resetForm();
      setShowAddModal(false);
      setShowExtra(false);
      getTodayNutrition().then((d) => setSummary(d.summary)).catch(() => {});
    } catch {
      Alert.alert('Error', 'Could not log meal. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (id: string) => {
    Alert.alert('Delete Entry', "Remove this meal from today's log?", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await deleteNutritionLog(id);
            setTodayLogs((prev) => prev.filter((n) => n.id !== id));
            getTodayNutrition().then((d) => setSummary(d.summary)).catch(() => {});
          } catch {
            Alert.alert('Error', 'Could not delete entry.');
          }
        },
      },
    ]);
  };

  // ── Meal plan handlers ────────────────────────────────────────────────────

  const handleRegenerateMealPlan = () => {
    Alert.alert(
      'Regenerate Meal Plan',
      'Generate a new meal plan for today?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Regenerate',
          onPress: async () => {
            setRegenerating(true);
            try {
              const newPlan = await regenerateMealPlan();
              setMealPlan(newPlan);
              setExpandedMealId(null);
              setGroceryChecked({});
            } catch {
              Alert.alert('Error', 'Could not regenerate meal plan. Try again.');
            } finally {
              setRegenerating(false);
            }
          },
        },
      ]
    );
  };

  const handleLogMealFromPlan = async (meal: MealPlanMeal) => {
    try {
      const saved = await logNutrition({
        meal_name: meal.meal_name,
        calories: meal.calories,
        protein_g: meal.protein_g,
        carbs_g: meal.carbs_g,
        fat_g: meal.fat_g,
        fibre_g:      meal.fibre_g,
        sugar_g:      meal.sugar_g,
        sodium_mg:    meal.sodium_mg,
        vitamin_d_iu: meal.vitamin_d_iu,
        magnesium_mg: meal.magnesium_mg,
        iron_mg:      meal.iron_mg,
        calcium_mg:   meal.calcium_mg,
        zinc_mg:      meal.zinc_mg,
        omega3_g:     meal.omega3_g,
        source: 'manual',
        notes: `From meal plan · ${meal.time}`,
      });
      setTodayLogs((prev) => [...prev, saved]);
      getTodayNutrition().then((d) => setSummary(d.summary)).catch(() => {});
      Alert.alert('Logged', `${meal.meal_name} added to today's food diary.`);
    } catch {
      Alert.alert('Error', 'Could not log meal.');
    }
  };

  const handleBookmarkMeal = async (meal: MealPlanMeal) => {
    try {
      const saved = await saveMealToCollection({
        meal_name: meal.meal_name,
        meal_type: meal.meal_type,
        description: meal.description,
        calories: meal.calories,
        protein_g: meal.protein_g,
        carbs_g: meal.carbs_g,
        fat_g: meal.fat_g,
        prep_time_minutes: meal.prep_time_minutes,
        ingredients: meal.ingredients,
        prep_note: meal.prep_note,
      });
      setSavedMeals((prev) => [...prev, saved]);
      Alert.alert('Saved', `${meal.meal_name} added to your saved meals.`);
    } catch {
      Alert.alert('Error', 'Could not save meal.');
    }
  };

  const handleDeleteSavedMeal = (id: string) => {
    Alert.alert('Remove Saved Meal', 'Remove this meal from your collection?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          try {
            await deleteSavedMeal(id);
            setSavedMeals((prev) => prev.filter((m) => m.id !== id));
          } catch {
            Alert.alert('Error', 'Could not remove saved meal.');
          }
        },
      },
    ]);
  };

  const handleToggleGrocery = (item: string) => {
    setGroceryChecked((prev) => ({ ...prev, [item]: !prev[item] }));
  };

  // ── Chat handlers ─────────────────────────────────────────────────────────

  const handleSendChat = async () => {
    const text = chatInput.trim();
    if (!text || chatLoading) return;
    setChatInput('');
    const userMsg: ChatMessage = { role: 'user', content: text };
    const updated = [...chatMessages.slice(-9), userMsg];
    setChatMessages(updated);
    setChatLoading(true);
    setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 50);
    try {
      const reply = await askNutritionAssistant(text, updated.slice(0, -1));
      const assistantMsg: ChatMessage = { role: 'assistant', content: reply.response_text };
      setChatMessages(prev => [...prev.slice(-9), assistantMsg]);

      // Handle meal modification
      if (reply.meal_modified && reply.modified_meal) {
        setMealModifiedBanner('Meal updated in your plan');
        setTimeout(() => setMealModifiedBanner(null), 3500);
        // Refresh meal plan to reflect the change
        getTodayMealPlan().then(setMealPlan).catch(() => {});
      }
    } catch {
      setChatMessages(prev => [
        ...prev.slice(-9),
        { role: 'assistant', content: "Sorry, I couldn't reach ORYX right now. Try again in a moment." },
      ]);
    } finally {
      setChatLoading(false);
      setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  // ── Scan handlers ─────────────────────────────────────────────────────────

  const resetScan = () => {
    setShowScanModal(false);
    setScanResult(null);
    setScanImageUri(null);
    setScanLoading(false);
    setScanError(null);
    setScanForm({ meal_name: '', calories: '', protein_g: '', carbs_g: '', fat_g: '', fibre_g: '' });
  };

  const pickAndAnalyze = async (source: 'camera' | 'library') => {
    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.7,
      base64: true,
    };

    let result: ImagePicker.ImagePickerResult;
    if (source === 'camera') {
      result = await ImagePicker.launchCameraAsync(options);
    } else {
      result = await ImagePicker.launchImageLibraryAsync(options);
    }

    if (result.canceled || !result.assets[0]?.base64) return;

    const asset = result.assets[0];
    setScanImageUri(asset.uri);
    setScanLoading(true);
    setScanError(null);
    setShowScanModal(true);

    console.log('[Scan] Starting food scan, base64 length:', asset.base64!.length);

    try {
      const data = await scanFoodPhoto(asset.base64!);
      console.log('[Scan] Result received:', JSON.stringify(data));
      setScanResult(data);
      setScanForm({
        meal_name: data.food_name,
        calories: data.calories > 0 ? String(data.calories) : '',
        protein_g: data.protein_g > 0 ? String(data.protein_g) : '',
        carbs_g: data.carbs_g > 0 ? String(data.carbs_g) : '',
        fat_g: data.fat_g > 0 ? String(data.fat_g) : '',
        fibre_g: data.fibre_g > 0 ? String(data.fibre_g) : '',
      });
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || 'Unknown error';
      console.error('[Scan] Failed:', msg, err);
      setScanError(msg);
    } finally {
      setScanLoading(false);
    }
  };

  const handleScanPhoto = async () => {
    Alert.alert('Scan Food', 'Choose a photo source', [
      {
        text: 'Camera',
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert('Permission needed', 'Camera access is required to scan food.');
            return;
          }
          await pickAndAnalyze('camera');
        },
      },
      {
        text: 'Photo Library',
        onPress: async () => {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== 'granted') {
            Alert.alert('Permission needed', 'Photo library access is required.');
            return;
          }
          await pickAndAnalyze('library');
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleConfirmScan = async () => {
    if (!scanForm.meal_name.trim()) {
      Alert.alert('Required', 'Please enter a meal name.');
      return;
    }
    setScanSubmitting(true);
    const parseOpt = (v: string): number | undefined => {
      const n = parseFloat(v);
      return isNaN(n) ? undefined : n;
    };
    try {
      const saved = await logNutrition({
        meal_name: scanForm.meal_name.trim(),
        description: scanResult?.description,
        calories:     parseOpt(scanForm.calories),
        protein_g:    parseOpt(scanForm.protein_g),
        carbs_g:      parseOpt(scanForm.carbs_g),
        fat_g:        parseOpt(scanForm.fat_g),
        fibre_g:      parseOpt(scanForm.fibre_g),
        sugar_g:      scanResult?.sugar_g ?? undefined,
        sodium_mg:    scanResult?.sodium_mg ?? undefined,
        vitamin_d_iu: scanResult?.vitamin_d_iu ?? undefined,
        magnesium_mg: scanResult?.magnesium_mg ?? undefined,
        iron_mg:      scanResult?.iron_mg ?? undefined,
        calcium_mg:   scanResult?.calcium_mg ?? undefined,
        zinc_mg:      scanResult?.zinc_mg ?? undefined,
        omega3_g:     scanResult?.omega3_g ?? undefined,
        source: 'scan',
      });
      setTodayLogs((prev) => [...prev, saved]);
      getTodayNutrition().then((d) => setSummary(d.summary)).catch(() => {});
      resetScan();
    } catch {
      Alert.alert('Error', 'Could not log meal. Try again.');
    } finally {
      setScanSubmitting(false);
    }
  };

  // ── Water settings handler ────────────────────────────────────────────────

  const handleSaveWaterSettings = async () => {
    setWaterLoading(true);
    try {
      const targetOverride = settingsTargetInput.trim()
        ? parseInt(settingsTargetInput, 10)
        : null; // null = reset to recommended
      const result = await patchWaterSettings({
        target_ml: targetOverride,
        container_size_ml: settingsContainerSize,
        water_input_mode: settingsInputMode,
      } as WaterSettingsPayload);
      // Use response directly — no second round-trip needed
      setWaterTargetMl(result.target_ml);
      setWaterContainerSizeMl(result.container_size_ml);
      setWaterRecommendedMl(result.recommended_ml);
      setWaterInputMode(settingsInputMode);
      setWaterSettingsOpen(false);
    } catch {
      Alert.alert('Error', 'Could not save water settings.');
    } finally {
      setWaterLoading(false);
    }
  };

  // ── Computed ──────────────────────────────────────────────────────────────

  // Use summary for totals (most accurate), fall back to computing from logs
  const totalCalories = summary?.calories_consumed ?? todayLogs.reduce((s, n) => s + (n.calories ?? 0), 0);
  const totalProtein  = summary?.protein_consumed_g ?? todayLogs.reduce((s, n) => s + (n.protein_g ?? 0), 0);
  const totalCarbs    = summary?.carbs_consumed_g ?? todayLogs.reduce((s, n) => s + (n.carbs_g ?? 0), 0);
  const totalFat      = summary?.fat_consumed_g ?? todayLogs.reduce((s, n) => s + (n.fat_g ?? 0), 0);

  const calorieTarget = targets?.daily_calorie_target ?? 2000;
  const proteinTarget = targets?.protein_g ?? 125;
  const carbsTarget   = targets?.carbs_g ?? 225;
  const fatTarget     = targets?.fat_g ?? 56;

  // Water computed
  const dropCount = Math.max(4, Math.min(10, Math.round(waterTargetMl / waterContainerSizeMl)));
  const currentGlasses = Math.round(waterAmountMl / waterContainerSizeMl);
  // Progress: in glasses mode use drops/dropCount so 10/10 = 100%; in ml mode use exact ml/target
  const waterPct = waterInputMode === 'ml'
    ? (waterTargetMl > 0 ? waterAmountMl / waterTargetMl : 0)
    : (dropCount > 0 ? currentGlasses / dropCount : 0);
  const waterColor = waterPct >= 0.8 ? '#27ae60' : waterPct >= 0.5 ? '#e67e22' : '#e0e0e0';

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
              <Text style={s.pageTitle}>Nutrition</Text>
              <Text style={s.pageSubtitle}>{todayDisplayDate()}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {surveyComplete && (
                <TouchableOpacity
                  style={s.headerIconBtn}
                  onPress={() => router.push('/nutrition-survey' as any)}
                  activeOpacity={0.85}
                >
                  <Ionicons name="settings-outline" size={18} color={theme.text.secondary} />
                </TouchableOpacity>
              )}
              <TouchableOpacity style={s.addBtn} onPress={() => setShowFoodSearchModal(true)} activeOpacity={0.85}>
                <Ionicons name="add" size={22} color={theme.bg.primary} />
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>

        {/* ── Unified Calorie + Macro Card ── */}
        <CalorieMacroCard
          totalCalories={totalCalories}
          calorieTarget={calorieTarget}
          totalProtein={totalProtein}
          proteinTarget={proteinTarget}
          totalCarbs={totalCarbs}
          carbsTarget={carbsTarget}
          totalFat={totalFat}
          fatTarget={fatTarget}
        />

        {/* ── Weekly Calorie Trend ── */}
        {weeklyCalorieDays.length > 0 && (
          <WeeklyCalorieTrend days={weeklyCalorieDays} />
        )}

        {/* ── AI Food Scanner ── */}
        <TouchableOpacity style={s.scanCard} onPress={handleScanPhoto} activeOpacity={0.85}>
          <View style={s.scanCardLeft}>
            <View style={s.scanIconWrap}>
              <Ionicons name="camera" size={22} color={theme.bg.primary} />
            </View>
            <View>
              <Text style={s.scanCardTitle}>Scan Food Photo</Text>
              <Text style={s.scanCardSubtitle}>AI identifies food & estimates nutrition</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={16} color={theme.text.muted} />
        </TouchableOpacity>

        {/* ── Ask ORYX ── */}
        {!chatExpanded ? (
          <TouchableOpacity
            style={s.chatCollapsed}
            onPress={() => setChatExpanded(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="chatbubble-ellipses-outline" size={16} color={theme.text.muted} />
            <Text style={s.chatCollapsedText}>Ask ORYX about your nutrition...</Text>
          </TouchableOpacity>
        ) : (
          <View style={s.chatContainer}>
            <View style={s.chatHeader}>
              <Text style={s.chatHeaderTitle}>Ask ORYX</Text>
              <TouchableOpacity onPress={() => setChatExpanded(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="chevron-down" size={18} color={theme.text.muted} />
              </TouchableOpacity>
            </View>
            <ScrollView
              ref={chatScrollRef}
              style={s.chatMessages}
              contentContainerStyle={{ paddingVertical: 8 }}
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
            >
              {chatMessages.length === 0 && (
                <Text style={s.chatEmptyHint}>
                  Ask anything — meal swaps, eating out, calorie targets, adjustments for today.
                </Text>
              )}
              {chatMessages.map((msg, idx) => (
                <View key={idx} style={[s.chatBubble, msg.role === 'user' ? s.chatBubbleUser : s.chatBubbleAssistant]}>
                  <Text style={s.chatBubbleText}>{msg.content}</Text>
                </View>
              ))}
              {chatLoading && (
                <View style={[s.chatBubbleAssistant, { paddingVertical: 12, paddingHorizontal: 16 }]}>
                  <ActivityIndicator size="small" color={theme.text.muted} />
                </View>
              )}
            </ScrollView>
            <View style={s.chatInputRow}>
              <TextInput
                style={s.chatInput}
                placeholder="Ask anything about your nutrition..."
                placeholderTextColor={theme.text.muted}
                value={chatInput}
                onChangeText={setChatInput}
                onSubmitEditing={handleSendChat}
                returnKeyType="send"
                multiline={false}
              />
              <TouchableOpacity
                style={[s.chatSendBtn, (!chatInput.trim() || chatLoading) && { opacity: 0.4 }]}
                onPress={handleSendChat}
                disabled={!chatInput.trim() || chatLoading}
                activeOpacity={0.7}
              >
                <Ionicons name="arrow-up" size={18} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Meal Modified Banner ── */}
        {mealModifiedBanner && (
          <View style={s.mealModifiedBanner}>
            <Ionicons name="checkmark-circle" size={16} color="#27ae60" />
            <Text style={s.mealModifiedBannerText}>{mealModifiedBanner}</Text>
          </View>
        )}

        {/* ── Water Tracking ── */}
        <Text style={s.sectionLabel}>HYDRATION</Text>
        <View style={s.card}>
          {/* Top row: amount display + settings */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <View>
              <Text style={{ fontSize: 22, fontWeight: '700', color: waterColor, lineHeight: 26 }}>
                {waterInputMode === 'ml'
                  ? `${waterAmountMl}ml`
                  : `${currentGlasses} / ${dropCount}`}
              </Text>
              <Text style={{ fontSize: 11, color: theme.text.muted, marginTop: 2 }}>
                Target: {(waterTargetMl / 1000).toFixed(1)}L · {Math.round(waterPct * 100)}%
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                setSettingsTargetInput('');
                setSettingsContainerSize(waterContainerSizeMl);
                setSettingsInputMode(waterInputMode);
                setWaterSettingsOpen(true);
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              activeOpacity={0.7}
            >
              <Ionicons name="settings-outline" size={16} color={theme.text.muted} />
            </TouchableOpacity>
          </View>

          {/* Drops row — glasses mode */}
          {waterInputMode !== 'ml' && (
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
              {Array.from({ length: dropCount }).map((_, i) => {
                const filled = i < currentGlasses;
                return (
                  <TouchableOpacity
                    key={i}
                    onPress={async () => {
                      if (waterLoading) return;
                      const newGlasses = i < currentGlasses ? i : i + 1;
                      const newAmountMl = newGlasses * waterContainerSizeMl;
                      setWaterAmountMl(newAmountMl);
                      setWaterLoading(true);
                      try {
                        const res = await patchWaterToday({ amount_ml: newAmountMl, container_size_ml: waterContainerSizeMl });
                        setWaterAmountMl(res.amount_ml);
                        setWaterTargetMl(res.target_ml);
                        setWaterContainerSizeMl(res.container_size_ml);
                      } catch {} finally { setWaterLoading(false); }
                    }}
                    activeOpacity={0.7}
                    style={{ flex: 1, alignItems: 'center' }}
                  >
                    <Ionicons
                      name={filled ? 'water' : 'water-outline'}
                      size={22}
                      color={filled ? waterColor : theme.border}
                    />
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* +/- buttons — ml mode */}
          {waterInputMode === 'ml' && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <TouchableOpacity
                onPress={async () => {
                  if (waterLoading) return;
                  const newVal = Math.max(0, waterAmountMl - waterContainerSizeMl);
                  setWaterAmountMl(newVal);
                  setWaterLoading(true);
                  try {
                    const res = await patchWaterToday({ amount_ml: newVal, container_size_ml: waterContainerSizeMl });
                    setWaterAmountMl(res.amount_ml);
                    setWaterTargetMl(res.target_ml);
                    setWaterContainerSizeMl(res.container_size_ml);
                  } catch {} finally { setWaterLoading(false); }
                }}
                style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#252525', borderWidth: 1, borderColor: '#333', alignItems: 'center', justifyContent: 'center' }}
                activeOpacity={0.7}
              >
                <Ionicons name="remove" size={20} color={theme.text.primary} />
              </TouchableOpacity>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: waterColor }}>{waterAmountMl}ml</Text>
                <Text style={{ fontSize: 10, color: theme.text.muted, marginTop: 1 }}>+{waterContainerSizeMl}ml per tap</Text>
              </View>
              <TouchableOpacity
                onPress={async () => {
                  if (waterLoading) return;
                  const newVal = waterAmountMl + waterContainerSizeMl;
                  setWaterAmountMl(newVal);
                  setWaterLoading(true);
                  try {
                    const res = await patchWaterToday({ amount_ml: newVal, container_size_ml: waterContainerSizeMl });
                    setWaterAmountMl(res.amount_ml);
                    setWaterTargetMl(res.target_ml);
                    setWaterContainerSizeMl(res.container_size_ml);
                  } catch {} finally { setWaterLoading(false); }
                }}
                style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#252525', borderWidth: 1, borderColor: '#333', alignItems: 'center', justifyContent: 'center' }}
                activeOpacity={0.7}
              >
                <Ionicons name="add" size={20} color={theme.text.primary} />
              </TouchableOpacity>
            </View>
          )}

          {/* Progress bar */}
          <View style={{ height: 5, backgroundColor: theme.border, borderRadius: 3, overflow: 'hidden', marginBottom: 6 }}>
            <View style={{
              width: `${Math.round(Math.min(waterPct, 1) * 100)}%` as any,
              height: '100%', backgroundColor: waterColor, borderRadius: 3,
            }} />
          </View>

          {/* Recommended note if target has been overridden */}
          {waterRecommendedMl > 0 && Math.abs(waterTargetMl - waterRecommendedMl) > 50 && (
            <Text style={{ fontSize: 10, color: theme.text.muted, marginTop: 4 }}>
              Recommended: {(waterRecommendedMl / 1000).toFixed(1)}L based on your profile
            </Text>
          )}
        </View>

        {/* ── Water Settings Modal ── */}
        <Modal
          visible={waterSettingsOpen}
          transparent
          animationType="slide"
          onRequestClose={() => setWaterSettingsOpen(false)}
        >
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }}
            activeOpacity={1}
            onPress={() => setWaterSettingsOpen(false)}
          />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}
          >
            <View style={{ backgroundColor: '#1a1a1a', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40, borderTopWidth: 1, borderTopColor: '#2a2a2a' }}>
              {/* Sheet header */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: theme.text.primary }}>Water Settings</Text>
                <TouchableOpacity onPress={() => setWaterSettingsOpen(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="close" size={20} color={theme.text.muted} />
                </TouchableOpacity>
              </View>

              {/* Input mode toggle */}
              <Text style={{ fontSize: 11, color: theme.text.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>Input Mode</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
                {(['glasses', 'ml'] as const).map(mode => (
                  <TouchableOpacity
                    key={mode}
                    onPress={() => setSettingsInputMode(mode)}
                    style={{
                      flex: 1, paddingVertical: 9, borderRadius: 10, borderWidth: 1, alignItems: 'center',
                      borderColor: settingsInputMode === mode ? theme.accent : '#333',
                      backgroundColor: settingsInputMode === mode ? `${theme.accent}22` : 'transparent',
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '600', color: settingsInputMode === mode ? theme.accent : theme.text.muted }}>
                      {mode === 'glasses' ? 'Glasses' : 'Millilitres'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Container size pills */}
              <Text style={{ fontSize: 11, color: theme.text.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>Container Size</Text>
              <View style={{ flexDirection: 'row', gap: 6, marginBottom: 20 }}>
                {[200, 250, 330, 400, 500].map(ml => (
                  <TouchableOpacity
                    key={ml}
                    onPress={() => setSettingsContainerSize(ml)}
                    style={{
                      flex: 1, paddingVertical: 7, borderRadius: 8, borderWidth: 1, alignItems: 'center',
                      borderColor: settingsContainerSize === ml ? theme.accent : '#333',
                      backgroundColor: settingsContainerSize === ml ? `${theme.accent}22` : 'transparent',
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '600', color: settingsContainerSize === ml ? theme.accent : theme.text.muted }}>
                      {ml}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Daily target override */}
              <Text style={{ fontSize: 11, color: theme.text.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>Daily Target (ml)</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 6 }}>
                <TextInput
                  style={{ flex: 1, height: 44, backgroundColor: '#252525', borderRadius: 10, borderWidth: 1, borderColor: '#333', paddingHorizontal: 12, fontSize: 15, color: theme.text.primary }}
                  placeholder={`${waterTargetMl} (current)`}
                  placeholderTextColor={theme.text.muted}
                  value={settingsTargetInput}
                  onChangeText={setSettingsTargetInput}
                  keyboardType="number-pad"
                />
                <TouchableOpacity
                  onPress={() => setSettingsTargetInput('')}
                  style={{ height: 44, paddingHorizontal: 14, backgroundColor: '#252525', borderRadius: 10, borderWidth: 1, borderColor: '#333', alignItems: 'center', justifyContent: 'center' }}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 12, color: theme.text.muted }}>Reset</Text>
                </TouchableOpacity>
              </View>
              <Text style={{ fontSize: 11, color: theme.text.muted, marginBottom: 22 }}>
                Recommended: {(waterRecommendedMl / 1000).toFixed(1)}L · leave blank to use recommendation
              </Text>

              {/* Save */}
              <TouchableOpacity
                onPress={handleSaveWaterSettings}
                style={{ height: 48, backgroundColor: theme.accent, borderRadius: 12, alignItems: 'center', justifyContent: 'center', opacity: waterLoading ? 0.6 : 1 }}
                disabled={waterLoading}
                activeOpacity={0.85}
              >
                {waterLoading
                  ? <ActivityIndicator size="small" color={theme.bg.primary} />
                  : <Text style={{ fontSize: 15, fontWeight: '700', color: theme.bg.primary }}>Save Settings</Text>
                }
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* ── Fibre & Micronutrients ── */}
        <Text style={s.sectionLabel}>FIBRE & MICRONUTRIENTS</Text>
        <View style={s.card}>
          <Text style={s.microNote}>
            Fibre, sugar & sodium are tracked from logged meals. Other targets are shown for reference.
          </Text>
          {(() => {
            // Determine "lowest-pct micro" from items 3-8 (after fibre, sugar, sodium)
            const rest = MICRO_DEFS.slice(3);
            let lowestIdx = 3;
            let lowestPct = Infinity;
            rest.forEach((micro, i) => {
              const consumed = micro.consumedKey != null ? (summary?.[micro.consumedKey] as number | undefined ?? null) : null;
              const goalVal = targets ? (targets[micro.key] as number | null) : null;
              if (consumed != null && goalVal != null && goalVal > 0) {
                const pct = consumed / goalVal;
                if (pct < lowestPct) { lowestPct = pct; lowestIdx = i + 3; }
              }
            });
            const defaultVisible = new Set([0, 1, 2, lowestIdx]);
            const visibleMicros = microsExpanded ? MICRO_DEFS : MICRO_DEFS.filter((_, i) => defaultVisible.has(i));
            return visibleMicros.map((micro, idx) => {
              const consumed = micro.consumedKey != null
                ? (summary?.[micro.consumedKey] as number | undefined ?? null)
                : null;
              const goalVal = targets ? (targets[micro.key] as number | null) : null;
              const goalText = targets ? micro.goalLabel(targets) : '—';
              const barValue = (consumed != null && goalVal != null && goalVal > 0)
                ? Math.min(consumed / goalVal, 1)
                : 0;
              const hasData = consumed != null;
              const valStr = hasData ? `${Math.round(consumed!)}${micro.unit}` : '—';
              return (
                <View key={micro.key}>
                  {idx > 0 && <View style={s.microDivider} />}
                  <View style={s.microRow}>
                    <View style={s.microLabelBlock}>
                      <Text style={s.microLabel} numberOfLines={1}>{micro.label}</Text>
                      <Text style={s.microTarget} numberOfLines={1}>{goalText}</Text>
                    </View>
                    <View style={s.microBarGroup}>
                      {hasData
                        ? <ProgressBar value={barValue} color={theme.status.success} />
                        : <View style={{ flex: 1, height: 5, backgroundColor: theme.border, borderRadius: 3, opacity: 0.4 }} />
                      }
                      <Text style={[s.microValue, !hasData && { color: theme.text.muted }]} numberOfLines={1}>
                        {valStr}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            });
          })()}
          <TouchableOpacity
            style={s.microExpandBtn}
            onPress={() => setMicrosExpanded(v => !v)}
            activeOpacity={0.7}
          >
            <Text style={s.microExpandText}>{microsExpanded ? 'Show less' : 'Show all'}</Text>
            <Ionicons name={microsExpanded ? 'chevron-up' : 'chevron-down'} size={12} color={theme.text.muted} />
          </TouchableOpacity>
        </View>

        {/* ── Meals Section ── */}
        <View style={s.mealsSectionHeader}>
          <Text style={s.sectionLabel}>TODAY'S MEALS</Text>
          <TouchableOpacity style={s.logMealInlineBtn} onPress={() => setShowFoodSearchModal(true)} activeOpacity={0.85}>
            <Ionicons name="add" size={16} color={theme.bg.primary} />
            <Text style={s.logMealInlineBtnText}>Log Meal</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={s.loadingRow}><ActivityIndicator size="small" color={theme.text.muted} /></View>
        ) : todayLogs.length === 0 ? (
          <View style={s.emptyState}>
            <Ionicons name="restaurant-outline" size={44} color={theme.border} />
            <Text style={s.emptyTitle}>Nothing logged yet</Text>
            <Text style={s.emptySubtitle}>Tap + Log Meal or scan a photo to add your first entry</Text>
          </View>
        ) : (
          <View style={s.mealsSection}>
            {todayLogs.map((entry) => (
              <View key={entry.id} style={s.mealCard}>
                <View style={s.mealLeft}>
                  <View style={s.mealNameRow}>
                    {entry.source === 'scan' && (
                      <Ionicons name="camera" size={12} color={theme.text.muted} style={{ marginRight: 4 }} />
                    )}
                    <Text style={s.mealName}>{entry.meal_name}</Text>
                  </View>
                  <View style={s.macroChipsRow}>
                    {entry.calories !== null && (
                      <View style={s.macroChip}>
                        <Text style={s.macroChipText}>{entry.calories} kcal</Text>
                      </View>
                    )}
                    {entry.protein_g !== null && (
                      <View style={[s.macroChip, { borderColor: theme.bg.elevated }]}>
                        <Text style={[s.macroChipText, { color: theme.accent }]}>{entry.protein_g}g P</Text>
                      </View>
                    )}
                    {entry.carbs_g !== null && (
                      <View style={[s.macroChip, { borderColor: 'rgba(255,184,0,0.4)' }]}>
                        <Text style={[s.macroChipText, { color: '#888888' }]}>{entry.carbs_g}g C</Text>
                      </View>
                    )}
                    {entry.fat_g !== null && (
                      <View style={[s.macroChip, { borderColor: 'rgba(255,107,53,0.4)' }]}>
                        <Text style={[s.macroChipText, { color: '#FF6B35' }]}>{entry.fat_g}g F</Text>
                      </View>
                    )}
                  </View>
                </View>
                <TouchableOpacity
                  onPress={() => handleDelete(entry.id)}
                  style={s.deleteBtn}
                  activeOpacity={0.6}
                >
                  <Ionicons name="trash-outline" size={16} color={theme.text.secondary} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* ── Meal Plan Section ── */}
        {mealPlanLoading ? (
          <View style={s.mealPlanSkeletonWrap}>
            <View style={s.skeletonBlock} />
            <View style={[s.skeletonBlock, { height: 80, marginTop: 10 }]} />
            <View style={[s.skeletonBlock, { height: 80, marginTop: 10 }]} />
          </View>
        ) : !surveyComplete ? (
          <TouchableOpacity
            style={s.surveyPromptCard}
            onPress={() => router.push('/nutrition-survey' as any)}
            activeOpacity={0.85}
          >
            <View style={s.surveyPromptLeft}>
              <View style={s.surveyIconWrap}>
                <Ionicons name="nutrition-outline" size={22} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.surveyPromptTitle}>Set Up Your Meal Plan</Text>
                <Text style={s.surveyPromptSub}>
                  Answer 6 quick questions to get AI-powered daily meal plans tailored to your goals
                </Text>
              </View>
            </View>
            <View style={s.surveyPromptBtn}>
              <Text style={s.surveyPromptBtnText}>Get Started</Text>
              <Ionicons name="arrow-forward" size={14} color={theme.bg.primary} />
            </View>
          </TouchableOpacity>
        ) : surveyComplete && !mealPlan ? (
          <View style={s.mpErrorWrap}>
            <Text style={s.mpErrorText}>
              {mealPlanError ?? 'Meal plan unavailable.'}
            </Text>
            <TouchableOpacity onPress={loadMealPlan} activeOpacity={0.7}>
              <Text style={s.mpErrorRetry}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : mealPlan ? (
          <>
            {/* Compact Meal Plan Header — tappable to collapse */}
            <TouchableOpacity
              style={s.mpRow}
              onPress={() => setMealPlanExpanded(v => !v)}
              activeOpacity={0.7}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={s.mpTitle}>Today's Meal Plan</Text>
                {mealPlan.is_cheat_day && <View style={s.cheatDot} />}
              </View>
              <Ionicons
                name={mealPlanExpanded ? 'chevron-up' : 'chevron-down'}
                size={15}
                color={theme.text.muted}
              />
            </TouchableOpacity>
            {mealPlan.is_cheat_day && mealPlanExpanded && (
              <Text style={s.cheatDayLine}>Cheat day — enjoy it.</Text>
            )}

            {/* Collapsible body */}
            {mealPlanExpanded && <>
            <View style={s.mpMealList}>
              {mealPlan.meals.map((meal) => {
                const isExpanded = expandedMealId === meal.meal_name;
                return (
                  <View key={meal.meal_name}>
                    <TouchableOpacity
                      style={s.mpMealRow}
                      onPress={() => setExpandedMealId(isExpanded ? null : meal.meal_name)}
                      activeOpacity={0.7}
                    >
                      {(() => {
                        // Parse meal.time e.g. "8:00 AM", "12:30 PM"
                        const now2 = new Date();
                        const match = /^(\d+):(\d+)\s*(AM|PM)$/i.exec(meal.time?.trim() ?? '');
                        let dotColor: string = '#333';
                        if (match) {
                          let h = parseInt(match[1], 10);
                          const m = parseInt(match[2], 10);
                          if (match[3].toUpperCase() === 'PM' && h !== 12) h += 12;
                          if (match[3].toUpperCase() === 'AM' && h === 12) h = 0;
                          const mealMinutes = h * 60 + m;
                          const nowMinutes = now2.getHours() * 60 + now2.getMinutes();
                          const diff = Math.abs(nowMinutes - mealMinutes);
                          if (diff <= 30) dotColor = '#27ae60';       // current window
                          else if (mealMinutes < nowMinutes) dotColor = '#444'; // past
                          else dotColor = '#555';                               // upcoming
                        }
                        const isCurrent = dotColor === '#27ae60';
                        return (
                          <View style={[s.mpTimingDot, { backgroundColor: dotColor }, isCurrent && { opacity: 1 }]} />
                        );
                      })()}
                      <Text style={s.mpMealTime}>{meal.time}</Text>
                      <Text style={s.mpMealName} numberOfLines={1}>{meal.meal_name}</Text>
                      <Text style={s.mpMealCals}>{meal.calories}</Text>
                      <Ionicons name={isExpanded ? 'chevron-down' : 'chevron-forward'} size={13} color="#444" />
                    </TouchableOpacity>
                    {isExpanded && (
                      <View style={s.mpMealExpanded}>
                        {meal.ingredients.length > 0 && (
                          <View style={{ marginBottom: 8 }}>
                            {meal.ingredients.map((ing, i) => (
                              <Text key={i} style={s.mpIngredient}>· {ing}</Text>
                            ))}
                          </View>
                        )}
                        {!!meal.prep_note && (
                          <Text style={s.mpPrepNote}>{meal.prep_note}</Text>
                        )}
                        <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                          <TouchableOpacity style={s.mpLogBtn} onPress={() => handleLogMealFromPlan(meal)} activeOpacity={0.85}>
                            <Text style={s.mpLogBtnText}>Log</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => handleBookmarkMeal(meal)} activeOpacity={0.8}>
                            <Ionicons name="bookmark-outline" size={16} color="#555" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>

            {/* AI nutrition note */}
            {!!mealPlan.nutrition_note && (
              <Text style={s.mpNote}>{mealPlan.nutrition_note}</Text>
            )}

            {/* Regenerate button */}
            <TouchableOpacity
              onPress={handleRegenerateMealPlan}
              disabled={regenerating}
              style={[s.regenBtn, regenerating && { opacity: 0.35 }]}
              activeOpacity={0.7}
            >
              {regenerating
                ? <ActivityIndicator size="small" color={theme.text.secondary} />
                : <>
                    <Ionicons name="refresh-outline" size={13} color={theme.text.secondary} />
                    <Text style={s.regenBtnText}>Regenerate</Text>
                  </>
              }
            </TouchableOpacity>

            {/* Grocery List — collapsible */}
            {mealPlan.grocery_items.length > 0 && (() => {
              const checkedCount = mealPlan.grocery_items.filter(i => !!groceryChecked[i]).length;
              const total = mealPlan.grocery_items.length;
              return (
                <View style={s.groceryCard}>
                  {/* Header — always visible */}
                  <TouchableOpacity
                    style={s.groceryHeader}
                    onPress={() => setGroceryExpanded(v => !v)}
                    activeOpacity={0.7}
                  >
                    <View style={s.groceryHeaderLeft}>
                      <Ionicons name="cart-outline" size={18} color={theme.text.secondary} />
                      <Text style={s.groceryHeaderTitle}>Weekly Grocery List</Text>
                    </View>
                    <View style={s.groceryHeaderRight}>
                      {checkedCount > 0 && (
                        <Text style={s.groceryHeaderCount}>{checkedCount}/{total}</Text>
                      )}
                      {checkedCount === 0 && (
                        <Text style={s.groceryHeaderCount}>{total} items</Text>
                      )}
                      <Ionicons
                        name={groceryExpanded ? 'chevron-up' : 'chevron-down'}
                        size={16}
                        color={theme.text.muted}
                      />
                    </View>
                  </TouchableOpacity>

                  {/* Progress bar */}
                  {checkedCount > 0 && (
                    <View style={s.groceryProgress}>
                      <View style={[s.groceryProgressFill, { width: `${(checkedCount / total) * 100}%` as any }]} />
                    </View>
                  )}

                  {/* Expanded list */}
                  {groceryExpanded && (
                    <View style={s.groceryList}>
                      {mealPlan.grocery_items.map((item, idx) => {
                        const checked = !!groceryChecked[item];
                        const dashIdx = item.indexOf(' — ');
                        const itemName = dashIdx !== -1 ? item.slice(0, dashIdx) : item;
                        const itemQty = dashIdx !== -1 ? item.slice(dashIdx + 3) : null;
                        return (
                          <TouchableOpacity
                            key={idx}
                            style={[s.groceryRow, checked && s.groceryRowChecked]}
                            onPress={() => handleToggleGrocery(item)}
                            activeOpacity={0.6}
                          >
                            <Ionicons
                              name={checked ? 'checkmark-circle' : 'ellipse-outline'}
                              size={20}
                              color={checked ? theme.status.success : theme.text.muted}
                            />
                            <View style={s.groceryItemBody}>
                              <Text style={[s.groceryItem, checked && s.groceryItemDone]}>{itemName}</Text>
                              {itemQty && (
                                <Text style={[s.groceryItemQty, checked && s.groceryItemDone]}>{itemQty}</Text>
                              )}
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            })()}

            {/* Saved Meals */}
            {savedMeals.length > 0 && (
              <>
                <Text style={[s.sectionLabel, { marginTop: 8 }]}>SAVED MEALS</Text>
                <View style={{ gap: 8, marginBottom: 4 }}>
                  {savedMeals.map((meal) => (
                    <View key={meal.id} style={s.savedMealCard}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.savedMealName}>{meal.meal_name}</Text>
                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                          {!!meal.calories && <Text style={s.savedMealMacro}>{meal.calories} kcal</Text>}
                          {!!meal.protein_g && <Text style={[s.savedMealMacro, { color: theme.accent }]}>{meal.protein_g}g P</Text>}
                          {!!meal.carbs_g && <Text style={s.savedMealMacro}>{meal.carbs_g}g C</Text>}
                          {!!meal.fat_g && <Text style={[s.savedMealMacro, { color: '#FF6B35' }]}>{meal.fat_g}g F</Text>}
                        </View>
                      </View>
                      <TouchableOpacity onPress={() => handleDeleteSavedMeal(meal.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ padding: 4, marginLeft: 8 }}>
                        <Ionicons name="bookmark" size={17} color={theme.accent} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              </>
            )}

            <View style={{ height: 4 }} />
            </>}
          </>
        ) : null}

        {/* ── Weekly Nutrition Summary ── */}
        {weeklySummary && (
          <>
            <Text style={[s.sectionLabel, { marginTop: 12 }]}>THIS WEEK</Text>
            <View style={s.weeklyCard}>
              <View style={s.weeklyGrid}>
                <View style={s.weeklyCell}>
                  <Text style={s.weeklyCellValue}>{Math.round(weeklySummary.avg_daily_calories)}</Text>
                  <Text style={s.weeklyCellLabel}>Avg kcal/day</Text>
                </View>
                <View style={[s.weeklyCell, s.weeklyCellBorderLeft]}>
                  <Text style={s.weeklyCellValue}>{Math.round(weeklySummary.avg_daily_protein)}g</Text>
                  <Text style={s.weeklyCellLabel}>Avg protein</Text>
                </View>
                <View style={[s.weeklyCell, s.weeklyCellBorderTop]}>
                  <Text style={s.weeklyCellValue}>{weeklySummary.days_calorie_target_hit}/7</Text>
                  <Text style={s.weeklyCellLabel}>Calorie days</Text>
                </View>
                <View style={[s.weeklyCell, s.weeklyCellBorderLeft, s.weeklyCellBorderTop]}>
                  <Text style={s.weeklyCellValue}>{weeklySummary.days_protein_target_hit}/7</Text>
                  <Text style={s.weeklyCellLabel}>Protein days</Text>
                </View>
              </View>
              {weeklySummary.last_week_avg_calories > 0 && (
                <Text style={s.weeklyCompare}>
                  Last week: {Math.round(weeklySummary.last_week_avg_calories)} kcal avg · {Math.round(weeklySummary.last_week_avg_protein)}g protein
                </Text>
              )}
            </View>
          </>
        )}

        <View style={s.bottomPadding} />
      </ScrollView>

      {/* ── Manual Add Modal ── */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => { setShowAddModal(false); setShowExtra(false); }}
      >
        <KeyboardAvoidingView style={s.modalWrapper} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={s.modalContent} keyboardShouldPersistTaps="handled">
            <View style={s.modalHandle} />
            <View style={s.modalHeaderRow}>
              <Text style={s.modalTitle}>Log a Meal</Text>
              <TouchableOpacity onPress={() => { setShowAddModal(false); setShowExtra(false); }}>
                <Ionicons name="close" size={22} color={theme.text.muted} />
              </TouchableOpacity>
            </View>

            <Text style={s.modalFieldLabel}>Meal name *</Text>
            <TextInput
              style={s.modalInput}
              placeholder="e.g. Chicken & rice"
              placeholderTextColor={theme.text.muted}
              value={nutritionForm.meal_name}
              onChangeText={(v) => setNutritionForm((p) => ({ ...p, meal_name: v }))}
              autoFocus
              returnKeyType="next"
            />

            <Text style={s.modalFieldLabel}>Calories & Macros</Text>
            <View style={s.macroInputGrid}>
              {[
                { key: 'calories', label: 'Calories', unit: 'kcal', color: theme.text.primary },
                { key: 'protein_g', label: 'Protein', unit: 'g', color: theme.accent },
                { key: 'carbs_g', label: 'Carbs', unit: 'g', color: '#888888' },
                { key: 'fat_g', label: 'Fat', unit: 'g', color: '#FF6B35' },
              ].map(({ key, label, unit, color }) => (
                <View key={key} style={s.macroInputBox}>
                  <TextInput
                    style={[s.macroInput, { color }]}
                    placeholder="—"
                    placeholderTextColor={theme.border}
                    keyboardType="numeric"
                    value={nutritionForm[key as keyof typeof nutritionForm]}
                    onChangeText={(v) => setNutritionForm((p) => ({ ...p, [key]: v }))}
                  />
                  <Text style={s.macroInputUnit}>{unit}</Text>
                  <Text style={s.macroInputLabel}>{label}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity style={s.extraToggle} onPress={() => setShowExtra((v) => !v)} activeOpacity={0.75}>
              <Ionicons name={showExtra ? 'remove-circle-outline' : 'add-circle-outline'} size={18} color={theme.text.muted} />
              <Text style={s.extraToggleText}>{showExtra ? 'Hide' : 'Add'} extra details</Text>
            </TouchableOpacity>

            {showExtra && (
              <View style={s.extraSection}>
                <Text style={s.modalFieldLabel}>Fibre (g)</Text>
                <TextInput
                  style={s.modalInput}
                  placeholder="e.g. 8"
                  placeholderTextColor={theme.text.muted}
                  keyboardType="numeric"
                  value={nutritionForm.fibre_g}
                  onChangeText={(v) => setNutritionForm((p) => ({ ...p, fibre_g: v }))}
                />
                <Text style={s.modalFieldLabel}>Notes</Text>
                <TextInput
                  style={[s.modalInput, s.textArea]}
                  placeholder="Any notes…"
                  placeholderTextColor={theme.text.muted}
                  multiline
                  numberOfLines={2}
                  value={nutritionForm.notes}
                  onChangeText={(v) => setNutritionForm((p) => ({ ...p, notes: v }))}
                  textAlignVertical="top"
                />
              </View>
            )}

            <TouchableOpacity
              style={[s.logBtn, submitting && s.btnDisabled]}
              onPress={handleLogMeal}
              disabled={submitting}
              activeOpacity={0.85}
            >
              {submitting
                ? <ActivityIndicator size="small" color={theme.bg.primary} />
                : <Text style={s.logBtnText}>Log Meal</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity
              style={s.cancelBtn}
              onPress={() => { setShowAddModal(false); setShowExtra(false); }}
              activeOpacity={0.7}
            >
              <Text style={s.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Food Search Modal ── */}
      <FoodSearchModal
        visible={showFoodSearchModal}
        onClose={() => setShowFoodSearchModal(false)}
        onLogged={(log) => setTodayLogs((prev) => [...prev, log])}
      />

      {/* ── Scan Modal ── */}
      <Modal
        visible={showScanModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={resetScan}
      >
        <KeyboardAvoidingView style={s.modalWrapper} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={s.modalContent} keyboardShouldPersistTaps="handled">
            <View style={s.modalHandle} />
            <View style={s.modalHeaderRow}>
              <Text style={s.modalTitle}>
                {scanLoading ? 'Analyzing Photo…' : scanError ? 'Scan Failed' : 'Review & Log'}
              </Text>
              <TouchableOpacity onPress={resetScan}>
                <Ionicons name="close" size={22} color={theme.text.muted} />
              </TouchableOpacity>
            </View>

            {scanLoading ? (
              /* Loading state */
              <View style={s.scanLoadingContainer}>
                {scanImageUri && (
                  <Image source={{ uri: scanImageUri }} style={s.scanThumbnailLarge} />
                )}
                <ScanLoadingDots />
                <Text style={s.scanLoadingText}>Identifying food items…</Text>
                <Text style={s.scanLoadingSubtext}>Using AI vision to analyze your photo</Text>
              </View>
            ) : scanResult ? (
              /* Results state */
              <>
                {scanResult.low_confidence && (
                  <View style={s.confidenceWarning}>
                    <Ionicons name="warning-outline" size={15} color={theme.text.secondary} />
                    <Text style={s.confidenceWarningText}>
                      Low confidence result. Review values carefully or try a clearer photo.
                    </Text>
                  </View>
                )}

                {/* Photo + food info card */}
                <View style={s.scanResultCard}>
                  {scanImageUri && (
                    <Image source={{ uri: scanImageUri }} style={s.scanThumbnail} />
                  )}
                  <View style={s.scanResultInfo}>
                    <Text style={s.scanFoodName} numberOfLines={2}>{scanResult.food_name}</Text>
                    <Text style={s.scanDescription} numberOfLines={2}>{scanResult.description}</Text>
                    <Text style={s.scanServing}>{scanResult.serving_estimate}</Text>
                  </View>
                </View>

                {/* Editable meal name */}
                <Text style={s.modalFieldLabel}>Meal Name</Text>
                <TextInput
                  style={s.modalInput}
                  value={scanForm.meal_name}
                  onChangeText={(v) => setScanForm((p) => ({ ...p, meal_name: v }))}
                  placeholderTextColor={theme.text.muted}
                  placeholder="Meal name"
                />

                {/* Editable macros */}
                <Text style={s.modalFieldLabel}>Nutrition (tap to edit)</Text>
                <View style={s.macroInputGrid}>
                  {[
                    { key: 'calories', label: 'Calories', unit: 'kcal', color: theme.text.primary },
                    { key: 'protein_g', label: 'Protein', unit: 'g', color: theme.accent },
                    { key: 'carbs_g', label: 'Carbs', unit: 'g', color: '#888888' },
                    { key: 'fat_g', label: 'Fat', unit: 'g', color: '#FF6B35' },
                  ].map(({ key, label, unit, color }) => (
                    <View key={key} style={s.macroInputBox}>
                      <TextInput
                        style={[s.macroInput, { color }]}
                        keyboardType="numeric"
                        value={scanForm[key as keyof typeof scanForm]}
                        onChangeText={(v) => setScanForm((p) => ({ ...p, [key]: v }))}
                        placeholder="0"
                        placeholderTextColor={theme.border}
                      />
                      <Text style={s.macroInputUnit}>{unit}</Text>
                      <Text style={s.macroInputLabel}>{label}</Text>
                    </View>
                  ))}
                </View>

                {/* Fibre */}
                <Text style={s.modalFieldLabel}>Fibre (g)</Text>
                <TextInput
                  style={s.modalInput}
                  keyboardType="numeric"
                  value={scanForm.fibre_g}
                  onChangeText={(v) => setScanForm((p) => ({ ...p, fibre_g: v }))}
                  placeholder="0"
                  placeholderTextColor={theme.text.muted}
                />

                {/* Actions */}
                <TouchableOpacity
                  style={[s.logBtn, scanSubmitting && s.btnDisabled]}
                  onPress={handleConfirmScan}
                  disabled={scanSubmitting}
                  activeOpacity={0.85}
                >
                  {scanSubmitting
                    ? <ActivityIndicator size="small" color={theme.bg.primary} />
                    : <Text style={s.logBtnText}>Confirm & Log</Text>
                  }
                </TouchableOpacity>

                <TouchableOpacity style={s.scanRetryBtn} onPress={() => { resetScan(); handleScanPhoto(); }} activeOpacity={0.75}>
                  <Ionicons name="refresh-outline" size={16} color={theme.text.secondary} />
                  <Text style={s.scanRetryText}>Scan Again</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={s.cancelBtn}
                  onPress={() => { resetScan(); setShowAddModal(true); }}
                  activeOpacity={0.7}
                >
                  <Text style={s.cancelBtnText}>Enter Manually Instead</Text>
                </TouchableOpacity>
              </>
            ) : scanError ? (
              /* Error state */
              <View style={s.scanErrorContainer}>
                {scanImageUri && (
                  <Image source={{ uri: scanImageUri }} style={s.scanThumbnailLarge} />
                )}
                <Ionicons name="alert-circle-outline" size={40} color="#FF6B35" style={{ marginTop: 16 }} />
                <Text style={s.scanErrorTitle}>Could not analyze this photo</Text>
                <Text style={s.scanErrorDetail}>{scanError}</Text>
                <TouchableOpacity style={s.scanRetryBtn} onPress={() => { resetScan(); handleScanPhoto(); }} activeOpacity={0.75}>
                  <Ionicons name="refresh-outline" size={16} color={theme.text.secondary} />
                  <Text style={s.scanRetryText}>Try Again</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.cancelBtn}
                  onPress={() => { resetScan(); setShowAddModal(true); }}
                  activeOpacity={0.7}
                >
                  <Text style={s.cancelBtnText}>Enter Manually Instead</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function createStyles(t: ThemeColors) {
  return StyleSheet.create({
    // Header icon
    headerIconBtn: {
      width: 40, height: 40, borderRadius: 20,
      borderWidth: 1, borderColor: t.border,
      alignItems: 'center', justifyContent: 'center',
    },

    // Survey prompt card
    surveyPromptCard: {
      backgroundColor: '#1a1a1a', borderRadius: 20, padding: 20,
      borderWidth: 1, borderColor: '#2a2a2a', marginBottom: 20, gap: 16,
    },
    surveyPromptLeft: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
    surveyIconWrap: {
      width: 44, height: 44, borderRadius: 14,
      backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    },
    surveyPromptTitle: { fontSize: 16, fontWeight: '700', color: t.text.primary, marginBottom: 4 },
    surveyPromptSub: { fontSize: 13, color: t.text.secondary, lineHeight: 18 },
    surveyPromptBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: t.text.primary, borderRadius: 12,
      paddingHorizontal: 20, paddingVertical: 12, alignSelf: 'flex-end',
    },
    surveyPromptBtnText: { fontSize: 14, fontWeight: '700', color: t.bg.primary },

    // Meal plan skeleton
    mealPlanSkeletonWrap: { marginBottom: 20 },
    skeletonBlock: { height: 120, backgroundColor: t.bg.elevated, borderRadius: 16 },

    // Meal plan header
    mealPlanHeader: {
      backgroundColor: '#1a1a1a', borderRadius: 20, padding: 20,
      borderWidth: 1, borderColor: '#2a2a2a', marginBottom: 16,
    },
    mealPlanHeaderTop: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8,
    },
    mealPlanTitle: { fontSize: 20, fontWeight: '700', color: t.text.primary },
    cheatDayBadge: {
      backgroundColor: '#FF6B3520', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4,
      borderWidth: 1, borderColor: '#FF6B35',
    },
    cheatDayText: { fontSize: 11, fontWeight: '700', color: '#FF6B35', letterSpacing: 1 },
    mealPlanNote: { fontSize: 13, color: t.text.secondary, lineHeight: 18, marginBottom: 14 },
    macroPillsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 14 },
    macroPill: {
      flexDirection: 'row', alignItems: 'baseline',
      backgroundColor: t.bg.elevated, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6,
      borderWidth: 1, borderColor: t.border,
    },
    macroPillNum: { fontSize: 15, fontWeight: '700', color: t.text.primary },
    macroPillUnit: { fontSize: 10, color: t.text.muted },
    regenBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      borderRadius: 10, borderWidth: 1, borderColor: t.border,
      paddingHorizontal: 14, paddingVertical: 8, alignSelf: 'flex-start',
    },
    regenBtnText: { fontSize: 13, color: t.text.secondary },

    // Meal plan cards
    mealPlanCard: {
      backgroundColor: t.bg.elevated, borderRadius: 16, padding: 16,
      borderWidth: 1, borderColor: t.border, marginBottom: 10,
    },
    mealPlanCardTop: { flexDirection: 'row', alignItems: 'flex-start' },
    mealPlanCardTime: {
      fontSize: 10, color: t.text.muted, fontWeight: '600',
      textTransform: 'uppercase', letterSpacing: 0.5,
    },
    mealPlanCardName: { fontSize: 16, fontWeight: '600', color: t.text.primary },
    mealPlanCardMacro: { fontSize: 12, color: t.text.secondary },
    mealPlanCardExpanded: { marginTop: 14, gap: 12, borderTopWidth: 1, borderTopColor: t.border, paddingTop: 14 },
    mealPlanCardSection: { gap: 4 },
    mealPlanCardSectionLabel: {
      fontSize: 10, color: t.text.muted, fontWeight: '700',
      textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2,
    },
    mealPlanCardIngredient: { fontSize: 14, color: t.text.secondary, lineHeight: 20 },
    mealPlanCardPrepNote: { fontSize: 14, color: t.text.secondary, lineHeight: 20 },
    mealPlanCardActions: { flexDirection: 'row', gap: 10 },
    logFromPlanBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1,
      backgroundColor: t.text.primary, borderRadius: 10,
      paddingVertical: 10, justifyContent: 'center',
    },
    logFromPlanBtnText: { fontSize: 13, fontWeight: '700', color: t.bg.primary },
    bookmarkBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      borderWidth: 1, borderColor: t.border, borderRadius: 10,
      paddingHorizontal: 14, paddingVertical: 10,
    },
    bookmarkBtnText: { fontSize: 13, color: t.text.secondary },

    // Grocery checklist
    groceryCard: {
      backgroundColor: t.bg.elevated, borderRadius: 16,
      borderWidth: 1, borderColor: t.border, marginBottom: 4,
      overflow: 'hidden',
    },
    groceryHeader: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingVertical: 14,
    },
    groceryHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    groceryHeaderTitle: { fontSize: 14, fontWeight: '600', color: t.text.primary },
    groceryHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    groceryHeaderCount: { fontSize: 13, color: t.text.muted },
    groceryProgress: {
      height: 3, backgroundColor: t.border, marginHorizontal: 16, borderRadius: 2, marginBottom: 4,
    },
    groceryProgressFill: {
      height: 3, backgroundColor: t.text.secondary, borderRadius: 2,
    },
    groceryList: { paddingHorizontal: 16, paddingBottom: 12, paddingTop: 4 },
    groceryRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      paddingVertical: 11,
      borderBottomWidth: 1, borderBottomColor: t.border,
    },
    groceryRowChecked: { opacity: 0.55 },
    groceryItemBody: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    groceryItem: { fontSize: 14, color: t.text.primary, flex: 1 },
    groceryItemQty: { fontSize: 13, color: t.text.muted, textAlign: 'right' },
    groceryItemDone: { color: t.text.muted, textDecorationLine: 'line-through' },

    // Saved meals
    savedMealCard: {
      backgroundColor: t.bg.elevated, borderRadius: 14, padding: 14,
      borderWidth: 1, borderColor: t.border, flexDirection: 'row', alignItems: 'center',
    },
    savedMealName: { fontSize: 15, fontWeight: '600', color: t.text.primary },
    savedMealMacro: { fontSize: 12, color: t.text.secondary },

    container: { flex: 1, backgroundColor: t.bg.primary },
    contentContainer: { paddingHorizontal: 20, paddingBottom: 40 },
    safeHeader: { paddingBottom: 20 },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    pageTitle: { fontSize: 28, fontWeight: '700', color: t.text.primary, marginBottom: 4 },
    pageSubtitle: { fontSize: 14, color: t.text.muted },
    addBtn: {
      width: 40, height: 40, borderRadius: 20,
      backgroundColor: t.text.primary,
      alignItems: 'center', justifyContent: 'center',
    },

    // Unified calorie + macro card
    unifiedCard: {
      backgroundColor: '#1a1a1a', borderRadius: 16, padding: 20,
      borderWidth: 1, borderColor: '#2a2a2a', marginBottom: 16,
    },

    // Weekly calorie trend card
    weeklyTrendCard: {
      backgroundColor: '#1a1a1a', borderRadius: 14, padding: 16,
      borderWidth: 1, borderColor: '#2a2a2a', marginBottom: 16,
    },

    // Scan card
    scanCard: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      backgroundColor: t.bg.elevated, borderRadius: 16, padding: 16,
      borderWidth: 1, borderColor: t.border, marginBottom: 20,
    },
    scanCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    scanIconWrap: {
      width: 40, height: 40, borderRadius: 12,
      backgroundColor: t.text.primary,
      alignItems: 'center', justifyContent: 'center',
    },
    scanCardTitle: { fontSize: 15, fontWeight: '600', color: t.text.primary },
    scanCardSubtitle: { fontSize: 12, color: t.text.muted, marginTop: 1 },

    sectionLabel: {
      fontSize: 11, fontWeight: '600', color: t.text.muted,
      textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12, marginTop: 4,
    },

    // Fibre & Micros
    card: {
      backgroundColor: t.bg.elevated, borderRadius: 16, padding: 16,
      borderWidth: 1, borderColor: t.border, marginBottom: 20,
    },
    microRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 12 },
    microLabelBlock: { width: 96 },
    microLabel: { fontSize: 14, color: t.text.primary, fontWeight: '500' },
    microTarget: { fontSize: 11, color: t.text.muted, marginTop: 1 },
    microBarGroup: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
    microValue: { fontSize: 12, color: t.text.secondary, width: 52, textAlign: 'right' },
    microDivider: { height: 1, backgroundColor: t.border },
    microNote: { fontSize: 11, color: t.text.muted, marginBottom: 10, lineHeight: 16 },
    microExpandBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
      paddingTop: 10, marginTop: 4, borderTopWidth: 1, borderTopColor: t.border,
    },
    microExpandText: { fontSize: 12, color: t.text.muted },

    // Meals section
    mealsSectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    logMealInlineBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      backgroundColor: t.text.primary,
      borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7,
    },
    logMealInlineBtnText: { color: t.bg.primary, fontSize: 13, fontWeight: '700' },
    loadingRow: { paddingVertical: 40, alignItems: 'center' },
    emptyState: { alignItems: 'center', paddingVertical: 48, gap: 8 },
    emptyTitle: { fontSize: 18, fontWeight: '700', color: t.text.primary, marginTop: 8 },
    emptySubtitle: { fontSize: 14, color: t.text.muted, textAlign: 'center' },
    mealsSection: { gap: 8 },
    mealCard: {
      backgroundColor: t.bg.elevated, borderRadius: 14, padding: 14,
      borderWidth: 1, borderColor: t.border,
      flexDirection: 'row', alignItems: 'center',
    },
    mealLeft: { flex: 1, gap: 6 },
    mealNameRow: { flexDirection: 'row', alignItems: 'center' },
    mealName: { fontSize: 15, fontWeight: '600', color: t.text.primary },
    macroChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    macroChip: {
      paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
      backgroundColor: t.bg.secondary, borderWidth: 1, borderColor: t.border,
    },
    macroChipText: { fontSize: 11, color: t.text.secondary },
    deleteBtn: { padding: 10, marginLeft: 4 },

    bottomPadding: { height: 24 },

    // Modal shared
    modalWrapper: { flex: 1, backgroundColor: t.bg.elevated },
    modalContent: { padding: 24, paddingBottom: 48 },
    modalHandle: { width: 40, height: 4, backgroundColor: t.border, borderRadius: 2, alignSelf: 'center', marginBottom: 24 },
    modalHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 },
    modalTitle: { fontSize: 22, fontWeight: '700', color: t.text.primary },
    modalFieldLabel: { fontSize: 13, color: t.text.secondary, marginBottom: 8, fontWeight: '500' },
    modalInput: {
      backgroundColor: t.bg.primary, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
      fontSize: 16, color: t.text.primary, borderWidth: 1, borderColor: t.border, marginBottom: 16,
    },
    macroInputGrid: { flexDirection: 'row', gap: 10, marginBottom: 16 },
    macroInputBox: {
      flex: 1, backgroundColor: t.bg.primary, borderRadius: 12, borderWidth: 1, borderColor: t.border,
      paddingVertical: 12, alignItems: 'center', gap: 2,
    },
    macroInput: { fontSize: 16, fontWeight: '700', textAlign: 'center', minWidth: 40 },
    macroInputUnit: { fontSize: 10, color: t.text.muted },
    macroInputLabel: { fontSize: 10, color: t.text.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
    extraToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, marginBottom: 8 },
    extraToggleText: { fontSize: 14, color: t.text.muted },
    extraSection: { marginBottom: 8 },
    textArea: { minHeight: 72, textAlignVertical: 'top' },
    logBtn: {
      backgroundColor: t.text.primary,
      borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginBottom: 12,
    },
    logBtnText: { color: t.bg.primary, fontSize: 16, fontWeight: '700' },
    cancelBtn: { alignItems: 'center', paddingVertical: 12 },
    cancelBtnText: { color: t.text.muted, fontSize: 15 },
    btnDisabled: { opacity: 0.5 },

    // Scan modal
    scanLoadingContainer: { alignItems: 'center', paddingVertical: 32, gap: 8 },
    scanThumbnailLarge: {
      width: CARD_WIDTH - 48,
      height: 200,
      borderRadius: 12,
      marginBottom: 8,
    },
    scanLoadingText: { fontSize: 16, fontWeight: '600', color: t.text.primary, marginTop: 8 },
    scanLoadingSubtext: { fontSize: 13, color: t.text.muted },
    confidenceWarning: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 8,
      backgroundColor: t.bg.subtle, borderRadius: 10, padding: 12, marginBottom: 16,
      borderWidth: 1, borderColor: t.border,
    },
    confidenceWarningText: { flex: 1, fontSize: 13, color: t.text.secondary, lineHeight: 18 },
    scanResultCard: {
      flexDirection: 'row', gap: 12, backgroundColor: t.bg.primary,
      borderRadius: 14, padding: 12, marginBottom: 20,
      borderWidth: 1, borderColor: t.border,
    },
    scanThumbnail: { width: 80, height: 80, borderRadius: 10 },
    scanResultInfo: { flex: 1, justifyContent: 'center', gap: 4 },
    scanFoodName: { fontSize: 16, fontWeight: '700', color: t.text.primary },
    scanDescription: { fontSize: 13, color: t.text.secondary, lineHeight: 17 },
    scanServing: { fontSize: 12, color: t.text.muted, fontStyle: 'italic' },
    scanRetryBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
      paddingVertical: 12,
    },
    scanRetryText: { fontSize: 14, color: t.text.secondary },
    scanErrorContainer: { alignItems: 'center', paddingVertical: 24, gap: 8, paddingHorizontal: 8 },
    scanErrorTitle: { fontSize: 16, fontWeight: '600', color: t.text.primary, marginTop: 4 },
    scanErrorDetail: { fontSize: 13, color: t.text.secondary, textAlign: 'center', lineHeight: 18 },

    // Calorie breakdown bar
    breakdownCard: {
      backgroundColor: t.bg.elevated, borderRadius: 14, padding: 14,
      borderWidth: 1, borderColor: t.border, marginBottom: 16,
    },
    breakdownBar: {
      height: 10, borderRadius: 5, overflow: 'hidden',
      flexDirection: 'row', marginBottom: 10,
      backgroundColor: t.border,
    },
    breakdownLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    breakdownLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    breakdownDot: { width: 8, height: 8, borderRadius: 4 },
    breakdownLegendText: { fontSize: 11, color: t.text.muted },

    // Weekly nutrition summary
    weeklyCard: {
      backgroundColor: t.bg.elevated, borderRadius: 16,
      borderWidth: 1, borderColor: t.border, marginBottom: 20, overflow: 'hidden',
    },
    weeklyGrid: { flexDirection: 'row', flexWrap: 'wrap' },
    weeklyCell: { width: '50%', padding: 16, alignItems: 'center' },
    weeklyCellBorderLeft: { borderLeftWidth: 1, borderLeftColor: t.border },
    weeklyCellBorderTop: { borderTopWidth: 1, borderTopColor: t.border },
    weeklyCellValue: { fontSize: 22, fontWeight: '700', color: t.text.primary, marginBottom: 4 },
    weeklyCellLabel: { fontSize: 11, color: t.text.muted, textAlign: 'center' },
    weeklyCompare: {
      fontSize: 11, color: t.text.muted, textAlign: 'center',
      paddingVertical: 10, borderTopWidth: 1, borderTopColor: t.border,
    },

    // Compact meal plan
    mpRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      marginBottom: 4, marginTop: 24,
    },
    mpTitle: { fontSize: 16, fontWeight: '700', color: t.text.primary },
    mpCals: { fontSize: 14, color: t.text.muted },
    cheatDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#d97706' },
    cheatDayLine: { fontSize: 12, color: '#d97706', marginBottom: 10, fontStyle: 'italic' },
    mpMealList: { marginBottom: 4 },
    mpMealRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: t.border,
    },
    mpMealTime: { fontSize: 12, color: t.text.muted, width: 46, flexShrink: 0 },
    mpMealName: { flex: 1, fontSize: 14, color: t.text.primary, fontWeight: '500' },
    mpMealCals: { fontSize: 13, color: t.text.muted },
    mpMealExpanded: {
      paddingVertical: 12, paddingLeft: 56, borderBottomWidth: 1, borderBottomColor: t.border,
    },
    mpIngredient: { fontSize: 13, color: t.text.secondary, lineHeight: 20 },
    mpPrepNote: { fontSize: 13, color: t.text.muted, fontStyle: 'italic', lineHeight: 18 },
    mpLogBtn: {
      backgroundColor: t.text.primary, borderRadius: 8,
      paddingHorizontal: 14, paddingVertical: 6,
    },
    mpLogBtnText: { fontSize: 12, fontWeight: '700', color: t.bg.primary },
    mpNote: { fontSize: 12, color: t.text.muted, fontStyle: 'italic', marginTop: 10, marginBottom: 4, lineHeight: 17 },
    mpTimingDot: { width: 7, height: 7, borderRadius: 3.5, marginRight: 2 },
    regenBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      alignSelf: 'flex-start', marginTop: 10, marginBottom: 4,
      paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
      borderWidth: 1, borderColor: t.border, backgroundColor: t.bg.elevated,
    },
    regenBtnText: { fontSize: 13, color: t.text.secondary },
    mpErrorWrap: { paddingVertical: 20, alignItems: 'center', gap: 8, marginBottom: 8 },
    mpErrorText: { fontSize: 13, color: t.text.muted, textAlign: 'center' },
    mpErrorRetry: { fontSize: 13, color: t.text.secondary, textDecorationLine: 'underline' },

    // Meal modified banner
    mealModifiedBanner: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: 'rgba(39,174,96,0.12)', borderRadius: 10, padding: 12,
      borderWidth: 1, borderColor: 'rgba(39,174,96,0.3)', marginBottom: 12,
    },
    mealModifiedBannerText: { fontSize: 14, color: '#27ae60', fontWeight: '600' },

    // Ask ORYX chat
    chatCollapsed: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: t.bg.elevated, borderRadius: 14,
      paddingHorizontal: 16, paddingVertical: 14,
      borderWidth: 1, borderColor: t.border,
      marginBottom: 16,
    },
    chatCollapsedText: { fontSize: 14, color: t.text.muted, flex: 1 },
    chatContainer: {
      backgroundColor: t.bg.elevated, borderRadius: 16,
      borderWidth: 1, borderColor: t.border,
      marginBottom: 16, overflow: 'hidden',
    },
    chatHeader: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingVertical: 12,
      borderBottomWidth: 1, borderBottomColor: t.border,
    },
    chatHeaderTitle: { fontSize: 14, fontWeight: '600', color: t.text.primary },
    chatMessages: { maxHeight: 280, paddingHorizontal: 12 },
    chatEmptyHint: {
      color: t.text.muted, fontSize: 13, textAlign: 'center',
      paddingVertical: 20, lineHeight: 20,
    },
    chatBubble: {
      maxWidth: '80%', borderRadius: 14, paddingHorizontal: 13, paddingVertical: 9,
      marginVertical: 4,
    },
    chatBubbleUser: {
      backgroundColor: '#2a2a2a', alignSelf: 'flex-end',
      borderBottomRightRadius: 4,
    },
    chatBubbleAssistant: {
      backgroundColor: '#1a1a1a', alignSelf: 'flex-start',
      borderBottomLeftRadius: 4, borderWidth: 1, borderColor: t.border,
    },
    chatBubbleText: { fontSize: 14, color: '#fff', lineHeight: 20 },
    chatInputRow: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      padding: 10, borderTopWidth: 1, borderTopColor: t.border,
    },
    chatInput: {
      flex: 1, backgroundColor: '#111', borderRadius: 20,
      paddingHorizontal: 14, paddingVertical: 9,
      fontSize: 14, color: t.text.primary,
      borderWidth: 1, borderColor: '#2a2a2a',
    },
    chatSendBtn: {
      width: 36, height: 36, borderRadius: 18,
      backgroundColor: t.text.primary, alignItems: 'center', justifyContent: 'center',
    },
  });
}
