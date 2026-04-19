// New Message screen — pick a recipient, auto-starts the conversation and
// routes to the conversation screen.

import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import AmbientBackdrop from '@/components/AmbientBackdrop';
import { getDmCandidates, startConversation, DmCandidate } from '@/services/api';

export default function NewMessageScreen() {
  const { theme, type, radius } = useTheme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DmCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState<string | null>(null);

  const load = useCallback(async (q?: string) => {
    setLoading(true);
    try {
      const users = await getDmCandidates(q || undefined);
      setResults(users);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => load(query), 220);
    return () => clearTimeout(t);
  }, [query, load]);

  const handleSelect = async (u: DmCandidate) => {
    if (selecting) return;
    setSelecting(u.id);
    try {
      const conv = await startConversation({ recipient_id: u.id });
      router.replace(`/messages/${conv.id}`);
    } catch {
      setSelecting(null);
    }
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
            New Message
          </Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Search */}
        <View style={{ paddingHorizontal: 20, paddingBottom: 16 }}>
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
                fontSize: 14, fontFamily: type.sans.regular, padding: 0,
              }}
              placeholder="Search people…"
              placeholderTextColor={theme.text.muted}
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        </View>

        {loading ? (
          <View style={{ paddingTop: 40, alignItems: 'center' }}>
            <ActivityIndicator color={theme.text.muted} />
          </View>
        ) : results.length === 0 ? (
          <View style={{ paddingTop: 60, alignItems: 'center', paddingHorizontal: 24, gap: 6 }}>
            <Ionicons name="people-outline" size={30} color={theme.text.muted} />
            <Text style={{
              color: theme.text.body, fontSize: 14,
              fontFamily: type.sans.medium, textAlign: 'center', marginTop: 4,
            }}>
              No people found
            </Text>
            <Text style={{
              color: theme.text.muted, fontSize: 12,
              fontFamily: type.sans.regular, textAlign: 'center',
            }}>
              Follow athletes to start a conversation.
            </Text>
          </View>
        ) : (
          <FlatList
            data={results}
            keyExtractor={(u) => u.id}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => handleSelect(item)}
                activeOpacity={0.8}
                disabled={selecting === item.id}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 12,
                  paddingVertical: 12,
                  borderBottomWidth: 1, borderBottomColor: theme.glass.border,
                  opacity: selecting === item.id ? 0.5 : 1,
                }}
              >
                <View style={{
                  width: 44, height: 44, borderRadius: 22,
                  backgroundColor: theme.glass.cardHi,
                  borderWidth: 1, borderColor: theme.glass.border,
                  alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                }}>
                  {item.avatar_url ? (
                    <Image source={{ uri: item.avatar_url }} style={{ width: 44, height: 44, borderRadius: 22 }} />
                  ) : (
                    <Text style={{ fontSize: 14, color: theme.text.primary, fontFamily: type.sans.semibold }}>
                      {item.initials}
                    </Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{
                    fontSize: 15, color: theme.text.primary,
                    fontFamily: type.sans.semibold, letterSpacing: -0.2,
                  }}>
                    {item.display_name}
                  </Text>
                  {item.username ? (
                    <Text style={{
                      fontSize: 12, color: theme.text.muted, marginTop: 1,
                      fontFamily: type.mono.regular, letterSpacing: 0.3,
                    }}>
                      @{item.username}
                    </Text>
                  ) : null}
                </View>
                {selecting === item.id ? (
                  <ActivityIndicator size="small" color={theme.text.muted} />
                ) : (
                  <Ionicons name="chevron-forward" size={16} color={theme.text.muted} />
                )}
              </TouchableOpacity>
            )}
          />
        )}
      </SafeAreaView>
    </View>
  );
}
