// Appearance settings — for now this is purely informational. Dark mode is
// the only theme; light/auto modes are flagged "Coming soon" until the
// design system grows to cover a light palette.

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
  available: boolean;
}

const OPTIONS: ThemeOption[] = [
  { key: 'dark',  label: 'Dark',         hint: 'The ORYX look',                    icon: 'moon-outline',     available: true  },
  { key: 'light', label: 'Light',        hint: 'Coming soon',                      icon: 'sunny-outline',    available: false },
  { key: 'auto',  label: 'Match system', hint: 'Coming soon',                      icon: 'phone-portrait-outline', available: false },
];

export default function AppearanceScreen() {
  const { theme: T } = useTheme();

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
              const active = opt.key === 'dark';
              return (
                <View
                  key={opt.key}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: SP[3],
                    paddingHorizontal: SP[4], paddingVertical: SP[4],
                    borderTopWidth: i === 0 ? 0 : 1, borderTopColor: T.border,
                    opacity: opt.available ? 1 : 0.55,
                  }}
                >
                  <Ionicons name={opt.icon} size={20} color={opt.available ? T.text.body : T.text.muted} />
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
                </View>
              );
            })}
          </View>

          <Text style={{
            fontFamily: TY.sans.regular, fontSize: TY.size.small, color: T.text.muted,
            marginTop: SP[5], lineHeight: 16, paddingHorizontal: SP[2],
          }}>
            ORYX is built dark-first. Light + auto modes will arrive once we ship a light palette
            for the design system.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
