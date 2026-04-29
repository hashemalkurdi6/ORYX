// ORYX — ambient readiness-color halo. A soft, persistent aurora that cycles
// through the readiness state palette (high → mid → low → mid → high) over a
// long, never-ending loop. Used on the landing screen behind the logo and is
// reusable on splash / loading states / behind the home readiness ring.
//
// Why it exists: a 12-second teaser of the readiness concept communicated
// entirely through colour. Subtle enough that users don't consciously notice
// it but it tells them visually "this app is about cycling states of the body".
//
// Implementation notes:
//   - Three static <RadialGradient>s (one per readiness colour) defined in
//     <Defs>, each with the same opacity profile: 0.25 at centre → 0.10 at
//     40 % → fully transparent at 100 %. The fully-transparent edge is what
//     makes the halo boundless — there is no edge to see.
//   - Three <Rect>s stacked on top of each other, each filled with one of
//     the gradients. We crossfade their *opacities* via Reanimated to walk
//     from one colour to the next.
//   - We can't animate <Stop> directly: Stop lives inside <Defs> and never
//     renders a host instance, so Reanimated's createAnimatedComponent has
//     nothing to attach animated props to. <Rect> is a real host component
//     and animates fine.

import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg';
import Animated, {
  Easing,
  interpolate,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '@/contexts/ThemeContext';

const AnimatedRect = Animated.createAnimatedComponent(Rect);

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

  // Linear crossfade between the three colour layers. At progress=0 only
  // `high` is visible; at 0.5 only `mid`; at 1 only `low`. The opacities
  // cleanly hand off without ever summing to >1, so there is no brief
  // double-bright moment.
  const highProps = useAnimatedProps(() => ({
    opacity: interpolate(progress.value, [0, 0.5, 1], [1, 0, 0]),
  }));
  const midProps = useAnimatedProps(() => ({
    opacity: interpolate(progress.value, [0, 0.5, 1], [0, 1, 0]),
  }));
  const lowProps = useAnimatedProps(() => ({
    opacity: interpolate(progress.value, [0, 0.5, 1], [0, 0, 1]),
  }));

  return (
    <View pointerEvents="none" style={[styles.wrap, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        <Defs>
          {/* One static gradient per readiness colour. All share the same
              opacity profile so the falloff shape stays constant — only the
              hue changes as we crossfade. */}
          <RadialGradient id="halo-high" cx="50%" cy="50%" rx="50%" ry="50%" fx="50%" fy="50%">
            <Stop offset="0%"   stopColor={theme.readiness.high} stopOpacity={0.25} />
            <Stop offset="40%"  stopColor={theme.readiness.high} stopOpacity={0.10} />
            <Stop offset="100%" stopColor={theme.readiness.high} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="halo-mid" cx="50%" cy="50%" rx="50%" ry="50%" fx="50%" fy="50%">
            <Stop offset="0%"   stopColor={theme.readiness.mid} stopOpacity={0.25} />
            <Stop offset="40%"  stopColor={theme.readiness.mid} stopOpacity={0.10} />
            <Stop offset="100%" stopColor={theme.readiness.mid} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="halo-low" cx="50%" cy="50%" rx="50%" ry="50%" fx="50%" fy="50%">
            <Stop offset="0%"   stopColor={theme.readiness.low} stopOpacity={0.25} />
            <Stop offset="40%"  stopColor={theme.readiness.low} stopOpacity={0.10} />
            <Stop offset="100%" stopColor={theme.readiness.low} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        {/* Three stacked rects covering the SVG bounds. Each is filled with
            one of the gradients above; opacity crossfades between them. */}
        <AnimatedRect width={size} height={size} fill="url(#halo-high)" animatedProps={highProps} />
        <AnimatedRect width={size} height={size} fill="url(#halo-mid)"  animatedProps={midProps} />
        <AnimatedRect width={size} height={size} fill="url(#halo-low)"  animatedProps={lowProps} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
});
