/**
 * File Import Hook
 * Handles importing URDF, MJCF, USD, Xacro files and ZIP packages
 */
import { useCallback } from 'react';
import JSZip from 'jszip';
import type { RobotData, RobotFile, MotorSpec } from '@/types';
import { isMJCF, isUSDA, isXacro, parseMJCF, resolveRobotFileData } from '@/core/parsers';
import { pickPreferredUsdRootFile } from '@/core/parsers/usd/usdFormatUtils';
import { DEFAULT_MOTOR_LIBRARY } from '@/shared/data/motorLibrary';
import { useAssemblyStore, useAssetsStore, useRobotStore, useSelectionStore, useUIStore } from '@/store';
import { createAssetUrls, importProject, isMeshFile } from '@/features/file-io';
import {
  createImportPathCollisionMap,
  remapImportedPath,
} from '@/features/file-io/utils/libraryImportPathCollisions';
import { translations } from '@/shared/i18n';
import { resolveMJCFSource } from '@/core/parsers/mjcf/mjcfSourceResolver';
import { buildImportedRobotStoreState } from './projectRobotStateUtils';

const USD_BINARY_MAGIC = new Uint8Array([80, 88, 82, 45, 85, 83, 68, 67]); // "PXR-USDC"
const usdTextDecoder = new TextDecoder();

function hasBinaryMagic(bytes: Uint8Array, magic: Uint8Array): boolean {
  if (bytes.length < magic.length) return false;
  for (let index = 0; index < magic.length; index += 1) {
    if (bytes[index] !== magic[index]) return false;
  }
  return true;
}

function isLikelyTextBuffer(bytes: Uint8Array): boolean {
  const sample = bytes.subarray(0, Math.min(bytes.length, 512));
  if (sample.some((byte) => byte === 0)) return false;

  const decoded = usdTextDecoder.decode(sample);
  if (decoded.trimStart().startsWith('#usda')) return true;

  let printableCount = 0;
  for (const byte of sample) {
    if (byte === 9 || byte === 10 || byte === 13 || (byte >= 32 && byte <= 126)) {
      printableCount += 1;
    }
  }

  return sample.length > 0 && printableCount / sample.length > 0.9;
}

function isUsdFamilyPath(path: string): boolean {
  const lowerPath = path.toLowerCase();
  return lowerPath.endsWith('.usd')
    || lowerPath.endsWith('.usda')
    || lowerPath.endsWith('.usdc')
    || lowerPath.endsWith('.usdz');
}

function createImportedUsdFile(name: string, bytes: Uint8Array): RobotFile {
  const lowerName = name.toLowerCase();
  const isBinaryUsd = lowerName.endsWith('.usdc')
    || lowerName.endsWith('.usdz')
    || hasBinaryMagic(bytes, USD_BINARY_MAGIC);
  const isTextUsd = !isBinaryUsd && (lowerName.endsWith('.usda') || isLikelyTextBuffer(bytes));

  return {
    name,
    content: isTextUsd ? usdTextDecoder.decode(bytes) : '',
    format: 'usd',
  };
}

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
  const setRobot = useRobotStore((state) => state.setRobot);

  // Selection store
  const setSelection = useSelectionStore((state) => state.setSelection);

  // Assembly store
  const initAssembly = useAssemblyStore((state) => state.initAssembly);
  const addComponent = useAssemblyStore((state) => state.addComponent);

  const pickPreferredFile = useCallback((files: RobotFile[], filePool: RobotFile[] = files) => {
    const robotDefinitionFiles = files.filter((file) => file.format !== 'mesh');
    const preferredUrdf = robotDefinitionFiles.find((file) => file.format === 'urdf');
    if (preferredUrdf) {
      return preferredUrdf;
    }

    const mjcfFiles = robotDefinitionFiles.filter((file) => file.format === 'mjcf');
    if (mjcfFiles.length > 0) {
      const auxiliaryNamePattern = /(actuator|actuators|keyframe|position|velocity|motor|ctrl|filtered)/i;

      const sortedMjcfCandidates = [...mjcfFiles].sort((left, right) => {
        const leftBase = left.name.split('/').pop() ?? left.name;
        const rightBase = right.name.split('/').pop() ?? right.name;
        const leftDir = left.name.split('/').slice(-2, -1)[0] ?? '';
        const rightDir = right.name.split('/').slice(-2, -1)[0] ?? '';
        const leftIsScene = /scene/i.test(leftBase);
        const rightIsScene = /scene/i.test(rightBase);
        if (leftIsScene !== rightIsScene) {
          return leftIsScene ? 1 : -1;
        }

        const leftIsAuxiliary = auxiliaryNamePattern.test(leftBase);
        const rightIsAuxiliary = auxiliaryNamePattern.test(rightBase);
        if (leftIsAuxiliary !== rightIsAuxiliary) {
          return leftIsAuxiliary ? 1 : -1;
        }

        const leftMatchesDir = leftBase.toLowerCase() === `${leftDir.toLowerCase()}.xml`
          || leftBase.toLowerCase() === `${leftDir.toLowerCase()}.mjcf`;
        const rightMatchesDir = rightBase.toLowerCase() === `${rightDir.toLowerCase()}.xml`
          || rightBase.toLowerCase() === `${rightDir.toLowerCase()}.mjcf`;
        if (leftMatchesDir !== rightMatchesDir) {
          return leftMatchesDir ? -1 : 1;
        }

        if (leftBase.length !== rightBase.length) {
          return leftBase.length - rightBase.length;
        }

        return leftBase.localeCompare(rightBase);
      });

      for (const candidate of sortedMjcfCandidates) {
        try {
          const resolved = resolveMJCFSource(candidate, filePool);
          if (parseMJCF(resolved.content) !== null) {
            return candidate;
          }
        } catch {
          continue;
        }
      }

      return sortedMjcfCandidates[0] ?? null;
    }

    const preferredUsd = pickPreferredUsdRootFile(robotDefinitionFiles);
    if (preferredUsd) {
      return preferredUsd;
    }

    return robotDefinitionFiles[0] || files[0] || null;
  }, []);

  // Detect file format from content
  const detectFormat = useCallback((content: string, filename: string): 'urdf' | 'mjcf' | 'usd' | 'xacro' | null => {
    const lowerName = filename.toLowerCase();

    // Check by extension first
    if (lowerName.endsWith('.xacro') || lowerName.endsWith('.urdf.xacro')) return 'xacro';
    if (lowerName.endsWith('.urdf')) return 'urdf';
    if (lowerName.endsWith('.usda') || lowerName.endsWith('.usdc') || lowerName.endsWith('.usdz') || lowerName.endsWith('.usd')) return 'usd';

    // For XML files, check content
    if (lowerName.endsWith('.xml')) {
      if (isMJCF(content)) return 'mjcf';
      if (isXacro(content)) return 'xacro';
      if (content.includes('<robot')) return 'urdf';
    }

    // Try content-based detection
    if (isUSDA(content)) return 'usd';
    if (isMJCF(content)) return 'mjcf';
    if (isXacro(content)) return 'xacro';
    if (content.includes('<robot')) return 'urdf';

    return null;
  }, []);

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

      const newRobotFiles: RobotFile[] = [];
      const usdSourceFiles: { name: string; blob: Blob }[] = [];
      const assetFiles: { name: string; blob: Blob }[] = [];
      const libraryFiles: { path: string; content: string }[] = [];

      // Mode 1: Single ZIP file
      if (files.length === 1 && files[0].name.toLowerCase().endsWith('.zip')) {
        const zip = await JSZip.loadAsync(files[0]);

        const promises: Promise<void>[] = [];
        zip.forEach((relativePath, fileEntry) => {
          if (fileEntry.dir) return;

          // Skip hidden files/folders
          const pathParts = relativePath.split('/');
          if (pathParts.some(part => part.startsWith('.'))) return;

          const lowerPath = relativePath.toLowerCase();
          const p = (async () => {
            if (isUsdFamilyPath(relativePath)) {
              const bytes = await fileEntry.async('uint8array');
              newRobotFiles.push(createImportedUsdFile(relativePath, bytes));
              usdSourceFiles.push({ name: relativePath, blob: new Blob([bytes]) });
            } else if (lowerPath.endsWith('.urdf') || lowerPath.endsWith('.xml') ||
                lowerPath.endsWith('.mjcf') || lowerPath.endsWith('.xacro')) {
              const content = await fileEntry.async("string");
              const format = detectFormat(content, relativePath);
              if (format) {
                newRobotFiles.push({ name: relativePath, content, format });
              }
            } else if (lowerPath.includes('motor library') && lowerPath.endsWith('.txt')) {
              const content = await fileEntry.async("string");
              libraryFiles.push({ path: relativePath, content });
            } else {
              const blob = await fileEntry.async("blob");
              assetFiles.push({ name: relativePath, blob });
              if (isMeshFile(relativePath)) {
                newRobotFiles.push({ name: relativePath, content: '', format: 'mesh' });
              }
            }
          })();
          promises.push(p);
        });
        await Promise.all(promises);

      } else {
        // Mode 2: Multiple Files
        const fileList = Array.from(files);

        const promises = fileList.map(async f => {
          const path = f.webkitRelativePath || f.name;
          const lowerPath = path.toLowerCase();

          // Skip hidden files/folders
          const pathParts = path.split('/');
          if (pathParts.some(part => part.startsWith('.'))) return;

          if (isUsdFamilyPath(path)) {
            const bytes = new Uint8Array(await f.arrayBuffer());
            newRobotFiles.push(createImportedUsdFile(path, bytes));
            usdSourceFiles.push({ name: path, blob: f });
          } else if (lowerPath.endsWith('.urdf') || lowerPath.endsWith('.xml') ||
              lowerPath.endsWith('.mjcf') || lowerPath.endsWith('.xacro')) {
            const content = await f.text();
            const format = detectFormat(content, f.name);
            if (format) {
              newRobotFiles.push({ name: path, content, format });
            }
          } else if (path.includes('motor library') && lowerPath.endsWith('.txt')) {
            const content = await f.text();
            libraryFiles.push({ path: path, content });
          } else {
            assetFiles.push({ name: path, blob: f });
            if (isMeshFile(path)) {
              newRobotFiles.push({ name: path, content: '', format: 'mesh' });
            }
          }
        });
        await Promise.all(promises);
      }

      const importedPaths = [
        ...newRobotFiles.map((file) => file.name),
        ...assetFiles.map((file) => file.name),
        ...libraryFiles.map((file) => file.path),
      ];
      const existingPaths = [
        ...availableFiles.map((file) => file.name),
        ...Object.keys(assets),
      ];
      const pathCollisionMap = createImportPathCollisionMap(importedPaths, existingPaths);
      const renamedRobotFiles = newRobotFiles.map((file) => ({
        ...file,
        name: remapImportedPath(file.name, pathCollisionMap),
      }));
      const renamedAssetFiles = assetFiles.map((file) => ({
        ...file,
        name: remapImportedPath(file.name, pathCollisionMap),
      }));
      const renamedUsdSourceFiles = usdSourceFiles.map((file) => ({
        ...file,
        name: remapImportedPath(file.name, pathCollisionMap),
      }));
      const renamedLibraryFiles = libraryFiles.map((file) => ({
        ...file,
        path: remapImportedPath(file.path, pathCollisionMap),
      }));
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
        const preferredFile = pickPreferredFile(renamedRobotFilesWithSources, mergedFiles);

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
          loadRobot(preferredFile, mergedFiles, { ...assets, ...sourceAssets });
          setAppMode('detail');
        } else if (!selectedFile) {
          // If the current preview was cleared by a library delete, reload the newly imported robot
          // instead of leaving the workspace on the placeholder base_link state.
          setSidebarTab('structure');
          loadRobot(preferredFile, mergedFiles, { ...assets, ...sourceAssets });
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
    detectFormat,
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
    setRobot,
    getUsdPreparedExportCache,
    initAssembly,
    addComponent,
    pickPreferredFile,
    showImportWarning,
    t,
  ]);

  return {
    handleImport,
    loadRobot,
    detectFormat,
  };
}

export default useFileImport;
