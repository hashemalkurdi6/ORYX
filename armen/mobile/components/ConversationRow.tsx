// ConversationRow — inbox list item.
//
// Visual language: same glass tokens as GlassCard (translucent wash + 1px
// rim + top-edge highlight). Profile photo left (48px circle), name + last
// message preview in the middle, timestamp + unread lime dot on the right.

import React from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/contexts/ThemeContext';
import { DmConversation } from '@/services/api';

export interface ConversationRowProps {
  conversation: DmConversation;
  currentUserId: string;
  onPress: () => void;
  onLongPress?: () => void;
}

// "2m", "1h", "yesterday", "Mar 14" — matches the spec.
function formatRelative(iso: string | null): string {
  if (!iso) return '';
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return '';
  const now = Date.now();
  const diffSec = Math.max(0, Math.floor((now - ts) / 1000));
  if (diffSec < 60) return 'now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay === 1) return 'yesterday';
  if (diffDay < 7) return `${diffDay}d`;
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function ConversationRow({
  conversation,
  currentUserId,
  onPress,
  onLongPress,
}: ConversationRowProps) {
  const { theme, type, radius, space } = useTheme();
  const other = conversation.other_participant;
  const last = conversation.last_message;
  const unread = conversation.unread_count > 0;
  const sentByMe = last?.sender_id === currentUserId;

  const preview = !last
    ? 'Say hi 👋'
    : last.deleted_at
      ? 'Message deleted'
      : last.message_type !== 'text'
        ? '[attachment]'
        : last.content;

  return (
    <TouchableOpacity
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.85}
      style={{
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: theme.glass.border,
        backgroundColor: theme.glass.card,
        overflow: 'hidden',
        position: 'relative',
        marginBottom: space[2],
      }}
    >
      {/* top-edge highlight — same pattern as GlassCard */}
      <LinearGradient
        colors={[theme.glass.highlight, 'rgba(255,255,255,0)']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.topHighlight}
        pointerEvents="none"
      />
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        padding: space[4],
        gap: space[3],
      }}>
        {/* Avatar */}
        <View style={{
          width: 48, height: 48, borderRadius: 24,
          backgroundColor: theme.glass.cardHi,
          borderWidth: 1, borderColor: theme.glass.border,
          alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden',
        }}>
          {other?.avatar_url ? (
            <Image source={{ uri: other.avatar_url }} style={{ width: 48, height: 48, borderRadius: 24 }} />
          ) : (
            <Text style={{
              fontSize: 16, color: theme.text.primary,
              fontFamily: type.sans.semibold, letterSpacing: 0.4,
            }}>
              {other?.initials ?? '?'}
            </Text>
          )}
        </View>

        {/* Name + preview */}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            numberOfLines={1}
            style={{
              fontSize: 15,
              color: theme.text.primary,
              fontFamily: unread ? type.sans.semibold : type.sans.medium,
              letterSpacing: -0.2,
            }}
          >
            {other?.display_name ?? 'Athlete'}
            {conversation.muted && (
              <Text style={{ color: theme.text.muted, fontFamily: type.mono.regular }}>  ·  muted</Text>
            )}
          </Text>
          <Text
            numberOfLines={1}
            style={{
              fontSize: 13,
              color: unread ? theme.text.body : theme.text.muted,
              fontFamily: unread ? type.sans.medium : type.sans.regular,
              marginTop: 2,
            }}
          >
            {sentByMe && last ? 'You: ' : ''}{preview}
          </Text>
        </View>

        {/* Timestamp + unread dot */}
        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          <Text style={{
            fontSize: 11, color: theme.text.muted,
            fontFamily: type.mono.regular, letterSpacing: 0.3,
          }}>
            {formatRelative(conversation.last_message_at)}
          </Text>
          {unread && (
            <View style={{
              width: 8, height: 8, borderRadius: 4,
              backgroundColor: theme.accent,
            }}/>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  topHighlight: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 2,
  },
});
