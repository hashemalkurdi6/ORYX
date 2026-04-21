// Privacy settings — public/private account, DM permissions, visibility of
// activity heatmap and personal bests, blocked users list.
//
// All fields here need backend support that doesn't exist yet:
//   users.is_private, users.dm_permission, users.privacy_settings JSON,
//   users.blocked_users + GET/PATCH /users/me/preferences.
// State is local-only; the UI is the contract for Phase E backend work.

import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { type as TY, radius as R, space as SP } from '@/services/theme';
import AmbientBackdrop from '@/components/AmbientBackdrop';

type DmAudience = 'everyone' | 'mutuals' | 'following';

const DM_OPTIONS: { key: DmAudience; label: string; hint: string }[] = [
  { key: 'everyone',  label: 'Everyone',     hint: 'Anyone on ORYX can DM you' },
  { key: 'mutuals',   label: 'Mutuals only', hint: 'Only people who follow you back' },
  { key: 'following', label: 'People you follow', hint: 'Only people in your following list' },
];

// Defined at module scope so React doesn't unmount/remount them on every parent
// re-render — that was causing toggle flicker and color glitches.
type Theme = ReturnType<typeof useTheme>['theme'];

function Section({ label, children, theme }: { label: string; children: React.ReactNode; theme: Theme }) {
  return (
    <>
      <Text style={{
        fontFamily: TY.mono.semibold, fontSize: TY.size.micro, color: theme.text.muted,
        textTransform: 'uppercase', letterSpacing: TY.tracking.label,
        marginTop: SP[5], marginBottom: SP[2],
      }}>
        {label}
      </Text>
      <View style={{ backgroundColor: theme.bg.elevated, borderWidth: 1, borderColor: theme.border, borderRadius: R.md }}>
        {children}
      </View>
    </>
  );
}

function ToggleRow({ label, hint, value, onChange, divider, theme }: {
  label: string; hint?: string; value: boolean; onChange: (v: boolean) => void; divider?: boolean; theme: Theme;
}) {
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: SP[4], paddingVertical: SP[3] + 2,
      borderTopWidth: divider ? 1 : 0, borderTopColor: theme.border,
    }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: TY.sans.medium, fontSize: TY.size.body + 1, color: theme.text.primary }}>
          {label}
        </Text>
        {hint ? (
          <Text style={{ fontFamily: TY.sans.regular, fontSize: TY.size.small, color: theme.text.muted, marginTop: 2 }}>
            {hint}
          </Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: theme.border, true: theme.accent }}
        thumbColor={value ? theme.accentInk : theme.text.muted}
      />
    </View>
  );
}

export default function PrivacyScreen() {
  const { theme: T } = useTheme();
  const [isPrivate, setIsPrivate] = useState(false);
  const [dmAudience, setDmAudience] = useState<DmAudience>('everyone');
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showPRs, setShowPRs] = useState(true);

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
            Privacy
          </Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: SP[5], paddingBottom: SP[10] }}>
          <Section label="ACCOUNT" theme={T}>
            <ToggleRow
              label="Private account"
              hint="Approve every follower request manually"
              value={isPrivate}
              onChange={setIsPrivate}
              theme={T}
            />
          </Section>

          <Section label="DIRECT MESSAGES" theme={T}>
            {DM_OPTIONS.map((opt, i) => {
              const active = dmAudience === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  onPress={() => setDmAudience(opt.key)}
                  activeOpacity={0.75}
                  style={{
                    flexDirection: 'row', alignItems: 'center',
                    paddingHorizontal: SP[4], paddingVertical: SP[3] + 2,
                    borderTopWidth: i === 0 ? 0 : 1, borderTopColor: T.border,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: TY.sans.medium, fontSize: TY.size.body + 1, color: T.text.primary }}>
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
                  ) : (
                    <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: T.border }} />
                  )}
                </TouchableOpacity>
              );
            })}
          </Section>

          <Section label="VISIBILITY" theme={T}>
            <ToggleRow
              label="Show activity heatmap"
              hint="Lets others see your training calendar"
              value={showHeatmap}
              onChange={setShowHeatmap}
              theme={T}
            />
            <ToggleRow
              label="Show personal bests"
              hint="Display PRs on your profile"
              value={showPRs}
              onChange={setShowPRs}
              divider
              theme={T}
            />
          </Section>

        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
