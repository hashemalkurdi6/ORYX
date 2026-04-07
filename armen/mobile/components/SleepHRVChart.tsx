import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { HealthSnapshot } from '@/services/api';

interface SleepHRVChartProps {
  snapshots: HealthSnapshot[];
}

const SCREEN_WIDTH = Dimensions.get('window').width;
const CHART_WIDTH = SCREEN_WIDTH - 40; // 20px padding each side
const CHART_HEIGHT = 200;

const SLEEP_COLOR = '#4A90E2';
const HRV_COLOR = '#6C63FF';

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 3);
}

export default function SleepHRVChart({ snapshots }: SleepHRVChartProps) {
  if (!snapshots || snapshots.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No health data available for the past 7 days.</Text>
        <Text style={styles.emptyHint}>
          Connect HealthKit on an iOS device to see sleep and HRV trends.
        </Text>
      </View>
    );
  }

  // Sort snapshots by date ascending
  const sorted = [...snapshots].sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  const labels = sorted.map((s) => formatDateLabel(s.date));

  // Sleep data — replace nulls with 0 for charting
  const sleepData = sorted.map((s) =>
    s.sleep_duration_hours != null ? Math.round(s.sleep_duration_hours * 10) / 10 : 0
  );

  // HRV data — normalize to a 0–10 range proportional to typical HRV values (0–100 ms)
  // so it plots nicely alongside sleep hours (0–10 h)
  const rawHrvData = sorted.map((s) => s.hrv_ms ?? 0);
  const maxHrv = Math.max(...rawHrvData, 1);
  // Scale HRV values to 0–10 scale relative to max observed value
  const hrvDataScaled = rawHrvData.map((v) => Math.round((v / maxHrv) * 10 * 10) / 10);

  const hasSleepData = sleepData.some((v) => v > 0);
  const hasHrvData = rawHrvData.some((v) => v > 0);

  if (!hasSleepData && !hasHrvData) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No sleep or HRV data recorded yet.</Text>
        <Text style={styles.emptyHint}>
          HealthKit data will appear here once synced from an iOS device.
        </Text>
      </View>
    );
  }

  // Build datasets — only include those with actual data
  const datasets = [];
  if (hasSleepData) {
    datasets.push({
      data: sleepData,
      color: (opacity = 1) => `rgba(74, 144, 226, ${opacity})`,
      strokeWidth: 2,
    });
  }
  if (hasHrvData) {
    datasets.push({
      data: hrvDataScaled,
      color: (opacity = 1) => `rgba(108, 99, 255, ${opacity})`,
      strokeWidth: 2,
    });
  }

  const chartConfig = {
    backgroundColor: '#1A1A2E',
    backgroundGradientFrom: '#1A1A2E',
    backgroundGradientTo: '#1A1A2E',
    decimalPlaces: 1,
    color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(136, 136, 136, ${opacity})`,
    style: { borderRadius: 12 },
    propsForDots: {
      r: '4',
      strokeWidth: '2',
    },
    propsForBackgroundLines: {
      stroke: '#2A2A4A',
      strokeDasharray: '4 4',
    },
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <LineChart
          data={{ labels, datasets }}
          width={CHART_WIDTH - 32} // account for card padding
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

        {/* Legend */}
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
            HRV is scaled 0–10 relative to your 7-day max ({Math.round(maxHrv)} ms).
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  card: {
    backgroundColor: '#1A1A2E',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2A2A4A',
    overflow: 'hidden',
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
    borderTopColor: '#1F1F35',
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
    color: '#888',
  },
  hintText: {
    fontSize: 11,
    color: '#555',
    marginTop: 6,
    fontStyle: 'italic',
  },
  emptyContainer: {
    backgroundColor: '#1A1A2E',
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#2A2A4A',
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  emptyHint: {
    fontSize: 12,
    color: '#444',
    textAlign: 'center',
    lineHeight: 18,
  },
});
