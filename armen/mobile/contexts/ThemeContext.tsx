import React, { createContext, useContext } from 'react';
import { theme, ThemeColors } from '@/services/theme';

interface ThemeContextType {
  theme: ThemeColors;
}

const ThemeContext = createContext<ThemeContextType>({ theme });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <ThemeContext.Provider value={{ theme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
