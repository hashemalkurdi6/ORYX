// ORYX — landing screen, Dusk Direction. First impression for unauthenticated
// users: civil-twilight halo behind the brand mark, Fraunces wordmark, italic
// tagline, two CTAs that hold the warm/cool tension of the moment.
// See docs/design/dusk-direction.md.
//
// Entry timeline (≈ 2.6s total):
//   t=0      bg fades in, 300ms
//   t=200    logo paths begin drawing (1.2s ease-out, owned by <Logo />)
//   t=600    halo begins crossfading dusk colours (16s loop)
//   t=1400   wordmark fades + slides up 8px, 400ms
//   t=1700   tagline fades, 300ms
//   t=1900   subtitle fades, 300ms
//   t=2200   buttons settle in from below, 400ms
// After t=2600: only <ReadinessHalo /> keeps moving.
//
// Reduce-motion friendly: when iOS Reduce Motion is on, every shared value
// snaps to its final state on first paint.

import React, { useEffect } from 'react';
import { Text, TouchableOpacity, View, StyleSheet, Dimensions } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
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
import { type as TY, space as SP, type ThemeColors } from '@/services/theme';
import Logo from '@/components/Logo';
import ReadinessHalo from '@/components/ReadinessHalo';

const { width: SW } = Dimensions.get('window');

// Halo diameter — fully transparent at the rim, so the warm glow has no
// visible boundary against the indigo canvas regardless of size.
const HALO_SIZE = Math.min(SW * 1.6, 600);
const LOGO_SIZE = 120;
const HALO_OFFSET = (HALO_SIZE - LOGO_SIZE) / 2;

// Three sky bands of the dusk halo. Ember (warm peak) → Bloom (transition
// rose) → Veil (mauve cool moving in). 16s loop = slower than the original
// readiness halo because dusk does not change in 12 seconds.
const DUSK_HALO: [string, string, string] = ['#EE9B7A', '#E08394', '#9E83BD'];
const HALO_DURATION = 16000;

// Primary CTA gradient: lighter Glow at the top edge (lit by the sky),
// deeper Ember at the bottom (the held warmth). Reads like an object catching
// the last light of the day.
const PRIMARY_GRADIENT: [string, string] = ['#F5BC9A', '#EE9B7A'];

// Bloom — the warm shadow colour cast around the primary CTA. Indigo would
// kill the warmth; black would feel cheap. Bloom radiates.
const PRIMARY_GLOW = '#E08394';

// Horizon at 55% — periwinkle hairline border on the ghost CTA. Cool side
// of the warm/cool pair.
const GHOST_BORDER = 'rgba(126,132,194,0.55)';

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
  const subtitleOp     = useSharedValue(reduceMotion ? 1 : 0);
  const buttonsOp      = useSharedValue(reduceMotion ? 1 : 0);
  const buttonsY       = useSharedValue(reduceMotion ? 0 : 60);

  useEffect(() => {
    if (reduceMotion) return;

    bgOpacity.value = withTiming(1, { duration: 300, easing: Easing.out(Easing.quad) });

    wordmarkOp.value = withDelay(1400, withTiming(1, { duration: 400, easing: Easing.out(Easing.cubic) }));
    wordmarkY.value  = withDelay(1400, withTiming(0, { duration: 400, easing: Easing.out(Easing.cubic) }));

    taglineOp.value  = withDelay(1700, withTiming(1, { duration: 300, easing: Easing.out(Easing.quad) }));
    subtitleOp.value = withDelay(1900, withTiming(1, { duration: 300, easing: Easing.out(Easing.quad) }));

    buttonsOp.value  = withDelay(2200, withTiming(1, { duration: 250, easing: Easing.out(Easing.quad) }));
    buttonsY.value   = withDelay(2200, withSpring(0, { damping: 14, stiffness: 120, mass: 0.8 }));
  }, [reduceMotion]);

  const bgStyle       = useAnimatedStyle(() => ({ opacity: bgOpacity.value }));
  const wordmarkStyle = useAnimatedStyle(() => ({
    opacity: wordmarkOp.value,
    transform: [{ translateY: wordmarkY.value }],
  }));
  const taglineStyle  = useAnimatedStyle(() => ({ opacity: taglineOp.value }));
  const subtitleStyle = useAnimatedStyle(() => ({ opacity: subtitleOp.value }));
  const buttonsStyle  = useAnimatedStyle(() => ({
    opacity: buttonsOp.value,
    transform: [{ translateY: buttonsY.value }],
  }));

  return (
    <Animated.View style={[s.root, bgStyle]}>
      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
        {/* Logo + text block — vertically centred, slightly above the
            absolute centre so the buttons have room below. The dusk halo is
            anchored as an absolute child of the logo wrapper so it sits
            *behind the mark*, not behind the entire screen. */}
        <View style={s.center}>
          <View style={s.logoCluster}>
            <View pointerEvents="none" style={s.haloAbsolute}>
              <ReadinessHalo
                size={HALO_SIZE}
                duration={HALO_DURATION}
                colors={DUSK_HALO}
              />
            </View>
            <Logo size={LOGO_SIZE} />
          </View>

          <Animated.Text style={[s.wordmark, wordmarkStyle]}>ORYX</Animated.Text>

          <Animated.Text style={[s.tagline, taglineStyle]}>Know your body.</Animated.Text>

          <Animated.Text style={[s.subtitle, subtitleStyle]}>
            The training brain you've been missing.
          </Animated.Text>
        </View>

        {/* CTA pair — warm/cool dyad. Primary holds an Ember gradient with a
            soft Bloom halo behind it; Ghost is a transparent panel with a
            periwinkle Horizon hairline. */}
        <Animated.View style={[s.buttonStack, buttonsStyle]}>
          <TouchableOpacity
            onPress={() => router.push('/(auth)/signup')}
            activeOpacity={0.88}
            style={s.ctaPrimaryShell}
          >
            <LinearGradient
              colors={PRIMARY_GRADIENT}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={s.ctaPrimary}
            >
              <Text style={s.ctaPrimaryText}>Create Account</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            style={s.ctaGhost}
            onPress={() => router.push('/(auth)/login')}
            activeOpacity={0.78}
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
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
      fontFamily: TY.serif.semibold,
      fontSize: 46,
      letterSpacing: 4,
      color: t.text.primary,
      marginTop: SP[6],
    },
    tagline: {
      fontFamily: TY.serif.regularItalic,
      fontSize: 18,
      color: t.text.body,
      marginTop: SP[3],
    },
    subtitle: {
      fontFamily: TY.sans.regular,
      fontSize: 13,
      letterSpacing: 0.1,
      color: t.text.secondary,
      marginTop: SP[2],
      textAlign: 'center',
      paddingHorizontal: SP[6],
    },
    buttonStack: {
      width: '100%',
      gap: SP[3],
      marginBottom: SP[5],
    },
    // Outer shell carries the Bloom-tinted iOS shadow that radiates warm
    // glow around the primary CTA. The inner LinearGradient carries the
    // matching radius so the shadow path tracks correctly.
    ctaPrimaryShell: {
      borderRadius: 18,
      shadowColor: PRIMARY_GLOW,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.45,
      shadowRadius: 24,
      elevation: 6,
    },
    ctaPrimary: {
      borderRadius: 18,
      paddingVertical: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ctaPrimaryText: {
      color: t.accentInk,
      fontFamily: TY.sans.medium,
      fontSize: 16,
      letterSpacing: 0.2,
    },
    ctaGhost: {
      borderRadius: 18,
      paddingVertical: 16,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: GHOST_BORDER,
      backgroundColor: 'transparent',
    },
    ctaGhostText: {
      color: t.text.primary,
      fontFamily: TY.sans.medium,
      fontSize: 16,
      letterSpacing: 0.2,
    },
  });
