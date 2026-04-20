import { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Image, ScrollView, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useAuthStore } from '@/services/authStore';
import { getTodayCheckin, generateCheckinCaption, saveCheckin, getDashboard, CheckinStatus } from '@/services/api';
import { theme as T, type as TY, radius as R, space as SP } from '@/services/theme';

type Screen = 'window' | 'preview';

const INFLUENCE_TAGS = [
  'Good sleep',
  'Bad sleep',
  'Stressed',
  'Well fueled',
  'Under fueled',
  'Sore',
  'Feeling strong',
  'Rest day',
  'Traveling',
  'Sick',
];

export default function CheckinScreen() {
  const insets = useSafeAreaInsets();
  const user = useAuthStore((state) => state.user);

  // Window / status state
  const [checkinStatus, setCheckinStatus] = useState<CheckinStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);
  const [countdown, setCountdown] = useState('');

  // Dashboard stats
  const [stats, setStats] = useState<{
    readiness?: number;
    steps?: number;
    calories_consumed?: number;
    calories_target?: number;
    session_name?: string;
    training_load?: number;
  }>({});

  // Screen flow
  const [screen, setScreen] = useState<Screen>('window');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);

  // Caption
  const [caption, setCaption] = useState('');
  const [captionLoading, setCaptionLoading] = useState(false);
  const [captionRegens, setCaptionRegens] = useState(0);

  // Influence tags
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  // Posting
  const [posting, setPosting] = useState(false);

  // Countdown timer ref
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── On mount ──────────────────────────────────────────────────────────────

  useEffect(() => {
    loadData();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const loadData = async () => {
    setStatusLoading(true);
    try {
      const [status, dashboard] = await Promise.allSettled([
        getTodayCheckin(),
        getDashboard(),
      ]);

      if (status.status === 'fulfilled') {
        setCheckinStatus(status.value);
        if (status.value.window_active && status.value.window_expires_at) {
          startCountdown(status.value.window_expires_at);
        }
      }

      if (dashboard.status === 'fulfilled') {
        const d = dashboard.value;
        setStats({
          readiness: d.readiness_score,
          steps: d.steps_today,
          calories_consumed: d.calories_today,
          calories_target: d.calorie_target ?? undefined,
          session_name: d.last_session?.name,
          training_load: d.weekly_load,
        });
      }
    } catch {
      // silent
    } finally {
      setStatusLoading(false);
    }
  };

  const startCountdown = (expiresAt: string) => {
    const update = () => {
      const diff = new Date(expiresAt).getTime() - Date.now();
      if (diff <= 0) {
        setCountdown('00:00');
        if (timerRef.current) clearInterval(timerRef.current);
        return;
      }
      const totalSecs = Math.floor(diff / 1000);
      const mins = Math.floor(totalSecs / 60);
      const secs = totalSecs % 60;
      setCountdown(`${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`);
    };
    update();
    timerRef.current = setInterval(update, 1000);
  };

  // ── Photo capture ─────────────────────────────────────────────────────────

  const handleTakePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Camera Permission', 'Camera access is required to take a check-in photo.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.7,
        base64: true,
      });
      if (!result.canceled && result.assets.length > 0) {
        const asset = result.assets[0];
        setPhotoUri(asset.uri);
        setPhotoBase64(asset.base64 ?? null);
        setScreen('preview');
        generateCaption(asset.base64);
      }
    } catch {
      Alert.alert('Error', 'Could not open camera. Please try again.');
    }
  };

  // ── Caption generation ────────────────────────────────────────────────────

  const generateCaption = async (base64?: string | null) => {
    setCaptionLoading(true);
    try {
      const now = new Date();
      const hour = now.getHours();
      const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';

      const res = await generateCheckinCaption({
        name: user?.display_name || user?.full_name || 'Athlete',
        readiness: stats.readiness,
        steps: stats.steps,
        calories_consumed: stats.calories_consumed,
        calories_target: stats.calories_target,
        session_name: stats.session_name,
        sport_tags: user?.sport_tags ?? undefined,
        time_of_day: timeOfDay,
      });
      setCaption(res.caption);
    } catch {
      setCaption("Today's grind is done. On to the next one. 💪");
    } finally {
      setCaptionLoading(false);
    }
  };

  const handleRegenerateCaption = async () => {
    if (captionRegens >= 3) return;
    setCaptionRegens((n) => n + 1);
    await generateCaption();
  };

  // ── Tag toggle ────────────────────────────────────────────────────────────

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) => {
      if (prev.includes(tag)) return prev.filter((t) => t !== tag);
      if (prev.length >= 3) return prev;
      return [...prev, tag];
    });
  };

  // ── Post ──────────────────────────────────────────────────────────────────

  const handlePost = async () => {
    setPosting(true);
    try {
      const photoUrl = photoBase64
        ? `data:image/jpeg;base64,${photoBase64}`
        : undefined;

      await saveCheckin({
        photo_url: photoUrl,
        caption,
        stats_overlay_json: {
          readiness: stats.readiness,
          steps: stats.steps,
          calories: stats.calories_consumed,
          calories_target: stats.calories_target,
          training_load: stats.training_load,
        },
        influence_tags: selectedTags,
        is_public: true,
      });

      router.back();
    } catch {
      Alert.alert('Error', 'Could not post your check-in. Please try again.');
    } finally {
      setPosting(false);
    }
  };

  // ── Readiness color ───────────────────────────────────────────────────────

  const readinessColor = (score?: number) => {
    if (!score) return T.text.muted;
    if (score >= 70) return T.readiness.high;
    if (score >= 40) return T.readiness.mid;
    return T.readiness.low;
  };

  // ── Window Screen ─────────────────────────────────────────────────────────

  const renderWindowScreen = () => {
    if (statusLoading) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator color={T.text.body} size="large" />
        </View>
      );
    }

    const windowActive = checkinStatus?.window_active ?? false;
    const alreadyDone = checkinStatus?.has_checkin ?? false;

    if (alreadyDone) {
      return (
        <View style={styles.centered}>
          <Ionicons name="checkmark-circle" size={64} color={T.status.success} />
          <Text style={styles.bigTitle}>Already Checked In</Text>
          <Text style={styles.subtitle}>You've already completed today's check-in.</Text>
          <TouchableOpacity style={styles.btnSecondary} onPress={() => router.back()}>
            <Text style={styles.btnSecondaryText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <ScrollView contentContainerStyle={styles.windowContent}>
        {windowActive ? (
          <>
            <Text style={styles.windowLabel}>WINDOW CLOSES IN</Text>
            <Text style={styles.countdownText}>{countdown || '--:--'}</Text>
            <Text style={styles.subtitle}>Window closes soon — take your check-in photo now!</Text>
          </>
        ) : (
          <>
            <Ionicons name="time-outline" size={56} color={T.text.muted} />
            <Text style={styles.bigTitle}>No Active Window</Text>
            <Text style={styles.subtitle}>
              No check-in window right now. Windows typically open in the morning and evening — check back later.
            </Text>
          </>
        )}

        {/* Stats card */}
        <View style={styles.statsCard}>
          <Text style={styles.statsCardTitle}>TODAY'S STATS</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: readinessColor(stats.readiness) }]}>
                {stats.readiness != null ? `${stats.readiness}%` : '--'}
              </Text>
              <Text style={styles.statLabel}>Readiness</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {stats.steps != null ? stats.steps.toLocaleString() : '--'}
              </Text>
              <Text style={styles.statLabel}>Steps</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {stats.calories_consumed != null ? `${stats.calories_consumed}` : '--'}
              </Text>
              <Text style={styles.statLabel}>Calories</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>
                {stats.training_load != null ? `${stats.training_load}` : '--'}
              </Text>
              <Text style={styles.statLabel}>Weekly Load</Text>
            </View>
          </View>
        </View>

        {windowActive && (
          <TouchableOpacity style={styles.btnPrimary} onPress={handleTakePhoto}>
            <Ionicons name="camera" size={20} color={T.accentInk} style={{ marginRight: 8 }} />
            <Text style={styles.btnPrimaryText}>Take Photo</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={[styles.btnSecondary, { marginTop: 8 }]} onPress={() => router.back()}>
          <Text style={styles.btnSecondaryText}>Cancel</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  };

  // ── Preview Screen ────────────────────────────────────────────────────────

  const renderPreviewScreen = () => (
    <View style={{ flex: 1 }}>
      {/* Photo background */}
      <View style={{ flex: 1, position: 'relative' }}>
        {photoUri ? (
          <Image
            source={{ uri: photoUri }}
            style={{ width: '100%', height: '100%' }}
            resizeMode="cover"
          />
        ) : (
          <View style={{ flex: 1, backgroundColor: T.bg.elevated }} />
        )}

        {/* Dark overlay at bottom */}
        <View style={styles.photoOverlay} />

        {/* Stats overlay pill */}
        <View style={styles.statsOverlay}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
            {stats.readiness != null && (
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: readinessColor(stats.readiness) }} />
            )}
            <Text style={{ fontSize: 11, color: T.text.secondary, letterSpacing: 1, textTransform: 'uppercase' }}>Today's Stats</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 16, flexWrap: 'wrap' }}>
            {stats.readiness != null && (
              <Text style={styles.overlayStatText}>
                <Text style={{ color: T.text.muted }}>Readiness </Text>
                <Text style={{ color: readinessColor(stats.readiness) }}>{stats.readiness}%</Text>
              </Text>
            )}
            {stats.steps != null && (
              <Text style={styles.overlayStatText}>
                <Text style={{ color: T.text.muted }}>Steps </Text>{stats.steps.toLocaleString()}
              </Text>
            )}
            {stats.calories_consumed != null && (
              <Text style={styles.overlayStatText}>
                <Text style={{ color: T.text.muted }}>Cal </Text>{stats.calories_consumed}
                {stats.calories_target != null ? `/${stats.calories_target}` : ''}
              </Text>
            )}
          </View>
        </View>
      </View>

      {/* Bottom sheet */}
      <View style={styles.previewBottom}>
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Caption */}
          <View style={{ marginBottom: 12 }}>
            {captionLoading ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <ActivityIndicator size="small" color={T.text.muted} />
                <Text style={{ fontSize: 13, color: T.text.muted, fontStyle: 'italic' }}>Generating caption...</Text>
              </View>
            ) : (
              <Text style={{ fontSize: 14, color: T.text.primary, fontStyle: 'italic', lineHeight: 20 }}>{caption}</Text>
            )}
            {captionRegens < 3 && !captionLoading && (
              <TouchableOpacity onPress={handleRegenerateCaption} style={{ marginTop: 6 }}>
                <Text style={{ fontSize: 12, color: T.text.muted }}>
                  Regenerate Caption ({3 - captionRegens} left)
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Influence tags */}
          <Text style={{ fontSize: 11, color: T.text.muted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
            What influenced your day?
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
            <View style={{ flexDirection: 'row', gap: 8, paddingRight: 8 }}>
              {INFLUENCE_TAGS.map((tag) => {
                const selected = selectedTags.includes(tag);
                const disabled = !selected && selectedTags.length >= 3;
                return (
                  <TouchableOpacity
                    key={tag}
                    onPress={() => !disabled && toggleTag(tag)}
                    style={[
                      styles.tagPill,
                      selected && styles.tagPillSelected,
                      disabled && { opacity: 0.4 },
                    ]}
                  >
                    <Text style={[styles.tagText, selected && styles.tagTextSelected]}>{tag}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>

          {selectedTags.length >= 3 && (
            <Text style={{ fontSize: 11, color: T.text.muted, marginTop: 4 }}>Max 3 tags selected</Text>
          )}
        </ScrollView>

        {/* Action buttons */}
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
          <TouchableOpacity
            onPress={() => { setScreen('window'); setPhotoUri(null); setPhotoBase64(null); setCaption(''); setSelectedTags([]); setCaptionRegens(0); }}
            style={styles.btnCancel}
          >
            <Text style={styles.btnCancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handlePost}
            disabled={posting}
            style={[styles.btnPost, posting && { opacity: 0.6 }]}
          >
            {posting ? (
              <ActivityIndicator size="small" color={T.accentInk} />
            ) : (
              <Text style={styles.btnPostText}>Post Check-In</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  // ── Root render ───────────────────────────────────────────────────────────

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      {/* Header */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => { if (screen === 'preview') { setScreen('window'); setPhotoUri(null); setPhotoBase64(null); setCaption(''); } else { router.back(); } }} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="chevron-back" size={26} color={T.text.primary} />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Daily Check-In</Text>
        <View style={{ width: 26 }} />
      </View>

      <View style={{ flex: 1 }}>
        {screen === 'window' ? renderWindowScreen() : renderPreviewScreen()}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: T.bg.primary,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  topBarTitle: {
    fontSize: 17,
    fontFamily: TY.sans.bold,
    color: T.text.primary,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  windowContent: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 24,
    gap: 16,
  },
  windowLabel: {
    fontSize: 11,
    color: T.text.muted,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: -4,
  },
  countdownText: {
    fontSize: 64,
    fontFamily: TY.sans.bold,
    color: T.text.primary,
    letterSpacing: 2,
    fontVariant: ['tabular-nums'],
  },
  bigTitle: {
    fontSize: 24,
    fontFamily: TY.sans.bold,
    color: T.text.primary,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: T.text.muted,
    textAlign: 'center',
    lineHeight: 20,
  },
  statsCard: {
    width: '100%',
    backgroundColor: T.bg.elevated,
    borderRadius: R.md,
    padding: 16,
    borderWidth: 1,
    borderColor: T.border,
    gap: 12,
  },
  statsCardTitle: {
    fontSize: 10,
    color: T.text.muted,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statItem: {
    flex: 1,
    minWidth: '40%',
    gap: 2,
  },
  statValue: {
    fontSize: 22,
    fontFamily: TY.sans.bold,
    color: T.text.primary,
  },
  statLabel: {
    fontSize: 11,
    color: T.text.muted,
  },
  btnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: T.accent,
    borderRadius: R.sm,
    height: 56,
    width: '100%',
    marginTop: 8,
  },
  btnPrimaryText: {
    fontSize: 16,
    fontFamily: TY.sans.bold,
    color: T.accentInk,
  },
  btnSecondary: {
    width: '100%',
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: R.sm,
    borderWidth: 1,
    borderColor: T.border,
  },
  btnSecondaryText: {
    fontSize: 15,
    color: T.text.secondary,
  },
  // Preview screen
  photoOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '40%',
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  statsOverlay: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(17,17,17,0.85)',
    borderRadius: R.sm,
    padding: 12,
    borderWidth: 1,
    borderColor: T.border,
  },
  overlayStatText: {
    fontSize: 13,
    color: T.text.primary,
  },
  previewBottom: {
    backgroundColor: T.bg.primary,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: T.border,
    maxHeight: 340,
  },
  tagPill: {
    borderRadius: R.lg,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: 'transparent',
  },
  tagPillSelected: {
    borderColor: T.text.body,
    backgroundColor: T.bg.elevated,
  },
  tagText: {
    fontSize: 13,
    color: T.text.muted,
  },
  tagTextSelected: {
    color: T.text.primary,
  },
  btnCancel: {
    flex: 1,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: R.sm,
    borderWidth: 1,
    borderColor: T.border,
  },
  btnCancelText: {
    fontSize: 15,
    color: T.text.secondary,
  },
  btnPost: {
    flex: 2,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: R.sm,
    backgroundColor: T.accent,
  },
  btnPostText: {
    fontSize: 15,
    fontFamily: TY.sans.bold,
    color: T.accentInk,
  },
});
