import { useCallback, useEffect, useRef, useState } from 'react';
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

function OryxDataCardPreview({ data, currentStats, dashboard }: { data: any; currentStats?: any; dashboard?: any }) {
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
          <Ionicons name="trophy" size={36} color="#e0e0e0" />
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
                >
                  <Ionicons name="camera-outline" size={32} color={wantsPhoto ? '#f0f0f0' : '#888888'} />
                  <Text style={[styles.tileName, wantsPhoto && styles.tileNameSelected]}>Photo Post</Text>
                  <Text style={styles.tileSubtitle}>Post a photo</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => { setWantsOryx(true); setWantsPhoto(false); }}
                  style={[styles.tile, wantsOryx && styles.tileSelected]}
                >
                  <Ionicons name="stats-chart-outline" size={32} color={wantsOryx ? '#f0f0f0' : '#888888'} />
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
              >
                <Text style={{ color: '#000000', fontWeight: '700', fontSize: 16 }}>Continue</Text>
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
              <Ionicons name="camera" size={64} color="#555555" />
              <Text style={{ color: '#888888', fontSize: 15 }}>Choose a photo</Text>
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
                  <Ionicons name="arrow-back" size={22} color="#888888" />
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
                    <Ionicons name={ct.icon} size={28} color={selectedCardType === ct.key ? '#f0f0f0' : '#888888'} />
                    <Text style={[styles.cardTypeName, selectedCardType === ct.key && { color: '#f0f0f0' }]}>{ct.label}</Text>
                    <Text style={styles.cardTypeSubtitle}>{ct.subtitle}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Preview */}
              {oryxCardData && (
                <OryxDataCardPreview data={oryxCardData} currentStats={currentStats} dashboard={dashboard} />
              )}

              <TouchableOpacity
                onPress={() => setStep('caption')}
                disabled={!selectedCardType}
                style={[styles.continueBtn, !selectedCardType && styles.continueBtnDisabled]}
              >
                <Text style={{ color: '#000000', fontWeight: '700', fontSize: 16 }}>Done</Text>
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
    const captionColor = captionLen >= 2200 ? '#c0392b' : captionLen >= 2000 ? '#e67e22' : '#888888';
    const selectedClub = clubs.find(c => c.id === selectedClubId);

    return (
      <Modal visible animationType="slide" onRequestClose={() => {
        if (wantsOryx) setStep('oryx-card');
        else if (wantsPhoto) setStep('camera');
        else setStep('type-select');
      }}>
        <View style={{ flex: 1, backgroundColor: '#0a0a0a' }}>
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
              <Ionicons name="arrow-back" size={24} color="#f0f0f0" />
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
              <OryxDataCardPreview data={oryxCardData} currentStats={currentStats} dashboard={dashboard} />
            )}

            {/* Caption input */}
            <View>
              <TextInput
                style={styles.captionInput}
                placeholder="Write a caption..."
                placeholderTextColor="#555555"
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
                  trackColor={{ false: '#2a2a2a', true: '#555555' }}
                  thumbColor={alsoStory ? '#f0f0f0' : '#888888'}
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
              <Ionicons name="chevron-forward" size={18} color="#555555" />
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
                <ActivityIndicator color="#000000" />
              ) : (
                <Text style={{ color: '#000000', fontWeight: '700', fontSize: 16 }}>Share</Text>
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
                    <Text style={{ color: '#f0f0f0', fontSize: 14 }}>None</Text>
                    {!selectedClubId && <Ionicons name="checkmark" size={18} color="#f0f0f0" />}
                  </TouchableOpacity>
                  {clubs.map(c => (
                    <TouchableOpacity
                      key={c.id}
                      onPress={() => { setSelectedClubId(c.id); setShowClubSheet(false); }}
                      style={[styles.clubRow, selectedClubId === c.id && styles.clubRowSelected]}
                    >
                      <Text style={{ color: '#f0f0f0', fontSize: 14 }}>{c.name}</Text>
                      {selectedClubId === c.id && <Ionicons name="checkmark" size={18} color="#f0f0f0" />}
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

const styles = StyleSheet.create({
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheetHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: '#2a2a2a',
    alignSelf: 'center', marginBottom: 16,
  },
  typeSheet: {
    backgroundColor: '#0a0a0a',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, gap: 16,
  },
  sheetTitle: {
    fontSize: 16, fontWeight: '700', color: '#f0f0f0',
  },
  tileRow: {
    flexDirection: 'row', gap: 12,
  },
  tile: {
    flex: 1, height: 120,
    backgroundColor: '#1a1a1a',
    borderRadius: 16, borderWidth: 1, borderColor: '#2a2a2a',
    alignItems: 'center', justifyContent: 'center', gap: 6,
    padding: 12,
  },
  tileSelected: {
    borderColor: '#ffffff',
  },
  tileName: {
    fontSize: 13, fontWeight: '700', color: '#888888', textAlign: 'center',
  },
  tileNameSelected: {
    color: '#f0f0f0',
  },
  tileSubtitle: {
    fontSize: 11, color: '#555555', textAlign: 'center',
  },
  continueBtn: {
    backgroundColor: '#ffffff', borderRadius: 24,
    height: 52, alignItems: 'center', justifyContent: 'center',
    marginTop: 4,
  },
  continueBtnDisabled: {
    opacity: 0.4,
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
    backgroundColor: '#0a0a0a',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, gap: 12,
  },
  cardTypeGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 12,
  },
  cardTypeTile: {
    width: (SCREEN_WIDTH - 40 - 12) / 2,
    backgroundColor: '#1a1a1a',
    borderRadius: 16, borderWidth: 1, borderColor: '#2a2a2a',
    padding: 14, gap: 4, alignItems: 'flex-start',
  },
  cardTypeTileSelected: {
    borderColor: '#ffffff',
  },
  cardTypeName: {
    fontSize: 13, fontWeight: '700', color: '#888888',
  },
  cardTypeSubtitle: {
    fontSize: 11, color: '#555555',
  },

  oryxCard: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16, borderWidth: 1, borderColor: '#2a2a2a',
    padding: 16, gap: 8,
  },
  oryxCardLabel: {
    fontSize: 9, color: '#555555', letterSpacing: 2,
    textTransform: 'uppercase', fontWeight: '700',
  },
  oryxCardTitle: {
    fontSize: 16, fontWeight: '700', color: '#f0f0f0',
  },
  oryxCardRow: {
    flexDirection: 'row', gap: 16,
  },
  oryxStat: {
    alignItems: 'center', gap: 2,
  },
  oryxStatVal: {
    fontSize: 18, fontWeight: '700', color: '#f0f0f0',
  },
  oryxStatLabel: {
    fontSize: 10, color: '#555555', textTransform: 'uppercase',
  },
  oryxCardBody: {
    fontSize: 13, color: '#888888', lineHeight: 20,
  },
  oryxTagRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6,
  },
  oryxTag: {
    backgroundColor: '#2a2a2a', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  oryxTagText: {
    fontSize: 11, color: '#888888',
  },

  captionHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#2a2a2a',
  },
  captionHeaderTitle: {
    flex: 1, textAlign: 'center',
    fontSize: 16, fontWeight: '700', color: '#f0f0f0',
  },
  captionInput: {
    backgroundColor: '#1a1a1a', borderRadius: 12,
    borderWidth: 1, borderColor: '#2a2a2a',
    paddingHorizontal: 14, paddingVertical: 10,
    color: '#f0f0f0', fontSize: 14, minHeight: 80,
  },
  sectionLabel: {
    fontSize: 10, color: '#555555', letterSpacing: 2,
    textTransform: 'uppercase', fontWeight: '700',
  },
  optionRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#1a1a1a', borderRadius: 12,
    borderWidth: 1, borderColor: '#2a2a2a',
    paddingHorizontal: 14, paddingVertical: 12,
  },
  optionLabel: {
    fontSize: 14, color: '#f0f0f0', fontWeight: '600',
  },
  optionSubtitle: {
    fontSize: 12, color: '#555555',
  },
  shareFooter: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 16, paddingTop: 12,
    backgroundColor: '#0a0a0a',
    borderTopWidth: 1, borderTopColor: '#2a2a2a',
  },
  shareBtn: {
    backgroundColor: '#ffffff', borderRadius: 24,
    height: 52, alignItems: 'center', justifyContent: 'center',
  },
  toast: {
    position: 'absolute', bottom: 80, alignSelf: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderRadius: 24, zIndex: 999,
  },
  toastText: {
    color: '#ffffff', fontSize: 14, fontWeight: '600',
  },
  clubSheet: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, gap: 4,
  },
  clubRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12, paddingHorizontal: 8,
    borderRadius: 8,
  },
  clubRowSelected: {
    backgroundColor: '#2a2a2a',
  },
});
