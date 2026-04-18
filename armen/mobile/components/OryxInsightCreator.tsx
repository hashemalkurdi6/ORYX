import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Switch,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  getInsightData,
  createPost,
  getMyClubs,
  InsightData,
  CommunityClub,
} from '@/services/api';

// Try expo-location with graceful fallback
let Location: any = null;
try {
  Location = require('expo-location');
} catch {
  Location = null;
}

type InsightType = 'workout' | 'daily_insight' | 'weekly_recap' | 'nutrition' | 'text';
type Step = 'type-select' | 'session-select' | 'compose';

interface SessionItem {
  id: string;
  activity_type: string;
  sport_category: string | null;
  duration_minutes: number;
  training_load: number | null;
  rpe: number | null;
  logged_at: string;
  source: string;
  autopsy_text?: string | null;
}

export interface OryxInsightCreatorProps {
  visible: boolean;
  onClose: () => void;
  onBack: () => void;
  onPostCreated: () => void;
  initialSessionId?: string;
  initialSessionSource?: 'manual' | 'strava' | 'hevy';
  initialSessionData?: any;
}

const CATEGORY_ICONS: Record<string, string> = {
  strength: 'barbell-outline',
  cardio: 'bicycle-outline',
  sport: 'football-outline',
  yoga: 'leaf-outline',
  swimming: 'water-outline',
  cycling: 'bicycle-outline',
  running: 'walk-outline',
  other: 'fitness-outline',
};

function formatDuration(minutes: number): string {
  if (!minutes) return '0m';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const BG_STYLES: { key: string; color: string; label: string }[] = [
  { key: 'dark_solid', color: '#0a0a0a', label: 'Dark' },
  { key: 'warm_dark', color: '#111009', label: 'Warm' },
  { key: 'mountain', color: '#1a2030', label: 'Mtn' },
  { key: 'forest', color: '#0d1a0d', label: 'Forest' },
  { key: 'ocean', color: '#0d1020', label: 'Ocean' },
  { key: 'cosmos', color: '#0a0a1a', label: 'Cosmos' },
];

interface ToastState {
  visible: boolean;
  message: string;
  color: string;
}

export default function OryxInsightCreator({
  visible,
  onClose,
  onBack,
  onPostCreated,
  initialSessionId,
  initialSessionSource,
  initialSessionData,
}: OryxInsightCreatorProps) {
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState<Step>('type-select');
  const [insightData, setInsightData] = useState<InsightData | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);

  // Session select state
  const [insightType, setInsightType] = useState<InsightType>('workout');
  const [selectedSession, setSelectedSession] = useState<SessionItem | null>(null);

  // Compose state
  const [customTitle, setCustomTitle] = useState('');
  const [caption, setCaption] = useState('');
  const [locationText, setLocationText] = useState('');
  const [showLocationInput, setShowLocationInput] = useState(false);
  const [locationInputValue, setLocationInputValue] = useState('');
  const [alsoStory, setAlsoStory] = useState(false);
  const [selectedClub, setSelectedClub] = useState<CommunityClub | null>(null);
  const [clubs, setClubs] = useState<CommunityClub[]>([]);
  const [showClubSheet, setShowClubSheet] = useState(false);
  const [bgStyle, setBgStyle] = useState('dark_solid');
  const [textContent, setTextContent] = useState('');
  const [posting, setPosting] = useState(false);

  // Privacy toggles
  const [privacyToggles, setPrivacyToggles] = useState<Record<string, boolean>>({
    show_training_load: true,
    show_rpe: true,
    show_autopsy: true,
    show_readiness_score: true,
    show_diagnosis: true,
    show_factors: true,
    show_recommendation: true,
    show_sessions: true,
    show_total_load: true,
    show_avg_readiness: true,
    show_calories_hit: true,
    show_summary: true,
    show_calories: true,
    show_protein: true,
    show_carbs: true,
    show_fat: true,
  });

  const [toast, setToast] = useState<ToastState>({ visible: false, message: '', color: '#27ae60' });
  const toastRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, color = '#27ae60') => {
    if (toastRef.current) clearTimeout(toastRef.current);
    setToast({ visible: true, message, color });
    toastRef.current = setTimeout(() => setToast(t => ({ ...t, visible: false })), 2000);
  }, []);

  const togglePrivacy = useCallback((key: string) => {
    setPrivacyToggles(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // Load insight data on open
  useEffect(() => {
    if (!visible) return;
    setInsightLoading(true);
    getInsightData().then(d => {
      setInsightData(d);
    }).catch(() => {
      setInsightData(null);
    }).finally(() => setInsightLoading(false));

    getMyClubs().then(r => setClubs(r.clubs)).catch(() => {});
  }, [visible]);

  // If initialSessionId provided, jump straight to compose
  useEffect(() => {
    if (!visible) return;
    if (initialSessionId) {
      setInsightType('workout');
      setStep('compose');
      // Pre-select from insightData if it loads
    } else {
      setStep('type-select');
    }
  }, [visible, initialSessionId]);

  // When insightData loads and we have an initialSessionId, try to find the matching session
  useEffect(() => {
    if (!insightData || !initialSessionId) return;
    const found = insightData.recent_sessions.find(s => s.id === initialSessionId);
    if (found) setSelectedSession(found as SessionItem);
    else if (insightData.last_session?.id === initialSessionId) {
      setSelectedSession(insightData.last_session as SessionItem);
    }
  }, [insightData, initialSessionId]);

  const handleShare = useCallback(async () => {
    if (!insightData) return;
    setPosting(true);
    try {
      const cardData = buildCardData();
      await createPost({
        oryx_data_card_json: cardData,
        caption: caption.trim() || undefined,
        insight_type: insightType,
        session_id: selectedSession?.id,
        custom_title: customTitle.trim() || undefined,
        location_text: locationText || undefined,
        privacy_settings: privacyToggles,
        background_style: bgStyle,
        also_shared_as_story: alsoStory,
        club_id: selectedClub?.id,
      });
      showToast('Posted', '#27ae60');
      setTimeout(() => onPostCreated(), 1500);
    } catch {
      showToast('Failed to post. Try again.', '#c0392b');
      setPosting(false);
    }
  }, [insightData, insightType, selectedSession, customTitle, caption, locationText, privacyToggles, bgStyle, alsoStory, selectedClub, onPostCreated, showToast]);

  const buildCardData = useCallback(() => {
    if (!insightData) return {};
    const base: any = {
      post_type: insightType === 'daily_insight' ? 'insight' : insightType === 'weekly_recap' ? 'recap' : insightType,
    };
    if (insightType === 'workout' && selectedSession) {
      base.session_name = selectedSession.activity_type;
      base.duration_minutes = selectedSession.duration_minutes;
      if (privacyToggles.show_training_load) base.training_load = selectedSession.training_load;
      if (privacyToggles.show_rpe) base.rpe = selectedSession.rpe;
      if (privacyToggles.show_autopsy) base.autopsy_snippet = selectedSession.autopsy_text;
      base.sport_category = selectedSession.sport_category;
      base.custom_title = customTitle || undefined;
    } else if (insightType === 'daily_insight') {
      if (privacyToggles.show_readiness_score) base.readiness_score = insightData.current_readiness.score;
      base.readiness_label = insightData.current_readiness.label;
      base.readiness_color = insightData.current_readiness.color;
      if (privacyToggles.show_diagnosis) base.diagnosis_text = insightData.today_diagnosis.diagnosis_text;
      if (privacyToggles.show_factors) base.factors = insightData.today_diagnosis.contributing_factors;
      if (privacyToggles.show_recommendation) base.recommendation = insightData.today_diagnosis.recommendation;
      base.custom_title = customTitle || undefined;
    } else if (insightType === 'weekly_recap') {
      if (privacyToggles.show_sessions) base.sessions = insightData.weekly_recap.sessions;
      if (privacyToggles.show_total_load) base.total_load = insightData.weekly_recap.total_load;
      if (privacyToggles.show_avg_readiness) base.avg_readiness = insightData.weekly_recap.avg_readiness;
      if (privacyToggles.show_calories_hit) base.calories_hit_days = insightData.weekly_recap.calories_hit_days;
      base.custom_title = customTitle || undefined;
    } else if (insightType === 'nutrition') {
      if (privacyToggles.show_calories) {
        base.calories_consumed = insightData.today_nutrition.calories_consumed;
        base.calories_target = insightData.today_nutrition.calories_target;
      }
      if (privacyToggles.show_protein) base.protein_g = insightData.today_nutrition.protein_consumed_g;
      if (privacyToggles.show_carbs) base.carbs_g = insightData.today_nutrition.carbs_consumed_g;
      if (privacyToggles.show_fat) base.fat_g = insightData.today_nutrition.fat_consumed_g;
      base.custom_title = customTitle || undefined;
    } else if (insightType === 'text') {
      base.post_type = 'generic';
      base.body = textContent;
      base.background_style = bgStyle;
    }
    return base;
  }, [insightData, insightType, selectedSession, customTitle, privacyToggles, textContent, bgStyle]);

  const handleLocationTap = useCallback(async () => {
    if (locationText) {
      setLocationText('');
      return;
    }
    Alert.alert('Add Location', undefined, [
      {
        text: 'Use Current Location',
        onPress: async () => {
          if (!Location) {
            showToast('Location not available', '#c0392b');
            return;
          }
          try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
              showToast('Location permission denied', '#c0392b');
              return;
            }
            const loc = await Location.getCurrentPositionAsync({});
            const [geo] = await Location.reverseGeocodeAsync({
              latitude: loc.coords.latitude,
              longitude: loc.coords.longitude,
            });
            const cityCountry = [geo?.city, geo?.country].filter(Boolean).join(', ');
            setLocationText(cityCountry || 'Unknown location');
          } catch {
            showToast('Could not get location', '#c0392b');
          }
        },
      },
      {
        text: 'Type Manually',
        onPress: () => setShowLocationInput(true),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [locationText, showToast]);

  if (!visible) return null;

  // ── Step: Type Select ──────────────────────────────────────────────────────────

  const renderTypeSelect = () => {
    if (insightLoading) {
      return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color="#555555" size="large" />
        </View>
      );
    }

    const hasRecentSessions = (insightData?.recent_sessions?.length ?? 0) > 0;
    const hasNutrition = insightData?.today_nutrition?.calories_consumed != null;

    const tiles: {
      key: InsightType;
      label: string;
      icon: string;
      subtitle: string;
      disabled: boolean;
      disabledSubtitle?: string;
    }[] = [
      {
        key: 'workout',
        label: 'Workout Card',
        icon: 'flash-outline',
        subtitle: 'Share a session with stats and AI autopsy',
        disabled: !hasRecentSessions,
        disabledSubtitle: 'Log a session first',
      },
      {
        key: 'daily_insight',
        label: 'Daily Insight',
        icon: 'sparkles-outline',
        subtitle: "Share today's AI diagnosis and readiness",
        disabled: false,
      },
      {
        key: 'weekly_recap',
        label: 'Weekly Recap',
        icon: 'calendar-outline',
        subtitle: 'Share your week in training and nutrition',
        disabled: false,
      },
      {
        key: 'nutrition',
        label: 'Nutrition Card',
        icon: 'nutrition-outline',
        subtitle: "Share today's calories and macros",
        disabled: !hasNutrition,
        disabledSubtitle: 'Log a meal first',
      },
      {
        key: 'text',
        label: 'Text Card',
        icon: 'text-outline',
        subtitle: 'Share a thought or reflection',
        disabled: false,
      },
    ];

    return (
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        <Text
          style={{
            color: '#ffffff',
            fontSize: 18,
            fontWeight: '700',
            paddingTop: 16,
            paddingHorizontal: 20,
            marginBottom: 16,
          }}
        >
          What do you want to share?
        </Text>

        {tiles.map(tile => (
          <TouchableOpacity
            key={tile.key}
            onPress={() => {
              if (tile.disabled) return;
              if (tile.key === 'workout') {
                setInsightType('workout');
                setStep('session-select');
              } else {
                setInsightType(tile.key);
                setStep('compose');
              }
            }}
            disabled={tile.disabled}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              backgroundColor: '#1a1a1a',
              borderWidth: 1,
              borderColor: '#2a2a2a',
              borderRadius: 12,
              padding: 16,
              marginHorizontal: 16,
              marginBottom: 8,
              opacity: tile.disabled ? 0.4 : 1,
            }}
          >
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: '#2a2a2a',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name={tile.icon as any} size={20} color="#f0f0f0" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: '600', color: '#ffffff' }}>{tile.label}</Text>
              <Text style={{ fontSize: 12, color: '#888888', marginTop: 2 }}>
                {tile.disabled && tile.disabledSubtitle ? tile.disabledSubtitle : tile.subtitle}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#555555" />
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  };

  // ── Step: Session Select ───────────────────────────────────────────────────────

  const renderSessionSelect = () => {
    const sessions = insightData?.recent_sessions ?? [];

    return (
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: 16,
            fontWeight: '700',
            color: '#ffffff',
            paddingHorizontal: 20,
            paddingTop: 16,
            paddingBottom: 12,
          }}
        >
          Which session?
        </Text>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 8 }}>
          {sessions.map(session => {
            const isSelected = selectedSession?.id === session.id;
            const icon = CATEGORY_ICONS[session.sport_category ?? 'other'] ?? 'fitness-outline';
            return (
              <TouchableOpacity
                key={session.id}
                onPress={() => setSelectedSession(session as SessionItem)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  backgroundColor: isSelected ? '#1f1f1f' : '#1a1a1a',
                  borderRadius: 12,
                  padding: 14,
                  marginHorizontal: 16,
                  marginBottom: 8,
                  borderWidth: isSelected ? 1 : 1,
                  borderColor: isSelected ? '#ffffff' : '#2a2a2a',
                }}
              >
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: '#2a2a2a',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name={icon as any} size={20} color="#f0f0f0" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: '600', color: '#ffffff' }}>
                    {session.activity_type}
                  </Text>
                  <Text style={{ fontSize: 12, color: '#888888', marginTop: 2 }}>
                    {fmtDate(session.logged_at)} · {formatDuration(session.duration_minutes)}
                  </Text>
                </View>
                <View
                  style={{
                    backgroundColor: '#2a2a2a',
                    borderRadius: 6,
                    paddingHorizontal: 7,
                    paddingVertical: 2,
                    marginRight: 8,
                  }}
                >
                  <Text style={{ fontSize: 10, color: '#888888' }}>{session.source}</Text>
                </View>
                <View
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 9,
                    borderWidth: 2,
                    borderColor: isSelected ? '#ffffff' : '#555555',
                    backgroundColor: isSelected ? '#ffffff' : 'transparent',
                  }}
                />
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 20, paddingTop: 8 }}>
          <TouchableOpacity
            onPress={() => {
              if (selectedSession) setStep('compose');
            }}
            disabled={!selectedSession}
            style={{
              backgroundColor: '#ffffff',
              borderRadius: 16,
              height: 52,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: selectedSession ? 1 : 0.4,
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#000000' }}>Continue</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // ── Step: Compose ──────────────────────────────────────────────────────────────

  const renderCardPreview = () => {
    const bgColor = BG_STYLES.find(b => b.key === bgStyle)?.color ?? '#0a0a0a';

    if (insightType === 'text') {
      return (
        <View
          style={{
            backgroundColor: bgColor,
            borderRadius: 16,
            padding: 24,
            minHeight: 120,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1,
            borderColor: '#2a2a2a',
          }}
        >
          <Text
            style={{ fontSize: 18, color: '#ffffff', textAlign: 'center', lineHeight: 26 }}
          >
            {textContent || 'Write something...'}
          </Text>
        </View>
      );
    }

    if (insightType === 'workout' && selectedSession) {
      return (
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 9, color: '#888888', letterSpacing: 2, textTransform: 'uppercase' }}>
            {customTitle || 'WORKOUT'}
          </Text>
          {locationText ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="location-outline" size={11} color="#888888" />
              <Text style={{ fontSize: 11, color: '#888888' }}>{locationText}</Text>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <Ionicons
              name={(CATEGORY_ICONS[selectedSession.sport_category ?? 'other'] ?? 'fitness-outline') as any}
              size={18}
              color="#f0f0f0"
            />
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#f0f0f0' }}>
              {selectedSession.activity_type}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 2 }}>
            <View style={{ backgroundColor: '#2a2a2a', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Text style={{ fontSize: 12, color: '#f0f0f0' }}>{formatDuration(selectedSession.duration_minutes)}</Text>
            </View>
            {privacyToggles.show_training_load && selectedSession.training_load != null && (
              <View style={{ backgroundColor: '#2a2a2a', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                <Text style={{ fontSize: 12, color: '#f0f0f0' }}>Load {selectedSession.training_load}</Text>
              </View>
            )}
            {privacyToggles.show_rpe && selectedSession.rpe != null && (
              <View style={{ backgroundColor: '#2a2a2a', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                <Text style={{ fontSize: 12, color: '#f0f0f0' }}>RPE {selectedSession.rpe}/10</Text>
              </View>
            )}
          </View>
          {privacyToggles.show_autopsy && selectedSession.autopsy_text && (
            <Text style={{ fontSize: 13, color: '#888888', fontStyle: 'italic', lineHeight: 18 }} numberOfLines={3}>
              {selectedSession.autopsy_text}
            </Text>
          )}
        </View>
      );
    }

    if (insightType === 'daily_insight' && insightData) {
      const rd = insightData.current_readiness;
      const diag = insightData.today_diagnosis;
      return (
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 9, color: '#888888', letterSpacing: 2, textTransform: 'uppercase' }}>
            {customTitle || 'ORYX INSIGHT'}
          </Text>
          {locationText ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="location-outline" size={11} color="#888888" />
              <Text style={{ fontSize: 11, color: '#888888' }}>{locationText}</Text>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 }}>
            {privacyToggles.show_readiness_score && rd.score != null && (
              <View
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 24,
                  backgroundColor: rd.color + '33',
                  borderWidth: 2,
                  borderColor: rd.color,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ fontSize: 16, fontWeight: '700', color: rd.color }}>{rd.score}</Text>
              </View>
            )}
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#f0f0f0' }}>{rd.label}</Text>
          </View>
          {privacyToggles.show_diagnosis && diag.diagnosis_text && (
            <Text style={{ fontSize: 13, color: '#f0f0f0', lineHeight: 18 }} numberOfLines={3}>
              {diag.diagnosis_text}
            </Text>
          )}
          {privacyToggles.show_factors && diag.contributing_factors.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
              {diag.contributing_factors.slice(0, 3).map((f, i) => (
                <View key={i} style={{ backgroundColor: '#2a2a2a', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
                  <Text style={{ fontSize: 10, color: '#888888' }}>{f}</Text>
                </View>
              ))}
            </View>
          )}
          {privacyToggles.show_recommendation && diag.recommendation && (
            <Text style={{ fontSize: 12, color: '#888888', fontStyle: 'italic' }}>
              {diag.recommendation}
            </Text>
          )}
        </View>
      );
    }

    if (insightType === 'weekly_recap' && insightData) {
      const wr = insightData.weekly_recap;
      const statsItems = [
        { label: 'Sessions', value: String(wr.sessions), show: privacyToggles.show_sessions },
        { label: 'Total Load', value: String(wr.total_load), show: privacyToggles.show_total_load },
        { label: 'Avg Readiness', value: wr.avg_readiness != null ? String(Math.round(wr.avg_readiness)) : '—', show: privacyToggles.show_avg_readiness },
        { label: 'Cal Days', value: String(wr.calories_hit_days), show: privacyToggles.show_calories_hit },
      ].filter(s => s.show);
      return (
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 9, color: '#888888', letterSpacing: 2, textTransform: 'uppercase' }}>
            {customTitle || 'WEEK RECAP'}
          </Text>
          {locationText ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="location-outline" size={11} color="#888888" />
              <Text style={{ fontSize: 11, color: '#888888' }}>{locationText}</Text>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
            {statsItems.map((s, i) => (
              <View key={i} style={{ backgroundColor: '#222222', borderRadius: 10, padding: 10, flex: 1, minWidth: 70 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#f0f0f0' }}>{s.value}</Text>
                <Text style={{ fontSize: 10, color: '#555555', marginTop: 2 }}>{s.label}</Text>
              </View>
            ))}
          </View>
        </View>
      );
    }

    if (insightType === 'nutrition' && insightData) {
      const nt = insightData.today_nutrition;
      const calProgress = nt.calories_target ? Math.min(1, (nt.calories_consumed ?? 0) / nt.calories_target) : 0;
      return (
        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 9, color: '#888888', letterSpacing: 2, textTransform: 'uppercase' }}>
            {customTitle || 'NUTRITION'}
          </Text>
          {locationText ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="location-outline" size={11} color="#888888" />
              <Text style={{ fontSize: 11, color: '#888888' }}>{locationText}</Text>
            </View>
          ) : null}
          {privacyToggles.show_calories && nt.calories_consumed != null && (
            <View style={{ marginTop: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={{ fontSize: 13, color: '#f0f0f0' }}>Calories</Text>
                <Text style={{ fontSize: 13, color: '#888888' }}>
                  {nt.calories_consumed} / {nt.calories_target ?? '—'}
                </Text>
              </View>
              <View style={{ height: 6, backgroundColor: '#2a2a2a', borderRadius: 3, overflow: 'hidden' }}>
                <View style={{ width: `${calProgress * 100}%`, height: 6, backgroundColor: '#f0f0f0', borderRadius: 3 }} />
              </View>
            </View>
          )}
          {[
            { key: 'show_protein', label: 'Protein', value: nt.protein_consumed_g, unit: 'g', color: '#e74c3c' },
            { key: 'show_carbs', label: 'Carbs', value: nt.carbs_consumed_g, unit: 'g', color: '#f39c12' },
            { key: 'show_fat', label: 'Fat', value: nt.fat_consumed_g, unit: 'g', color: '#3498db' },
          ].filter(m => privacyToggles[m.key] && m.value != null).map((macro, i) => (
            <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: macro.color }} />
                <Text style={{ fontSize: 13, color: '#888888' }}>{macro.label}</Text>
              </View>
              <Text style={{ fontSize: 13, color: '#f0f0f0', fontWeight: '600' }}>{macro.value}{macro.unit}</Text>
            </View>
          ))}
        </View>
      );
    }

    return (
      <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 20 }}>
        <Ionicons name="stats-chart-outline" size={32} color="#555555" />
        <Text style={{ color: '#555555', marginTop: 8, fontSize: 13 }}>Select a session to preview</Text>
      </View>
    );
  };

  const renderPrivacyToggles = () => {
    const toggleDefs: Record<InsightType, { key: string; label: string }[]> = {
      workout: [
        { key: 'show_training_load', label: 'Show Training Load' },
        { key: 'show_rpe', label: 'Show RPE' },
        { key: 'show_autopsy', label: 'Show AI Autopsy' },
      ],
      daily_insight: [
        { key: 'show_readiness_score', label: 'Show Readiness Score' },
        { key: 'show_diagnosis', label: 'Show Diagnosis Text' },
        { key: 'show_factors', label: 'Show Contributing Factors' },
        { key: 'show_recommendation', label: 'Show Recommendation' },
      ],
      weekly_recap: [
        { key: 'show_sessions', label: 'Show Sessions' },
        { key: 'show_total_load', label: 'Show Training Load' },
        { key: 'show_avg_readiness', label: 'Show Avg Readiness' },
        { key: 'show_calories_hit', label: 'Show Calories Hit' },
        { key: 'show_summary', label: 'Show AI Summary' },
      ],
      nutrition: [
        { key: 'show_calories', label: 'Show Calories' },
        { key: 'show_protein', label: 'Show Protein' },
        { key: 'show_carbs', label: 'Show Carbs' },
        { key: 'show_fat', label: 'Show Fat' },
      ],
      text: [],
    };

    const defs = toggleDefs[insightType];
    if (!defs || defs.length === 0) return null;

    return (
      <View style={{ marginBottom: 16 }}>
        <Text style={{ fontSize: 10, color: '#555555', letterSpacing: 1, textTransform: 'uppercase', marginHorizontal: 16, marginBottom: 8, fontWeight: '700' }}>
          PRIVACY
        </Text>
        <View style={{ marginHorizontal: 16, gap: 4 }}>
          {defs.map(t => (
            <View
              key={t.key}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 12,
                backgroundColor: '#1a1a1a',
                borderRadius: 8,
              }}
            >
              <Text style={{ fontSize: 14, color: '#f0f0f0' }}>{t.label}</Text>
              <Switch
                value={privacyToggles[t.key] ?? true}
                onValueChange={() => togglePrivacy(t.key)}
                trackColor={{ false: '#2a2a2a', true: '#555555' }}
                thumbColor={privacyToggles[t.key] ? '#f0f0f0' : '#888888'}
              />
            </View>
          ))}
        </View>
      </View>
    );
  };

  const renderCompose = () => {
    const captionLen = caption.length;
    const captionColor = captionLen >= 2200 ? '#c0392b' : captionLen >= 2000 ? '#e67e22' : '#888888';
    const titleLen = customTitle.length;
    const selectedClubObj = selectedClub;

    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}>

          {/* Text card: background style selector */}
          {insightType === 'text' && (
            <View style={{ paddingHorizontal: 16, paddingTop: 16, marginBottom: 12 }}>
              <Text style={{ fontSize: 10, color: '#555555', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8, fontWeight: '700' }}>
                BACKGROUND
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {BG_STYLES.map(bg => (
                  <TouchableOpacity
                    key={bg.key}
                    onPress={() => setBgStyle(bg.key)}
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 6,
                      backgroundColor: bg.color,
                      borderWidth: bgStyle === bg.key ? 2 : 1,
                      borderColor: bgStyle === bg.key ? '#ffffff' : '#2a2a2a',
                    }}
                  />
                ))}
              </View>
            </View>
          )}

          {/* Card Preview */}
          <View
            style={{
              backgroundColor: '#1a1a1a',
              borderRadius: 16,
              marginHorizontal: 16,
              padding: 16,
              marginBottom: 16,
              borderWidth: 1,
              borderColor: '#2a2a2a',
              marginTop: insightType !== 'text' ? 16 : 0,
            }}
          >
            {renderCardPreview()}
          </View>

          {/* Text card content input */}
          {insightType === 'text' && (
            <View style={{ marginHorizontal: 16, marginBottom: 16 }}>
              <TextInput
                style={{
                  backgroundColor: '#1a1a1a',
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: '#2a2a2a',
                  padding: 14,
                  color: '#ffffff',
                  fontSize: 16,
                  textAlign: 'center',
                  minHeight: 80,
                }}
                placeholder="Write something..."
                placeholderTextColor="#555555"
                value={textContent}
                onChangeText={setTextContent}
                multiline
                maxLength={200}
              />
              <Text style={{ fontSize: 11, color: '#888888', textAlign: 'right', marginTop: 4 }}>
                {textContent.length}/200
              </Text>
            </View>
          )}

          {/* Title (not for text cards) */}
          {insightType !== 'text' && (
            <View style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 10, color: '#555555', letterSpacing: 1, textTransform: 'uppercase', marginHorizontal: 16, marginBottom: 8, fontWeight: '700' }}>
                TITLE
              </Text>
              <View style={{ marginHorizontal: 16 }}>
                <TextInput
                  style={{
                    backgroundColor: '#1a1a1a',
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: '#2a2a2a',
                    padding: 12,
                    color: '#f0f0f0',
                    fontSize: 14,
                  }}
                  placeholder="Morning grind"
                  placeholderTextColor="#555555"
                  value={customTitle}
                  onChangeText={setCustomTitle}
                  maxLength={40}
                />
                {titleLen > 0 && (
                  <Text style={{ fontSize: 11, color: '#888888', textAlign: 'right', marginTop: 4 }}>
                    {titleLen}/40
                  </Text>
                )}
              </View>
            </View>
          )}

          {/* Caption */}
          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 10, color: '#555555', letterSpacing: 1, textTransform: 'uppercase', marginHorizontal: 16, marginBottom: 8, fontWeight: '700' }}>
              CAPTION
            </Text>
            <View style={{ marginHorizontal: 16 }}>
              <TextInput
                style={{
                  backgroundColor: '#1a1a1a',
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: '#2a2a2a',
                  padding: 12,
                  color: '#f0f0f0',
                  fontSize: 14,
                  height: 80,
                  textAlignVertical: 'top',
                }}
                placeholder="Add a caption..."
                placeholderTextColor="#555555"
                value={caption}
                onChangeText={setCaption}
                multiline
                maxLength={2200}
              />
              <Text style={{ fontSize: 11, color: captionColor, textAlign: 'right', marginTop: 4 }}>
                {captionLen}/2200
              </Text>
            </View>
          </View>

          {/* Location */}
          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 10, color: '#555555', letterSpacing: 1, textTransform: 'uppercase', marginHorizontal: 16, marginBottom: 8, fontWeight: '700' }}>
              LOCATION
            </Text>
            {showLocationInput ? (
              <View style={{ marginHorizontal: 16, flexDirection: 'row', gap: 8 }}>
                <TextInput
                  style={{
                    flex: 1,
                    backgroundColor: '#1a1a1a',
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: '#2a2a2a',
                    padding: 12,
                    color: '#f0f0f0',
                    fontSize: 14,
                  }}
                  placeholder="City, Country"
                  placeholderTextColor="#555555"
                  value={locationInputValue}
                  onChangeText={setLocationInputValue}
                  autoFocus
                />
                <TouchableOpacity
                  onPress={() => {
                    setLocationText(locationInputValue.trim());
                    setShowLocationInput(false);
                    setLocationInputValue('');
                  }}
                  style={{
                    backgroundColor: '#ffffff',
                    borderRadius: 12,
                    paddingHorizontal: 14,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: '#000000', fontWeight: '600' }}>Set</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                onPress={handleLocationTap}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  marginHorizontal: 16,
                  backgroundColor: '#1a1a1a',
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: '#2a2a2a',
                  padding: 12,
                }}
              >
                <Ionicons name="location-outline" size={16} color={locationText ? '#f0f0f0' : '#555555'} />
                <Text style={{ flex: 1, fontSize: 14, color: locationText ? '#f0f0f0' : '#555555' }}>
                  {locationText || 'Add location'}
                </Text>
                {locationText && (
                  <TouchableOpacity onPress={() => setLocationText('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Ionicons name="close-circle" size={16} color="#555555" />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            )}
          </View>

          {/* Privacy Toggles (not for text) */}
          {insightType !== 'text' && renderPrivacyToggles()}

          {/* Share Options */}
          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 10, color: '#555555', letterSpacing: 1, textTransform: 'uppercase', marginHorizontal: 16, marginBottom: 8, fontWeight: '700' }}>
              SHARE OPTIONS
            </Text>
            <View style={{ marginHorizontal: 16, gap: 4 }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: 12,
                  backgroundColor: '#1a1a1a',
                  borderRadius: 8,
                }}
              >
                <Text style={{ fontSize: 14, color: '#f0f0f0' }}>Also share as Story</Text>
                <Switch
                  value={alsoStory}
                  onValueChange={setAlsoStory}
                  trackColor={{ false: '#2a2a2a', true: '#555555' }}
                  thumbColor={alsoStory ? '#f0f0f0' : '#888888'}
                />
              </View>

              <TouchableOpacity
                onPress={() => setShowClubSheet(true)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: 12,
                  backgroundColor: '#1a1a1a',
                  borderRadius: 8,
                }}
              >
                <View>
                  <Text style={{ fontSize: 14, color: '#f0f0f0' }}>Tag a Club</Text>
                  <Text style={{ fontSize: 12, color: '#555555', marginTop: 1 }}>
                    {selectedClub ? selectedClub.name : 'None selected'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#555555" />
              </TouchableOpacity>
            </View>
          </View>

        </ScrollView>

        {/* Share button */}
        <View
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            paddingHorizontal: 16,
            paddingBottom: insets.bottom + 24,
            paddingTop: 12,
            backgroundColor: '#0a0a0a',
            borderTopWidth: 1,
            borderTopColor: '#2a2a2a',
          }}
        >
          <TouchableOpacity
            onPress={handleShare}
            disabled={posting}
            style={{
              backgroundColor: '#ffffff',
              borderRadius: 16,
              height: 52,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: posting ? 0.6 : 1,
            }}
          >
            {posting ? (
              <ActivityIndicator color="#000000" />
            ) : (
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#000000' }}>Share</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  };

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#0a0a0a' }}>
        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingTop: insets.top + 8,
            paddingHorizontal: 16,
            paddingBottom: 12,
            borderBottomWidth: 1,
            borderBottomColor: '#2a2a2a',
          }}
        >
          <TouchableOpacity
            onPress={() => {
              if (step === 'compose') {
                if (insightType === 'workout' && !initialSessionId) {
                  setStep('session-select');
                } else if (initialSessionId) {
                  onClose();
                } else {
                  setStep('type-select');
                }
              } else if (step === 'session-select') {
                setStep('type-select');
              } else {
                onBack();
              }
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="arrow-back" size={24} color="#f0f0f0" />
          </TouchableOpacity>
          <Text style={{ flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: '#f0f0f0' }}>
            {step === 'type-select' ? 'ORYX Insight' : step === 'session-select' ? 'Select Session' : 'Compose'}
          </Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={22} color="#888888" />
          </TouchableOpacity>
        </View>

        {step === 'type-select' && renderTypeSelect()}
        {step === 'session-select' && renderSessionSelect()}
        {step === 'compose' && renderCompose()}

        {/* Toast */}
        {toast.visible && (
          <View
            style={{
              position: 'absolute',
              bottom: insets.bottom + 100,
              alignSelf: 'center',
              paddingHorizontal: 20,
              paddingVertical: 12,
              borderRadius: 24,
              backgroundColor: toast.color,
              zIndex: 999,
            }}
          >
            <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: '600' }}>{toast.message}</Text>
          </View>
        )}

        {/* Club Sheet */}
        <Modal
          visible={showClubSheet}
          transparent
          animationType="slide"
          onRequestClose={() => setShowClubSheet(false)}
        >
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}
            activeOpacity={1}
            onPress={() => setShowClubSheet(false)}
          >
            <TouchableOpacity activeOpacity={1} onPress={() => {}}>
              <View
                style={{
                  backgroundColor: '#1a1a1a',
                  borderTopLeftRadius: 20,
                  borderTopRightRadius: 20,
                  padding: 20,
                  gap: 4,
                  paddingBottom: insets.bottom + 16,
                }}
              >
                <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#2a2a2a', alignSelf: 'center', marginBottom: 16 }} />
                <Text style={{ fontSize: 15, fontWeight: '700', color: '#f0f0f0', marginBottom: 12 }}>Select Club</Text>
                <TouchableOpacity
                  onPress={() => { setSelectedClub(null); setShowClubSheet(false); }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingVertical: 12,
                    paddingHorizontal: 8,
                    borderRadius: 8,
                    backgroundColor: !selectedClub ? '#2a2a2a' : 'transparent',
                  }}
                >
                  <Text style={{ color: '#f0f0f0', fontSize: 14 }}>None</Text>
                  {!selectedClub && <Ionicons name="checkmark" size={18} color="#f0f0f0" />}
                </TouchableOpacity>
                {clubs.length === 0 ? (
                  <Text style={{ color: '#555555', fontSize: 13, paddingVertical: 8, paddingHorizontal: 8 }}>No clubs joined</Text>
                ) : (
                  clubs.map(c => (
                    <TouchableOpacity
                      key={c.id}
                      onPress={() => { setSelectedClub(c); setShowClubSheet(false); }}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingVertical: 12,
                        paddingHorizontal: 8,
                        borderRadius: 8,
                        backgroundColor: selectedClub?.id === c.id ? '#2a2a2a' : 'transparent',
                      }}
                    >
                      <Text style={{ color: '#f0f0f0', fontSize: 14 }}>{c.name}</Text>
                      {selectedClub?.id === c.id && <Ionicons name="checkmark" size={18} color="#f0f0f0" />}
                    </TouchableOpacity>
                  ))
                )}
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      </View>
    </Modal>
  );
}
