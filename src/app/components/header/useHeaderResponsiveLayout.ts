import { useEffect, useMemo, useState } from 'react';
import type { RefObject } from 'react';
import type { HeaderResponsiveLayout } from './types';

interface HeaderResponsiveLayoutOptions {
  hasQuickAction: boolean;
  hasSecondaryAction: boolean;
}

const OPTIONAL_ACTION_WIDTH_BONUS = 96;

export function getHeaderResponsiveLayout(
  width: number,
  {
    hasQuickAction,
    hasSecondaryAction,
  }: HeaderResponsiveLayoutOptions,
): HeaderResponsiveLayout {
  // When optional header actions are absent, reclaim that space so desktop
  // layouts can keep more controls inline before collapsing into overflow.
  const effectiveWidth = width
    + (hasQuickAction ? 0 : OPTIONAL_ACTION_WIDTH_BONUS)
    + (hasSecondaryAction ? 0 : OPTIONAL_ACTION_WIDTH_BONUS);

  const showMenuLabels = effectiveWidth >= 1080;
  const showSourceInline = effectiveWidth >= 1120;
  const showSourceText = effectiveWidth >= 1280;
  const showUndoRedoInline = effectiveWidth >= 1400;
  const showQuickActionInline = effectiveWidth >= 720;
  const showQuickActionLabel = effectiveWidth >= 1360;
  const showSnapshotInline = effectiveWidth >= 1024;
  const showSettingsInline = effectiveWidth >= 960;
  const showLanguageInline = effectiveWidth >= 900;
  const showThemeInline = effectiveWidth >= 840;
  const showAboutInline = effectiveWidth >= 780;
  const showSecondaryActionInline = effectiveWidth >= 780;
  const showSecondaryActionLabel = effectiveWidth >= 1360;

  return {
    showMenuLabels,
    showSourceInline,
    showSourceText,
    showUndoRedoInline,
    showQuickActionInline,
    showQuickActionLabel,
    showSnapshotInline,
    showSettingsInline,
    showLanguageInline,
    showThemeInline,
    showAboutInline,
    showSecondaryActionInline,
    showSecondaryActionLabel,
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
}

export function useHeaderResponsiveLayout(
  headerRef: RefObject<HTMLElement | null>,
  options: HeaderResponsiveLayoutOptions,
): HeaderResponsiveLayout {
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

  return useMemo(
    () => getHeaderResponsiveLayout(headerWidth, options),
    [headerWidth, options],
  );
}
