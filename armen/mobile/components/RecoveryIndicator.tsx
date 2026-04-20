import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { useTheme } from '@/contexts/ThemeContext';
import { type as TY } from '@/services/theme';

interface RecoveryIndicatorProps {
  score: number;
  color: 'green' | 'yellow' | 'red';
  loading: boolean;
}

const SIZE = 160;
const STROKE_WIDTH = 14;
const RADIUS = (SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function RecoveryIndicator({
  score,
  color,
  loading,
}: RecoveryIndicatorProps) {
  const { theme } = useTheme();
  const clampedScore = Math.min(100, Math.max(0, score));
  const strokeDashoffset = CIRCUMFERENCE * (1 - clampedScore / 100);
  const accentColor =
    color === 'green' ? theme.readiness.high :
    color === 'yellow' ? theme.readiness.mid :
    theme.readiness.low;

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.bg.elevated }]}>
        <ActivityIndicator size="large" color={theme.text.primary} />
      </View>
    );
  }

  return (
    <View style={styles.svgWrapper}>
      <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
        <G transform={`rotate(-90, ${SIZE / 2}, ${SIZE / 2})`}>
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            stroke={theme.border}
            strokeWidth={STROKE_WIDTH}
            fill="none"
          />
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
      <View style={styles.scoreOverlay}>
        <Text style={[styles.scoreText, { color: accentColor }]}>
          {clampedScore}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
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
    fontFamily: TY.mono.bold,
    fontSize: 48,
    fontVariant: ['tabular-nums'],
    letterSpacing: -2,
  },
});
