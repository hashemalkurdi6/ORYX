import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import {
  View, Text, ScrollView, FlatList, TouchableOpacity, StyleSheet,
  RefreshControl, TextInput, Modal, KeyboardAvoidingView, Platform,
  ActivityIndicator, Dimensions, Animated, Image,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { ThemeColors } from '@/services/theme';
import { useAuthStore } from '@/services/authStore';
import {
  followUser, unfollowUser, getSuggestions, searchUsers,
  getFeed, deletePost, getPostComments, addComment, deleteComment,
  getClubs, getMyClubs, getClubDetail, joinClub, leaveClub, getClubLeaderboard, autoJoinClubs,
  likePost, unlikePost,
  UserPreview, Post, CommunityClub, ClubDetail, LeaderboardResponse, PostComment,
} from '@/services/api';
import apiClient from '@/services/api';
import StoryViewer from '@/components/StoryViewer';
import StoryCreator from '@/components/StoryCreator';
import PostCreator from '@/components/PostCreator';
import AthleteProfileModal from '@/components/AthleteProfileModal';
import PostDetailModal from '@/components/PostDetailModal';
import AmbientBackdrop from '@/components/AmbientBackdrop';
import { theme as T, type as TY, radius as R, space as SP } from '@/services/theme';
import { useMessagesStore } from '@/services/messagesStore';
import { LinearGradient } from 'expo-linear-gradient';
import {
  getStoriesFeed, deleteStory,
  StoryItem, StoryGroup,
} from '@/services/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const COVER_IMAGES: Record<string, any> = {
  workout: require('@/assets/images/cards/workout.jpg'),
  activity: require('@/assets/images/cards/activity.jpg'),
  recovery_high: require('@/assets/images/cards/recovery_high.jpg'),
  recovery_low: require('@/assets/images/cards/recovery_low.jpg'),
  wellness: require('@/assets/images/cards/wellness.jpg'),
  streak: require('@/assets/images/cards/streak.jpg'),
  nutrition: require('@/assets/images/cards/nutrition.jpg'),
  recap: require('@/assets/images/cards/recap.jpg'),
};

// ── DM entry icon for the Community header ──────────────────────────────────
// Paper-plane icon with a lime dot overlay when there are unread DMs.
// Taps push the /messages stack.
function CommunityDmIcon() {
  const unread = useMessagesStore((s) => s.unreadCount);
  const refresh = useMessagesStore((s) => s.refresh);
  const { theme } = useTheme();

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  return (
    <TouchableOpacity
      onPress={() => router.push('/messages')}
      activeOpacity={0.8}
      style={{
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: theme.glass.pill,
        borderWidth: 1, borderColor: theme.glass.border,
        alignItems: 'center', justifyContent: 'center',
      }}
    >
      <Ionicons name="paper-plane-outline" size={18} color={theme.text.body} />
      {unread > 0 ? (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 6, right: 6,
            width: 9, height: 9, borderRadius: 5,
            backgroundColor: theme.accent,
            borderWidth: 1, borderColor: theme.bg.primary,
          }}
        />
      ) : null}
    </TouchableOpacity>
  );
}

// ── MenuOption ────────────────────────────────────────────────────────────────

function MenuOption({ label, icon, color, onPress }: { label: string; icon: string; color?: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' }}>
      <Ionicons name={icon as any} size={20} color={color || '#CED4E0'} />
      <Text style={{ color: color || '#F0F2F6', fontSize: 16 }}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── SearchScreen ──────────────────────────────────────────────────────────────

function SearchScreen({ onClose, currentUserId }: { onClose: () => void; currentUserId: string }) {
  const [tab, setTab] = useState<'athletes' | 'posts' | 'clubs'>('athletes');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const search = async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    try {
      if (tab === 'posts') {
        const res = await apiClient.get(`/posts/search?q=${encodeURIComponent(q)}`);
        setResults(res.data.posts || []);
      } else if (tab === 'athletes') {
        const res = await apiClient.get(`/social/search?q=${encodeURIComponent(q)}`);
        setResults(res.data.users || []);
      } else {
        const res = await apiClient.get('/social/clubs');
        setResults(res.data.clubs || []);
      }
    } catch { setResults([]); } finally { setLoading(false); }
  };

  useEffect(() => { search(query); }, [query, tab]);

  return (
    <View style={{ flex: 1, backgroundColor: '#141820' }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, paddingTop: 56, gap: 12 }}>
        <TextInput
          autoFocus
          value={query}
          onChangeText={setQuery}
          placeholder="Search..."
          placeholderTextColor="#525E72"
          style={{ flex: 1, backgroundColor: 'rgba(28,34,46,0.72)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: '#F0F2F6', fontSize: 15 }}
        />
        <TouchableOpacity onPress={onClose}>
          <Text style={{ color: '#5b9bd5', fontSize: 15 }}>Cancel</Text>
        </TouchableOpacity>
      </View>
      {/* Tab bar */}
      <View style={{ flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 12 }}>
        {(['athletes', 'posts', 'clubs'] as const).map(t => (
          <TouchableOpacity
            key={t}
            onPress={() => setTab(t)}
            style={{
              paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
              backgroundColor: tab === t ? '#5b9bd5' : 'rgba(28,34,46,0.72)',
            }}
          >
            <Text style={{ color: tab === t ? '#F0F2F6' : '#8B95A8', fontSize: 13, fontWeight: '600', textTransform: 'capitalize' }}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {/* Results */}
      {loading ? (
        <ActivityIndicator color="#5b9bd5" style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={results}
          keyExtractor={i => i.id || i.user_id || Math.random().toString()}
          renderItem={({ item }) => {
            if (tab === 'athletes') return (
              <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#111', gap: 12 }}>
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#1e2a3a', alignItems: 'center', justifyContent: 'center' }}>
                  {item.avatar_url
                    ? <Image source={{ uri: item.avatar_url }} style={{ width: 40, height: 40, borderRadius: 20 }} />
                    : <Text style={{ color: '#5b9bd5', fontWeight: '700' }}>{(item.display_name || item.username || '?')[0].toUpperCase()}</Text>
                  }
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#F0F2F6', fontWeight: '600' }}>{item.display_name || item.username}</Text>
                  <Text style={{ color: '#525E72', fontSize: 12 }}>@{item.username}</Text>
                </View>
              </View>
            );
            if (tab === 'posts') return (
              <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: '#111' }}>
                {item.photo_url && <Image source={{ uri: item.photo_url }} style={{ width: '100%', height: 160, borderRadius: 8, marginBottom: 8 }} />}
                <Text style={{ color: '#CED4E0', fontSize: 13 }} numberOfLines={2}>{item.caption || 'No caption'}</Text>
              </View>
            );
            if (tab === 'clubs') return (
              <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#111', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: '#F0F2F6', fontWeight: '600' }}>{item.name}</Text>
                  <Text style={{ color: '#525E72', fontSize: 12 }}>{item.member_count || 0} members</Text>
                </View>
                <TouchableOpacity style={{ paddingHorizontal: 14, paddingVertical: 6, backgroundColor: '#5b9bd5', borderRadius: 8 }}>
                  <Text style={{ color: '#F0F2F6', fontWeight: '600', fontSize: 13 }}>Join</Text>
                </TouchableOpacity>
              </View>
            );
            return null;
          }}
          ListEmptyComponent={query.length > 0 ? <Text style={{ color: '#525E72', textAlign: 'center', marginTop: 40 }}>No results</Text> : null}
        />
      )}
    </View>
  );
}

// ── Avatar ────────────────────────────────────────────────────────────────────

function Avatar({ initials, avatarUrl, size = 36, style }: { initials: string; avatarUrl?: string | null; size?: number; style?: any }) {
  const { theme } = useTheme();
  if (avatarUrl) {
    return <Image source={{ uri: avatarUrl }} style={[{ width: size, height: size, borderRadius: size / 2 }, style]} />;
  }
  return (
    <View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: 'rgba(255,255,255,0.10)', alignItems: 'center', justifyContent: 'center' }, style]}>
      <Text style={{ fontSize: size * 0.35, fontWeight: '700', color: '#F0F2F6' }}>{initials || '?'}</Text>
    </View>
  );
}

// ── SportPill ─────────────────────────────────────────────────────────────────

function SportPill({ tag }: { tag: string }) {
  return (
    <View style={{ backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 }}>
      <Text style={{ fontSize: 10, color: '#888888' }}>{tag}</Text>
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
      <View style={{ backgroundColor: 'rgba(28,34,46,0.72)', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', gap: 8 }}>
        <Text style={{ fontSize: 9, color: '#555555', letterSpacing: 2, textTransform: 'uppercase' }}>WORKOUT</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Ionicons name="fitness" size={18} color="#F0F2F6" />
          <Text style={{ fontSize: 15, fontWeight: '700', color: '#F0F2F6', flex: 1 }} numberOfLines={1}>
            {data.session_name || 'Workout'}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {data.duration_minutes != null && (
            <View style={{ backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
              <Text style={{ fontSize: 12, color: '#F0F2F6' }}>{data.duration_minutes} min</Text>
            </View>
          )}
          {data.training_load != null && (
            <View style={{ backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
              <Text style={{ fontSize: 12, color: '#F0F2F6' }}>Load {data.training_load}</Text>
            </View>
          )}
          {data.rpe != null && (
            <View style={{ backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
              <Text style={{ fontSize: 12, color: '#F0F2F6' }}>RPE {data.rpe}/10</Text>
            </View>
          )}
        </View>
        {data.autopsy_snippet && (
          <Text style={{ fontSize: 12, color: '#888888', lineHeight: 18, fontStyle: 'italic' }} numberOfLines={2}>{data.autopsy_snippet}</Text>
        )}
      </View>
    );
  }

  if (ptype === 'insight') {
    const text: string = data.diagnosis_text || '';
    const isLong = text.length > 160;
    return (
      <View style={{ backgroundColor: 'rgba(28,34,46,0.72)', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', borderLeftWidth: 3, borderLeftColor: '#27ae60', gap: 8 }}>
        <Text style={{ fontSize: 9, color: '#555555', letterSpacing: 2, textTransform: 'uppercase' }}>ORYX INSIGHT</Text>
        <Text style={{ fontSize: 13, color: '#F0F2F6', lineHeight: 20 }} numberOfLines={expanded ? undefined : 3}>{text}</Text>
        {isLong && (
          <TouchableOpacity onPress={() => setExpanded(!expanded)}>
            <Text style={{ fontSize: 12, color: '#888888' }}>{expanded ? 'Show less' : 'Read more'}</Text>
          </TouchableOpacity>
        )}
        {data.factors && Array.isArray(data.factors) && data.factors.length > 0 && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
            {data.factors.map((f: string, i: number) => (
              <View key={i} style={{ backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                <Text style={{ fontSize: 10, color: '#888888' }}>{f}</Text>
              </View>
            ))}
          </View>
        )}
        {data.recommendation && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <Ionicons name="flash" size={12} color="#888888" />
            <Text style={{ fontSize: 12, color: '#888888', flex: 1 }}>{data.recommendation}</Text>
          </View>
        )}
      </View>
    );
  }

  if (ptype === 'recap') {
    const currentLoad: number = data.total_load ?? 0;
    const lastLoad: number = data.last_week_load ?? 0;
    const maxLoad = Math.max(currentLoad, lastLoad, 1);
    const stats = [
      { label: 'Sessions', value: data.sessions ?? '-' },
      { label: 'Total Load', value: data.total_load ?? '-' },
    ];
    return (
      <View style={{ backgroundColor: 'rgba(28,34,46,0.72)', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', gap: 8 }}>
        <Text style={{ fontSize: 9, color: '#555555', letterSpacing: 2, textTransform: 'uppercase' }}>WEEK RECAP</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {stats.map((s, i) => (
            <View key={i} style={{ flex: 1, backgroundColor: '#222222', borderRadius: 10, padding: 10 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#F0F2F6' }}>{String(s.value)}</Text>
              <Text style={{ fontSize: 10, color: '#555555', marginTop: 2 }}>{s.label}</Text>
            </View>
          ))}
        </View>
        {data.summary ? (
          <Text style={{ fontSize: 13, fontStyle: 'italic', color: '#F0F2F6', lineHeight: 18 }}>{data.summary}</Text>
        ) : null}
      </View>
    );
  }

  if (ptype === 'milestone') {
    return (
      <View style={{ backgroundColor: 'rgba(28,34,46,0.72)', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', alignItems: 'center', gap: 8 }}>
        <Ionicons name="trophy" size={48} color="#F0F2F6" />
        <Text style={{ fontSize: 18, fontWeight: '700', color: '#F0F2F6', textAlign: 'center' }}>
          {data.badge_name || 'Milestone Reached'}
        </Text>
        {data.description && (
          <Text style={{ fontSize: 13, color: '#555555', textAlign: 'center', lineHeight: 18 }}>{data.description}</Text>
        )}
      </View>
    );
  }

  // generic
  return (
    <View style={{ backgroundColor: 'rgba(28,34,46,0.72)', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', gap: 4 }}>
      {data.title ? <Text style={{ fontSize: 15, fontWeight: '700', color: '#F0F2F6' }}>{data.title}</Text> : null}
      {data.body ? <Text style={{ fontSize: 13, color: '#888888', lineHeight: 18 }}>{data.body}</Text> : null}
    </View>
  );
}

// ── PostCard ──────────────────────────────────────────────────────────────────

function PostCard({ post, currentUserId, onLike, onComment, onDeletePost, onProfilePress, onMenuPress }: {
  post: Post;
  currentUserId: string;
  onLike: (postId: string) => void;
  onComment: (post: Post) => void;
  onDeletePost: (postId: string) => void;
  onProfilePress: (userId: string) => void;
  onMenuPress: (post: Post) => void;
}) {
  const lastTapRef = useRef<number>(0);

  const heartAnim = useRef(new Animated.Value(0)).current;
  const heartOpacity = useRef(new Animated.Value(0)).current;

  const handlePhotoDoubleTap = () => {
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      heartAnim.setValue(0);
      heartOpacity.setValue(1);
      Animated.parallel([
        Animated.spring(heartAnim, { toValue: 1.3, useNativeDriver: true, friction: 3 }),
        Animated.sequence([
          Animated.delay(300),
          Animated.timing(heartOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
        ]),
      ]).start();
      onLike(post.id);
    }
    lastTapRef.current = now;
  };

  return (
    <View style={{
      backgroundColor: 'rgba(28,34,46,0.72)', borderRadius: 16, borderWidth: 1, borderColor: '#242424', overflow: 'hidden',
    }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12, gap: 12 }}>
        <TouchableOpacity
          onPress={() => post.author?.id && onProfilePress(post.author.id)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 11, flex: 1 }}
          activeOpacity={0.7}
        >
          <Avatar initials={post.author?.initials ?? '?'} avatarUrl={post.author?.avatar_url} size={40} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: '#F0F2F6', letterSpacing: 0.1 }} numberOfLines={1}>{post.author?.display_name ?? 'Unknown'}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={{ fontSize: 12, color: '#525E72' }}>@{post.author?.username ?? 'unknown'}</Text>
              <Text style={{ fontSize: 12, color: '#525E72' }}>·</Text>
              <Text style={{ fontSize: 12, color: '#525E72' }}>{post.time_ago}</Text>
              {post.location_text ? (
                <>
                  <Text style={{ fontSize: 12, color: '#525E72' }}>·</Text>
                  <Ionicons name="location-outline" size={11} color="#525E72" />
                  <Text style={{ color: '#525E72', fontSize: 12 }} numberOfLines={1}>{post.location_text}</Text>
                </>
              ) : null}
            </View>
          </View>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onMenuPress(post)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="ellipsis-horizontal" size={18} color="#555555" />
        </TouchableOpacity>
      </View>

      {/* Photo */}
      {post.photo_url && (
        <TouchableOpacity activeOpacity={1} onPress={handlePhotoDoubleTap} style={{ position: 'relative' }}>
          <Image
            source={{ uri: post.photo_url }}
            style={{ width: '100%', aspectRatio: 1 }}
            resizeMode="cover"
          />
          <Animated.View pointerEvents="none" style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Animated.View style={{ transform: [{ scale: heartAnim }], opacity: heartOpacity }}>
              <Ionicons name="heart" size={80} color="#e74c3c" />
            </Animated.View>
          </Animated.View>
        </TouchableOpacity>
      )}

      {/* ORYX data card */}
      {post.oryx_data_card_json && (
        <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 }}>
          <OryxDataCard data={post.oryx_data_card_json} />
        </View>
      )}

      {/* Caption */}
      {post.caption ? (
        <View style={{ paddingHorizontal: 16, paddingTop: post.photo_url ? 10 : 4, paddingBottom: 4 }}>
          <Text style={{ color: '#d8d8d8', fontSize: 14, lineHeight: 22 }} numberOfLines={3}>
            <Text style={{ fontWeight: '700', color: '#F0F2F6' }}>{post.author?.display_name || 'Athlete'} </Text>
            {post.caption}
          </Text>
          {post.caption.length > 100 && (
            <TouchableOpacity style={{ marginTop: 4 }}>
              <Text style={{ color: '#525E72', fontSize: 13 }}>more</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : null}

      {/* Club pill */}
      {post.club_id && (
        <View style={{ paddingHorizontal: 16, marginBottom: 2 }}>
          <Text style={{ fontSize: 11, color: '#555555' }}>Posted in a club</Text>
        </View>
      )}

      {/* Footer */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, marginTop: 4, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', gap: 20 }}>
        <TouchableOpacity onPress={() => onLike(post.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }} activeOpacity={0.7}>
          <Ionicons
            name={post.is_liked_by_current_user ? 'heart' : 'heart-outline'}
            size={22}
            color={post.is_liked_by_current_user ? '#e74c3c' : '#525E72'}
          />
          <Text style={{ fontSize: 14, fontWeight: '500', color: '#525E72' }}>{post.like_count ?? 0}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => onComment(post)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }} activeOpacity={0.7}>
          <Ionicons name="chatbubble-outline" size={20} color="#525E72" />
          <Text style={{ fontSize: 14, fontWeight: '500', color: '#525E72' }}>{post.comment_count ?? 0}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Leaderboard List ──────────────────────────────────────────────────────────

function LeaderboardList({ leaderboard, metric, onProfilePress }: { leaderboard: LeaderboardResponse; metric: string; onProfilePress: (userId: string) => void }) {
  const rankColor = (rank: number) => {
    if (rank === 1) return '#FFD700';
    if (rank === 2) return '#C0C0C0';
    if (rank === 3) return '#CD7F32';
    return '#F0F2F6';
  };

  const formatValue = (v: number) => {
    if (metric === 'steps') return v.toLocaleString();
    return String(v);
  };

  const medalEmoji = (rank: number) => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    return '🥉';
  };

  return (
    <View style={{ gap: 6 }}>
      {leaderboard.countdown ? (
        <Text style={{ fontSize: 12, color: '#555555', textAlign: 'center', marginBottom: 8 }}>
          Resets in {leaderboard.countdown}
        </Text>
      ) : null}

      {leaderboard.leaderboard.map((entry) => (
        <TouchableOpacity
          key={entry.user_id}
          onPress={() => !entry.is_current_user && onProfilePress(entry.user_id)}
          activeOpacity={entry.is_current_user ? 1 : 0.7}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            padding: 12,
            backgroundColor: entry.is_current_user ? 'rgba(28,34,46,0.72)' : 'transparent',
            borderRadius: 12,
            borderWidth: entry.is_current_user ? 1 : 0,
            borderColor: 'rgba(255,255,255,0.10)',
            gap: 10,
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: '700', color: rankColor(entry.rank), width: 28, textAlign: 'center' }}>
            {entry.rank}
          </Text>
          <Avatar initials={entry.initials} avatarUrl={entry.avatar_url} size={32} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontSize: 14, color: '#F0F2F6', fontWeight: entry.is_current_user ? '700' : '400' }}>{entry.display_name}</Text>
            {entry.sport_tags?.length > 0 && (
              <View style={{ flexDirection: 'row', gap: 4 }}>
                {entry.sport_tags.slice(0, 2).map((t, i) => <SportPill key={i} tag={t} />)}
              </View>
            )}
          </View>
          <Text style={{ fontSize: 14, fontWeight: '700', color: '#F0F2F6' }}>{formatValue(entry.value)}</Text>
        </TouchableOpacity>
      ))}

      {/* Current user pinned if not in top 10 */}
      {leaderboard.my_entry && leaderboard.my_rank != null && leaderboard.my_rank > 10 && (
        <>
          <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.10)', marginVertical: 4 }} />
          <Text style={{ fontSize: 11, color: '#555555', textAlign: 'center' }}>You are ranked {leaderboard.my_rank}th this week</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: 'rgba(28,34,46,0.72)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', gap: 10 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#F0F2F6', width: 28, textAlign: 'center' }}>{leaderboard.my_rank}</Text>
            <Avatar initials={leaderboard.my_entry.initials} avatarUrl={leaderboard.my_entry.avatar_url} size={32} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, color: '#F0F2F6', fontWeight: '700' }}>{leaderboard.my_entry.display_name}</Text>
            </View>
            <Text style={{ fontSize: 14, fontWeight: '700', color: '#F0F2F6' }}>{formatValue(leaderboard.my_entry.value)}</Text>
          </View>
        </>
      )}

      {/* Last week champions */}
      {leaderboard.last_week_top3 && leaderboard.last_week_top3.length > 0 && (
        <View style={{ marginTop: 16, gap: 8 }}>
          <Text style={{ fontSize: 10, color: '#555555', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4 }}>LAST WEEK'S CHAMPIONS</Text>
          {leaderboard.last_week_top3.map((entry) => (
            <View key={entry.rank} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}>
              <Text style={{ fontSize: 16 }}>{medalEmoji(entry.rank)}</Text>
              <Text style={{ fontSize: 14, color: '#F0F2F6', flex: 1 }}>{entry.display_name}</Text>
              <Text style={{ fontSize: 13, color: '#888888' }}>{formatValue(entry.value)}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function CommunityScreen() {
  const { theme } = useTheme();
  const s = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();
  const user = useAuthStore((state) => state.user);
  const updateUser = useAuthStore((state) => state.updateUser);
  const currentUserId = user?.id ?? '';

  // Tab state
  const [activeTab, setActiveTab] = useState<'feed' | 'clubs' | 'leaderboard'>('feed');

  // Feed state
  const [feedPosts, setFeedPosts] = useState<Post[]>([]);
  const [feedPage, setFeedPage] = useState(0);
  const [feedHasMore, setFeedHasMore] = useState(false);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedRefreshing, setFeedRefreshing] = useState(false);
  const [followingCount, setFollowingCount] = useState(0);

  // Suggestions
  const [suggestions, setSuggestions] = useState<UserPreview[]>([]);
  const [followingState, setFollowingState] = useState<Record<string, boolean>>({});

  // Clubs state
  const [allClubs, setAllClubs] = useState<CommunityClub[]>([]);
  const [myClubs, setMyClubs] = useState<CommunityClub[]>([]);
  const [clubsLoading, setClubsLoading] = useState(false);
  const [clubsLoaded, setClubsLoaded] = useState(false);

  // Leaderboard state
  const [selectedClubId, setSelectedClubId] = useState<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardResponse | null>(null);
  const [leaderboardMetric, setLeaderboardMetric] = useState<'training_load' | 'sessions' | 'steps'>('training_load');
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);

  // Club detail state
  const [showClubDetail, setShowClubDetail] = useState(false);
  const [clubDetail, setClubDetail] = useState<ClubDetail | null>(null);
  const [clubDetailTab, setClubDetailTab] = useState<'feed' | 'members' | 'leaderboard'>('members');
  const [clubDetailLeaderboard, setClubDetailLeaderboard] = useState<LeaderboardResponse | null>(null);
  const [clubDetailLoading, setClubDetailLoading] = useState(false);
  const [clubMemberFollowState, setClubMemberFollowState] = useState<Record<string, boolean>>({});

  // Story creator / post creator state
  const [storyCreatorVisible, setStoryCreatorVisible] = useState(false);
  const [postCreatorVisible, setPostCreatorVisible] = useState(false);
  const [createMenuVisible, setCreateMenuVisible] = useState(false);

  // Comments state
  const [showComments, setShowComments] = useState(false);
  const [activePost, setActivePost] = useState<Post | null>(null);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [commentInput, setCommentInput] = useState('');
  const [commentLoading, setCommentLoading] = useState(false);

  // Search state
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserPreview[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchFollowState, setSearchFollowState] = useState<Record<string, boolean>>({});

  // New search modal (full-screen with tabs)
  const [searchVisible, setSearchVisible] = useState(false);

  // Feed filter
  const [feedFilter, setFeedFilter] = useState<string>('all');

  // Post action menu state
  const [menuPost, setMenuPost] = useState<any>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [editCaptionPost, setEditCaptionPost] = useState<any>(null);
  const [editCaptionText, setEditCaptionText] = useState('');

  // Athlete profile modal
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [showAthleteProfile, setShowAthleteProfile] = useState(false);

  // Post detail modal
  const [showPostDetail, setShowPostDetail] = useState(false);
  const [detailPost, setDetailPost] = useState<Post | null>(null);

  // Unused but required by spec
  const [showFollowers, setShowFollowers] = useState(false);
  const [showFollowing, setShowFollowing] = useState(false);

  // Stories state
  const [storyGroups, setStoryGroups] = useState<StoryGroup[]>([]);
  const [storiesLoading, setStoriesLoading] = useState(false);
  const [storyViewerVisible, setStoryViewerVisible] = useState(false);
  const [storyViewerGroupIdx, setStoryViewerGroupIdx] = useState(0);

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Data Loading ────────────────────────────────────────────────────────────

  const loadFeed = useCallback(async (page = 0, refresh = false, filter?: string) => {
    if (feedLoading && !refresh) return;
    try {
      if (refresh) {
        setFeedRefreshing(true);
      } else if (page === 0) {
        setFeedLoading(true);
      }
      const activeFilter = filter !== undefined ? filter : feedFilter;
      let res: any;
      if (activeFilter && activeFilter !== 'all') {
        const axiosRes = await apiClient.get(`/feed?page=${page}&limit=20&filter=${encodeURIComponent(activeFilter)}`);
        res = axiosRes.data;
      } else {
        res = await getFeed(page, 20);
      }
      if (page === 0 || refresh) {
        setFeedPosts(res.posts);
      } else {
        setFeedPosts((prev) => [...prev, ...res.posts]);
      }
      setFeedPage(res.page);
      setFeedHasMore(res.has_more);
      setFollowingCount(res.following_count);
    } catch {
      // silent fail
    } finally {
      setFeedLoading(false);
      setFeedRefreshing(false);
    }
  }, [feedFilter]);

  const loadSuggestions = useCallback(async () => {
    try {
      const res = await getSuggestions();
      setSuggestions(res.suggestions);
    } catch {
      // silent fail
    }
  }, []);

  const loadClubs = useCallback(async () => {
    if (clubsLoaded) return;
    setClubsLoading(true);
    try {
      const [mine, all] = await Promise.all([getMyClubs(), getClubs()]);
      setMyClubs(mine.clubs);
      setAllClubs(all.clubs);
      setClubsLoaded(true);
    } catch {
      // silent fail
    } finally {
      setClubsLoading(false);
    }
  }, [clubsLoaded]);

  const loadStories = useCallback(async () => {
    setStoriesLoading(true);
    try {
      const data = await getStoriesFeed();
      setStoryGroups(data.story_groups || []);
    } catch {}
    finally { setStoriesLoading(false); }
  }, []);

  const openStoryViewer = useCallback((groupIdx: number) => {
    setStoryViewerGroupIdx(groupIdx);
    setStoryViewerVisible(true);
  }, []);

  const markStorySeen = useCallback((storyId: string, groupUserId: string) => {
    setStoryGroups(prev => prev.map(g => {
      if (g.user_id !== groupUserId) return g;
      return {
        ...g,
        stories: g.stories.map(s => s.id === storyId ? { ...s, is_seen: true } : s),
        has_unseen_story: g.stories.some(s => s.id !== storyId && !s.is_seen),
      };
    }));
  }, []);

  const handleDeleteStory = useCallback(async (storyId: string) => {
    try {
      await deleteStory(storyId);
      setStoryGroups(prev => {
        const updated = prev.map(g => ({
          ...g,
          stories: g.stories.filter(s => s.id !== storyId),
        })).filter(g => g.stories.length > 0);
        return updated;
      });
      setStoryViewerVisible(false);
    } catch {
      // silent — story stays visible if delete fails
    }
  }, []);

  const loadLeaderboard = useCallback(async (clubId: string, metric: string) => {
    setLeaderboardLoading(true);
    try {
      const res = await getClubLeaderboard(clubId, metric);
      setLeaderboard(res);
    } catch {
      setLeaderboard(null);
    } finally {
      setLeaderboardLoading(false);
    }
  }, []);

  // Mount: load feed + suggestions, auto-join clubs silently
  useEffect(() => {
    loadFeed(0);
    loadSuggestions();
    loadStories();
    autoJoinClubs().catch(() => {});
  }, []);

  // Reload feed when filter changes
  useEffect(() => {
    loadFeed(0, false, feedFilter);
  }, [feedFilter]);

  // useFocusEffect: refresh feed when tab gains focus
  useFocusEffect(
    useCallback(() => {
      loadFeed(0, true);
      loadStories();
    }, [])
  );

  // Tab switching effects
  useEffect(() => {
    if (activeTab === 'clubs') {
      loadClubs();
    }
    if (activeTab === 'leaderboard') {
      loadClubs();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'leaderboard' && myClubs.length > 0 && selectedClubId === null) {
      setSelectedClubId(myClubs[0].id);
      loadLeaderboard(myClubs[0].id, leaderboardMetric);
    }
  }, [activeTab, myClubs, selectedClubId, leaderboardMetric]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleLike = useCallback(async (postId: string) => {
    const post = feedPosts.find(p => p.id === postId);
    if (!post) return;
    const wasLiked = post.is_liked_by_current_user;
    // Optimistic update
    setFeedPosts(prev => prev.map(p => p.id === postId ? {
      ...p,
      is_liked_by_current_user: !wasLiked,
      like_count: wasLiked ? Math.max(0, (p.like_count || 0) - 1) : (p.like_count || 0) + 1,
    } : p));
    try {
      if (wasLiked) await unlikePost(postId);
      else await likePost(postId);
    } catch {
      // revert
      setFeedPosts(prev => prev.map(p => p.id === postId ? {
        ...p,
        is_liked_by_current_user: wasLiked,
        like_count: post.like_count,
      } : p));
    }
  }, [feedPosts]);

  const handleOpenComments = useCallback(async (post: Post) => {
    setActivePost(post);
    setShowComments(true);
    setCommentLoading(true);
    try {
      const res = await getPostComments(post.id);
      setComments(res.comments);
    } catch {
      setComments([]);
    } finally {
      setCommentLoading(false);
    }
  }, []);

  const handleSendComment = useCallback(async () => {
    if (!activePost || !commentInput.trim()) return;
    const text = commentInput.trim();
    setCommentInput('');
    try {
      const res = await addComment(activePost.id, text);
      setComments((prev) => [...prev, res.comment]);
      setFeedPosts((prev) =>
        prev.map((p) => p.id === activePost.id ? { ...p, comment_count: (p.comment_count || 0) + 1 } : p)
      );
    } catch {
      // silent
    }
  }, [activePost, commentInput]);

  const handleDeleteComment = useCallback(async (commentId: string) => {
    if (!activePost) return;
    setComments((prev) => prev.filter((c) => c.id !== commentId));
    try {
      await deleteComment(activePost.id, commentId);
    } catch {
      // silent
    }
  }, [activePost]);

  const handleDeletePost = useCallback(async (postId: string) => {
    setFeedPosts((prev) => prev.filter((p) => p.id !== postId));
    try {
      await deletePost(postId);
    } catch {
      // silent
    }
  }, []);

  const handleFollow = useCallback(async (userId: string, currentlyFollowing: boolean) => {
    setFollowingState((prev) => ({ ...prev, [userId]: !currentlyFollowing }));
    setSuggestions((prev) =>
      prev.map((s) => s.id === userId ? { ...s, is_following: !currentlyFollowing } : s)
    );
    try {
      if (currentlyFollowing) {
        const res = await unfollowUser(userId);
        if (res.following_count != null) updateUser({ following_count: res.following_count });
      } else {
        const res = await followUser(userId);
        setFollowingCount((c) => c + 1);
        if (res.following_count != null) updateUser({ following_count: res.following_count });
      }
    } catch {
      setFollowingState((prev) => ({ ...prev, [userId]: currentlyFollowing }));
    }
  }, [updateUser]);

  const handleSearchFollow = useCallback(async (userId: string, currentlyFollowing: boolean) => {
    setSearchFollowState((prev) => ({ ...prev, [userId]: !currentlyFollowing }));
    setSearchResults((prev) =>
      prev.map((u) => u.id === userId ? { ...u, is_following: !currentlyFollowing } : u)
    );
    try {
      if (currentlyFollowing) {
        const res = await unfollowUser(userId);
        if (res.following_count != null) updateUser({ following_count: res.following_count });
      } else {
        const res = await followUser(userId);
        if (res.following_count != null) updateUser({ following_count: res.following_count });
      }
    } catch {
      setSearchFollowState((prev) => ({ ...prev, [userId]: currentlyFollowing }));
    }
  }, [updateUser]);

  const handleSearchChange = useCallback((text: string) => {
    setSearchQuery(text);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!text.trim()) {
      setSearchResults([]);
      return;
    }
    searchTimerRef.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await searchUsers(text.trim());
        setSearchResults(res.users);
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
  }, []);

  const handleOpenClubDetail = useCallback(async (clubId: string) => {
    setShowClubDetail(true);
    setClubDetailTab('members');
    setClubDetailLoading(true);
    setClubDetailLeaderboard(null);
    try {
      const detail = await getClubDetail(clubId);
      setClubDetail(detail);
    } catch {
      setClubDetail(null);
    } finally {
      setClubDetailLoading(false);
    }
  }, []);

  const handleJoinLeaveClub = useCallback(async (club: CommunityClub) => {
    const wasMember = club.is_member;
    const updateClub = (c: CommunityClub) =>
      c.id === club.id
        ? { ...c, is_member: !wasMember, member_count: c.member_count + (wasMember ? -1 : 1) }
        : c;
    setAllClubs((prev) => prev.map(updateClub));
    setMyClubs((prev) =>
      wasMember ? prev.filter((c) => c.id !== club.id) : [...prev, { ...club, is_member: true }]
    );
    if (clubDetail?.club.id === club.id) {
      setClubDetail((prev) => prev ? { ...prev, club: { ...prev.club, is_member: !wasMember } } : prev);
    }
    try {
      if (wasMember) {
        await leaveClub(club.id);
      } else {
        await joinClub(club.id);
      }
    } catch {
      // revert
      setAllClubs((prev) => prev.map((c) => c.id === club.id ? club : c));
    }
  }, [clubDetail]);

  const handleLeaderboardClubSelect = useCallback((clubId: string) => {
    setSelectedClubId(clubId);
    setLeaderboard(null);
    loadLeaderboard(clubId, leaderboardMetric);
  }, [leaderboardMetric, loadLeaderboard]);

  const handleLeaderboardMetricChange = useCallback((metric: 'training_load' | 'sessions' | 'steps') => {
    setLeaderboardMetric(metric);
    if (selectedClubId) {
      loadLeaderboard(selectedClubId, metric);
    }
  }, [selectedClubId, loadLeaderboard]);

  const handleOpenPostDetail = useCallback((post: Post) => {
    setDetailPost(post);
    setShowPostDetail(true);
  }, []);

  const handleMemberFollow = useCallback(async (userId: string) => {
    const current = clubMemberFollowState[userId] ?? false;
    setClubMemberFollowState((prev) => ({ ...prev, [userId]: !current }));
    try {
      if (current) {
        await unfollowUser(userId);
      } else {
        await followUser(userId);
      }
    } catch {
      setClubMemberFollowState((prev) => ({ ...prev, [userId]: current }));
    }
  }, [clubMemberFollowState]);

  // ── Feed Tab ─────────────────────────────────────────────────────────────────

  const renderFeedTab = () => (
    <FlatList
      data={feedPosts}
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 80 }}
      refreshControl={
        <RefreshControl
          refreshing={feedRefreshing}
          onRefresh={() => loadFeed(0, true)}
          tintColor="#555555"
        />
      }
      onEndReached={() => { if (feedHasMore && !feedLoading) loadFeed(feedPage + 1); }}
      onEndReachedThreshold={0.4}
      ListHeaderComponent={
        <>
          {/* Follow suggestions */}
          {followingCount < 5 && suggestions.length > 0 && (
            <View style={{ marginBottom: 16 }}>
              <Text style={s.sectionLabel}>SUGGESTED ATHLETES</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                <View style={{ flexDirection: 'row', gap: 10, paddingRight: 16 }}>
                  {suggestions.map((sug) => {
                    const isFollowing = followingState[sug.id] ?? sug.is_following ?? false;
                    return (
                      <TouchableOpacity
                        key={sug.id}
                        onPress={() => { setProfileUserId(sug.id); setShowAthleteProfile(true); }}
                        style={{
                          backgroundColor: 'rgba(28,34,46,0.72)', borderRadius: 14, padding: 14,
                          borderWidth: 1, borderColor: '#242424', width: 148, gap: 8,
                        }}
                        activeOpacity={0.8}
                      >
                        <Avatar initials={sug.initials} avatarUrl={sug.avatar_url} size={48} />
                        <Text style={{ fontSize: 14, fontWeight: '700', color: '#F0F2F6', lineHeight: 19 }} numberOfLines={1}>
                          {sug.display_name}
                        </Text>
                        <View style={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap' }}>
                          {sug.sport_tags.slice(0, 2).map((t, i) => <SportPill key={i} tag={t} />)}
                        </View>
                        <TouchableOpacity
                          onPress={(e) => { e.stopPropagation(); handleFollow(sug.id, isFollowing); }}
                          style={{
                            backgroundColor: isFollowing ? 'rgba(255,255,255,0.10)' : '#F0F2F6',
                            borderRadius: 8, paddingVertical: 7, alignItems: 'center',
                            borderWidth: isFollowing ? 1 : 0, borderColor: 'rgba(255,255,255,0.10)',
                          }}
                          activeOpacity={0.75}
                        >
                          <Text style={{ fontSize: 12, fontWeight: '600', color: isFollowing ? '#8B95A8' : '#141820' }}>
                            {isFollowing ? 'Following' : 'Follow'}
                          </Text>
                        </TouchableOpacity>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
            </View>
          )}
        {/* ── Story Row ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 12 }}
          style={{ marginBottom: 4 }}
        >
          {/* Own bubble — always first */}
          {(() => {
            const ownGroup = storyGroups.find(g => g.is_own);
            const hasStory = ownGroup && ownGroup.stories.length > 0;
            const rawRingColor = ownGroup?.stories[0]?.oryx_data_overlay_json?.readiness_color ?? '#555555';
            const ringColor = rawRingColor === '#555555' ? '#F0F2F6' : rawRingColor;
            const borderColor = hasStory ? ringColor : '#525E72';
            return (
              <TouchableOpacity
                key="own"
                style={{ alignItems: 'center', gap: 6 }}
                onPress={() => {
                  if (hasStory && ownGroup) {
                    openStoryViewer(storyGroups.indexOf(ownGroup));
                  } else {
                    setStoryCreatorVisible(true);
                  }
                }}
                activeOpacity={0.8}
              >
                <View style={{
                  width: 72, height: 72, borderRadius: 36,
                  borderWidth: 2, borderColor: hasStory ? borderColor : '#525E72',
                  borderStyle: hasStory ? 'solid' : 'dashed',
                  padding: 3, alignItems: 'center', justifyContent: 'center',
                }}>
                  <Avatar
                    initials={user?.display_name ? user.display_name.split(' ').map((p: string) => p[0]).join('').slice(0, 2).toUpperCase() : '?'}
                    size={60}
                  />
                  {!hasStory && (
                    <View style={{
                      position: 'absolute', bottom: 0, right: 0,
                      width: 20, height: 20, borderRadius: 10,
                      backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center',
                      borderWidth: 2, borderColor: '#141820',
                    }}>
                      <Ionicons name="add" size={13} color="#000000" />
                    </View>
                  )}
                </View>
                <Text style={{ fontSize: 11, color: '#525E72', maxWidth: 72, textAlign: 'center' }} numberOfLines={1}>
                  Your Story
                </Text>
              </TouchableOpacity>
            );
          })()}

          {/* Others' bubbles */}
          {storyGroups.filter(g => !g.is_own).map((group, i) => {
            const rawRingColor = group.stories[0]?.oryx_data_overlay_json?.readiness_color || '#555555';
            const ringColor = rawRingColor === '#555555' ? '#F0F2F6' : rawRingColor;
            const allSeen = !group.has_unseen_story;
            const borderColor = allSeen ? ringColor + '66' : ringColor;
            const groupIdx = storyGroups.indexOf(group);
            return (
              <TouchableOpacity
                key={group.user_id}
                style={{ alignItems: 'center', gap: 6 }}
                onPress={() => openStoryViewer(groupIdx)}
                activeOpacity={0.8}
              >
                <View style={{
                  width: 72, height: 72, borderRadius: 36,
                  borderWidth: 3, borderColor, padding: 3,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Avatar initials={group.initials} avatarUrl={group.avatar_url} size={60} />
                </View>
                <Text style={{ fontSize: 11, color: '#525E72', maxWidth: 72, textAlign: 'center' }} numberOfLines={1}>
                  {group.display_name.split(' ')[0].slice(0, 8)}
                </Text>
              </TouchableOpacity>
            );
          })}

          {/* Empty message if no others */}
          {storyGroups.filter(g => !g.is_own).length === 0 && (
            <View style={{ justifyContent: 'center', paddingLeft: 8 }}>
              <Text style={{ fontSize: 12, color: '#555555', fontStyle: 'italic' }}>
                No stories yet today
              </Text>
            </View>
          )}
        </ScrollView>

        {/* Filter bar */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4, marginBottom: 8 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
          {(['All', 'Following', 'Clubs', 'Workouts', 'Insights', 'Recaps'] as const).map(f => (
            <TouchableOpacity
              key={f}
              onPress={() => setFeedFilter(f.toLowerCase() as any)}
              style={{
                paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
                backgroundColor: feedFilter === f.toLowerCase() ? '#5b9bd5' : 'rgba(28,34,46,0.72)',
                borderWidth: 1, borderColor: feedFilter === f.toLowerCase() ? '#5b9bd5' : 'rgba(255,255,255,0.10)',
              }}
              activeOpacity={0.75}
            >
              <Text style={{ color: feedFilter === f.toLowerCase() ? '#F0F2F6' : '#8B95A8', fontSize: 13, fontWeight: '600' }}>{f}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        </>
      }
      ListEmptyComponent={
        feedLoading ? (
          <View style={{ flex: 1, alignItems: 'center', paddingTop: 60 }}>
            <ActivityIndicator color="#555555" />
          </View>
        ) : (
          <View style={{ alignItems: 'center', paddingTop: 60, gap: 12 }}>
            <Ionicons name="people-outline" size={48} color="rgba(255,255,255,0.10)" />
            <Text style={{ fontSize: 15, color: '#555555', textAlign: 'center', paddingHorizontal: 32 }}>
              Follow other athletes to see their posts here
            </Text>
            <TouchableOpacity
              onPress={() => setShowSearch(true)}
              style={{ backgroundColor: 'rgba(28,34,46,0.72)', borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', marginTop: 4 }}
            >
              <Text style={{ fontSize: 14, color: '#F0F2F6', fontWeight: '600' }}>Find Athletes</Text>
            </TouchableOpacity>
          </View>
        )
      }
      ListFooterComponent={
        feedHasMore && feedPage > 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 16 }}>
            <ActivityIndicator color="#555555" />
          </View>
        ) : null
      }
      renderItem={({ item }) => (
        <PostCard
          post={item}
          currentUserId={currentUserId}
          onLike={handleLike}
          onComment={handleOpenComments}
          onDeletePost={handleDeletePost}
          onProfilePress={(userId) => { setProfileUserId(userId); setShowAthleteProfile(true); }}
          onMenuPress={(post) => { setMenuPost(post); setShowMenu(true); }}
        />
      )}
    />
  );

  // ── Clubs Tab ─────────────────────────────────────────────────────────────────

  const renderClubsTab = () => (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: insets.bottom + 80 }}>
      {/* My Clubs */}
      <View>
        <Text style={s.sectionLabel}>MY CLUBS</Text>
        {myClubs.length === 0 ? (
          <Text style={{ fontSize: 13, color: '#555555', marginTop: 10 }}>No clubs joined yet</Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
            <View style={{ flexDirection: 'row', gap: 14, paddingRight: 16 }}>
              {myClubs.map((club) => (
                <TouchableOpacity
                  key={club.id}
                  onPress={() => handleOpenClubDetail(club.id)}
                  style={{ width: 72, alignItems: 'center', gap: 6 }}
                >
                  {club.cover_image && COVER_IMAGES[club.cover_image] ? (
                    <Image
                      source={COVER_IMAGES[club.cover_image]}
                      style={{ width: 72, height: 72, borderRadius: 36 }}
                    />
                  ) : (
                    <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(28,34,46,0.72)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="people" size={28} color="#555555" />
                    </View>
                  )}
                  <Text style={{ fontSize: 10, color: '#F0F2F6', textAlign: 'center', width: 72 }} numberOfLines={2}>
                    {club.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        )}
      </View>

      {/* Discover */}
      <View>
        <Text style={s.sectionLabel}>DISCOVER</Text>
        {clubsLoading ? (
          <ActivityIndicator color="#555555" style={{ marginTop: 20 }} />
        ) : (
          <View style={{ gap: 10, marginTop: 12 }}>
            {allClubs.map((club) => (
              <TouchableOpacity
                key={club.id}
                onPress={() => handleOpenClubDetail(club.id)}
                style={{ backgroundColor: 'rgba(28,34,46,0.72)', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#242424', flexDirection: 'row', alignItems: 'center', gap: 14 }}
                activeOpacity={0.75}
              >
                {club.cover_image && COVER_IMAGES[club.cover_image] ? (
                  <Image source={COVER_IMAGES[club.cover_image]} style={{ width: 52, height: 52, borderRadius: 12 }} />
                ) : (
                  <View style={{ width: 52, height: 52, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="people" size={22} color="#525E72" />
                  </View>
                )}
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#F0F2F6' }}>{club.name}</Text>
                  {club.description && (
                    <Text style={{ fontSize: 13, color: '#8B95A8', lineHeight: 18 }} numberOfLines={1}>{club.description}</Text>
                  )}
                  <Text style={{ fontSize: 12, color: '#525E72' }}>{club.member_count} members</Text>
                </View>
                <TouchableOpacity
                  onPress={() => handleJoinLeaveClub(club)}
                  style={{
                    borderRadius: 20,
                    paddingHorizontal: 14,
                    paddingVertical: 6,
                    backgroundColor: club.is_member ? 'transparent' : '#F0F2F6',
                    borderWidth: club.is_member ? 1 : 0,
                    borderColor: '#555555',
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: club.is_member ? '#888888' : '#141820' }}>
                    {club.is_member ? 'Leave' : 'Join'}
                  </Text>
                </TouchableOpacity>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>
    </ScrollView>
  );

  // ── Leaderboard Tab ───────────────────────────────────────────────────────────

  const renderLeaderboardTab = () => {
    if (myClubs.length === 0 && !clubsLoading) {
      return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32 }}>
          <Ionicons name="trophy-outline" size={48} color="rgba(255,255,255,0.10)" />
          <Text style={{ fontSize: 15, color: '#555555', textAlign: 'center' }}>
            Join clubs to see leaderboards
          </Text>
          <TouchableOpacity
            onPress={() => setActiveTab('clubs')}
            style={{ backgroundColor: 'rgba(28,34,46,0.72)', borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', marginTop: 4 }}
          >
            <Text style={{ fontSize: 14, color: '#F0F2F6', fontWeight: '600' }}>Discover Clubs</Text>
          </TouchableOpacity>
        </View>
      );
    }

    const metricLabels: { key: 'training_load' | 'sessions' | 'steps'; label: string }[] = [
      { key: 'training_load', label: 'Training Load' },
      { key: 'sessions', label: 'Sessions' },
      { key: 'steps', label: 'Steps' },
    ];

    return (
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 80 }}>
        {/* Club selector */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {myClubs.map((club) => (
              <TouchableOpacity
                key={club.id}
                onPress={() => handleLeaderboardClubSelect(club.id)}
                style={{
                  borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7,
                  backgroundColor: selectedClubId === club.id ? 'rgba(28,34,46,0.72)' : 'transparent',
                  borderWidth: 1,
                  borderColor: selectedClubId === club.id ? '#F0F2F6' : 'rgba(255,255,255,0.10)',
                }}
              >
                <Text style={{ fontSize: 13, color: selectedClubId === club.id ? '#F0F2F6' : '#555555', fontWeight: selectedClubId === club.id ? '600' : '400' }}>
                  {club.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        {/* Metric toggles */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
          {metricLabels.map(({ key, label }) => (
            <TouchableOpacity
              key={key}
              onPress={() => handleLeaderboardMetricChange(key)}
              style={{
                borderRadius: 16, paddingHorizontal: 12, paddingVertical: 5,
                backgroundColor: leaderboardMetric === key ? 'rgba(28,34,46,0.72)' : 'transparent',
                borderWidth: 1,
                borderColor: leaderboardMetric === key ? '#F0F2F6' : 'rgba(255,255,255,0.10)',
              }}
            >
              <Text style={{ fontSize: 11, color: leaderboardMetric === key ? '#F0F2F6' : '#555555' }}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {leaderboardLoading ? (
          <ActivityIndicator color="#555555" style={{ marginTop: 40 }} />
        ) : leaderboard ? (
          <LeaderboardList leaderboard={leaderboard} metric={leaderboardMetric} onProfilePress={(userId) => { setProfileUserId(userId); setShowAthleteProfile(true); }} />
        ) : (
          <Text style={{ color: '#555555', textAlign: 'center', marginTop: 40 }}>No leaderboard data yet</Text>
        )}
      </ScrollView>
    );
  };

  // ── Club Detail Modal ─────────────────────────────────────────────────────────

  const renderClubDetailModal = () => (
    <Modal
      visible={showClubDetail}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={() => setShowClubDetail(false)}
    >
      <View style={{ flex: 1, backgroundColor: '#141820' }}>
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.10)' }}>
            {clubDetail?.club.cover_image && COVER_IMAGES[clubDetail.club.cover_image] ? (
              <Image source={COVER_IMAGES[clubDetail.club.cover_image]} style={{ width: 44, height: 44, borderRadius: 10 }} />
            ) : (
              <View style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: 'rgba(28,34,46,0.72)', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="people" size={18} color="#555555" />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#F0F2F6' }}>{clubDetail?.club.name || ''}</Text>
              <Text style={{ fontSize: 12, color: '#555555' }}>{clubDetail?.club.member_count ?? 0} members</Text>
            </View>
            <TouchableOpacity onPress={() => setShowClubDetail(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={22} color="#888888" />
            </TouchableOpacity>
          </View>

          {/* Mini tabs */}
          <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.10)' }}>
            {(['feed', 'members', 'leaderboard'] as const).map((tab) => (
              <TouchableOpacity
                key={tab}
                onPress={() => {
                  setClubDetailTab(tab);
                  if (tab === 'leaderboard' && clubDetail && !clubDetailLeaderboard) {
                    getClubLeaderboard(clubDetail.club.id, 'training_load')
                      .then(setClubDetailLeaderboard)
                      .catch(() => {});
                  }
                }}
                style={{
                  flex: 1, paddingVertical: 12, alignItems: 'center',
                  borderBottomWidth: 2,
                  borderBottomColor: clubDetailTab === tab ? '#F0F2F6' : 'transparent',
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: '600', color: clubDetailTab === tab ? '#F0F2F6' : '#555555', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {tab}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {clubDetailLoading ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color="#555555" />
            </View>
          ) : (
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 20 }}>
              {clubDetailTab === 'feed' && (
                <Text style={{ color: '#555555', textAlign: 'center', marginTop: 40 }}>Club feed coming soon</Text>
              )}
              {clubDetailTab === 'members' && (
                <View style={{ gap: 10 }}>
                  {(clubDetail?.members || []).map((member) => {
                    const isMemberFollowing = clubMemberFollowState[member.id] ?? false;
                    const isMe = member.id === currentUserId;
                    return (
                      <View key={member.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: 'rgba(28,34,46,0.72)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' }}>
                        <TouchableOpacity
                          onPress={() => { if (member.id !== currentUserId) { setProfileUserId(member.id); setShowAthleteProfile(true); } }}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}
                          activeOpacity={isMe ? 1 : 0.7}
                        >
                          <Avatar initials={member.initials} avatarUrl={member.avatar_url} size={40} />
                          <View style={{ flex: 1, gap: 4 }}>
                            <Text style={{ fontSize: 14, fontWeight: '600', color: '#F0F2F6' }}>{member.display_name}</Text>
                            <View style={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap' }}>
                              {member.sport_tags.slice(0, 3).map((t, i) => <SportPill key={i} tag={t} />)}
                            </View>
                          </View>
                        </TouchableOpacity>
                        {!isMe && (
                          <TouchableOpacity
                            onPress={() => handleMemberFollow(member.id)}
                            style={{
                              borderRadius: 16, paddingHorizontal: 12, paddingVertical: 5,
                              backgroundColor: isMemberFollowing ? 'transparent' : '#F0F2F6',
                              borderWidth: isMemberFollowing ? 1 : 0,
                              borderColor: '#555555',
                            }}
                          >
                            <Text style={{ fontSize: 12, fontWeight: '600', color: isMemberFollowing ? '#888888' : '#141820' }}>
                              {isMemberFollowing ? 'Following' : 'Follow'}
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}
              {clubDetailTab === 'leaderboard' && (
                clubDetailLeaderboard ? (
                  <LeaderboardList leaderboard={clubDetailLeaderboard} metric="training_load" onProfilePress={(userId) => { setProfileUserId(userId); setShowAthleteProfile(true); }} />
                ) : (
                  <ActivityIndicator color="#555555" style={{ marginTop: 40 }} />
                )
              )}
            </ScrollView>
          )}
        </SafeAreaView>
      </View>
    </Modal>
  );

  // ── Comments Modal ────────────────────────────────────────────────────────────

  const renderCommentsModal = () => (
    <Modal
      visible={showComments}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => { setShowComments(false); setActivePost(null); setComments([]); }}
    >
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: 'rgba(28,34,46,0.72)' }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: '#F0F2F6', flex: 1 }}>
              Comments{comments.length > 0 ? <Text style={{ fontWeight: '400', color: '#525E72' }}> {comments.length}</Text> : null}
            </Text>
            <TouchableOpacity onPress={() => { setShowComments(false); setActivePost(null); setComments([]); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={22} color="#8B95A8" />
            </TouchableOpacity>
          </View>

          {/* Comments list */}
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 16, gap: 20, paddingBottom: 20 }}>
            {commentLoading ? (
              <ActivityIndicator color="#555555" style={{ marginTop: 40 }} />
            ) : comments.length === 0 ? (
              <Text style={{ color: '#525E72', textAlign: 'center', marginTop: 40, fontSize: 14 }}>No comments yet. Be the first.</Text>
            ) : (
              comments.map((comment) => (
                <TouchableOpacity
                  key={comment.id}
                  onLongPress={() => { if (comment.is_own) handleDeleteComment(comment.id); }}
                  activeOpacity={0.9}
                  style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}
                >
                  <TouchableOpacity
                    onPress={() => { setShowComments(false); setTimeout(() => { setProfileUserId(comment.user_id); setShowAthleteProfile(true); }, 300); }}
                    activeOpacity={0.7}
                  >
                    <Avatar initials={comment.initials} avatarUrl={comment.avatar_url} size={34} />
                  </TouchableOpacity>
                  <View style={{ flex: 1, gap: 3 }}>
                    <TouchableOpacity
                      onPress={() => { setShowComments(false); setTimeout(() => { setProfileUserId(comment.user_id); setShowAthleteProfile(true); }, 300); }}
                      activeOpacity={0.7}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: '#F0F2F6' }}>{comment.display_name}</Text>
                        <Text style={{ fontSize: 12, color: '#525E72' }}>{comment.time_ago}</Text>
                      </View>
                    </TouchableOpacity>
                    <Text style={{ fontSize: 14, color: '#d8d8d8', lineHeight: 21 }}>{comment.comment_text}</Text>
                  </View>
                  {comment.is_own && (
                    <TouchableOpacity onPress={() => handleDeleteComment(comment.id)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <Ionicons name="trash-outline" size={15} color="#525E72" />
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              ))
            )}
          </ScrollView>

          {/* Input */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: insets.bottom + 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', gap: 10 }}>
            <Avatar initials={user?.display_name?.substring(0, 2).toUpperCase() || '?'} avatarUrl={null} size={32} />
            <TextInput
              style={{ flex: 1, backgroundColor: 'rgba(28,34,46,0.72)', borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, color: '#F0F2F6', fontSize: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' }}
              placeholder="Add a comment..."
              placeholderTextColor="#525E72"
              value={commentInput}
              onChangeText={setCommentInput}
              multiline
            />
            <TouchableOpacity
              onPress={handleSendComment}
              disabled={!commentInput.trim()}
              style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: commentInput.trim() ? '#F0F2F6' : 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' }}
              activeOpacity={0.75}
            >
              <Ionicons name="send" size={16} color={commentInput.trim() ? '#141820' : '#525E72'} />
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );

  // ── Search Modal ──────────────────────────────────────────────────────────────

  const renderSearchModal = () => (
    <Modal
      visible={showSearch}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => { setShowSearch(false); setSearchQuery(''); setSearchResults([]); }}
    >
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: 'rgba(28,34,46,0.72)' }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.10)', gap: 10 }}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(28,34,46,0.72)', borderRadius: 12, paddingHorizontal: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', gap: 8 }}>
              <Ionicons name="search" size={16} color="#555555" />
              <TextInput
                style={{ flex: 1, paddingVertical: 10, color: '#F0F2F6', fontSize: 15 }}
                placeholder="Search athletes..."
                placeholderTextColor="#555555"
                value={searchQuery}
                onChangeText={handleSearchChange}
                autoFocus
              />
              {searchLoading && <ActivityIndicator size="small" color="#555555" />}
            </View>
            <TouchableOpacity onPress={() => { setShowSearch(false); setSearchQuery(''); setSearchResults([]); }}>
              <Text style={{ fontSize: 15, color: '#888888' }}>Cancel</Text>
            </TouchableOpacity>
          </View>

          {/* Results */}
          <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: insets.bottom + 20 }}>
            {searchResults.map((u) => {
              const isFollowing = searchFollowState[u.id] ?? u.is_following ?? false;
              const isMe = u.id === currentUserId;
              return (
                <TouchableOpacity
                  key={u.id}
                  onPress={() => { setProfileUserId(u.id); setShowAthleteProfile(true); }}
                  activeOpacity={0.8}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: 'rgba(28,34,46,0.72)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)' }}
                >
                  <Avatar initials={u.initials} avatarUrl={u.avatar_url} size={40} />
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: '#F0F2F6' }}>{u.display_name}</Text>
                    <Text style={{ fontSize: 12, color: '#555555' }}>@{u.username}</Text>
                    <View style={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap' }}>
                      {u.sport_tags.slice(0, 3).map((t, i) => <SportPill key={i} tag={t} />)}
                    </View>
                  </View>
                  {!isMe && (
                    <TouchableOpacity
                      onPress={(e) => { e.stopPropagation(); handleSearchFollow(u.id, isFollowing); }}
                      style={{
                        borderRadius: 16, paddingHorizontal: 14, paddingVertical: 6,
                        backgroundColor: isFollowing ? 'transparent' : '#F0F2F6',
                        borderWidth: isFollowing ? 1 : 0,
                        borderColor: '#555555',
                      }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: '600', color: isFollowing ? '#888888' : '#141820' }}>
                        {isFollowing ? 'Following' : 'Follow'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              );
            })}
            {searchQuery.length > 0 && !searchLoading && searchResults.length === 0 && (
              <Text style={{ color: '#555555', textAlign: 'center', marginTop: 30 }}>No athletes found</Text>
            )}
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <AmbientBackdrop />
      {/* Top header — Geist title left, DM / search / + accent button right */}
      <View style={s.header}>
        <Text style={s.headerTitle}>Community</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <CommunityDmIcon />
          <TouchableOpacity onPress={() => setShowSearch(true)} style={s.headerBtn} activeOpacity={0.8}>
            <Ionicons name="search" size={18} color={T.text.body} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setCreateMenuVisible(true)} style={s.headerPlus} activeOpacity={0.85}>
            <Ionicons name="add" size={22} color={T.accentInk} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Filter chips */}
      <View style={s.filterRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
        >
          {(['feed', 'clubs', 'leaderboard'] as const).map((tab) => {
            const label = tab === 'feed' ? 'following' : tab;
            const isActive = activeTab === tab;
            return (
              <TouchableOpacity
                key={tab}
                onPress={() => setActiveTab(tab)}
                style={[s.filterChip, isActive && s.filterChipActive]}
                activeOpacity={0.8}
              >
                <Text style={[s.filterChipText, isActive && s.filterChipTextActive]}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Content */}
      <View style={{ flex: 1 }}>
        {activeTab === 'feed' && renderFeedTab()}
        {activeTab === 'clubs' && renderClubsTab()}
        {activeTab === 'leaderboard' && renderLeaderboardTab()}
      </View>

      {/* Modals */}
      {renderClubDetailModal()}
      {renderCommentsModal()}
      {renderSearchModal()}

      {/* Full-screen search modal */}
      <Modal visible={searchVisible} animationType="slide" onRequestClose={() => setSearchVisible(false)}>
        <SearchScreen onClose={() => setSearchVisible(false)} currentUserId={currentUserId} />
      </Modal>

      {/* Post action menu */}
      <Modal visible={showMenu} transparent animationType="slide" onRequestClose={() => setShowMenu(false)}>
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} onPress={() => setShowMenu(false)} />
        <View style={{ backgroundColor: 'rgba(28,34,46,0.72)', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 32 }}>
          {menuPost?.user_id === currentUserId ? (
            <>
              <MenuOption label="Edit Caption" icon="pencil-outline" onPress={() => { setEditCaptionPost(menuPost); setEditCaptionText(menuPost?.caption || ''); setShowMenu(false); }} />
              <MenuOption label="Pin to Profile" icon="pin-outline" onPress={async () => { try { await apiClient.patch(`/posts/${menuPost?.id}`, { is_pinned: true }); } catch {} setShowMenu(false); }} />
              <MenuOption label="Archive" icon="archive-outline" onPress={async () => { try { await apiClient.patch(`/posts/${menuPost?.id}`, { is_archived: true }); setFeedPosts(prev => prev.filter(p => p.id !== menuPost?.id)); } catch {} setShowMenu(false); }} />
              <MenuOption label="Delete" icon="trash-outline" color="#e74c3c" onPress={async () => { try { await apiClient.delete(`/posts/${menuPost?.id}`); setFeedPosts(prev => prev.filter(p => p.id !== menuPost?.id)); } catch {} setShowMenu(false); }} />
            </>
          ) : (
            <>
              <MenuOption label="Report" icon="flag-outline" color="#e74c3c" onPress={async () => { try { await apiClient.post(`/posts/${menuPost?.id}/report`, { reason: 'inappropriate' }); } catch {} setShowMenu(false); }} />
              <MenuOption label="Not Interested" icon="eye-off-outline" onPress={async () => { try { await apiClient.post(`/posts/${menuPost?.id}/hide`); setFeedPosts(prev => prev.filter(p => p.id !== menuPost?.id)); } catch {} setShowMenu(false); }} />
            </>
          )}
          <TouchableOpacity onPress={() => setShowMenu(false)} style={{ padding: 16, alignItems: 'center' }}>
            <Text style={{ color: '#8B95A8', fontSize: 16 }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Edit caption modal */}
      <Modal visible={!!editCaptionPost} transparent animationType="slide" onRequestClose={() => setEditCaptionPost(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: 'rgba(28,34,46,0.72)', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32 }}>
            <Text style={{ color: '#F0F2F6', fontWeight: '600', fontSize: 16, marginBottom: 12 }}>Edit Caption</Text>
            <TextInput
              value={editCaptionText}
              onChangeText={setEditCaptionText}
              multiline
              style={{ backgroundColor: '#111', color: '#F0F2F6', borderRadius: 8, padding: 12, minHeight: 80, fontSize: 15 }}
              placeholderTextColor="#525E72"
              placeholder="Write a caption..."
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <TouchableOpacity onPress={() => setEditCaptionPost(null)} style={{ flex: 1, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', borderRadius: 8 }}>
                <Text style={{ color: '#8B95A8' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={async () => {
                  try {
                    await apiClient.patch(`/posts/${editCaptionPost?.id}`, { caption: editCaptionText });
                    setFeedPosts(prev => prev.map(p => p.id === editCaptionPost?.id ? { ...p, caption: editCaptionText } : p));
                  } catch {}
                  setEditCaptionPost(null);
                }}
                style={{ flex: 1, padding: 12, alignItems: 'center', backgroundColor: '#5b9bd5', borderRadius: 8 }}
              >
                <Text style={{ color: '#F0F2F6', fontWeight: '600' }}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

        {/* Story Viewer */}
        {storyViewerVisible && storyGroups.length > 0 && (
          <StoryViewer
            visible={storyViewerVisible}
            groups={storyGroups}
            initialGroupIndex={storyViewerGroupIdx}
            currentUserId={user?.id || ''}
            onClose={() => setStoryViewerVisible(false)}
            onMarkSeen={markStorySeen}
            onDelete={handleDeleteStory}
            onProfilePress={(userId) => { setStoryViewerVisible(false); setTimeout(() => { setProfileUserId(userId); setShowAthleteProfile(true); }, 300); }}
          />
        )}

        {/* Create menu bottom sheet */}
        <Modal
          visible={createMenuVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setCreateMenuVisible(false)}
        >
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}
            activeOpacity={1}
            onPress={() => setCreateMenuVisible(false)}
          >
            <View style={{ backgroundColor: 'rgba(28,34,46,0.72)', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, gap: 8, paddingBottom: insets.bottom + 16 }}>
              <TouchableOpacity
                onPress={() => { setCreateMenuVisible(false); setTimeout(() => setPostCreatorVisible(true), 300); }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: 14 }}
              >
                <Ionicons name="images-outline" size={22} color="#F0F2F6" />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: '#F0F2F6' }}>New Post</Text>
                  <Text style={{ fontSize: 12, color: '#888888', marginTop: 2 }}>Share a workout, insight, or photo</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#555555" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { setCreateMenuVisible(false); setTimeout(() => setStoryCreatorVisible(true), 300); }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: 14 }}
              >
                <Ionicons name="camera-outline" size={22} color="#F0F2F6" />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: '#F0F2F6' }}>Add Story</Text>
                  <Text style={{ fontSize: 12, color: '#888888', marginTop: 2 }}>Share a moment — disappears in 24h</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#555555" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setCreateMenuVisible(false)}
                style={{ padding: 14, alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)', marginTop: 4 }}
              >
                <Text style={{ fontSize: 15, color: '#888888' }}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Story Creator */}
        <StoryCreator
          visible={storyCreatorVisible}
          onClose={() => setStoryCreatorVisible(false)}
          onStoryCreated={() => { setStoryCreatorVisible(false); loadStories(); }}
        />

        {/* Post Creator */}
        <PostCreator
          visible={postCreatorVisible}
          onClose={() => setPostCreatorVisible(false)}
          onPostCreated={() => { setPostCreatorVisible(false); loadFeed(0, true); }}
        />

        {/* Athlete Profile Modal */}
        <AthleteProfileModal
          visible={showAthleteProfile}
          userId={profileUserId}
          onClose={() => { setShowAthleteProfile(false); setProfileUserId(null); }}
          onOpenPostDetail={(post) => { setShowAthleteProfile(false); setTimeout(() => { setDetailPost(post); setShowPostDetail(true); }, 300); }}
        />

        {/* Post Detail Modal */}
        <PostDetailModal
          visible={showPostDetail}
          post={detailPost}
          currentUserId={currentUserId}
          onClose={() => { setShowPostDetail(false); setDetailPost(null); }}
          onProfilePress={(userId) => { setShowPostDetail(false); setTimeout(() => { setProfileUserId(userId); setShowAthleteProfile(true); }, 300); }}
          onPostDeleted={(postId) => { setFeedPosts(prev => prev.filter(p => p.id !== postId)); setShowPostDetail(false); setDetailPost(null); }}
        />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function createStyles(t: ThemeColors) {
  return StyleSheet.create({
    // Transparent — AmbientBackdrop paints the bg.
    container: {
      flex: 1,
      backgroundColor: 'transparent',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 14,
    },
    headerTitle: {
      fontSize: 28,
      color: t.text.primary,
      fontFamily: TY.sans.semibold,
      letterSpacing: -0.5,
    },
    headerBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: t.glass.pill,
      borderWidth: 1,
      borderColor: t.glass.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerPlus: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: t.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // Filter chips row
    filterRow: {
      paddingBottom: 14,
    },
    filterChip: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: R.pill,
      backgroundColor: t.glass.pill,
      borderWidth: 1,
      borderColor: t.glass.border,
    },
    filterChipActive: {
      backgroundColor: t.accent,
      borderColor: t.accent,
    },
    filterChipText: {
      fontSize: 13,
      color: t.text.secondary,
      fontFamily: TY.sans.medium,
      letterSpacing: -0.1,
    },
    filterChipTextActive: {
      color: t.accentInk,
      fontFamily: TY.sans.semibold,
    },
    // Legacy keys kept so unchanged call sites don't error.
    tabRow: { flexDirection: 'row', paddingBottom: 10 },
    tabPill: { flex: 1, paddingVertical: 13, alignItems: 'center' },
    tabPillActive: {},
    tabPillText: { fontSize: 12, color: t.text.muted, fontFamily: TY.mono.medium, letterSpacing: 1.2 },
    tabPillTextActive: { color: t.text.primary },
    sectionLabel: {
      fontSize: 11,
      color: t.text.secondary,
      letterSpacing: 1.8,
      textTransform: 'uppercase',
      fontFamily: TY.mono.medium,
    },
  });
}
