import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { deleteMyAccount, getMe } from '@/services/api';
import { useAuthStore } from '@/services/authStore';
import { useTheme } from '@/contexts/ThemeContext';
import { ThemeColors, type as TY, radius as R, space as SP } from '@/services/theme';

type Step = 'warning' | 'confirm' | 'success';

const DELETION_BULLETS: Array<{ icon: React.ComponentProps<typeof Ionicons>['name']; text: string }> = [
  { icon: 'barbell-outline', text: 'All your workouts, activities, and training history' },
  { icon: 'images-outline', text: 'Posts, stories, and photos' },
  { icon: 'chatbubbles-outline', text: 'Direct messages and comments' },
  { icon: 'restaurant-outline', text: 'Nutrition logs and meal plans' },
  { icon: 'pulse-outline', text: 'Wellness and weight tracking data' },
  { icon: 'watch-outline', text: 'Connected wearables (Strava, Whoop, Oura, Hevy)' },
];

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export default function DeleteAccountScreen() {
  const { theme } = useTheme();
  const s = useMemo(() => createStyles(theme), [theme]);
  const { user, setAuth, token, clearAuth } = useAuthStore();

  const [step, setStep] = useState<Step>('warning');
  const [typed, setTyped] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [username, setUsername] = useState<string | null>(user?.username ?? null);

  // Ensure we have a username
  useEffect(() => {
    if (username) return;
    let cancelled = false;
    (async () => {
      try {
        const me = await getMe();
        if (cancelled) return;
        setUsername(me.username);
        if (token) setAuth(token, me);
      } catch {
        // ignore — confirm step will guard against null username
      }
    })();
    return () => { cancelled = true; };
  }, [username, token, setAuth]);

  // Auto-route after success
  useEffect(() => {
    if (step !== 'success') return;
    const t = setTimeout(() => {
      clearAuth();
      router.replace('/(auth)/login');
    }, 5000);
    return () => clearTimeout(t);
  }, [step, clearAuth]);

  const deletionDateStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return formatDate(d);
  }, []);

  const normalizedTyped = typed.trim().toLowerCase().replace(/^@/, '');
  const normalizedUsername = (username ?? '').trim().toLowerCase();
  const matches = normalizedUsername.length > 0 && normalizedTyped === normalizedUsername;

  const handleConfirmDelete = async () => {
    if (!matches || submitting) return;
    setSubmitting(true);
    try {
      await deleteMyAccount();
      setStep('success');
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number; data?: { detail?: string } } };
      const status = axiosErr?.response?.status;
      if (status === 401) {
        Alert.alert('Session expired', 'Please log in again.', [
          {
            text: 'OK',
            onPress: () => {
              clearAuth();
              router.replace('/(auth)/login');
            },
          },
        ]);
      } else {
        const detail = axiosErr?.response?.data?.detail ?? 'Could not delete account. Please try again.';
        Alert.alert('Error', typeof detail === 'string' ? detail : 'Could not delete account. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDonePress = () => {
    clearAuth();
    router.replace('/(auth)/login');
  };

  const handleBack = () => {
    if (step === 'confirm') setStep('warning');
    else router.back();
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView edges={['top']} style={{ backgroundColor: theme.bg.primary }}>
        <View style={s.header}>
          {step !== 'success' ? (
            <TouchableOpacity onPress={handleBack} hitSlop={10}>
              <Ionicons name="chevron-back" size={24} color={theme.text.primary} />
            </TouchableOpacity>
          ) : <View style={{ width: 24 }} />}
          <View style={{ width: 24 }} />
        </View>
      </SafeAreaView>

      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: theme.bg.primary }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView style={s.container} contentContainerStyle={s.contentContainer} keyboardShouldPersistTaps="handled">
          {step === 'warning' && (
            <>
              <Text style={s.heading}>Delete your account?</Text>
              <Text style={s.subheading}>
                This will permanently delete your ORYX account in 30 days. You can cancel by logging in before then.
              </Text>

              <View style={s.bulletList}>
                {DELETION_BULLETS.map((b, i) => (
                  <View key={i} style={s.bulletRow}>
                    <View style={s.bulletIcon}>
                      <Ionicons name={b.icon} size={16} color={theme.status.danger} />
                    </View>
                    <Text style={s.bulletText}>{b.text}</Text>
                  </View>
                ))}
              </View>

              <View style={s.reassuranceBox}>
                <Ionicons name="information-circle-outline" size={16} color={theme.text.secondary} />
                <Text style={s.reassuranceText}>
                  You have 30 days to restore your account by logging back in.
                </Text>
              </View>

              <TouchableOpacity style={s.primaryBtn} onPress={() => setStep('confirm')} activeOpacity={0.85}>
                <Text style={s.primaryBtnText}>Continue</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.linkBtn} onPress={() => router.back()} activeOpacity={0.7}>
                <Text style={s.linkBtnText}>Cancel</Text>
              </TouchableOpacity>
            </>
          )}

          {step === 'confirm' && (
            <>
              <Text style={s.heading}>Type your username to confirm</Text>
              <Text style={s.subheading}>
                You&apos;re about to delete {username ? `@${username}` : 'your account'}. This action cannot be undone after 30 days.
              </Text>

              <Text style={s.label}>Username</Text>
              <TextInput
                style={s.input}
                value={typed}
                onChangeText={setTyped}
                placeholder="@username"
                placeholderTextColor={theme.text.muted}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="off"
                spellCheck={false}
              />

              <TouchableOpacity
                style={[s.destructiveBtn, (!matches || submitting) && s.btnDisabled]}
                onPress={handleConfirmDelete}
                disabled={!matches || submitting}
                activeOpacity={0.85}
              >
                {submitting ? (
                  <ActivityIndicator color={theme.status.danger} size="small" />
                ) : (
                  <Text style={s.destructiveBtnText}>Delete my account</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={s.linkBtn} onPress={() => setStep('warning')} activeOpacity={0.7}>
                <Text style={s.linkBtnText}>Cancel</Text>
              </TouchableOpacity>
            </>
          )}

          {step === 'success' && (
            <View style={s.successWrap}>
              <View style={s.successIconCircle}>
                <Ionicons name="checkmark" size={40} color={theme.accentInk} />
              </View>
              <Text style={[s.heading, { textAlign: 'center' }]}>Account scheduled for deletion</Text>
              <Text style={[s.subheading, { textAlign: 'center' }]}>
                We&apos;ll permanently delete your data on {deletionDateStr}. Sign back in before then to restore your account.
              </Text>
              <TouchableOpacity style={[s.primaryBtn, { alignSelf: 'stretch' }]} onPress={handleDonePress} activeOpacity={0.85}>
                <Text style={s.primaryBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
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
    contentContainer: { paddingHorizontal: SP[6], paddingTop: SP[4], paddingBottom: SP[10] },
    heading: {
      fontFamily: TY.sans.bold,
      fontSize: TY.size.h1,
      color: t.text.primary,
      letterSpacing: TY.tracking.tight,
      marginBottom: SP[3],
    },
    subheading: {
      fontFamily: TY.sans.regular,
      fontSize: TY.size.body + 1,
      color: t.text.secondary,
      lineHeight: 22,
      marginBottom: SP[6],
    },
    bulletList: {
      backgroundColor: t.bg.elevated,
      borderRadius: R.md,
      borderWidth: 1,
      borderColor: t.border,
      paddingVertical: SP[3],
      paddingHorizontal: SP[4],
      marginBottom: SP[5],
    },
    bulletRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: SP[2] + 2,
      gap: SP[3],
    },
    bulletIcon: {
      width: 28, height: 28, borderRadius: R.pill,
      backgroundColor: t.status.danger + '1F',
      alignItems: 'center', justifyContent: 'center',
    },
    bulletText: {
      flex: 1,
      fontFamily: TY.sans.regular,
      fontSize: TY.size.body,
      color: t.text.primary,
      lineHeight: 20,
    },
    reassuranceBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SP[2],
      backgroundColor: t.bg.elevated,
      borderRadius: R.sm,
      padding: SP[3],
      borderWidth: 1,
      borderColor: t.border,
      marginBottom: SP[6],
    },
    reassuranceText: {
      flex: 1,
      fontFamily: TY.sans.regular,
      fontSize: TY.size.small + 1,
      color: t.text.secondary,
      lineHeight: 18,
    },
    label: {
      fontFamily: TY.sans.medium,
      fontSize: TY.size.small + 1,
      color: t.text.secondary,
      marginBottom: SP[2],
      letterSpacing: 0.3,
    },
    input: {
      fontFamily: TY.sans.regular,
      backgroundColor: t.bg.elevated,
      borderRadius: R.sm,
      paddingHorizontal: SP[4],
      paddingVertical: SP[4] - 2,
      fontSize: TY.size.body + 2,
      color: t.text.primary,
      borderWidth: 1,
      borderColor: t.border,
      marginBottom: SP[5],
    },
    primaryBtn: {
      backgroundColor: t.accent,
      borderRadius: R.sm,
      paddingVertical: SP[4],
      alignItems: 'center',
      marginTop: SP[2],
    },
    primaryBtnText: {
      fontFamily: TY.sans.bold,
      color: t.accentInk,
      fontSize: TY.size.body + 2,
      letterSpacing: TY.tracking.tight,
    },
    destructiveBtn: {
      backgroundColor: t.status.danger + '1F',
      borderRadius: R.sm,
      borderWidth: 1,
      borderColor: t.status.danger,
      paddingVertical: SP[4],
      alignItems: 'center',
      marginTop: SP[2],
    },
    destructiveBtnText: {
      fontFamily: TY.sans.bold,
      color: t.status.danger,
      fontSize: TY.size.body + 2,
      letterSpacing: TY.tracking.tight,
    },
    btnDisabled: { opacity: 0.5 },
    linkBtn: { alignItems: 'center', paddingVertical: SP[4] },
    linkBtnText: {
      fontFamily: TY.sans.medium,
      color: t.text.muted,
      fontSize: TY.size.body + 1,
    },
    successWrap: { alignItems: 'center', paddingTop: SP[8] },
    successIconCircle: {
      width: 80, height: 80, borderRadius: R.pill,
      backgroundColor: t.accent,
      alignItems: 'center', justifyContent: 'center',
      marginBottom: SP[6],
    },
  });
}
