import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  Alert,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  getAthleteProfile,
  getAthletePublicPosts,
  followUser,
  unfollowUser,
  reportUser,
  blockUser,
  AthleteProfile,
  Post,
  getAthleteFollowers,
  getAthleteFollowing,
  UserPreview,
} from '@/services/api';

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
        backgroundColor: '#2a2a2a',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontSize: size * 0.35, fontWeight: '700', color: '#e0e0e0' }}>
        {initials || '?'}
      </Text>
    </View>
  );
}

interface ToastState {
  visible: boolean;
  message: string;
  color: string;
}

export default function AthleteProfileModal({ visible, userId, onClose, onOpenPostDetail }: Props) {
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<AthleteProfile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [postsPrivate, setPostsPrivate] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);

  // Followers/Following sheet
  const [showFollowersSheet, setShowFollowersSheet] = useState(false);
  const [showFollowingSheet, setShowFollowingSheet] = useState(false);
  const [followersLoading, setFollowersLoading] = useState(false);
  const [followingLoading, setFollowingLoading] = useState(false);
  const [followersList, setFollowersList] = useState<UserPreview[]>([]);
  const [followingList, setFollowingList] = useState<UserPreview[]>([]);

  // Bio expand
  const [bioExpanded, setBioExpanded] = useState(false);

  // Profile tabs
  const [profileTab, setProfileTab] = useState<'posts' | 'activity' | 'about'>('posts');

  // Nested profile navigation
  const [nestedUserId, setNestedUserId] = useState<string | null>(null);
  const [showNestedProfile, setShowNestedProfile] = useState(false);

  // Toast
  const [toast, setToast] = useState<ToastState>({ visible: false, message: '', color: '#27ae60' });
  const toastRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, color = '#27ae60') => {
    if (toastRef.current) clearTimeout(toastRef.current);
    setToast({ visible: true, message, color });
    toastRef.current = setTimeout(() => setToast(t => ({ ...t, visible: false })), 2000);
  }, []);

  useEffect(() => {
    if (!visible || !userId) return;
    setProfile(null);
    setPosts([]);
    setPostsPrivate(false);
    setBioExpanded(false);
    setProfileTab('posts');
    setLoading(true);

    Promise.allSettled([
      getAthleteProfile(userId),
      getAthletePublicPosts(userId, 0),
    ]).then(([profileResult, postsResult]) => {
      if (profileResult.status === 'fulfilled') {
        const p = profileResult.value;
        setProfile(p);
        setIsFollowing(p.is_following);
      }
      if (postsResult.status === 'fulfilled') {
        setPosts(postsResult.value.posts);
        setPostsPrivate(postsResult.value.is_private ?? false);
      }
    }).finally(() => setLoading(false));
  }, [visible, userId]);

  const handleFollow = useCallback(async () => {
    if (!userId || !profile) return;
    const wasFollowing = isFollowing;
    setIsFollowing(!wasFollowing);
    setFollowLoading(true);
    try {
      if (wasFollowing) {
        await unfollowUser(userId);
        setProfile(p => p ? { ...p, followers_count: Math.max(0, p.followers_count - 1), is_following: false } : p);
      } else {
        await followUser(userId);
        setProfile(p => p ? { ...p, followers_count: p.followers_count + 1, is_following: true } : p);
      }
    } catch {
      setIsFollowing(wasFollowing);
    } finally {
      setFollowLoading(false);
    }
  }, [userId, profile, isFollowing]);

  const handleMenu = useCallback(() => {
    if (!userId) return;
    Alert.alert('Options', undefined, [
      {
        text: 'Report User',
        onPress: () => {
          reportUser(userId, 'Reported from profile').then(() => {
            showToast('User reported', '#27ae60');
          }).catch(() => {
            showToast('Failed to report', '#c0392b');
          });
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
                  showToast('User blocked', '#27ae60');
                  setTimeout(onClose, 1500);
                } catch {
                  showToast('Failed to block', '#c0392b');
                }
              },
            },
          ]);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [userId, onClose, showToast]);

  const openFollowers = useCallback(async () => {
    if (!userId) return;
    setShowFollowersSheet(true);
    setFollowersLoading(true);
    try {
      const res = await getAthleteFollowers(userId);
      setFollowersList(res.followers);
    } catch {
      setFollowersList([]);
    } finally {
      setFollowersLoading(false);
    }
  }, [userId]);

  const openFollowing = useCallback(async () => {
    if (!userId) return;
    setShowFollowingSheet(true);
    setFollowingLoading(true);
    try {
      const res = await getAthleteFollowing(userId);
      setFollowingList(res.following);
    } catch {
      setFollowingList([]);
    } finally {
      setFollowingLoading(false);
    }
  }, [userId]);

  const formatMemberSince = (memberSince: string) => {
    if (!memberSince) return '—';
    const [year, month] = memberSince.split('-');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const m = parseInt(month, 10) - 1;
    return `${months[m] ?? ''} ${year}`;
  };

  if (!visible) return null;

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#0a0a0a' }}>
        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: insets.top + 8,
            paddingHorizontal: 16,
            paddingBottom: 12,
            borderBottomWidth: 1,
            borderBottomColor: '#2a2a2a',
          }}
        >
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="arrow-back" size={24} color="#f0f0f0" />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleMenu} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="ellipsis-horizontal" size={22} color="#888888" />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color="#555555" size="large" />
          </View>
        ) : !profile ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
            <Ionicons name="person-outline" size={48} color="#2a2a2a" />
            <Text style={{ fontSize: 15, color: '#555555' }}>Profile not found</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}>
            {/* Profile Header */}
            <View style={{ alignItems: 'center', paddingTop: 24, paddingHorizontal: 20, gap: 8 }}>
              <Avatar
                initials={profile.display_name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()}
                avatarUrl={profile.avatar_url}
                size={80}
              />
              <Text style={{ fontSize: 20, fontWeight: '700', color: '#ffffff', textAlign: 'center', marginTop: 4 }}>
                {profile.display_name}
              </Text>
              <Text style={{ fontSize: 14, color: '#888888', textAlign: 'center' }}>
                @{profile.username}
              </Text>

              {/* Sport Tags */}
              {profile.sport_tags.length > 0 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center', marginTop: 4 }}>
                  {profile.sport_tags.map((tag, i) => (
                    <View
                      key={i}
                      style={{ backgroundColor: '#2a2a2a', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3 }}
                    >
                      <Text style={{ fontSize: 11, color: '#888888' }}>{tag}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Location */}
              {profile.location && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                  <Ionicons name="location-outline" size={12} color="#888888" />
                  <Text style={{ fontSize: 12, color: '#888888' }}>{profile.location}</Text>
                </View>
              )}

              {/* Bio */}
              {profile.bio && (
                <View style={{ marginTop: 4, alignItems: 'center' }}>
                  <Text
                    style={{ fontSize: 13, color: '#ffffff', textAlign: 'center', lineHeight: 20 }}
                    numberOfLines={bioExpanded ? undefined : 3}
                  >
                    {profile.bio}
                  </Text>
                  {profile.bio.length > 120 && (
                    <TouchableOpacity onPress={() => setBioExpanded(v => !v)}>
                      <Text style={{ fontSize: 12, color: '#888888', marginTop: 4 }}>
                        {bioExpanded ? 'Show less' : 'Read more'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* Follow Button */}
              <TouchableOpacity
                onPress={handleFollow}
                disabled={followLoading}
                style={{
                  marginTop: 12,
                  width: 140,
                  height: 36,
                  borderRadius: 18,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: isFollowing ? 'transparent' : '#ffffff',
                  borderWidth: isFollowing ? 1 : 0,
                  borderColor: '#ffffff',
                  opacity: followLoading ? 0.6 : 1,
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: '600', color: isFollowing ? '#ffffff' : '#000000' }}>
                  {isFollowing ? 'Following' : 'Follow'}
                </Text>
              </TouchableOpacity>

              {/* Followers / Following counts */}
              <View style={{ flexDirection: 'row', gap: 28, marginTop: 8 }}>
                <TouchableOpacity onPress={openFollowers} style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#f0f0f0' }}>
                    {profile.followers_count}
                  </Text>
                  <Text style={{ fontSize: 11, color: '#888888' }}>Followers</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={openFollowing} style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#f0f0f0' }}>
                    {profile.following_count}
                  </Text>
                  <Text style={{ fontSize: 11, color: '#888888' }}>Following</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Stats Row */}
            <View
              style={{
                flexDirection: 'row',
                marginHorizontal: 16,
                marginTop: 20,
                backgroundColor: '#1a1a1a',
                borderRadius: 14,
                borderWidth: 1,
                borderColor: '#2a2a2a',
                overflow: 'hidden',
              }}
            >
              {[
                { label: 'WORKOUTS', value: String(profile.total_workouts) },
                { label: 'STREAK', value: `${profile.current_streak}d` },
                { label: 'BEST', value: `${profile.best_streak}d` },
                { label: 'SINCE', value: formatMemberSince(profile.member_since) },
              ].map((stat, i, arr) => (
                <View
                  key={i}
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    paddingVertical: 14,
                    borderRightWidth: i < arr.length - 1 ? 1 : 0,
                    borderRightColor: '#2a2a2a',
                  }}
                >
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#ffffff' }}>{stat.value}</Text>
                  <Text style={{ fontSize: 10, color: '#888888', textTransform: 'uppercase', marginTop: 2, letterSpacing: 0.5 }}>
                    {stat.label}
                  </Text>
                </View>
              ))}
            </View>

            {/* Tab row */}
            <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#2a2a2a', marginTop: 16 }}>
              {(['posts', 'activity', 'about'] as const).map((tab) => (
                <TouchableOpacity
                  key={tab}
                  onPress={() => setProfileTab(tab)}
                  style={{ flex: 1, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: profileTab === tab ? '#f0f0f0' : 'transparent' }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '600', color: profileTab === tab ? '#f0f0f0' : '#555555', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {tab}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Posts tab */}
            {profileTab === 'posts' && (
              postsPrivate && !isFollowing ? (
                <View style={{ alignItems: 'center', paddingVertical: 40, gap: 12 }}>
                  <Ionicons name="lock-closed-outline" size={40} color="#2a2a2a" />
                  <Text style={{ fontSize: 15, color: '#555555', textAlign: 'center' }}>
                    This profile is private
                  </Text>
                  <TouchableOpacity
                    onPress={handleFollow}
                    disabled={followLoading}
                    style={{
                      backgroundColor: '#ffffff',
                      borderRadius: 18,
                      paddingHorizontal: 24,
                      paddingVertical: 8,
                      opacity: followLoading ? 0.6 : 1,
                    }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: '600', color: '#000000' }}>Follow to see posts</Text>
                  </TouchableOpacity>
                </View>
              ) : posts.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                  <Text style={{ fontSize: 14, color: '#555555' }}>No posts yet</Text>
                </View>
              ) : (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                  {posts.map((post) => (
                    <TouchableOpacity
                      key={post.id}
                      onPress={() => onOpenPostDetail?.(post)}
                      style={{ width: GRID_CELL, height: GRID_CELL, margin: 1 }}
                      activeOpacity={0.8}
                    >
                      {post.photo_url ? (
                        <Image
                          source={{ uri: post.photo_url }}
                          style={{ width: '100%', height: '100%' }}
                          resizeMode="cover"
                        />
                      ) : (
                        <View
                          style={{
                            width: '100%',
                            height: '100%',
                            backgroundColor: '#1a1a1a',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Ionicons name="stats-chart-outline" size={22} color="#555555" />
                        </View>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              )
            )}

            {/* Activity tab */}
            {profileTab === 'activity' && (
              <View style={{ padding: 16, gap: 16 }}>
                <View style={{ gap: 8 }}>
                  <Text style={{ fontSize: 10, color: '#555555', letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: '700' }}>OVERVIEW</Text>
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <View style={{ flex: 1, backgroundColor: '#1a1a1a', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#2a2a2a' }}>
                      <Text style={{ fontSize: 20, fontWeight: '700', color: '#ffffff' }}>{profile?.total_workouts ?? '-'}</Text>
                      <Text style={{ fontSize: 11, color: '#555555' }}>Total Workouts</Text>
                    </View>
                    <View style={{ flex: 1, backgroundColor: '#1a1a1a', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#2a2a2a' }}>
                      <Text style={{ fontSize: 20, fontWeight: '700', color: '#ffffff' }}>{profile?.current_streak ?? '-'}d</Text>
                      <Text style={{ fontSize: 11, color: '#555555' }}>Current Streak</Text>
                    </View>
                  </View>
                </View>
              </View>
            )}

            {/* About tab */}
            {profileTab === 'about' && (
              <View style={{ padding: 16, gap: 16 }}>
                {profile?.bio ? (
                  <View style={{ gap: 8 }}>
                    <Text style={{ fontSize: 10, color: '#555555', letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: '700' }}>BIO</Text>
                    <Text style={{ fontSize: 14, color: '#f0f0f0', lineHeight: 22 }}>{profile.bio}</Text>
                  </View>
                ) : null}

                {profile?.sport_tags && profile.sport_tags.length > 0 ? (
                  <View style={{ gap: 8 }}>
                    <Text style={{ fontSize: 10, color: '#555555', letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: '700' }}>SPORTS</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {profile.sport_tags.map((tag, i) => (
                        <View key={i} style={{ backgroundColor: '#1a1a1a', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 6, borderWidth: 1, borderColor: '#2a2a2a' }}>
                          <Text style={{ fontSize: 13, color: '#888888' }}>{tag}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ) : null}

                {profile?.member_since ? (
                  <View style={{ gap: 4 }}>
                    <Text style={{ fontSize: 10, color: '#555555', letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: '700' }}>MEMBER SINCE</Text>
                    <Text style={{ fontSize: 14, color: '#f0f0f0' }}>{formatMemberSince(profile.member_since)}</Text>
                  </View>
                ) : null}

                {profile?.location ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="location-outline" size={14} color="#555555" />
                    <Text style={{ fontSize: 14, color: '#888888' }}>{profile.location}</Text>
                  </View>
                ) : null}
              </View>
            )}
          </ScrollView>
        )}

        {/* Toast */}
        {toast.visible && (
          <View
            style={{
              position: 'absolute',
              bottom: insets.bottom + 24,
              alignSelf: 'center',
              paddingHorizontal: 20,
              paddingVertical: 12,
              borderRadius: 24,
              backgroundColor: toast.color,
              zIndex: 999,
            }}
          >
            <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: '600' }}>{toast.message}</Text>
          </View>
        )}

        {/* Followers Sheet */}
        <Modal
          visible={showFollowersSheet}
          transparent
          animationType="slide"
          onRequestClose={() => setShowFollowersSheet(false)}
        >
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}
            activeOpacity={1}
            onPress={() => setShowFollowersSheet(false)}
          >
            <TouchableOpacity activeOpacity={1} onPress={() => {}}>
              <View
                style={{
                  backgroundColor: '#1a1a1a',
                  borderTopLeftRadius: 20,
                  borderTopRightRadius: 20,
                  padding: 20,
                  maxHeight: 400,
                  paddingBottom: insets.bottom + 20,
                }}
              >
                <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#2a2a2a', alignSelf: 'center', marginBottom: 16 }} />
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#f0f0f0', marginBottom: 16 }}>Followers</Text>
                {followersLoading ? (
                  <ActivityIndicator color="#555555" style={{ marginVertical: 20 }} />
                ) : followersList.length === 0 ? (
                  <Text style={{ color: '#555555', textAlign: 'center', paddingVertical: 20 }}>No followers yet</Text>
                ) : (
                  <ScrollView>
                    {followersList.map(u => (
                      <TouchableOpacity
                        key={u.id}
                        onPress={() => { setShowFollowersSheet(false); setTimeout(() => { setNestedUserId(u.id); setShowNestedProfile(true); }, 300); }}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }}
                        activeOpacity={0.7}
                      >
                        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#2a2a2a', alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: '#e0e0e0' }}>{u.initials}</Text>
                        </View>
                        <View>
                          <Text style={{ fontSize: 14, color: '#f0f0f0', fontWeight: '600' }}>{u.display_name}</Text>
                          <Text style={{ fontSize: 12, color: '#555555' }}>@{u.username}</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>

        {/* Nested Profile */}
        <AthleteProfileModal
          visible={showNestedProfile}
          userId={nestedUserId}
          onClose={() => { setShowNestedProfile(false); setNestedUserId(null); }}
        />

        {/* Following Sheet */}
        <Modal
          visible={showFollowingSheet}
          transparent
          animationType="slide"
          onRequestClose={() => setShowFollowingSheet(false)}
        >
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}
            activeOpacity={1}
            onPress={() => setShowFollowingSheet(false)}
          >
            <TouchableOpacity activeOpacity={1} onPress={() => {}}>
              <View
                style={{
                  backgroundColor: '#1a1a1a',
                  borderTopLeftRadius: 20,
                  borderTopRightRadius: 20,
                  padding: 20,
                  maxHeight: 400,
                  paddingBottom: insets.bottom + 20,
                }}
              >
                <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#2a2a2a', alignSelf: 'center', marginBottom: 16 }} />
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#f0f0f0', marginBottom: 16 }}>Following</Text>
                {followingLoading ? (
                  <ActivityIndicator color="#555555" style={{ marginVertical: 20 }} />
                ) : followingList.length === 0 ? (
                  <Text style={{ color: '#555555', textAlign: 'center', paddingVertical: 20 }}>Not following anyone yet</Text>
                ) : (
                  <ScrollView>
                    {followingList.map(u => (
                      <TouchableOpacity
                        key={u.id}
                        onPress={() => { setShowFollowingSheet(false); setTimeout(() => { setNestedUserId(u.id); setShowNestedProfile(true); }, 300); }}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }}
                        activeOpacity={0.7}
                      >
                        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#2a2a2a', alignItems: 'center', justifyContent: 'center' }}>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: '#e0e0e0' }}>{u.initials}</Text>
                        </View>
                        <View>
                          <Text style={{ fontSize: 14, color: '#f0f0f0', fontWeight: '600' }}>{u.display_name}</Text>
                          <Text style={{ fontSize: 12, color: '#555555' }}>@{u.username}</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      </View>
    </Modal>
  );
}
