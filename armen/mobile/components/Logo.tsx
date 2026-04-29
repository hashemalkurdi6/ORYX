// ORYX — Mark B logo. Horns + readiness arc + load arc + center dot.
//
// Geometry comes verbatim from the brand sheet (cx=32, cy=50, ro=26, ri=18,
// horns are cubic beziers from the centre to the upper outer corners).
// Stroke widths are normalised against `size / 64` so the visual weight stays
// constant at any rendered size.
//
// When `animate` is true, paths draw themselves on mount via a strokeDashoffset
// animation (1.2s ease-out, starting after 200ms), the readiness arc fades from
// a desaturated grey to full lime over 600ms starting at 600ms, and the centre
// dot fades in once the horns have nearly finished drawing.
//
// When `animate` is false (or the user has Reduce Motion enabled), everything
// renders fully drawn on first paint.

import React, { useEffect, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path, Circle } from 'react-native-svg';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { theme } from '@/services/theme';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// Path lengths (viewBox units). Calculated once for the canonical 64×64 box;
// the strokeDashoffset trick draws each path from start → end as offset goes
// from `length` → 0. Generously rounded up so we never see a second dash.
const LEN_OUTER_ARC = 90; // π × 26 ≈ 81.7
const LEN_INNER_ARC = 60; // π × 18 ≈ 56.5
const LEN_HORN = 60;      // cubic bezier ≈ 50, padded

// Desaturated arc colour used at the start of the readiness fade. Greys out
// the lime so the arc reads as "uncharged" before the colour reveal.
const ARC_DESAT = 'rgba(255,255,255,0.18)';

interface LogoProps {
  size?: number;
  /** Disable the entry animation — paints fully drawn on first frame. */
  animate?: boolean;
  /** Override colours. Defaults to brand sheet (white horns, lime accent, blue load). */
  color?: string;
  accent?: string;
  load?: string;
}

export default function Logo({
  size = 120,
  animate = true,
  color,
  accent,
  load,
}: LogoProps) {
  const reduceMotion = useReducedMotion();
  const shouldAnimate = animate && !reduceMotion;

  // s scales the canonical 64×64 viewBox to `size`. Stroke widths divide by it
  // so a 1.8-vu stroke at size=64 stays 1.8 device units at any size.
  const s = size / 64;

  const drawProgress = useSharedValue(shouldAnimate ? 0 : 1);
  const arcSat = useSharedValue(shouldAnimate ? 0 : 1);
  const dotOpacity = useSharedValue(shouldAnimate ? 0 : 1);

  useEffect(() => {
    if (!shouldAnimate) return;
    drawProgress.value = withDelay(
      200,
      withTiming(1, { duration: 1200, easing: Easing.out(Easing.cubic) }),
    );
    arcSat.value = withDelay(
      600,
      withTiming(1, { duration: 600, easing: Easing.out(Easing.quad) }),
    );
    dotOpacity.value = withDelay(
      1300,
      withTiming(1, { duration: 350, easing: Easing.out(Easing.quad) }),
    );
  }, [shouldAnimate]);

  const colors = useMemo(
    () => ({
      horn: color ?? theme.text.primary,
      accent: accent ?? theme.accent,
      load: load ?? theme.signal.load,
    }),
    [color, accent, load],
  );

  // Animated props per path. Each draws from start → end via strokeDashoffset.
  const outerArcProps = useAnimatedProps(() => ({
    strokeDashoffset: LEN_OUTER_ARC * (1 - drawProgress.value),
    stroke: interpolateColor(arcSat.value, [0, 1], [ARC_DESAT, colors.accent]),
  }));
  const innerArcProps = useAnimatedProps(() => ({
    strokeDashoffset: LEN_INNER_ARC * (1 - drawProgress.value),
  }));
  const leftHornProps = useAnimatedProps(() => ({
    strokeDashoffset: LEN_HORN * (1 - drawProgress.value),
  }));
  const rightHornProps = useAnimatedProps(() => ({
    strokeDashoffset: LEN_HORN * (1 - drawProgress.value),
  }));
  const centerDotProps = useAnimatedProps(() => ({
    opacity: dotOpacity.value,
  }));

  return (
    <View style={[styles.box, { width: size, height: size }]}>
      <Svg width={size} height={size} viewBox="0 0 64 64">
        {/* Outer readiness arc — accent (lime), drawn first as a desaturated grey then fades to lime. */}
        <AnimatedPath
          d="M6 50 A26 26 0 0 1 58 50"
          fill="none"
          strokeWidth={1.8 / s}
          strokeLinecap="round"
          opacity={0.9}
          strokeDasharray={`${LEN_OUTER_ARC} ${LEN_OUTER_ARC}`}
          animatedProps={outerArcProps}
        />
        {/* Inner load arc — blue. */}
        <AnimatedPath
          d="M14 50 A18 18 0 0 1 50 50"
          fill="none"
          stroke={colors.load}
          strokeWidth={1.2 / s}
          strokeLinecap="round"
          opacity={0.7}
          strokeDasharray={`${LEN_INNER_ARC} ${LEN_INNER_ARC}`}
          animatedProps={innerArcProps}
        />
        {/* Left horn — cubic bezier from centre to upper-left. */}
        <AnimatedPath
          d="M32 50 C26 36 18 22 14 6"
          fill="none"
          stroke={colors.horn}
          strokeWidth={2.6 / s}
          strokeLinecap="round"
          strokeDasharray={`${LEN_HORN} ${LEN_HORN}`}
          animatedProps={leftHornProps}
        />
        {/* Right horn — mirror of left. */}
        <AnimatedPath
          d="M32 50 C38 36 46 22 50 6"
          fill="none"
          stroke={colors.horn}
          strokeWidth={2.6 / s}
          strokeLinecap="round"
          strokeDasharray={`${LEN_HORN} ${LEN_HORN}`}
          animatedProps={rightHornProps}
        />
        {/* Centre dot — lime. Fades in after the horns have nearly finished drawing. */}
        <AnimatedCircle
          cx={32}
          cy={50}
          r={3 / s}
          fill={colors.accent}
          animatedProps={centerDotProps}
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center' },
});
