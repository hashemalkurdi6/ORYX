import { useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Animated,
} from 'react-native';
import { Link, router } from 'expo-router';
import { signupWithProfile, getMe } from '@/services/api';
import { useAuthStore } from '@/services/authStore';
import { useTheme } from '@/contexts/ThemeContext';
import { ThemeColors } from '@/services/theme';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/;
const ALL_SPORTS = [
  'Running', 'Cycling', 'Swimming', 'Weightlifting',
  'CrossFit', 'MMA', 'Yoga', 'Hiking', 'Triathlon', 'Basketball',
];

export default function SignupScreen() {
  const { theme } = useTheme();
  const s = createStyles(theme);

  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [selectedSports, setSelectedSports] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const btnScale = useRef(new Animated.Value(1)).current;
  const setAuth = useAuthStore((state) => state.setAuth);

  const onPressIn = () => Animated.spring(btnScale, { toValue: 0.97, useNativeDriver: true, speed: 40 }).start();
  const onPressOut = () => Animated.spring(btnScale, { toValue: 1, useNativeDriver: true, speed: 40 }).start();

  const toggleSport = (sport: string) => {
    setSelectedSports((prev) => {
      if (prev.includes(sport)) return prev.filter((s) => s !== sport);
      if (prev.length >= 3) return prev;
      return [...prev, sport];
    });
  };

  const validate = (): string | null => {
    if (username.trim() && !USERNAME_REGEX.test(username.trim()))
      return 'Username must be 3–20 characters, letters, numbers, or underscores only.';
    if (!email.trim()) return 'Email is required.';
    if (!EMAIL_REGEX.test(email.trim())) return 'Please enter a valid email address.';
    if (!password) return 'Password is required.';
    if (password.length < 8) return 'Password must be at least 8 characters.';
    if (password !== confirmPassword) return 'Passwords do not match.';
    return null;
  };

  const handleSignup = async () => {
    const validationError = validate();
    if (validationError) { setError(validationError); return; }
    setError(null);
    setLoading(true);
    try {
      const tokenResponse = await signupWithProfile(
        email.trim().toLowerCase(), password,
        username.trim() || undefined,
        fullName.trim() || undefined,
        selectedSports.length > 0 ? selectedSports : undefined,
      );
      const token = tokenResponse.access_token;
      useAuthStore.setState({ token });
      const user = await getMe();
      setAuth(token, user);
      router.replace('/(tabs)/');
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { detail?: unknown } }; message?: string };
      const detail = axiosError?.response?.data?.detail;
      const message =
        typeof detail === 'string' ? detail
          : Array.isArray(detail) ? (detail[0] as { msg?: string })?.msg || 'Sign up failed.'
          : axiosError?.message || 'Sign up failed. Please try again.';
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
          <Text style={s.tagline}>Build your fitness story.</Text>
        </View>

        {error ? <View style={s.errorBox}><Text style={s.errorText}>{error}</Text></View> : null}

        {/* Full Name */}
        <View style={s.inputGroup}>
          <Text style={s.label}>Full Name</Text>
          <TextInput style={s.input} value={fullName} onChangeText={setFullName}
            placeholder="Your full name" placeholderTextColor={theme.text.muted}
            autoCorrect={false} returnKeyType="next" />
        </View>

        {/* Username */}
        <View style={s.inputGroup}>
          <Text style={s.label}>Username</Text>
          <View style={s.usernameWrapper}>
            <Text style={s.usernameAt}>@</Text>
            <TextInput style={s.usernameInput}
              value={username}
              onChangeText={(v) => setUsername(v.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
              placeholder="yourhandle" placeholderTextColor={theme.text.muted}
              autoCapitalize="none" autoCorrect={false} returnKeyType="next" />
          </View>
          <Text style={s.inputHelper}>This is your public handle</Text>
        </View>

        {/* Email */}
        <View style={s.inputGroup}>
          <Text style={s.label}>Email</Text>
          <TextInput style={s.input} value={email} onChangeText={setEmail}
            placeholder="you@example.com" placeholderTextColor={theme.text.muted}
            keyboardType="email-address" autoCapitalize="none" autoCorrect={false}
            autoComplete="email" returnKeyType="next" />
        </View>

        {/* Password */}
        <View style={s.inputGroup}>
          <Text style={s.label}>Password</Text>
          <TextInput style={s.input} value={password} onChangeText={setPassword}
            placeholder="Minimum 8 characters" placeholderTextColor={theme.text.muted}
            secureTextEntry autoComplete="new-password" returnKeyType="next" />
        </View>

        {/* Confirm */}
        <View style={s.inputGroup}>
          <Text style={s.label}>Confirm Password</Text>
          <TextInput style={s.input} value={confirmPassword} onChangeText={setConfirmPassword}
            placeholder="Re-enter your password" placeholderTextColor={theme.text.muted}
            secureTextEntry autoComplete="new-password" returnKeyType="done" />
        </View>

        {/* Sports */}
        <View style={s.inputGroup}>
          <Text style={s.label}>Sports Interests</Text>
          <Text style={s.inputHelper}>Pick up to 3</Text>
          <View style={s.sportsGrid}>
            {ALL_SPORTS.map((sport) => {
              const selected = selectedSports.includes(sport);
              const maxReached = selectedSports.length >= 3 && !selected;
              return (
                <TouchableOpacity
                  key={sport}
                  style={[s.sportTag, selected && s.sportTagSelected, maxReached && s.sportTagDisabled]}
                  onPress={() => toggleSport(sport)}
                  activeOpacity={0.75}
                  disabled={maxReached}
                >
                  <Text style={[s.sportTagText, selected && s.sportTagTextSelected, maxReached && s.sportTagTextDisabled]}>
                    {sport}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <Animated.View style={{ transform: [{ scale: btnScale }], marginTop: 8 }}>
          <TouchableOpacity
            style={[s.button, loading && s.buttonDisabled]}
            onPress={handleSignup}
            onPressIn={onPressIn}
            onPressOut={onPressOut}
            disabled={loading}
            activeOpacity={1}
          >
            {loading ? (
              <ActivityIndicator color={theme.bg.primary} size="small" />
            ) : (
              <Text style={s.buttonText}>Create Account</Text>
            )}
          </TouchableOpacity>
        </Animated.View>

        <View style={s.footer}>
          <Text style={s.footerText}>Already have an account? </Text>
          <Link href="/(auth)/login" asChild>
            <TouchableOpacity><Text style={s.linkText}>Log in</Text></TouchableOpacity>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function createStyles(t: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg.primary },
    scroll: { flexGrow: 1, paddingHorizontal: 26, paddingVertical: 60 },
    wordmarkSection: { alignItems: 'center', marginBottom: 40 },
    wordmark: { fontSize: 32, fontWeight: '900', color: t.text.primary, letterSpacing: 6 },
    tagline: { fontSize: 14, color: t.text.muted, marginTop: 8, letterSpacing: 0.5 },
    errorBox: { backgroundColor: 'rgba(192,57,43,0.12)', borderLeftWidth: 3, borderLeftColor: t.status.danger, borderRadius: 10, padding: 14, marginBottom: 20 },
    errorText: { color: t.status.danger, fontSize: 14, lineHeight: 20 },
    inputGroup: { marginBottom: 16 },
    label: { fontSize: 13, color: t.text.secondary, marginBottom: 8, fontWeight: '500', letterSpacing: 0.3 },
    inputHelper: { fontSize: 12, color: t.text.muted, marginTop: 4 },
    input: { backgroundColor: t.bg.elevated, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: t.text.primary, borderWidth: 1, borderColor: t.border },
    usernameWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: t.bg.elevated, borderRadius: 12, borderWidth: 1, borderColor: t.border, paddingHorizontal: 16 },
    usernameAt: { fontSize: 16, color: t.text.secondary, marginRight: 4 },
    usernameInput: { flex: 1, paddingVertical: 14, fontSize: 16, color: t.text.primary },
    sportsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
    sportTag: { backgroundColor: t.bg.elevated, borderWidth: 1, borderColor: t.border, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9 },
    sportTagSelected: { backgroundColor: t.text.primary, borderColor: t.text.primary },
    sportTagDisabled: { opacity: 0.35 },
    sportTagText: { fontSize: 14, color: t.text.secondary },
    sportTagTextSelected: { color: t.bg.primary, fontWeight: '600' },
    sportTagTextDisabled: { color: t.text.muted },
    button: { backgroundColor: t.text.primary, borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
    buttonDisabled: { opacity: 0.5 },
    buttonText: { color: t.bg.primary, fontSize: 16, fontWeight: '700' },
    footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 28 },
    footerText: { color: t.text.muted, fontSize: 14 },
    linkText: { color: t.text.primary, fontSize: 14, fontWeight: '600', textDecorationLine: 'underline' },
  });
}
