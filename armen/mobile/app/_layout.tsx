import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { router } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useAuthStore } from '@/services/authStore';

export default function RootLayout() {
  const token = useAuthStore((state) => state.token);

  useEffect(() => {
    if (token) {
      router.replace('/(tabs)/dashboard');
    } else {
      router.replace('/(auth)/login');
    }
  }, [token]);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#0A0A0F' },
          headerTintColor: '#FFFFFF',
          headerTitleStyle: { fontWeight: 'bold' },
          contentStyle: { backgroundColor: '#0A0A0F' },
          headerShown: false,
        }}
      />
    </SafeAreaProvider>
  );
}
