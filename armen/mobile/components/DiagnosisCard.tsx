import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface DiagnosisCardProps {
  diagnosis: string;
  mainFactor: string;
  recommendation: string;
  loading: boolean;
}

function SkeletonLine({ width, height = 14 }: { width: string | number; height?: number }) {
  return (
    <View
      style={[
        styles.skeletonLine,
        { width: width as number, height },
      ]}
    />
  );
}

export default function DiagnosisCard({
  diagnosis,
  mainFactor,
  recommendation,
  loading,
}: DiagnosisCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.brainEmoji}>🧠</Text>
        <Text style={styles.cardTitle}>Today's Diagnosis</Text>
      </View>

      {loading ? (
        <View style={styles.skeletonContainer}>
          <SkeletonLine width="100%" height={14} />
          <SkeletonLine width="90%" height={14} />
          <SkeletonLine width="75%" height={14} />
          <View style={styles.skeletonSpacer} />
          <SkeletonLine width="50%" height={12} />
          <View style={styles.skeletonSpacer} />
          <SkeletonLine width="100%" height={12} />
          <SkeletonLine width="85%" height={12} />
        </View>
      ) : (
        <>
          {/* Diagnosis text */}
          <Text style={styles.diagnosisText}>
            {diagnosis || 'No diagnosis available. Ensure health and activity data is synced.'}
          </Text>

          {/* Main factor chip */}
          {mainFactor ? (
            <View style={styles.factorRow}>
              <View style={styles.factorChip}>
                <Ionicons name="analytics-outline" size={13} color="#6C63FF" />
                <Text style={styles.factorText}>{mainFactor}</Text>
              </View>
            </View>
          ) : null}

          {/* Recommendation box */}
          {recommendation ? (
            <View style={styles.recommendationBox}>
              <View style={styles.recommendationHeader}>
                <Ionicons name="bulb-outline" size={15} color="#FFC107" />
                <Text style={styles.recommendationLabel}>Recommendation</Text>
              </View>
              <Text style={styles.recommendationText}>{recommendation}</Text>
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1A1A2E',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: '#2A2A4A',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  brainEmoji: {
    fontSize: 20,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  diagnosisText: {
    fontSize: 15,
    color: '#E0E0E0',
    lineHeight: 22,
    marginBottom: 14,
  },
  factorRow: {
    marginBottom: 14,
  },
  factorChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(108, 99, 255, 0.15)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: 'rgba(108, 99, 255, 0.3)',
  },
  factorText: {
    fontSize: 13,
    color: '#9B95FF',
    fontWeight: '500',
  },
  recommendationBox: {
    backgroundColor: 'rgba(255, 193, 7, 0.07)',
    borderRadius: 10,
    padding: 14,
    borderLeftWidth: 3,
    borderLeftColor: '#FFC107',
  },
  recommendationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  recommendationLabel: {
    fontSize: 12,
    color: '#FFC107',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  recommendationText: {
    fontSize: 14,
    color: '#E0E0E0',
    lineHeight: 20,
  },
  skeletonContainer: {
    gap: 10,
  },
  skeletonLine: {
    backgroundColor: '#2A2A4A',
    borderRadius: 6,
  },
  skeletonSpacer: {
    height: 6,
  },
});
