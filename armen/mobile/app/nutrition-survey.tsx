/**
 * ORYX Nutrition Survey — 6-step preference flow.
 * Collects nutrition preferences and PATCHes /nutrition/profile on completion.
 */

import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Reanimated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import apiClient, { getNutritionProfile, NutritionProfile } from '@/services/api';
import { ThemeColors, type as TY, radius as R } from '@/services/theme';

import { useTheme } from '@/contexts/ThemeContext';

// Soft-import expo-haptics — same pattern signup.tsx uses. No-op until the
// dependency lands; the moment it does, every tap below activates.
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
  } catch { /* haptics are nice-to-have; never let them break the flow */ }
}

const { width: SW } = Dimensions.get('window');

// Entry-stagger primitive — same component the signup flow uses. Mirrors the
// signup motion language so a returning user editing their nutrition profile
// gets the exact same cadence they saw at signup.
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
// ── Constants ─────────────────────────────────────────────────────────────────

const TOTAL_STEPS = 6;

const CUISINES = [
  'Mediterranean', 'Middle Eastern', 'Asian', 'American',
  'Mexican', 'Italian', 'Indian', 'Japanese', 'Turkish', 'Other',
];

const DIET_TYPES = ['Everything', 'Pescatarian', 'Vegetarian', 'Vegan', 'Halal', 'Kosher'];

const ALLERGIES = ['Nuts', 'Dairy', 'Gluten', 'Shellfish', 'Eggs', 'Soy', 'None'];

const NUTRITION_GOALS = ['Lose Fat', 'Build Muscle', 'Maintain Weight', 'Improve Performance', 'Eat Healthier'];

const STRICTNESS_LEVELS = ['Flexible', 'Balanced', 'Strict'];

const CHEAT_DAY_OPTIONS = ['Yes — one day/week', 'Yes — one meal/week', 'Rarely', 'No, stay strict'];

const SUGAR_PREFERENCES = ['Avoid completely', 'Minimize added sugar', 'Natural sugar OK', 'No restrictions'];

const CARB_APPROACHES = ['Low carb', 'Moderate', 'High carb', 'Carb cycle'];

const IF_OPTIONS = ['No', '16:8', '18:6', 'Custom'];

const BREAKFAST_OPTIONS = ['Always', 'Sometimes', 'Never'];

const PRE_WORKOUT_OPTIONS = ['Eat before', 'Train fasted', 'Depends'];

const POST_WORKOUT_OPTIONS = ['Immediately after', 'Within 1 hour', "Don't focus on it"];

const MEAL_PREP_OPTIONS = ['Weekly', 'Sometimes', 'No, cook fresh'];

const COOKING_SKILLS = [
  { label: 'Beginner', sub: 'I can follow a recipe' },
  { label: 'Intermediate', sub: 'I cook regularly' },
  { label: 'Advanced', sub: 'I experiment freely' },
];

const TIME_PER_MEAL_OPTIONS = ['<15 min', '15–30 min', '30–60 min', '1+ hour'];

const BUDGET_OPTIONS = ['<$50', '$50–$100', '$100–$150', '$150+'];

const KITCHEN_OPTIONS = ['Full kitchen', 'Basic/shared', 'Microwave only'];

// Foods excluded per diet type (by category label)
const DIET_EXCLUDED: Record<string, Partial<Record<string, string[]>>> = {
  Pescatarian: {
    Proteins: ['Chicken', 'Beef', 'Lamb', 'Turkey'],
  },
  Vegetarian: {
    Proteins: ['Chicken', 'Beef', 'Lamb', 'Fish', 'Salmon', 'Tuna', 'Shrimp', 'Turkey'],
  },
  Vegan: {
    Proteins: ['Chicken', 'Beef', 'Lamb', 'Fish', 'Salmon', 'Tuna', 'Shrimp', 'Turkey', 'Eggs'],
    Dairy: ['Milk', 'Cheese', 'Yogurt', 'Greek Yogurt', 'Cottage Cheese', 'Butter', 'Cream'],
    'Condiments & Flavors': ['Honey', 'Mayo'],
  },
  Kosher: {
    Dairy: ['Butter', 'Cream'],
  },
};

function getFilteredCategories(dietType: string) {
  const excluded = DIET_EXCLUDED[dietType] ?? {};
  return FOOD_CATEGORIES.map((cat) => {
    const removals = excluded[cat.label];
    if (!removals) return cat;
    const isFullCategoryRemoved = removals.length >= cat.items.length ||
      cat.items.every(item => removals.includes(item));
    if (isFullCategoryRemoved) return null;
    return { ...cat, items: cat.items.filter(item => !removals.includes(item)) };
  }).filter(Boolean) as typeof FOOD_CATEGORIES;
}

const FOOD_CATEGORIES = [
  { label: 'Proteins', items: ['Chicken', 'Beef', 'Lamb', 'Fish', 'Salmon', 'Tuna', 'Shrimp', 'Eggs', 'Turkey', 'Tofu', 'Tempeh', 'Lentils', 'Chickpeas', 'Beans'] },
  { label: 'Carbs', items: ['Rice', 'Pasta', 'Bread', 'Oats', 'Quinoa', 'Sweet Potato', 'Potato', 'Couscous', 'Bulgur', 'Corn', 'Tortillas', 'Pita'] },
  { label: 'Dairy', items: ['Milk', 'Cheese', 'Yogurt', 'Greek Yogurt', 'Cottage Cheese', 'Butter', 'Cream'] },
  { label: 'Vegetables', items: ['Broccoli', 'Spinach', 'Kale', 'Cucumber', 'Tomato', 'Carrot', 'Zucchini', 'Mushrooms', 'Onion', 'Garlic', 'Bell Pepper', 'Avocado', 'Lettuce', 'Celery'] },
  { label: 'Fruits', items: ['Banana', 'Apple', 'Orange', 'Berries', 'Mango', 'Grapes', 'Watermelon', 'Dates', 'Pomegranate'] },
  { label: 'Fats & Nuts', items: ['Almonds', 'Walnuts', 'Peanut Butter', 'Olive Oil', 'Avocado Oil', 'Cashews', 'Sunflower Seeds'] },
  { label: 'Condiments & Flavors', items: ['Hot Sauce', 'Hummus', 'Tahini', 'Soy Sauce', 'Honey', 'Ketchup', 'Mayo', 'Mustard'] },
];

const COUNTRIES: Array<{ name: string; flag: string }> = [
  { name: 'Afghanistan', flag: '🇦🇫' }, { name: 'Albania', flag: '🇦🇱' }, { name: 'Algeria', flag: '🇩🇿' },
  { name: 'Andorra', flag: '🇦🇩' }, { name: 'Angola', flag: '🇦🇴' }, { name: 'Argentina', flag: '🇦🇷' },
  { name: 'Armenia', flag: '🇦🇲' }, { name: 'Australia', flag: '🇦🇺' }, { name: 'Austria', flag: '🇦🇹' },
  { name: 'Azerbaijan', flag: '🇦🇿' }, { name: 'Bahrain', flag: '🇧🇭' }, { name: 'Bangladesh', flag: '🇧🇩' },
  { name: 'Belarus', flag: '🇧🇾' }, { name: 'Belgium', flag: '🇧🇪' }, { name: 'Bolivia', flag: '🇧🇴' },
  { name: 'Bosnia and Herzegovina', flag: '🇧🇦' }, { name: 'Brazil', flag: '🇧🇷' }, { name: 'Bulgaria', flag: '🇧🇬' },
  { name: 'Cambodia', flag: '🇰🇭' }, { name: 'Cameroon', flag: '🇨🇲' }, { name: 'Canada', flag: '🇨🇦' },
  { name: 'Chile', flag: '🇨🇱' }, { name: 'China', flag: '🇨🇳' }, { name: 'Colombia', flag: '🇨🇴' },
  { name: 'Croatia', flag: '🇭🇷' }, { name: 'Cuba', flag: '🇨🇺' }, { name: 'Cyprus', flag: '🇨🇾' },
  { name: 'Czech Republic', flag: '🇨🇿' }, { name: 'Denmark', flag: '🇩🇰' }, { name: 'Ecuador', flag: '🇪🇨' },
  { name: 'Egypt', flag: '🇪🇬' }, { name: 'El Salvador', flag: '🇸🇻' }, { name: 'Estonia', flag: '🇪🇪' },
  { name: 'Ethiopia', flag: '🇪🇹' }, { name: 'Finland', flag: '🇫🇮' }, { name: 'France', flag: '🇫🇷' },
  { name: 'Georgia', flag: '🇬🇪' }, { name: 'Germany', flag: '🇩🇪' }, { name: 'Ghana', flag: '🇬🇭' },
  { name: 'Greece', flag: '🇬🇷' }, { name: 'Guatemala', flag: '🇬🇹' }, { name: 'Honduras', flag: '🇭🇳' },
  { name: 'Hungary', flag: '🇭🇺' }, { name: 'Iceland', flag: '🇮🇸' }, { name: 'India', flag: '🇮🇳' },
  { name: 'Indonesia', flag: '🇮🇩' }, { name: 'Iran', flag: '🇮🇷' }, { name: 'Iraq', flag: '🇮🇶' },
  { name: 'Ireland', flag: '🇮🇪' }, { name: 'Israel', flag: '🇮🇱' }, { name: 'Italy', flag: '🇮🇹' },
  { name: 'Jamaica', flag: '🇯🇲' }, { name: 'Japan', flag: '🇯🇵' }, { name: 'Jordan', flag: '🇯🇴' },
  { name: 'Kazakhstan', flag: '🇰🇿' }, { name: 'Kenya', flag: '🇰🇪' }, { name: 'Kuwait', flag: '🇰🇼' },
  { name: 'Kyrgyzstan', flag: '🇰🇬' }, { name: 'Latvia', flag: '🇱🇻' }, { name: 'Lebanon', flag: '🇱🇧' },
  { name: 'Libya', flag: '🇱🇾' }, { name: 'Lithuania', flag: '🇱🇹' }, { name: 'Luxembourg', flag: '🇱🇺' },
  { name: 'Malaysia', flag: '🇲🇾' }, { name: 'Maldives', flag: '🇲🇻' }, { name: 'Malta', flag: '🇲🇹' },
  { name: 'Mexico', flag: '🇲🇽' }, { name: 'Moldova', flag: '🇲🇩' }, { name: 'Mongolia', flag: '🇲🇳' },
  { name: 'Montenegro', flag: '🇲🇪' }, { name: 'Morocco', flag: '🇲🇦' }, { name: 'Myanmar', flag: '🇲🇲' },
  { name: 'Nepal', flag: '🇳🇵' }, { name: 'Netherlands', flag: '🇳🇱' }, { name: 'New Zealand', flag: '🇳🇿' },
  { name: 'Nicaragua', flag: '🇳🇮' }, { name: 'Nigeria', flag: '🇳🇬' }, { name: 'North Macedonia', flag: '🇲🇰' },
  { name: 'Norway', flag: '🇳🇴' }, { name: 'Oman', flag: '🇴🇲' }, { name: 'Pakistan', flag: '🇵🇰' },
  { name: 'Palestine', flag: '🇵🇸' }, { name: 'Panama', flag: '🇵🇦' }, { name: 'Paraguay', flag: '🇵🇾' },
  { name: 'Peru', flag: '🇵🇪' }, { name: 'Philippines', flag: '🇵🇭' }, { name: 'Poland', flag: '🇵🇱' },
  { name: 'Portugal', flag: '🇵🇹' }, { name: 'Qatar', flag: '🇶🇦' }, { name: 'Romania', flag: '🇷🇴' },
  { name: 'Russia', flag: '🇷🇺' }, { name: 'Saudi Arabia', flag: '🇸🇦' }, { name: 'Senegal', flag: '🇸🇳' },
  { name: 'Serbia', flag: '🇷🇸' }, { name: 'Singapore', flag: '🇸🇬' }, { name: 'Slovakia', flag: '🇸🇰' },
  { name: 'Slovenia', flag: '🇸🇮' }, { name: 'Somalia', flag: '🇸🇴' }, { name: 'South Africa', flag: '🇿🇦' },
  { name: 'South Korea', flag: '🇰🇷' }, { name: 'Spain', flag: '🇪🇸' }, { name: 'Sri Lanka', flag: '🇱🇰' },
  { name: 'Sudan', flag: '🇸🇩' }, { name: 'Sweden', flag: '🇸🇪' }, { name: 'Switzerland', flag: '🇨🇭' },
  { name: 'Syria', flag: '🇸🇾' }, { name: 'Taiwan', flag: '🇹🇼' }, { name: 'Tajikistan', flag: '🇹🇯' },
  { name: 'Tanzania', flag: '🇹🇿' }, { name: 'Thailand', flag: '🇹🇭' }, { name: 'Tunisia', flag: '🇹🇳' },
  { name: 'Turkey', flag: '🇹🇷' }, { name: 'Turkmenistan', flag: '🇹🇲' }, { name: 'Uganda', flag: '🇺🇬' },
  { name: 'Ukraine', flag: '🇺🇦' }, { name: 'United Arab Emirates', flag: '🇦🇪' },
  { name: 'United Kingdom', flag: '🇬🇧' }, { name: 'United States', flag: '🇺🇸' },
  { name: 'Uruguay', flag: '🇺🇾' }, { name: 'Uzbekistan', flag: '🇺🇿' }, { name: 'Venezuela', flag: '🇻🇪' },
  { name: 'Vietnam', flag: '🇻🇳' }, { name: 'Yemen', flag: '🇾🇪' }, { name: 'Zambia', flag: '🇿🇲' },
  { name: 'Zimbabwe', flag: '🇿🇼' },
];

// ── Survey State Type ─────────────────────────────────────────────────────────

interface SurveyData {
  // Step 1
  cuisines_liked: string[];
  foods_loved: string[];
  foods_disliked: string[];
  diet_type: string;
  // Step 2
  allergies: string[];
  nutrition_goal: string;
  strictness_level: string;
  cheat_day_preference: string;
  // Step 3
  sugar_preference: string;
  carb_approach: string;
  intermittent_fasting: string;
  fasting_start_time: string;
  fasting_end_time: string;
  // Step 4
  meals_per_day: number;
  eats_breakfast: string;
  meal_times: string[];
  pre_workout_nutrition: string;
  post_workout_nutrition: string;
  meal_prep: string;
  // Step 5
  cooking_skill: string;
  time_per_meal: string;
  weekly_budget: string;
  kitchen_access: string;
  region: string;
}

const DEFAULT_SURVEY: SurveyData = {
  cuisines_liked: [],
  foods_loved: [],
  foods_disliked: [],
  diet_type: '',
  allergies: [],
  nutrition_goal: '',
  strictness_level: '',
  cheat_day_preference: '',
  sugar_preference: '',
  carb_approach: '',
  intermittent_fasting: '',
  fasting_start_time: '',
  fasting_end_time: '',
  meals_per_day: 3,
  eats_breakfast: '',
  meal_times: ['', '', ''],
  pre_workout_nutrition: '',
  post_workout_nutrition: '',
  meal_prep: '',
  cooking_skill: '',
  time_per_meal: '',
  weekly_budget: '',
  kitchen_access: '',
  region: '',
};

// ── Helper: meal time labels ──────────────────────────────────────────────────

function getMealLabel(index: number, total: number): string {
  if (total === 3) {
    const labels = ['Breakfast', 'Lunch', 'Dinner'];
    return labels[index] ?? `Meal ${index + 1}`;
  }
  return `Meal ${index + 1}`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

function Chip({ label, selected, onPress }: ChipProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const scale = useSharedValue(1);
  const reduced = useReducedMotion();
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const handlePress = () => {
    tap('light');
    if (!reduced) {
      scale.value = withSequence(
        withTiming(1.04, { duration: 110, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: 130, easing: Easing.out(Easing.quad) }),
      );
    }
    onPress();
  };
  return (
    <Reanimated.View style={animStyle}>
      <TouchableOpacity
        style={[styles.chip, selected && styles.chipSelected]}
        onPress={handlePress}
        activeOpacity={1}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={label}
      >
        <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
          {label}
        </Text>
      </TouchableOpacity>
    </Reanimated.View>
  );
}

interface PillProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

// Sub-components use the live theme via useTheme() so they react to
// light/dark mode changes alongside the main screen.

function Pill({ label, selected, onPress }: PillProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const scale = useSharedValue(1);
  const reduced = useReducedMotion();
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const handlePress = () => {
    tap('light');
    if (!reduced) {
      scale.value = withSequence(
        withTiming(1.04, { duration: 110, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: 130, easing: Easing.out(Easing.quad) }),
      );
    }
    onPress();
  };
  return (
    <Reanimated.View style={animStyle}>
      <TouchableOpacity
        style={[styles.pill, selected && styles.pillSelected]}
        onPress={handlePress}
        activeOpacity={1}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={label}
      >
        <Text style={[styles.pillText, selected && styles.pillTextSelected]}>
          {label}
        </Text>
      </TouchableOpacity>
    </Reanimated.View>
  );
}

interface LargeTileProps {
  label: string;
  sub?: string;
  selected: boolean;
  onPress: () => void;
}

function LargeTile({ label, sub, selected, onPress }: LargeTileProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const scale = useSharedValue(1);
  const reduced = useReducedMotion();
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
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
    <Reanimated.View style={animStyle}>
      <TouchableOpacity
        style={[styles.tile, selected && styles.tileSelected]}
        onPress={handlePress}
        activeOpacity={1}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={sub ? `${label}, ${sub}` : label}
      >
        <View style={styles.tileContent}>
          <Text style={[styles.tileLabel, selected && styles.tileLabelSelected]}>
            {label}
          </Text>
          {sub ? (
            <Text style={[styles.tileSub, selected && styles.tileSubSelected]}>
              {sub}
            </Text>
          ) : null}
        </View>
        {selected && (
          <Ionicons name="checkmark-circle" size={22} color={theme.accentInk} />
        )}
      </TouchableOpacity>
    </Reanimated.View>
  );
}

interface FoodChipProps { food: string; loved: string[]; disliked: string[]; onPress: () => void; }
function FoodChip({ food, loved, disliked, onPress }: FoodChipProps) {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const isLoved = loved.includes(food);
  const isDisliked = disliked.includes(food);
  const scale = useSharedValue(1);
  const reduced = useReducedMotion();
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const handlePress = () => {
    tap('light');
    if (!reduced) {
      scale.value = withSequence(
        withTiming(1.05, { duration: 100, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: 130, easing: Easing.out(Easing.quad) }),
      );
    }
    onPress();
  };
  return (
    <Reanimated.View style={animStyle}>
      <TouchableOpacity
        style={[styles.foodChip, isLoved && styles.foodChipLoved, isDisliked && styles.foodChipDisliked]}
        onPress={handlePress}
        activeOpacity={1}
        accessibilityRole="button"
        accessibilityState={{ selected: isLoved || isDisliked }}
        accessibilityLabel={food}
      >
        <Text style={[styles.foodChipText, isLoved && styles.foodChipTextLoved, isDisliked && styles.foodChipTextDisliked]}>
          {food}
        </Text>
      </TouchableOpacity>
    </Reanimated.View>
  );
}

// Spring-in checkmark for the survey-complete summary screen. Same physics
// signup's S12Done uses so the two flows feel like one.
function DoneIcon({ theme, style }: { theme: ThemeColors; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const scale = useSharedValue(reduced ? 1 : 0.6);
  const opacity = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) return;
    opacity.value = withTiming(1, { duration: 300, easing: Easing.out(Easing.cubic) });
    scale.value = withSequence(
      withSpring(1.08, { damping: 14, stiffness: 220, mass: 0.7 }),
      withSpring(1, { damping: 18, stiffness: 220 }),
    );
  }, [reduced, opacity, scale]);
  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));
  return (
    <Reanimated.View style={[style, animStyle]}>
      <Ionicons name="checkmark-circle" size={64} color={theme.signal.load} />
    </Reanimated.View>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function NutritionSurveyScreen() {
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [step, setStep] = useState(1);
  // Survey is seeded with DEFAULT_SURVEY but immediately hydrated from the
  // saved profile below. The hydration error path (audit 1.2/1.3) surfaces a
  // retry-able error block instead of swallowing — without that the edit flow
  // would PATCH empty fields and wipe the user's stored preferences.
  const [surveyData, setSurveyData] = useState<SurveyData>(DEFAULT_SURVEY);
  const [saving, setSaving] = useState(false);
  const [foodMode, setFoodMode] = useState<'love' | 'dislike'>('love');
  const [countrySearch, setCountrySearch] = useState('');
  const [countryListOpen, setCountryListOpen] = useState(false);
  const [profileData, setProfileData] = useState<NutritionProfile | null>(null);
  const [dietChangeNotice, setDietChangeNotice] = useState(false);
  // Hydration state — separate from saving so the gear-edit flow can show a
  // retry button if the backend GET fails. While `loading` is true the bottom
  // CTA stays disabled so the user can't PATCH empty defaults over their data.
  const [hydrating, setHydrating] = useState(true);
  const [hydrationError, setHydrationError] = useState<string | null>(null);

  const loadProfile = useCallback(() => {
    setHydrating(true);
    setHydrationError(null);
    getNutritionProfile()
      .then((profile) => {
        setProfileData(profile);
        // Hydrate survey state from the saved profile so editing an existing
        // profile doesn't wipe preferences by PATCHing empty DEFAULT_SURVEY fields.
        // Only overwrite fields that exist on the profile; keep defaults for anything missing.
        setSurveyData((prev) => {
          const next: SurveyData = { ...prev };
          (Object.keys(prev) as (keyof SurveyData)[]).forEach((key) => {
            const v = (profile as any)?.[key];
            if (v !== undefined && v !== null) (next as any)[key] = v;
          });
          return next;
        });
        setHydrating(false);
      })
      .catch((err: any) => {
        // 404 = first-time user with no profile yet. Fall through silently to
        // DEFAULT_SURVEY since there's nothing to hydrate.
        if (err?.response?.status === 404) {
          setHydrating(false);
          return;
        }
        if (!err?.response) {
          setHydrationError('Cannot reach the server. Check your connection and try again.');
        } else {
          const detail = err?.response?.data?.detail;
          const msg = typeof detail === 'string'
            ? detail
            : `Could not load your nutrition profile (${err.response.status}).`;
          setHydrationError(msg);
        }
        setHydrating(false);
      });
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // ── Navigation ──────────────────────────────────────────────────────────────
  // Reanimated spring transition between steps — same physics signup uses
  // (damping 22 / stiffness 220 / mass 0.6) so the two flows feel like one
  // continuous experience.
  const slideX = useSharedValue(0);
  const slideOpacity = useSharedValue(1);
  const reducedMotion = useReducedMotion();

  function navigate(next: number) {
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
  }

  function handleBack() {
    if (step === 1) {
      tap('medium');
      router.back();
    } else {
      navigate(step - 1);
    }
  }

  function handleSkip() {
    if (step < TOTAL_STEPS) navigate(step + 1);
  }

  function handleContinue() {
    if (step < TOTAL_STEPS) navigate(step + 1);
  }

  const slideStyle = useAnimatedStyle(() => ({
    flex: 1,
    transform: [{ translateX: slideX.value }],
    opacity: slideOpacity.value,
  }));

  // ── Patch handler ───────────────────────────────────────────────────────────

  async function handleSubmit() {
    tap('medium');
    setSaving(true);
    try {
      await apiClient.patch('/nutrition/profile', {
        ...surveyData,
        nutrition_survey_complete: true,
      });
      // Backend recomputes nutrition_targets when diet_type / carb_approach /
      // sugar_preference / strictness_level change. Force a fresh fetch on
      // the next Nutrition tab read so the user sees the updated calorie +
      // macro split immediately. The recalculate endpoint is idempotent;
      // calling it here is the explicit invalidation step the prompt asked
      // for. See docs/bugs/calorie-target-inconsistency.md.
      try {
        const { recalculateNutritionTargets } = await import('@/services/api');
        await recalculateNutritionTargets();
      } catch { /* non-fatal — backend already recomputed during the patch */ }
      tap('success');
      router.replace('/(tabs)/nutrition');
    } catch {
      Alert.alert('Error', 'Could not save your profile. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  // ── Update helpers ──────────────────────────────────────────────────────────

  function update<K extends keyof SurveyData>(key: K, value: SurveyData[K]) {
    setSurveyData((prev) => ({ ...prev, [key]: value }));
  }

  function selectDietType(diet: string) {
    setSurveyData((prev) => {
      const excluded = DIET_EXCLUDED[diet] ?? {};
      const allExcluded = new Set(Object.values(excluded).flat());
      const newLoved = prev.foods_loved.filter(f => !allExcluded.has(f));
      const newDisliked = prev.foods_disliked.filter(f => !allExcluded.has(f));
      const hadRemovals =
        newLoved.length < prev.foods_loved.length ||
        newDisliked.length < prev.foods_disliked.length;
      if (hadRemovals) setDietChangeNotice(true);
      else setDietChangeNotice(false);
      return { ...prev, diet_type: diet, foods_loved: newLoved, foods_disliked: newDisliked };
    });
  }

  function toggleMulti(key: 'cuisines_liked' | 'allergies', value: string) {
    setSurveyData((prev) => {
      const arr = prev[key] as string[];
      if (arr.includes(value)) {
        return { ...prev, [key]: arr.filter((v) => v !== value) };
      }
      return { ...prev, [key]: [...arr, value] };
    });
  }

  function toggleFood(food: string) {
    setSurveyData((prev) => {
      const loved = prev.foods_loved;
      const disliked = prev.foods_disliked;
      if (foodMode === 'love') {
        if (loved.includes(food)) return { ...prev, foods_loved: loved.filter(f => f !== food) };
        return { ...prev, foods_loved: [...loved, food], foods_disliked: disliked.filter(f => f !== food) };
      } else {
        if (disliked.includes(food)) return { ...prev, foods_disliked: disliked.filter(f => f !== food) };
        return { ...prev, foods_disliked: [...disliked, food], foods_loved: loved.filter(f => f !== food) };
      }
    });
  }

  function updateMealTime(index: number, value: string) {
    setSurveyData((prev) => {
      const times = [...prev.meal_times];
      times[index] = value;
      return { ...prev, meal_times: times };
    });
  }

  function updateMealsPerDay(count: number) {
    setSurveyData((prev) => {
      const times = Array.from({ length: count }, (_, i) => prev.meal_times[i] ?? '');
      return { ...prev, meals_per_day: count, meal_times: times };
    });
  }

  // ── Progress bar ────────────────────────────────────────────────────────────

  const progress = step / TOTAL_STEPS;
  // Smoothly animate the bar fill on every step change. Same 380ms ease-out
  // signup uses.
  const progressValue = useSharedValue(progress);
  useEffect(() => {
    progressValue.value = reducedMotion
      ? progress
      : withTiming(progress, { duration: 380, easing: Easing.out(Easing.cubic) });
  }, [progress, reducedMotion, progressValue]);
  const progressFillStyle = useAnimatedStyle(() => ({
    width: `${Math.round(progressValue.value * 100)}%`,
  }));

  // ── Summary lines for Step 6 ────────────────────────────────────────────────

  const summaryLines: { label: string; value: string }[] = [];
  if (surveyData.diet_type) summaryLines.push({ label: 'Diet', value: surveyData.diet_type });
  if (surveyData.nutrition_goal) summaryLines.push({ label: 'Goal', value: surveyData.nutrition_goal });
  if (surveyData.meals_per_day) summaryLines.push({ label: 'Meals per day', value: String(surveyData.meals_per_day) });
  if (surveyData.weekly_budget) summaryLines.push({ label: 'Budget', value: surveyData.weekly_budget });
  if (surveyData.cooking_skill) summaryLines.push({ label: 'Cooking skill', value: surveyData.cooking_skill });
  if (surveyData.strictness_level) summaryLines.push({ label: 'Strictness', value: surveyData.strictness_level });
  if (surveyData.foods_loved.length > 0) summaryLines.push({ label: 'Loves', value: surveyData.foods_loved.slice(0, 6).join(', ') });
  if (surveyData.foods_disliked.length > 0) summaryLines.push({ label: 'Avoids', value: surveyData.foods_disliked.slice(0, 6).join(', ') });

  // ── Render steps ────────────────────────────────────────────────────────────

  function renderStep1() {
    const filteredCategories = getFilteredCategories(surveyData.diet_type);

    return (
      <ScrollView style={styles.stepContainer} showsVerticalScrollIndicator={false}>
        <FadeSlideIn delay={0}>
          <Text style={styles.stepTitle}>What do you love eating?</Text>
        </FadeSlideIn>

        {/* Diet type — first so filtering applies immediately */}
        <FadeSlideIn delay={120}>
          <Text style={styles.sectionLabel}>Diet type</Text>
          <View style={styles.pillRow}>
            {DIET_TYPES.map((d) => (
              <Pill key={d} label={d} selected={surveyData.diet_type === d} onPress={() => selectDietType(d)} />
            ))}
          </View>

          {/* Halal / Kosher contextual notes */}
          {surveyData.diet_type === 'Halal' && (
            <Text style={styles.dietNote}>All meat selections will be assumed Halal sourced.</Text>
          )}
          {surveyData.diet_type === 'Kosher' && (
            <Text style={styles.dietNote}>Kosher meal plans will avoid mixing meat and dairy in the same meal.</Text>
          )}

          {/* Amber notice when selections were removed */}
          {dietChangeNotice && (
            <Text style={styles.dietChangeNotice}>
              Some of your previous selections were removed because they don't match your diet type.
            </Text>
          )}
        </FadeSlideIn>

        <FadeSlideIn delay={200}>
          <Text style={styles.sectionLabel}>Cuisines enjoyed</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {CUISINES.map((c) => (
              <Chip key={c} label={c} selected={surveyData.cuisines_liked.includes(c)} onPress={() => toggleMulti('cuisines_liked', c)} />
            ))}
          </ScrollView>
        </FadeSlideIn>

        <FadeSlideIn delay={280}>
          <Text style={styles.sectionLabel}>Foods you love & dislike</Text>
          <Text style={styles.foodModeHint}>Tap to mark as loved or disliked</Text>

          {/* Love / Dislike toggle */}
          <View style={styles.foodModeToggle}>
            <TouchableOpacity
              style={[styles.foodModeBtn, foodMode === 'love' && styles.foodModeBtnActive]}
              onPress={() => { tap('light'); setFoodMode('love'); }}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityState={{ selected: foodMode === 'love' }}
            >
              <Text style={[styles.foodModeBtnText, foodMode === 'love' && styles.foodModeBtnTextActive]}>Love</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.foodModeBtn, foodMode === 'dislike' && styles.foodModeBtnDislike, foodMode === 'dislike' && styles.foodModeBtnActive]}
              onPress={() => { tap('light'); setFoodMode('dislike'); }}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityState={{ selected: foodMode === 'dislike' }}
            >
              <Text style={[styles.foodModeBtnText, foodMode === 'dislike' && styles.foodModeBtnTextActive]}>Dislike</Text>
            </TouchableOpacity>
          </View>

          {filteredCategories.map((category) => (
            <View key={category.label}>
              <Text style={styles.foodCategoryLabel}>{category.label}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                {category.items.map((food) => (
                  <FoodChip
                    key={food}
                    food={food}
                    loved={surveyData.foods_loved}
                    disliked={surveyData.foods_disliked}
                    onPress={() => toggleFood(food)}
                  />
                ))}
              </ScrollView>
            </View>
          ))}
        </FadeSlideIn>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    );
  }

  function renderStep2() {
    return (
      <ScrollView style={styles.stepContainer} showsVerticalScrollIndicator={false}>
        <FadeSlideIn delay={0}>
          <Text style={styles.stepTitle}>Any restrictions?</Text>
        </FadeSlideIn>

        <FadeSlideIn delay={120}>
          <Text style={styles.sectionLabel}>Allergies</Text>
          <View style={styles.chipWrap}>
            {ALLERGIES.map((a) => (
              <Chip
                key={a}
                label={a}
                selected={surveyData.allergies.includes(a)}
                onPress={() => toggleMulti('allergies', a)}
              />
            ))}
          </View>
        </FadeSlideIn>

        <FadeSlideIn delay={200}>
          <Text style={styles.sectionLabel}>Primary nutrition goal</Text>
          {NUTRITION_GOALS.map((g) => (
            <LargeTile
              key={g}
              label={g}
              selected={surveyData.nutrition_goal === g}
              onPress={() => update('nutrition_goal', g)}
            />
          ))}
        </FadeSlideIn>

        <FadeSlideIn delay={280}>
          <Text style={styles.sectionLabel}>How strict?</Text>
          <View style={styles.pillRow}>
            {STRICTNESS_LEVELS.map((s) => (
              <Pill
                key={s}
                label={s}
                selected={surveyData.strictness_level === s}
                onPress={() => update('strictness_level', s)}
              />
            ))}
          </View>
        </FadeSlideIn>

        <FadeSlideIn delay={360}>
          <Text style={styles.sectionLabel}>Cheat days?</Text>
          <View style={styles.pillRow}>
            {CHEAT_DAY_OPTIONS.map((o) => (
              <Pill
                key={o}
                label={o}
                selected={surveyData.cheat_day_preference === o}
                onPress={() => update('cheat_day_preference', o)}
              />
            ))}
          </View>
        </FadeSlideIn>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    );
  }

  function renderStep3() {
    return (
      <ScrollView style={styles.stepContainer} showsVerticalScrollIndicator={false}>
        <FadeSlideIn delay={0}>
          <Text style={styles.stepTitle}>How do you approach sugar and carbs?</Text>
        </FadeSlideIn>

        <FadeSlideIn delay={120}>
          <Text style={styles.sectionLabel}>Sugar preference</Text>
          {SUGAR_PREFERENCES.map((s) => (
            <LargeTile
              key={s}
              label={s}
              selected={surveyData.sugar_preference === s}
              onPress={() => update('sugar_preference', s)}
            />
          ))}
        </FadeSlideIn>

        <FadeSlideIn delay={200}>
          <Text style={styles.sectionLabel}>Carb approach</Text>
          {CARB_APPROACHES.map((c) => (
            <LargeTile
              key={c}
              label={c}
              selected={surveyData.carb_approach === c}
              onPress={() => update('carb_approach', c)}
            />
          ))}
        </FadeSlideIn>

        <FadeSlideIn delay={280}>
          <Text style={styles.sectionLabel}>Intermittent fasting</Text>
          <View style={styles.pillRow}>
            {IF_OPTIONS.map((o) => (
              <Pill
                key={o}
                label={o}
                selected={surveyData.intermittent_fasting === o}
                onPress={() => update('intermittent_fasting', o)}
              />
            ))}
          </View>

          {surveyData.intermittent_fasting === 'Custom' && (
            <View style={styles.ifCustomRow}>
              <View style={styles.ifCustomField}>
                <Text style={styles.ifCustomLabel}>Fast start (HH:MM)</Text>
                <TextInput
                  style={styles.textInputSmall}
                  placeholder="e.g. 20:00"
                  placeholderTextColor={theme.text.muted}
                  value={surveyData.fasting_start_time}
                  onChangeText={(v) => update('fasting_start_time', v)}
                  keyboardType="numbers-and-punctuation"
                />
              </View>
              <View style={styles.ifCustomField}>
                <Text style={styles.ifCustomLabel}>Fast end (HH:MM)</Text>
                <TextInput
                  style={styles.textInputSmall}
                  placeholder="e.g. 12:00"
                  placeholderTextColor={theme.text.muted}
                  value={surveyData.fasting_end_time}
                  onChangeText={(v) => update('fasting_end_time', v)}
                  keyboardType="numbers-and-punctuation"
                />
              </View>
            </View>
          )}
        </FadeSlideIn>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    );
  }

  function renderStep4() {
    return (
      <ScrollView style={styles.stepContainer} showsVerticalScrollIndicator={false}>
        <FadeSlideIn delay={0}>
          <Text style={styles.stepTitle}>How do you like to eat?</Text>
        </FadeSlideIn>

        <FadeSlideIn delay={120}>
          <Text style={styles.sectionLabel}>Meals per day</Text>
          <View style={styles.numberSelectorRow}>
            {[2, 3, 4, 5, 6].map((n) => (
              <TouchableOpacity
                key={n}
                style={[styles.numberButton, surveyData.meals_per_day === n && styles.numberButtonSelected]}
                onPress={() => { tap('light'); updateMealsPerDay(n); }}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityState={{ selected: surveyData.meals_per_day === n }}
                accessibilityLabel={`${n} meals per day`}
              >
                <Text style={[styles.numberButtonText, surveyData.meals_per_day === n && styles.numberButtonTextSelected]}>
                  {n}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </FadeSlideIn>

        <FadeSlideIn delay={200}>
          <Text style={styles.sectionLabel}>Do you eat breakfast?</Text>
          <View style={styles.pillRow}>
            {BREAKFAST_OPTIONS.map((o) => (
              <Pill
                key={o}
                label={o}
                selected={surveyData.eats_breakfast === o}
                onPress={() => update('eats_breakfast', o)}
              />
            ))}
          </View>
        </FadeSlideIn>

        <FadeSlideIn delay={280}>
          <Text style={styles.sectionLabel}>Preferred meal times</Text>
          {Array.from({ length: surveyData.meals_per_day }, (_, i) => (
            <View key={i} style={styles.mealTimeRow}>
              <Text style={styles.mealTimeLabel}>
                {getMealLabel(i, surveyData.meals_per_day)}
              </Text>
              <TextInput
                style={styles.mealTimeInput}
                placeholder="HH:MM"
                placeholderTextColor={theme.text.muted}
                value={surveyData.meal_times[i] ?? ''}
                onChangeText={(v) => updateMealTime(i, v)}
                keyboardType="numbers-and-punctuation"
              />
            </View>
          ))}
        </FadeSlideIn>

        <FadeSlideIn delay={360}>
          <Text style={styles.sectionLabel}>Pre-workout nutrition</Text>
          <View style={styles.pillRow}>
            {PRE_WORKOUT_OPTIONS.map((o) => (
              <Pill
                key={o}
                label={o}
                selected={surveyData.pre_workout_nutrition === o}
                onPress={() => update('pre_workout_nutrition', o)}
              />
            ))}
          </View>

          <Text style={styles.sectionLabel}>Post-workout nutrition</Text>
          <View style={styles.pillRow}>
            {POST_WORKOUT_OPTIONS.map((o) => (
              <Pill
                key={o}
                label={o}
                selected={surveyData.post_workout_nutrition === o}
                onPress={() => update('post_workout_nutrition', o)}
              />
            ))}
          </View>

          <Text style={styles.sectionLabel}>Meal prep</Text>
          <View style={styles.pillRow}>
            {MEAL_PREP_OPTIONS.map((o) => (
              <Pill
                key={o}
                label={o}
                selected={surveyData.meal_prep === o}
                onPress={() => update('meal_prep', o)}
              />
            ))}
          </View>
        </FadeSlideIn>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    );
  }

  function renderStep5() {
    return (
      <ScrollView style={styles.stepContainer} showsVerticalScrollIndicator={false}>
        <FadeSlideIn delay={0}>
          <Text style={styles.stepTitle}>Tell us about your kitchen.</Text>
        </FadeSlideIn>

        <FadeSlideIn delay={120}>
          <Text style={styles.sectionLabel}>Cooking skill</Text>
          {COOKING_SKILLS.map((s) => (
            <LargeTile
              key={s.label}
              label={s.label}
              sub={s.sub}
              selected={surveyData.cooking_skill === s.label}
              onPress={() => update('cooking_skill', s.label)}
            />
          ))}
        </FadeSlideIn>

        <FadeSlideIn delay={200}>
          <Text style={styles.sectionLabel}>Time per meal</Text>
          <View style={styles.pillRow}>
            {TIME_PER_MEAL_OPTIONS.map((o) => (
              <Pill
                key={o}
                label={o}
                selected={surveyData.time_per_meal === o}
                onPress={() => update('time_per_meal', o)}
              />
            ))}
          </View>

          <Text style={styles.sectionLabel}>Weekly grocery budget</Text>
          <View style={styles.pillRow}>
            {BUDGET_OPTIONS.map((o) => (
              <Pill
                key={o}
                label={o}
                selected={surveyData.weekly_budget === o}
                onPress={() => update('weekly_budget', o)}
              />
            ))}
          </View>

          <Text style={styles.sectionLabel}>Kitchen access</Text>
          <View style={styles.pillRow}>
            {KITCHEN_OPTIONS.map((o) => (
              <Pill
                key={o}
                label={o}
                selected={surveyData.kitchen_access === o}
                onPress={() => update('kitchen_access', o)}
              />
            ))}
          </View>
        </FadeSlideIn>

        <FadeSlideIn delay={280}>
          <Text style={styles.sectionLabel}>Country / Region</Text>
          {surveyData.region ? (
            <TouchableOpacity
              style={styles.countrySelectedChip}
              onPress={() => { tap('light'); setCountryListOpen(true); setCountrySearch(''); }}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`Country: ${surveyData.region}, tap to change`}
            >
              <Text style={styles.countrySelectedText}>
                {COUNTRIES.find(c => c.name === surveyData.region)?.flag ?? '🌍'} {surveyData.region}
              </Text>
              <Text style={styles.countryChangeText}>Change</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.countryPickerTrigger}
              onPress={() => { tap('light'); setCountryListOpen(true); }}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Select your country"
            >
              <Text style={styles.countryPickerTriggerText}>Select your country</Text>
            </TouchableOpacity>
          )}
          {countryListOpen && (
            <View style={styles.countryDropdown}>
              <TextInput
                style={styles.countrySearchInput}
                placeholder="Search country..."
                placeholderTextColor={theme.text.muted}
                value={countrySearch}
                onChangeText={setCountrySearch}
                autoFocus
              />
              <ScrollView style={styles.countryScrollList} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                {COUNTRIES.filter(c => c.name.toLowerCase().includes(countrySearch.toLowerCase())).map((country) => (
                  <TouchableOpacity
                    key={country.name}
                    style={styles.countryItem}
                    onPress={() => { tap('light'); update('region', country.name); setCountryListOpen(false); setCountrySearch(''); }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.countryItemText}>{country.flag} {country.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
        </FadeSlideIn>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    );
  }

  function renderStep6() {
    // Use fetched profileData if available (returning user), else fall back to surveyData in-progress
    const pd = profileData;
    const sd = surveyData;

    type ProfileRow = { label: string; value: string };
    const rows: ProfileRow[] = [];

    const goal = pd?.nutrition_goal || sd.nutrition_goal;
    const diet = pd?.diet_type || sd.diet_type;
    const allergies = pd?.allergies || sd.allergies;
    const strictness = pd?.strictness_level || sd.strictness_level;
    const cheat = pd?.cheat_day_preference || sd.cheat_day_preference;
    const sugar = pd?.sugar_preference || sd.sugar_preference;
    const carbs = pd?.carb_approach || sd.carb_approach;
    const mealsPerDay = pd?.meals_per_day || sd.meals_per_day;
    const mealTimes = (pd?.meal_times || sd.meal_times)?.filter(Boolean) ?? [];
    const lovedFoods = (pd?.foods_loved as string[] | null) || sd.foods_loved;
    const dislikedFoods = (pd?.foods_disliked as string[] | null) || sd.foods_disliked;
    const region = pd?.region || sd.region;
    const budget = pd?.weekly_budget || sd.weekly_budget;
    const cookTime = pd?.time_per_meal || sd.time_per_meal;
    const skill = pd?.cooking_skill || sd.cooking_skill;
    const cuisines = (pd?.cuisines_liked as string[] | null) || sd.cuisines_liked;

    if (goal) rows.push({ label: 'Goal', value: goal });
    if (diet) rows.push({ label: 'Diet', value: allergies?.length ? `${diet} · no ${allergies.join(', ').toLowerCase()}` : diet });
    if (strictness) rows.push({ label: 'Strictness', value: cheat ? `${strictness} · ${cheat.toLowerCase()}` : strictness });
    if (sugar) rows.push({ label: 'Sugar', value: sugar });
    if (carbs) rows.push({ label: 'Carbs', value: carbs });
    if (mealsPerDay) rows.push({ label: 'Meals / day', value: mealTimes.length ? `${mealsPerDay} · ${mealTimes.join(', ')}` : String(mealsPerDay) });
    if (lovedFoods?.length) rows.push({ label: 'Loves', value: lovedFoods.slice(0, 8).join(', ') });
    if (dislikedFoods?.length) rows.push({ label: 'Avoids', value: dislikedFoods.slice(0, 8).join(', ') });
    if (cuisines?.length) rows.push({ label: 'Cuisines', value: cuisines.join(', ') });
    if (region) rows.push({ label: 'Region', value: region });
    if (budget) rows.push({ label: 'Budget', value: `${budget} / week` });
    if (cookTime) rows.push({ label: 'Cook time', value: cookTime });
    if (skill) rows.push({ label: 'Skill', value: skill });

    return (
      <ScrollView style={styles.stepContainer} showsVerticalScrollIndicator={false}>
        <DoneIcon theme={theme} style={styles.doneIconWrap} />
        <FadeSlideIn delay={150}>
          <Text style={styles.stepTitle}>Your Nutrition Profile</Text>
        </FadeSlideIn>
        <FadeSlideIn delay={220}>
          <Text style={styles.doneSubtitle}>
            ORYX generates daily meal plans tailored to these preferences. Your plan refreshes every morning.
          </Text>
        </FadeSlideIn>

        <FadeSlideIn delay={300}>
          <View style={styles.summaryCard}>
            {rows.length === 0 ? (
              <Text style={styles.summaryEmpty}>No preferences saved yet.</Text>
            ) : (
              rows.map((row, i) => (
                <View key={row.label}>
                  {i > 0 && <View style={styles.summaryDivider} />}
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>{row.label}</Text>
                    <Text style={styles.summaryValue}>{row.value}</Text>
                  </View>
                </View>
              ))
            )}
          </View>
        </FadeSlideIn>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    );
  }

  function renderCurrentStep() {
    switch (step) {
      case 1: return renderStep1();
      case 2: return renderStep2();
      case 3: return renderStep3();
      case 4: return renderStep4();
      case 5: return renderStep5();
      case 6: return renderStep6();
      default: return null;
    }
  }

  // ── Bottom button ───────────────────────────────────────────────────────────

  // Block forward progress while hydrating or if hydration failed — without
  // this, a user editing an existing profile could PATCH empty defaults
  // over their saved data (audit 1.2 / 1.3).
  const blocked = hydrating || !!hydrationError;
  const isFinalStep = step === TOTAL_STEPS;
  const ctaDisabled = blocked || saving;

  // Press-scale + pulse-on-enable, mirrored from signup's <PrimaryCTA>.
  const ctaScale = useSharedValue(1);
  const ctaPulse = useSharedValue(0);
  const prevDisabled = useRef<boolean>(ctaDisabled);
  useEffect(() => {
    if (prevDisabled.current && !ctaDisabled && !reducedMotion) {
      ctaPulse.value = withSequence(
        withTiming(1, { duration: 180, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 320, easing: Easing.in(Easing.quad) }),
      );
    }
    prevDisabled.current = ctaDisabled;
  }, [ctaDisabled, reducedMotion, ctaPulse]);
  const ctaAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ctaScale.value * (1 + ctaPulse.value * 0.025) }],
  }));
  const handleCtaPressIn = () => {
    if (!reducedMotion && !ctaDisabled) {
      ctaScale.value = withSpring(0.98, { damping: 22, stiffness: 380 });
    }
  };
  const handleCtaPressOut = () => {
    if (!reducedMotion) {
      ctaScale.value = withSpring(1, { damping: 18, stiffness: 320 });
    }
  };

  function renderBottomButton() {
    return (
      <Reanimated.View style={ctaAnimStyle}>
        <TouchableOpacity
          style={[
            styles.continueButton,
            isFinalStep && styles.submitButton,
            ctaDisabled && styles.continueButtonDisabled,
          ]}
          onPress={isFinalStep ? handleSubmit : handleContinue}
          onPressIn={handleCtaPressIn}
          onPressOut={handleCtaPressOut}
          disabled={ctaDisabled}
          activeOpacity={1}
          accessibilityRole="button"
          accessibilityLabel={isFinalStep ? 'Start my meal plan' : 'Continue to next step'}
        >
          {saving ? (
            <ActivityIndicator color={theme.text.primary} />
          ) : (
            <Text style={isFinalStep ? styles.submitButtonText : styles.continueButtonText}>
              {isFinalStep ? 'Start My Meal Plan' : 'Continue'}
            </Text>
          )}
        </TouchableOpacity>
      </Reanimated.View>
    );
  }

  // ── Layout ──────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      {/* Header row — circular glass back button matches the signup flow.
          Progress lives on the same row as the back/skip controls so the
          glass affordance reads as part of the chrome, not an extra layer. */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={handleBack}
          style={styles.backBtn}
          activeOpacity={0.75}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={20} color={theme.text.primary} />
        </TouchableOpacity>
        <View style={styles.progressTrack}>
          <Reanimated.View style={[styles.progressFill, progressFillStyle]} />
        </View>
        {step < TOTAL_STEPS ? (
          <TouchableOpacity
            onPress={handleSkip}
            style={styles.skipBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Skip step"
          >
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.skipBtn} />
        )}
      </View>

      {/* Hydration error — surfaced instead of swallowed (audit 1.2 / 1.3).
          Survey content stays mounted underneath; user can retry without
          losing the navigation state they have. */}
      {hydrationError && (
        <View style={styles.hydrationErrorBox}>
          <Text style={styles.hydrationErrorText}>{hydrationError}</Text>
          <TouchableOpacity
            onPress={loadProfile}
            style={styles.hydrationRetryBtn}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Retry loading nutrition profile"
          >
            <Ionicons name="refresh" size={14} color={theme.text.primary} />
            <Text style={styles.hydrationRetryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Step content — wrapped in the same Reanimated slide / fade as
          signup so step-to-step navigation feels coherent across the two
          flows. The conditional re-render of renderCurrentStep() inside the
          Reanimated.View ensures FadeSlideIn re-fires on every step. */}
      <Reanimated.View style={[styles.contentArea, slideStyle]}>
        {renderCurrentStep()}
      </Reanimated.View>

      {/* Bottom button */}
      <View style={styles.bottomButtonContainer}>
        {renderBottomButton()}
      </View>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function createStyles(t: ThemeColors) {
  return StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: t.bg.primary,
  },

  // Header — chrome row mirroring the signup chrome: 36×36 circular glass
  // back button, animated progress bar, right-aligned skip text.
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: t.glass.card,
    borderWidth: 1, borderColor: t.glass.border,
  },
  progressTrack: {
    flex: 1,
    height: 4,
    backgroundColor: t.glass.cardLo,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: t.accent,
    borderRadius: 2,
  },
  skipBtn: { minWidth: 40, alignItems: 'flex-end' },
  skipText: {
    color: t.text.muted,
    fontSize: 13,
    fontFamily: TY.sans.medium,
  },

  // Content
  contentArea: {
    flex: 1,
  },
  stepContainer: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  stepTitle: {
    color: t.text.primary,
    fontSize: 26,
    fontFamily: TY.sans.bold,
    marginBottom: 24,
    lineHeight: 32,
  },
  sectionLabel: {
    color: t.text.secondary,
    fontSize: 12,
    fontFamily: TY.sans.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
    marginTop: 20,
  },
  bottomSpacer: {
    height: 24,
  },

  // Chip (multi-select, outlined)
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: t.glass.rim,
    marginRight: 8,
    marginBottom: 8,
  },
  chipSelected: {
    backgroundColor: t.accent,
    borderColor: t.accent,
  },
  chipText: {
    color: t.text.body,
    fontSize: 13,
    fontFamily: TY.sans.medium,
  },
  chipTextSelected: {
    color: t.bg.elevated,
  },
  chipRow: {
    paddingVertical: 4,
    paddingRight: 20,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },

  // Pill (single-select, compact)
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: t.glass.rim,
    marginRight: 8,
    marginBottom: 8,
  },
  pillSelected: {
    backgroundColor: t.accent,
    borderColor: t.accent,
  },
  pillText: {
    color: t.text.body,
    fontSize: 13,
    fontFamily: TY.sans.medium,
  },
  pillTextSelected: {
    color: t.bg.elevated,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },

  // Large tile
  tile: {
    backgroundColor: t.glass.card,
    borderRadius: R.md,
    padding: 16,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: t.glass.border,
  },
  tileSelected: {
    backgroundColor: t.accent,
    borderColor: t.accent,
  },
  tileContent: {
    flex: 1,
  },
  tileLabel: {
    color: t.text.primary,
    fontSize: 15,
    fontFamily: TY.sans.semibold,
  },
  tileLabelSelected: {
    color: t.bg.elevated,
  },
  tileSub: {
    color: t.text.secondary,
    fontSize: 12,
    marginTop: 2,
  },
  tileSubSelected: {
    color: t.text.muted,
  },

  // TextInput
  textInput: {
    backgroundColor: t.glass.card,
    borderRadius: R.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: t.text.primary,
    fontSize: 14,
    borderWidth: 1,
    borderColor: t.glass.border,
  },
  textInputSmall: {
    backgroundColor: t.glass.card,
    borderRadius: R.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: t.text.primary,
    fontSize: 14,
    borderWidth: 1,
    borderColor: t.glass.border,
    flex: 1,
  },

  // IF Custom
  ifCustomRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  ifCustomField: {
    flex: 1,
  },
  ifCustomLabel: {
    color: t.text.secondary,
    fontSize: 12,
    marginBottom: 6,
  },

  // Number selector
  numberSelectorRow: {
    flexDirection: 'row',
    gap: 10,
  },
  numberButton: {
    width: 48,
    height: 48,
    borderRadius: R.sm,
    borderWidth: 1,
    borderColor: t.glass.rim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numberButtonSelected: {
    backgroundColor: t.accent,
    borderColor: t.accent,
  },
  numberButtonText: {
    color: t.text.body,
    fontSize: 17,
    fontFamily: TY.sans.semibold,
  },
  numberButtonTextSelected: {
    color: t.bg.elevated,
  },

  // Meal time rows
  mealTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    gap: 12,
  },
  mealTimeLabel: {
    color: t.text.primary,
    fontSize: 14,
    fontFamily: TY.sans.medium,
    width: 80,
  },
  mealTimeInput: {
    flex: 1,
    backgroundColor: t.glass.card,
    borderRadius: R.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: t.text.primary,
    fontSize: 14,
    borderWidth: 1,
    borderColor: t.glass.border,
  },

  // Step 6 — Done
  doneIconWrap: {
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 20,
  },
  doneSubtitle: {
    color: t.text.secondary,
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 28,
  },
  summaryCard: {
    backgroundColor: t.glass.card,
    borderRadius: R.md,
    padding: 18,
    borderWidth: 1,
    borderColor: t.glass.border,
  },
  summaryEmpty: {
    color: t.text.muted,
    fontSize: 13,
    textAlign: 'center',
  },
  summaryDivider: {
    height: 1,
    backgroundColor: t.divider,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 11,
  },
  summaryLabel: {
    color: t.text.secondary,
    fontSize: 13,
    fontFamily: TY.sans.medium,
    flex: 1,
  },
  summaryValue: {
    color: t.text.primary,
    fontSize: 13,
    fontFamily: TY.sans.medium,
    maxWidth: '58%',
    textAlign: 'right',
    lineHeight: 18,
  },

  // Bottom button
  bottomButtonContainer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  continueButton: {
    backgroundColor: t.accent,
    borderRadius: R.sm,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueButtonDisabled: { opacity: 0.4 },
  continueButtonText: {
    color: t.accentInk,
    fontSize: 16,
    fontFamily: TY.sans.bold,
  },

  // Hydration error block (audit 1.2 / 1.3) — same pattern as signup's
  // errorBox: dangerSoft fill, danger left rim, retry button.
  hydrationErrorBox: {
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: R.sm,
    backgroundColor: t.status.dangerSoft,
    borderLeftWidth: 3,
    borderLeftColor: t.status.danger,
  },
  hydrationErrorText: {
    flex: 1,
    color: t.status.danger,
    fontSize: 13,
    lineHeight: 18,
  },
  hydrationRetryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: R.xs,
    backgroundColor: t.glass.card,
    borderWidth: 1,
    borderColor: t.glass.border,
  },
  hydrationRetryText: {
    color: t.text.primary,
    fontSize: 13,
    fontFamily: TY.sans.semibold,
  },
  submitButton: {
    backgroundColor: t.signal.load,
  },
  submitButtonText: {
    color: t.text.primary,
    fontSize: 16,
    fontFamily: TY.sans.bold,
  },

  // Diet notes
  dietNote: {
    color: t.text.secondary, fontSize: 12, fontStyle: 'italic',
    marginTop: 4, marginBottom: 8,
  },
  dietChangeNotice: {
    color: t.status.warn, fontSize: 12,
    marginTop: 4, marginBottom: 8,
  },

  // Food chip styles
  foodModeHint: { color: t.text.muted, fontSize: 12, marginBottom: 10 },
  foodModeToggle: { flexDirection: 'row', marginBottom: 16, gap: 10 },
  foodModeBtn: {
    paddingHorizontal: 20, paddingVertical: 8, borderRadius: R.lg,
    borderWidth: 1, borderColor: t.glass.rim,
  },
  foodModeBtnActive: { backgroundColor: t.accent, borderColor: t.accent },
  foodModeBtnDislike: { borderColor: t.status.danger },
  foodModeBtnText: { color: t.text.secondary, fontSize: 13, fontFamily: TY.sans.semibold },
  foodModeBtnTextActive: { color: t.bg.elevated },
  foodCategoryLabel: {
    color: t.text.muted, fontSize: 11, fontFamily: TY.sans.semibold,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, marginTop: 14,
  },
  foodChip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: R.lg,
    borderWidth: 1, borderColor: t.glass.rim, marginRight: 8, marginBottom: 4,
  },
  foodChipLoved: { backgroundColor: t.accent, borderColor: t.accent },
  foodChipDisliked: { backgroundColor: t.status.danger + '20', borderColor: t.status.danger },
  foodChipText: { color: t.text.secondary, fontSize: 13, fontFamily: TY.sans.medium },
  foodChipTextLoved: { color: t.bg.elevated },
  foodChipTextDisliked: { color: t.status.danger },
  // Country dropdown styles
  countrySelectedChip: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: t.glass.card, borderRadius: R.sm, paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: t.glass.rim,
  },
  countrySelectedText: { color: t.text.primary, fontSize: 15, fontFamily: TY.sans.medium },
  countryChangeText: { color: t.text.muted, fontSize: 13 },
  countryPickerTrigger: {
    backgroundColor: t.glass.card, borderRadius: R.sm, paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1, borderColor: t.glass.border,
  },
  countryPickerTriggerText: { color: t.text.muted, fontSize: 14 },
  countryDropdown: {
    backgroundColor: t.bg.elevated, borderRadius: R.sm, borderWidth: 1, borderColor: t.border,
    marginTop: 8, overflow: 'hidden',
  },
  countrySearchInput: {
    paddingHorizontal: 14, paddingVertical: 10, color: t.text.primary, fontSize: 14,
    borderBottomWidth: 1, borderBottomColor: t.border,
  },
  countryScrollList: { maxHeight: 220 },
  countryItem: { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: t.border },
  countryItemText: { color: t.text.body, fontSize: 14 },
  });
}
