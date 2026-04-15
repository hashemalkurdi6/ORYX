import { Redirect } from 'expo-router';
import { useAuthStore } from '@/services/authStore';

export default function Index() {
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);

  if (token) {
    if (!user?.onboarding_complete) {
      return <Redirect href="/onboarding" />;
    }
    return <Redirect href="/(tabs)/" />;
  }
  return <Redirect href="/(auth)/signup" />;
}
