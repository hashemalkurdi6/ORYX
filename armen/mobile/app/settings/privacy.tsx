// Privacy settings — public/private account, DM permissions, visibility of
// activity heatmap and personal bests.
//
// Persisted via GET/PATCH /users/me/preferences so settings survive reinstalls.
// Wired 2026-04-26 (audits/social-profile-auth-fixes-2026-04-26.md).

import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Switch, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { type as TY, radius as R, space as SP } from '@/services/theme';
import AmbientBackdrop from '@/components/AmbientBackdrop';
import { getMyPreferences, updateMyPreferences, type UserPreferences } from '@/services/api';

type DmAudience = 'everyone' | 'mutuals' | 'following';

const DM_OPTIONS: { key: DmAudience; label: string; hint: string }[] = [
  { key: 'everyone',  label: 'Everyone',     hint: 'Anyone on ORYX can DM you' },
  { key: 'mutuals',   label: 'Mutuals only', hint: 'Only people who follow you back' },
  { key: 'following', label: 'People you follow', hint: 'Only people in your following list' },
];

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

function ToggleRow({ label, hint, value, onChange, divider, theme, disabled }: {
  label: string; hint?: string; value: boolean; onChange: (v: boolean) => void; divider?: boolean; theme: Theme; disabled?: boolean;
}) {
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center',
      paddingHorizontal: SP[4], paddingVertical: SP[3] + 2,
      borderTopWidth: divider ? 1 : 0, borderTopColor: theme.border,
      opacity: disabled ? 0.5 : 1,
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
        disabled={disabled}
        trackColor={{ false: theme.border, true: theme.accent }}
        thumbColor={value ? theme.accentInk : theme.text.muted}
      />
    </View>
  );
}

export default function PrivacyScreen() {
  const { theme: T } = useTheme();
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getMyPreferences()
      .then((p) => { if (active) setPrefs(p); })
      .catch(() => { if (active) setError('Could not load privacy settings.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  // Optimistic update: change UI immediately, then sync to backend. On failure,
  // roll back so the user sees the actual server state.
  const patch = async (delta: Partial<UserPreferences>) => {
    if (!prefs) return;
    const prev = prefs;
    const next = { ...prefs, ...delta };
    setPrefs(next);
    setSaving(true);
    setError(null);
    try {
      const updated = await updateMyPreferences(delta);
      setPrefs(updated);
    } catch {
      setPrefs(prev);
      setError('Could not save. Check your connection.');
    } finally {
      setSaving(false);
    }
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
            Privacy
          </Text>
          <View style={{ width: 24, alignItems: 'flex-end' }}>
            {saving ? <ActivityIndicator size="small" color={T.text.muted} /> : null}
          </View>
        </View>

        {loading || !prefs ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={T.text.muted} />
          </View>
        ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: SP[5], paddingBottom: SP[10] }}>
          {error ? (
            <Text style={{ color: T.status.danger, fontSize: TY.size.small, marginTop: SP[3] }}>{error}</Text>
          ) : null}

          <Section label="ACCOUNT" theme={T}>
            <ToggleRow
              label="Private account"
              hint="Approve every follower request manually"
              value={prefs.is_private}
              onChange={(v) => patch({ is_private: v })}
              theme={T}
            />
          </Section>

          <Section label="DIRECT MESSAGES" theme={T}>
            {DM_OPTIONS.map((opt, i) => {
              const active = prefs.dm_privacy === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  onPress={() => patch({ dm_privacy: opt.key })}
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
              value={prefs.show_activity_heatmap}
              onChange={(v) => patch({ show_activity_heatmap: v })}
              theme={T}
            />
            <ToggleRow
              label="Show personal bests"
              hint="Display PRs on your profile"
              value={prefs.show_personal_bests}
              onChange={(v) => patch({ show_personal_bests: v })}
              divider
              theme={T}
            />
          </Section>

        </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}
