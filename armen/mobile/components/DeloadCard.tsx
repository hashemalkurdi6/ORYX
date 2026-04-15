/**
 * DeloadCard — surface-level recommendation card shown on the dashboard.
 * Opens a detail modal explaining each signal that contributed to the score.
 *
 * Color convention (intentionally outside the strict monochrome palette):
 *   consider     → amber  #d97706
 *   recommended  → orange #e67e22
 *   urgent       → red    #c0392b  (theme.status.danger)
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
import { ThemeColors } from '@/services/theme';

// ── Helpers ───────────────────────────────────────────────────────────────────

type Level = 'consider' | 'recommended' | 'urgent';

function accentForLevel(level: Level): string {
  if (level === 'urgent') return '#c0392b';
  if (level === 'recommended') return '#e67e22';
  return '#d97706';
}

function titleForLevel(level: Level): string {
  if (level === 'urgent') return 'Deload Strongly Recommended';
  if (level === 'recommended') return 'Time for a Deload';
  return 'Consider a Deload';
}

function signalBarColor(score: number): string {
  if (score >= 65) return '#c0392b';
  if (score >= 40) return '#e67e22';
  return '#27ae60';
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
  const barColor = signal.data_available ? signalBarColor(signal.score) : t.border;
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
  const accent = accentForLevel(level);

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
  const accent = accentForLevel(level);
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
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: t.border,
      borderLeftWidth: 3,
      marginBottom: 12,
      gap: 8,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    iconAndTitle: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    label: {
      fontSize: 10,
      fontWeight: '600',
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    title: {
      fontSize: 17,
      fontWeight: '700',
      color: t.text.primary,
      lineHeight: 22,
    },
    reason: {
      fontSize: 14,
      color: t.text.secondary,
      lineHeight: 20,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    metaText: {
      fontSize: 12,
      color: t.text.muted,
    },
    detailButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 10,
      borderRadius: 10,
      borderWidth: 1,
      marginTop: 4,
    },
    detailButtonText: {
      fontSize: 14,
      fontWeight: '600',
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
      padding: 24,
      paddingBottom: 60,
    },
    handle: {
      width: 40,
      height: 4,
      backgroundColor: t.border,
      borderRadius: 2,
      alignSelf: 'center',
      marginBottom: 24,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      borderLeftWidth: 3,
      paddingLeft: 14,
      marginBottom: 20,
    },
    titleTextBlock: {
      flex: 1,
      gap: 4,
    },
    modalTitle: {
      fontSize: 22,
      fontWeight: '700',
      color: t.text.primary,
    },
    confidenceChip: {
      fontSize: 13,
    },
    scoreRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    scoreLabel: {
      fontSize: 10,
      fontWeight: '600',
      color: t.text.muted,
      textTransform: 'uppercase',
      letterSpacing: 1.5,
    },
    scoreValue: {
      fontSize: 28,
      fontWeight: '800',
    },
    scoreMax: {
      fontSize: 16,
      fontWeight: '400',
      color: '#555555',
    },
    primaryReason: {
      fontSize: 15,
      color: t.text.secondary,
      lineHeight: 22,
      marginBottom: 28,
    },
    sectionTitle: {
      fontSize: 10,
      fontWeight: '600',
      color: t.text.muted,
      textTransform: 'uppercase',
      letterSpacing: 1.5,
      marginBottom: 16,
    },
    signalRow: {
      marginBottom: 20,
      gap: 6,
    },
    signalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    signalLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: t.text.primary,
    },
    signalScore: {
      fontSize: 14,
      fontWeight: '700',
    },
    signalNoData: {
      fontSize: 12,
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
      fontSize: 13,
      color: t.text.secondary,
      lineHeight: 19,
    },
    durationCard: {
      flexDirection: 'row',
      gap: 12,
      backgroundColor: t.bg.elevated,
      borderRadius: 12,
      padding: 14,
      borderWidth: 1,
      borderColor: t.border,
      marginTop: 4,
      marginBottom: 28,
      alignItems: 'flex-start',
    },
    durationText: {
      flex: 1,
      fontSize: 14,
      color: t.text.secondary,
      lineHeight: 20,
    },
    primaryBtn: {
      borderWidth: 1,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
      marginBottom: 12,
    },
    primaryBtnText: {
      fontSize: 15,
      fontWeight: '600',
    },
    ghostBtn: {
      alignItems: 'center',
      paddingVertical: 12,
    },
    ghostBtnText: {
      fontSize: 15,
      color: t.text.muted,
    },
  });
}
