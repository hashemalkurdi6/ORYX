/**
 * Weight Tracking — standalone screen.
 * Target of `router.push('/weight')` from Home.
 *
 * Surfaces:
 *   - Time range selector (7D / 1M / 3M / 6M / 1Y / All)
 *   - Trend line chart (raw daily + rolling average)
 *   - Stats row (Current / Change / Weekly avg / Rate per week)
 *   - Goal alignment card (requires data_confidence >= limited)
 *   - Current + longest logging streak
 *   - Log Weight CTA (reuses WeightLogSheet)
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LineChart } from 'react-native-chart-kit';
import { Stack, router } from 'expo-router';

import {
  getWeightHistory,
  getWeightSummary,
  updateWeightSettings,
  WeightHistory,
  WeightSummary,
} from '@/services/api';
import WeightLogSheet from '@/components/WeightLogSheet';
import { useTheme } from '@/contexts/ThemeContext';
import { ThemeColors, type as TY, radius as R, space as SP } from '@/services/theme';

// ── Range ────────────────────────────────────────────────────────────────────

type RangeKey = '7d' | '1m' | '3m' | '6m' | '1y' | 'all';
const RANGES: { key: RangeKey; label: string }[] = [
  { key: '7d', label: '7D' },
  { key: '1m', label: '1M' },
  { key: '3m', label: '3M' },
  { key: '6m', label: '6M' },
  { key: '1y', label: '1Y' },
  { key: 'all', label: 'All' },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function kgToLbs(kg: number): number {
  return Math.round(kg * 2.20462 * 10) / 10;
}

function toDisplay(valueKg: number | null | undefined, unit: 'kg' | 'lbs'): string {
  if (valueKg == null) return '—';
  const v = unit === 'lbs' ? kgToLbs(valueKg) : valueKg;
  return v.toFixed(1);
}

function signedKg(valueKg: number | null | undefined, unit: 'kg' | 'lbs'): string {
  if (valueKg == null) return '—';
  const v = unit === 'lbs' ? kgToLbs(valueKg) : valueKg;
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(2)}`;
}

// Label stride so we don't crowd the axis on long ranges.
function stride(n: number): number {
  if (n <= 8) return 1;
  if (n <= 20) return 3;
  if (n <= 60) return 7;
  if (n <= 180) return 14;
  return 30;
}

// ── Screen ───────────────────────────────────────────────────────────────────

export default function WeightScreen() {
  const { theme } = useTheme();
  const s = useMemo(() => createStyles(theme), [theme]);

  const [range, setRange] = useState<RangeKey>('1m');
  const [history, setHistory] = useState<WeightHistory | null>(null);
  const [summary, setSummary] = useState<WeightSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showLogSheet, setShowLogSheet] = useState(false);

  const unit: 'kg' | 'lbs' = summary?.display_unit ?? history?.display_unit ?? 'kg';

  const load = useCallback(async (r: RangeKey) => {
    const [h, sm] = await Promise.all([
      getWeightHistory(365, r).catch(() => null),
      getWeightSummary().catch(() => null),
    ]);
    setHistory(h);
    setSummary(sm);
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    load(range).finally(() => {
      if (alive) setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [range, load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(range);
    setRefreshing(false);
  }, [range, load]);

  const toggleUnit = useCallback(async () => {
    const next: 'kg' | 'lbs' = unit === 'kg' ? 'lbs' : 'kg';
    try {
      await updateWeightSettings(next);
      await load(range);
    } catch {
      // non-fatal
    }
  }, [unit, range, load]);

  const hasEntries = (history?.entries.length ?? 0) > 0;

  // ── Chart data ────────────────────────────────────────────────────────────

  const chart = useMemo(() => {
    if (!history || history.entries.length === 0) return null;
    const entries = history.entries;
    const rolling = history.rolling_avg;
    const stepN = stride(entries.length);
    const labels = entries.map((e, i) => {
      if (i % stepN !== 0 && i !== entries.length - 1) return '';
      const d = new Date(e.date);
      return `${d.getMonth() + 1}/${d.getDate()}`;
    });
    const raw = entries.map((e) => e.display_value);
    // rolling_avg entries align 1:1 by index with entries in the backend.
    const rollingValues = rolling.map((r) => r.rolling_avg);
    // react-native-chart-kit requires matching lengths per dataset.
    const rollingAligned =
      rollingValues.length === raw.length
        ? rollingValues
        : [...rollingValues, ...Array(raw.length - rollingValues.length).fill(rollingValues.at(-1) ?? raw.at(-1) ?? 0)];

    return { labels, raw, rolling: rollingAligned };
  }, [history]);

  // ── Stats derived ─────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const entries = history?.entries ?? [];
    const weekly = history?.weekly_averages ?? [];
    const last = entries.at(-1)?.weight_kg ?? summary?.current_weight_kg ?? null;
    const first = entries[0]?.weight_kg ?? null;
    const changeKg = last != null && first != null ? last - first : null;
    const thisWeekAvgKg = weekly.at(-1)?.avg_kg ?? null;
    const ratePerWeekKg =
      history?.rate_of_change_kg_per_week ?? summary?.rate_of_change_kg_per_week ?? null;
    return {
      currentKg: last,
      changeKg,
      thisWeekAvgKg,
      ratePerWeekKg,
    };
  }, [history, summary]);

  // ── Render ────────────────────────────────────────────────────────────────

  const screenWidth = Dimensions.get('window').width;
  const chartWidth = screenWidth - SP[5] * 2 - SP[4] * 2;

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flex: 1, backgroundColor: theme.bg.primary }}>
        <SafeAreaView edges={['top']} style={{ backgroundColor: theme.bg.primary }}>
          <View style={s.header}>
            <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
              <Ionicons name="chevron-back" size={24} color={theme.text.primary} />
            </TouchableOpacity>
            <Text style={s.headerTitle}>Weight</Text>
            <TouchableOpacity onPress={toggleUnit} style={s.unitToggle} activeOpacity={0.7}>
              <Text style={s.unitToggleText}>{unit.toUpperCase()}</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={s.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.text.secondary} />}
        >
          {/* Range selector */}
          <View style={s.rangeRow}>
            {RANGES.map((r) => (
              <TouchableOpacity
                key={r.key}
                onPress={() => setRange(r.key)}
                activeOpacity={0.7}
                style={[s.rangeChip, range === r.key && s.rangeChipActive]}
              >
                <Text style={[s.rangeChipText, range === r.key && s.rangeChipTextActive]}>{r.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Trend card */}
          <View style={s.card}>
            <View style={s.cardHeader}>
              <Text style={s.cardLabel}>TREND</Text>
              {history?.fell_back_to_all ? (
                <Text style={s.fellBackNote}>No data in range — showing all</Text>
              ) : null}
            </View>

            {loading ? (
              <View style={s.chartPlaceholder}>
                <ActivityIndicator color={theme.text.secondary} />
              </View>
            ) : !hasEntries || !chart ? (
              <View style={s.chartPlaceholder}>
                <Ionicons name="scale-outline" size={28} color={theme.text.muted} />
                <Text style={s.emptyText}>Log your weight to see trends</Text>
              </View>
            ) : (
              <LineChart
                data={{
                  labels: chart.labels,
                  datasets: [
                    {
                      data: chart.raw,
                      color: (opacity = 1) => toRgba(theme.text.muted, opacity * 0.55),
                      strokeWidth: 1,
                    },
                    {
                      data: chart.rolling,
                      color: (opacity = 1) => toRgba(theme.accent, opacity),
                      strokeWidth: 2.5,
                    },
                  ],
                }}
                width={chartWidth}
                height={200}
                bezier
                withShadow={false}
                withDots={chart.raw.length <= 30}
                withInnerLines
                withOuterLines={false}
                withVerticalLines={false}
                fromZero={false}
                chartConfig={{
                  backgroundGradientFrom: 'transparent',
                  backgroundGradientTo: 'transparent',
                  backgroundGradientFromOpacity: 0,
                  backgroundGradientToOpacity: 0,
                  decimalPlaces: 1,
                  color: (opacity = 1) => toRgba(theme.text.primary, opacity),
                  labelColor: () => theme.text.muted,
                  propsForBackgroundLines: {
                    stroke: theme.border,
                    strokeDasharray: '4 4',
                  },
                  propsForDots: { r: '2.5', strokeWidth: '0' },
                }}
                style={{ marginLeft: -SP[2] }}
              />
            )}

            {/* Legend */}
            {hasEntries && (
              <View style={s.legend}>
                <View style={s.legendItem}>
                  <View style={[s.legendDot, { backgroundColor: theme.accent }]} />
                  <Text style={s.legendText}>Rolling avg</Text>
                </View>
                <View style={s.legendItem}>
                  <View style={[s.legendDot, { backgroundColor: theme.text.muted }]} />
                  <Text style={s.legendText}>Daily</Text>
                </View>
              </View>
            )}
          </View>

          {/* Stats grid */}
          <View style={s.statsGrid}>
            <StatBlock
              theme={theme}
              label="Current"
              value={toDisplay(stats.currentKg, unit)}
              unit={unit}
            />
            <StatBlock
              theme={theme}
              label="Change"
              value={signedKg(stats.changeKg, unit)}
              unit={unit}
              valueColor={
                stats.changeKg == null
                  ? theme.text.primary
                  : stats.changeKg === 0
                    ? theme.text.primary
                    : stats.changeKg > 0
                      ? theme.readiness.mid
                      : theme.accent
              }
            />
            <StatBlock
              theme={theme}
              label="This week avg"
              value={toDisplay(stats.thisWeekAvgKg, unit)}
              unit={unit}
            />
            <StatBlock
              theme={theme}
              label="Rate / week"
              value={signedKg(stats.ratePerWeekKg, unit)}
              unit={unit}
            />
          </View>

          {/* Goal alignment */}
          <GoalAlignmentCard theme={theme} summary={summary} unit={unit} />

          {/* Streak */}
          <View style={s.card}>
            <Text style={s.cardLabel}>LOGGING STREAK</Text>
            <View style={s.streakRow}>
              <View style={s.streakBlock}>
                <Text style={s.streakNumber}>{summary?.current_streak ?? 0}</Text>
                <Text style={s.streakLabel}>current days</Text>
              </View>
              <View style={[s.streakBlock, { alignItems: 'flex-end' }]}>
                <Text style={s.streakNumber}>{summary?.longest_streak ?? 0}</Text>
                <Text style={s.streakLabel}>longest streak</Text>
              </View>
            </View>
            <Text style={s.streakSub}>
              {summary?.days_logged_this_month ?? 0} days logged this month
            </Text>
          </View>

          <View style={{ height: SP[9] }} />
        </ScrollView>

        {/* Log Weight CTA */}
        <View style={s.ctaWrap}>
          <SafeAreaView edges={['bottom']}>
            <TouchableOpacity
              style={[s.logBtn, summary?.logged_today && s.logBtnDone]}
              activeOpacity={0.85}
              onPress={() => setShowLogSheet(true)}
            >
              <Ionicons
                name={summary?.logged_today ? 'checkmark' : 'add'}
                size={18}
                color={summary?.logged_today ? theme.accentInk : theme.accentInk}
              />
              <Text style={s.logBtnText}>
                {summary?.logged_today ? 'Logged today — Log again' : 'Log Weight'}
              </Text>
            </TouchableOpacity>
          </SafeAreaView>
        </View>

        <WeightLogSheet
          visible={showLogSheet}
          onClose={() => setShowLogSheet(false)}
          currentWeightKg={summary?.current_weight_kg ?? null}
          displayUnit={unit}
          onLogged={() => {
            setShowLogSheet(false);
            onRefresh();
          }}
        />
      </View>
    </>
  );
}

// ── Subcomponents ────────────────────────────────────────────────────────────

function StatBlock({
  theme,
  label,
  value,
  unit,
  valueColor,
}: {
  theme: ThemeColors;
  label: string;
  value: string;
  unit: 'kg' | 'lbs';
  valueColor?: string;
}) {
  return (
    <View style={{
      flex: 1,
      minWidth: '45%',
      backgroundColor: theme.glass.card,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: R.md,
      paddingVertical: SP[4] - 2,
      paddingHorizontal: SP[4],
      gap: 4,
    }}>
      <Text style={{ fontFamily: TY.mono.semibold, fontSize: TY.size.tick, color: theme.text.muted, letterSpacing: TY.tracking.label, textTransform: 'uppercase' }}>
        {label}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
        <Text style={{
          fontFamily: TY.mono.bold,
          fontSize: 22,
          fontVariant: ['tabular-nums'],
          color: valueColor ?? theme.text.primary,
          letterSpacing: TY.tracking.tight,
        }}>
          {value}
        </Text>
        <Text style={{ fontFamily: TY.mono.medium, fontSize: TY.size.small, color: theme.text.muted }}>
          {unit}
        </Text>
      </View>
    </View>
  );
}

function GoalAlignmentCard({
  theme,
  summary,
  unit,
}: {
  theme: ThemeColors;
  summary: WeightSummary | null;
  unit: 'kg' | 'lbs';
}) {
  const s = useMemo(() => createStyles(theme), [theme]);
  if (!summary) return null;

  if (summary.data_confidence === 'insufficient' || summary.data_confidence === 'early') {
    const need = summary.data_confidence === 'insufficient' ? 3 : 7;
    return (
      <View style={s.card}>
        <Text style={s.cardLabel}>GOAL ALIGNMENT</Text>
        <Text style={s.goalMuted}>
          Log at least {need} entries for a confident read on your weight trend.
          You have {summary.total_logs}.
        </Text>
      </View>
    );
  }

  const rateKg = summary.rate_of_change_kg_per_week;
  const rateText = rateKg == null ? '—' : signedKg(rateKg, unit);
  const tone: 'on_track' | 'off_track' | 'neutral' = summary.goal_alignment ?? 'neutral';

  const toneColor =
    tone === 'on_track' ? theme.readiness.high
    : tone === 'off_track' ? theme.readiness.low
    : theme.readiness.mid;

  const toneLabel =
    tone === 'on_track' ? 'On track'
    : tone === 'off_track' ? 'Off track'
    : 'Maintaining';

  return (
    <View style={s.card}>
      <Text style={s.cardLabel}>GOAL ALIGNMENT</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SP[3], marginTop: SP[2] }}>
        <View style={{
          width: 10, height: 10, borderRadius: 5, backgroundColor: toneColor,
        }} />
        <Text style={{ fontFamily: TY.sans.bold, fontSize: TY.size.h3, color: theme.text.primary }}>
          {toneLabel}
        </Text>
      </View>
      <Text style={s.goalMuted}>
        Trend is {rateText} {unit} per week over the last 28 days
        {summary.data_confidence === 'limited' ? ' (still gathering data).' : '.'}
      </Text>
    </View>
  );
}

// ── rgba shim (colors are either hex or rgba()) ──────────────────────────────

function toRgba(color: string, opacity: number): string {
  if (color.startsWith('rgba')) return color;
  if (color.startsWith('rgb(')) return color.replace('rgb(', 'rgba(').replace(')', `,${opacity})`);
  if (color.startsWith('#')) {
    const h = color.replace('#', '');
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${opacity})`;
  }
  return color;
}

// ── Styles ───────────────────────────────────────────────────────────────────

function createStyles(t: ThemeColors) {
  return StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SP[5],
      paddingTop: SP[2],
      paddingBottom: SP[3] + 2,
    },
    headerTitle: {
      fontFamily: TY.sans.semibold,
      fontSize: TY.size.h3 - 1,
      color: t.text.primary,
      letterSpacing: -0.3,
    },
    unitToggle: {
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: R.pill,
      paddingHorizontal: SP[3],
      paddingVertical: SP[1] + 1,
    },
    unitToggleText: {
      fontFamily: TY.mono.semibold,
      fontSize: TY.size.tick,
      color: t.text.secondary,
      letterSpacing: TY.tracking.label,
    },
    content: { paddingHorizontal: SP[5], paddingTop: SP[3], paddingBottom: SP[6] },

    rangeRow: {
      flexDirection: 'row',
      gap: SP[2] - 2,
      backgroundColor: t.glass.card,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: R.pill,
      padding: 4,
      marginBottom: SP[5],
    },
    rangeChip: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: SP[2],
      borderRadius: R.pill,
    },
    rangeChipActive: { backgroundColor: t.accent },
    rangeChipText: {
      fontFamily: TY.sans.semibold,
      fontSize: TY.size.small + 1,
      color: t.text.secondary,
    },
    rangeChipTextActive: { color: t.accentInk },

    card: {
      backgroundColor: t.glass.card,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: R.md,
      padding: SP[4],
      marginBottom: SP[4],
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: SP[2],
    },
    cardLabel: {
      fontFamily: TY.mono.semibold,
      fontSize: TY.size.tick,
      color: t.text.muted,
      letterSpacing: TY.tracking.label,
      textTransform: 'uppercase',
    },
    fellBackNote: {
      fontFamily: TY.sans.regular,
      fontSize: TY.size.tick,
      color: t.text.muted,
    },
    chartPlaceholder: {
      height: 200,
      alignItems: 'center',
      justifyContent: 'center',
      gap: SP[2],
    },
    emptyText: {
      fontFamily: TY.sans.regular,
      fontSize: TY.size.body,
      color: t.text.muted,
    },
    legend: {
      flexDirection: 'row',
      gap: SP[4],
      marginTop: SP[3] - 2,
    },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    legendDot: { width: 8, height: 8, borderRadius: 4 },
    legendText: {
      fontFamily: TY.sans.regular,
      fontSize: TY.size.small,
      color: t.text.secondary,
    },

    statsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SP[2],
      marginBottom: SP[4],
    },

    goalMuted: {
      fontFamily: TY.sans.regular,
      fontSize: TY.size.small + 1,
      color: t.text.secondary,
      lineHeight: 20,
      marginTop: SP[2],
    },

    streakRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      marginTop: SP[2],
    },
    streakBlock: { gap: 2 },
    streakNumber: {
      fontFamily: TY.mono.bold,
      fontSize: 28,
      fontVariant: ['tabular-nums'],
      color: t.text.primary,
      letterSpacing: TY.tracking.tight,
    },
    streakLabel: {
      fontFamily: TY.sans.regular,
      fontSize: TY.size.small,
      color: t.text.muted,
    },
    streakSub: {
      fontFamily: TY.sans.regular,
      fontSize: TY.size.small,
      color: t.text.muted,
      marginTop: SP[3],
    },

    ctaWrap: {
      position: 'absolute',
      left: 0, right: 0, bottom: 0,
      paddingHorizontal: SP[5],
      paddingTop: SP[3],
      backgroundColor: t.bg.primary,
      borderTopWidth: 1,
      borderTopColor: t.border,
    },
    logBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SP[2],
      backgroundColor: t.accent,
      borderRadius: R.md,
      paddingVertical: SP[4],
    },
    logBtnDone: { backgroundColor: t.accentDim, borderWidth: 1, borderColor: t.accent },
    logBtnText: {
      fontFamily: TY.sans.bold,
      fontSize: TY.size.body + 1,
      color: t.accentInk,
      letterSpacing: TY.tracking.tight,
    },
  });
}
