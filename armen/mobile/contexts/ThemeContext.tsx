import React, { createContext, useContext } from 'react';
import { theme, type as typeTokens, radius, space, ThemeColors } from '@/services/theme';

interface ThemeContextType {
  theme: ThemeColors;
  type: typeof typeTokens;
  radius: typeof radius;
  space: typeof space;
}

const ThemeContext = createContext<ThemeContextType>({
  theme,
  type: typeTokens,
  radius,
  space,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <ThemeContext.Provider value={{ theme, type: typeTokens, radius, space }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
