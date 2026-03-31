import type { Dispatch, MouseEventHandler, SetStateAction } from 'react';
import type { LucideIcon } from 'lucide-react';
import { translations } from '@/shared/i18n';
import type { AppMode, Theme } from '@/types';

export type HeaderTranslations = typeof translations['en'];
export type HeaderMenuKey = 'file' | 'edit' | 'toolbox' | 'view' | 'more' | null;

export interface HeaderViewConfig {
  showToolbar: boolean;
  showOptionsPanel: boolean;
  showVisualizerOptionsPanel: boolean;
  showJointPanel: boolean;
}

export type HeaderOptionsPanelKey = 'showOptionsPanel' | 'showVisualizerOptionsPanel';

export type HeaderSetViewConfig = Dispatch<SetStateAction<HeaderViewConfig>>;

export interface HeaderAction {
  label: string;
  title?: string;
  icon: LucideIcon;
  onClick: MouseEventHandler<HTMLButtonElement>;
}

export interface HeaderResponsiveLayout {
  showMenuLabels: boolean;
  showSourceInline: boolean;
  showSourceText: boolean;
  showUndoRedoInline: boolean;
  showQuickActionInline: boolean;
  showQuickActionLabel: boolean;
  showSnapshotInline: boolean;
  showSettingsInline: boolean;
  showLanguageInline: boolean;
  showThemeInline: boolean;
  showAboutInline: boolean;
  showSecondaryActionInline: boolean;
  showSecondaryActionLabel: boolean;
  showDesktopOverflow: boolean;
}

export interface HeaderOverflowMenuProps {
  className?: string;
  lang: 'en' | 'zh';
  theme: Theme;
  canUndo: boolean;
  canRedo: boolean;
  activeMenu: HeaderMenuKey;
  setActiveMenu: (menu: HeaderMenuKey) => void;
  setLang: (lang: 'en' | 'zh') => void;
  setTheme: (theme: Theme) => void;
  undo: () => void;
  redo: () => void;
  quickAction?: HeaderAction;
  secondaryAction?: HeaderAction;
  onOpenCodeViewer: () => void;
  onPrefetchCodeViewer: () => void;
  onSnapshot: () => void;
  onOpenSettings: () => void;
  onOpenAbout: () => void;
  t: HeaderTranslations;
  showQuickAction: boolean;
  showSourceCode: boolean;
  showUndoRedo: boolean;
  showSnapshot: boolean;
  showSettings: boolean;
  showLanguage: boolean;
  showTheme: boolean;
  showAbout: boolean;
  showSecondaryAction?: boolean;
}
