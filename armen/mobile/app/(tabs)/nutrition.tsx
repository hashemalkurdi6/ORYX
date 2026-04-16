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
import { LineChart } from 'react-native-chart-kit';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import {
  getTodayNutrition,
  logNutrition,
  deleteNutritionLog,
  scanFoodPhoto,
  NutritionLog,
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
} from '@/services/api';
import { useTheme } from '@/contexts/ThemeContext';
import { ThemeColors } from '@/services/theme';
import FoodSearchModal from '@/components/FoodSearchModal';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 40;

// ── Targets ───────────────────────────────────────────────────────────────────

const DAILY_TARGETS = {
  calories: 2200,
  protein: 150,
  carbs: 220,
  fat: 70,
  fibre: 30,
};

const MICROS: Array<{ label: string; target: string; value: number; color: string }> = [
  { label: 'Vitamin D', target: '20 µg', value: 0.62, color: '#888888' },
  { label: 'Magnesium', target: '400 mg', value: 0.45, color: '#888888' },
  { label: 'Omega-3', target: '1.6 g', value: 0.30, color: '#888888' },
  { label: 'Iron', target: '18 mg', value: 0.80, color: '#FF6B35' },
  { label: 'Calcium', target: '1000 mg', value: 0.65, color: '#27ae60' },
  { label: 'Zinc', target: '11 mg', value: 0.55, color: '#888888' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayDisplayDate(): string {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

function getPast7DayLabels(): string[] {
  const labels: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    labels.push(d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 1));
  }
  return labels;
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

// ── Main Component ────────────────────────────────────────────────────────────

export default function NutritionScreen() {
  const { theme } = useTheme();
  const s = useMemo(() => createStyles(theme), [theme]);

  // Existing state
  const [todayLogs, setTodayLogs] = useState<NutritionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
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
      const logs = await getTodayNutrition();
      setTodayLogs(logs);
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
          } catch {
            Alert.alert('Error', 'Could not delete entry.');
          }
        },
      },
    ]);
  };

  // ── Meal plan handlers ────────────────────────────────────────────────────

  const handleRegenerateMealPlan = () => {
    const left = 3 - (mealPlan?.regeneration_count ?? 0);
    Alert.alert(
      'Regenerate Meal Plan',
      `You have ${left} regeneration${left === 1 ? '' : 's'} left today. Continue?`,
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
            } catch (err: any) {
              if (err?.response?.status === 429) {
                Alert.alert('Limit Reached', "You've used all 3 regenerations for today. Try again tomorrow.");
              } else {
                Alert.alert('Error', 'Could not regenerate meal plan. Try again.');
              }
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
        source: 'manual',
        notes: `From meal plan · ${meal.time}`,
      });
      setTodayLogs((prev) => [...prev, saved]);
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
      const assistantMsg: ChatMessage = { role: 'assistant', content: reply };
      setChatMessages(prev => [...prev.slice(-9), assistantMsg]);
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
        calories: parseOpt(scanForm.calories),
        protein_g: parseOpt(scanForm.protein_g),
        carbs_g: parseOpt(scanForm.carbs_g),
        fat_g: parseOpt(scanForm.fat_g),
        fibre_g: parseOpt(scanForm.fibre_g),
        source: 'scan',
      });
      setTodayLogs((prev) => [...prev, saved]);
      resetScan();
    } catch {
      Alert.alert('Error', 'Could not log meal. Try again.');
    } finally {
      setScanSubmitting(false);
    }
  };

  // ── Computed ──────────────────────────────────────────────────────────────

  const totalCalories = todayLogs.reduce((s, n) => s + (n.calories ?? 0), 0);
  const totalProtein  = todayLogs.reduce((s, n) => s + (n.protein_g ?? 0), 0);
  const totalCarbs    = todayLogs.reduce((s, n) => s + (n.carbs_g ?? 0), 0);
  const totalFat      = todayLogs.reduce((s, n) => s + (n.fat_g ?? 0), 0);

  const isOverGoal = totalCalories > DAILY_TARGETS.calories;
  const calorieDiff = Math.abs(Math.round(totalCalories - DAILY_TARGETS.calories));
  const calorieBarPct = Math.min(totalCalories / DAILY_TARGETS.calories, 1);

  const mockFibre = Math.min(totalCalories * 0.014, DAILY_TARGETS.fibre);
  const weekLabels = getPast7DayLabels();
  const mockWeeklyCalories = [1840, 2100, 1950, 2300, 1780, 2050, Math.round(totalCalories) || 0];

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

        {/* ── Calorie Counter ── */}
        <View style={s.calorieCard}>
          <View style={s.calorieHeaderRow}>
            <View>
              <Text style={s.calorieTitle}>
                {Math.round(totalCalories)}<Text style={s.calorieSuffix}> kcal</Text>
              </Text>
              <Text style={[s.calorieSubtitle, isOverGoal && { color: '#FF6B6B' }]}>
                {isOverGoal ? `${calorieDiff} kcal over goal` : `${calorieDiff} kcal remaining`}
              </Text>
            </View>
            <View style={[s.caloriePct, { borderColor: isOverGoal ? '#FF6B6B' : '#27ae60' }]}>
              <Text style={[s.caloriePctText, { color: isOverGoal ? '#FF6B6B' : '#27ae60' }]}>
                {Math.round(calorieBarPct * 100)}%
              </Text>
            </View>
          </View>
          <View style={s.calorieProgressBg}>
            <View style={[
              s.calorieProgressFill,
              { width: `${Math.round(calorieBarPct * 100)}%` as any,
                backgroundColor: isOverGoal ? '#FF6B6B' : '#27ae60' }
            ]} />
          </View>
          <Text style={s.calorieGoalLabel}>Daily goal: {DAILY_TARGETS.calories} kcal</Text>
          <LineChart
            data={{
              labels: weekLabels,
              datasets: [
                { data: mockWeeklyCalories, color: () => '#27ae60', strokeWidth: 2 },
                { data: [DAILY_TARGETS.calories], withDots: false, color: () => 'rgba(255,255,255,0.3)', strokeWidth: 1 },
              ],
            }}
            width={CARD_WIDTH - 8}
            height={100}
            withDots
            withInnerLines={false}
            withOuterLines={false}
            withHorizontalLabels={false}
            withVerticalLabels={true}
            chartConfig={{
              backgroundColor: '#1a1a1a',
              backgroundGradientFrom: '#1a1a1a',
              backgroundGradientTo: '#1a1a1a',
              color: () => '#27ae60',
              labelColor: () => theme.text.muted,
              strokeWidth: 2,
              propsForBackgroundLines: { stroke: 'transparent' },
              propsForDots: { r: '3', strokeWidth: '0', fill: '#27ae60' },
              propsForLabels: { fontSize: 10 },
            }}
            bezier
            style={s.lineChart}
          />
        </View>

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

        {/* ── Macro Circles ── */}
        <Text style={s.sectionLabel}>TODAY'S MACROS</Text>
        <View style={s.macroCirclesCard}>
          <MacroCircle label="Protein" value={totalProtein} target={DAILY_TARGETS.protein} unit="g" color={theme.accent} />
          <MacroCircle label="Carbs" value={totalCarbs} target={DAILY_TARGETS.carbs} unit="g" color="#888888" />
          <MacroCircle label="Fat" value={totalFat} target={DAILY_TARGETS.fat} unit="g" color="#FF6B35" />
        </View>

        {/* ── Fibre & Micronutrients ── */}
        <Text style={s.sectionLabel}>FIBRE & MICRONUTRIENTS</Text>
        <View style={s.card}>
          <View style={s.microRow}>
            <View style={s.microLabelBlock}>
              <Text style={s.microLabel}>Fibre</Text>
              <Text style={s.microTarget}>Goal: {DAILY_TARGETS.fibre}g</Text>
            </View>
            <View style={s.microBarGroup}>
              <ProgressBar value={mockFibre / DAILY_TARGETS.fibre} color={theme.status.success} />
              <Text style={s.microValue}>{mockFibre.toFixed(1)}g</Text>
            </View>
          </View>
          <View style={s.microDivider} />
          {MICROS.map((micro, idx) => (
            <View key={micro.label}>
              {idx > 0 && <View style={s.microDivider} />}
              <View style={s.microRow}>
                <View style={s.microLabelBlock}>
                  <Text style={s.microLabel}>{micro.label}</Text>
                  <Text style={s.microTarget}>Goal: {micro.target}</Text>
                </View>
                <View style={s.microBarGroup}>
                  <ProgressBar value={micro.value} color={micro.color} />
                  <Text style={s.microValue}>{Math.round(micro.value * 100)}%</Text>
                </View>
              </View>
            </View>
          ))}
          <Text style={s.microNote}>
            Micronutrient data is estimated. Log detailed meals for better accuracy.
          </Text>
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
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {mealPlan.total_calories !== null && (
                  <Text style={s.mpCals}>{Math.round(mealPlan.total_calories).toLocaleString()} kcal</Text>
                )}
                <Ionicons
                  name={mealPlanExpanded ? 'chevron-up' : 'chevron-down'}
                  size={15}
                  color={theme.text.muted}
                />
              </View>
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
              disabled={regenerating || mealPlan.regeneration_count >= 3}
              style={[s.regenBtn, (regenerating || mealPlan.regeneration_count >= 3) && { opacity: 0.35 }]}
              activeOpacity={0.7}
            >
              {regenerating
                ? <ActivityIndicator size="small" color={theme.text.secondary} />
                : <>
                    <Ionicons name="refresh-outline" size={13} color={theme.text.secondary} />
                    <Text style={s.regenBtnText}>
                      Regenerate{mealPlan.regeneration_count > 0 ? ` (${3 - mealPlan.regeneration_count} left)` : ''}
                    </Text>
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

    // Calorie counter card
    calorieCard: {
      backgroundColor: '#1a1a1a', borderRadius: 16, padding: 20,
      borderWidth: 1, borderColor: '#2a2a2a', marginBottom: 16,
    },
    calorieHeaderRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 },
    calorieTitle: { fontSize: 36, fontWeight: '800', color: t.text.primary },
    calorieSuffix: { fontSize: 16, fontWeight: '400', color: t.text.muted },
    calorieSubtitle: { fontSize: 13, color: t.text.muted, marginTop: 2 },
    caloriePct: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, borderWidth: 1 },
    caloriePctText: { fontSize: 14, fontWeight: '700' },
    calorieProgressBg: { height: 6, backgroundColor: t.border, borderRadius: 3, overflow: 'hidden', marginBottom: 6 },
    calorieProgressFill: { height: '100%', borderRadius: 3 },
    calorieGoalLabel: { fontSize: 11, color: t.text.muted, marginBottom: 14 },
    lineChart: { borderRadius: 10, marginLeft: -8 },

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

    // Macro circles
    sectionLabel: {
      fontSize: 11, fontWeight: '600', color: t.text.muted,
      textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12, marginTop: 4,
    },
    macroCirclesCard: {
      backgroundColor: t.bg.elevated, borderRadius: 20, padding: 20,
      borderWidth: 1, borderColor: t.border, marginBottom: 20,
      flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center',
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
    microValue: { fontSize: 12, color: t.text.secondary, width: 36, textAlign: 'right' },
    microDivider: { height: 1, backgroundColor: t.border },
    microNote: { fontSize: 11, color: t.text.muted, marginTop: 12, lineHeight: 16 },

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
