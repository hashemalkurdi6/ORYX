// GlassCard — the single reusable card primitive for the ORYX redesign.
//
// What makes it "glassy":
// - Very subtle white wash over the dark app bg (glass.card)
// - 1px rim border (glass.border)
// - 20px corner radius
// - A 1–2px top-edge inner highlight gradient (glass.highlight → transparent)
//   drawn over the content — this is the detail that sells the premium feel.
//
// BlurView upgrade path: when `expo-blur` is installed
// (`npx expo install expo-blur`), set `blur` to true. The component soft-imports
// BlurView and renders it behind the wash. On Android the effect is weaker —
// the wash + border combo is designed to stand on its own without it.
//
// Typical usage:
//   <GlassCard>...</GlassCard>
//   <GlassCard variant="hi" accentEdge="left">...</GlassCard>
//   <GlassCard onPress={...} padding={18}>...</GlassCard>

import React from 'react';
import {
  View,
  ViewStyle,
  StyleProp,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/contexts/ThemeContext';

// Soft-require BlurView. Package may not be installed yet — don't hard-fail.
let BlurView: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  BlurView = require('expo-blur').BlurView;
} catch {
  BlurView = null;
}

export type GlassCardVariant = 'default' | 'hi' | 'lo';

export interface GlassCardProps {
  children: React.ReactNode;
  variant?: GlassCardVariant;
  padding?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  /** Draws a coloured bar on one edge — used by the ORYX Intelligence card. */
  accentEdge?: 'left' | 'top' | null;
  /** Accent bar colour. Defaults to theme.accent. */
  accentColor?: string;
  /** Accent bar thickness in px. Default 2. */
  accentThickness?: number;
  /** Opt out of backdrop blur if you need the card perfectly flat. */
  blur?: boolean;
  /** Blur intensity (1–100). Default 30 — matches Claude Design v2 cards. */
  blurIntensity?: number;
  testID?: string;
}

export default function GlassCard({
  children,
  variant = 'default',
  padding,
  radius: radiusOverride,
  style,
  onPress,
  accentEdge = null,
  accentColor,
  accentThickness = 2,
  blur = true,
  blurIntensity = 30,
  testID,
}: GlassCardProps) {
  const { theme, radius, space } = useTheme();

  const fill =
    variant === 'hi' ? theme.glass.cardHi :
    variant === 'lo' ? theme.glass.cardLo :
    theme.glass.card;

  const cornerRadius = radiusOverride ?? radius.lg; // 20
  const pad = padding ?? space[4];                   // 16

  const canBlur = blur && BlurView != null && Platform.OS !== 'web';

  const outerStyle: ViewStyle = {
    borderRadius: cornerRadius,
    borderWidth: 1,
    borderColor: theme.glass.border,
    backgroundColor: canBlur ? 'transparent' : fill,
    overflow: 'hidden',
    position: 'relative',
  };

  const Shell: any = onPress ? TouchableOpacity : View;
  const shellProps = onPress ? { onPress, activeOpacity: 0.85 } : {};

  const content = (
    <>
      {/* Optional backdrop blur (soft-imported). systemChromeMaterialDark stays
          tethered to a dark base colour on iOS so the card doesn't read cream. */}
      {canBlur && BlurView ? (
        <BlurView
          intensity={blurIntensity}
          tint="systemChromeMaterialDark"
          style={[StyleSheet.absoluteFill, { backgroundColor: fill }]}
        />
      ) : null}

      {/* Top-edge inner highlight — the "premium" tell */}
      <LinearGradient
        colors={[theme.glass.highlight, 'rgba(255,255,255,0)']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.topHighlight}
        pointerEvents="none"
      />

      {/* Accent edge (used by ORYX Intelligence) */}
      {accentEdge === 'left' ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 0,
            width: accentThickness,
            backgroundColor: accentColor ?? theme.accent,
          }}
        />
      ) : null}
      {accentEdge === 'top' ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: accentThickness,
            backgroundColor: accentColor ?? theme.accent,
          }}
        />
      ) : null}

      <View style={{ padding: pad }}>{children}</View>
    </>
  );

  return (
    <Shell {...shellProps} testID={testID} style={[outerStyle, style]}>
      {content}
    </Shell>
  );
}

const styles = StyleSheet.create({
  topHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
  },
});
