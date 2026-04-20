// Help & Support — small landing with an email link to support.

import { View, Text, ScrollView, TouchableOpacity, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { type as TY, radius as R, space as SP } from '@/services/theme';
import AmbientBackdrop from '@/components/AmbientBackdrop';

const SUPPORT_EMAIL = 'support@oryx.app';

export default function HelpScreen() {
  const { theme: T } = useTheme();

  const emailSupport = () => {
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=ORYX support`).catch(() => {});
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
            Help &amp; Support
          </Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: SP[5], paddingBottom: SP[10] }}>
          <View style={{ alignItems: 'center', paddingVertical: SP[7] }}>
            <View style={{
              width: 64, height: 64, borderRadius: R.pill,
              backgroundColor: T.accentDim, borderWidth: 1, borderColor: T.accent,
              alignItems: 'center', justifyContent: 'center', marginBottom: SP[4],
            }}>
              <Ionicons name="chatbubbles-outline" size={28} color={T.accent} />
            </View>
            <Text style={{
              fontFamily: TY.sans.bold, fontSize: TY.size.h2, color: T.text.primary,
              textAlign: 'center', letterSpacing: TY.tracking.tight, marginBottom: SP[2],
            }}>
              How can we help?
            </Text>
            <Text style={{
              fontFamily: TY.sans.regular, fontSize: TY.size.body + 1, color: T.text.body,
              textAlign: 'center', lineHeight: 22, paddingHorizontal: SP[3],
            }}>
              Email the team directly. We try to respond within one business day.
            </Text>
          </View>

          <TouchableOpacity
            onPress={emailSupport}
            activeOpacity={0.85}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: SP[3],
              backgroundColor: T.accent,
              borderRadius: R.sm,
              paddingVertical: SP[4],
              paddingHorizontal: SP[5],
              justifyContent: 'center',
            }}
          >
            <Ionicons name="mail-outline" size={18} color={T.accentInk} />
            <Text style={{
              fontFamily: TY.sans.bold, fontSize: TY.size.body + 1, color: T.accentInk,
              letterSpacing: TY.tracking.tight,
            }}>
              {SUPPORT_EMAIL}
            </Text>
          </TouchableOpacity>

          <View style={{
            backgroundColor: T.bg.elevated, borderWidth: 1, borderColor: T.border, borderRadius: R.md,
            padding: SP[4], marginTop: SP[6], gap: SP[2],
          }}>
            <Text style={{
              fontFamily: TY.mono.semibold, fontSize: TY.size.micro, color: T.text.muted,
              letterSpacing: TY.tracking.label, textTransform: 'uppercase',
            }}>
              When emailing, include
            </Text>
            <Text style={{ fontFamily: TY.sans.regular, fontSize: TY.size.body, color: T.text.body, lineHeight: 20 }}>
              · Your username{'\n'}
              · A short description of what went wrong{'\n'}
              · Screenshots if relevant{'\n'}
              · The device you\'re using
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
