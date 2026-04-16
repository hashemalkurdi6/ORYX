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
}

type FeedItem =
  | { kind: 'manual'; sortKey: string; data: UserActivity }
  | { kind: 'hevy'; sortKey: string; data: HevyWorkout }
  | { kind: 'strava'; sortKey: string; data: Activity };

// ── Constants ──────────────────────────────────────────────────────────────────

const { width: SCREEN_W } = Dimensions.get('window');
const FILTERS: FilterType[] = ['All', 'Strength', 'Cardio', 'Sport', 'Strava', 'Hevy'];
const INTENSITIES: IntensityType[] = ['Easy', 'Moderate', 'Hard', 'Max'];
const SET_TYPES: { key: SetType; label: string; color: string }[] = [
  { key: 'working', label: 'W', color: '#e0e0e0' },
  { key: 'warmup', label: 'U', color: '#888888' },
  { key: 'drop', label: 'D', color: '#FF6B35' },
  { key: 'failure', label: 'F', color: '#c0392b' },
];
const CATEGORY_ICONS: Record<string, string> = {
  strength: 'barbell-outline',
  cardio: 'walk-outline',
  combat: 'body-outline',
  sport: 'football-outline',
  mindBody: 'leaf-outline',
  other: 'compass-outline',
};

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
    case 'Easy': return '#27ae60';
    case 'Moderate': return '#888888';
    case 'Hard': return '#FF6B35';
    case 'Max': return '#c0392b';
    default: return '#888888';
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
  if (load < 150) return '#27ae60';
  if (load < 300) return '#f39c12';
  if (load < 500) return '#e67e22';
  return '#c0392b';
}

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
            <Ionicons name="close" size={24} color="#f0f0f0" />
          </TouchableOpacity>
        </View>

        <View style={styles.exSearchInputWrap}>
          <Ionicons name="search-outline" size={16} color="#555555" />
          <TextInput
            style={styles.exSearchInput}
            placeholder="Search exercises..."
            placeholderTextColor="#555"
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
              <View style={[styles.exDot, { backgroundColor: MUSCLE_COLORS[item.muscleGroup] ?? '#e0e0e0' }]} />
              <View style={styles.exRowInfo}>
                <Text style={styles.exRowName}>{item.name}</Text>
                <Text style={styles.exRowGroup}>{MUSCLE_GROUP_LABELS[item.muscleGroup] ?? item.muscleGroup}</Text>
              </View>
              <Ionicons name="add-circle-outline" size={20} color="#e0e0e0" />
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
  const setTypeInfo = SET_TYPES.find(t => t.key === set.type)!;
  return (
    <View style={[styles.setRow, set.completed && styles.setRowCompleted]}>
      {/* Set number */}
      <Text style={styles.setNum}>{index + 1}</Text>

      {/* Type pill */}
      <TouchableOpacity
        style={[styles.setTypePill, { borderColor: setTypeInfo.color }]}
        onPress={() => {
          const idx = SET_TYPES.findIndex(t => t.key === set.type);
          onChange('type', SET_TYPES[(idx + 1) % SET_TYPES.length].key);
        }}
      >
        <Text style={[styles.setTypeText, { color: setTypeInfo.color }]}>{setTypeInfo.label}</Text>
      </TouchableOpacity>

      {/* Weight */}
      <TextInput
        style={styles.setInput}
        placeholder={prevWeight ?? 'kg'}
        placeholderTextColor="#555555"
        keyboardType="decimal-pad"
        value={set.weight}
        onChangeText={v => onChange('weight', v)}
      />

      {/* Reps */}
      <TextInput
        style={styles.setInput}
        placeholder={prevReps ?? 'reps'}
        placeholderTextColor="#555555"
        keyboardType="number-pad"
        value={set.reps}
        onChangeText={v => onChange('reps', v)}
      />

      {/* RPE */}
      <TextInput
        style={[styles.setInput, styles.setInputRPE]}
        placeholder="RPE"
        placeholderTextColor="#555555"
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
          color={set.completed ? '#27ae60' : '#555555'}
        />
      </TouchableOpacity>
    </View>
  );
};

// ── RPE Prompt ─────────────────────────────────────────────────────────────────
const RPE_COLORS: Record<number, string> = {
  1: '#27ae60', 2: '#27ae60', 3: '#27ae60',
  4: '#f39c12', 5: '#f39c12', 6: '#f39c12',
  7: '#e67e22', 8: '#e67e22', 9: '#e67e22',
  10: '#c0392b',
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
              selected === n && { backgroundColor: RPE_COLORS[n], borderColor: RPE_COLORS[n] },
            ]}
            onPress={() => setSelected(n)}
            activeOpacity={0.75}
          >
            <Text style={[styles.rpeCircleNum, selected === n && { color: '#0a0a0a' }]}>{n}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {selected !== null && (
        <View style={[styles.rpeLabelPill, { backgroundColor: RPE_COLORS[selected] + '22', borderColor: RPE_COLORS[selected] }]}>
          <Text style={[styles.rpeLabelText, { color: RPE_COLORS[selected] }]}>{RPE_LABELS[selected]}</Text>
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

  const updateExercise = (idx: number, updated: ExerciseEntry) => {
    const next = exercises.map((ex, i) => (i === idx ? updated : ex));
    onExercisesChange(next);
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
          <Ionicons name="chevron-back" size={24} color="#f0f0f0" />
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
        placeholderTextColor="#555"
        value={workoutName}
        onChangeText={onWorkoutNameChange}
      />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.strengthScrollContent} keyboardShouldPersistTaps="handled">
        {exercises.map((ex, exIdx) => (
          <View key={ex.id} style={styles.exerciseCard}>
            <View style={styles.exerciseCardHeader}>
              <View style={[styles.exDot, { backgroundColor: MUSCLE_COLORS[ex.muscleGroup] ?? '#e0e0e0' }]} />
              <Text style={styles.exerciseCardName}>{ex.name}</Text>
              <TouchableOpacity onPress={() => removeExercise(exIdx)}>
                <Ionicons name="trash-outline" size={18} color="#c0392b" />
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
              <Ionicons name="add-outline" size={16} color="#e0e0e0" />
              <Text style={styles.addSetText}>Add Set</Text>
            </TouchableOpacity>

            <TextInput
              style={styles.exNotesInput}
              placeholder="Exercise notes..."
              placeholderTextColor="#555555"
              value={ex.notes}
              onChangeText={v => updateExercise(exIdx, { ...ex, notes: v })}
            />
          </View>
        ))}

        <TouchableOpacity style={styles.addExerciseBtn} onPress={onAddExercise}>
          <Ionicons name="add-circle-outline" size={20} color="#e0e0e0" />
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
          <Ionicons name="chevron-back" size={24} color="#f0f0f0" />
        </TouchableOpacity>
        <View style={styles.cardioSportTag}>
          <Ionicons name={sport.icon as any} size={16} color="#f0f0f0" />
          <Text style={styles.cardioSportLabel}>{sport.label}</Text>
        </View>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.cardioScrollContent, { paddingBottom: insets.bottom + 40 }]} keyboardShouldPersistTaps="handled">
        <TextInput
          style={styles.workoutNameInput}
          placeholder={`${sport.label} session`}
          placeholderTextColor="#555"
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
                placeholderTextColor="#555"
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
                placeholderTextColor="#555"
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
              <Text style={[styles.intensityPillText, intensity === i && { color: '#f0f0f0' }]}>{i}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {durationNum > 0 && (
          <View style={styles.calsPreviewCard}>
            <Ionicons name="flame-outline" size={20} color="#FF6B35" />
            <Text style={styles.calsPreviewText}>~{cals} kcal estimated</Text>
          </View>
        )}

        <Text style={styles.sectionLabel}>Notes</Text>
        <TextInput
          style={styles.notesInput}
          placeholder="How did it feel? Any issues?"
          placeholderTextColor="#555555"
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
            <ActivityIndicator color="#f0f0f0" />
          ) : (
            <>
              <Ionicons name="checkmark-circle-outline" size={20} color="#f0f0f0" />
              <Text style={styles.submitBtnText}>Log Session</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

// ── Sport Selector ─────────────────────────────────────────────────────────────

const SportSelector = ({ onSelect, onClose }: { onSelect: (s: SportType) => void; onClose: () => void }) => {
  const insets = useSafeAreaInsets();
  const [catFilter, setCatFilter] = useState<string>('All');
  const cats = ['All', 'strength', 'cardio', 'combat', 'sport', 'mindBody', 'other'];
  const filtered = catFilter === 'All' ? SPORT_TYPES : SPORT_TYPES.filter(s => s.category === catFilter);

  return (
    <View style={{ flex: 1 }}>
      <View style={[styles.sportSelectorHeader, { paddingTop: insets.top + 16 }]}>
        <Text style={styles.sportSelectorTitle}>Select Activity</Text>
        <TouchableOpacity onPress={onClose}>
          <Ionicons name="close" size={24} color="#f0f0f0" />
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll} contentContainerStyle={styles.catScrollContent}>
        {cats.map(c => (
          <TouchableOpacity
            key={c}
            style={[styles.catChip, catFilter === c && styles.catChipActive]}
            onPress={() => setCatFilter(c)}
          >
            <Text style={[styles.catChipText, catFilter === c && styles.catChipTextActive]}>
              {c === 'All' ? 'All' : c.charAt(0).toUpperCase() + c.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <FlatList
        data={filtered}
        keyExtractor={s => s.id}
        numColumns={3}
        contentContainerStyle={styles.sportGrid}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.sportTile} onPress={() => onSelect(item)}>
            <View style={[styles.sportIconWrap, { backgroundColor: item.category === 'strength' ? '#1a1a1a' : item.category === 'cardio' ? '#1a1a1a' : item.category === 'combat' ? '#1a1a1a' : item.category === 'sport' ? '#1a1a1a' : '#1a1a1a' }]}>
              <Ionicons name={item.icon as any} size={28} color="#f0f0f0" />
            </View>
            <Text style={styles.sportTileLabel}>{item.label}</Text>
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
        <Ionicons name="checkmark-circle" size={64} color="#27ae60" />
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
          <View style={styles.muscleTagsRow}>
            {muscles.map(m => (
              <View key={m} style={[styles.muscleTag, { backgroundColor: (MUSCLE_COLORS[m] ?? '#e0e0e0') + '33', borderColor: MUSCLE_COLORS[m] ?? '#e0e0e0' }]}>
                <View style={[styles.muscleDot, { backgroundColor: MUSCLE_COLORS[m] ?? '#e0e0e0' }]} />
                <Text style={[styles.muscleTagText, { color: MUSCLE_COLORS[m] ?? '#e0e0e0' }]}>
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
          <Ionicons name="analytics-outline" size={16} color="#e0e0e0" />
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
                <ActivityIndicator size="small" color="#888888" />
              ) : (
                <Text style={styles.autopsyRetryText}>Tap to retry</Text>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <ActivityIndicator size="small" color="#888888" style={{ marginTop: 8 }} />
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

const FeedCard = ({ item, onPress }: { item: FeedItem; onPress: () => void }) => {
  if (item.kind === 'manual') {
    const a = item.data;
    const muscles = a.muscle_groups ?? (a.exercise_data ? uniqueMuscles(a.exercise_data as any) : []);
    return (
      <TouchableOpacity style={styles.feedCard} onPress={onPress} activeOpacity={0.8}>
        <View style={styles.feedCardTop}>
          <View style={styles.feedIconWrap}>
            <Ionicons name={CATEGORY_ICONS[a.sport_category ?? 'other'] as any} size={22} color="#f0f0f0" />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.feedCardTitleRow}>
              <Text style={styles.feedCardTitle} numberOfLines={1}>{a.activity_type}</Text>
              <View style={styles.sourceBadge}><Text style={styles.sourceBadgeText}>manual</Text></View>
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
          {a.calories_burned != null && (
            <View style={styles.feedStatItem}>
              <Ionicons name="flame-outline" size={12} color="#FF6B35" />
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
              <View key={m} style={[styles.feedMuscleDot, { backgroundColor: MUSCLE_COLORS[m] ?? '#e0e0e0' }]} />
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
          <View style={[styles.feedIconWrap, { backgroundColor: '#1a1a1a' }]}>
            <Ionicons name="barbell-outline" size={22} color="#f0f0f0" />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.feedCardTitleRow}>
              <Text style={styles.feedCardTitle} numberOfLines={1}>{h.title}</Text>
              <View style={[styles.sourceBadge, { backgroundColor: '#1a1a1a', borderColor: '#1a1a1a' }]}>
                <Text style={[styles.sourceBadgeText, { color: '#888888' }]}>Hevy</Text>
              </View>
            </View>
            <Text style={styles.feedCardMeta}>{fmtDate(h.started_at)} · {h.duration_seconds ? formatDuration(Math.round(h.duration_seconds / 60)) : '—'}</Text>
          </View>
        </View>
        <View style={styles.feedCardStats}>
          {h.volume_kg != null && (
            <View style={styles.feedStatItem}>
              <Ionicons name="trending-up-outline" size={12} color="#888888" />
              <Text style={styles.feedStatText}>{Math.round(h.volume_kg)} kg vol.</Text>
            </View>
          )}
          <View style={styles.feedStatItem}>
            <Ionicons name="barbell-outline" size={12} color="#888888" />
            <Text style={styles.feedStatText}>{h.exercises?.length ?? 0} exercises</Text>
          </View>
        </View>
        {h.autopsy_text && <Text style={styles.feedAutopsy} numberOfLines={2}>{h.autopsy_text}</Text>}
      </TouchableOpacity>
    );
  }

  // strava
  const s = item.data;
  const dist = s.distance_meters ? `${(s.distance_meters / 1000).toFixed(1)} km` : null;
  return (
    <TouchableOpacity style={styles.feedCard} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.feedCardTop}>
        <View style={[styles.feedIconWrap, { backgroundColor: '#111111' }]}>
          <Ionicons name="bicycle-outline" size={22} color="#FC4C02" />
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.feedCardTitleRow}>
            <Text style={styles.feedCardTitle} numberOfLines={1}>{s.name}</Text>
            <View style={[styles.sourceBadge, { backgroundColor: '#111111', borderColor: '#FC4C02' }]}>
              <Text style={[styles.sourceBadgeText, { color: '#FC4C02' }]}>Strava</Text>
            </View>
          </View>
          <Text style={styles.feedCardMeta}>{fmtDate(s.start_date)} · {formatDuration(Math.round(s.elapsed_time_seconds / 60))}</Text>
        </View>
      </View>
      <View style={styles.feedCardStats}>
        {dist && <View style={styles.feedStatItem}><Ionicons name="map-outline" size={12} color="#FC4C02" /><Text style={styles.feedStatText}>{dist}</Text></View>}
        {s.pace_per_km_str && <View style={styles.feedStatItem}><Ionicons name="speedometer-outline" size={12} color="#FC4C02" /><Text style={styles.feedStatText}>{s.pace_per_km_str} /km</Text></View>}
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
            <Ionicons name="analytics-outline" size={16} color="#e0e0e0" />
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
      return (
        <>
          <Text style={styles.expandTitle}>{a.activity_type}</Text>
          <Text style={styles.expandMeta}>{fmtDate(a.logged_at)} · {formatDuration(a.duration_minutes)} · {a.intensity}</Text>

          <View style={styles.reviewStatsRow}>
            {a.calories_burned != null && <View style={styles.reviewStat}><Text style={styles.reviewStatVal}>{Math.round(a.calories_burned)}</Text><Text style={styles.reviewStatLabel}>Calories</Text></View>}
            {a.distance_meters != null && <View style={styles.reviewStat}><Text style={styles.reviewStatVal}>{(a.distance_meters / 1000).toFixed(1)}</Text><Text style={styles.reviewStatLabel}>km</Text></View>}
          </View>

          {muscles.length > 0 && (
            <>
              <Text style={styles.expandSectionTitle}>Muscles Worked</Text>
              <View style={styles.muscleTagsRow}>
                {muscles.map(m => (
                  <View key={m} style={[styles.muscleTag, { backgroundColor: (MUSCLE_COLORS[m] ?? '#e0e0e0') + '33', borderColor: MUSCLE_COLORS[m] ?? '#e0e0e0' }]}>
                    <View style={[styles.muscleDot, { backgroundColor: MUSCLE_COLORS[m] ?? '#e0e0e0' }]} />
                    <Text style={[styles.muscleTagText, { color: MUSCLE_COLORS[m] ?? '#e0e0e0' }]}>{MUSCLE_GROUP_LABELS[m] ?? m}</Text>
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
                <Ionicons name="analytics-outline" size={16} color="#e0e0e0" />
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
                <Ionicons name="analytics-outline" size={16} color="#e0e0e0" />
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
            <Ionicons name="chevron-down" size={24} color="#f0f0f0" />
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
  const colorMap = { green: '#27ae60', amber: '#f39c12', red: '#c0392b' };
  const c = colorMap[data.color] ?? '#888888';
  return (
    <View style={styles.readinessCard}>
      <View style={styles.readinessTopRow}>
        <View>
          <Text style={styles.readinessCardTitle}>Readiness to Train</Text>
          <Text style={[styles.readinessLabel, { color: c }]}>{data.label}</Text>
        </View>
        <Text style={[styles.readinessScore, { color: c }]}>{data.score}</Text>
      </View>
      <Text style={styles.readinessExplanation}>{data.explanation}</Text>
      {data.score < 60 && (
        <TouchableOpacity style={styles.restDayBanner} onPress={() => setShowRestModal(true)}>
          <Ionicons name="moon-outline" size={14} color="#e67e22" />
          <Text style={styles.restDayBannerText}>Rest Day Recommended</Text>
        </TouchableOpacity>
      )}
      <Modal visible={showRestModal} transparent animationType="fade" onRequestClose={() => setShowRestModal(false)}>
        <TouchableOpacity style={styles.restModalOverlay} activeOpacity={1} onPress={() => setShowRestModal(false)}>
          <View style={styles.restModalSheet}>
            <Ionicons name="moon-outline" size={32} color="#e67e22" style={{ marginBottom: 12 }} />
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
  const barColor = data.status === 'high' ? '#c0392b' : data.status === 'elevated' ? '#f39c12' : '#27ae60';
  const pctChange = data.percentage_change;
  const acwrColor = data.acwr_status === 'optimal' ? '#27ae60' : data.acwr_status === 'caution' ? '#f39c12' : data.acwr_status === 'high_risk' ? '#c0392b' : '#555555';
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
        <Text style={styles.weeklyLoadNum}>{data.this_week_load}</Text>
        <View style={styles.weeklyLoadChange}>
          <Ionicons
            name={pctChange >= 0 ? 'arrow-up-outline' : 'arrow-down-outline'}
            size={14}
            color={pctChange >= 0 ? '#27ae60' : '#f39c12'}
          />
          <Text style={[styles.weeklyLoadChangePct, { color: pctChange >= 0 ? '#27ae60' : '#f39c12' }]}>
            {Math.abs(pctChange).toFixed(0)}% from last week
          </Text>
        </View>
      </View>

      {/* Progress bar vs 4-week average */}
      <View style={styles.weeklyLoadBarBg}>
        <View style={[styles.weeklyLoadBarFill, { width: `${barPct * 100}%` as any, backgroundColor: barColor }]} />
        {data.status === 'high' && <Ionicons name="warning-outline" size={12} color="#c0392b" style={{ position: 'absolute', right: 4, top: 2 }} />}
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
          <Text style={styles.acwrInsufficient}>Not enough data yet</Text>
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
    if (!entry) return '#1a1a1a';
    const h = entry.total_minutes;
    if (h >= 90) return '#e0e0e0';
    if (h >= 45) return '#e0e0e0';
    if (h >= 20) return '#1a1a1a';
    return '#2a2a2a';
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

// ── Main Screen ────────────────────────────────────────────────────────────────

export default function ActivityScreen() {
  const user = useAuthStore(s => s.user);
  const insets = useSafeAreaInsets();

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

  const openLogModal = () => {
    setLogStep('sport');
    setSelectedSport(null);
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

  const handleStrengthComplete = async () => {
    const durationMin = Math.max(1, Math.round(elapsedSeconds / 60));
    const muscles = uniqueMuscles(exercises);
    setLogStep('rpe');
    setSubmitting(true);
    try {
      const payload = {
        activity_type: strengthName.trim() || (selectedSport?.label ?? 'Strength Training'),
        duration_minutes: durationMin,
        intensity: 'Moderate' as IntensityType,
        sport_category: 'strength',
        muscle_groups: muscles,
        exercise_data: exercises.map(ex => ({
          name: ex.name,
          muscleGroup: ex.muscleGroup,
          muscles: ex.muscles,
          sets: ex.sets,
          notes: ex.notes,
        })),
      };
      const result = await logActivity(payload);
      setCompletedActivity(result);
      setPendingRpeActivityId(result.id);
    } catch {
      Alert.alert('Error', 'Failed to save workout. Please try again.');
      setLogStep('strength');
    } finally {
      setSubmitting(false);
    }
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
    if (pendingRpeActivityId) {
      try { await updateActivityRPE(pendingRpeActivityId, rpe); } catch {}
    }
    setLogStep('review');
  };

  const handleRpeSkip = () => setLogStep('review');

  // ── Filtered Feed ─────────────────────────────────────────────────────────────

  const filteredFeed = useMemo(() => {
    if (filter === 'All') return feed;
    if (filter === 'Hevy') return feed.filter(f => f.kind === 'hevy');
    if (filter === 'Strava') return feed.filter(f => f.kind === 'strava');
    if (filter === 'Strength') return feed.filter(f => f.kind === 'manual' && f.data.sport_category === 'strength' || f.kind === 'hevy');
    if (filter === 'Cardio') return feed.filter(f =>
      (f.kind === 'manual' && (f.data.sport_category === 'cardio' || f.data.sport_category === 'other')) ||
      f.kind === 'strava'
    );
    if (filter === 'Sport') return feed.filter(f => f.kind === 'manual' && (f.data.sport_category === 'sport' || f.data.sport_category === 'combat'));
    return feed;
  }, [feed, filter]);

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
      { id: 'sessions', label: 'Weekly Sessions', target: 5, current: thisWeek.length, unit: 'sessions', color: '#e0e0e0' },
      { id: 'hours', label: 'Training Hours', target: 6, current: Math.round(weekMin / 60 * 10) / 10, unit: 'hrs', color: '#27ae60' },
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
    feed.forEach(f => {
      const key = f.kind === 'hevy' ? 'strength' : f.kind === 'strava' ? 'cardio' : (f.data as UserActivity).sport_category ?? 'other';
      counts[key] = (counts[key] ?? 0) + 1;
    });
    const total = Object.values(counts).reduce((s, n) => s + n, 0);
    const colors: Record<string, string> = { strength: '#e0e0e0', cardio: '#27ae60', combat: '#c0392b', sport: '#888888', mindBody: '#888888', other: '#888888' };
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([key, count]) => ({ label: key.charAt(0).toUpperCase() + key.slice(1), pct: total > 0 ? Math.round(count / total * 100) : 0, color: colors[key] ?? '#888888' }));
  }, [feed]);

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
      {/* Title Bar */}
      <View style={styles.titleBar}>
        <Text style={styles.screenTitle}>Activity</Text>
        <TouchableOpacity style={styles.plusBtn} onPress={() => setShowActionMenu(true)} activeOpacity={0.85}>
          <Ionicons name="add" size={24} color="#0a0a0a" />
        </TouchableOpacity>
      </View>

      {readiness && <ReadinessCard data={readiness} onLogRestDay={async () => { try { await logRestDay(); loadData(); } catch {} }} />}

      {/* Steps Card */}
      <View style={styles.stepsCard}>
        <View style={styles.stepsLeft}>
          <Ionicons name="footsteps-outline" size={18} color="#27ae60" />
          <Text style={styles.stepsVal}>{steps.toLocaleString()}</Text>
          <Text style={styles.stepsLabel}>/ 10,000 steps</Text>
        </View>
        <View style={styles.stepsBarBg}>
          <View style={[styles.stepsBarFill, { width: `${Math.min(100, steps / 100)}%` as any }]} />
        </View>
      </View>

      {/* Stats Bar */}
      {stats && (
        <View style={styles.statsBar}>
          {[
            { val: stats.total_workouts, label: 'Workouts' },
            { val: `${stats.total_hours}h`, label: 'Total Hours' },
            { val: `${stats.current_streak}d`, label: 'Streak' },
            { val: `${stats.longest_streak}d`, label: 'Best Streak' },
            { val: weeklySessionCount, label: 'This Week' },
            { val: weeklyHoursFormatted, label: 'Week Hours' },
          ].map((s, i) => (
            <View key={i} style={styles.statItem}>
              <Text style={styles.statVal}>{s.val}</Text>
              <Text style={styles.statLabel}>{s.label}</Text>
            </View>
          ))}
        </View>
      )}

      {weeklyLoad && <WeeklyLoadCard data={weeklyLoad} />}

      {/* Progress Section Toggle */}
      <TouchableOpacity style={styles.progressToggle} onPress={() => setShowProgress(p => !p)}>
        <Text style={styles.progressToggleText}>Progress & Records</Text>
        <Ionicons name={showProgress ? 'chevron-up' : 'chevron-down'} size={18} color="#888888" />
      </TouchableOpacity>

      {showProgress && (
        <View style={styles.progressSection}>
          {/* Sport Breakdown */}
          {sportBreakdown.length > 0 && (
            <View style={styles.progressCard}>
              <Text style={styles.progressCardTitle}>Sport Breakdown</Text>
              {sportBreakdown.map(s => (
                <View key={s.label} style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>{s.label}</Text>
                  <View style={styles.breakdownBarBg}>
                    <View style={[styles.breakdownBarFill, { width: `${s.pct}%` as any, backgroundColor: s.color }]} />
                  </View>
                  <Text style={styles.breakdownPct}>{s.pct}%</Text>
                </View>
              ))}
            </View>
          )}

          {/* Badges */}
          <View style={styles.progressCard}>
            <Text style={styles.progressCardTitle}>Achievements</Text>
            <View style={styles.badgesGrid}>
              {badges.map(b => (
                <View key={b.id} style={[styles.badgeTile, !b.unlocked && styles.badgeLocked]}>
                  <Ionicons name={b.icon as any} size={24} color={b.unlocked ? '#888888' : '#2a2a2a'} />
                  <Text style={[styles.badgeLabel, !b.unlocked && styles.badgeLabelLocked]}>{b.label}</Text>
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
                  {done && <Ionicons name="checkmark-circle" size={16} color="#27ae60" />}
                </View>
              </View>
              <View style={styles.goalBarBg}>
                <View style={[styles.goalBarFill, { width: `${pct}%` as any, backgroundColor: done ? '#27ae60' : g.color }]} />
              </View>
            </View>
          );
        })}
      </View>

      {/* Journal header + filter */}
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
            color="#555"
          />
        </View>
      </TouchableOpacity>

      {journalExpanded && (
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
      )}
    </>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator style={{ flex: 1 }} color="#e0e0e0" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <FlatList
        data={journalExpanded ? filteredFeed : []}
        keyExtractor={(item, i) => `${item.kind}-${i}`}
        renderItem={({ item }) => (
          <FeedCard item={item} onPress={() => setExpandedItem(item)} />
        )}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={
          journalExpanded ? (
            <View style={styles.emptyState}>
              <Ionicons name="barbell-outline" size={40} color="#2a2a2a" />
              <Text style={styles.emptyText}>No activities yet</Text>
              <Text style={styles.emptySubText}>Tap Log to record your first session</Text>
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
              { icon: 'football-outline', label: 'Log Sport Session', onPress: () => { setShowActionMenu(false); openLogModal(); } },
              { icon: 'moon-outline', label: 'Log Rest Day', onPress: async () => { setShowActionMenu(false); try { await logRestDay(); loadData(); } catch { Alert.alert('Error', 'Could not log rest day.'); } } },
            ] as Array<{ icon: string; label: string; onPress: () => void }>).map((item, idx, arr) => (
              <TouchableOpacity
                key={idx}
                style={[styles.menuItem, idx === arr.length - 1 && { borderBottomWidth: 0 }]}
                onPress={item.onPress}
                activeOpacity={0.75}
              >
                <View style={styles.menuIconWrap}>
                  <Ionicons name={item.icon as any} size={20} color="#f0f0f0" />
                </View>
                <Text style={styles.menuItemText}>{item.label}</Text>
                <Ionicons name="chevron-forward" size={14} color="#555555" />
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Log Activity Modal */}
      <Modal visible={showLogModal} animationType="slide" presentationStyle="fullScreen" onRequestClose={closeLogModal}>
        <View style={styles.logModalContainer}>
          {logStep === 'sport' && (
            <SportSelector onSelect={handleSportSelect} onClose={closeLogModal} />
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
                <ActivityIndicator size="large" color="#e0e0e0" />
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
                <ActivityIndicator size="large" color="#e0e0e0" />
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
    </SafeAreaView>
  );
}

// ── Chart Config ──────────────────────────────────────────────────────────────

const chartConfig = {
  backgroundColor: '#111111',
  backgroundGradientFrom: '#111111',
  backgroundGradientTo: '#111111',
  decimalPlaces: 1,
  color: (opacity = 1) => `rgba(224,224,224,${opacity})`,
  labelColor: () => '#555555',
  style: { borderRadius: 8 },
  propsForBackgroundLines: { stroke: '#1a1a1a' },
  barPercentage: 0.6,
};

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  listContent: { paddingBottom: 100 },

  // Title bar
  titleBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  screenTitle: { fontSize: 26, fontWeight: '700', color: '#f0f0f0' },
  addFab: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#e0e0e0', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  addFabText: { color: '#f0f0f0', fontWeight: '600', fontSize: 14 },

  // Steps
  stepsCard: { marginHorizontal: 16, marginBottom: 12, backgroundColor: '#111111', borderRadius: 12, padding: 14 },
  stepsLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  stepsVal: { fontSize: 18, fontWeight: '700', color: '#f0f0f0' },
  stepsLabel: { fontSize: 13, color: '#555555' },
  stepsBarBg: { height: 6, backgroundColor: '#1a1a1a', borderRadius: 3 },
  stepsBarFill: { height: 6, backgroundColor: '#27ae60', borderRadius: 3 },

  // Stats bar
  statsBar: { flexDirection: 'row', marginHorizontal: 16, marginBottom: 12, backgroundColor: '#111111', borderRadius: 12, padding: 14 },
  statItem: { flex: 1, alignItems: 'center' },
  statVal: { fontSize: 17, fontWeight: '700', color: '#f0f0f0' },
  statLabel: { fontSize: 10, color: '#555555', marginTop: 2, textAlign: 'center' },

  // Progress toggle
  progressToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 16, marginBottom: 8, paddingVertical: 10 },
  progressToggleText: { fontSize: 16, fontWeight: '600', color: '#f0f0f0' },
  progressSection: { marginBottom: 4 },
  progressCard: { marginHorizontal: 16, marginBottom: 12, backgroundColor: '#111111', borderRadius: 12, padding: 14 },
  progressCardTitle: { fontSize: 13, fontWeight: '600', color: '#888888', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  barChart: { borderRadius: 8, marginLeft: -8 },

  // Heatmap legend
  heatmapLegend: { flexDirection: 'row', gap: 12, marginTop: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 10, height: 10, borderRadius: 2 },
  legendText: { fontSize: 10, color: '#555555' },

  // Breakdown
  breakdownRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  breakdownLabel: { width: 70, fontSize: 12, color: '#888888' },
  breakdownBarBg: { flex: 1, height: 8, backgroundColor: '#1a1a1a', borderRadius: 4 },
  breakdownBarFill: { height: 8, borderRadius: 4 },
  breakdownPct: { width: 36, fontSize: 11, color: '#888888', textAlign: 'right' },

  // Badges
  badgesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  badgeTile: { width: (SCREEN_W - 80) / 4, alignItems: 'center', backgroundColor: '#1a1a1a', borderRadius: 10, padding: 10, gap: 4 },
  badgeLocked: { opacity: 0.35 },
  badgeLabel: { fontSize: 9, color: '#888888', textAlign: 'center' },
  badgeLabelLocked: { color: '#555555' },

  // Goals
  goalsCard: { marginHorizontal: 16, marginBottom: 12, backgroundColor: '#111111', borderRadius: 12, padding: 14 },
  goalsTitle: { fontSize: 13, fontWeight: '600', color: '#888888', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  goalRow: { marginBottom: 12 },
  goalLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  goalLabel: { fontSize: 13, color: '#888888' },
  goalRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  goalProgress: { fontSize: 12, color: '#888888' },
  goalBarBg: { height: 6, backgroundColor: '#1a1a1a', borderRadius: 3 },
  goalBarFill: { height: 6, borderRadius: 3 },

  // Journal
  journalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 8 },
  journalTitle: { fontSize: 16, fontWeight: '600', color: '#f0f0f0' },
  journalCount: { fontSize: 12, color: '#555555' },
  filterScroll: { marginBottom: 8 },
  filterContent: { paddingHorizontal: 16, gap: 8 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16, backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: 'transparent' },
  filterChipActive: { backgroundColor: '#e0e0e0' + '22', borderColor: '#e0e0e0' },
  filterChipText: { fontSize: 13, color: '#888888' },
  filterChipTextActive: { color: '#e0e0e0', fontWeight: '600' },

  // Feed card
  feedCard: { marginHorizontal: 16, marginBottom: 10, backgroundColor: '#111111', borderRadius: 14, padding: 14 },
  feedCardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  feedIconWrap: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center' },
  feedCardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  feedCardTitle: { fontSize: 15, fontWeight: '600', color: '#f0f0f0', flex: 1 },
  sourceBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2a2a2a' },
  sourceBadgeText: { fontSize: 10, color: '#888888' },
  feedCardMeta: { fontSize: 12, color: '#555555', marginTop: 2 },
  feedCardStats: { flexDirection: 'row', gap: 12, alignItems: 'center', marginBottom: 6 },
  intensityBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  intensityBadgeText: { fontSize: 11, fontWeight: '600' },
  feedStatItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  feedStatText: { fontSize: 12, color: '#888888' },
  feedAutopsy: { fontSize: 12, color: '#888888', lineHeight: 17, marginBottom: 6 },
  feedMuscleRow: { flexDirection: 'row', gap: 5 },
  feedMuscleDot: { width: 8, height: 8, borderRadius: 4 },

  // Empty state
  emptyState: { alignItems: 'center', paddingVertical: 60, gap: 8 },
  emptyText: { fontSize: 16, fontWeight: '600', color: '#555555' },
  emptySubText: { fontSize: 13, color: '#555555' },

  // Log modal
  logModalContainer: { flex: 1, backgroundColor: '#0a0a0a' },

  // Sport selector
  sportSelectorHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16 },
  sportSelectorTitle: { fontSize: 20, fontWeight: '700', color: '#f0f0f0' },
  sportGrid: { paddingHorizontal: 12, paddingBottom: 40, gap: 8 },
  sportTile: { flex: 1, margin: 4, alignItems: 'center', gap: 8, paddingVertical: 16 },
  sportIconWrap: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  sportTileLabel: { fontSize: 11, color: '#888888', textAlign: 'center' },

  // Category scroll
  catScroll: { maxHeight: 44, flexGrow: 0, marginBottom: 8 },
  catScrollContent: { paddingHorizontal: 16, gap: 8, alignItems: 'center' },
  catChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16, backgroundColor: '#1a1a1a' },
  catChipActive: { backgroundColor: '#e0e0e0' },
  catChipText: { fontSize: 12, color: '#888888' },
  catChipTextActive: { color: '#f0f0f0', fontWeight: '600' },

  // Strength builder
  strengthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  elapsedTimer: { fontSize: 22, fontWeight: '700', color: '#f0f0f0' },
  elapsedLabel: { fontSize: 11, color: '#555555', textAlign: 'center' },
  completeBtn: { backgroundColor: '#27ae60', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  completeBtnText: { color: '#f0f0f0', fontWeight: '700', fontSize: 14 },
  strengthScrollContent: { paddingHorizontal: 16, paddingBottom: 20 },
  workoutNameInput: { marginHorizontal: 16, marginVertical: 10, backgroundColor: '#111111', borderRadius: 10, padding: 12, fontSize: 15, fontWeight: '600', color: '#f0f0f0', borderWidth: 1, borderColor: '#1a1a1a' },

  // Exercise card
  exerciseCard: { backgroundColor: '#111111', borderRadius: 12, padding: 12, marginBottom: 12 },
  exerciseCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  exerciseCardName: { flex: 1, fontSize: 15, fontWeight: '600', color: '#f0f0f0' },
  exDot: { width: 10, height: 10, borderRadius: 5 },

  // Set headers
  setHeaderRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 2, marginBottom: 4 },
  setHeaderNum: { width: 22, fontSize: 10, color: '#555555', textAlign: 'center' },
  setHeaderType: { width: 32, fontSize: 10, color: '#555555', textAlign: 'center' },
  setHeaderInput: { flex: 1, fontSize: 10, color: '#555555', textAlign: 'center' },
  setHeaderRPE: { width: 36, fontSize: 10, color: '#555555', textAlign: 'center' },
  setHeaderCheck: { width: 28, fontSize: 10, color: '#555555', textAlign: 'center' },

  // Set row
  setRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, gap: 4 },
  setRowCompleted: { opacity: 0.6 },
  setNum: { width: 22, fontSize: 12, color: '#555555', textAlign: 'center' },
  setTypePill: { width: 30, height: 24, borderRadius: 6, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  setTypeText: { fontSize: 11, fontWeight: '700' },
  setInput: { flex: 1, height: 34, backgroundColor: '#0a0a0a', borderRadius: 6, textAlign: 'center', color: '#f0f0f0', fontSize: 13, borderWidth: 1, borderColor: '#222222' },
  setInputRPE: { width: 36, flex: 0 },
  setCheckBtn: { width: 28, alignItems: 'center' },

  addSetBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, justifyContent: 'center' },
  addSetText: { fontSize: 13, color: '#e0e0e0', fontWeight: '600' },
  exNotesInput: { marginTop: 4, backgroundColor: '#0a0a0a', borderRadius: 8, padding: 8, fontSize: 12, color: '#888888', borderWidth: 1, borderColor: '#1a1a1a' },

  addExerciseBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#111111', borderRadius: 12, padding: 14, justifyContent: 'center', borderWidth: 1, borderColor: '#e0e0e0' + '44' },
  addExerciseText: { fontSize: 14, color: '#e0e0e0', fontWeight: '600' },

  // Rest timer
  restTimerBanner: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#1a1a1a', paddingVertical: 14, paddingHorizontal: 20, borderTopWidth: 1, borderTopColor: '#2a2a2a', alignItems: 'center', gap: 4 },
  restTimerLabel: { fontSize: 11, color: '#888888', textTransform: 'uppercase', letterSpacing: 1 },
  restTimerCount: { fontSize: 32, fontWeight: '700', color: '#e0e0e0' },
  restTimerRow: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  restAdjBtn: { paddingHorizontal: 14, paddingVertical: 7, backgroundColor: '#111111', borderRadius: 8 },
  restAdjText: { fontSize: 13, color: '#888888' },
  restSkipBtn: { paddingHorizontal: 24, paddingVertical: 8, backgroundColor: '#e0e0e0', borderRadius: 20 },
  restSkipText: { fontSize: 13, fontWeight: '600', color: '#f0f0f0' },

  // Exercise search
  exSearchContainer: { flex: 1, backgroundColor: '#0a0a0a' },
  exSearchHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16 },
  exSearchTitle: { fontSize: 20, fontWeight: '700', color: '#f0f0f0' },
  exSearchInputWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 8, backgroundColor: '#111111', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  exSearchInput: { flex: 1, fontSize: 14, color: '#f0f0f0' },
  exRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#111111', gap: 10 },
  exRowInfo: { flex: 1 },
  exRowName: { fontSize: 14, fontWeight: '600', color: '#f0f0f0' },
  exRowGroup: { fontSize: 12, color: '#555555', marginTop: 1 },

  // Cardio form
  cardioHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  cardioSportTag: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardioSportLabel: { fontSize: 15, fontWeight: '600', color: '#f0f0f0' },
  cardioScrollContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 },
  cardioRow: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  cardioField: { flex: 1 },
  cardioFieldLabel: { fontSize: 12, color: '#888888', marginBottom: 6 },
  cardioInputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111111', borderRadius: 10, borderWidth: 1, borderColor: '#1a1a1a', paddingHorizontal: 12 },
  cardioInput: { flex: 1, paddingVertical: 12, fontSize: 16, color: '#f0f0f0' },
  cardioUnit: { fontSize: 13, color: '#555555' },
  sectionLabel: { fontSize: 12, color: '#888888', marginBottom: 8, marginTop: 4 },
  intensityRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  intensityPill: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: '#111111', alignItems: 'center', borderWidth: 1, borderColor: '#1a1a1a' },
  intensityPillText: { fontSize: 12, fontWeight: '600', color: '#888888' },
  calsPreviewCard: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#111111', borderRadius: 10, padding: 12, marginBottom: 16 },
  calsPreviewText: { fontSize: 14, color: '#FF6B35', fontWeight: '600' },
  notesInput: { backgroundColor: '#111111', borderRadius: 10, padding: 12, fontSize: 13, color: '#888888', borderWidth: 1, borderColor: '#1a1a1a', minHeight: 80, textAlignVertical: 'top', marginBottom: 20 },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#e0e0e0', paddingVertical: 14, borderRadius: 12 },
  submitBtnText: { fontSize: 15, fontWeight: '700', color: '#f0f0f0' },

  // Post session / review
  reviewScroll: { padding: 24, paddingTop: 80, alignItems: 'center' },
  reviewCheckCircle: { marginBottom: 12 },
  reviewTitle: { fontSize: 22, fontWeight: '700', color: '#f0f0f0', marginBottom: 4 },
  reviewSubtitle: { fontSize: 14, color: '#888888', marginBottom: 20 },
  reviewStatsRow: { flexDirection: 'row', gap: 12, marginBottom: 20, flexWrap: 'wrap', justifyContent: 'center' },
  reviewStat: { backgroundColor: '#111111', borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12, alignItems: 'center', minWidth: 80 },
  reviewStatVal: { fontSize: 20, fontWeight: '700', color: '#f0f0f0' },
  reviewStatLabel: { fontSize: 11, color: '#555555', marginTop: 2 },
  reviewSection: { width: '100%', marginBottom: 16 },
  reviewSectionTitle: { fontSize: 12, color: '#888888', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  muscleTagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  muscleTag: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  muscleDot: { width: 7, height: 7, borderRadius: 3.5 },
  muscleTagText: { fontSize: 12, fontWeight: '600' },
  stravaMapWrap: { width: '100%', height: 220, borderRadius: 16, overflow: 'hidden', marginBottom: 16, borderWidth: 1, borderColor: '#2a2a2a' },
  stravaMap: { width: '100%', height: '100%' },
  generateAutopsyBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, paddingVertical: 14, paddingHorizontal: 20, borderRadius: 12, borderWidth: 1, borderColor: '#FC4C02', backgroundColor: 'rgba(252,76,2,0.08)', justifyContent: 'center' },
  generateAutopsyText: { fontSize: 14, fontWeight: '600', color: '#FC4C02' },
  autopsyCard: { width: '100%', backgroundColor: '#1a1a1a', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#2a2a2a' },
  autopsyHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  autopsyTitle: { fontSize: 12, fontWeight: '700', color: '#e0e0e0', textTransform: 'uppercase', letterSpacing: 0.5 },
  autopsyText: { fontSize: 13, color: '#888888', lineHeight: 20 },
  autopsyGenerating: { fontSize: 13, color: '#555555', marginTop: 8, textAlign: 'center' },
  doneBtn: { marginTop: 24, backgroundColor: '#e0e0e0', paddingHorizontal: 48, paddingVertical: 14, borderRadius: 12, width: '100%', alignItems: 'center' },
  doneBtnText: { fontSize: 16, fontWeight: '700', color: '#f0f0f0' },
  reviewLoading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  reviewLoadingText: { fontSize: 14, color: '#888888' },

  // Autopsy retry
  autopsyRetryBtn: { marginTop: 10, paddingVertical: 8, paddingHorizontal: 16, backgroundColor: '#2a2a2a', borderRadius: 8, alignSelf: 'flex-start' },
  autopsyRetryText: { fontSize: 13, color: '#e0e0e0', fontWeight: '600' },

  // Plus button (matches Nutrition page)
  plusBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#f0f0f0', alignItems: 'center', justifyContent: 'center' },

  // Action menu
  menuOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  menuSheet: { backgroundColor: '#1a1a1a', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 12, paddingHorizontal: 20, paddingBottom: 40, borderWidth: 1, borderColor: '#2a2a2a' },
  menuHandle: { width: 40, height: 4, backgroundColor: '#2a2a2a', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#2a2a2a' },
  menuIconWrap: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#2a2a2a', alignItems: 'center', justifyContent: 'center' },
  menuItemText: { flex: 1, fontSize: 16, color: '#f0f0f0', fontWeight: '500' },

  // Expanded modal
  expandContainer: { flex: 1, backgroundColor: '#0a0a0a' },
  expandHeader: { paddingHorizontal: 20, paddingVertical: 12 },
  expandScroll: { padding: 20 },
  expandTitle: { fontSize: 22, fontWeight: '700', color: '#f0f0f0', marginBottom: 4 },
  expandMeta: { fontSize: 13, color: '#888888', marginBottom: 4 },
  expandSectionTitle: { fontSize: 12, color: '#888888', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 16, marginBottom: 8 },
  expandExRow: { backgroundColor: '#111111', borderRadius: 10, padding: 10, marginBottom: 8 },
  expandExName: { fontSize: 13, fontWeight: '600', color: '#f0f0f0', marginBottom: 4 },
  expandSetText: { fontSize: 12, color: '#888888', marginBottom: 2 },
  expandNotes: { fontSize: 13, color: '#888888', fontStyle: 'italic', marginTop: 16 },

  // RPE Prompt
  rpeContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 20 },
  rpeQuestion: { fontSize: 24, fontWeight: '700', color: '#f0f0f0', textAlign: 'center' },
  rpeSubtitle: { fontSize: 14, color: '#888888', textAlign: 'center', marginTop: -12 },
  rpeCirclesRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  rpeCircle: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: '#2a2a2a', backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center' },
  rpeCircleNum: { fontSize: 15, fontWeight: '700', color: '#e0e0e0' },
  rpeLabelPill: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  rpeLabelText: { fontSize: 13, fontWeight: '600' },
  rpeSubmitBtn: { backgroundColor: '#f0f0f0', paddingHorizontal: 48, paddingVertical: 14, borderRadius: 12, width: '100%', alignItems: 'center' },
  rpeSubmitText: { fontSize: 16, fontWeight: '700', color: '#0a0a0a' },
  rpeSkipBtn: { paddingVertical: 10 },
  rpeSkipText: { fontSize: 14, color: '#555555' },

  // Load badge (feed card)
  loadBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  loadBadgeText: { fontSize: 11, fontWeight: '600' },

  // Readiness card
  readinessCard: { marginHorizontal: 16, marginBottom: 12, backgroundColor: '#1a1a1a', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#2a2a2a' },
  readinessTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  readinessCardTitle: { fontSize: 11, fontWeight: '600', color: '#888888', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  readinessLabel: { fontSize: 14, fontWeight: '700' },
  readinessScore: { fontSize: 48, fontWeight: '800', lineHeight: 52 },
  readinessExplanation: { fontSize: 13, color: '#888888', lineHeight: 19 },
  restDayBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, backgroundColor: '#e67e2222', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, alignSelf: 'flex-start', borderWidth: 1, borderColor: '#e67e22' },
  restDayBannerText: { fontSize: 12, fontWeight: '600', color: '#e67e22' },
  restModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 32 },
  restModalSheet: { backgroundColor: '#1a1a1a', borderRadius: 20, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: '#2a2a2a', width: '100%' },
  restModalTitle: { fontSize: 18, fontWeight: '700', color: '#f0f0f0', marginBottom: 12, textAlign: 'center' },
  restModalBody: { fontSize: 14, color: '#888888', lineHeight: 21, textAlign: 'center', marginBottom: 20 },
  restModalDismiss: { backgroundColor: '#2a2a2a', paddingHorizontal: 32, paddingVertical: 12, borderRadius: 10 },
  restModalDismissText: { fontSize: 14, fontWeight: '600', color: '#f0f0f0' },

  // Weekly load card
  weeklyLoadCard: { marginHorizontal: 16, marginBottom: 12, backgroundColor: '#1a1a1a', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#2a2a2a' },
  weeklyLoadTitle: { fontSize: 11, fontWeight: '600', color: '#888888', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  weeklyLoadTopRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, marginBottom: 12 },
  weeklyLoadNum: { fontSize: 42, fontWeight: '800', color: '#f0f0f0', lineHeight: 46 },
  weeklyLoadChange: { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 6 },
  weeklyLoadChangePct: { fontSize: 12, fontWeight: '600' },
  weeklyLoadBarBg: { height: 8, backgroundColor: '#2a2a2a', borderRadius: 4, marginBottom: 4, overflow: 'hidden' },
  weeklyLoadBarFill: { height: 8, borderRadius: 4 },
  weeklyLoadAvgLabel: { fontSize: 11, color: '#555555', marginBottom: 12 },
  acwrRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  acwrLabel: { fontSize: 12, color: '#888888', fontWeight: '600' },
  acwrValue: { fontSize: 18, fontWeight: '800' },
  acwrStatusPill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, borderWidth: 1 },
  acwrStatusText: { fontSize: 11, fontWeight: '600' },
  acwrInsufficient: { fontSize: 12, color: '#555555' },
  acwrExplanation: { fontSize: 12, color: '#555555', lineHeight: 17 },
});
