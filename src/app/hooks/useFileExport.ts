/**
 * File Export Hook
 * Handles exporting robot as URDF, extended URDF, BOM, and MuJoCo XML
 */
import { useCallback } from 'react';
import JSZip from 'jszip';
import type { RobotFile, RobotState } from '@/types';
import { DEFAULT_LINK, GeometryType } from '@/types';
import { generateURDF, generateMujocoXML, generateSkeletonXML, injectGazeboTags, parseMJCF, parseURDF, parseXacro } from '@/core/parsers';
import { rewriteRobotMeshPathsForSource, rewriteUrdfAssetPathsForExport } from '@/core/parsers/meshPathUtils';
import { useAssemblyStore, useAssetsStore, useRobotStore, useUIStore } from '@/store';
import {
  exportProject,
  exportRobotToUsd,
  prepareMjcfMeshExportAssets,
  type ExportDialogConfig,
  type ExportProgressState,
} from '@/features/file-io';
import { getUsdStageExportHandler } from '@/features/urdf-viewer';
import { translations } from '@/shared/i18n';
import { resolveMJCFSource } from '@/core/parsers/mjcf/mjcfSourceResolver';
import { addRobotAssetsToZip } from '../utils/exportArchiveAssets';
import { resolveCurrentUsdExportMode } from '../utils/currentUsdExportMode';
import { flushPendingHistory } from '../utils/pendingHistory';
import { buildCurrentRobotExportData, buildCurrentRobotExportState } from './projectRobotStateUtils';
import { resolveCurrentUsdExportBundle } from '../utils/usdExportContext';
import { buildLiveUsdRoundtripArchive } from '../utils/liveUsdRoundtripExport';
import { convertUsdArchiveFilesToBinary } from '../utils/usdBinaryArchive';
import { resolveUrdfSourceExportContent } from './urdfSourceExportUtils';
import { buildGeneratedUrdfOptions } from '../utils/generatedUrdfOptions';

type ExportTarget =
  | { type: 'current' }
  | { type: 'library-file'; file: RobotFile };

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

export function useFileExport() {
  const lang = useUIStore((state) => state.lang);
  const t = translations[lang];
  const appMode = useUIStore((state) => state.appMode);
  const sidebarTab = useUIStore((state) => state.sidebarTab);
  const assets = useAssetsStore((state) => state.assets);
  const availableFiles = useAssetsStore((state) => state.availableFiles);
  const allFileContents = useAssetsStore((state) => state.allFileContents);
  const motorLibrary = useAssetsStore((state) => state.motorLibrary);
  const selectedFile = useAssetsStore((state) => state.selectedFile);
  const documentLoadState = useAssetsStore((state) => state.documentLoadState);
  const getUsdSceneSnapshot = useAssetsStore((state) => state.getUsdSceneSnapshot);
  const getUsdPreparedExportCache = useAssetsStore((state) => state.getUsdPreparedExportCache);
  const usdPreparedExportCaches = useAssetsStore((state) => state.usdPreparedExportCaches);
  const originalUrdfContent = useAssetsStore((state) => state.originalUrdfContent);
  const originalFileFormat = useAssetsStore((state) => state.originalFileFormat);
  const assemblyState = useAssemblyStore((state) => state.assemblyState);
  const assemblyHistory = useAssemblyStore((state) => state._history);
  const assemblyActivity = useAssemblyStore((state) => state._activity);
  const getMergedRobotData = useAssemblyStore((state) => state.getMergedRobotData);

  // Get robot state from store
  const robotName = useRobotStore((state) => state.name);
  const robotLinks = useRobotStore((state) => state.links);
  const robotJoints = useRobotStore((state) => state.joints);
  const rootLinkId = useRobotStore((state) => state.rootLinkId);
  const robotMaterials = useRobotStore((state) => state.materials);
  const closedLoopConstraints = useRobotStore((state) => state.closedLoopConstraints);
  const robotHistory = useRobotStore((state) => state._history);
  const robotActivity = useRobotStore((state) => state._activity);

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

  const replaceTemplate = useCallback((
    template: string,
    replacements: Record<string, string | number>,
  ): string => Object.entries(replacements).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
    template,
  ), []);

  const trimProgressFileLabel = useCallback((filePath: string | null | undefined): string => {
    const normalized = String(filePath || '').trim().replace(/\\/g, '/');
    if (!normalized) {
      return '';
    }

    const segments = normalized.split('/').filter(Boolean);
    if (segments.length <= 2) {
      return segments.join('/');
    }

    return segments.slice(-2).join('/');
  }, []);

  const createProgressReporter = useCallback((
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
        progress: Math.min(1, Math.max(0, ((currentStep - 1) + stageProgress) / totalSteps)),
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
        !isFirstUpdate
        && !isStepTransition
        && !didIndeterminateChange
        && !isTerminalUpdate
        && progressDelta < PROGRESS_MIN_DELTA
        && timeSinceLastReport < PROGRESS_MIN_UPDATE_INTERVAL_MS
      ) {
        return;
      }

      lastProgress = nextProgress;
      lastReportedAt = now;
      onProgress(nextProgress);
    };
  }, []);

  const generateZipBlobWithProgress = useCallback(async (
    zip: JSZip,
    reportProgress: ExportProgressReporter,
    currentStep: number,
  ) => {
    reportProgress(
      currentStep,
      t.exportProgressPackaging,
      t.exportProgressPackagingDetail,
      { stageProgress: 0.04, indeterminate: true },
    );

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
  }, [replaceTemplate, t, trimProgressFileLabel]);

  const isCurrentUsdHydrating = selectedFile?.format === 'usd'
    && documentLoadState.status === 'hydrating'
    && documentLoadState.fileName === selectedFile.name;
  const currentUsdExportMode = selectedFile?.format === 'usd' && sidebarTab !== 'workspace'
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
      const mergedData = getMergedRobotData();
      if (mergedData) {
        return { ...mergedData, selection: { type: null, id: null } };
      }

      return {
        name: '',
        links: {
          empty_root: {
            ...DEFAULT_LINK,
            id: 'empty_root',
            name: 'base_link',
            visual: {
              ...DEFAULT_LINK.visual,
              type: GeometryType.NONE,
              dimensions: { x: 0, y: 0, z: 0 },
            },
            collision: {
              ...DEFAULT_LINK.collision,
              type: GeometryType.NONE,
              dimensions: { x: 0, y: 0, z: 0 },
            },
            inertial: {
              ...DEFAULT_LINK.inertial,
              mass: 0,
            },
          },
        },
        joints: {},
        rootLinkId: 'empty_root',
        selection: { type: null, id: null },
      };
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

  const createArchiveRoot = useCallback((zip: JSZip, exportName: string): JSZip => {
    return zip.folder(exportName) ?? zip;
  }, []);

  const getFileBaseName = useCallback((path: string): string => {
    const fileName = path.split('/').pop() ?? path;
    const withoutExt = fileName.replace(/\.[^/.]+$/, '');
    const trimmed = withoutExt.trim();
    return trimmed.length > 0 ? trimmed : 'robot';
  }, []);

  const addSkeletonToZip = useCallback((
    robot: RobotState,
    zip: JSZip,
    exportName: string,
    includeMeshes: boolean,
  ) => {
    zip.file(
      `${exportName}_skeleton.xml`,
      generateSkeletonXML(robot, {
        meshdir: 'meshes/',
        includeMeshes,
        includeActuators: true,
      }),
    );
  }, []);

  const addMeshesToZip = useCallback(async (
    robot: RobotState,
    zip: JSZip,
    compressOptions?: { compressSTL: boolean; stlQuality: number },
    extraMeshFiles?: Map<string, Blob>,
    skipMeshPaths?: ReadonlySet<string>,
    onProgress?: (progress: {
      completed: number;
      total: number;
      currentFile: string;
    }) => void,
  ) => {
    await addRobotAssetsToZip({
      robot,
      zip,
      assets,
      compressOptions,
      extraMeshFiles,
      skipMeshPaths,
      onProgress,
    });
  }, [assets]);

  const addArchiveFilesToZip = useCallback((
    zip: JSZip,
    folderName: string,
    archiveFiles?: Map<string, Blob>,
  ) => {
    if (!archiveFiles || archiveFiles.size === 0) {
      return;
    }

    const targetFolder = zip.folder(folderName);
    archiveFiles.forEach((blob, relativePath) => {
      targetFolder?.file(relativePath, blob);
    });
  }, []);

  const buildLibraryRobotForExport = useCallback((file: RobotFile): RobotState | null => {
    try {
      if (file.format === 'urdf') {
        const robot = parseURDF(file.content);
        return robot ? rewriteRobotMeshPathsForSource(robot, file.name) : null;
      }

      if (file.format === 'mjcf') {
        const resolved = resolveMJCFSource(file, availableFiles);
        const robot = parseMJCF(resolved.content);
        return robot ? rewriteRobotMeshPathsForSource(robot, file.name) : null;
      }

      if (file.format === 'xacro') {
        const fileMap: Record<string, string> = {};
        availableFiles.forEach((entry) => {
          fileMap[entry.name] = entry.content;
        });
        Object.entries(assets).forEach(([path, content]) => {
          if (typeof content === 'string') {
            fileMap[path] = content;
          }
        });

        const pathParts = file.name.split('/');
        pathParts.pop();
        const robot = parseXacro(file.content, {}, fileMap, pathParts.join('/'));
        return robot ? rewriteRobotMeshPathsForSource(robot, file.name) : null;
      }

      return null;
    } catch (error) {
      console.error('[useFileExport] Failed to parse library file for export', error);
      return null;
    }
  }, [assets, availableFiles]);

  const buildUrdfSourceExportContent = useCallback((
    target: ExportTarget,
    exportName: string,
    options: UrdfSourceExportPreference = {},
  ): string | null => {
    const {
      useRelativePaths = false,
      preferSourceVisualMeshes = true,
    } = options;

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
  }, [
    buildRobotForExport,
    isCurrentUsdHydrating,
    originalUrdfContent,
    selectedFile,
    sidebarTab,
  ]);

  const buildCurrentUsdExportContext = useCallback((): ExportContext | null => {
    if (
      selectedFile?.format !== 'usd'
      || sidebarTab === 'workspace'
      || isCurrentUsdHydrating
    ) {
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

  const resolveExportContext = useCallback((target: ExportTarget = DEFAULT_EXPORT_TARGET): ExportContext | null => {
    if (target.type === 'library-file') {
      const robot = buildLibraryRobotForExport(target.file);
      if (!robot) {
        return null;
      }

      return {
        robot,
        exportName: getFileBaseName(target.file.name),
      };
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
  }, [
    buildCurrentUsdExportContext,
    buildLibraryRobotForExport,
    buildRobotForExport,
    getFileBaseName,
    getRobotExportName,
    selectedFile,
    sidebarTab,
  ]);

  // Generate BOM (Bill of Materials) CSV
  const generateBOM = useCallback((robot: RobotState): string => {
    const headers = [t.jointName, t.type, t.motorType, t.motorId, t.direction, t.armature, t.lower, t.upper];

    const rows = Object.values(robot.joints).map(j => {
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
        j.limit?.upper ?? ''
      ].join(',');
    }).filter(row => row !== null);

    return [headers.join(','), ...rows].join('\n');
  }, [t]);

  const handleExportURDF = useCallback(async () => {
    flushPendingHistory();
    const target = DEFAULT_EXPORT_TARGET;
    const exportContext = resolveExportContext(target);
    if (!exportContext) return;
    const { robot, exportName, extraMeshFiles } = exportContext;
    const zip = new JSZip();
    const archiveRoot = createArchiveRoot(zip, exportName);
    const generatedUrdfOptions = await buildGeneratedUrdfOptions(extraMeshFiles);

    archiveRoot.file(
      `${exportName}.urdf`,
      buildUrdfSourceExportContent(target, exportName)
        ?? generateURDF(robot, generatedUrdfOptions),
    );
    await addMeshesToZip(robot, archiveRoot, undefined, extraMeshFiles);

    const content = await zip.generateAsync({ type: "blob" });
    downloadBlob(content, `${exportName}_urdf.zip`);
  }, [
    resolveExportContext,
    createArchiveRoot,
    buildUrdfSourceExportContent,
    addMeshesToZip,
    downloadBlob,
  ]);

  const handleExportMJCF = useCallback(async () => {
    flushPendingHistory();
    const exportContext = resolveExportContext();
    if (!exportContext) return;
    const { robot, exportName, extraMeshFiles } = exportContext;
    const mjcfMeshExport = await prepareMjcfMeshExportAssets({
      robot,
      assets,
      extraMeshFiles,
    });
    const zip = new JSZip();
    const archiveRoot = createArchiveRoot(zip, exportName);

    archiveRoot.file(`${exportName}.xml`, generateMujocoXML(robot, {
      meshdir: 'meshes/',
      meshPathOverrides: mjcfMeshExport.meshPathOverrides,
      visualMeshVariants: mjcfMeshExport.visualMeshVariants,
    }));
    await addMeshesToZip(
      robot,
      archiveRoot,
      undefined,
      extraMeshFiles,
      mjcfMeshExport.convertedSourceMeshPaths,
    );
    addArchiveFilesToZip(archiveRoot, 'meshes', mjcfMeshExport.archiveFiles);

    const content = await zip.generateAsync({ type: "blob" });
    downloadBlob(content, `${exportName}_mjcf.zip`);
  }, [
    resolveExportContext,
    assets,
    createArchiveRoot,
    addMeshesToZip,
    addArchiveFilesToZip,
    downloadBlob,
  ]);

  // Export handler
  const handleExport = useCallback(async () => {
    flushPendingHistory();
    const target = DEFAULT_EXPORT_TARGET;
    const exportContext = resolveExportContext(target);
    if (!exportContext) return;
    const { robot, exportName, extraMeshFiles } = exportContext;
    const mjcfMeshExport = await prepareMjcfMeshExportAssets({
      robot,
      assets,
      extraMeshFiles,
    });
    const generatedUrdfOptions = await buildGeneratedUrdfOptions(extraMeshFiles);

    const zip = new JSZip();
    const archiveRoot = createArchiveRoot(zip, exportName);
    const hardwareFolder = archiveRoot.folder("hardware");

    // 1. Generate Standard URDF
    archiveRoot.file(`${exportName}.urdf`, buildUrdfSourceExportContent(target, exportName) ?? generateURDF(robot, generatedUrdfOptions));

    // 2. Generate Extended URDF (with hardware info)
    const extendedXml = generateURDF(robot, await buildGeneratedUrdfOptions(extraMeshFiles, { extended: true }));
    archiveRoot.file(`${exportName}_extended.urdf`, extendedXml);

    // 3. Generate BOM
    const bomCsv = generateBOM(robot);
    hardwareFolder?.file("bom_list.csv", bomCsv);

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
    const content = await zip.generateAsync({ type: "blob" });
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
  ]);

  const handleExportWithConfig = useCallback(async (
    config: ExportDialogConfig,
    target: ExportTarget = DEFAULT_EXPORT_TARGET,
    options: HandleExportWithConfigOptions = {},
  ) => {
    flushPendingHistory();
    const requiresResolvedUsdContext = (
      target.type === 'current'
      && selectedFile?.format === 'usd'
      && sidebarTab !== 'workspace'
    );

    if (config.format === 'usd') {
      const reportProgress = createProgressReporter(options.onProgress, 4);
      reportProgress(1, t.exportProgressPreparing, t.exportProgressPreparingDetail, {
        stageProgress: 0.2,
        indeterminate: true,
      });

      const shouldExportLiveUsdStage = (
        target.type === 'current'
        && selectedFile?.format === 'usd'
        && sidebarTab !== 'workspace'
        && currentUsdExportMode === 'live-stage'
      );

      if (shouldExportLiveUsdStage) {
        reportProgress(2, t.exportProgressBuildingUsdScene, t.exportProgressUsdScenePreparingDetail, {
          stageProgress: 0.16,
          indeterminate: true,
        });

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
        return;
      }

      const exportContext = resolveExportContext(target);

      if (!exportContext) {
        if (requiresResolvedUsdContext) {
          throw new Error(t.usdExportUnavailable);
        }
        throw new Error(t.exportFailedParse);
      }

      reportProgress(2, t.exportProgressBuildingUsdScene, t.exportProgressUsdScenePreparingDetail, {
        stageProgress: 0.04,
        indeterminate: true,
      });

      const usdExport = await exportRobotToUsd({
        robot: exportContext.robot,
        exportName: exportContext.exportName,
        assets,
        extraMeshFiles: exportContext.extraMeshFiles,
        meshCompression: {
          enabled: config.usd.compressMeshes,
          quality: config.usd.meshQuality,
        },
        onProgress: (progress) => {
          const range = USD_EXPORT_STAGE_PROGRESS_RANGES[progress.phase];
          const normalizedPhaseProgress = progress.total > 0
            ? progress.completed / progress.total
            : 1;
          const stageProgress = range.start
            + ((range.end - range.start) * normalizedPhaseProgress);

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

          reportProgress(
            2,
            t.exportProgressBuildingUsdScene,
            detail,
            {
              stageProgress,
              indeterminate: false,
            },
          );
        },
      });

      reportProgress(3, t.exportProgressConvertingUsdLayers, t.exportProgressConvertingUsdLayersPreparingDetail, {
        stageProgress: 0.04,
        indeterminate: true,
      });

      const binaryArchiveFiles = await convertUsdArchiveFilesToBinary(usdExport.archiveFiles, {
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
      });

      const zip = new JSZip();
      binaryArchiveFiles.forEach((blob, filePath) => {
        zip.file(filePath, blob);
      });
      const content = await generateZipBlobWithProgress(zip, reportProgress, 4);
      downloadBlob(content, usdExport.archiveFileName);
      return;
    }

    const totalSteps = config.format === 'mjcf'
      ? (config.mjcf.includeMeshes ? 5 : 4)
      : ((config.format === 'urdf' ? config.urdf.includeMeshes : config.xacro.includeMeshes) ? 4 : 3);
    const reportProgress = createProgressReporter(options.onProgress, totalSteps);
    reportProgress(1, t.exportProgressPreparing, t.exportProgressPreparingDetail, {
      stageProgress: 0.2,
      indeterminate: true,
    });

    const exportContext = resolveExportContext(target);
    if (!exportContext) {
      if (requiresResolvedUsdContext) {
        throw new Error(t.usdExportUnavailable);
      }
      return;
    }

    const { robot, exportName, extraMeshFiles } = exportContext;
    const zip = new JSZip();
    const archiveRoot = createArchiveRoot(zip, exportName);
    const skeletonUsesMeshes =
      config.format === 'mjcf'
        ? config.mjcf.includeMeshes
        : config.format === 'urdf'
          ? config.urdf.includeMeshes
          : config.xacro.includeMeshes;

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
      reportProgress(2, t.exportProgressPreparingSimulationMeshes, t.exportProgressPreparingSimulationMeshesDetail, {
        stageProgress: 0.04,
        indeterminate: true,
      });

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
        reportProgress(4, t.exportProgressCollectingAssets, t.exportProgressCollectingAssetsPreparingDetail, {
          stageProgress: 0.04,
          indeterminate: true,
        });

        await addMeshesToZip(
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
        addArchiveFilesToZip(archiveRoot, 'meshes', mjcfMeshExport.archiveFiles);
      }
      const content = await generateZipBlobWithProgress(
        zip,
        reportProgress,
        includeMeshes ? 5 : 4,
      );
      downloadBlob(content, `${exportName}_mjcf.zip`);
    } else if (config.format === 'urdf') {
      const { includeExtended, includeBOM, useRelativePaths, includeMeshes, compressSTL, stlQuality } = config.urdf;
      const preferSourceVisualMeshes = config.urdf.preferSourceVisualMeshes;
      const generatedUrdfOptions = await buildGeneratedUrdfOptions(extraMeshFiles, { useRelativePaths });
      reportProgress(2, t.exportProgressGeneratingFiles, t.exportProgressGeneratingUrdfDetail, {
        stageProgress: 0.85,
        indeterminate: false,
      });

      const urdfContent = includeExtended
        ? generateURDF(robot, await buildGeneratedUrdfOptions(extraMeshFiles, { extended: true, useRelativePaths }))
        : buildUrdfSourceExportContent(target, exportName, {
          useRelativePaths,
          preferSourceVisualMeshes,
        })
          ?? generateURDF(robot, generatedUrdfOptions);
      archiveRoot.file(`${exportName}.urdf`, urdfContent);
      if (includeBOM) {
        const hardwareFolder = archiveRoot.folder('hardware');
        hardwareFolder?.file('bom_list.csv', generateBOM(robot));
      }
      if (includeMeshes) {
        reportProgress(3, t.exportProgressCollectingAssets, t.exportProgressCollectingAssetsPreparingDetail, {
          stageProgress: 0.04,
          indeterminate: true,
        });

        await addMeshesToZip(
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
      }
      const content = await generateZipBlobWithProgress(
        zip,
        reportProgress,
        includeMeshes ? 4 : 3,
      );
      downloadBlob(content, `${exportName}_urdf.zip`);
    } else if (config.format === 'xacro') {
      const { rosVersion, rosHardwareInterface, useRelativePaths, includeMeshes, compressSTL, stlQuality } = config.xacro;
      const generatedUrdfOptions = await buildGeneratedUrdfOptions(extraMeshFiles, { useRelativePaths });
      reportProgress(2, t.exportProgressGeneratingFiles, t.exportProgressGeneratingXacroDetail, {
        stageProgress: 0.85,
        indeterminate: false,
      });

      const xacroBaseUrdf = buildUrdfSourceExportContent(target, exportName, { useRelativePaths })
        ?? generateURDF(robot, generatedUrdfOptions);
      const xacroContent = injectGazeboTags(xacroBaseUrdf, robot, rosVersion, rosHardwareInterface);
      archiveRoot.file(`${exportName}.urdf.xacro`, xacroContent);
      if (includeMeshes) {
        reportProgress(3, t.exportProgressCollectingAssets, t.exportProgressCollectingAssetsPreparingDetail, {
          stageProgress: 0.04,
          indeterminate: true,
        });

        await addMeshesToZip(
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
      }
      const content = await generateZipBlobWithProgress(
        zip,
        reportProgress,
        includeMeshes ? 4 : 3,
      );
      downloadBlob(content, `${exportName}_xacro.zip`);
    }
  }, [
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
    generateZipBlobWithProgress,
    generateBOM,
    buildUrdfSourceExportContent,
    replaceTemplate,
    resolveExportContext,
    selectedFile,
    sidebarTab,
    t,
    trimProgressFileLabel,
  ]);

  // Export project as .usp
  const handleExportProject = useCallback(async () => {
    flushPendingHistory();
    const blob = await exportProject({
      name: robotName || assemblyState?.name || 'my_project',
      uiState: {
        appMode,
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
        history: assemblyHistory,
        activity: assemblyActivity,
      },
      getMergedRobotData,
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${robotName || assemblyState?.name || 'my_project'}.usp`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [
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
    appMode,
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
  ]);

  return {
    handleExportURDF,
    handleExportMJCF,
    handleExport,
    handleExportProject,
    handleExportWithConfig,
    generateBOM,
  };
}

export default useFileExport;
