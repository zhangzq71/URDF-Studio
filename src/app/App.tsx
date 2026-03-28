/**
 * Main App Component
 * Root component that assembles all pieces together
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Providers } from './Providers';
import { AppLayout } from './AppLayout';
import { SettingsModal } from './components/SettingsModal';
import { AboutModal } from './components/AboutModal';
import { LazyOverlayFallback } from './components/LazyOverlayFallback';
import { useAppShellState, useFileImport, useFileExport, useImportInputBinding } from './hooks';
import { prepareImportPayloadWithWorker } from './hooks/importPreparationWorkerBridge';
import { resolveRobotFileDataWithWorker } from './hooks/robotImportWorkerBridge';
import { resolveCurrentUsdExportMode } from './utils/currentUsdExportMode';
import { consumePreResolvedRobotImport } from './utils/preResolvedRobotImportCache';
import { prewarmUsdSelectionInBackground } from './utils/usdSelectionPrewarm';
import { useRobotStore, useUIStore, useSelectionStore, useAssetsStore, useAssemblyStore } from '@/store';
import type { RobotFile, RobotState, UrdfLink, UrdfJoint } from '@/types';
import type { RobotImportResult } from '@/core/parsers/importRobotFile';
import { translations, type Language } from '@/shared/i18n';
import { getUsdStageExportHandler } from '@/features/urdf-viewer';
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

interface AIApplyChangesPayload {
  name?: string;
  links?: Record<string, UrdfLink>;
  joints?: Record<string, UrdfJoint>;
  rootLinkId?: string;
}

function validateAIApplyPayload(
  data: AIApplyChangesPayload,
): { ok: true; value: Required<Pick<AIApplyChangesPayload, 'links' | 'joints' | 'rootLinkId'>> & Pick<AIApplyChangesPayload, 'name'> }
  | { ok: false; reason: 'aiNoDataToApply' | 'aiNoLinksGenerated' } {
  if (!data || typeof data !== 'object') {
    return { ok: false, reason: 'aiNoDataToApply' };
  }

  if (!data.links || Object.keys(data.links).length === 0) {
    return { ok: false, reason: 'aiNoLinksGenerated' };
  }

  if (!data.joints || typeof data.joints !== 'object') {
    return { ok: false, reason: 'aiNoDataToApply' };
  }

  if (!data.rootLinkId || !data.links[data.rootLinkId]) {
    return { ok: false, reason: 'aiNoDataToApply' };
  }

  return {
    ok: true,
    value: {
      name: data.name,
      links: data.links,
      joints: data.joints,
      rootLinkId: data.rootLinkId,
    },
  };
}

function AIModalConnector({
  isOpen,
  onClose,
  lang,
  onApplyChanges,
}: {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
  onApplyChanges: (data: AIApplyChangesPayload) => void;
}) {
  const { sidebarTab } = useUIStore(useShallow((state) => ({
    sidebarTab: state.sidebarTab,
  })));
  const { selection, setSelection, focusOn } = useSelectionStore(useShallow((state) => ({
    selection: state.selection,
    setSelection: state.setSelection,
    focusOn: state.focusOn,
  })));
  const { robotName, robotLinks, robotJoints, rootLinkId } = useRobotStore(useShallow((state) => ({
    robotName: state.name,
    robotLinks: state.links,
    robotJoints: state.joints,
    rootLinkId: state.rootLinkId,
  })));
  const { assemblyState, getMergedRobotData } = useAssemblyStore(useShallow((state) => ({
    assemblyState: state.assemblyState,
    getMergedRobotData: state.getMergedRobotData,
  })));
  const motorLibrary = useAssetsStore((state) => state.motorLibrary);

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
    mergedWorkspaceRobot,
    robotJoints,
    robotLinks,
    robotName,
    rootLinkId,
    selection,
  ]);

  return (
    <AIModal
      isOpen={isOpen}
      onClose={onClose}
      robot={robot}
      motorLibrary={motorLibrary}
      lang={lang}
      onApplyChanges={onApplyChanges}
      onSelectItem={(type, id) => {
        setSelection({ type, id });
        focusOn(id);
      }}
    />
  );
}

function ExportDialogConnector({
  target,
  lang,
  isExporting,
  onClose,
  onExport,
}: {
  target: ExportDialogTarget;
  lang: Language;
  isExporting: boolean;
  onClose: () => void;
  onExport: (config: unknown, options?: { onProgress?: (progress: number, message?: string) => void }) => Promise<void>;
}) {
  const { sidebarTab } = useUIStore(useShallow((state) => ({
    sidebarTab: state.sidebarTab,
  })));
  const {
    selectedFile,
    documentLoadState,
    getUsdSceneSnapshot,
    getUsdPreparedExportCache,
  } = useAssetsStore(useShallow((state) => ({
    selectedFile: state.selectedFile,
    documentLoadState: state.documentLoadState,
    getUsdSceneSnapshot: state.getUsdSceneSnapshot,
    getUsdPreparedExportCache: state.getUsdPreparedExportCache,
  })));

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

  const canExportUsd = target.type === 'current'
    ? selectedFile?.format === 'usd' && sidebarTab !== 'workspace'
      ? currentUsdExportMode !== 'unavailable'
      : !isSelectedUsdHydrating
    : target.file.format === 'urdf'
      || target.file.format === 'mjcf'
      || target.file.format === 'xacro';

  return (
    <ExportDialog
      onClose={onClose}
      onExport={onExport}
      lang={lang}
      isExporting={isExporting}
      canExportUsd={canExportUsd}
    />
  );
}

function waitForNextPaint(): Promise<void> {
  if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve());
    });
  });
}

type ExportDialogTarget =
  | { type: 'current' }
  | { type: 'library-file'; file: RobotFile };

function AppContent() {
  // Refs for file inputs
  const importInputRef = useRef<HTMLInputElement>(null);
  const importFolderInputRef = useRef<HTMLInputElement>(null);
  const loadRobotByNameRef = useRef<((file: RobotFile, options?: { forceReload?: boolean }) => Promise<void> | void) | null>(null);
  const loadRequestIdRef = useRef(0);
  const [shouldRenderAIModal, setShouldRenderAIModal] = useState(false);
  const [exportDialogTarget, setExportDialogTarget] = useState<ExportDialogTarget>({ type: 'current' });
  const [viewerReloadKey, setViewerReloadKey] = useState(0);

  // UI Store
  const { lang, setAppMode, openSettings } = useUIStore(useShallow((state) => ({
    lang: state.lang,
    setAppMode: state.setAppMode,
    openSettings: state.openSettings,
  })));
  const t = translations[lang];

  // Selection Store
  const setSelection = useSelectionStore((state) => state.setSelection);

  // Assets Store
  const {
    setOriginalUrdfContent,
    setOriginalFileFormat,
    setSelectedFile,
    setDocumentLoadState,
  } = useAssetsStore(useShallow((state) => ({
    setOriginalUrdfContent: state.setOriginalUrdfContent,
    setOriginalFileFormat: state.setOriginalFileFormat,
    setSelectedFile: state.setSelectedFile,
    setDocumentLoadState: state.setDocumentLoadState,
  })));

  // Robot Store
  const setRobot = useRobotStore((state) => state.setRobot);

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

  const applyResolvedRobotImport = useCallback((file: RobotFile, importResult: RobotImportResult) => {
    if (importResult.status === 'ready' || importResult.status === 'needs_hydration') {
      if (importResult.status === 'ready') {
        setRobot(
          importResult.robotData,
          file.format === 'usd'
            ? { resetHistory: true, label: 'Load USD stage' }
            : undefined,
        );

        if (file.format === 'xacro' && importResult.resolvedUrdfContent) {
          setOriginalUrdfContent(importResult.resolvedUrdfContent);
        }
      }
      setDocumentLoadState({
        status: importResult.status === 'needs_hydration' ? 'hydrating' : 'loading',
        fileName: file.name,
        format: file.format,
        error: null,
        phase: importResult.status === 'needs_hydration'
          ? 'checking-path'
          : file.format === 'usd'
            ? 'checking-path'
            : 'preparing-scene',
        message: null,
        progressPercent: null,
        loadedCount: null,
        totalCount: null,
      });
      return;
    }

    if (importResult.reason === 'source_only_fragment') {
      setDocumentLoadState({
        status: 'ready',
        fileName: file.name,
        format: file.format,
        error: null,
        phase: null,
        message: t.xacroSourceOnlyPreviewHint,
        progressPercent: 100,
        loadedCount: null,
        totalCount: null,
      });
      showToast(t.xacroSourceOnlyPreviewHint, 'info');
      return;
    }

    const message = t.failedToParseFormat.replace('{format}', file.format.toUpperCase());
    setDocumentLoadState({
      status: 'error',
      fileName: file.name,
      format: file.format,
      error: message,
    });
    showToast(message, 'info');
  }, [
    setDocumentLoadState,
    setOriginalUrdfContent,
    setRobot,
    showToast,
    t,
  ]);

  // Keep one internal loader so debug automation can force a reload of the
  // currently selected file without changing normal click behavior.
  const loadRobotFile = useCallback(async (file: RobotFile, options?: { forceReload?: boolean }) => {
    const liveAssetsState = useAssetsStore.getState();
    const currentSelectedFile = liveAssetsState.selectedFile;
    if (
      !options?.forceReload
      && currentSelectedFile
      && currentSelectedFile.name === file.name
      && currentSelectedFile.format === file.format
      && currentSelectedFile.content === file.content
      && currentSelectedFile.blobUrl === file.blobUrl
    ) {
      setAppMode('detail');
      return;
    }

    setDocumentLoadState({
      status: 'loading',
      fileName: file.name,
      format: file.format,
      error: null,
      phase: file.format === 'usd' ? 'checking-path' : 'preparing-scene',
      message: null,
      progressPercent: null,
      loadedCount: null,
      totalCount: null,
    });

    setViewerReloadKey((value) => value + 1);
    setSelectedFile(file);
    setOriginalUrdfContent(file.format === 'mesh' ? '' : file.content);
    setOriginalFileFormat(file.format === 'mesh' ? null : file.format);
    setSelection({ type: null, id: null });
    setAppMode('detail');
    const requestId = ++loadRequestIdRef.current;

    prewarmUsdSelectionInBackground(file, liveAssetsState.availableFiles, liveAssetsState.assets);

    const preResolvedImportResult = consumePreResolvedRobotImport(file);
    if (preResolvedImportResult) {
      if (requestId !== loadRequestIdRef.current) {
        return;
      }

      applyResolvedRobotImport(file, preResolvedImportResult);
      return;
    }

    const importResultPromise = resolveRobotFileDataWithWorker(file, {
      availableFiles: liveAssetsState.availableFiles,
      assets: liveAssetsState.assets,
      usdRobotData: liveAssetsState.getUsdPreparedExportCache(file.name)?.robotData ?? null,
    });

    await waitForNextPaint();

    let importResult: Awaited<ReturnType<typeof resolveRobotFileDataWithWorker>>;
    try {
      importResult = await importResultPromise;
    } catch (error) {
      if (requestId !== loadRequestIdRef.current) {
        return;
      }

      const message = error instanceof Error
        ? error.message
        : t.failedToParseFormat.replace('{format}', file.format.toUpperCase());
      setDocumentLoadState({
        status: 'error',
        fileName: file.name,
        format: file.format,
        error: message,
      });
      showToast(message, 'info');
      return;
    }

    if (requestId !== loadRequestIdRef.current) {
      return;
    }

    applyResolvedRobotImport(file, importResult);
  }, [
    applyResolvedRobotImport,
    setDocumentLoadState,
    setSelection,
    setSelectedFile,
    setOriginalFileFormat,
    setAppMode,
    showToast,
    t,
  ]);

  const handleLoadRobot = useCallback((file: RobotFile) => {
    loadRobotFile(file);
  }, [loadRobotFile]);

  loadRobotByNameRef.current = loadRobotFile;

  useEffect(() => {
    if (typeof window === 'undefined' || typeof Worker === 'undefined') {
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      if (cancelled) {
        return;
      }

      void Promise.allSettled([
        prepareImportPayloadWithWorker({ files: [], existingPaths: [] }),
        resolveRobotFileDataWithWorker({
          name: '__urdf_studio_worker_prewarm__/warmup.stl',
          format: 'mesh',
          content: '',
        }),
      ]);
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, []);

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
  const { handleExportProject: runProjectExport, handleExportWithConfig } = useFileExport();

  const handleExportProject = useCallback(() => {
    void (async () => {
      try {
        const result = await runProjectExport();
        if (result.partial && result.warnings.length > 0) {
          showToast(result.warnings[0], 'info');
        }
      } catch (error) {
        showToast(
          error instanceof Error && error.message
            ? error.message
            : t.exportFailedParse,
          'info',
        );
      }
    })();
  }, [runProjectExport, showToast, t.exportFailedParse]);

  // AI changes handler
  const handleApplyAIChanges = useCallback((data: AIApplyChangesPayload) => {
    const validated = validateAIApplyPayload(data);
    if (!validated.ok) {
      showToast(t[validated.reason], 'info');
      return;
    }

    const currentRobot = useRobotStore.getState();
    setRobot({
      name: validated.value.name?.trim() || currentRobot.name,
      links: validated.value.links,
      joints: validated.value.joints,
      rootLinkId: validated.value.rootLinkId,
    });
    setAppMode('skeleton');
  }, [setAppMode, setRobot, showToast, t]);

  useImportInputBinding({
    importInputRef,
    importFolderInputRef,
    onImport: handleImport,
  });

  const handleOpenAIModal = useCallback(() => {
    const liveAssetsState = useAssetsStore.getState();
    const currentSelectedFile = liveAssetsState.selectedFile;
    const currentDocumentLoadState = liveAssetsState.documentLoadState;
    const isSelectedUsdHydrating = currentSelectedFile?.format === 'usd'
      && currentDocumentLoadState.status === 'hydrating'
      && currentDocumentLoadState.fileName === currentSelectedFile.name;

    if (isSelectedUsdHydrating) {
      showToast(t.usdLoadInProgress, 'info');
      return;
    }
    setShouldRenderAIModal(true);
    void loadAIModalModule();
    setIsAIModalOpen(true);
  }, [setIsAIModalOpen, showToast, t.usdLoadInProgress]);

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
          <AIModalConnector
            isOpen={isAIModalOpen}
            onClose={() => {
              setIsAIModalOpen(false);
              setShouldRenderAIModal(false);
            }}
            lang={lang}
            onApplyChanges={handleApplyAIChanges}
          />
        </Suspense>
      )}

      {/* Export Dialog */}
      {isExportDialogOpen && (
        <Suspense fallback={<LazyOverlayFallback label={loadingLabel} />}>
          <ExportDialogConnector
            target={exportDialogTarget}
            lang={lang}
            isExporting={isExporting}
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
                const result = await handleExportWithConfig(config as never, exportDialogTarget, {
                  onProgress: options?.onProgress,
                });
                if (result.partial && result.warnings.length > 0) {
                  showToast(result.warnings[0], 'info');
                }
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
