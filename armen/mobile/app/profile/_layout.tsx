// Profile-related pushed screens (Find Friends, follower lists, highlights,
// customize) live under this stack so they slide in over the main tabs
// without disturbing the tab bar state.

import { Stack } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';

export default function ProfileLayout() {
  const { theme } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.bg.primary },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="find-friends" />
      <Stack.Screen name="customize" />
      <Stack.Screen name="highlights/create" />
      <Stack.Screen
        name="highlights/[id]"
        options={{ animation: 'fade', contentStyle: { backgroundColor: '#000' } }}
      />
    </Stack>
  );
}
