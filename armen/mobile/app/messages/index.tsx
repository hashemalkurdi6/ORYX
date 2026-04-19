// Inbox screen — list of conversations with search + pending-requests banner.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuthStore } from '@/services/authStore';
import { useMessagesStore } from '@/services/messagesStore';
import AmbientBackdrop from '@/components/AmbientBackdrop';
import ConversationRow from '@/components/ConversationRow';
import {
  listConversations,
  listMessageRequests,
  archiveConversation,
  muteConversation,
  unmuteConversation,
  DmConversation,
} from '@/services/api';

export default function InboxScreen() {
  const { theme, type, radius, space } = useTheme();
  const user = useAuthStore((s) => s.user);
  const refreshUnread = useMessagesStore((s) => s.refresh);

  const [conversations, setConversations] = useState<DmConversation[]>([]);
  const [requestCount, setRequestCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [showingRequests, setShowingRequests] = useState(false);

  const load = useCallback(async () => {
    try {
      const [list, reqs] = await Promise.all([
        showingRequests ? listMessageRequests() : listConversations(),
        showingRequests ? Promise.resolve([]) : listMessageRequests(),
      ]);
      setConversations(list);
      if (!showingRequests) setRequestCount(reqs.length);
      refreshUnread();
    } catch {
      // non-fatal
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showingRequests, refreshUnread]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!query.trim()) return conversations;
    const q = query.trim().toLowerCase();
    return conversations.filter((c) => {
      const name = c.other_participant?.display_name?.toLowerCase() ?? '';
      const handle = c.other_participant?.username?.toLowerCase() ?? '';
      return name.includes(q) || handle.includes(q);
    });
  }, [conversations, query]);

  const handleLongPress = (c: DmConversation) => {
    Alert.alert(
      c.other_participant?.display_name ?? 'Conversation',
      undefined,
      [
        {
          text: c.muted ? 'Unmute' : 'Mute',
          onPress: async () => {
            try {
              if (c.muted) await unmuteConversation(c.id);
              else await muteConversation(c.id);
              load();
            } catch {}
          },
        },
        {
          text: 'Archive',
          onPress: async () => {
            try { await archiveConversation(c.id); load(); } catch {}
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg.primary }}>
      <AmbientBackdrop />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        {/* Header */}
        <View style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          paddingHorizontal: 20, paddingTop: 8, paddingBottom: 14,
        }}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="chevron-back" size={24} color={theme.text.primary} />
          </TouchableOpacity>
          <Text style={{
            fontSize: 17, color: theme.text.primary,
            fontFamily: type.sans.semibold, letterSpacing: -0.3,
          }}>
            {showingRequests ? 'Requests' : 'Messages'}
          </Text>
          <TouchableOpacity
            onPress={() => router.push('/messages/new')}
            style={{
              width: 36, height: 36, borderRadius: 18,
              backgroundColor: theme.accent,
              alignItems: 'center', justifyContent: 'center',
            }}
            activeOpacity={0.85}
          >
            <Ionicons name="create-outline" size={18} color={theme.accentInk} />
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={{ paddingHorizontal: 20, paddingBottom: 12 }}>
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 8,
            backgroundColor: theme.glass.card,
            borderWidth: 1, borderColor: theme.glass.border,
            borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 10,
          }}>
            <Ionicons name="search" size={16} color={theme.text.muted} />
            <TextInput
              style={{
                flex: 1, color: theme.text.primary,
                fontSize: 14, fontFamily: type.sans.regular,
                padding: 0,
              }}
              placeholder={showingRequests ? 'Search requests…' : 'Search conversations…'}
              placeholderTextColor={theme.text.muted}
              value={query}
              onChangeText={setQuery}
            />
            {query.length > 0 ? (
              <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
                <Ionicons name="close-circle" size={16} color={theme.text.muted} />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {/* Requests banner (only in Messages view) */}
        {!showingRequests && requestCount > 0 ? (
          <TouchableOpacity
            onPress={() => { setShowingRequests(true); setLoading(true); }}
            activeOpacity={0.85}
            style={{
              marginHorizontal: 20, marginBottom: 10,
              borderRadius: radius.md,
              backgroundColor: theme.glass.cardHi,
              borderWidth: 1, borderColor: theme.glass.border,
              paddingHorizontal: 14, paddingVertical: 12,
              flexDirection: 'row', alignItems: 'center', gap: 10,
            }}
          >
            <Ionicons name="mail-unread-outline" size={18} color={theme.accent} />
            <Text style={{ flex: 1, color: theme.text.primary, fontSize: 14, fontFamily: type.sans.medium }}>
              Message Requests ({requestCount})
            </Text>
            <Ionicons name="chevron-forward" size={16} color={theme.text.muted} />
          </TouchableOpacity>
        ) : null}

        {showingRequests ? (
          <TouchableOpacity
            onPress={() => { setShowingRequests(false); setLoading(true); }}
            style={{ paddingHorizontal: 20, paddingBottom: 8 }}
          >
            <Text style={{
              fontSize: 12, color: theme.accent,
              fontFamily: type.mono.medium, letterSpacing: 1.4, textTransform: 'uppercase',
            }}>
              ← All messages
            </Text>
          </TouchableOpacity>
        ) : null}

        {/* List */}
        {loading ? (
          <View style={{ paddingTop: 60, alignItems: 'center' }}>
            <ActivityIndicator color={theme.text.muted} />
          </View>
        ) : filtered.length === 0 ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 10 }}>
            <Ionicons name="chatbubbles-outline" size={36} color={theme.text.muted} />
            <Text style={{
              fontSize: 15, color: theme.text.body,
              fontFamily: type.sans.medium, textAlign: 'center',
            }}>
              {showingRequests ? 'No message requests' : 'No conversations yet'}
            </Text>
            {!showingRequests ? (
              <TouchableOpacity
                onPress={() => router.push('/messages/new')}
                style={{
                  marginTop: 6,
                  paddingHorizontal: 16, paddingVertical: 10,
                  borderRadius: radius.pill,
                  backgroundColor: theme.accent,
                }}
              >
                <Text style={{ color: theme.accentInk, fontFamily: type.sans.semibold, fontSize: 13 }}>
                  Start a conversation
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(c) => c.id}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => { setRefreshing(true); load(); }}
                tintColor={theme.text.muted}
                colors={[theme.accent]}
              />
            }
            renderItem={({ item }) => (
              <ConversationRow
                conversation={item}
                currentUserId={user?.id ?? ''}
                onPress={() => router.push(`/messages/${item.id}`)}
                onLongPress={() => handleLongPress(item)}
              />
            )}
          />
        )}
      </SafeAreaView>
    </View>
  );
}
