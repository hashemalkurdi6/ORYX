// ORYX — ambient readiness-color halo. A soft, persistent aurora that cycles
// through the readiness state palette (high → mid → low → mid → high) over a
// long, never-ending loop. Used on the landing screen behind the logo and is
// reusable on splash / loading states / behind the home readiness ring.
//
// Why it exists: a 12-second teaser of the readiness concept communicated
// entirely through colour. Subtle enough that users don't consciously notice
// it but it tells them visually "this app is about cycling states of the body".
//
// Performance design:
//   - Three Animated.Views, one per readiness colour. Each contains a fully
//     static <Svg> with a single <RadialGradient> + <Rect> fill (0.25 → 0.10
//     → 0 opacity falloff, fully transparent at the edge — no boundary).
//   - The SVGs rasterise *once* and are layer-cached via shouldRasterizeIOS /
//     renderToHardwareTextureAndroid. On every subsequent frame the only work
//     the GPU does is re-blending three cached bitmap layers at new opacities.
//   - We animate Animated.View opacity (CALayer.opacity on iOS), not Rect
//     opacity inside the SVG. CALayer opacity is GPU-only, no re-rasterisation.
//   - Earlier attempts that animated <Stop> directly, or animated <Rect>
//     opacity inside one SVG, both forced re-rasterisation per frame and
//     dropped frames noticeably.

import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '@/contexts/ThemeContext';

interface ReadinessHaloProps {
  /** Halo diameter in px. Default 600. */
  size?: number;
  /** Loop duration in ms. Default 12000. */
  duration?: number;
}

interface GradientLayerProps {
  color: string;
  size: number;
  /** Unique id so the three RadialGradient defs don't collide. */
  id: string;
}

// Static gradient layer — renders once, gets layer-cached. No animation here.
function GradientLayer({ color, size, id }: GradientLayerProps) {
  return (
    <Svg width={size} height={size} style={StyleSheet.absoluteFillObject}>
      <Defs>
        <RadialGradient id={id} cx="50%" cy="50%" rx="50%" ry="50%" fx="50%" fy="50%">
          <Stop offset="0%"   stopColor={color} stopOpacity={0.25} />
          <Stop offset="40%"  stopColor={color} stopOpacity={0.10} />
          <Stop offset="100%" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect width={size} height={size} fill={`url(#${id})`} />
    </Svg>
  );
}

export default function ReadinessHalo({
  size = 600,
  duration = 12000,
}: ReadinessHaloProps) {
  const { theme } = useTheme();
  const reduceMotion = useReducedMotion();

  // progress drives the crossfade. Reversed withRepeat means the value
  // bounces 0 → 1 → 0, so the visible cycle is high → mid → low → mid →
  // high. ease-in-out so the dwell on each colour feels gentle.
  const progress = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) {
      progress.value = 0; // hold on readiness.high
      return;
    }
    progress.value = 0;
    progress.value = withRepeat(
      withTiming(1, { duration, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [duration, reduceMotion]);

  // Linear crossfade across [0, 0.5, 1]. Opacities cleanly hand off so the
  // sum is always ≤ 1 — no brief double-bright moment between colours.
  const highStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.5, 1], [1, 0, 0]),
  }));
  const midStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.5, 1], [0, 1, 0]),
  }));
  const lowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.5, 1], [0, 0, 1]),
  }));

  return (
    <View pointerEvents="none" style={[styles.wrap, { width: size, height: size }]}>
      <Animated.View
        style={[styles.layer, highStyle]}
        shouldRasterizeIOS
        renderToHardwareTextureAndroid
      >
        <GradientLayer color={theme.readiness.high} size={size} id="halo-high" />
      </Animated.View>
      <Animated.View
        style={[styles.layer, midStyle]}
        shouldRasterizeIOS
        renderToHardwareTextureAndroid
      >
        <GradientLayer color={theme.readiness.mid} size={size} id="halo-mid" />
      </Animated.View>
      <Animated.View
        style={[styles.layer, lowStyle]}
        shouldRasterizeIOS
        renderToHardwareTextureAndroid
      >
        <GradientLayer color={theme.readiness.low} size={size} id="halo-low" />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  layer: { ...StyleSheet.absoluteFillObject },
});
