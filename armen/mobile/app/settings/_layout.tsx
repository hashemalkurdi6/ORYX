// Settings stack — landing screen + per-section pushed sub-screens
// (Notifications, Privacy, Appearance, About, Help). Each sub-screen
// renders its own header so this layout just wires the navigation.

import { Stack } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';

export default function SettingsLayout() {
  const { theme } = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.bg.primary },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="privacy" />
      <Stack.Screen name="appearance" />
      <Stack.Screen name="about" />
      <Stack.Screen name="help" />
    </Stack>
  );
}
