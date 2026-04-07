import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';

interface RecoveryIndicatorProps {
  score: number;
  color: 'green' | 'yellow' | 'red';
  loading: boolean;
}

const COLOR_MAP: Record<'green' | 'yellow' | 'red', string> = {
  green: '#4CAF50',
  yellow: '#FFC107',
  red: '#F44336',
};

const SIZE = 150;
const STROKE_WIDTH = 12;
const RADIUS = (SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function RecoveryIndicator({
  score,
  color,
  loading,
}: RecoveryIndicatorProps) {
  const clampedScore = Math.min(100, Math.max(0, score));
  const strokeDashoffset = CIRCUMFERENCE * (1 - clampedScore / 100);
  const accentColor = COLOR_MAP[color];

  return (
    <View style={styles.wrapper}>
      <View style={styles.container}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#6C63FF" />
          </View>
        ) : (
          <View style={styles.svgWrapper}>
            <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
              <G rotation="-90" origin={`${SIZE / 2}, ${SIZE / 2}`}>
                {/* Background ring */}
                <Circle
                  cx={SIZE / 2}
                  cy={SIZE / 2}
                  r={RADIUS}
                  stroke="#2A2A3A"
                  strokeWidth={STROKE_WIDTH}
                  fill="none"
                />
                {/* Colored progress arc */}
                <Circle
                  cx={SIZE / 2}
                  cy={SIZE / 2}
                  r={RADIUS}
                  stroke={accentColor}
                  strokeWidth={STROKE_WIDTH}
                  fill="none"
                  strokeDasharray={CIRCUMFERENCE}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                />
              </G>
            </Svg>
            {/* Score in center */}
            <View style={styles.scoreOverlay}>
              <Text style={[styles.scoreText, { color: accentColor }]}>
                {clampedScore}
              </Text>
            </View>
          </View>
        )}
      </View>
      <Text style={styles.label}>Recovery Score</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  container: {
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingContainer: {
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1A1A2E',
    borderRadius: SIZE / 2,
  },
  svgWrapper: {
    position: 'relative',
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreOverlay: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreText: {
    fontSize: 42,
    fontWeight: '900',
    letterSpacing: -1,
  },
  label: {
    marginTop: 12,
    fontSize: 14,
    color: '#888',
    fontWeight: '500',
    letterSpacing: 0.5,
  },
});
