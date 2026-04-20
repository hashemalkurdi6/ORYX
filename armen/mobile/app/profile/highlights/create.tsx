// Create Highlight — pushes from the + tile on the profile highlights row.
//
// Flow: title → pick stories → featured stat → save. The highlight's date
// range is auto-derived from the min/max timestamps of the selected stories
// (no manual picker). Stats (sessions / load / etc.) are computed backend-side
// over that same derived range.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Image,
  Alert,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '@/contexts/ThemeContext';
import { theme as T, type as TY, radius as R, space as SP } from '@/services/theme';
import AmbientBackdrop from '@/components/AmbientBackdrop';
import {
  getMyStories,
  createHighlight,
  uploadMedia,
  StoryItem,
  HighlightFeaturedStat,
} from '@/services/api';

const { width: SCREEN_W } = Dimensions.get('window');
const GRID_GAP = 4;
const GRID_COLS = 3;
const GRID_CELL = (SCREEN_W - SP[5] * 2 - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS;

function toIsoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDateShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const STAT_OPTIONS: { key: HighlightFeaturedStat; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { key: 'sessions', label: 'Sessions', icon: 'fitness-outline' },
  { key: 'load',     label: 'Load',     icon: 'pulse-outline' },
  { key: 'prs',      label: 'PRs',      icon: 'trophy-outline' },
  { key: 'readiness',label: 'Readiness',icon: 'heart-outline' },
];

export default function CreateHighlightScreen() {
  const { theme } = useTheme();

  const [title, setTitle] = useState('');
  const [stories, setStories] = useState<StoryItem[]>([]);
  const [loadingStories, setLoadingStories] = useState(true);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [featuredStat, setFeaturedStat] = useState<HighlightFeaturedStat>('sessions');
  const [coverOverride, setCoverOverride] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Load every story the user has ever posted (range: epoch → today). Server
  // returns them newest-first.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingStories(true);
      try {
        const res = await getMyStories({
          start_date: '1970-01-01',
          end_date: toIsoDate(new Date()),
        });
        if (!cancelled) setStories(res.stories);
      } catch {
        if (!cancelled) setStories([]);
      } finally {
        if (!cancelled) setLoadingStories(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const selectedIds = useMemo(
    () => Object.entries(selected).filter(([, v]) => v).map(([k]) => k),
    [selected],
  );

  // Auto-derived range from the timestamps of the selected stories.
  // Shown as a subtle caption under the Stories header so users know what
  // the featured-stat pill will aggregate over.
  const derivedRange = useMemo(() => {
    if (selectedIds.length === 0) return null;
    const selectedStories = stories.filter((s) => selected[s.id]);
    if (selectedStories.length === 0) return null;
    const timestamps = selectedStories.map((s) => new Date(s.created_at).getTime());
    const start = new Date(Math.min(...timestamps));
    const end = new Date(Math.max(...timestamps));
    return {
      startIso: toIsoDate(start),
      endIso: toIsoDate(end),
    };
  }, [selectedIds, selected, stories]);

  const pickCustomCover = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [11, 15],
      quality: 0.85,
    });
    if (result.canceled) return;
    try {
      const { url } = await uploadMedia(result.assets[0].uri, 720);
      setCoverOverride(url);
    } catch {
      Alert.alert('Upload failed', 'Could not upload cover image. Try again.');
    }
  }, []);

  const handleSave = useCallback(async () => {
    if (!title.trim()) { Alert.alert('Missing title', 'Give your highlight a title.'); return; }
    if (selectedIds.length === 0) { Alert.alert('No stories', 'Select at least one story.'); return; }
    if (!derivedRange) { Alert.alert('Error', 'Could not determine date range from selections.'); return; }

    setSaving(true);
    try {
      const fallbackCover = coverOverride
        ?? stories.find((s) => selectedIds[0] === s.id)?.photo_url
        ?? null;

      await createHighlight({
        title: title.trim(),
        start_date: derivedRange.startIso,
        end_date: derivedRange.endIso,
        story_ids: selectedIds,
        cover_photo_url: fallbackCover,
        featured_stat: featuredStat,
      });
      router.back();
    } catch {
      Alert.alert('Error', 'Could not create highlight. Try again.');
      setSaving(false);
    }
  }, [title, selectedIds, derivedRange, coverOverride, stories, featuredStat]);

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
            New Highlight
          </Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: SP[5], paddingBottom: SP[10] }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Title */}
          <Text style={styles.sectionLabel}>TITLE</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            maxLength={30}
            placeholder="e.g. Spring training block"
            placeholderTextColor={T.text.muted}
            style={styles.titleInput}
          />
          <Text style={{
            fontFamily: TY.sans.regular,
            fontSize: TY.size.small,
            color: T.text.muted,
            textAlign: 'right',
            marginTop: 4,
          }}>
            {title.length}/30
          </Text>

          {/* Stories */}
          <Text style={[styles.sectionLabel, { marginTop: SP[5] }]}>
            STORIES {selectedIds.length > 0 ? `· ${selectedIds.length} selected` : ''}
          </Text>
          {derivedRange ? (
            <Text style={{
              fontFamily: TY.sans.regular,
              fontSize: TY.size.small + 1,
              color: T.text.secondary,
              marginBottom: SP[3],
            }}>
              {derivedRange.startIso === derivedRange.endIso
                ? formatDateShort(derivedRange.startIso)
                : `${formatDateShort(derivedRange.startIso)} → ${formatDateShort(derivedRange.endIso)}`}
              {' · stats computed over this range'}
            </Text>
          ) : (
            <Text style={{
              fontFamily: TY.sans.regular,
              fontSize: TY.size.small + 1,
              color: T.text.secondary,
              marginBottom: SP[3],
            }}>
              Tap to select. The date range is set automatically from your picks.
            </Text>
          )}

          {loadingStories ? (
            <ActivityIndicator color={T.text.muted} style={{ marginVertical: SP[5] }} />
          ) : stories.length === 0 ? (
            <Text style={styles.emptyHint}>
              You don't have any stories yet. Post a story first, then come back here.
            </Text>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP }}>
              {stories.map((story) => {
                const isSelected = !!selected[story.id];
                return (
                  <TouchableOpacity
                    key={story.id}
                    onPress={() => setSelected((p) => ({ ...p, [story.id]: !isSelected }))}
                    activeOpacity={0.85}
                    style={{
                      width: GRID_CELL,
                      height: GRID_CELL * 1.35,
                      borderRadius: R.sm,
                      overflow: 'hidden',
                      borderWidth: isSelected ? 2 : 1,
                      borderColor: isSelected ? T.accent : T.border,
                    }}
                  >
                    <Image
                      source={{ uri: story.photo_url }}
                      style={{ width: '100%', height: '100%' }}
                      resizeMode="cover"
                    />
                    {isSelected ? (
                      <View style={{
                        position: 'absolute', top: 6, right: 6,
                        width: 22, height: 22, borderRadius: 11,
                        backgroundColor: T.accent,
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Ionicons name="checkmark" size={14} color={T.accentInk} />
                      </View>
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Cover */}
          <Text style={[styles.sectionLabel, { marginTop: SP[5] }]}>COVER PHOTO</Text>
          <View style={{ flexDirection: 'row', gap: SP[3], alignItems: 'center' }}>
            <View style={{
              width: 80, height: 100, borderRadius: R.sm,
              backgroundColor: T.bg.elevated,
              borderWidth: 1, borderColor: T.border,
              overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
            }}>
              {coverOverride ? (
                <Image source={{ uri: coverOverride }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
              ) : (() => {
                const first = stories.find((s) => selectedIds[0] === s.id);
                return first ? (
                  <Image source={{ uri: first.photo_url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                ) : (
                  <Ionicons name="image-outline" size={24} color={T.text.muted} />
                );
              })()}
            </View>
            <View style={{ flex: 1, gap: SP[2] }}>
              <Text style={{ fontFamily: TY.sans.regular, fontSize: TY.size.small + 1, color: T.text.body, lineHeight: 18 }}>
                Default: first selected story. Upload a custom cover below if you prefer.
              </Text>
              <TouchableOpacity
                onPress={pickCustomCover}
                style={{
                  alignSelf: 'flex-start',
                  borderWidth: 1, borderColor: T.border,
                  borderRadius: R.sm,
                  paddingHorizontal: SP[3], paddingVertical: SP[2],
                  flexDirection: 'row', alignItems: 'center', gap: SP[2],
                }}
                activeOpacity={0.75}
              >
                <Ionicons name="cloud-upload-outline" size={14} color={T.text.body} />
                <Text style={{ fontFamily: TY.sans.medium, fontSize: TY.size.small + 1, color: T.text.body }}>
                  {coverOverride ? 'Change cover' : 'Upload custom cover'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Featured stat */}
          <Text style={[styles.sectionLabel, { marginTop: SP[5] }]}>FEATURED STAT</Text>
          <Text style={{
            fontFamily: TY.sans.regular,
            fontSize: TY.size.small + 1,
            color: T.text.secondary,
            marginBottom: SP[3],
          }}>
            Shown as the lime pill on the highlight card.
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SP[2] }}>
            {STAT_OPTIONS.map((s) => {
              const active = featuredStat === s.key;
              return (
                <TouchableOpacity
                  key={s.key}
                  onPress={() => setFeaturedStat(s.key)}
                  activeOpacity={0.8}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: SP[2],
                    paddingHorizontal: SP[4] - 2,
                    paddingVertical: SP[2] + 2,
                    borderRadius: R.pill,
                    borderWidth: 1,
                    borderColor: active ? T.accent : T.border,
                    backgroundColor: active ? T.accent : 'transparent',
                  }}
                >
                  <Ionicons name={s.icon} size={14} color={active ? T.accentInk : T.text.body} />
                  <Text style={{
                    fontFamily: TY.sans.semibold,
                    fontSize: TY.size.small + 1,
                    color: active ? T.accentInk : T.text.body,
                  }}>
                    {s.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Save */}
          <TouchableOpacity
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
            style={{
              marginTop: SP[7],
              backgroundColor: T.accent,
              borderRadius: R.sm,
              paddingVertical: SP[4],
              alignItems: 'center',
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? (
              <ActivityIndicator color={T.accentInk} />
            ) : (
              <Text style={{
                fontFamily: TY.sans.bold,
                fontSize: TY.size.body + 2,
                color: T.accentInk,
                letterSpacing: TY.tracking.tight,
              }}>
                Save highlight
              </Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = {
  sectionLabel: {
    fontFamily: TY.mono.semibold,
    fontSize: TY.size.micro,
    color: T.text.muted,
    textTransform: 'uppercase' as const,
    letterSpacing: TY.tracking.label,
    marginBottom: SP[2],
  },
  titleInput: {
    fontFamily: TY.sans.regular,
    backgroundColor: T.bg.elevated,
    borderRadius: R.sm,
    borderWidth: 1,
    borderColor: T.border,
    paddingHorizontal: SP[3],
    paddingVertical: SP[3],
    fontSize: TY.size.body + 2,
    color: T.text.primary,
  },
  emptyHint: {
    fontFamily: TY.sans.regular,
    fontSize: TY.size.body,
    color: T.text.muted,
    paddingVertical: SP[5],
    textAlign: 'center' as const,
  },
};
