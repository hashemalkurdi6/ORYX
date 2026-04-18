import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';

function AppStack() {
  const { theme } = useTheme();
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.bg.primary },
          headerTintColor: theme.text.primary,
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: theme.bg.primary },
          headerShown: false,
        }}
      >
        <Stack.Screen name="checkin" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppStack />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
