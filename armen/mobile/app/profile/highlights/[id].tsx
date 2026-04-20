// Highlight Viewer — full-screen story-style playback of a highlight's
// stories. Reuses the existing StoryViewer so progress bars, gestures,
// swipe-to-dismiss, and pause-on-hold all behave identically. Likes /
// comments / replies are intentionally ignored for highlights (passive view).

import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import StoryViewer from '@/components/StoryViewer';
import { useAuthStore } from '@/services/authStore';
import {
  getHighlightStories,
  getUserHighlights,
  Highlight,
  StoryGroup,
  StoryItem,
} from '@/services/api';

export default function HighlightViewerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { theme } = useTheme();
  const me = useAuthStore((s) => s.user);

  const [groups, setGroups] = useState<StoryGroup[] | null>(null);

  useEffect(() => {
    if (!id || !me?.id) return;
    let cancelled = false;
    (async () => {
      try {
        // Pull the highlight metadata (title + cover) + stories in parallel.
        const [storiesRes, listRes] = await Promise.all([
          getHighlightStories(id),
          getUserHighlights(me.id),
        ]);
        if (cancelled) return;

        const highlight: Highlight | undefined = listRes.highlights.find((h) => h.id === id);
        const stories: StoryItem[] = storiesRes.stories
          .filter((s) => !!s.photo_url)
          .map((s) => ({
            id: s.id,
            user_id: s.user_id,
            photo_url: s.photo_url ?? '',
            caption: s.caption,
            oryx_data_overlay_json: s.oryx_data_overlay_json as any,
            text_overlay: s.text_overlay,
            source_post_id: null,
            checkin_id: null,
            created_at: s.created_at,
            expires_at: s.created_at, // highlight stories don't expire — dummy
            is_expired: false,
          } as StoryItem));

        if (stories.length === 0) {
          router.back();
          return;
        }

        // Build a single group so StoryViewer treats the highlight as one "user"
        const group: StoryGroup = {
          user_id: me.id,
          display_name: highlight?.title || 'Highlight',
          initials: '✦',
          avatar_url: highlight?.cover_photo_url ?? null,
          has_unseen_story: false,
          stories,
          is_own: highlight?.user_id === me.id,
        };
        setGroups([group]);
      } catch {
        if (!cancelled) router.back();
      }
    })();
    return () => { cancelled = true; };
  }, [id, me?.id]);

  if (!groups) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg.primary, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={theme.text.muted} />
      </View>
    );
  }

  return (
    <StoryViewer
      visible
      groups={groups}
      initialGroupIndex={0}
      currentUserId={me?.id ?? ''}
      onClose={() => router.back()}
      onMarkSeen={() => { /* highlights don't track seen state */ }}
    />
  );
}
