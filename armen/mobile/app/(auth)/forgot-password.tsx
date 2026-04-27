import { useState } from 'react';
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
import { router } from 'expo-router';
import { forgotPassword, resetPassword } from '@/services/api';
import { useAuthStore } from '@/services/authStore';
import { useTheme } from '@/contexts/ThemeContext';
import { ThemeColors, type as TY, radius as R, space as SP } from '@/services/theme';

export default function ForgotPasswordScreen() {
  const { theme } = useTheme();
  const s = createStyles(theme);
  const setAuth = useAuthStore((state) => state.setAuth);

  const [stage, setStage] = useState<'request' | 'reset'>('request');
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const handleRequest = async () => {
    if (!email.trim()) {
      setError('Enter your email.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await forgotPassword(email.trim().toLowerCase());
      if (res.debug_reset_token) {
        setToken(res.debug_reset_token);
        setInfo('Reset token issued. Paste it below and choose a new password.');
      } else {
        setInfo('If that email is registered, a reset link has been sent. Enter the token from the email below.');
      }
      setStage('reset');
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Could not start password reset. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    if (!token.trim() || !newPassword) {
      setError('Enter both the reset token and a new password.');
      return;
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (!/[A-Za-z]/.test(newPassword)) {
      setError('Password must contain at least one letter.');
      return;
    }
    if (!/[0-9]/.test(newPassword)) {
      setError('Password must contain at least one number.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await resetPassword(token.trim(), newPassword);
      useAuthStore.setState({ token: res.access_token });
      const { getMe } = await import('@/services/api');
      const user = await getMe();
      setAuth(res.access_token, user);
      router.replace('/(tabs)/');
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Reset failed. The token may be invalid or expired.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <Text style={s.title}>Reset password</Text>
        <Text style={s.subtitle}>
          {stage === 'request'
            ? 'Enter the email on your account. We will send you a reset token.'
            : 'Enter the reset token you received and your new password.'}
        </Text>

        {error ? (
          <View style={s.errorBox}><Text style={s.errorText}>{error}</Text></View>
        ) : null}
        {info ? (
          <View style={s.infoBox}><Text style={s.infoText}>{info}</Text></View>
        ) : null}

        {stage === 'request' ? (
          <>
            <Text style={s.label}>Email</Text>
            <TextInput
              style={s.input}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={theme.text.muted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
            />
            <TouchableOpacity
              style={[s.button, loading && s.buttonDisabled]}
              onPress={handleRequest}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? <ActivityIndicator color={theme.accentInk} /> : <Text style={s.buttonText}>Send reset token</Text>}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={s.label}>Reset token</Text>
            <TextInput
              style={s.input}
              value={token}
              onChangeText={setToken}
              placeholder="Paste the token from your email"
              placeholderTextColor={theme.text.muted}
              autoCapitalize="none"
              autoCorrect={false}
              multiline
            />
            <Text style={s.label}>New password</Text>
            <TextInput
              style={s.input}
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="8+ chars, with a letter and a number"
              placeholderTextColor={theme.text.muted}
              secureTextEntry
              autoComplete="password-new"
            />
            <TouchableOpacity
              style={[s.button, loading && s.buttonDisabled]}
              onPress={handleReset}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? <ActivityIndicator color={theme.accentInk} /> : <Text style={s.buttonText}>Update password</Text>}
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} activeOpacity={0.7}>
          <Text style={s.backText}>Back to login</Text>
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
    subtitle: { fontFamily: TY.sans.regular, fontSize: TY.size.body, color: t.text.secondary, marginBottom: SP[6] },
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
    backBtn: { alignItems: 'center', paddingVertical: SP[4], marginTop: SP[3] },
    backText: { fontFamily: TY.sans.medium, color: t.text.muted, fontSize: TY.size.body },
  });
}
