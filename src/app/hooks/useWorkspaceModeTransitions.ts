import { useCallback, type MutableRefObject } from 'react';

import { analyzeAssemblyConnectivity } from '@/core/robot';
import { buildExportableAssemblyRobotData } from '@/core/robot/assemblyTransforms';
import { createRobotSemanticSnapshot } from '@/shared/utils/robot/semanticSnapshot';
import { scheduleFailFastInDev } from '@/core/utils/runtimeDiagnostics';
import { markUnsavedChangesBaselineSaved } from '@/app/utils/unsavedChangesBaseline';
import {
  getCurrentUsdViewerSceneSnapshot,
  prepareUsdExportCacheFromSnapshot,
} from '@/features/urdf-viewer';
import {
  createGeneratedWorkspaceUrdfFile,
  isGeneratedWorkspaceUrdfFileName,
  resolveWorkspaceGeneratedUrdfRobotData,
  shouldPromptGenerateWorkspaceUrdfOnStructureSwitch,
  shouldReseedSingleComponentAssemblyFromActiveFile,
} from './workspaceSourceSyncUtils';
import { buildGeneratedWorkspaceFileState } from './workspaceGeneratedSourceState';
import { useAssemblyStore, useAssetsStore, useUIStore } from '@/store';
import type { RobotData, RobotFile, UrdfJoint, UrdfLink } from '@/types';

export interface ProModeRoundtripSession {
  baselineSnapshot: string;
  generatedFileName: string | null;
}

interface UseWorkspaceModeTransitionsTranslations {
  generateWorkspaceUrdfDisconnected: string;
  generateWorkspaceUrdfUnavailable: string;
  generateWorkspaceUrdfSuccess: string;
  addedComponent: string;
}

interface UseWorkspaceModeTransitionsParams {
  previewFile: RobotFile | null;
  selectedFile: RobotFile | null;
  availableFiles: RobotFile[];
  allFileContents: Record<string, string>;
  assets: Record<string, string>;
  getUsdPreparedExportCache: (
    fileName: string,
  ) => { robotData?: RobotData | null } | null | undefined;
  robotName: string;
  robotLinks: Record<string, UrdfLink>;
  robotJoints: Record<string, UrdfJoint>;
  rootLinkId: string;
  robotMaterials: RobotData['materials'];
  closedLoopConstraints: RobotData['closedLoopConstraints'];
  setRobot: (
    data: RobotData,
    options?: { resetHistory?: boolean; skipHistory?: boolean; label?: string },
  ) => void;
  setSelection: (selection: { type: null; id: null }) => void;
  showToast: (message: string, type?: 'info' | 'success' | 'error') => void;
  t: UseWorkspaceModeTransitionsTranslations;
  handleClosePreview: () => void;
  prepareAssemblyComponentForInsert: (
    file: RobotFile,
    options?: {
      existingComponentIds?: Iterable<string>;
      existingComponentNames?: Iterable<string>;
      preResolvedRobotData?: RobotData | null;
    },
  ) => Promise<unknown>;
  activateInsertedAssemblyComponent: (component: {
    id: string;
    robot: { rootLinkId: string };
  }) => void;
  addComponent: (
    file: RobotFile,
    context?: {
      availableFiles?: RobotFile[];
      assets?: Record<string, string>;
      allFileContents?: Record<string, string>;
      preResolvedRobotData?: RobotData | null;
      preparedComponent?: unknown;
    },
  ) => { id: string; name: string; robot: { rootLinkId: string } } | null;
  initAssembly: (name: string) => void;
  onLoadRobot: (file: RobotFile) => void;
  pendingUsdAssemblyFileRef: MutableRefObject<RobotFile | null>;
  proModeRoundtripSessionRef: MutableRefObject<ProModeRoundtripSession | null>;
}

export function useWorkspaceModeTransitions({
  previewFile,
  selectedFile,
  availableFiles,
  allFileContents,
  assets,
  getUsdPreparedExportCache,
  robotName,
  robotLinks,
  robotJoints,
  rootLinkId,
  robotMaterials,
  closedLoopConstraints,
  setRobot,
  setSelection,
  showToast,
  t,
  handleClosePreview,
  prepareAssemblyComponentForInsert,
  activateInsertedAssemblyComponent,
  addComponent,
  initAssembly,
  onLoadRobot,
  pendingUsdAssemblyFileRef,
  proModeRoundtripSessionRef,
}: UseWorkspaceModeTransitionsParams) {
  const updateProModeRoundtripBaseline = useCallback(
    (generatedFileName: string | null) => {
      const nextAssemblyState = useAssemblyStore.getState().assemblyState;
      const mergedRobotData = nextAssemblyState
        ? buildExportableAssemblyRobotData(nextAssemblyState)
        : null;
      if (!mergedRobotData) {
        proModeRoundtripSessionRef.current = null;
        return false;
      }

      proModeRoundtripSessionRef.current = {
        baselineSnapshot: createRobotSemanticSnapshot({
          ...mergedRobotData,
          selection: { type: null, id: null },
        }),
        generatedFileName,
      };

      return true;
    },
    [proModeRoundtripSessionRef],
  );

  const switchTreeEditorToStructure = useCallback(() => {
    handleClosePreview();
    useUIStore.getState().setSidebarTab('structure');
    proModeRoundtripSessionRef.current = null;
    return 'switched' as const;
  }, [handleClosePreview, proModeRoundtripSessionRef]);

  const generateWorkspaceUrdfFromProMode = useCallback(
    (options: { switchToStructure?: boolean } = {}) => {
      const { switchToStructure = false } = options;
      const assemblyStoreState = useAssemblyStore.getState();
      const connectivity = analyzeAssemblyConnectivity(assemblyStoreState.assemblyState);
      const activeFile = previewFile ?? selectedFile;

      if (connectivity.hasDisconnectedComponents) {
        showToast(t.generateWorkspaceUrdfDisconnected, 'info');
        return false;
      }

      const mergedRobotData = resolveWorkspaceGeneratedUrdfRobotData({
        assemblyState: assemblyStoreState.assemblyState,
        activeFile,
        availableFiles,
        assets,
        allFileContents,
        usdRobotData:
          activeFile?.format === 'usd'
            ? (getUsdPreparedExportCache(activeFile.name)?.robotData ?? null)
            : null,
      });

      if (!mergedRobotData) {
        showToast(t.generateWorkspaceUrdfUnavailable, 'info');
        return false;
      }

      const assetsState = useAssetsStore.getState();
      const session = proModeRoundtripSessionRef.current;
      const { file, robot, snapshot } = createGeneratedWorkspaceUrdfFile({
        assemblyName:
          assemblyStoreState.assemblyState?.name ||
          mergedRobotData.name ||
          robotName ||
          'workspace',
        mergedRobotData,
        availableFiles: assetsState.availableFiles,
        preferredFileName: session?.generatedFileName,
      });

      const generatedState = buildGeneratedWorkspaceFileState({
        availableFiles: assetsState.availableFiles,
        allFileContents: assetsState.allFileContents,
        file,
      });

      assetsState.setAvailableFiles(generatedState.nextAvailableFiles);
      assetsState.setAllFileContents(generatedState.nextAllFileContents);
      assetsState.setSelectedFile(generatedState.nextSelectedFile);
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
    },
    [
      allFileContents,
      assets,
      availableFiles,
      getUsdPreparedExportCache,
      handleClosePreview,
      previewFile,
      proModeRoundtripSessionRef,
      robotName,
      selectedFile,
      setRobot,
      setSelection,
      showToast,
      t.generateWorkspaceUrdfDisconnected,
      t.generateWorkspaceUrdfSuccess,
      t.generateWorkspaceUrdfUnavailable,
    ],
  );

  const handleRequestSwitchTreeEditorToStructure = useCallback(
    (intent: 'direct' | 'generate' | 'skip-generate') => {
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

      const activeWorkspaceSourceFile = previewFile ?? selectedFile;
      const currentWorkspaceSourceSnapshot = createRobotSemanticSnapshot({
        name: robotName,
        links: robotLinks,
        joints: robotJoints,
        rootLinkId,
        materials: robotMaterials,
        closedLoopConstraints,
      });
      const latestAssemblyState = useAssemblyStore.getState().assemblyState;
      if (intent === 'skip-generate') {
        return switchTreeEditorToStructure();
      }

      return shouldPromptGenerateWorkspaceUrdfOnStructureSwitch({
        assemblyState: latestAssemblyState,
        activeFile: activeWorkspaceSourceFile,
        sourceSnapshot: currentWorkspaceSourceSnapshot,
        sourceRobotData:
          activeWorkspaceSourceFile?.format === 'usd'
            ? (getUsdPreparedExportCache(activeWorkspaceSourceFile.name)?.robotData ?? null)
            : null,
        baselineSnapshot: session.baselineSnapshot,
      })
        ? ('needs-generate-confirm' as const)
        : switchTreeEditorToStructure();
    },
    [
      closedLoopConstraints,
      generateWorkspaceUrdfFromProMode,
      getUsdPreparedExportCache,
      previewFile,
      proModeRoundtripSessionRef,
      robotJoints,
      robotLinks,
      robotMaterials,
      robotName,
      rootLinkId,
      selectedFile,
      switchTreeEditorToStructure,
    ],
  );

  const handleSwitchTreeEditorToProMode = useCallback(() => {
    const activeFile = previewFile ?? selectedFile;
    const currentAssemblyState = useAssemblyStore.getState().assemblyState;
    const activeGeneratedFileName = isGeneratedWorkspaceUrdfFileName(activeFile?.name)
      ? (activeFile?.name ?? null)
      : null;

    if (
      !shouldReseedSingleComponentAssemblyFromActiveFile({
        assemblyState: currentAssemblyState,
        activeFile,
      })
    ) {
      updateProModeRoundtripBaseline(activeGeneratedFileName);
      return;
    }

    proModeRoundtripSessionRef.current = null;

    if (!activeFile) {
      return;
    }

    void (async () => {
      let preResolvedRobotData =
        activeFile.format === 'usd'
          ? (getUsdPreparedExportCache(activeFile.name)?.robotData ?? null)
          : null;

      if (activeFile.format === 'usd' && !preResolvedRobotData) {
        const fallbackSceneSnapshot = getCurrentUsdViewerSceneSnapshot({
          stageSourcePath: activeFile.name,
        });
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
          new Error(`Failed to reseed Professional mode assembly with "${activeFile.name}".`),
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
          : new Error(`Failed to resolve Professional mode source from "${activeFile.name}".`),
      );
      showToast(`Failed to sync Professional mode assembly source: ${activeFile.name}`, 'info');
    });
  }, [
    activateInsertedAssemblyComponent,
    addComponent,
    allFileContents,
    assets,
    availableFiles,
    getUsdPreparedExportCache,
    initAssembly,
    onLoadRobot,
    pendingUsdAssemblyFileRef,
    prepareAssemblyComponentForInsert,
    previewFile,
    proModeRoundtripSessionRef,
    robotName,
    selectedFile,
    showToast,
    updateProModeRoundtripBaseline,
  ]);

  return {
    updateProModeRoundtripBaseline,
    handleRequestSwitchTreeEditorToStructure,
    handleSwitchTreeEditorToProMode,
  };
}
