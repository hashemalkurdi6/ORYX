import { useCallback, useEffect, useMemo, useState } from 'react';
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
  Platform,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LineChart, BarChart } from 'react-native-chart-kit';
import {
  getWellnessCheckins,
  submitWellnessCheckin,
  getWhoopData,
  getOuraData,
  getHealthSnapshots,
  getDailyDiagnosis,
  getWellnessTrends,
  WellnessCheckin,
  WhoopData,
  OuraData,
  HealthSnapshot,
  DiagnosisResult,
  WellnessTrends,
} from '@/services/api';
import { useTheme } from '@/contexts/ThemeContext';
import type { ThemeColors } from '@/services/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 40;

// ── Helpers ──────────────────────────────────────────────────────────────────

function todayISODate(): string {
  return new Date().toISOString().split('T')[0];
}

function formatDate(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function formatShortDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function wellnessColor(t: ThemeColors, value: number): string {
  if (value >= 4) return t.status.success;
  if (value === 3) return t.text.secondary;
  return t.status.danger;
}

function recoveryHex(t: ThemeColors, color: 'green' | 'yellow' | 'red'): string {
  if (color === 'green') return t.status.success;
  if (color === 'yellow') return t.text.secondary;
  return t.status.danger;
}

function recoveryLabel(color: 'green' | 'yellow' | 'red'): string {
  if (color === 'green') return 'READY TO PERFORM';
  if (color === 'yellow') return 'MODERATE RECOVERY';
  return 'REST & RECOVER';
}

function recoveryDescription(color: 'green' | 'yellow' | 'red'): string {
  if (color === 'green') return 'Your body is primed. Push your training today.';
  if (color === 'yellow') return 'Take it steady. Moderate intensity is ideal.';
  return 'Prioritise rest and recovery. Skip intense training today.';
}

function sleepLabel(hours: number | null): string {
  if (!hours) return '--';
  return `${hours.toFixed(1)}h`;
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function WellnessScreen() {
  const { theme: t } = useTheme();
  const styles = useMemo(() => createStyles(t), [t]);
  const [checkins, setCheckins] = useState<WellnessCheckin[]>([]);
  const [whoopData, setWhoopData] = useState<WhoopData[]>([]);
  const [ouraData, setOuraData] = useState<OuraData[]>([]);
  const [snapshots, setSnapshots] = useState<HealthSnapshot[]>([]);
  const [diagnosis, setDiagnosis] = useState<DiagnosisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  // Hooper Index (1-7, 1=best). Matches the Home tab and the readiness service.
  const [form, setForm] = useState({ sleep_quality: 4, fatigue: 4, stress: 4, muscle_soreness: 4, notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [trends, setTrends] = useState<WellnessTrends | null>(null);
  const [trendsLoading, setTrendsLoading] = useState(false);
  const [trendsLoaded, setTrendsLoaded] = useState(false);
  const [trendRange, setTrendRange] = useState<'7d' | '30d' | '90d'>('30d');

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    const [checkinsRes, whoopRes, ouraRes, snapshotsRes, diagnosisRes, trendsRes] =
      await Promise.allSettled([
        getWellnessCheckins(7),
        getWhoopData(7),
        getOuraData(7),
        getHealthSnapshots(7),
        getDailyDiagnosis(),
        getWellnessTrends(30),
      ]);

    if (checkinsRes.status === 'fulfilled') setCheckins(checkinsRes.value);
    if (whoopRes.status === 'fulfilled') setWhoopData(whoopRes.value);
    if (ouraRes.status === 'fulfilled') setOuraData(ouraRes.value);
    if (snapshotsRes.status === 'fulfilled') setSnapshots(snapshotsRes.value);
    if (diagnosisRes.status === 'fulfilled') setDiagnosis(diagnosisRes.value);
    if (trendsRes.status === 'fulfilled') { setTrends(trendsRes.value); setTrendsLoaded(true); }

    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleRefresh = useCallback(() => { setRefreshing(true); loadData(); }, [loadData]);

  // ── Wellness handlers ────────────────────────────────────────────────────

  type HooperField = 'sleep_quality' | 'fatigue' | 'stress' | 'muscle_soreness';
  const adjust = (field: HooperField, delta: number) => {
    setForm((prev) => ({ ...prev, [field]: Math.min(7, Math.max(1, prev[field] + delta)) }));
  };

  const openModal = () => {
    const today = todayISODate();
    const todayCheckin = checkins.find((c) => c.date === today);
    if (todayCheckin) {
      setForm({
        sleep_quality: todayCheckin.sleep_quality ?? 4,
        fatigue: todayCheckin.fatigue ?? 4,
        stress: todayCheckin.stress ?? 4,
        muscle_soreness: todayCheckin.muscle_soreness ?? 4,
        notes: todayCheckin.notes ?? '',
      });
    } else {
      setForm({ sleep_quality: 4, fatigue: 4, stress: 4, muscle_soreness: 4, notes: '' });
    }
    setShowModal(true);
  };

  const handleSave = async () => {
    setSubmitting(true);
    try {
      const saved = await submitWellnessCheckin({
        date: todayISODate(),
        sleep_quality: form.sleep_quality,
        fatigue: form.fatigue,
        stress: form.stress,
        muscle_soreness: form.muscle_soreness,
        notes: form.notes.trim() || undefined,
      });
      setCheckins((prev) => {
        const filtered = prev.filter((c) => c.date !== saved.date);
        return [saved, ...filtered].sort((a, b) => b.date.localeCompare(a.date));
      });
      setShowModal(false);
    } catch {
      Alert.alert('Error', 'Could not save check-in. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Computed ──────────────────────────────────────────────────────────────

  const todayCheckin = checkins.find((c) => c.date === todayISODate()) ?? null;
  const latestWhoop = whoopData[0] ?? null;
  const latestOura = ouraData[0] ?? null;
  const latestSnapshot = snapshots[0] ?? null;
  // Backend `/home/diagnosis` now attaches recovery_score/recovery_color
  // sourced from calculate_readiness on every response (home.py:739-746).
  // Use `null` (rather than 0/'yellow') when the field is missing so we can
  // tell "real low score" apart from "no data yet" downstream.
  const recoveryColor: 'green' | 'yellow' | 'red' | null = diagnosis?.recovery_color ?? null;
  const accentColor = recoveryColor ? recoveryHex(t, recoveryColor) : t.text.muted;
  const recoveryScore = diagnosis?.recovery_score ?? null;

  // HRV trend (last 7 days, reverse chronological → oldest first for chart)
  const hrvPoints = snapshots
    .filter((s) => s.hrv_ms !== null)
    .slice(0, 7)
    .reverse()
    .map((s) => s.hrv_ms as number);

  const avgHrv = hrvPoints.length > 0
    ? Math.round(hrvPoints.reduce((a, b) => a + b, 0) / hrvPoints.length)
    : null;

  // Hooper trend (last 7 days, oldest first). Sum of 4 fields; lower is better.
  const moodPoints = checkins
    .slice(0, 7)
    .reverse()
    .map((c) => (c.sleep_quality ?? 4) + (c.fatigue ?? 4) + (c.stress ?? 4) + (c.muscle_soreness ?? 4));

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={t.text.primary} />
      </View>
    );
  }

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={t.text.primary} colors={[t.text.primary]} />
        }
      >
        {/* Header */}
        <SafeAreaView edges={['top']} style={styles.safeHeader}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.pageTitle}>Wellness</Text>
              <Text style={styles.pageSubtitle}>{formatDate()}</Text>
            </View>
            <TouchableOpacity style={styles.logButton} onPress={openModal} activeOpacity={0.8}>
              <Ionicons name="add" size={18} color={t.bg.primary} />
              <Text style={styles.logButtonText}>Log</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>

        {/* Recovery Status Card */}
        <View style={[styles.recoveryCard, { borderColor: accentColor }]}>
          <View style={styles.recoveryScoreRow}>
            <View style={[styles.recoveryScoreCircle, { borderColor: accentColor }]}>
              <Text style={[styles.recoveryScoreNum, { color: accentColor }]}>{recoveryScore ?? '--'}</Text>
              <Text style={styles.recoveryScoreLabel}>/ 100</Text>
            </View>
            <View style={styles.recoveryTextBlock}>
              <Text style={[styles.recoveryStatus, { color: accentColor }]}>{recoveryColor ? recoveryLabel(recoveryColor) : 'AWAITING DATA'}</Text>
              <Text style={styles.recoveryDesc}>{recoveryColor ? recoveryDescription(recoveryColor) : 'Log activity and check-ins to compute your recovery.'}</Text>
            </View>
          </View>
          <View style={styles.metricsRow}>
            <View style={styles.metricItem}>
              <Text style={styles.metricValue}>
                {latestWhoop?.hrv_rmssd != null
                  ? `${Math.round(latestWhoop.hrv_rmssd)}`
                  : latestSnapshot?.hrv_ms != null
                  ? `${Math.round(latestSnapshot.hrv_ms)}`
                  : avgHrv != null ? `${avgHrv}` : '--'}
              </Text>
              <Text style={styles.metricLabel}>HRV (ms)</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricItem}>
              <Text style={styles.metricValue}>
                {latestWhoop?.sleep_performance_pct != null
                  ? `${Math.round(latestWhoop.sleep_performance_pct)}%`
                  : latestOura?.sleep_score != null
                  ? `${latestOura.sleep_score}`
                  : latestSnapshot?.sleep_duration_hours != null
                  ? sleepLabel(latestSnapshot.sleep_duration_hours)
                  : '--'}
              </Text>
              <Text style={styles.metricLabel}>Sleep</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricItem}>
              <Text style={styles.metricValue}>
                {latestWhoop?.strain_score != null
                  ? latestWhoop.strain_score.toFixed(1)
                  : latestOura?.readiness_score != null
                  ? `${latestOura.readiness_score}`
                  : '--'}
              </Text>
              <Text style={styles.metricLabel}>
                {latestWhoop ? 'Strain' : 'Readiness'}
              </Text>
            </View>
          </View>
        </View>

        {/* Today's Check-in */}
        <Text style={styles.sectionLabel}>TODAY'S CHECK-IN</Text>
        <TouchableOpacity onPress={openModal} activeOpacity={0.85}>
          <View style={[styles.card, styles.promptCard]}>
            <Text style={styles.cardInnerLabel}>HOW YOU FEEL</Text>
            {todayCheckin ? (
              <View style={styles.checkinChipsRow}>
                {([
                  { field: 'sleep_quality', label: 'Sleep' },
                  { field: 'fatigue', label: 'Fatigue' },
                  { field: 'stress', label: 'Stress' },
                  { field: 'muscle_soreness', label: 'Soreness' },
                ] as const).map(({ field, label }) => {
                  // Hooper: lower is better (1=best, 7=worst). Invert before
                  // passing to wellnessColor (which expects higher=better).
                  const raw = todayCheckin[field] ?? 4;
                  const inverted = 8 - raw; // 1→7 (green), 7→1 (red)
                  return (
                    <View key={field} style={[styles.checkinChip, { borderColor: wellnessColor(t, inverted) }]}>
                      <Text style={[styles.checkinChipValue, { color: wellnessColor(t, inverted) }]}>{raw}/7</Text>
                      <Text style={styles.checkinChipLabel}>{label}</Text>
                    </View>
                  );
                })}
              </View>
            ) : (
              <View style={styles.promptRow}>
                <View style={styles.promptIcons}>
                  <Ionicons name="moon-outline" size={20} color={t.text.secondary} />
                  <Ionicons name="flash-outline" size={20} color={t.text.secondary} />
                  <Ionicons name="pulse-outline" size={20} color={t.text.secondary} />
                  <Ionicons name="body-outline" size={20} color={t.text.secondary} />
                </View>
                <Text style={styles.promptText}>Log how you feel today</Text>
                <Ionicons name="chevron-forward" size={16} color={t.text.muted} />
              </View>
            )}
          </View>
        </TouchableOpacity>

        {/* WHOOP Data */}
        {latestWhoop && (
          <>
            <Text style={styles.sectionLabel}>WHOOP · TODAY</Text>
            <View style={styles.card}>
              <View style={styles.deviceDataGrid}>
                {latestWhoop.recovery_score !== null && (
                  <View style={styles.deviceMetricBox}>
                    <Text style={[styles.deviceMetricValue, { color: t.status.danger }]}>
                      {Math.round(latestWhoop.recovery_score)}%
                    </Text>
                    <Text style={styles.deviceMetricLabel}>Recovery</Text>
                  </View>
                )}
                {latestWhoop.hrv_rmssd !== null && (
                  <View style={styles.deviceMetricBox}>
                    <Text style={styles.deviceMetricValue}>
                      {Math.round(latestWhoop.hrv_rmssd)}ms
                    </Text>
                    <Text style={styles.deviceMetricLabel}>HRV</Text>
                  </View>
                )}
                {latestWhoop.strain_score !== null && (
                  <View style={styles.deviceMetricBox}>
                    <Text style={styles.deviceMetricValue}>
                      {latestWhoop.strain_score.toFixed(1)}
                    </Text>
                    <Text style={styles.deviceMetricLabel}>Strain</Text>
                  </View>
                )}
                {latestWhoop.sleep_performance_pct !== null && (
                  <View style={styles.deviceMetricBox}>
                    <Text style={[styles.deviceMetricValue, { color: t.status.success }]}>
                      {Math.round(latestWhoop.sleep_performance_pct)}%
                    </Text>
                    <Text style={styles.deviceMetricLabel}>Sleep</Text>
                  </View>
                )}
              </View>
              <Text style={styles.deviceDate}>{latestWhoop.date}</Text>
            </View>
          </>
        )}

        {/* Oura Data */}
        {latestOura && (
          <>
            <Text style={styles.sectionLabel}>OURA RING · TODAY</Text>
            <View style={styles.card}>
              <View style={styles.deviceDataGrid}>
                {latestOura.readiness_score !== null && (
                  <View style={styles.deviceMetricBox}>
                    <Text style={[styles.deviceMetricValue, { color: t.status.success }]}>
                      {latestOura.readiness_score}
                    </Text>
                    <Text style={styles.deviceMetricLabel}>Readiness</Text>
                  </View>
                )}
                {latestOura.sleep_score !== null && (
                  <View style={styles.deviceMetricBox}>
                    <Text style={styles.deviceMetricValue}>{latestOura.sleep_score}</Text>
                    <Text style={styles.deviceMetricLabel}>Sleep</Text>
                  </View>
                )}
                {latestOura.hrv_average !== null && (
                  <View style={styles.deviceMetricBox}>
                    <Text style={styles.deviceMetricValue}>
                      {Math.round(latestOura.hrv_average)}ms
                    </Text>
                    <Text style={styles.deviceMetricLabel}>HRV</Text>
                  </View>
                )}
                {latestOura.sleep_efficiency !== null && (
                  <View style={styles.deviceMetricBox}>
                    <Text style={[styles.deviceMetricValue, { color: t.status.success }]}>
                      {Math.round(latestOura.sleep_efficiency)}%
                    </Text>
                    <Text style={styles.deviceMetricLabel}>Efficiency</Text>
                  </View>
                )}
              </View>
              <Text style={styles.deviceDate}>{latestOura.date}</Text>
            </View>
          </>
        )}

        {/* HRV Trend */}
        {hrvPoints.length >= 2 && (
          <>
            <Text style={styles.sectionLabel}>7-DAY HRV TREND</Text>
            <View style={styles.card}>
              <View style={styles.chartHeaderRow}>
                <Text style={styles.cardInnerLabel}>Heart Rate Variability</Text>
                {avgHrv !== null && (
                  <View style={styles.avgChip}>
                    <Text style={styles.avgChipText}>Avg {avgHrv}ms</Text>
                  </View>
                )}
              </View>
              <LineChart
                data={{ labels: [], datasets: [{ data: hrvPoints, color: () => t.status.success, strokeWidth: 2 }] }}
                width={CARD_WIDTH - 32}
                height={90}
                withDots={false}
                withInnerLines={false}
                withOuterLines={false}
                withHorizontalLabels={false}
                withVerticalLabels={false}
                chartConfig={{
                  backgroundColor: 'transparent',
                  backgroundGradientFrom: t.glass.card,
                  backgroundGradientTo: t.glass.card,
                  color: () => t.status.success,
                  strokeWidth: 2,
                  propsForBackgroundLines: { stroke: 'transparent' },
                }}
                bezier
                style={styles.chart}
              />
            </View>
          </>
        )}

        {/* Mood Trend */}
        {moodPoints.length >= 2 && (
          <>
            <Text style={styles.sectionLabel}>HOOPER TREND</Text>
            <View style={styles.card}>
              <Text style={styles.cardInnerLabel}>7-Day Hooper Total (lower is better)</Text>
              <LineChart
                data={{ labels: [], datasets: [{ data: moodPoints, color: () => t.text.body, strokeWidth: 2 }] }}
                width={CARD_WIDTH - 32}
                height={100}
                withDots
                withInnerLines={false}
                withOuterLines={false}
                withHorizontalLabels={false}
                withVerticalLabels={false}
                chartConfig={{
                  backgroundColor: t.bg.tint,
                  backgroundGradientFrom: t.bg.tint,
                  backgroundGradientTo: t.bg.tint,
                  color: () => t.text.body,
                  strokeWidth: 2,
                  propsForBackgroundLines: { stroke: 'transparent' },
                  propsForDots: { r: '4', strokeWidth: '0', fill: t.text.body },
                }}
                bezier
                style={styles.chart}
              />
              <View style={styles.moodScaleRow}>
                <Text style={styles.moodScaleLabel}>4 Excellent</Text>
                <Text style={styles.moodScaleLabel}>28 Very Poor</Text>
              </View>
            </View>
          </>
        )}

        {/* 7-Day Checkin History */}
        {checkins.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>RECENT CHECK-INS</Text>
            <View style={styles.card}>
              {checkins.slice(0, 7).map((checkin, idx) => {
                const sq = checkin.sleep_quality ?? 4;
                const fa = checkin.fatigue ?? 4;
                const st = checkin.stress ?? 4;
                const so = checkin.muscle_soreness ?? 4;
                return (
                  <View key={checkin.id}>
                    {idx > 0 && <View style={styles.historyDivider} />}
                    <View style={styles.historyRow}>
                      <Text style={styles.historyDate}>{formatShortDate(checkin.date)}</Text>
                      <View style={styles.historyDots}>
                        <View style={[styles.historyDot, { backgroundColor: wellnessColor(t, 8 - sq) }]} />
                        <View style={[styles.historyDot, { backgroundColor: wellnessColor(t, 8 - fa) }]} />
                        <View style={[styles.historyDot, { backgroundColor: wellnessColor(t, 8 - st) }]} />
                        <View style={[styles.historyDot, { backgroundColor: wellnessColor(t, 8 - so) }]} />
                      </View>
                      <View style={styles.historyValues}>
                        <Text style={styles.historyValueText}>{sq}/{fa}/{st}/{so}</Text>
                        <Text style={styles.historyValueSub}>S/F/St/So</Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {checkins.length === 0 && !latestWhoop && !latestOura && (
          <View style={styles.emptyState}>
            <Ionicons name="pulse-outline" size={48} color={t.text.muted} />
            <Text style={styles.emptyTitle}>No wellness data yet</Text>
            <Text style={styles.emptySubtitle}>
              Log your first check-in or connect WHOOP / Oura Ring to see insights here.
            </Text>
          </View>
        )}

        {/* HRV TRENDS */}
        {trends?.data_availability.has_hrv_data ? (
          <>
            <Text style={styles.sectionLabel}>HRV TRENDS</Text>
            <View style={styles.card}>
              {/* Stats row */}
              <View style={{ flexDirection: 'row', marginBottom: 12 }}>
                {[
                  { label: 'CURRENT', val: trends.hrv_stats.current_hrv != null ? `${Math.round(trends.hrv_stats.current_hrv)}ms` : '--' },
                  { label: '7D AVG', val: trends.hrv_stats.seven_day_avg != null ? `${Math.round(trends.hrv_stats.seven_day_avg)}ms` : '--' },
                  { label: '30D AVG', val: trends.hrv_stats.thirty_day_avg != null ? `${Math.round(trends.hrv_stats.thirty_day_avg)}ms` : '--' },
                ].map((stat, i) => (
                  <View key={stat.label} style={{ flex: 1, alignItems: 'center' }}>
                    {i > 0 && <View style={{ position: 'absolute', left: 0, top: 4, width: 1, height: 28, backgroundColor: t.glass.border }} />}
                    <Text style={{ fontSize: 16, fontWeight: '700', color: t.text.primary, marginBottom: 2 }}>{stat.val}</Text>
                    <Text style={{ fontSize: 9, color: t.text.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>{stat.label}</Text>
                  </View>
                ))}
              </View>
              {/* Chart: 3-series overlay — daily HRV line, 7-day-avg guide, 30-day-avg guide */}
              {trends.hrv_data.length >= 2 && (() => {
                const pts = trends.hrv_data.slice(-30).map(d => d.hrv_ms);
                const sevenAvg = trends.hrv_stats.seven_day_avg;
                const thirtyAvg = trends.hrv_stats.thirty_day_avg;
                const datasets: Array<{ data: number[]; color: (o?: number) => string; strokeWidth: number; withDots?: boolean }> = [
                  { data: pts, color: (o = 1) => `rgba(0,196,140,${o})`, strokeWidth: 2 },
                ];
                if (sevenAvg != null) datasets.push({ data: pts.map(() => sevenAvg), color: (o = 1) => `rgba(255,200,87,${o})`, strokeWidth: 1, withDots: false });
                if (thirtyAvg != null) datasets.push({ data: pts.map(() => thirtyAvg), color: (o = 1) => `rgba(160,160,170,${o * 0.7})`, strokeWidth: 1, withDots: false });
                return (
                  <>
                    <LineChart
                      data={{ labels: [], datasets }}
                      width={CARD_WIDTH - 32}
                      height={120}
                      withDots={false}
                      withInnerLines={false}
                      withOuterLines={false}
                      withHorizontalLabels={false}
                      withVerticalLabels={false}
                      chartConfig={{ backgroundColor: 'transparent', backgroundGradientFrom: t.glass.card, backgroundGradientTo: t.glass.card, color: () => t.status.success, strokeWidth: 2, propsForBackgroundLines: { stroke: 'transparent' } }}
                      bezier
                      style={styles.chart}
                    />
                    {/* Legend */}
                    <View style={{ flexDirection: 'row', gap: 12, marginTop: 4, justifyContent: 'center', flexWrap: 'wrap' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <View style={{ width: 10, height: 2, backgroundColor: t.status.success }} />
                        <Text style={{ fontSize: 9, color: t.text.muted }}>Daily</Text>
                      </View>
                      {sevenAvg != null && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <View style={{ width: 10, height: 2, backgroundColor: 'rgba(255,200,87,1)' }} />
                          <Text style={{ fontSize: 9, color: t.text.muted }}>7d avg</Text>
                        </View>
                      )}
                      {thirtyAvg != null && (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <View style={{ width: 10, height: 2, backgroundColor: 'rgba(160,160,170,0.7)' }} />
                          <Text style={{ fontSize: 9, color: t.text.muted }}>30d avg</Text>
                        </View>
                      )}
                    </View>
                  </>
                );
              })()}
            </View>
          </>
        ) : trends && !trendsLoading ? (
          <>
            <Text style={styles.sectionLabel}>HRV TRENDS</Text>
            <View style={[styles.card, { alignItems: 'center', paddingVertical: 20 }]}>
              <Ionicons name="heart-outline" size={28} color={t.glass.border} />
              <Text style={{ fontSize: 13, color: t.text.muted, marginTop: 8, textAlign: 'center' }}>
                Connect Apple Watch, Whoop, or Oura to track HRV
              </Text>
            </View>
          </>
        ) : null}

        {/* SLEEP TRENDS */}
        {trends?.data_availability.has_sleep_data ? (
          <>
            <Text style={styles.sectionLabel}>SLEEP TRENDS</Text>
            <View style={styles.card}>
              {/* Stats row */}
              <View style={{ flexDirection: 'row', marginBottom: 12 }}>
                {[
                  { label: 'LAST NIGHT', val: trends.sleep_stats.last_night_hours != null ? `${trends.sleep_stats.last_night_hours.toFixed(1)}h` : '--' },
                  { label: '7D AVG', val: trends.sleep_stats.seven_day_avg != null ? `${trends.sleep_stats.seven_day_avg.toFixed(1)}h` : '--' },
                  { label: 'BEST/MO', val: trends.sleep_stats.best_this_month != null ? `${trends.sleep_stats.best_this_month.toFixed(1)}h` : '--' },
                ].map((stat, i) => (
                  <View key={stat.label} style={{ flex: 1, alignItems: 'center' }}>
                    {i > 0 && <View style={{ position: 'absolute', left: 0, top: 4, width: 1, height: 28, backgroundColor: t.glass.border }} />}
                    <Text style={{ fontSize: 16, fontWeight: '700', color: t.text.primary, marginBottom: 2 }}>{stat.val}</Text>
                    <Text style={{ fontSize: 9, color: t.text.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>{stat.label}</Text>
                  </View>
                ))}
              </View>
              {trends.sleep_data.length >= 2 && (() => {
                // 14-night BAR chart per spec.
                const recentSleep = trends.sleep_data.slice(-14);
                const sleepVals = recentSleep.map(d => Math.min(d.duration_hours, 12));
                return (
                  <BarChart
                    data={{ labels: [], datasets: [{ data: sleepVals }] }}
                    width={CARD_WIDTH - 32}
                    height={120}
                    yAxisLabel=""
                    yAxisSuffix="h"
                    fromZero
                    withInnerLines={false}
                    withHorizontalLabels={false}
                    withVerticalLabels={false}
                    chartConfig={{
                      backgroundColor: 'transparent',
                      backgroundGradientFrom: t.glass.card,
                      backgroundGradientTo: t.glass.card,
                      backgroundGradientFromOpacity: 0,
                      backgroundGradientToOpacity: 0,
                      decimalPlaces: 1,
                      color: (o = 1) => `rgba(0,196,140,${o})`,
                      labelColor: () => t.text.muted,
                      propsForBackgroundLines: { stroke: 'transparent' },
                      barPercentage: 0.6,
                    }}
                    style={styles.chart}
                  />
                );
              })()}
              {/* Bedtime consistency */}
              {trends.sleep_stats.avg_bedtime_variance_minutes != null && (
                <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: t.glass.border }}>
                  <Text style={{ fontSize: 11, color: t.text.secondary }}>
                    Bedtime consistency: varied by{' '}
                    <Text style={{ color: trends.sleep_stats.avg_bedtime_variance_minutes < 30 ? t.status.success : trends.sleep_stats.avg_bedtime_variance_minutes < 60 ? t.status.warn : t.status.danger, fontWeight: '600' }}>
                      ~{Math.round(trends.sleep_stats.avg_bedtime_variance_minutes)} min
                    </Text>
                    {' '}over 7 nights
                  </Text>
                </View>
              )}
            </View>
          </>
        ) : null}

        {/* RECOVERY HISTORY */}
        {trends?.data_availability.has_readiness_history ? (
          <>
            <Text style={styles.sectionLabel}>RECOVERY HISTORY</Text>
            <View style={styles.card}>
              {trends.readiness_history.length >= 2 && (() => {
                const pts = trends.readiness_history.slice(-30).map(d => d.score);
                return (
                  <LineChart
                    data={{ labels: [], datasets: [{ data: pts, color: () => t.text.secondary, strokeWidth: 2 }] }}
                    width={CARD_WIDTH - 32}
                    height={90}
                    withDots={false}
                    withInnerLines={false}
                    withOuterLines={false}
                    withHorizontalLabels={false}
                    withVerticalLabels={false}
                    chartConfig={{ backgroundColor: 'transparent', backgroundGradientFrom: t.glass.card, backgroundGradientTo: t.glass.card, color: () => t.text.secondary, strokeWidth: 2, propsForBackgroundLines: { stroke: 'transparent' } }}
                    bezier
                    style={{ ...styles.chart, marginBottom: 12 }}
                  />
                );
              })()}
              <View style={{ flexDirection: 'row' }}>
                {[
                  { label: 'BEST DAY', val: trends.readiness_stats.best_day_this_month ? `${trends.readiness_stats.best_day_this_month.score}` : '--', sub: trends.readiness_stats.best_day_this_month?.date ?? '' },
                  { label: 'WORST DAY', val: trends.readiness_stats.worst_day_this_month ? `${trends.readiness_stats.worst_day_this_month.score}` : '--', sub: trends.readiness_stats.worst_day_this_month?.date ?? '' },
                  { label: 'MONTHLY AVG', val: trends.readiness_stats.monthly_average != null ? `${Math.round(trends.readiness_stats.monthly_average)}` : '--', sub: '' },
                ].map((stat, i) => (
                  <View key={stat.label} style={{ flex: 1, alignItems: 'center' }}>
                    {i > 0 && <View style={{ position: 'absolute', left: 0, top: 4, width: 1, height: 28, backgroundColor: t.glass.border }} />}
                    <Text style={{ fontSize: 18, fontWeight: '700', color: t.text.primary }}>{stat.val}</Text>
                    <Text style={{ fontSize: 9, color: t.text.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 }}>{stat.label}</Text>
                    {stat.sub ? <Text style={{ fontSize: 9, color: t.text.muted, marginTop: 1 }}>{stat.sub}</Text> : null}
                  </View>
                ))}
              </View>
            </View>
          </>
        ) : null}

        {/* WELLNESS HISTORY (Hooper) */}
        {trends?.data_availability.has_hooper_history ? (
          <>
            <Text style={styles.sectionLabel}>WELLNESS HISTORY</Text>
            <View style={styles.card}>
              {trends.hooper_history.length >= 5 ? (() => {
                const recent = trends.hooper_history.slice(-14);
                // 4-series overlay per Hooper component (line per dimension).
                // chart-kit doesn't ship a stacked-area renderer; overlaid lines
                // surface the same per-component breakdown without extra deps.
                const sleepSeries   = recent.map(d => d.sleep_quality);
                const fatigueSeries = recent.map(d => d.fatigue);
                const stressSeries  = recent.map(d => d.stress);
                const soreSeries    = recent.map(d => d.soreness);
                return (
                  <>
                    <LineChart
                      data={{
                        labels: [],
                        datasets: [
                          { data: sleepSeries,   color: (o = 1) => `rgba(122,162,247,${o})`, strokeWidth: 2 },
                          { data: fatigueSeries, color: (o = 1) => `rgba(255,200,87,${o})`,  strokeWidth: 2 },
                          { data: stressSeries,  color: (o = 1) => `rgba(247,118,142,${o})`, strokeWidth: 2 },
                          { data: soreSeries,    color: (o = 1) => `rgba(0,196,140,${o})`,   strokeWidth: 2 },
                        ],
                        legend: [],
                      }}
                      width={CARD_WIDTH - 32}
                      height={120}
                      withDots={false}
                      withInnerLines={false}
                      withOuterLines={false}
                      withHorizontalLabels={false}
                      withVerticalLabels={false}
                      chartConfig={{ backgroundColor: 'transparent', backgroundGradientFrom: t.glass.card, backgroundGradientTo: t.glass.card, color: () => t.text.secondary, strokeWidth: 2, propsForBackgroundLines: { stroke: 'transparent' } }}
                      bezier
                      style={{ ...styles.chart, marginBottom: 8 }}
                    />
                    {/* Per-component legend */}
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 10, justifyContent: 'center' }}>
                      {[
                        { c: 'rgba(122,162,247,1)', label: 'Sleep' },
                        { c: 'rgba(255,200,87,1)',  label: 'Fatigue' },
                        { c: 'rgba(247,118,142,1)', label: 'Stress' },
                        { c: 'rgba(0,196,140,1)',   label: 'Soreness' },
                      ].map(({ c, label }) => (
                        <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <View style={{ width: 10, height: 2, backgroundColor: c }} />
                          <Text style={{ fontSize: 9, color: t.text.muted }}>{label}</Text>
                        </View>
                      ))}
                    </View>
                    <View style={{ flexDirection: 'row' }}>
                      <View style={{ flex: 1, alignItems: 'center' }}>
                        <Text style={{ fontSize: 18, fontWeight: '700', color: t.text.primary }}>
                          {trends.hooper_stats.current_total ?? '--'}
                        </Text>
                        <Text style={{ fontSize: 9, color: t.text.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 }}>TODAY</Text>
                      </View>
                      <View style={{ width: 1, height: 32, backgroundColor: t.glass.border }} />
                      <View style={{ flex: 1, alignItems: 'center' }}>
                        <Text style={{ fontSize: 18, fontWeight: '700', color: t.text.primary }}>
                          {trends.hooper_stats.seven_day_avg != null ? trends.hooper_stats.seven_day_avg.toFixed(1) : '--'}
                        </Text>
                        <Text style={{ fontSize: 9, color: t.text.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 }}>7D AVG</Text>
                      </View>
                    </View>
                    <Text style={{ fontSize: 10, color: t.text.muted, marginTop: 8, fontStyle: 'italic' }}>Lower is better (4 = excellent, 28 = very poor)</Text>
                  </>
                );
              })() : (
                <Text style={{ fontSize: 13, color: t.text.muted, fontStyle: 'italic' }}>
                  Log your wellness check-in daily to see trends here
                </Text>
              )}
            </View>
          </>
        ) : null}

        <View style={styles.bottomPadding} />
      </ScrollView>

      {/* Check-in Modal */}
      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowModal(false)}>
        <KeyboardAvoidingView style={styles.modalWrapper} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Daily Check-in</Text>
            <Text style={styles.modalSubtitle}>{formatDate()}</Text>

            {([
              { field: 'sleep_quality', label: 'Sleep Quality', hint: '1 = excellent, 7 = very poor' },
              { field: 'fatigue', label: 'Fatigue', hint: '1 = fresh, 7 = exhausted' },
              { field: 'stress', label: 'Stress', hint: '1 = relaxed, 7 = very stressed' },
              { field: 'muscle_soreness', label: 'Soreness', hint: '1 = none, 7 = severe' },
            ] as const).map(({ field, label, hint }) => (
              <View key={field} style={styles.fieldRow}>
                <View style={styles.fieldLabelGroup}>
                  <Text style={styles.fieldLabel}>{label}</Text>
                  <Text style={styles.fieldHint}>{hint}</Text>
                </View>
                <View style={styles.stepperRow}>
                  <TouchableOpacity style={styles.stepBtn} onPress={() => adjust(field, -1)} activeOpacity={0.7}>
                    <Text style={styles.stepBtnText}>−</Text>
                  </TouchableOpacity>
                  <View style={[styles.stepValue, { borderColor: wellnessColor(t, 8 - form[field]) }]}>
                    <Text style={[styles.stepValueText, { color: wellnessColor(t, 8 - form[field]) }]}>
                      {form[field]}/7
                    </Text>
                  </View>
                  <TouchableOpacity style={styles.stepBtn} onPress={() => adjust(field, 1)} activeOpacity={0.7}>
                    <Text style={styles.stepBtnText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}

            <Text style={styles.modalFieldLabel}>Notes (optional)</Text>
            <TextInput
              style={styles.textArea}
              placeholder="How are you feeling today…"
              placeholderTextColor={t.text.muted}
              multiline
              numberOfLines={3}
              value={form.notes}
              onChangeText={(v) => setForm((p) => ({ ...p, notes: v }))}
            />

            <TouchableOpacity
              style={[styles.saveBtn, submitting && styles.btnDisabled]}
              onPress={handleSave}
              disabled={submitting}
              activeOpacity={0.85}
            >
              {submitting ? (
                <ActivityIndicator size="small" color={t.bg.primary} />
              ) : (
                <Text style={styles.saveBtnText}>Save Check-in</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowModal(false)} activeOpacity={0.7}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
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
  loadingContainer: { flex: 1, backgroundColor: t.bg.primary, alignItems: 'center', justifyContent: 'center' },
  safeHeader: { paddingBottom: 20 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pageTitle: { fontSize: 28, fontWeight: '700', color: t.text.primary, marginBottom: 4 },
  pageSubtitle: { fontSize: 14, color: t.text.secondary },
  logButton: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: t.text.primary, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8,
  },
  logButtonText: { fontSize: 14, fontWeight: '700', color: t.bg.primary },

  recoveryCard: {
    backgroundColor: t.glass.card, borderRadius: 16, padding: 20,
    borderWidth: 1, marginBottom: 20,
  },
  recoveryScoreRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 16 },
  recoveryScoreCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: t.bg.primary, borderWidth: 2, borderColor: t.glass.card,
    alignItems: 'center', justifyContent: 'center',
  },
  recoveryScoreNum: { fontSize: 22, fontWeight: '800' },
  recoveryScoreLabel: { fontSize: 11, color: t.text.muted },
  recoveryTextBlock: { flex: 1, gap: 4 },
  recoveryStatus: { fontSize: 12, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' },
  recoveryDesc: { fontSize: 14, color: t.text.secondary, lineHeight: 20 },
  metricsRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: t.bg.primary, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: t.glass.card,
  },
  metricItem: { flex: 1, alignItems: 'center', gap: 3 },
  metricDivider: { width: 1, height: 28, backgroundColor: t.glass.card },
  metricValue: { fontSize: 18, fontWeight: '700', color: t.text.primary },
  metricLabel: { fontSize: 10, color: t.text.muted, textTransform: 'uppercase', letterSpacing: 0.5 },

  sectionLabel: {
    fontSize: 11, fontWeight: '600', color: t.text.muted,
    textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 10, marginTop: 4,
  },
  card: {
    backgroundColor: t.glass.card, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: t.glass.border, marginBottom: 12,
  },
  cardInnerLabel: {
    fontSize: 11, fontWeight: '600', color: t.text.muted,
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10,
  },
  checkinHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  editChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: t.glass.card, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  editChipText: { fontSize: 11, color: t.text.muted },
  checkinChipsRow: { flexDirection: 'row', gap: 10 },
  checkinChip: {
    flex: 1, alignItems: 'center', paddingVertical: 12,
    borderRadius: 12, borderWidth: 1, backgroundColor: t.bg.primary, gap: 3,
  },
  checkinChipValue: { fontSize: 16, fontWeight: '700' },
  checkinChipLabel: { fontSize: 11, color: t.text.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  checkinNotes: { fontSize: 13, color: t.text.muted, marginTop: 10, lineHeight: 18 },

  promptCard: { padding: 16 },
  promptRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  promptIcons: { flexDirection: 'row', gap: 6 },
  promptText: { flex: 1, fontSize: 15, color: t.text.secondary },

  deviceDataGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 10 },
  deviceMetricBox: { minWidth: 60, gap: 3 },
  deviceMetricValue: { fontSize: 20, fontWeight: '700', color: t.text.primary },
  deviceMetricLabel: { fontSize: 11, color: t.text.muted, textTransform: 'uppercase', letterSpacing: 0.4 },
  deviceDate: { fontSize: 11, color: t.text.muted },

  chartHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  avgChip: { backgroundColor: t.bg.tint, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  avgChipText: { fontSize: 12, color: t.status.success, fontWeight: '600' },
  chart: { borderRadius: 8, marginLeft: -16, marginRight: -16 },
  moodScaleRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  moodScaleLabel: { fontSize: 11, color: t.text.muted },

  historyDivider: { height: 1, backgroundColor: t.glass.card, marginVertical: 10 },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  historyDate: { fontSize: 13, color: t.text.secondary, width: 56 },
  historyDots: { flexDirection: 'row', gap: 6 },
  historyDot: { width: 8, height: 8, borderRadius: 4 },
  historyValues: { flex: 1, alignItems: 'flex-end' },
  historyValueText: { fontSize: 14, fontWeight: '600', color: t.text.primary },
  historyValueSub: { fontSize: 10, color: t.text.muted, textTransform: 'uppercase', letterSpacing: 0.5 },

  emptyState: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: t.text.primary, marginTop: 8 },
  emptySubtitle: { fontSize: 14, color: t.text.muted, textAlign: 'center', lineHeight: 20, paddingHorizontal: 24 },

  bottomPadding: { height: 24 },

  modalWrapper: { flex: 1, backgroundColor: t.bg.primary, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  modalContent: { padding: 24, paddingBottom: 48 },
  modalHandle: { width: 40, height: 4, backgroundColor: t.glass.card, borderRadius: 2, alignSelf: 'center', marginBottom: 24 },
  modalTitle: { fontSize: 22, fontWeight: '700', color: t.text.primary, marginBottom: 6 },
  modalSubtitle: { fontSize: 14, color: t.text.muted, marginBottom: 28 },
  fieldRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  fieldLabelGroup: { gap: 2 },
  fieldLabel: { fontSize: 16, color: t.text.primary, fontWeight: '500' },
  fieldHint: { fontSize: 12, color: t.text.muted },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: t.glass.card, alignItems: 'center', justifyContent: 'center' },
  stepBtnText: { fontSize: 20, color: t.text.primary, lineHeight: 24 },
  stepValue: { width: 52, height: 36, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  stepValueText: { fontSize: 14, fontWeight: '700' },
  modalFieldLabel: { fontSize: 13, color: t.text.secondary, marginBottom: 8, fontWeight: '500' },
  textArea: {
    backgroundColor: t.bg.tint, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 16, color: t.text.primary, borderWidth: 1, borderColor: t.glass.card,
    minHeight: 80, textAlignVertical: 'top', marginBottom: 24,
  },
  saveBtn: { backgroundColor: t.text.primary, borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginBottom: 12 },
  saveBtnText: { color: t.bg.primary, fontSize: 16, fontWeight: '700' },
  cancelBtn: { alignItems: 'center', paddingVertical: 12 },
  cancelBtnText: { color: t.text.secondary, fontSize: 15 },
  btnDisabled: { opacity: 0.5 },

  });
}
