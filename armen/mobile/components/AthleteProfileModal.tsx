// AthleteProfileModal — another user's public profile, visual structure
// mirrors app/(tabs)/profile.tsx so the app feels the same whether you're
// looking at yourself or someone else. Uses theme tokens throughout, no
// hardcoded colors, and reuses the same circular-highlights + Posts /
// Achievements / About tab layout.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Dimensions,
  Share,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import {
  getAthleteProfile,
  getAthletePublicPosts,
  followUser,
  unfollowUser,
  reportUser,
  blockUser,
  getUserHighlights,
  AthleteProfile,
  Post,
  getAthleteFollowers,
  getAthleteFollowing,
  UserPreview,
  Highlight,
} from '@/services/api';
import { useTheme } from '@/contexts/ThemeContext';
import { theme as T, type as TY, radius as R, space as SP } from '@/services/theme';
import AmbientBackdrop from '@/components/AmbientBackdrop';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_CELL = (SCREEN_WIDTH - 4) / 3;

interface Props {
  visible: boolean;
  userId: string | null;
  onClose: () => void;
  onOpenPostDetail?: (post: Post) => void;
}

function Avatar({
  initials,
  avatarUrl,
  size = 76,
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
        contentFit="cover"
        cachePolicy="memory-disk"
      />
    );
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: T.glass.cardHi,
        borderWidth: 1,
        borderColor: T.glass.border,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontFamily: TY.sans.semibold, fontSize: size * 0.34, color: T.text.primary, letterSpacing: 0.5 }}>
        {initials || '?'}
      </Text>
    </View>
  );
}

interface ToastState { visible: boolean; message: string; color: string }

type ProfileTab = 'posts' | 'achievements' | 'about';

function formatMemberSince(memberSince: string | null | undefined): string {
  if (!memberSince) return '—';
  const [year, month] = memberSince.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const m = parseInt(month, 10) - 1;
  return `${months[m] ?? ''} ${year}`;
}

export default function AthleteProfileModal({ visible, userId, onClose, onOpenPostDetail }: Props) {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<AthleteProfile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [postsPrivate, setPostsPrivate] = useState(false);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [profileTab, setProfileTab] = useState<ProfileTab>('posts');

  // Followers / Following sheets
  const [socialSheet, setSocialSheet] = useState<'followers' | 'following' | null>(null);
  const [socialList, setSocialList] = useState<UserPreview[]>([]);
  const [socialLoading, setSocialLoading] = useState(false);

  // Nested profile navigation (tapping rows in the sheets)
  const [nestedUserId, setNestedUserId] = useState<string | null>(null);

  // Toast
  const [toast, setToast] = useState<ToastState>({ visible: false, message: '', color: T.status.success });
  const toastRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, color: string = T.status.success) => {
    if (toastRef.current) clearTimeout(toastRef.current);
    setToast({ visible: true, message, color });
    toastRef.current = setTimeout(() => setToast((t) => ({ ...t, visible: false })), 2000);
  }, []);

  // ── Load profile ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!visible || !userId) return;
    setProfile(null);
    setPosts([]);
    setHighlights([]);
    setPostsPrivate(false);
    setProfileTab('posts');
    setLoading(true);

    Promise.allSettled([
      getAthleteProfile(userId),
      getAthletePublicPosts(userId, 0),
      getUserHighlights(userId),
    ]).then(([profileRes, postsRes, highlightsRes]) => {
      if (profileRes.status === 'fulfilled') {
        setProfile(profileRes.value);
        setIsFollowing(profileRes.value.is_following);
      }
      if (postsRes.status === 'fulfilled') {
        setPosts(postsRes.value.posts);
        setPostsPrivate(postsRes.value.is_private ?? false);
      }
      if (highlightsRes.status === 'fulfilled') {
        setHighlights(highlightsRes.value.highlights);
      }
    }).finally(() => setLoading(false));
  }, [visible, userId]);

  // ── Actions ──────────────────────────────────────────────────────────────

  const handleFollow = useCallback(async () => {
    if (!userId || !profile) return;
    const wasFollowing = isFollowing;
    setIsFollowing(!wasFollowing);
    setFollowLoading(true);
    try {
      if (wasFollowing) {
        await unfollowUser(userId);
        setProfile((p) => p ? { ...p, followers_count: Math.max(0, p.followers_count - 1), is_following: false } : p);
      } else {
        await followUser(userId);
        setProfile((p) => p ? { ...p, followers_count: p.followers_count + 1, is_following: true } : p);
      }
    } catch {
      setIsFollowing(wasFollowing);
    } finally {
      setFollowLoading(false);
    }
  }, [userId, profile, isFollowing]);

  const handleShare = useCallback(async () => {
    if (!profile) return;
    try {
      await Share.share({
        message: `Check out @${profile.username} on ORYX`,
        url: `https://oryx.app/u/${profile.username}`,
      });
    } catch {
      // cancelled
    }
  }, [profile]);

  const handleMessage = useCallback(() => {
    if (!userId) return;
    onClose();
    setTimeout(() => router.push(`/messages/new?recipient=${userId}`), 200);
  }, [userId, onClose]);

  const handleMenu = useCallback(() => {
    if (!userId) return;
    Alert.alert('Options', undefined, [
      {
        text: 'Report User',
        onPress: () => {
          reportUser(userId, 'Reported from profile')
            .then(() => showToast('User reported', T.status.success))
            .catch(() => showToast('Failed to report', T.status.danger));
        },
      },
      {
        text: 'Block User',
        style: 'destructive',
        onPress: () => {
          Alert.alert('Block User', 'Are you sure you want to block this user?', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Block',
              style: 'destructive',
              onPress: async () => {
                try {
                  await blockUser(userId);
                  showToast('User blocked', T.status.success);
                  setTimeout(onClose, 1500);
                } catch {
                  showToast('Failed to block', T.status.danger);
                }
              },
            },
          ]);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [userId, onClose, showToast]);

  const openSocialSheet = useCallback(async (kind: 'followers' | 'following') => {
    if (!userId) return;
    setSocialSheet(kind);
    setSocialList([]);
    setSocialLoading(true);
    try {
      const data = kind === 'followers' ? await getAthleteFollowers(userId) : await getAthleteFollowing(userId);
      setSocialList(kind === 'followers' ? data.followers : data.following);
    } catch {
      setSocialList([]);
    } finally {
      setSocialLoading(false);
    }
  }, [userId]);

  if (!visible) return null;

  // ── Render ───────────────────────────────────────────────────────────────

  const initials = profile
    ? profile.display_name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()
    : '?';

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: theme.bg.primary }}>
        <AmbientBackdrop />

        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={T.text.muted} size="large" />
          </View>
        ) : !profile ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: SP[3] }}>
            <Ionicons name="person-outline" size={48} color={T.text.muted} />
            <Text style={{ fontFamily: TY.sans.regular, fontSize: TY.size.body, color: T.text.muted }}>
              Profile not found
            </Text>
            <TouchableOpacity onPress={onClose} style={{ marginTop: SP[3] }}>
              <Text style={{ fontFamily: TY.sans.semibold, fontSize: TY.size.body, color: T.accent }}>Close</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + SP[7] }}>
            <View style={{ paddingHorizontal: 20 }}>
              {/* Top bar — matches profile.tsx layout */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: insets.top + SP[2], paddingBottom: SP[3] }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: SP[2] }}>
                  <TouchableOpacity onPress={onClose} hitSlop={10}>
                    <Ionicons name="chevron-back" size={24} color={T.text.primary} />
                  </TouchableOpacity>
                  <Text style={{ fontFamily: TY.sans.medium, fontSize: 18, color: T.text.primary, letterSpacing: -0.3 }}>
                    @{profile.username}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={handleMenu}
                  style={{
                    width: 36, height: 36, borderRadius: R.md,
                    backgroundColor: T.glass.pill,
                    borderWidth: 1, borderColor: T.glass.border,
                    alignItems: 'center', justifyContent: 'center',
                  }}
                  activeOpacity={0.75}
                >
                  <Ionicons name="ellipsis-horizontal" size={18} color={T.text.body} />
                </TouchableOpacity>
              </View>

              {/* Avatar + 3-stat row */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20, paddingBottom: SP[4] }}>
                <Avatar initials={initials} avatarUrl={profile.avatar_url} size={76} />
                <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'space-around' }}>
                  <View style={{ alignItems: 'center', gap: 2 }}>
                    <Text style={{ fontFamily: TY.sans.semibold, fontSize: 20, color: T.text.primary, letterSpacing: -0.3, ...TY.tabular }}>
                      {posts.length}
                    </Text>
                    <Text style={{ fontFamily: TY.sans.regular, fontSize: 12, color: T.text.secondary }}>posts</Text>
                  </View>
                  <TouchableOpacity style={{ alignItems: 'center', gap: 2 }} onPress={() => openSocialSheet('followers')} activeOpacity={0.7}>
                    <Text style={{ fontFamily: TY.sans.semibold, fontSize: 20, color: T.text.primary, letterSpacing: -0.3, ...TY.tabular }}>
                      {profile.followers_count}
                    </Text>
                    <Text style={{ fontFamily: TY.sans.regular, fontSize: 12, color: T.text.secondary }}>followers</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={{ alignItems: 'center', gap: 2 }} onPress={() => openSocialSheet('following')} activeOpacity={0.7}>
                    <Text style={{ fontFamily: TY.sans.semibold, fontSize: 20, color: T.text.primary, letterSpacing: -0.3, ...TY.tabular }}>
                      {profile.following_count}
                    </Text>
                    <Text style={{ fontFamily: TY.sans.regular, fontSize: 12, color: T.text.secondary }}>following</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Display name + bio + location */}
              <View style={{ gap: 4, marginBottom: SP[4] }}>
                <Text style={{ fontFamily: TY.sans.semibold, fontSize: 19, color: T.text.primary, letterSpacing: -0.3 }}>
                  {profile.display_name}
                </Text>
                {profile.bio ? (
                  <Text style={{ fontFamily: TY.sans.regular, fontSize: 13, color: T.text.body, lineHeight: 18 }} numberOfLines={3}>
                    {profile.bio}
                  </Text>
                ) : null}
                {profile.location ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                    <Ionicons name="location" size={13} color={T.readiness.low} />
                    <Text style={{ fontFamily: TY.sans.regular, fontSize: 13, color: T.text.body }}>{profile.location}</Text>
                  </View>
                ) : null}
              </View>

              {/* Sport tag pills */}
              {profile.sport_tags && profile.sport_tags.length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ maxHeight: 36 }}
                  contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
                >
                  {profile.sport_tags.map((sport) => (
                    <View
                      key={sport}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 5,
                        backgroundColor: T.glass.pill,
                        borderWidth: 1, borderColor: T.glass.border,
                        borderRadius: R.pill,
                        paddingHorizontal: 12, paddingVertical: 6,
                      }}
                    >
                      <Text style={{ fontFamily: TY.sans.regular, fontSize: 13, color: T.text.secondary }}>
                        {sport}
                      </Text>
                    </View>
                  ))}
                </ScrollView>
              ) : null}

              {/* Action row — Follow / Share / Message */}
              <View style={{ flexDirection: 'row', gap: 8, marginTop: SP[4] }}>
                <TouchableOpacity
                  onPress={handleFollow}
                  disabled={followLoading}
                  activeOpacity={0.8}
                  style={{
                    flex: 1,
                    paddingVertical: SP[3] - 1,
                    borderRadius: R.pill,
                    alignItems: 'center', justifyContent: 'center',
                    backgroundColor: isFollowing ? 'transparent' : T.accent,
                    borderWidth: 1,
                    borderColor: isFollowing ? T.border : T.accent,
                    opacity: followLoading ? 0.6 : 1,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: TY.sans.semibold, fontSize: 13,
                      color: isFollowing ? T.text.primary : T.accentInk,
                    }}
                  >
                    {isFollowing ? 'Following' : 'Follow'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleShare}
                  activeOpacity={0.8}
                  style={{
                    flex: 1,
                    paddingVertical: SP[3] - 1,
                    borderRadius: R.pill,
                    alignItems: 'center', justifyContent: 'center',
                    backgroundColor: T.glass.pill,
                    borderWidth: 1, borderColor: T.glass.border,
                  }}
                >
                  <Text style={{ fontFamily: TY.sans.semibold, fontSize: 13, color: T.text.primary }}>Share</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleMessage}
                  activeOpacity={0.8}
                  style={{
                    width: 44,
                    paddingVertical: SP[3] - 1,
                    borderRadius: R.pill,
                    alignItems: 'center', justifyContent: 'center',
                    backgroundColor: T.glass.pill,
                    borderWidth: 1, borderColor: T.glass.border,
                  }}
                >
                  <Ionicons name="chatbubble-outline" size={16} color={T.text.body} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Highlights row — circular bubbles */}
            {highlights.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 20, gap: 14, paddingVertical: 4 }}
                style={{ marginTop: 16 }}
              >
                {highlights.map((h) => {
                  const statLabel =
                    h.featured_stat === 'sessions' ? 'sessions' :
                    h.featured_stat === 'load' ? 'load' :
                    h.featured_stat === 'prs' ? 'PRs' :
                    'readiness';
                  const statShow = h.stat_value != null ? `${h.stat_value} ${statLabel}` : null;
                  return (
                    <TouchableOpacity
                      key={h.id}
                      style={{ width: 78, alignItems: 'center', gap: 6 }}
                      onPress={() => {
                        onClose();
                        setTimeout(() => router.push(`/profile/highlights/${h.id}`), 200);
                      }}
                      activeOpacity={0.8}
                    >
                      <View style={{
                        width: 64, height: 64, borderRadius: R.pill,
                        backgroundColor: T.glass.cardLo,
                        borderWidth: 1.5, borderColor: T.glass.border,
                        overflow: 'hidden',
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        {h.cover_photo_url ? (
                          <Image
                            source={{ uri: h.cover_photo_url }}
                            style={{ width: '100%', height: '100%' }}
                            contentFit="cover"
                            cachePolicy="memory-disk"
                          />
                        ) : (
                          <Ionicons name="sparkles-outline" size={24} color={T.text.muted} />
                        )}
                      </View>
                      <Text style={{ fontFamily: TY.sans.semibold, fontSize: 11, color: T.text.primary, letterSpacing: -0.1, textAlign: 'center' }} numberOfLines={1}>
                        {h.title}
                      </Text>
                      {statShow ? (
                        <Text style={{ fontFamily: TY.mono.bold, fontSize: 9, color: T.accent, letterSpacing: 0.4, textTransform: 'uppercase', textAlign: 'center' }} numberOfLines={1}>
                          {statShow}
                        </Text>
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            ) : null}

            {/* Tab bar */}
            <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: T.glass.border, marginTop: 16, marginHorizontal: 20 }}>
              {(['posts', 'achievements', 'about'] as const).map((tab) => {
                const active = profileTab === tab;
                const icon: Record<ProfileTab, React.ComponentProps<typeof Ionicons>['name']> = {
                  posts: active ? 'grid' : 'grid-outline',
                  achievements: active ? 'pricetag' : 'pricetag-outline',
                  about: active ? 'bookmark' : 'bookmark-outline',
                };
                return (
                  <TouchableOpacity
                    key={tab}
                    style={{ flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: active ? T.accent : 'transparent' }}
                    onPress={() => setProfileTab(tab)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name={icon[tab]} size={20} color={active ? T.accent : T.text.muted} />
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Posts tab */}
            {profileTab === 'posts' && (
              postsPrivate && !isFollowing ? (
                <View style={{ alignItems: 'center', paddingVertical: 40, gap: 12, paddingHorizontal: 20 }}>
                  <Ionicons name="lock-closed-outline" size={40} color={T.text.muted} />
                  <Text style={{ fontFamily: TY.sans.regular, fontSize: 15, color: T.text.muted, textAlign: 'center' }}>
                    This profile is private
                  </Text>
                  <TouchableOpacity
                    onPress={handleFollow}
                    disabled={followLoading}
                    style={{
                      backgroundColor: T.accent,
                      borderRadius: R.pill,
                      paddingHorizontal: 24,
                      paddingVertical: 10,
                      opacity: followLoading ? 0.6 : 1,
                    }}
                  >
                    <Text style={{ fontFamily: TY.sans.semibold, fontSize: 14, color: T.accentInk }}>Follow to see posts</Text>
                  </TouchableOpacity>
                </View>
              ) : posts.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                  <Ionicons name="images-outline" size={32} color={T.text.muted} />
                  <Text style={{ fontFamily: TY.sans.regular, fontSize: 14, color: T.text.muted, marginTop: SP[2] }}>No posts yet</Text>
                </View>
              ) : (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 20 - 1, marginTop: SP[2] }}>
                  {posts.map((post) => (
                    <TouchableOpacity
                      key={post.id}
                      onPress={() => onOpenPostDetail?.(post)}
                      style={{ width: GRID_CELL - (2/3), height: GRID_CELL - (2/3), margin: 1 }}
                      activeOpacity={0.85}
                    >
                      {post.photo_url ? (
                        <Image
                          source={{ uri: post.photo_url }}
                          style={{ width: '100%', height: '100%', borderRadius: 4 }}
                          contentFit="cover"
                          cachePolicy="memory-disk"
                        />
                      ) : (
                        <View style={{
                          width: '100%', height: '100%',
                          backgroundColor: T.bg.elevated,
                          borderRadius: 4,
                          alignItems: 'center', justifyContent: 'center',
                        }}>
                          <Ionicons name="stats-chart-outline" size={22} color={T.text.muted} />
                        </View>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              )
            )}

            {/* Achievements tab */}
            {profileTab === 'achievements' && (
              <View style={{ padding: 20, gap: 20 }}>
                <Text style={{
                  fontFamily: TY.mono.semibold, fontSize: 11,
                  color: T.text.muted, letterSpacing: 1.5, textTransform: 'uppercase',
                  marginBottom: SP[2],
                }}>
                  Overview
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                  {[
                    { label: 'Total Workouts', value: String(profile.total_workouts ?? '—') },
                    { label: 'Current Streak', value: profile.current_streak != null ? `${profile.current_streak} days` : '—' },
                    { label: 'Longest Streak', value: profile.best_streak != null ? `${profile.best_streak} days` : '—' },
                    { label: 'Member Since', value: formatMemberSince(profile.member_since) },
                  ].map((stat) => (
                    <View
                      key={stat.label}
                      style={{
                        flex: 1, minWidth: '47%',
                        backgroundColor: T.bg.elevated,
                        borderWidth: 1, borderColor: T.border,
                        borderRadius: R.md,
                        padding: SP[4],
                        gap: 4,
                      }}
                    >
                      <Text style={{ fontFamily: TY.mono.semibold, fontSize: 10, color: T.text.muted, textTransform: 'uppercase', letterSpacing: 1.5 }}>
                        {stat.label}
                      </Text>
                      <Text style={{ fontFamily: TY.sans.semibold, fontSize: 20, color: T.text.primary, marginTop: 4 }}>
                        {stat.value}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* About tab */}
            {profileTab === 'about' && (
              <View style={{ padding: 20, gap: 20 }}>
                {profile.bio ? (
                  <View style={{ gap: 8 }}>
                    <Text style={{ fontFamily: TY.mono.semibold, fontSize: 11, color: T.text.muted, letterSpacing: 1.5, textTransform: 'uppercase' }}>
                      Bio
                    </Text>
                    <Text style={{ fontFamily: TY.sans.regular, fontSize: 14, color: T.text.body, lineHeight: 22 }}>
                      {profile.bio}
                    </Text>
                  </View>
                ) : null}

                {profile.sport_tags && profile.sport_tags.length > 0 ? (
                  <View style={{ gap: 8 }}>
                    <Text style={{ fontFamily: TY.mono.semibold, fontSize: 11, color: T.text.muted, letterSpacing: 1.5, textTransform: 'uppercase' }}>
                      Sports
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {profile.sport_tags.map((tag) => (
                        <View
                          key={tag}
                          style={{
                            backgroundColor: T.glass.pill,
                            borderRadius: R.pill,
                            paddingHorizontal: 12, paddingVertical: 6,
                            borderWidth: 1, borderColor: T.glass.border,
                          }}
                        >
                          <Text style={{ fontFamily: TY.sans.regular, fontSize: 13, color: T.text.secondary }}>
                            {tag}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ) : null}

                <View style={{ gap: 8 }}>
                  <Text style={{ fontFamily: TY.mono.semibold, fontSize: 11, color: T.text.muted, letterSpacing: 1.5, textTransform: 'uppercase' }}>
                    Details
                  </Text>
                  <View style={{
                    backgroundColor: T.bg.elevated,
                    borderRadius: R.md,
                    borderWidth: 1, borderColor: T.border,
                    padding: SP[4],
                    gap: SP[3],
                  }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Ionicons name="calendar-outline" size={15} color={T.text.muted} />
                      <Text style={{ flex: 1, fontFamily: TY.sans.regular, fontSize: 13, color: T.text.secondary }}>Member since</Text>
                      <Text style={{ fontFamily: TY.sans.medium, fontSize: 13, color: T.text.primary }}>
                        {formatMemberSince(profile.member_since)}
                      </Text>
                    </View>
                    {profile.location ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Ionicons name="location-outline" size={15} color={T.text.muted} />
                        <Text style={{ flex: 1, fontFamily: TY.sans.regular, fontSize: 13, color: T.text.secondary }}>Location</Text>
                        <Text style={{ fontFamily: TY.sans.medium, fontSize: 13, color: T.text.primary }}>{profile.location}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              </View>
            )}
          </ScrollView>
        )}

        {/* Toast */}
        {toast.visible ? (
          <View
            style={{
              position: 'absolute',
              bottom: insets.bottom + 24,
              alignSelf: 'center',
              paddingHorizontal: 20, paddingVertical: 12,
              borderRadius: R.pill,
              backgroundColor: toast.color,
              zIndex: 999,
            }}
          >
            <Text style={{ fontFamily: TY.sans.semibold, color: T.accentInk, fontSize: 14 }}>{toast.message}</Text>
          </View>
        ) : null}

        {/* Followers / Following sheet */}
        <Modal
          visible={socialSheet !== null}
          transparent
          animationType="slide"
          onRequestClose={() => setSocialSheet(null)}
        >
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: T.glass.shade, justifyContent: 'flex-end' }}
            activeOpacity={1}
            onPress={() => setSocialSheet(null)}
          >
            <TouchableOpacity activeOpacity={1} onPress={() => {}}>
              <View
                style={{
                  backgroundColor: T.glass.card,
                  borderTopLeftRadius: R.lg, borderTopRightRadius: R.lg,
                  padding: 20,
                  maxHeight: 480,
                  paddingBottom: insets.bottom + 20,
                }}
              >
                <View style={{ width: 40, height: 4, backgroundColor: T.border, borderRadius: 2, alignSelf: 'center', marginBottom: SP[3] }} />
                <Text style={{ fontFamily: TY.sans.semibold, fontSize: 17, color: T.text.primary, marginBottom: SP[3] }}>
                  {socialSheet === 'followers' ? 'Followers' : 'Following'}
                </Text>
                {socialLoading ? (
                  <ActivityIndicator color={T.text.muted} style={{ marginVertical: 20 }} />
                ) : socialList.length === 0 ? (
                  <Text style={{ fontFamily: TY.sans.regular, color: T.text.muted, textAlign: 'center', paddingVertical: 20 }}>
                    {socialSheet === 'followers' ? 'No followers yet' : 'Not following anyone yet'}
                  </Text>
                ) : (
                  <ScrollView>
                    {socialList.map((u) => (
                      <TouchableOpacity
                        key={u.id}
                        onPress={() => { setSocialSheet(null); setTimeout(() => setNestedUserId(u.id), 250); }}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: SP[2] + 2 }}
                        activeOpacity={0.7}
                      >
                        <Avatar initials={u.initials} avatarUrl={u.avatar_url} size={40} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontFamily: TY.sans.semibold, fontSize: 14, color: T.text.primary }}>{u.display_name}</Text>
                          <Text style={{ fontFamily: TY.sans.regular, fontSize: 12, color: T.text.muted }}>@{u.username}</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>

        {/* Nested profile (tapping a row in the social sheets) */}
        <AthleteProfileModal
          visible={nestedUserId !== null}
          userId={nestedUserId}
          onClose={() => setNestedUserId(null)}
          onOpenPostDetail={onOpenPostDetail}
        />
      </View>
    </Modal>
  );
}
