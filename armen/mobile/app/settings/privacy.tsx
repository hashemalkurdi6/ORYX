// Privacy settings — public/private account, DM permissions, visibility of
// activity heatmap and personal bests, blocked users list.
//
// All fields here need backend support that doesn't exist yet:
//   users.is_private, users.dm_permission, users.privacy_settings JSON,
//   users.blocked_users + GET/PATCH /users/me/preferences.
// State is local-only; the UI is the contract for Phase E backend work.

import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Switch, Alert } from 'react-native';
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

export default function PrivacyScreen() {
  const { theme: T } = useTheme();
  const [isPrivate, setIsPrivate] = useState(false);
  const [dmAudience, setDmAudience] = useState<DmAudience>('everyone');
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showPRs, setShowPRs] = useState(true);

  const Section = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <>
      <Text style={{
        fontFamily: TY.mono.semibold, fontSize: TY.size.micro, color: T.text.muted,
        textTransform: 'uppercase', letterSpacing: TY.tracking.label,
        marginTop: SP[5], marginBottom: SP[2],
      }}>
        {label}
      </Text>
      <View style={{ backgroundColor: T.bg.elevated, borderWidth: 1, borderColor: T.border, borderRadius: R.md }}>
        {children}
      </View>
    </>
  );

  const ToggleRow = ({ label, hint, value, onChange, divider }: {
    label: string; hint?: string; value: boolean; onChange: (v: boolean) => void; divider?: boolean;
  }) => (
    <View style={{
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: SP[4], paddingVertical: SP[3] + 2,
      borderTopWidth: divider ? 1 : 0, borderTopColor: T.border,
    }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: TY.sans.medium, fontSize: TY.size.body + 1, color: T.text.primary }}>
          {label}
        </Text>
        {hint ? (
          <Text style={{ fontFamily: TY.sans.regular, fontSize: TY.size.small, color: T.text.muted, marginTop: 2 }}>
            {hint}
          </Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: T.border, true: T.accent }}
        thumbColor={value ? T.accentInk : T.text.muted}
      />
    </View>
  );

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
          <Section label="ACCOUNT">
            <ToggleRow
              label="Private account"
              hint="Approve every follower request manually"
              value={isPrivate}
              onChange={setIsPrivate}
            />
          </Section>

          <Section label="DIRECT MESSAGES">
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

          <Section label="VISIBILITY">
            <ToggleRow
              label="Show activity heatmap"
              hint="Lets others see your training calendar"
              value={showHeatmap}
              onChange={setShowHeatmap}
            />
            <ToggleRow
              label="Show personal bests"
              hint="Display PRs on your profile"
              value={showPRs}
              onChange={setShowPRs}
              divider
            />
          </Section>

          <Section label="BLOCKED USERS">
            <TouchableOpacity
              style={{
                flexDirection: 'row', alignItems: 'center',
                paddingHorizontal: SP[4], paddingVertical: SP[4],
              }}
              onPress={() => Alert.alert('Coming Soon', 'Blocked users management lands with backend privacy work.')}
              activeOpacity={0.75}
            >
              <Text style={{ flex: 1, fontFamily: TY.sans.medium, fontSize: TY.size.body + 1, color: T.text.primary }}>
                Manage blocked accounts
              </Text>
              <Ionicons name="chevron-forward" size={16} color={T.text.muted} />
            </TouchableOpacity>
          </Section>

          <Text style={{
            fontFamily: TY.sans.regular, fontSize: TY.size.small, color: T.text.muted,
            marginTop: SP[5], lineHeight: 16, paddingHorizontal: SP[2],
          }}>
            Privacy settings save on this device for now. Server-side privacy enforcement and
            cross-device sync land with the preferences API in the next release.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
