import React, { useEffect, useState } from 'react';
import { translations, Language } from '@/shared/i18n';

interface UsageGuideProps {
  lang: Language;
}

export const UsageGuide: React.FC<UsageGuideProps> = ({ lang }) => {
  const [isMac, setIsMac] = useState(false);
  const t = translations[lang];

  useEffect(() => {
    const checkIsMac = () => {
        if (typeof navigator !== 'undefined') {
            const platform = navigator.platform || '';
            const userAgent = navigator.userAgent || '';
            return platform.toUpperCase().indexOf('MAC') >= 0 || userAgent.toUpperCase().indexOf('MAC') >= 0;
        }
        return false;
    };
    setIsMac(checkIsMac());
  }, []);

  return (
    <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-20 pointer-events-none select-none">
      <div className="text-slate-500 dark:text-slate-400 text-xs bg-white/50 dark:bg-google-dark-surface/50 backdrop-blur px-3 py-1.5 rounded-full border border-slate-200 dark:border-google-dark-border shadow-sm">
        {isMac ? t.instructionMac : t.instructionWin}
      </div>
    </div>
  );
};
