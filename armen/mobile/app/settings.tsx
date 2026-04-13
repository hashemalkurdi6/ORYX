import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Stack, router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { Pedometer } from 'expo-sensors';
import {
  getStravaAuthUrl,
  getWhoopAuthUrl,
  getOuraAuthUrl,
  updateProfile,
  connectHevy,
  disconnectHevy,
  syncHevy,
  getMe,
  UserProfileUpdate,
} from '@/services/api';
import { useAuthStore } from '@/services/authStore';
import { useTheme } from '@/contexts/ThemeContext';
import { ThemeColors } from '@/services/theme';

// ── Types ─────────────────────────────────────────────────────────────────────

type ProviderKey = 'strava' | 'whoop' | 'oura' | 'apple_health';
type ConnectState = 'idle' | 'connecting' | 'success' | 'error';

interface ToastMessage {
  text: string;
  kind: 'success' | 'error';
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ALL_SPORTS = [
  'Running', 'Cycling', 'Swimming', 'Weightlifting',
  'CrossFit', 'MMA', 'Yoga', 'Hiking', 'Triathlon', 'Basketball',
];

// ── Toast Component ───────────────────────────────────────────────────────────

function Toast({ message, onHide }: { message: ToastMessage | null; onHide: () => void }) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!message) return;
    opacity.setValue(0);
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(2200),
      Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => onHide());
  }, [message]);

  if (!message) return null;

  return (
    <Animated.View
      style={[
        toastStyles.container,
        { opacity, backgroundColor: message.kind === 'success' ? '#27ae60' : '#c0392b' },
      ]}
      pointerEvents="none"
    >
      <Ionicons
        name={message.kind === 'success' ? 'checkmark-circle' : 'alert-circle'}
        size={16}
        color="#FFFFFF"
      />
      <Text style={toastStyles.text}>{message.text}</Text>
    </Animated.View>
  );
}

const toastStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 100,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    zIndex: 999,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  text: { color: '#f0f0f0', fontSize: 14, fontWeight: '600', flex: 1 },
});

// ── Provider Row Component ────────────────────────────────────────────────────

interface ProviderRowProps {
  name: string;
  statusText: string;
  iconName: React.ComponentProps<typeof Ionicons>['name'];
  iconColor: string;
  iconBg: string;
  isConnected: boolean;
  connectState: ConnectState;
  onConnect: () => void;
  accentColor: string;
  note?: string;
  isIosOnly?: boolean;
  rightSlot?: React.ReactNode;
}

function ProviderRow({
  name, statusText, iconName, iconColor, iconBg,
  isConnected, connectState, onConnect, accentColor,
  note, isIosOnly, rightSlot,
}: ProviderRowProps) {
  const { theme } = useTheme();
  const isConnecting = connectState === 'connecting';
  const isError = connectState === 'error';

  const renderRight = () => {
    if (rightSlot) return rightSlot;

    if (isIosOnly && Platform.OS !== 'ios') {
      return (
        <View style={[pRowStyles.chip, { borderColor: theme.border }]}>
          <Text style={[pRowStyles.chipText, { color: theme.text.muted }]}>iOS only</Text>
        </View>
      );
    }

    if (isConnecting) {
      return (
        <View style={pRowStyles.connectingRow}>
          <ActivityIndicator size="small" color={accentColor} />
          <Text style={[pRowStyles.connectingText, { color: accentColor }]}>Connecting</Text>
        </View>
      );
    }

    if (isConnected) {
      return (
        <View style={[pRowStyles.chip, { borderColor: accentColor + '60', backgroundColor: accentColor + '18' }]}>
          <Ionicons name="checkmark" size={12} color={accentColor} />
          <Text style={[pRowStyles.chipText, { color: accentColor }]}>Connected</Text>
        </View>
      );
    }

    if (isError) {
      return (
        <TouchableOpacity
          style={[pRowStyles.button, { borderColor: theme.status.danger }]}
          onPress={onConnect}
          activeOpacity={0.8}
        >
          <Ionicons name="refresh-outline" size={13} color={theme.status.danger} />
          <Text style={[pRowStyles.buttonText, { color: theme.status.danger }]}>Retry</Text>
        </TouchableOpacity>
      );
    }

    return (
      <TouchableOpacity
        style={[pRowStyles.button, { borderColor: accentColor }]}
        onPress={onConnect}
        activeOpacity={0.8}
      >
        <Text style={[pRowStyles.buttonText, { color: accentColor }]}>Connect</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={pRowStyles.container}>
      <View style={[pRowStyles.iconCircle, { backgroundColor: iconBg }]}>
        <Ionicons name={iconName} size={20} color={iconColor} />
      </View>
      <View style={pRowStyles.info}>
        <Text style={[pRowStyles.name, { color: theme.text.primary }]}>{name}</Text>
        <Text style={[pRowStyles.status, { color: theme.text.secondary }]}>
          {isConnecting ? 'Opening authorization…' : isError ? 'Connection failed' : statusText}
        </Text>
        {note ? <Text style={[pRowStyles.note, { color: theme.text.muted }]}>{note}</Text> : null}
      </View>
      {renderRight()}
    </View>
  );
}

const pRowStyles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 12 },
  iconCircle: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, gap: 2 },
  name: { fontSize: 15, fontWeight: '600' },
  status: { fontSize: 13 },
  note: { fontSize: 11, marginTop: 1 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  chipText: { fontSize: 12, fontWeight: '600' },
  button: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  buttonText: { fontSize: 13, fontWeight: '600' },
  connectingRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  connectingText: { fontSize: 13, fontWeight: '600' },
});

// ── Main Component ─────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const { user, token, setAuth, clearAuth } = useAuthStore();
  const { theme } = useTheme();
  const s = useMemo(() => createStyles(theme), [theme]);

  // Edit profile state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({
    username: '', full_name: '', bio: '', location: '', sports: [] as string[], weight_kg: '',
  });
  const [savingProfile, setSavingProfile] = useState(false);

  // Hevy state
  const [showHevyModal, setShowHevyModal] = useState(false);
  const [hevyApiKey, setHevyApiKey] = useState('');
  const [hevyConnecting, setHevyConnecting] = useState(false);
  const [hevySyncing, setHevySyncing] = useState(false);

  // Provider connection states
  const [providerStates, setProviderStates] = useState<Record<ProviderKey, ConnectState>>({
    strava: 'idle',
    whoop: 'idle',
    oura: 'idle',
    apple_health: 'idle',
  });

  const [appleHealthGranted, setAppleHealthGranted] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const setProviderState = useCallback((provider: ProviderKey, state: ConnectState) => {
    setProviderStates((prev) => ({ ...prev, [provider]: state }));
  }, []);

  const showToast = useCallback((text: string, kind: 'success' | 'error') => {
    setToast({ text, kind });
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const updated = await getMe();
      if (token) setAuth(token, updated);
      return updated;
    } catch {
      return null;
    }
  }, [token, setAuth]);

  // ── Sync edit form from user ──────────────────────────────────────────────

  useEffect(() => {
    if (user) {
      setEditForm({
        username: user.username ?? '',
        full_name: user.full_name ?? '',
        bio: user.bio ?? '',
        location: user.location ?? '',
        sports: user.sports ?? [],
        weight_kg: (user as any).weight_kg != null ? String((user as any).weight_kg) : '',
      });
    }
  }, [user]);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    Pedometer.isAvailableAsync()
      .then((available) => {
        if (available) setAppleHealthGranted(true);
      })
      .catch(() => {});
  }, []);

  // ── OAuth connect handler ─────────────────────────────────────────────────

  const handleOAuthConnect = useCallback(async (
    provider: ProviderKey,
    label: string,
    getUrlFn: () => Promise<{ url: string }>,
    connectedField: 'strava_connected' | 'whoop_connected' | 'oura_connected',
  ) => {
    setProviderState(provider, 'connecting');
    try {
      const { url } = await getUrlFn();
      const redirectUrl = Linking.createURL('/');
      const result = await WebBrowser.openAuthSessionAsync(url, redirectUrl);
      const updated = await refreshUser();

      if (updated?.[connectedField]) {
        setProviderState(provider, 'success');
        showToast(`${label} connected successfully`, 'success');
        setTimeout(() => setProviderState(provider, 'idle'), 2500);
      } else if (result.type === 'cancel' || result.type === 'dismiss') {
        setProviderState(provider, 'idle');
      } else {
        setProviderState(provider, 'error');
        showToast(`${label} connection failed. Tap Retry to try again.`, 'error');
        setTimeout(() => setProviderState(provider, 'idle'), 4000);
      }
    } catch (e: any) {
      setProviderState(provider, 'error');
      const msg = e?.message ?? '';
      if (msg.includes('503') || msg.includes('not configured')) {
        showToast(`${label} is not configured. Add credentials to backend .env`, 'error');
      } else {
        showToast(`Could not connect to ${label}. Try again.`, 'error');
      }
      setTimeout(() => setProviderState(provider, 'idle'), 4000);
    }
  }, [setProviderState, showToast, refreshUser]);

  // ── Apple Health ──────────────────────────────────────────────────────────

  const handleAppleHealth = useCallback(async () => {
    if (Platform.OS !== 'ios') return;
    setProviderState('apple_health', 'connecting');
    try {
      const { status } = await Pedometer.requestPermissionsAsync();
      if (status === 'granted') {
        setAppleHealthGranted(true);
        setProviderState('apple_health', 'success');
        showToast('Apple Health connected — steps now tracking', 'success');
        setTimeout(() => setProviderState('apple_health', 'idle'), 2500);
      } else {
        setProviderState('apple_health', 'error');
        Alert.alert(
          'Permission Required',
          'ORYX needs Motion & Fitness access to track your steps.\n\nGo to Settings → Privacy & Security → Motion & Fitness → Enable ORYX.',
          [
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
            { text: 'Cancel', style: 'cancel', onPress: () => setProviderState('apple_health', 'idle') },
          ],
        );
      }
    } catch {
      setProviderState('apple_health', 'error');
      showToast('Could not request Apple Health permissions.', 'error');
      setTimeout(() => setProviderState('apple_health', 'idle'), 3000);
    }
  }, [setProviderState, showToast]);

  // ── Hevy ──────────────────────────────────────────────────────────────────

  const handleSaveHevyKey = async () => {
    if (!hevyApiKey.trim()) {
      Alert.alert('Required', 'Please enter your Hevy API key.');
      return;
    }
    setHevyConnecting(true);
    try {
      await connectHevy(hevyApiKey.trim());
      const syncResult = await syncHevy();
      await refreshUser();
      setShowHevyModal(false);
      setHevyApiKey('');
      showToast(`Hevy connected — ${syncResult.synced} workouts imported`, 'success');
    } catch (e: any) {
      const msg = e?.response?.data?.detail ?? e?.message ?? 'Unknown error';
      Alert.alert('Connection Failed', `Could not connect Hevy.\n\n${msg}\n\nCheck your API key and try again.`);
    } finally {
      setHevyConnecting(false);
    }
  };

  const handleDisconnectHevy = () => {
    Alert.alert(
      'Disconnect Hevy',
      'Remove the Hevy connection? Your imported workouts will remain.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            try {
              await disconnectHevy();
              await refreshUser();
              showToast('Hevy disconnected', 'success');
            } catch {
              showToast('Could not disconnect Hevy.', 'error');
            }
          },
        },
      ],
    );
  };

  const handleSyncHevy = async () => {
    setHevySyncing(true);
    try {
      const result = await syncHevy();
      await refreshUser();
      showToast(`${result.synced} new workouts synced from Hevy`, 'success');
    } catch {
      showToast('Sync failed. Check your connection.', 'error');
    } finally {
      setHevySyncing(false);
    }
  };

  // ── Profile ───────────────────────────────────────────────────────────────

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      const parsedWeight = parseFloat(editForm.weight_kg);
      const update: UserProfileUpdate = {
        username: editForm.username.trim() || undefined,
        full_name: editForm.full_name.trim() || undefined,
        bio: editForm.bio.trim() || undefined,
        location: editForm.location.trim() || undefined,
        sports: editForm.sports.length > 0 ? editForm.sports : undefined,
        weight_kg: !isNaN(parsedWeight) && parsedWeight > 0 ? parsedWeight : undefined,
      };
      const updated = await updateProfile(update);
      if (token) setAuth(token, updated);
      setShowEditModal(false);
      showToast('Profile updated', 'success');
    } catch {
      Alert.alert('Error', 'Could not save profile. Please try again.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: () => {
          clearAuth();
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  const toggleSport = (sport: string) => {
    setEditForm((prev) => {
      if (prev.sports.includes(sport)) {
        return { ...prev, sports: prev.sports.filter((sp) => sp !== sport) };
      }
      if (prev.sports.length >= 3) return prev;
      return { ...prev, sports: [...prev.sports, sport] };
    });
  };

  // ── Computed ──────────────────────────────────────────────────────────────

  const appleHealthIsConnected = Platform.OS === 'ios' && appleHealthGranted;
  const appleHealthStatus = Platform.OS === 'ios'
    ? appleHealthGranted ? 'Syncing steps from your device' : 'Tap to enable step tracking'
    : 'iOS only';

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Settings',
          headerStyle: { backgroundColor: theme.bg.primary },
          headerShadowVisible: false,
          headerTintColor: theme.text.primary,
          headerTitleStyle: { fontWeight: '700', fontSize: 17 },
          headerShown: true,
        }}
      />

      <ScrollView style={s.container} contentContainerStyle={s.contentContainer}>
        <SafeAreaView edges={['bottom']}>

          {/* ── ACCOUNT ── */}
          <Text style={s.sectionLabel}>ACCOUNT</Text>
          <View style={s.card}>
            <TouchableOpacity style={s.settingsRow} onPress={() => setShowEditModal(true)} activeOpacity={0.75}>
              <Ionicons name="person-outline" size={18} color={theme.text.secondary} />
              <Text style={s.settingsRowText}>Edit Profile</Text>
              <Ionicons name="chevron-forward" size={16} color={theme.text.secondary} />
            </TouchableOpacity>
            <View style={s.rowDivider} />
            <TouchableOpacity
              style={s.settingsRow}
              onPress={() => Alert.alert('Coming Soon', 'Password reset will be available in a future update.')}
              activeOpacity={0.75}
            >
              <Ionicons name="lock-closed-outline" size={18} color={theme.text.secondary} />
              <Text style={s.settingsRowText}>Change Password</Text>
              <Ionicons name="chevron-forward" size={16} color={theme.text.secondary} />
            </TouchableOpacity>
            <View style={s.rowDivider} />
            <TouchableOpacity
              style={s.settingsRow}
              onPress={() => Alert.alert('Coming Soon', 'Email change will be available in a future update.')}
              activeOpacity={0.75}
            >
              <Ionicons name="mail-outline" size={18} color={theme.text.secondary} />
              <Text style={s.settingsRowText}>Change Email</Text>
              <Ionicons name="chevron-forward" size={16} color={theme.text.secondary} />
            </TouchableOpacity>
          </View>

          {/* ── CONNECTED APPS ── */}
          <Text style={s.sectionLabel}>CONNECTED APPS</Text>
          <View style={s.card}>

            <ProviderRow
              name="Strava"
              statusText={user?.strava_connected ? 'Workouts synced' : 'Connect to import workouts'}
              iconName="fitness-outline"
              iconColor="#FC4C02"
              iconBg="rgba(252,76,2,0.15)"
              isConnected={!!user?.strava_connected}
              connectState={providerStates.strava}
              accentColor="#FC4C02"
              onConnect={() => handleOAuthConnect('strava', 'Strava', getStravaAuthUrl, 'strava_connected')}
            />
            <View style={s.appRowDivider} />

            <ProviderRow
              name="WHOOP"
              statusText={user?.whoop_connected ? 'Recovery data synced' : 'Connect for HRV & recovery'}
              iconName="pulse-outline"
              iconColor="#FF6B35"
              iconBg="rgba(255,107,53,0.15)"
              isConnected={!!user?.whoop_connected}
              connectState={providerStates.whoop}
              accentColor="#FF6B35"
              onConnect={() => handleOAuthConnect('whoop', 'WHOOP', getWhoopAuthUrl, 'whoop_connected')}
            />
            <View style={s.appRowDivider} />

            <ProviderRow
              name="Oura Ring"
              statusText={user?.oura_connected ? 'Readiness & sleep synced' : 'Connect for sleep & readiness'}
              iconName="radio-button-on-outline"
              iconColor="#00B894"
              iconBg="rgba(0,184,148,0.15)"
              isConnected={!!user?.oura_connected}
              connectState={providerStates.oura}
              accentColor="#00B894"
              onConnect={() => handleOAuthConnect('oura', 'Oura Ring', getOuraAuthUrl, 'oura_connected')}
            />
            <View style={s.appRowDivider} />

            <ProviderRow
              name="Apple Health"
              statusText={appleHealthStatus}
              iconName="heart"
              iconColor="#FF3B30"
              iconBg="rgba(255,59,48,0.15)"
              isConnected={appleHealthIsConnected}
              connectState={providerStates.apple_health}
              accentColor="#FF3B30"
              isIosOnly={Platform.OS !== 'ios'}
              note={Platform.OS === 'ios' && appleHealthGranted ? '📍 Steps read from device sensor' : undefined}
              onConnect={handleAppleHealth}
            />
            <View style={s.appRowDivider} />

            <ProviderRow
              name="Hevy"
              statusText={(user as any)?.hevy_connected ? 'Workouts imported' : 'Connect to import strength sessions'}
              iconName="barbell-outline"
              iconColor="#FF6B35"
              iconBg="rgba(255,107,53,0.12)"
              isConnected={!!(user as any)?.hevy_connected}
              connectState="idle"
              accentColor="#FF6B35"
              onConnect={() => { setHevyApiKey(''); setShowHevyModal(true); }}
              rightSlot={
                (user as any)?.hevy_connected ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View style={[pRowStyles.chip, { borderColor: '#FF6B3560', backgroundColor: '#FF6B3518' }]}>
                      <Ionicons name="checkmark" size={12} color="#FF6B35" />
                      <Text style={[pRowStyles.chipText, { color: '#FF6B35' }]}>Connected</Text>
                    </View>
                    <TouchableOpacity
                      style={[pRowStyles.button, { borderColor: '#FF6B35' }]}
                      onPress={handleSyncHevy}
                      disabled={hevySyncing}
                      activeOpacity={0.8}
                    >
                      {hevySyncing
                        ? <ActivityIndicator size="small" color="#FF6B35" />
                        : <Text style={[pRowStyles.buttonText, { color: '#FF6B35' }]}>Sync</Text>}
                    </TouchableOpacity>
                  </View>
                ) : undefined
              }
            />

            {(user as any)?.hevy_connected && (
              <>
                <View style={s.appRowDivider} />
                <TouchableOpacity
                  style={[s.settingsRow, { paddingVertical: 10 }]}
                  onPress={handleDisconnectHevy}
                  activeOpacity={0.75}
                >
                  <Ionicons name="unlink-outline" size={16} color={theme.status.danger} />
                  <Text style={[s.settingsRowText, { fontSize: 13, color: theme.status.danger }]}>
                    Disconnect Hevy
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </View>

          {/* ── DANGER ZONE ── */}
          <Text style={s.sectionLabel}>DANGER ZONE</Text>
          <View style={s.card}>
            <TouchableOpacity style={s.settingsRow} onPress={handleLogout} activeOpacity={0.75}>
              <Ionicons name="log-out-outline" size={18} color={theme.status.danger} />
              <Text style={s.logoutText}>Log Out</Text>
            </TouchableOpacity>
          </View>

          <Text style={s.footerNote}>
            For Strava, WHOOP, and Oura connections, ensure FRONTEND_URL in your backend .env
            matches your Expo session URL (e.g. exp://192.168.1.160:8081).
          </Text>

          <View style={s.bottomPadding} />
        </SafeAreaView>
      </ScrollView>

      {/* ── HEVY MODAL ── */}
      <Modal visible={showHevyModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowHevyModal(false)}>
        <KeyboardAvoidingView style={s.modalWrapper} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={s.modalContent} keyboardShouldPersistTaps="handled">
            <View style={s.modalHandle} />
            <View style={s.modalHeaderRow}>
              <Text style={s.modalTitle}>Connect Hevy</Text>
              <TouchableOpacity onPress={() => setShowHevyModal(false)} style={s.modalCloseBtn}>
                <Ionicons name="close" size={22} color={theme.text.muted} />
              </TouchableOpacity>
            </View>
            <Text style={s.modalDesc}>
              Enter your Hevy API key to import your workout history. Find it in the Hevy app under
              Profile → Settings → API.
            </Text>

            <View style={s.infoBox}>
              <Ionicons name="information-circle-outline" size={16} color={theme.accent} />
              <Text style={s.infoBoxText}>
                Hevy uses a personal API key. Your workouts will be imported and AI autopsies generated for each session.
              </Text>
            </View>

            <Text style={s.modalFieldLabel}>API Key</Text>
            <TextInput
              style={s.modalInput}
              value={hevyApiKey}
              onChangeText={setHevyApiKey}
              placeholder="Paste your Hevy API key here"
              placeholderTextColor={theme.text.muted}
              autoCorrect={false}
              autoCapitalize="none"
              autoFocus
            />

            <TouchableOpacity
              style={[s.saveBtn, hevyConnecting && s.btnDisabled]}
              onPress={handleSaveHevyKey}
              disabled={hevyConnecting}
              activeOpacity={0.85}
            >
              {hevyConnecting
                ? <ActivityIndicator size="small" color={theme.bg.primary} />
                : <Text style={s.saveBtnText}>Connect & Import Workouts</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={s.cancelBtn} onPress={() => setShowHevyModal(false)} activeOpacity={0.7}>
              <Text style={s.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── EDIT PROFILE MODAL ── */}
      <Modal visible={showEditModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowEditModal(false)}>
        <KeyboardAvoidingView style={s.modalWrapper} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={s.modalContent} keyboardShouldPersistTaps="handled">
            <View style={s.modalHandle} />
            <View style={s.modalHeaderRow}>
              <Text style={s.modalTitle}>Edit Profile</Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)} style={s.modalCloseBtn}>
                <Ionicons name="close" size={22} color={theme.text.muted} />
              </TouchableOpacity>
            </View>

            <Text style={s.modalFieldLabel}>Full Name</Text>
            <TextInput style={s.modalInput} value={editForm.full_name} onChangeText={(v) => setEditForm((p) => ({ ...p, full_name: v }))} placeholder="Your full name" placeholderTextColor={theme.text.muted} autoCorrect={false} />

            <Text style={s.modalFieldLabel}>Username</Text>
            <View style={s.usernameWrapper}>
              <Text style={s.usernameAt}>@</Text>
              <TextInput
                style={[s.modalInput, s.usernameInput]}
                value={editForm.username}
                onChangeText={(v) => setEditForm((p) => ({ ...p, username: v.toLowerCase().replace(/[^a-z0-9_]/g, '') }))}
                placeholder="yourhandle"
                placeholderTextColor={theme.text.muted}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <Text style={s.modalFieldLabel}>Bio</Text>
            <TextInput style={[s.modalInput, s.textArea]} value={editForm.bio} onChangeText={(v) => setEditForm((p) => ({ ...p, bio: v }))} placeholder="Tell your story…" placeholderTextColor={theme.text.muted} multiline numberOfLines={4} textAlignVertical="top" />

            <Text style={s.modalFieldLabel}>Location</Text>
            <TextInput style={s.modalInput} value={editForm.location} onChangeText={(v) => setEditForm((p) => ({ ...p, location: v }))} placeholder="City, Country" placeholderTextColor={theme.text.muted} autoCorrect={false} />

            <Text style={s.modalFieldLabel}>Body Weight (kg)</Text>
            <TextInput style={s.modalInput} value={editForm.weight_kg} onChangeText={(v) => setEditForm((p) => ({ ...p, weight_kg: v }))} placeholder="e.g. 75  (used for calorie calculations)" placeholderTextColor={theme.text.muted} keyboardType="decimal-pad" />

            <Text style={s.modalFieldLabel}>Sports & Activities (max 3)</Text>
            <View style={s.sportsGrid}>
              {ALL_SPORTS.map((sport) => {
                const selected = editForm.sports.includes(sport);
                return (
                  <TouchableOpacity
                    key={sport}
                    style={[s.sportTag, selected && s.sportTagSelected]}
                    onPress={() => toggleSport(sport)}
                    activeOpacity={0.75}
                  >
                    <Text style={[s.sportTagText, selected && s.sportTagTextSelected]}>{sport}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity style={[s.saveBtn, savingProfile && s.btnDisabled]} onPress={handleSaveProfile} disabled={savingProfile} activeOpacity={0.85}>
              {savingProfile ? <ActivityIndicator size="small" color={theme.bg.primary} /> : <Text style={s.saveBtnText}>Save Changes</Text>}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── TOAST ── */}
      <Toast message={toast} onHide={() => setToast(null)} />
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function createStyles(t: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: t.bg.primary },
    contentContainer: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },
    sectionLabel: { fontSize: 11, fontWeight: '600', color: t.text.muted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8, marginTop: 4 },
    card: { backgroundColor: t.bg.elevated, borderRadius: 16, paddingHorizontal: 16, borderWidth: 1, borderColor: t.border, marginBottom: 24 },
    settingsRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 12 },
    settingsRowText: { flex: 1, fontSize: 15, color: t.text.primary },
    rowDivider: { height: 1, backgroundColor: t.border, marginLeft: 46 },
    appRowDivider: { height: 1, backgroundColor: t.border, marginLeft: 52 },
    logoutText: { flex: 1, fontSize: 15, fontWeight: '500', color: t.status.danger },
    footerNote: { fontSize: 11, color: t.text.muted, lineHeight: 16, textAlign: 'center', paddingHorizontal: 8, marginBottom: 8 },
    bottomPadding: { height: 24 },

    // Modal
    modalWrapper: { flex: 1, backgroundColor: t.bg.primary },
    modalContent: { padding: 24, paddingBottom: 48 },
    modalHandle: { width: 40, height: 4, backgroundColor: t.border, borderRadius: 2, alignSelf: 'center', marginBottom: 24 },
    modalHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
    modalTitle: { fontSize: 22, fontWeight: '700', color: t.text.primary },
    modalCloseBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: t.bg.elevated, borderWidth: 1, borderColor: t.border, alignItems: 'center', justifyContent: 'center' },
    modalDesc: { fontSize: 14, color: t.text.secondary, lineHeight: 20, marginBottom: 20 },
    infoBox: { flexDirection: 'row', gap: 8, backgroundColor: t.bg.elevated, borderRadius: 10, padding: 12, marginBottom: 20, borderWidth: 1, borderColor: t.bg.elevated },
    infoBoxText: { flex: 1, fontSize: 13, color: t.text.secondary, lineHeight: 18 },
    modalFieldLabel: { fontSize: 13, color: t.text.secondary, marginBottom: 8, fontWeight: '500' },
    modalInput: { backgroundColor: t.bg.elevated, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: t.text.primary, borderWidth: 1, borderColor: t.border, marginBottom: 16 },
    textArea: { minHeight: 100, textAlignVertical: 'top' },
    usernameWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: t.bg.elevated, borderRadius: 12, borderWidth: 1, borderColor: t.border, paddingLeft: 16, marginBottom: 16 },
    usernameAt: { fontSize: 16, color: t.text.secondary, marginRight: 2 },
    usernameInput: { flex: 1, marginBottom: 0, borderWidth: 0, paddingLeft: 0, backgroundColor: 'transparent' },
    sportsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
    sportTag: { backgroundColor: t.bg.elevated, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: t.border },
    sportTagSelected: { backgroundColor: t.text.primary, borderColor: t.text.primary },
    sportTagText: { fontSize: 14, color: t.text.secondary },
    sportTagTextSelected: { color: t.bg.primary, fontWeight: '600' },
    saveBtn: { backgroundColor: t.text.primary, borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginBottom: 8 },
    saveBtnText: { color: t.bg.primary, fontSize: 16, fontWeight: '700' },
    cancelBtn: { alignItems: 'center', paddingVertical: 12 },
    cancelBtnText: { color: t.text.muted, fontSize: 15 },
    btnDisabled: { opacity: 0.5 },
  });
}
