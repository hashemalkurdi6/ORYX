// ORYX — ambient readiness-color halo. A soft, persistent aurora that cycles
// through the readiness state palette (high → mid → low → mid → high) over a
// long, never-ending loop. Used on the landing screen behind the logo and is
// reusable on splash / loading states / behind the home readiness ring.
//
// Why it exists: a 12-second teaser of the readiness concept communicated
// entirely through colour. Subtle enough that users don't consciously notice
// it but it tells them visually "this app is about cycling states of the body".
//
// Implementation: react-native-svg <RadialGradient> with three stops fading
// the readiness colour from 0.25 opacity at the centre to fully transparent
// at 100% radius. This avoids the "hard-edged disc" failure mode of using a
// borderRadius: 9999 view + BlurView, which leaves a visible boundary because
// BlurView samples the bg behind it, not the coloured blob underneath. The
// SVG approach has no boundary at all — the gradient *is* the falloff.
//
// Note: components/AmbientBackdrop.tsx remains for the home/wellness multi-
// glow canvas; that's a different (static) effect.

import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '@/contexts/ThemeContext';

const AnimatedStop = Animated.createAnimatedComponent(Stop);

interface ReadinessHaloProps {
  /** Halo diameter in px. Default 600. */
  size?: number;
  /** Loop duration in ms. Default 12000. */
  duration?: number;
}

export default function ReadinessHalo({
  size = 600,
  duration = 12000,
}: ReadinessHaloProps) {
  const { theme } = useTheme();
  const reduceMotion = useReducedMotion();

  // progress drives the colour interpolation. Reversed withRepeat means the
  // value bounces 0 → 1 → 0, so the visible cycle is high → mid → low → mid →
  // high. ease-in-out so the dwell on each colour feels gentle, not linear.
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

  // Single animated colour shared by all three gradient stops so the centre,
  // mid, and edge stops cycle in lockstep. interpolateColor + useAnimatedProps
  // runs entirely on the UI thread — no JS-bridge per-frame.
  const innerStopProps = useAnimatedProps(() => ({
    stopColor: interpolateColor(
      progress.value,
      [0, 0.5, 1],
      [theme.readiness.high, theme.readiness.mid, theme.readiness.low],
    ),
  }));
  const midStopProps = useAnimatedProps(() => ({
    stopColor: interpolateColor(
      progress.value,
      [0, 0.5, 1],
      [theme.readiness.high, theme.readiness.mid, theme.readiness.low],
    ),
  }));
  const outerStopProps = useAnimatedProps(() => ({
    stopColor: interpolateColor(
      progress.value,
      [0, 0.5, 1],
      [theme.readiness.high, theme.readiness.mid, theme.readiness.low],
    ),
  }));

  return (
    <View pointerEvents="none" style={[styles.wrap, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient
            id="halo"
            cx="50%"
            cy="50%"
            rx="50%"
            ry="50%"
            fx="50%"
            fy="50%"
          >
            {/* 0% — full colour at low opacity. The "warmth at the centre". */}
            <AnimatedStop offset="0%" stopOpacity={0.25} animatedProps={innerStopProps} />
            {/* 40% — half-bright. Carries the colour out without making the
                centre look like a defined disc. */}
            <AnimatedStop offset="40%" stopOpacity={0.10} animatedProps={midStopProps} />
            {/* 100% — fully transparent. This is what makes the edge invisible. */}
            <AnimatedStop offset="100%" stopOpacity={0} animatedProps={outerStopProps} />
          </RadialGradient>
        </Defs>
        {/* Fill a square covering the SVG bounds — the gradient does the
            falloff, no need for a circle clip. Using Rect instead of Circle
            means the colour reaches all four corners before fading, which
            extends the halo's apparent reach without any visible boundary. */}
        <Rect width={size} height={size} fill="url(#halo)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
});
