// DMs stack — sits outside (tabs). Each screen renders its own header so
// this layout just wires the stack and hides the default header.

import { Stack } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';

export default function MessagesLayout() {
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
      <Stack.Screen name="new" />
      <Stack.Screen name="[id]" />
    </Stack>
  );
}
