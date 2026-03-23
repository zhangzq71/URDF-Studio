import { useUIStore } from '@/store/uiStore';
import { useResolvedTheme } from './useTheme';

/**
 * Hook to get the effective theme (light or dark)
 * Resolves 'system' theme to the actual current system preference
 */
export function useEffectiveTheme(): 'light' | 'dark' {
  const theme = useUIStore((state) => state.theme);
  return useResolvedTheme(theme);
}
