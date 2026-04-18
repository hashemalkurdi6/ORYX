import { useCallback, useEffect, useState } from 'react';
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
import { LineChart } from 'react-native-chart-kit';
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

function wellnessColor(value: number): string {
  if (value >= 4) return '#27ae60';
  if (value === 3) return '#888888';
  return '#c0392b';
}

function recoveryHex(color: 'green' | 'yellow' | 'red'): string {
  if (color === 'green') return '#27ae60';
  if (color === 'yellow') return '#888888';
  return '#c0392b';
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
  const [checkins, setCheckins] = useState<WellnessCheckin[]>([]);
  const [whoopData, setWhoopData] = useState<WhoopData[]>([]);
  const [ouraData, setOuraData] = useState<OuraData[]>([]);
  const [snapshots, setSnapshots] = useState<HealthSnapshot[]>([]);
  const [diagnosis, setDiagnosis] = useState<DiagnosisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ mood: 3, energy: 3, soreness: 3, notes: '' });
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

  const adjust = (field: 'mood' | 'energy' | 'soreness', delta: number) => {
    setForm((prev) => ({ ...prev, [field]: Math.min(5, Math.max(1, prev[field] + delta)) }));
  };

  const openModal = () => {
    const today = todayISODate();
    const todayCheckin = checkins.find((c) => c.date === today);
    if (todayCheckin) {
      setForm({ mood: todayCheckin.mood, energy: todayCheckin.energy, soreness: todayCheckin.soreness, notes: todayCheckin.notes ?? '' });
    } else {
      setForm({ mood: 3, energy: 3, soreness: 3, notes: '' });
    }
    setShowModal(true);
  };

  const handleSave = async () => {
    setSubmitting(true);
    try {
      const saved = await submitWellnessCheckin({
        date: todayISODate(),
        mood: form.mood,
        energy: form.energy,
        soreness: form.soreness,
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
  const recoveryColor = diagnosis?.recovery_color ?? 'yellow';
  const accentColor = recoveryHex(recoveryColor);
  const recoveryScore = diagnosis?.recovery_score ?? 0;

  // HRV trend (last 7 days, reverse chronological → oldest first for chart)
  const hrvPoints = snapshots
    .filter((s) => s.hrv_ms !== null)
    .slice(0, 7)
    .reverse()
    .map((s) => s.hrv_ms as number);

  const avgHrv = hrvPoints.length > 0
    ? Math.round(hrvPoints.reduce((a, b) => a + b, 0) / hrvPoints.length)
    : null;

  // Mood trend (last 7 days, oldest first)
  const moodPoints = checkins.slice(0, 7).reverse().map((c) => c.mood);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FFFFFF" />
      </View>
    );
  }

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#FFFFFF" colors={['#f0f0f0']} />
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
              <Ionicons name="add" size={18} color="#0a0a0a" />
              <Text style={styles.logButtonText}>Log</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>

        {/* Recovery Status Card */}
        <View style={[styles.recoveryCard, { borderColor: accentColor }]}>
          <View style={styles.recoveryScoreRow}>
            <View style={[styles.recoveryScoreCircle, { borderColor: accentColor }]}>
              <Text style={[styles.recoveryScoreNum, { color: accentColor }]}>{recoveryScore}</Text>
              <Text style={styles.recoveryScoreLabel}>/ 100</Text>
            </View>
            <View style={styles.recoveryTextBlock}>
              <Text style={[styles.recoveryStatus, { color: accentColor }]}>{recoveryLabel(recoveryColor)}</Text>
              <Text style={styles.recoveryDesc}>{recoveryDescription(recoveryColor)}</Text>
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
                {(['mood', 'energy', 'soreness'] as const).map((field) => (
                  <View key={field} style={[styles.checkinChip, { borderColor: wellnessColor(todayCheckin[field]) }]}>
                    <Text style={[styles.checkinChipValue, { color: wellnessColor(todayCheckin[field]) }]}>{todayCheckin[field]}/5</Text>
                    <Text style={styles.checkinChipLabel}>
                      {field.charAt(0).toUpperCase() + field.slice(1)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.promptRow}>
                <View style={styles.promptIcons}>
                  <Ionicons name="happy-outline" size={20} color="#888888" />
                  <Ionicons name="flash-outline" size={20} color="#888888" />
                  <Ionicons name="body-outline" size={20} color="#888888" />
                </View>
                <Text style={styles.promptText}>Log how you feel today</Text>
                <Ionicons name="chevron-forward" size={16} color="#555555" />
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
                    <Text style={[styles.deviceMetricValue, { color: '#FF6B35' }]}>
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
                    <Text style={[styles.deviceMetricValue, { color: '#27ae60' }]}>
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
                    <Text style={[styles.deviceMetricValue, { color: '#00B894' }]}>
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
                    <Text style={[styles.deviceMetricValue, { color: '#27ae60' }]}>
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
                data={{ labels: [], datasets: [{ data: hrvPoints, color: () => '#27ae60', strokeWidth: 2 }] }}
                width={CARD_WIDTH - 32}
                height={90}
                withDots={false}
                withInnerLines={false}
                withOuterLines={false}
                withHorizontalLabels={false}
                withVerticalLabels={false}
                chartConfig={{
                  backgroundColor: 'transparent',
                  backgroundGradientFrom: '#1a1a1a',
                  backgroundGradientTo: '#1a1a1a',
                  color: () => '#27ae60',
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
            <Text style={styles.sectionLabel}>MOOD TREND</Text>
            <View style={styles.card}>
              <Text style={styles.cardInnerLabel}>7-Day Mood History</Text>
              <LineChart
                data={{ labels: [], datasets: [{ data: moodPoints, color: () => '#e0e0e0', strokeWidth: 2 }] }}
                width={CARD_WIDTH - 32}
                height={100}
                withDots
                withInnerLines={false}
                withOuterLines={false}
                withHorizontalLabels={false}
                withVerticalLabels={false}
                chartConfig={{
                  backgroundColor: '#111111',
                  backgroundGradientFrom: '#111111',
                  backgroundGradientTo: '#111111',
                  color: () => '#e0e0e0',
                  strokeWidth: 2,
                  propsForBackgroundLines: { stroke: 'transparent' },
                  propsForDots: { r: '4', strokeWidth: '0', fill: '#e0e0e0' },
                }}
                bezier
                style={styles.chart}
              />
              <View style={styles.moodScaleRow}>
                <Text style={styles.moodScaleLabel}>1 Low</Text>
                <Text style={styles.moodScaleLabel}>5 High</Text>
              </View>
            </View>
          </>
        )}

        {/* 7-Day Checkin History */}
        {checkins.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>RECENT CHECK-INS</Text>
            <View style={styles.card}>
              {checkins.slice(0, 7).map((checkin, idx) => (
                <View key={checkin.id}>
                  {idx > 0 && <View style={styles.historyDivider} />}
                  <View style={styles.historyRow}>
                    <Text style={styles.historyDate}>{formatShortDate(checkin.date)}</Text>
                    <View style={styles.historyDots}>
                      <View style={[styles.historyDot, { backgroundColor: wellnessColor(checkin.mood) }]} />
                      <View style={[styles.historyDot, { backgroundColor: wellnessColor(checkin.energy) }]} />
                      <View style={[styles.historyDot, { backgroundColor: wellnessColor(checkin.soreness) }]} />
                    </View>
                    <View style={styles.historyValues}>
                      <Text style={styles.historyValueText}>
                        {checkin.mood}/{checkin.energy}/{checkin.soreness}
                      </Text>
                      <Text style={styles.historyValueSub}>M/E/S</Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        {checkins.length === 0 && !latestWhoop && !latestOura && (
          <View style={styles.emptyState}>
            <Ionicons name="pulse-outline" size={48} color="#222222" />
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
                    {i > 0 && <View style={{ position: 'absolute', left: 0, top: 4, width: 1, height: 28, backgroundColor: '#2a2a2a' }} />}
                    <Text style={{ fontSize: 16, fontWeight: '700', color: '#f0f0f0', marginBottom: 2 }}>{stat.val}</Text>
                    <Text style={{ fontSize: 9, color: '#555', textTransform: 'uppercase', letterSpacing: 0.5 }}>{stat.label}</Text>
                  </View>
                ))}
              </View>
              {/* Chart */}
              {trends.hrv_data.length >= 2 && (() => {
                const pts = trends.hrv_data.slice(-30).map(d => d.hrv_ms);
                return (
                  <LineChart
                    data={{ labels: [], datasets: [{ data: pts, color: () => '#27ae60', strokeWidth: 2 }] }}
                    width={CARD_WIDTH - 32}
                    height={100}
                    withDots={false}
                    withInnerLines={false}
                    withOuterLines={false}
                    withHorizontalLabels={false}
                    withVerticalLabels={false}
                    chartConfig={{ backgroundColor: 'transparent', backgroundGradientFrom: '#1a1a1a', backgroundGradientTo: '#1a1a1a', color: () => '#27ae60', strokeWidth: 2, propsForBackgroundLines: { stroke: 'transparent' } }}
                    bezier
                    style={styles.chart}
                  />
                );
              })()}
            </View>
          </>
        ) : trends && !trendsLoading ? (
          <>
            <Text style={styles.sectionLabel}>HRV TRENDS</Text>
            <View style={[styles.card, { alignItems: 'center', paddingVertical: 20 }]}>
              <Ionicons name="heart-outline" size={28} color="#2a2a2a" />
              <Text style={{ fontSize: 13, color: '#555', marginTop: 8, textAlign: 'center' }}>
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
                    {i > 0 && <View style={{ position: 'absolute', left: 0, top: 4, width: 1, height: 28, backgroundColor: '#2a2a2a' }} />}
                    <Text style={{ fontSize: 16, fontWeight: '700', color: '#f0f0f0', marginBottom: 2 }}>{stat.val}</Text>
                    <Text style={{ fontSize: 9, color: '#555', textTransform: 'uppercase', letterSpacing: 0.5 }}>{stat.label}</Text>
                  </View>
                ))}
              </View>
              {trends.sleep_data.length >= 2 && (() => {
                const recentSleep = trends.sleep_data.slice(-14);
                const sleepVals = recentSleep.map(d => Math.min(d.duration_hours, 12));
                return (
                  <LineChart
                    data={{ labels: [], datasets: [{ data: sleepVals, color: () => '#27ae60', strokeWidth: 2 }] }}
                    width={CARD_WIDTH - 32}
                    height={90}
                    withDots={true}
                    withInnerLines={false}
                    withOuterLines={false}
                    withHorizontalLabels={false}
                    withVerticalLabels={false}
                    chartConfig={{ backgroundColor: 'transparent', backgroundGradientFrom: '#1a1a1a', backgroundGradientTo: '#1a1a1a', color: () => '#27ae60', strokeWidth: 2, propsForBackgroundLines: { stroke: 'transparent' }, propsForDots: { r: '3', fill: '#27ae60' } }}
                    bezier
                    style={styles.chart}
                  />
                );
              })()}
              {/* Bedtime consistency */}
              {trends.sleep_stats.avg_bedtime_variance_minutes != null && (
                <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#2a2a2a' }}>
                  <Text style={{ fontSize: 11, color: '#888' }}>
                    Bedtime consistency: varied by{' '}
                    <Text style={{ color: trends.sleep_stats.avg_bedtime_variance_minutes < 30 ? '#27ae60' : trends.sleep_stats.avg_bedtime_variance_minutes < 60 ? '#e67e22' : '#c0392b', fontWeight: '600' }}>
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
                    data={{ labels: [], datasets: [{ data: pts, color: () => '#888888', strokeWidth: 2 }] }}
                    width={CARD_WIDTH - 32}
                    height={90}
                    withDots={false}
                    withInnerLines={false}
                    withOuterLines={false}
                    withHorizontalLabels={false}
                    withVerticalLabels={false}
                    chartConfig={{ backgroundColor: 'transparent', backgroundGradientFrom: '#1a1a1a', backgroundGradientTo: '#1a1a1a', color: () => '#888888', strokeWidth: 2, propsForBackgroundLines: { stroke: 'transparent' } }}
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
                    {i > 0 && <View style={{ position: 'absolute', left: 0, top: 4, width: 1, height: 28, backgroundColor: '#2a2a2a' }} />}
                    <Text style={{ fontSize: 18, fontWeight: '700', color: '#f0f0f0' }}>{stat.val}</Text>
                    <Text style={{ fontSize: 9, color: '#555', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 }}>{stat.label}</Text>
                    {stat.sub ? <Text style={{ fontSize: 9, color: '#444', marginTop: 1 }}>{stat.sub}</Text> : null}
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
                const totals = recent.map(d => d.total);
                return (
                  <>
                    <LineChart
                      data={{ labels: [], datasets: [{ data: totals, color: () => '#888888', strokeWidth: 2 }] }}
                      width={CARD_WIDTH - 32}
                      height={90}
                      withDots={true}
                      withInnerLines={false}
                      withOuterLines={false}
                      withHorizontalLabels={false}
                      withVerticalLabels={false}
                      chartConfig={{ backgroundColor: 'transparent', backgroundGradientFrom: '#1a1a1a', backgroundGradientTo: '#1a1a1a', color: () => '#888888', strokeWidth: 2, propsForBackgroundLines: { stroke: 'transparent' }, propsForDots: { r: '3', fill: '#555' } }}
                      bezier
                      style={{ ...styles.chart, marginBottom: 12 }}
                    />
                    <View style={{ flexDirection: 'row' }}>
                      <View style={{ flex: 1, alignItems: 'center' }}>
                        <Text style={{ fontSize: 18, fontWeight: '700', color: '#f0f0f0' }}>
                          {trends.hooper_stats.current_total ?? '--'}
                        </Text>
                        <Text style={{ fontSize: 9, color: '#555', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 }}>TODAY</Text>
                      </View>
                      <View style={{ width: 1, height: 32, backgroundColor: '#2a2a2a' }} />
                      <View style={{ flex: 1, alignItems: 'center' }}>
                        <Text style={{ fontSize: 18, fontWeight: '700', color: '#f0f0f0' }}>
                          {trends.hooper_stats.seven_day_avg != null ? trends.hooper_stats.seven_day_avg.toFixed(1) : '--'}
                        </Text>
                        <Text style={{ fontSize: 9, color: '#555', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 }}>7D AVG</Text>
                      </View>
                    </View>
                    <Text style={{ fontSize: 10, color: '#444', marginTop: 8, fontStyle: 'italic' }}>Lower is better (4 = excellent, 28 = very poor)</Text>
                  </>
                );
              })() : (
                <Text style={{ fontSize: 13, color: '#555', fontStyle: 'italic' }}>
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

            {(['mood', 'energy', 'soreness'] as const).map((field) => (
              <View key={field} style={styles.fieldRow}>
                <View style={styles.fieldLabelGroup}>
                  <Text style={styles.fieldLabel}>{field.charAt(0).toUpperCase() + field.slice(1)}</Text>
                  <Text style={styles.fieldHint}>
                    {field === 'mood' ? 'Mental state' : field === 'energy' ? 'Physical energy' : 'Muscle soreness'}
                  </Text>
                </View>
                <View style={styles.stepperRow}>
                  <TouchableOpacity style={styles.stepBtn} onPress={() => adjust(field, -1)} activeOpacity={0.7}>
                    <Text style={styles.stepBtnText}>−</Text>
                  </TouchableOpacity>
                  <View style={[styles.stepValue, { borderColor: wellnessColor(form[field]) }]}>
                    <Text style={[styles.stepValueText, { color: wellnessColor(form[field]) }]}>
                      {form[field]}/5
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
              placeholderTextColor="#555555"
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
                <ActivityIndicator size="small" color="#0a0a0a" />
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  contentContainer: { paddingHorizontal: 20, paddingBottom: 40 },
  loadingContainer: { flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center' },
  safeHeader: { paddingBottom: 20 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pageTitle: { fontSize: 28, fontWeight: '700', color: '#f0f0f0', marginBottom: 4 },
  pageSubtitle: { fontSize: 14, color: '#888888' },
  logButton: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#f0f0f0', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8,
  },
  logButtonText: { fontSize: 14, fontWeight: '700', color: '#0a0a0a' },

  recoveryCard: {
    backgroundColor: '#1a1a1a', borderRadius: 16, padding: 20,
    borderWidth: 1, marginBottom: 20,
  },
  recoveryScoreRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 16 },
  recoveryScoreCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#0a0a0a', borderWidth: 2, borderColor: '#1a1a1a',
    alignItems: 'center', justifyContent: 'center',
  },
  recoveryScoreNum: { fontSize: 22, fontWeight: '800' },
  recoveryScoreLabel: { fontSize: 11, color: '#555555' },
  recoveryTextBlock: { flex: 1, gap: 4 },
  recoveryStatus: { fontSize: 12, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' },
  recoveryDesc: { fontSize: 14, color: '#888888', lineHeight: 20 },
  metricsRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#0a0a0a', borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#1a1a1a',
  },
  metricItem: { flex: 1, alignItems: 'center', gap: 3 },
  metricDivider: { width: 1, height: 28, backgroundColor: '#1a1a1a' },
  metricValue: { fontSize: 18, fontWeight: '700', color: '#f0f0f0' },
  metricLabel: { fontSize: 10, color: '#555555', textTransform: 'uppercase', letterSpacing: 0.5 },

  sectionLabel: {
    fontSize: 11, fontWeight: '600', color: '#555555',
    textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 10, marginTop: 4,
  },
  card: {
    backgroundColor: '#1a1a1a', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: '#2a2a2a', marginBottom: 12,
  },
  cardInnerLabel: {
    fontSize: 11, fontWeight: '600', color: '#555555',
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10,
  },
  checkinHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  editChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#1a1a1a', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  editChipText: { fontSize: 11, color: '#555555' },
  checkinChipsRow: { flexDirection: 'row', gap: 10 },
  checkinChip: {
    flex: 1, alignItems: 'center', paddingVertical: 12,
    borderRadius: 12, borderWidth: 1, backgroundColor: '#0a0a0a', gap: 3,
  },
  checkinChipValue: { fontSize: 16, fontWeight: '700' },
  checkinChipLabel: { fontSize: 11, color: '#555555', textTransform: 'uppercase', letterSpacing: 0.5 },
  checkinNotes: { fontSize: 13, color: '#555555', marginTop: 10, lineHeight: 18 },

  promptCard: { padding: 16 },
  promptRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  promptIcons: { flexDirection: 'row', gap: 6 },
  promptText: { flex: 1, fontSize: 15, color: '#888888' },

  deviceDataGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 10 },
  deviceMetricBox: { minWidth: 60, gap: 3 },
  deviceMetricValue: { fontSize: 20, fontWeight: '700', color: '#f0f0f0' },
  deviceMetricLabel: { fontSize: 11, color: '#555555', textTransform: 'uppercase', letterSpacing: 0.4 },
  deviceDate: { fontSize: 11, color: '#555555' },

  chartHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  avgChip: { backgroundColor: 'rgba(0,196,140,0.15)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  avgChipText: { fontSize: 12, color: '#27ae60', fontWeight: '600' },
  chart: { borderRadius: 8, marginLeft: -16, marginRight: -16 },
  moodScaleRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  moodScaleLabel: { fontSize: 11, color: '#555555' },

  historyDivider: { height: 1, backgroundColor: '#1a1a1a', marginVertical: 10 },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  historyDate: { fontSize: 13, color: '#888888', width: 56 },
  historyDots: { flexDirection: 'row', gap: 6 },
  historyDot: { width: 8, height: 8, borderRadius: 4 },
  historyValues: { flex: 1, alignItems: 'flex-end' },
  historyValueText: { fontSize: 14, fontWeight: '600', color: '#f0f0f0' },
  historyValueSub: { fontSize: 10, color: '#555555', textTransform: 'uppercase', letterSpacing: 0.5 },

  emptyState: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#f0f0f0', marginTop: 8 },
  emptySubtitle: { fontSize: 14, color: '#555555', textAlign: 'center', lineHeight: 20, paddingHorizontal: 24 },

  bottomPadding: { height: 24 },

  modalWrapper: { flex: 1, backgroundColor: '#0a0a0a', borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  modalContent: { padding: 24, paddingBottom: 48 },
  modalHandle: { width: 40, height: 4, backgroundColor: '#1a1a1a', borderRadius: 2, alignSelf: 'center', marginBottom: 24 },
  modalTitle: { fontSize: 22, fontWeight: '700', color: '#f0f0f0', marginBottom: 6 },
  modalSubtitle: { fontSize: 14, color: '#555555', marginBottom: 28 },
  fieldRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  fieldLabelGroup: { gap: 2 },
  fieldLabel: { fontSize: 16, color: '#f0f0f0', fontWeight: '500' },
  fieldHint: { fontSize: 12, color: '#555555' },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#1a1a1a', alignItems: 'center', justifyContent: 'center' },
  stepBtnText: { fontSize: 20, color: '#f0f0f0', lineHeight: 24 },
  stepValue: { width: 52, height: 36, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  stepValueText: { fontSize: 14, fontWeight: '700' },
  modalFieldLabel: { fontSize: 13, color: '#888888', marginBottom: 8, fontWeight: '500' },
  textArea: {
    backgroundColor: '#111111', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 16, color: '#f0f0f0', borderWidth: 1, borderColor: '#1a1a1a',
    minHeight: 80, textAlignVertical: 'top', marginBottom: 24,
  },
  saveBtn: { backgroundColor: '#f0f0f0', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginBottom: 12 },
  saveBtnText: { color: '#0a0a0a', fontSize: 16, fontWeight: '700' },
  cancelBtn: { alignItems: 'center', paddingVertical: 12 },
  cancelBtnText: { color: '#888888', fontSize: 15 },
  btnDisabled: { opacity: 0.5 },

});
