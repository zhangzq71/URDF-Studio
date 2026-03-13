import React, { useEffect, useState } from 'react';
import { translations, Language } from '@/shared/i18n';

interface UsageGuideProps {
  lang: Language;
}

type DetectedOS = 'mac' | 'windows' | 'linux' | 'other';

export const UsageGuide: React.FC<UsageGuideProps> = ({ lang }) => {
  const [detectedOS, setDetectedOS] = useState<DetectedOS>('other');
  const t = translations[lang];

  useEffect(() => {
    const detectOS = (): DetectedOS => {
      if (typeof navigator === 'undefined') return 'other';

      const userAgent = navigator.userAgent || '';
      const userAgentDataPlatform = (navigator as Navigator & {
        userAgentData?: { platform?: string };
      }).userAgentData?.platform || '';

      const raw = `${userAgent} ${userAgentDataPlatform}`.toLowerCase();

      if (raw.includes('mac') || raw.includes('darwin')) return 'mac';
      if (raw.includes('win')) return 'windows';
      if (raw.includes('linux') || raw.includes('x11') || raw.includes('cros')) return 'linux';
      return 'other';
    };

    setDetectedOS(detectOS());
  }, []);

  const instructionText = (() => {
    switch (detectedOS) {
      case 'mac':
        return t.instructionMac;
      case 'windows':
        return t.instructionWin;
      case 'linux':
        return t.instructionLinux;
      default:
        return t.instructionOther;
    }
  })();

  return (
    <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-20 pointer-events-none select-none">
      <div className="rounded-full border border-border-black bg-panel-bg px-3 py-1.5 text-xs text-text-secondary shadow-sm">
        {instructionText}
      </div>
    </div>
  );
};
