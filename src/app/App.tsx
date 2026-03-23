/**
 * Main App Component
 * Root component that assembles all pieces together
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Providers } from './Providers';
import { AppLayout } from './AppLayout';
import { SettingsModal } from './components/SettingsModal';
import { AboutModal } from './components/AboutModal';
import { LazyOverlayFallback } from './components/LazyOverlayFallback';
import { useAppShellState, useFileImport, useFileExport, useImportInputBinding } from './hooks';
import { resolveCurrentUsdExportMode } from './utils/currentUsdExportMode';
import { useRobotStore, useUIStore, useSelectionStore, useAssetsStore, useAssemblyStore } from '@/store';
import { resolveRobotFileData } from '@/core/parsers';
import type { RobotFile, RobotState, UrdfLink, UrdfJoint } from '@/types';
import { translations } from '@/shared/i18n';
import { getUsdStageExportHandler } from '@/features/urdf-viewer/utils/usdStageExport';
import {
  installRegressionDebugApi,
  setRegressionAppHandlers,
} from '@/shared/debug/regressionBridge';

const loadAIModalModule = () => import('@/features/ai-assistant/components/AIModal');
const loadExportDialogModule = () => import('@/features/file-io/components/ExportDialog');

const AIModal = lazy(() =>
  loadAIModalModule().then((module) => ({ default: module.AIModal }))
);

const ExportDialog = lazy(() =>
  loadExportDialogModule().then((module) => ({ default: module.ExportDialog }))
);

type ExportDialogTarget =
  | { type: 'current' }
  | { type: 'library-file'; file: RobotFile };

function AppContent() {
  // Refs for file inputs
  const importInputRef = useRef<HTMLInputElement>(null);
  const importFolderInputRef = useRef<HTMLInputElement>(null);
  const loadRobotByNameRef = useRef<((file: RobotFile, options?: { forceReload?: boolean }) => void) | null>(null);
  const [shouldRenderAIModal, setShouldRenderAIModal] = useState(false);
  const [exportDialogTarget, setExportDialogTarget] = useState<ExportDialogTarget>({ type: 'current' });
  const [viewerReloadKey, setViewerReloadKey] = useState(0);

  // UI Store
  const lang = useUIStore((state) => state.lang);
  const t = translations[lang];
  const setAppMode = useUIStore((state) => state.setAppMode);
  const openSettings = useUIStore((state) => state.openSettings);
  const sidebarTab = useUIStore((state) => state.sidebarTab);

  // Selection Store
  const setSelection = useSelectionStore((state) => state.setSelection);
  const selection = useSelectionStore((state) => state.selection);
  const focusOn = useSelectionStore((state) => state.focusOn);

  // Assets Store
  const setOriginalUrdfContent = useAssetsStore((state) => state.setOriginalUrdfContent);
  const setOriginalFileFormat = useAssetsStore((state) => state.setOriginalFileFormat);
  const setSelectedFile = useAssetsStore((state) => state.setSelectedFile);
  const documentLoadState = useAssetsStore((state) => state.documentLoadState);
  const setDocumentLoadState = useAssetsStore((state) => state.setDocumentLoadState);
  const selectedFile = useAssetsStore((state) => state.selectedFile);
  const availableFiles = useAssetsStore((state) => state.availableFiles);
  const assets = useAssetsStore((state) => state.assets);
  const getUsdSceneSnapshot = useAssetsStore((state) => state.getUsdSceneSnapshot);
  const getUsdPreparedExportCache = useAssetsStore((state) => state.getUsdPreparedExportCache);
  const motorLibrary = useAssetsStore((state) => state.motorLibrary);

  // Robot Store
  const robotName = useRobotStore((state) => state.name);
  const robotLinks = useRobotStore((state) => state.links);
  const robotJoints = useRobotStore((state) => state.joints);
  const rootLinkId = useRobotStore((state) => state.rootLinkId);
  const setRobot = useRobotStore((state) => state.setRobot);

  // Assembly Store
  const assemblyState = useAssemblyStore((state) => state.assemblyState);
  const getMergedRobotData = useAssemblyStore((state) => state.getMergedRobotData);

  const {
    toast,
    closeToast,
    showToast,
    isAboutOpen,
    setIsAboutOpen,
    isAIModalOpen,
    setIsAIModalOpen,
    isCodeViewerOpen,
    setIsCodeViewerOpen,
    isExportDialogOpen,
    setIsExportDialogOpen,
    isExporting,
    setIsExporting,
    viewConfig,
    setViewConfig,
  } = useAppShellState();

  // Build robot state for AI modal
  // In workspace mode, AI inspection/select should target merged assembly ids.
  const mergedWorkspaceRobot = useMemo(() => {
    if (!assemblyState || sidebarTab !== 'workspace') {
      return null;
    }

    return getMergedRobotData();
  }, [assemblyState, getMergedRobotData, sidebarTab]);

  const robot: RobotState = useMemo(() => {
    if (mergedWorkspaceRobot) {
      return {
        ...mergedWorkspaceRobot,
        selection,
      };
    }

    return {
      name: robotName,
      links: robotLinks,
      joints: robotJoints,
      rootLinkId,
      selection,
    };
  }, [
    robotName,
    robotLinks,
    robotJoints,
    rootLinkId,
    selection,
    mergedWorkspaceRobot,
  ]);

  const isSelectedUsdHydrating = selectedFile?.format === 'usd'
    && documentLoadState.status === 'hydrating'
    && documentLoadState.fileName === selectedFile.name;
  const currentUsdExportMode = selectedFile?.format === 'usd' && sidebarTab !== 'workspace'
    ? resolveCurrentUsdExportMode({
      isHydrating: isSelectedUsdHydrating,
      hasLiveStageExportHandler: Boolean(getUsdStageExportHandler()),
      hasPreparedExportCache: Boolean(getUsdPreparedExportCache(selectedFile.name)),
      hasSceneSnapshot: Boolean(getUsdSceneSnapshot(selectedFile.name)),
    })
    : 'unavailable';

  // Keep one internal loader so debug automation can force a reload of the
  // currently selected file without changing normal click behavior.
  const loadRobotFile = useCallback((file: RobotFile, options?: { forceReload?: boolean }) => {
    if (
      !options?.forceReload
      && selectedFile
      && selectedFile.name === file.name
      && selectedFile.format === file.format
      && selectedFile.content === file.content
      && selectedFile.blobUrl === file.blobUrl
    ) {
      setAppMode('detail');
      return;
    }
    const liveAssetsState = useAssetsStore.getState();
    setDocumentLoadState({
      status: 'loading',
      fileName: file.name,
      format: file.format,
      error: null,
    });
    const importResult = resolveRobotFileData(file, {
      availableFiles: liveAssetsState.availableFiles,
      assets: liveAssetsState.assets,
      usdRobotData: getUsdPreparedExportCache(file.name)?.robotData ?? null,
    });

    if (importResult.status === 'ready' || importResult.status === 'needs_hydration') {
      setViewerReloadKey((value) => value + 1);
      setSelectedFile(file);
      setOriginalUrdfContent(file.format === 'mesh' ? '' : file.content);
      setOriginalFileFormat(file.format === 'mesh' ? null : file.format);
      if (importResult.status === 'ready') {
        setRobot(
          importResult.robotData,
          file.format === 'usd'
            ? { resetHistory: true, label: 'Load USD stage' }
            : undefined,
        );
      }
      setDocumentLoadState({
        status: importResult.status === 'needs_hydration' ? 'hydrating' : 'ready',
        fileName: file.name,
        format: file.format,
        error: null,
      });
      setSelection({ type: null, id: null });
      setAppMode('detail');
    } else {
      setDocumentLoadState({
        status: 'error',
        fileName: file.name,
        format: file.format,
        error: t.failedToParseFormat.replace('{format}', file.format.toUpperCase()),
      });
      alert(t.failedToParseFormat.replace('{format}', file.format.toUpperCase()));
    }
  }, [
    setDocumentLoadState,
    getUsdPreparedExportCache,
    selectedFile,
    setRobot,
    setSelection,
    setSelectedFile,
    setOriginalUrdfContent,
    setOriginalFileFormat,
    setAppMode,
    t,
  ]);

  const handleLoadRobot = useCallback((file: RobotFile) => {
    loadRobotFile(file);
  }, [loadRobotFile]);

  loadRobotByNameRef.current = loadRobotFile;

  useEffect(() => {
    if (!import.meta.env.DEV || typeof window === 'undefined') {
      return;
    }

    installRegressionDebugApi(window);

    setRegressionAppHandlers({
      getAvailableFiles: () => useAssetsStore.getState().availableFiles,
      getSelectedFile: () => useAssetsStore.getState().selectedFile,
      getRobotState: () => ({
        name: useRobotStore.getState().name,
        links: useRobotStore.getState().links,
        joints: useRobotStore.getState().joints,
        rootLinkId: useRobotStore.getState().rootLinkId,
        selection: useSelectionStore.getState().selection,
      }),
      loadRobotByName: async (fileName: string) => {
        const file = useAssetsStore.getState().availableFiles.find((entry) => entry.name === fileName) ?? null;
        if (!file) {
          return {
            loaded: false,
            selectedFile: useAssetsStore.getState().selectedFile?.name ?? null,
          };
        }

        loadRobotByNameRef.current?.(file, { forceReload: true });
        return {
          loaded: true,
          selectedFile: file.name,
        };
      },
    });

    return () => {
      setRegressionAppHandlers(null);
      delete window.__URDF_STUDIO_DEBUG__;
    };
  }, []);

  // File import/export hooks
  const { handleImport } = useFileImport({ onLoadRobot: handleLoadRobot, onShowToast: showToast });
  const { handleExportProject, handleExportWithConfig } = useFileExport();

  // AI changes handler
  const handleApplyAIChanges = useCallback((data: { name?: string; links?: Record<string, UrdfLink>; joints?: Record<string, UrdfJoint>; rootLinkId?: string }) => {
    setRobot({
      name: data.name || robotName,
      links: data.links || robotLinks,
      joints: data.joints || robotJoints,
      rootLinkId: data.rootLinkId || rootLinkId,
    });
    setAppMode('skeleton');
  }, [robotName, robotLinks, robotJoints, rootLinkId, setRobot, setAppMode]);

  useImportInputBinding({
    importInputRef,
    importFolderInputRef,
    onImport: handleImport,
  });

  useEffect(() => {
    const warmup = () => {
      void loadAIModalModule();
      void loadExportDialogModule();
    };

    const idleWindow = window as Window & {
      requestIdleCallback?: typeof window.requestIdleCallback;
      cancelIdleCallback?: typeof window.cancelIdleCallback;
    };

    if (typeof idleWindow.requestIdleCallback === 'function') {
      const idleId = idleWindow.requestIdleCallback(warmup, { timeout: 2200 });
      return () => idleWindow.cancelIdleCallback?.(idleId);
    }

    const timer = window.setTimeout(warmup, 1200);
    return () => window.clearTimeout(timer);
  }, []);

  const handleOpenAIModal = useCallback(() => {
    if (isSelectedUsdHydrating) {
      showToast(t.usdLoadInProgress, 'info');
      return;
    }
    setShouldRenderAIModal(true);
    void loadAIModalModule();
    setIsAIModalOpen(true);
  }, [isSelectedUsdHydrating, setIsAIModalOpen, showToast, t.usdLoadInProgress]);

  const handleOpenExportDialog = useCallback(() => {
    void loadExportDialogModule();
    setExportDialogTarget({ type: 'current' });
    setIsExportDialogOpen(true);
  }, [setIsExportDialogOpen]);

  const handleOpenLibraryExportDialog = useCallback((file: RobotFile) => {
    void loadExportDialogModule();
    setExportDialogTarget({ type: 'library-file', file });
    setIsExportDialogOpen(true);
  }, [setIsExportDialogOpen]);

  const canExportUsd = exportDialogTarget.type === 'current'
    ? selectedFile?.format === 'usd' && sidebarTab !== 'workspace'
      ? currentUsdExportMode !== 'unavailable'
      : !isSelectedUsdHydrating
    : exportDialogTarget.file.format === 'urdf'
      || exportDialogTarget.file.format === 'mjcf'
      || exportDialogTarget.file.format === 'xacro';

  const loadingLabel = t.loadingPanel;

  return (
    <>
      <AppLayout
        importInputRef={importInputRef}
        importFolderInputRef={importFolderInputRef}
        onFileDrop={(files) => handleImport(files as any)}
        onOpenExport={handleOpenExportDialog}
        onOpenLibraryExport={handleOpenLibraryExportDialog}
        onExportProject={handleExportProject}
        showToast={showToast}
        onOpenAI={handleOpenAIModal}
        isCodeViewerOpen={isCodeViewerOpen}
        setIsCodeViewerOpen={setIsCodeViewerOpen}
        onOpenSettings={() => openSettings()}
        onOpenAbout={() => setIsAboutOpen(true)}
        viewConfig={viewConfig}
        setViewConfig={setViewConfig}
        onLoadRobot={handleLoadRobot}
        viewerReloadKey={viewerReloadKey}
      />

      {/* Modals */}
      <SettingsModal />
      <AboutModal isOpen={isAboutOpen} onClose={() => setIsAboutOpen(false)} />
      {shouldRenderAIModal && (
        <Suspense fallback={<LazyOverlayFallback label={loadingLabel} />}>
          <AIModal
            isOpen={isAIModalOpen}
            onClose={() => setIsAIModalOpen(false)}
            robot={robot}
            motorLibrary={motorLibrary}
            lang={lang}
            onApplyChanges={handleApplyAIChanges}
            onSelectItem={(type, id) => {
              setSelection({ type, id });
              focusOn(id);
            }}
          />
        </Suspense>
      )}

      {/* Export Dialog */}
      {isExportDialogOpen && (
        <Suspense fallback={<LazyOverlayFallback label={loadingLabel} />}>
          <ExportDialog
            onClose={() => {
              if (!isExporting) {
                setIsExportDialogOpen(false);
              }
            }}
            onExport={async (config, options) => {
              setIsExporting(true);
              await new Promise<void>((resolve) => {
                requestAnimationFrame(() => resolve());
              });
              try {
                await handleExportWithConfig(config, exportDialogTarget, {
                  onProgress: options?.onProgress,
                });
                setIsExportDialogOpen(false);
              } catch (error) {
                showToast(
                  error instanceof Error && error.message
                    ? error.message
                    : t.exportFailedParse,
                  'info',
                );
              } finally {
                setIsExporting(false);
              }
            }}
            lang={lang}
            isExporting={isExporting}
            canExportUsd={canExportUsd}
          />
        </Suspense>
      )}

      {/* Toast */}
      {toast.show && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[200] animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="bg-white dark:bg-[#2C2C2E] shadow-2xl dark:shadow-black/50 rounded-xl border border-slate-200 dark:border-[#000000] px-4 py-3 flex items-center gap-3 max-w-md">
            <div className="bg-green-100 dark:bg-green-600 p-1.5 rounded-full shrink-0">
              <svg className="w-4 h-4 text-green-600 dark:text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="text-sm text-slate-700 dark:text-white font-medium">{toast.message}</div>
            <button
              onClick={closeToast}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 ml-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default function App() {
  return (
    <Providers>
      <AppContent />
    </Providers>
  );
}
