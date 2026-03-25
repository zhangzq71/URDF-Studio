/**
 * File Import Hook
 * Handles importing URDF, MJCF, USD, Xacro files and ZIP packages
 */
import { useCallback } from 'react';
import type { RobotData, RobotFile, MotorSpec } from '@/types';
import { resolveRobotFileData } from '@/core/parsers';
import { DEFAULT_MOTOR_LIBRARY } from '@/shared/data/motorLibrary';
import { useAssemblyStore, useAssetsStore, useRobotStore, useSelectionStore, useUIStore } from '@/store';
import { createAssetUrls, importProject } from '@/features/file-io';
import { translations } from '@/shared/i18n';
import { buildImportedRobotStoreState } from './projectRobotStateUtils';
import { pickPreferredImportFile } from './importPreferredFile';
import { prepareImportPayloadWithWorker } from './importPreparationWorkerBridge';
import { detectImportFormat } from '@/app/utils/importPreparation';

interface UseFileImportOptions {
  onLoadRobot?: (file: RobotFile) => void;
  onShowToast?: (message: string, type?: 'info' | 'success') => void;
}

export function useFileImport(options: UseFileImportOptions = {}) {
  const { onLoadRobot, onShowToast } = options;

  const lang = useUIStore((state) => state.lang);
  const setAppMode = useUIStore((state) => state.setAppMode);
  const setSidebarTab = useUIStore((state) => state.setSidebarTab);

  // Assets store
  const addAssets = useAssetsStore((state) => state.addAssets);
  const clearAssets = useAssetsStore((state) => state.clearAssets);
  const setAvailableFiles = useAssetsStore((state) => state.setAvailableFiles);
  const setAllFileContents = useAssetsStore((state) => state.setAllFileContents);
  const availableFiles = useAssetsStore((state) => state.availableFiles);
  const setMotorLibrary = useAssetsStore((state) => state.setMotorLibrary);
  const setSelectedFile = useAssetsStore((state) => state.setSelectedFile);
  const selectedFile = useAssetsStore((state) => state.selectedFile);
  const setOriginalUrdfContent = useAssetsStore((state) => state.setOriginalUrdfContent);
  const setOriginalFileFormat = useAssetsStore((state) => state.setOriginalFileFormat);
  const assets = useAssetsStore((state) => state.assets);
  const getUsdPreparedExportCache = useAssetsStore((state) => state.getUsdPreparedExportCache);
  const showImportWarning = useUIStore((state) => state.showImportWarning);
  const t = translations[lang];

  // Robot store
  const robotName = useRobotStore((state) => state.name);

  // Selection store
  const setSelection = useSelectionStore((state) => state.setSelection);

  // Assembly store
  const initAssembly = useAssemblyStore((state) => state.initAssembly);
  const addComponent = useAssemblyStore((state) => state.addComponent);

  // Load a robot file
  const loadRobot = useCallback((file: RobotFile, availableFiles: RobotFile[] = [], currentAssets: Record<string, string> = {}) => {
    const importResult = resolveRobotFileData(file, {
      availableFiles,
      assets: currentAssets,
      usdRobotData: getUsdPreparedExportCache(file.name)?.robotData ?? null,
    });

    if ((importResult.status === 'ready' || importResult.status === 'needs_hydration') && onLoadRobot) {
      onLoadRobot(file);
    }

    return importResult;
  }, [getUsdPreparedExportCache, onLoadRobot]);

  // Handle file import
  const handleImport = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    // Show privacy toast
    if (onShowToast && showImportWarning) {
      onShowToast(t.privacyNoticeLocalProcessing, 'success');
    }

    try {
      // Mode 0: .usp Project File
      if (files.length === 1 && files[0].name.toLowerCase().endsWith('.usp')) {
        const result = await importProject(files[0], lang);
        const { manifest, assets: newAssetUrls, availableFiles: newFiles } = result;

        if (manifest.ui) {
          if (manifest.ui.appMode) setAppMode(manifest.ui.appMode as any);
        }

        clearAssets();
        addAssets(newAssetUrls);
        setAvailableFiles(newFiles);
        setAllFileContents(result.allFileContents);
        setMotorLibrary(result.motorLibrary);
        setOriginalUrdfContent(result.originalUrdfContent);
        setOriginalFileFormat(result.originalFileFormat);
        useAssetsStore.setState({
          usdSceneSnapshots: {},
          usdPreparedExportCaches: result.usdPreparedExportCaches,
        });
        setSelection({ type: null, id: null });

        const restoredSelectedFile = result.selectedFileName
          ? newFiles.find((file) => file.name === result.selectedFileName) ?? null
          : null;
        setSelectedFile(restoredSelectedFile);

        useRobotStore.setState(
          buildImportedRobotStoreState(
            result.robotState,
            result.robotHistory,
            result.robotActivity,
          ),
        );

        useAssemblyStore.setState({
          assemblyState: result.assemblyState,
          _history: result.assemblyHistory,
          _activity: result.assemblyActivity,
        });

        setSidebarTab(result.assemblyState ? 'workspace' : 'structure');

        if (onShowToast) {
          onShowToast(t.importUspSuccess, 'success');
        }
        return;
      }

      const preparedImportPayload = await prepareImportPayloadWithWorker({
        files: Array.from(files),
        existingPaths: [
          ...availableFiles.map((file) => file.name),
          ...Object.keys(assets),
        ],
      });
      const {
        robotFiles: renamedRobotFiles,
        assetFiles: renamedAssetFiles,
        usdSourceFiles: renamedUsdSourceFiles,
        libraryFiles: renamedLibraryFiles,
      } = preparedImportPayload;
      const usdSourceBlobUrls = Object.fromEntries(
        renamedUsdSourceFiles.map((file) => [file.name, URL.createObjectURL(file.blob)]),
      );
      const renamedRobotFilesWithSources = renamedRobotFiles.map((file) => (
        file.format === 'usd' && usdSourceBlobUrls[file.name]
          ? { ...file, blobUrl: usdSourceBlobUrls[file.name] }
          : file
      ));

      // 1. Process Motor Library
      if (renamedLibraryFiles.length > 0) {
        const newLibrary: Record<string, MotorSpec[]> = { ...DEFAULT_MOTOR_LIBRARY };
        renamedLibraryFiles.forEach(f => {
          try {
            const parts = f.path.split('/');
            if (parts.length >= 2) {
              const brand = parts[parts.length - 2];
              const spec = JSON.parse(f.content) as MotorSpec;
              if (!newLibrary[brand]) newLibrary[brand] = [];
              if (!newLibrary[brand].some(m => m.name === spec.name)) {
                newLibrary[brand].push(spec);
              }
            }
          } catch (err) {
            console.warn("Failed to parse motor spec", f.path);
          }
        });
        setMotorLibrary(newLibrary);
      }

      // 2. Load Assets
      const newAssets = createAssetUrls(renamedAssetFiles);
      const sourceAssets = {
        ...newAssets,
        ...usdSourceBlobUrls,
      };

      // Add new assets (merge with existing)
      addAssets(sourceAssets);

      // 3. Set Available Files (merge with existing)
      const existingNames = new Set(availableFiles.map(f => f.name));
      const uniqueNewFiles = renamedRobotFilesWithSources.filter(f => !existingNames.has(f.name));
      const mergedFiles = [...availableFiles, ...uniqueNewFiles];
      setAvailableFiles(mergedFiles);

      // 4. Load first robot if available (prefer .urdf/.xml over .xacro)
      // Filter to get only real robot definition files (exclude mesh)
      if (renamedRobotFilesWithSources.length > 0) {
        const preferredFile = pickPreferredImportFile(renamedRobotFilesWithSources, mergedFiles);

        if (!preferredFile) {
          // No loadable file after import; fall through to generic completion handling.
        } else if (availableFiles.length === 0) {
          // First import: initialize assembly and load robot
          const preResolvedRobotData: RobotData | null = preferredFile.format === 'usd'
            ? getUsdPreparedExportCache(preferredFile.name)?.robotData ?? null
            : null;
          const canSeedAssembly = preferredFile.format !== 'mesh'
            && (preferredFile.format !== 'usd' || Boolean(preResolvedRobotData));
          if (canSeedAssembly) {
            initAssembly(robotName || 'my_project');
            addComponent(preferredFile, {
              availableFiles: mergedFiles,
              assets: { ...assets, ...sourceAssets },
              preResolvedRobotData,
            });
          }
          setSidebarTab('structure');
          if (onLoadRobot) {
            onLoadRobot(preferredFile);
          } else {
            loadRobot(preferredFile, mergedFiles, { ...assets, ...sourceAssets });
          }
          setAppMode('detail');
        } else if (!selectedFile) {
          // If the current preview was cleared by a library delete, reload the newly imported robot
          // instead of leaving the workspace on the placeholder base_link state.
          setSidebarTab('structure');
          if (onLoadRobot) {
            onLoadRobot(preferredFile);
          } else {
            loadRobot(preferredFile, mergedFiles, { ...assets, ...sourceAssets });
          }
          setAppMode('detail');
          if (onShowToast) {
            onShowToast(
              t.addedFilesToAssetLibrary.replace('{count}', String(renamedRobotFilesWithSources.length)),
              'success',
            );
          }
        } else {
          // Subsequent import: notify user
          if (onShowToast) {
            onShowToast(
              t.addedFilesToAssetLibrary.replace('{count}', String(renamedRobotFilesWithSources.length)),
              'success',
            );
          }
        }
      } else if (renamedLibraryFiles.length > 0) {
        alert(t.libraryImportSuccessful);
      } else if (renamedAssetFiles.length === 0 && renamedRobotFiles.length === 0) {
        alert(t.noDefinitionFilesFound);
      }

    } catch (error: any) {
      console.error("Import failed:", error);
      alert(t.importFailedCheckFiles);
    }
  }, [
    assets,
    availableFiles,
    robotName,
    loadRobot,
    onLoadRobot,
    onShowToast,
    addAssets,
    clearAssets,
    setAvailableFiles,
    setAllFileContents,
    setMotorLibrary,
    setSelectedFile,
    setOriginalUrdfContent,
    setOriginalFileFormat,
    setAppMode,
    setSidebarTab,
    setSelection,
    selectedFile,
    getUsdPreparedExportCache,
    initAssembly,
    addComponent,
    showImportWarning,
    t,
  ]);

  return {
    handleImport,
    loadRobot,
    detectFormat: detectImportFormat,
  };
}

export default useFileImport;
