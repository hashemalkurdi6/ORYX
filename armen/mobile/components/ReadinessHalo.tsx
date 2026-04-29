// ORYX — ambient readiness-color halo. A soft, persistent breathing glow that
// cycles through the readiness state palette (high → mid → low → high) over a
// long, never-ending loop. Used on the landing screen behind the logo and is
// reusable on splash / loading states / behind the home readiness ring.
//
// Why it exists: a 12-second teaser of the readiness concept communicated
// entirely through colour. Subtle enough that users don't consciously notice
// it but it tells them visually "this app is about cycling states of the body".
//
// Note: there is also components/AmbientBackdrop.tsx which renders the
// multi-glow canvas behind the home/wellness hero. That's a different (static)
// effect and stays put; this halo is the new animated readiness-color blob.

import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '@/contexts/ThemeContext';

interface ReadinessHaloProps {
  /** Halo diameter in px. Default 420. */
  size?: number;
  /** Loop duration in ms. Default 12000. */
  duration?: number;
  /** Opacity of the colour blob. Default 0.18 — ambient, not loud. */
  opacity?: number;
  /** Blur intensity 0–100 to soften the edge. Default 60. */
  blurIntensity?: number;
}

export default function ReadinessHalo({
  size = 420,
  duration = 12000,
  opacity = 0.18,
  blurIntensity = 60,
}: ReadinessHaloProps) {
  const { theme, resolvedScheme } = useTheme();
  const reduceMotion = useReducedMotion();

  // progress goes 0 → 1 linearly, looping forever. Interpolation domain
  // [0, 0.33, 0.66, 1] maps to [high, mid, low, high] so the loop closes
  // seamlessly without a jump on wrap-around.
  const progress = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      progress.value = 0; // hold on `high` if motion is off
      return;
    }
    progress.value = 0;
    progress.value = withRepeat(
      withTiming(1, { duration, easing: Easing.linear }),
      -1,
      false,
    );
  }, [duration, reduceMotion]);

  const blobStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 0.33, 0.66, 1],
      [
        theme.readiness.high,
        theme.readiness.mid,
        theme.readiness.low,
        theme.readiness.high,
      ],
    ),
  }));

  return (
    <View
      pointerEvents="none"
      style={[styles.wrap, { width: size, height: size, borderRadius: size / 2 }]}
    >
      <Animated.View
        style={[
          styles.blob,
          { borderRadius: size / 2, opacity },
          blobStyle,
        ]}
      />
      {/* expo-blur softens the disc edge into the surrounding bg. tint matches
          the resolved scheme so the blur reads correctly in both modes. */}
      <BlurView
        intensity={blurIntensity}
        tint={resolvedScheme === 'light' ? 'light' : 'dark'}
        style={[styles.blur, { borderRadius: size / 2 }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  blob: { ...StyleSheet.absoluteFillObject },
  blur: { ...StyleSheet.absoluteFillObject },
});
