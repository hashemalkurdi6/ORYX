import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  Image,
  TextInput,
  ActivityIndicator,
  Dimensions,
  StyleSheet,
  ScrollView,
  Switch,
  Alert,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { createPost, uploadMedia, getMyClubs, CommunityClub } from '@/services/api';
import OryxInsightCreator from '@/components/OryxInsightCreator';
import { ThemeColors, theme as T, type as TY, radius as R, space as SP } from '@/services/theme';

import { useTheme } from '@/contexts/ThemeContext';
const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Try CameraView
let CameraView: any = null;
let useCameraPermissions: any = null;
try {
  const expoCam = require('expo-camera');
  CameraView = expoCam.CameraView;
  useCameraPermissions = expoCam.useCameraPermissions;
} catch {
  CameraView = null;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onPostCreated: () => void;
  currentStats?: any;
  dashboard?: any;
}

type Step = 'type-select' | 'camera' | 'oryx-card' | 'caption';

interface ToastState {
  visible: boolean;
  message: string;
  color: string;
}

const CARD_TYPES = [
  { key: 'workout', label: 'Workout Card', icon: 'barbell-outline' as const, subtitle: 'Last session stats' },
  { key: 'insight', label: 'Daily Insight', icon: 'bulb-outline' as const, subtitle: 'AI diagnosis' },
  { key: 'recap', label: 'Weekly Recap', icon: 'calendar-outline' as const, subtitle: 'Weekly summary' },
  { key: 'generic', label: 'Text Card', icon: 'document-text-outline' as const, subtitle: 'Custom message' },
];

function OryxDataCardPreview({ data, currentStats, dashboard, styles }: { data: any; currentStats?: any; dashboard?: any; styles: ReturnType<typeof createStyles> }) {
  if (!data) return null;
  const ptype = data.post_type;

  return (
    <View style={styles.oryxCard}>
      {ptype === 'workout' && (
        <>
          <Text style={styles.oryxCardLabel}>WORKOUT</Text>
          <Text style={styles.oryxCardTitle}>{data.session_name || currentStats?.last_session?.name || 'Session'}</Text>
          <View style={styles.oryxCardRow}>
            {(data.duration_minutes ?? currentStats?.last_session?.duration_minutes) != null && (
              <View style={styles.oryxStat}>
                <Text style={styles.oryxStatVal}>{data.duration_minutes ?? currentStats?.last_session?.duration_minutes}min</Text>
                <Text style={styles.oryxStatLabel}>Duration</Text>
              </View>
            )}
            {(data.training_load ?? currentStats?.weekly_load) != null && (
              <View style={styles.oryxStat}>
                <Text style={styles.oryxStatVal}>{data.training_load ?? currentStats?.weekly_load}</Text>
                <Text style={styles.oryxStatLabel}>Load</Text>
              </View>
            )}
            {(data.rpe ?? currentStats?.last_session?.rpe) != null && (
              <View style={styles.oryxStat}>
                <Text style={styles.oryxStatVal}>{data.rpe ?? currentStats?.last_session?.rpe}/10</Text>
                <Text style={styles.oryxStatLabel}>RPE</Text>
              </View>
            )}
          </View>
          {(data.autopsy_snippet ?? currentStats?.last_session?.autopsy_snippet) ? (
            <Text style={styles.oryxCardBody} numberOfLines={2}>
              {data.autopsy_snippet ?? currentStats?.last_session?.autopsy_snippet}
            </Text>
          ) : null}
        </>
      )}
      {ptype === 'insight' && (
        <>
          <Text style={styles.oryxCardLabel}>ORYX INSIGHT</Text>
          <Text style={styles.oryxCardBody} numberOfLines={4}>
            {data.diagnosis_text || dashboard?.diagnosis?.diagnosis_text || 'Your daily AI-powered fitness insight.'}
          </Text>
          {(data.factors ?? dashboard?.diagnosis?.contributing_factors) ? (
            <View style={styles.oryxTagRow}>
              {(data.factors ?? dashboard?.diagnosis?.contributing_factors ?? []).slice(0, 3).map((f: string, i: number) => (
                <View key={i} style={styles.oryxTag}><Text style={styles.oryxTagText}>{f}</Text></View>
              ))}
            </View>
          ) : null}
        </>
      )}
      {ptype === 'recap' && (
        <>
          <Text style={styles.oryxCardLabel}>WEEK RECAP</Text>
          <View style={styles.oryxCardRow}>
            <View style={styles.oryxStat}>
              <Text style={styles.oryxStatVal}>{data.sessions ?? currentStats?.sessions_this_week ?? '-'}</Text>
              <Text style={styles.oryxStatLabel}>Sessions</Text>
            </View>
            <View style={styles.oryxStat}>
              <Text style={styles.oryxStatVal}>{data.total_load ?? currentStats?.weekly_load ?? '-'}</Text>
              <Text style={styles.oryxStatLabel}>Load</Text>
            </View>
            <View style={styles.oryxStat}>
              <Text style={styles.oryxStatVal}>{data.streak ?? currentStats?.current_streak ?? '-'}</Text>
              <Text style={styles.oryxStatLabel}>Streak</Text>
            </View>
          </View>
          {(data.summary ?? currentStats?.recap_summary) ? (
            <Text style={styles.oryxCardBody} numberOfLines={2}>{data.summary ?? currentStats?.recap_summary}</Text>
          ) : null}
        </>
      )}
      {ptype === 'milestone' && (
        <View style={{ alignItems: 'center', gap: 8 }}>
          <Ionicons name="trophy" size={36} color={T.text.body} />
          <Text style={styles.oryxCardTitle}>{data.badge_name || 'Milestone'}</Text>
          {data.description ? <Text style={styles.oryxCardBody}>{data.description}</Text> : null}
        </View>
      )}
      {ptype === 'generic' && (
        <>
          {data.title ? <Text style={styles.oryxCardTitle}>{data.title}</Text> : null}
          {data.body ? <Text style={styles.oryxCardBody}>{data.body}</Text> : null}
        </>
      )}
    </View>
  );
}

export default function PostCreator({ visible, onClose, onPostCreated, currentStats, dashboard }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const cameraPermHook = useCameraPermissions ? useCameraPermissions() : [null, null];
  const [cameraPermission, requestCameraPermission] = cameraPermHook;
  const cameraRef = useRef<any>(null);

  const [step, setStep] = useState<Step>('type-select');
  const [wantsPhoto, setWantsPhoto] = useState(false);
  const [wantsOryx, setWantsOryx] = useState(false);
  const [showOryxInsight, setShowOryxInsight] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [cameraFacing, setCameraFacing] = useState<'front' | 'back'>('back');

  // Oryx card
  const [selectedCardType, setSelectedCardType] = useState<string | null>(null);
  const [oryxCardData, setOryxCardData] = useState<any>(null);

  // Caption / sharing
  const [caption, setCaption] = useState('');
  const [alsoStory, setAlsoStory] = useState(false);
  const [selectedClubId, setSelectedClubId] = useState<string | null>(null);
  const [clubs, setClubs] = useState<CommunityClub[]>([]);
  const [showClubSheet, setShowClubSheet] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Toast
  const [toast, setToast] = useState<ToastState>({ visible: false, message: '', color: '#27ae60' });
  const toastTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, color = '#27ae60') => {
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    setToast({ visible: true, message, color });
    toastTimeout.current = setTimeout(() => setToast(t => ({ ...t, visible: false })), 2000);
  }, []);

  useEffect(() => {
    if (visible) {
      setStep('type-select');
      setWantsPhoto(false);
      setWantsOryx(false);
      setPhotoUri(null);
      setSelectedCardType(null);
      setOryxCardData(null);
      setCaption('');
      setAlsoStory(false);
      setSelectedClubId(null);
    }
  }, [visible]);

  useEffect(() => {
    if (visible) {
      getMyClubs().then(r => setClubs(r.clubs)).catch(() => {});
    }
  }, [visible]);

  const buildOryxCardData = useCallback((cardType: string) => {
    if (cardType === 'workout') {
      const ls = currentStats?.last_session;
      return {
        post_type: 'workout',
        session_name: ls?.name || ls?.session_name || 'Workout',
        duration_minutes: ls?.duration_minutes,
        training_load: ls?.training_load,
        rpe: ls?.rpe,
        autopsy_snippet: ls?.autopsy_snippet,
      };
    }
    if (cardType === 'insight') {
      return {
        post_type: 'insight',
        diagnosis_text: dashboard?.diagnosis?.diagnosis_text || '',
        factors: dashboard?.diagnosis?.contributing_factors || [],
        recommendation: dashboard?.diagnosis?.recommendation || '',
      };
    }
    if (cardType === 'recap') {
      return {
        post_type: 'recap',
        sessions: currentStats?.sessions_this_week,
        total_load: currentStats?.weekly_load,
        streak: currentStats?.current_streak,
        summary: currentStats?.recap_summary,
      };
    }
    if (cardType === 'generic') {
      return { post_type: 'generic', title: 'My Post', body: '' };
    }
    return null;
  }, [currentStats, dashboard]);

  const openGallery = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
    });
    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
      // Advance based on whether oryx is also wanted
      if (wantsOryx) {
        setStep('oryx-card');
      } else {
        setStep('caption');
      }
    }
  }, [wantsOryx]);

  const openCameraViaImagePicker = useCallback(async () => {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
    });
    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
      if (wantsOryx) {
        setStep('oryx-card');
      } else {
        setStep('caption');
      }
    }
  }, [wantsOryx]);

  const takePicture = useCallback(async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.9 });
      setPhotoUri(photo.uri);
      if (wantsOryx) {
        setStep('oryx-card');
      } else {
        setStep('caption');
      }
    } catch {
      Alert.alert('Error', 'Could not take photo.');
    }
  }, [wantsOryx]);

  const handlePost = useCallback(async () => {
    setUploading(true);
    try {
      let photo_url: string | undefined;
      if (photoUri) {
        const result = await uploadMedia(photoUri, 1080);
        photo_url = result.url;
      }

      await createPost({
        photo_url,
        caption: caption.trim() || undefined,
        oryx_data_card_json: oryxCardData ?? undefined,
        also_shared_as_story: alsoStory,
        club_id: selectedClubId ?? undefined,
      });

      showToast('Posted', '#27ae60');
      setTimeout(() => {
        onPostCreated();
      }, 500);
    } catch {
      showToast('Failed to post. Try again.', '#c0392b');
    } finally {
      setUploading(false);
    }
  }, [photoUri, caption, oryxCardData, alsoStory, selectedClubId, showToast, onPostCreated]);

  if (!visible) return null;

  // OryxInsightCreator overlay — must be checked before step branches
  if (showOryxInsight) {
    return (
      <OryxInsightCreator
        visible={showOryxInsight}
        onClose={() => { setShowOryxInsight(false); onClose(); }}
        onBack={() => { setShowOryxInsight(false); setStep('type-select'); }}
        onPostCreated={() => { setShowOryxInsight(false); onPostCreated(); }}
      />
    );
  }

  // ── Step: Type selector ───────────────────────────────────────────────────────
  if (step === 'type-select') {
    const canContinue = wantsPhoto || wantsOryx;
    return (
      <Modal visible animationType="slide" transparent onRequestClose={onClose}>
        <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={onClose}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <View style={[styles.typeSheet, { paddingBottom: insets.bottom + 24 }]}>
              {/* Handle */}
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>Create Post</Text>

              <View style={styles.tileRow}>
                <TouchableOpacity
                  onPress={() => { setWantsPhoto(true); setWantsOryx(false); }}
                  style={[styles.tile, wantsPhoto && styles.tileSelected]}
                  activeOpacity={0.85}
                >
                  <Ionicons name="camera-outline" size={28} color={wantsPhoto ? T.accent : T.text.secondary} />
                  <Text style={[styles.tileName, wantsPhoto && styles.tileNameSelected]}>Photo Post</Text>
                  <Text style={styles.tileSubtitle}>Post a photo</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => { setWantsOryx(true); setWantsPhoto(false); }}
                  style={[styles.tile, wantsOryx && styles.tileSelected]}
                  activeOpacity={0.85}
                >
                  <Ionicons name="stats-chart-outline" size={28} color={wantsOryx ? T.accent : T.text.secondary} />
                  <Text style={[styles.tileName, wantsOryx && styles.tileNameSelected]}>ORYX Insight</Text>
                  <Text style={styles.tileSubtitle}>Share your stats</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                onPress={() => {
                  if (!canContinue) return;
                  // If ORYX Insight is selected, open OryxInsightCreator regardless of photo toggle
                  if (wantsOryx) {
                    setShowOryxInsight(true);
                    return;
                  }
                  if (wantsPhoto) {
                    setStep('camera');
                  } else {
                    setStep('oryx-card');
                  }
                }}
                style={[styles.continueBtn, !canContinue && styles.continueBtnDisabled]}
                disabled={!canContinue}
                activeOpacity={0.85}
              >
                <Text style={styles.continueBtnText}>Continue</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    );
  }

  // ── Step: Camera ──────────────────────────────────────────────────────────────
  if (step === 'camera') {
    const hasCameraView = !!CameraView;
    return (
      <Modal visible animationType="slide" statusBarTranslucent onRequestClose={() => setStep('type-select')}>
        <View style={{ flex: 1, backgroundColor: '#000000' }}>
          <TouchableOpacity
            onPress={() => setStep('type-select')}
            style={{ position: 'absolute', top: insets.top + 12, left: 16, zIndex: 20 }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="arrow-back" size={28} color="#ffffff" />
          </TouchableOpacity>

          {hasCameraView ? (
            cameraPermission?.granted ? (
              <CameraView ref={cameraRef} style={{ flex: 1 }} facing={cameraFacing} />
            ) : (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
                <Text style={{ color: '#ffffff', fontSize: 15, textAlign: 'center', paddingHorizontal: 32 }}>
                  Camera access needed
                </Text>
                <TouchableOpacity
                  onPress={requestCameraPermission}
                  style={{ backgroundColor: '#ffffff', borderRadius: 24, paddingHorizontal: 24, paddingVertical: 12 }}
                >
                  <Text style={{ color: '#000000', fontWeight: '700' }}>Allow Camera</Text>
                </TouchableOpacity>
              </View>
            )
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 }}>
              <Ionicons name="camera" size={64} color={theme.text.muted} />
              <Text style={{ color: theme.text.muted, fontSize: 15, fontFamily: TY.sans.regular }}>Choose a photo</Text>
            </View>
          )}

          <View style={[styles.cameraBottomRow, { paddingBottom: insets.bottom + 24 }]}>
            <TouchableOpacity onPress={openGallery} style={styles.cameraIconBtn}>
              <Ionicons name="images-outline" size={26} color="#ffffff" />
            </TouchableOpacity>
            {hasCameraView && cameraPermission?.granted ? (
              <TouchableOpacity onPress={takePicture} style={styles.captureBtn} />
            ) : (
              <TouchableOpacity onPress={openCameraViaImagePicker} style={styles.captureBtn} />
            )}
            {hasCameraView ? (
              <TouchableOpacity
                onPress={() => setCameraFacing(f => f === 'back' ? 'front' : 'back')}
                style={styles.cameraIconBtn}
              >
                <Ionicons name="camera-reverse-outline" size={26} color="#ffffff" />
              </TouchableOpacity>
            ) : (
              <View style={styles.cameraIconBtn} />
            )}
          </View>
        </View>
      </Modal>
    );
  }

  // ── Step: Oryx card selection ─────────────────────────────────────────────────
  if (step === 'oryx-card') {
    return (
      <Modal visible animationType="slide" transparent onRequestClose={() => {
        if (wantsPhoto && photoUri) setStep('camera');
        else setStep('type-select');
      }}>
        <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={() => {
          if (wantsPhoto && photoUri) setStep('caption');
          else setStep('type-select');
        }}>
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <View style={[styles.oryxSheet, { paddingBottom: insets.bottom + 24 }]}>
              <View style={styles.sheetHandle} />
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingBottom: 12 }}>
                <TouchableOpacity
                  onPress={() => wantsPhoto && photoUri ? setStep('camera') : setStep('type-select')}
                  style={{ marginRight: 12 }}
                >
                  <Ionicons name="arrow-back" size={22} color={theme.text.primary} />
                </TouchableOpacity>
                <Text style={styles.sheetTitle}>Select ORYX Card</Text>
              </View>

              <View style={styles.cardTypeGrid}>
                {CARD_TYPES.map((ct) => (
                  <TouchableOpacity
                    key={ct.key}
                    onPress={() => {
                      setSelectedCardType(ct.key);
                      setOryxCardData(buildOryxCardData(ct.key));
                    }}
                    style={[styles.cardTypeTile, selectedCardType === ct.key && styles.cardTypeTileSelected]}
                  >
                    <Ionicons name={ct.icon} size={28} color={selectedCardType === ct.key ? theme.text.primary : theme.text.secondary} />
                    <Text style={[styles.cardTypeName, selectedCardType === ct.key && { color: theme.text.primary }]}>{ct.label}</Text>
                    <Text style={styles.cardTypeSubtitle}>{ct.subtitle}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Preview */}
              {oryxCardData && (
                <OryxDataCardPreview data={oryxCardData} currentStats={currentStats} dashboard={dashboard} styles={styles} />
              )}

              <TouchableOpacity
                onPress={() => setStep('caption')}
                disabled={!selectedCardType}
                style={[styles.continueBtn, !selectedCardType && styles.continueBtnDisabled]}
              >
                <Text style={styles.continueBtnText}>Done</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    );
  }

  // ── Step: Caption + sharing ───────────────────────────────────────────────────
  if (step === 'caption') {
    const captionLen = caption.length;
    const captionColor = captionLen >= 2200 ? theme.status.danger : captionLen >= 2000 ? theme.status.warn : theme.text.muted;
    const selectedClub = clubs.find(c => c.id === selectedClubId);

    return (
      <Modal visible animationType="slide" onRequestClose={() => {
        if (wantsOryx) setStep('oryx-card');
        else if (wantsPhoto) setStep('camera');
        else setStep('type-select');
      }}>
        <View style={{ flex: 1, backgroundColor: theme.bg.primary }}>
          {/* Header */}
          <View style={[styles.captionHeader, { paddingTop: insets.top + 12 }]}>
            <TouchableOpacity
              onPress={() => {
                if (wantsOryx) setStep('oryx-card');
                else if (wantsPhoto) setStep('camera');
                else setStep('type-select');
              }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="arrow-back" size={24} color={theme.text.primary} />
            </TouchableOpacity>
            <Text style={styles.captionHeaderTitle}>New Post</Text>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 100 }}>
            {/* Photo thumbnail */}
            {photoUri ? (
              <Image
                source={{ uri: photoUri }}
                style={{ width: '100%', height: 200, borderRadius: 12 }}
                resizeMode="cover"
              />
            ) : null}

            {/* Oryx card preview */}
            {oryxCardData && (
              <OryxDataCardPreview data={oryxCardData} currentStats={currentStats} dashboard={dashboard} styles={styles} />
            )}

            {/* Caption input */}
            <View>
              <TextInput
                style={styles.captionInput}
                placeholder="Write a caption..."
                placeholderTextColor={theme.text.muted}
                value={caption}
                onChangeText={setCaption}
                multiline
                maxLength={2200}
              />
              <Text style={{ fontSize: 11, color: captionColor, textAlign: 'right', marginTop: 4 }}>
                {captionLen}/2200
              </Text>
            </View>

            {/* Sharing options */}
            <Text style={styles.sectionLabel}>SHARING OPTIONS</Text>

            {photoUri && (
              <View style={styles.optionRow}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.optionLabel}>Also share as Story</Text>
                  <Text style={styles.optionSubtitle}>Post will also appear in Stories</Text>
                </View>
                <Switch
                  value={alsoStory}
                  onValueChange={setAlsoStory}
                  trackColor={{ false: theme.border, true: theme.accent }}
                  thumbColor={alsoStory ? theme.accentInk : theme.text.muted}
                />
              </View>
            )}

            <TouchableOpacity style={styles.optionRow} onPress={() => setShowClubSheet(true)}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.optionLabel}>Tag a Club</Text>
                <Text style={styles.optionSubtitle}>
                  {selectedClub ? selectedClub.name : 'None selected'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.text.muted} />
            </TouchableOpacity>
          </ScrollView>

          {/* Share button */}
          <View style={[styles.shareFooter, { paddingBottom: insets.bottom + 16 }]}>
            <TouchableOpacity
              onPress={handlePost}
              disabled={uploading}
              style={[styles.shareBtn, uploading && { opacity: 0.6 }]}
            >
              {uploading ? (
                <ActivityIndicator color={theme.accentInk} />
              ) : (
                <Text style={{ color: theme.accentInk, fontFamily: TY.sans.bold, fontSize: 16 }}>Share</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Toast */}
          {toast.visible && (
            <View style={[styles.toast, { backgroundColor: toast.color }]}>
              <Text style={styles.toastText}>{toast.message}</Text>
            </View>
          )}

          {/* Club selector bottom sheet */}
          <Modal
            visible={showClubSheet}
            transparent
            animationType="slide"
            onRequestClose={() => setShowClubSheet(false)}
          >
            <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={() => setShowClubSheet(false)}>
              <TouchableOpacity activeOpacity={1} onPress={() => {}}>
                <View style={[styles.clubSheet, { paddingBottom: insets.bottom + 16 }]}>
                  <View style={styles.sheetHandle} />
                  <Text style={[styles.sheetTitle, { marginBottom: 12 }]}>Select Club</Text>
                  <TouchableOpacity
                    onPress={() => { setSelectedClubId(null); setShowClubSheet(false); }}
                    style={[styles.clubRow, !selectedClubId && styles.clubRowSelected]}
                  >
                    <Text style={{ color: theme.text.primary, fontSize: 14, fontFamily: TY.sans.regular }}>None</Text>
                    {!selectedClubId && <Ionicons name="checkmark" size={18} color={theme.accent} />}
                  </TouchableOpacity>
                  {clubs.map(c => (
                    <TouchableOpacity
                      key={c.id}
                      onPress={() => { setSelectedClubId(c.id); setShowClubSheet(false); }}
                      style={[styles.clubRow, selectedClubId === c.id && styles.clubRowSelected]}
                    >
                      <Text style={{ color: theme.text.primary, fontSize: 14, fontFamily: TY.sans.regular }}>{c.name}</Text>
                      {selectedClubId === c.id && <Ionicons name="checkmark" size={18} color={theme.accent} />}
                    </TouchableOpacity>
                  ))}
                </View>
              </TouchableOpacity>
            </TouchableOpacity>
          </Modal>
        </View>
      </Modal>
    );
  }

  return null;
}

function createStyles(t: ThemeColors) {
  return StyleSheet.create({
  sheetBackdrop: {
    flex: 1,
    backgroundColor: t.glass.shade,
    justifyContent: 'flex-end',
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: t.border,
    alignSelf: 'center', marginBottom: SP[3],
  },
  // Bottom-sheet container styled to match the Create menu / Post action sheet
  // the profile tab uses, so every bottom sheet in the app reads the same.
  typeSheet: {
    backgroundColor: t.glass.card,
    borderTopLeftRadius: R.lg,
    borderTopRightRadius: R.lg,
    paddingHorizontal: SP[5],
    paddingTop: SP[5],
    gap: SP[4],
  },
  sheetTitle: {
    fontSize: TY.size.h3 - 1,
    fontFamily: TY.sans.bold,
    color: t.text.primary,
    letterSpacing: TY.tracking.tight,
  },
  tileRow: {
    flexDirection: 'row', gap: SP[3],
  },
  tile: {
    flex: 1, height: 130,
    backgroundColor: t.bg.elevated,
    borderRadius: R.md,
    borderWidth: 1, borderColor: t.border,
    alignItems: 'center', justifyContent: 'center', gap: SP[2],
    padding: SP[3],
  },
  tileSelected: {
    borderColor: t.accent,
    backgroundColor: t.accentDim,
  },
  tileName: {
    fontSize: TY.size.body,
    fontFamily: TY.sans.semibold,
    color: t.text.secondary,
    textAlign: 'center',
  },
  tileNameSelected: {
    color: t.text.primary,
  },
  tileSubtitle: {
    fontSize: TY.size.small,
    fontFamily: TY.sans.regular,
    color: t.text.muted,
    textAlign: 'center',
  },
  continueBtn: {
    backgroundColor: t.accent,
    borderRadius: R.sm,
    paddingVertical: SP[4],
    alignItems: 'center', justifyContent: 'center',
    marginTop: SP[1],
  },
  continueBtnDisabled: {
    opacity: 0.4,
  },
  continueBtnText: {
    fontFamily: TY.sans.bold,
    fontSize: TY.size.body + 2,
    color: t.accentInk,
    letterSpacing: TY.tracking.tight,
  },

  cameraBottomRow: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 32,
  },
  cameraIconBtn: {
    width: 52, height: 52,
    alignItems: 'center', justifyContent: 'center',
  },
  captureBtn: {
    width: 72, height: 72, borderRadius: 36,
    borderWidth: 4, borderColor: '#ffffff',
    backgroundColor: 'rgba(255,255,255,0.3)',
  },

  oryxSheet: {
    backgroundColor: t.bg.elevated,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, gap: 12,
  },
  cardTypeGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 12,
  },
  cardTypeTile: {
    width: (SCREEN_WIDTH - 40 - 12) / 2,
    backgroundColor: t.bg.elevated,
    borderRadius: 16, borderWidth: 1, borderColor: t.border,
    padding: 14, gap: 4, alignItems: 'flex-start' as const,
  },
  cardTypeTileSelected: {
    borderColor: t.accent,
    backgroundColor: t.accentDim,
  },
  cardTypeName: {
    fontSize: 13, fontFamily: TY.sans.semibold, color: t.text.secondary,
  },
  cardTypeSubtitle: {
    fontSize: 11, fontFamily: TY.sans.regular, color: t.text.muted,
  },

  oryxCard: {
    backgroundColor: t.bg.elevated,
    borderRadius: 16, borderWidth: 1, borderColor: t.border,
    padding: 16, gap: 8,
  },
  oryxCardLabel: {
    fontSize: 9, color: t.text.muted, letterSpacing: 2,
    textTransform: 'uppercase' as const, fontFamily: TY.mono.semibold,
  },
  oryxCardTitle: {
    fontSize: 16, fontFamily: TY.sans.bold, color: t.text.primary,
  },
  oryxCardRow: {
    flexDirection: 'row' as const, gap: 16,
  },
  oryxStat: {
    alignItems: 'center' as const, gap: 2,
  },
  oryxStatVal: {
    fontSize: 18, fontFamily: TY.sans.bold, color: t.text.primary,
  },
  oryxStatLabel: {
    fontSize: 10, color: t.text.muted, textTransform: 'uppercase' as const, fontFamily: TY.mono.regular,
  },
  oryxCardBody: {
    fontSize: 13, color: t.text.secondary, lineHeight: 20, fontFamily: TY.sans.regular,
  },
  oryxTagRow: {
    flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 6,
  },
  oryxTag: {
    backgroundColor: t.glass.pill, borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: t.glass.border,
  },
  oryxTagText: {
    fontSize: 11, color: t.text.secondary, fontFamily: TY.sans.regular,
  },

  captionHeader: {
    flexDirection: 'row' as const, alignItems: 'center' as const,
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: t.border,
  },
  captionHeaderTitle: {
    flex: 1, textAlign: 'center' as const,
    fontSize: 16, fontFamily: TY.sans.bold, color: t.text.primary,
  },
  captionInput: {
    backgroundColor: t.bg.elevated, borderRadius: 12,
    borderWidth: 1, borderColor: t.border,
    paddingHorizontal: 14, paddingVertical: 10,
    color: t.text.primary, fontSize: 14, minHeight: 80,
    fontFamily: TY.sans.regular,
  },
  sectionLabel: {
    fontSize: 10, color: t.text.muted, letterSpacing: 2,
    textTransform: 'uppercase' as const, fontFamily: TY.mono.semibold,
  },
  optionRow: {
    flexDirection: 'row' as const, alignItems: 'center' as const,
    backgroundColor: t.bg.elevated, borderRadius: 12,
    borderWidth: 1, borderColor: t.border,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  optionLabel: {
    fontSize: 14, color: t.text.primary, fontFamily: TY.sans.semibold,
  },
  optionSubtitle: {
    fontSize: 12, color: t.text.muted, fontFamily: TY.sans.regular,
  },
  shareFooter: {
    position: 'absolute' as const, bottom: 0, left: 0, right: 0,
    paddingHorizontal: 16, paddingTop: 12,
    backgroundColor: t.bg.primary,
    borderTopWidth: 1, borderTopColor: t.border,
  },
  shareBtn: {
    backgroundColor: t.accent, borderRadius: 24,
    height: 52, alignItems: 'center' as const, justifyContent: 'center' as const,
  },
  toast: {
    position: 'absolute' as const, bottom: 80, alignSelf: 'center' as const,
    paddingHorizontal: 16, paddingVertical: 12,
    borderRadius: 24, zIndex: 999,
  },
  toastText: {
    color: t.text.primary, fontSize: 14, fontFamily: TY.sans.semibold,
  },
  clubSheet: {
    backgroundColor: t.bg.elevated,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, gap: 4,
    borderWidth: 1, borderColor: t.border,
  },
  clubRow: {
    flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const,
    paddingVertical: 12, paddingHorizontal: 8,
    borderRadius: 8,
  },
  clubRowSelected: {
    backgroundColor: t.accentDim,
  },
  });
}
