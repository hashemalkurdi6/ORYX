// AmbientBackdrop — the rich multi-colour canvas under the app.
//
// Matches the Claude Design v2 spec exactly:
//   radial-gradient(700px 600px at 20% 5%,  rgba(168,239,58,0.18))
//   radial-gradient(600px 500px at 85% 15%, rgba(91,168,255,0.16))
//   radial-gradient(800px 600px at 50% 88%, rgba(255,107,74,0.12))
//   radial-gradient(500px 400px at 78% 52%, rgba(222,255,71,0.10))
//   radial-gradient(600px 500px at 10% 70%, rgba(91,168,255,0.09))
//   linear-gradient(180deg, #141820 → #0E1118)
//
// React Native has no radial gradient primitive, so each "glow" is an
// absolutely-positioned circular View with a solid fill + opacity. Stacked
// together they add up to the same layered tint. Size/position %'s are
// computed from the device window so the effect is stable on any screen.

import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

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
