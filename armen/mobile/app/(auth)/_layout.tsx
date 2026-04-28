import { Stack } from 'expo-router';
import { theme } from '@/services/theme';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.bg.primary },
        animation: 'fade',
      }}
    />
  );
}
