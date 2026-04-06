/**
 * File Export Hook
 * Handles exporting robot as URDF, extended URDF, BOM, and MuJoCo XML
 */
import { useCallback } from 'react';
import { applyPatches, type Patch } from 'immer';
import JSZip from 'jszip';
import { useShallow } from 'zustand/react/shallow';
import type { AssemblyState, RobotFile, RobotState } from '@/types';
import {
  generateSDF,
  generateSdfModelConfig,
  generateURDF,
  generateMujocoXML,
  generateSkeletonXML,
  injectGazeboTags,
} from '@/core/parsers';
import { analyzeAssemblyConnectivity } from '@/core/robot';
import { buildExportableAssemblyRobotData } from '@/core/robot/assemblyTransforms';
import { rewriteUrdfAssetPathsForExport } from '@/core/parsers/meshPathUtils';
import { useAssemblyStore, useAssetsStore, useRobotStore, useUIStore } from '@/store';
import {
  getUsdExportWorkerUnsupportedMeshPaths,
  exportProjectWithWorker,
  exportRobotToUsdWithWorker,
  prepareMjcfMeshExportAssets,
  type ExportDialogConfig,
  type ExportProgressState,
} from '@/features/file-io';
import { getUsdStageExportHandler } from '@/features/urdf-viewer';
import { translations } from '@/shared/i18n';
import { normalizeMergedAppMode } from '@/shared/utils/appMode';
import type { RobotAssetPackagingFailure } from '../utils/exportArchiveAssets';
import { addRobotAssetsToZip } from '../utils/exportArchiveAssets';
import { resolveCurrentUsdExportMode } from '../utils/currentUsdExportMode';
import { flushPendingHistory } from '../utils/pendingHistory';
import {
  buildCurrentRobotExportData,
  buildCurrentRobotExportState,
} from './projectRobotStateUtils';
import { resolveCurrentUsdExportBundle } from '../utils/usdExportContext';
import { buildLiveUsdRoundtripArchive } from '../utils/liveUsdRoundtripExport';
import { convertUsdArchiveFilesToBinaryWithWorker } from '../utils/usdBinaryArchiveWorkerBridge';
import { resolveUrdfSourceExportContent } from './urdfSourceExportUtils';
import { buildGeneratedUrdfOptions } from '../utils/generatedUrdfOptions';
import { resolveRobotFileDataWithWorker } from './robotImportWorkerBridge';
import { markUnsavedChangesBaselineSaved } from '../utils/unsavedChangesBaseline';

type ExportTarget = { type: 'current' } | { type: 'library-file'; file: RobotFile };

const DEFAULT_EXPORT_TARGET: ExportTarget = { type: 'current' };
const PROGRESS_MIN_UPDATE_INTERVAL_MS = 120;
const PROGRESS_MIN_DELTA = 0.02;
const USD_EXPORT_STAGE_PROGRESS_RANGES = {
  links: { start: 0.08, end: 0.34 },
  geometry: { start: 0.34, end: 0.62 },
  scene: { start: 0.62, end: 0.92 },
  assets: { start: 0.92, end: 0.99 },
} as const;

interface ExportContext {
  robot: RobotState;
  exportName: string;
  extraMeshFiles?: Map<string, Blob>;
}

interface HandleExportWithConfigOptions {
  onProgress?: (progress: ExportProgressState) => void;
}

interface HandleProjectExportOptions {
  onProgress?: (progress: ExportProgressState) => void;
  /** 
   * Set to true to skip the default browser download and only get the Blob back.
   * Useful when you want to handle the generated file externally (like uploading to a cloud drive).
   */
  skipDownload?: boolean;
}

export interface ExportExecutionIssue {
  code: string;
  message: string;
  context?: Record<string, string>;
}

export interface DisconnectedWorkspaceUrdfExportAction {
  type: 'disconnected-workspace-urdf';
  componentCount: number;
  connectedGroupCount: number;
  exportName: string;
}

export type ExportActionRequired = DisconnectedWorkspaceUrdfExportAction;

export interface ExportExecutionResult {
  partial: boolean;
  warnings: string[];
  issues: ExportExecutionIssue[];
  actionRequired?: ExportActionRequired;
}

export interface ProjectExportExecutionResult {
  partial: boolean;
  warnings: string[];
  issues: ExportExecutionIssue[];
  actionRequired?: ExportActionRequired;
  /**
   * The generated USP package file content.
   * Exposed for external callers to use the Blob directly without downloading (e.g., for uploading to a cloud drive).
   */
  blob?: Blob;
}

interface UrdfSourceExportPreference {
  useRelativePaths?: boolean;
  preferSourceVisualMeshes?: boolean;
}

type ExportProgressReporter = (
  currentStep: number,
  stepLabel: string,
  detail: string,
  options?: {
    stageProgress?: number;
    indeterminate?: boolean;
  },
) => void;

type AssemblyHistoryPatchEntry = {
  kind: 'patch';
  redoPatches: Patch[];
  undoPatches: Patch[];
};

type AssemblyHistorySnapshotEntry = {
  kind: 'snapshot';
  snapshot: AssemblyState | null;
};

type AssemblyHistoryEntry =
  | AssemblyState
  | null
  | AssemblyHistoryPatchEntry
  | AssemblyHistorySnapshotEntry;

type AssemblyHistoryState = {
  past: AssemblyHistoryEntry[];
  future: AssemblyHistoryEntry[];
};

function cloneAssemblySnapshot(snapshot: AssemblyState | null): AssemblyState | null {
  return snapshot ? structuredClone(snapshot) : null;
}

function isAssemblyHistoryPatchEntry(
  entry: AssemblyHistoryEntry,
): entry is AssemblyHistoryPatchEntry {
  return Boolean(entry && typeof entry === 'object' && 'kind' in entry && entry.kind === 'patch');
}

function isAssemblyHistorySnapshotEntry(
  entry: AssemblyHistoryEntry,
): entry is AssemblyHistorySnapshotEntry {
  return Boolean(
    entry && typeof entry === 'object' && 'kind' in entry && entry.kind === 'snapshot',
  );
}

function applyAssemblyHistoryEntry(
  currentState: AssemblyState | null,
  entry: AssemblyHistoryEntry,
  direction: 'undo' | 'redo',
): AssemblyState | null {
  if (isAssemblyHistoryPatchEntry(entry)) {
    return applyPatches(
      currentState,
      direction === 'undo' ? entry.undoPatches : entry.redoPatches,
    ) as AssemblyState | null;
  }

  if (isAssemblyHistorySnapshotEntry(entry)) {
    return cloneAssemblySnapshot(entry.snapshot);
  }

  return cloneAssemblySnapshot(entry);
}

function materializeAssemblyHistorySnapshots(
  history: AssemblyHistoryState,
  present: AssemblyState | null,
): {
  past: Array<AssemblyState | null>;
  future: Array<AssemblyState | null>;
} {
  let cursor = cloneAssemblySnapshot(present);
  const past: Array<AssemblyState | null> = [];
  for (let index = history.past.length - 1; index >= 0; index -= 1) {
    cursor = applyAssemblyHistoryEntry(cursor, history.past[index], 'undo');
    past.unshift(cloneAssemblySnapshot(cursor));
  }

  cursor = cloneAssemblySnapshot(present);
  const future: Array<AssemblyState | null> = [];
  for (const entry of history.future) {
    cursor = applyAssemblyHistoryEntry(cursor, entry, 'redo');
    future.push(cloneAssemblySnapshot(cursor));
  }

  return { past, future };
}

export function useFileExport() {
  const { lang, appMode, sidebarTab } = useUIStore(
    useShallow((state) => ({
      lang: state.lang,
      appMode: state.appMode,
      sidebarTab: state.sidebarTab,
    })),
  );
  const mergedAppMode = normalizeMergedAppMode(appMode);
  const t = translations[lang];
  const {
    assets,
    availableFiles,
    allFileContents,
    motorLibrary,
    selectedFile,
    documentLoadState,
    getUsdSceneSnapshot,
    getUsdPreparedExportCache,
    usdPreparedExportCaches,
    originalUrdfContent,
    originalFileFormat,
  } = useAssetsStore(
    useShallow((state) => ({
      assets: state.assets,
      availableFiles: state.availableFiles,
      allFileContents: state.allFileContents,
      motorLibrary: state.motorLibrary,
      selectedFile: state.selectedFile,
      documentLoadState: state.documentLoadState,
      getUsdSceneSnapshot: state.getUsdSceneSnapshot,
      getUsdPreparedExportCache: state.getUsdPreparedExportCache,
      usdPreparedExportCaches: state.usdPreparedExportCaches,
      originalUrdfContent: state.originalUrdfContent,
      originalFileFormat: state.originalFileFormat,
    })),
  );
  const { assemblyState, assemblyHistory, assemblyActivity, getMergedRobotData } = useAssemblyStore(
    useShallow((state) => ({
      assemblyState: state.assemblyState,
      assemblyHistory: state._history,
      assemblyActivity: state._activity,
      getMergedRobotData: state.getMergedRobotData,
    })),
  );

  // Get robot state from store
  const {
    robotName,
    robotLinks,
    robotJoints,
    rootLinkId,
    robotMaterials,
    closedLoopConstraints,
    robotHistory,
    robotActivity,
  } = useRobotStore(
    useShallow((state) => ({
      robotName: state.name,
      robotLinks: state.links,
      robotJoints: state.joints,
      rootLinkId: state.rootLinkId,
      robotMaterials: state.materials,
      closedLoopConstraints: state.closedLoopConstraints,
      robotHistory: state._history,
      robotActivity: state._activity,
    })),
  );

  const downloadBlob = useCallback((blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  const replaceTemplate = useCallback(
    (template: string, replacements: Record<string, string | number>): string =>
      Object.entries(replacements).reduce(
        (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
        template,
      ),
    [],
  );

  const trimProgressFileLabel = useCallback((filePath: string | null | undefined): string => {
    const normalized = String(filePath || '')
      .trim()
      .replace(/\\/g, '/');
    if (!normalized) {
      return '';
    }

    const segments = normalized.split('/').filter(Boolean);
    if (segments.length <= 2) {
      return segments.join('/');
    }

    return segments.slice(-2).join('/');
  }, []);

  const createProgressReporter = useCallback(
    (
      onProgress: HandleExportWithConfigOptions['onProgress'],
      totalSteps: number,
    ): ExportProgressReporter => {
      let lastProgress: ExportProgressState | null = null;
      let lastReportedAt = 0;

      return (currentStep, stepLabel, detail, options = {}) => {
        if (!onProgress) {
          return;
        }

        const indeterminate = options.indeterminate ?? options.stageProgress == null;
        const fallbackStageProgress = indeterminate ? 0.24 : 0;
        const stageProgress = Math.min(
          1,
          Math.max(0, options.stageProgress ?? fallbackStageProgress),
        );

        const nextProgress: ExportProgressState = {
          stepLabel,
          detail,
          progress: Math.min(1, Math.max(0, (currentStep - 1 + stageProgress) / totalSteps)),
          currentStep,
          totalSteps,
          indeterminate,
        };

        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const isFirstUpdate = lastProgress == null;
        const isStepTransition = lastProgress?.currentStep !== nextProgress.currentStep;
        const didIndeterminateChange = lastProgress?.indeterminate !== nextProgress.indeterminate;
        const isTerminalUpdate = nextProgress.progress >= 0.999;
        const progressDelta = Math.abs((lastProgress?.progress ?? 0) - nextProgress.progress);
        const timeSinceLastReport = now - lastReportedAt;

        if (
          !isFirstUpdate &&
          !isStepTransition &&
          !didIndeterminateChange &&
          !isTerminalUpdate &&
          progressDelta < PROGRESS_MIN_DELTA &&
          timeSinceLastReport < PROGRESS_MIN_UPDATE_INTERVAL_MS
        ) {
          return;
        }

        lastProgress = nextProgress;
        lastReportedAt = now;
        onProgress(nextProgress);
      };
    },
    [],
  );

  const throwForAssetPackagingFailures = useCallback(
    (failures: RobotAssetPackagingFailure[]): void => {
      if (failures.length === 0) {
        return;
      }

      const [firstFailure] = failures;
      throw new Error(firstFailure?.message || 'Failed to package export assets');
    },
    [],
  );

  const generateZipBlobWithProgress = useCallback(
    async (zip: JSZip, reportProgress: ExportProgressReporter, currentStep: number) => {
      reportProgress(currentStep, t.exportProgressPackaging, t.exportProgressPackagingDetail, {
        stageProgress: 0.04,
        indeterminate: true,
      });

      return zip.generateAsync({ type: 'blob' }, (metadata) => {
        const currentFile = trimProgressFileLabel(metadata.currentFile);
        reportProgress(
          currentStep,
          t.exportProgressPackaging,
          currentFile
            ? replaceTemplate(t.exportProgressPackagingDetailFile, { file: currentFile })
            : t.exportProgressPackagingDetail,
          {
            stageProgress: metadata.percent / 100,
            indeterminate: false,
          },
        );
      });
    },
    [replaceTemplate, t, trimProgressFileLabel],
  );

  const isCurrentUsdHydrating =
    selectedFile?.format === 'usd' &&
    documentLoadState.status === 'hydrating' &&
    documentLoadState.fileName === selectedFile.name;
  const currentUsdExportMode =
    selectedFile?.format === 'usd' && sidebarTab !== 'workspace'
      ? resolveCurrentUsdExportMode({
          isHydrating: isCurrentUsdHydrating,
          hasLiveStageExportHandler: Boolean(getUsdStageExportHandler()),
          hasPreparedExportCache: Boolean(getUsdPreparedExportCache(selectedFile.name)),
          hasSceneSnapshot: Boolean(getUsdSceneSnapshot(selectedFile.name)),
        })
      : 'unavailable';

  const buildRobotForExport = useCallback((): RobotState => {
    // Keep export source aligned with current viewer:
    // workspace tab -> merged assembly; structure tab -> current robot store.
    if (assemblyState && sidebarTab === 'workspace') {
      const mergedData = buildExportableAssemblyRobotData(assemblyState);
      return { ...mergedData, selection: { type: null, id: null } };
    }

    return buildCurrentRobotExportState({
      robotName,
      robotLinks,
      robotJoints,
      rootLinkId,
      robotMaterials,
      closedLoopConstraints,
    });
  }, [
    assemblyState,
    closedLoopConstraints,
    sidebarTab,
    getMergedRobotData,
    robotJoints,
    robotLinks,
    robotMaterials,
    robotName,
    rootLinkId,
  ]);

  const getRobotExportName = useCallback((robot: RobotState): string => {
    const trimmed = robot.name?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : 'robot';
  }, []);

  const resolveDisconnectedWorkspaceUrdfAction = useCallback(
    (target: ExportTarget, config: ExportDialogConfig): ExportActionRequired | null => {
      if (
        target.type !== 'current' ||
        config.format !== 'urdf' ||
        sidebarTab !== 'workspace' ||
        !assemblyState
      ) {
        return null;
      }

      const analysis = analyzeAssemblyConnectivity(assemblyState);
      if (!analysis.hasDisconnectedComponents) {
        return null;
      }

      return {
        type: 'disconnected-workspace-urdf',
        componentCount: analysis.componentCount,
        connectedGroupCount: analysis.connectedGroupCount,
        exportName: assemblyState.name?.trim() || 'assembly',
      };
    },
    [assemblyState, sidebarTab],
  );

  const createArchiveRoot = useCallback((zip: JSZip, exportName: string): JSZip => {
    return zip.folder(exportName) ?? zip;
  }, []);

  const getFileBaseName = useCallback((path: string): string => {
    const fileName = path.split('/').pop() ?? path;
    const withoutExt = fileName.replace(/\.[^/.]+$/, '');
    const trimmed = withoutExt.trim();
    return trimmed.length > 0 ? trimmed : 'robot';
  }, []);

  const addSkeletonToZip = useCallback(
    (robot: RobotState, zip: JSZip, exportName: string, includeMeshes: boolean) => {
      zip.file(
        `${exportName}_skeleton.xml`,
        generateSkeletonXML(robot, {
          meshdir: 'meshes/',
          includeMeshes,
          includeActuators: true,
        }),
      );
    },
    [],
  );

  const addMeshesToZip = useCallback(
    async (
      robot: RobotState,
      zip: JSZip,
      compressOptions?: { compressSTL: boolean; stlQuality: number },
      extraMeshFiles?: Map<string, Blob>,
      skipMeshPaths?: ReadonlySet<string>,
      onProgress?: (progress: { completed: number; total: number; currentFile: string }) => void,
    ) => {
      return addRobotAssetsToZip({
        robot,
        zip,
        assets,
        compressOptions,
        extraMeshFiles,
        skipMeshPaths,
        onProgress,
      });
    },
    [assets],
  );

  const addArchiveFilesToZip = useCallback(
    (zip: JSZip, folderName: string, archiveFiles?: Map<string, Blob>) => {
      if (!archiveFiles || archiveFiles.size === 0) {
        return;
      }

      const targetFolder = zip.folder(folderName);
      archiveFiles.forEach((blob, relativePath) => {
        targetFolder?.file(relativePath, blob);
      });
    },
    [],
  );

  const resolveLibraryRobotForExport = useCallback(
    async (file: RobotFile): Promise<RobotState> => {
      const isSupportedFormat =
        file.format === 'urdf' ||
        file.format === 'mjcf' ||
        file.format === 'xacro' ||
        file.format === 'sdf';

      if (!isSupportedFormat) {
        throw new Error(
          replaceTemplate(t.exportLibraryUnsupportedFormat, { format: file.format.toUpperCase() }),
        );
      }

      const importResult = await resolveRobotFileDataWithWorker(file, {
        availableFiles,
        assets,
        allFileContents,
        usdRobotData: getUsdPreparedExportCache(file.name)?.robotData ?? null,
      });

      if (importResult.status !== 'ready') {
        throw new Error(replaceTemplate(t.exportLibraryParseFailed, { file: file.name }));
      }

      return {
        ...importResult.robotData,
        selection: { type: null, id: null },
      };
    },
    [
      allFileContents,
      assets,
      availableFiles,
      getUsdPreparedExportCache,
      replaceTemplate,
      t.exportLibraryParseFailed,
      t.exportLibraryUnsupportedFormat,
    ],
  );

  const buildUrdfSourceExportContent = useCallback(
    async (
      target: ExportTarget,
      exportName: string,
      options: UrdfSourceExportPreference = {},
    ): Promise<string | null> => {
      const { useRelativePaths = false, preferSourceVisualMeshes = true } = options;

      if (!preferSourceVisualMeshes) {
        return null;
      }

      if (target.type === 'library-file') {
        if (target.file.format !== 'urdf') {
          return null;
        }

        return rewriteUrdfAssetPathsForExport(target.file.content, {
          exportRobotName: exportName,
          useRelativePaths,
        });
      }

      if (sidebarTab === 'workspace' || selectedFile?.format !== 'urdf' || isCurrentUsdHydrating) {
        return null;
      }

      return resolveUrdfSourceExportContent({
        currentRobot: buildRobotForExport(),
        exportRobotName: exportName,
        selectedFileName: selectedFile.name,
        selectedFileContent: selectedFile.content,
        originalUrdfContent,
        useRelativePaths,
        preferSourceVisualMeshes,
      });
    },
    [buildRobotForExport, isCurrentUsdHydrating, originalUrdfContent, selectedFile, sidebarTab],
  );

  const buildCurrentUsdExportContext = useCallback((): ExportContext | null => {
    if (selectedFile?.format !== 'usd' || sidebarTab === 'workspace' || isCurrentUsdHydrating) {
      return null;
    }

    const bundle = resolveCurrentUsdExportBundle({
      stageSourcePath: selectedFile.name,
      currentRobot: buildRobotForExport(),
      cachedSnapshot: getUsdSceneSnapshot(selectedFile.name),
      preparedCache: getUsdPreparedExportCache(selectedFile.name),
    });
    if (!bundle) {
      return null;
    }

    return {
      robot: bundle.robot,
      exportName: getRobotExportName(bundle.robot),
      extraMeshFiles: bundle.meshFiles,
    };
  }, [
    buildRobotForExport,
    getRobotExportName,
    getUsdPreparedExportCache,
    getUsdSceneSnapshot,
    isCurrentUsdHydrating,
    selectedFile,
    sidebarTab,
  ]);

  const resolveExportContext = useCallback(
    (target: ExportTarget = DEFAULT_EXPORT_TARGET): ExportContext | null => {
      if (target.type === 'library-file') {
        return null;
      }

      if (selectedFile?.format === 'usd' && sidebarTab !== 'workspace') {
        return buildCurrentUsdExportContext();
      }

      const usdExportContext = buildCurrentUsdExportContext();
      if (usdExportContext) {
        return usdExportContext;
      }

      const robot = buildRobotForExport();
      return {
        robot,
        exportName: getRobotExportName(robot),
      };
    },
    [
      buildCurrentUsdExportContext,
      buildRobotForExport,
      getRobotExportName,
      selectedFile,
      sidebarTab,
    ],
  );

  // Generate BOM (Bill of Materials) CSV
  const generateBOM = useCallback(
    (robot: RobotState): string => {
      const headers = [
        t.jointName,
        t.type,
        t.motorType,
        t.motorId,
        t.direction,
        t.armature,
        t.lower,
        t.upper,
      ];

      const rows = Object.values(robot.joints)
        .map((j) => {
          if (j.type === 'fixed') return null;
          if (!j.hardware?.motorType || j.hardware.motorType === 'None') return null;

          return [
            j.name,
            j.type,
            j.hardware?.motorType,
            j.hardware?.motorId || '',
            j.hardware?.motorDirection || 1,
            j.hardware?.armature || 0,
            j.limit?.lower ?? '',
            j.limit?.upper ?? '',
          ].join(',');
        })
        .filter((row) => row !== null);

      return [headers.join(','), ...rows].join('\n');
    },
    [t],
  );

  const handleExportURDF = useCallback(async () => {
    flushPendingHistory();
    const target = DEFAULT_EXPORT_TARGET;
    const exportContext = resolveExportContext(target);
    if (!exportContext) {
      throw new Error(t.exportFailedParse);
    }
    const { robot, exportName, extraMeshFiles } = exportContext;
    const zip = new JSZip();
    const archiveRoot = createArchiveRoot(zip, exportName);
    const generatedUrdfOptions = await buildGeneratedUrdfOptions(extraMeshFiles);

    archiveRoot.file(
      `${exportName}.urdf`,
      (await buildUrdfSourceExportContent(target, exportName)) ??
        generateURDF(robot, generatedUrdfOptions),
    );
    await addMeshesToZip(robot, archiveRoot, undefined, extraMeshFiles);

    const content = await zip.generateAsync({ type: 'blob' });
    downloadBlob(content, `${exportName}_urdf.zip`);
  }, [
    resolveExportContext,
    createArchiveRoot,
    buildUrdfSourceExportContent,
    addMeshesToZip,
    downloadBlob,
    t.exportFailedParse,
  ]);

  const handleExportMJCF = useCallback(async () => {
    flushPendingHistory();
    const exportContext = resolveExportContext();
    if (!exportContext) {
      throw new Error(t.exportFailedParse);
    }
    const { robot, exportName, extraMeshFiles } = exportContext;
    const mjcfMeshExport = await prepareMjcfMeshExportAssets({
      robot,
      assets,
      extraMeshFiles,
    });
    const zip = new JSZip();
    const archiveRoot = createArchiveRoot(zip, exportName);

    archiveRoot.file(
      `${exportName}.xml`,
      generateMujocoXML(robot, {
        meshdir: 'meshes/',
        meshPathOverrides: mjcfMeshExport.meshPathOverrides,
        visualMeshVariants: mjcfMeshExport.visualMeshVariants,
      }),
    );
    await addMeshesToZip(
      robot,
      archiveRoot,
      undefined,
      extraMeshFiles,
      mjcfMeshExport.convertedSourceMeshPaths,
    );
    addArchiveFilesToZip(archiveRoot, 'meshes', mjcfMeshExport.archiveFiles);

    const content = await zip.generateAsync({ type: 'blob' });
    downloadBlob(content, `${exportName}_mjcf.zip`);
  }, [
    resolveExportContext,
    assets,
    createArchiveRoot,
    addMeshesToZip,
    addArchiveFilesToZip,
    downloadBlob,
    t.exportFailedParse,
  ]);

  // Export handler
  const handleExport = useCallback(async () => {
    flushPendingHistory();
    const target = DEFAULT_EXPORT_TARGET;
    const exportContext = resolveExportContext(target);
    if (!exportContext) {
      throw new Error(t.exportFailedParse);
    }
    const { robot, exportName, extraMeshFiles } = exportContext;
    const mjcfMeshExport = await prepareMjcfMeshExportAssets({
      robot,
      assets,
      extraMeshFiles,
    });
    const generatedUrdfOptions = await buildGeneratedUrdfOptions(extraMeshFiles);

    const zip = new JSZip();
    const archiveRoot = createArchiveRoot(zip, exportName);
    const hardwareFolder = archiveRoot.folder('hardware');

    // 1. Generate Standard URDF
    archiveRoot.file(
      `${exportName}.urdf`,
      (await buildUrdfSourceExportContent(target, exportName)) ??
        generateURDF(robot, generatedUrdfOptions),
    );

    // 2. Generate Extended URDF (with hardware info)
    const extendedXml = generateURDF(
      robot,
      await buildGeneratedUrdfOptions(extraMeshFiles, { extended: true }),
    );
    archiveRoot.file(`${exportName}_extended.urdf`, extendedXml);

    // 3. Generate BOM
    const bomCsv = generateBOM(robot);
    hardwareFolder?.file('bom_list.csv', bomCsv);

    // 4. Generate MuJoCo XML
    const mujocoXml = generateMujocoXML(robot, {
      meshdir: 'meshes/',
      meshPathOverrides: mjcfMeshExport.meshPathOverrides,
      visualMeshVariants: mjcfMeshExport.visualMeshVariants,
    });
    archiveRoot.file(`${exportName}.xml`, mujocoXml);

    // 5. Add Meshes
    await addMeshesToZip(robot, archiveRoot, undefined, extraMeshFiles);
    addArchiveFilesToZip(archiveRoot, 'meshes', mjcfMeshExport.archiveFiles);

    // Generate and download ZIP
    const content = await zip.generateAsync({ type: 'blob' });
    downloadBlob(content, `${exportName}_package.zip`);
  }, [
    resolveExportContext,
    assets,
    createArchiveRoot,
    buildUrdfSourceExportContent,
    generateBOM,
    addMeshesToZip,
    addArchiveFilesToZip,
    downloadBlob,
    t.exportFailedParse,
  ]);

  const handleExportDisconnectedWorkspaceUrdfBundle = useCallback(
    async (config: ExportDialogConfig): Promise<ExportExecutionResult> => {
      flushPendingHistory();

      if (config.format !== 'urdf') {
        throw new Error(t.exportFailedParse);
      }

      if (!assemblyState || Object.keys(assemblyState.components).length === 0) {
        throw new Error(t.exportFailedParse);
      }

      const zip = new JSZip();
      const assemblyExportName = assemblyState.name?.trim() || 'assembly';
      const archiveRoot = createArchiveRoot(zip, assemblyExportName);
      const componentsRoot = archiveRoot.folder('components') ?? archiveRoot;
      const assetPackagingFailures: RobotAssetPackagingFailure[] = [];

      const {
        includeExtended,
        includeBOM,
        useRelativePaths,
        includeMeshes,
        compressSTL,
        stlQuality,
        preferSourceVisualMeshes,
      } = config.urdf;

      for (const component of Object.values(assemblyState.components)) {
        const componentExportName = component.name?.trim() || component.id;
        const componentFolder = componentsRoot.folder(componentExportName) ?? componentsRoot;
        const componentRobot: RobotState = {
          ...component.robot,
          selection: { type: null, id: null },
        };
        const sourceFile = availableFiles.find((file) => file.name === component.sourceFile);
        const generatedUrdfOptions = await buildGeneratedUrdfOptions(undefined, {
          useRelativePaths,
        });
        const urdfContent = includeExtended
          ? generateURDF(
              componentRobot,
              await buildGeneratedUrdfOptions(undefined, { extended: true, useRelativePaths }),
            )
          : ((sourceFile
              ? await buildUrdfSourceExportContent(
                  { type: 'library-file', file: sourceFile },
                  componentExportName,
                  {
                    useRelativePaths,
                    preferSourceVisualMeshes,
                  },
                )
              : null) ?? generateURDF(componentRobot, generatedUrdfOptions));

        componentFolder.file(`${componentExportName}.urdf`, urdfContent);

        if (config.includeSkeleton) {
          addSkeletonToZip(componentRobot, componentFolder, componentExportName, includeMeshes);
        }

        if (includeBOM) {
          const hardwareFolder = componentFolder.folder('hardware');
          hardwareFolder?.file('bom_list.csv', generateBOM(componentRobot));
        }

        if (!includeMeshes) {
          continue;
        }

        const meshPackagingResult = await addMeshesToZip(componentRobot, componentFolder, {
          compressSTL,
          stlQuality,
        });
        assetPackagingFailures.push(...meshPackagingResult.failedAssets);
      }

      throwForAssetPackagingFailures(assetPackagingFailures);

      const content = await zip.generateAsync({ type: 'blob' });
      downloadBlob(content, `${assemblyExportName}_components_urdf.zip`);

      return {
        partial: false,
        warnings: [],
        issues: [],
      };
    },
    [
      addMeshesToZip,
      addSkeletonToZip,
      assemblyState,
      availableFiles,
      buildUrdfSourceExportContent,
      createArchiveRoot,
      downloadBlob,
      generateBOM,
      t.exportFailedParse,
      throwForAssetPackagingFailures,
    ],
  );

  const handleExportWithConfig = useCallback(
    async (
      config: ExportDialogConfig,
      target: ExportTarget = DEFAULT_EXPORT_TARGET,
      options: HandleExportWithConfigOptions = {},
    ): Promise<ExportExecutionResult> => {
      flushPendingHistory();
      const markCurrentTargetSaved = () => {
        if (target.type === 'current') {
          markUnsavedChangesBaselineSaved('robot');
        }
      };
      const requiresResolvedUsdContext =
        target.type === 'current' && selectedFile?.format === 'usd' && sidebarTab !== 'workspace';

      if (config.format === 'usd') {
        const shouldConvertUsdLayers = config.usd.fileFormat !== 'usda';
        const reportProgress = createProgressReporter(
          options.onProgress,
          shouldConvertUsdLayers ? 4 : 3,
        );
        reportProgress(1, t.exportProgressPreparing, t.exportProgressPreparingDetail, {
          stageProgress: 0.2,
          indeterminate: true,
        });

        const shouldExportLiveUsdStage =
          target.type === 'current' &&
          selectedFile?.format === 'usd' &&
          sidebarTab !== 'workspace' &&
          currentUsdExportMode === 'live-stage' &&
          config.usd.fileFormat === 'usd' &&
          selectedFile.name.toLowerCase().endsWith('.usd');

        if (shouldExportLiveUsdStage) {
          reportProgress(
            2,
            t.exportProgressBuildingUsdScene,
            t.exportProgressUsdScenePreparingDetail,
            {
              stageProgress: 0.16,
              indeterminate: true,
            },
          );

          const roundtripArchive = await buildLiveUsdRoundtripArchive({
            sourceFile: selectedFile,
            availableFiles,
            assets,
            allFileContents,
          });

          reportProgress(3, t.exportProgressPreparing, t.exportProgressPreparingDetail, {
            stageProgress: 0.64,
            indeterminate: true,
          });

          const zip = new JSZip();
          // Preserve authored text layers for live-stage roundtrip exports.
          // Converting these layers to binary crates currently breaks re-import
          // for root-scoped vendor bundles such as Unitree B2.
          roundtripArchive.archiveFiles.forEach((blob, filePath) => {
            zip.file(filePath, blob);
          });

          const content = await generateZipBlobWithProgress(zip, reportProgress, 4);

          downloadBlob(content, roundtripArchive.archiveFileName);
          markCurrentTargetSaved();
          return {
            partial: false,
            warnings: [],
            issues: [],
          };
        }

        const exportContext =
          target.type === 'library-file'
            ? {
                robot: await resolveLibraryRobotForExport(target.file),
                exportName: getFileBaseName(target.file.name),
              }
            : resolveExportContext(target);

        if (!exportContext) {
          if (requiresResolvedUsdContext) {
            throw new Error(t.usdExportUnavailable);
          }
          throw new Error(t.exportFailedParse);
        }

        const unsupportedWorkerMeshPaths = getUsdExportWorkerUnsupportedMeshPaths(
          exportContext.robot,
        );
        if (unsupportedWorkerMeshPaths.length > 0) {
          throw new Error(
            replaceTemplate(t.usdExportWorkerUnsupportedMeshes, {
              count: unsupportedWorkerMeshPaths.length,
              meshPath: unsupportedWorkerMeshPaths[0],
            }),
          );
        }

        reportProgress(
          2,
          t.exportProgressBuildingUsdScene,
          t.exportProgressUsdScenePreparingDetail,
          {
            stageProgress: 0.04,
            indeterminate: true,
          },
        );

        const usdExport = await exportRobotToUsdWithWorker({
          robot: exportContext.robot,
          exportName: exportContext.exportName,
          assets,
          extraMeshFiles: exportContext.extraMeshFiles,
          fileFormat: config.usd.fileFormat,
          layoutProfile: 'isaacsim',
          meshCompression: {
            enabled: config.usd.compressMeshes,
            quality: config.usd.meshQuality,
          },
          onProgress: (progress) => {
            const range = USD_EXPORT_STAGE_PROGRESS_RANGES[progress.phase];
            const normalizedPhaseProgress =
              progress.total > 0 ? progress.completed / progress.total : 1;
            const stageProgress = range.start + (range.end - range.start) * normalizedPhaseProgress;

            let detail = t.exportProgressUsdScenePreparingDetail;
            switch (progress.phase) {
              case 'links':
                detail = replaceTemplate(t.exportProgressUsdSceneDetail, {
                  current: progress.completed,
                  total: progress.total,
                  name: progress.label || t.exportProgressArchiveFallbackFile,
                });
                break;
              case 'geometry':
                detail = replaceTemplate(t.exportProgressUsdSceneGeometryDetail, {
                  current: progress.completed,
                  total: progress.total,
                });
                break;
              case 'scene':
                detail = replaceTemplate(t.exportProgressUsdSceneSerializingDetail, {
                  current: progress.completed,
                  total: progress.total,
                });
                break;
              case 'assets':
                detail = replaceTemplate(t.exportProgressUsdSceneAssetsDetail, {
                  current: progress.completed,
                  total: progress.total,
                });
                break;
              default:
                break;
            }

            reportProgress(2, t.exportProgressBuildingUsdScene, detail, {
              stageProgress,
              indeterminate: false,
            });
          },
        });

        const zip = new JSZip();

        if (shouldConvertUsdLayers) {
          reportProgress(
            3,
            t.exportProgressConvertingUsdLayers,
            t.exportProgressConvertingUsdLayersPreparingDetail,
            {
              stageProgress: 0.04,
              indeterminate: true,
            },
          );

          const binaryArchiveFiles = await convertUsdArchiveFilesToBinaryWithWorker(
            usdExport.archiveFiles,
            {
              onProgress: ({ current, total, filePath }) => {
                reportProgress(
                  3,
                  t.exportProgressConvertingUsdLayers,
                  replaceTemplate(t.exportProgressConvertingUsdLayersDetail, {
                    current,
                    total,
                    file: trimProgressFileLabel(filePath) || t.exportProgressArchiveFallbackFile,
                  }),
                  {
                    stageProgress: total > 0 ? current / total : 1,
                    indeterminate: false,
                  },
                );
              },
            },
          );

          binaryArchiveFiles.forEach((blob, filePath) => {
            zip.file(filePath, blob);
          });
        } else {
          usdExport.archiveFiles.forEach((blob, filePath) => {
            zip.file(filePath, blob);
          });
        }

        const content = await generateZipBlobWithProgress(
          zip,
          reportProgress,
          shouldConvertUsdLayers ? 4 : 3,
        );
        downloadBlob(content, usdExport.archiveFileName);
        markCurrentTargetSaved();
        return {
          partial: false,
          warnings: [],
          issues: [],
        };
      }

      const disconnectedWorkspaceUrdfAction = resolveDisconnectedWorkspaceUrdfAction(
        target,
        config,
      );
      if (disconnectedWorkspaceUrdfAction) {
        return {
          partial: false,
          warnings: [],
          issues: [],
          actionRequired: disconnectedWorkspaceUrdfAction,
        };
      }

      const totalSteps =
        config.format === 'mjcf'
          ? config.mjcf.includeMeshes
            ? 5
            : 4
          : (
                config.format === 'urdf'
                  ? config.urdf.includeMeshes
                  : config.format === 'xacro'
                    ? config.xacro.includeMeshes
                    : config.sdf.includeMeshes
              )
            ? 4
            : 3;
      const reportProgress = createProgressReporter(options.onProgress, totalSteps);
      reportProgress(1, t.exportProgressPreparing, t.exportProgressPreparingDetail, {
        stageProgress: 0.2,
        indeterminate: true,
      });

      const exportContext =
        target.type === 'library-file'
          ? {
              robot: await resolveLibraryRobotForExport(target.file),
              exportName: getFileBaseName(target.file.name),
            }
          : resolveExportContext(target);
      if (!exportContext) {
        if (requiresResolvedUsdContext) {
          throw new Error(t.usdExportUnavailable);
        }
        throw new Error(t.exportFailedParse);
      }

      const { robot, exportName, extraMeshFiles } = exportContext;
      const assetPackagingFailures: RobotAssetPackagingFailure[] = [];
      const zip = new JSZip();
      const archiveRoot = createArchiveRoot(zip, exportName);
      const skeletonUsesMeshes =
        config.format === 'mjcf'
          ? config.mjcf.includeMeshes
          : config.format === 'urdf'
            ? config.urdf.includeMeshes
            : config.format === 'xacro'
              ? config.xacro.includeMeshes
              : config.sdf.includeMeshes;

      if (config.includeSkeleton) {
        addSkeletonToZip(robot, archiveRoot, exportName, skeletonUsesMeshes);
      }

      if (config.format === 'mjcf') {
        const {
          meshdir,
          addFloatBase,
          preferSharedMeshReuse,
          includeActuators,
          actuatorType,
          includeMeshes,
          compressSTL,
          stlQuality,
        } = config.mjcf;
        reportProgress(
          2,
          t.exportProgressPreparingSimulationMeshes,
          t.exportProgressPreparingSimulationMeshesDetail,
          {
            stageProgress: 0.04,
            indeterminate: true,
          },
        );

        const mjcfMeshExport = await prepareMjcfMeshExportAssets({
          robot,
          assets,
          extraMeshFiles,
          preferSharedMeshReuse,
        });

        reportProgress(3, t.exportProgressGeneratingFiles, t.exportProgressGeneratingMjcfDetail, {
          stageProgress: 0.85,
          indeterminate: false,
        });

        archiveRoot.file(
          `${exportName}.xml`,
          generateMujocoXML(robot, {
            meshdir,
            addFloatBase,
            includeActuators,
            actuatorType,
            meshPathOverrides: mjcfMeshExport.meshPathOverrides,
            visualMeshVariants: mjcfMeshExport.visualMeshVariants,
          }),
        );
        if (includeMeshes) {
          reportProgress(
            4,
            t.exportProgressCollectingAssets,
            t.exportProgressCollectingAssetsPreparingDetail,
            {
              stageProgress: 0.04,
              indeterminate: true,
            },
          );

          const meshPackagingResult = await addMeshesToZip(
            robot,
            archiveRoot,
            { compressSTL, stlQuality },
            extraMeshFiles,
            mjcfMeshExport.convertedSourceMeshPaths,
            ({ completed, total, currentFile }) => {
              reportProgress(
                4,
                t.exportProgressCollectingAssets,
                replaceTemplate(t.exportProgressCollectingAssetsDetail, {
                  current: completed,
                  total,
                  file: trimProgressFileLabel(currentFile) || t.exportProgressArchiveFallbackFile,
                }),
                {
                  stageProgress: total > 0 ? completed / total : 1,
                  indeterminate: false,
                },
              );
            },
          );
          assetPackagingFailures.push(...meshPackagingResult.failedAssets);
          addArchiveFilesToZip(archiveRoot, 'meshes', mjcfMeshExport.archiveFiles);
        }
        throwForAssetPackagingFailures(assetPackagingFailures);
        const content = await generateZipBlobWithProgress(
          zip,
          reportProgress,
          includeMeshes ? 5 : 4,
        );
        downloadBlob(content, `${exportName}_mjcf.zip`);
        markCurrentTargetSaved();
        return {
          partial: false,
          warnings: [],
          issues: [],
        };
      } else if (config.format === 'urdf') {
        const {
          includeExtended,
          includeBOM,
          useRelativePaths,
          includeMeshes,
          compressSTL,
          stlQuality,
        } = config.urdf;
        const preferSourceVisualMeshes = config.urdf.preferSourceVisualMeshes;
        const generatedUrdfOptions = await buildGeneratedUrdfOptions(extraMeshFiles, {
          useRelativePaths,
        });
        reportProgress(2, t.exportProgressGeneratingFiles, t.exportProgressGeneratingUrdfDetail, {
          stageProgress: 0.85,
          indeterminate: false,
        });

        const urdfContent = includeExtended
          ? generateURDF(
              robot,
              await buildGeneratedUrdfOptions(extraMeshFiles, { extended: true, useRelativePaths }),
            )
          : ((await buildUrdfSourceExportContent(target, exportName, {
              useRelativePaths,
              preferSourceVisualMeshes,
            })) ?? generateURDF(robot, generatedUrdfOptions));
        archiveRoot.file(`${exportName}.urdf`, urdfContent);
        if (includeBOM) {
          const hardwareFolder = archiveRoot.folder('hardware');
          hardwareFolder?.file('bom_list.csv', generateBOM(robot));
        }
        if (includeMeshes) {
          reportProgress(
            3,
            t.exportProgressCollectingAssets,
            t.exportProgressCollectingAssetsPreparingDetail,
            {
              stageProgress: 0.04,
              indeterminate: true,
            },
          );

          const meshPackagingResult = await addMeshesToZip(
            robot,
            archiveRoot,
            { compressSTL, stlQuality },
            extraMeshFiles,
            undefined,
            ({ completed, total, currentFile }) => {
              reportProgress(
                3,
                t.exportProgressCollectingAssets,
                replaceTemplate(t.exportProgressCollectingAssetsDetail, {
                  current: completed,
                  total,
                  file: trimProgressFileLabel(currentFile) || t.exportProgressArchiveFallbackFile,
                }),
                {
                  stageProgress: total > 0 ? completed / total : 1,
                  indeterminate: false,
                },
              );
            },
          );
          assetPackagingFailures.push(...meshPackagingResult.failedAssets);
        }
        throwForAssetPackagingFailures(assetPackagingFailures);
        const content = await generateZipBlobWithProgress(
          zip,
          reportProgress,
          includeMeshes ? 4 : 3,
        );
        downloadBlob(content, `${exportName}_urdf.zip`);
        markCurrentTargetSaved();
        return {
          partial: false,
          warnings: [],
          issues: [],
        };
      } else if (config.format === 'sdf') {
        const { includeMeshes, compressSTL, stlQuality } = config.sdf;
        reportProgress(2, t.exportProgressGeneratingFiles, t.exportProgressGeneratingSdfDetail, {
          stageProgress: 0.85,
          indeterminate: false,
        });

        archiveRoot.file(
          'model.sdf',
          generateSDF(robot, {
            packageName: exportName,
          }),
        );
        archiveRoot.file('model.config', generateSdfModelConfig(robot.name?.trim() || exportName));
        if (includeMeshes) {
          reportProgress(
            3,
            t.exportProgressCollectingAssets,
            t.exportProgressCollectingAssetsPreparingDetail,
            {
              stageProgress: 0.04,
              indeterminate: true,
            },
          );

          const meshPackagingResult = await addMeshesToZip(
            robot,
            archiveRoot,
            { compressSTL, stlQuality },
            extraMeshFiles,
            undefined,
            ({ completed, total, currentFile }) => {
              reportProgress(
                3,
                t.exportProgressCollectingAssets,
                replaceTemplate(t.exportProgressCollectingAssetsDetail, {
                  current: completed,
                  total,
                  file: trimProgressFileLabel(currentFile) || t.exportProgressArchiveFallbackFile,
                }),
                {
                  stageProgress: total > 0 ? completed / total : 1,
                  indeterminate: false,
                },
              );
            },
          );
          assetPackagingFailures.push(...meshPackagingResult.failedAssets);
        }
        throwForAssetPackagingFailures(assetPackagingFailures);
        const content = await generateZipBlobWithProgress(
          zip,
          reportProgress,
          includeMeshes ? 4 : 3,
        );
        downloadBlob(content, `${exportName}_sdf.zip`);
        markCurrentTargetSaved();
        return {
          partial: false,
          warnings: [],
          issues: [],
        };
      } else if (config.format === 'xacro') {
        const {
          rosVersion,
          rosHardwareInterface,
          useRelativePaths,
          includeMeshes,
          compressSTL,
          stlQuality,
        } = config.xacro;
        const generatedUrdfOptions = await buildGeneratedUrdfOptions(extraMeshFiles, {
          useRelativePaths,
        });
        reportProgress(2, t.exportProgressGeneratingFiles, t.exportProgressGeneratingXacroDetail, {
          stageProgress: 0.85,
          indeterminate: false,
        });

        const xacroBaseUrdf =
          (await buildUrdfSourceExportContent(target, exportName, { useRelativePaths })) ??
          generateURDF(robot, generatedUrdfOptions);
        const xacroContent = injectGazeboTags(
          xacroBaseUrdf,
          robot,
          rosVersion,
          rosHardwareInterface,
        );
        archiveRoot.file(`${exportName}.urdf.xacro`, xacroContent);
        if (includeMeshes) {
          reportProgress(
            3,
            t.exportProgressCollectingAssets,
            t.exportProgressCollectingAssetsPreparingDetail,
            {
              stageProgress: 0.04,
              indeterminate: true,
            },
          );

          const meshPackagingResult = await addMeshesToZip(
            robot,
            archiveRoot,
            { compressSTL, stlQuality },
            extraMeshFiles,
            undefined,
            ({ completed, total, currentFile }) => {
              reportProgress(
                3,
                t.exportProgressCollectingAssets,
                replaceTemplate(t.exportProgressCollectingAssetsDetail, {
                  current: completed,
                  total,
                  file: trimProgressFileLabel(currentFile) || t.exportProgressArchiveFallbackFile,
                }),
                {
                  stageProgress: total > 0 ? completed / total : 1,
                  indeterminate: false,
                },
              );
            },
          );
          assetPackagingFailures.push(...meshPackagingResult.failedAssets);
        }
        throwForAssetPackagingFailures(assetPackagingFailures);
        const content = await generateZipBlobWithProgress(
          zip,
          reportProgress,
          includeMeshes ? 4 : 3,
        );
        downloadBlob(content, `${exportName}_xacro.zip`);
        markCurrentTargetSaved();
        return {
          partial: false,
          warnings: [],
          issues: [],
        };
      }

      return {
        partial: false,
        warnings: [],
        issues: [],
      };
    },
    [
      addMeshesToZip,
      addArchiveFilesToZip,
      addSkeletonToZip,
      currentUsdExportMode,
      createProgressReporter,
      createArchiveRoot,
      downloadBlob,
      availableFiles,
      assets,
      allFileContents,
      getFileBaseName,
      generateZipBlobWithProgress,
      generateBOM,
      buildUrdfSourceExportContent,
      replaceTemplate,
      resolveLibraryRobotForExport,
      resolveDisconnectedWorkspaceUrdfAction,
      resolveExportContext,
      selectedFile,
      sidebarTab,
      t.exportFailedParse,
      t,
      throwForAssetPackagingFailures,
      trimProgressFileLabel,
    ],
  );

  // Export project as .usp
  const handleExportProject = useCallback(
    async (options: HandleProjectExportOptions = {}): Promise<ProjectExportExecutionResult> => {
      flushPendingHistory();
      const reportProgress = createProgressReporter(options.onProgress, 6);
      reportProgress(1, t.exportProgressPreparing, t.exportProgressPreparingDetail, {
        stageProgress: 0.18,
        indeterminate: true,
      });
      reportProgress(
        2,
        t.exportProgressPackingProjectAssets,
        t.exportProgressPackingProjectAssetsPreparingDetail,
        {
          stageProgress: 0.04,
          indeterminate: true,
        },
      );

      const exportableAssemblyHistory = materializeAssemblyHistorySnapshots(
        assemblyHistory as AssemblyHistoryState,
        assemblyState,
      );

      const result = await exportProjectWithWorker({
        name: robotName || assemblyState?.name || 'my_project',
        uiState: {
          appMode: mergedAppMode,
          lang,
        },
        assetsState: {
          availableFiles,
          assets,
          allFileContents,
          motorLibrary,
          selectedFileName: selectedFile?.name ?? null,
          originalUrdfContent,
          originalFileFormat,
          usdPreparedExportCaches,
        },
        robotState: {
          present: buildCurrentRobotExportData({
            robotName,
            robotLinks,
            robotJoints,
            rootLinkId,
            robotMaterials,
            closedLoopConstraints,
          }),
          history: robotHistory,
          activity: robotActivity,
        },
        assemblyState: {
          present: assemblyState,
          history: exportableAssemblyHistory,
          activity: assemblyActivity,
        },
        getMergedRobotData,
        onProgress: (progress) => {
          switch (progress.phase) {
            case 'assets':
              reportProgress(
                2,
                t.exportProgressPackingProjectAssets,
                replaceTemplate(t.exportProgressPackingProjectAssetsDetail, {
                  current: progress.completed,
                  total: progress.total,
                  file: progress.label || t.exportProgressArchiveFallbackFile,
                }),
                {
                  stageProgress: progress.total > 0 ? progress.completed / progress.total : 1,
                  indeterminate: false,
                },
              );
              break;
            case 'metadata':
              reportProgress(
                3,
                t.exportProgressWritingProjectData,
                replaceTemplate(t.exportProgressWritingProjectDataDetail, {
                  current: progress.completed,
                  total: progress.total,
                  item: progress.label || 'project.json',
                }),
                {
                  stageProgress: progress.total > 0 ? progress.completed / progress.total : 1,
                  indeterminate: false,
                },
              );
              break;
            case 'components':
              reportProgress(
                4,
                t.exportProgressBundlingProjectComponents,
                replaceTemplate(t.exportProgressBundlingProjectComponentsDetail, {
                  current: progress.completed,
                  total: progress.total,
                  item: progress.label || t.exportProgressArchiveFallbackFile,
                }),
                {
                  stageProgress: progress.total > 0 ? progress.completed / progress.total : 1,
                  indeterminate: false,
                },
              );
              break;
            case 'output':
              reportProgress(
                5,
                t.exportProgressGeneratingProjectOutputs,
                replaceTemplate(t.exportProgressGeneratingProjectOutputsDetail, {
                  current: progress.completed,
                  total: progress.total,
                  item: progress.label || t.exportProgressArchiveFallbackFile,
                }),
                {
                  stageProgress: progress.total > 0 ? progress.completed / progress.total : 1,
                  indeterminate: false,
                },
              );
              break;
            case 'archive':
              reportProgress(
                6,
                t.exportProgressPackaging,
                progress.label
                  ? replaceTemplate(t.exportProgressPackagingDetailFile, { file: progress.label })
                  : t.exportProgressPackagingDetail,
                {
                  stageProgress: progress.total > 0 ? progress.completed / progress.total : 1,
                  indeterminate: false,
                },
              );
              break;
            default:
              break;
          }
        },
      });
      
      if (!options.skipDownload) {
        downloadBlob(result.blob, `${robotName || assemblyState?.name || 'my_project'}.usp`);
      }
      markUnsavedChangesBaselineSaved('all');

      return {
        partial: result.partial,
        blob: result.blob, // Expose the blob object for external callers (e.g., cloud drive upload)
        warnings: result.warnings.map((warning) => warning.message),
        issues: result.warnings.map((warning) => ({
          code: warning.code,
          message: warning.message,
          context: warning.context,
        })),
      };
    },
    [
      robotName,
      robotLinks,
      robotJoints,
      rootLinkId,
      robotMaterials,
      closedLoopConstraints,
      robotHistory,
      robotActivity,
      assemblyState,
      assemblyHistory,
      assemblyActivity,
      mergedAppMode,
      lang,
      availableFiles,
      assets,
      allFileContents,
      motorLibrary,
      selectedFile?.name,
      originalUrdfContent,
      originalFileFormat,
      usdPreparedExportCaches,
      getMergedRobotData,
      createProgressReporter,
      downloadBlob,
      replaceTemplate,
      t,
    ],
  );

  return {
    handleExportURDF,
    handleExportMJCF,
    handleExport,
    handleExportDisconnectedWorkspaceUrdfBundle,
    handleExportProject,
    handleExportWithConfig,
    generateBOM,
  };
}

export default useFileExport;
