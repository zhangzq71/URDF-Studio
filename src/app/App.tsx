/**
 * Main App Component
 * Root component that assembles all pieces together
 */
import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Providers } from './Providers';
import { AppLayout } from './AppLayout';
import { SettingsModal } from './components/SettingsModal';
import { AboutModal } from './components/AboutModal';
import { LazyOverlayFallback } from './components/LazyOverlayFallback';
import { useAppShellState, useFileImport, useFileExport, useImportInputBinding } from './hooks';
import { useRobotStore, useUIStore, useSelectionStore, useAssetsStore, useAssemblyStore } from '@/store';
import { parseURDF, parseMJCF, parseUSDA, parseXacro } from '@/core/parsers';
import type { RobotFile, RobotState, UrdfLink, UrdfJoint } from '@/types';
import { GeometryType } from '@/types';
import { translations } from '@/shared/i18n';

const loadAIModalModule = () => import('@/features/ai-assistant/components/AIModal');
const loadURDFGalleryModule = () => import('@/features/urdf-gallery/components/URDFGallery');
const loadExportDialogModule = () => import('@/features/file-io/components/ExportDialog');

const AIModal = lazy(() =>
  loadAIModalModule().then((module) => ({ default: module.AIModal }))
);

const URDFGallery = lazy(() =>
  loadURDFGalleryModule().then((module) => ({ default: module.URDFGallery }))
);

const ExportDialog = lazy(() =>
  loadExportDialogModule().then((module) => ({ default: module.ExportDialog }))
);

function AppContent() {
  // Refs for file inputs
  const importInputRef = useRef<HTMLInputElement>(null);
  const importFolderInputRef = useRef<HTMLInputElement>(null);
  const [shouldRenderAIModal, setShouldRenderAIModal] = useState(false);

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
  const availableFiles = useAssetsStore((state) => state.availableFiles);
  const assets = useAssetsStore((state) => state.assets);
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
    isURDFGalleryOpen,
    setIsURDFGalleryOpen,
    isExportDialogOpen,
    setIsExportDialogOpen,
    isExporting,
    setIsExporting,
    viewConfig,
    setViewConfig,
  } = useAppShellState();

  // Build robot state for AI modal
  // In workspace mode, AI inspection/select should target merged assembly ids.
  const robot: RobotState = useMemo(() => {
    if (assemblyState && sidebarTab === 'workspace') {
      const mergedRobot = getMergedRobotData();
      if (mergedRobot) {
        return {
          ...mergedRobot,
          selection,
        };
      }
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
    assemblyState,
    sidebarTab,
    getMergedRobotData,
  ]);

  // Load robot file handler
  const handleLoadRobot = useCallback((file: RobotFile) => {
    let newState: RobotState | null = null;

    switch (file.format) {
      case 'urdf':
        newState = parseURDF(file.content);
        break;
      case 'mjcf':
        newState = parseMJCF(file.content);
        break;
      case 'usd':
        newState = parseUSDA(file.content);
        break;
      case 'xacro':
        const fileMap: Record<string, string> = {};
        availableFiles.forEach(f => { fileMap[f.name] = f.content; });
        Object.entries(assets).forEach(([path, content]) => {
          if (typeof content === 'string') fileMap[path] = content;
        });
        const pathParts = file.name.split('/');
        pathParts.pop();
        newState = parseXacro(file.content, {}, fileMap, pathParts.join('/'));
        break;
      case 'mesh': {
        const meshName = file.name.split('/').pop()?.replace(/\.[^/.]+$/, '') ?? 'mesh';
        const linkId = 'base_link';
        newState = {
          name: meshName,
          links: {
            [linkId]: {
              id: linkId,
              name: 'base_link',
              visible: true,
              visual: {
                type: GeometryType.MESH,
                dimensions: { x: 1, y: 1, z: 1 },
                color: '#808080',
                meshPath: file.name,
                origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
              },
              collision: {
                type: GeometryType.NONE,
                dimensions: { x: 0, y: 0, z: 0 },
                color: '#ef4444',
                origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
              },
              inertial: {
                mass: 1.0,
                origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
                inertia: { ixx: 0.1, ixy: 0, ixz: 0, iyy: 0.1, iyz: 0, izz: 0.1 },
              },
            },
          },
          joints: {},
          rootLinkId: linkId,
          selection: { type: null, id: null },
        };
        break;
      }
    }

    if (newState) {
      const { selection: _, ...data } = newState;
      setRobot(data);
      setSelection({ type: null, id: null });
      setSelectedFile(file);
      setOriginalUrdfContent(file.format === 'mesh' ? '' : file.content);
      setOriginalFileFormat(file.format === 'mesh' ? null : file.format);
      setAppMode('detail');
    } else {
      alert(t.failedToParseFormat.replace('{format}', file.format.toUpperCase()));
    }
  }, [availableFiles, assets, setRobot, setSelection, setSelectedFile, setOriginalUrdfContent, setOriginalFileFormat, setAppMode, t]);

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
      void loadURDFGalleryModule();
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
    setShouldRenderAIModal(true);
    void loadAIModalModule();
    setIsAIModalOpen(true);
  }, [setIsAIModalOpen]);

  const handleOpenExportDialog = useCallback(() => {
    void loadExportDialogModule();
    setIsExportDialogOpen(true);
  }, [setIsExportDialogOpen]);

  const handleOpenURDFGallery = useCallback(() => {
    void loadURDFGalleryModule();
    setIsURDFGalleryOpen(true);
  }, [setIsURDFGalleryOpen]);

  const loadingLabel = t.loadingPanel;

  return (
    <>
      <AppLayout
        importInputRef={importInputRef}
        importFolderInputRef={importFolderInputRef}
        onFileDrop={(files) => handleImport(files as any)}
        onOpenExport={handleOpenExportDialog}
        onExportProject={handleExportProject}
        showToast={showToast}
        onOpenAI={handleOpenAIModal}
        isCodeViewerOpen={isCodeViewerOpen}
        setIsCodeViewerOpen={setIsCodeViewerOpen}
        onOpenSettings={() => openSettings()}
        onOpenAbout={() => setIsAboutOpen(true)}
        onOpenURDFGallery={handleOpenURDFGallery}
        viewConfig={viewConfig}
        setViewConfig={setViewConfig}
        onLoadRobot={handleLoadRobot}
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
            onClose={() => setIsExportDialogOpen(false)}
            onExport={async (config) => {
              setIsExporting(true);
              try {
                await handleExportWithConfig(config);
              } finally {
                setIsExporting(false);
                setIsExportDialogOpen(false);
              }
            }}
            lang={lang}
            isExporting={isExporting}
          />
        </Suspense>
      )}

      {/* URDF Gallery */}
      {isURDFGalleryOpen && (
        <Suspense fallback={<LazyOverlayFallback label={loadingLabel} />}>
          <URDFGallery
            onClose={() => setIsURDFGalleryOpen(false)}
            lang={lang}
            onImport={(e) => handleImport(e.target.files)}
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
