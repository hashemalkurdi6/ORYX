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
  Share,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import {
  getActivities,
  getActivityHeatmap,
  HeatmapEntry,
  getFollowers,
  getFollowing,
  followUser,
  unfollowUser,
  getUserPosts,
  editPostCaption,
  deletePost,
  patchPost,
  createStory,
  uploadMedia,
  updateMyProfile,
  getUserHighlights,
  deleteHighlight,
  Activity,
  UserPreview,
  Post,
  Highlight,
} from '@/services/api';
import { useAuthStore } from '@/services/authStore';
import apiClient from '@/services/api';
import PostDetailModal from '@/components/PostDetailModal';
import AmbientBackdrop from '@/components/AmbientBackdrop';
import StoryCreator from '@/components/StoryCreator';
import PostCreator from '@/components/PostCreator';
import { useTheme } from '@/contexts/ThemeContext';
import { ThemeColors, theme as T, type as TY, radius as R, space as SP } from '@/services/theme';
import { useCountUp } from '@/services/animations';
import { LinearGradient } from 'expo-linear-gradient';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Count-up wrapper for integer stats. `cacheKey` avoids replaying the
// animation when the screen re-mounts (tab switch, modal dismiss, etc.).
function StatCountUp({ value, style, cacheKey }: { value: number; style: any; cacheKey?: string }) {
  const v = useCountUp(value, 900, 100, cacheKey);
  return <Text style={style}>{v.toLocaleString()}</Text>;
}

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
  const dates = new Set(activities.map((a) => (a.start_date ?? '').split('T')[0]).filter(Boolean));
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
  const dateSet = new Set(activities.map((a) => (a.start_date ?? '').split('T')[0]).filter(Boolean));
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
    color: T.status.success,
    earned: (a) => a.length >= 1,
  },
  {
    id: '10_workouts',
    name: '10 Workouts',
    subtitle: 'Building the habit',
    icon: 'star',
    color: T.text.secondary,
    earned: (a) => a.length >= 10,
  },
  {
    id: '50_workouts',
    name: '50 Workouts',
    subtitle: 'Committed athlete',
    icon: 'trophy',
    color: T.text.secondary,
    earned: (a) => a.length >= 50,
  },
  {
    id: '100_workouts',
    name: '100 Workouts',
    subtitle: 'Elite consistency',
    icon: 'ribbon',
    color: T.text.secondary,
    earned: (a) => a.length >= 100,
  },
  {
    id: 'early_bird',
    name: 'Early Bird',
    subtitle: 'Up before 6am',
    icon: 'sunny',
    color: T.text.secondary,
    earned: (a) =>
      a.some((act) => {
        if (!act.start_date) return false;
        const hour = new Date(act.start_date).getHours();
        return hour < 6;
      }),
  },
  {
    id: 'distance_king',
    name: 'Distance King',
    subtitle: 'Half marathon+',
    icon: 'navigate',
    color: T.text.secondary,
    earned: (a) => a.some((act) => (act.distance_meters ?? 0) > 21000),
  },
  {
    id: 'consistent',
    name: 'Consistent',
    subtitle: '7-day streak',
    icon: 'calendar',
    color: T.text.secondary,
    earned: (a) => computeCurrentStreak(a) >= 7,
  },
  {
    id: 'green_week',
    name: 'Green Week',
    subtitle: 'Peak recovery run',
    icon: 'leaf',
    color: T.status.success,
    earned: (_a) => false,
  },
];

// ── Heatmap ──────────────────────────────────────────────────────────────────

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function WorkoutHeatmap({ activities, entries }: { activities: Activity[]; entries?: HeatmapEntry[] }) {
  const { theme } = useTheme();

  const dateCounts: Record<string, number> = {};
  if (entries && entries.length > 0) {
    entries.forEach((e) => { dateCounts[e.date] = e.count; });
  } else {
    activities.forEach((a) => {
      if (!a.start_date) return;
      const d = a.start_date.split('T')[0];
      dateCounts[d] = (dateCounts[d] ?? 0) + 1;
    });
  }

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

  const totalWorkouts = entries && entries.length > 0
    ? entries.filter((e) => e.count > 0).length
    : new Set(activities.map((a) => (a.start_date ?? '').split('T')[0]).filter(Boolean)).size;

  function cellColor(count: number): string {
    if (count === 0) return theme.border;
    if (count === 1) return 'rgba(39,174,96,0.4)';
    if (count === 2) return 'rgba(39,174,96,0.7)';
    return T.status.success;
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
  const [heatmapEntries, setHeatmapEntries] = useState<HeatmapEntry[]>([]);

  // Posts grid
  const [userPosts, setUserPosts] = useState<Post[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [showPostDetail, setShowPostDetail] = useState(false);
  const [showMenuForPost, setShowMenuForPost] = useState<string | null>(null);
  const [editCaptionText, setEditCaptionText] = useState('');
  const [showEditCaption, setShowEditCaption] = useState(false);

  // Create menu (+ button) + inline story/post composers
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [showStoryCreator, setShowStoryCreator] = useState(false);
  const [showPostCreator, setShowPostCreator] = useState(false);

  // Posts tab: portfolio-first layout + long-press action menu.
  //   'grid'      → 3-col dense (power-user option)
  //   'portfolio' → 2-col, natural aspect ratios (VSCO-style — horizontal
  //                 shots show horizontal, portraits show tall)
  //   'timeline'  → 1-col full-width with AI caption, natural aspect
  type GridLayout = 'grid' | 'portfolio' | 'timeline';
  const [gridLayout, setGridLayout] = useState<GridLayout>(
    (user?.post_grid_layout as GridLayout) ?? 'portfolio',
  );
  const [postActionMenu, setPostActionMenu] = useState<Post | null>(null);

  // Per-post aspect ratios captured from Image onLoad events.
  // Populated once per photo, shared across Portfolio + Timeline renders so
  // switching layouts doesn't re-fetch. Default fallback (until loaded):
  //   Portfolio = 0.8 (4:5 portrait), Timeline = 1 (square).
  const [postAspects, setPostAspects] = useState<Record<string, number>>({});
  const captureAspect = useCallback((postId: string) => (e: any) => {
    const src = e?.nativeEvent?.source;
    if (!src?.width || !src?.height) return;
    const ratio = src.width / src.height;
    setPostAspects((prev) => (prev[postId] === ratio ? prev : { ...prev, [postId]: ratio }));
  }, []);

  // Keep the in-memory toggle in sync with the value coming from the server
  // (e.g. the user changed it on another device and then opened the app).
  useEffect(() => {
    const pref = user?.post_grid_layout;
    if (pref && pref !== gridLayout) {
      setGridLayout(pref as GridLayout);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.post_grid_layout]);

  const changeGridLayout = useCallback(async (next: GridLayout) => {
    if (next === gridLayout) return;
    setGridLayout(next);                       // optimistic
    updateUser({ post_grid_layout: next });    // local Zustand store
    try {
      await updateMyProfile({ post_grid_layout: next });
    } catch {
      // silent — the layout still works for this session even if persistence fails
    }
  }, [gridLayout, updateUser]);

  // Achievements tab: badge detail sheet
  const [selectedBadge, setSelectedBadge] = useState<typeof BADGES[number] | null>(null);

  // Highlights row
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [highlightActionMenu, setHighlightActionMenu] = useState<Highlight | null>(null);

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
      // Streak + badges read from the activities list; heatmap uses the
      // dedicated 365-day endpoint so the calendar is accurate regardless
      // of how many recent activities were paged in.
      const [list, heat] = await Promise.all([
        getActivities(1, 20).catch(() => [] as Activity[]),
        getActivityHeatmap(365).catch(() => [] as HeatmapEntry[]),
      ]);
      setActivities(list);
      setHeatmapEntries(heat);
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

  // ── Highlights load (refresh on focus so Create Highlight reflects back) ──

  const loadHighlights = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await getUserHighlights(user.id);
      setHighlights(res.highlights);
    } catch {
      setHighlights([]);
    }
  }, [user?.id]);

  useFocusEffect(useCallback(() => { loadHighlights(); }, [loadHighlights]));

  // ── Avatar upload ────────────────────────────────────────────────────────

  const handleShareProfile = useCallback(async () => {
    const handle = user?.username ?? (user?.email?.split('@')[0] || 'me');
    try {
      await Share.share({
        message: `Check out @${handle} on ORYX`,
        url: `https://oryx.app/u/${handle}`,
      });
    } catch {
      // user cancelled
    }
  }, [user?.username, user?.email]);

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
    const photoPosts = userPosts.filter((p) => !!p.photo_url && !p.is_archived);
    const pinnedPosts = photoPosts.filter((p) => !!p.is_pinned);
    const regularPosts = photoPosts.filter((p) => !p.is_pinned);
    const orderedPosts = [...pinnedPosts, ...regularPosts];

    // Three layouts, three icons. The full-grid preview uses an icon-row
    // rather than a cycling single-icon, so the user can see their choices.
    const LAYOUT_ICONS: { key: GridLayout; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
      { key: 'grid',      icon: 'grid-outline' },
      { key: 'portfolio', icon: 'apps-outline' },
      { key: 'timeline',  icon: 'list-outline' },
    ];

    if (photoPosts.length === 0) {
      return (
        <View>
          <LayoutToggle />
          <View style={s.tabEmptyState}>
            <Ionicons name="images-outline" size={32} color={theme.border} />
            <Text style={s.tabEmptyText}>No posts yet</Text>
          </View>
        </View>
      );
    }

    // Grid: 3-col dense, 1:1 cells, 1px margin — retained for power users.
    // Portfolio: 2-col, **natural aspect per image** (VSCO portfolio style).
    //            Horizontal shots are short + wide; portraits stay tall.
    // Timeline:  full-width, natural aspect + AI caption + metadata row.
    const SIDE_PADDING = 0;
    const CONTENT_W = SCREEN_WIDTH - 40;

    const gridCellSize = (CONTENT_W - 2 * 2) / 3;
    const portfolioGap = SP[2];
    const portfolioWidth = (CONTENT_W - portfolioGap) / 2;

    function LayoutToggle() {
      return (
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: 4, paddingBottom: SP[3],
        }}>
          <Text style={{
            fontFamily: TY.mono.semibold, fontSize: TY.size.micro,
            color: T.text.muted, letterSpacing: TY.tracking.label,
            textTransform: 'uppercase',
          }}>
            {photoPosts.length} {photoPosts.length === 1 ? 'post' : 'posts'}
          </Text>
          <View style={{
            flexDirection: 'row',
            backgroundColor: T.glass.pill,
            borderWidth: 1,
            borderColor: T.glass.border,
            borderRadius: R.pill,
            padding: 2,
            gap: 2,
          }}>
            {LAYOUT_ICONS.map(({ key, icon }) => {
              const active = gridLayout === key;
              return (
                <TouchableOpacity
                  key={key}
                  onPress={() => changeGridLayout(key)}
                  hitSlop={6}
                  style={{
                    width: 28, height: 26, borderRadius: R.pill,
                    alignItems: 'center', justifyContent: 'center',
                    backgroundColor: active ? T.accent : 'transparent',
                  }}
                >
                  <Ionicons name={icon} size={14} color={active ? T.accentInk : T.text.body} />
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      );
    }

    const PinBadge = () => (
      <View style={{
        position: 'absolute', top: 6, left: 6,
        backgroundColor: T.accent,
        borderRadius: R.pill,
        width: 22, height: 22,
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Ionicons name="pin" size={12} color={T.accentInk} />
      </View>
    );

    // ── Grid (3-col) ────────────────────────────────────────────────────
    if (gridLayout === 'grid') {
      return (
        <View>
          <LayoutToggle />
          <View style={s.postsGrid}>
            {orderedPosts.map((post) => (
              <TouchableOpacity
                key={post.id}
                onPress={() => { setSelectedPost(post); setShowPostDetail(true); }}
                onLongPress={() => setPostActionMenu(post)}
                delayLongPress={260}
                style={{ width: gridCellSize, height: gridCellSize, margin: 1, position: 'relative' }}
                activeOpacity={0.85}
              >
                <Image
                  source={{ uri: post.photo_url! }}
                  style={{ width: '100%', height: '100%', borderRadius: R.xs }}
                  resizeMode="cover"
                />
                {post.is_pinned ? <PinBadge /> : null}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      );
    }

    // ── Portfolio (2-col, natural aspect per image — VSCO style) ───────
    if (gridLayout === 'portfolio') {
      // Split posts between two columns so heights stagger naturally (masonry).
      // Sequential fill, alternating columns, keeps the feed ordered while
      // letting each image breathe at its true aspect ratio.
      const leftCol: Post[] = [];
      const rightCol: Post[] = [];
      let leftHeight = 0;
      let rightHeight = 0;
      for (const post of orderedPosts) {
        const aspect = postAspects[post.id] ?? 0.8; // 4:5 fallback until load
        const cellHeight = portfolioWidth / aspect;
        if (leftHeight <= rightHeight) {
          leftCol.push(post);
          leftHeight += cellHeight + portfolioGap;
        } else {
          rightCol.push(post);
          rightHeight += cellHeight + portfolioGap;
        }
      }

      const Cell = ({ post }: { post: Post }) => (
        <TouchableOpacity
          key={post.id}
          onPress={() => { setSelectedPost(post); setShowPostDetail(true); }}
          onLongPress={() => setPostActionMenu(post)}
          delayLongPress={260}
          style={{
            width: portfolioWidth,
            aspectRatio: postAspects[post.id] ?? 0.8,
            marginBottom: portfolioGap,
            borderRadius: R.md,
            overflow: 'hidden',
            position: 'relative',
          }}
          activeOpacity={0.85}
        >
          <Image
            source={{ uri: post.photo_url! }}
            style={{ width: '100%', height: '100%' }}
            resizeMode="cover"
            onLoad={captureAspect(post.id)}
          />
          {post.is_pinned ? <PinBadge /> : null}
        </TouchableOpacity>
      );

      return (
        <View>
          <LayoutToggle />
          <View style={{ flexDirection: 'row', gap: portfolioGap, paddingHorizontal: SIDE_PADDING }}>
            <View style={{ flex: 1 }}>
              {leftCol.map((post) => <Cell key={post.id} post={post} />)}
            </View>
            <View style={{ flex: 1 }}>
              {rightCol.map((post) => <Cell key={post.id} post={post} />)}
            </View>
          </View>
        </View>
      );
    }

    // ── Timeline (1-col, natural aspect, caption + metadata) ────────────
    const fmtDate = (iso: string | null | undefined): string => {
      if (!iso) return '';
      const d = new Date(iso);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
    };

    return (
      <View>
        <LayoutToggle />
        <View style={{ gap: SP[7] }}>
          {orderedPosts.map((post) => {
            const session = post.oryx_data_card_json;
            const sessionName: string | undefined =
              (session && (session.session_name || session.custom_title)) || undefined;
            const sportCategory: string | undefined = session?.sport_category;
            return (
              <TouchableOpacity
                key={post.id}
                onPress={() => { setSelectedPost(post); setShowPostDetail(true); }}
                onLongPress={() => setPostActionMenu(post)}
                delayLongPress={260}
                activeOpacity={0.9}
                style={{ gap: SP[3] }}
              >
                <View style={{ position: 'relative' }}>
                  <Image
                    source={{ uri: post.photo_url! }}
                    style={{
                      width: CONTENT_W,
                      aspectRatio: postAspects[post.id] ?? 1,
                      borderRadius: R.md,
                    }}
                    resizeMode="cover"
                    onLoad={captureAspect(post.id)}
                  />
                  {post.is_pinned ? <PinBadge /> : null}
                </View>

                {post.caption ? (
                  <Text
                    style={{
                      fontFamily: TY.sans.regular,
                      fontSize: TY.size.body,
                      color: T.text.body,
                      lineHeight: 20,
                    }}
                    numberOfLines={4}
                  >
                    {post.caption}
                  </Text>
                ) : null}

                {/* Metadata row — date, location, session pill */}
                <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: SP[2] }}>
                  <Text style={{
                    fontFamily: TY.mono.semibold,
                    fontSize: TY.size.micro,
                    color: T.text.muted,
                    letterSpacing: TY.tracking.label,
                  }}>
                    {fmtDate(post.created_at)}
                  </Text>
                  {post.location_text ? (
                    <>
                      <View style={{ width: 2, height: 2, borderRadius: 1, backgroundColor: T.text.muted }} />
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name="location-outline" size={11} color={T.text.muted} />
                        <Text style={{
                          fontFamily: TY.sans.regular,
                          fontSize: TY.size.small,
                          color: T.text.muted,
                        }}>
                          {post.location_text}
                        </Text>
                      </View>
                    </>
                  ) : null}
                  {sessionName ? (
                    <View style={{
                      flexDirection: 'row', alignItems: 'center', gap: 4,
                      backgroundColor: T.glass.pill,
                      borderWidth: 1, borderColor: T.glass.border,
                      borderRadius: R.pill,
                      paddingHorizontal: SP[2] + 2, paddingVertical: 2,
                      marginLeft: SP[1],
                    }}>
                      <Ionicons
                        name={sportCategory ? getSportIcon(sportCategory) : 'fitness-outline'}
                        size={11}
                        color={T.text.body}
                      />
                      <Text style={{
                        fontFamily: TY.sans.medium,
                        fontSize: TY.size.small,
                        color: T.text.body,
                      }}>
                        {sessionName}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
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
        {/* Badges (earned first, then locked) */}
        <Text style={s.sectionLabel}>ACHIEVEMENTS</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.badgesScrollContent}
          style={s.badgesScroll}
        >
          {BADGES.map((badge) => {
            const earned = badge.earned(activities);
            return (
              <TouchableOpacity
                key={badge.id}
                onPress={() => setSelectedBadge(badge)}
                activeOpacity={0.75}
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
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Personal Bests */}
        <Text style={[s.sectionLabel, { marginTop: 8 }]}>PERSONAL BESTS</Text>
        <View style={s.pbGrid}>
          {pbStats.map((stat) => (
            <View key={stat.label} style={s.pbCard}>
              <Text style={s.pbCardLabel}>{stat.label}</Text>
              <Text style={s.pbCardValue}>{stat.value}</Text>
            </View>
          ))}
        </View>

        {/* Training Activity heatmap */}
        <Text style={[s.sectionLabel, { marginTop: 8 }]}>TRAINING ACTIVITY</Text>
        <View style={s.card}>
          <WorkoutHeatmap activities={activities} entries={heatmapEntries} />
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

        {/* Connected apps — renders only integrations the user has connected */}
        {(() => {
          const apps: { key: string; label: string; icon: React.ComponentProps<typeof Ionicons>['name']; connected: boolean }[] = [
            { key: 'strava', label: 'Strava', icon: 'bicycle-outline', connected: !!user?.strava_connected },
            { key: 'whoop', label: 'Whoop', icon: 'fitness-outline', connected: !!user?.whoop_connected },
            { key: 'oura', label: 'Oura', icon: 'ellipse-outline', connected: !!user?.oura_connected },
            { key: 'hevy', label: 'Hevy', icon: 'barbell-outline', connected: !!user?.hevy_connected },
          ];
          const connectedApps = apps.filter((a) => a.connected);
          if (connectedApps.length === 0) return null;
          return (
            <View style={s.aboutSection}>
              <Text style={s.aboutSectionLabel}>CONNECTED APPS</Text>
              <View style={s.aboutTagsWrap}>
                {connectedApps.map((app) => (
                  <View key={app.key} style={s.sportTag}>
                    <Ionicons name={app.icon} size={13} color={theme.text.secondary} />
                    <Text style={s.sportTagText}>{app.label}</Text>
                  </View>
                ))}
              </View>
            </View>
          );
        })()}
      </View>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
    <AmbientBackdrop />
    <ScrollView
      style={s.container}
      contentContainerStyle={s.contentContainer}
    >
      {/* 1. PROFILE HEADER — @username left, + and settings icons right */}
      <SafeAreaView edges={['top']}>
        <View style={s.topBar}>
          <TouchableOpacity style={s.usernamePill} activeOpacity={0.75}>
            <Text style={s.usernameHandle}>
              @{user?.username ?? (email.split('@')[0] || 'me')}
            </Text>
            <Ionicons name="chevron-down" size={14} color={theme.text.secondary} />
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              onPress={() => setShowCreateMenu(true)}
              style={s.topBarBtn}
              activeOpacity={0.75}
            >
              <Ionicons name="add" size={20} color={theme.text.body} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push('/settings')}
              style={s.topBarBtn}
              activeOpacity={0.75}
            >
              <Ionicons name="options-outline" size={18} color={theme.text.body} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Avatar + stats triplet — matches design layout */}
        <View style={s.headerRow2}>
          <TouchableOpacity onPress={handleAvatarPress} activeOpacity={0.8} style={{ position: 'relative' }}>
            <View style={s.avatarCircle}>
              {user?.avatar_url ? (
                <Image
                  source={{ uri: user.avatar_url }}
                  style={{ width: 76, height: 76, borderRadius: 38 }}
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
              backgroundColor: 'rgba(0,0,0,0.72)', borderRadius: 10,
              width: 20, height: 20, alignItems: 'center', justifyContent: 'center',
            }}>
              <Ionicons name="camera" size={11} color={T.text.primary} />
            </View>
          </TouchableOpacity>

          <View style={s.statsTripletRow}>
            {/* Posts — the training-adjacent headline stat, stays at full weight */}
            <View style={s.statsTripletItem}>
              <StatCountUp value={userPosts.length} style={s.statsTripletVal} />
              <Text style={s.statsTripletLabel}>posts</Text>
            </View>
            {/* Followers / Following — de-emphasized via muted tokens so the
                training stats remain the headline. Still tappable, still visible. */}
            <TouchableOpacity style={s.statsTripletItem} onPress={() => openSocialSheet('followers')} activeOpacity={0.7}>
              <StatCountUp value={user?.followers_count ?? 0} style={s.statsTripletValSoft} />
              <Text style={s.statsTripletLabelSoft}>followers</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.statsTripletItem} onPress={() => openSocialSheet('following')} activeOpacity={0.7}>
              <StatCountUp value={user?.following_count ?? 0} style={s.statsTripletValSoft} />
              <Text style={s.statsTripletLabelSoft}>following</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Display name + bio + location — left-aligned */}
        <View style={s.identityBlock}>
          <Text style={s.displayName}>{displayName}</Text>

          {user?.bio ? (
            <Text style={s.bioText} numberOfLines={3}>{user.bio}</Text>
          ) : (
            <TouchableOpacity onPress={() => router.push('/settings')} activeOpacity={0.7}>
              <Text style={s.bioPlaceholder}>Add a bio</Text>
            </TouchableOpacity>
          )}

          {user?.location ? (
            <View style={s.locationRow}>
              <Ionicons name="location" size={13} color={T.readiness.low} />
              <Text style={s.locationText}>{user.location}</Text>
            </View>
          ) : null}
        </View>

        {/* Sport tags — horizontal scrollable pills */}
        {(() => {
          const sports = user?.sports ?? user?.sport_tags ?? [];
          if (!sports || sports.length === 0) return null;
          return (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={s.sportTagsScroll}
              contentContainerStyle={[s.sportTagsContent, { paddingHorizontal: 0 }]}
            >
              {sports.map((sport) => (
                <View key={sport} style={s.sportTag}>
                  <Ionicons name={getSportIcon(sport)} size={13} color={theme.text.secondary} />
                  <Text style={s.sportTagText}>{sport}</Text>
                </View>
              ))}
            </ScrollView>
          );
        })()}

        {/* Action row — Edit profile / Customize / Share / follow-users icon */}
        <View style={s.profileActionRow}>
          <TouchableOpacity
            style={s.profileActionBtn}
            onPress={() => router.push('/settings')}
            activeOpacity={0.75}
          >
            <Text style={s.profileActionBtnText}>Edit profile</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.profileActionBtn}
            onPress={() => router.push('/profile/customize')}
            activeOpacity={0.75}
          >
            <Text style={s.profileActionBtnText}>Customize</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.profileActionBtn} onPress={handleShareProfile} activeOpacity={0.75}>
            <Text style={s.profileActionBtnText}>Share</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.profileActionIconBtn}
            onPress={() => router.push('/profile/find-friends')}
            activeOpacity={0.75}
          >
            <Ionicons name="person-add-outline" size={18} color={T.text.body} />
          </TouchableOpacity>
        </View>

        {/* Highlights row — circular bubbles, title + stat below. First is "New". */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, gap: 14, paddingVertical: 4 }}
          style={{ marginTop: 16, marginHorizontal: -20 }}
        >
          {/* New Highlight — always first */}
          <TouchableOpacity
            style={s.highlightItem}
            onPress={() => router.push('/profile/highlights/create')}
            activeOpacity={0.8}
          >
            <View style={[s.highlightCircle, s.highlightCircleNew]}>
              <Ionicons name="add" size={26} color={T.accent} />
            </View>
            <Text style={s.highlightCardNewLabel} numberOfLines={1}>New</Text>
          </TouchableOpacity>

          {/* Existing highlights */}
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
                style={s.highlightItem}
                onPress={() => router.push(`/profile/highlights/${h.id}`)}
                onLongPress={() => setHighlightActionMenu(h)}
                delayLongPress={260}
                activeOpacity={0.8}
              >
                <View style={s.highlightCircle}>
                  {h.cover_photo_url ? (
                    <Image
                      source={{ uri: h.cover_photo_url }}
                      style={{ width: '100%', height: '100%' }}
                      resizeMode="cover"
                    />
                  ) : (
                    <Ionicons name="sparkles-outline" size={24} color={T.text.muted} />
                  )}
                </View>
                <Text style={s.highlightCardTitle} numberOfLines={1}>{h.title}</Text>
                {statShow ? (
                  <Text style={s.highlightStatLabel} numberOfLines={1}>{statShow}</Text>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </SafeAreaView>

      {/* 2. TAB BAR — icon tabs matching design (grid / tag / bookmark) */}
      <View style={s.tabBar}>
        {([
          { key: 'posts' as const, icon: 'grid-outline' as const, iconActive: 'grid' as const },
          { key: 'achievements' as const, icon: 'pricetag-outline' as const, iconActive: 'pricetag' as const },
          { key: 'about' as const, icon: 'bookmark-outline' as const, iconActive: 'bookmark' as const },
        ]).map((tab) => {
          const active = profileTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={s.tabItem}
              onPress={() => setProfileTab(tab.key)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={active ? tab.iconActive : tab.icon}
                size={20}
                color={active ? T.text.primary : T.text.muted}
              />
              {active && <View style={s.tabUnderline} />}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* 3. TAB CONTENT */}
      <View style={s.tabContent}>
        {profileTab === 'posts' && renderPostsTab()}
        {profileTab === 'achievements' && renderAchievementsTab()}
        {profileTab === 'about' && renderAboutTab()}
      </View>

      <View style={s.bottomPadding} />
    </ScrollView>

    {/* ── Create Menu (+ button) ── */}
    <Modal
      visible={showCreateMenu}
      transparent
      animationType="fade"
      onRequestClose={() => setShowCreateMenu(false)}
    >
      <TouchableOpacity
        style={{ flex: 1, backgroundColor: T.glass.shade, justifyContent: 'flex-end' }}
        activeOpacity={1}
        onPress={() => setShowCreateMenu(false)}
      >
        <TouchableOpacity activeOpacity={1} onPress={() => {}}>
          <View style={{
            backgroundColor: T.glass.card,
            borderTopLeftRadius: R.lg,
            borderTopRightRadius: R.lg,
            paddingHorizontal: SP[5],
            paddingTop: SP[5],
            paddingBottom: insets.bottom + SP[5],
            gap: SP[2],
          }}>
            <View style={{ width: 40, height: 4, backgroundColor: T.border, borderRadius: 2, alignSelf: 'center', marginBottom: SP[3] }} />
            <TouchableOpacity
              onPress={() => {
                setShowCreateMenu(false);
                // Small delay so the close animation can finish before the next
                // modal opens — avoids a glitchy double-modal flash.
                setTimeout(() => setShowPostCreator(true), 250);
              }}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: SP[3],
                padding: SP[4], backgroundColor: T.bg.elevated, borderRadius: R.sm,
                borderWidth: 1, borderColor: T.border,
              }}
              activeOpacity={0.75}
            >
              <Ionicons name="image-outline" size={20} color={T.text.primary} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: TY.sans.semibold, fontSize: TY.size.body + 1, color: T.text.primary }}>New Post</Text>
                <Text style={{ fontFamily: TY.sans.regular, fontSize: TY.size.small, color: T.text.muted, marginTop: 2 }}>Share a photo, workout or insight</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={T.text.muted} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                setShowCreateMenu(false);
                router.push('/profile/highlights/create');
              }}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: SP[3],
                padding: SP[4], backgroundColor: T.bg.elevated, borderRadius: R.sm,
                borderWidth: 1, borderColor: T.border,
              }}
              activeOpacity={0.75}
            >
              <Ionicons name="sparkles-outline" size={20} color={T.accent} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: TY.sans.semibold, fontSize: TY.size.body + 1, color: T.text.primary }}>New Highlight</Text>
                <Text style={{ fontFamily: TY.sans.regular, fontSize: TY.size.small, color: T.text.muted, marginTop: 2 }}>Group stories into a themed reel</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={T.text.muted} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                setShowCreateMenu(false);
                setShowStoryCreator(true);
              }}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: SP[3],
                padding: SP[4], backgroundColor: T.bg.elevated, borderRadius: R.sm,
                borderWidth: 1, borderColor: T.border,
              }}
              activeOpacity={0.75}
            >
              <Ionicons name="camera-outline" size={20} color={T.text.primary} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: TY.sans.semibold, fontSize: TY.size.body + 1, color: T.text.primary }}>New Story</Text>
                <Text style={{ fontFamily: TY.sans.regular, fontSize: TY.size.small, color: T.text.muted, marginTop: 2 }}>A moment that disappears in 24h</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={T.text.muted} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setShowCreateMenu(false)}
              style={{ alignItems: 'center', paddingVertical: SP[3], marginTop: SP[2] }}
              activeOpacity={0.7}
            >
              <Text style={{ fontFamily: TY.sans.medium, fontSize: TY.size.body + 1, color: T.text.muted }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>

    {/* ── Story Creator (New Story) ── */}
    <StoryCreator
      visible={showStoryCreator}
      onClose={() => setShowStoryCreator(false)}
      onStoryCreated={() => setShowStoryCreator(false)}
    />

    {/* ── Post Creator (New Post) — same component community.tsx uses ── */}
    <PostCreator
      visible={showPostCreator}
      onClose={() => setShowPostCreator(false)}
      onPostCreated={() => { setShowPostCreator(false); loadUserPosts(); }}
    />

    {/* ── Highlight Action sheet (long-press on a highlight card) ── */}
    <Modal
      visible={highlightActionMenu !== null}
      transparent
      animationType="fade"
      onRequestClose={() => setHighlightActionMenu(null)}
    >
      <TouchableOpacity
        style={{ flex: 1, backgroundColor: T.glass.shade, justifyContent: 'flex-end' }}
        activeOpacity={1}
        onPress={() => setHighlightActionMenu(null)}
      >
        <TouchableOpacity activeOpacity={1} onPress={() => {}}>
          <View style={{
            backgroundColor: T.glass.card,
            borderTopLeftRadius: R.lg,
            borderTopRightRadius: R.lg,
            paddingHorizontal: SP[5],
            paddingTop: SP[5],
            paddingBottom: insets.bottom + SP[5],
            gap: SP[2],
          }}>
            <View style={{ width: 40, height: 4, backgroundColor: T.border, borderRadius: 2, alignSelf: 'center', marginBottom: SP[3] }} />

            <TouchableOpacity
              onPress={() => {
                setHighlightActionMenu(null);
                Alert.alert('Edit highlight', 'Editing existing highlights lands in the next release — for now, delete and create a new one.');
              }}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: SP[3],
                padding: SP[4], backgroundColor: T.bg.elevated, borderRadius: R.sm,
                borderWidth: 1, borderColor: T.border,
              }}
              activeOpacity={0.75}
            >
              <Ionicons name="pencil-outline" size={20} color={T.text.primary} />
              <Text style={{ flex: 1, fontFamily: TY.sans.semibold, fontSize: TY.size.body + 1, color: T.text.primary }}>
                Edit
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                setHighlightActionMenu(null);
                Alert.alert('Reorder highlights', 'Reorder support lands in the next release.');
              }}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: SP[3],
                padding: SP[4], backgroundColor: T.bg.elevated, borderRadius: R.sm,
                borderWidth: 1, borderColor: T.border,
              }}
              activeOpacity={0.75}
            >
              <Ionicons name="swap-vertical-outline" size={20} color={T.text.primary} />
              <Text style={{ flex: 1, fontFamily: TY.sans.semibold, fontSize: TY.size.body + 1, color: T.text.primary }}>
                Reorder
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                const h = highlightActionMenu;
                if (!h) return;
                setHighlightActionMenu(null);
                Alert.alert('Delete highlight', `Delete "${h.title}"? This cannot be undone.`, [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                      try {
                        await deleteHighlight(h.id);
                        setHighlights((prev) => prev.filter((x) => x.id !== h.id));
                      } catch {
                        Alert.alert('Error', 'Could not delete highlight.');
                      }
                    },
                  },
                ]);
              }}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: SP[3],
                padding: SP[4], backgroundColor: T.bg.elevated, borderRadius: R.sm,
                borderWidth: 1, borderColor: T.status.danger,
              }}
              activeOpacity={0.75}
            >
              <Ionicons name="trash-outline" size={20} color={T.status.danger} />
              <Text style={{ flex: 1, fontFamily: TY.sans.semibold, fontSize: TY.size.body + 1, color: T.status.danger }}>
                Delete
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setHighlightActionMenu(null)}
              style={{ alignItems: 'center', paddingVertical: SP[3], marginTop: SP[2] }}
              activeOpacity={0.7}
            >
              <Text style={{ fontFamily: TY.sans.medium, fontSize: TY.size.body + 1, color: T.text.muted }}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>

    {/* ── Badge Detail sheet ── */}
    <Modal
      visible={selectedBadge !== null}
      transparent
      animationType="fade"
      onRequestClose={() => setSelectedBadge(null)}
    >
      <TouchableOpacity
        style={{ flex: 1, backgroundColor: T.glass.shade, justifyContent: 'flex-end' }}
        activeOpacity={1}
        onPress={() => setSelectedBadge(null)}
      >
        <TouchableOpacity activeOpacity={1} onPress={() => {}}>
          {selectedBadge ? (() => {
            const earned = selectedBadge.earned(activities);
            return (
              <View style={{
                backgroundColor: T.glass.card,
                borderTopLeftRadius: R.lg,
                borderTopRightRadius: R.lg,
                paddingHorizontal: SP[6],
                paddingTop: SP[5],
                paddingBottom: insets.bottom + SP[6],
                alignItems: 'center',
                gap: SP[3],
              }}>
                <View style={{ width: 40, height: 4, backgroundColor: T.border, borderRadius: 2, marginBottom: SP[3] }} />
                <View style={{
                  width: 88, height: 88, borderRadius: R.pill,
                  backgroundColor: earned ? T.accentDim : T.bg.elevated,
                  borderWidth: 1, borderColor: earned ? T.accent : T.border,
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <Ionicons name={selectedBadge.icon} size={40} color={earned ? selectedBadge.color : T.text.muted} />
                </View>
                <Text style={{
                  fontFamily: TY.sans.bold,
                  fontSize: TY.size.h2,
                  color: T.text.primary,
                  textAlign: 'center',
                  letterSpacing: TY.tracking.tight,
                }}>
                  {selectedBadge.name}
                </Text>
                <Text style={{
                  fontFamily: TY.sans.regular,
                  fontSize: TY.size.body + 1,
                  color: T.text.body,
                  textAlign: 'center',
                  lineHeight: 22,
                }}>
                  {selectedBadge.subtitle}
                </Text>
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: SP[2],
                  backgroundColor: earned ? T.accentDim : T.bg.elevated,
                  borderWidth: 1, borderColor: earned ? T.accent : T.border,
                  borderRadius: R.pill,
                  paddingHorizontal: SP[4], paddingVertical: SP[2],
                  marginTop: SP[2],
                }}>
                  <Ionicons
                    name={earned ? 'checkmark-circle' : 'lock-closed'}
                    size={14}
                    color={earned ? T.accent : T.text.muted}
                  />
                  <Text style={{
                    fontFamily: TY.mono.semibold,
                    fontSize: TY.size.micro,
                    color: earned ? T.accent : T.text.muted,
                    letterSpacing: TY.tracking.label,
                    textTransform: 'uppercase',
                  }}>
                    {earned ? 'Earned' : 'Not yet earned'}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setSelectedBadge(null)}
                  style={{ paddingVertical: SP[3], marginTop: SP[2] }}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontFamily: TY.sans.medium, fontSize: TY.size.body + 1, color: T.text.muted }}>
                    Close
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })() : null}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>

    {/* ── Edit Caption modal (shared with PostDetailModal) ── */}
    <Modal
      visible={showEditCaption}
      transparent
      animationType="fade"
      onRequestClose={() => setShowEditCaption(false)}
    >
      <TouchableOpacity
        style={{ flex: 1, backgroundColor: T.glass.shade, justifyContent: 'center', padding: SP[6] }}
        activeOpacity={1}
        onPress={() => setShowEditCaption(false)}
      >
        <TouchableOpacity activeOpacity={1} onPress={() => {}}>
          <View style={{
            backgroundColor: T.bg.elevated,
            borderRadius: R.md,
            borderWidth: 1,
            borderColor: T.border,
            padding: SP[5],
            gap: SP[4],
          }}>
            <Text style={{ fontFamily: TY.sans.bold, fontSize: TY.size.h3, color: T.text.primary }}>
              Edit caption
            </Text>
            <TextInput
              value={editCaptionText}
              onChangeText={setEditCaptionText}
              multiline
              maxLength={2200}
              placeholder="Write a caption..."
              placeholderTextColor={T.text.muted}
              autoFocus
              style={{
                backgroundColor: T.bg.primary,
                borderRadius: R.sm,
                borderWidth: 1,
                borderColor: T.border,
                padding: SP[3],
                minHeight: 100,
                textAlignVertical: 'top',
                fontFamily: TY.sans.regular,
                fontSize: TY.size.body + 1,
                color: T.text.primary,
              }}
            />
            <View style={{ flexDirection: 'row', gap: SP[3] }}>
              <TouchableOpacity
                onPress={() => setShowEditCaption(false)}
                style={{
                  flex: 1, paddingVertical: SP[3] + 2, alignItems: 'center',
                  borderRadius: R.sm, borderWidth: 1, borderColor: T.border,
                }}
                activeOpacity={0.75}
              >
                <Text style={{ fontFamily: TY.sans.medium, fontSize: TY.size.body, color: T.text.muted }}>
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={async () => {
                  if (!selectedPost) { setShowEditCaption(false); return; }
                  try {
                    await editPostCaption(selectedPost.id, editCaptionText);
                    setUserPosts((prev) => prev.map((x) =>
                      x.id === selectedPost.id ? { ...x, caption: editCaptionText } : x,
                    ));
                    setShowEditCaption(false);
                  } catch {
                    Alert.alert('Error', 'Could not save caption.');
                  }
                }}
                style={{
                  flex: 1, paddingVertical: SP[3] + 2, alignItems: 'center',
                  borderRadius: R.sm, backgroundColor: T.accent,
                }}
                activeOpacity={0.85}
              >
                <Text style={{ fontFamily: TY.sans.bold, fontSize: TY.size.body, color: T.accentInk }}>
                  Save
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>

    {/* ── Post Action Menu (long-press on own post) ── */}
    <Modal
      visible={postActionMenu !== null}
      transparent
      animationType="fade"
      onRequestClose={() => setPostActionMenu(null)}
    >
      <TouchableOpacity
        style={{ flex: 1, backgroundColor: T.glass.shade, justifyContent: 'flex-end' }}
        activeOpacity={1}
        onPress={() => setPostActionMenu(null)}
      >
        <TouchableOpacity activeOpacity={1} onPress={() => {}}>
          <View style={{
            backgroundColor: T.glass.card,
            borderTopLeftRadius: R.lg,
            borderTopRightRadius: R.lg,
            paddingHorizontal: SP[5],
            paddingTop: SP[5],
            paddingBottom: insets.bottom + SP[5],
            gap: SP[2],
          }}>
            <View style={{ width: 40, height: 4, backgroundColor: T.border, borderRadius: 2, alignSelf: 'center', marginBottom: SP[3] }} />

            {/* Pin / Unpin */}
            <TouchableOpacity
              onPress={async () => {
                const p = postActionMenu;
                if (!p) return;
                setPostActionMenu(null);
                const wasPinned = !!p.is_pinned;
                try {
                  await patchPost(p.id, { is_pinned: !wasPinned });
                  setUserPosts((prev) => prev.map((x) =>
                    x.id === p.id ? { ...x, is_pinned: !wasPinned } : x,
                  ));
                } catch {
                  Alert.alert('Error', 'Could not update post.');
                }
              }}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: SP[3],
                padding: SP[4], backgroundColor: T.bg.elevated, borderRadius: R.sm,
                borderWidth: 1, borderColor: T.border,
              }}
              activeOpacity={0.75}
            >
              <Ionicons name={postActionMenu?.is_pinned ? 'pin' : 'pin-outline'} size={20} color={T.text.primary} />
              <Text style={{ flex: 1, fontFamily: TY.sans.semibold, fontSize: TY.size.body + 1, color: T.text.primary }}>
                {postActionMenu?.is_pinned ? 'Unpin from profile' : 'Pin to profile'}
              </Text>
            </TouchableOpacity>

            {/* Edit caption */}
            <TouchableOpacity
              onPress={() => {
                const p = postActionMenu;
                if (!p) return;
                setPostActionMenu(null);
                setSelectedPost(p);
                setEditCaptionText(p.caption || '');
                setShowEditCaption(true);
              }}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: SP[3],
                padding: SP[4], backgroundColor: T.bg.elevated, borderRadius: R.sm,
                borderWidth: 1, borderColor: T.border,
              }}
              activeOpacity={0.75}
            >
              <Ionicons name="pencil-outline" size={20} color={T.text.primary} />
              <Text style={{ flex: 1, fontFamily: TY.sans.semibold, fontSize: TY.size.body + 1, color: T.text.primary }}>
                Edit caption
              </Text>
            </TouchableOpacity>

            {/* Share */}
            <TouchableOpacity
              onPress={async () => {
                const p = postActionMenu;
                if (!p) return;
                setPostActionMenu(null);
                try {
                  await Share.share({ message: `Check out this post on ORYX — https://oryx.app/p/${p.id}` });
                } catch {
                  // cancelled
                }
              }}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: SP[3],
                padding: SP[4], backgroundColor: T.bg.elevated, borderRadius: R.sm,
                borderWidth: 1, borderColor: T.border,
              }}
              activeOpacity={0.75}
            >
              <Ionicons name="share-outline" size={20} color={T.text.primary} />
              <Text style={{ flex: 1, fontFamily: TY.sans.semibold, fontSize: TY.size.body + 1, color: T.text.primary }}>
                Share
              </Text>
            </TouchableOpacity>

            {/* Archive */}
            <TouchableOpacity
              onPress={async () => {
                const p = postActionMenu;
                if (!p) return;
                setPostActionMenu(null);
                try {
                  await patchPost(p.id, { is_archived: true });
                  setUserPosts((prev) => prev.filter((x) => x.id !== p.id));
                } catch {
                  Alert.alert('Error', 'Could not archive post.');
                }
              }}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: SP[3],
                padding: SP[4], backgroundColor: T.bg.elevated, borderRadius: R.sm,
                borderWidth: 1, borderColor: T.border,
              }}
              activeOpacity={0.75}
            >
              <Ionicons name="archive-outline" size={20} color={T.text.primary} />
              <Text style={{ flex: 1, fontFamily: TY.sans.semibold, fontSize: TY.size.body + 1, color: T.text.primary }}>
                Archive
              </Text>
            </TouchableOpacity>

            {/* Delete (destructive) */}
            <TouchableOpacity
              onPress={() => {
                const p = postActionMenu;
                if (!p) return;
                setPostActionMenu(null);
                Alert.alert('Delete post', 'This cannot be undone.', [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                      try {
                        await deletePost(p.id);
                        setUserPosts((prev) => prev.filter((x) => x.id !== p.id));
                      } catch {
                        Alert.alert('Error', 'Could not delete post.');
                      }
                    },
                  },
                ]);
              }}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: SP[3],
                padding: SP[4], backgroundColor: T.bg.elevated, borderRadius: R.sm,
                borderWidth: 1, borderColor: T.status.danger,
              }}
              activeOpacity={0.75}
            >
              <Ionicons name="trash-outline" size={20} color={T.status.danger} />
              <Text style={{ flex: 1, fontFamily: TY.sans.semibold, fontSize: TY.size.body + 1, color: T.status.danger }}>
                Delete post
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setPostActionMenu(null)}
              style={{ alignItems: 'center', paddingVertical: SP[3], marginTop: SP[2] }}
              activeOpacity={0.7}
            >
              <Text style={{ fontFamily: TY.sans.medium, fontSize: TY.size.body + 1, color: T.text.muted }}>
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
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
      <View style={{ flex: 1, backgroundColor: T.bg.primary }}>
        <SafeAreaView edges={['top']} style={{ flex: 1 }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: T.glass.border }}>
            <TouchableOpacity onPress={() => { setShowPostDetail(false); setSelectedPost(null); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="arrow-back" size={24} color="#F0F2F6" />
            </TouchableOpacity>
            <Text style={{ flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: T.text.primary }}>Post</Text>
            <TouchableOpacity
              onPress={() => selectedPost && setShowMenuForPost(selectedPost.id)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="ellipsis-horizontal" size={22} color="#8B95A8" />
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
              <View style={{ backgroundColor: 'rgba(28,34,46,0.72)', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: T.glass.border }}>
                <Text style={{ fontSize: 12, color: T.text.secondary }}>{selectedPost.oryx_data_card_json.post_type?.toUpperCase() || 'ORYX CARD'}</Text>
              </View>
            )}
            {selectedPost?.caption && (
              <Text style={{ fontSize: 14, color: T.text.primary, lineHeight: 20 }}>{selectedPost.caption}</Text>
            )}
            {selectedPost?.time_ago && (
              <Text style={{ fontSize: 11, color: T.text.muted }}>{selectedPost.time_ago}</Text>
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
          <View style={{ backgroundColor: 'rgba(28,34,46,0.72)', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 10, paddingBottom: insets.bottom + 20 }}>
            <TouchableOpacity
              onPress={() => {
                setShowMenuForPost(null);
                setEditCaptionText(selectedPost?.caption || '');
                setShowEditCaption(true);
              }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: T.glass.border, borderRadius: 12 }}
            >
              <Ionicons name="pencil-outline" size={18} color="#F0F2F6" />
              <Text style={{ fontSize: 15, color: T.text.primary }}>Edit Caption</Text>
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
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: T.glass.border, borderRadius: 12 }}
            >
              <Ionicons name="trash-outline" size={18} color="#FF6B4A" />
              <Text style={{ fontSize: 15, color: T.status.danger }}>Delete Post</Text>
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
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: T.glass.border, borderRadius: 12 }}
              >
                <Ionicons name="share-outline" size={18} color="#F0F2F6" />
                <Text style={{ fontSize: 15, color: T.text.primary }}>Share as Story</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => setShowMenuForPost(null)}
              style={{ padding: 14, alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: T.glass.border }}
            >
              <Text style={{ fontSize: 15, color: T.text.secondary }}>Cancel</Text>
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
          <View style={{ backgroundColor: 'rgba(28,34,46,0.72)', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, gap: 12, paddingBottom: insets.bottom + 20 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: T.text.primary }}>Edit Caption</Text>
            <TextInput
              style={{ backgroundColor: T.glass.border, borderRadius: 12, padding: 12, color: T.text.primary, fontSize: 14, minHeight: 80 }}
              value={editCaptionText}
              onChangeText={setEditCaptionText}
              multiline
              autoFocus
              placeholderTextColor="#525E72"
              placeholder="Caption..."
            />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <TouchableOpacity
                onPress={() => setShowEditCaption(false)}
                style={{ flex: 1, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: T.glass.border, alignItems: 'center' }}
              >
                <Text style={{ color: T.text.secondary, fontWeight: '600' }}>Cancel</Text>
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
                style={{ flex: 1, padding: 14, borderRadius: 12, backgroundColor: T.text.primary, alignItems: 'center' }}
              >
                <Text style={{ color: T.accentInk, fontWeight: '700' }}>Save</Text>
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
      backgroundColor: 'transparent',
    },
    contentContainer: {
      paddingHorizontal: 20,
      paddingBottom: 120,
    },

    // Top bar — @username pill left, icon buttons right
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingTop: 8,
      paddingBottom: 16,
      gap: 8,
    },
    usernamePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    usernameHandle: {
      fontSize: 18,
      color: t.text.primary,
      fontFamily: TY.sans.medium,
      letterSpacing: -0.3,
    },
    topBarBtn: {
      width: 36, height: 36, borderRadius: R.md,
      backgroundColor: t.glass.pill,
      borderWidth: 1, borderColor: t.glass.border,
      alignItems: 'center', justifyContent: 'center',
    },
    settingsIconBtn: {
      padding: 6,
    },

    // Avatar + 3-stat row
    headerRow2: {
      flexDirection: 'row', alignItems: 'center', gap: 20,
      paddingBottom: 16,
    },
    avatarCircle: {
      width: 76, height: 76, borderRadius: 38,
      backgroundColor: t.glass.cardHi,
      borderWidth: 1, borderColor: t.glass.border,
      alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden',
    },
    avatarText: {
      fontSize: 26, color: t.text.primary,
      fontFamily: TY.sans.semibold, letterSpacing: 0.5,
    },
    statsTripletRow: {
      flex: 1, flexDirection: 'row', justifyContent: 'space-around',
    },
    statsTripletItem: {
      alignItems: 'center', gap: 2,
    },
    statsTripletVal: {
      fontSize: 20, color: t.text.primary,
      fontFamily: TY.sans.semibold, letterSpacing: -0.3, ...TY.tabular,
    },
    statsTripletLabel: {
      fontSize: 12, color: t.text.secondary,
      fontFamily: TY.sans.regular,
    },
    // De-emphasized variants for social stats (followers/following) — signals
    // that training stats are the headline and social context is secondary.
    statsTripletValSoft: {
      fontSize: 20, color: t.text.muted,
      fontFamily: TY.sans.semibold, letterSpacing: -0.3, ...TY.tabular,
    },
    statsTripletLabelSoft: {
      fontSize: 12, color: t.text.muted,
      fontFamily: TY.sans.regular,
    },

    // Identity block
    identityBlock: {
      gap: 4, marginBottom: 14,
    },
    displayName: {
      fontSize: 19, color: t.text.primary,
      fontFamily: TY.sans.semibold, letterSpacing: -0.3,
    },
    bioText: {
      fontSize: 13, color: t.text.body,
      fontFamily: TY.sans.regular, lineHeight: 18,
    },
    bioPlaceholder: {
      fontSize: 13, color: t.text.muted,
      fontFamily: TY.sans.regular, fontStyle: 'italic',
    },
    usernameText: {
      fontSize: 13, color: t.text.muted,
      fontFamily: TY.sans.regular,
    },

    // Highlights — circular bubbles with title + stat caption below
    highlightItem: {
      width: 78,
      alignItems: 'center',
      gap: 6,
    },
    highlightCircle: {
      width: 64,
      height: 64,
      borderRadius: R.pill,
      backgroundColor: t.glass.cardLo,
      borderWidth: 1.5,
      borderColor: t.glass.border,
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
    },
    highlightCircleNew: {
      borderStyle: 'dashed',
      borderColor: t.accent,
      borderWidth: 1.5,
    },
    highlightCardTitle: {
      fontSize: 11,
      color: t.text.primary,
      fontFamily: TY.sans.semibold,
      letterSpacing: -0.1,
      textAlign: 'center',
    },
    highlightCardNewLabel: {
      fontSize: 11,
      color: t.accent,
      fontFamily: TY.sans.semibold,
      textAlign: 'center',
    },
    highlightStatLabel: {
      fontSize: 9,
      color: t.accent,
      fontFamily: TY.mono.bold,
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      textAlign: 'center',
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
      backgroundColor: t.glass.pill,
      borderWidth: 1,
      borderColor: t.glass.border,
      borderRadius: R.pill,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    sportTagAdd: {
      borderStyle: 'dashed',
    },
    sportTagText: {
      fontSize: 13,
      color: t.text.secondary,
      fontFamily: TY.sans.regular,
    },
    locationRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: 2,
    },
    locationText: {
      fontSize: 13,
      color: t.text.body,
      fontFamily: TY.sans.regular,
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
      gap: 8,
      marginTop: 4,
    },
    profileActionBtn: {
      flex: 1,
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: R.sm,
      borderWidth: 1,
      borderColor: t.glass.border,
      backgroundColor: t.glass.pill,
      alignItems: 'center',
    },
    profileActionBtnText: {
      fontSize: 13,
      color: t.text.primary,
      fontFamily: TY.sans.semibold, letterSpacing: -0.2,
    },
    profileActionIconBtn: {
      width: 38, height: 38, borderRadius: R.sm,
      backgroundColor: t.glass.pill,
      borderWidth: 1, borderColor: t.glass.border,
      alignItems: 'center', justifyContent: 'center',
    },

    // Tab bar — icon tabs
    tabBar: {
      flexDirection: 'row',
      borderBottomWidth: 1,
      borderBottomColor: t.glass.border,
      marginBottom: 16,
      marginTop: 20,
    },
    tabItem: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 14,
      position: 'relative',
    },
    tabLabel: {
      fontSize: 14, color: t.text.muted,
      fontFamily: TY.sans.semibold,
    },
    tabLabelActive: {
      color: t.text.primary,
    },
    tabUnderline: {
      position: 'absolute',
      bottom: -1,
      left: '20%',
      right: '20%',
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
      backgroundColor: t.glass.card,
      borderRadius: R.lg,
      borderWidth: 1,
      borderColor: t.glass.border,
      padding: SP[4],
      gap: 6,
    },
    pbCardLabel: {
      fontSize: 10, color: t.text.secondary,
      fontFamily: TY.mono.medium, letterSpacing: 1.4, textTransform: 'uppercase',
    },
    pbCardValue: {
      fontSize: 22, color: t.text.primary,
      fontFamily: TY.sans.semibold, letterSpacing: -0.3, ...TY.tabular,
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
      backgroundColor: t.glass.card,
      borderWidth: 1,
      borderColor: t.glass.border,
      borderRadius: R.md,
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
      color: t.text.primary,
      textAlign: 'center',
      fontFamily: TY.sans.semibold, letterSpacing: -0.1,
    },
    badgeNameLocked: {
      color: t.text.muted,
    },
    badgeSubtitle: {
      fontSize: 10,
      color: t.text.secondary,
      textAlign: 'center',
      fontFamily: TY.mono.medium, letterSpacing: 0.6,
    },

    card: {
      backgroundColor: t.glass.card,
      borderRadius: R.lg,
      padding: SP[4],
      borderWidth: 1,
      borderColor: t.glass.border,
      marginBottom: 12,
    },

    sectionLabel: {
      fontSize: 11, color: t.text.secondary,
      textTransform: 'uppercase',
      letterSpacing: 1.8,
      marginBottom: 12,
      marginTop: 4,
      fontFamily: TY.mono.medium,
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
      fontFamily: TY.sans.regular,
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
      fontFamily: TY.sans.regular,
    },
    aboutDetailValue: {
      fontSize: 14,
      color: t.text.primary,
      fontFamily: TY.sans.medium, letterSpacing: -0.1,
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
      // Concrete height so the inner ScrollView's flex:1 has something to
      // expand into — previously maxHeight-only caused the sheet to collapse
      // to just the header when the list was small/empty.
      height: '80%',
      backgroundColor: t.bg.primary,
      borderTopLeftRadius: R.xl,
      borderTopRightRadius: R.xl,
      borderTopWidth: 1,
      borderColor: t.glass.border,
      paddingHorizontal: 20,
      paddingBottom: 0,
    },
    sheetHandle: {
      width: 36, height: 4, borderRadius: 2,
      backgroundColor: t.glass.border,
      alignSelf: 'center', marginTop: 12, marginBottom: 4,
    },
    sheetHeader: {
      flexDirection: 'row', alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 16,
      borderBottomWidth: 1, borderBottomColor: t.glass.border,
    },
    sheetTitle: {
      fontSize: 17, color: t.text.primary,
      fontFamily: TY.sans.semibold, letterSpacing: -0.3,
    },
    sheetEmpty: {
      flex: 1, paddingVertical: 48, alignItems: 'center', justifyContent: 'center',
    },
    sheetEmptyText: {
      fontSize: 14, color: t.text.muted,
      fontFamily: TY.sans.regular,
    },
    sheetRow: {
      flexDirection: 'row', alignItems: 'center',
      paddingVertical: 12, gap: 12,
      borderBottomWidth: 1, borderBottomColor: t.glass.border,
    },
    sheetAvatar: {
      width: 44, height: 44, borderRadius: 22,
      backgroundColor: t.glass.cardHi,
      borderWidth: 1, borderColor: t.glass.border,
      alignItems: 'center', justifyContent: 'center',
    },
    sheetAvatarText: {
      fontSize: 15, color: t.text.primary,
      fontFamily: TY.sans.semibold, letterSpacing: 0.3,
    },
    sheetRowInfo: {
      flex: 1, gap: 2,
    },
    sheetRowName: {
      fontSize: 14, color: t.text.primary,
      fontFamily: TY.sans.semibold, letterSpacing: -0.1,
    },
    sheetRowTags: {
      fontSize: 11, color: t.text.muted,
      fontFamily: TY.mono.regular, letterSpacing: 0.3,
    },
    sheetFollowBtn: {
      paddingHorizontal: 14, paddingVertical: 7,
      borderRadius: R.pill, borderWidth: 1, borderColor: t.accent,
      backgroundColor: t.accent,
    },
    sheetFollowBtnActive: {
      backgroundColor: t.glass.pill, borderColor: t.glass.border,
    },
    sheetFollowBtnText: {
      fontSize: 13, color: t.accentInk,
      fontFamily: TY.sans.semibold, letterSpacing: -0.1,
    },
    sheetFollowBtnTextActive: {
      color: t.text.body,
    },
  });
}
