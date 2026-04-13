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
  WellnessCheckin,
  WhoopData,
  OuraData,
  HealthSnapshot,
  DiagnosisResult,
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

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    const [checkinsRes, whoopRes, ouraRes, snapshotsRes, diagnosisRes] =
      await Promise.allSettled([
        getWellnessCheckins(7),
        getWhoopData(7),
        getOuraData(7),
        getHealthSnapshots(7),
        getDailyDiagnosis(),
      ]);

    if (checkinsRes.status === 'fulfilled') setCheckins(checkinsRes.value);
    if (whoopRes.status === 'fulfilled') setWhoopData(whoopRes.value);
    if (ouraRes.status === 'fulfilled') setOuraData(ouraRes.value);
    if (snapshotsRes.status === 'fulfilled') setSnapshots(snapshotsRes.value);
    if (diagnosisRes.status === 'fulfilled') setDiagnosis(diagnosisRes.value);

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
        <View style={[styles.recoveryCard, { borderColor: accentColor + '40' }]}>
          <View style={styles.recoveryScoreRow}>
            <View style={styles.recoveryScoreCircle}>
              <Text style={[styles.recoveryScoreNum, { color: accentColor }]}>{recoveryScore}</Text>
              <Text style={styles.recoveryScoreLabel}>/ 100</Text>
            </View>
            <View style={styles.recoveryTextBlock}>
              <Text style={[styles.recoveryStatus, { color: accentColor }]}>
                {recoveryLabel(recoveryColor)}
              </Text>
              <Text style={styles.recoveryDesc}>
                {recoveryDescription(recoveryColor)}
              </Text>
            </View>
          </View>

          {/* Key metrics row */}
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
        {todayCheckin ? (
          <TouchableOpacity style={styles.card} onPress={openModal} activeOpacity={0.8}>
            <View style={styles.checkinHeaderRow}>
              <Text style={styles.cardInnerLabel}>HOW YOU FEEL</Text>
              <View style={styles.editChip}>
                <Ionicons name="pencil" size={11} color="#555555" />
                <Text style={styles.editChipText}>Edit</Text>
              </View>
            </View>
            <View style={styles.checkinChipsRow}>
              {(['mood', 'energy', 'soreness'] as const).map((field) => (
                <View key={field} style={[styles.checkinChip, { borderColor: wellnessColor(todayCheckin[field]) + '60' }]}>
                  <Text style={[styles.checkinChipValue, { color: wellnessColor(todayCheckin[field]) }]}>
                    {todayCheckin[field]}/5
                  </Text>
                  <Text style={styles.checkinChipLabel}>
                    {field.charAt(0).toUpperCase() + field.slice(1)}
                  </Text>
                </View>
              ))}
            </View>
            {todayCheckin.notes ? (
              <Text style={styles.checkinNotes} numberOfLines={2}>{todayCheckin.notes}</Text>
            ) : null}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[styles.card, styles.promptCard]} onPress={openModal} activeOpacity={0.8}>
            <View style={styles.promptRow}>
              <View style={styles.promptIcons}>
                <Ionicons name="happy-outline" size={20} color="#555555" />
                <Ionicons name="flash-outline" size={20} color="#555555" />
                <Ionicons name="body-outline" size={20} color="#555555" />
              </View>
              <Text style={styles.promptText}>Log how you feel today</Text>
              <Ionicons name="chevron-forward" size={16} color="#555555" />
            </View>
          </TouchableOpacity>
        )}

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
                height={110}
                withDots={false}
                withInnerLines={false}
                withOuterLines={false}
                withHorizontalLabels={false}
                withVerticalLabels={false}
                chartConfig={{
                  backgroundColor: '#111111',
                  backgroundGradientFrom: '#111111',
                  backgroundGradientTo: '#111111',
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
    backgroundColor: '#111111', borderRadius: 20, padding: 20,
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
    backgroundColor: '#111111', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: '#1a1a1a', marginBottom: 12,
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
