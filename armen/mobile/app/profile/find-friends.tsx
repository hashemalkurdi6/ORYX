// Find Friends — pushed screen for discovering + following ORYX users.
//
// Shows suggested users by default; switches to search results while the
// user types. Tap a row → opens the existing AthleteProfileModal inline so
// we don't have to replicate the user-profile surface here.

import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  FlatList,
  ActivityIndicator,
  Image,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { theme as T, type as TY, radius as R, space as SP } from '@/services/theme';
import AmbientBackdrop from '@/components/AmbientBackdrop';
import AthleteProfileModal from '@/components/AthleteProfileModal';
import { useAuthStore } from '@/services/authStore';
import {
  searchUsers,
  getSuggestions,
  followUser,
  unfollowUser,
  UserPreview,
} from '@/services/api';

// Shared row for a user in the suggested/results list.
function UserRow({
  user,
  isFollowing,
  busy,
  onToggleFollow,
  onOpen,
}: {
  user: UserPreview;
  isFollowing: boolean;
  busy: boolean;
  onToggleFollow: () => void;
  onOpen: () => void;
}) {
  const initials =
    user.display_name?.trim().split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase() ||
    (user.username?.slice(0, 2) ?? '?').toUpperCase();

  return (
    <TouchableOpacity
      onPress={onOpen}
      activeOpacity={0.7}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: SP[3],
        paddingHorizontal: SP[5],
        paddingVertical: SP[3],
      }}
    >
      {user.avatar_url ? (
        <Image
          source={{ uri: user.avatar_url }}
          style={{ width: 44, height: 44, borderRadius: R.pill }}
        />
      ) : (
        <View style={{
          width: 44, height: 44, borderRadius: R.pill,
          backgroundColor: T.bg.elevated,
          borderWidth: 1, borderColor: T.border,
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Text style={{ fontFamily: TY.sans.bold, fontSize: TY.size.body, color: T.text.body }}>
            {initials}
          </Text>
        </View>
      )}

      <View style={{ flex: 1 }}>
        <Text
          numberOfLines={1}
          style={{ fontFamily: TY.sans.semibold, fontSize: TY.size.body + 1, color: T.text.primary }}
        >
          {user.display_name || user.username}
        </Text>
        <Text
          numberOfLines={1}
          style={{ fontFamily: TY.sans.regular, fontSize: TY.size.small + 1, color: T.text.muted, marginTop: 2 }}
        >
          @{user.username}
        </Text>
      </View>

      <TouchableOpacity
        onPress={(e) => { e.stopPropagation(); onToggleFollow(); }}
        disabled={busy}
        activeOpacity={0.8}
        style={{
          paddingHorizontal: SP[4],
          paddingVertical: SP[2],
          borderRadius: R.pill,
          borderWidth: 1,
          borderColor: isFollowing ? T.border : T.accent,
          backgroundColor: isFollowing ? 'transparent' : T.accent,
          minWidth: 92,
          alignItems: 'center',
          opacity: busy ? 0.5 : 1,
        }}
      >
        <Text
          style={{
            fontFamily: TY.sans.semibold,
            fontSize: TY.size.small + 1,
            color: isFollowing ? T.text.primary : T.accentInk,
          }}
        >
          {isFollowing ? 'Following' : 'Follow'}
        </Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text style={{
      fontFamily: TY.mono.semibold,
      fontSize: TY.size.micro,
      color: T.text.muted,
      textTransform: 'uppercase',
      letterSpacing: TY.tracking.label,
      paddingHorizontal: SP[5],
      paddingTop: SP[5],
      paddingBottom: SP[2],
    }}>
      {children}
    </Text>
  );
}

export default function FindFriendsScreen() {
  const { theme } = useTheme();
  const me = useAuthStore((s) => s.user);

  const [query, setQuery] = useState('');
  const [suggested, setSuggested] = useState<UserPreview[]>([]);
  const [results, setResults] = useState<UserPreview[]>([]);
  const [loadingSuggested, setLoadingSuggested] = useState(true);
  const [loadingSearch, setLoadingSearch] = useState(false);

  // followed map keeps the row state in sync across suggested + search lists
  const [followState, setFollowState] = useState<Record<string, boolean>>({});
  const [toggling, setToggling] = useState<Record<string, boolean>>({});

  // modal state for tapping into a user profile
  const [openProfileId, setOpenProfileId] = useState<string | null>(null);

  // Initial suggestion load
  useEffect(() => {
    (async () => {
      setLoadingSuggested(true);
      try {
        const { suggestions } = await getSuggestions();
        setSuggested(suggestions);
        setFollowState((prev) => {
          const next = { ...prev };
          suggestions.forEach((u) => {
            if (next[u.id] === undefined) next[u.id] = !!u.is_following;
          });
          return next;
        });
      } catch {
        setSuggested([]);
      } finally {
        setLoadingSuggested(false);
      }
    })();
  }, []);

  // Debounced search
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    const t = setTimeout(async () => {
      setLoadingSearch(true);
      try {
        const { users } = await searchUsers(q);
        setResults(users);
        setFollowState((prev) => {
          const next = { ...prev };
          users.forEach((u) => {
            if (next[u.id] === undefined) next[u.id] = !!u.is_following;
          });
          return next;
        });
      } catch {
        setResults([]);
      } finally {
        setLoadingSearch(false);
      }
    }, 220);
    return () => clearTimeout(t);
  }, [query]);

  const handleToggleFollow = useCallback(async (userId: string) => {
    if (toggling[userId]) return;
    const wasFollowing = !!followState[userId];
    // optimistic toggle
    setFollowState((prev) => ({ ...prev, [userId]: !wasFollowing }));
    setToggling((prev) => ({ ...prev, [userId]: true }));
    try {
      if (wasFollowing) await unfollowUser(userId);
      else await followUser(userId);
    } catch {
      // revert on failure
      setFollowState((prev) => ({ ...prev, [userId]: wasFollowing }));
    } finally {
      setToggling((prev) => ({ ...prev, [userId]: false }));
    }
  }, [followState, toggling]);

  const handleInvite = useCallback(async () => {
    const handle = me?.username ?? (me?.email?.split('@')[0] || 'me');
    try {
      await Share.share({
        message: `Join me on ORYX — https://oryx.app/invite/${handle}`,
      });
    } catch {
      // user cancelled
    }
  }, [me?.username, me?.email]);

  const isSearching = query.trim().length > 0;
  const listData = isSearching ? results : suggested;
  const listLoading = isSearching ? loadingSearch : loadingSuggested;

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg.primary }}>
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
            fontSize: TY.size.h3 - 1,
            color: T.text.primary,
            fontFamily: TY.sans.semibold,
            letterSpacing: -0.3,
          }}>
            Find Friends
          </Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Search input */}
        <View style={{ paddingHorizontal: SP[5], paddingBottom: SP[2] }}>
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: SP[2],
            backgroundColor: T.bg.elevated,
            borderWidth: 1, borderColor: T.border,
            borderRadius: R.sm,
            paddingHorizontal: SP[3],
            paddingVertical: SP[2] + 2,
          }}>
            <Ionicons name="search" size={16} color={T.text.muted} />
            <TextInput
              style={{
                flex: 1,
                fontFamily: TY.sans.regular,
                fontSize: TY.size.body + 1,
                color: T.text.primary,
                paddingVertical: 0,
              }}
              placeholder="Search by name or username"
              placeholderTextColor={T.text.muted}
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
                <Ionicons name="close-circle" size={16} color={T.text.muted} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        <FlatList
          data={listData}
          keyExtractor={(u) => u.id}
          ListHeaderComponent={
            <SectionLabel>
              {isSearching ? 'Results' : 'Suggested for you'}
            </SectionLabel>
          }
          ListEmptyComponent={
            listLoading ? (
              <View style={{ paddingVertical: SP[8], alignItems: 'center' }}>
                <ActivityIndicator color={T.text.muted} />
              </View>
            ) : (
              <Text style={{
                fontFamily: TY.sans.regular,
                fontSize: TY.size.body,
                color: T.text.muted,
                textAlign: 'center',
                paddingVertical: SP[8],
                paddingHorizontal: SP[5],
              }}>
                {isSearching
                  ? `No users match "${query.trim()}"`
                  : 'No suggestions yet — as you follow and log sessions we\u2019ll surface athletes you might know.'}
              </Text>
            )
          }
          renderItem={({ item }) => (
            <UserRow
              user={item}
              isFollowing={!!followState[item.id]}
              busy={!!toggling[item.id]}
              onToggleFollow={() => handleToggleFollow(item.id)}
              onOpen={() => setOpenProfileId(item.id)}
            />
          )}
          ListFooterComponent={
            <View style={{
              paddingHorizontal: SP[5],
              paddingTop: SP[6],
              paddingBottom: SP[8],
            }}>
              <View style={{
                backgroundColor: T.bg.elevated,
                borderRadius: R.md,
                borderWidth: 1,
                borderColor: T.border,
                padding: SP[5],
                gap: SP[3],
              }}>
                <Text style={{
                  fontFamily: TY.mono.semibold,
                  fontSize: TY.size.micro,
                  color: T.text.muted,
                  textTransform: 'uppercase',
                  letterSpacing: TY.tracking.label,
                }}>
                  Invite via link
                </Text>
                <Text style={{
                  fontFamily: TY.sans.regular,
                  fontSize: TY.size.body,
                  color: T.text.body,
                  lineHeight: 20,
                }}>
                  Share your invite link with friends who aren\u2019t on ORYX yet.
                </Text>
                <TouchableOpacity
                  onPress={handleInvite}
                  style={{
                    backgroundColor: T.accent,
                    borderRadius: R.sm,
                    paddingVertical: SP[3] + 2,
                    alignItems: 'center',
                    marginTop: SP[1],
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={{
                    fontFamily: TY.sans.bold,
                    fontSize: TY.size.body + 1,
                    color: T.accentInk,
                    letterSpacing: TY.tracking.tight,
                  }}>
                    Share invite link
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          }
          keyboardShouldPersistTaps="handled"
        />

        {/* Inline profile modal when a row is tapped */}
        <AthleteProfileModal
          visible={openProfileId !== null}
          userId={openProfileId}
          onClose={() => setOpenProfileId(null)}
        />
      </SafeAreaView>
    </View>
  );
}
