/**
 * DeloadCard — surface-level recommendation card shown on the dashboard.
 * Opens a detail modal explaining each signal that contributed to the score.
 *
 * Color convention (maps severity to the status scale):
 *   consider     → t.status.warn
 *   recommended  → t.status.warn
 *   urgent       → t.status.danger
 */

import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DeloadRecommendation, SignalScore } from '@/services/api';
import { useTheme } from '@/contexts/ThemeContext';
import { ThemeColors, type as TY, radius as R, space as SP } from '@/services/theme';

// ── Helpers ───────────────────────────────────────────────────────────────────

type Level = 'consider' | 'recommended' | 'urgent';

function accentForLevel(level: Level, t: ThemeColors): string {
  if (level === 'urgent') return t.status.danger;
  if (level === 'recommended') return t.status.warn;
  return t.status.warn;
}

function titleForLevel(level: Level): string {
  if (level === 'urgent') return 'Deload Strongly Recommended';
  if (level === 'recommended') return 'Time for a Deload';
  return 'Consider a Deload';
}

function signalBarColor(score: number, t: ThemeColors): string {
  if (score >= 65) return t.status.danger;
  if (score >= 40) return t.status.warn;
  return t.status.success;
}

function confidenceLabel(confidence: 'low' | 'medium' | 'high'): string {
  if (confidence === 'high') return 'High confidence';
  if (confidence === 'medium') return 'Medium confidence';
  return 'Low confidence — more data needed';
}

// ── Signal Row (used in detail modal) ────────────────────────────────────────

function SignalRow({
  signal,
  t,
}: {
  signal: SignalScore;
  t: ThemeColors;
}) {
  const barColor = signal.data_available ? signalBarColor(signal.score, t) : t.border;
  const barWidth = signal.data_available ? `${Math.round(signal.score)}%` : '0%';

  return (
    <View style={detailStyles(t).signalRow}>
      <View style={detailStyles(t).signalHeader}>
        <Text style={detailStyles(t).signalLabel}>{signal.label}</Text>
        {signal.data_available ? (
          <Text style={[detailStyles(t).signalScore, { color: barColor }]}>
            {Math.round(signal.score)}
          </Text>
        ) : (
          <Text style={detailStyles(t).signalNoData}>No data</Text>
        )}
      </View>

      {/* Progress bar */}
      <View style={detailStyles(t).barTrack}>
        <View
          style={[
            detailStyles(t).barFill,
            { width: barWidth as any, backgroundColor: barColor },
          ]}
        />
      </View>

      <Text style={detailStyles(t).signalExplanation}>{signal.explanation}</Text>
    </View>
  );
}

// ── Detail Modal ──────────────────────────────────────────────────────────────

function DeloadDetailModal({
  visible,
  rec,
  onClose,
  onDismiss,
}: {
  visible: boolean;
  rec: DeloadRecommendation;
  onClose: () => void;
  onDismiss: () => void;
}) {
  const { theme: t } = useTheme();
  const ds = detailStyles(t);
  const level = rec.recommendation as Level;
  const accent = accentForLevel(level, t);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <ScrollView style={ds.container} contentContainerStyle={ds.content}>
        <View style={ds.handle} />

        {/* Title area */}
        <View style={[ds.titleRow, { borderLeftColor: accent }]}>
          <View style={ds.titleTextBlock}>
            <Text style={ds.modalTitle}>Why a deload?</Text>
            <Text style={[ds.confidenceChip, { color: t.text.muted }]}>
              {confidenceLabel(rec.confidence)}
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close" size={22} color={t.text.secondary} />
          </TouchableOpacity>
        </View>

        {/* Overall score */}
        <View style={ds.scoreRow}>
          <Text style={ds.scoreLabel}>DELOAD SCORE</Text>
          <Text style={[ds.scoreValue, { color: accent }]}>
            {Math.round(rec.overall_score)}
            <Text style={ds.scoreMax}>/100</Text>
          </Text>
        </View>
        <Text style={ds.primaryReason}>{rec.primary_reason}</Text>

        {/* Per-signal breakdown */}
        <Text style={ds.sectionTitle}>SIGNAL BREAKDOWN</Text>
        {rec.signals.map((sig) => (
          <SignalRow key={sig.label} signal={sig} t={t} />
        ))}

        {/* Suggested duration */}
        <View style={ds.durationCard}>
          <Ionicons name="calendar-outline" size={18} color={t.text.secondary} />
          <Text style={ds.durationText}>
            Suggested deload: {rec.suggested_duration_days} days of reduced volume and intensity,
            keeping movement patterns similar to your normal training.
          </Text>
        </View>

        {/* Actions */}
        <TouchableOpacity
          style={[ds.primaryBtn, { borderColor: accent }]}
          onPress={onDismiss}
          activeOpacity={0.8}
        >
          <Text style={[ds.primaryBtnText, { color: accent }]}>Got it — I'll take it easy</Text>
        </TouchableOpacity>

        <TouchableOpacity style={ds.ghostBtn} onPress={onClose} activeOpacity={0.7}>
          <Text style={ds.ghostBtnText}>Close</Text>
        </TouchableOpacity>
      </ScrollView>
    </Modal>
  );
}

// ── DeloadCard (main export) ──────────────────────────────────────────────────

interface Props {
  recommendation: DeloadRecommendation | null;
  loading: boolean;
  onDismiss: () => void;
}

export default function DeloadCard({ recommendation, loading, onDismiss }: Props) {
  const { theme: t } = useTheme();
  const s = cardStyles(t);
  const [modalVisible, setModalVisible] = useState(false);

  // Only show for actionable recommendations
  if (loading || !recommendation || recommendation.recommendation === 'none') {
    return null;
  }

  const level = recommendation.recommendation as Level;
  const accent = accentForLevel(level, t);
  const title = titleForLevel(level);

  return (
    <>
      <View style={[s.card, { borderLeftColor: accent }]}>
        {/* Header */}
        <View style={s.headerRow}>
          <View style={s.iconAndTitle}>
            <Ionicons name="warning-outline" size={16} color={accent} />
            <Text style={[s.label, { color: accent }]}>RECOVERY INSIGHT</Text>
          </View>
          <TouchableOpacity onPress={onDismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={18} color={t.text.muted} />
          </TouchableOpacity>
        </View>

        {/* Title + reason */}
        <Text style={s.title}>{title}</Text>
        <Text style={s.reason}>{recommendation.primary_reason}</Text>

        {/* Confidence + score */}
        <View style={s.metaRow}>
          <Text style={s.metaText}>
            {confidenceLabel(recommendation.confidence)} ·{' '}
            Score {Math.round(recommendation.overall_score)}/100
          </Text>
        </View>

        {/* Action */}
        <TouchableOpacity
          style={[s.detailButton, { borderColor: accent }]}
          onPress={() => setModalVisible(true)}
          activeOpacity={0.8}
        >
          <Text style={[s.detailButtonText, { color: accent }]}>See Full Analysis</Text>
          <Ionicons name="chevron-forward" size={14} color={accent} />
        </TouchableOpacity>
      </View>

      <DeloadDetailModal
        visible={modalVisible}
        rec={recommendation}
        onClose={() => setModalVisible(false)}
        onDismiss={() => {
          setModalVisible(false);
          onDismiss();
        }}
      />
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function cardStyles(t: ThemeColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: t.bg.elevated,
      borderRadius: R.md,
      padding: SP[4],
      borderWidth: 1,
      borderColor: t.border,
      borderLeftWidth: 3,
      marginBottom: SP[3],
      gap: SP[2],
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    iconAndTitle: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SP[2] - 2,
    },
    label: {
      fontFamily: TY.mono.semibold,
      fontSize: TY.size.micro,
      letterSpacing: TY.tracking.label,
      textTransform: 'uppercase',
    },
    title: {
      fontFamily: TY.sans.bold,
      fontSize: TY.size.h3 - 1,
      color: t.text.primary,
      lineHeight: 22,
      letterSpacing: TY.tracking.tight,
    },
    reason: {
      fontFamily: TY.sans.regular,
      fontSize: TY.size.body,
      color: t.text.secondary,
      lineHeight: 20,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    metaText: {
      fontFamily: TY.sans.regular,
      fontSize: TY.size.small,
      color: t.text.muted,
    },
    detailButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SP[2] - 2,
      paddingVertical: SP[3] - 2,
      borderRadius: R.sm,
      borderWidth: 1,
      marginTop: SP[1],
    },
    detailButtonText: {
      fontFamily: TY.sans.semibold,
      fontSize: TY.size.body,
      letterSpacing: TY.tracking.tight,
    },
  });
}

function detailStyles(t: ThemeColors) {
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
    titleRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      borderLeftWidth: 3,
      paddingLeft: SP[4] - 2,
      marginBottom: SP[5],
    },
    titleTextBlock: {
      flex: 1,
      gap: SP[1],
    },
    modalTitle: {
      fontFamily: TY.sans.bold,
      fontSize: TY.size.h2,
      color: t.text.primary,
      letterSpacing: TY.tracking.tight,
    },
    confidenceChip: {
      fontFamily: TY.sans.regular,
      fontSize: TY.size.small + 1,
    },
    scoreRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: SP[3] - 2,
    },
    scoreLabel: {
      fontFamily: TY.mono.semibold,
      fontSize: TY.size.micro,
      color: t.text.muted,
      textTransform: 'uppercase',
      letterSpacing: TY.tracking.label,
    },
    scoreValue: {
      fontFamily: TY.mono.bold,
      fontSize: TY.size.h1,
      letterSpacing: TY.tracking.tight,
    },
    scoreMax: {
      fontFamily: TY.mono.regular,
      fontSize: TY.size.body + 2,
      color: t.text.muted,
    },
    primaryReason: {
      fontFamily: TY.sans.regular,
      fontSize: TY.size.body + 1,
      color: t.text.secondary,
      lineHeight: 22,
      marginBottom: SP[7] - 4,
    },
    sectionTitle: {
      fontFamily: TY.mono.semibold,
      fontSize: TY.size.micro,
      color: t.text.muted,
      textTransform: 'uppercase',
      letterSpacing: TY.tracking.label,
      marginBottom: SP[4],
    },
    signalRow: {
      marginBottom: SP[5],
      gap: SP[2] - 2,
    },
    signalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    signalLabel: {
      fontFamily: TY.sans.semibold,
      fontSize: TY.size.body,
      color: t.text.primary,
    },
    signalScore: {
      fontFamily: TY.mono.bold,
      fontSize: TY.size.body,
    },
    signalNoData: {
      fontFamily: TY.sans.regular,
      fontSize: TY.size.small,
      color: t.text.muted,
    },
    barTrack: {
      height: 4,
      backgroundColor: t.border,
      borderRadius: 2,
      overflow: 'hidden',
    },
    barFill: {
      height: 4,
      borderRadius: 2,
    },
    signalExplanation: {
      fontFamily: TY.sans.regular,
      fontSize: TY.size.small + 1,
      color: t.text.secondary,
      lineHeight: 19,
    },
    durationCard: {
      flexDirection: 'row',
      gap: SP[3],
      backgroundColor: t.bg.elevated,
      borderRadius: R.sm,
      padding: SP[4] - 2,
      borderWidth: 1,
      borderColor: t.border,
      marginTop: SP[1],
      marginBottom: SP[7] - 4,
      alignItems: 'flex-start',
    },
    durationText: {
      flex: 1,
      fontFamily: TY.sans.regular,
      fontSize: TY.size.body,
      color: t.text.secondary,
      lineHeight: 20,
    },
    primaryBtn: {
      borderWidth: 1,
      borderRadius: R.sm,
      paddingVertical: SP[4] - 2,
      alignItems: 'center',
      marginBottom: SP[3],
    },
    primaryBtnText: {
      fontFamily: TY.sans.semibold,
      fontSize: TY.size.body + 1,
      letterSpacing: TY.tracking.tight,
    },
    ghostBtn: {
      alignItems: 'center',
      paddingVertical: SP[3],
    },
    ghostBtnText: {
      fontFamily: TY.sans.medium,
      fontSize: TY.size.body + 1,
      color: t.text.muted,
    },
  });
}
