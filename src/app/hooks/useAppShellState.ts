import { useCallback, useEffect, useRef, useState } from 'react';

import type { ExportProgressState } from '@/features/file-io';

export interface AppToastState {
  show: boolean;
  message: string;
  type: 'info' | 'success' | 'error';
}

export interface AppViewConfig {
  showToolbar: boolean;
  showOptionsPanel: boolean;
  showVisualizerOptionsPanel: boolean;
  showJointPanel: boolean;
}

const DEFAULT_TOAST_STATE: AppToastState = {
  show: false,
  message: '',
  type: 'info',
};

const DEFAULT_VIEW_CONFIG: AppViewConfig = {
  showToolbar: true,
  showOptionsPanel: true,
  showVisualizerOptionsPanel: true,
  showJointPanel: true,
};

export function useAppShellState() {
  const [toast, setToast] = useState<AppToastState>(DEFAULT_TOAST_STATE);
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [isCodeViewerOpen, setIsCodeViewerOpen] = useState(false);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [projectExportProgress, setProjectExportProgress] = useState<ExportProgressState | null>(
    null,
  );
  const [viewConfig, setViewConfig] = useState<AppViewConfig>(DEFAULT_VIEW_CONFIG);

  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, type: 'info' | 'success' | 'error' = 'info') => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }

    setToast({ show: true, message, type });
    toastTimerRef.current = setTimeout(() => {
      setToast((prev) => ({ ...prev, show: false }));
    }, 5000);
  }, []);

  const closeToast = useCallback(() => {
    setToast((prev) => ({ ...prev, show: false }));
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  return {
    toast,
    setToast,
    closeToast,
    showToast,
    isAIModalOpen,
    setIsAIModalOpen,
    isCodeViewerOpen,
    setIsCodeViewerOpen,
    isExportDialogOpen,
    setIsExportDialogOpen,
    isExporting,
    setIsExporting,
    projectExportProgress,
    setProjectExportProgress,
    viewConfig,
    setViewConfig,
  };
}
