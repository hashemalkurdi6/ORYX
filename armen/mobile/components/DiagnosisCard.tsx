import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface DiagnosisCardProps {
  label: string;
  text: string;
  loading: boolean;
}

function SkeletonLine({ width }: { width: string | number }) {
  return <View style={[styles.skeletonLine, { width: width as number }]} />;
}

export default function DiagnosisCard({ label, text, loading }: DiagnosisCardProps) {
  if (loading) {
    return (
      <View>
        <Text style={styles.label}>{label}</Text>
        <View style={styles.skeletonContainer}>
          <SkeletonLine width="100%" />
          <SkeletonLine width="88%" />
          <SkeletonLine width="72%" />
        </View>
      </View>
    );
  }

  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.bodyText}>
        {text || 'No data available. Ensure health and activity data is synced.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: '#555555',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
  },
  bodyText: {
    fontSize: 16,
    color: '#f0f0f0',
    lineHeight: 24,
  },
  skeletonContainer: {
    gap: 10,
  },
  skeletonLine: {
    height: 14,
    backgroundColor: '#1a1a1a',
    borderRadius: 6,
  },
});
