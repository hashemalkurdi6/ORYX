import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { HealthSnapshot } from '@/services/api';

interface SleepHRVChartProps {
  snapshots: HealthSnapshot[];
}

const SCREEN_WIDTH = Dimensions.get('window').width;
const CHART_WIDTH = SCREEN_WIDTH - 40;
const CHART_HEIGHT = 200;

const SLEEP_COLOR = '#888888';
const HRV_COLOR = '#27ae60';

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 3);
}

export default function SleepHRVChart({ snapshots }: SleepHRVChartProps) {
  if (!snapshots || snapshots.length === 0) {
    return (
      <View style={styles.card}>
        <Text style={styles.cardLabel}>SLEEP & HRV TRENDS</Text>
        <View style={styles.emptyInner}>
          <Text style={styles.emptyText}>No health data available for the past 7 days.</Text>
          <Text style={styles.emptyHint}>
            Connect HealthKit on an iOS device to see sleep and HRV trends.
          </Text>
        </View>
      </View>
    );
  }

  const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
  const labels = sorted.map((s) => formatDateLabel(s.date));

  const sleepData = sorted.map((s) =>
    s.sleep_duration_hours != null ? Math.round(s.sleep_duration_hours * 10) / 10 : 0
  );

  const rawHrvData = sorted.map((s) => s.hrv_ms ?? 0);
  const maxHrv = Math.max(...rawHrvData, 1);
  const hrvDataScaled = rawHrvData.map((v) => Math.round((v / maxHrv) * 10 * 10) / 10);

  const hasSleepData = sleepData.some((v) => v > 0);
  const hasHrvData = rawHrvData.some((v) => v > 0);

  if (!hasSleepData && !hasHrvData) {
    return (
      <View style={styles.card}>
        <Text style={styles.cardLabel}>SLEEP & HRV TRENDS</Text>
        <View style={styles.emptyInner}>
          <Text style={styles.emptyText}>No sleep or HRV data recorded yet.</Text>
          <Text style={styles.emptyHint}>
            HealthKit data will appear here once synced from an iOS device.
          </Text>
        </View>
      </View>
    );
  }

  const datasets = [];
  if (hasSleepData) {
    datasets.push({
      data: sleepData,
      color: (opacity = 1) => `rgba(136, 136, 136, ${opacity})`,
      strokeWidth: 2,
    });
  }
  if (hasHrvData) {
    datasets.push({
      data: hrvDataScaled,
      color: (opacity = 1) => `rgba(39, 174, 96, ${opacity})`,
      strokeWidth: 2,
    });
  }

  const chartConfig = {
    backgroundColor: '#111111',
    backgroundGradientFrom: '#111111',
    backgroundGradientTo: '#111111',
    decimalPlaces: 1,
    color: (opacity = 1) => `rgba(240, 240, 240, ${opacity})`,
    labelColor: () => '#555555',
    style: { borderRadius: 12 },
    propsForDots: {
      r: '4',
      strokeWidth: '2',
    },
    propsForBackgroundLines: {
      stroke: '#1a1a1a',
      strokeDasharray: '4 4',
    },
  };

  return (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>SLEEP & HRV TRENDS</Text>
      <LineChart
        data={{ labels, datasets }}
        width={CHART_WIDTH - 32}
        height={CHART_HEIGHT}
        chartConfig={chartConfig}
        bezier
        style={styles.chart}
        withHorizontalLines
        withVerticalLines={false}
        withDots
        withShadow={false}
        fromZero
      />

      <View style={styles.legend}>
        {hasSleepData && (
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: SLEEP_COLOR }]} />
            <Text style={styles.legendLabel}>Sleep (hrs)</Text>
          </View>
        )}
        {hasHrvData && (
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: HRV_COLOR }]} />
            <Text style={styles.legendLabel}>HRV (scaled)</Text>
          </View>
        )}
      </View>

      {hasHrvData && (
        <Text style={styles.hintText}>
          HRV scaled 0–10 relative to your 7-day max ({Math.round(maxHrv)} ms).
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#111111',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1a1a1a',
    overflow: 'hidden',
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#555555',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 14,
  },
  chart: {
    borderRadius: 8,
    marginLeft: -16,
  },
  legend: {
    flexDirection: 'row',
    gap: 20,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#1a1a1a',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLabel: {
    fontSize: 12,
    color: '#888888',
  },
  hintText: {
    fontSize: 11,
    color: '#555555',
    marginTop: 6,
    fontStyle: 'italic',
  },
  emptyInner: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  emptyText: {
    fontSize: 14,
    color: '#555555',
    textAlign: 'center',
  },
  emptyHint: {
    fontSize: 12,
    color: '#555555',
    textAlign: 'center',
    lineHeight: 18,
  },
});
