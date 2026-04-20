// Appearance settings — dark / light / match-device.
//
// The user's choice is persisted to AsyncStorage under `oryx.appearance` and
// resolved on every app launch. Switching live mutates the shared theme in
// place + bumps the context version so hook-based consumers re-render.
// Module-level `StyleSheet.create({ ... T.bg.primary ... })` usages at import
// scope need a full app reopen to fully repaint — we surface that below the
// picker so nothing feels broken.

import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { type as TY, radius as R, space as SP } from '@/services/theme';
import AmbientBackdrop from '@/components/AmbientBackdrop';

interface ThemeOption {
  key: 'dark' | 'light' | 'auto';
  label: string;
  hint: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
}

const OPTIONS: ThemeOption[] = [
  { key: 'dark',  label: 'Dark',             hint: 'The ORYX look — warm blue-charcoal surfaces',          icon: 'moon-outline'      },
  { key: 'light', label: 'Light',            hint: 'Same structure, flipped palette for daytime use',       icon: 'sunny-outline'     },
  { key: 'auto',  label: 'Match device',     hint: 'Follow your phone\u2019s system appearance setting',    icon: 'phone-portrait-outline' },
];

export default function AppearanceScreen() {
  const { theme: T, appearance, setAppearance } = useTheme();

  const pick = async (mode: ThemeOption['key']) => {
    if (mode === appearance) return;
    await setAppearance(mode);
  };

  return (
    <View style={{ flex: 1, backgroundColor: T.bg.primary }}>
      <AmbientBackdrop />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: SP[5], paddingTop: SP[2], paddingBottom: SP[3] + 2,
        }}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="chevron-back" size={24} color={T.text.primary} />
          </TouchableOpacity>
          <Text style={{ fontSize: TY.size.h3 - 1, color: T.text.primary, fontFamily: TY.sans.semibold, letterSpacing: -0.3 }}>
            Appearance
          </Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: SP[5], paddingBottom: SP[10] }}>
          <Text style={{
            fontFamily: TY.mono.semibold, fontSize: TY.size.micro, color: T.text.muted,
            textTransform: 'uppercase', letterSpacing: TY.tracking.label, marginBottom: SP[2],
          }}>
            THEME
          </Text>
          <View style={{ backgroundColor: T.bg.elevated, borderWidth: 1, borderColor: T.border, borderRadius: R.md }}>
            {OPTIONS.map((opt, i) => {
              const active = appearance === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  onPress={() => pick(opt.key)}
                  activeOpacity={0.75}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: SP[3],
                    paddingHorizontal: SP[4], paddingVertical: SP[4],
                    borderTopWidth: i === 0 ? 0 : 1, borderTopColor: T.border,
                  }}
                >
                  <Ionicons name={opt.icon} size={20} color={active ? T.accent : T.text.body} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: TY.sans.semibold, fontSize: TY.size.body + 1, color: T.text.primary }}>
                      {opt.label}
                    </Text>
                    <Text style={{ fontFamily: TY.sans.regular, fontSize: TY.size.small, color: T.text.muted, marginTop: 2 }}>
                      {opt.hint}
                    </Text>
                  </View>
                  {active ? (
                    <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: T.accent, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="checkmark" size={12} color={T.accentInk} />
                    </View>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={{
            fontFamily: TY.sans.regular, fontSize: TY.size.small, color: T.text.muted,
            marginTop: SP[5], lineHeight: 17, paddingHorizontal: SP[2],
          }}>
            Both modes share the same layout, typography, and spacing — only the
            color palette changes. Dark stays the default.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
