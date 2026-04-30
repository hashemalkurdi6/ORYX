import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { View, ActivityIndicator } from 'react-native';
import {
  useFonts,
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
} from '@expo-google-fonts/dm-sans';
import {
  Fraunces_400Regular,
  Fraunces_400Regular_Italic,
  Fraunces_500Medium,
  Fraunces_600SemiBold,
} from '@expo-google-fonts/fraunces';
import {
  DMMono_400Regular,
  DMMono_500Medium,
} from '@expo-google-fonts/dm-mono';
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext';
import { theme as T, type as TY } from '@/services/theme';

function AppStack() {
  const { theme, themeReady, resolvedScheme } = useTheme();

  // Hold off on rendering children until the saved appearance preference has
  // been read + applied — guarantees first paint uses the right theme.
  if (!themeReady) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg.primary, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  return (
    <>
      {/* Status-bar icons flip with the theme so they stay readable. */}
      <StatusBar style={resolvedScheme === 'light' ? 'dark' : 'light'} />
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
  // Keys here MUST match services/theme.ts → type.serif / type.sans / type.mono.
  // Dusk Direction stack: Fraunces (display) + DM Sans (body) + DM Mono (data).
  const [fontsLoaded] = useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
    Fraunces_400Regular,
    Fraunces_400Regular_Italic,
    Fraunces_500Medium,
    Fraunces_600SemiBold,
    DMMono_400Regular,
    DMMono_500Medium,
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
