import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useAuthStore } from '@/services/authStore';

export default function Index() {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const hydrateToken = useAuthStore((state) => state.hydrateToken);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    hydrateToken().finally(() => setHydrated(true));
  }, [hydrateToken]);

  if (!hydrated) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (token) {
    if (!user?.onboarding_complete) {
      return <Redirect href="/(auth)/signup" />;
    }
    return <Redirect href="/(tabs)/" />;
  }
  return <Redirect href="/(auth)/login" />;
}
