import { useEffect, useMemo, useState } from 'react';
import type { RefObject } from 'react';
import type { HeaderResponsiveLayout } from './types';

export function useHeaderResponsiveLayout(headerRef: RefObject<HTMLElement | null>): HeaderResponsiveLayout {
  const [headerWidth, setHeaderWidth] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 0));

  useEffect(() => {
    const node = headerRef.current;

    if (!node || typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      const nextWidth = Math.round(entry?.contentRect.width ?? node.clientWidth);
      setHeaderWidth((prevWidth) => (prevWidth === nextWidth ? prevWidth : nextWidth));
    });

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [headerRef]);

  return useMemo(() => {
    const width = headerWidth;
    const showMenuLabels = width >= 1080;
    const showSourceInline = width >= 1120;
    const showSourceText = width >= 1280;
    const showUndoRedoInline = width >= 1400;
    const showFullModeSwitcher = width >= 1280;
    const showQuickActionInline = width >= 720;
    const showQuickActionLabel = width >= 1360;
    const showSnapshotInline = width >= 1024;
    const showSettingsInline = width >= 960;
    const showLanguageInline = width >= 900;
    const showThemeInline = width >= 840;
    const showAboutInline = width >= 780;
    const showSecondaryActionInline = width >= 780;

    return {
      showMenuLabels,
      showSourceInline,
      showSourceText,
      showUndoRedoInline,
      showFullModeSwitcher,
      showQuickActionInline,
      showQuickActionLabel,
      showSnapshotInline,
      showSettingsInline,
      showLanguageInline,
      showThemeInline,
      showAboutInline,
      showSecondaryActionInline,
      showDesktopOverflow:
        width >= 640 &&
        (
          !showQuickActionInline ||
          !showSourceInline ||
          !showUndoRedoInline ||
          !showSnapshotInline ||
          !showSettingsInline ||
          !showLanguageInline ||
          !showThemeInline ||
          !showAboutInline ||
          !showSecondaryActionInline
        ),
    };
  }, [headerWidth]);
}
