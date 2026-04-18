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
  PanResponder,
  Animated,
  StyleSheet,
  Alert,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { createStory, createPost, uploadMedia } from '@/services/api';

const { width: W, height: H } = Dimensions.get('window');

// Try to load CameraView — may not be available on all SDK versions
let CameraView: any = null;
let useCameraPermissions: any = null;
try {
  const expoCam = require('expo-camera');
  CameraView = expoCam.CameraView;
  useCameraPermissions = expoCam.useCameraPermissions;
} catch {
  CameraView = null;
}

interface CurrentStats {
  readiness?: number;
  steps?: number;
  calories?: number;
  calories_target?: number;
  training_load?: number;
  readiness_color?: string;
  readiness_label?: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onStoryCreated: () => void;
  currentStats?: CurrentStats;
}

type Step = 'camera' | 'editor';
type CameraFacing = 'front' | 'back';

const ZOOM_LEVELS = [
  { label: '0.5x', value: 0 },
  { label: '1x', value: 0 },
  { label: '2x', value: 0.5 },
];

export default function StoryCreator({ visible, onClose, onStoryCreated, currentStats }: Props) {
  const insets = useSafeAreaInsets();

  // Camera permissions — only used if CameraView is available
  const cameraPermHook = useCameraPermissions ? useCameraPermissions() : [null, null];
  const [cameraPermission, requestCameraPermission] = cameraPermHook;

  const [step, setStep] = useState<Step>('camera');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [cameraFacing, setCameraFacing] = useState<CameraFacing>('back');
  const cameraRef = useRef<any>(null);

  // Camera zoom state
  const [zoom, setZoom] = useState(0);
  const [activeZoomIdx, setActiveZoomIdx] = useState(1);
  const zoomIndicatorOpacity = useRef(new Animated.Value(0)).current;
  const zoomFadeTimer = useRef<any>(null);
  const lastPinchDistance = useRef<number | null>(null);

  // Editor state
  const [textInput, setTextInput] = useState('');
  const [textOverlay, setTextOverlay] = useState<string | null>(null);
  const [showTextInput, setShowTextInput] = useState(false);
  const [statsAdded, setStatsAdded] = useState(false);
  const [showStickerSheet, setShowStickerSheet] = useState(false);
  const [toolsCollapsed, setToolsCollapsed] = useState(false);
  const [showEffects, setShowEffects] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string>('none');
  const [isDraggingText, setIsDraggingText] = useState(false);
  const [isDraggingStats, setIsDraggingStats] = useState(false);

  // Sticker positions
  const textPos = useRef(new Animated.ValueXY({ x: W / 2 - 80, y: H * 0.3 })).current;
  const statsPos = useRef(new Animated.ValueXY({ x: 16, y: H * 0.65 })).current;
  const textPosValue = useRef({ x: W / 2 - 80, y: H * 0.3 });
  const statsPosValue = useRef({ x: 16, y: H * 0.65 });
  const [showTrash, setShowTrash] = useState(false);
  const [trashActive, setTrashActive] = useState(false);

  // Share state
  const [alsoPostToFeed, setAlsoPostToFeed] = useState(false);
  const [feedCaption, setFeedCaption] = useState('');
  const [uploading, setUploading] = useState(false);
  const [shareToStory, setShareToStory] = useState(true);

  useEffect(() => {
    if (visible) {
      setStep('camera');
      setPhotoUri(null);
      setTextOverlay(null);
      setTextInput('');
      setStatsAdded(false);
      setAlsoPostToFeed(false);
      setFeedCaption('');
      setZoom(0);
      setActiveZoomIdx(1);
      setActiveFilter('none');
      setShowEffects(false);
      setToolsCollapsed(false);
      setShareToStory(true);
    }
  }, [visible]);

  // PanResponder for text sticker
  const textPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        setIsDraggingText(true);
        setShowTrash(true);
        textPos.setOffset({ x: textPosValue.current.x, y: textPosValue.current.y });
        textPos.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event([null, { dx: textPos.x, dy: textPos.y }], { useNativeDriver: false }),
      onPanResponderRelease: (_, gs) => {
        textPos.flattenOffset();
        const newX = textPosValue.current.x + gs.dx;
        const newY = textPosValue.current.y + gs.dy;
        textPosValue.current = { x: newX, y: newY };
        setIsDraggingText(false);
        setShowTrash(false);
        // Check if dropped on trash zone (bottom 60px)
        if (newY > H - 60) {
          setTextOverlay(null);
          textPos.setValue({ x: W / 2 - 80, y: H * 0.3 });
          textPosValue.current = { x: W / 2 - 80, y: H * 0.3 };
        }
      },
    })
  ).current;

  // PanResponder for stats sticker
  const statsPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        setIsDraggingStats(true);
        setShowTrash(true);
        statsPos.setOffset({ x: statsPosValue.current.x, y: statsPosValue.current.y });
        statsPos.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event([null, { dx: statsPos.x, dy: statsPos.y }], { useNativeDriver: false }),
      onPanResponderRelease: (_, gs) => {
        statsPos.flattenOffset();
        const newX = statsPosValue.current.x + gs.dx;
        const newY = statsPosValue.current.y + gs.dy;
        statsPosValue.current = { x: newX, y: newY };
        setIsDraggingStats(false);
        setShowTrash(false);
        if (newY > H - 60) {
          setStatsAdded(false);
          statsPos.setValue({ x: 16, y: H * 0.65 });
          statsPosValue.current = { x: 16, y: H * 0.65 };
        }
      },
    })
  ).current;

  const showZoomIndicator = useCallback(() => {
    Animated.timing(zoomIndicatorOpacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    if (zoomFadeTimer.current) clearTimeout(zoomFadeTimer.current);
    zoomFadeTimer.current = setTimeout(() => {
      Animated.timing(zoomIndicatorOpacity, { toValue: 0, duration: 300, useNativeDriver: true }).start();
    }, 1500);
  }, [zoomIndicatorOpacity]);

  const handleZoomButton = useCallback((idx: number) => {
    setActiveZoomIdx(idx);
    setZoom(ZOOM_LEVELS[idx].value);
    showZoomIndicator();
  }, [showZoomIndicator]);

  const getPinchDistance = (touches: any[]) => {
    if (touches.length < 2) return null;
    const dx = touches[0].pageX - touches[1].pageX;
    const dy = touches[0].pageY - touches[1].pageY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const handlePinchMove = useCallback((evt: any) => {
    const touches = evt.nativeEvent.touches;
    if (touches.length < 2) {
      lastPinchDistance.current = null;
      return;
    }
    const dist = getPinchDistance(touches);
    if (dist === null) return;
    if (lastPinchDistance.current !== null) {
      const delta = dist - lastPinchDistance.current;
      setZoom(prev => {
        const next = Math.min(1, Math.max(0, prev + delta * 0.003));
        return next;
      });
      showZoomIndicator();
    }
    lastPinchDistance.current = dist;
  }, [showZoomIndicator]);

  const handlePinchEnd = useCallback(() => {
    lastPinchDistance.current = null;
  }, []);

  const takePicture = useCallback(async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.9 });
      setPhotoUri(photo.uri);
      setStep('editor');
    } catch {
      Alert.alert('Error', 'Could not take photo.');
    }
  }, []);

  const openGallery = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
    });
    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
      setStep('editor');
    }
  }, []);

  const openCameraViaImagePicker = useCallback(async () => {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
    });
    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
      setStep('editor');
    }
  }, []);

  const handleShare = useCallback(async () => {
    if (!photoUri) return;
    setUploading(true);
    try {
      const { url: photo_url } = await uploadMedia(photoUri, 720);

      const statsXRatio = statsAdded ? statsPosValue.current.x / W : undefined;
      const statsYRatio = statsAdded ? statsPosValue.current.y / H : undefined;

      const oryx_data_overlay_json = statsAdded && currentStats ? {
        ...currentStats,
        x_ratio: statsXRatio,
        y_ratio: statsYRatio,
      } : undefined;

      if (shareToStory) {
        await createStory({
          photo_url,
          text_overlay: textOverlay ?? undefined,
          oryx_data_overlay_json,
          caption: feedCaption.trim() ? feedCaption.trim() : undefined,
        });
      }

      if (alsoPostToFeed) {
        await createPost({
          photo_url,
          caption: feedCaption.trim() || undefined,
          also_shared_as_story: shareToStory,
        });
      }

      onStoryCreated();
    } catch {
      Alert.alert('Error', 'Failed to share story. Please try again.');
    } finally {
      setUploading(false);
    }
  }, [photoUri, textOverlay, statsAdded, currentStats, alsoPostToFeed, feedCaption, shareToStory, onStoryCreated]);

  if (!visible) return null;

  // ── Step: Camera ─────────────────────────────────────────────────────────────
  if (step === 'camera') {
    const hasCameraView = !!CameraView;

    return (
      <Modal visible animationType="slide" statusBarTranslucent onRequestClose={onClose}>
        <View style={{ flex: 1, backgroundColor: '#000000' }}>
          {/* Close button */}
          <TouchableOpacity
            onPress={onClose}
            style={{ position: 'absolute', top: insets.top + 12, left: 16, zIndex: 20 }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close" size={28} color="#ffffff" />
          </TouchableOpacity>

          {hasCameraView ? (
            <>
              {!cameraPermission?.granted ? (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
                  <Text style={{ color: '#ffffff', fontSize: 15, textAlign: 'center', paddingHorizontal: 32 }}>
                    Camera access needed to take story photos
                  </Text>
                  <TouchableOpacity
                    onPress={requestCameraPermission}
                    style={{ backgroundColor: '#ffffff', borderRadius: 24, paddingHorizontal: 24, paddingVertical: 12 }}
                  >
                    <Text style={{ color: '#000000', fontWeight: '700', fontSize: 15 }}>Allow Camera</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={openGallery} style={{ marginTop: 8 }}>
                    <Text style={{ color: '#888888', fontSize: 14 }}>Or choose from gallery</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View
                  style={{ flex: 1 }}
                  onStartShouldSetResponder={() => true}
                  onMoveShouldSetResponder={() => true}
                  onResponderMove={handlePinchMove}
                  onResponderRelease={handlePinchEnd}
                  onResponderTerminate={handlePinchEnd}
                >
                  <CameraView
                    ref={cameraRef}
                    style={{ flex: 1 }}
                    facing={cameraFacing}
                    zoom={zoom}
                  />
                </View>
              )}
            </>
          ) : (
            // Fallback: no live camera, just show options
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 20 }}>
              <Ionicons name="camera" size={64} color="#555555" />
              <Text style={{ color: '#888888', fontSize: 15 }}>Choose a photo</Text>
            </View>
          )}

          {/* Zoom indicator pill */}
          {hasCameraView && cameraPermission?.granted && (
            <Animated.View
              pointerEvents="none"
              style={{
                position: 'absolute',
                bottom: insets.bottom + 24 + 52 + 40 + 12,
                left: 0, right: 0,
                alignItems: 'center',
                zIndex: 25,
                opacity: zoomIndicatorOpacity,
              }}
            >
              <View style={{
                backgroundColor: 'rgba(0,0,0,0.65)',
                borderRadius: 20,
                paddingHorizontal: 14, paddingVertical: 6,
              }}>
                <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 14 }}>
                  {ZOOM_LEVELS[activeZoomIdx]?.label ?? `${(zoom * 2 + 1).toFixed(1)}x`}
                </Text>
              </View>
            </Animated.View>
          )}

          {/* Zoom buttons row */}
          {hasCameraView && cameraPermission?.granted && (
            <View style={{
              position: 'absolute',
              bottom: insets.bottom + 24 + 52 + 8,
              left: 0, right: 0,
              alignItems: 'center',
              zIndex: 22,
            }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {ZOOM_LEVELS.map((level, idx) => (
                  <TouchableOpacity
                    key={idx}
                    onPress={() => handleZoomButton(idx)}
                    style={{
                      paddingHorizontal: 14, paddingVertical: 7,
                      borderRadius: 20,
                      backgroundColor: activeZoomIdx === idx ? '#ffffff' : 'rgba(0,0,0,0.55)',
                      borderWidth: activeZoomIdx === idx ? 0 : 1,
                      borderColor: 'rgba(255,255,255,0.3)',
                    }}
                  >
                    <Text style={{
                      fontSize: 13, fontWeight: '700',
                      color: activeZoomIdx === idx ? '#000000' : 'rgba(255,255,255,0.7)',
                    }}>
                      {level.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Bottom row */}
          <View style={[styles.cameraBottomRow, { paddingBottom: insets.bottom + 24 }]}>
            {/* Gallery */}
            <TouchableOpacity onPress={openGallery} style={styles.cameraIconBtn}>
              <Ionicons name="images-outline" size={26} color="#ffffff" />
            </TouchableOpacity>

            {/* Capture / take */}
            {hasCameraView && cameraPermission?.granted ? (
              <TouchableOpacity onPress={takePicture} style={styles.captureBtn} />
            ) : (
              <TouchableOpacity onPress={openCameraViaImagePicker} style={styles.captureBtn} />
            )}

            {/* Flip */}
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

  // ── Step: Editor ─────────────────────────────────────────────────────────────
  if (step === 'editor' && photoUri) {
    const filterOverlayColor: Record<string, string | null> = {
      none: null,
      dark: 'rgba(0,0,0,0.3)',
      warm: 'rgba(255,160,50,0.2)',
      cool: 'rgba(50,100,255,0.2)',
      fade: 'rgba(255,255,255,0.2)',
      vivid: null,
    };
    const filterColor = filterOverlayColor[activeFilter] ?? null;

    const FILTERS = ['none', 'dark', 'warm', 'cool', 'fade', 'vivid'];

    return (
      <Modal visible animationType="fade" statusBarTranslucent onRequestClose={() => setStep('camera')}>
        <View style={{ flex: 1, backgroundColor: '#000000' }}>
          {/* Full-bleed photo */}
          <Image source={{ uri: photoUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />

          {/* Filter color overlay */}
          {filterColor && (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: filterColor, zIndex: 1 }]} pointerEvents="none" />
          )}

          {/* Top-left: Close button */}
          <TouchableOpacity
            onPress={() => setStep('camera')}
            style={{
              position: 'absolute',
              top: insets.top + 12,
              left: 16,
              zIndex: 30,
              width: 40, height: 40, borderRadius: 20,
              backgroundColor: 'rgba(0,0,0,0.5)',
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Ionicons name="close" size={22} color="#ffffff" />
          </TouchableOpacity>

          {/* Top center: Readiness pill */}
          {currentStats?.readiness != null && (
            <View style={{
              position: 'absolute',
              top: insets.top + 18,
              left: 0, right: 0,
              alignItems: 'center',
              zIndex: 30,
            }} pointerEvents="box-none">
              <TouchableOpacity
                onPress={() => setStatsAdded(v => !v)}
                style={{
                  backgroundColor: 'rgba(0,0,0,0.55)',
                  borderRadius: 20,
                  paddingHorizontal: 14, paddingVertical: 6,
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                }}
              >
                <Text style={{ color: currentStats.readiness_color || '#ffffff', fontWeight: '700', fontSize: 14 }}>
                  {currentStats.readiness}
                </Text>
                <Text style={{ color: '#ffffff', fontSize: 13 }}>
                  {currentStats.readiness_label || 'Readiness'}
                </Text>
                {statsAdded && <Ionicons name="checkmark-circle" size={14} color="#27ae60" />}
              </TouchableOpacity>
            </View>
          )}

          {/* Top right: Tool column */}
          <View style={{
            position: 'absolute', right: 12, top: insets.top + 70,
            zIndex: 30, gap: 12,
          }}>
            {!toolsCollapsed && (
              <>
                <TouchableOpacity
                  onPress={() => setShowTextInput(true)}
                  style={styles.toolBtn}
                >
                  <Ionicons name="text-outline" size={22} color="#ffffff" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setShowStickerSheet(true)}
                  style={styles.toolBtn}
                >
                  <Ionicons name="happy-outline" size={22} color="#ffffff" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setShowEffects(v => !v)}
                  style={[styles.toolBtn, showEffects && { borderColor: '#ffffff', borderWidth: 2 }]}
                >
                  <Ionicons name="sparkles-outline" size={22} color="#ffffff" />
                </TouchableOpacity>
              </>
            )}
            <TouchableOpacity
              onPress={() => setToolsCollapsed(v => !v)}
              style={styles.toolBtn}
            >
              <Ionicons name={toolsCollapsed ? 'chevron-down-outline' : 'chevron-up-outline'} size={22} color="#ffffff" />
            </TouchableOpacity>
          </View>

          {/* Draggable text overlay */}
          {textOverlay ? (
            <Animated.View
              style={[styles.draggableSticker, { transform: textPos.getTranslateTransform() }]}
              {...textPan.panHandlers}
            >
              <Text style={styles.stickerText}>{textOverlay}</Text>
            </Animated.View>
          ) : null}

          {/* Draggable stats sticker */}
          {statsAdded && currentStats ? (
            <Animated.View
              style={[styles.draggableSticker, { transform: statsPos.getTranslateTransform() }]}
              {...statsPan.panHandlers}
            >
              <View style={styles.statsPill}>
                {currentStats.readiness != null && (
                  <Text style={[styles.statsReadiness, { color: currentStats.readiness_color || '#e0e0e0' }]}>
                    {currentStats.readiness}
                    <Text style={{ fontSize: 12, color: '#888888', fontWeight: '400' }}> {currentStats.readiness_label || ''}</Text>
                  </Text>
                )}
                <View style={styles.statsRow}>
                  {currentStats.steps != null && (
                    <Text style={styles.statText}>👟 {currentStats.steps.toLocaleString()}</Text>
                  )}
                  {currentStats.calories != null && (
                    <Text style={styles.statText}>
                      🔥 {currentStats.calories}{currentStats.calories_target ? `/${currentStats.calories_target}` : ''} kcal
                    </Text>
                  )}
                  {currentStats.training_load != null && (
                    <Text style={styles.statText}>⚡ {currentStats.training_load} load</Text>
                  )}
                </View>
              </View>
            </Animated.View>
          ) : null}

          {/* Trash zone */}
          {showTrash && (
            <View style={styles.trashZone}>
              <Ionicons name="trash-outline" size={24} color="#ffffff" />
            </View>
          )}

          {/* Effects filter row */}
          {showEffects && (
            <View style={{
              position: 'absolute',
              bottom: insets.bottom + 8 + 40 + 12 + 44 + 12 + 8,
              left: 16, right: 16,
              zIndex: 28,
            }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  {FILTERS.map((f) => (
                    <TouchableOpacity
                      key={f}
                      onPress={() => setActiveFilter(f)}
                      style={{ alignItems: 'center', gap: 4 }}
                    >
                      <View style={{
                        width: 48, height: 48, borderRadius: 24,
                        backgroundColor: filterOverlayColor[f] ?? 'rgba(255,255,255,0.15)',
                        borderWidth: activeFilter === f ? 2 : 1,
                        borderColor: activeFilter === f ? '#ffffff' : 'rgba(255,255,255,0.3)',
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        {f === 'none' && <Ionicons name="close" size={16} color="#ffffff" />}
                      </View>
                      <Text style={{ color: '#ffffff', fontSize: 10, textTransform: 'capitalize' }}>{f}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>
          )}

          {/* Bottom: Caption + share row */}
          <View style={{
            position: 'absolute',
            bottom: insets.bottom + 8,
            left: 16, right: 16,
            zIndex: 30,
            gap: 12,
          }}>
            {/* Caption input + share arrow */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <TextInput
                style={{
                  flex: 1,
                  backgroundColor: 'rgba(0,0,0,0.5)',
                  borderRadius: 20, height: 40,
                  paddingHorizontal: 14,
                  color: '#ffffff', fontSize: 14,
                }}
                placeholder="Add a caption..."
                placeholderTextColor="rgba(255,255,255,0.5)"
                value={feedCaption}
                onChangeText={setFeedCaption}
              />
              <TouchableOpacity
                onPress={handleShare}
                disabled={uploading}
                style={{
                  width: 52, height: 52, borderRadius: 26,
                  backgroundColor: uploading ? 'rgba(255,255,255,0.5)' : '#ffffff',
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                {uploading
                  ? <ActivityIndicator color="#000000" size="small" />
                  : <Ionicons name="arrow-forward" size={24} color="#000000" />
                }
              </TouchableOpacity>
            </View>

            {/* Share destination buttons */}
            <View style={{ flexDirection: 'row', gap: 16 }}>
              <TouchableOpacity
                onPress={() => setShareToStory(v => !v)}
                style={{ alignItems: 'center', gap: 4 }}
              >
                <View style={{
                  width: 44, height: 44, borderRadius: 22,
                  borderWidth: 2,
                  borderColor: shareToStory ? '#ffffff' : 'rgba(255,255,255,0.4)',
                  backgroundColor: 'rgba(0,0,0,0.5)',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Ionicons name="person-circle-outline" size={24} color="#ffffff" />
                  {shareToStory && (
                    <View style={{ position: 'absolute', bottom: -2, right: -2, backgroundColor: '#27ae60', borderRadius: 8, width: 16, height: 16, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="checkmark" size={10} color="#ffffff" />
                    </View>
                  )}
                </View>
                <Text style={{ color: '#ffffff', fontSize: 11 }}>Your Story</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Text input overlay */}
          {showTextInput && (
            <View style={styles.textInputOverlay}>
              <TextInput
                style={styles.stickerTextInput}
                value={textInput}
                onChangeText={setTextInput}
                placeholder="Add text..."
                placeholderTextColor="rgba(255,255,255,0.5)"
                autoFocus
                multiline
              />
              <TouchableOpacity
                onPress={() => {
                  setTextOverlay(textInput.trim() || null);
                  setShowTextInput(false);
                }}
                style={styles.confirmTextBtn}
              >
                <Text style={{ color: '#000000', fontWeight: '700', fontSize: 15 }}>OK</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Sticker bottom sheet */}
          {showStickerSheet && (
            <TouchableOpacity
              style={styles.sheetOverlay}
              activeOpacity={1}
              onPress={() => setShowStickerSheet(false)}
            >
              <TouchableOpacity activeOpacity={1} onPress={() => {}}>
                <View style={[styles.statsSheet, { paddingBottom: insets.bottom + 24 }]}>
                  <Text style={styles.sheetTitle}>STICKERS</Text>

                  {/* ORYX Stats card sticker */}
                  {currentStats && (
                    <>
                      <Text style={[styles.sheetTitle, { marginTop: 4 }]}>ORYX STATS</Text>
                      <TouchableOpacity
                        onPress={() => { setStatsAdded(true); setShowStickerSheet(false); }}
                        style={styles.sheetStatsPill}
                      >
                        {currentStats.readiness != null && (
                          <Text style={[styles.statsReadiness, { color: currentStats.readiness_color || '#e0e0e0' }]}>
                            {currentStats.readiness}
                            <Text style={{ fontSize: 12, color: '#888888', fontWeight: '400' }}>  {currentStats.readiness_label || ''}</Text>
                          </Text>
                        )}
                        <View style={styles.statsRow}>
                          {currentStats.steps != null && (
                            <Text style={styles.statText}>👟 {currentStats.steps.toLocaleString()}</Text>
                          )}
                          {currentStats.calories != null && (
                            <Text style={styles.statText}>
                              🔥 {currentStats.calories}{currentStats.calories_target ? `/${currentStats.calories_target}` : ''} kcal
                            </Text>
                          )}
                          {currentStats.training_load != null && (
                            <Text style={styles.statText}>⚡ {currentStats.training_load} load</Text>
                          )}
                        </View>
                      </TouchableOpacity>
                    </>
                  )}

                  {/* Text stickers */}
                  <Text style={[styles.sheetTitle, { marginTop: 8 }]}>TEXT STICKERS</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={{ flexDirection: 'row', gap: 8, paddingVertical: 4 }}>
                      {['Rest Day', 'PR Day', 'Cheat Day', 'Leg Day', 'Game Day', 'Race Day', 'Recovery'].map((label) => (
                        <TouchableOpacity
                          key={label}
                          onPress={() => {
                            setTextOverlay(label);
                            setShowStickerSheet(false);
                          }}
                          style={{
                            backgroundColor: '#2a2a2a', borderRadius: 20,
                            paddingHorizontal: 14, paddingVertical: 8,
                            borderWidth: 1, borderColor: '#3a3a3a',
                          }}
                        >
                          <Text style={{ color: '#f0f0f0', fontSize: 13, fontWeight: '600' }}>{label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>
                </View>
              </TouchableOpacity>
            </TouchableOpacity>
          )}
        </View>
      </Modal>
    );
  }

  return null;
}

const styles = StyleSheet.create({
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
  toolBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  draggableSticker: {
    position: 'absolute', zIndex: 15,
  },
  stickerText: {
    fontSize: 22, fontWeight: '700', color: '#ffffff',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4,
  },
  statsPill: {
    backgroundColor: 'rgba(0,0,0,0.80)',
    borderRadius: 12, padding: 12, minWidth: 140,
  },
  statsReadiness: {
    fontSize: 22, fontWeight: '700', marginBottom: 4,
  },
  statsRow: {
    gap: 4,
  },
  statText: {
    fontSize: 12, color: '#e0e0e0',
  },
  trashZone: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: 60,
    backgroundColor: 'rgba(192,57,43,0.5)',
    alignItems: 'center', justifyContent: 'center', zIndex: 16,
  },
  textInputOverlay: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center',
    zIndex: 30, padding: 24, gap: 16,
  },
  stickerTextInput: {
    width: '100%', minHeight: 60,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12,
    fontSize: 20, fontWeight: '700', color: '#ffffff',
    textAlign: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
  },
  confirmTextBtn: {
    backgroundColor: '#ffffff', borderRadius: 24,
    paddingHorizontal: 32, paddingVertical: 12,
  },
  sheetOverlay: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 30,
    justifyContent: 'flex-end',
  },
  statsSheet: {
    backgroundColor: '#1a1a1a',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, gap: 16,
  },
  sheetTitle: {
    fontSize: 10, color: '#555555', letterSpacing: 2,
    textTransform: 'uppercase', fontWeight: '700',
  },
  sheetStatsPill: {
    backgroundColor: '#0a0a0a',
    borderRadius: 12, padding: 12,
  },
});
