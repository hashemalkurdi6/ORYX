import { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/contexts/ThemeContext';
import { ThemeColors } from '@/services/theme';

export default function CommunityScreen() {
  const { theme } = useTheme();
  const s = useMemo(() => createStyles(theme), [theme]);

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.inner}>
        <Ionicons name="people" size={64} color={theme.border} />
        <Text style={s.title}>Community</Text>
        <Text style={s.subtitle}>
          Share your fitness story with friends. Coming soon.
        </Text>
        <View style={s.badge}>
          <Text style={s.badgeText}>PHASE 3</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

function createStyles(t: ThemeColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: t.bg.primary,
    },
    inner: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 40,
      gap: 12,
    },
    title: {
      fontSize: 24,
      fontWeight: '700',
      color: t.text.primary,
      marginTop: 8,
    },
    subtitle: {
      fontSize: 15,
      color: t.text.secondary,
      textAlign: 'center',
      lineHeight: 22,
    },
    badge: {
      backgroundColor: t.bg.elevated,
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 5,
      marginTop: 4,
    },
    badgeText: {
      fontSize: 11,
      fontWeight: '600',
      color: t.text.muted,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
    },
  });
}
