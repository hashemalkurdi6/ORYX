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
  Alert,
  Animated,
} from 'react-native';
import { Link, router } from 'expo-router';
import { login, getMe } from '@/services/api';
import { useAuthStore } from '@/services/authStore';
import { useTheme } from '@/contexts/ThemeContext';
import { ThemeColors } from '@/services/theme';

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
      const tokenResponse = await login(email.trim().toLowerCase(), password);
      const token = tokenResponse.access_token;
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
            <TouchableOpacity onPress={() => Alert.alert('Coming Soon', 'Password reset is coming soon.')} activeOpacity={0.7}>
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
              <ActivityIndicator color={theme.bg.primary} size="small" />
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
    scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 26, paddingVertical: 60 },
    wordmarkSection: { alignItems: 'center', marginBottom: 52 },
    wordmark: { fontSize: 32, fontWeight: '900', color: t.text.primary, letterSpacing: 6 },
    tagline: { fontSize: 14, color: t.text.muted, marginTop: 8, letterSpacing: 0.5 },
    errorBox: {
      backgroundColor: 'rgba(192,57,43,0.12)',
      borderLeftWidth: 3,
      borderLeftColor: t.status.danger,
      borderRadius: 10,
      padding: 14,
      marginBottom: 20,
    },
    errorText: { color: t.status.danger, fontSize: 14, lineHeight: 20 },
    inputGroup: { marginBottom: 16 },
    label: { fontSize: 13, color: t.text.secondary, marginBottom: 8, fontWeight: '500', letterSpacing: 0.3 },
    passwordLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    forgotText: { fontSize: 13, color: t.text.muted, textDecorationLine: 'underline' },
    input: {
      backgroundColor: t.bg.elevated,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 16,
      color: t.text.primary,
      borderWidth: 1,
      borderColor: t.border,
    },
    inputFocused: { borderColor: t.accent },
    button: {
      backgroundColor: t.text.primary,
      borderRadius: 12,
      paddingVertical: 16,
      alignItems: 'center',
    },
    buttonDisabled: { opacity: 0.5 },
    buttonText: {
      color: t.bg.primary,
      fontSize: 16,
      fontWeight: '700',
    },
    footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 28 },
    footerText: { color: t.text.muted, fontSize: 14 },
    linkText: { color: t.text.primary, fontSize: 14, fontWeight: '600', textDecorationLine: 'underline' },
  });
}
