/**
 * App Providers - Initialization and side effects wrapper
 * Handles theme, language, and other global initializations
 */
import { useEffect } from 'react';
import { useUIStore } from '@/store';
import { translations } from '@/shared/i18n';

interface ProvidersProps {
  children: React.ReactNode;
}

/**
 * Providers component that handles global initializations
 * - Theme application (dark mode class)
 * - Language-based document title
 */
export function Providers({ children }: ProvidersProps) {
  const theme = useUIStore((state) => state.theme);
  const lang = useUIStore((state) => state.lang);
  const t = translations[lang];

  // Apply theme class to document
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const applyThemeClass = () => {
      const isDark = theme === 'dark' || 
        (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      
      if (isDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    };
    
    // Apply immediately
    applyThemeClass();
    
    // Listen for system theme changes when theme is 'system'
    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = () => applyThemeClass();
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }
  }, [theme]);

  // Update document title based on language
  useEffect(() => {
    document.title = t.documentTitle;
  }, [t]);

  return <>{children}</>;
}

export default Providers;
