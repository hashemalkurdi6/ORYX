import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Modal,
  Animated,
  PanResponder,
  Dimensions,
  Image,
  TextInput,
  StyleSheet,
  Alert,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StoryGroup, StoryItem, getStory, toggleReaction } from '@/services/api';

const { width: W, height: H } = Dimensions.get('window');
const STORY_DURATION = 5000; // ms per story

interface StoryViewerProps {
  visible: boolean;
  groups: StoryGroup[];
  initialGroupIndex: number;
  currentUserId: string;
  onClose: () => void;
  onMarkSeen: (storyId: string, groupUserId: string) => void;
  onDelete?: (storyId: string) => void;
  onProfilePress?: (userId: string) => void;
}

export default function StoryViewer({
  visible,
  groups,
  initialGroupIndex,
  currentUserId,
  onClose,
  onMarkSeen,
  onDelete,
  onProfilePress,
}: StoryViewerProps) {
  const insets = useSafeAreaInsets();
  const [groupIdx, setGroupIdx] = useState(initialGroupIndex);
  const [storyIdx, setStoryIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [myReactions, setMyReactions] = useState<Record<string, string[]>>({});

  const progressAnim = useRef(new Animated.Value(0)).current;
  const progressRef = useRef<Animated.CompositeAnimation | null>(null);
  const slideAnim = useRef(new Animated.Value(0)).current; // 0 = normal, positive = sliding down

  const currentGroup = groups[groupIdx];
  const currentStory = currentGroup?.stories[storyIdx];

  // Safely access readiness_color from story's oryx_data_overlay_json
  const readinessColor = currentStory?.oryx_data_overlay_json?.readiness_color ?? '#555555';

  // Reset when viewer opens
  useEffect(() => {
    if (visible) {
      setGroupIdx(initialGroupIndex);
      setStoryIdx(0);
    }
  }, [visible, initialGroupIndex]);

  // Start/restart progress bar animation
  const startProgress = useCallback(() => {
    progressAnim.setValue(0);
    progressRef.current?.stop();
    progressRef.current = Animated.timing(progressAnim, {
      toValue: 1,
      duration: STORY_DURATION,
      useNativeDriver: false,
    });
    progressRef.current.start(({ finished }) => {
      if (finished) advance();
    });
  }, [groupIdx, storyIdx, groups]);

  const stopProgress = useCallback(() => {
    progressRef.current?.stop();
  }, []);

  // Mark story as seen
  useEffect(() => {
    if (!visible || !currentStory) return;
    if (currentStory.user_id !== currentUserId) {
      getStory(currentStory.id).catch(() => {});
      onMarkSeen(currentStory.id, currentGroup.user_id);
    }
    startProgress();
    return () => stopProgress();
  }, [visible, groupIdx, storyIdx]);

  // Pause when paused
  useEffect(() => {
    if (paused) {
      stopProgress();
    } else if (visible) {
      startProgress();
    }
  }, [paused]);

  const advance = useCallback(() => {
    const group = groups[groupIdx];
    if (!group) return;
    if (storyIdx < group.stories.length - 1) {
      setStoryIdx(s => s + 1);
    } else if (groupIdx < groups.length - 1) {
      setGroupIdx(g => g + 1);
      setStoryIdx(0);
    } else {
      onClose();
    }
  }, [groupIdx, storyIdx, groups, onClose]);

  const goBack = useCallback(() => {
    if (storyIdx > 0) {
      setStoryIdx(s => s - 1);
    } else if (groupIdx > 0) {
      setGroupIdx(g => g - 1);
      setStoryIdx(0);
    }
  }, [groupIdx, storyIdx]);

  // Swipe down to close
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) => gs.dy > 15 && Math.abs(gs.dy) > Math.abs(gs.dx),
      onPanResponderGrant: () => setPaused(true),
      onPanResponderMove: Animated.event([null, { dy: slideAnim }], { useNativeDriver: false }),
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > 100) {
          Animated.timing(slideAnim, { toValue: H, duration: 200, useNativeDriver: false }).start(onClose);
        } else {
          Animated.spring(slideAnim, { toValue: 0, useNativeDriver: false }).start(() => setPaused(false));
        }
      },
    })
  ).current;

  const handleDelete = () => {
    if (!currentStory || !onDelete) return;
    stopProgress();
    Alert.alert('Delete Story', 'Remove this story? This can\'t be undone.', [
      { text: 'Cancel', style: 'cancel', onPress: () => { if (!paused) startProgress(); } },
      {
        text: 'Delete', style: 'destructive', onPress: () => {
          onDelete(currentStory.id);
        },
      },
    ]);
  };

  const handleReact = async (type: string) => {
    if (!currentStory) return;
    const storyId = currentStory.id;
    const postId = currentStory.source_post_id;
    if (!postId) return;
    try {
      await toggleReaction(postId, type);
      setMyReactions(prev => {
        const current = prev[storyId] || [];
        if (current.includes(type)) {
          return { ...prev, [storyId]: current.filter(r => r !== type) };
        }
        return { ...prev, [storyId]: [...current, type] };
      });
    } catch {}
  };

  if (!visible || !currentGroup || !currentStory) return null;

  const storyCount = currentGroup.stories.length;
  const hasMedia = !!currentStory.photo_url;

  // Readiness color tint for no-media backgrounds
  const bgTint = (readinessColor || '#555555') + '22';

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent>
      <Animated.View
        style={[styles.container, { transform: [{ translateY: slideAnim }] }]}
        {...panResponder.panHandlers}
      >
        {/* Background */}
        {hasMedia ? (
          <Image source={{ uri: currentStory.photo_url }} style={styles.media} resizeMode="cover" />
        ) : (
          <View style={[styles.media, { backgroundColor: '#0a0a0a' }]}>
            <View style={[styles.gradientOverlay, { backgroundColor: bgTint }]} />
          </View>
        )}

        {/* Dark vignette */}
        <View style={styles.vignette} />

        {/* Progress bars */}
        <View style={[styles.progressRow, { paddingTop: insets.top + 8 }]}>
          {currentGroup.stories.map((s, i) => {
            const isActive = i === storyIdx;
            const isDone = i < storyIdx;
            return (
              <View key={s.id} style={styles.progressTrack}>
                {isDone ? (
                  <View style={[styles.progressFill, { width: '100%' }]} />
                ) : isActive ? (
                  <Animated.View
                    style={[
                      styles.progressFill,
                      {
                        width: progressAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: ['0%', '100%'],
                        }),
                      },
                    ]}
                  />
                ) : null}
              </View>
            );
          })}
        </View>

        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + 16 + 10 }]}>
          <TouchableOpacity
            onPress={() => { setPaused(true); progressRef.current?.stop(); onProfilePress?.(currentGroup.user_id); }}
            style={styles.headerLeft}
            activeOpacity={0.8}
          >
            {currentGroup.avatar_url ? (
              <Image source={{ uri: currentGroup.avatar_url }} style={styles.headerAvatar} />
            ) : (
              <View style={styles.headerAvatarFallback}>
                <Text style={styles.headerAvatarInitials}>{currentGroup.initials}</Text>
              </View>
            )}
            <View>
              <Text style={styles.headerName}>{currentGroup.display_name}</Text>
              <Text style={styles.headerTime}>
                {formatTimeAgo(currentStory.created_at)}
              </Text>
            </View>
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            {currentStory.user_id === currentUserId && onDelete && (
              <TouchableOpacity onPress={handleDelete} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Ionicons name="ellipsis-horizontal" size={22} color="#ffffff" />
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="close" size={24} color="#ffffff" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Tap zones */}
        <View style={styles.tapRow} pointerEvents="box-none">
          <TouchableWithoutFeedback onPress={goBack} onPressIn={() => setPaused(true)} onPressOut={() => setPaused(false)}>
            <View style={styles.tapLeft} />
          </TouchableWithoutFeedback>
          <TouchableWithoutFeedback onPress={advance} onPressIn={() => setPaused(true)} onPressOut={() => setPaused(false)}>
            <View style={styles.tapRight} />
          </TouchableWithoutFeedback>
        </View>

        {/* Story overlays (absolutely positioned) */}
        <StoryOverlay story={currentStory} />

        {/* Caption area */}
        <View style={[styles.bottomArea, { paddingBottom: insets.bottom + 60 }]}>
          {currentStory.caption ? (
            <View style={styles.captionContainer}>
              <Text style={styles.caption}>{currentStory.caption}</Text>
            </View>
          ) : null}
        </View>

        {/* Reaction + reply bar */}
        <View style={[styles.reactionBar, { paddingBottom: insets.bottom + 8 }]}>
          <View style={styles.reactions}>
            {(['fire', 'muscle', 'heart'] as const).map((type) => {
              const emoji = type === 'fire' ? '🔥' : type === 'muscle' ? '💪' : '❤️';
              const reacted = (myReactions[currentStory.id] || []).includes(type);
              return (
                <TouchableOpacity key={type} onPress={() => handleReact(type)} style={styles.reactionBtn}>
                  <Text style={styles.reactionEmoji}>{emoji}</Text>
                  {reacted && <View style={styles.reactedDot} />}
                </TouchableOpacity>
              );
            })}
          </View>
          <TextInput
            style={styles.replyInput}
            placeholder={`Reply to ${currentGroup.display_name.split(' ')[0]}...`}
            placeholderTextColor="#555555"
            value={replyText}
            onChangeText={setReplyText}
            onFocus={() => setPaused(true)}
            onBlur={() => setPaused(false)}
          />
        </View>
      </Animated.View>
    </Modal>
  );
}

function StoryOverlay({ story }: { story: StoryItem }) {
  const oryx = story.oryx_data_overlay_json;
  const textOverlay = story.text_overlay;

  // Stats pill from oryx_data_overlay_json
  const statsPill = oryx ? (() => {
    const x = (oryx.x_ratio ?? 0.05) * W;
    const y = (oryx.y_ratio ?? 0.65) * H;
    const readiness = oryx.readiness ?? null;
    const steps = oryx.steps ?? 0;
    const calories = oryx.calories ?? 0;
    const target = oryx.calories_target ?? 0;
    const load = oryx.training_load ?? 0;
    const rColor = oryx.readiness_color ?? '#e0e0e0';
    const rLabel = oryx.readiness_label ??
      (readiness == null ? '' : readiness >= 70 ? 'GOOD TO TRAIN' : readiness >= 40 ? 'TAKE IT EASY' : 'REST DAY');

    return (
      <View style={[styles.statsPill, { position: 'absolute', left: x, top: y }]}>
        {readiness != null && (
          <View style={styles.overlayReadinessRow}>
            <Text style={[styles.overlayReadinessScore, { color: rColor }]}>{readiness}</Text>
            {rLabel ? <Text style={styles.overlayReadinessLabel}> — {rLabel}</Text> : null}
          </View>
        )}
        <View style={styles.overlayStatsRow}>
          {steps > 0 && <Text style={styles.overlayStat}>👟 {steps.toLocaleString()}</Text>}
          {calories > 0 && <Text style={styles.overlayStat}>🔥 {calories}{target > 0 ? `/${target}` : ''} kcal</Text>}
          {load > 0 && <Text style={styles.overlayStat}>⚡ {load} load</Text>}
        </View>
      </View>
    );
  })() : null;

  // Text overlay
  const textEl = textOverlay ? (
    <View style={styles.textOverlayContainer}>
      <Text style={styles.textOverlayText}>{textOverlay}</Text>
    </View>
  ) : null;

  if (!statsPill && !textEl) return null;

  return (
    <>
      {statsPill}
      {textEl}
    </>
  );
}

function formatTimeAgo(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  media: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  gradientOverlay: { flex: 1 },
  vignette: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  progressRow: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', paddingHorizontal: 8, gap: 3, zIndex: 10,
  },
  progressTrack: {
    flex: 1, height: 2, backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 1, overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: '#ffffff', borderRadius: 1 },
  header: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, zIndex: 10,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerAvatar: { width: 36, height: 36, borderRadius: 18 },
  headerAvatarFallback: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#2a2a2a', alignItems: 'center', justifyContent: 'center',
  },
  headerAvatarInitials: { fontSize: 14, fontWeight: '700', color: '#e0e0e0' },
  headerName: { fontSize: 14, fontWeight: '700', color: '#ffffff' },
  headerTime: { fontSize: 12, color: '#888888', marginTop: 1 },
  tapRow: {
    position: 'absolute', top: 100, left: 0, right: 0, bottom: 160,
    flexDirection: 'row', zIndex: 5,
  },
  tapLeft: { flex: 1 },
  tapRight: { flex: 1 },
  bottomArea: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: 16,
  },
  statsPill: {
    backgroundColor: 'rgba(0,0,0,0.80)',
    borderRadius: 12, padding: 12,
  },
  overlayReadinessRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  overlayReadinessScore: { fontSize: 26, fontWeight: '700' },
  overlayReadinessLabel: { fontSize: 12, color: '#888888', fontWeight: '600' },
  overlayStatsRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  overlayStat: { fontSize: 12, color: '#e0e0e0' },
  textOverlayContainer: {
    position: 'absolute',
    left: 0, right: 0,
    top: H * 0.3,
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  textOverlayText: {
    fontSize: 22, fontWeight: '700', color: '#ffffff',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  captionContainer: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
    marginBottom: 8,
  },
  caption: {
    fontSize: 14, fontStyle: 'italic', color: '#ffffff',
  },
  reactionBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, gap: 12,
  },
  reactions: { flexDirection: 'row', gap: 8 },
  reactionBtn: { padding: 6, position: 'relative' },
  reactionEmoji: { fontSize: 22 },
  reactedDot: {
    position: 'absolute', bottom: 2, right: 2,
    width: 6, height: 6, borderRadius: 3, backgroundColor: '#ffffff',
  },
  replyInput: {
    flex: 1, height: 40, backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20, paddingHorizontal: 16,
    fontSize: 14, color: '#ffffff',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
});
