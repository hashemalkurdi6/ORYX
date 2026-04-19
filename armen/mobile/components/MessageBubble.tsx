// MessageBubble — single message in the conversation view.
//
// Incoming: left-aligned, glass wash + 1px rim, tighter bottom-left corner
// so the shape points at the sender.
// Outgoing: right-aligned, lime accentDim fill, tighter bottom-right corner,
// primary white text.
//
// Kept intentionally small — no top-edge highlight on bubbles (they're too
// short for it to read). Timestamps are rendered by the parent list between
// gaps, not inside the bubble.

import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';

export interface MessageBubbleProps {
  content: string;
  isMine: boolean;
  isDeleted?: boolean;
  onLongPress?: () => void;
  /** Render with tighter tail corner (last in a stack of consecutive
   *  same-sender messages). Default true. */
  withTail?: boolean;
}

export default function MessageBubble({
  content,
  isMine,
  isDeleted,
  onLongPress,
  withTail = true,
}: MessageBubbleProps) {
  const { theme, radius, space } = useTheme();

  const bg = isMine ? theme.accentDim : theme.glass.card;
  const border = isMine ? 'rgba(222,255,71,0.30)' : theme.glass.border;
  const textColor = isDeleted ? theme.text.muted : theme.text.primary;
  const fontStyle = isDeleted ? ('italic' as const) : ('normal' as const);

  // Tighter corner on the "tail" side.
  const tailRadius = withTail ? 6 : radius.md;
  const corners = isMine
    ? { borderTopLeftRadius: radius.md, borderTopRightRadius: radius.md, borderBottomLeftRadius: radius.md, borderBottomRightRadius: tailRadius }
    : { borderTopLeftRadius: radius.md, borderTopRightRadius: radius.md, borderBottomLeftRadius: tailRadius, borderBottomRightRadius: radius.md };

  return (
    <View style={{
      width: '100%',
      alignItems: isMine ? 'flex-end' : 'flex-start',
      marginVertical: 2,
    }}>
      <Pressable
        onLongPress={onLongPress}
        style={({ pressed }) => [
          {
            maxWidth: '75%',
            paddingHorizontal: space[3],
            paddingVertical: 9,
            backgroundColor: bg,
            borderWidth: 1,
            borderColor: border,
            opacity: pressed ? 0.85 : 1,
            ...corners,
          },
        ]}
      >
        <Text style={{
          fontSize: 14,
          lineHeight: 20,
          color: textColor,
          fontStyle,
          letterSpacing: -0.1,
        }}>
          {isDeleted ? 'Message deleted' : content}
        </Text>
      </Pressable>
    </View>
  );
}
