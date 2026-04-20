// AmbientBackdrop — the rich multi-colour canvas under the app.
//
// Dark mode (original Claude Design v2 spec, unchanged):
//   radial glow stack over a #141820 → #0E1118 base
//
// Light mode (from Claude Design "ORYX Light" handoff):
//   radial-gradient(ellipse at 40% 0%, #D8F2A8 0%, #EEF2FA 40%, #E4EAF8 100%)
//   A pale green-to-periwinkle wash. Same structural idea (soft radial tint),
//   just lightened neutrals and a single dominant tint instead of five glows.
//
// React Native has no radial gradient primitive, so each "glow" is an
// absolutely-positioned circular View with a solid fill + opacity. The chosen
// glow set / opacities change per resolvedScheme; positions + sizes are
// computed from the device window so the effect is stable on any screen.

import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/contexts/ThemeContext';

// Single radial-glow blob. Circular View with `opacity` — larger than the
// target diameter so the fade-out is softer against neighbours.
function Glow({
  color, opacity, size, x, y,
}: {
  color: string;
  opacity: number;
  size: number;       // diameter in px
  x: number;          // centre-x as fraction of screen width
  y: number;          // centre-y as fraction of screen height
}) {
  const { width, height } = Dimensions.get('window');
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: width * x - size / 2,
        top:  height * y - size / 2,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        opacity,
      }}
    />
  );
}

export default function AmbientBackdrop() {
  const { resolvedScheme } = useTheme();

  if (resolvedScheme === 'light') {
    // Light mode is NOT inverted dark. Clean warm-neutral canvas with a gentle
    // warm-ivory radial behind the readiness ring so the hero area feels
    // anchored instead of floating on flat white. Subtle by design.
    return (
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {/* Warm near-white base */}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#FAFAFA' }]} />
        {/* Warm ivory halo centred behind the hero ring */}
        <Glow color="#FFF2D6" opacity={0.70} size={860} x={0.50} y={0.22} />
        <Glow color="#FFF8EA" opacity={0.60} size={540} x={0.50} y={0.22} />
      </View>
    );
  }

  // Dark mode — original spec, exactly as it was.
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {/* Deep-slate base */}
      <LinearGradient
        colors={['#141820', '#0E1118']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Top-left: lime, strongest */}
      <Glow color="#A8EF3A" opacity={0.18} size={700} x={0.20} y={0.05} />
      {/* Top-right: sky blue */}
      <Glow color="#5BA8FF" opacity={0.16} size={600} x={0.85} y={0.15} />
      {/* Bottom-centre: coral */}
      <Glow color="#FF6B4A" opacity={0.12} size={800} x={0.50} y={0.88} />
      {/* Mid-right: electric accent */}
      <Glow color="#DEFF47" opacity={0.10} size={500} x={0.78} y={0.52} />
      {/* Lower-left: second blue */}
      <Glow color="#5BA8FF" opacity={0.09} size={600} x={0.10} y={0.70} />
    </View>
  );
}
