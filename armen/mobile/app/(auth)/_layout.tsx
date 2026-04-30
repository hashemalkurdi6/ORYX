import { Stack } from 'expo-router';
import { theme } from '@/services/theme';

// Auth stack uses a soft fade between screens so the dusk canvas stays
// continuous — Vesper carries through; no flash to a darker tone. 220ms
// keeps it crisp without snapping.
export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.bg.primary },
        animation: 'fade',
        animationDuration: 220,
      }}
    />
  );
}
