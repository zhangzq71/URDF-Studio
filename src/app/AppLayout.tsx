/**
 * App Layout Component
 * Main application layout with Header and workspace area
 */
import React, { useRef, useCallback, useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Header } from './components/Header';
import { AppLayoutOverlays } from './components/AppLayoutOverlays';
import { DocumentLoadingOverlay } from './components/DocumentLoadingOverlay';
import { FileDropOverlay } from './components/FileDropOverlay';
import { ImportPreparationOverlay } from './components/ImportPreparationOverlay';
import { SnapshotDialog } from './components/SnapshotDialog';
import { UnifiedViewer } from './components/UnifiedViewer';
import {
  loadBridgeCreateModalModule,
  loadCollisionOptimizationDialogModule,
} from './utils/overlayLoaders';
import { preloadSourceCodeEditorRuntime } from './utils/sourceCodeEditorLoader';
import type { HeaderAction } from './components/header/types';
import { TreeEditor } from '@/features/robot-tree';
import { PropertyEditor } from '@/features/property-editor/components/PropertyEditor';
import {
  getCurrentUsdViewerSceneSnapshot,
  prepareUsdExportCacheFromSnapshot,
  prepareUsdPreparedExportCacheWithWorker,
  resolveUsdExportResolution,
  type ToolMode,
  type ViewerDocumentLoadEvent,
  type ViewerRobotDataResolution,
} from '@/features/urdf-viewer';
import {
  useAppLayoutEffects,
  useCollisionOptimizationWorkflow,
  useLibraryFileActions,
  usePreparedUsdViewerAssets,
  useViewerOrchestration,
  useWorkspaceMutations,
  useWorkspaceSourceSync,
} from './hooks';
import type { ImportPreparationOverlayState } from './hooks/useFileImport';
import {
  parseEditableRobotSourceWithWorker,
  prepareAssemblyComponentWithWorker,
} from './hooks/robotImportWorkerBridge';
import {
  createGeneratedWorkspaceUrdfFile,
  createRobotSourceSnapshot,
  getViewerSourceFile,
  isGeneratedWorkspaceUrdfFileName,
  shouldReseedSingleComponentAssemblyFromActiveFile,
  shouldUseEmptyRobotForUsdHydration,
} from './hooks/workspaceSourceSyncUtils';
import {
  useUIStore,
  useSelectionStore,
  useAssetsStore,
  useRobotStore,
  useAssemblyStore,
  useAssemblySelectionStore,
  useCollisionTransformStore,
} from '@/store';
import { generateURDF } from '@/core/parsers';
import {
  analyzeAssemblyConnectivity,
  buildAssemblyComponentIdentity,
} from '@/core/robot';
import { buildExportableAssemblyRobotData } from '@/core/robot/assemblyTransforms';
import { rewriteRobotMeshPathsForSource } from '@/core/parsers/meshPathUtils';
import type { BridgeJoint, RobotData, RobotFile, UrdfJoint, UrdfLink, UsdSceneSnapshot } from '@/types';
import { translations } from '@/shared/i18n';
import type { SnapshotCaptureOptions } from '@/shared/components/3d';
import { normalizeMergedAppMode } from '@/shared/utils/appMode';
import { ROBOT_IMPORT_ACCEPT_ATTRIBUTE } from '@/shared/utils';
import { createRobotSemanticSnapshot } from '@/shared/utils/robot/semanticSnapshot';
import { registerPendingUsdCacheFlusher } from './utils/pendingUsdCache';
import { shouldApplyUsdStageHydration } from './utils/usdStageHydration';
import { buildUsdHydrationPersistencePlan } from './utils/usdHydrationPersistence';
import {
  shouldIgnoreStaleViewerDocumentLoadEvent,
  shouldIgnoreViewerLoadRegressionAfterReadySameFile,
} from './utils/documentLoadFlow';
import { scheduleFailFastInDev } from '@/core/utils/runtimeDiagnostics';
import type { DocumentLoadState, DocumentLoadStatus } from '@/store/assetsStore';
import { BRIDGE_PREVIEW_ID } from '@/features/assembly/utils/bridgePreview';
import { resolveAssemblyViewerComponentSelection } from '@/features/assembly/utils/bridgeSelection';
import {
  appendMJCFChildBodyToSource,
  appendMJCFBodyCollisionGeomToSource,
  canPatchMJCFEditableSource,
  removeMJCFBodyCollisionGeomFromSource,
  removeMJCFBodyFromSource,
  renameMJCFEntitiesInSource,
  updateMJCFBodyCollisionGeomInSource,
  type MJCFRenameOperation,
} from './utils/mjcfEditableSourcePatch';
import { markUnsavedChangesBaselineSaved } from './utils/unsavedChangesBaseline';

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

interface ProModeRoundtripSession {
  baselineSnapshot: string;
  generatedFileName: string | null;
}

function normalizeUsdPersistenceFileName(path: string | null | undefined): string {
  return String(path || '').trim().replace(/^\/+/, '').split('?')[0];
}

function waitForNextPaint(): Promise<void> {
  if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
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
  headerQuickAction?: HeaderAction;
  headerSecondaryAction?: HeaderAction;
  // View config
  viewConfig: {
    showToolbar: boolean;
    showOptionsPanel: boolean;
    showVisualizerOptionsPanel: boolean;
    showJointPanel: boolean;
  };
  setViewConfig: React.Dispatch<React.SetStateAction<{
    showToolbar: boolean;
    showOptionsPanel: boolean;
    showVisualizerOptionsPanel: boolean;
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
  headerQuickAction,
  headerSecondaryAction,
  viewConfig,
  setViewConfig,
  onLoadRobot,
  viewerReloadKey,
}: AppLayoutProps) {
  // UI Store (grouped with useShallow to reduce subscriptions)
  const { appMode, lang, theme, sidebar, toggleSidebar, sidebarTab, sourceCodeAutoApply } = useUIStore(
    useShallow((state) => ({
      appMode: state.appMode,
      lang: state.lang,
      theme: state.theme,
      sidebar: state.sidebar,
      toggleSidebar: state.toggleSidebar,
      sidebarTab: state.sidebarTab,
      sourceCodeAutoApply: state.sourceCodeAutoApply,
    }))
  );
  const mergedAppMode = normalizeMergedAppMode(appMode);
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
  const { assemblySelection, clearSelection: clearAssemblySelection, selectComponent } = useAssemblySelectionStore(
    useShallow((state) => ({
      assemblySelection: state.selection,
      clearSelection: state.clearSelection,
      selectComponent: state.selectComponent,
    })),
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
    assemblyState, assemblyRevision, addComponent, initAssembly, removeComponent,
    addBridge, removeBridge, getMergedRobotData,
    updateComponentName, updateComponentTransform, updateComponentRobot, updateAssemblyTransform, renameComponentSourceFolder,
  } = useAssemblyStore(
    useShallow((state) => ({
      assemblyState: state.assemblyState,
      assemblyRevision: state.assemblyRevision,
      addComponent: state.addComponent,
      initAssembly: state.initAssembly,
      removeComponent: state.removeComponent,
      addBridge: state.addBridge,
      removeBridge: state.removeBridge,
      getMergedRobotData: state.getMergedRobotData,
      updateComponentName: state.updateComponentName,
      updateComponentTransform: state.updateComponentTransform,
      updateComponentRobot: state.updateComponentRobot,
      updateAssemblyTransform: state.updateAssemblyTransform,
      renameComponentSourceFolder: state.renameComponentSourceFolder,
    }))
  );

  const snapshotActionRef = useRef<((options?: Partial<SnapshotCaptureOptions>) => Promise<void>) | null>(null);
  const transformPendingRef = useRef(false);
  const editableSourceParseRequestRef = useRef(0);
  const pendingUsdAssemblyFileRef = useRef<RobotFile | null>(null);
  const pendingUsdHydrationFileRef = useRef<string | null>(null);
  const usdPersistenceBaselineRef = useRef<UsdPersistenceBaseline>(EMPTY_USD_PERSISTENCE_BASELINE);
  const usdPreparedExportCacheRequestIdRef = useRef(0);
  const proModeRoundtripSessionRef = useRef<ProModeRoundtripSession | null>(null);
  const sourceCodeEditorRuntimeWarmupPromiseRef = useRef<Promise<void> | null>(null);
  const [pendingViewerToolMode, setPendingViewerToolMode] = useState<ToolMode | null>(null);
  const [isBridgeModalOpen, setIsBridgeModalOpen] = useState(false);
  const [isCollisionOptimizerOpen, setIsCollisionOptimizerOpen] = useState(false);
  const [isSnapshotDialogOpen, setIsSnapshotDialogOpen] = useState(false);
  const [isSnapshotCapturing, setIsSnapshotCapturing] = useState(false);
  const [shouldRenderBridgeModal, setShouldRenderBridgeModal] = useState(false);
  const [bridgePreview, setBridgePreview] = useState<BridgeJoint | null>(null);
  const [assemblyComponentPreparationOverlay, setAssemblyComponentPreparationOverlay] = useState<ImportPreparationOverlayState | null>(null);
  const clearSelection = useCallback(() => {
    setSelection({ type: null, id: null });
    clearAssemblySelection();
  }, [clearAssemblySelection, setSelection]);

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

  const queueUsdPreparedExportCacheBuild = useCallback((args: {
    fileName: string;
    sceneSnapshot: UsdSceneSnapshot;
    resolution: ViewerRobotDataResolution;
    robotSnapshot: string;
  }) => {
    const requestId = ++usdPreparedExportCacheRequestIdRef.current;

    void prepareUsdPreparedExportCacheWithWorker(
      args.sceneSnapshot,
      args.resolution,
    ).then((preparedCache) => {
      if (requestId !== usdPreparedExportCacheRequestIdRef.current) {
        return;
      }

      const liveAssetsState = useAssetsStore.getState();
      liveAssetsState.setUsdPreparedExportCache(args.fileName, preparedCache);
      usdPersistenceBaselineRef.current = {
        fileName: normalizeUsdPersistenceFileName(args.fileName),
        robotSnapshot: args.robotSnapshot,
        fallbackSceneSnapshot: args.sceneSnapshot,
        hadPreparedExportCache: Boolean(preparedCache),
        hadSceneSnapshot: true,
      };
    }).catch((error) => {
      if (requestId !== usdPreparedExportCacheRequestIdRef.current) {
        return;
      }

      scheduleFailFastInDev(
        'AppLayout:prepareUsdPreparedExportCacheWithWorker',
        new Error(`Failed to prepare USD export cache for "${args.fileName}".`, { cause: error }),
      );
    });
  }, []);

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
    });

    if (!sceneSnapshot) {
      scheduleFailFastInDev(
        'AppLayout:flushPendingUsdCache',
        new Error(
          `Missing live USD scene snapshot for "${currentSelectedFile.name}" while semantic edits are pending.`,
        ),
        'warn',
      );
      liveAssetsState.setUsdSceneSnapshot(currentSelectedFile.name, null);
      liveAssetsState.setUsdPreparedExportCache(currentSelectedFile.name, null);
      usdPersistenceBaselineRef.current = {
        fileName: normalizedSelectedFileName,
        robotSnapshot: currentRobotSnapshot,
        fallbackSceneSnapshot: null,
        hadPreparedExportCache: false,
        hadSceneSnapshot: false,
      };
      return;
    }

    liveAssetsState.setUsdSceneSnapshot(currentSelectedFile.name, sceneSnapshot);

    const resolution = resolveUsdExportResolution(sceneSnapshot, {
      fileName: currentSelectedFile.name,
    });
    if (!resolution) {
      liveAssetsState.setUsdPreparedExportCache(currentSelectedFile.name, null);
      usdPersistenceBaselineRef.current = {
        fileName: normalizedSelectedFileName,
        robotSnapshot: currentRobotSnapshot,
        fallbackSceneSnapshot: sceneSnapshot,
        hadPreparedExportCache: false,
        hadSceneSnapshot: true,
      };
      return;
    }

    liveAssetsState.setUsdPreparedExportCache(currentSelectedFile.name, null);
    usdPersistenceBaselineRef.current = {
      fileName: normalizedSelectedFileName,
      robotSnapshot: currentRobotSnapshot,
      fallbackSceneSnapshot: sceneSnapshot,
      hadPreparedExportCache: false,
      hadSceneSnapshot: true,
    };
    queueUsdPreparedExportCacheBuild({
      fileName: currentSelectedFile.name,
      sceneSnapshot,
      resolution,
      robotSnapshot: currentRobotSnapshot,
    });
  }, [queueUsdPreparedExportCacheBuild]);

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

  const updateProModeRoundtripBaseline = useCallback((generatedFileName: string | null) => {
    const nextAssemblyState = useAssemblyStore.getState().assemblyState;
    const mergedRobotData = nextAssemblyState
      ? buildExportableAssemblyRobotData(nextAssemblyState)
      : null;
    if (!mergedRobotData) {
      proModeRoundtripSessionRef.current = null;
      return false;
    }

    proModeRoundtripSessionRef.current = {
      baselineSnapshot: createRobotSourceSnapshot({
        ...mergedRobotData,
        selection: { type: null, id: null },
      }),
      generatedFileName,
    };

    return true;
  }, []);

  const prepareAssemblyComponentForInsert = useCallback(async (
    file: RobotFile,
    options: {
      existingComponentIds?: Iterable<string>;
      existingComponentNames?: Iterable<string>;
      preResolvedRobotData?: RobotData | null;
    } = {},
  ) => {
    const liveAssemblyState = useAssemblyStore.getState().assemblyState;
    const identity = buildAssemblyComponentIdentity({
      fileName: file.name,
      existingComponentIds: options.existingComponentIds
        ?? Object.keys(liveAssemblyState?.components ?? {}),
      existingComponentNames: options.existingComponentNames
        ?? Object.values(liveAssemblyState?.components ?? {}).map((component) => component.name),
    });

    return prepareAssemblyComponentWithWorker(file, {
      availableFiles,
      assets,
      allFileContents,
      usdRobotData: options.preResolvedRobotData ?? null,
      componentId: identity.componentId,
      rootName: identity.displayName,
    });
  }, [allFileContents, assets, availableFiles]);

  const buildAssemblyComponentPreparationOverlayState = useCallback((
    file: RobotFile,
    stage: 'prepare' | 'add' | 'ground',
  ): ImportPreparationOverlayState => {
    const fileLabel = file.name.split('/').pop() ?? file.name;

    if (stage === 'ground') {
      return {
        label: t.loadingRobot,
        detail: fileLabel,
        progress: 0.92,
        statusLabel: '3/3',
        stageLabel: t.groundingAssemblyComponent,
      };
    }

    if (stage === 'add') {
      return {
        label: t.loadingRobot,
        detail: fileLabel,
        progress: 0.72,
        statusLabel: '2/3',
        stageLabel: t.addingAssemblyComponentToWorkspace,
      };
    }

    return {
      label: t.loadingRobot,
      detail: fileLabel,
      progress: 0.36,
      statusLabel: '1/3',
      stageLabel: t.preparingAssemblyComponent,
    };
  }, [
    t.addingAssemblyComponentToWorkspace,
    t.groundingAssemblyComponent,
    t.loadingRobot,
    t.preparingAssemblyComponent,
  ]);

  const showAssemblyComponentPreparationOverlay = useCallback((
    file: RobotFile,
    stage: 'prepare' | 'add' | 'ground',
  ) => {
    setAssemblyComponentPreparationOverlay(
      buildAssemblyComponentPreparationOverlayState(file, stage),
    );
  }, [buildAssemblyComponentPreparationOverlayState]);

  const clearAssemblyComponentPreparationOverlay = useCallback(() => {
    setAssemblyComponentPreparationOverlay(null);
  }, []);

  const activateInsertedAssemblyComponent = useCallback((
    component: { id: string; robot: { rootLinkId: string } },
  ) => {
    setSelection({ type: null, id: null });
    selectComponent(component.id);
    if (component.robot.rootLinkId) {
      focusOn(component.robot.rootLinkId);
    }
  }, [focusOn, selectComponent, setSelection]);

  const insertAssemblyComponentIntoWorkspace = useCallback(async (
    file: RobotFile,
    options: {
      preResolvedRobotData?: RobotData | null;
    } = {},
  ) => {
    showAssemblyComponentPreparationOverlay(file, 'prepare');
    await waitForNextPaint();

    const preparedComponent = await prepareAssemblyComponentForInsert(file, {
      preResolvedRobotData: options.preResolvedRobotData ?? null,
    });

    showAssemblyComponentPreparationOverlay(file, 'add');
    await waitForNextPaint();

    const component = addComponent(file, {
      availableFiles,
      assets,
      allFileContents,
      preResolvedRobotData: options.preResolvedRobotData ?? null,
      preparedComponent,
    });
    if (!component) {
      throw new Error(`Failed to add assembly component: ${file.name}`);
    }

    activateInsertedAssemblyComponent(component);

    showAssemblyComponentPreparationOverlay(file, 'ground');
    await waitForNextPaint();

    return component;
  }, [
    activateInsertedAssemblyComponent,
    addComponent,
    allFileContents,
    assets,
    availableFiles,
    prepareAssemblyComponentForInsert,
    showAssemblyComponentPreparationOverlay,
  ]);

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
      const resolvedRobotSnapshot = createRobotSemanticSnapshot(result.robotData);
      const hydrationPersistencePlan = buildUsdHydrationPersistencePlan({
        resolution: result,
        existingSceneSnapshot,
        existingPreparedExportCache,
      });
      const shouldBuildPreparedHydrationExportCache = Boolean(
        hydrationPersistencePlan.shouldSeedPreparedExportCache
        && hydrationPersistencePlan.sceneSnapshot,
      );

      if (hydrationPersistencePlan.shouldSeedSceneSnapshot && hydrationPersistencePlan.sceneSnapshot) {
        liveAssetsState.setUsdSceneSnapshot(resolvedSelectedFile.name, hydrationPersistencePlan.sceneSnapshot);
      }
      if (shouldBuildPreparedHydrationExportCache && hydrationPersistencePlan.sceneSnapshot) {
        liveAssetsState.setUsdPreparedExportCache(resolvedSelectedFile.name, null);
        queueUsdPreparedExportCacheBuild({
          fileName: resolvedSelectedFile.name,
          sceneSnapshot: hydrationPersistencePlan.sceneSnapshot,
          resolution: result,
          robotSnapshot: resolvedRobotSnapshot,
        });
      }

      usdPersistenceBaselineRef.current = {
        fileName: normalizedSelectedFileName,
        robotSnapshot: resolvedRobotSnapshot,
        fallbackSceneSnapshot: hydrationPersistencePlan.sceneSnapshot as UsdSceneSnapshot | null,
        hadPreparedExportCache: shouldBuildPreparedHydrationExportCache
          ? false
          : Boolean(existingPreparedExportCache),
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
      setSelection({ type: null, id: null });
      if (isColdUsdHydration) {
        markUnsavedChangesBaselineSaved('robot');
      }
    }

    const pendingUsdAssemblyFile = pendingUsdAssemblyFileRef.current;
    if (
      pendingUsdAssemblyFile
      && resolvedSelectedFile.format === 'usd'
      && pendingUsdAssemblyFile.name === resolvedSelectedFile.name
    ) {
      pendingUsdAssemblyFileRef.current = null;
      void insertAssemblyComponentIntoWorkspace(pendingUsdAssemblyFile, {
        preResolvedRobotData: result.robotData,
      }).then((component) => {
        showToast(t.addedComponent.replace('{name}', component.name), 'success');
        updateProModeRoundtripBaseline(
          isGeneratedWorkspaceUrdfFileName(pendingUsdAssemblyFile.name)
            ? pendingUsdAssemblyFile.name
            : null,
        );
      }).catch((error) => {
        scheduleFailFastInDev(
          'AppLayout:handleRobotDataResolved:prepareAssemblyComponent',
          error instanceof Error
            ? error
            : new Error(`Failed to prepare assembly component "${pendingUsdAssemblyFile.name}".`),
        );
        showToast(`Failed to add assembly component: ${pendingUsdAssemblyFile.name}`, 'info');
      }).finally(() => {
        clearAssemblyComponentPreparationOverlay();
      });
    }
  }, [
    clearAssemblyComponentPreparationOverlay,
    insertAssemblyComponentIntoWorkspace,
    queueUsdPreparedExportCacheBuild,
    selectedFile,
    setRobot,
    setSelection,
    showToast,
    t,
    updateProModeRoundtripBaseline,
  ]);

  const {
    emptyRobot,
    robot,
    viewerRobot,
    shouldRenderAssembly,
    jointAngleState,
    jointMotionState,
    showVisual,
    urdfContentForViewer,
    viewerSourceFormat,
    viewerSourceFilePath,
    workspaceViewerMjcfSourceFile,
    sourceCodeContent,
    sourceCodeDocumentFlavor,
    sourceCodeFileName,
    filePreview,
    previewRobot,
    previewFileName,
    handlePreviewFile,
    handleClosePreview,
  } = useWorkspaceSourceSync({
    assemblyState,
    assemblyRevision,
    assemblyBridgePreview: bridgePreview,
    assemblySelection,
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

  const previewFile = previewFileName
    ? availableFiles.find((file) => file.name === previewFileName) ?? null
    : null;

  const viewerAssets = usePreparedUsdViewerAssets({
    assemblyState,
    assets,
    availableFiles,
    getUsdPreparedExportCache,
    shouldRenderAssembly,
  });

  useEffect(() => {
    if (sidebarTab !== 'workspace' || !assemblyState) {
      clearAssemblySelection();
      return;
    }

    if (
      assemblySelection.type === 'component'
      && (!assemblySelection.id || !assemblyState.components[assemblySelection.id])
    ) {
      clearAssemblySelection();
    }
  }, [assemblySelection.id, assemblySelection.type, assemblyState, clearAssemblySelection, sidebarTab]);

  const switchTreeEditorToStructure = useCallback(() => {
    handleClosePreview();
    useUIStore.getState().setSidebarTab('structure');
    proModeRoundtripSessionRef.current = null;
    return 'switched' as const;
  }, [handleClosePreview]);

  const generateWorkspaceUrdfFromProMode = useCallback((
    options: { switchToStructure?: boolean } = {},
  ) => {
    const { switchToStructure = false } = options;
    const assemblyStoreState = useAssemblyStore.getState();
    const connectivity = analyzeAssemblyConnectivity(assemblyStoreState.assemblyState);

    if (connectivity.hasDisconnectedComponents) {
      showToast(t.generateWorkspaceUrdfDisconnected, 'info');
      return false;
    }

    const mergedRobotData = assemblyStoreState.assemblyState
      ? buildExportableAssemblyRobotData(assemblyStoreState.assemblyState)
      : null;

    if (!mergedRobotData) {
      showToast(t.generateWorkspaceUrdfUnavailable, 'info');
      return false;
    }

    const assetsState = useAssetsStore.getState();
    const session = proModeRoundtripSessionRef.current;
    const { file, robot, snapshot } = createGeneratedWorkspaceUrdfFile({
      assemblyName: assemblyStoreState.assemblyState?.name || mergedRobotData.name || robotName || 'workspace',
      mergedRobotData,
      availableFiles: assetsState.availableFiles,
      preferredFileName: session?.generatedFileName,
    });
    const existingFile = assetsState.availableFiles.find((entry) => entry.name === file.name) ?? null;
    const nextFile: RobotFile = existingFile ? { ...existingFile, ...file } : file;
    const nextAvailableFiles = existingFile
      ? assetsState.availableFiles.map((entry) => (entry.name === file.name ? nextFile : entry))
      : [...assetsState.availableFiles, nextFile];

    assetsState.setAvailableFiles(nextAvailableFiles);
    assetsState.setAllFileContents({
      ...assetsState.allFileContents,
      [file.name]: file.content,
    });
    assetsState.setSelectedFile(nextFile);
    assetsState.setOriginalUrdfContent(file.content);
    assetsState.setOriginalFileFormat('urdf');
    assetsState.setDocumentLoadState({
      status: 'ready',
      fileName: file.name,
      format: 'urdf',
      error: null,
      phase: null,
      message: null,
      progressPercent: 100,
      loadedCount: null,
      totalCount: null,
    });

    setRobot(robot, {
      resetHistory: true,
      label: 'Generate workspace URDF',
    });
    setSelection({ type: null, id: null });
    handleClosePreview();

    if (switchToStructure) {
      useUIStore.getState().setSidebarTab('structure');
      proModeRoundtripSessionRef.current = null;
    } else {
      proModeRoundtripSessionRef.current = {
        baselineSnapshot: snapshot,
        generatedFileName: file.name,
      };
    }

    showToast(
      t.generateWorkspaceUrdfSuccess.replace('{name}', file.name.split('/').pop() || file.name),
      'success',
    );
    return true;
  }, [
    handleClosePreview,
    robotName,
    setRobot,
    setSelection,
    showToast,
    t.generateWorkspaceUrdfDisconnected,
    t.generateWorkspaceUrdfSuccess,
    t.generateWorkspaceUrdfUnavailable,
  ]);

  const handleRequestSwitchTreeEditorToStructure = useCallback((
    intent: 'direct' | 'generate' | 'skip-generate',
  ) => {
    if (useUIStore.getState().sidebarTab !== 'workspace') {
      return switchTreeEditorToStructure();
    }

    if (intent === 'generate') {
      return generateWorkspaceUrdfFromProMode({ switchToStructure: true })
        ? 'switched'
        : 'blocked';
    }

    const session = proModeRoundtripSessionRef.current;
    if (!session) {
      return switchTreeEditorToStructure();
    }

    const latestAssemblyState = useAssemblyStore.getState().assemblyState;
    const mergedRobotData = latestAssemblyState
      ? buildExportableAssemblyRobotData(latestAssemblyState)
      : null;
    if (!mergedRobotData) {
      return switchTreeEditorToStructure();
    }

    const currentSnapshot = createRobotSourceSnapshot({
      ...mergedRobotData,
      selection: { type: null, id: null },
    });

    if (currentSnapshot === session.baselineSnapshot || intent === 'skip-generate') {
      return switchTreeEditorToStructure();
    }

    return 'needs-generate-confirm' as const;
  }, [generateWorkspaceUrdfFromProMode, switchTreeEditorToStructure]);

  const handleSwitchTreeEditorToProMode = useCallback(() => {
    const activeFile = previewFile ?? selectedFile;
    const currentAssemblyState = useAssemblyStore.getState().assemblyState;
    const activeGeneratedFileName = isGeneratedWorkspaceUrdfFileName(activeFile?.name)
      ? activeFile?.name ?? null
      : null;

    if (!shouldReseedSingleComponentAssemblyFromActiveFile({
      assemblyState: currentAssemblyState,
      activeFile,
    })) {
      updateProModeRoundtripBaseline(activeGeneratedFileName);
      return;
    }

    proModeRoundtripSessionRef.current = null;

    if (!activeFile) {
      return;
    }

    void (async () => {
      let preResolvedRobotData = activeFile.format === 'usd'
        ? getUsdPreparedExportCache(activeFile.name)?.robotData ?? null
        : null;

      if (activeFile.format === 'usd' && !preResolvedRobotData) {
        const fallbackSceneSnapshot = getCurrentUsdViewerSceneSnapshot({ stageSourcePath: activeFile.name });
        const preparedCache = fallbackSceneSnapshot
          ? prepareUsdExportCacheFromSnapshot(fallbackSceneSnapshot, { fileName: activeFile.name })
          : null;

        if (!preparedCache?.robotData) {
          pendingUsdAssemblyFileRef.current = activeFile;
          onLoadRobot(activeFile);
          return;
        }

        useAssetsStore.getState().setUsdPreparedExportCache(activeFile.name, preparedCache);
        preResolvedRobotData = preparedCache.robotData;
      }

      const preparedComponent = await prepareAssemblyComponentForInsert(activeFile, {
        existingComponentIds: [],
        existingComponentNames: [],
        preResolvedRobotData,
      });

      initAssembly(currentAssemblyState?.name || robotName || 'assembly');

      const component = addComponent(activeFile, {
        availableFiles,
        assets,
        allFileContents,
        preResolvedRobotData,
        preparedComponent,
      });

      if (!component) {
        scheduleFailFastInDev(
          'AppLayout:handleSwitchTreeEditorToProMode',
          new Error(`Failed to reseed Pro mode assembly with "${activeFile.name}".`),
        );
        return;
      }

      activateInsertedAssemblyComponent(component);
      updateProModeRoundtripBaseline(activeGeneratedFileName);
      markUnsavedChangesBaselineSaved('assembly');
    })().catch((error) => {
      scheduleFailFastInDev(
        'AppLayout:handleSwitchTreeEditorToProMode',
        error instanceof Error
          ? error
          : new Error(`Failed to resolve Pro mode source from "${activeFile.name}".`),
      );
      showToast(`Failed to sync Pro mode assembly source: ${activeFile.name}`, 'info');
    });
  }, [
    addComponent,
    allFileContents,
    assets,
    availableFiles,
    getUsdPreparedExportCache,
    getCurrentUsdViewerSceneSnapshot,
    initAssembly,
    onLoadRobot,
    prepareUsdExportCacheFromSnapshot,
    previewFile,
    prepareAssemblyComponentForInsert,
    robotName,
    selectedFile,
    activateInsertedAssemblyComponent,
    showToast,
    updateProModeRoundtripBaseline,
  ]);

  const handleViewerDocumentLoadEvent = useCallback((event: ViewerDocumentLoadEvent) => {
    const liveAssetsState = useAssetsStore.getState();
    const activeDocumentFile = previewFile ?? liveAssetsState.selectedFile;
    const currentDocumentLoadState = liveAssetsState.documentLoadState;

    if (!activeDocumentFile) {
      return;
    }

    // A different file is staged for load but not yet committed as the active
    // viewer document. Ignore progress from the still-visible old scene so the
    // pending file keeps ownership of document loading state.
    if (shouldIgnoreStaleViewerDocumentLoadEvent({
      isPreviewing: Boolean(previewFile),
      activeDocumentFileName: activeDocumentFile.name,
      documentLoadState: currentDocumentLoadState,
    })) {
      return;
    }

    const keepHydrating = !previewFile
      && activeDocumentFile.format === 'usd'
      && currentDocumentLoadState.status === 'hydrating'
      && currentDocumentLoadState.fileName === activeDocumentFile.name;

    const nextStatus: DocumentLoadStatus = event.status === 'ready'
      ? 'ready'
      : event.status === 'error'
        ? 'error'
        : keepHydrating
          ? 'hydrating'
          : 'loading';

    const nextDocumentLoadState: DocumentLoadState = {
      status: nextStatus,
      fileName: activeDocumentFile.name,
      format: activeDocumentFile.format,
      error: event.status === 'error'
        ? event.error ?? t.failedToParseFormat.replace('{format}', activeDocumentFile.format.toUpperCase())
        : null,
      phase: event.phase ?? null,
      message: event.message ?? null,
      progressPercent: event.progressPercent ?? null,
      loadedCount: event.loadedCount ?? null,
      totalCount: event.totalCount ?? null,
    };

    if (shouldIgnoreViewerLoadRegressionAfterReadySameFile({
      currentState: currentDocumentLoadState,
      nextState: nextDocumentLoadState,
    })) {
      return;
    }

    if (
      currentDocumentLoadState.status !== nextDocumentLoadState.status
      || currentDocumentLoadState.fileName !== nextDocumentLoadState.fileName
      || currentDocumentLoadState.format !== nextDocumentLoadState.format
      || currentDocumentLoadState.error !== nextDocumentLoadState.error
      || currentDocumentLoadState.phase !== nextDocumentLoadState.phase
      || currentDocumentLoadState.message !== nextDocumentLoadState.message
      || currentDocumentLoadState.progressPercent !== nextDocumentLoadState.progressPercent
      || currentDocumentLoadState.loadedCount !== nextDocumentLoadState.loadedCount
      || currentDocumentLoadState.totalCount !== nextDocumentLoadState.totalCount
    ) {
      setDocumentLoadState(nextDocumentLoadState);
    }

    if (!previewFile && (event.status === 'ready' || event.status === 'error') && activeDocumentFile.format === 'usd') {
      pendingUsdHydrationFileRef.current = null;
    }

    if (
      event.status === 'error'
      && pendingUsdAssemblyFileRef.current
      && pendingUsdAssemblyFileRef.current.name === activeDocumentFile.name
    ) {
      pendingUsdAssemblyFileRef.current = null;
      clearAssemblyComponentPreparationOverlay();
    }
  }, [clearAssemblyComponentPreparationOverlay, previewFile, setDocumentLoadState, t.failedToParseFormat]);

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
  const trySelectViewerAssemblyComponent = useCallback((
    nextSelection: { type: 'link' | 'joint'; id: string; subType?: 'visual' | 'collision'; objectIndex?: number },
  ) => {
    if (!shouldRenderAssembly || !assemblyState) {
      return false;
    }

    const componentId = resolveAssemblyViewerComponentSelection(
      assemblyState,
      nextSelection,
      { hasInteractionGuard: Boolean(useSelectionStore.getState().interactionGuard) },
    );
    if (!componentId) {
      return false;
    }

    setSelection({ type: null, id: null });
    selectComponent(componentId);
    return true;
  }, [assemblyState, selectComponent, setSelection, shouldRenderAssembly]);
  const handleViewerSelectWithBridgePreview = useCallback((...args: Parameters<typeof handleViewerSelect>) => {
    const [type, id, subType] = args;
    if (type === 'joint' && id === BRIDGE_PREVIEW_ID) {
      return;
    }

    if (trySelectViewerAssemblyComponent({ type, id, subType })) {
      return;
    }

    clearAssemblySelection();
    handleViewerSelect(...args);
  }, [clearAssemblySelection, handleViewerSelect, trySelectViewerAssemblyComponent]);
  const handleSelectWithAssemblyClear = useCallback((...args: Parameters<typeof handleSelect>) => {
    clearAssemblySelection();
    handleSelect(...args);
  }, [clearAssemblySelection, handleSelect]);
  const handleSelectGeometryWithAssemblyClear = useCallback((...args: Parameters<typeof handleSelectGeometry>) => {
    clearAssemblySelection();
    handleSelectGeometry(...args);
  }, [clearAssemblySelection, handleSelectGeometry]);
  const handleViewerMeshSelectWithAssemblyClear = useCallback((...args: Parameters<typeof handleViewerMeshSelect>) => {
    const [linkId, _jointId, objectIndex, objectType] = args;
    if (trySelectViewerAssemblyComponent({
      type: 'link',
      id: linkId,
      subType: objectType,
      objectIndex,
    })) {
      return;
    }

    clearAssemblySelection();
    handleViewerMeshSelect(...args);
  }, [clearAssemblySelection, handleViewerMeshSelect, trySelectViewerAssemblyComponent]);

  const setPendingCollisionTransform = useCollisionTransformStore((state) => state.setPendingCollisionTransform);
  const clearPendingCollisionTransform = useCollisionTransformStore((state) => state.clearPendingCollisionTransform);
  const patchEditableSourceAddChild = useCallback(({
    sourceFileName,
    parentLinkName,
    linkName,
    joint,
  }: {
    sourceFileName?: string | null;
    parentLinkName: string;
    linkName: string;
    joint: UrdfJoint;
  }) => {
    const targetFileName = sourceFileName ?? selectedFile?.name;
    if (!targetFileName) {
      return;
    }

    const targetFile = selectedFile?.name === targetFileName
      ? selectedFile
      : availableFiles.find((file) => file.name === targetFileName) ?? null;

    if (!canPatchMJCFEditableSource(targetFile)) {
      return;
    }

    try {
      const nextContent = appendMJCFChildBodyToSource({
        sourceContent: targetFile.content,
        parentBodyName: parentLinkName,
        childBodyName: linkName,
        joint,
      });

      if (selectedFile?.name === targetFile.name && selectedFile.content !== nextContent) {
        setSelectedFile({
          ...selectedFile,
          content: nextContent,
        });
      }

      if (availableFiles.some((entry) => entry.name === targetFile.name && entry.content !== nextContent)) {
        setAvailableFiles(
          availableFiles.map((entry) => (
            entry.name === targetFile.name
              ? { ...entry, content: nextContent }
              : entry
          )),
        );
      }

      if (allFileContents[targetFile.name] !== nextContent) {
        setAllFileContents({
          ...allFileContents,
          [targetFile.name]: nextContent,
        });
      }
    } catch (error) {
      console.error(`Failed to patch MJCF source after adding child body to "${targetFileName}".`, error);
      showToast(`Failed to patch MJCF source for ${targetFileName}`, 'info');
    }
  }, [
    allFileContents,
    availableFiles,
    selectedFile,
    setAllFileContents,
    setAvailableFiles,
    setSelectedFile,
    showToast,
  ]);
  const patchEditableSourceDeleteSubtree = useCallback(({
    sourceFileName,
    linkName,
  }: {
    sourceFileName?: string | null;
    linkName: string;
  }) => {
    const targetFileName = sourceFileName ?? selectedFile?.name;
    if (!targetFileName) {
      return;
    }

    const targetFile = selectedFile?.name === targetFileName
      ? selectedFile
      : availableFiles.find((file) => file.name === targetFileName) ?? null;

    if (!canPatchMJCFEditableSource(targetFile)) {
      return;
    }

    try {
      const nextContent = removeMJCFBodyFromSource(targetFile.content, linkName);

      if (selectedFile?.name === targetFile.name && selectedFile.content !== nextContent) {
        setSelectedFile({
          ...selectedFile,
          content: nextContent,
        });
      }

      if (availableFiles.some((entry) => entry.name === targetFile.name && entry.content !== nextContent)) {
        setAvailableFiles(
          availableFiles.map((entry) => (
            entry.name === targetFile.name
              ? { ...entry, content: nextContent }
              : entry
          )),
        );
      }

      if (allFileContents[targetFile.name] !== nextContent) {
        setAllFileContents({
          ...allFileContents,
          [targetFile.name]: nextContent,
        });
      }
    } catch (error) {
      console.error(`Failed to patch MJCF source after deleting subtree "${linkName}" from "${targetFileName}".`, error);
      showToast(`Failed to patch MJCF source for ${targetFileName}`, 'info');
    }
  }, [
    allFileContents,
    availableFiles,
    selectedFile,
    setAllFileContents,
    setAvailableFiles,
    setSelectedFile,
    showToast,
  ]);
  const patchEditableSourceAddCollisionBody = useCallback(({
    sourceFileName,
    linkName,
    geometry,
  }: {
    sourceFileName?: string | null;
    linkName: string;
    geometry: UrdfLink['collision'];
  }) => {
    const targetFileName = sourceFileName ?? selectedFile?.name;
    if (!targetFileName) {
      return;
    }

    const targetFile = selectedFile?.name === targetFileName
      ? selectedFile
      : availableFiles.find((file) => file.name === targetFileName) ?? null;

    if (!canPatchMJCFEditableSource(targetFile)) {
      return;
    }

    try {
      const nextContent = appendMJCFBodyCollisionGeomToSource({
        sourceContent: targetFile.content,
        bodyName: linkName,
        geometry,
      });

      if (selectedFile?.name === targetFile.name && selectedFile.content !== nextContent) {
        setSelectedFile({
          ...selectedFile,
          content: nextContent,
        });
      }

      if (availableFiles.some((entry) => entry.name === targetFile.name && entry.content !== nextContent)) {
        setAvailableFiles(
          availableFiles.map((entry) => (
            entry.name === targetFile.name
              ? { ...entry, content: nextContent }
              : entry
          )),
        );
      }

      if (allFileContents[targetFile.name] !== nextContent) {
        setAllFileContents({
          ...allFileContents,
          [targetFile.name]: nextContent,
        });
      }
    } catch (error) {
      console.error(`Failed to patch MJCF source after adding collision geom to "${targetFileName}".`, error);
      showToast(`Failed to patch MJCF source for ${targetFileName}`, 'info');
    }
  }, [
    allFileContents,
    availableFiles,
    selectedFile,
    setAllFileContents,
    setAvailableFiles,
    setSelectedFile,
    showToast,
  ]);
  const patchEditableSourceDeleteCollisionBody = useCallback(({
    sourceFileName,
    linkName,
    objectIndex,
  }: {
    sourceFileName?: string | null;
    linkName: string;
    objectIndex: number;
  }) => {
    const targetFileName = sourceFileName ?? selectedFile?.name;
    if (!targetFileName) {
      return;
    }

    const targetFile = selectedFile?.name === targetFileName
      ? selectedFile
      : availableFiles.find((file) => file.name === targetFileName) ?? null;

    if (!canPatchMJCFEditableSource(targetFile)) {
      return;
    }

    try {
      const nextContent = removeMJCFBodyCollisionGeomFromSource(targetFile.content, linkName, objectIndex);

      if (selectedFile?.name === targetFile.name && selectedFile.content !== nextContent) {
        setSelectedFile({
          ...selectedFile,
          content: nextContent,
        });
      }

      if (availableFiles.some((entry) => entry.name === targetFile.name && entry.content !== nextContent)) {
        setAvailableFiles(
          availableFiles.map((entry) => (
            entry.name === targetFile.name
              ? { ...entry, content: nextContent }
              : entry
          )),
        );
      }

      if (allFileContents[targetFile.name] !== nextContent) {
        setAllFileContents({
          ...allFileContents,
          [targetFile.name]: nextContent,
        });
      }
    } catch (error) {
      console.error(`Failed to patch MJCF source after deleting collision geom from "${targetFileName}".`, error);
      showToast(`Failed to patch MJCF source for ${targetFileName}`, 'info');
    }
  }, [
    allFileContents,
    availableFiles,
    selectedFile,
    setAllFileContents,
    setAvailableFiles,
    setSelectedFile,
    showToast,
  ]);
  const patchEditableSourceUpdateCollisionBody = useCallback(({
    sourceFileName,
    linkName,
    objectIndex,
    geometry,
  }: {
    sourceFileName?: string | null;
    linkName: string;
    objectIndex: number;
    geometry: UrdfLink['collision'];
  }) => {
    const targetFileName = sourceFileName ?? selectedFile?.name;
    if (!targetFileName) {
      return;
    }

    const targetFile = selectedFile?.name === targetFileName
      ? selectedFile
      : availableFiles.find((file) => file.name === targetFileName) ?? null;

    if (!canPatchMJCFEditableSource(targetFile)) {
      return;
    }

    try {
      const nextContent = updateMJCFBodyCollisionGeomInSource(
        targetFile.content,
        linkName,
        objectIndex,
        geometry,
      );

      if (selectedFile?.name === targetFile.name && selectedFile.content !== nextContent) {
        setSelectedFile({
          ...selectedFile,
          content: nextContent,
        });
      }

      if (availableFiles.some((entry) => entry.name === targetFile.name && entry.content !== nextContent)) {
        setAvailableFiles(
          availableFiles.map((entry) => (
            entry.name === targetFile.name
              ? { ...entry, content: nextContent }
              : entry
          )),
        );
      }

      if (allFileContents[targetFile.name] !== nextContent) {
        setAllFileContents({
          ...allFileContents,
          [targetFile.name]: nextContent,
        });
      }
    } catch (error) {
      console.error(`Failed to patch MJCF source after updating collision geom in "${targetFileName}".`, error);
      showToast(`Failed to patch MJCF source for ${targetFileName}`, 'info');
    }
  }, [
    allFileContents,
    availableFiles,
    selectedFile,
    setAllFileContents,
    setAvailableFiles,
    setSelectedFile,
    showToast,
  ]);
  const patchEditableSourceRenameEntities = useCallback(({
    sourceFileName,
    operations,
  }: {
    sourceFileName?: string | null;
    operations: MJCFRenameOperation[];
  }) => {
    const targetFileName = sourceFileName ?? selectedFile?.name;
    if (!targetFileName || !operations.length) {
      return;
    }

    const targetFile = selectedFile?.name === targetFileName
      ? selectedFile
      : availableFiles.find((file) => file.name === targetFileName) ?? null;

    if (!canPatchMJCFEditableSource(targetFile)) {
      return;
    }

    try {
      const nextContent = renameMJCFEntitiesInSource(targetFile.content, operations);

      if (selectedFile?.name === targetFile.name && selectedFile.content !== nextContent) {
        setSelectedFile({
          ...selectedFile,
          content: nextContent,
        });
      }

      if (availableFiles.some((entry) => entry.name === targetFile.name && entry.content !== nextContent)) {
        setAvailableFiles(
          availableFiles.map((entry) => (
            entry.name === targetFile.name
              ? { ...entry, content: nextContent }
              : entry
          )),
        );
      }

      if (allFileContents[targetFile.name] !== nextContent) {
        setAllFileContents({
          ...allFileContents,
          [targetFile.name]: nextContent,
        });
      }
    } catch (error) {
      console.error(`Failed to patch MJCF source after renaming entities in "${targetFileName}".`, error);
      showToast(`Failed to patch MJCF source for ${targetFileName}`, 'info');
    }
  }, [
    allFileContents,
    availableFiles,
    selectedFile,
    setAllFileContents,
    setAvailableFiles,
    setSelectedFile,
    showToast,
  ]);

  const {
    handleNameChange,
    handleUpdate,
    handleCollisionTransform,
    handleAssemblyTransform,
    handleComponentTransform,
    handleBridgeTransform,
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
    updateComponentTransform,
    updateComponentRobot,
    updateAssemblyTransform,
    removeComponent,
    removeBridge,
    focusOn,
    patchEditableSourceAddChild,
    patchEditableSourceDeleteSubtree,
    patchEditableSourceAddCollisionBody,
    patchEditableSourceDeleteCollisionBody,
    patchEditableSourceUpdateCollisionBody,
    patchEditableSourceRenameEntities,
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
      showAssemblyComponentPreparationOverlay(file, 'prepare');
      pendingUsdAssemblyFileRef.current = file;
      onLoadRobot(file);
      return;
    }

    void insertAssemblyComponentIntoWorkspace(file, {
      preResolvedRobotData,
    }).then((component) => {
      showToast(t.addedComponent.replace('{name}', component.name), 'success');
    }).catch((error) => {
      scheduleFailFastInDev(
        'AppLayout:handleAddComponent',
        error instanceof Error
          ? error
          : new Error(`Failed to resolve assembly component "${file.name}".`),
      );
      showToast(`Failed to add assembly component: ${file.name}`, 'info');
    }).finally(() => {
      clearAssemblyComponentPreparationOverlay();
    });
  }, [
    clearAssemblyComponentPreparationOverlay,
    getUsdPreparedExportCache,
    insertAssemblyComponentIntoWorkspace,
    onLoadRobot,
    showAssemblyComponentPreparationOverlay,
    showToast,
    t,
  ]);

  const handleCreateBridge = useCallback(() => {
    setBridgePreview(null);
    setShouldRenderBridgeModal(true);
    void loadBridgeCreateModalModule();
    setIsBridgeModalOpen(true);
  }, []);

  const handleCloseBridgeModal = useCallback(() => {
    setBridgePreview(null);
    setIsBridgeModalOpen(false);
  }, []);

  const handleBridgePreviewChange = useCallback((nextPreview: BridgeJoint | null) => {
    setBridgePreview(nextPreview);
  }, []);

  const handleCreateBridgeCommit = useCallback((params: Parameters<typeof addBridge>[0]) => {
    setBridgePreview(null);
    return addBridge(params);
  }, [addBridge]);

  const handleOpenCollisionOptimizer = useCallback(() => {
    void loadCollisionOptimizationDialogModule();
    setIsCollisionOptimizerOpen(true);
  }, []);

  const handleOpenMeasureTool = useCallback(() => {
    setViewConfig((prev) => ({ ...prev, showToolbar: true }));
    setPendingViewerToolMode('measure');
  }, [setViewConfig]);

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

  const syncSelectedEditableFileContent = useCallback((file: RobotFile, content: string) => {
    if (selectedFile?.name === file.name && selectedFile.content !== content) {
      setSelectedFile({
        ...selectedFile,
        content,
      });
    }

    if (availableFiles.some((entry) => entry.name === file.name && entry.content !== content)) {
      setAvailableFiles(
        availableFiles.map((entry) => (
          entry.name === file.name
            ? { ...entry, content }
            : entry
        )),
      );
    }

    if (allFileContents[file.name] !== content) {
      setAllFileContents({
        ...allFileContents,
        [file.name]: content,
      });
    }
  }, [
    allFileContents,
    availableFiles,
    selectedFile,
    setAllFileContents,
    setAvailableFiles,
    setSelectedFile,
  ]);

  const handleCodeChange = useCallback(async (newCode: string): Promise<boolean> => {
    if (!selectedFile || selectedFile.format === 'usd') {
      return false;
    }

    const sourceFile = selectedFile;
    const requestId = ++editableSourceParseRequestRef.current;

    try {
      const parsedState = await parseEditableRobotSourceWithWorker({
        file: sourceFile,
        content: newCode,
        availableFiles,
        allFileContents,
      });

      if (requestId !== editableSourceParseRequestRef.current) {
        return false;
      }

      if (useAssetsStore.getState().selectedFile?.name !== sourceFile.name) {
        return false;
      }

      const newState = parsedState
        ? rewriteRobotMeshPathsForSource(parsedState, sourceFile.name)
        : null;

      if (!newState) {
        return false;
      }

      if (sourceFile.format === 'xacro') {
        syncSelectedEditableFileContent(sourceFile, newCode);
        setOriginalUrdfContent(generateURDF(newState, { preserveMeshPaths: true }));
      }

      const newData = {
        name: newState.name,
        links: newState.links,
        joints: newState.joints,
        rootLinkId: newState.rootLinkId,
        materials: newState.materials,
      };
      setRobot(newData);
      return true;
    } catch (error) {
      if (requestId !== editableSourceParseRequestRef.current) {
        return false;
      }

      console.error('[AppLayout] Failed to parse editable source in worker:', error);
      return false;
    }
  }, [
    allFileContents,
    availableFiles,
    selectedFile,
    setOriginalUrdfContent,
    setRobot,
    syncSelectedEditableFileContent,
  ]);

  const handleSnapshot = useCallback(() => {
    setIsSnapshotDialogOpen(true);
  }, []);

  const handleCaptureSnapshot = useCallback(async (options: SnapshotCaptureOptions) => {
    if (!snapshotActionRef.current) {
      showToast(t.snapshotFailed, 'info');
      return;
    }

    try {
      setIsSnapshotCapturing(true);
      await snapshotActionRef.current(options);
      setIsSnapshotDialogOpen(false);
    } catch (error) {
      console.error('Snapshot failed:', error);
      showToast(t.snapshotFailed, 'info');
    } finally {
      setIsSnapshotCapturing(false);
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

  const warmSourceCodeEditorRuntime = useCallback(() => {
    prefetchSourceCodeEditor();

    if (!sourceCodeEditorRuntimeWarmupPromiseRef.current) {
      sourceCodeEditorRuntimeWarmupPromiseRef.current = preloadSourceCodeEditorRuntime().catch((error) => {
        sourceCodeEditorRuntimeWarmupPromiseRef.current = null;
        console.error('[AppLayout] Failed to preload source code editor runtime:', error);
      });
    }

    return sourceCodeEditorRuntimeWarmupPromiseRef.current;
  }, [prefetchSourceCodeEditor]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void warmSourceCodeEditorRuntime();
    }, 1200);

    return () => window.clearTimeout(timeoutId);
  }, [warmSourceCodeEditorRuntime]);

  const handleOpenCodeViewer = useCallback(() => {
    if (isSelectedUsdHydrating) {
      showToast(t.usdLoadInProgress, 'info');
      return;
    }

    void warmSourceCodeEditorRuntime();
    setIsCodeViewerOpen(true);
  }, [isSelectedUsdHydrating, setIsCodeViewerOpen, showToast, t.usdLoadInProgress, warmSourceCodeEditorRuntime]);

  const handlePrefetchCodeViewer = useCallback(() => {
    void warmSourceCodeEditorRuntime();
  }, [warmSourceCodeEditorRuntime]);

  const handlePreviewFileWithFeedback = useCallback((file: RobotFile) => {
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
    handlePreviewFile(file);

    void resolveRobotFileDataWithWorker(file, {
      availableFiles,
      assets,
      allFileContents,
      usdRobotData: getUsdPreparedExportCache(file.name)?.robotData ?? null,
    }).then((previewResult) => {
      if (previewResult.status === 'ready') {
        return;
      }

      if (previewResult.status === 'needs_hydration') {
        setDocumentLoadState({
          status: 'ready',
          fileName: file.name,
          format: file.format,
          error: null,
          phase: null,
          message: t.usdPreviewRequiresOpen,
          progressPercent: null,
          loadedCount: null,
          totalCount: null,
        });
        showToast(t.usdPreviewRequiresOpen, 'info');
        return;
      }

      if (previewResult.reason === 'source_only_fragment') {
        setDocumentLoadState({
          status: 'ready',
          fileName: file.name,
          format: file.format,
          error: null,
          phase: null,
          message: t.xacroSourceOnlyPreviewHint,
          progressPercent: null,
          loadedCount: null,
          totalCount: null,
        });
        showToast(t.xacroSourceOnlyPreviewHint, 'info');
        return;
      }

      setDocumentLoadState({
        status: 'error',
        fileName: file.name,
        format: file.format,
        error: t.failedToParseFormat.replace('{format}', file.format.toUpperCase()),
      });
      showToast(t.failedToParseFormat.replace('{format}', file.format.toUpperCase()), 'info');
    }).catch((error) => {
      console.error(`[AppLayout] Failed to resolve preview robot data for "${file.name}".`, error);
      setDocumentLoadState({
        status: 'error',
        fileName: file.name,
        format: file.format,
        error: t.failedToParseFormat.replace('{format}', file.format.toUpperCase()),
      });
      showToast(t.failedToParseFormat.replace('{format}', file.format.toUpperCase()), 'info');
    });
  }, [allFileContents, assets, availableFiles, getUsdPreparedExportCache, handlePreviewFile, setDocumentLoadState, showToast, t]);

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
        accept={ROBOT_IMPORT_ACCEPT_ATTRIBUTE}
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
        quickAction={headerQuickAction}
        secondaryAction={headerSecondaryAction}
        onSnapshot={handleSnapshot}
        onOpenCollisionOptimizer={handleOpenCollisionOptimizer}
        viewConfig={viewConfig}
        setViewConfig={setViewConfig}
      />

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden">
        <TreeEditor
          robot={previewContextRobot}
          onSelect={handleSelectWithAssemblyClear}
          onSelectGeometry={handleSelectGeometryWithAssemblyClear}
          onFocus={handleFocus}
          onAddChild={handleAddChild}
          onAddCollisionBody={handleAddCollisionBody}
          onDelete={handleDelete}
          onNameChange={handleNameChange}
          onUpdate={handleUpdate}
          showVisual={showVisual}
          setShowVisual={handleSetShowVisual}
          mode={mergedAppMode}
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
          onSwitchToProMode={handleSwitchTreeEditorToProMode}
          onRequestSwitchToStructure={handleRequestSwitchTreeEditorToStructure}
          isReadOnly={isPreviewingWorkspaceSource}
        />

        {/* Viewer Container */}
        <div className="flex-1 relative min-w-0">
          <UnifiedViewer
            robot={viewerRobot}
            visualizerRobot={robot}
            mode={mergedAppMode}
            onSelect={handleViewerSelectWithBridgePreview}
            onMeshSelect={handleViewerMeshSelectWithAssemblyClear}
            onHover={handleHover}
            onUpdate={handleUpdate}
            assets={viewerAssets}
            lang={lang}
            theme={theme}
            showVisual={showVisual}
            setShowVisual={handleSetShowVisual}
            snapshotAction={snapshotActionRef}
            showToolbar={viewConfig.showToolbar}
            setShowToolbar={(show) => setViewConfig(prev => ({ ...prev, showToolbar: show }))}
            showOptionsPanel={viewConfig.showOptionsPanel}
            setShowOptionsPanel={(show) => setViewConfig(prev => ({ ...prev, showOptionsPanel: show }))}
            showVisualizerOptionsPanel={viewConfig.showVisualizerOptionsPanel}
            setShowVisualizerOptionsPanel={(show) => setViewConfig(prev => ({ ...prev, showVisualizerOptionsPanel: show }))}
            showJointPanel={viewConfig.showJointPanel}
            setShowJointPanel={(show) => setViewConfig(prev => ({ ...prev, showJointPanel: show }))}
            availableFiles={availableFiles}
            urdfContent={urdfContentForViewer}
            viewerSourceFormat={viewerSourceFormat}
            sourceFilePath={viewerSourceFilePath}
            sourceFile={getViewerSourceFile({
              selectedFile,
              shouldRenderAssembly,
              workspaceSourceFile: workspaceViewerMjcfSourceFile,
            })}
            onRobotDataResolved={handleRobotDataResolved}
            onDocumentLoadEvent={handleViewerDocumentLoadEvent}
            jointAngleState={jointAngleState}
            jointMotionState={jointMotionState}
            onJointChange={handleJointChange}
            syncJointChangesToApp
            selection={robot.selection}
            focusTarget={focusTarget}
            isMeshPreview={selectedFile?.format === 'mesh'}
            onTransformPendingChange={handleTransformPendingChange}
            onCollisionTransform={handleCollisionTransform}
            assemblyState={assemblyState}
            assemblyWorkspaceActive={shouldRenderAssembly}
            assemblySelection={assemblySelection}
            onAssemblyTransform={handleAssemblyTransform}
            onComponentTransform={handleComponentTransform}
            onBridgeTransform={handleBridgeTransform}
            filePreview={filePreview}
            onClosePreview={handleClosePreview}
            pendingViewerToolMode={pendingViewerToolMode}
            onConsumePendingViewerToolMode={() => setPendingViewerToolMode(null)}
            viewerReloadKey={viewerReloadKey}
            documentLoadState={documentLoadState}
          />
          {(previewFileName ?? selectedFile?.name) && documentLoadState.fileName === (previewFileName ?? selectedFile?.name) ? (
            <DocumentLoadingOverlay state={documentLoadState} lang={lang} />
          ) : null}
        </div>

        <PropertyEditor
          robot={previewContextRobot}
          onUpdate={handleUpdate}
          onSelect={handleSelectWithAssemblyClear}
          onHover={handleHover}
          mode={mergedAppMode}
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

      <SnapshotDialog
        isOpen={isSnapshotDialogOpen}
        isCapturing={isSnapshotCapturing}
        lang={lang}
        onClose={() => setIsSnapshotDialogOpen(false)}
        onCapture={handleCaptureSnapshot}
      />

      {assemblyComponentPreparationOverlay ? (
        <ImportPreparationOverlay
          label={assemblyComponentPreparationOverlay.label}
          detail={assemblyComponentPreparationOverlay.detail}
          progress={assemblyComponentPreparationOverlay.progress}
          statusLabel={assemblyComponentPreparationOverlay.statusLabel}
          stageLabel={assemblyComponentPreparationOverlay.stageLabel}
        />
      ) : null}

      <AppLayoutOverlays
        isCodeViewerOpen={isCodeViewerOpen}
        sourceCodeContent={sourceCodeContent}
        sourceCodeDocumentFlavor={sourceCodeDocumentFlavor}
        forceSourceCodeReadOnly={Boolean(previewFileName)}
        autoApplyEnabled={sourceCodeAutoApply}
        onCodeChange={handleCodeChange}
        onSourceCodeDownload={() => markUnsavedChangesBaselineSaved('robot')}
        onCloseCodeViewer={() => setIsCodeViewerOpen(false)}
        theme={theme}
        selectedFileName={sourceCodeFileName}
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
        onCloseBridgeModal={handleCloseBridgeModal}
        onCreateBridge={handleCreateBridgeCommit}
        onPreviewBridgeChange={handleBridgePreviewChange}
      />
    </div>
  );
}

export default AppLayout;
