import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator } from 'react-native';
import {
  useFonts as useGeist,
  Geist_400Regular,
  Geist_500Medium,
  Geist_600SemiBold,
  Geist_700Bold,
} from '@expo-google-fonts/geist';
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
  JetBrainsMono_600SemiBold,
  JetBrainsMono_700Bold,
} from '@expo-google-fonts/jetbrains-mono';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';
import { theme as T, type as TY } from '@/services/theme';

function AppStack() {
  const { theme } = useTheme();
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.bg.primary },
          headerTintColor: theme.text.primary,
          headerTitleStyle: { fontFamily: TY.sans.bold },
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
  // Keys here MUST match services/theme.ts → type.sans / type.mono font-family names.
  const [fontsLoaded] = useGeist({
    Geist_400Regular,
    Geist_500Medium,
    Geist_600SemiBold,
    Geist_700Bold,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
    JetBrainsMono_600SemiBold,
    JetBrainsMono_700Bold,
  });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: T.bg.primary, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={T.accent} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AppStack />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
