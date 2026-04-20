/**
 * WarmUpModal — full-screen warm-up flow.
 *
 * Flow:
 *   1. Setup screen: user picks session type + muscle groups (or auto-populated
 *      from the workout being logged), plus readiness is read from the last
 *      wellness check-in.
 *   2. Generating state: animated dots while Claude processes the request.
 *   3. Warm-up screen: phases listed with checkable exercises, summary context,
 *      duration badge, and "Start Workout" / "Regenerate" / "Skip" actions.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Animated,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  generateWarmUp,
  WarmUpProtocol,
  WarmUpExercise,
  WarmUpRequest,
} from '@/services/api';
import { useTheme } from '@/contexts/ThemeContext';
import { ThemeColors, type as TY, radius as R, space as SP } from '@/services/theme';

// ── Phase colors (monochrome hierarchy for phases, accent for activation) ──

function phaseColorFor(phase: string, t: ThemeColors): string {
  switch (phase) {
    case 'General Cardio': return t.text.muted;
    case 'Mobility':       return t.text.secondary;
    case 'Activation':     return t.accent;
    case 'Ramp-Up Sets':   return t.text.body;
    default:               return t.text.secondary;
  }
}

const MUSCLE_OPTIONS = [
  'quads', 'hamstrings', 'glutes', 'calves',
  'chest', 'shoulders', 'triceps',
  'back', 'lats', 'biceps',
  'core', 'traps', 'rear delts',
];

const SESSION_TYPES = [
  'Strength — Lower Body',
  'Strength — Upper Body (Push)',
  'Strength — Upper Body (Pull)',
  'Strength — Full Body',
  'Cardio / Running',
  'HIIT',
  'Sport / Combat',
  'Mobility / Recovery',
];

// ── Animated dots loader ──────────────────────────────────────────────────────

function LoadingDots({ color }: { color: string }) {
  const dots = [useRef(new Animated.Value(0)).current,
                useRef(new Animated.Value(0)).current,
                useRef(new Animated.Value(0)).current];

  useEffect(() => {
    const animations = dots.map((dot, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 150),
          Animated.timing(dot, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 300, useNativeDriver: true }),
          Animated.delay((dots.length - i - 1) * 150),
        ])
      )
    );
    Animated.parallel(animations).start();
    return () => animations.forEach(a => a.stop());
  }, []);

  return (
    <View style={{ flexDirection: 'row', gap: 6, justifyContent: 'center', marginTop: 12 }}>
      {dots.map((dot, i) => (
        <Animated.View
          key={i}
          style={{
            width: 8, height: 8, borderRadius: 4,
            backgroundColor: color,
            opacity: dot,
            transform: [{ scale: dot.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.2] }) }],
          }}
        />
      ))}
    </View>
  );
}

// ── Exercise row (checkable) ──────────────────────────────────────────────────

function ExerciseRow({
  exercise,
  checked,
  onToggle,
  phaseColor,
  t,
}: {
  exercise: WarmUpExercise;
  checked: boolean;
  onToggle: () => void;
  phaseColor: string;
  t: ThemeColors;
}) {
  return (
    <TouchableOpacity
      style={[
        {
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: 12,
          paddingVertical: 12,
          borderTopWidth: 1,
          borderTopColor: t.border,
          opacity: checked ? 0.45 : 1,
        },
      ]}
      onPress={onToggle}
      activeOpacity={0.75}
    >
      {/* Checkbox */}
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: R.pill,
          borderWidth: 2,
          borderColor: checked ? phaseColor : t.border,
          backgroundColor: checked ? phaseColor : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: 1,
        }}
      >
        {checked && <Ionicons name="checkmark" size={13} color={t.accentInk} />}
      </View>

      {/* Text block */}
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          style={{
            fontFamily: TY.sans.medium,
            fontSize: TY.size.body + 1,
            color: t.text.primary,
            textDecorationLine: checked ? 'line-through' : 'none',
          }}
        >
          {exercise.name}
        </Text>
        <Text style={{ fontFamily: TY.sans.regular, fontSize: TY.size.small + 1, color: t.text.secondary }}>
          {exercise.detail}
        </Text>
        {exercise.note ? (
          <Text style={{ fontFamily: TY.sans.regular, fontSize: TY.size.small, color: t.text.muted, fontStyle: 'italic', marginTop: 1 }}>
            {exercise.note}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

// ── Setup screen ──────────────────────────────────────────────────────────────

function SetupScreen({
  selectedSession,
  setSelectedSession,
  selectedMuscles,
  toggleMuscle,
  onGenerate,
  onSkip,
  t,
}: {
  selectedSession: string;
  setSelectedSession: (s: string) => void;
  selectedMuscles: string[];
  toggleMuscle: (m: string) => void;
  onGenerate: () => void;
  onSkip: () => void;
  t: ThemeColors;
}) {
  const s = setupStyles(t);
  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <View style={s.handle} />
      <Text style={s.title}>Today's Warm-Up</Text>
      <Text style={s.subtitle}>Tell us about your session and we'll build a personalised warm-up.</Text>

      <Text style={s.fieldLabel}>SESSION TYPE</Text>
      {SESSION_TYPES.map((type) => (
        <TouchableOpacity
          key={type}
          style={[s.optionRow, selectedSession === type && s.optionRowSelected]}
          onPress={() => setSelectedSession(type)}
          activeOpacity={0.75}
        >
          {selectedSession === type && (
            <Ionicons name="checkmark-circle" size={18} color={t.text.primary} />
          )}
          <Text style={[s.optionText, selectedSession === type && s.optionTextSelected]}>
            {type}
          </Text>
        </TouchableOpacity>
      ))}

      <Text style={[s.fieldLabel, { marginTop: 24 }]}>MUSCLE GROUPS (tap to select)</Text>
      <View style={s.muscleGrid}>
        {MUSCLE_OPTIONS.map((m) => {
          const selected = selectedMuscles.includes(m);
          return (
            <TouchableOpacity
              key={m}
              style={[s.muscleTag, selected && s.muscleTagSelected]}
              onPress={() => toggleMuscle(m)}
              activeOpacity={0.75}
            >
              <Text style={[s.muscleTagText, selected && s.muscleTagTextSelected]}>
                {m}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity
        style={[s.generateBtn, (!selectedSession || selectedMuscles.length === 0) && s.btnDisabled]}
        onPress={onGenerate}
        disabled={!selectedSession || selectedMuscles.length === 0}
        activeOpacity={0.85}
      >
        <Ionicons name="flash" size={18} color={t.accentInk} />
        <Text style={s.generateBtnText}>Build My Warm-Up</Text>
      </TouchableOpacity>

      <TouchableOpacity style={s.skipBtn} onPress={onSkip} activeOpacity={0.7}>
        <Text style={s.skipText}>Skip warm-up</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Pre-populate muscle groups from the activity being logged */
  prefillMuscles?: string[];
  /** Pre-populate session type from the activity being logged */
  prefillSessionType?: string;
  /** Soreness from today's wellness check-in */
  soreness?: number;
  /** Energy from today's wellness check-in */
  energy?: number;
  /** Sleep score (0–100) from health snapshot or WHOOP/Oura */
  sleepScore?: number;
}

type Screen = 'setup' | 'loading' | 'result';

export default function WarmUpModal({
  visible,
  onClose,
  prefillMuscles = [],
  prefillSessionType = '',
  soreness,
  energy,
  sleepScore,
}: Props) {
  const { theme: t } = useTheme();
  const s = mainStyles(t);

  const [screen, setScreen] = useState<Screen>('setup');
  const [selectedSession, setSelectedSession] = useState(prefillSessionType);
  const [selectedMuscles, setSelectedMuscles] = useState<string[]>(prefillMuscles);
  const [protocol, setProtocol] = useState<WarmUpProtocol | null>(null);
  // Track which exercises have been checked off
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  // Sync prefilled values when modal opens
  useEffect(() => {
    if (visible) {
      setSelectedSession(prefillSessionType);
      setSelectedMuscles(prefillMuscles.length > 0 ? prefillMuscles : []);
      setScreen('setup');
      setProtocol(null);
      setChecked({});
    }
  }, [visible]);

  const toggleMuscle = useCallback((m: string) => {
    setSelectedMuscles((prev) =>
      prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]
    );
  }, []);

  const handleGenerate = useCallback(async () => {
    setScreen('loading');
    try {
      const request: WarmUpRequest = {
        muscle_groups: selectedMuscles,
        session_type: selectedSession,
        sleep_score: sleepScore,
        soreness,
        energy,
      };
      const result = await generateWarmUp(request);
      setProtocol(result);
      setChecked({});
      setScreen('result');
    } catch {
      Alert.alert('Could not generate warm-up', 'Please check your connection and try again.');
      setScreen('setup');
    }
  }, [selectedMuscles, selectedSession, sleepScore, soreness, energy]);

  const handleRegenerate = useCallback(() => {
    setScreen('setup');
    setProtocol(null);
  }, []);

  const toggleExercise = useCallback((key: string) => {
    setChecked((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const completedCount = Object.values(checked).filter(Boolean).length;
  const totalExercises = protocol?.phases.reduce(
    (sum, phase) => sum + phase.exercises.length, 0
  ) ?? 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      {screen === 'setup' && (
        <SetupScreen
          selectedSession={selectedSession}
          setSelectedSession={setSelectedSession}
          selectedMuscles={selectedMuscles}
          toggleMuscle={toggleMuscle}
          onGenerate={handleGenerate}
          onSkip={onClose}
          t={t}
        />
      )}

      {screen === 'loading' && (
        <View style={s.loadingContainer}>
          <Ionicons name="flash-outline" size={40} color={t.text.secondary} />
          <Text style={s.loadingTitle}>Building your warm-up…</Text>
          <Text style={s.loadingSubtitle}>
            Personalising for {selectedSession.toLowerCase()}.
          </Text>
          <LoadingDots color={t.text.secondary} />
        </View>
      )}

      {screen === 'result' && protocol && (
        <ScrollView style={s.resultContainer} contentContainerStyle={s.resultContent}>
          <View style={s.handle} />

          {/* Header */}
          <View style={s.resultHeader}>
            <View style={{ flex: 1 }}>
              <Text style={s.resultTitle}>Today's Warm-Up</Text>
              <Text style={s.resultSession}>{selectedSession}</Text>
            </View>
            <View style={s.durationBadge}>
              <Ionicons name="time-outline" size={13} color={t.text.secondary} />
              <Text style={s.durationText}>{protocol.duration_minutes} min</Text>
            </View>
          </View>

          {/* Summary context */}
          <Text style={s.summary}>{protocol.summary}</Text>

          {/* Progress */}
          {totalExercises > 0 && (
            <View style={s.progressRow}>
              <View style={s.progressBarTrack}>
                <View
                  style={[
                    s.progressBarFill,
                    { width: `${Math.round((completedCount / totalExercises) * 100)}%` as any },
                  ]}
                />
              </View>
              <Text style={s.progressText}>
                {completedCount}/{totalExercises} done
              </Text>
            </View>
          )}

          {/* Phases */}
          {protocol.phases.map((phase) => {
            const phaseColor = phaseColorFor(phase.phase, t);
            return (
              <View key={phase.phase} style={[s.phaseCard, { borderLeftColor: phaseColor }]}>
                <Text style={[s.phaseName, { color: phaseColor }]}>
                  {phase.phase.toUpperCase()}
                </Text>
                {phase.exercises.map((ex, i) => {
                  const key = `${phase.phase}-${i}`;
                  return (
                    <ExerciseRow
                      key={key}
                      exercise={ex}
                      checked={!!checked[key]}
                      onToggle={() => toggleExercise(key)}
                      phaseColor={phaseColor}
                      t={t}
                    />
                  );
                })}
              </View>
            );
          })}

          {/* Actions */}
          <TouchableOpacity style={s.doneBtn} onPress={onClose} activeOpacity={0.85}>
            <Text style={s.doneBtnText}>Start Workout</Text>
          </TouchableOpacity>

          <View style={s.secondaryActions}>
            <TouchableOpacity onPress={handleRegenerate} activeOpacity={0.7}>
              <Text style={s.regenerateText}>Regenerate</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
              <Text style={s.skipResultText}>Skip</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function mainStyles(t: ThemeColors) {
  return StyleSheet.create({
    loadingContainer: {
      flex: 1,
      backgroundColor: t.bg.primary,
      alignItems: 'center',
      justifyContent: 'center',
      gap: SP[3],
      padding: SP[7],
    },
    loadingTitle: {
      fontFamily: TY.sans.bold,
      fontSize: TY.size.h3 + 2,
      color: t.text.primary,
      textAlign: 'center',
    },
    loadingSubtitle: {
      fontFamily: TY.sans.regular,
      fontSize: TY.size.body,
      color: t.text.secondary,
      textAlign: 'center',
    },
    resultContainer: {
      flex: 1,
      backgroundColor: t.bg.primary,
    },
    resultContent: {
      padding: SP[6],
      paddingBottom: SP[10],
    },
    handle: {
      width: 40,
      height: 4,
      backgroundColor: t.border,
      borderRadius: 2,
      alignSelf: 'center',
      marginBottom: SP[6],
    },
    resultHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: SP[3],
      marginBottom: SP[3],
    },
    resultTitle: {
      fontFamily: TY.sans.bold,
      fontSize: TY.size.h2,
      color: t.text.primary,
      letterSpacing: TY.tracking.tight,
    },
    resultSession: {
      fontFamily: TY.sans.regular,
      fontSize: TY.size.small + 1,
      color: t.text.secondary,
      marginTop: 3,
    },
    durationBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SP[1],
      backgroundColor: t.bg.elevated,
      borderRadius: R.xs,
      paddingHorizontal: SP[3] - 2,
      paddingVertical: SP[2] - 2,
      borderWidth: 1,
      borderColor: t.border,
    },
    durationText: {
      fontFamily: TY.mono.semibold,
      fontSize: TY.size.small + 1,
      color: t.text.secondary,
      letterSpacing: TY.tracking.tight,
    },
    summary: {
      fontFamily: TY.sans.regular,
      fontSize: TY.size.body,
      color: t.text.secondary,
      lineHeight: 20,
      marginBottom: SP[4],
    },
    progressRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SP[3] - 2,
      marginBottom: SP[5],
    },
    progressBarTrack: {
      flex: 1,
      height: 4,
      backgroundColor: t.border,
      borderRadius: 2,
      overflow: 'hidden',
    },
    progressBarFill: {
      height: 4,
      backgroundColor: t.status.success,
      borderRadius: 2,
    },
    progressText: {
      fontFamily: TY.mono.medium,
      fontSize: TY.size.small,
      color: t.text.muted,
      minWidth: 52,
      textAlign: 'right',
    },
    phaseCard: {
      backgroundColor: t.bg.elevated,
      borderRadius: R.md,
      padding: SP[4],
      borderWidth: 1,
      borderColor: t.border,
      borderLeftWidth: 3,
      marginBottom: SP[3],
    },
    phaseName: {
      fontFamily: TY.mono.bold,
      fontSize: TY.size.micro,
      letterSpacing: TY.tracking.label,
      textTransform: 'uppercase',
      marginBottom: SP[1],
    },
    doneBtn: {
      backgroundColor: t.accent,
      borderRadius: R.sm,
      paddingVertical: SP[4],
      alignItems: 'center',
      marginTop: SP[2],
      marginBottom: SP[3],
    },
    doneBtnText: {
      fontFamily: TY.sans.bold,
      color: t.accentInk,
      fontSize: TY.size.body + 2,
      letterSpacing: TY.tracking.tight,
    },
    secondaryActions: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: SP[7],
      paddingVertical: SP[2],
    },
    regenerateText: {
      fontFamily: TY.sans.medium,
      fontSize: TY.size.body,
      color: t.text.secondary,
      textDecorationLine: 'underline',
    },
    skipResultText: {
      fontFamily: TY.sans.medium,
      fontSize: TY.size.body,
      color: t.text.muted,
    },
  });
}

function setupStyles(t: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: t.bg.primary,
    },
    content: {
      padding: SP[6],
      paddingBottom: SP[10],
    },
    handle: {
      width: 40,
      height: 4,
      backgroundColor: t.border,
      borderRadius: 2,
      alignSelf: 'center',
      marginBottom: SP[6],
    },
    title: {
      fontFamily: TY.sans.bold,
      fontSize: TY.size.h2 + 2,
      color: t.text.primary,
      letterSpacing: TY.tracking.tight,
      marginBottom: SP[2],
    },
    subtitle: {
      fontFamily: TY.sans.regular,
      fontSize: TY.size.body,
      color: t.text.secondary,
      lineHeight: 20,
      marginBottom: SP[7] - 4,
    },
    fieldLabel: {
      fontFamily: TY.mono.semibold,
      fontSize: TY.size.micro,
      color: t.text.muted,
      textTransform: 'uppercase',
      letterSpacing: TY.tracking.label,
      marginBottom: SP[3] - 2,
    },
    optionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SP[3] - 2,
      paddingVertical: SP[3],
      paddingHorizontal: SP[4] - 2,
      borderRadius: R.sm,
      backgroundColor: t.bg.elevated,
      borderWidth: 1,
      borderColor: t.border,
      marginBottom: SP[2],
    },
    optionRowSelected: {
      borderColor: t.accent,
      backgroundColor: t.bg.subtle,
    },
    optionText: {
      fontFamily: TY.sans.regular,
      fontSize: TY.size.body + 1,
      color: t.text.secondary,
    },
    optionTextSelected: {
      fontFamily: TY.sans.semibold,
      color: t.text.primary,
    },
    muscleGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SP[2],
      marginBottom: SP[7] - 4,
    },
    muscleTag: {
      paddingHorizontal: SP[4] - 2,
      paddingVertical: SP[2] + 1,
      borderRadius: R.pill,
      backgroundColor: t.bg.elevated,
      borderWidth: 1,
      borderColor: t.border,
    },
    muscleTagSelected: {
      backgroundColor: t.accent,
      borderColor: t.accent,
    },
    muscleTagText: {
      fontFamily: TY.sans.regular,
      fontSize: TY.size.body,
      color: t.text.secondary,
    },
    muscleTagTextSelected: {
      fontFamily: TY.sans.semibold,
      color: t.accentInk,
    },
    generateBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SP[2],
      backgroundColor: t.accent,
      borderRadius: R.sm,
      paddingVertical: SP[4],
      marginBottom: SP[3],
    },
    btnDisabled: {
      opacity: 0.4,
    },
    generateBtnText: {
      fontFamily: TY.sans.bold,
      color: t.accentInk,
      fontSize: TY.size.body + 2,
      letterSpacing: TY.tracking.tight,
    },
    skipBtn: {
      alignItems: 'center',
      paddingVertical: SP[3],
    },
    skipText: {
      fontFamily: TY.sans.medium,
      fontSize: TY.size.body,
      color: t.text.muted,
    },
  });
}
