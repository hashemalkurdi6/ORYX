import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Pedometer } from 'expo-sensors';
import { BarChart } from 'react-native-chart-kit';
import Svg, { Circle as SvgCircle, G as SvgG } from 'react-native-svg';
import { WebView } from 'react-native-webview';
import {
  logActivity,
  getMyActivities,
  getHevyWorkouts,
  getActivities,
  upsertDailySteps,
  getActivityStats,
  getActivityHeatmap,
  getWellnessCheckins,
  retryActivityAutopsy,
  getWeeklyLoad,
  getReadiness,
  updateActivityRPE,
  logRestDay,
  generateStravaAutopsy,
  UserActivity,
  HevyWorkout,
  Activity,
  ActivityStats,
  HeatmapEntry,
  WellnessCheckin,
  WeeklyLoad,
  ReadinessScore,
} from '@/services/api';
import { useAuthStore } from '@/services/authStore';
import WarmUpModal from '@/components/WarmUpModal';
import OutdoorTracker, { SavedOutdoorActivity } from '@/components/OutdoorTracker';
import PlateCalculator from '@/components/PlateCalculator';
import MuscleMap from '@/components/MuscleMap';
import OryxInsightCreator from '@/components/OryxInsightCreator';
import AmbientBackdrop from '@/components/AmbientBackdrop';
import { ThemeColors, theme as T, type as TY, radius as R, space as SP } from '@/services/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { useCountUp } from '@/services/animations';
import { LinearGradient } from 'expo-linear-gradient';
import {
  SPORT_TYPES,
  EXERCISE_LIBRARY,
  MUSCLE_COLORS,
  MUSCLE_GROUP_LABELS,
  SportType,
  ExerciseDefinition,
} from '@/services/exerciseLibrary';

// ── Types ──────────────────────────────────────────────────────────────────────

type IntensityType = 'Easy' | 'Moderate' | 'Hard' | 'Max';
type LogStep = 'sport' | 'cardio' | 'strength' | 'rpe' | 'review';
type FilterType = 'All' | 'Strength' | 'Cardio' | 'Sport' | 'Strava' | 'Hevy';
type SetType = 'working' | 'warmup' | 'drop' | 'failure';

interface ExerciseSet {
  id: string;
  type: SetType;
  weight: string;
  reps: string;
  rpe: string;
  completed: boolean;
}

interface ExerciseEntry {
  id: string;
  name: string;
  muscleGroup: string;
  muscles: string[];
  sets: ExerciseSet[];
  notes: string;
  /** Superset grouping tag (e.g. 'A', 'B'). Exercises with the same tag are
   *  rendered as a superset; untagged exercises stand alone. */
  supersetGroup?: string | null;
}

type FeedItem =
  | { kind: 'manual'; sortKey: string; data: UserActivity }
  | { kind: 'hevy'; sortKey: string; data: HevyWorkout }
  | { kind: 'strava'; sortKey: string; data: Activity };

// ── Constants ──────────────────────────────────────────────────────────────────

const { width: SCREEN_W } = Dimensions.get('window');
const FILTERS: FilterType[] = ['All', 'Strength', 'Cardio', 'Sport', 'Strava', 'Hevy'];
const INTENSITIES: IntensityType[] = ['Easy', 'Moderate', 'Hard', 'Max'];
// Evaluated at call time so color tokens track the active theme (module-level
// array literals would freeze the palette to whatever theme was live at import).
const getSetTypes = (): { key: SetType; label: string; color: string }[] => [
  { key: 'working', label: 'W', color: T.text.primary },
  { key: 'warmup', label: 'U', color: T.text.secondary },
  { key: 'drop', label: 'D', color: T.status.danger },
  { key: 'failure', label: 'F', color: T.status.danger },
];
const SET_TYPE_KEYS: SetType[] = ['working', 'warmup', 'drop', 'failure'];
const CATEGORY_ICONS: Record<string, string> = {
  strength: 'barbell-outline',
  cardio: 'walk-outline',
  combat: 'body-outline',
  sport: 'football-outline',
  mindBody: 'leaf-outline',
  other: 'compass-outline',
};

// Module-level styles so sub-components defined outside the main component
// (RestTimerOverlay, ExerciseSearchModal, etc.) can reference `styles` without
// hitting a ReferenceError. Lazy so it doesn't run before createStyles is defined.
let _moduleStyles: ReturnType<typeof createStyles> | null = null;
const styles = new Proxy({} as ReturnType<typeof createStyles>, {
  get(_, prop: string) {
    if (!_moduleStyles) _moduleStyles = createStyles(T);
    return (_moduleStyles as any)[prop];
  },
});

// ── Helpers ────────────────────────────────────────────────────────────────────

function newSetId() {
  return Math.random().toString(36).slice(2);
}

function formatSeconds(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function intensityColor(v: string): string {
  switch (v) {
    case 'Easy': return T.status.success;
    case 'Moderate': return T.text.secondary;
    case 'Hard': return T.status.danger;
    case 'Max': return T.status.danger;
    default: return T.text.secondary;
  }
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function estimateCals(sport: SportType | null, intensity: IntensityType, durationMin: number, weightKg = 75): number {
  const met = sport ? sport.met[intensity] : 6.0;
  return Math.round(met * weightKg * (durationMin / 60));
}

function uniqueMuscles(exercises: ExerciseEntry[]): string[] {
  const set = new Set<string>();
  exercises.forEach(ex => ex.muscles.forEach(m => set.add(m)));
  return Array.from(set).filter(m => m !== 'full_body' && m !== 'cardio').slice(0, 6);
}

function loadColor(load: number): string {
  if (load < 150) return T.status.success;
  if (load < 300) return T.status.warn;
  if (load < 500) return T.status.warn;
  return T.status.danger;
}

function getStravaActivityIcon(sportType: string): string {
  const iconMap: Record<string, string> = {
    Run: 'walk-outline',
    TrailRun: 'trail-sign-outline',
    Ride: 'bicycle-outline',
    MountainBikeRide: 'bicycle-outline',
    GravelRide: 'bicycle-outline',
    EBikeRide: 'bicycle-outline',
    VirtualRide: 'bicycle-outline',
    Swim: 'water-outline',
    Walk: 'footsteps-outline',
    Hike: 'trail-sign-outline',
    WeightTraining: 'barbell-outline',
    Workout: 'fitness-outline',
    Yoga: 'leaf-outline',
    Crossfit: 'flame-outline',
    Soccer: 'football-outline',
    Tennis: 'tennisball-outline',
    Basketball: 'basketball-outline',
    Golf: 'golf-outline',
    Rowing: 'boat-outline',
    Kayaking: 'boat-outline',
    Skiing: 'snow-outline',
    Snowboard: 'snow-outline',
    IceSkate: 'snow-outline',
    RockClimbing: 'triangle-outline',
    Surfing: 'water-outline',
    Skateboard: 'flash-outline',
    Football: 'football-outline',
    Rugby: 'football-outline',
    Volleyball: 'stats-chart-outline',
    AlpineSki: 'snow-outline',
    NordicSki: 'snow-outline',
    BackcountrySki: 'snow-outline',
    Snowshoe: 'snow-outline',
    Elliptical: 'sync-outline',
    StairStepper: 'trending-up-outline',
  };
  return iconMap[sportType] ?? 'stats-chart-outline';
}

function formatPace(raw: string | null | undefined): string {
  if (!raw) return '';
  const stripped = raw.replace(/\s*\/km$/, '').trim();
  const parts = stripped.split(':');
  if (parts.length === 2) {
    const totalSec = parseInt(parts[0]) * 60 + parseInt(parts[1]);
    if (isNaN(totalSec) || totalSec > 1800) return 'N/A /km';
  }
  return stripped + ' /km';
}

function getWeekKey(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1; // days since Monday
  const monday = new Date(d);
  monday.setDate(d.getDate() - diff);
  return monday.toISOString().split('T')[0];
}

function getWeekLabel(weekKey: string): string {
  const monday = new Date(weekKey + 'T00:00:00');
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(monday)} – ${fmt(sunday)}`;
}

const FILTER_EMPTY: Record<FilterType, { icon: string; title: string; subtitle: string; action?: string }> = {
  All: { icon: 'barbell-outline', title: 'No activities yet', subtitle: 'Tap + to record your first session' },
  Strength: { icon: 'barbell-outline', title: 'No strength sessions yet', subtitle: 'Tap + to log a workout' },
  Cardio: { icon: 'walk-outline', title: 'No cardio sessions yet', subtitle: 'Log a run or connect Strava' },
  Sport: { icon: 'football-outline', title: 'No sport sessions yet', subtitle: 'Tap + to log a sport session' },
  Strava: { icon: 'bicycle-outline', title: 'No Strava activities', subtitle: 'Connect Strava in Settings to sync' },
  Hevy: { icon: 'barbell-outline', title: 'No Hevy workouts', subtitle: 'Connect Hevy in Settings to sync' },
};

// ListRow type for grouped FlatList
type ListRow =
  | { type: 'weekHeader'; weekKey: string; weekLabel: string; itemCount: number }
  | { type: 'feedItem'; item: FeedItem }
  | { type: 'showMore'; weekKey: string; remaining: number }
  | { type: 'loadEarlier' };

function decodePolyline(encoded: string): { latitude: number; longitude: number }[] {
  const coords: { latitude: number; longitude: number }[] = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let result = 0, shift = 0, b: number;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    result = 0; shift = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    coords.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return coords;
}

function buildMapHtml(coords: { latitude: number; longitude: number }[]): string {
  const latlngs = JSON.stringify(coords.map(c => [c.latitude, c.longitude]));
  return `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>body{margin:0;padding:0;background:#0a0a0a}#map{width:100vw;height:100vh}</style>
</head><body><div id="map"></div><script>
var map=L.map('map',{zoomControl:false,attributionControl:false});
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{maxZoom:19}).addTo(map);
var coords=${latlngs};
var line=L.polyline(coords,{color:'#FC4C02',weight:4,opacity:1}).addTo(map);
map.fitBounds(line.getBounds(),{padding:[24,24]});
</script></body></html>`;
}

function cardioMuscles(sportId: string): string[] {
  const map: Record<string, string[]> = {
    running: ['quads', 'hamstrings', 'calves', 'core'],
    cycling: ['quads', 'glutes', 'calves'],
    swimming: ['shoulders', 'back', 'chest', 'core'],
    rowing: ['back', 'lats', 'core'],
    walking: ['quads', 'calves'],
    hiking: ['quads', 'glutes', 'calves'],
    mma: ['core', 'shoulders', 'quads'],
    boxing: ['shoulders', 'core'],
    bjj: ['core', 'back', 'quads'],
  };
  return map[sportId] ?? ['core', 'cardio'];
}

// ── Rest Timer Overlay ─────────────────────────────────────────────────────────

const RestTimerOverlay = ({
  seconds,
  onSkip,
  onAdjust,
}: {
  seconds: number;
  onSkip: () => void;
  onAdjust: (delta: number) => void;
}) => (
  <View style={styles.restTimerBanner}>
    <Text style={styles.restTimerLabel}>Rest Timer</Text>
    <Text style={styles.restTimerCount}>{formatSeconds(seconds)}</Text>
    <View style={styles.restTimerRow}>
      <TouchableOpacity style={styles.restAdjBtn} onPress={() => onAdjust(-15)}>
        <Text style={styles.restAdjText}>−15s</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.restSkipBtn} onPress={onSkip}>
        <Text style={styles.restSkipText}>Skip</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.restAdjBtn} onPress={() => onAdjust(15)}>
        <Text style={styles.restAdjText}>+15s</Text>
      </TouchableOpacity>
    </View>
  </View>
);

// ── Exercise Search Modal ──────────────────────────────────────────────────────

const ExerciseSearchModal = ({
  visible,
  onClose,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (ex: ExerciseDefinition) => void;
}) => {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const categories = ['All', ...Object.keys(EXERCISE_LIBRARY)];

  const filtered = useMemo(() => {
    const pool = category === 'All'
      ? Object.values(EXERCISE_LIBRARY).flat()
      : (EXERCISE_LIBRARY[category] ?? []);
    if (!query.trim()) return pool;
    const q = query.toLowerCase();
    return pool.filter(e => e.name.toLowerCase().includes(q));
  }, [query, category]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.exSearchContainer}>
        <View style={styles.exSearchHeader}>
          <Text style={styles.exSearchTitle}>Add Exercise</Text>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color={T.text.primary} />
          </TouchableOpacity>
        </View>

        <View style={styles.exSearchInputWrap}>
          <Ionicons name="search-outline" size={16} color={T.text.muted} />
          <TextInput
            style={styles.exSearchInput}
            placeholder="Search exercises..."
            placeholderTextColor={T.text.muted}
            value={query}
            onChangeText={setQuery}
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll} contentContainerStyle={styles.catScrollContent}>
          {categories.map(c => (
            <TouchableOpacity
              key={c}
              style={[styles.catChip, category === c && styles.catChipActive]}
              onPress={() => setCategory(c)}
            >
              <Text style={[styles.catChipText, category === c && styles.catChipTextActive]}>{c}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <FlatList
          data={filtered}
          keyExtractor={i => i.id}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.exRow} onPress={() => { onSelect(item); onClose(); }}>
              <View style={[styles.exDot, { backgroundColor: MUSCLE_COLORS[item.muscleGroup] ?? T.text.primary }]} />
              <View style={styles.exRowInfo}>
                <Text style={styles.exRowName}>{item.name}</Text>
                <Text style={styles.exRowGroup}>{MUSCLE_GROUP_LABELS[item.muscleGroup] ?? item.muscleGroup}</Text>
              </View>
              <Ionicons name="add-circle-outline" size={20} color={T.text.primary} />
            </TouchableOpacity>
          )}
          contentContainerStyle={{ paddingBottom: 40 }}
        />
      </SafeAreaView>
    </Modal>
  );
};

// ── Set Row ────────────────────────────────────────────────────────────────────

const SetRow = ({
  set,
  index,
  prevWeight,
  prevReps,
  onChange,
  onComplete,
}: {
  set: ExerciseSet;
  index: number;
  prevWeight?: string;
  prevReps?: string;
  onChange: (field: keyof ExerciseSet, value: string | boolean | SetType) => void;
  onComplete: () => void;
}) => {
  const setTypes = getSetTypes();
  const setTypeInfo = setTypes.find(t => t.key === set.type)!;
  return (
    <View style={[styles.setRow, set.completed && styles.setRowCompleted]}>
      {/* Set number */}
      <Text style={styles.setNum}>{index + 1}</Text>

      {/* Type pill */}
      <TouchableOpacity
        style={[styles.setTypePill, { borderColor: setTypeInfo.color }]}
        onPress={() => {
          const idx = SET_TYPE_KEYS.indexOf(set.type);
          onChange('type', SET_TYPE_KEYS[(idx + 1) % SET_TYPE_KEYS.length]);
        }}
      >
        <Text style={[styles.setTypeText, { color: setTypeInfo.color }]}>{setTypeInfo.label}</Text>
      </TouchableOpacity>

      {/* Weight */}
      <TextInput
        style={styles.setInput}
        placeholder={prevWeight ?? 'kg'}
        placeholderTextColor={T.text.muted}
        keyboardType="decimal-pad"
        value={set.weight}
        onChangeText={v => onChange('weight', v)}
      />

      {/* Reps */}
      <TextInput
        style={styles.setInput}
        placeholder={prevReps ?? 'reps'}
        placeholderTextColor={T.text.muted}
        keyboardType="number-pad"
        value={set.reps}
        onChangeText={v => onChange('reps', v)}
      />

      {/* RPE */}
      <TextInput
        style={[styles.setInput, styles.setInputRPE]}
        placeholder="RPE"
        placeholderTextColor={T.text.muted}
        keyboardType="decimal-pad"
        maxLength={3}
        value={set.rpe}
        onChangeText={v => onChange('rpe', v)}
      />

      {/* Complete */}
      <TouchableOpacity style={styles.setCheckBtn} onPress={onComplete}>
        <Ionicons
          name={set.completed ? 'checkmark-circle' : 'ellipse-outline'}
          size={22}
          color={set.completed ? T.status.success : T.text.muted}
        />
      </TouchableOpacity>
    </View>
  );
};

// Convert a theme hex/rgb token to rgba with the supplied alpha — used so
// react-native-chart-kit color closures can theme-shift instead of hardcoding
// rgba literals.
const toRgba = (color: string, opacity: number): string => {
  if (color.startsWith('rgba')) return color;
  if (color.startsWith('rgb(')) return color.replace('rgb(', 'rgba(').replace(')', `,${opacity})`);
  if (color.startsWith('#')) {
    const h = color.replace('#', '');
    const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${opacity})`;
  }
  return color;
};

// ── RPE Prompt ─────────────────────────────────────────────────────────────────
// Evaluated at call time so light mode actually picks up — a module-level
// object literal would freeze to whichever theme was live at import.
const rpeColor = (n: number): string => {
  if (n <= 3) return T.status.success;
  if (n <= 9) return T.status.warn;
  return T.status.danger;
};
const RPE_LABELS: Record<number, string> = {
  1: 'Easy', 2: 'Easy', 3: 'Moderate', 4: 'Moderate',
  5: 'Hard', 6: 'Hard', 7: 'Very Hard', 8: 'Very Hard',
  9: 'Max Effort', 10: 'Max Effort',
};

const RPEPrompt = ({
  onSubmit,
  onSkip,
}: {
  onSubmit: (rpe: number) => void;
  onSkip: () => void;
}) => {
  const [selected, setSelected] = useState<number | null>(null);
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.rpeContainer, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <Text style={styles.rpeQuestion}>How hard was that?</Text>
      <Text style={styles.rpeSubtitle}>Rate the session difficulty</Text>
      <View style={styles.rpeCirclesRow}>
        {[1,2,3,4,5,6,7,8,9,10].map(n => (
          <TouchableOpacity
            key={n}
            style={[
              styles.rpeCircle,
              selected === n && { backgroundColor: rpeColor(n), borderColor: rpeColor(n) },
            ]}
            onPress={() => setSelected(n)}
            activeOpacity={0.75}
          >
            <Text style={[styles.rpeCircleNum, selected === n && { color: T.bg.primary }]}>{n}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {selected !== null && (
        <View style={[styles.rpeLabelPill, { backgroundColor: rpeColor(selected) + '22', borderColor: rpeColor(selected) }]}>
          <Text style={[styles.rpeLabelText, { color: rpeColor(selected) }]}>{RPE_LABELS[selected]}</Text>
        </View>
      )}
      <TouchableOpacity
        style={[styles.rpeSubmitBtn, selected === null && { opacity: 0.4 }]}
        onPress={() => selected !== null && onSubmit(selected)}
        disabled={selected === null}
        activeOpacity={0.85}
      >
        <Text style={styles.rpeSubmitText}>Save</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.rpeSkipBtn} onPress={onSkip}>
        <Text style={styles.rpeSkipText}>Skip</Text>
      </TouchableOpacity>
    </View>
  );
};

// ── Strength Builder ───────────────────────────────────────────────────────────

const StrengthBuilder = ({
  workoutName,
  onWorkoutNameChange,
  exercises,
  onExercisesChange,
  elapsedSeconds,
  restTimerSeconds,
  restTimerActive,
  onRestSkip,
  onRestAdjust,
  onAddExercise,
  onComplete,
  onBack,
  sportLabel,
}: {
  workoutName: string;
  onWorkoutNameChange: (v: string) => void;
  exercises: ExerciseEntry[];
  onExercisesChange: (ex: ExerciseEntry[]) => void;
  elapsedSeconds: number;
  restTimerSeconds: number;
  restTimerActive: boolean;
  onRestSkip: () => void;
  onRestAdjust: (delta: number) => void;
  onAddExercise: () => void;
  onComplete: () => void;
  onBack: () => void;
  sportLabel?: string;
}) => {
  const insets = useSafeAreaInsets();
  const [showPlateCalc, setShowPlateCalc] = useState(false);
  const [plateCalcTarget, setPlateCalcTarget] = useState<number | undefined>(undefined);

  const updateExercise = (idx: number, updated: ExerciseEntry) => {
    const next = exercises.map((ex, i) => (i === idx ? updated : ex));
    onExercisesChange(next);
  };

  const cycleSupersetGroup = (idx: number) => {
    const ex = exercises[idx];
    const order = [null, 'A', 'B', 'C', 'D'];
    const currentIdx = order.indexOf(ex.supersetGroup ?? null);
    const next = order[(currentIdx + 1) % order.length];
    updateExercise(idx, { ...ex, supersetGroup: next });
  };

  const openPlateCalc = (weight: string) => {
    const w = parseFloat(weight);
    setPlateCalcTarget(!isNaN(w) && w > 0 ? w : undefined);
    setShowPlateCalc(true);
  };

  const removeExercise = (idx: number) => {
    onExercisesChange(exercises.filter((_, i) => i !== idx));
  };

  const addSet = (exIdx: number) => {
    const ex = exercises[exIdx];
    const prevSet = ex.sets[ex.sets.length - 1];
    const newSet: ExerciseSet = {
      id: newSetId(),
      type: 'working',
      weight: prevSet?.weight ?? '',
      reps: prevSet?.reps ?? '',
      rpe: '',
      completed: false,
    };
    updateExercise(exIdx, { ...ex, sets: [...ex.sets, newSet] });
  };

  const updateSet = (exIdx: number, setIdx: number, field: keyof ExerciseSet, value: string | boolean | SetType) => {
    const ex = exercises[exIdx];
    const sets = ex.sets.map((s, i) => (i === setIdx ? { ...s, [field]: value } : s));
    updateExercise(exIdx, { ...ex, sets });
  };

  const completeSet = (exIdx: number, setIdx: number, onRestStart: () => void) => {
    const ex = exercises[exIdx];
    const wasCompleted = ex.sets[setIdx].completed;
    const sets = ex.sets.map((s, i) => (i === setIdx ? { ...s, completed: !s.completed } : s));
    updateExercise(exIdx, { ...ex, sets });
    if (!wasCompleted) onRestStart();
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Header */}
      <View style={[styles.strengthHeader, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={onBack}>
          <Ionicons name="chevron-back" size={24} color={T.text.primary} />
        </TouchableOpacity>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.elapsedTimer}>{formatSeconds(elapsedSeconds)}</Text>
          <Text style={styles.elapsedLabel}>Elapsed</Text>
        </View>
        <TouchableOpacity
          style={[styles.completeBtn, exercises.length === 0 && { opacity: 0.4 }]}
          onPress={onComplete}
          disabled={exercises.length === 0}
        >
          <Text style={styles.completeBtnText}>Finish</Text>
        </TouchableOpacity>
      </View>

      {/* Workout name */}
      <TextInput
        style={styles.workoutNameInput}
        placeholder={sportLabel ? `${sportLabel} Day` : 'Workout name'}
        placeholderTextColor={T.text.muted}
        value={workoutName}
        onChangeText={onWorkoutNameChange}
      />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.strengthScrollContent} keyboardShouldPersistTaps="handled">
        {exercises.map((ex, exIdx) => {
          // Superset visual grouping: when this exercise shares its
          // supersetGroup with a contiguous neighbor, render a bracketing
          // "SUPERSET X" header above the first member, indent the card,
          // and draw a connecting left bar to make the run read as one unit.
          const grp = ex.supersetGroup ?? null;
          const prevGrp = exIdx > 0 ? exercises[exIdx - 1].supersetGroup ?? null : null;
          const nextGrp = exIdx < exercises.length - 1 ? exercises[exIdx + 1].supersetGroup ?? null : null;
          const inGroup = grp != null && (prevGrp === grp || nextGrp === grp);
          const isGroupStart = inGroup && prevGrp !== grp;
          const isGroupEnd = inGroup && nextGrp !== grp;
          return (
          <View key={ex.id}>
            {isGroupStart && (
              <View style={styles.supersetHeader}>
                <View style={styles.supersetHeaderBar} />
                <Text style={styles.supersetHeaderText}>SUPERSET {grp}</Text>
              </View>
            )}
            <View
              style={[
                styles.exerciseCard,
                inGroup && styles.exerciseCardInSuperset,
                inGroup && !isGroupEnd && { marginBottom: 4 },
              ]}
            >
            <View style={styles.exerciseCardHeader}>
              <View style={[styles.exDot, { backgroundColor: MUSCLE_COLORS[ex.muscleGroup] ?? T.text.primary }]} />
              <Text style={styles.exerciseCardName}>{ex.name}</Text>
              <TouchableOpacity
                onPress={() => cycleSupersetGroup(exIdx)}
                style={{
                  paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
                  borderWidth: 1,
                  borderColor: ex.supersetGroup ? T.accent : T.glass.border,
                  backgroundColor: ex.supersetGroup ? T.accentDim : 'transparent',
                }}
                activeOpacity={0.7}
                hitSlop={6}
              >
                <Text style={{
                  fontFamily: TY.mono.semibold,
                  fontSize: 11,
                  color: ex.supersetGroup ? T.accent : T.text.secondary,
                  letterSpacing: 0.5,
                }}>
                  {ex.supersetGroup ? `SS·${ex.supersetGroup}` : 'SS'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => openPlateCalc(ex.sets.at(-1)?.weight ?? '')} hitSlop={6}>
                <Ionicons name="calculator-outline" size={18} color={T.text.secondary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => removeExercise(exIdx)}>
                <Ionicons name="trash-outline" size={18} color={T.status.danger} />
              </TouchableOpacity>
            </View>

            {/* Column headers */}
            <View style={styles.setHeaderRow}>
              <Text style={styles.setHeaderNum}>#</Text>
              <Text style={styles.setHeaderType}>Type</Text>
              <Text style={styles.setHeaderInput}>kg</Text>
              <Text style={styles.setHeaderInput}>Reps</Text>
              <Text style={styles.setHeaderRPE}>RPE</Text>
              <Text style={styles.setHeaderCheck}>✓</Text>
            </View>

            {ex.sets.map((set, setIdx) => (
              <SetRow
                key={set.id}
                set={set}
                index={setIdx}
                prevWeight={setIdx > 0 ? ex.sets[setIdx - 1].weight : undefined}
                prevReps={setIdx > 0 ? ex.sets[setIdx - 1].reps : undefined}
                onChange={(field, value) => updateSet(exIdx, setIdx, field, value)}
                onComplete={() =>
                  completeSet(exIdx, setIdx, () => {
                    /* rest timer started from parent */
                  })
                }
              />
            ))}

            <TouchableOpacity style={styles.addSetBtn} onPress={() => addSet(exIdx)}>
              <Ionicons name="add-outline" size={16} color={T.text.primary} />
              <Text style={styles.addSetText}>Add Set</Text>
            </TouchableOpacity>

            <TextInput
              style={styles.exNotesInput}
              placeholder="Exercise notes..."
              placeholderTextColor={T.text.muted}
              value={ex.notes}
              onChangeText={v => updateExercise(exIdx, { ...ex, notes: v })}
            />
            </View>
          </View>
          );
        })}

        <TouchableOpacity style={styles.addExerciseBtn} onPress={onAddExercise}>
          <Ionicons name="add-circle-outline" size={20} color={T.text.primary} />
          <Text style={styles.addExerciseText}>Add Exercise</Text>
        </TouchableOpacity>

        <View style={{ height: restTimerActive ? 130 : 40 }} />
      </ScrollView>

      {restTimerActive && (
        <RestTimerOverlay
          seconds={restTimerSeconds}
          onSkip={onRestSkip}
          onAdjust={onRestAdjust}
        />
      )}

      <PlateCalculator
        visible={showPlateCalc}
        onClose={() => setShowPlateCalc(false)}
        initialTargetKg={plateCalcTarget}
      />
    </View>
  );
};

// ── Cardio Logger ──────────────────────────────────────────────────────────────

const CardioLogger = ({
  sport,
  workoutName,
  duration,
  distance,
  intensity,
  notes,
  userWeight,
  onChange,
  onSubmit,
  onBack,
  submitting,
}: {
  sport: SportType;
  workoutName: string;
  duration: string;
  distance: string;
  intensity: IntensityType;
  notes: string;
  userWeight: number;
  onChange: (field: string, value: string) => void;
  onSubmit: () => void;
  onBack: () => void;
  submitting: boolean;
}) => {
  const insets = useSafeAreaInsets();
  const durationNum = parseInt(duration) || 0;
  const cals = estimateCals(sport, intensity, durationNum, userWeight);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <View style={[styles.cardioHeader, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={onBack}>
          <Ionicons name="chevron-back" size={24} color={T.text.primary} />
        </TouchableOpacity>
        <View style={styles.cardioSportTag}>
          <Ionicons name={sport.icon as any} size={16} color={T.text.primary} />
          <Text style={styles.cardioSportLabel}>{sport.label}</Text>
        </View>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.cardioScrollContent, { paddingBottom: insets.bottom + 40 }]} keyboardShouldPersistTaps="handled">
        <TextInput
          style={styles.workoutNameInput}
          placeholder={`${sport.label} session`}
          placeholderTextColor={T.text.muted}
          value={workoutName}
          onChangeText={v => onChange('workoutName', v)}
        />

        <View style={styles.cardioRow}>
          <View style={styles.cardioField}>
            <Text style={styles.cardioFieldLabel}>Duration</Text>
            <View style={styles.cardioInputRow}>
              <TextInput
                style={styles.cardioInput}
                placeholder="45"
                placeholderTextColor={T.text.muted}
                keyboardType="number-pad"
                value={duration}
                onChangeText={v => onChange('duration', v)}
              />
              <Text style={styles.cardioUnit}>min</Text>
            </View>
          </View>
          <View style={styles.cardioField}>
            <Text style={styles.cardioFieldLabel}>Distance (optional)</Text>
            <View style={styles.cardioInputRow}>
              <TextInput
                style={styles.cardioInput}
                placeholder="5.0"
                placeholderTextColor={T.text.muted}
                keyboardType="decimal-pad"
                value={distance}
                onChangeText={v => onChange('distance', v)}
              />
              <Text style={styles.cardioUnit}>km</Text>
            </View>
          </View>
        </View>

        <Text style={styles.sectionLabel}>Intensity</Text>
        <View style={styles.intensityRow}>
          {INTENSITIES.map(i => (
            <TouchableOpacity
              key={i}
              style={[styles.intensityPill, intensity === i && { backgroundColor: intensityColor(i) }]}
              onPress={() => onChange('intensity', i)}
            >
              <Text style={[styles.intensityPillText, intensity === i && { color: T.text.primary }]}>{i}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {durationNum > 0 && (
          <View style={styles.calsPreviewCard}>
            <Ionicons name="flame-outline" size={20} color={T.status.danger} />
            <Text style={styles.calsPreviewText}>~{cals} kcal estimated</Text>
          </View>
        )}

        <Text style={styles.sectionLabel}>Notes</Text>
        <TextInput
          style={styles.notesInput}
          placeholder="How did it feel? Any issues?"
          placeholderTextColor={T.text.muted}
          multiline
          numberOfLines={3}
          value={notes}
          onChangeText={v => onChange('notes', v)}
        />

        <TouchableOpacity
          style={[styles.submitBtn, (!duration || submitting) && { opacity: 0.5 }]}
          onPress={onSubmit}
          disabled={!duration || submitting}
        >
          {submitting ? (
            <ActivityIndicator color={T.text.primary} />
          ) : (
            <>
              <Ionicons name="checkmark-circle-outline" size={20} color={T.text.primary} />
              <Text style={styles.submitBtnText}>Log Session</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

// ── Sport Selector ─────────────────────────────────────────────────────────────

const SportSelector = ({ onSelect, onClose, defaultCategory }: { onSelect: (s: SportType) => void; onClose: () => void; defaultCategory?: string | null }) => {
  const insets = useSafeAreaInsets();
  const [catFilter, setCatFilter] = useState<string>(defaultCategory ?? 'All');
  const cats = ['All', 'strength', 'cardio', 'combat', 'sport', 'mindBody', 'other'];
  const filtered = catFilter === 'All' ? SPORT_TYPES : SPORT_TYPES.filter(s => s.category === catFilter);

  return (
    <View style={{ flex: 1 }}>
      <AmbientBackdrop />
      <View style={[styles.sportSelectorHeader, { paddingTop: insets.top + 12 }]}>
        <View>
          <Text style={styles.sportSelectorTicker}>LOG · ACTIVITY</Text>
          <Text style={styles.sportSelectorTitle}>Select activity</Text>
        </View>
        <TouchableOpacity
          onPress={onClose}
          style={styles.sportSelectorClose}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          activeOpacity={0.75}
        >
          <Ionicons name="close" size={18} color={T.text.body} />
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll} contentContainerStyle={styles.catScrollContent}>
        {cats.map(c => {
          const active = catFilter === c;
          return (
            <TouchableOpacity
              key={c}
              style={[styles.catChip, active && styles.catChipActive]}
              onPress={() => setCatFilter(c)}
              activeOpacity={0.8}
            >
              <Text style={[styles.catChipText, active && styles.catChipTextActive]}>
                {c === 'All' ? 'All' : c.charAt(0).toUpperCase() + c.slice(1)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <FlatList
        data={filtered}
        keyExtractor={s => s.id}
        numColumns={3}
        contentContainerStyle={styles.sportGrid}
        columnWrapperStyle={{ gap: 10 }}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.sportTile} onPress={() => onSelect(item)} activeOpacity={0.8}>
            <View style={styles.sportIconWrap}>
              <Ionicons name={item.icon as any} size={24} color={T.text.primary} />
            </View>
            <Text style={styles.sportTileLabel} numberOfLines={1}>{item.label}</Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
};

// ── Post Session View ──────────────────────────────────────────────────────────

const PostSessionView = ({
  activity,
  sport,
  exercises,
  onDone,
}: {
  activity: UserActivity;
  sport: SportType | null;
  exercises: ExerciseEntry[];
  onDone: () => void;
}) => {
  const insets = useSafeAreaInsets();
  const muscles = exercises.length > 0 ? uniqueMuscles(exercises) : cardioMuscles(sport?.id ?? '');
  const totalSets = exercises.reduce((sum, ex) => sum + ex.sets.filter(s => s.completed).length, 0);
  const totalVolume = exercises.reduce((sum, ex) =>
    sum + ex.sets.reduce((s2, set) => {
      if (!set.completed) return s2;
      const w = parseFloat(set.weight) || 0;
      const r = parseInt(set.reps) || 0;
      return s2 + w * r;
    }, 0), 0);

  const [autopsyText, setAutopsyText] = useState<string | null>(activity.autopsy_text);
  const [autopsyTimedOut, setAutopsyTimedOut] = useState(false);
  const [autopsyRetrying, setAutopsyRetrying] = useState(false);

  useEffect(() => {
    if (autopsyText) return;
    const timer = setTimeout(() => setAutopsyTimedOut(true), 15000);
    return () => clearTimeout(timer);
  }, [autopsyText]);

  const handleRetryAutopsy = async () => {
    setAutopsyRetrying(true);
    setAutopsyTimedOut(false);
    try {
      console.log('[Autopsy] Retrying for activity', activity.id);
      const updated = await retryActivityAutopsy(activity.id);
      console.log('[Autopsy] Retry result:', updated.autopsy_text ? 'success' : 'still null');
      if (updated.autopsy_text) {
        setAutopsyText(updated.autopsy_text);
      } else {
        setAutopsyTimedOut(true);
      }
    } catch (err) {
      console.error('[Autopsy] Retry failed:', err);
      setAutopsyTimedOut(true);
    } finally {
      setAutopsyRetrying(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={[styles.reviewScroll, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.reviewCheckCircle}>
        <Ionicons name="checkmark-circle" size={64} color={T.status.success} />
      </View>
      <Text style={styles.reviewTitle}>Session Complete</Text>
      <Text style={styles.reviewSubtitle}>{activity.activity_type}</Text>

      {/* Stats row */}
      <View style={styles.reviewStatsRow}>
        <View style={styles.reviewStat}>
          <Text style={styles.reviewStatVal}>{formatDuration(activity.duration_minutes)}</Text>
          <Text style={styles.reviewStatLabel}>Duration</Text>
        </View>
        <View style={styles.reviewStat}>
          <Text style={styles.reviewStatVal}>{Math.round(activity.calories_burned ?? 0)}</Text>
          <Text style={styles.reviewStatLabel}>Calories</Text>
        </View>
        {totalSets > 0 && (
          <View style={styles.reviewStat}>
            <Text style={styles.reviewStatVal}>{totalSets}</Text>
            <Text style={styles.reviewStatLabel}>Sets</Text>
          </View>
        )}
        {totalVolume > 0 && (
          <View style={styles.reviewStat}>
            <Text style={styles.reviewStatVal}>{Math.round(totalVolume / 1000 * 10) / 10}t</Text>
            <Text style={styles.reviewStatLabel}>Volume</Text>
          </View>
        )}
      </View>

      {/* Muscles worked */}
      {muscles.length > 0 && (
        <View style={styles.reviewSection}>
          <Text style={styles.reviewSectionTitle}>Muscles Worked</Text>
          <View style={{ marginBottom: 16, alignItems: 'center' }}>
            <MuscleMap muscles={muscles} size={130} />
          </View>
          <View style={styles.muscleTagsRow}>
            {muscles.map(m => (
              <View key={m} style={[styles.muscleTag, { backgroundColor: (MUSCLE_COLORS[m] ?? T.text.primary) + '33', borderColor: MUSCLE_COLORS[m] ?? T.text.primary }]}>
                <View style={[styles.muscleDot, { backgroundColor: MUSCLE_COLORS[m] ?? T.text.primary }]} />
                <Text style={[styles.muscleTagText, { color: MUSCLE_COLORS[m] ?? T.text.primary }]}>
                  {MUSCLE_GROUP_LABELS[m] ?? m}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* AI Autopsy */}
      <View style={styles.autopsyCard}>
        <View style={styles.autopsyHeader}>
          <Ionicons name="analytics-outline" size={16} color={T.text.primary} />
          <Text style={styles.autopsyTitle}>AI Analysis</Text>
        </View>
        {autopsyText ? (
          <Text style={styles.autopsyText}>{autopsyText}</Text>
        ) : autopsyTimedOut ? (
          <>
            <Text style={styles.autopsyGenerating}>Analysis is taking longer than expected.</Text>
            <TouchableOpacity
              style={styles.autopsyRetryBtn}
              onPress={handleRetryAutopsy}
              disabled={autopsyRetrying}
              activeOpacity={0.8}
            >
              {autopsyRetrying ? (
                <ActivityIndicator size="small" color={T.text.secondary} />
              ) : (
                <Text style={styles.autopsyRetryText}>Tap to retry</Text>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <ActivityIndicator size="small" color={T.text.secondary} style={{ marginTop: 8 }} />
            <Text style={styles.autopsyGenerating}>Generating AI analysis...</Text>
          </>
        )}
      </View>

      <TouchableOpacity style={styles.doneBtn} onPress={onDone}>
        <Text style={styles.doneBtnText}>Done</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

// ── Feed Card ──────────────────────────────────────────────────────────────────

const FeedCard = ({ item, onPress, onShare }: { item: FeedItem; onPress: () => void; onShare: (item: FeedItem) => void }) => {
  if (item.kind === 'manual') {
    const a = item.data;

    // Rest day — minimal distinct card (no share button)
    if (a.is_rest_day) {
      return (
        <TouchableOpacity style={[styles.feedCard, styles.feedCardRest]} onPress={onPress} activeOpacity={0.8}>
          <View style={styles.feedCardTop}>
            <View style={[styles.feedIconWrap, { backgroundColor: T.glass.card }]}>
              <Ionicons name="moon-outline" size={22} color={T.text.muted} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.feedCardTitleRow}>
                <Text style={[styles.feedCardTitle, { color: T.text.muted }]} numberOfLines={1}>{a.activity_type}</Text>
                <View style={[styles.sourceBadge, { borderColor: T.glass.border }]}>
                  <Text style={[styles.sourceBadgeText, { color: T.text.muted }]}>REST DAY</Text>
                </View>
              </View>
              <Text style={styles.feedCardMeta}>{fmtDate(a.logged_at)}</Text>
            </View>
          </View>
        </TouchableOpacity>
      );
    }

    const muscles = a.muscle_groups ?? (a.exercise_data ? uniqueMuscles(a.exercise_data as any) : []);
    return (
      <TouchableOpacity style={styles.feedCard} onPress={onPress} activeOpacity={0.8}>
        <View style={styles.feedCardTop}>
          <View style={styles.feedIconWrap}>
            <Ionicons name={CATEGORY_ICONS[a.sport_category ?? 'other'] as any} size={22} color={T.text.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.feedCardTitleRow}>
              <Text style={styles.feedCardTitle} numberOfLines={1}>{a.activity_type}</Text>
              <View style={styles.sourceBadge}><Text style={styles.sourceBadgeText}>manual</Text></View>
              <TouchableOpacity onPress={() => onShare(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="share-outline" size={16} color={T.text.muted} />
              </TouchableOpacity>
            </View>
            <Text style={styles.feedCardMeta}>{fmtDate(a.logged_at)} · {formatDuration(a.duration_minutes)}</Text>
          </View>
        </View>
        <View style={styles.feedCardStats}>
          <View style={[styles.intensityBadge, { backgroundColor: intensityColor(a.intensity) + '22', borderColor: intensityColor(a.intensity) }]}>
            <Text style={[styles.intensityBadgeText, { color: intensityColor(a.intensity) }]}>{a.intensity}</Text>
          </View>
          {a.training_load != null && a.training_load > 0 && (
            <View style={[styles.loadBadge, { backgroundColor: loadColor(a.training_load) + '22', borderColor: loadColor(a.training_load) }]}>
              <Text style={[styles.loadBadgeText, { color: loadColor(a.training_load) }]}>Load: {a.training_load}</Text>
            </View>
          )}
          {a.rpe != null && a.rpe > 0 && (
            <View style={[styles.loadBadge, { backgroundColor: T.accentDim, borderColor: T.accent }]}>
              <Text style={[styles.loadBadgeText, { color: T.accent }]}>RPE {a.rpe}</Text>
            </View>
          )}
          {a.calories_burned != null && (
            <View style={styles.feedStatItem}>
              <Ionicons name="flame-outline" size={12} color={T.status.danger} />
              <Text style={styles.feedStatText}>{Math.round(a.calories_burned)} kcal</Text>
            </View>
          )}
        </View>
        {a.autopsy_text && (
          <Text style={styles.feedAutopsy} numberOfLines={2}>{a.autopsy_text}</Text>
        )}
        {muscles.length > 0 && (
          <View style={styles.feedMuscleRow}>
            {muscles.slice(0, 5).map(m => (
              <View key={m} style={[styles.feedMuscleDot, { backgroundColor: MUSCLE_COLORS[m] ?? T.text.primary }]} />
            ))}
          </View>
        )}
      </TouchableOpacity>
    );
  }

  if (item.kind === 'hevy') {
    const h = item.data;
    return (
      <TouchableOpacity style={styles.feedCard} onPress={onPress} activeOpacity={0.8}>
        <View style={styles.feedCardTop}>
          <View style={[styles.feedIconWrap, { backgroundColor: T.glass.card }]}>
            <Ionicons name="barbell-outline" size={22} color={T.text.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.feedCardTitleRow}>
              <Text style={styles.feedCardTitle} numberOfLines={1}>{h.title}</Text>
              <View style={[styles.sourceBadge, { backgroundColor: T.glass.card, borderColor: T.glass.card }]}>
                <Text style={[styles.sourceBadgeText, { color: T.text.secondary }]}>Hevy</Text>
              </View>
              <TouchableOpacity onPress={() => onShare(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="share-outline" size={16} color={T.text.muted} />
              </TouchableOpacity>
            </View>
            <Text style={styles.feedCardMeta}>{fmtDate(h.started_at)} · {h.duration_seconds ? formatDuration(Math.round(h.duration_seconds / 60)) : '—'}</Text>
          </View>
        </View>
        <View style={styles.feedCardStats}>
          {h.volume_kg != null && (
            <View style={styles.feedStatItem}>
              <Ionicons name="trending-up-outline" size={12} color={T.text.secondary} />
              <Text style={styles.feedStatText}>{Math.round(h.volume_kg)} kg vol.</Text>
            </View>
          )}
          <View style={styles.feedStatItem}>
            <Ionicons name="barbell-outline" size={12} color={T.text.secondary} />
            <Text style={styles.feedStatText}>{h.exercises?.length ?? 0} exercises</Text>
          </View>
        </View>
        {h.prs && h.prs.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {h.prs.slice(0, 3).map((pr, i) => (
              <View
                key={i}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 4,
                  backgroundColor: T.accentDim,
                  borderWidth: 1, borderColor: T.accent,
                  borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3,
                }}
              >
                <Ionicons name="trophy-outline" size={11} color={T.accent} />
                <Text style={{ fontFamily: TY.mono.semibold, fontSize: 10, color: T.accent, letterSpacing: 0.3 }}>
                  {pr.kind === '1rm' ? '1RM' : pr.kind === 'max_weight' ? 'WEIGHT' : 'REPS'} PR · {pr.exercise}
                </Text>
              </View>
            ))}
            {h.prs.length > 3 && (
              <Text style={{ fontFamily: TY.mono.semibold, fontSize: 10, color: T.accent, alignSelf: 'center' }}>
                +{h.prs.length - 3} more
              </Text>
            )}
          </View>
        )}
        {h.autopsy_text && <Text style={styles.feedAutopsy} numberOfLines={2}>{h.autopsy_text}</Text>}
      </TouchableOpacity>
    );
  }

  // strava
  const s = item.data;
  const dist = s.distance_meters ? `${(s.distance_meters / 1000).toFixed(1)} km` : null;
  const paceStr = formatPace(s.pace_per_km_str);
  return (
    <TouchableOpacity style={styles.feedCard} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.feedCardTop}>
        <View style={[styles.feedIconWrap, { backgroundColor: T.glass.card }]}>
          <Ionicons name={getStravaActivityIcon(s.sport_type) as any} size={22} color="#FC4C02" />
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.feedCardTitleRow}>
            <Text style={styles.feedCardTitle} numberOfLines={1}>{s.name}</Text>
            <View style={[styles.sourceBadge, { backgroundColor: T.glass.card, borderColor: '#FC4C02' }]}>
              <Text style={[styles.sourceBadgeText, { color: '#FC4C02' }]}>Strava</Text>
            </View>
            <TouchableOpacity onPress={() => onShare(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="share-outline" size={16} color={T.text.muted} />
            </TouchableOpacity>
          </View>
          <Text style={styles.feedCardMeta}>{fmtDate(s.start_date)} · {s.elapsed_time_seconds ? formatDuration(Math.round(s.elapsed_time_seconds / 60)) : '—'}</Text>
        </View>
      </View>
      <View style={styles.feedCardStats}>
        {dist && <View style={styles.feedStatItem}><Ionicons name="map-outline" size={12} color="#FC4C02" /><Text style={styles.feedStatText}>{dist}</Text></View>}
        {paceStr && paceStr !== 'N/A /km' && <View style={styles.feedStatItem}><Ionicons name="speedometer-outline" size={12} color="#FC4C02" /><Text style={styles.feedStatText}>{paceStr}</Text></View>}
        {s.avg_heart_rate && <View style={styles.feedStatItem}><Ionicons name="heart-outline" size={12} color="#FC4C02" /><Text style={styles.feedStatText}>{Math.round(s.avg_heart_rate)} bpm</Text></View>}
      </View>
      {s.autopsy_text && <Text style={styles.feedAutopsy} numberOfLines={2}>{s.autopsy_text}</Text>}
    </TouchableOpacity>
  );
};

// ── Strava Activity Detail ─────────────────────────────────────────────────────

const StravaDetail = ({ activity }: { activity: Activity }) => {
  const [autopsy, setAutopsy] = useState(activity.autopsy_text);
  const [generating, setGenerating] = useState(false);

  const coords = activity.summary_polyline ? decodePolyline(activity.summary_polyline) : [];

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const result = await generateStravaAutopsy(activity.id);
      setAutopsy(result.autopsy);
    } catch {
      // silently fail
    } finally {
      setGenerating(false);
    }
  };

  return (
    <>
      <Text style={styles.expandTitle}>{activity.name}</Text>
      <Text style={styles.expandMeta}>{fmtDate(activity.start_date)} · {activity.sport_type}</Text>

      {/* Route Map */}
      {coords.length > 1 && (
        <View style={styles.stravaMapWrap}>
          <WebView
            style={styles.stravaMap}
            source={{ html: buildMapHtml(coords) }}
            scrollEnabled={false}
            originWhitelist={['*']}
          />
        </View>
      )}

      {/* Stats */}
      <View style={styles.reviewStatsRow}>
        {activity.distance_meters != null && (
          <View style={styles.reviewStat}>
            <Text style={styles.reviewStatVal}>{(activity.distance_meters / 1000).toFixed(2)}</Text>
            <Text style={styles.reviewStatLabel}>km</Text>
          </View>
        )}
        {!!activity.elapsed_time_seconds && (
          <View style={styles.reviewStat}>
            <Text style={styles.reviewStatVal}>{formatDuration(Math.round(activity.elapsed_time_seconds / 60))}</Text>
            <Text style={styles.reviewStatLabel}>Time</Text>
          </View>
        )}
        {activity.avg_heart_rate != null && (
          <View style={styles.reviewStat}>
            <Text style={styles.reviewStatVal}>{Math.round(activity.avg_heart_rate)}</Text>
            <Text style={styles.reviewStatLabel}>Avg HR</Text>
          </View>
        )}
        {activity.pace_per_km_str && activity.pace_per_km_str !== 'N/A' && (
          <View style={styles.reviewStat}>
            <Text style={styles.reviewStatVal}>{activity.pace_per_km_str}</Text>
            <Text style={styles.reviewStatLabel}>/km</Text>
          </View>
        )}
        {activity.total_elevation_gain != null && (
          <View style={styles.reviewStat}>
            <Text style={styles.reviewStatVal}>{Math.round(activity.total_elevation_gain)}m</Text>
            <Text style={styles.reviewStatLabel}>Elevation</Text>
          </View>
        )}
      </View>

      {/* AI Summary */}
      {autopsy ? (
        <View style={[styles.autopsyCard, { marginTop: 16 }]}>
          <View style={styles.autopsyHeader}>
            <Ionicons name="analytics-outline" size={16} color={T.text.primary} />
            <Text style={styles.autopsyTitle}>AI Analysis</Text>
          </View>
          <Text style={styles.autopsyText}>{autopsy}</Text>
        </View>
      ) : (
        <TouchableOpacity
          style={[styles.generateAutopsyBtn, generating && { opacity: 0.5 }]}
          onPress={handleGenerate}
          disabled={generating}
          activeOpacity={0.8}
        >
          {generating ? (
            <ActivityIndicator size="small" color="#FC4C02" />
          ) : (
            <Ionicons name="analytics-outline" size={16} color="#FC4C02" />
          )}
          <Text style={styles.generateAutopsyText}>
            {generating ? 'Generating...' : 'Generate AI Summary'}
          </Text>
        </TouchableOpacity>
      )}
    </>
  );
};

// ── Expanded Activity Modal ────────────────────────────────────────────────────

const ExpandedModal = ({ item, onClose }: { item: FeedItem | null; onClose: () => void }) => {
  if (!item) return null;

  const renderContent = () => {
    if (item.kind === 'manual') {
      const a = item.data;
      const muscles = a.muscle_groups ?? [];
      // Self-tracked outdoor activities store route points in exercise_data[0].route_points.
      const outdoorEntry = Array.isArray(a.exercise_data)
        ? (a.exercise_data as any[]).find((ex) => ex?._outdoor && Array.isArray(ex.route_points))
        : null;
      const routeCoords: { latitude: number; longitude: number }[] = outdoorEntry
        ? outdoorEntry.route_points
            .map((p: any) => ({ latitude: Number(p.lat), longitude: Number(p.lon) }))
            .filter((p: any) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude))
        : [];
      return (
        <>
          <Text style={styles.expandTitle}>{a.activity_type}</Text>
          <Text style={styles.expandMeta}>{fmtDate(a.logged_at)} · {formatDuration(a.duration_minutes)} · {a.intensity}</Text>

          {routeCoords.length > 1 && (
            <View style={styles.stravaMapWrap}>
              <WebView
                style={styles.stravaMap}
                source={{ html: buildMapHtml(routeCoords) }}
                scrollEnabled={false}
                originWhitelist={['*']}
              />
            </View>
          )}

          <View style={styles.reviewStatsRow}>
            {a.calories_burned != null && <View style={styles.reviewStat}><Text style={styles.reviewStatVal}>{Math.round(a.calories_burned)}</Text><Text style={styles.reviewStatLabel}>Calories</Text></View>}
            {a.distance_meters != null && <View style={styles.reviewStat}><Text style={styles.reviewStatVal}>{(a.distance_meters / 1000).toFixed(1)}</Text><Text style={styles.reviewStatLabel}>km</Text></View>}
          </View>

          {muscles.length > 0 && (
            <>
              <Text style={styles.expandSectionTitle}>Muscles Worked</Text>
              <View style={styles.muscleTagsRow}>
                {muscles.map(m => (
                  <View key={m} style={[styles.muscleTag, { backgroundColor: (MUSCLE_COLORS[m] ?? T.text.primary) + '33', borderColor: MUSCLE_COLORS[m] ?? T.text.primary }]}>
                    <View style={[styles.muscleDot, { backgroundColor: MUSCLE_COLORS[m] ?? T.text.primary }]} />
                    <Text style={[styles.muscleTagText, { color: MUSCLE_COLORS[m] ?? T.text.primary }]}>{MUSCLE_GROUP_LABELS[m] ?? m}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {a.exercise_data && a.exercise_data.length > 0 && (
            <>
              <Text style={styles.expandSectionTitle}>Exercises</Text>
              {a.exercise_data.map((ex: any, i: number) => (
                <View key={i} style={styles.expandExRow}>
                  <Text style={styles.expandExName}>{ex.name}</Text>
                  {ex.sets?.filter((s: any) => s.completed).map((s: any, j: number) => (
                    <Text key={j} style={styles.expandSetText}>Set {j + 1}: {s.weight}kg × {s.reps} reps{s.rpe ? ` @ RPE ${s.rpe}` : ''}</Text>
                  ))}
                </View>
              ))}
            </>
          )}

          {a.autopsy_text && (
            <View style={[styles.autopsyCard, { marginTop: 16 }]}>
              <View style={styles.autopsyHeader}>
                <Ionicons name="analytics-outline" size={16} color={T.text.primary} />
                <Text style={styles.autopsyTitle}>AI Analysis</Text>
              </View>
              <Text style={styles.autopsyText}>{a.autopsy_text}</Text>
            </View>
          )}

          {a.notes && <Text style={styles.expandNotes}>"{a.notes}"</Text>}
        </>
      );
    }

    if (item.kind === 'hevy') {
      const h = item.data;
      return (
        <>
          <Text style={styles.expandTitle}>{h.title}</Text>
          <Text style={styles.expandMeta}>{fmtDate(h.started_at)} · {h.duration_seconds ? formatDuration(Math.round(h.duration_seconds / 60)) : '—'}</Text>
          {h.volume_kg != null && <Text style={styles.expandMeta}>Volume: {Math.round(h.volume_kg)} kg</Text>}

          {h.exercises?.length > 0 && (
            <>
              <Text style={styles.expandSectionTitle}>Exercises</Text>
              {h.exercises.map((ex: any, i: number) => (
                <View key={i} style={styles.expandExRow}>
                  <Text style={styles.expandExName}>{ex.title ?? ex.name}</Text>
                  {ex.sets?.map((s: any, j: number) => (
                    <Text key={j} style={styles.expandSetText}>Set {j + 1}: {s.weight_kg ?? s.weight}kg × {s.reps} reps</Text>
                  ))}
                </View>
              ))}
            </>
          )}

          {h.autopsy_text && (
            <View style={[styles.autopsyCard, { marginTop: 16 }]}>
              <View style={styles.autopsyHeader}>
                <Ionicons name="analytics-outline" size={16} color={T.text.primary} />
                <Text style={styles.autopsyTitle}>AI Analysis</Text>
              </View>
              <Text style={styles.autopsyText}>{h.autopsy_text}</Text>
            </View>
          )}
        </>
      );
    }

    return <StravaDetail activity={item.data as Activity} />;
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.expandContainer}>
        <View style={styles.expandHeader}>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="chevron-down" size={24} color={T.text.primary} />
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.expandScroll}>{renderContent()}</ScrollView>
      </SafeAreaView>
    </Modal>
  );
};

// ── Readiness Card ─────────────────────────────────────────────────────────────
const ReadinessCard = ({
  data,
  onLogRestDay,
}: {
  data: ReadinessScore;
  onLogRestDay: () => void;
}) => {
  const [showRestModal, setShowRestModal] = useState(false);
  const colorMap = { green: T.status.success, amber: T.status.warn, red: T.status.danger };
  const c = colorMap[data.color] ?? T.text.secondary;
  return (
    <View style={styles.readinessCard}>
      <View style={styles.readinessTopRow}>
        <View>
          <Text style={styles.readinessCardTitle}>Readiness to Train</Text>
          <Text style={[styles.readinessLabel, { color: c }]}>{data.label}</Text>
        </View>
        <StepsCountUp target={data.score} style={[styles.readinessScore, { color: c }]} cacheKey="activity.readiness" />
      </View>
      <Text style={styles.readinessExplanation}>{data.explanation}</Text>
      {data.score < 60 && (
        <TouchableOpacity style={styles.restDayBanner} onPress={() => setShowRestModal(true)}>
          <Ionicons name="moon-outline" size={14} color={T.status.warn} />
          <Text style={styles.restDayBannerText}>Rest Day Recommended</Text>
        </TouchableOpacity>
      )}
      <Modal visible={showRestModal} transparent animationType="fade" onRequestClose={() => setShowRestModal(false)}>
        <TouchableOpacity style={styles.restModalOverlay} activeOpacity={1} onPress={() => setShowRestModal(false)}>
          <View style={styles.restModalSheet}>
            <Ionicons name="moon-outline" size={32} color={T.status.warn} style={{ marginBottom: 12 }} />
            <Text style={styles.restModalTitle}>Rest Day Recommended</Text>
            <Text style={styles.restModalBody}>Based on your training load, sleep, and soreness, your body would benefit from a rest day today. Light walking or stretching is fine.</Text>
            <TouchableOpacity style={styles.restModalDismiss} onPress={() => setShowRestModal(false)}>
              <Text style={styles.restModalDismissText}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

// ── Weekly Load Card ───────────────────────────────────────────────────────────
const WeeklyLoadCard = ({ data }: { data: WeeklyLoad }) => {
  const barPct = data.four_week_average > 0 ? Math.min(1, data.this_week_load / (data.four_week_average * 1.5)) : 0;
  const barColor = data.status === 'high' ? T.status.danger : data.status === 'elevated' ? T.status.warn : T.status.success;
  const pctChange = data.percentage_change;
  const acwrColor = data.acwr_status === 'optimal' ? T.status.success : data.acwr_status === 'caution' ? T.status.warn : data.acwr_status === 'high_risk' ? T.status.danger : T.text.muted;
  const acwrLabel: Record<string, string> = { undertraining: 'Undertraining', optimal: 'Optimal', caution: 'Caution', high_risk: 'High Injury Risk', insufficient_data: 'Not enough data yet' };
  const acwrExplanation: Record<string, string> = {
    undertraining: 'Your training load is lower than usual.',
    optimal: 'Your training load is well balanced this week.',
    caution: 'You have ramped up training faster than usual. Monitor soreness closely.',
    high_risk: 'Your training load this week is significantly higher than your recent average. Consider a lighter session or rest day.',
    insufficient_data: 'ACWR becomes accurate after 4 weeks of logging.',
  };

  return (
    <View style={styles.weeklyLoadCard}>
      <Text style={styles.weeklyLoadTitle}>Weekly Training Load</Text>
      <View style={styles.weeklyLoadTopRow}>
        <StepsCountUp target={data.this_week_load} style={styles.weeklyLoadNum} cacheKey="activity.weeklyLoad" />
        <View style={styles.weeklyLoadChange}>
          <Ionicons
            name={pctChange >= 0 ? 'arrow-up-outline' : 'arrow-down-outline'}
            size={14}
            color={pctChange >= 0 ? T.status.success : T.status.warn}
          />
          <Text style={[styles.weeklyLoadChangePct, { color: pctChange >= 0 ? T.status.success : T.status.warn }]}>
            {Math.abs(pctChange).toFixed(0)}% from last week
          </Text>
        </View>
      </View>

      {/* Progress bar vs 4-week average */}
      <View style={styles.weeklyLoadBarBg}>
        <LinearGradient
          colors={[T.signal.load, T.readiness.high, T.accent]}
          locations={[0, 0.55, 1]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={[styles.weeklyLoadBarFill, { width: `${barPct * 100}%` as any }]}
        />
        {data.status === 'high' && <Ionicons name="warning-outline" size={12} color={T.readiness.low} style={{ position: 'absolute', right: 4, top: 2 }} />}
      </View>
      <Text style={styles.weeklyLoadAvgLabel}>vs {Math.round(data.four_week_average)} avg (4wk)</Text>

      {/* ACWR */}
      <View style={styles.acwrRow}>
        <Text style={styles.acwrLabel}>ACWR</Text>
        {data.acwr !== null ? (
          <>
            <Text style={[styles.acwrValue, { color: acwrColor }]}>{data.acwr.toFixed(1)}</Text>
            <View style={[styles.acwrStatusPill, { backgroundColor: acwrColor + '22', borderColor: acwrColor }]}>
              {(data.acwr_status === 'caution' || data.acwr_status === 'high_risk') && (
                <Ionicons name="warning-outline" size={10} color={acwrColor} />
              )}
              <Text style={[styles.acwrStatusText, { color: acwrColor }]}>{acwrLabel[data.acwr_status]}</Text>
            </View>
          </>
        ) : (
          <Text style={styles.acwrInsufficient}>
            {data.days_until_acwr
              ? `ACWR unlocks in ${Math.ceil(data.days_until_acwr / 7)} week${Math.ceil(data.days_until_acwr / 7) === 1 ? '' : 's'}`
              : 'Not enough data yet'}
          </Text>
        )}
      </View>
      <Text style={styles.acwrExplanation}>{acwrExplanation[data.acwr_status]}</Text>
    </View>
  );
};

// ── Activity Heatmap ───────────────────────────────────────────────────────────

const ActivityHeatmap = ({ data }: { data: HeatmapEntry[] }) => {
  const dateMap = useMemo(() => new Map(data.map(d => [d.date, d])), [data]);

  const weeks = useMemo(() => {
    const today = new Date();
    const days = [];
    for (let i = 83; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const ds = d.toISOString().split('T')[0];
      days.push({ ds, entry: dateMap.get(ds) });
    }
    const w: typeof days[] = [];
    for (let i = 0; i < days.length; i += 7) w.push(days.slice(i, i + 7));
    return w;
  }, [dateMap]);

  const getColor = (entry?: HeatmapEntry) => {
    if (!entry) return T.glass.card;
    const h = entry.total_minutes;
    if (h >= 90) return T.text.primary;
    if (h >= 45) return T.text.primary;
    if (h >= 20) return T.glass.card;
    return T.glass.border;
  };

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={{ flexDirection: 'row', gap: 3 }}>
        {weeks.map((week, wi) => (
          <View key={wi} style={{ gap: 3 }}>
            {week.map((day, di) => (
              <View key={di} style={{ width: 13, height: 13, borderRadius: 2, backgroundColor: getColor(day.entry) }} />
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
};

// Mono ticker for the page header — "ACTIVITY · TUE".
function activityTicker(): string {
  return new Date().toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
}

// Count-up wrapper for integer stats. Renders via <Text style={...}/>.
// `cacheKey` opts the caller into the "animate once per session per value"
// behaviour — subsequent mounts with the same target snap to the value
// without replaying the animation.
function StepsCountUp({
  target,
  style,
  cacheKey,
}: {
  target: number;
  style: any;
  cacheKey?: string;
}) {
  const v = useCountUp(target, 1000, 100, cacheKey);
  return <Text style={style}>{v.toLocaleString()}</Text>;
}

// ── Main Screen ────────────────────────────────────────────────────────────────

export default function ActivityScreen() {
  const user = useAuthStore(s => s.user);
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  // Data
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [stats, setStats] = useState<ActivityStats | null>(null);
  const [heatmap, setHeatmap] = useState<HeatmapEntry[]>([]);
  const [steps, setSteps] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  // UI state
  const [filter, setFilter] = useState<FilterType>('All');
  const [expandedItem, setExpandedItem] = useState<FeedItem | null>(null);
  const [journalExpanded, setJournalExpanded] = useState(true);
  const [showProgress, setShowProgress] = useState(true);

  // Log modal
  const [showLogModal, setShowLogModal] = useState(false);
  const [logStep, setLogStep] = useState<LogStep>('sport');
  const [selectedSport, setSelectedSport] = useState<SportType | null>(null);

  // Cardio form
  const [cardioForm, setCardioForm] = useState({ workoutName: '', duration: '', distance: '', intensity: 'Moderate' as IntensityType, notes: '' });

  // Strength form
  const [strengthName, setStrengthName] = useState('');
  const [exercises, setExercises] = useState<ExerciseEntry[]>([]);
  const [showExerciseSearch, setShowExerciseSearch] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Rest timer
  const [restTimerActive, setRestTimerActive] = useState(false);
  const [restTimerSeconds, setRestTimerSeconds] = useState(90);
  const restTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [completedActivity, setCompletedActivity] = useState<UserActivity | null>(null);

  // Warm-Up Personalizer
  const [showWarmUpModal, setShowWarmUpModal] = useState(false);
  const [todayCheckin, setTodayCheckin] = useState<WellnessCheckin | null>(null);

  // Outdoor Tracker
  const [showOutdoorTracker, setShowOutdoorTracker] = useState(false);

  // Action menu
  const [showActionMenu, setShowActionMenu] = useState(false);

  // RPE + new features
  const [showRpePrompt, setShowRpePrompt] = useState(false);
  const [pendingRpeActivityId, setPendingRpeActivityId] = useState<string | null>(null);
  const [weeklyLoad, setWeeklyLoad] = useState<WeeklyLoad | null>(null);
  const [readiness, setReadiness] = useState<ReadinessScore | null>(null);
  const [showRestDayModal, setShowRestDayModal] = useState(false);

  // Share activity state
  const [shareSession, setShareSession] = useState<FeedItem | null>(null);
  const [showShareCreator, setShowShareCreator] = useState(false);

  // Weekly journal grouping
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set());
  const [weekShowAll, setWeekShowAll] = useState<Set<string>>(new Set());
  const [stravaPage, setStravaPage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreStrava, setHasMoreStrava] = useState(true);
  // How many extra older weeks the user has revealed via "Load Earlier".
  // Capped at the count of weeks actually present in `weeklyGroups`.
  const [extraWeeks, setExtraWeeks] = useState(0);
  const [journalSearch, setJournalSearch] = useState('');
  const weekGroupsInitialized = useRef(false);

  // ── Load Data ────────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    setRefreshing(true);
    try {
      const [manuals, hevyW, stravaA, statsR, hmR] = await Promise.allSettled([
        getMyActivities(),
        getHevyWorkouts(),
        getActivities(1, 20),
        getActivityStats(),
        getActivityHeatmap(84),
      ]);

      const items: FeedItem[] = [];
      if (manuals.status === 'fulfilled') {
        manuals.value.forEach(a => items.push({ kind: 'manual', sortKey: a.logged_at, data: a }));
      }
      if (hevyW.status === 'fulfilled') {
        hevyW.value.forEach(h => items.push({ kind: 'hevy', sortKey: h.started_at, data: h }));
      }
      if (stravaA.status === 'fulfilled') {
        stravaA.value.forEach(s => items.push({ kind: 'strava', sortKey: s.start_date, data: s }));
      }
      items.sort((a, b) => new Date(b.sortKey).getTime() - new Date(a.sortKey).getTime());
      setFeed(items);

      if (statsR.status === 'fulfilled') setStats(statsR.value);
      if (hmR.status === 'fulfilled') setHeatmap(hmR.value);

      try {
        const [loadR, readinessR] = await Promise.allSettled([getWeeklyLoad(), getReadiness()]);
        if (loadR.status === 'fulfilled') setWeeklyLoad(loadR.value);
        if (readinessR.status === 'fulfilled') setReadiness(readinessR.value);
      } catch { /* non-fatal */ }

      // Load today's wellness checkin for warm-up personalization
      try {
        const today = new Date().toISOString().split('T')[0];
        const checkins = await getWellnessCheckins(1);
        const todayEntry = checkins.find((c) => c.date === today) ?? null;
        setTodayCheckin(todayEntry);
      } catch {
        // non-fatal
      }
    } catch {
      // non-fatal
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, []);

  const handleLoadEarlier = useCallback(async () => {
    setLoadingMore(true);
    try {
      // Prefer revealing already-loaded older local weeks before paginating Strava.
      const totalWeeks = weeklyGroups.length;
      const visibleWeeks = 8 + extraWeeks;
      if (totalWeeks > visibleWeeks) {
        setExtraWeeks(prev => prev + 4);
        return;
      }
      // No more local weeks to reveal — page Strava if possible.
      if (!hasMoreStrava) return;
      const nextPage = stravaPage + 1;
      const more = await getActivities(nextPage, 20);
      if (more.length > 0) {
        let added = 0;
        setFeed(prev => {
          const existingIds = new Set(
            prev.filter(f => f.kind === 'strava').map(f => (f.data as Activity).id)
          );
          const newItems: FeedItem[] = more
            .filter(s => !existingIds.has(s.id))
            .map(s => ({ kind: 'strava' as const, sortKey: s.start_date, data: s }));
          added = newItems.length;
          return [...prev, ...newItems].sort(
            (a, b) => new Date(b.sortKey).getTime() - new Date(a.sortKey).getTime()
          );
        });
        setStravaPage(nextPage);
        // End-of-list when the page returned a partial fill OR yielded zero
        // new (deduped) items — protects against an endless retry of empty pages.
        if (more.length < 20 || added === 0) setHasMoreStrava(false);
      } else {
        setHasMoreStrava(false);
      }
    } catch { /* non-fatal */ } finally {
      setLoadingMore(false);
    }
  }, [stravaPage, hasMoreStrava, weeklyGroups.length, extraWeeks]);

  const handleOutdoorSave = useCallback(async (activity: SavedOutdoorActivity) => {
    setShowOutdoorTracker(false);
    try {
      await logActivity({
        activity_type: activity.activityType.charAt(0).toUpperCase() + activity.activityType.slice(1),
        duration_minutes: Math.max(1, Math.round(activity.durationS / 60)),
        intensity: activity.summary.avgSpeedKmh > 10 ? 'Hard' : activity.summary.avgSpeedKmh > 6 ? 'Moderate' : 'Easy',
        distance_meters: activity.distanceM,
        sport_category: 'cardio',
        muscle_groups: activity.activityType === 'cycling'
          ? ['quads', 'hamstrings', 'calves']
          : ['calves', 'hamstrings', 'glutes'],
        exercise_data: [{
          _outdoor: true,
          route_points: activity.routePoints.map(p => ({
            lat: p.latitude,
            lon: p.longitude,
            alt: p.altitude ?? null,
            ts: p.timestamp ?? null,
          })),
          splits: activity.summary.splits,
          elevation_gain_m: activity.summary.elevationGainM,
          elevation_loss_m: activity.summary.elevationLossM,
          avg_speed_kmh: activity.summary.avgSpeedKmh,
          max_speed_kmh: activity.summary.maxSpeedKmh,
          avg_pace_sec_per_km: activity.summary.avgPaceSecPerKm,
        }],
        notes: `${(activity.distanceM / 1000).toFixed(2)} km · Elev +${Math.round(activity.summary.elevationGainM)}m`,
      });
      loadData();
    } catch {
      Alert.alert('Error', 'Failed to save activity. Please try again.');
    }
  }, [loadData]);

  // Steps
  useEffect(() => {
    let sub: any;
    (async () => {
      const { granted } = await Pedometer.requestPermissionsAsync();
      if (!granted) return;
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      try {
        const res = await Pedometer.getStepCountAsync(start, new Date());
        setSteps(res.steps);
        const today = new Date().toISOString().split('T')[0];
        await upsertDailySteps(today, res.steps).catch(() => {});
      } catch {}
      sub = Pedometer.watchStepCount(r => setSteps(r.steps));
    })();
    return () => sub?.remove?.();
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Elapsed timer for strength
  useEffect(() => {
    if (logStep === 'strength') {
      setElapsedSeconds(0);
      elapsedTimerRef.current = setInterval(() => setElapsedSeconds(s => s + 1), 1000);
    } else {
      if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current);
    }
    return () => { if (elapsedTimerRef.current) clearInterval(elapsedTimerRef.current); };
  }, [logStep]);

  // Rest timer countdown
  useEffect(() => {
    if (restTimerActive) {
      restTimerRef.current = setInterval(() => {
        setRestTimerSeconds(s => {
          if (s <= 1) {
            setRestTimerActive(false);
            if (restTimerRef.current) clearInterval(restTimerRef.current);
            return 90;
          }
          return s - 1;
        });
      }, 1000);
    } else {
      if (restTimerRef.current) clearInterval(restTimerRef.current);
    }
    return () => { if (restTimerRef.current) clearInterval(restTimerRef.current); };
  }, [restTimerActive]);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const [sportCategoryFilter, setSportCategoryFilter] = useState<string | null>(null);

  const openLogModal = (categoryFilter: string | null = null) => {
    setLogStep('sport');
    setSelectedSport(null);
    setSportCategoryFilter(categoryFilter);
    setCardioForm({ workoutName: '', duration: '', distance: '', intensity: 'Moderate', notes: '' });
    setStrengthName('');
    setExercises([]);
    setCompletedActivity(null);
    setPendingRpeActivityId(null);
    setShowLogModal(true);
  };

  const openStrengthModal = () => {
    const s = SPORT_TYPES.find(x => x.id === 'strength') ?? SPORT_TYPES[0];
    setLogStep('strength');
    setSelectedSport(s);
    setStrengthName('');
    setExercises([]);
    setCompletedActivity(null);
    setPendingRpeActivityId(null);
    setShowLogModal(true);
  };

  const openCardioModal = () => {
    const s = SPORT_TYPES.find(x => x.id === 'running') ?? SPORT_TYPES[0];
    setLogStep('cardio');
    setSelectedSport(s);
    setCardioForm({ workoutName: '', duration: '', distance: '', intensity: 'Moderate', notes: '' });
    setCompletedActivity(null);
    setPendingRpeActivityId(null);
    setShowLogModal(true);
  };

  const closeLogModal = () => {
    setShowLogModal(false);
    if (completedActivity) loadData();
  };

  const handleSportSelect = (sport: SportType) => {
    setSelectedSport(sport);
    setLogStep(sport.category === 'strength' ? 'strength' : 'cardio');
  };

  const startRestTimer = () => {
    setRestTimerSeconds(90);
    setRestTimerActive(true);
  };

  const handleAddExercise = (ex: ExerciseDefinition) => {
    const entry: ExerciseEntry = {
      id: newSetId(),
      name: ex.name,
      muscleGroup: ex.muscleGroup,
      muscles: ex.muscles,
      sets: [{ id: newSetId(), type: 'working', weight: '', reps: '', rpe: '', completed: false }],
      notes: '',
    };
    setExercises(prev => [...prev, entry]);
  };

  // Derive coarse intensity bucket from RPE (1–10) for downstream calorie heuristics.
  // Backend prefers the explicit `rpe` field for training-load calc, but
  // intensity is still required by the schema and fed into _compute_calories.
  const intensityFromRpe = (rpe: number | null): IntensityType => {
    if (rpe == null) return 'Moderate';
    if (rpe <= 3) return 'Easy';
    if (rpe <= 6) return 'Moderate';
    if (rpe <= 8) return 'Hard';
    return 'Max';
  };

  // Save the strength workout. Called from the RPE step (with or without RPE)
  // rather than at session-end, so that `intensity` reflects actual effort
  // instead of a hardcoded 'Moderate' default.
  const saveStrengthWorkout = useCallback(async (rpe: number | null) => {
    const durationMin = Math.max(1, Math.round(elapsedSeconds / 60));
    const muscles = uniqueMuscles(exercises);
    setSubmitting(true);
    try {
      const payload: any = {
        activity_type: strengthName.trim() || (selectedSport?.label ?? 'Strength Training'),
        duration_minutes: durationMin,
        intensity: intensityFromRpe(rpe),
        sport_category: 'strength',
        muscle_groups: muscles,
        exercise_data: exercises.map(ex => ({
          name: ex.name,
          muscleGroup: ex.muscleGroup,
          muscles: ex.muscles,
          sets: ex.sets,
          notes: ex.notes,
          supersetGroup: ex.supersetGroup ?? null,
        })),
      };
      if (rpe != null) payload.rpe = rpe;
      const result = await logActivity(payload);
      setCompletedActivity(result);
      setPendingRpeActivityId(result.id);
    } catch {
      Alert.alert('Error', 'Failed to save workout. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }, [elapsedSeconds, exercises, strengthName, selectedSport]);

  const handleStrengthComplete = async () => {
    // Defer the actual save to the RPE step so we don't persist a hardcoded
    // 'Moderate' intensity before the user tells us how hard it was.
    setLogStep('rpe');
  };

  const handleCardioSubmit = async () => {
    const dur = parseInt(cardioForm.duration);
    if (!dur || dur < 1) return;
    setSubmitting(true);
    try {
      const distM = cardioForm.distance ? parseFloat(cardioForm.distance) * 1000 : undefined;
      const muscles = cardioMuscles(selectedSport?.id ?? '');
      const result = await logActivity({
        activity_type: cardioForm.workoutName.trim() || (selectedSport?.label ?? 'Workout'),
        duration_minutes: dur,
        intensity: cardioForm.intensity,
        notes: cardioForm.notes || undefined,
        distance_meters: distM,
        sport_category: selectedSport?.category ?? 'other',
        muscle_groups: muscles,
      });
      setCompletedActivity(result);
      setPendingRpeActivityId(result.id);
      setLogStep('rpe');
    } catch {
      Alert.alert('Error', 'Failed to log activity. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRpeSubmit = async (rpe: number) => {
    // Strength flow: save deferred — payload includes rpe + derived intensity.
    if (selectedSport?.category === 'strength' && !pendingRpeActivityId) {
      await saveStrengthWorkout(rpe);
      setLogStep('review');
      return;
    }
    if (pendingRpeActivityId) {
      try { await updateActivityRPE(pendingRpeActivityId, rpe); } catch {}
    }
    setLogStep('review');
  };

  const handleRpeSkip = async () => {
    // Strength flow: still need to save, just without RPE.
    if (selectedSport?.category === 'strength' && !pendingRpeActivityId) {
      await saveStrengthWorkout(null);
    }
    setLogStep('review');
  };

  // ── Filtered Feed ─────────────────────────────────────────────────────────────

  const filteredFeed = useMemo(() => {
    let result = feed;
    if (filter === 'Hevy') result = feed.filter(f => f.kind === 'hevy');
    else if (filter === 'Strava') result = feed.filter(f => f.kind === 'strava');
    else if (filter === 'Strength') result = feed.filter(f => (f.kind === 'manual' && f.data.sport_category === 'strength') || f.kind === 'hevy');
    else if (filter === 'Cardio') result = feed.filter(f =>
      (f.kind === 'manual' && (f.data.sport_category === 'cardio' || f.data.sport_category === 'other')) ||
      f.kind === 'strava'
    );
    else if (filter === 'Sport') result = feed.filter(f => f.kind === 'manual' && (f.data.sport_category === 'sport' || f.data.sport_category === 'combat'));

    if (journalSearch.trim()) {
      const q = journalSearch.toLowerCase();
      result = result.filter(f => {
        if (f.kind === 'manual') return f.data.activity_type.toLowerCase().includes(q);
        if (f.kind === 'hevy') return f.data.title.toLowerCase().includes(q);
        if (f.kind === 'strava') return f.data.name.toLowerCase().includes(q) || f.data.sport_type.toLowerCase().includes(q);
        return false;
      });
    }

    return result;
  }, [feed, filter, journalSearch]);

  // ── Goals (computed from this week's data) ────────────────────────────────────

  const weeklyGoals = useMemo(() => {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const thisWeek = feed.filter(f => new Date(f.sortKey) >= weekStart);
    const weekMin = thisWeek.reduce((sum, f) => {
      if (f.kind === 'manual') return sum + f.data.duration_minutes;
      if (f.kind === 'hevy') return sum + (f.data.duration_seconds ? f.data.duration_seconds / 60 : 0);
      if (f.kind === 'strava') return sum + f.data.elapsed_time_seconds / 60;
      return sum;
    }, 0);
    return [
      { id: 'sessions', label: 'Weekly Sessions', target: 5, current: thisWeek.length, unit: 'sessions', color: T.text.primary },
      { id: 'hours', label: 'Training Hours', target: 6, current: Math.round(weekMin / 60 * 10) / 10, unit: 'hrs', color: T.status.success },
    ];
  }, [feed]);

  // ── Weekly Volume Chart (last 8 weeks) ────────────────────────────────────────

  const weeklyVolumeData = useMemo(() => {
    const labels: string[] = [];
    const data: number[] = [];
    const now = new Date();
    for (let w = 7; w >= 0; w--) {
      const wStart = new Date(now);
      wStart.setDate(now.getDate() - now.getDay() - w * 7);
      wStart.setHours(0, 0, 0, 0);
      const wEnd = new Date(wStart);
      wEnd.setDate(wStart.getDate() + 7);
      const wMin = feed
        .filter(f => { const d = new Date(f.sortKey); return d >= wStart && d < wEnd; })
        .reduce((sum, f) => {
          if (f.kind === 'manual') return sum + f.data.duration_minutes;
          if (f.kind === 'hevy') return sum + (f.data.duration_seconds ? f.data.duration_seconds / 60 : 0);
          if (f.kind === 'strava') return sum + f.data.elapsed_time_seconds / 60;
          return sum;
        }, 0);
      const label = `W${8 - w}`;
      labels.push(label);
      data.push(Math.round(wMin / 60 * 10) / 10);
    }
    return { labels, datasets: [{ data }] };
  }, [feed]);

  // ── Badges ────────────────────────────────────────────────────────────────────

  const badges = useMemo(() => [
    { id: 'w10', label: '10 Workouts', icon: 'medal-outline', unlocked: (stats?.total_workouts ?? 0) >= 10 },
    { id: 'w50', label: '50 Workouts', icon: 'trophy-outline', unlocked: (stats?.total_workouts ?? 0) >= 50 },
    { id: 'w100', label: '100 Workouts', icon: 'trophy', unlocked: (stats?.total_workouts ?? 0) >= 100 },
    { id: 's7', label: '7-Day Streak', icon: 'flame-outline', unlocked: (stats?.current_streak ?? 0) >= 7 },
    { id: 's30', label: '30-Day Streak', icon: 'flame', unlocked: (stats?.current_streak ?? 0) >= 30 },
    { id: 'first_run', label: 'First Run', icon: 'walk-outline', unlocked: feed.some(f => f.kind === 'strava' || (f.kind === 'manual' && f.data.sport_category === 'cardio')) },
    { id: 'first_lift', label: 'First Lift', icon: 'barbell-outline', unlocked: feed.some(f => f.kind === 'hevy' || (f.kind === 'manual' && f.data.sport_category === 'strength')) },
    { id: 'first_fight', label: 'First Fight', icon: 'body-outline', unlocked: feed.some(f => f.kind === 'manual' && f.data.sport_category === 'combat') },
  ], [stats, feed]);

  // ── Sport Breakdown ───────────────────────────────────────────────────────────

  const sportBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    feed
      .filter(f => !(f.kind === 'manual' && (f.data as UserActivity).is_rest_day))
      .forEach(f => {
        const key = f.kind === 'hevy' ? 'strength' : f.kind === 'strava' ? 'cardio' : (f.data as UserActivity).sport_category ?? 'other';
        counts[key] = (counts[key] ?? 0) + 1;
      });
    const total = Object.values(counts).reduce((s, n) => s + n, 0);
    const colors: Record<string, string> = { strength: T.text.primary, cardio: T.status.success, combat: T.status.danger, sport: T.text.secondary, mindBody: T.text.secondary, other: T.text.secondary };
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([key, count]) => ({ label: key.charAt(0).toUpperCase() + key.slice(1), pct: total > 0 ? Math.round(count / total * 100) : 0, color: colors[key] ?? T.text.secondary }));
  }, [feed]);

  // ── Weekly Groups ─────────────────────────────────────────────────────────────

  const weeklyGroups = useMemo(() => {
    const groups = new Map<string, FeedItem[]>();
    filteredFeed.forEach(item => {
      const key = getWeekKey(item.sortKey);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(item);
    });
    return Array.from(groups.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filteredFeed]);

  // Auto-expand most recent week on first load
  useEffect(() => {
    if (weeklyGroups.length > 0 && !weekGroupsInitialized.current) {
      weekGroupsInitialized.current = true;
      setExpandedWeeks(new Set([weeklyGroups[0][0]]));
    }
  }, [weeklyGroups]);

  const flatListData = useMemo((): ListRow[] => {
    if (!journalExpanded) return [];
    const rows: ListRow[] = [];
    const baseMax = 8;
    const MAX_WEEKS = baseMax + extraWeeks;
    weeklyGroups.slice(0, MAX_WEEKS).forEach(([weekKey, items]) => {
      const isExpanded = expandedWeeks.has(weekKey);
      const showAll = weekShowAll.has(weekKey);
      rows.push({ type: 'weekHeader', weekKey, weekLabel: getWeekLabel(weekKey), itemCount: items.length });
      if (isExpanded) {
        const toShow = showAll ? items : items.slice(0, 10);
        toShow.forEach(item => rows.push({ type: 'feedItem', item }));
        if (!showAll && items.length > 10) {
          rows.push({ type: 'showMore', weekKey, remaining: items.length - 10 });
        }
      }
    });
    // Show load-more only when older local weeks exist OR the Strava feed
    // still has more pages to fetch. Do NOT show it after we confirmed we're
    // at the end of Strava history.
    const hasOlderLocalWeeks = weeklyGroups.length > MAX_WEEKS;
    const hasStrava = feed.some(f => f.kind === 'strava');
    if (hasOlderLocalWeeks || (hasStrava && hasMoreStrava)) {
      rows.push({ type: 'loadEarlier' });
    }
    return rows;
  }, [journalExpanded, weeklyGroups, expandedWeeks, weekShowAll, feed, hasMoreStrava, extraWeeks]);

  const renderListRow = ({ item }: { item: ListRow }) => {
    if (item.type === 'weekHeader') {
      const isExpanded = expandedWeeks.has(item.weekKey);
      return (
        <TouchableOpacity
          style={styles.weekHeader}
          onPress={() => setExpandedWeeks(prev => {
            const next = new Set(prev);
            if (next.has(item.weekKey)) next.delete(item.weekKey); else next.add(item.weekKey);
            return next;
          })}
          activeOpacity={0.7}
        >
          <Text style={styles.weekHeaderLabel}>{item.weekLabel}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.weekHeaderCount}>{item.itemCount} sessions</Text>
            <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={14} color={T.text.muted} />
          </View>
        </TouchableOpacity>
      );
    }
    if (item.type === 'feedItem') {
      return (
        <FeedCard
          item={item.item}
          onPress={() => setExpandedItem(item.item)}
          onShare={(feedItem) => { setShareSession(feedItem); setShowShareCreator(true); }}
        />
      );
    }
    if (item.type === 'showMore') {
      return (
        <TouchableOpacity
          style={styles.showMoreBtn}
          onPress={() => setWeekShowAll(prev => new Set([...prev, item.weekKey]))}
        >
          <Text style={styles.showMoreText}>Show {item.remaining} more</Text>
        </TouchableOpacity>
      );
    }
    if (item.type === 'loadEarlier') {
      return (
        <TouchableOpacity style={styles.loadEarlierBtn} onPress={handleLoadEarlier} disabled={loadingMore}>
          {loadingMore
            ? <ActivityIndicator size="small" color={T.text.muted} />
            : <Text style={styles.loadEarlierText}>Load Earlier Sessions</Text>}
        </TouchableOpacity>
      );
    }
    return null;
  };

  // ── List Header ───────────────────────────────────────────────────────────────

  const renderHeader = () => {
    // Compute weekly session count and hours for stats bar
    const now = new Date();
    const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay()); weekStart.setHours(0, 0, 0, 0);
    const thisWeekFeed = feed.filter(f => new Date(f.sortKey) >= weekStart);
    const weeklySessionCount = thisWeekFeed.length;
    const weeklyMinutes = thisWeekFeed.reduce((sum, f) => {
      if (f.kind === 'manual') return sum + f.data.duration_minutes;
      if (f.kind === 'hevy') return sum + (f.data.duration_seconds ? f.data.duration_seconds / 60 : 0);
      if (f.kind === 'strava') return sum + f.data.elapsed_time_seconds / 60;
      return sum;
    }, 0);
    const wH = Math.floor(weeklyMinutes / 60);
    const wM = Math.round(weeklyMinutes % 60);
    const weeklyHoursFormatted = wH > 0 ? (wM > 0 ? `${wH}h ${wM}m` : `${wH}h`) : `${wM}m`;

    return (
    <>
      {/* Title Bar — ticker + Geist title + lime accent button */}
      <View style={styles.titleBar}>
        <View>
          <Text style={styles.pageTicker}>ACTIVITY · {activityTicker()}</Text>
          <Text style={styles.screenTitle}>Training</Text>
        </View>
        <TouchableOpacity style={styles.plusBtn} onPress={() => setShowActionMenu(true)} activeOpacity={0.85}>
          <Ionicons name="add" size={22} color={T.accentInk} />
        </TouchableOpacity>
      </View>

      {readiness && <ReadinessCard data={readiness} onLogRestDay={async () => { try { await logRestDay(); loadData(); } catch {} }} />}

      {/* Steps Card */}
      <View style={styles.stepsCard}>
        <View style={styles.stepsLeft}>
          <Ionicons name="footsteps-outline" size={18} color={T.readiness.high} />
          <StepsCountUp target={steps} style={styles.stepsVal} cacheKey="activity.steps" />
          <Text style={styles.stepsLabel}>/ 10,000 steps</Text>
        </View>
        <View style={styles.stepsBarBg}>
          <LinearGradient
            colors={[T.signal.load, T.readiness.high, T.accent]}
            locations={[0, 0.55, 1]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={[styles.stepsBarFill, { width: `${Math.min(100, steps / 100)}%` as any }]}
          />
        </View>
      </View>

      {/* Stats Bar — two rows of 3 */}
      {stats && (() => {
        const allStats = [
          { val: stats.total_workouts, label: 'Workouts' },
          { val: `${stats.total_hours}h`, label: 'Total Hours' },
          { val: `${stats.current_streak}d`, label: 'Streak' },
          { val: `${stats.longest_streak}d`, label: 'Best Streak' },
          { val: weeklySessionCount, label: 'This Week' },
          { val: weeklyHoursFormatted, label: 'Week Hours' },
        ];
        return (
          <View style={styles.statsBar}>
            {[allStats.slice(0, 3), allStats.slice(3, 6)].map((row, ri) => (
              <View key={ri} style={[styles.statsRow, ri === 0 && styles.statsRowBorder]}>
                {row.map((s, i) => (
                  <React.Fragment key={i}>
                    <View style={styles.statItem}>
                      <Text style={styles.statVal}>{s.val}</Text>
                      <Text style={styles.statLabel}>{s.label}</Text>
                    </View>
                    {i < 2 && <View style={styles.statDivider} />}
                  </React.Fragment>
                ))}
              </View>
            ))}
          </View>
        );
      })()}

      {weeklyLoad && <WeeklyLoadCard data={weeklyLoad} />}

      {/* Progress Section Toggle */}
      <TouchableOpacity style={styles.progressToggle} onPress={() => setShowProgress(p => !p)}>
        <Text style={styles.progressToggleText}>Progress & Records</Text>
        <Ionicons name={showProgress ? 'chevron-up' : 'chevron-down'} size={18} color={T.text.secondary} />
      </TouchableOpacity>

      {showProgress && (
        <View style={styles.progressSection}>
          {/* Weekly Volume (last 8 weeks) */}
          <View style={styles.progressCard}>
            <Text style={styles.progressCardTitle}>Weekly Volume</Text>
            <BarChart
              data={weeklyVolumeData}
              width={SCREEN_W - 80}
              height={160}
              yAxisLabel=""
              yAxisSuffix="h"
              chartConfig={{
                backgroundGradientFromOpacity: 0,
                backgroundGradientToOpacity: 0,
                decimalPlaces: 1,
                color: (o = 1) => toRgba(T.accent, o),
                labelColor: () => T.text.secondary,
                propsForBackgroundLines: { stroke: T.hairline },
              }}
              fromZero
              withInnerLines
              style={{ marginLeft: -8 }}
            />
          </View>

          {/* Heatmap (12 weeks) */}
          {heatmap.length > 0 && (
            <View style={styles.progressCard}>
              <Text style={styles.progressCardTitle}>Training Heatmap</Text>
              <ActivityHeatmap data={heatmap} />
            </View>
          )}

          {/* Sport Breakdown — donut */}
          {sportBreakdown.length > 0 && (
            <View style={styles.progressCard}>
              <Text style={styles.progressCardTitle}>Sport Breakdown</Text>
              {(() => {
                const SIZE = 160;
                const STROKE = 22;
                const R_OUT = (SIZE - STROKE) / 2;
                const CIRC = 2 * Math.PI * R_OUT;
                let acc = 0;
                const totalPct = sportBreakdown.reduce((s, x) => s + x.pct, 0) || 1;
                return (
                  <View style={styles.donutRow}>
                    <Svg width={SIZE} height={SIZE}>
                      <SvgG rotation={-90} origin={`${SIZE / 2},${SIZE / 2}`}>
                        <SvgCircle
                          cx={SIZE / 2}
                          cy={SIZE / 2}
                          r={R_OUT}
                          stroke={T.hairline}
                          strokeWidth={STROKE}
                          fill="none"
                        />
                        {sportBreakdown.map(s => {
                          const frac = s.pct / totalPct;
                          const len = CIRC * frac;
                          const offset = CIRC * (1 - acc);
                          acc += frac;
                          return (
                            <SvgCircle
                              key={s.label}
                              cx={SIZE / 2}
                              cy={SIZE / 2}
                              r={R_OUT}
                              stroke={s.color}
                              strokeWidth={STROKE}
                              fill="none"
                              strokeDasharray={`${len} ${CIRC - len}`}
                              strokeDashoffset={offset}
                              strokeLinecap="butt"
                            />
                          );
                        })}
                      </SvgG>
                    </Svg>
                    <View style={styles.donutLegend}>
                      {sportBreakdown.map(s => (
                        <View key={s.label} style={styles.donutLegendRow}>
                          <View style={[styles.donutSwatch, { backgroundColor: s.color }]} />
                          <Text style={styles.donutLegendLabel}>{s.label}</Text>
                          <Text style={styles.donutLegendPct}>{s.pct}%</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                );
              })()}
            </View>
          )}

          {/* Badges */}
          <View style={styles.progressCard}>
            <Text style={styles.progressCardTitle}>Achievements</Text>
            <View style={styles.badgesGrid}>
              {badges.map(b => (
                <View key={b.id} style={[styles.badgeTile, !b.unlocked && styles.badgeLocked]}>
                  <Ionicons name={b.icon as any} size={28} color={b.unlocked ? T.text.primary : T.glass.border} />
                  <Text style={[styles.badgeLabel, !b.unlocked && styles.badgeLabelLocked]}>{b.label}</Text>
                  {!b.unlocked && (
                    <View style={{ position: 'absolute', top: 6, right: 6 }}>
                      <Ionicons name="lock-closed" size={10} color={T.glass.border} />
                    </View>
                  )}
                </View>
              ))}
            </View>
          </View>
        </View>
      )}

      {/* Goals */}
      <View style={styles.goalsCard}>
        <Text style={styles.goalsTitle}>This Week</Text>
        {weeklyGoals.map(g => {
          const pct = Math.min(100, (g.current / g.target) * 100);
          const done = pct >= 100;
          return (
            <View key={g.id} style={styles.goalRow}>
              <View style={styles.goalLabelRow}>
                <Text style={styles.goalLabel}>{g.label}</Text>
                <View style={styles.goalRight}>
                  <Text style={styles.goalProgress}>{g.current}/{g.target} {g.unit}</Text>
                  {done && <Ionicons name="checkmark-circle" size={16} color={T.status.success} />}
                </View>
              </View>
              {done && <Text style={styles.goalReachedText}>Goal reached</Text>}
              <View style={styles.goalBarBg}>
                <LinearGradient
                  colors={[T.signal.load, T.readiness.high, T.accent]}
                  locations={[0, 0.55, 1]}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={[styles.goalBarFill, { width: `${pct}%` as any }]}
                />
              </View>
            </View>
          );
        })}
      </View>

      {/* Journal header + search + filter */}
      <TouchableOpacity
        style={styles.journalHeader}
        onPress={() => setJournalExpanded(v => !v)}
        activeOpacity={0.7}
      >
        <Text style={styles.journalTitle}>Journal</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={styles.journalCount}>{filteredFeed.length} sessions</Text>
          <Ionicons
            name={journalExpanded ? 'chevron-up' : 'chevron-down'}
            size={15}
            color={T.text.muted}
          />
        </View>
      </TouchableOpacity>

      {journalExpanded && (
        <>
          <View style={styles.journalSearchWrap}>
            <Ionicons name="search-outline" size={15} color={T.text.muted} />
            <TextInput
              style={styles.journalSearchInput}
              placeholder="Search sessions..."
              placeholderTextColor={T.text.muted}
              value={journalSearch}
              onChangeText={setJournalSearch}
            />
            {journalSearch.length > 0 && (
              <TouchableOpacity onPress={() => setJournalSearch('')}>
                <Ionicons name="close-circle" size={16} color={T.text.muted} />
              </TouchableOpacity>
            )}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterContent}>
            {FILTERS.map(f => (
              <TouchableOpacity
                key={f}
                style={[styles.filterChip, filter === f && styles.filterChipActive]}
                onPress={() => setFilter(f)}
              >
                <Text style={[styles.filterChipText, filter === f && styles.filterChipTextActive]}>{f}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </>
      )}
    </>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator style={{ flex: 1 }} color={T.text.primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <AmbientBackdrop />
      <FlatList<ListRow>
        data={flatListData}
        keyExtractor={(item, i) => {
          if (item.type === 'weekHeader') return `wh-${item.weekKey}`;
          if (item.type === 'feedItem') return `fi-${item.item.kind}-${item.item.sortKey}-${i}`;
          if (item.type === 'showMore') return `sm-${item.weekKey}`;
          return 'loadEarlier';
        }}
        renderItem={renderListRow}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={
          journalExpanded ? (
            <View style={styles.emptyState}>
              <Ionicons name={FILTER_EMPTY[filter].icon as any} size={40} color={T.glass.border} />
              <Text style={styles.emptyText}>{FILTER_EMPTY[filter].title}</Text>
              <Text style={styles.emptySubText}>{FILTER_EMPTY[filter].subtitle}</Text>
            </View>
          ) : null
        }
        contentContainerStyle={styles.listContent}
        refreshing={refreshing}
        onRefresh={loadData}
        showsVerticalScrollIndicator={false}
      />

      {/* Expanded Modal */}
      <ExpandedModal item={expandedItem} onClose={() => setExpandedItem(null)} />

      {/* Warm-Up Personalizer Modal */}
      <WarmUpModal
        visible={showWarmUpModal}
        onClose={() => setShowWarmUpModal(false)}
        soreness={todayCheckin?.soreness}
        energy={todayCheckin?.energy}
      />

      {/* Outdoor Activity Tracker */}
      <OutdoorTracker
        visible={showOutdoorTracker}
        onClose={() => setShowOutdoorTracker(false)}
        onSave={handleOutdoorSave}
      />

      {/* Action Menu */}
      <Modal
        visible={showActionMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setShowActionMenu(false)}
      >
        <TouchableOpacity
          style={styles.menuOverlay}
          onPress={() => setShowActionMenu(false)}
          activeOpacity={1}
        >
          <View style={[styles.menuSheet, { paddingBottom: insets.bottom + 40 }]}>
            <View style={styles.menuHandle} />
            {([
              { icon: 'barbell-outline', label: 'Log Workout', onPress: () => { setShowActionMenu(false); openLogModal(); } },
              { icon: 'walk-outline', label: 'Log Run or Cardio', onPress: () => { setShowActionMenu(false); openCardioModal(); } },
              { icon: 'flash-outline', label: 'Start Warm-Up', onPress: () => { setShowActionMenu(false); setShowWarmUpModal(true); } },
              { icon: 'navigate-outline', label: 'Track Activity', onPress: () => { setShowActionMenu(false); setShowOutdoorTracker(true); } },
              { icon: 'football-outline', label: 'Log Sport Session', onPress: () => { setShowActionMenu(false); openLogModal('sport'); } },
              { icon: 'moon-outline', label: 'Log Rest Day', onPress: async () => { setShowActionMenu(false); try { await logRestDay(); loadData(); } catch { Alert.alert('Error', 'Could not log rest day.'); } } },
            ] as Array<{ icon: string; label: string; onPress: () => void }>).map((item, idx, arr) => (
              <TouchableOpacity
                key={idx}
                style={[styles.menuItem, idx === arr.length - 1 && { borderBottomWidth: 0 }]}
                onPress={item.onPress}
                activeOpacity={0.75}
              >
                <View style={styles.menuIconWrap}>
                  <Ionicons name={item.icon as any} size={20} color={T.text.primary} />
                </View>
                <Text style={styles.menuItemText}>{item.label}</Text>
                <Ionicons name="chevron-forward" size={14} color={T.text.muted} />
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Log Activity Modal */}
      <Modal visible={showLogModal} animationType="slide" presentationStyle="fullScreen" onRequestClose={closeLogModal}>
        <View style={styles.logModalContainer}>
          {logStep === 'sport' && (
            <SportSelector onSelect={handleSportSelect} onClose={closeLogModal} defaultCategory={sportCategoryFilter} />
          )}

          {logStep === 'cardio' && selectedSport && (
            <CardioLogger
              sport={selectedSport}
              workoutName={cardioForm.workoutName}
              duration={cardioForm.duration}
              distance={cardioForm.distance}
              intensity={cardioForm.intensity}
              notes={cardioForm.notes}
              userWeight={user?.weight_kg ?? 75}
              onChange={(field, value) => setCardioForm(f => ({ ...f, [field]: value }))}
              onSubmit={handleCardioSubmit}
              onBack={() => setLogStep('sport')}
              submitting={submitting}
            />
          )}

          {logStep === 'strength' && (
            <>
              <StrengthBuilder
                workoutName={strengthName}
                onWorkoutNameChange={setStrengthName}
                exercises={exercises}
                onExercisesChange={setExercises}
                elapsedSeconds={elapsedSeconds}
                restTimerSeconds={restTimerSeconds}
                restTimerActive={restTimerActive}
                onRestSkip={() => { setRestTimerActive(false); setRestTimerSeconds(90); }}
                onRestAdjust={delta => setRestTimerSeconds(s => Math.max(5, s + delta))}
                onAddExercise={() => setShowExerciseSearch(true)}
                onComplete={handleStrengthComplete}
                onBack={() => setLogStep('sport')}
                sportLabel={selectedSport?.label}
              />
              <ExerciseSearchModal
                visible={showExerciseSearch}
                onClose={() => setShowExerciseSearch(false)}
                onSelect={ex => { handleAddExercise(ex); startRestTimer(); }}
              />
            </>
          )}

          {logStep === 'rpe' && (
            submitting && !completedActivity ? (
              <View style={styles.reviewLoading}>
                <ActivityIndicator size="large" color={T.text.primary} />
                <Text style={styles.reviewLoadingText}>Saving session...</Text>
              </View>
            ) : (
              <RPEPrompt
                onSubmit={handleRpeSubmit}
                onSkip={handleRpeSkip}
              />
            )
          )}

          {logStep === 'review' && (
            submitting && !completedActivity ? (
              <View style={styles.reviewLoading}>
                <ActivityIndicator size="large" color={T.text.primary} />
                <Text style={styles.reviewLoadingText}>Saving session...</Text>
              </View>
            ) : completedActivity ? (
              <PostSessionView
                activity={completedActivity}
                sport={selectedSport}
                exercises={exercises}
                onDone={closeLogModal}
              />
            ) : null
          )}
        </View>
      </Modal>

      {/* Share Activity as ORYX Insight */}
      <OryxInsightCreator
        visible={showShareCreator}
        onClose={() => { setShowShareCreator(false); setShareSession(null); }}
        onBack={() => { setShowShareCreator(false); setShareSession(null); }}
        onPostCreated={() => { setShowShareCreator(false); setShareSession(null); }}
        initialSessionId={
          shareSession?.kind === 'manual'
            ? (shareSession.data as any).id
            : shareSession?.kind === 'hevy'
            ? (shareSession.data as any).id
            : shareSession?.kind === 'strava'
            ? (shareSession.data as any).id
            : undefined
        }
        initialSessionData={shareSession?.data}
      />
    </SafeAreaView>
  );
}

// ── Chart Config ──────────────────────────────────────────────────────────────

const chartConfig = {
  backgroundColor: T.glass.card,
  backgroundGradientFrom: T.glass.card,
  backgroundGradientTo: T.glass.card,
  decimalPlaces: 1,
  color: (opacity = 1) => toRgba(T.text.secondary, opacity),
  labelColor: () => T.text.muted,
  style: { borderRadius: 8 },
  propsForBackgroundLines: { stroke: T.glass.card },
  barPercentage: 0.6,
};

// ── Styles ────────────────────────────────────────────────────────────────────

function createStyles(t: ThemeColors) {
  return StyleSheet.create({
  // Transparent so AmbientBackdrop paints the app bg.
  container: { flex: 1, backgroundColor: 'transparent' },
  listContent: { paddingBottom: 120 },

  // Title bar — mono ticker + Geist title + lime accent button.
  titleBar: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 14 },
  pageTicker: {
    fontSize: 10, color: t.text.muted,
    fontFamily: TY.mono.medium, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4,
  },
  screenTitle: { fontSize: 26, color: t.text.primary, fontFamily: TY.sans.medium, letterSpacing: -0.5 },
  addFab: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: t.accent, paddingHorizontal: 16, paddingVertical: 8, borderRadius: R.pill },
  addFabText: { color: t.accentInk, fontFamily: TY.sans.semibold, fontSize: 14, letterSpacing: -0.2 },

  // Steps
  stepsCard: {
    marginHorizontal: 16, marginBottom: 12,
    backgroundColor: t.glass.card, borderRadius: R.lg, padding: SP[4],
    borderWidth: 1, borderColor: t.glass.border,
  },
  stepsLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  stepsVal: {
    fontSize: 20, color: t.text.primary,
    fontFamily: TY.sans.semibold, letterSpacing: -0.3, ...TY.tabular,
  },
  stepsLabel: {
    fontSize: 11, color: t.text.muted,
    fontFamily: TY.mono.regular, letterSpacing: 0.3,
  },
  stepsBarBg: { height: 6, backgroundColor: T.hairline, borderRadius: R.pill, overflow: 'hidden' },
  stepsBarFill: { height: 6, borderRadius: R.pill },

  // Stats bar — two rows of 3
  statsBar: {
    marginHorizontal: 16, marginBottom: 12,
    backgroundColor: t.glass.card, borderRadius: R.lg,
    borderWidth: 1, borderColor: t.glass.border,
    paddingVertical: 4, paddingHorizontal: 14,
  },
  statsRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  statsRowBorder: { borderBottomWidth: 1, borderBottomColor: t.glass.border },
  statItem: { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, height: 28, backgroundColor: t.glass.border },
  statVal: {
    fontSize: 18, color: t.text.primary,
    fontFamily: TY.sans.semibold, letterSpacing: -0.3, ...TY.tabular,
  },
  statLabel: {
    fontSize: 9, color: t.text.secondary, marginTop: 4, textAlign: 'center',
    fontFamily: TY.mono.medium, letterSpacing: 1.2, textTransform: 'uppercase',
  },

  // Progress toggle
  progressToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 16, marginBottom: 8, paddingVertical: 10 },
  progressToggleText: { fontSize: 15, color: t.text.primary, fontFamily: TY.sans.semibold, letterSpacing: -0.2 },
  progressSection: { marginBottom: 4 },
  progressCard: {
    marginHorizontal: 16, marginBottom: 12,
    backgroundColor: t.glass.card, borderRadius: R.lg, padding: SP[4],
    borderWidth: 1, borderColor: t.glass.border,
  },
  progressCardTitle: {
    fontSize: 11, color: t.text.secondary, marginBottom: 12,
    fontFamily: TY.mono.medium, letterSpacing: 1.8, textTransform: 'uppercase',
  },
  barChart: { borderRadius: 8, marginLeft: -8 },

  // Heatmap legend
  heatmapLegend: { flexDirection: 'row', gap: 12, marginTop: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 10, height: 10, borderRadius: 2 },
  legendText: { fontSize: 10, color: T.text.muted },

  // Breakdown
  breakdownRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
  breakdownLabel: {
    width: 72, fontSize: 12, color: t.text.secondary,
    fontFamily: TY.sans.regular,
  },
  breakdownBarBg: { flex: 1, height: 8, backgroundColor: T.hairline, borderRadius: R.pill, overflow: 'hidden' },
  breakdownBarFill: { height: 8, borderRadius: R.pill },
  breakdownPct: {
    width: 40, fontSize: 11, color: t.text.secondary, textAlign: 'right',
    fontFamily: TY.mono.regular, letterSpacing: 0.3,
  },
  donutRow: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 4 },
  donutLegend: { flex: 1, gap: 8 },
  donutLegendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  donutSwatch: { width: 10, height: 10, borderRadius: R.pill },
  donutLegendLabel: {
    flex: 1, fontSize: 12, color: t.text.secondary,
    fontFamily: TY.sans.regular,
  },
  donutLegendPct: {
    fontSize: 11, color: t.text.primary, fontFamily: TY.mono.regular, letterSpacing: 0.3,
  },

  // Badges
  badgesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  badgeTile: {
    width: 100, height: 100, alignItems: 'center', justifyContent: 'center',
    backgroundColor: t.glass.pill, borderRadius: R.md, padding: 10, gap: 6, position: 'relative',
    borderWidth: 1, borderColor: t.glass.border,
  },
  badgeLocked: { opacity: 0.35 },
  badgeLabel: {
    fontSize: 9, color: t.text.secondary, textAlign: 'center', lineHeight: 12,
    fontFamily: TY.mono.medium, letterSpacing: 0.8,
  },
  badgeLabelLocked: { color: t.text.muted },

  // Goals
  goalsCard: {
    marginHorizontal: 16, marginBottom: 12,
    backgroundColor: t.glass.card, borderRadius: R.lg, padding: SP[4],
    borderWidth: 1, borderColor: t.glass.border,
  },
  goalsTitle: {
    fontSize: 11, color: t.text.secondary, marginBottom: 12,
    fontFamily: TY.mono.medium, letterSpacing: 1.8, textTransform: 'uppercase',
  },
  goalRow: { marginBottom: 14 },
  goalLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  goalLabel: {
    fontSize: 13, color: t.text.body,
    fontFamily: TY.sans.regular,
  },
  goalRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  goalProgress: {
    fontSize: 12, color: t.text.secondary,
    fontFamily: TY.mono.regular, letterSpacing: 0.3,
  },
  goalBarBg: { height: 6, backgroundColor: T.hairline, borderRadius: R.pill, overflow: 'hidden' },
  goalBarFill: { height: 6, borderRadius: R.pill },

  // Journal
  journalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 8 },
  journalTitle: {
    fontSize: 15, color: t.text.primary,
    fontFamily: TY.sans.semibold, letterSpacing: -0.2,
  },
  journalCount: {
    fontSize: 11, color: t.text.muted,
    fontFamily: TY.mono.regular, letterSpacing: 0.3,
  },
  filterScroll: { marginBottom: 8 },
  filterContent: { paddingHorizontal: 16, gap: 8 },
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: R.pill,
    backgroundColor: t.glass.pill,
    borderWidth: 1, borderColor: t.glass.border,
  },
  filterChipActive: { backgroundColor: t.accent, borderColor: t.accent },
  filterChipText: {
    fontSize: 12, color: t.text.secondary,
    fontFamily: TY.sans.medium, letterSpacing: -0.1,
  },
  filterChipTextActive: { color: t.accentInk, fontFamily: TY.sans.semibold },

  // Feed card
  feedCard: {
    marginHorizontal: 16, marginBottom: 10,
    backgroundColor: t.glass.card, borderRadius: R.lg, padding: SP[4],
    borderWidth: 1, borderColor: t.glass.border,
  },
  feedCardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  feedIconWrap: {
    width: 40, height: 40, borderRadius: R.md,
    backgroundColor: t.glass.pill, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: t.glass.border,
  },
  feedCardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  feedCardTitle: {
    fontSize: 15, color: t.text.primary, flex: 1,
    fontFamily: TY.sans.semibold, letterSpacing: -0.2,
  },
  sourceBadge: {
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6,
    backgroundColor: t.glass.pill, borderWidth: 1, borderColor: t.glass.border,
  },
  sourceBadgeText: {
    fontSize: 10, color: t.text.secondary,
    fontFamily: TY.mono.medium, letterSpacing: 0.8, textTransform: 'uppercase',
  },
  feedCardMeta: {
    fontSize: 11, color: t.text.muted, marginTop: 2,
    fontFamily: TY.mono.regular, letterSpacing: 0.3,
  },
  feedCardStats: { flexDirection: 'row', gap: 12, alignItems: 'center', marginBottom: 6 },
  intensityBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  intensityBadgeText: {
    fontSize: 11, fontFamily: TY.sans.semibold, letterSpacing: -0.1,
  },
  feedStatItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  feedStatText: {
    fontSize: 12, color: t.text.secondary,
    fontFamily: TY.mono.regular, letterSpacing: 0.2,
  },
  feedAutopsy: {
    fontSize: 12, color: t.text.body, lineHeight: 18, marginBottom: 6,
    fontFamily: TY.sans.regular,
  },
  feedMuscleRow: { flexDirection: 'row', gap: 5 },
  feedMuscleDot: { width: 8, height: 8, borderRadius: 4 },

  // Empty state
  emptyState: { alignItems: 'center', paddingVertical: 60, gap: 8 },
  emptyText: {
    fontSize: 16, color: t.text.secondary,
    fontFamily: TY.sans.semibold, letterSpacing: -0.2,
  },
  emptySubText: {
    fontSize: 13, color: t.text.muted,
    fontFamily: TY.sans.regular,
  },

  // Log modal
  logModalContainer: { flex: 1, backgroundColor: T.bg.primary },

  // Sport selector
  sportSelectorHeader: {
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 14,
  },
  sportSelectorTicker: {
    fontSize: 10, color: t.text.muted,
    fontFamily: TY.mono.medium, letterSpacing: 2,
    textTransform: 'uppercase', marginBottom: 4,
  },
  sportSelectorTitle: {
    fontSize: 26, color: t.text.primary,
    fontFamily: TY.sans.medium, letterSpacing: -0.5,
  },
  sportSelectorClose: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: t.glass.pill,
    borderWidth: 1, borderColor: t.glass.border,
    alignItems: 'center', justifyContent: 'center',
  },
  sportGrid: {
    paddingHorizontal: 20, paddingBottom: 40, paddingTop: 4, gap: 10,
  },
  sportTile: {
    flex: 1, alignItems: 'center', gap: 8,
    paddingVertical: 16, paddingHorizontal: 6,
    backgroundColor: t.glass.card,
    borderRadius: R.lg,
    borderWidth: 1, borderColor: t.glass.border,
  },
  sportIconWrap: {
    width: 52, height: 52, borderRadius: R.md,
    backgroundColor: t.glass.cardHi,
    borderWidth: 1, borderColor: t.glass.border,
    alignItems: 'center', justifyContent: 'center',
  },
  sportTileLabel: {
    fontSize: 12, color: t.text.body, textAlign: 'center',
    fontFamily: TY.sans.medium, letterSpacing: -0.1,
  },

  // Category scroll
  catScroll: { maxHeight: 50, flexGrow: 0, marginBottom: 10 },
  catScrollContent: { paddingHorizontal: 20, gap: 8, alignItems: 'center' },
  catChip: {
    paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: R.pill,
    backgroundColor: t.glass.pill,
    borderWidth: 1, borderColor: t.glass.border,
  },
  catChipActive: {
    backgroundColor: t.accent, borderColor: t.accent,
  },
  catChipText: {
    fontSize: 13, color: t.text.secondary,
    fontFamily: TY.sans.medium, letterSpacing: -0.1,
  },
  catChipTextActive: {
    color: t.accentInk, fontFamily: TY.sans.semibold,
  },

  // Strength builder
  strengthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: T.glass.card },
  elapsedTimer: { fontSize: 22, fontWeight: '700', color: T.text.primary },
  elapsedLabel: { fontSize: 11, color: T.text.muted, textAlign: 'center' },
  completeBtn: { backgroundColor: T.status.success, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  completeBtnText: { color: T.text.primary, fontWeight: '700', fontSize: 14 },
  strengthScrollContent: { paddingHorizontal: 16, paddingBottom: 20 },
  workoutNameInput: { marginHorizontal: 16, marginVertical: 10, backgroundColor: T.glass.card, borderRadius: 10, padding: 12, fontSize: 15, fontWeight: '600', color: T.text.primary, borderWidth: 1, borderColor: T.glass.card },

  // Exercise card
  exerciseCard: { backgroundColor: T.glass.card, borderRadius: 12, padding: 12, marginBottom: 12 },
  exerciseCardInSuperset: {
    marginLeft: 12,
    borderLeftWidth: 2,
    borderLeftColor: T.accent,
    borderTopLeftRadius: 4,
    borderBottomLeftRadius: 4,
  },
  supersetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
    marginBottom: 6,
    marginLeft: 4,
  },
  supersetHeaderBar: {
    width: 18,
    height: 2,
    backgroundColor: T.accent,
    borderRadius: 1,
  },
  supersetHeaderText: {
    fontFamily: TY.mono.semibold,
    fontSize: 10,
    color: T.accent,
    letterSpacing: 1.2,
  },
  exerciseCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  exerciseCardName: { flex: 1, fontSize: 15, fontWeight: '600', color: T.text.primary },
  exDot: { width: 10, height: 10, borderRadius: 5 },

  // Set headers
  setHeaderRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 2, marginBottom: 4 },
  setHeaderNum: { width: 22, fontSize: 10, color: T.text.muted, textAlign: 'center' },
  setHeaderType: { width: 32, fontSize: 10, color: T.text.muted, textAlign: 'center' },
  setHeaderInput: { flex: 1, fontSize: 10, color: T.text.muted, textAlign: 'center' },
  setHeaderRPE: { width: 36, fontSize: 10, color: T.text.muted, textAlign: 'center' },
  setHeaderCheck: { width: 28, fontSize: 10, color: T.text.muted, textAlign: 'center' },

  // Set row
  setRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, gap: 4 },
  setRowCompleted: { opacity: 0.6 },
  setNum: { width: 22, fontSize: 12, color: T.text.muted, textAlign: 'center' },
  setTypePill: { width: 30, height: 24, borderRadius: 6, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  setTypeText: { fontSize: 11, fontWeight: '700' },
  setInput: { flex: 1, height: 34, backgroundColor: T.bg.primary, borderRadius: 6, textAlign: 'center', color: T.text.primary, fontSize: 13, borderWidth: 1, borderColor: T.hairline },
  setInputRPE: { width: 36, flex: 0 },
  setCheckBtn: { width: 28, alignItems: 'center' },

  addSetBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, justifyContent: 'center' },
  addSetText: { fontSize: 13, color: T.text.primary, fontWeight: '600' },
  exNotesInput: { marginTop: 4, backgroundColor: T.bg.primary, borderRadius: 8, padding: 8, fontSize: 12, color: T.text.secondary, borderWidth: 1, borderColor: T.glass.card },

  addExerciseBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: T.glass.card, borderRadius: 12, padding: 14, justifyContent: 'center', borderWidth: 1, borderColor: T.text.primary + '44' },
  addExerciseText: { fontSize: 14, color: T.text.primary, fontWeight: '600' },

  // Rest timer
  restTimerBanner: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: T.glass.card, paddingVertical: 14, paddingHorizontal: 20, borderTopWidth: 1, borderTopColor: T.glass.border, alignItems: 'center', gap: 4 },
  restTimerLabel: { fontSize: 11, color: T.text.secondary, textTransform: 'uppercase', letterSpacing: 1 },
  restTimerCount: { fontSize: 32, fontWeight: '700', color: T.text.primary },
  restTimerRow: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  restAdjBtn: { paddingHorizontal: 14, paddingVertical: 7, backgroundColor: T.glass.card, borderRadius: 8 },
  restAdjText: { fontSize: 13, color: T.text.secondary },
  restSkipBtn: { paddingHorizontal: 24, paddingVertical: 8, backgroundColor: T.text.primary, borderRadius: 20 },
  restSkipText: { fontSize: 13, fontWeight: '600', color: T.text.primary },

  // Exercise search
  exSearchContainer: { flex: 1, backgroundColor: T.bg.primary },
  exSearchHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16 },
  exSearchTitle: { fontSize: 20, fontWeight: '700', color: T.text.primary },
  exSearchInputWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 8, backgroundColor: T.glass.card, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  exSearchInput: { flex: 1, fontSize: 14, color: T.text.primary },
  exRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: T.glass.card, gap: 10 },
  exRowInfo: { flex: 1 },
  exRowName: { fontSize: 14, fontWeight: '600', color: T.text.primary },
  exRowGroup: { fontSize: 12, color: T.text.muted, marginTop: 1 },

  // Cardio form
  cardioHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: T.glass.card },
  cardioSportTag: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardioSportLabel: { fontSize: 15, fontWeight: '600', color: T.text.primary },
  cardioScrollContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 },
  cardioRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  cardioField: { flex: 1 },
  cardioFieldLabel: { fontSize: 12, color: T.text.secondary, marginBottom: 6 },
  cardioInputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: T.glass.card, borderRadius: 10, borderWidth: 1, borderColor: T.glass.card, paddingHorizontal: 12 },
  cardioInput: { flex: 1, paddingVertical: 12, fontSize: 16, color: T.text.primary },
  cardioUnit: { fontSize: 13, color: T.text.muted },
  sectionLabel: { fontSize: 12, color: T.text.secondary, marginBottom: 8, marginTop: 4 },
  intensityRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  intensityPill: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: T.glass.card, alignItems: 'center', borderWidth: 1, borderColor: T.glass.card },
  intensityPillText: { fontSize: 12, fontWeight: '600', color: T.text.secondary },
  calsPreviewCard: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: T.glass.card, borderRadius: 10, padding: 12, marginBottom: 16 },
  calsPreviewText: { fontSize: 14, color: T.status.danger, fontWeight: '600' },
  notesInput: { backgroundColor: T.glass.card, borderRadius: 10, padding: 12, fontSize: 13, color: T.text.secondary, borderWidth: 1, borderColor: T.glass.card, minHeight: 80, textAlignVertical: 'top', marginBottom: 20 },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: T.text.primary, paddingVertical: 14, borderRadius: 12 },
  submitBtnText: { fontSize: 15, fontWeight: '700', color: T.text.primary },

  // Post session / review
  reviewScroll: { padding: 24, paddingTop: 80, alignItems: 'center' },
  reviewCheckCircle: { marginBottom: 12 },
  reviewTitle: { fontSize: 22, fontWeight: '700', color: T.text.primary, marginBottom: 4 },
  reviewSubtitle: { fontSize: 14, color: T.text.secondary, marginBottom: 20 },
  reviewStatsRow: { flexDirection: 'row', gap: 12, marginBottom: 20, flexWrap: 'wrap', justifyContent: 'center' },
  reviewStat: { backgroundColor: T.glass.card, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12, alignItems: 'center', minWidth: 80 },
  reviewStatVal: { fontSize: 20, fontWeight: '700', color: T.text.primary },
  reviewStatLabel: { fontSize: 11, color: T.text.muted, marginTop: 2 },
  reviewSection: { width: '100%', marginBottom: 16 },
  reviewSectionTitle: { fontSize: 12, color: T.text.secondary, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  muscleTagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  muscleTag: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  muscleDot: { width: 7, height: 7, borderRadius: 3.5 },
  muscleTagText: { fontSize: 12, fontWeight: '600' },
  stravaMapWrap: { width: '100%', height: 220, borderRadius: 16, overflow: 'hidden', marginBottom: 16, borderWidth: 1, borderColor: T.glass.border },
  stravaMap: { width: '100%', height: '100%' },
  generateAutopsyBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, paddingVertical: 14, paddingHorizontal: 20, borderRadius: 12, borderWidth: 1, borderColor: '#FC4C02', backgroundColor: 'rgba(252,76,2,0.08)', justifyContent: 'center' },
  generateAutopsyText: { fontSize: 14, fontWeight: '600', color: '#FC4C02' },
  autopsyCard: { width: '100%', backgroundColor: T.glass.card, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: T.glass.border },
  autopsyHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  autopsyTitle: { fontSize: 12, fontWeight: '700', color: T.text.primary, textTransform: 'uppercase', letterSpacing: 0.5 },
  autopsyText: { fontSize: 13, color: T.text.secondary, lineHeight: 20 },
  autopsyGenerating: { fontSize: 13, color: T.text.muted, marginTop: 8, textAlign: 'center' },
  doneBtn: { marginTop: 24, backgroundColor: T.text.primary, paddingHorizontal: 48, paddingVertical: 14, borderRadius: 12, width: '100%', alignItems: 'center' },
  doneBtnText: { fontSize: 16, fontWeight: '700', color: T.text.primary },
  reviewLoading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  reviewLoadingText: { fontSize: 14, color: T.text.secondary },

  // Autopsy retry
  autopsyRetryBtn: { marginTop: 10, paddingVertical: 8, paddingHorizontal: 16, backgroundColor: T.glass.border, borderRadius: 8, alignSelf: 'flex-start' },
  autopsyRetryText: { fontSize: 13, color: T.text.primary, fontWeight: '600' },

  // Plus button (matches Nutrition page)
  plusBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: T.text.primary, alignItems: 'center', justifyContent: 'center' },

  // Action menu
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  menuSheet: { backgroundColor: T.glass.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 12, paddingHorizontal: 20, paddingBottom: 40, borderWidth: 1, borderColor: T.glass.border },
  menuHandle: { width: 40, height: 4, backgroundColor: T.glass.border, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: T.glass.border },
  menuIconWrap: { width: 36, height: 36, borderRadius: 10, backgroundColor: T.glass.border, alignItems: 'center', justifyContent: 'center' },
  menuItemText: { flex: 1, fontSize: 16, color: T.text.primary, fontWeight: '500' },

  // Expanded modal
  expandContainer: { flex: 1, backgroundColor: T.bg.primary },
  expandHeader: { paddingHorizontal: 20, paddingVertical: 12 },
  expandScroll: { padding: 20 },
  expandTitle: { fontSize: 22, fontWeight: '700', color: T.text.primary, marginBottom: 4 },
  expandMeta: { fontSize: 13, color: T.text.secondary, marginBottom: 4 },
  expandSectionTitle: { fontSize: 12, color: T.text.secondary, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 16, marginBottom: 8 },
  expandExRow: { backgroundColor: T.glass.card, borderRadius: 10, padding: 10, marginBottom: 8 },
  expandExName: { fontSize: 13, fontWeight: '600', color: T.text.primary, marginBottom: 4 },
  expandSetText: { fontSize: 12, color: T.text.secondary, marginBottom: 2 },
  expandNotes: { fontSize: 13, color: T.text.secondary, fontStyle: 'italic', marginTop: 16 },

  // RPE Prompt
  rpeContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 20 },
  rpeQuestion: { fontSize: 24, fontWeight: '700', color: T.text.primary, textAlign: 'center' },
  rpeSubtitle: { fontSize: 14, color: T.text.secondary, textAlign: 'center', marginTop: -12 },
  rpeCirclesRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  rpeCircle: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: T.glass.border, backgroundColor: T.glass.card, alignItems: 'center', justifyContent: 'center' },
  rpeCircleNum: { fontSize: 15, fontWeight: '700', color: T.text.primary },
  rpeLabelPill: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  rpeLabelText: { fontSize: 13, fontWeight: '600' },
  rpeSubmitBtn: { backgroundColor: T.text.primary, paddingHorizontal: 48, paddingVertical: 14, borderRadius: 12, width: '100%', alignItems: 'center' },
  rpeSubmitText: { fontSize: 16, fontWeight: '700', color: T.bg.primary },
  rpeSkipBtn: { paddingVertical: 10 },
  rpeSkipText: { fontSize: 14, color: T.text.muted },

  // Load badge (feed card)
  loadBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  loadBadgeText: { fontSize: 11, fontWeight: '600' },

  // Readiness card
  readinessCard: {
    marginHorizontal: 16, marginBottom: 12,
    backgroundColor: t.glass.card, borderRadius: R.lg, padding: SP[4],
    borderWidth: 1, borderColor: t.glass.border,
  },
  readinessTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  readinessCardTitle: {
    fontSize: 11, color: t.text.secondary, marginBottom: 4,
    fontFamily: TY.mono.medium, letterSpacing: 1.8, textTransform: 'uppercase',
  },
  readinessLabel: {
    fontSize: 13, fontFamily: TY.mono.medium, letterSpacing: 1.4, textTransform: 'uppercase',
  },
  readinessScore: {
    fontSize: 48, lineHeight: 52,
    fontFamily: TY.sans.semibold, letterSpacing: -1.4, ...TY.tabular,
  },
  readinessExplanation: {
    fontSize: 13, color: t.text.body, lineHeight: 19,
    fontFamily: TY.sans.regular,
  },
  restDayBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, backgroundColor: T.status.warn + '22', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, alignSelf: 'flex-start', borderWidth: 1, borderColor: T.status.warn },
  restDayBannerText: { fontSize: 12, fontWeight: '600', color: T.status.warn },
  restModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 32 },
  restModalSheet: { backgroundColor: T.glass.card, borderRadius: 20, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: T.glass.border, width: '100%' },
  restModalTitle: { fontSize: 18, fontWeight: '700', color: T.text.primary, marginBottom: 12, textAlign: 'center' },
  restModalBody: { fontSize: 14, color: T.text.secondary, lineHeight: 21, textAlign: 'center', marginBottom: 20 },
  restModalDismiss: { backgroundColor: T.glass.border, paddingHorizontal: 32, paddingVertical: 12, borderRadius: 10 },
  restModalDismissText: { fontSize: 14, fontWeight: '600', color: T.text.primary },

  // Goals — reached label
  goalReachedText: { fontSize: 11, color: T.status.success, fontWeight: '600', marginTop: 2, marginBottom: 4 },

  // Feed card — rest day variant
  feedCardRest: { backgroundColor: T.glass.cardHi },

  // Journal search bar
  journalSearchWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 8, backgroundColor: T.glass.card, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: T.glass.card },
  journalSearchInput: { flex: 1, fontSize: 13, color: T.text.primary },

  // Weekly journal group headers
  weekHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 10, marginTop: 4 },
  weekHeaderLabel: { fontSize: 13, fontWeight: '600', color: T.text.secondary },
  weekHeaderCount: { fontSize: 11, color: T.text.muted },

  // Show more / load earlier
  showMoreBtn: { marginHorizontal: 16, marginBottom: 4, paddingVertical: 10, alignItems: 'center', backgroundColor: T.glass.card, borderRadius: 10, borderWidth: 1, borderColor: T.glass.card },
  showMoreText: { fontSize: 13, color: T.text.secondary, fontWeight: '500' },
  loadEarlierBtn: { marginHorizontal: 16, marginTop: 8, marginBottom: 16, paddingVertical: 14, alignItems: 'center', backgroundColor: T.glass.card, borderRadius: 10, borderWidth: 1, borderColor: T.glass.border },
  loadEarlierText: { fontSize: 13, color: T.text.muted, fontWeight: '500' },

  // Weekly load card
  weeklyLoadCard: {
    marginHorizontal: 16, marginBottom: 12,
    backgroundColor: t.glass.card, borderRadius: R.lg, padding: SP[4],
    borderWidth: 1, borderColor: t.glass.border,
  },
  weeklyLoadTitle: {
    fontSize: 11, color: t.text.secondary, marginBottom: 12,
    fontFamily: TY.mono.medium, letterSpacing: 1.8, textTransform: 'uppercase',
  },
  weeklyLoadTopRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, marginBottom: 12 },
  weeklyLoadNum: {
    fontSize: 42, color: t.text.primary, lineHeight: 46,
    fontFamily: TY.sans.semibold, letterSpacing: -1.2, ...TY.tabular,
  },
  weeklyLoadChange: { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 6 },
  weeklyLoadChangePct: { fontSize: 12, fontWeight: '600' },
  weeklyLoadBarBg: { height: 8, backgroundColor: T.glass.border, borderRadius: 4, marginBottom: 4, overflow: 'hidden' },
  weeklyLoadBarFill: { height: 8, borderRadius: 4 },
  weeklyLoadAvgLabel: { fontSize: 11, color: T.text.muted, marginBottom: 12 },
  acwrRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  acwrLabel: { fontSize: 12, color: T.text.secondary, fontWeight: '600' },
  acwrValue: { fontSize: 18, fontWeight: '800' },
  acwrStatusPill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, borderWidth: 1 },
  acwrStatusText: { fontSize: 11, fontWeight: '600' },
  acwrInsufficient: { fontSize: 12, color: T.text.muted },
  acwrExplanation: { fontSize: 12, color: T.text.muted, lineHeight: 17 },
  });
}
