// ThemeContext — tracks the user's appearance preference (dark / light / auto),
// resolves it against the OS color scheme, and exposes the active theme to
// every `useTheme()` consumer. At mount it reads the saved preference from
// AsyncStorage BEFORE rendering children, so first paint uses the right theme.
//
// Live switching: mutates the shared `theme` export in place + bumps a version
// key so hook-based consumers re-render. Module-level `import { theme as T }`
// usages in StyleSheet.create blocks need the app to be reopened to fully
// apply — the Appearance screen surfaces this to the user.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  theme as sharedTheme,
  themeDark,
  themeLight,
  type as typeTokens,
  radius,
  space,
  ThemeColors,
  AppearanceMode,
  applyThemeInPlace,
  resolveTheme,
} from '@/services/theme';

const STORAGE_KEY = 'oryx.appearance';

interface ThemeContextType {
  theme: ThemeColors;
  type: typeof typeTokens;
  radius: typeof radius;
  space: typeof space;
  appearance: AppearanceMode;
  resolvedScheme: 'light' | 'dark';
  setAppearance: (mode: AppearanceMode) => Promise<void>;
  /** True once the saved preference has been read — children shouldn't paint until this flips. */
  themeReady: boolean;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: sharedTheme,
  type: typeTokens,
  radius,
  space,
  appearance: 'dark',
  resolvedScheme: 'dark',
  setAppearance: async () => {},
  themeReady: false,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme(); // 'light' | 'dark' | null

  const [appearance, setAppearanceState] = useState<AppearanceMode>('dark');
  const [themeReady, setThemeReady] = useState(false);
  const [themeVersion, setThemeVersion] = useState(0); // bump to force consumer re-render

  // Apply the resolved theme to the shared mutable `theme` object in place.
  const applyFor = useCallback((mode: AppearanceMode) => {
    const next = resolveTheme(mode, systemScheme);
    applyThemeInPlace(next);
    setThemeVersion((v) => v + 1);
  }, [systemScheme]);

  // Boot: read the saved preference, apply it BEFORE unblocking children.
  const bootstrappedRef = useRef(false);
  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    (async () => {
      let saved: AppearanceMode = 'dark';
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw === 'dark' || raw === 'light' || raw === 'auto') saved = raw;
      } catch {
        // fall back to dark
      }
      setAppearanceState(saved);
      applyFor(saved);
      setThemeReady(true);
    })();
  }, [applyFor]);

  // When the OS scheme changes and the user is on 'auto', re-apply.
  useEffect(() => {
    if (!themeReady) return;
    if (appearance === 'auto') applyFor('auto');
  }, [systemScheme, appearance, themeReady, applyFor]);

  const setAppearance = useCallback(async (mode: AppearanceMode) => {
    setAppearanceState(mode);
    applyFor(mode);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, mode);
    } catch {
      // non-fatal; preference will still apply for this session
    }
  }, [applyFor]);

  const resolvedScheme: 'light' | 'dark' =
    appearance === 'dark' ? 'dark'
    : appearance === 'light' ? 'light'
    : (systemScheme === 'light' ? 'light' : 'dark');

  // Return a fresh `theme` reference on every version bump. The shared object
  // is mutated in place (so module-level reads stay consistent), but shallow-
  // cloning it here gives consumers a new reference each time the scheme flips
  // — that makes `useMemo(() => createStyles(theme), [theme])` invalidate
  // correctly, which is what keeps styles reactive without every consumer
  // needing to depend on `resolvedScheme` explicitly.
  const value = useMemo<ThemeContextType>(() => ({
    theme: { ...sharedTheme },
    type: typeTokens,
    radius,
    space,
    appearance,
    resolvedScheme,
    setAppearance,
    themeReady,
  }), [appearance, resolvedScheme, setAppearance, themeReady, themeVersion]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
