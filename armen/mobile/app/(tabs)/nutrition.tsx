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
import {
  getTodayNutrition,
  logNutrition,
  deleteNutritionLog,
  scanFoodPhoto,
  NutritionLog,
  FoodScanResult,
} from '@/services/api';
import { useTheme } from '@/contexts/ThemeContext';
import { ThemeColors } from '@/services/theme';

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
  const [showExtra, setShowExtra] = useState(false);
  const [nutritionForm, setNutritionForm] = useState({
    meal_name: '', calories: '', protein_g: '', carbs_g: '', fat_g: '', fibre_g: '', notes: '',
  });
  const [submitting, setSubmitting] = useState(false);

  // Scan state
  const [scanLoading, setScanLoading] = useState(false);
  const [scanResult, setScanResult] = useState<FoodScanResult | null>(null);
  const [scanImageUri, setScanImageUri] = useState<string | null>(null);
  const [showScanModal, setShowScanModal] = useState(false);
  const [scanForm, setScanForm] = useState({
    meal_name: '', calories: '', protein_g: '', carbs_g: '', fat_g: '', fibre_g: '',
  });
  const [scanSubmitting, setScanSubmitting] = useState(false);

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

  useEffect(() => { loadData(); }, [loadData]);

  const handleRefresh = useCallback(() => { setRefreshing(true); loadData(); }, [loadData]);

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

  // ── Scan handlers ─────────────────────────────────────────────────────────

  const resetScan = () => {
    setShowScanModal(false);
    setScanResult(null);
    setScanImageUri(null);
    setScanLoading(false);
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
    setShowScanModal(true);

    try {
      const data = await scanFoodPhoto(asset.base64!);
      setScanResult(data);
      setScanForm({
        meal_name: data.food_name,
        calories: data.calories > 0 ? String(data.calories) : '',
        protein_g: data.protein_g > 0 ? String(data.protein_g) : '',
        carbs_g: data.carbs_g > 0 ? String(data.carbs_g) : '',
        fat_g: data.fat_g > 0 ? String(data.fat_g) : '',
        fibre_g: data.fibre_g > 0 ? String(data.fibre_g) : '',
      });
    } catch {
      resetScan();
      Alert.alert('Scan Failed', 'Could not analyze the image. Try a clearer photo or use manual entry.');
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
            <TouchableOpacity style={s.addBtn} onPress={() => setShowAddModal(true)} activeOpacity={0.85}>
              <Ionicons name="add" size={22} color={theme.bg.primary} />
            </TouchableOpacity>
          </View>
        </SafeAreaView>

        {/* ── Calorie Counter ── */}
        <View style={s.calorieCard}>
          <View style={s.calorieHeaderRow}>
            <View>
              <Text style={s.calorieTitle}>
                {Math.round(totalCalories)}<Text style={s.calorieSuffix}> kcal</Text>
              </Text>
              <Text style={[s.calorieSubtitle, isOverGoal && { color: theme.status.danger }]}>
                {isOverGoal
                  ? `${calorieDiff} kcal over goal`
                  : `${calorieDiff} kcal remaining`}
              </Text>
            </View>
            <View style={[
              s.caloriePct,
              { borderColor: isOverGoal ? theme.status.danger : theme.status.success }
            ]}>
              <Text style={[s.caloriePctText, { color: isOverGoal ? theme.status.danger : theme.status.success }]}>
                {Math.round((totalCalories / DAILY_TARGETS.calories) * 100)}%
              </Text>
            </View>
          </View>

          {/* Progress bar */}
          <View style={s.calorieProgressBg}>
            <View style={[
              s.calorieProgressFill,
              {
                width: `${Math.round(calorieBarPct * 100)}%` as any,
                backgroundColor: isOverGoal ? theme.status.danger : theme.status.success,
              }
            ]} />
          </View>
          <Text style={s.calorieGoalLabel}>Daily goal: {DAILY_TARGETS.calories} kcal</Text>

          <LineChart
            data={{
              labels: weekLabels,
              datasets: [
                { data: mockWeeklyCalories, color: () => theme.status.success, strokeWidth: 2 },
                { data: [DAILY_TARGETS.calories], withDots: false, color: () => theme.border, strokeWidth: 1 },
              ],
            }}
            width={CARD_WIDTH - 8}
            height={110}
            withDots
            withInnerLines={false}
            withOuterLines={false}
            withHorizontalLabels={false}
            withVerticalLabels={true}
            chartConfig={{
              backgroundColor: theme.bg.elevated,
              backgroundGradientFrom: theme.bg.elevated,
              backgroundGradientTo: theme.bg.elevated,
              color: () => theme.status.success,
              labelColor: () => theme.text.muted,
              strokeWidth: 2,
              propsForBackgroundLines: { stroke: 'transparent' },
              propsForDots: { r: '3', strokeWidth: '0', fill: theme.status.success },
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
          <TouchableOpacity style={s.logMealInlineBtn} onPress={() => setShowAddModal(true)} activeOpacity={0.85}>
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
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={s.deleteBtn}
                >
                  <Ionicons name="trash-outline" size={15} color={theme.text.secondary} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
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
                {scanLoading ? 'Analyzing Photo…' : 'Review & Log'}
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
      backgroundColor: t.bg.elevated, borderRadius: 20, padding: 20,
      borderWidth: 1, borderColor: t.border, marginBottom: 16,
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
    deleteBtn: { padding: 4, marginLeft: 8 },

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
  });
}
