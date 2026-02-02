import { useState, useEffect } from 'react';
import { useUIStore } from '@/store/uiStore';
import { Theme } from '@/types';

/**
 * Hook to get the effective theme (light or dark)
 * Resolves 'system' theme to the actual current system preference
 */
export function useEffectiveTheme(): 'light' | 'dark' {
  const theme = useUIStore((state) => state.theme);
  
  const getSystemTheme = (): 'light' | 'dark' => {
    if (typeof window === 'undefined') return 'light';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  };

  const [effectiveTheme, setEffectiveTheme] = useState<'light' | 'dark'>(() => {
    if (theme === 'system') return getSystemTheme();
    return theme;
  });

  useEffect(() => {
    if (theme !== 'system') {
      setEffectiveTheme(theme);
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    // Update immediately to ensure sync
    setEffectiveTheme(mediaQuery.matches ? 'dark' : 'light');

    const handleChange = (e: MediaQueryListEvent) => {
      setEffectiveTheme(e.matches ? 'dark' : 'light');
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  return effectiveTheme;
}
