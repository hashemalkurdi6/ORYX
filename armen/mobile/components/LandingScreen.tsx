// ORYX — landing screen. First impression for unauthenticated users:
// readiness-color halo, brand logo with self-drawing entry, wordmark + tagline
// + context line, two equal-weight auth buttons.
//
// Entry timeline (≈ 2.6s total):
//   t=0      bg fades in, 300ms
//   t=200    logo paths begin drawing (1.2s ease-out, owned by <Logo />)
//   t=600    readiness arc colour fades from desat → lime (also inside <Logo />)
//   t=1400   wordmark fades + slides up 8px, 400ms
//   t=1700   tagline fades, 300ms
//   t=1900   context line fades, 300ms
//   t=2200   buttons spring up from below, 400ms
// After t=2600: only <ReadinessHalo /> keeps moving (12s breathing loop).
//
// Reduce-motion friendly: when iOS Reduce Motion is on, every shared value
// snaps to its final state on first paint. The halo still cycles colour but
// without the breathing motion (handled inside ReadinessHalo).

import React, { useEffect } from 'react';
import { Text, TouchableOpacity, View, StyleSheet, Dimensions } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '@/contexts/ThemeContext';
import { type as TY, space as SP, radius as R, type ThemeColors } from '@/services/theme';
import Logo from '@/components/Logo';
import ReadinessHalo from '@/components/ReadinessHalo';

const { width: SW } = Dimensions.get('window');

// Halo diameter in px. Sized so the gradient's soft falloff extends a long way
// past the 120px logo on every side — by 100% the gradient is fully transparent
// so there is no boundary visible regardless of how big this gets.
const HALO_SIZE = Math.min(SW * 1.6, 600);
const LOGO_SIZE = 120;
const HALO_OFFSET = (HALO_SIZE - LOGO_SIZE) / 2;

export default function LandingScreen() {
  const { theme } = useTheme();
  const s = styles(theme);
  const reduceMotion = useReducedMotion();

  // Shared values for each piece of the entry timeline. Initial values are
  // set to "post-animation" when reduce-motion is on so we paint the final
  // state on first frame.
  const bgOpacity      = useSharedValue(reduceMotion ? 1 : 0);
  const wordmarkOp     = useSharedValue(reduceMotion ? 1 : 0);
  const wordmarkY      = useSharedValue(reduceMotion ? 0 : 8);
  const taglineOp      = useSharedValue(reduceMotion ? 1 : 0);
  const contextOp      = useSharedValue(reduceMotion ? 1 : 0);
  const buttonsOp      = useSharedValue(reduceMotion ? 1 : 0);
  const buttonsY       = useSharedValue(reduceMotion ? 0 : 60);

  useEffect(() => {
    if (reduceMotion) return;

    bgOpacity.value = withTiming(1, { duration: 300, easing: Easing.out(Easing.quad) });

    wordmarkOp.value = withDelay(1400, withTiming(1, { duration: 400, easing: Easing.out(Easing.cubic) }));
    wordmarkY.value  = withDelay(1400, withTiming(0, { duration: 400, easing: Easing.out(Easing.cubic) }));

    taglineOp.value  = withDelay(1700, withTiming(1, { duration: 300, easing: Easing.out(Easing.quad) }));
    contextOp.value  = withDelay(1900, withTiming(1, { duration: 300, easing: Easing.out(Easing.quad) }));

    buttonsOp.value  = withDelay(2200, withTiming(1, { duration: 250, easing: Easing.out(Easing.quad) }));
    buttonsY.value   = withDelay(2200, withSpring(0, { damping: 14, stiffness: 120, mass: 0.8 }));
  }, [reduceMotion]);

  const bgStyle       = useAnimatedStyle(() => ({ opacity: bgOpacity.value }));
  const wordmarkStyle = useAnimatedStyle(() => ({
    opacity: wordmarkOp.value,
    transform: [{ translateY: wordmarkY.value }],
  }));
  const taglineStyle  = useAnimatedStyle(() => ({ opacity: taglineOp.value }));
  const contextStyle  = useAnimatedStyle(() => ({ opacity: contextOp.value }));
  const buttonsStyle  = useAnimatedStyle(() => ({
    opacity: buttonsOp.value,
    transform: [{ translateY: buttonsY.value }],
  }));

  return (
    <Animated.View style={[s.root, bgStyle]}>
      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
        {/* Logo + text block — vertically centred, slightly above the
            absolute centre so the buttons have room below. The halo is
            anchored as an absolute child of the logo wrapper so it sits
            *behind the mark*, not behind the entire screen. */}
        <View style={s.center}>
          <View style={s.logoCluster}>
            <View pointerEvents="none" style={s.haloAbsolute}>
              <ReadinessHalo size={HALO_SIZE} />
            </View>
            <Logo size={120} />
          </View>

          <Animated.Text style={[s.wordmark, wordmarkStyle]}>ORYX</Animated.Text>

          <Animated.Text style={[s.tagline, taglineStyle]}>Know your body.</Animated.Text>

          <Animated.Text style={[s.context, contextStyle]}>
            The training brain you've been missing.
          </Animated.Text>
        </View>

        {/* Auth buttons — both full width, equal vertical weight. Primary lime
            filled CTA; secondary is an outlined ghost button on the same row
            of importance. No "or" divider. */}
        <Animated.View style={[s.buttonStack, buttonsStyle]}>
          <TouchableOpacity
            style={s.ctaPrimary}
            onPress={() => router.push('/(auth)/signup')}
            activeOpacity={0.85}
          >
            <Text style={s.ctaPrimaryText}>Create Account</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={s.ctaGhost}
            onPress={() => router.push('/(auth)/login')}
            activeOpacity={0.75}
          >
            <Text style={s.ctaGhostText}>Log In</Text>
          </TouchableOpacity>
        </Animated.View>
      </SafeAreaView>
    </Animated.View>
  );
}

const styles = (t: ThemeColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg.primary },
    safe: { flex: 1, paddingHorizontal: SP[7] },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SP[4] },
    // Wraps just the logo so the halo can be positioned absolutely against it
    // without leaking out and pushing other content around. zIndex keeps the
    // logo on top of the halo.
    logoCluster: {
      width: LOGO_SIZE,
      height: LOGO_SIZE,
      alignItems: 'center',
      justifyContent: 'center',
    },
    haloAbsolute: {
      position: 'absolute',
      top: -HALO_OFFSET,
      left: -HALO_OFFSET,
      width: HALO_SIZE,
      height: HALO_SIZE,
    },
    wordmark: {
      fontFamily: TY.sans.bold,
      fontSize: 44,
      letterSpacing: 6,
      color: t.text.primary,
      marginTop: SP[5],
    },
    tagline: {
      fontFamily: TY.sans.medium,
      fontSize: 16,
      color: t.text.secondary,
      marginTop: SP[2],
    },
    context: {
      fontFamily: TY.sans.regular,
      fontSize: 13,
      color: t.text.muted,
      marginTop: SP[1],
      textAlign: 'center',
      paddingHorizontal: SP[6],
    },
    buttonStack: {
      width: '100%',
      gap: SP[3],
      marginBottom: SP[5],
    },
    ctaPrimary: {
      backgroundColor: t.accent,
      borderRadius: R.lg,
      paddingVertical: 16,
      alignItems: 'center',
    },
    ctaPrimaryText: {
      color: t.accentInk,
      fontFamily: TY.sans.bold,
      fontSize: 16,
      letterSpacing: 0.3,
    },
    ctaGhost: {
      borderRadius: R.lg,
      paddingVertical: 16,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: t.accent,
      backgroundColor: 'transparent',
    },
    ctaGhostText: {
      color: t.accent,
      fontFamily: TY.sans.semibold,
      fontSize: 16,
      letterSpacing: 0.3,
    },
  });
