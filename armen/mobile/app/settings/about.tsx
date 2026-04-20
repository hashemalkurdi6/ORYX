// About ORYX — version + legal links. The legal pages aren't hosted yet,
// so the buttons open Linking with placeholder URLs that can be updated
// once the marketing site exists.

import { View, Text, ScrollView, TouchableOpacity, Linking, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import Constants from 'expo-constants';
import { useTheme } from '@/contexts/ThemeContext';
import { type as TY, radius as R, space as SP } from '@/services/theme';
import AmbientBackdrop from '@/components/AmbientBackdrop';

const VERSION = Constants.expoConfig?.version ?? '1.0.0';
const TOS_URL = 'https://oryx.app/terms';
const PRIVACY_URL = 'https://oryx.app/privacy';

export default function AboutScreen() {
  const { theme: T } = useTheme();

  const open = (url: string) => Linking.openURL(url).catch(() => {});

  const Row = ({ icon, label, onPress, divider }: {
    icon: React.ComponentProps<typeof Ionicons>['name'];
    label: string;
    onPress?: () => void;
    divider?: boolean;
  }) => (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      disabled={!onPress}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: SP[3],
        paddingHorizontal: SP[4], paddingVertical: SP[4],
        borderTopWidth: divider ? 1 : 0, borderTopColor: T.border,
      }}
    >
      <Ionicons name={icon} size={18} color={T.text.secondary} />
      <Text style={{ flex: 1, fontFamily: TY.sans.medium, fontSize: TY.size.body + 1, color: T.text.primary }}>
        {label}
      </Text>
      {onPress ? <Ionicons name="open-outline" size={16} color={T.text.muted} /> : null}
    </TouchableOpacity>
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
            About ORYX
          </Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: SP[5], paddingBottom: SP[10] }}>
          {/* Wordmark + version */}
          <View style={{ alignItems: 'center', paddingVertical: SP[8], gap: SP[2] }}>
            <Text style={{
              fontFamily: TY.sans.bold,
              fontSize: 36,
              color: T.text.primary,
              letterSpacing: 6,
            }}>
              ORYX
            </Text>
            <Text style={{
              fontFamily: TY.mono.medium,
              fontSize: TY.size.small,
              color: T.text.muted,
              letterSpacing: TY.tracking.label,
              textTransform: 'uppercase',
            }}>
              Version {VERSION}
            </Text>
          </View>

          <Text style={{
            fontFamily: TY.mono.semibold, fontSize: TY.size.micro, color: T.text.muted,
            textTransform: 'uppercase', letterSpacing: TY.tracking.label, marginBottom: SP[2],
          }}>
            LEGAL
          </Text>
          <View style={{ backgroundColor: T.bg.elevated, borderWidth: 1, borderColor: T.border, borderRadius: R.md }}>
            <Row icon="document-text-outline" label="Terms of Service" onPress={() => open(TOS_URL)} />
            <Row icon="shield-checkmark-outline" label="Privacy Policy" onPress={() => open(PRIVACY_URL)} divider />
          </View>

          <Text style={{
            fontFamily: TY.sans.regular, fontSize: TY.size.small, color: T.text.muted,
            marginTop: SP[8], textAlign: 'center', lineHeight: 16,
          }}>
            ORYX — fitness intelligence for athletes who want to train smarter, not harder.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
