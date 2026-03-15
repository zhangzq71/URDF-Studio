import type { Dispatch, SetStateAction } from 'react';
import { translations } from '@/shared/i18n';
import type { AppMode, Theme } from '@/types';

export type HeaderTranslations = typeof translations['en'];
export type HeaderMenuKey = 'file' | 'edit' | 'toolbox' | 'view' | 'more' | null;

export interface HeaderViewConfig {
  showToolbar: boolean;
  showOptionsPanel: boolean;
  showSkeletonOptionsPanel: boolean;
  showJointPanel: boolean;
}

export type HeaderSetViewConfig = Dispatch<SetStateAction<HeaderViewConfig>>;

export interface HeaderResponsiveLayout {
  showMenuLabels: boolean;
  showSourceInline: boolean;
  showSourceText: boolean;
  showUndoRedoInline: boolean;
  showFullModeSwitcher: boolean;
  showGalleryInline: boolean;
  showGalleryLabel: boolean;
  showSnapshotInline: boolean;
  showSettingsInline: boolean;
  showLanguageInline: boolean;
  showThemeInline: boolean;
  showAboutInline: boolean;
  showDesktopOverflow: boolean;
}

export interface HeaderOverflowMenuProps {
  className?: string;
  lang: 'en' | 'zh';
  theme: Theme;
  appMode: AppMode;
  canUndo: boolean;
  canRedo: boolean;
  activeMenu: HeaderMenuKey;
  setActiveMenu: (menu: HeaderMenuKey) => void;
  setAppMode: (mode: AppMode) => void;
  setLang: (lang: 'en' | 'zh') => void;
  setTheme: (theme: Theme) => void;
  undo: () => void;
  redo: () => void;
  onOpenURDFGallery: () => void;
  onOpenCodeViewer: () => void;
  onPrefetchCodeViewer: () => void;
  onSnapshot: () => void;
  onOpenSettings: () => void;
  onOpenAbout: () => void;
  t: HeaderTranslations;
  showGallery: boolean;
  showModeSwitcher: boolean;
  showSourceCode: boolean;
  showUndoRedo: boolean;
  showSnapshot: boolean;
  showSettings: boolean;
  showLanguage: boolean;
  showTheme: boolean;
  showAbout: boolean;
}
