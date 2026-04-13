import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { LineChart } from 'react-native-chart-kit';
import {
  getActivities,
  getHealthSnapshots,
  getWhoopData,
  Activity,
  HealthSnapshot,
  WhoopData,
} from '@/services/api';
import { useAuthStore } from '@/services/authStore';
import { useTheme } from '@/contexts/ThemeContext';
import { ThemeColors } from '@/services/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 40;

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
  earned: (activities: Activity[], whoopData: WhoopData[]) => boolean;
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
    earned: (_a, whoop) =>
      whoop.filter((w) => (w.recovery_score ?? 0) >= 70).length >= 7,
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
  const { user } = useAuthStore();
  const { theme } = useTheme();
  const s = useMemo(() => createStyles(theme), [theme]);

  const [activities, setActivities] = useState<Activity[]>([]);
  const [healthSnapshots, setHealthSnapshots] = useState<HealthSnapshot[]>([]);
  const [whoopData, setWhoopData] = useState<WhoopData[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Load data ──────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    try {
      const [activitiesResult, snapshotsResult, whoopResult] =
        await Promise.allSettled([
          getActivities(1, 20),
          getHealthSnapshots(30),
          getWhoopData(30),
        ]);

      if (activitiesResult.status === 'fulfilled') {
        setActivities(activitiesResult.value);
      }
      if (snapshotsResult.status === 'fulfilled') {
        setHealthSnapshots(snapshotsResult.value);
      }
      if (whoopResult.status === 'fulfilled') {
        setWhoopData(whoopResult.value);
      }
    } catch {
      // Non-fatal
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ── Computed ──────────────────────────────────────────────────────────────

  const email = user?.email ?? '';
  const initials = getInitials(user?.full_name ?? null, email);
  const displayName = user?.full_name || user?.username || email;

  const totalWorkouts = activities.length;
  const totalDistanceKm = activities.reduce(
    (sum, a) => sum + (a.distance_meters ?? 0) / 1000,
    0
  );
  const currentStreak = computeCurrentStreak(activities);
  const longestStreak = computeLongestStreak(activities);

  const hrvSnapshots = healthSnapshots
    .filter((s) => s.hrv_ms !== null)
    .slice(0, 30)
    .reverse();

  const avgHrv =
    hrvSnapshots.length > 0
      ? Math.round(
          hrvSnapshots.reduce((sum, s) => sum + (s.hrv_ms ?? 0), 0) /
            hrvSnapshots.length
        )
      : null;

  const sleepValues = healthSnapshots
    .filter((s) => s.sleep_duration_hours !== null)
    .map((s) => s.sleep_duration_hours as number);

  const avgSleep =
    sleepValues.length > 0
      ? (sleepValues.reduce((s, v) => s + v, 0) / sleepValues.length).toFixed(1)
      : null;
  const bestSleep =
    sleepValues.length > 0 ? Math.max(...sleepValues).toFixed(1) : null;
  const worstSleep =
    sleepValues.length > 0 ? Math.min(...sleepValues).toFixed(1) : null;

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={s.loadingContainer}>
        <ActivityIndicator size="large" color={theme.text.primary} />
      </View>
    );
  }

  return (
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
          <View style={s.avatarCircle}>
            {initials ? (
              <Text style={s.avatarText}>{initials}</Text>
            ) : (
              <Ionicons name="person" size={32} color={theme.text.secondary} />
            )}
          </View>

          <Text style={s.displayName}>{displayName}</Text>

          {user?.username ? (
            <Text style={s.usernameText}>@{user.username}</Text>
          ) : null}

          {user?.bio ? (
            <Text style={s.bioText}>{user.bio}</Text>
          ) : null}

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={s.sportTagsScroll}
            contentContainerStyle={s.sportTagsContent}
          >
            {user?.sports && user.sports.length > 0 ? (
              user.sports.map((sport) => (
                <View key={sport} style={s.sportTag}>
                  <Ionicons name={getSportIcon(sport)} size={13} color={theme.text.secondary} />
                  <Text style={s.sportTagText}>{sport}</Text>
                </View>
              ))
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
          </ScrollView>

          {user?.location ? (
            <View style={s.locationRow}>
              <Ionicons name="location-outline" size={14} color={theme.text.secondary} />
              <Text style={s.locationText}>{user.location}</Text>
            </View>
          ) : null}

          <View style={s.socialStatsRow}>
            <View style={s.socialStatItem}>
              <Text style={s.socialStatValue}>{user?.following_count ?? 0}</Text>
              <Text style={s.socialStatLabel}>Following</Text>
            </View>
            <View style={s.socialStatDivider} />
            <View style={s.socialStatItem}>
              <Text style={s.socialStatValue}>{user?.followers_count ?? 0}</Text>
              <Text style={s.socialStatLabel}>Followers</Text>
            </View>
            <View style={s.socialStatDivider} />
            <View style={s.socialStatItem}>
              <Text style={s.socialStatValue}>{formatJoinDate(user?.created_at)}</Text>
              <Text style={s.socialStatLabel}>Joined</Text>
            </View>
          </View>
        </View>
      </SafeAreaView>

      {/* 2. WEEKLY RECAP CARD */}
      <View style={[s.card, s.recapCard]}>
        <View style={s.recapHeader}>
          <View style={s.recapHeaderLeft}>
            <Ionicons name="sparkles" size={16} color={theme.accent} />
            <Text style={s.recapLabel}>AI WEEKLY RECAP</Text>
          </View>
          <Text style={s.recapPoweredBy}>Powered by ORYX</Text>
        </View>
        <Text style={s.recapBody}>
          Strong week overall. Your HRV averaged {avgHrv ? `${avgHrv}ms` : '—'} — suggesting
          solid recovery adaptation. Sleep consistency improved, with{' '}
          {sleepValues.filter((v) => v >= 6).length} nights at 6+ hours.{' '}
          Keep the training volume steady this week and prioritize sleep quality
          heading into the weekend.
        </Text>
      </View>

      {/* 3. STATS BAR */}
      <Text style={s.sectionLabel}>STATS</Text>
      <View style={s.card}>
        <View style={s.statsBar}>
          <View style={s.statBarItem}>
            <Text style={s.statBarValue}>{totalWorkouts}</Text>
            <Text style={s.statBarLabel}>WORKOUTS</Text>
          </View>
          <View style={s.statBarDivider} />
          <View style={s.statBarItem}>
            <Text style={s.statBarValue}>{totalDistanceKm.toFixed(1)}</Text>
            <Text style={s.statBarLabel}>KM</Text>
          </View>
          <View style={s.statBarDivider} />
          <View style={s.statBarItem}>
            <Text style={s.statBarValue}>{currentStreak}</Text>
            <Text style={s.statBarLabel}>STREAK</Text>
          </View>
          <View style={s.statBarDivider} />
          <View style={s.statBarItem}>
            <Text style={s.statBarValue}>{longestStreak}</Text>
            <Text style={s.statBarLabel}>BEST</Text>
          </View>
        </View>
      </View>

      {/* 4. BADGES */}
      <Text style={s.sectionLabel}>ACHIEVEMENTS</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.badgesScrollContent}
        style={s.badgesScroll}
      >
        {BADGES.map((badge) => {
          const earned = badge.earned(activities, whoopData);
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

      {/* 5. ACTIVITY HEATMAP */}
      <Text style={s.sectionLabel}>WORKOUT HISTORY</Text>
      <View style={s.card}>
        <WorkoutHeatmap activities={activities} />
      </View>

      {/* 6. RECOVERY TRENDS */}
      <Text style={s.sectionLabel}>RECOVERY TRENDS</Text>

      <View style={s.card}>
        <Text style={s.cardInnerLabel}>30-Day HRV Trend</Text>
        {hrvSnapshots.length >= 2 ? (
          <>
            <LineChart
              data={{
                labels: [],
                datasets: [
                  {
                    data: hrvSnapshots.map((s) => s.hrv_ms as number),
                    color: () => theme.status.success,
                    strokeWidth: 2,
                  },
                ],
              }}
              width={CARD_WIDTH - 32}
              height={120}
              withDots={false}
              withInnerLines={false}
              withOuterLines={false}
              withHorizontalLabels={false}
              withVerticalLabels={false}
              chartConfig={{
                backgroundColor: theme.bg.elevated,
                backgroundGradientFrom: theme.bg.elevated,
                backgroundGradientTo: theme.bg.elevated,
                color: () => theme.status.success,
                strokeWidth: 2,
                propsForBackgroundLines: { stroke: 'transparent' },
              }}
              bezier
              style={s.chartStyle}
            />
            {avgHrv !== null && (
              <View style={s.chartStatRow}>
                <Text style={s.chartStatLabel}>Avg HRV</Text>
                <Text style={s.chartStatValue}>{avgHrv} ms</Text>
              </View>
            )}
          </>
        ) : (
          <View style={s.emptyChartState}>
            <Ionicons name="heart-outline" size={24} color={theme.border} />
            <Text style={s.emptyChartText}>
              Connect HealthKit to see HRV trends
            </Text>
          </View>
        )}
      </View>

      <View style={s.card}>
        <Text style={s.cardInnerLabel}>Sleep Overview</Text>
        <View style={s.sleepStatsRow}>
          <View style={s.sleepStatItem}>
            <Text style={s.sleepStatValue}>{avgSleep ?? '--'}</Text>
            <Text style={s.sleepStatLabel}>Avg Sleep</Text>
          </View>
          <View style={s.statBarDivider} />
          <View style={s.sleepStatItem}>
            <Text style={[s.sleepStatValue, { color: theme.status.success }]}>
              {bestSleep ?? '--'}
            </Text>
            <Text style={s.sleepStatLabel}>Best Night</Text>
          </View>
          <View style={s.statBarDivider} />
          <View style={s.sleepStatItem}>
            <Text style={[s.sleepStatValue, { color: theme.status.danger }]}>
              {worstSleep ?? '--'}
            </Text>
            <Text style={s.sleepStatLabel}>Worst Night</Text>
          </View>
        </View>
      </View>

      <View style={s.bottomPadding} />
    </ScrollView>
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
    loadingContainer: {
      flex: 1,
      backgroundColor: t.bg.primary,
      alignItems: 'center',
      justifyContent: 'center',
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
      paddingBottom: 28,
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

    sectionLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: t.text.muted,
      textTransform: 'uppercase',
      letterSpacing: 2,
      marginBottom: 10,
      marginTop: 4,
    },

    card: {
      backgroundColor: t.bg.elevated,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: t.border,
      marginBottom: 12,
    },

    recapCard: {
      borderLeftWidth: 3,
      borderLeftColor: t.accent,
      marginBottom: 20,
    },
    recapHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    recapHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    recapLabel: {
      fontSize: 11,
      fontWeight: '600',
      color: t.text.secondary,
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    recapPoweredBy: {
      fontSize: 10,
      color: t.text.muted,
    },
    recapBody: {
      fontSize: 15,
      color: t.text.primary,
      lineHeight: 23,
    },

    statsBar: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    statBarItem: {
      flex: 1,
      alignItems: 'center',
      gap: 4,
    },
    statBarDivider: {
      width: 1,
      height: 36,
      backgroundColor: t.border,
    },
    statBarValue: {
      fontSize: 24,
      fontWeight: '700',
      color: t.text.primary,
    },
    statBarLabel: {
      fontSize: 11,
      color: t.text.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
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

    cardInnerLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: t.text.secondary,
      marginBottom: 12,
    },
    chartStyle: {
      borderRadius: 8,
      marginLeft: -8,
    },
    chartStatRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 10,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: t.border,
    },
    chartStatLabel: {
      fontSize: 12,
      color: t.text.muted,
    },
    chartStatValue: {
      fontSize: 16,
      fontWeight: '700',
      color: t.status.success,
    },
    emptyChartState: {
      alignItems: 'center',
      paddingVertical: 20,
      gap: 8,
    },
    emptyChartText: {
      fontSize: 13,
      color: t.text.muted,
      textAlign: 'center',
    },
    sleepStatsRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    sleepStatItem: {
      flex: 1,
      alignItems: 'center',
      gap: 4,
    },
    sleepStatValue: {
      fontSize: 22,
      fontWeight: '700',
      color: t.text.primary,
    },
    sleepStatLabel: {
      fontSize: 11,
      color: t.text.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },

    bottomPadding: {
      height: 24,
    },
  });
}
