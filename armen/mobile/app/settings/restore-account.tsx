import { useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { restoreAccount, getMe } from '@/services/api';
import { useAuthStore } from '@/services/authStore';
import { useTheme } from '@/contexts/ThemeContext';
import { ThemeColors, type as TY, radius as R, space as SP } from '@/services/theme';

function formatDate(iso: string | null | undefined): string {
  if (!iso) return 'soon';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'soon';
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export default function RestoreAccountScreen() {
  const { theme } = useTheme();
  const s = useMemo(() => createStyles(theme), [theme]);
  const params = useLocalSearchParams<{
    pending_token?: string;
    deletion_date?: string;
    user_id?: string;
    email?: string;
  }>();

  const pendingToken = typeof params.pending_token === 'string' ? params.pending_token : '';
  const deletionDate = typeof params.deletion_date === 'string' ? params.deletion_date : '';
  const email = typeof params.email === 'string' ? params.email : '';

  const setAuth = useAuthStore((state) => state.setAuth);
  const [restoring, setRestoring] = useState(false);

  const goToLogin = () => router.replace('/(auth)/login');

  const handleRestore = async () => {
    if (!pendingToken || restoring) return;
    setRestoring(true);
    try {
      const tokenResponse = await restoreAccount(pendingToken);
      const token = tokenResponse.access_token;
      useAuthStore.setState({ token });
      const user = await getMe();
      setAuth(token, user);
      router.replace('/(tabs)/');
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number } };
      const status = axiosErr?.response?.status;
      if (status === 410) {
        Alert.alert(
          'Grace period ended',
          'Your grace period has ended. This account is permanently deleted.',
          [{ text: 'OK', onPress: goToLogin }],
        );
      } else if (status === 401) {
        Alert.alert(
          'Session expired',
          'Your restore session is no longer valid. Please log in again.',
          [{ text: 'OK', onPress: goToLogin }],
        );
      } else {
        Alert.alert('Error', 'Could not restore account. Please try again.');
      }
    } finally {
      setRestoring(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={['top']} style={{ backgroundColor: theme.bg.primary }}>
        <View style={s.header}>
          <TouchableOpacity onPress={goToLogin} hitSlop={10}>
            <Ionicons name="chevron-back" size={24} color={theme.text.primary} />
          </TouchableOpacity>
          <View style={{ width: 24 }} />
        </View>
      </SafeAreaView>

      <ScrollView style={s.container} contentContainerStyle={s.contentContainer}>
        <View style={s.iconCircle}>
          <Ionicons name="time-outline" size={36} color={theme.accent} />
        </View>

        <Text style={s.heading}>Your account is pending deletion</Text>
        <Text style={s.subheading}>
          We&apos;ll permanently delete your account on {formatDate(deletionDate)}. You can restore it by tapping below — your data is still intact.
        </Text>

        {email ? (
          <View style={s.emailRow}>
            <Ionicons name="mail-outline" size={14} color={theme.text.muted} />
            <Text style={s.emailText}>{email}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={[s.primaryBtn, restoring && s.btnDisabled]}
          onPress={handleRestore}
          disabled={restoring || !pendingToken}
          activeOpacity={0.85}
        >
          {restoring ? (
            <ActivityIndicator color={theme.accentInk} size="small" />
          ) : (
            <Text style={s.primaryBtnText}>Restore account</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={s.destructiveLink} onPress={goToLogin} activeOpacity={0.7}>
          <Text style={s.destructiveLinkText}>Continue with deletion</Text>
        </TouchableOpacity>
      </ScrollView>
    </>
  );
}

function createStyles(t: ThemeColors) {
  return StyleSheet.create({
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SP[5],
      paddingTop: SP[2],
      paddingBottom: SP[3] + 2,
    },
    container: { flex: 1, backgroundColor: t.bg.primary },
    contentContainer: {
      paddingHorizontal: SP[6],
      paddingTop: SP[6],
      paddingBottom: SP[10],
      alignItems: 'center',
    },
    iconCircle: {
      width: 80, height: 80, borderRadius: R.pill,
      backgroundColor: t.accentDim,
      alignItems: 'center', justifyContent: 'center',
      marginBottom: SP[6],
    },
    heading: {
      fontFamily: TY.sans.bold,
      fontSize: TY.size.h1,
      color: t.text.primary,
      letterSpacing: TY.tracking.tight,
      marginBottom: SP[3],
      textAlign: 'center',
    },
    subheading: {
      fontFamily: TY.sans.regular,
      fontSize: TY.size.body + 1,
      color: t.text.secondary,
      lineHeight: 22,
      marginBottom: SP[5],
      textAlign: 'center',
    },
    emailRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SP[2],
      backgroundColor: t.bg.elevated,
      borderRadius: R.pill,
      paddingHorizontal: SP[4],
      paddingVertical: SP[2] + 2,
      borderWidth: 1,
      borderColor: t.border,
      marginBottom: SP[6],
    },
    emailText: {
      fontFamily: TY.sans.medium,
      fontSize: TY.size.small + 1,
      color: t.text.primary,
    },
    primaryBtn: {
      backgroundColor: t.accent,
      borderRadius: R.sm,
      paddingVertical: SP[4],
      alignItems: 'center',
      alignSelf: 'stretch',
      marginTop: SP[2],
    },
    primaryBtnText: {
      fontFamily: TY.sans.bold,
      color: t.accentInk,
      fontSize: TY.size.body + 2,
      letterSpacing: TY.tracking.tight,
    },
    btnDisabled: { opacity: 0.5 },
    destructiveLink: { alignItems: 'center', paddingVertical: SP[4], marginTop: SP[2] },
    destructiveLinkText: {
      fontFamily: TY.sans.medium,
      color: t.status.danger,
      fontSize: TY.size.body + 1,
      textDecorationLine: 'underline',
    },
  });
}
