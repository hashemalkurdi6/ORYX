// Conversation screen — inverted FlatList, paginate older on scroll,
// poll every 10s while focused, mark-read on mount + on new inbound.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuthStore } from '@/services/authStore';
import { useMessagesStore } from '@/services/messagesStore';
import AmbientBackdrop from '@/components/AmbientBackdrop';
import MessageBubble from '@/components/MessageBubble';
import {
  listMessages,
  sendMessage,
  markConversationRead,
  deleteMessage,
  archiveConversation,
  muteConversation,
  unmuteConversation,
  listConversations,
  DmMessage,
  DmConversation,
} from '@/services/api';

const POLL_INTERVAL_MS = 10_000;
const PAGE_SIZE = 20;
const GAP_MINUTES_FOR_DIVIDER = 15;

// ── List row types (dividers for >15 min gaps) ───────────────────────────────

type BubbleRow = { kind: 'message'; msg: DmMessage; withTail: boolean };
type GapRow = { kind: 'gap'; label: string; id: string };
type Row = BubbleRow | GapRow;

function formatGapLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (sameDay) return time;
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (diffDays === 1) return `Yesterday · ${time}`;
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${time}`;
}

function buildRows(messages: DmMessage[]): Row[] {
  // `messages` is newest-first (inverted FlatList). A row's "next"
  // neighbour in display is the one above it — i.e. the one whose index
  // is greater in this array.
  const rows: Row[] = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    // "withTail" on the last message in a run of same-sender messages.
    // In inverted order, we drop the tail when the NEXT message up (i-1)
    // is by the same sender (and close in time).
    const above = i > 0 ? messages[i - 1] : null;
    const sameRunAbove =
      above != null &&
      above.sender_id === m.sender_id &&
      Math.abs(new Date(above.created_at).getTime() - new Date(m.created_at).getTime()) < GAP_MINUTES_FOR_DIVIDER * 60_000;
    rows.push({ kind: 'message', msg: m, withTail: !sameRunAbove });

    // Inject a gap divider when the next older message (i+1) is >15 min earlier.
    const older = i + 1 < messages.length ? messages[i + 1] : null;
    if (older) {
      const diffMin = (new Date(m.created_at).getTime() - new Date(older.created_at).getTime()) / 60_000;
      if (diffMin >= GAP_MINUTES_FOR_DIVIDER) {
        rows.push({ kind: 'gap', id: `gap-${m.id}`, label: formatGapLabel(m.created_at) });
      }
    }
  }
  return rows;
}

export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const conversationId = Array.isArray(id) ? id[0] : id;
  const { theme, type, radius, space } = useTheme();
  const insets = useSafeAreaInsets();
  const me = useAuthStore((s) => s.user);
  const refreshUnread = useMessagesStore((s) => s.refresh);

  const [conversation, setConversation] = useState<DmConversation | null>(null);
  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState('');

  const listRef = useRef<FlatList<Row>>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isFocusedRef = useRef(false);

  // ── Load conversation meta (for the header) ────────────────────────────
  const loadMeta = useCallback(async () => {
    if (!conversationId) return;
    try {
      const all = await listConversations({ limit: 50, include_archived: true });
      const found = all.find((c) => c.id === conversationId) ?? null;
      setConversation(found);
    } catch {
      // fall back to the in-memory value
    }
  }, [conversationId]);

  // ── Initial load ───────────────────────────────────────────────────────
  const loadInitial = useCallback(async () => {
    if (!conversationId) return;
    setLoadingInitial(true);
    try {
      const res = await listMessages(conversationId, { limit: PAGE_SIZE });
      setMessages(res.messages);
      setHasMore(res.has_more);
    } catch {
      setMessages([]);
      setHasMore(false);
    } finally {
      setLoadingInitial(false);
    }
  }, [conversationId]);

  // ── Older page (on scroll to top of inverted list) ─────────────────────
  const loadOlder = useCallback(async () => {
    if (!conversationId || loadingMore || !hasMore || messages.length === 0) return;
    setLoadingMore(true);
    try {
      const before = messages[messages.length - 1].created_at;
      const res = await listMessages(conversationId, { before, limit: PAGE_SIZE });
      setMessages((prev) => [...prev, ...res.messages]);
      setHasMore(res.has_more);
    } catch {
      // non-fatal
    } finally {
      setLoadingMore(false);
    }
  }, [conversationId, loadingMore, hasMore, messages]);

  // ── Poll for new messages since newest ─────────────────────────────────
  const poll = useCallback(async () => {
    if (!conversationId || !isFocusedRef.current) return;
    try {
      const res = await listMessages(conversationId, { limit: PAGE_SIZE });
      const newest = res.messages;
      setMessages((prev) => {
        if (prev.length === 0) return newest;
        const knownIds = new Set(prev.map((m) => m.id));
        const incoming = newest.filter((m) => !knownIds.has(m.id));
        if (incoming.length === 0) return prev;
        // New inbound arrived — refresh the unread count in the store.
        const anyFromOther = incoming.some((m) => m.sender_id !== me?.id);
        if (anyFromOther) {
          markConversationRead(conversationId).catch(() => {});
          refreshUnread();
        }
        return [...incoming, ...prev];
      });
    } catch {}
  }, [conversationId, me?.id, refreshUnread]);

  // ── Focus: mark read + start polling ───────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      isFocusedRef.current = true;
      if (conversationId) markConversationRead(conversationId).catch(() => {});
      refreshUnread();
      pollRef.current = setInterval(poll, POLL_INTERVAL_MS);
      return () => {
        isFocusedRef.current = false;
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
      };
    }, [conversationId, poll, refreshUnread]),
  );

  useEffect(() => {
    loadMeta();
    loadInitial();
  }, [loadMeta, loadInitial]);

  // ── Send ───────────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const content = draft.trim();
    if (!content || !conversationId || sending) return;
    setSending(true);
    // Optimistic insert.
    const tempId = `tmp-${Date.now()}`;
    const optimistic: DmMessage = {
      id: tempId,
      conversation_id: conversationId,
      sender_id: me?.id ?? 'me',
      content,
      message_type: 'text',
      metadata: null,
      created_at: new Date().toISOString(),
      deleted_at: null,
    };
    setMessages((prev) => [optimistic, ...prev]);
    setDraft('');
    try {
      const real = await sendMessage(conversationId, { content, message_type: 'text' });
      setMessages((prev) => prev.map((m) => (m.id === tempId ? real : m)));
    } catch (e: any) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      Alert.alert('Send failed', e?.response?.data?.detail ?? 'Could not send your message.');
      setDraft(content);
    } finally {
      setSending(false);
    }
  }, [draft, conversationId, sending, me?.id]);

  const handleLongPressMessage = useCallback(
    (m: DmMessage) => {
      if (m.sender_id !== me?.id || m.deleted_at || !conversationId) return;
      Alert.alert('Message', undefined, [
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteMessage(conversationId, m.id);
              setMessages((prev) =>
                prev.map((mm) => (mm.id === m.id ? { ...mm, deleted_at: new Date().toISOString(), content: '' } : mm)),
              );
            } catch {}
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]);
    },
    [conversationId, me?.id],
  );

  const handleMenu = () => {
    if (!conversation || !conversationId) return;
    Alert.alert(
      conversation.other_participant?.display_name ?? 'Conversation',
      undefined,
      [
        {
          text: conversation.muted ? 'Unmute' : 'Mute',
          onPress: async () => {
            try {
              if (conversation.muted) await unmuteConversation(conversationId);
              else await muteConversation(conversationId);
              loadMeta();
            } catch {}
          },
        },
        {
          text: 'Archive',
          onPress: async () => {
            try {
              await archiveConversation(conversationId);
              router.back();
            } catch {}
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  };

  const rows = useMemo(() => buildRows(messages), [messages]);
  const other = conversation?.other_participant;

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg.primary }}>
      <AmbientBackdrop />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>
        {/* Header */}
        <View style={{
          flexDirection: 'row', alignItems: 'center',
          paddingHorizontal: 14, paddingTop: 8, paddingBottom: 12,
          gap: 10,
          borderBottomWidth: 1, borderBottomColor: theme.glass.border,
        }}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="chevron-back" size={24} color={theme.text.primary} />
          </TouchableOpacity>
          <View style={{
            width: 34, height: 34, borderRadius: 17,
            backgroundColor: theme.glass.cardHi,
            borderWidth: 1, borderColor: theme.glass.border,
            alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
          }}>
            {other?.avatar_url ? (
              <Image source={{ uri: other.avatar_url }} style={{ width: 34, height: 34, borderRadius: 17 }} />
            ) : (
              <Text style={{ fontSize: 12, color: theme.text.primary, fontFamily: type.sans.semibold }}>
                {other?.initials ?? '?'}
              </Text>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{
              fontSize: 15, color: theme.text.primary,
              fontFamily: type.sans.semibold, letterSpacing: -0.2,
            }}>
              {other?.display_name ?? 'Conversation'}
            </Text>
            {other?.username ? (
              <Text style={{
                fontSize: 11, color: theme.text.muted,
                fontFamily: type.mono.regular, letterSpacing: 0.4,
                marginTop: 1,
              }}>
                @{other.username}
              </Text>
            ) : null}
          </View>
          <TouchableOpacity onPress={handleMenu} hitSlop={8}>
            <Ionicons name="ellipsis-horizontal" size={20} color={theme.text.body} />
          </TouchableOpacity>
        </View>

        {/* Messages list (inverted) */}
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 8 : 0}
        >
          {loadingInitial ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color={theme.text.muted} />
            </View>
          ) : (
            <FlatList
              ref={listRef}
              data={rows}
              inverted
              keyExtractor={(r) => (r.kind === 'message' ? r.msg.id : r.id)}
              contentContainerStyle={{ paddingHorizontal: 14, paddingVertical: 12, gap: 2 }}
              onEndReached={loadOlder}
              onEndReachedThreshold={0.3}
              ListFooterComponent={
                loadingMore ? (
                  <View style={{ paddingVertical: 12, alignItems: 'center' }}>
                    <ActivityIndicator size="small" color={theme.text.muted} />
                  </View>
                ) : null
              }
              ListEmptyComponent={
                <View style={{ alignItems: 'center', paddingTop: 80, gap: 8 }}>
                  <Text style={{ color: theme.text.muted, fontSize: 13, fontFamily: type.sans.regular }}>
                    Say hi — no messages yet.
                  </Text>
                </View>
              }
              renderItem={({ item }) => {
                if (item.kind === 'gap') {
                  return (
                    <View style={{ alignItems: 'center', paddingVertical: 14 }}>
                      <Text style={{
                        fontSize: 11, color: theme.text.muted,
                        fontFamily: type.mono.regular, letterSpacing: 0.5,
                      }}>
                        {item.label}
                      </Text>
                    </View>
                  );
                }
                const m = item.msg;
                const mine = m.sender_id === me?.id;
                return (
                  <MessageBubble
                    content={m.content}
                    isMine={mine}
                    isDeleted={m.deleted_at != null}
                    withTail={item.withTail}
                    onLongPress={() => handleLongPressMessage(m)}
                  />
                );
              }}
            />
          )}

          {/* Input bar */}
          <View style={{
            paddingHorizontal: 12,
            paddingTop: 8,
            paddingBottom: Math.max(insets.bottom, 10),
            borderTopWidth: 1, borderTopColor: theme.glass.border,
            backgroundColor: theme.bg.primary,
          }}>
            <View style={{
              flexDirection: 'row', alignItems: 'flex-end', gap: 8,
            }}>
              {/* + icon — reserved for Phase 3 */}
              <View style={{
                width: 38, height: 38, borderRadius: 19,
                backgroundColor: theme.glass.pill,
                borderWidth: 1, borderColor: theme.glass.border,
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Ionicons name="add" size={20} color={theme.text.muted} />
              </View>

              {/* Text input */}
              <View style={{
                flex: 1,
                backgroundColor: theme.glass.card,
                borderWidth: 1, borderColor: theme.glass.border,
                borderRadius: 20,
                paddingHorizontal: 14,
                paddingVertical: Platform.OS === 'ios' ? 8 : 4,
                minHeight: 38,
                maxHeight: 120,
                justifyContent: 'center',
              }}>
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  placeholder="Message…"
                  placeholderTextColor={theme.text.muted}
                  multiline
                  style={{
                    color: theme.text.primary,
                    fontSize: 15, lineHeight: 20,
                    fontFamily: type.sans.regular,
                    padding: 0,
                    maxHeight: 96,
                  }}
                />
              </View>

              {/* Send */}
              <TouchableOpacity
                onPress={handleSend}
                disabled={sending || draft.trim().length === 0}
                activeOpacity={0.85}
                style={{
                  width: 38, height: 38, borderRadius: 19,
                  backgroundColor: draft.trim().length === 0 ? theme.glass.pill : theme.accent,
                  borderWidth: draft.trim().length === 0 ? 1 : 0,
                  borderColor: theme.glass.border,
                  alignItems: 'center', justifyContent: 'center',
                  opacity: sending ? 0.6 : 1,
                }}
              >
                <Ionicons
                  name="arrow-up"
                  size={18}
                  color={draft.trim().length === 0 ? theme.text.muted : theme.accentInk}
                />
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
