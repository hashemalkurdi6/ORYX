// Notifications settings — master toggle + per-category toggles.
//
// Persisted via GET/PATCH /users/me/preferences (notif_* columns on users)
// so settings survive reinstalls. Wired 2026-04-26.

import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Switch, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { type as TY, radius as R, space as SP } from '@/services/theme';
import AmbientBackdrop from '@/components/AmbientBackdrop';
import { getMyPreferences, updateMyPreferences, type UserPreferences } from '@/services/api';

interface CatRow {
  key: 'notif_workouts' | 'notif_moments' | 'notif_messages' | 'notif_social' | 'notif_ai_insights';
  label: string;
  hint?: string;
}

const CATEGORIES: CatRow[] = [
  { key: 'notif_workouts',    label: 'Workout reminders', hint: 'Pre-workout and recovery nudges' },
  { key: 'notif_moments',     label: 'Moments',           hint: 'When friends post a Moment' },
  { key: 'notif_messages',    label: 'Direct messages',   hint: 'New DMs from anyone you allow' },
  { key: 'notif_social',      label: 'Social activity',   hint: 'Likes, comments, follows' },
  { key: 'notif_ai_insights', label: 'AI insights',       hint: 'Daily diagnoses and weekly recaps' },
];

export default function NotificationsScreen() {
  const { theme: T } = useTheme();
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getMyPreferences()
      .then((p) => { if (active) setPrefs(p); })
      .catch(() => { if (active) setError('Could not load notification settings.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

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
            Notifications
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
          <Text style={{
            fontFamily: TY.mono.semibold, fontSize: TY.size.micro, color: T.text.muted,
            textTransform: 'uppercase', letterSpacing: TY.tracking.label, marginBottom: SP[2],
            marginTop: SP[3],
          }}>
            ALL NOTIFICATIONS
          </Text>

          <View style={{
            backgroundColor: T.bg.elevated, borderWidth: 1, borderColor: T.border, borderRadius: R.md,
          }}>
            <View style={{
              flexDirection: 'row', alignItems: 'center',
              paddingHorizontal: SP[4], paddingVertical: SP[4],
            }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: TY.sans.semibold, fontSize: TY.size.body + 1, color: T.text.primary }}>
                  Push notifications
                </Text>
                <Text style={{ fontFamily: TY.sans.regular, fontSize: TY.size.small + 1, color: T.text.muted, marginTop: 2 }}>
                  Master switch for everything below
                </Text>
              </View>
              <Switch
                value={prefs.notifications_enabled}
                onValueChange={(v) => patch({ notifications_enabled: v })}
                trackColor={{ false: T.border, true: T.accent }}
                thumbColor={prefs.notifications_enabled ? T.accentInk : T.text.muted}
              />
            </View>
          </View>

          <Text style={{
            fontFamily: TY.mono.semibold, fontSize: TY.size.micro, color: T.text.muted,
            textTransform: 'uppercase', letterSpacing: TY.tracking.label,
            marginTop: SP[5], marginBottom: SP[2],
          }}>
            CATEGORIES
          </Text>

          <View style={{
            backgroundColor: T.bg.elevated, borderWidth: 1, borderColor: T.border, borderRadius: R.md,
          }}>
            {CATEGORIES.map((c, i) => {
              const value = prefs.notifications_enabled && (prefs[c.key] as boolean);
              const disabled = !prefs.notifications_enabled;
              return (
              <View
                key={c.key}
                style={{
                  flexDirection: 'row', alignItems: 'center',
                  paddingHorizontal: SP[4], paddingVertical: SP[3] + 2,
                  borderTopWidth: i === 0 ? 0 : 1, borderTopColor: T.border,
                  opacity: disabled ? 0.4 : 1,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: TY.sans.medium, fontSize: TY.size.body + 1, color: T.text.primary }}>
                    {c.label}
                  </Text>
                  {c.hint ? (
                    <Text style={{ fontFamily: TY.sans.regular, fontSize: TY.size.small, color: T.text.muted, marginTop: 2 }}>
                      {c.hint}
                    </Text>
                  ) : null}
                </View>
                <Switch
                  value={value}
                  onValueChange={(v) => patch({ [c.key]: v } as Partial<UserPreferences>)}
                  disabled={disabled}
                  trackColor={{ false: T.border, true: T.accent }}
                  thumbColor={value ? T.accentInk : T.text.muted}
                />
              </View>
              );
            })}
          </View>
        </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}
