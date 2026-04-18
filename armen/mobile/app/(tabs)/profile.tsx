import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Dimensions,
  ActivityIndicator,
  Image,
  Alert,
  TextInput,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {
  getActivities,
  getFollowers,
  getFollowing,
  followUser,
  unfollowUser,
  getUserPosts,
  editPostCaption,
  deletePost,
  createStory,
  uploadMedia,
  updateMyProfile,
  Activity,
  UserPreview,
  Post,
} from '@/services/api';
import { useAuthStore } from '@/services/authStore';
import apiClient from '@/services/api';
import PostDetailModal from '@/components/PostDetailModal';
import { useTheme } from '@/contexts/ThemeContext';
import { ThemeColors } from '@/services/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ── Helpers ─────────────────────────────────────────────────────────────────

function getInitials(name: string | null, email: string): string {
  if (name) {
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }
  const localPart = email.split('@')[0];
  const parts = localPart.split(/[._-]/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return localPart.slice(0, 2).toUpperCase();
}

function formatJoinDate(dateStr: string | null | undefined): string {
  if (!dateStr) return 'Recently';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
  });
}

function computeCurrentStreak(activities: Activity[]): number {
  if (activities.length === 0) return 0;
  const dates = new Set(activities.map((a) => a.start_date.split('T')[0]));
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];
    if (dates.has(key)) {
      streak++;
    } else if (i > 0) {
      break;
    }
  }
  return streak;
}

function computeLongestStreak(activities: Activity[]): number {
  if (activities.length === 0) return 0;
  const dateSet = new Set(activities.map((a) => a.start_date.split('T')[0]));
  const sortedDates = Array.from(dateSet).sort();
  let longest = 1;
  let current = 1;
  for (let i = 1; i < sortedDates.length; i++) {
    const prev = new Date(sortedDates[i - 1]);
    const curr = new Date(sortedDates[i]);
    const diffDays = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays === 1) {
      current++;
      longest = Math.max(longest, current);
    } else {
      current = 1;
    }
  }
  return longest;
}

function getSportIcon(sport: string): React.ComponentProps<typeof Ionicons>['name'] {
  const s = sport.toLowerCase();
  if (s.includes('run')) return 'walk-outline';
  if (s.includes('cycl') || s.includes('bike')) return 'bicycle-outline';
  if (s.includes('swim')) return 'water-outline';
  if (s.includes('weight') || s.includes('lift')) return 'barbell-outline';
  if (s.includes('cross')) return 'fitness-outline';
  if (s.includes('yoga')) return 'body-outline';
  if (s.includes('hike')) return 'trail-sign-outline';
  return 'flash-outline';
}

// ── Badge definitions ────────────────────────────────────────────────────────

interface Badge {
  id: string;
  name: string;
  subtitle: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
  earned: (activities: Activity[]) => boolean;
}

const BADGES: Badge[] = [
  {
    id: 'first_workout',
    name: 'First Workout',
    subtitle: 'Started the journey',
    icon: 'checkmark-circle',
    color: '#27ae60',
    earned: (a) => a.length >= 1,
  },
  {
    id: '10_workouts',
    name: '10 Workouts',
    subtitle: 'Building the habit',
    icon: 'star',
    color: '#888888',
    earned: (a) => a.length >= 10,
  },
  {
    id: '50_workouts',
    name: '50 Workouts',
    subtitle: 'Committed athlete',
    icon: 'trophy',
    color: '#888888',
    earned: (a) => a.length >= 50,
  },
  {
    id: '100_workouts',
    name: '100 Workouts',
    subtitle: 'Elite consistency',
    icon: 'ribbon',
    color: '#888888',
    earned: (a) => a.length >= 100,
  },
  {
    id: 'early_bird',
    name: 'Early Bird',
    subtitle: 'Up before 6am',
    icon: 'sunny',
    color: '#888888',
    earned: (a) =>
      a.some((act) => {
        const hour = new Date(act.start_date).getHours();
        return hour < 6;
      }),
  },
  {
    id: 'distance_king',
    name: 'Distance King',
    subtitle: 'Half marathon+',
    icon: 'navigate',
    color: '#888888',
    earned: (a) => a.some((act) => (act.distance_meters ?? 0) > 21000),
  },
  {
    id: 'consistent',
    name: 'Consistent',
    subtitle: '7-day streak',
    icon: 'calendar',
    color: '#888888',
    earned: (a) => computeCurrentStreak(a) >= 7,
  },
  {
    id: 'green_week',
    name: 'Green Week',
    subtitle: 'Peak recovery run',
    icon: 'leaf',
    color: '#27ae60',
    earned: (_a) => false,
  },
];

// ── Heatmap ──────────────────────────────────────────────────────────────────

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function WorkoutHeatmap({ activities }: { activities: Activity[] }) {
  const { theme } = useTheme();

  const dateCounts: Record<string, number> = {};
  activities.forEach((a) => {
    const d = a.start_date.split('T')[0];
    dateCounts[d] = (dateCounts[d] ?? 0) + 1;
  });

  const today = new Date();
  const dayOfWeek = today.getDay();
  const endSunday = new Date(today);
  endSunday.setDate(today.getDate() - dayOfWeek + 6);
  const startDate = new Date(endSunday);
  startDate.setDate(endSunday.getDate() - 52 * 7 + 1);

  const weeks: Array<Array<{ dateStr: string; count: number }>> = [];
  let currentWeek: Array<{ dateStr: string; count: number }> = [];

  const cursor = new Date(startDate);
  while (cursor <= endSunday) {
    const dateStr = cursor.toISOString().split('T')[0];
    currentWeek.push({ dateStr, count: dateCounts[dateStr] ?? 0 });
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  if (currentWeek.length > 0) weeks.push(currentWeek);

  const monthPositions: Array<{ label: string; weekIdx: number }> = [];
  let lastMonth = -1;
  weeks.forEach((week, idx) => {
    const month = new Date(week[0].dateStr).getMonth();
    if (month !== lastMonth) {
      monthPositions.push({ label: MONTH_LABELS[month], weekIdx: idx });
      lastMonth = month;
    }
  });

  const totalWorkouts = new Set(activities.map((a) => a.start_date.split('T')[0])).size;

  function cellColor(count: number): string {
    if (count === 0) return theme.border;
    if (count === 1) return 'rgba(39,174,96,0.4)';
    if (count === 2) return 'rgba(39,174,96,0.7)';
    return '#27ae60';
  }

  const CELL = 10;
  const GAP = 2;
  const CELL_STEP = CELL + GAP;

  return (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <View style={{ flexDirection: 'row', marginBottom: 4 }}>
            {weeks.map((week, wi) => {
              const pos = monthPositions.find((m) => m.weekIdx === wi);
              return (
                <View key={wi} style={{ width: CELL_STEP }}>
                  {pos ? (
                    <Text style={{ fontSize: 8, color: theme.text.muted }}>{pos.label}</Text>
                  ) : null}
                </View>
              );
            })}
          </View>
          {[0, 1, 2, 3, 4, 5, 6].map((dayIdx) => (
            <View key={dayIdx} style={{ flexDirection: 'row', marginBottom: GAP }}>
              {weeks.map((week, wi) => {
                const cell = week[dayIdx];
                if (!cell) {
                  return <View key={wi} style={{ width: CELL, height: CELL, marginRight: GAP }} />;
                }
                const isFuture = new Date(cell.dateStr) > today;
                return (
                  <View
                    key={wi}
                    style={{
                      width: CELL,
                      height: CELL,
                      borderRadius: 2,
                      backgroundColor: isFuture ? 'transparent' : cellColor(cell.count),
                      marginRight: GAP,
                    }}
                  />
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>
      <Text style={{ fontSize: 12, color: theme.text.muted, marginTop: 8 }}>
        {totalWorkouts} workout{totalWorkouts !== 1 ? 's' : ''} in the last year
      </Text>
    </View>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const { user, updateUser } = useAuthStore();
  const { theme } = useTheme();
  const s = useMemo(() => createStyles(theme), [theme]);
  const insets = useSafeAreaInsets();

  // Profile tab state
  const [profileTab, setProfileTab] = useState<'posts' | 'achievements' | 'about'>('posts');
  const achievementsLoadedRef = useRef(false);

  // Activities (lazy — loaded when Achievements tab is opened)
  const [activities, setActivities] = useState<Activity[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(false);

  // Posts grid
  const [userPosts, setUserPosts] = useState<Post[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [showPostDetail, setShowPostDetail] = useState(false);
  const [showMenuForPost, setShowMenuForPost] = useState<string | null>(null);
  const [editCaptionText, setEditCaptionText] = useState('');
  const [showEditCaption, setShowEditCaption] = useState(false);

  // Highlights sheet
  const [showHighlightSheet, setShowHighlightSheet] = useState(false);

  // Followers / Following sheet
  const [socialSheet, setSocialSheet] = useState<'followers' | 'following' | null>(null);
  const [socialList, setSocialList] = useState<UserPreview[]>([]);
  const [socialLoading, setSocialLoading] = useState(false);
  const [socialFollowState, setSocialFollowState] = useState<Record<string, boolean>>({});

  // ── Load posts on mount ────────────────────────────────────────────────────

  const loadUserPosts = useCallback(async () => {
    if (!user?.id) return;
    setPostsLoading(true);
    try {
      const res = await getUserPosts(user.id, 0, 30);
      setUserPosts(res.posts.filter((p: Post) => !p.is_deleted));
    } catch {
      // silent
    } finally {
      setPostsLoading(false);
    }
  }, [user?.id]);

  // ── Load activities lazily when Achievements tab opens ────────────────────

  const loadActivities = useCallback(async () => {
    if (achievementsLoadedRef.current) return;
    achievementsLoadedRef.current = true;
    setActivitiesLoading(true);
    try {
      const result = await getActivities(1, 20);
      setActivities(result);
    } catch {
      // Non-fatal
    } finally {
      setActivitiesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (profileTab === 'achievements') {
      loadActivities();
    }
  }, [profileTab, loadActivities]);

  const openSocialSheet = useCallback(async (type: 'followers' | 'following') => {
    setSocialSheet(type);
    setSocialList([]);
    setSocialLoading(true);
    try {
      const data = type === 'followers' ? await getFollowers() : await getFollowing();
      const list = type === 'followers' ? data.followers : data.following;
      setSocialList(list);
      const state: Record<string, boolean> = {};
      list.forEach((u: UserPreview) => { state[u.id] = u.is_following ?? false; });
      setSocialFollowState(state);
    } catch {}
    finally { setSocialLoading(false); }
  }, []);

  const handleSocialFollow = useCallback(async (userId: string) => {
    const isFollowing = socialFollowState[userId] ?? false;
    setSocialFollowState(prev => ({ ...prev, [userId]: !isFollowing }));
    try {
      if (isFollowing) {
        const res = await unfollowUser(userId);
        if (res.following_count != null) updateUser({ following_count: res.following_count });
      } else {
        const res = await followUser(userId);
        if (res.following_count != null) updateUser({ following_count: res.following_count });
      }
    } catch {
      setSocialFollowState(prev => ({ ...prev, [userId]: isFollowing }));
    }
  }, [socialFollowState, updateUser]);

  // Refresh follower/following counts from the server whenever the tab is focused
  useFocusEffect(
    useCallback(() => {
      apiClient.get('/auth/me').then((res) => {
        const { followers_count, following_count } = res.data;
        if (followers_count != null || following_count != null) {
          updateUser({ followers_count, following_count });
        }
      }).catch(() => {});
    }, [updateUser])
  );

  useEffect(() => {
    loadUserPosts();
  }, [loadUserPosts]);

  // ── Avatar upload ────────────────────────────────────────────────────────

  const handleAvatarPress = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled) return;
    const uri = result.assets[0].uri;
    try {
      const { url } = await uploadMedia(uri);
      await updateMyProfile({ avatar_url: url });
      updateUser({ avatar_url: url });
    } catch (e) {
      console.error('Avatar upload failed', e);
    }
  };

  // ── Computed ──────────────────────────────────────────────────────────────

  const email = user?.email ?? '';
  const initials = getInitials(user?.full_name ?? null, email);
  const displayName = user?.full_name || user?.username || email;

  const totalDistanceKm = activities.reduce(
    (sum, a) => sum + (a.distance_meters ?? 0) / 1000,
    0
  );
  const currentStreak = computeCurrentStreak(activities);
  const longestStreak = computeLongestStreak(activities);

  const now = new Date();
  const sessionsThisMonth = activities.filter((a) => {
    const d = new Date(a.start_date);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  const activitiesWithDuration = activities.filter((a) => a.duration_minutes != null && a.duration_minutes > 0);
  const avgDuration =
    activitiesWithDuration.length > 0
      ? Math.round(
          activitiesWithDuration.reduce((sum, a) => sum + (a.duration_minutes ?? 0), 0) /
            activitiesWithDuration.length
        )
      : null;

  // ── Tab content renderers ─────────────────────────────────────────────────

  function renderPostsTab() {
    if (postsLoading) {
      return (
        <View style={s.tabEmptyState}>
          <ActivityIndicator color={theme.text.muted} />
        </View>
      );
    }
    const photoPosts = userPosts.filter((p) => !!p.photo_url);
    if (photoPosts.length === 0) {
      return (
        <View style={s.tabEmptyState}>
          <Ionicons name="images-outline" size={32} color={theme.border} />
          <Text style={s.tabEmptyText}>No posts yet</Text>
        </View>
      );
    }
    return (
      <View style={s.postsGrid}>
        {photoPosts.map((post) => {
          const cellSize = (SCREEN_WIDTH - 40 - 4) / 3;
          return (
            <TouchableOpacity
              key={post.id}
              onPress={() => { setSelectedPost(post); setShowPostDetail(true); }}
              style={{ width: cellSize, height: cellSize, margin: 0.5 }}
              activeOpacity={0.85}
            >
              <Image
                source={{ uri: post.photo_url! }}
                style={{ width: '100%', height: '100%', borderRadius: 4 }}
                resizeMode="cover"
              />
            </TouchableOpacity>
          );
        })}
      </View>
    );
  }

  function renderAchievementsTab() {
    if (activitiesLoading) {
      return (
        <View style={s.tabEmptyState}>
          <ActivityIndicator color={theme.text.muted} />
        </View>
      );
    }

    const pbStats = [
      { label: 'Total Workouts', value: `${activities.length}` },
      { label: 'Total Distance', value: `${totalDistanceKm.toFixed(1)} km` },
      { label: 'Current Streak', value: `${currentStreak} days` },
      { label: 'Longest Streak', value: `${longestStreak} days` },
      { label: 'Sessions This Month', value: `${sessionsThisMonth}` },
      { label: 'Avg Duration', value: avgDuration != null ? `${avgDuration} min` : '--' },
    ];

    return (
      <View style={s.achievementsContainer}>
        {/* Personal Bests */}
        <Text style={s.sectionLabel}>PERSONAL BESTS</Text>
        <View style={s.pbGrid}>
          {pbStats.map((stat) => (
            <View key={stat.label} style={s.pbCard}>
              <Text style={s.pbCardLabel}>{stat.label}</Text>
              <Text style={s.pbCardValue}>{stat.value}</Text>
            </View>
          ))}
        </View>

        {/* Badges */}
        <Text style={[s.sectionLabel, { marginTop: 8 }]}>BADGES</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.badgesScrollContent}
          style={s.badgesScroll}
        >
          {BADGES.map((badge) => {
            const earned = badge.earned(activities);
            return (
              <View
                key={badge.id}
                style={[s.badgeCard, !earned && s.badgeCardLocked]}
              >
                <Ionicons
                  name={badge.icon}
                  size={28}
                  color={earned ? badge.color : theme.border}
                />
                {!earned && (
                  <View style={s.badgeLockOverlay}>
                    <Ionicons name="lock-closed" size={10} color={theme.text.muted} />
                  </View>
                )}
                <Text
                  style={[s.badgeName, !earned && s.badgeNameLocked]}
                  numberOfLines={2}
                >
                  {badge.name}
                </Text>
                <Text style={s.badgeSubtitle}>{badge.subtitle}</Text>
              </View>
            );
          })}
        </ScrollView>

        {/* Workout Heatmap */}
        <Text style={[s.sectionLabel, { marginTop: 8 }]}>WORKOUT HISTORY</Text>
        <View style={s.card}>
          <WorkoutHeatmap activities={activities} />
        </View>
      </View>
    );
  }

  function renderAboutTab() {
    return (
      <View style={s.aboutContainer}>
        {/* Bio */}
        {user?.bio ? (
          <View style={s.aboutSection}>
            <Text style={s.aboutBioText}>{user.bio}</Text>
          </View>
        ) : null}

        {/* Sport tags */}
        {user?.sports && user.sports.length > 0 ? (
          <View style={s.aboutSection}>
            <Text style={s.aboutSectionLabel}>SPORTS</Text>
            <View style={s.aboutTagsWrap}>
              {user.sports.map((sport) => (
                <View key={sport} style={s.sportTag}>
                  <Ionicons name={getSportIcon(sport)} size={13} color={theme.text.secondary} />
                  <Text style={s.sportTagText}>{sport}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* Details */}
        <View style={s.aboutSection}>
          <Text style={s.aboutSectionLabel}>DETAILS</Text>
          <View style={s.aboutDetailsList}>
            <View style={s.aboutDetailRow}>
              <Ionicons name="calendar-outline" size={15} color={theme.text.muted} />
              <Text style={s.aboutDetailLabel}>Member since</Text>
              <Text style={s.aboutDetailValue}>{formatJoinDate(user?.created_at)}</Text>
            </View>
            {user?.location ? (
              <View style={s.aboutDetailRow}>
                <Ionicons name="location-outline" size={15} color={theme.text.muted} />
                <Text style={s.aboutDetailLabel}>Location</Text>
                <Text style={s.aboutDetailValue}>{user.location}</Text>
              </View>
            ) : null}
            {user?.email ? (
              <View style={s.aboutDetailRow}>
                <Ionicons name="mail-outline" size={15} color={theme.text.muted} />
                <Text style={s.aboutDetailLabel}>Email</Text>
                <Text style={[s.aboutDetailValue, { color: theme.text.muted }]}>{user.email}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
    <ScrollView
      style={s.container}
      contentContainerStyle={s.contentContainer}
    >
      {/* 1. PROFILE HEADER */}
      <SafeAreaView edges={['top']}>
        <View style={s.topBar}>
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            onPress={() => router.push('/settings')}
            style={s.settingsIconBtn}
            activeOpacity={0.7}
          >
            <Ionicons name="settings-outline" size={22} color={theme.text.secondary} />
          </TouchableOpacity>
        </View>

        <View style={s.profileHeaderSection}>
          <TouchableOpacity onPress={handleAvatarPress} activeOpacity={0.8} style={{ position: 'relative' }}>
            <View style={s.avatarCircle}>
              {user?.avatar_url ? (
                <Image
                  source={{ uri: user.avatar_url }}
                  style={{ width: 80, height: 80, borderRadius: 40 }}
                  resizeMode="cover"
                />
              ) : initials ? (
                <Text style={s.avatarText}>{initials}</Text>
              ) : (
                <Ionicons name="person" size={32} color={theme.text.secondary} />
              )}
            </View>
            <View style={{
              position: 'absolute', bottom: 0, right: 0,
              backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 10,
              width: 20, height: 20, alignItems: 'center', justifyContent: 'center',
            }}>
              <Ionicons name="camera" size={12} color="#fff" />
            </View>
          </TouchableOpacity>

          <Text style={s.displayName}>{displayName}</Text>

          {user?.username ? (
            <Text style={s.usernameText}>@{user.username}</Text>
          ) : null}

          {user?.bio ? (
            <Text style={s.bioText} numberOfLines={2}>{user.bio}</Text>
          ) : (
            <TouchableOpacity onPress={() => router.push('/settings')} activeOpacity={0.7}>
              <Text style={{ color: '#666', fontSize: 13, fontStyle: 'italic', marginTop: 4 }}>Add a bio</Text>
            </TouchableOpacity>
          )}

          {(user?.sport_tags && user.sport_tags.length > 0) || (user?.sports && user.sports.length > 0) ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
              {(user.sport_tags ?? user.sports ?? []).map((sport) => (
                <View key={sport} style={{ backgroundColor: '#1e2a3a', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, marginRight: 6, marginBottom: 4 }}>
                  <Text style={{ color: '#5b9bd5', fontSize: 12 }}>{sport}</Text>
                </View>
              ))}
              <TouchableOpacity onPress={() => router.push('/settings')} activeOpacity={0.7} style={{ marginBottom: 4 }}>
                <Ionicons name="pencil" size={14} color="#666" />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[s.sportTag, s.sportTagAdd]}
              onPress={() => router.push('/settings')}
              activeOpacity={0.7}
            >
              <Ionicons name="add" size={13} color={theme.text.secondary} />
              <Text style={s.sportTagText}>Add sports</Text>
            </TouchableOpacity>
          )}

          {user?.location ? (
            <View style={s.locationRow}>
              <Ionicons name="location-outline" size={14} color={theme.text.secondary} />
              <Text style={s.locationText}>{user.location}</Text>
            </View>
          ) : null}

          {/* Social stats row */}
          <View style={s.socialStatsRow}>
            <TouchableOpacity style={s.socialStatItem} onPress={() => openSocialSheet('following')} activeOpacity={0.7}>
              <Text style={s.socialStatValue}>{user?.following_count ?? 0}</Text>
              <Text style={s.socialStatLabel}>Following</Text>
            </TouchableOpacity>
            <View style={s.socialStatDivider} />
            <TouchableOpacity style={s.socialStatItem} onPress={() => openSocialSheet('followers')} activeOpacity={0.7}>
              <Text style={s.socialStatValue}>{user?.followers_count ?? 0}</Text>
              <Text style={s.socialStatLabel}>Followers</Text>
            </TouchableOpacity>
            <View style={s.socialStatDivider} />
            <View style={s.socialStatItem}>
              <Text style={s.socialStatValue}>{userPosts.length}</Text>
              <Text style={s.socialStatLabel}>Posts</Text>
            </View>
            <View style={s.socialStatDivider} />
            <View style={s.socialStatItem}>
              <Text style={s.socialStatValue}>{formatJoinDate(user?.created_at)}</Text>
              <Text style={s.socialStatLabel}>Joined</Text>
            </View>
          </View>

          {/* Highlights Row */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 16 }} contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}>
            {/* New highlight button */}
            <TouchableOpacity onPress={() => setShowHighlightSheet(true)} style={{ alignItems: 'center', gap: 4 }}>
              <View style={{ width: 60, height: 60, borderRadius: 30, borderWidth: 1.5, borderColor: '#444', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: '#111' }}>
                <Ionicons name="add" size={24} color="#888" />
              </View>
              <Text style={{ color: '#888', fontSize: 11 }}>New</Text>
            </TouchableOpacity>
            {/* Placeholder highlights — hardcoded for now */}
          </ScrollView>

          {/* Edit Profile / Customize pill buttons */}
          <View style={s.profileActionRow}>
            <TouchableOpacity
              style={s.profileActionBtn}
              onPress={() => router.push('/settings')}
              activeOpacity={0.75}
            >
              <Text style={s.profileActionBtnText}>Edit Profile</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.profileActionBtn}
              onPress={() => router.push('/settings')}
              activeOpacity={0.75}
            >
              <Text style={s.profileActionBtnText}>Customize</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>

      {/* 2. TAB BAR */}
      <View style={s.tabBar}>
        {(['posts', 'achievements', 'about'] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={s.tabItem}
            onPress={() => setProfileTab(tab)}
            activeOpacity={0.7}
          >
            <Text style={[s.tabLabel, profileTab === tab && s.tabLabelActive]}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
            {profileTab === tab && <View style={s.tabUnderline} />}
          </TouchableOpacity>
        ))}
      </View>

      {/* 3. TAB CONTENT */}
      <View style={s.tabContent}>
        {profileTab === 'posts' && renderPostsTab()}
        {profileTab === 'achievements' && renderAchievementsTab()}
        {profileTab === 'about' && renderAboutTab()}
      </View>

      <View style={s.bottomPadding} />
    </ScrollView>

    {/* ── Highlight Sheet Modal ── */}
    <Modal visible={showHighlightSheet} transparent animationType="slide" onRequestClose={() => setShowHighlightSheet(false)}>
      <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} onPress={() => setShowHighlightSheet(false)} />
      <View style={{ backgroundColor: '#1a1a1a', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 }}>
        <Text style={{ color: '#fff', fontSize: 17, fontWeight: '600', marginBottom: 8 }}>New Highlight</Text>
        <Text style={{ color: '#888', fontSize: 14 }}>Create highlights from your stories (coming soon)</Text>
        <TouchableOpacity onPress={() => setShowHighlightSheet(false)} style={{ marginTop: 20, alignItems: 'center' }}>
          <Text style={{ color: '#5b9bd5', fontSize: 16 }}>Close</Text>
        </TouchableOpacity>
      </View>
    </Modal>

    {/* ── Post Detail Modal ── */}
    <PostDetailModal
      visible={showPostDetail}
      post={selectedPost}
      currentUserId={user?.id || ''}
      onClose={() => { setShowPostDetail(false); setSelectedPost(null); }}
      onProfilePress={() => {}}
      onPostDeleted={(postId) => {
        setUserPosts(prev => prev.filter(p => p.id !== postId));
        setShowPostDetail(false);
        setSelectedPost(null);
      }}
    />
    <Modal
      visible={false}
      onRequestClose={() => {}}
    >
      <View style={{ flex: 1, backgroundColor: '#0a0a0a' }}>
        <SafeAreaView edges={['top']} style={{ flex: 1 }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#2a2a2a' }}>
            <TouchableOpacity onPress={() => { setShowPostDetail(false); setSelectedPost(null); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="arrow-back" size={24} color="#f0f0f0" />
            </TouchableOpacity>
            <Text style={{ flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: '#f0f0f0' }}>Post</Text>
            <TouchableOpacity
              onPress={() => selectedPost && setShowMenuForPost(selectedPost.id)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="ellipsis-horizontal" size={22} color="#888888" />
            </TouchableOpacity>
          </View>

          {/* Post content */}
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
            {selectedPost?.photo_url && (
              <Image
                source={{ uri: selectedPost.photo_url }}
                style={{ width: '100%', aspectRatio: 1, borderRadius: 12 }}
                resizeMode="cover"
              />
            )}
            {selectedPost?.oryx_data_card_json && (
              <View style={{ backgroundColor: '#1a1a1a', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#2a2a2a' }}>
                <Text style={{ fontSize: 12, color: '#888888' }}>{selectedPost.oryx_data_card_json.post_type?.toUpperCase() || 'ORYX CARD'}</Text>
              </View>
            )}
            {selectedPost?.caption && (
              <Text style={{ fontSize: 14, color: '#f0f0f0', lineHeight: 20 }}>{selectedPost.caption}</Text>
            )}
            {selectedPost?.time_ago && (
              <Text style={{ fontSize: 11, color: '#555555' }}>{selectedPost.time_ago}</Text>
            )}
          </ScrollView>
        </SafeAreaView>
      </View>

      {/* Post options menu */}
      <Modal
        visible={showMenuForPost !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMenuForPost(null)}
      >
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}
          activeOpacity={1}
          onPress={() => setShowMenuForPost(null)}
        >
          <View style={{ backgroundColor: '#1a1a1a', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 10, paddingBottom: insets.bottom + 20 }}>
            <TouchableOpacity
              onPress={() => {
                setShowMenuForPost(null);
                setEditCaptionText(selectedPost?.caption || '');
                setShowEditCaption(true);
              }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: '#2a2a2a', borderRadius: 12 }}
            >
              <Ionicons name="pencil-outline" size={18} color="#f0f0f0" />
              <Text style={{ fontSize: 15, color: '#f0f0f0' }}>Edit Caption</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={async () => {
                if (!selectedPost) return;
                setShowMenuForPost(null);
                Alert.alert('Delete Post', 'Delete this post permanently?', [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete', style: 'destructive', onPress: async () => {
                      try {
                        await deletePost(selectedPost.id);
                        setUserPosts(prev => prev.filter(p => p.id !== selectedPost.id));
                        setShowPostDetail(false);
                        setSelectedPost(null);
                      } catch {
                        Alert.alert('Error', 'Could not delete post.');
                      }
                    }
                  }
                ]);
              }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: '#2a2a2a', borderRadius: 12 }}
            >
              <Ionicons name="trash-outline" size={18} color="#c0392b" />
              <Text style={{ fontSize: 15, color: '#c0392b' }}>Delete Post</Text>
            </TouchableOpacity>
            {selectedPost?.photo_url && (
              <TouchableOpacity
                onPress={async () => {
                  if (!selectedPost?.photo_url) return;
                  setShowMenuForPost(null);
                  try {
                    await createStory({ photo_url: selectedPost.photo_url, source_post_id: selectedPost.id });
                    Alert.alert('Shared', 'Post shared as a story!');
                  } catch {
                    Alert.alert('Error', 'Could not share as story.');
                  }
                }}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: '#2a2a2a', borderRadius: 12 }}
              >
                <Ionicons name="share-outline" size={18} color="#f0f0f0" />
                <Text style={{ fontSize: 15, color: '#f0f0f0' }}>Share as Story</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => setShowMenuForPost(null)}
              style={{ padding: 14, alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: '#2a2a2a' }}
            >
              <Text style={{ fontSize: 15, color: '#888888' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Edit caption modal */}
      <Modal
        visible={showEditCaption}
        transparent
        animationType="slide"
        onRequestClose={() => setShowEditCaption(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#1a1a1a', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 12, paddingBottom: insets.bottom + 20 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#f0f0f0' }}>Edit Caption</Text>
            <TextInput
              style={{ backgroundColor: '#2a2a2a', borderRadius: 12, padding: 12, color: '#f0f0f0', fontSize: 14, minHeight: 80 }}
              value={editCaptionText}
              onChangeText={setEditCaptionText}
              multiline
              autoFocus
              placeholderTextColor="#555555"
              placeholder="Caption..."
            />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity
                onPress={() => setShowEditCaption(false)}
                style={{ flex: 1, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#2a2a2a', alignItems: 'center' }}
              >
                <Text style={{ color: '#888888', fontWeight: '600' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={async () => {
                  if (!selectedPost) return;
                  try {
                    await editPostCaption(selectedPost.id, editCaptionText);
                    setUserPosts(prev => prev.map(p =>
                      p.id === selectedPost.id ? { ...p, caption: editCaptionText } : p
                    ));
                    setSelectedPost(prev => prev ? { ...prev, caption: editCaptionText } : prev);
                    setShowEditCaption(false);
                  } catch {
                    Alert.alert('Error', 'Could not update caption.');
                  }
                }}
                style={{ flex: 1, padding: 14, borderRadius: 12, backgroundColor: '#f0f0f0', alignItems: 'center' }}
              >
                <Text style={{ color: '#000000', fontWeight: '700' }}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </Modal>

    {/* ── Followers / Following sheet ── */}
    <Modal
      visible={socialSheet !== null}
      animationType="slide"
      transparent
      onRequestClose={() => setSocialSheet(null)}
    >
      <View style={s.sheetOverlay}>
        <View style={s.sheetContainer}>
          {/* Handle */}
          <View style={s.sheetHandle} />
          {/* Header */}
          <View style={s.sheetHeader}>
            <Text style={s.sheetTitle}>
              {socialSheet === 'following' ? 'Following' : 'Followers'}
            </Text>
            <TouchableOpacity onPress={() => setSocialSheet(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={22} color={theme.text.muted} />
            </TouchableOpacity>
          </View>

          {/* List */}
          {socialLoading ? (
            <View style={s.sheetEmpty}>
              <ActivityIndicator color={theme.text.muted} />
            </View>
          ) : socialList.length === 0 ? (
            <View style={s.sheetEmpty}>
              <Text style={s.sheetEmptyText}>
                {socialSheet === 'following' ? 'Not following anyone yet' : 'No followers yet'}
              </Text>
            </View>
          ) : (
            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
              {socialList.map((u) => {
                const isFollowing = socialFollowState[u.id] ?? u.is_following ?? false;
                const initials = u.initials || (u.display_name || '?').slice(0, 2).toUpperCase();
                return (
                  <View key={u.id} style={s.sheetRow}>
                    <View style={s.sheetAvatar}>
                      <Text style={s.sheetAvatarText}>{initials}</Text>
                    </View>
                    <View style={s.sheetRowInfo}>
                      <Text style={s.sheetRowName} numberOfLines={1}>{u.display_name || u.username || 'Athlete'}</Text>
                      {u.sport_tags && u.sport_tags.length > 0 && (
                        <Text style={s.sheetRowTags} numberOfLines={1}>
                          {u.sport_tags.slice(0, 3).join(' · ')}
                        </Text>
                      )}
                    </View>
                    {u.id !== user?.id && (
                      <TouchableOpacity
                        style={[s.sheetFollowBtn, isFollowing && s.sheetFollowBtnActive]}
                        onPress={() => handleSocialFollow(u.id)}
                        activeOpacity={0.7}
                      >
                        <Text style={[s.sheetFollowBtnText, isFollowing && s.sheetFollowBtnTextActive]}>
                          {isFollowing ? 'Following' : 'Follow'}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
              <View style={{ height: 24 }} />
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

function createStyles(t: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: t.bg.primary,
    },
    contentContainer: {
      paddingHorizontal: 20,
      paddingBottom: 40,
    },

    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingTop: 8,
      paddingBottom: 4,
    },
    settingsIconBtn: {
      padding: 6,
    },

    profileHeaderSection: {
      alignItems: 'center',
      paddingTop: 8,
      paddingBottom: 16,
      gap: 10,
    },
    avatarCircle: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: t.bg.elevated,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 4,
    },
    avatarText: {
      fontSize: 28,
      fontWeight: '700',
      color: t.text.primary,
      letterSpacing: 1,
    },
    displayName: {
      fontSize: 22,
      fontWeight: '700',
      color: t.text.primary,
      textAlign: 'center',
    },
    usernameText: {
      fontSize: 15,
      color: t.text.muted,
    },
    bioText: {
      fontSize: 14,
      color: t.text.secondary,
      textAlign: 'center',
      lineHeight: 20,
      paddingHorizontal: 20,
    },
    sportTagsScroll: {
      maxHeight: 36,
    },
    sportTagsContent: {
      gap: 8,
      paddingHorizontal: 4,
    },
    sportTag: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: t.bg.elevated,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 20,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    sportTagAdd: {
      borderStyle: 'dashed',
    },
    sportTagText: {
      fontSize: 13,
      color: t.text.secondary,
    },
    locationRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    locationText: {
      fontSize: 13,
      color: t.text.secondary,
    },

    socialStatsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 4,
    },
    socialStatItem: {
      alignItems: 'center',
      paddingHorizontal: 20,
      gap: 2,
    },
    socialStatValue: {
      fontSize: 15,
      fontWeight: '700',
      color: t.text.primary,
    },
    socialStatLabel: {
      fontSize: 11,
      color: t.text.muted,
    },
    socialStatDivider: {
      width: 1,
      height: 24,
      backgroundColor: t.border,
    },

    profileActionRow: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 4,
    },
    profileActionBtn: {
      paddingHorizontal: 18,
      paddingVertical: 7,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.bg.elevated,
    },
    profileActionBtnText: {
      fontSize: 13,
      fontWeight: '600',
      color: t.text.primary,
    },

    // Tab bar
    tabBar: {
      flexDirection: 'row',
      borderBottomWidth: 1,
      borderBottomColor: t.border,
      marginBottom: 16,
    },
    tabItem: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 12,
      position: 'relative',
    },
    tabLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: t.text.muted,
    },
    tabLabelActive: {
      color: t.text.primary,
    },
    tabUnderline: {
      position: 'absolute',
      bottom: 0,
      left: '15%',
      right: '15%',
      height: 2,
      borderRadius: 1,
      backgroundColor: t.text.primary,
    },

    tabContent: {
      flex: 1,
    },

    tabEmptyState: {
      alignItems: 'center',
      paddingVertical: 48,
      gap: 10,
    },
    tabEmptyText: {
      fontSize: 14,
      color: t.text.muted,
    },

    // Posts grid
    postsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginBottom: 16,
    },

    // Achievements tab
    achievementsContainer: {
      gap: 0,
    },
    pbGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      marginBottom: 12,
    },
    pbCard: {
      width: (SCREEN_WIDTH - 40 - 10) / 2,
      backgroundColor: t.bg.elevated,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: t.border,
      padding: 14,
      gap: 6,
    },
    pbCardLabel: {
      fontSize: 11,
      color: t.text.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    pbCardValue: {
      fontSize: 20,
      fontWeight: '700',
      color: t.text.primary,
    },

    badgesScroll: {
      marginBottom: 12,
    },
    badgesScrollContent: {
      gap: 10,
      paddingRight: 4,
    },
    badgeCard: {
      width: 100,
      height: 110,
      backgroundColor: t.bg.elevated,
      borderWidth: 1,
      borderColor: t.border,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 8,
      gap: 6,
    },
    badgeCardLocked: {
      opacity: 0.35,
    },
    badgeLockOverlay: {
      position: 'absolute',
      top: 6,
      right: 6,
    },
    badgeName: {
      fontSize: 12,
      fontWeight: '700',
      color: t.text.primary,
      textAlign: 'center',
    },
    badgeNameLocked: {
      color: t.text.muted,
    },
    badgeSubtitle: {
      fontSize: 10,
      color: t.text.muted,
      textAlign: 'center',
    },

    card: {
      backgroundColor: t.bg.elevated,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: t.border,
      marginBottom: 12,
    },

    sectionLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: t.text.muted,
      textTransform: 'uppercase',
      letterSpacing: 2,
      marginBottom: 10,
      marginTop: 4,
    },

    // About tab
    aboutContainer: {
      gap: 20,
      paddingBottom: 8,
    },
    aboutSection: {
      gap: 10,
    },
    aboutSectionLabel: {
      fontSize: 11,
      fontWeight: '600',
      color: t.text.muted,
      textTransform: 'uppercase',
      letterSpacing: 1.5,
    },
    aboutBioText: {
      fontSize: 15,
      color: t.text.primary,
      lineHeight: 22,
    },
    aboutTagsWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    aboutDetailsList: {
      gap: 12,
    },
    aboutDetailRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    aboutDetailLabel: {
      fontSize: 14,
      color: t.text.secondary,
      flex: 1,
    },
    aboutDetailValue: {
      fontSize: 14,
      color: t.text.primary,
      fontWeight: '500',
    },

    bottomPadding: {
      height: 24,
    },

    // Social sheet
    sheetOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'flex-end',
    },
    sheetContainer: {
      backgroundColor: t.bg.secondary,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: 20,
      paddingBottom: 0,
      maxHeight: '80%',
    },
    sheetHandle: {
      width: 36, height: 4, borderRadius: 2,
      backgroundColor: t.border,
      alignSelf: 'center', marginTop: 12, marginBottom: 4,
    },
    sheetHeader: {
      flexDirection: 'row', alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 16,
      borderBottomWidth: 1, borderBottomColor: t.border,
    },
    sheetTitle: {
      fontSize: 16, fontWeight: '700', color: t.text.primary,
    },
    sheetEmpty: {
      paddingVertical: 48, alignItems: 'center',
    },
    sheetEmptyText: {
      fontSize: 14, color: t.text.muted,
    },
    sheetRow: {
      flexDirection: 'row', alignItems: 'center',
      paddingVertical: 12, gap: 12,
      borderBottomWidth: 1, borderBottomColor: t.border,
    },
    sheetAvatar: {
      width: 44, height: 44, borderRadius: 22,
      backgroundColor: t.bg.elevated,
      alignItems: 'center', justifyContent: 'center',
    },
    sheetAvatarText: {
      fontSize: 15, fontWeight: '700', color: t.text.primary,
    },
    sheetRowInfo: {
      flex: 1, gap: 2,
    },
    sheetRowName: {
      fontSize: 14, fontWeight: '600', color: t.text.primary,
    },
    sheetRowTags: {
      fontSize: 11, color: t.text.muted,
    },
    sheetFollowBtn: {
      paddingHorizontal: 16, paddingVertical: 7,
      borderRadius: 20, borderWidth: 1, borderColor: t.accent,
    },
    sheetFollowBtnActive: {
      backgroundColor: t.bg.elevated, borderColor: t.border,
    },
    sheetFollowBtnText: {
      fontSize: 13, fontWeight: '600', color: t.accent,
    },
    sheetFollowBtnTextActive: {
      color: t.text.muted,
    },
  });
}
