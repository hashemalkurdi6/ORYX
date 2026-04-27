/**
 * Email verification screen.
 *
 * Two paths into this screen:
 *   1. After signup — current user's email is unverified; they can resend or
 *      paste the token they received (in dev/non-prod we pre-fill it).
 *   2. From a deep link tap on the email itself — `?token=...` is consumed
 *      automatically and the user is sent into the app.
 *
 * Wired 2026-04-26 (audits/social-profile-auth-fixes-2026-04-26.md).
 */

import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { ThemeColors, type as TY, radius as R, space as SP } from '@/services/theme';
import { useAuthStore } from '@/services/authStore';
import { resendVerificationEmail, verifyEmail, getMe } from '@/services/api';

export default function VerifyEmailScreen() {
  const { theme } = useTheme();
  const s = createStyles(theme);
  const params = useLocalSearchParams<{ token?: string }>();
  const setAuth = useAuthStore((st) => st.setAuth);
  const authToken = useAuthStore((st) => st.token);
  const user = useAuthStore((st) => st.user);

  const [token, setToken] = useState<string>(typeof params.token === 'string' ? params.token : '');
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Auto-verify if a token came in via deep-link query param.
  useEffect(() => {
    if (params.token && typeof params.token === 'string') {
      void doVerify(params.token);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doVerify = async (t: string) => {
    setError(null);
    setVerifying(true);
    try {
      await verifyEmail(t.trim());
      setInfo('Email verified.');
      // Refresh user so email_verified flips on the local store.
      if (authToken) {
        try {
          const refreshed = await getMe();
          setAuth(authToken, refreshed);
        } catch { /* non-fatal */ }
      }
      setTimeout(() => router.replace('/(tabs)/'), 600);
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Verification failed. Token may be invalid or expired.');
    } finally {
      setVerifying(false);
    }
  };

  const doResend = async () => {
    setError(null);
    setInfo(null);
    setResending(true);
    try {
      const res = await resendVerificationEmail();
      if (res.debug_verification_token) {
        setToken(res.debug_verification_token);
        setInfo('Verification token issued. Tap "Verify email" to complete.');
      } else {
        setInfo('Verification email sent. Check your inbox.');
      }
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Could not send verification email. Try again later.');
    } finally {
      setResending(false);
    }
  };

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <Text style={s.title}>Verify your email</Text>
        <Text style={s.subtitle}>
          We sent a verification link to {user?.email ?? 'your email'}. Open it on this device, or paste the
          token below to confirm. Verified accounts unlock messaging and posting later — for now you can keep
          using ORYX while we wait.
        </Text>

        {error ? <View style={s.errorBox}><Text style={s.errorText}>{error}</Text></View> : null}
        {info ? <View style={s.infoBox}><Text style={s.infoText}>{info}</Text></View> : null}

        <Text style={s.label}>Verification token</Text>
        <TextInput
          style={s.input}
          value={token}
          onChangeText={setToken}
          placeholder="Paste the token from the email"
          placeholderTextColor={theme.text.muted}
          autoCapitalize="none"
          autoCorrect={false}
          multiline
        />

        <TouchableOpacity
          style={[s.button, (!token.trim() || verifying) && s.buttonDisabled]}
          onPress={() => doVerify(token)}
          disabled={!token.trim() || verifying}
          activeOpacity={0.85}
        >
          {verifying ? <ActivityIndicator color={theme.accentInk} /> : <Text style={s.buttonText}>Verify email</Text>}
        </TouchableOpacity>

        <TouchableOpacity
          style={s.secondaryBtn}
          onPress={doResend}
          disabled={resending}
          activeOpacity={0.7}
        >
          {resending
            ? <ActivityIndicator color={theme.text.muted} />
            : <Text style={s.secondaryText}>Resend verification email</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.replace('/(tabs)/')} style={s.skipBtn} activeOpacity={0.7}>
          <Text style={s.skipText}>Skip for now</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function createStyles(t: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg.primary },
    scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: SP[6] + 2, paddingVertical: SP[10] - 4 },
    title: { fontFamily: TY.sans.bold, fontSize: TY.size.h1, color: t.text.primary, marginBottom: SP[2] },
    subtitle: { fontFamily: TY.sans.regular, fontSize: TY.size.body, color: t.text.secondary, marginBottom: SP[6], lineHeight: 22 },
    label: { fontFamily: TY.sans.medium, fontSize: TY.size.small + 1, color: t.text.secondary, marginBottom: SP[2], marginTop: SP[3] },
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
      marginBottom: SP[2],
      minHeight: 80,
      textAlignVertical: 'top',
    },
    errorBox: {
      backgroundColor: t.status.danger + '1F',
      borderLeftWidth: 3,
      borderLeftColor: t.status.danger,
      borderRadius: R.sm,
      padding: SP[4] - 2,
      marginBottom: SP[4],
    },
    errorText: { fontFamily: TY.sans.regular, color: t.status.danger, fontSize: TY.size.body, lineHeight: 20 },
    infoBox: {
      backgroundColor: t.bg.elevated,
      borderLeftWidth: 3,
      borderLeftColor: t.accent,
      borderRadius: R.sm,
      padding: SP[4] - 2,
      marginBottom: SP[4],
    },
    infoText: { fontFamily: TY.sans.regular, color: t.text.secondary, fontSize: TY.size.body, lineHeight: 20 },
    button: {
      backgroundColor: t.accent,
      borderRadius: R.sm,
      paddingVertical: SP[4],
      alignItems: 'center',
      marginTop: SP[4],
    },
    buttonDisabled: { opacity: 0.5 },
    buttonText: { fontFamily: TY.sans.bold, color: t.accentInk, fontSize: TY.size.body + 2, letterSpacing: TY.tracking.tight },
    secondaryBtn: { alignItems: 'center', paddingVertical: SP[4], marginTop: SP[3] },
    secondaryText: { fontFamily: TY.sans.medium, color: t.text.primary, fontSize: TY.size.body },
    skipBtn: { alignItems: 'center', paddingVertical: SP[3] },
    skipText: { fontFamily: TY.sans.regular, color: t.text.muted, fontSize: TY.size.small + 1 },
  });
}
