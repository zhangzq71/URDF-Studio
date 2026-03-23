/**
 * App Layout Component
 * Main application layout with Header and workspace area
 */
import React, { useRef, useCallback, useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Header } from './components/Header';
import { AppLayoutOverlays } from './components/AppLayoutOverlays';
import { FileDropOverlay } from './components/FileDropOverlay';
import { UnifiedViewer } from './components/UnifiedViewer';
import {
  loadBridgeCreateModalModule,
  loadCollisionOptimizationDialogModule,
} from './utils/overlayLoaders';
import type { HeaderQuickAction } from './components/header/types';
import { TreeEditor } from '@/features/robot-tree';
import { PropertyEditor } from '@/features/property-editor/components/PropertyEditor';
import type { ToolMode } from '@/features/urdf-viewer';
import {
  getCurrentUsdViewerSceneSnapshot,
  prepareUsdExportCacheFromSnapshot,
} from '@/features/urdf-viewer/utils/usdExportBundle';
import type { ViewerRobotDataResolution } from '@/features/urdf-viewer/utils/viewerRobotData';
import {
  useAppLayoutEffects,
  useCollisionOptimizationWorkflow,
  useLibraryFileActions,
  useViewerOrchestration,
  useWorkspaceMutations,
  useWorkspaceSourceSync,
} from './hooks';
import { shouldUseEmptyRobotForUsdHydration } from './hooks/workspaceSourceSyncUtils';
import { useUIStore, useSelectionStore, useAssetsStore, useRobotStore, useAssemblyStore, useCollisionTransformStore } from '@/store';
import { parseMJCF, parseURDF } from '@/core/parsers';
import { rewriteRobotMeshPathsForSource } from '@/core/parsers/meshPathUtils';
import type { RobotData, RobotFile, UsdSceneSnapshot } from '@/types';
import { translations } from '@/shared/i18n';
import { createRobotSemanticSnapshot } from '@/shared/utils/robot/semanticSnapshot';
import { processMJCFIncludes } from '@/core/parsers/mjcf/mjcfSourceResolver';
import { registerPendingUsdCacheFlusher } from './utils/pendingUsdCache';
import { shouldApplyUsdStageHydration } from './utils/usdStageHydration';
import { buildUsdHydrationPersistencePlan } from './utils/usdHydrationPersistence';

interface UsdPersistenceBaseline {
  fileName: string | null;
  robotSnapshot: string | null;
  fallbackSceneSnapshot: UsdSceneSnapshot | null;
  hadPreparedExportCache: boolean;
  hadSceneSnapshot: boolean;
}

const EMPTY_USD_PERSISTENCE_BASELINE: UsdPersistenceBaseline = {
  fileName: null,
  robotSnapshot: null,
  fallbackSceneSnapshot: null,
  hadPreparedExportCache: false,
  hadSceneSnapshot: false,
};

function normalizeUsdPersistenceFileName(path: string | null | undefined): string {
  return String(path || '').trim().replace(/^\/+/, '').split('?')[0];
}

interface AppLayoutProps {
  // Import handlers (passed from App)
  importInputRef: React.RefObject<HTMLInputElement>;
  importFolderInputRef: React.RefObject<HTMLInputElement>;
  onFileDrop: (files: File[]) => void;
  onOpenExport: () => void;
  onOpenLibraryExport: (file: RobotFile) => void;
  onExportProject: () => void;
  // Toast handler
  showToast: (message: string, type?: 'info' | 'success') => void;
  // Modal handlers
  onOpenAI: () => void;
  isCodeViewerOpen: boolean;
  setIsCodeViewerOpen: (open: boolean) => void;
  onOpenSettings: () => void;
  onOpenAbout: () => void;
  onOpenUser?: () => void;
  headerQuickAction?: HeaderQuickAction;
  // View config
  viewConfig: {
    showToolbar: boolean;
    showOptionsPanel: boolean;
    showSkeletonOptionsPanel: boolean;
    showJointPanel: boolean;
  };
  setViewConfig: React.Dispatch<React.SetStateAction<{
    showToolbar: boolean;
    showOptionsPanel: boolean;
    showSkeletonOptionsPanel: boolean;
    showJointPanel: boolean;
  }>>;
  // Robot file handling
  onLoadRobot: (file: RobotFile) => void;
  viewerReloadKey: number;
}

export function AppLayout({
  importInputRef,
  importFolderInputRef,
  onFileDrop,
  onOpenExport,
  onOpenLibraryExport,
  onExportProject,
  showToast,
  onOpenAI,
  isCodeViewerOpen,
  setIsCodeViewerOpen,
  onOpenSettings,
  onOpenAbout,
  onOpenUser,
  headerQuickAction,
  viewConfig,
  setViewConfig,
  onLoadRobot,
  viewerReloadKey,
}: AppLayoutProps) {
  // UI Store (grouped with useShallow to reduce subscriptions)
  const { appMode, lang, theme, sidebar, toggleSidebar, sidebarTab, setAppMode } = useUIStore(
    useShallow((state) => ({
      appMode: state.appMode,
      lang: state.lang,
      theme: state.theme,
      sidebar: state.sidebar,
      toggleSidebar: state.toggleSidebar,
      sidebarTab: state.sidebarTab,
      setAppMode: state.setAppMode,
    }))
  );
  const t = translations[lang];

  // Selection Store
  const { selection, setSelection, setHoveredSelection, focusTarget, focusOn, pulseSelection } = useSelectionStore(
    useShallow((state) => ({
      selection: state.selection,
      setSelection: state.setSelection,
      setHoveredSelection: state.setHoveredSelection,
      focusTarget: state.focusTarget,
      focusOn: state.focusOn,
      pulseSelection: state.pulseSelection,
    }))
  );

  // Assets Store
  const {
    assets, motorLibrary, availableFiles, selectedFile, allFileContents,
    setAvailableFiles, setSelectedFile, setAllFileContents, originalUrdfContent, setOriginalUrdfContent,
    uploadAsset, removeRobotFile, removeRobotFolder, renameRobotFolder, clearRobotLibrary,
    getUsdPreparedExportCache, documentLoadState, setDocumentLoadState,
  } = useAssetsStore(
    useShallow((state) => ({
      assets: state.assets,
      motorLibrary: state.motorLibrary,
      availableFiles: state.availableFiles,
      selectedFile: state.selectedFile,
      allFileContents: state.allFileContents,
      setAvailableFiles: state.setAvailableFiles,
      setSelectedFile: state.setSelectedFile,
      setAllFileContents: state.setAllFileContents,
      originalUrdfContent: state.originalUrdfContent,
      setOriginalUrdfContent: state.setOriginalUrdfContent,
      uploadAsset: state.uploadAsset,
      removeRobotFile: state.removeRobotFile,
      removeRobotFolder: state.removeRobotFolder,
      renameRobotFolder: state.renameRobotFolder,
      clearRobotLibrary: state.clearRobotLibrary,
      getUsdPreparedExportCache: state.getUsdPreparedExportCache,
      documentLoadState: state.documentLoadState,
      setDocumentLoadState: state.setDocumentLoadState,
    }))
  );

  // Robot Store
  const {
    robotName, robotLinks, robotJoints, rootLinkId, robotMaterials, closedLoopConstraints,
    setName, setRobot, resetRobot, addChild, deleteSubtree,
    updateLink, updateJoint, setAllLinksVisibility, setJointAngle,
  } = useRobotStore(
    useShallow((state) => ({
      robotName: state.name,
      robotLinks: state.links,
      robotJoints: state.joints,
      rootLinkId: state.rootLinkId,
      robotMaterials: state.materials,
      closedLoopConstraints: state.closedLoopConstraints,
      setName: state.setName,
      setRobot: state.setRobot,
      resetRobot: state.resetRobot,
      addChild: state.addChild,
      deleteSubtree: state.deleteSubtree,
      updateLink: state.updateLink,
      updateJoint: state.updateJoint,
      setAllLinksVisibility: state.setAllLinksVisibility,
      setJointAngle: state.setJointAngle,
    }))
  );
  // Assembly Store
  const {
    assemblyState, addComponent, removeComponent,
    addBridge, removeBridge, getMergedRobotData,
    updateComponentName, updateComponentRobot, renameComponentSourceFolder,
  } = useAssemblyStore(
    useShallow((state) => ({
      assemblyState: state.assemblyState,
      addComponent: state.addComponent,
      removeComponent: state.removeComponent,
      addBridge: state.addBridge,
      removeBridge: state.removeBridge,
      getMergedRobotData: state.getMergedRobotData,
      updateComponentName: state.updateComponentName,
      updateComponentRobot: state.updateComponentRobot,
      renameComponentSourceFolder: state.renameComponentSourceFolder,
    }))
  );

  const snapshotActionRef = useRef<(() => void) | null>(null);
  const transformPendingRef = useRef(false);
  const pendingUsdAssemblyFileRef = useRef<RobotFile | null>(null);
  const pendingUsdHydrationFileRef = useRef<string | null>(null);
  const usdPersistenceBaselineRef = useRef<UsdPersistenceBaseline>(EMPTY_USD_PERSISTENCE_BASELINE);
  const [pendingViewerToolMode, setPendingViewerToolMode] = useState<ToolMode | null>(null);
  const [isBridgeModalOpen, setIsBridgeModalOpen] = useState(false);
  const [isCollisionOptimizerOpen, setIsCollisionOptimizerOpen] = useState(false);
  const [shouldRenderBridgeModal, setShouldRenderBridgeModal] = useState(false);
  const clearSelection = useCallback(() => {
    setSelection({ type: null, id: null });
  }, [setSelection]);

  const isSelectedUsdHydrating = shouldUseEmptyRobotForUsdHydration({
    selectedFileFormat: selectedFile?.format ?? null,
    selectedFileName: selectedFile?.name ?? null,
    documentLoadStatus: documentLoadState.status,
    documentLoadFileName: documentLoadState.fileName,
  });

  useEffect(() => {
    if (!isSelectedUsdHydrating || selectedFile?.format !== 'usd') {
      pendingUsdHydrationFileRef.current = null;
      return;
    }

    pendingUsdHydrationFileRef.current = selectedFile.name;
  }, [isSelectedUsdHydrating, selectedFile]);

  const flushPendingUsdCache = useCallback(() => {
    const liveAssetsState = useAssetsStore.getState();
    const currentSelectedFile = liveAssetsState.selectedFile;
    if (!currentSelectedFile || currentSelectedFile.format !== 'usd') {
      return;
    }

    const normalizedSelectedFileName = normalizeUsdPersistenceFileName(currentSelectedFile.name);
    const baseline = usdPersistenceBaselineRef.current;
    if (!baseline.fileName || baseline.fileName !== normalizedSelectedFileName || !baseline.robotSnapshot) {
      return;
    }

    const liveRobotState = useRobotStore.getState();
    const currentRobotData: RobotData = {
      name: liveRobotState.name,
      links: liveRobotState.links,
      joints: liveRobotState.joints,
      rootLinkId: liveRobotState.rootLinkId,
      materials: liveRobotState.materials,
      closedLoopConstraints: liveRobotState.closedLoopConstraints,
    };
    const currentRobotSnapshot = createRobotSemanticSnapshot(currentRobotData);
    const hasSemanticEdits = currentRobotSnapshot !== baseline.robotSnapshot;

    if (!hasSemanticEdits) {
      if (!baseline.hadSceneSnapshot) {
        liveAssetsState.setUsdSceneSnapshot(currentSelectedFile.name, null);
      }
      if (!baseline.hadPreparedExportCache) {
        liveAssetsState.setUsdPreparedExportCache(currentSelectedFile.name, null);
      }
      return;
    }

    const sceneSnapshot = getCurrentUsdViewerSceneSnapshot({
      stageSourcePath: currentSelectedFile.name,
    }) ?? baseline.fallbackSceneSnapshot;

    if (!sceneSnapshot) {
      return;
    }

    const preparedCache = prepareUsdExportCacheFromSnapshot(sceneSnapshot, {
      fileName: currentSelectedFile.name,
    });

    liveAssetsState.setUsdSceneSnapshot(currentSelectedFile.name, sceneSnapshot);
    liveAssetsState.setUsdPreparedExportCache(currentSelectedFile.name, preparedCache);
    usdPersistenceBaselineRef.current = {
      fileName: normalizedSelectedFileName,
      robotSnapshot: currentRobotSnapshot,
      fallbackSceneSnapshot: sceneSnapshot,
      hadPreparedExportCache: Boolean(preparedCache),
      hadSceneSnapshot: true,
    };
  }, []);

  useEffect(() => {
    registerPendingUsdCacheFlusher(flushPendingUsdCache);
    return () => {
      registerPendingUsdCacheFlusher(null);
    };
  }, [flushPendingUsdCache]);

  useEffect(() => {
    if (selectedFile?.format === 'usd') {
      return;
    }

    usdPersistenceBaselineRef.current = EMPTY_USD_PERSISTENCE_BASELINE;
  }, [selectedFile?.format]);

  const handleRobotDataResolved = useCallback((result: ViewerRobotDataResolution) => {
    const liveAssetsState = useAssetsStore.getState();
    const normalizedStageSourcePath = String(result.stageSourcePath || '').replace(/^\/+/, '');
    const resolvedSelectedFile = liveAssetsState.selectedFile
      ?? (
        normalizedStageSourcePath
          ? liveAssetsState.availableFiles.find((file) => (
              file.format === 'usd'
              && String(file.name || '').replace(/^\/+/, '') === normalizedStageSourcePath
            )) ?? null
          : null
      )
      ?? selectedFile;

    if (!resolvedSelectedFile) {
      return;
    }

    const normalizedSelectedFileName = String(resolvedSelectedFile.name || '').replace(/^\/+/, '');
    if (normalizedSelectedFileName && normalizedStageSourcePath && normalizedSelectedFileName !== normalizedStageSourcePath) {
      return;
    }

    if (resolvedSelectedFile.format === 'usd') {
      const existingSceneSnapshot = liveAssetsState.getUsdSceneSnapshot(resolvedSelectedFile.name);
      const existingPreparedExportCache = liveAssetsState.getUsdPreparedExportCache(resolvedSelectedFile.name);
      const hydrationPersistencePlan = buildUsdHydrationPersistencePlan({
        resolution: result,
        existingSceneSnapshot,
        existingPreparedExportCache,
      });
      const preparedHydrationExportCache = hydrationPersistencePlan.shouldSeedPreparedExportCache
        && hydrationPersistencePlan.sceneSnapshot
        ? prepareUsdExportCacheFromSnapshot(hydrationPersistencePlan.sceneSnapshot, {
            fileName: resolvedSelectedFile.name,
            resolution: result,
          })
        : existingPreparedExportCache;

      if (hydrationPersistencePlan.shouldSeedSceneSnapshot && hydrationPersistencePlan.sceneSnapshot) {
        liveAssetsState.setUsdSceneSnapshot(resolvedSelectedFile.name, hydrationPersistencePlan.sceneSnapshot);
      }
      if (hydrationPersistencePlan.shouldSeedPreparedExportCache && preparedHydrationExportCache) {
        liveAssetsState.setUsdPreparedExportCache(resolvedSelectedFile.name, preparedHydrationExportCache);
      }

      usdPersistenceBaselineRef.current = {
        fileName: normalizedSelectedFileName,
        robotSnapshot: createRobotSemanticSnapshot(result.robotData),
        fallbackSceneSnapshot: hydrationPersistencePlan.sceneSnapshot as UsdSceneSnapshot | null,
        hadPreparedExportCache: Boolean(preparedHydrationExportCache),
        hadSceneSnapshot: Boolean(hydrationPersistencePlan.sceneSnapshot),
      };
    }

    const pendingHydrationFileName = pendingUsdHydrationFileRef.current
      ?? (
        liveAssetsState.documentLoadState.status === 'hydrating'
          ? liveAssetsState.documentLoadState.fileName
          : null
      );

    const shouldApplyResolvedRobotData = resolvedSelectedFile.format !== 'usd'
      || shouldApplyUsdStageHydration({
        pendingFileName: pendingHydrationFileName,
        selectedFileName: resolvedSelectedFile.name,
        stageSourcePath: result.stageSourcePath,
      });

    if (shouldApplyResolvedRobotData) {
      const isColdUsdHydration = resolvedSelectedFile.format === 'usd'
        && pendingHydrationFileName === resolvedSelectedFile.name;
      setRobot(
        result.robotData,
        resolvedSelectedFile.format === 'usd'
          ? isColdUsdHydration
            ? { resetHistory: true, label: 'Hydrate USD stage' }
            : { skipHistory: true, label: 'Hydrate USD stage' }
          : undefined,
      );
      setDocumentLoadState({
        status: 'ready',
        fileName: resolvedSelectedFile.name,
        format: resolvedSelectedFile.format,
        error: null,
      });
      setSelection({ type: null, id: null });
      if (resolvedSelectedFile.format === 'usd') {
        pendingUsdHydrationFileRef.current = null;
      }
    }

    const pendingUsdAssemblyFile = pendingUsdAssemblyFileRef.current;
    if (
      pendingUsdAssemblyFile
      && resolvedSelectedFile.format === 'usd'
      && pendingUsdAssemblyFile.name === resolvedSelectedFile.name
    ) {
      const component = addComponent(pendingUsdAssemblyFile, {
        availableFiles: liveAssetsState.availableFiles,
        assets: liveAssetsState.assets,
        preResolvedRobotData: result.robotData,
      });
      if (component) {
        showToast(t.addedComponent.replace('{name}', component.name), 'success');
      }
      pendingUsdAssemblyFileRef.current = null;
    }
  }, [addComponent, selectedFile, setDocumentLoadState, setRobot, setSelection, showToast, t]);

  const {
    emptyRobot,
    robot,
    jointAngleState,
    jointMotionState,
    showVisual,
    urdfContentForViewer,
    viewerSourceFilePath,
    sourceCodeContent,
    sourceCodeDocumentFlavor,
    filePreview,
    previewRobot,
    previewFileName,
    handlePreviewFile,
    handleClosePreview,
  } = useWorkspaceSourceSync({
    assemblyState,
    sidebarTab,
    getMergedRobotData,
    selection,
    robotName,
    robotLinks,
    robotJoints,
    rootLinkId,
    robotMaterials,
    closedLoopConstraints,
    isCodeViewerOpen,
    selectedFile,
    setSelectedFile,
    availableFiles,
    allFileContents,
    setAvailableFiles,
    setAllFileContents,
    originalUrdfContent,
    isSelectedUsdHydrating,
    assets,
    getUsdPreparedExportCache,
    setOriginalUrdfContent,
  });

  const previewContextRobot = previewRobot ?? robot;
  const isPreviewingWorkspaceSource = Boolean(previewRobot);

  const {
    handleSelect,
    handleSelectGeometry,
    handleViewerSelect,
    handleViewerMeshSelect,
    handleTransformPendingChange,
    handleHover,
    handleFocus,
  } = useViewerOrchestration({
    transformPendingRef,
    setSelection,
    pulseSelection,
    setHoveredSelection,
    focusOn,
  });

  const setPendingCollisionTransform = useCollisionTransformStore((state) => state.setPendingCollisionTransform);
  const clearPendingCollisionTransform = useCollisionTransformStore((state) => state.clearPendingCollisionTransform);

  const {
    handleNameChange,
    handleUpdate,
    handleCollisionTransform,
    handleAddChild,
    handleAddCollisionBody,
    handleDelete,
    handleRenameComponent,
    handleSetShowVisual,
    handleJointChange,
  } = useWorkspaceMutations({
    sidebarTab,
    assemblyState,
    robotLinks,
    rootLinkId,
    setName,
    addChild,
    deleteSubtree,
    updateLink,
    updateJoint,
    setAllLinksVisibility,
    setJointAngle,
    updateComponentName,
    updateComponentRobot,
    removeComponent,
    removeBridge,
    focusOn,
    setSelection,
    setPendingCollisionTransform,
    clearPendingCollisionTransform,
    handleTransformPendingChange,
  });

  const {
    handleUploadAsset,
    handleDeleteLibraryFile,
    handleDeleteLibraryFolder,
    handleRenameLibraryFolder,
    handleDeleteAllLibraryFiles,
    handleExportLibraryFile,
  } = useLibraryFileActions({
    availableFiles,
    selectedFile,
    assemblyState,
    emptyRobot,
    removeComponent,
    removeRobotFile,
    removeRobotFolder,
    renameRobotFolder,
    renameComponentSourceFolder,
    clearRobotLibrary,
    resetRobot,
    clearSelection,
    uploadAsset,
    openLibraryExportDialog: onOpenLibraryExport,
    showToast,
    t,
  });

  const handleAddComponent = useCallback((file: RobotFile) => {
    const preResolvedRobotData = file.format === 'usd'
      ? getUsdPreparedExportCache(file.name)?.robotData ?? null
      : null;

    if (file.format === 'usd' && !preResolvedRobotData) {
      pendingUsdAssemblyFileRef.current = file;
      onLoadRobot(file);
      return;
    }

    const component = addComponent(file, {
      availableFiles,
      assets,
      preResolvedRobotData,
    });
    if (component) {
      showToast(t.addedComponent.replace('{name}', component.name), 'success');
    }
  }, [addComponent, assets, availableFiles, getUsdPreparedExportCache, onLoadRobot, showToast, t]);

  const handleCreateBridge = useCallback(() => {
    setShouldRenderBridgeModal(true);
    void loadBridgeCreateModalModule();
    setIsBridgeModalOpen(true);
  }, []);

  const handleOpenCollisionOptimizer = useCallback(() => {
    void loadCollisionOptimizationDialogModule();
    setIsCollisionOptimizerOpen(true);
  }, []);

  const handleOpenMeasureTool = useCallback(() => {
    setViewConfig((prev) => ({ ...prev, showToolbar: true }));
    if (appMode === 'skeleton') {
      setAppMode('detail');
    }
    setPendingViewerToolMode('measure');
  }, [appMode, setAppMode, setViewConfig]);

  const {
    collisionOptimizationSource,
    handlePreviewCollisionOptimizationTarget,
    handleApplyCollisionOptimization,
  } = useCollisionOptimizationWorkflow({
    assemblyState,
    sidebarTab,
    robotName,
    robotLinks,
    robotJoints,
    rootLinkId,
    robotMaterials,
    setRobot,
    updateComponentRobot,
    focusOn,
    pulseSelection,
    setSelection,
    showToast,
    t,
  });

  const handleCodeChange = useCallback((newCode: string) => {
    if (selectedFile?.format === 'usd') {
      return;
    }

    const mjcfBasePath = selectedFile?.name
      ? selectedFile.name.split('/').slice(0, -1).join('/')
      : '';
    const parsedState = selectedFile?.format === 'mjcf'
      ? parseMJCF(processMJCFIncludes(newCode, availableFiles, mjcfBasePath))
      : parseURDF(newCode);
    const newState = parsedState
      ? rewriteRobotMeshPathsForSource(parsedState, selectedFile?.name)
      : null;

    if (newState) {
      const newData = {
        name: newState.name,
        links: newState.links,
        joints: newState.joints,
        rootLinkId: newState.rootLinkId,
        materials: newState.materials,
      };
      setRobot(newData);
    }
  }, [availableFiles, selectedFile?.format, selectedFile?.name, setRobot]);

  const handleSnapshot = useCallback(() => {
    if (snapshotActionRef.current) {
      try {
        snapshotActionRef.current();
        showToast(t.generatingSnapshot, 'info');
      } catch (e) {
        console.error('Snapshot failed:', e);
        showToast(t.snapshotFailed, 'info');
      }
    }
  }, [showToast, t]);

  const {
    isFileDragActive,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    prefetchSourceCodeEditor,
  } = useAppLayoutEffects({
    robot,
    selection,
    clearSelection,
    onFileDrop,
    onDropError: () => showToast(t.failedToProcessFiles, 'info'),
  });

  const handleOpenCodeViewer = useCallback(() => {
    if (isSelectedUsdHydrating) {
      showToast(t.usdLoadInProgress, 'info');
      return;
    }
    prefetchSourceCodeEditor();
    setIsCodeViewerOpen(true);
  }, [isSelectedUsdHydrating, prefetchSourceCodeEditor, setIsCodeViewerOpen, showToast, t.usdLoadInProgress]);

  const handlePrefetchCodeViewer = useCallback(() => {
    prefetchSourceCodeEditor();
  }, [prefetchSourceCodeEditor]);

  return (
    <div
      className="flex flex-col h-screen font-sans bg-google-light-bg dark:bg-app-bg text-slate-800 dark:text-slate-200"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <FileDropOverlay
        visible={isFileDragActive}
        title={t.dropFilesToImport}
        hint={t.dropFilesToImportHint}
      />

      {/* Hidden file inputs */}
      <input
        type="file"
        accept=".zip,.urdf,.xml,.usda,.usdc,.usdz,.usd,.xacro,.usp"
        ref={importInputRef}
        className="hidden"
      />
      <input
        type="file"
        ref={importFolderInputRef}
        className="hidden"
        {...{ webkitdirectory: '', directory: '' } as React.InputHTMLAttributes<HTMLInputElement>}
      />

      {/* Header */}
      <Header
        onImportFile={() => importInputRef.current?.click()}
        onImportFolder={() => importFolderInputRef.current?.click()}
        onOpenExport={onOpenExport}
        onExportProject={onExportProject}
        onOpenAI={onOpenAI}
        onOpenMeasureTool={handleOpenMeasureTool}
        onOpenCodeViewer={handleOpenCodeViewer}
        onPrefetchCodeViewer={handlePrefetchCodeViewer}
        onOpenSettings={onOpenSettings}
        onOpenAbout={onOpenAbout}
        onOpenUser={onOpenUser}
        quickAction={headerQuickAction}
        onSnapshot={handleSnapshot}
        onOpenCollisionOptimizer={handleOpenCollisionOptimizer}
        viewConfig={viewConfig}
        setViewConfig={setViewConfig}
      />

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden">
        <TreeEditor
          robot={previewContextRobot}
          onSelect={handleSelect}
          onSelectGeometry={handleSelectGeometry}
          onFocus={handleFocus}
          onAddChild={handleAddChild}
          onAddCollisionBody={handleAddCollisionBody}
          onDelete={handleDelete}
          onNameChange={handleNameChange}
          onUpdate={handleUpdate}
          showVisual={showVisual}
          setShowVisual={handleSetShowVisual}
          mode={appMode}
          lang={lang}
          theme={theme}
          collapsed={sidebar.leftCollapsed}
          onToggle={() => toggleSidebar('left')}
          availableFiles={availableFiles}
          onLoadRobot={onLoadRobot}
          currentFileName={previewFileName ?? selectedFile?.name}
          assemblyState={assemblyState}
          onAddComponent={handleAddComponent}
          onDeleteLibraryFile={handleDeleteLibraryFile}
          onDeleteLibraryFolder={handleDeleteLibraryFolder}
          onRenameLibraryFolder={handleRenameLibraryFolder}
          onDeleteAllLibraryFiles={handleDeleteAllLibraryFiles}
          onExportLibraryFile={handleExportLibraryFile}
          onCreateBridge={handleCreateBridge}
          onRemoveComponent={removeComponent}
          onRemoveBridge={removeBridge}
          onRenameComponent={handleRenameComponent}
          onPreviewFile={handlePreviewFile}
          previewFileName={previewFileName}
          isReadOnly={isPreviewingWorkspaceSource}
        />

        {/* Viewer Container */}
        <div className="flex-1 relative min-w-0">
          <UnifiedViewer
            robot={robot}
            mode={appMode}
            onSelect={handleViewerSelect}
            onMeshSelect={handleViewerMeshSelect}
            onHover={handleHover}
            onUpdate={handleUpdate}
            assets={assets}
            lang={lang}
            theme={theme}
            showVisual={showVisual}
            setShowVisual={handleSetShowVisual}
            snapshotAction={snapshotActionRef}
            showToolbar={viewConfig.showToolbar}
            setShowToolbar={(show) => setViewConfig(prev => ({ ...prev, showToolbar: show }))}
            showOptionsPanel={viewConfig.showOptionsPanel}
            setShowOptionsPanel={(show) => setViewConfig(prev => ({ ...prev, showOptionsPanel: show }))}
            showSkeletonOptionsPanel={viewConfig.showSkeletonOptionsPanel}
            setShowSkeletonOptionsPanel={(show) => setViewConfig(prev => ({ ...prev, showSkeletonOptionsPanel: show }))}
            showJointPanel={viewConfig.showJointPanel}
            setShowJointPanel={(show) => setViewConfig(prev => ({ ...prev, showJointPanel: show }))}
            availableFiles={availableFiles}
            urdfContent={urdfContentForViewer}
            sourceFilePath={viewerSourceFilePath}
            sourceFile={selectedFile}
            onRobotDataResolved={handleRobotDataResolved}
            jointAngleState={jointAngleState}
            jointMotionState={jointMotionState}
            onJointChange={handleJointChange}
            selection={robot.selection}
            focusTarget={focusTarget}
            isMeshPreview={selectedFile?.format === 'mesh'}
            onCollisionTransform={handleCollisionTransform}
            filePreview={filePreview}
            onClosePreview={handleClosePreview}
            pendingViewerToolMode={pendingViewerToolMode}
            onConsumePendingViewerToolMode={() => setPendingViewerToolMode(null)}
            viewerReloadKey={viewerReloadKey}
          />
        </div>

        <PropertyEditor
          robot={previewContextRobot}
          onUpdate={handleUpdate}
          onSelect={handleSelect}
          onHover={handleHover}
          mode={appMode}
          assets={assets}
          onUploadAsset={handleUploadAsset}
          motorLibrary={motorLibrary}
          lang={lang}
          theme={theme}
          collapsed={sidebar.rightCollapsed}
          onToggle={() => toggleSidebar('right')}
          readOnlyMessage={isPreviewingWorkspaceSource ? t.previewReadOnlyHint : undefined}
        />
      </div>

      <AppLayoutOverlays
        isCodeViewerOpen={isCodeViewerOpen}
        sourceCodeContent={sourceCodeContent}
        sourceCodeDocumentFlavor={sourceCodeDocumentFlavor}
        onCodeChange={handleCodeChange}
        onCloseCodeViewer={() => setIsCodeViewerOpen(false)}
        theme={theme}
        selectedFileName={selectedFile?.name}
        robotName={robot.name}
        lang={lang}
        loadingEditorLabel={t.loadingEditor}
        isCollisionOptimizerOpen={isCollisionOptimizerOpen}
        loadingOptimizerLabel={t.loadingOptimizer}
        collisionOptimizationSource={collisionOptimizationSource}
        assets={assets}
        selection={selection}
        onCloseCollisionOptimizer={() => setIsCollisionOptimizerOpen(false)}
        onSelectCollisionTarget={handlePreviewCollisionOptimizationTarget}
        onApplyCollisionOptimization={handleApplyCollisionOptimization}
        assemblyState={assemblyState}
        shouldRenderBridgeModal={shouldRenderBridgeModal}
        loadingBridgeDialogLabel={t.loadingBridgeDialog}
        isBridgeModalOpen={isBridgeModalOpen}
        onCloseBridgeModal={() => setIsBridgeModalOpen(false)}
        onCreateBridge={addBridge}
      />
    </div>
  );
}

export default AppLayout;
