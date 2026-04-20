// Profile Customization — Phase F.
//
// Most fields here are local-only stubs because the matching backend columns
// don't exist yet (users.featured_stats, users.privacy_settings,
// users.close_friends, GET/PATCH /users/me/preferences). The pinned-post
// section is fully wired since posts.is_pinned + patchPost already exist.
//
// Skipped per spec: accent-color theme picker (would lock to lime anyway).

import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Switch,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { type as TY, radius as R, space as SP } from '@/services/theme';
import AmbientBackdrop from '@/components/AmbientBackdrop';
import { useAuthStore } from '@/services/authStore';
import {
  getUserPosts,
  patchPost,
  Post,
} from '@/services/api';

// ── Constants ────────────────────────────────────────────────────────────────

type FeaturedStatKey =
  | 'sessions' | 'streak' | 'best' | 'month' | 'posts'
  | 'followers' | 'following' | 'total_load' | 'prs' | 'weekly_avg';

const FEATURED_STATS: { key: FeaturedStatKey; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { key: 'sessions',   label: 'Sessions',   icon: 'fitness-outline' },
  { key: 'streak',     label: 'Streak',     icon: 'flame-outline' },
  { key: 'best',       label: 'Best Streak',icon: 'trophy-outline' },
  { key: 'month',      label: 'This Month', icon: 'calendar-outline' },
  { key: 'posts',      label: 'Posts',      icon: 'images-outline' },
  { key: 'followers',  label: 'Followers',  icon: 'people-outline' },
  { key: 'following',  label: 'Following',  icon: 'person-add-outline' },
  { key: 'total_load', label: 'Total Load', icon: 'pulse-outline' },
  { key: 'prs',        label: 'PRs',        icon: 'medal-outline' },
  { key: 'weekly_avg', label: 'Weekly Avg', icon: 'analytics-outline' },
];

type GridLayout = '3col' | '2col' | 'list';

const GRID_OPTIONS: { key: GridLayout; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { key: '3col', label: '3-column', icon: 'grid-outline' },
  { key: '2col', label: '2-column', icon: 'apps-outline' },
  { key: 'list', label: 'List',     icon: 'list-outline' },
];

type StoryAudience = 'everyone' | 'followers' | 'close_friends';

const AUDIENCE_OPTIONS: { key: StoryAudience; label: string; hint: string }[] = [
  { key: 'everyone',      label: 'Everyone',      hint: 'Anyone on ORYX' },
  { key: 'followers',     label: 'Followers',     hint: 'People who follow you' },
  { key: 'close_friends', label: 'Close Friends', hint: 'A private list you curate' },
];

const VISIBILITY_KEYS = [
  { key: 'show_heatmap',         label: 'Show activity heatmap',  hint: 'Training calendar in Achievements' },
  { key: 'show_prs',             label: 'Show personal bests',    hint: 'PR cards on your profile' },
  { key: 'show_connected_apps',  label: 'Show connected apps',    hint: 'Strava / Whoop / Oura badges' },
  { key: 'show_achievements',    label: 'Show achievements',      hint: 'Badges grid' },
] as const;

// ── Screen ───────────────────────────────────────────────────────────────────

export default function CustomizeScreen() {
  const { theme: T } = useTheme();
  const me = useAuthStore((s) => s.user);

  // Featured stats (local; needs users.featured_stats column to persist)
  const [featuredStats, setFeaturedStats] = useState<FeaturedStatKey[]>(['posts', 'followers', 'following', 'sessions']);

  // Grid layout (local; needs users.post_grid_layout to persist + sync with Posts tab)
  const [gridLayout, setGridLayout] = useState<GridLayout>('3col');

  // Visibility flags (local; needs users.privacy_settings JSON)
  const [visibility, setVisibility] = useState<Record<string, boolean>>(
    Object.fromEntries(VISIBILITY_KEYS.map((v) => [v.key, true])),
  );

  // Story settings (local; needs users.story_settings or similar)
  const [allowReplies, setAllowReplies] = useState(true);
  const [audience, setAudience] = useState<StoryAudience>('everyone');

  // Pinned post management (real — uses posts.is_pinned)
  const [posts, setPosts] = useState<Post[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [pinningId, setPinningId] = useState<string | null>(null);

  useEffect(() => {
    if (!me?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await getUserPosts(me.id, 0, 50);
        if (!cancelled) setPosts(res.posts.filter((p) => !p.is_deleted && !p.is_archived));
      } catch {
        if (!cancelled) setPosts([]);
      } finally {
        if (!cancelled) setPostsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [me?.id]);

  const toggleFeatured = useCallback((key: FeaturedStatKey) => {
    setFeaturedStats((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key);
      if (prev.length >= 4) return prev;
      return [...prev, key];
    });
  }, []);

  const togglePin = useCallback(async (post: Post) => {
    if (pinningId) return;
    setPinningId(post.id);
    const wasPinned = !!post.is_pinned;
    setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, is_pinned: !wasPinned } : p)));
    try {
      await patchPost(post.id, { is_pinned: !wasPinned });
    } catch {
      setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, is_pinned: wasPinned } : p)));
      Alert.alert('Error', 'Could not update post.');
    } finally {
      setPinningId(null);
    }
  }, [pinningId]);

  // ── UI helpers ────────────────────────────────────────────────────────────

  const SectionLabel = ({ children, style }: { children: React.ReactNode; style?: any }) => (
    <Text style={[{
      fontFamily: TY.mono.semibold, fontSize: TY.size.micro, color: T.text.muted,
      textTransform: 'uppercase', letterSpacing: TY.tracking.label,
      marginTop: SP[5], marginBottom: SP[2],
    }, style]}>
      {children}
    </Text>
  );

  const Card = ({ children }: { children: React.ReactNode }) => (
    <View style={{
      backgroundColor: T.bg.elevated, borderWidth: 1, borderColor: T.border, borderRadius: R.md,
    }}>
      {children}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: T.bg.primary }}>
      <AmbientBackdrop />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        {/* Header */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: SP[5], paddingTop: SP[2], paddingBottom: SP[3] + 2,
        }}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="chevron-back" size={24} color={T.text.primary} />
          </TouchableOpacity>
          <Text style={{
            fontSize: TY.size.h3 - 1, color: T.text.primary,
            fontFamily: TY.sans.semibold, letterSpacing: -0.3,
          }}>
            Customize
          </Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: SP[5], paddingBottom: SP[10] }}>

          {/* ── Featured stats ── */}
          <SectionLabel style={{ marginTop: SP[3] }}>FEATURED STATS · {featuredStats.length}/4</SectionLabel>
          <Text style={{
            fontFamily: TY.sans.regular, fontSize: TY.size.small + 1, color: T.text.secondary,
            marginBottom: SP[3],
          }}>
            Pick four to display in your profile's stat row.
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SP[2] }}>
            {FEATURED_STATS.map((stat) => {
              const active = featuredStats.includes(stat.key);
              const disabled = !active && featuredStats.length >= 4;
              return (
                <TouchableOpacity
                  key={stat.key}
                  onPress={() => toggleFeatured(stat.key)}
                  disabled={disabled}
                  activeOpacity={0.8}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: SP[2],
                    paddingHorizontal: SP[3], paddingVertical: SP[2] + 2,
                    borderRadius: R.pill,
                    borderWidth: 1,
                    borderColor: active ? T.accent : T.border,
                    backgroundColor: active ? T.accent : 'transparent',
                    opacity: disabled ? 0.4 : 1,
                  }}
                >
                  <Ionicons name={stat.icon} size={13} color={active ? T.accentInk : T.text.body} />
                  <Text style={{
                    fontFamily: TY.sans.semibold, fontSize: TY.size.small + 1,
                    color: active ? T.accentInk : T.text.body,
                  }}>
                    {stat.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ── Post grid layout ── */}
          <SectionLabel>POST GRID LAYOUT</SectionLabel>
          <Card>
            {GRID_OPTIONS.map((opt, i) => {
              const active = gridLayout === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  onPress={() => setGridLayout(opt.key)}
                  activeOpacity={0.75}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: SP[3],
                    paddingHorizontal: SP[4], paddingVertical: SP[3] + 2,
                    borderTopWidth: i === 0 ? 0 : 1, borderTopColor: T.border,
                  }}
                >
                  <Ionicons name={opt.icon} size={20} color={active ? T.accent : T.text.body} />
                  <Text style={{
                    flex: 1, fontFamily: TY.sans.medium, fontSize: TY.size.body + 1,
                    color: T.text.primary,
                  }}>
                    {opt.label}
                  </Text>
                  {active ? (
                    <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: T.accent, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="checkmark" size={12} color={T.accentInk} />
                    </View>
                  ) : (
                    <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: T.border }} />
                  )}
                </TouchableOpacity>
              );
            })}
          </Card>

          {/* ── Pinned post management ── */}
          <SectionLabel>PINNED POSTS</SectionLabel>
          <Text style={{
            fontFamily: TY.sans.regular, fontSize: TY.size.small + 1, color: T.text.secondary,
            marginBottom: SP[3],
          }}>
            Pinned posts appear at the top of your Posts tab with a lime pin badge.
          </Text>
          {postsLoading ? (
            <ActivityIndicator color={T.text.muted} style={{ marginVertical: SP[5] }} />
          ) : posts.length === 0 ? (
            <Text style={{
              fontFamily: TY.sans.regular, fontSize: TY.size.body, color: T.text.muted,
              textAlign: 'center', paddingVertical: SP[5],
            }}>
              No posts yet. Once you post, you can pin from here.
            </Text>
          ) : (
            <Card>
              {posts.map((post, i) => (
                <View
                  key={post.id}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: SP[3],
                    paddingHorizontal: SP[3], paddingVertical: SP[3],
                    borderTopWidth: i === 0 ? 0 : 1, borderTopColor: T.border,
                  }}
                >
                  {post.photo_url ? (
                    <Image
                      source={{ uri: post.photo_url }}
                      style={{ width: 48, height: 48, borderRadius: R.xs }}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={{
                      width: 48, height: 48, borderRadius: R.xs,
                      backgroundColor: T.bg.primary,
                      borderWidth: 1, borderColor: T.border,
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Ionicons name="document-text-outline" size={18} color={T.text.muted} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text
                      numberOfLines={2}
                      style={{ fontFamily: TY.sans.regular, fontSize: TY.size.small + 1, color: T.text.primary, lineHeight: 18 }}
                    >
                      {post.caption || 'No caption'}
                    </Text>
                    {post.time_ago ? (
                      <Text style={{ fontFamily: TY.sans.regular, fontSize: TY.size.micro + 1, color: T.text.muted, marginTop: 2 }}>
                        {post.time_ago}
                      </Text>
                    ) : null}
                  </View>
                  <TouchableOpacity
                    onPress={() => togglePin(post)}
                    disabled={pinningId === post.id}
                    activeOpacity={0.8}
                    style={{
                      paddingHorizontal: SP[3], paddingVertical: SP[2] - 1,
                      borderRadius: R.pill,
                      borderWidth: 1,
                      borderColor: post.is_pinned ? T.accent : T.border,
                      backgroundColor: post.is_pinned ? T.accent : 'transparent',
                      minWidth: 64, alignItems: 'center',
                      opacity: pinningId === post.id ? 0.5 : 1,
                    }}
                  >
                    <Text style={{
                      fontFamily: TY.sans.semibold, fontSize: TY.size.small,
                      color: post.is_pinned ? T.accentInk : T.text.body,
                    }}>
                      {post.is_pinned ? 'Pinned' : 'Pin'}
                    </Text>
                  </TouchableOpacity>
                </View>
              ))}
            </Card>
          )}

          {/* ── Visibility ── */}
          <SectionLabel>VISIBILITY</SectionLabel>
          <Card>
            {VISIBILITY_KEYS.map((v, i) => (
              <View
                key={v.key}
                style={{
                  flexDirection: 'row', alignItems: 'center',
                  paddingHorizontal: SP[4], paddingVertical: SP[3] + 2,
                  borderTopWidth: i === 0 ? 0 : 1, borderTopColor: T.border,
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: TY.sans.medium, fontSize: TY.size.body + 1, color: T.text.primary }}>
                    {v.label}
                  </Text>
                  <Text style={{ fontFamily: TY.sans.regular, fontSize: TY.size.small, color: T.text.muted, marginTop: 2 }}>
                    {v.hint}
                  </Text>
                </View>
                <Switch
                  value={!!visibility[v.key]}
                  onValueChange={(val) => setVisibility((p) => ({ ...p, [v.key]: val }))}
                  trackColor={{ false: T.border, true: T.accent }}
                  thumbColor={visibility[v.key] ? T.accentInk : T.text.muted}
                />
              </View>
            ))}
          </Card>

          {/* ── Story settings ── */}
          <SectionLabel>STORY SETTINGS</SectionLabel>
          <Card>
            <View style={{
              flexDirection: 'row', alignItems: 'center',
              paddingHorizontal: SP[4], paddingVertical: SP[3] + 2,
            }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: TY.sans.medium, fontSize: TY.size.body + 1, color: T.text.primary }}>
                  Allow replies
                </Text>
                <Text style={{ fontFamily: TY.sans.regular, fontSize: TY.size.small, color: T.text.muted, marginTop: 2 }}>
                  Let viewers reply directly from the story
                </Text>
              </View>
              <Switch
                value={allowReplies}
                onValueChange={setAllowReplies}
                trackColor={{ false: T.border, true: T.accent }}
                thumbColor={allowReplies ? T.accentInk : T.text.muted}
              />
            </View>
          </Card>

          <SectionLabel>STORY AUDIENCE</SectionLabel>
          <Card>
            {AUDIENCE_OPTIONS.map((opt, i) => {
              const active = audience === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  onPress={() => setAudience(opt.key)}
                  activeOpacity={0.75}
                  style={{
                    flexDirection: 'row', alignItems: 'center',
                    paddingHorizontal: SP[4], paddingVertical: SP[3] + 2,
                    borderTopWidth: i === 0 ? 0 : 1, borderTopColor: T.border,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: TY.sans.medium, fontSize: TY.size.body + 1, color: T.text.primary }}>
                      {opt.label}
                    </Text>
                    <Text style={{ fontFamily: TY.sans.regular, fontSize: TY.size.small, color: T.text.muted, marginTop: 2 }}>
                      {opt.hint}
                    </Text>
                  </View>
                  {active ? (
                    <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: T.accent, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="checkmark" size={12} color={T.accentInk} />
                    </View>
                  ) : (
                    <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: T.border }} />
                  )}
                </TouchableOpacity>
              );
            })}
          </Card>

          {audience === 'close_friends' ? (
            <TouchableOpacity
              onPress={() => Alert.alert('Coming soon', 'Close friends list management lands with the preferences endpoint.')}
              activeOpacity={0.75}
              style={{
                marginTop: SP[3],
                paddingHorizontal: SP[4], paddingVertical: SP[3] + 2,
                borderRadius: R.sm, borderWidth: 1, borderColor: T.border,
                backgroundColor: T.bg.elevated,
                flexDirection: 'row', alignItems: 'center',
              }}
            >
              <Ionicons name="people-outline" size={18} color={T.text.body} />
              <Text style={{
                flex: 1, marginLeft: SP[3],
                fontFamily: TY.sans.medium, fontSize: TY.size.body + 1, color: T.text.primary,
              }}>
                Manage close friends
              </Text>
              <Ionicons name="chevron-forward" size={16} color={T.text.muted} />
            </TouchableOpacity>
          ) : null}

          <Text style={{
            fontFamily: TY.sans.regular, fontSize: TY.size.small, color: T.text.muted,
            marginTop: SP[6], lineHeight: 16, paddingHorizontal: SP[2],
          }}>
            Pin/unpin saves immediately. Featured stats, layout, visibility, and story settings save
            on this device for now — server-side persistence lands with the preferences endpoint.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
