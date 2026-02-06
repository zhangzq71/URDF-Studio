/**
 * UI Store - Manages UI-related state
 * Handles app mode, view options, panel visibility, theme, language, etc.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AppMode, Theme } from '@/types';

// Language type
export type Language = 'en' | 'zh';

// View configuration for different modes
export interface ViewConfig {
  showToolbar: boolean;
  showOptionsPanel: boolean;      // For detail mode (URDFViewer)
  showSkeletonOptionsPanel: boolean;  // For skeleton/hardware mode (Visualizer)
  showJointPanel: boolean;
}

// View options for 3D visualization
export interface ViewOptions {
  showGrid: boolean;
  showAxes: boolean;
  showJointAxes: boolean;
  showInertia: boolean;
  showCenterOfMass: boolean;
  showCollision: boolean;
  showFPS: boolean;
  showMemory: boolean;
}

// Panel visibility state
export interface PanelsState {
  codeEditor: boolean;
  aiAssistant: boolean;
}

// Sidebar collapse state
export interface SidebarState {
  leftCollapsed: boolean;
  rightCollapsed: boolean;
}

interface UIState {
  // App mode (skeleton/detail/hardware)
  appMode: AppMode;
  setAppMode: (mode: AppMode) => void;

  // Theme (light/dark/system)
  theme: Theme;
  setTheme: (theme: Theme) => void;

  // Language (en/zh)
  lang: Language;
  setLang: (lang: Language) => void;

  // UI Scale
  uiScale: number;
  setUiScale: (scale: number) => void;

  // View configuration
  viewConfig: ViewConfig;
  setViewConfig: <K extends keyof ViewConfig>(key: K, value: ViewConfig[K]) => void;

  // View options for 3D scene
  viewOptions: ViewOptions;
  setViewOption: <K extends keyof ViewOptions>(key: K, value: ViewOptions[K]) => void;

  // Panel visibility
  panels: PanelsState;
  togglePanel: (panel: keyof PanelsState) => void;
  setPanel: (panel: keyof PanelsState, open: boolean) => void;

  // Sidebar collapse
  sidebar: SidebarState;
  toggleSidebar: (side: 'left' | 'right') => void;
  setSidebar: (side: 'left' | 'right', collapsed: boolean) => void;

  // Settings modal
  isSettingsOpen: boolean;
  settingsPos: { x: number; y: number };
  openSettings: (pos?: { x: number; y: number }) => void;
  closeSettings: () => void;
  setSettingsPos: (pos: { x: number; y: number }) => void;

  // Menu state
  activeMenu: 'file' | 'toolbox' | 'view' | 'more' | null;
  setActiveMenu: (menu: 'file' | 'toolbox' | 'view' | 'more' | null) => void;

  // OS detection
  os: 'mac' | 'win';
  setOs: (os: 'mac' | 'win') => void;

  // Import warning
  showImportWarning: boolean;
  setShowImportWarning: (show: boolean) => void;

  // Panel Sections (collapsed state)
  panelSections: Record<string, boolean>;
  setPanelSection: (section: string, collapsed: boolean) => void;

  // Font Size Preference
  fontSize: 'small' | 'medium' | 'large';
  setFontSize: (size: 'small' | 'medium' | 'large') => void;
}

// Default values
const defaultViewConfig: ViewConfig = {
  showToolbar: true,
  showOptionsPanel: true,
  showSkeletonOptionsPanel: true,
  showJointPanel: true,
};

const defaultViewOptions: ViewOptions = {
  showGrid: true,
  showAxes: true,
  showJointAxes: false,
  showInertia: false,
  showCenterOfMass: false,
  showCollision: false,
  showFPS: false,
  showMemory: false,
};

const defaultPanels: PanelsState = {
  codeEditor: false,
  aiAssistant: false,
};

const defaultSidebar: SidebarState = {
  leftCollapsed: false,
  rightCollapsed: false,
};

// Detect system language
const getSystemLang = (): Language => {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('language');
    if (saved === 'en' || saved === 'zh') {
      return saved;
    }
    const systemLang = navigator.language || (navigator as unknown as { userLanguage?: string }).userLanguage;
    if (systemLang && systemLang.toLowerCase().startsWith('zh')) {
      return 'zh';
    }
  }
  return 'en';
};

// Detect OS
const detectOs = (): 'mac' | 'win' => {
  if (typeof navigator !== 'undefined') {
    if (navigator.platform.toUpperCase().indexOf('MAC') >= 0) {
      return 'mac';
    }
  }
  return 'win';
};

// Get saved theme or default
const getSavedTheme = (): Theme => {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('theme');
    if (saved === 'dark' || saved === 'light' || saved === 'system') {
      return saved;
    }
  }
  return 'system';
};

// Get saved sidebar state
const getSavedSidebar = (): SidebarState => {
  if (typeof window !== 'undefined') {
    return {
      leftCollapsed: localStorage.getItem('leftSidebarCollapsed') === 'true',
      rightCollapsed: localStorage.getItem('rightSidebarCollapsed') === 'true',
    };
  }
  return defaultSidebar;
};

// Get saved UI scale
const getSavedUiScale = (): number => {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('uiScale');
    return saved ? parseFloat(saved) : 1.0;
  }
  return 1.0;
};

// Helper to apply theme
const applyTheme = (theme: Theme) => {
  if (typeof window === 'undefined') return;
  
  const isDark = theme === 'dark' || 
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  if (isDark) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
};

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      // App mode
      appMode: 'skeleton',
      setAppMode: (mode) => set({ appMode: mode }),

      // Theme
      theme: getSavedTheme(),
      setTheme: (theme) => {
        applyTheme(theme);
        set({ theme });
      },

      // Language
      lang: getSystemLang(),
      setLang: (lang) => {
        // Update document title
        document.title = lang === 'zh'
          ? "URDF Studio - 专业机器人设计与可视化工具"
          : "URDF Studio - Professional Robot Design & Visualization Tool";
        set({ lang });
      },

      // UI Scale
      uiScale: getSavedUiScale(),
      setUiScale: (scale) => {
        // Apply scale to root element
        document.documentElement.style.fontSize = `${scale * 100}%`;
        set({ uiScale: scale });
      },

      // View configuration
      viewConfig: defaultViewConfig,
      setViewConfig: (key, value) =>
        set((state) => ({
          viewConfig: { ...state.viewConfig, [key]: value },
        })),

      // View options
      viewOptions: defaultViewOptions,
      setViewOption: (key, value) =>
        set((state) => ({
          viewOptions: { ...state.viewOptions, [key]: value },
        })),

      // Panels
      panels: defaultPanels,
      togglePanel: (panel) =>
        set((state) => ({
          panels: { ...state.panels, [panel]: !state.panels[panel] },
        })),
      setPanel: (panel, open) =>
        set((state) => ({
          panels: { ...state.panels, [panel]: open },
        })),

      // Sidebar
      sidebar: getSavedSidebar(),
      toggleSidebar: (side) =>
        set((state) => {
          const key = side === 'left' ? 'leftCollapsed' : 'rightCollapsed';
          const newValue = !state.sidebar[key];
          // Persist to localStorage
          localStorage.setItem(
            side === 'left' ? 'leftSidebarCollapsed' : 'rightSidebarCollapsed',
            String(newValue)
          );
          return {
            sidebar: { ...state.sidebar, [key]: newValue },
          };
        }),
      setSidebar: (side, collapsed) =>
        set((state) => {
          const key = side === 'left' ? 'leftCollapsed' : 'rightCollapsed';
          localStorage.setItem(
            side === 'left' ? 'leftSidebarCollapsed' : 'rightSidebarCollapsed',
            String(collapsed)
          );
          return {
            sidebar: { ...state.sidebar, [key]: collapsed },
          };
        }),

      // Settings modal
      isSettingsOpen: false,
      settingsPos: { x: 0, y: 0 }, // Will be calculated on open
      openSettings: (pos) =>
        set((state) => {
          let newPos = pos;
          // Only calculate center if no pos provided AND current pos is default (0,0)
          if (!newPos && state.settingsPos.x === 0 && state.settingsPos.y === 0) {
             if (typeof window !== 'undefined') {
                newPos = {
                    x: Math.max(0, window.innerWidth / 2 - 160), // 320px width / 2
                    y: Math.max(0, window.innerHeight / 2 - 200) // Approx height / 2
                };
             } else {
                newPos = { x: 100, y: 100 };
             }
          }
          return {
            isSettingsOpen: true,
            settingsPos: newPos || state.settingsPos,
          };
        }),
      closeSettings: () => set({ isSettingsOpen: false }),
      setSettingsPos: (pos) => set({ settingsPos: pos }),

      // Menu state
      activeMenu: null,
      setActiveMenu: (menu) => set({ activeMenu: menu }),

      // OS detection
      os: detectOs(),
      setOs: (os) => set({ os }),

      // Import warning
      showImportWarning: true,
      setShowImportWarning: (show) => set({ showImportWarning: show }),

      // Panel Sections
      panelSections: {},
      setPanelSection: (section, collapsed) => 
        set((state) => ({
          panelSections: { ...state.panelSections, [section]: collapsed }
        })),

      // Font Size
      fontSize: 'medium',
      setFontSize: (size) => set({ fontSize: size }),
    }),
    {
      name: 'urdf-studio-ui',
      partialize: (state) => ({
        theme: state.theme,
        lang: state.lang,
        uiScale: state.uiScale,
        sidebar: state.sidebar,
        showImportWarning: state.showImportWarning,
        panelSections: state.panelSections,
        fontSize: state.fontSize,
      }),
      onRehydrateStorage: () => (state) => {
        // Re-apply theme on hydration
        if (state) {
          applyTheme(state.theme);
        }
      },
    }
  )
);
