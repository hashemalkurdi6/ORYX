// Notifications settings — master toggle + per-category toggles.
//
// Toggles are local-state only for now: there is no
// users.notification_settings column or backend route to persist them.
// Phase E backend work will add a JSON column on users + extend
// PATCH /users/me/preferences to cover them.

import { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { type as TY, radius as R, space as SP } from '@/services/theme';
import AmbientBackdrop from '@/components/AmbientBackdrop';

interface ToggleRow {
  key: string;
  label: string;
  hint?: string;
}

const CATEGORIES: ToggleRow[] = [
  { key: 'workouts',    label: 'Workout reminders', hint: 'Pre-workout and recovery nudges' },
  { key: 'moments',     label: 'Moments',           hint: 'When friends post a Moment' },
  { key: 'messages',    label: 'Direct messages',   hint: 'New DMs from anyone you allow' },
  { key: 'social',      label: 'Social activity',   hint: 'Likes, comments, follows' },
  { key: 'ai_insights', label: 'AI insights',       hint: 'Daily diagnoses and weekly recaps' },
];

export default function NotificationsScreen() {
  const { theme: T } = useTheme();
  const [enabled, setEnabled] = useState(true);
  const [perCategory, setPerCategory] = useState<Record<string, boolean>>(
    Object.fromEntries(CATEGORIES.map((c) => [c.key, true])),
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
            Notifications
          </Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: SP[5], paddingBottom: SP[10] }}>
          <Text style={{
            fontFamily: TY.mono.semibold, fontSize: TY.size.micro, color: T.text.muted,
            textTransform: 'uppercase', letterSpacing: TY.tracking.label, marginBottom: SP[2],
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
                value={enabled}
                onValueChange={setEnabled}
                trackColor={{ false: T.border, true: T.accent }}
                thumbColor={enabled ? T.accentInk : T.text.muted}
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
            {CATEGORIES.map((c, i) => (
              <View
                key={c.key}
                style={{
                  flexDirection: 'row', alignItems: 'center',
                  paddingHorizontal: SP[4], paddingVertical: SP[3] + 2,
                  borderTopWidth: i === 0 ? 0 : 1, borderTopColor: T.border,
                  opacity: enabled ? 1 : 0.4,
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
                  value={enabled && perCategory[c.key]}
                  onValueChange={(v) => setPerCategory((p) => ({ ...p, [c.key]: v }))}
                  disabled={!enabled}
                  trackColor={{ false: T.border, true: T.accent }}
                  thumbColor={(enabled && perCategory[c.key]) ? T.accentInk : T.text.muted}
                />
              </View>
            ))}
          </View>

          <Text style={{
            fontFamily: TY.sans.regular, fontSize: TY.size.small, color: T.text.muted,
            marginTop: SP[5], lineHeight: 16, paddingHorizontal: SP[2],
          }}>
            Toggles are saved on this device for now. Cross-device sync will land with the backend
            preferences endpoint in the next release.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
