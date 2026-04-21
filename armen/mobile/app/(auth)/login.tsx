import { useRef, useState } from 'react';
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
  Animated,
} from 'react-native';
import { Link, router } from 'expo-router';
import { login, getMe } from '@/services/api';
import { useAuthStore } from '@/services/authStore';
import { useTheme } from '@/contexts/ThemeContext';
import { ThemeColors, type as TY, radius as R, space as SP } from '@/services/theme';

export default function LoginScreen() {
  const { theme } = useTheme();
  const s = createStyles(theme);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passFocused, setPassFocused] = useState(false);

  const btnScale = useRef(new Animated.Value(1)).current;
  const setAuth = useAuthStore((state) => state.setAuth);

  const onPressIn = () =>
    Animated.spring(btnScale, { toValue: 0.97, useNativeDriver: true, speed: 40 }).start();
  const onPressOut = () =>
    Animated.spring(btnScale, { toValue: 1, useNativeDriver: true, speed: 40 }).start();

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      setError('Please enter your email and password.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const response = await login(email.trim().toLowerCase(), password);
      if ('pending_deletion' in response && response.pending_deletion) {
        router.replace({
          pathname: '/settings/restore-account',
          params: {
            pending_token: response.pending_token,
            deletion_date: response.deletion_date ?? '',
            user_id: response.user_id,
            email: email.trim().toLowerCase(),
          },
        });
        return;
      }
      const token = response.access_token;
      useAuthStore.setState({ token });
      const user = await getMe();
      setAuth(token, user);
      if (!user.onboarding_complete) {
        router.replace('/onboarding');
      } else {
        router.replace('/(tabs)/');
      }
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { detail?: unknown } } };
      const detail = axiosError?.response?.data?.detail;
      const message =
        typeof detail === 'string'
          ? detail
          : Array.isArray(detail)
          ? (detail[0] as { msg?: string })?.msg || 'Login failed.'
          : 'Login failed. Check your credentials.';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

        <View style={s.wordmarkSection}>
          <Text style={s.wordmark}>ORYX</Text>
          <Text style={s.tagline}>Know your body.</Text>
        </View>

        {error ? (
          <View style={s.errorBox}>
            <Text style={s.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={s.inputGroup}>
          <Text style={s.label}>Email</Text>
          <TextInput
            style={[s.input, emailFocused && s.inputFocused]}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={theme.text.muted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            returnKeyType="next"
            onFocus={() => setEmailFocused(true)}
            onBlur={() => setEmailFocused(false)}
          />
        </View>

        <View style={s.inputGroup}>
          <View style={s.passwordLabelRow}>
            <Text style={s.label}>Password</Text>
            <TouchableOpacity onPress={() => router.push('/(auth)/forgot-password')} activeOpacity={0.7}>
              <Text style={s.forgotText}>Forgot password?</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            style={[s.input, passFocused && s.inputFocused]}
            value={password}
            onChangeText={setPassword}
            placeholder="Your password"
            placeholderTextColor={theme.text.muted}
            secureTextEntry
            autoComplete="password"
            returnKeyType="done"
            onSubmitEditing={handleLogin}
            onFocus={() => setPassFocused(true)}
            onBlur={() => setPassFocused(false)}
          />
        </View>

        <Animated.View style={{ transform: [{ scale: btnScale }], marginTop: 8 }}>
          <TouchableOpacity
            style={[s.button, loading && s.buttonDisabled]}
            onPress={handleLogin}
            onPressIn={onPressIn}
            onPressOut={onPressOut}
            disabled={loading}
            activeOpacity={1}
          >
            {loading ? (
              <ActivityIndicator color={theme.accentInk} size="small" />
            ) : (
              <Text style={s.buttonText}>Log In</Text>
            )}
          </TouchableOpacity>
        </Animated.View>

        <View style={s.footer}>
          <Text style={s.footerText}>Don't have an account? </Text>
          <Link href="/(auth)/signup" asChild>
            <TouchableOpacity>
              <Text style={s.linkText}>Sign up</Text>
            </TouchableOpacity>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function createStyles(t: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg.primary },
    scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: SP[6] + 2, paddingVertical: SP[10] - 4 },
    wordmarkSection: { alignItems: 'center', marginBottom: SP[9] + 4 },
    wordmark: { fontFamily: TY.sans.bold, fontSize: TY.size.h1 + 4, color: t.text.primary, letterSpacing: 6 },
    tagline: { fontFamily: TY.sans.regular, fontSize: TY.size.body, color: t.text.muted, marginTop: SP[2], letterSpacing: 0.5 },
    errorBox: {
      backgroundColor: t.status.danger + '1F',
      borderLeftWidth: 3,
      borderLeftColor: t.status.danger,
      borderRadius: R.sm,
      padding: SP[4] - 2,
      marginBottom: SP[5],
    },
    errorText: { fontFamily: TY.sans.regular, color: t.status.danger, fontSize: TY.size.body, lineHeight: 20 },
    inputGroup: { marginBottom: SP[4] },
    label: { fontFamily: TY.sans.medium, fontSize: TY.size.small + 1, color: t.text.secondary, marginBottom: SP[2], letterSpacing: 0.3 },
    passwordLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SP[2] },
    forgotText: { fontFamily: TY.sans.regular, fontSize: TY.size.small + 1, color: t.text.muted, textDecorationLine: 'underline' },
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
    },
    inputFocused: { borderColor: t.accent },
    button: {
      backgroundColor: t.accent,
      borderRadius: R.sm,
      paddingVertical: SP[4],
      alignItems: 'center',
    },
    buttonDisabled: { opacity: 0.5 },
    buttonText: {
      fontFamily: TY.sans.bold,
      color: t.accentInk,
      fontSize: TY.size.body + 2,
      letterSpacing: TY.tracking.tight,
    },
    footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: SP[7] - 4 },
    footerText: { fontFamily: TY.sans.regular, color: t.text.muted, fontSize: TY.size.body },
    linkText: { fontFamily: TY.sans.semibold, color: t.text.primary, fontSize: TY.size.body, textDecorationLine: 'underline' },
  });
}
