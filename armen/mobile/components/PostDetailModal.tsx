import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  Image,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Dimensions,
  Animated,
  Share,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  getPostComments,
  addComment,
  deleteComment,
  editComment,
  likeComment,
  toggleReaction,
  likePost,
  unlikePost,
  deletePost,
  editPostCaption,
  patchPost,
  savePost,
  unsavePost,
  hidePost,
  getPostInsights,
  createStory,
  Post,
  PostComment,
} from '@/services/api';
import apiClient from '@/services/api';
import { theme as T, type as TY, radius as R, space as SP } from '@/services/theme';
import { useTheme } from '@/contexts/ThemeContext';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface Props {
  visible: boolean;
  post: Post | null;
  currentUserId: string;
  onClose: () => void;
  onProfilePress: (userId: string) => void;
  onPostDeleted?: (postId: string) => void;
}

// ── Avatar ────────────────────────────────────────────────────────────────────

function Avatar({
  initials,
  avatarUrl,
  size = 36,
}: {
  initials: string;
  avatarUrl?: string | null;
  size?: number;
}) {
  if (avatarUrl) {
    return (
      <Image
        source={{ uri: avatarUrl }}
        style={{ width: size, height: size, borderRadius: size / 2 }}
      />
    );
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: T.border,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontSize: size * 0.35, fontFamily: TY.sans.bold, color: T.text.body }}>
        {initials || '?'}
      </Text>
    </View>
  );
}

// ── OryxDataCard ──────────────────────────────────────────────────────────────

function OryxDataCard({ data }: { data: Post['oryx_data_card_json'] }) {
  const [expanded, setExpanded] = useState(false);
  if (!data) return null;
  const ptype = data.post_type;

  if (ptype === 'workout') {
    return (
      <View style={{ backgroundColor: T.bg.elevated, borderRadius: R.md, padding: 16, borderWidth: 1, borderColor: T.border, gap: 8 }}>
        <Text style={{ fontSize: 9, color: T.text.muted, letterSpacing: 2, textTransform: 'uppercase' }}>WORKOUT</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="fitness" size={18} color={T.text.body} />
          <Text style={{ fontSize: 15, fontFamily: TY.sans.bold, color: T.text.primary, flex: 1 }} numberOfLines={1}>
            {data.session_name || 'Workout'}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {data.duration_minutes != null && (
            <View style={{ backgroundColor: T.border, borderRadius: R.xs, paddingHorizontal: 8, paddingVertical: 4 }}>
              <Text style={{ fontSize: 12, color: T.text.primary }}>{data.duration_minutes} min</Text>
            </View>
          )}
          {data.training_load != null && (
            <View style={{ backgroundColor: T.border, borderRadius: R.xs, paddingHorizontal: 8, paddingVertical: 4 }}>
              <Text style={{ fontSize: 12, color: T.text.primary }}>Load {data.training_load}</Text>
            </View>
          )}
          {data.rpe != null && (
            <View style={{ backgroundColor: T.border, borderRadius: R.xs, paddingHorizontal: 8, paddingVertical: 4 }}>
              <Text style={{ fontSize: 12, color: T.text.primary }}>RPE {data.rpe}/10</Text>
            </View>
          )}
        </View>
        {data.autopsy_snippet && (
          <Text style={{ fontSize: 12, color: T.text.secondary, lineHeight: 18, fontStyle: 'italic' }} numberOfLines={2}>{data.autopsy_snippet}</Text>
        )}
      </View>
    );
  }

  if (ptype === 'insight') {
    const text: string = data.diagnosis_text || '';
    const isLong = text.length > 160;
    return (
      <View style={{ backgroundColor: T.bg.elevated, borderRadius: R.md, padding: 16, borderWidth: 1, borderColor: T.border, borderLeftWidth: 3, borderLeftColor: T.accent, gap: 8 }}>
        <Text style={{ fontSize: 9, color: T.text.muted, letterSpacing: 2, textTransform: 'uppercase' }}>ORYX INSIGHT</Text>
        <Text style={{ fontSize: 13, color: T.text.primary, lineHeight: 20 }} numberOfLines={expanded ? undefined : 3}>{text}</Text>
        {isLong && (
          <TouchableOpacity onPress={() => setExpanded(!expanded)}>
            <Text style={{ fontSize: 12, color: T.text.secondary }}>{expanded ? 'Show less' : 'Read more'}</Text>
          </TouchableOpacity>
        )}
        {data.factors && Array.isArray(data.factors) && data.factors.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
            {data.factors.map((f: string, i: number) => (
              <View key={i} style={{ backgroundColor: T.border, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                <Text style={{ fontSize: 10, color: T.text.secondary }}>{f}</Text>
              </View>
            ))}
          </View>
        )}
        {data.recommendation && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <Ionicons name="flash" size={12} color={T.text.secondary} />
            <Text style={{ fontSize: 12, color: T.text.secondary, flex: 1 }}>{data.recommendation}</Text>
          </View>
        )}
      </View>
    );
  }

  if (ptype === 'recap') {
    const stats = [
      { label: 'Sessions', value: data.sessions ?? '-' },
      { label: 'Total Load', value: data.total_load ?? '-' },
    ];
    return (
      <View style={{ backgroundColor: T.bg.elevated, borderRadius: R.md, padding: 16, borderWidth: 1, borderColor: T.border, gap: 8 }}>
        <Text style={{ fontSize: 9, color: T.text.muted, letterSpacing: 2, textTransform: 'uppercase' }}>WEEK RECAP</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {stats.map((s, i) => (
            <View key={i} style={{ flex: 1, backgroundColor: T.bg.tint, borderRadius: R.sm, padding: SP[3] - 2 }}>
              <Text style={{ fontSize: 16, fontFamily: TY.sans.bold, color: T.text.primary }}>{String(s.value)}</Text>
              <Text style={{ fontSize: 10, color: T.text.muted, marginTop: 2 }}>{s.label}</Text>
            </View>
          ))}
        </View>
        {data.summary ? (
          <Text style={{ fontSize: 13, fontStyle: 'italic', color: T.text.primary, lineHeight: 18 }}>{data.summary}</Text>
        ) : null}
      </View>
    );
  }

  if (ptype === 'milestone') {
    return (
      <View style={{ backgroundColor: T.bg.elevated, borderRadius: R.md, padding: 16, borderWidth: 1, borderColor: T.border, alignItems: 'center', gap: 8 }}>
        <Ionicons name="trophy" size={48} color={T.text.body} />
        <Text style={{ fontSize: 18, fontFamily: TY.sans.bold, color: T.text.primary, textAlign: 'center' }}>
          {data.badge_name || 'Milestone Reached'}
        </Text>
        {data.description && (
          <Text style={{ fontSize: 13, color: T.text.muted, textAlign: 'center', lineHeight: 18 }}>{data.description}</Text>
        )}
      </View>
    );
  }

  // generic
  return (
    <View style={{ backgroundColor: T.bg.elevated, borderRadius: R.md, padding: 16, borderWidth: 1, borderColor: T.border, gap: 4 }}>
      {data.title ? <Text style={{ fontSize: 15, fontFamily: TY.sans.bold, color: T.text.primary }}>{data.title}</Text> : null}
      {data.body ? <Text style={{ fontSize: 13, color: T.text.secondary, lineHeight: 18 }}>{data.body}</Text> : null}
    </View>
  );
}

// ── PostDetailModal ───────────────────────────────────────────────────────────

export default function PostDetailModal({
  visible,
  post: initialPost,
  currentUserId,
  onClose,
  onProfilePress,
  onPostDeleted,
}: Props) {
  const insets = useSafeAreaInsets();
  // Shadow the module-level T with the reactive theme so all colors update on
  // light/dark switch without a restart.
  const { theme: T } = useTheme();

  const [post, setPost] = useState<Post | null>(initialPost);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [commentLoading, setCommentLoading] = useState(false);
  const [showAllComments, setShowAllComments] = useState(false);
  const [commentInput, setCommentInput] = useState('');
  const [replyingTo, setReplyingTo] = useState<{ id: string; display_name: string } | null>(null);
  const [editingComment, setEditingComment] = useState<{ id: string; text: string } | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [editCaptionVisible, setEditCaptionVisible] = useState(false);
  const [editCaptionText, setEditCaptionText] = useState('');
  const [editCaptionSaving, setEditCaptionSaving] = useState(false);
  const [insightsVisible, setInsightsVisible] = useState(false);
  const [insights, setInsights] = useState<any>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set());
  const [captionExpanded, setCaptionExpanded] = useState(false);

  // Captured from the <Image> onLoad event so the photo renders at its true
  // aspect ratio — no cropping whether the user posted a wide landscape,
  // square, or tall portrait.
  const [photoAspect, setPhotoAspect] = useState<number | null>(null);
  useEffect(() => { setPhotoAspect(null); }, [initialPost?.id]);

  const scrollRef = useRef<ScrollView>(null);
  const commentInputRef = useRef<TextInput>(null);
  const toastTimer = useRef<any>(null);

  // Double-tap animation
  const fireAnim = useRef(new Animated.Value(0)).current;
  const fireOpacity = useRef(new Animated.Value(0)).current;
  const lastTap = useRef(0);

  // ── Toast ──────────────────────────────────────────────────────────────────

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  };

  // ── Effects ────────────────────────────────────────────────────────────────

  useEffect(() => {
    setPost(initialPost);
    setEditCaptionText(initialPost?.caption ?? '');
  }, [initialPost]);

  useEffect(() => {
    if (!visible || !initialPost) return;
    setComments([]);
    setCommentLoading(true);
    getPostComments(initialPost.id)
      .then((res) => setComments(res.comments))
      .catch(() => setComments([]))
      .finally(() => setCommentLoading(false));
  }, [visible, initialPost?.id]);

  // ── Derived ────────────────────────────────────────────────────────────────

  const isOwn = post?.author?.id === currentUserId;

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleLike = useCallback(async () => {
    if (!post) return;
    const wasLiked = post.is_liked_by_current_user;
    setPost(prev => prev ? {
      ...prev,
      is_liked_by_current_user: !wasLiked,
      like_count: wasLiked ? Math.max(0, (prev.like_count || 0) - 1) : (prev.like_count || 0) + 1,
    } : prev);
    try {
      if (wasLiked) await unlikePost(post.id);
      else await likePost(post.id);
    } catch {
      setPost(prev => prev ? {
        ...prev,
        is_liked_by_current_user: wasLiked,
        like_count: post.like_count,
      } : prev);
    }
  }, [post]);

  const handleDoubleTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTap.current < 350) {
      fireAnim.setValue(0);
      fireOpacity.setValue(1);
      Animated.parallel([
        Animated.sequence([
          Animated.timing(fireAnim, { toValue: 1.5, duration: 300, useNativeDriver: true }),
          Animated.timing(fireAnim, { toValue: 1.2, duration: 100, useNativeDriver: true }),
        ]),
        Animated.timing(fireOpacity, { toValue: 0, duration: 600, useNativeDriver: true }),
      ]).start();
      handleLike();
    }
    lastTap.current = now;
  }, [fireAnim, fireOpacity, handleLike]);

  const handleSendComment = useCallback(async () => {
    if (!post) return;
    const text = (editingComment ? editingComment.text : commentInput).trim();
    if (!text) return;

    if (editingComment) {
      const prevText = editingComment.text;
      setEditingComment(null);
      try {
        const res = await editComment(post.id, editingComment.id, text);
        setComments((prev) =>
          prev.map((c) => {
            if (c.id === editingComment.id) return res.comment;
            // also check nested replies
            return {
              ...c,
              replies: (c.replies || []).map((r) =>
                r.id === editingComment.id ? res.comment : r
              ),
            };
          })
        );
      } catch {
        showToast('Failed to edit comment');
      }
      return;
    }

    const inputText = commentInput.trim();
    setCommentInput('');
    const parentId = replyingTo?.id;
    setReplyingTo(null);

    try {
      const res = await addComment(post.id, inputText, parentId);
      if (parentId) {
        setComments((prev) =>
          prev.map((c) => {
            if (c.id === parentId) {
              return {
                ...c,
                replies: [...(c.replies || []), res.comment],
                total_reply_count: (c.total_reply_count || 0) + 1,
              };
            }
            return c;
          })
        );
        setExpandedReplies((prev) => new Set([...prev, parentId]));
      } else {
        setComments((prev) => [...prev, res.comment]);
      }
      setPost((prev) => prev ? { ...prev, comment_count: (prev.comment_count || 0) + 1 } : prev);
    } catch {
      showToast('Failed to post comment');
      setCommentInput(inputText);
    }
  }, [post, commentInput, editingComment, replyingTo]);

  const handleLikeComment = useCallback(async (commentId: string) => {
    if (!post) return;
    // Optimistic toggle
    const updateComment = (c: PostComment): PostComment => {
      if (c.id !== commentId) {
        return { ...c, replies: (c.replies || []).map(updateComment) };
      }
      const wasLiked = c.is_liked_by_me;
      return {
        ...c,
        is_liked_by_me: !wasLiked,
        like_count: wasLiked ? Math.max(0, c.like_count - 1) : c.like_count + 1,
      };
    };
    setComments((prev) => prev.map(updateComment));
    try {
      await likeComment(post.id, commentId);
    } catch {
      // revert on fail
      setComments((prev) => prev.map(updateComment));
    }
  }, [post]);

  const handleDeleteComment = useCallback(async (commentId: string) => {
    if (!post) return;
    setComments((prev) =>
      prev
        .filter((c) => c.id !== commentId)
        .map((c) => ({
          ...c,
          replies: (c.replies || []).filter((r) => r.id !== commentId),
        }))
    );
    try {
      await deleteComment(post.id, commentId);
      setPost((prev) => prev ? { ...prev, comment_count: Math.max(0, (prev.comment_count || 1) - 1) } : prev);
    } catch {
      // silent
    }
  }, [post]);

  const handleSavePost = useCallback(async () => {
    if (!post) return;
    const wasSaved = post.is_saved;
    setPost((prev) => prev ? { ...prev, is_saved: !wasSaved } : prev);
    try {
      if (wasSaved) {
        await unsavePost(post.id);
        showToast('Removed from saved');
      } else {
        await savePost(post.id);
        showToast('Post saved');
      }
    } catch {
      setPost((prev) => prev ? { ...prev, is_saved: wasSaved } : prev);
      showToast('Something went wrong');
    }
  }, [post]);

  const handlePinPost = useCallback(async () => {
    if (!post) return;
    setMenuVisible(false);
    const wasPinned = post.is_pinned;
    try {
      const res = await patchPost(post.id, { is_pinned: !wasPinned });
      setPost(res.post);
      showToast(wasPinned ? 'Unpinned' : 'Pinned to your profile');
    } catch {
      showToast('Something went wrong');
    }
  }, [post]);

  const handleArchivePost = useCallback(async () => {
    if (!post) return;
    setMenuVisible(false);
    try {
      await patchPost(post.id, { is_archived: true });
      showToast('Post archived');
      onClose();
    } catch {
      showToast('Something went wrong');
    }
  }, [post, onClose]);

  const handleHidePost = useCallback(async () => {
    if (!post) return;
    setMenuVisible(false);
    try {
      await hidePost(post.id);
      showToast('Post hidden');
      onClose();
    } catch {
      showToast('Something went wrong');
    }
  }, [post, onClose]);

  const handleDeletePost = useCallback(() => {
    if (!post) return;
    setMenuVisible(false);
    setTimeout(() => {
      Alert.alert('Delete Post', 'Are you sure you want to delete this post?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deletePost(post.id);
              onPostDeleted?.(post.id);
              onClose();
            } catch {
              Alert.alert('Error', 'Failed to delete post');
            }
          },
        },
      ]);
    }, 300);
  }, [post, onPostDeleted, onClose]);

  const handleSaveCaption = useCallback(async () => {
    if (!post) return;
    setEditCaptionSaving(true);
    try {
      await editPostCaption(post.id, editCaptionText);
      setPost((prev) => prev ? { ...prev, caption: editCaptionText } : prev);
      setEditCaptionVisible(false);
    } catch {
      Alert.alert('Error', 'Failed to save caption');
    } finally {
      setEditCaptionSaving(false);
    }
  }, [post, editCaptionText]);

  const handleShareToStory = useCallback(async () => {
    if (!post?.photo_url) return;
    setMenuVisible(false);
    try {
      await createStory({ photo_url: post.photo_url, source_post_id: post.id });
      showToast('Shared as story');
    } catch {
      showToast('Something went wrong');
    }
  }, [post]);

  const handleShareVia = useCallback(async () => {
    if (!post) return;
    try {
      await Share.share({ message: `Check this out on ORYX: https://app.oryxfit.com/post/${post.id}` });
    } catch {
      // user cancelled
    }
  }, [post]);

  const handleCopyLink = useCallback(async () => {
    if (!post) return;
    setMenuVisible(false);
    try {
      await Share.share({ message: `https://app.oryxfit.com/post/${post.id}` });
    } catch {
      // user cancelled
    }
    showToast('Link copied');
  }, [post]);

  const handleViewInsights = useCallback(async () => {
    if (!post) return;
    setMenuVisible(false);
    try {
      const data = await getPostInsights(post.id);
      setInsights(data);
      setInsightsVisible(true);
    } catch {
      showToast('Failed to load insights');
    }
  }, [post]);

  const handleReportPost = useCallback(() => {
    if (!post) return;
    setMenuVisible(false);
    setTimeout(() => {
      Alert.alert('Report Post', 'Why are you reporting this post?', [
        {
          text: 'Spam',
          onPress: async () => {
            try {
              await (apiClient as any).post(`/posts/${post.id}/report`, { reason: 'spam' });
              showToast('Reported');
            } catch { showToast('Reported'); }
          },
        },
        {
          text: 'Inappropriate',
          onPress: async () => {
            try {
              await (apiClient as any).post(`/posts/${post.id}/report`, { reason: 'inappropriate' });
              showToast('Reported');
            } catch { showToast('Reported'); }
          },
        },
        {
          text: 'Harassment',
          onPress: async () => {
            try {
              await (apiClient as any).post(`/posts/${post.id}/report`, { reason: 'harassment' });
              showToast('Reported');
            } catch { showToast('Reported'); }
          },
        },
        {
          text: 'Other',
          onPress: async () => {
            try {
              await (apiClient as any).post(`/posts/${post.id}/report`, { reason: 'other' });
              showToast('Reported');
            } catch { showToast('Reported'); }
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }, 300);
  }, [post]);

  const handleLongPressComment = useCallback((comment: PostComment) => {
    const options: any[] = [];
    if (comment.is_own) {
      options.push({
        text: 'Edit',
        onPress: () => {
          setEditingComment({ id: comment.id, text: comment.comment_text });
          setCommentInput(comment.comment_text);
          commentInputRef.current?.focus();
        },
      });
      options.push({
        text: 'Delete',
        style: 'destructive' as const,
        onPress: () => {
          Alert.alert('Delete Comment', 'Delete this comment?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => handleDeleteComment(comment.id) },
          ]);
        },
      });
    } else {
      options.push({
        text: 'Report',
        onPress: async () => {
          if (!post) return;
          try {
            await (apiClient as any).post(`/posts/${post.id}/comments/${comment.id}/report`, { reason: 'inappropriate' });
            showToast('Comment reported');
          } catch { showToast('Comment reported'); }
        },
      });
    }
    options.push({
      text: 'Copy Text',
      onPress: async () => {
        await Share.share({ message: comment.comment_text });
      },
    });
    options.push({ text: 'Cancel', style: 'cancel' as const });
    Alert.alert('Comment', undefined, options);
  }, [post, handleDeleteComment]);

  // ── Guard ──────────────────────────────────────────────────────────────────

  if (!visible || !post) return null;

  // ── Render helpers ─────────────────────────────────────────────────────────

  const displayedComments = showAllComments ? comments : comments.slice(0, 10);

  const renderCommentRow = (comment: PostComment, isReply = false) => (
    <TouchableOpacity
      key={comment.id}
      onLongPress={() => handleLongPressComment(comment)}
      activeOpacity={0.9}
      style={{
        flexDirection: 'row',
        gap: 10,
        alignItems: 'flex-start',
        marginLeft: isReply ? 42 : 0,
        marginTop: isReply ? 8 : 0,
      }}
    >
      <TouchableOpacity onPress={() => onProfilePress(comment.user_id)} activeOpacity={0.7}>
        <Avatar initials={comment.initials} avatarUrl={comment.avatar_url} size={isReply ? 26 : 32} />
      </TouchableOpacity>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 13, color: T.text.body, lineHeight: 19 }}>
          <Text
            style={{ fontFamily: TY.sans.bold, color: T.text.primary }}
            onPress={() => onProfilePress(comment.user_id)}
          >
            {comment.display_name}
          </Text>
          {'  '}
          {comment.comment_text}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 3 }}>
          <Text style={{ fontSize: 11, color: T.text.muted }}>{comment.time_ago}</Text>
          {comment.like_count > 0 && (
            <Text style={{ fontSize: 11, color: T.text.muted }}>{comment.like_count} {comment.like_count === 1 ? 'like' : 'likes'}</Text>
          )}
          <TouchableOpacity
            onPress={() => {
              setReplyingTo({ id: comment.id, display_name: comment.display_name });
              setEditingComment(null);
              setCommentInput('');
              commentInputRef.current?.focus();
            }}
          >
            <Text style={{ fontSize: 12, color: T.text.muted, fontFamily: TY.sans.semibold }}>Reply</Text>
          </TouchableOpacity>
        </View>
      </View>
      <TouchableOpacity
        onPress={() => handleLikeComment(comment.id)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={{ alignItems: 'center', gap: 2, paddingTop: 2 }}
      >
        <Ionicons
          name={comment.is_liked_by_me ? 'heart' : 'heart-outline'}
          size={14}
          color={comment.is_liked_by_me ? T.readiness.low : T.text.muted}
        />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  const renderCommentWithReplies = (comment: PostComment) => {
    const replies = comment.replies || [];
    const isExpanded = expandedReplies.has(comment.id);
    const shownReplies = isExpanded ? replies : replies.slice(0, 2);

    return (
      <View key={comment.id}>
        {renderCommentRow(comment, false)}
        {shownReplies.map((r) => renderCommentRow(r, true))}
        {replies.length > 2 && !isExpanded && (
          <TouchableOpacity
            onPress={() => setExpandedReplies((prev) => new Set([...prev, comment.id]))}
            style={{ marginLeft: 42, marginTop: 6 }}
          >
            <Text style={{ fontSize: 12, color: T.text.secondary }}>
              View {replies.length - 2} more {replies.length - 2 === 1 ? 'reply' : 'replies'}
            </Text>
          </TouchableOpacity>
        )}
        {isExpanded && replies.length > 2 && (
          <TouchableOpacity
            onPress={() => {
              setExpandedReplies((prev) => {
                const next = new Set(prev);
                next.delete(comment.id);
                return next;
              });
            }}
            style={{ marginLeft: 42, marginTop: 6 }}
          >
            <Text style={{ fontSize: 12, color: T.text.secondary }}>Hide replies</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  // ── Main render ────────────────────────────────────────────────────────────

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: T.bg.primary }}>

        {/* ── Header ── */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: insets.top + 8,
            paddingHorizontal: 16,
            paddingBottom: 12,
            borderBottomWidth: 1,
            borderBottomColor: T.border,
          }}
        >
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="arrow-back" size={24} color={T.text.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setMenuVisible(true)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="ellipsis-horizontal" size={22} color={T.text.secondary} />
          </TouchableOpacity>
        </View>

        {/* ── Body ── */}
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            ref={scrollRef}
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 24 }}
            keyboardShouldPersistTaps="handled"
          >
            {/* Profile row */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                padding: 12,
                gap: 10,
              }}
            >
              <TouchableOpacity onPress={() => onProfilePress(post.author.id)} activeOpacity={0.7}>
                <Avatar initials={post.author.initials} avatarUrl={post.author.avatar_url} size={40} />
              </TouchableOpacity>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontFamily: TY.sans.bold, color: T.text.primary }} numberOfLines={1}>
                  {post.author.display_name}
                </Text>
                <Text style={{ fontSize: 13, color: T.text.muted }}>@{post.author.username}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 2 }}>
                {(post as any).location_text && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                    <Ionicons name="location-outline" size={11} color={T.text.muted} />
                    <Text style={{ fontSize: 11, color: T.text.muted }}>{(post as any).location_text}</Text>
                  </View>
                )}
                <Text style={{ fontSize: 11, color: T.text.muted }}>{post.time_ago}</Text>
              </View>
            </View>

            {/* Photo — rendered at its natural aspect ratio (captured via onLoad)
                so horizontals stay horizontal and portraits stay tall. While the
                aspect is still loading we fall back to 1:1 so the layout is
                stable. `resizeMode: 'contain'` plus matching aspect means no
                cropping in either direction. */}
            {post.photo_url && (
              <View style={{ position: 'relative' }}>
                <Pressable onPress={handleDoubleTap}>
                  <Image
                    source={{ uri: post.photo_url }}
                    style={{
                      width: SCREEN_WIDTH,
                      aspectRatio: photoAspect ?? 1,
                      backgroundColor: T.bg.primary,
                    }}
                    resizeMode="contain"
                    onLoad={(e) => {
                      const src = (e?.nativeEvent as any)?.source;
                      if (src?.width && src?.height) {
                        setPhotoAspect(src.width / src.height);
                      }
                    }}
                  />
                </Pressable>
                <Animated.View
                  pointerEvents="none"
                  style={{
                    position: 'absolute',
                    top: 0, left: 0, right: 0, bottom: 0,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Animated.View
                    style={{
                      transform: [{ scale: fireAnim }],
                      opacity: fireOpacity,
                    }}
                  >
                    <Ionicons name="heart" size={72} color={T.readiness.low} />
                  </Animated.View>
                </Animated.View>
              </View>
            )}

            <View style={{ padding: 12, gap: 12 }}>
              {/* ORYX data card */}
              {post.oryx_data_card_json && (
                <OryxDataCard data={post.oryx_data_card_json} />
              )}

              {/* Caption */}
              {post.caption && (
                <Text
                  style={{ fontSize: 14, color: T.text.body, lineHeight: 21 }}
                  numberOfLines={captionExpanded ? undefined : 4}
                  onPress={() => setCaptionExpanded(!captionExpanded)}
                >
                  <Text style={{ fontFamily: TY.sans.bold, color: T.text.primary }}>{post.author.display_name}  </Text>
                  {post.caption}
                </Text>
              )}
              {post.caption && post.caption.length > 200 && (
                <TouchableOpacity onPress={() => setCaptionExpanded(!captionExpanded)}>
                  <Text style={{ fontSize: 13, color: T.text.muted }}>
                    {captionExpanded ? 'Show less' : 'more'}
                  </Text>
                </TouchableOpacity>
              )}

              {/* Interaction bar */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: 10,
                  borderTopWidth: 1, borderTopColor: T.border,
                  borderBottomWidth: 1, borderBottomColor: T.border,
                  gap: 16,
                }}
              >
                <TouchableOpacity onPress={handleLike} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Ionicons
                    name={post.is_liked_by_current_user ? 'heart' : 'heart-outline'}
                    size={22}
                    color={post.is_liked_by_current_user ? T.status.danger : T.text.muted}
                  />
                  <Text style={{ fontSize: 14, color: T.text.body }}>{post.like_count ?? 0}</Text>
                </TouchableOpacity>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Ionicons name="chatbubble-outline" size={20} color={T.text.muted} />
                  <Text style={{ fontSize: 13, color: T.text.muted }}>{post.comment_count ?? 0}</Text>
                </View>
                <View style={{ flex: 1 }} />
                {!isOwn && (
                  <TouchableOpacity onPress={handleSavePost}>
                    <Ionicons
                      name={post.is_saved ? 'bookmark' : 'bookmark-outline'}
                      size={20}
                      color={post.is_saved ? T.text.primary : T.text.secondary}
                    />
                  </TouchableOpacity>
                )}
              </View>

              {/* Comments section */}
              <View style={{ gap: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 14, fontFamily: TY.sans.bold, color: T.text.primary }}>Comments</Text>
                  {comments.length > 0 && (
                    <Text style={{ fontSize: 13, color: T.text.muted }}>{comments.length}</Text>
                  )}
                </View>

                {!showAllComments && comments.length > 10 && (
                  <TouchableOpacity onPress={() => setShowAllComments(true)}>
                    <Text style={{ fontSize: 13, color: T.text.secondary }}>
                      View all {comments.length} comments
                    </Text>
                  </TouchableOpacity>
                )}

                {commentLoading ? (
                  <Text style={{ color: T.text.muted, textAlign: 'center', paddingVertical: 16, fontSize: 13 }}>
                    Loading comments...
                  </Text>
                ) : comments.length === 0 ? (
                  <Text style={{ color: T.text.muted, textAlign: 'center', paddingVertical: 16, fontSize: 13 }}>
                    No comments yet. Be the first!
                  </Text>
                ) : (
                  <View style={{ gap: 14 }}>
                    {displayedComments.map((comment) => renderCommentWithReplies(comment))}
                  </View>
                )}
              </View>
            </View>
          </ScrollView>

          {/* ── Comment input bar ── */}
          <View
            style={{
              backgroundColor: T.bg.primary,
              borderTopWidth: 1,
              borderTopColor: T.border,
              paddingTop: 8,
              paddingHorizontal: 12,
              paddingBottom: insets.bottom + 8,
            }}
          >
            {/* Reply banner */}
            {replyingTo && (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingBottom: 6,
                  paddingHorizontal: 4,
                }}
              >
                <Text style={{ fontSize: 12, color: T.text.secondary }}>
                  Replying to <Text style={{ fontFamily: TY.sans.bold, color: T.text.primary }}>{replyingTo.display_name}</Text>
                </Text>
                <TouchableOpacity
                  onPress={() => setReplyingTo(null)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close" size={16} color={T.text.secondary} />
                </TouchableOpacity>
              </View>
            )}

            {/* Editing banner */}
            {editingComment && (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingBottom: 6,
                  paddingHorizontal: 4,
                }}
              >
                <Text style={{ fontSize: 12, color: T.text.secondary }}>Editing comment</Text>
                <TouchableOpacity
                  onPress={() => {
                    setEditingComment(null);
                    setCommentInput('');
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="close" size={16} color={T.text.secondary} />
                </TouchableOpacity>
              </View>
            )}

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Avatar
                initials=""
                avatarUrl={null}
                size={32}
              />
              <TextInput
                ref={commentInputRef}
                style={{
                  flex: 1,
                  backgroundColor: T.bg.elevated,
                  borderRadius: R.lg,
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  color: T.text.primary,
                  fontSize: 14,
                  borderWidth: 1,
                  borderColor: T.border,
                  maxHeight: 100,
                }}
                placeholder={replyingTo ? `Reply to ${replyingTo.display_name}...` : 'Add a comment...'}
                placeholderTextColor={T.text.muted}
                value={commentInput}
                onChangeText={(t) => {
                  setCommentInput(t);
                  if (editingComment) setEditingComment({ ...editingComment, text: t });
                }}
                multiline
              />
              <TouchableOpacity
                onPress={handleSendComment}
                disabled={!commentInput.trim()}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: commentInput.trim() ? T.text.body : T.border,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Ionicons name="send" size={16} color={commentInput.trim() ? T.bg.primary : T.text.muted} />
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>

        {/* ── Toast overlay ── */}
        {toast && (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              bottom: insets.bottom + 80,
              left: 24,
              right: 24,
              alignItems: 'center',
            }}
          >
            <View
              style={{
                backgroundColor: T.bg.elevated,
                borderRadius: R.pill,
                paddingHorizontal: 18,
                paddingVertical: 10,
                borderWidth: 1,
                borderColor: T.border,
              }}
            >
              <Text style={{ fontSize: 14, color: T.text.primary, textAlign: 'center' }}>{toast}</Text>
            </View>
          </View>
        )}

        {/* ── Three-dot menu bottom sheet ── */}
        <Modal
          visible={menuVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setMenuVisible(false)}
        >
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}
            activeOpacity={1}
            onPress={() => setMenuVisible(false)}
          >
            <View
              style={{
                backgroundColor: T.glass.chrome,
                borderTopLeftRadius: 20,
                borderTopRightRadius: 20,
                padding: 16,
                gap: 8,
                paddingBottom: insets.bottom + 16,
              }}
            >
              {isOwn ? (
                <>
                  <MenuItem
                    icon="pencil-outline"
                    label="Edit Caption"
                    onPress={() => {
                      setMenuVisible(false);
                      setTimeout(() => {
                        setEditCaptionText(post.caption ?? '');
                        setEditCaptionVisible(true);
                      }, 300);
                    }}
                  />
                  <MenuItem
                    icon="trash-outline"
                    label="Delete Post"
                    destructive
                    onPress={handleDeletePost}
                  />
                  <MenuItem
                    icon={post.is_pinned ? 'pin' : 'pin-outline'}
                    label={post.is_pinned ? 'Unpin from Profile' : 'Pin to Profile'}
                    onPress={handlePinPost}
                  />
                  {post.photo_url && (
                    <MenuItem
                      icon="book-outline"
                      label="Share as Story"
                      onPress={handleShareToStory}
                    />
                  )}
                  <MenuItem
                    icon="archive-outline"
                    label="Archive Post"
                    onPress={handleArchivePost}
                  />
                  <MenuItem
                    icon="bar-chart-outline"
                    label="View Insights"
                    onPress={handleViewInsights}
                  />
                </>
              ) : (
                <>
                  <MenuItem
                    icon="flag-outline"
                    label="Report Post"
                    destructive
                    onPress={handleReportPost}
                  />
                  <MenuItem
                    icon="eye-off-outline"
                    label="Not Interested"
                    onPress={handleHidePost}
                  />
                  <MenuItem
                    icon="link-outline"
                    label="Copy Link"
                    onPress={handleCopyLink}
                  />
                </>
              )}
              <TouchableOpacity
                onPress={() => setMenuVisible(false)}
                style={{
                  padding: 14,
                  alignItems: 'center',
                  borderRadius: R.sm,
                  borderWidth: 1,
                  borderColor: T.border,
                  marginTop: 4,
                }}
              >
                <Text style={{ fontSize: 15, color: T.text.secondary }}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>

        {/* ── Edit Caption modal ── */}
        <Modal
          visible={editCaptionVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setEditCaptionVisible(false)}
        >
          <KeyboardAvoidingView
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 24 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            <View
              style={{
                backgroundColor: T.bg.elevated,
                borderRadius: R.md,
                padding: 20,
                gap: 16,
                borderWidth: 1,
                borderColor: T.border,
              }}
            >
              <Text style={{ fontSize: 16, fontFamily: TY.sans.bold, color: T.text.primary }}>Edit Caption</Text>
              <TextInput
                style={{
                  backgroundColor: T.bg.primary,
                  borderRadius: R.sm,
                  padding: 12,
                  color: T.text.primary,
                  fontSize: 14,
                  borderWidth: 1,
                  borderColor: T.border,
                  minHeight: 100,
                  textAlignVertical: 'top',
                }}
                value={editCaptionText}
                onChangeText={setEditCaptionText}
                multiline
                maxLength={2200}
                placeholder="Write a caption..."
                placeholderTextColor={T.text.muted}
                autoFocus
              />
              <Text style={{ fontSize: 11, color: T.text.muted, textAlign: 'right' }}>
                {editCaptionText.length}/2200
              </Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  onPress={() => setEditCaptionVisible(false)}
                  style={{
                    flex: 1,
                    padding: 12,
                    alignItems: 'center',
                    borderRadius: R.sm,
                    borderWidth: 1,
                    borderColor: T.border,
                  }}
                >
                  <Text style={{ fontSize: 14, color: T.text.secondary }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSaveCaption}
                  disabled={editCaptionSaving}
                  style={{
                    flex: 1,
                    padding: 12,
                    alignItems: 'center',
                    borderRadius: R.sm,
                    backgroundColor: T.accent,
                    opacity: editCaptionSaving ? 0.6 : 1,
                  }}
                >
                  <Text style={{ fontSize: 14, fontFamily: TY.sans.semibold, color: T.accentInk }}>
                    {editCaptionSaving ? 'Saving...' : 'Save'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* ── Insights bottom sheet ── */}
        <Modal
          visible={insightsVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setInsightsVisible(false)}
        >
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}
            activeOpacity={1}
            onPress={() => setInsightsVisible(false)}
          >
            <View
              style={{
                backgroundColor: T.glass.chrome,
                borderTopLeftRadius: 20,
                borderTopRightRadius: 20,
                padding: 20,
                gap: 4,
                paddingBottom: insets.bottom + 24,
              }}
            >
              <Text style={{ fontSize: 16, fontFamily: TY.sans.bold, color: T.text.primary, marginBottom: 12 }}>
                Post Insights
              </Text>
              {insights ? (
                <>
                  <InsightRow icon="👀" label="Views" value={insights.total_views ?? 0} />
                  <InsightRow icon="🔥" label="Fire" value={insights.fire_count ?? 0} />
                  <InsightRow icon="💪" label="Muscle" value={insights.muscle_count ?? 0} />
                  <InsightRow icon="❤️" label="Heart" value={insights.heart_count ?? 0} />
                  <InsightRow icon="💬" label="Comments" value={insights.total_comments ?? 0} />
                  <InsightRow icon="🔖" label="Saves" value={insights.total_saves ?? 0} />
                </>
              ) : (
                <Text style={{ color: T.text.muted, textAlign: 'center', paddingVertical: 16 }}>Loading...</Text>
              )}
              <TouchableOpacity
                onPress={() => setInsightsVisible(false)}
                style={{
                  padding: 14,
                  alignItems: 'center',
                  borderRadius: R.sm,
                  borderWidth: 1,
                  borderColor: T.border,
                  marginTop: 12,
                }}
              >
                <Text style={{ fontSize: 15, color: T.text.secondary }}>Done</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>

      </View>
    </Modal>
  );
}

// ── MenuItem helper ───────────────────────────────────────────────────────────

function MenuItem({
  icon,
  label,
  onPress,
  destructive = false,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  const { theme: MT } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 14,
        backgroundColor: MT.bg.elevated,
        borderRadius: R.sm,
        borderWidth: 1,
        borderColor: destructive ? MT.status.danger + '40' : MT.border,
      }}
    >
      <Ionicons name={icon as any} size={18} color={destructive ? MT.status.danger : MT.text.primary} />
      <Text style={{ fontSize: 15, color: destructive ? MT.status.danger : MT.text.primary, fontFamily: TY.sans.regular }}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── InsightRow helper ─────────────────────────────────────────────────────────

function InsightRow({ icon, label, value }: { icon: string; label: string; value: number }) {
  const { theme: IT } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: IT.border,
      }}
    >
      <Text style={{ fontSize: 18, marginRight: 10 }}>{icon}</Text>
      <Text style={{ flex: 1, fontSize: 14, color: IT.text.body }}>{label}</Text>
      <Text style={{ fontSize: 15, fontFamily: TY.sans.bold, color: IT.text.primary }}>{value.toLocaleString()}</Text>
    </View>
  );
}
