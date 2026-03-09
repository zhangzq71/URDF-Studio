/**
 * File Import Hook
 * Handles importing URDF, MJCF, USD, Xacro files and ZIP packages
 */
import { useCallback } from 'react';
import JSZip from 'jszip';
import type { RobotFile, MotorSpec, RobotState } from '@/types';
import { GeometryType } from '@/types';
import { parseURDF, parseMJCF, isMJCF, parseUSDA, isUSDA, parseXacro, isXacro } from '@/core/parsers';
import { DEFAULT_MOTOR_LIBRARY } from '@/shared/data/motorLibrary';
import { useAssetsStore, useRobotStore, useUIStore, useAssemblyStore } from '@/store';
import { importProject, isMeshFile } from '@/features/file-io';
import { translations } from '@/shared/i18n';
import type { Language } from '@/shared/i18n';
import { resolveMJCFSource } from '@/core/parsers/mjcf/mjcfSourceResolver';

interface UseFileImportOptions {
  onLoadRobot?: (file: RobotFile) => void;
  onShowToast?: (message: string, type?: 'info' | 'success') => void;
}

export function useFileImport(options: UseFileImportOptions = {}) {
  const { onLoadRobot, onShowToast } = options;

  const lang = useUIStore((state) => state.lang);
  const setAppMode = useUIStore((state) => state.setAppMode);
  const setTheme = useUIStore((state) => state.setTheme);
  const setLang = useUIStore((state) => state.setLang);
  const setSidebarTab = useUIStore((state) => state.setSidebarTab);

  // Assets store
  const setAssets = useAssetsStore((state) => state.setAssets);
  const addAssets = useAssetsStore((state) => state.addAssets);
  const clearAssets = useAssetsStore((state) => state.clearAssets);
  const setAvailableFiles = useAssetsStore((state) => state.setAvailableFiles);
  const availableFiles = useAssetsStore((state) => state.availableFiles);
  const setMotorLibrary = useAssetsStore((state) => state.setMotorLibrary);
  const setOriginalFileFormat = useAssetsStore((state) => state.setOriginalFileFormat);
  const assets = useAssetsStore((state) => state.assets);
  const showImportWarning = useUIStore((state) => state.showImportWarning);
  const t = translations[lang];

  // Robot store
  const robotName = useRobotStore((state) => state.name);
  const resetRobot = useRobotStore((state) => state.resetRobot);
  const setRobot = useRobotStore((state) => state.setRobot);

  // Assembly store
  const initAssembly = useAssemblyStore((state) => state.initAssembly);
  const setAssembly = useAssemblyStore((state) => state.setAssembly);
  const addComponent = useAssemblyStore((state) => state.addComponent);

  // Detect file format from content
  const detectFormat = useCallback((content: string, filename: string): 'urdf' | 'mjcf' | 'usd' | 'xacro' | null => {
    const lowerName = filename.toLowerCase();

    // Check by extension first
    if (lowerName.endsWith('.xacro') || lowerName.endsWith('.urdf.xacro')) return 'xacro';
    if (lowerName.endsWith('.urdf')) return 'urdf';
    if (lowerName.endsWith('.usda') || lowerName.endsWith('.usdc') || lowerName.endsWith('.usd')) return 'usd';

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
    let newState: RobotState | null = null;

    switch (file.format) {
      case 'urdf':
        newState = parseURDF(file.content);
        break;
      case 'mjcf': {
        const resolved = resolveMJCFSource(file, availableFiles);
        newState = parseMJCF(resolved.content);
        break;
      }
      case 'usd':
        newState = parseUSDA(file.content);
        break;
      case 'xacro':
        // Build file map for xacro includes
        const fileMap: { [path: string]: string } = {};
        availableFiles.forEach(f => {
          fileMap[f.name] = f.content;
        });
        Object.entries(currentAssets).forEach(([path, content]) => {
          if (typeof content === 'string') {
            fileMap[path] = content;
          }
        });
        const pathParts = file.name.split('/');
        pathParts.pop();
        const basePath = pathParts.join('/');
        newState = parseXacro(file.content, {}, fileMap, basePath);
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

    if (newState && onLoadRobot) {
      onLoadRobot(file);
    }

    return newState;
  }, [onLoadRobot]);

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
        const { manifest, assets: newAssetUrls, availableFiles: newFiles, assemblyState: newAssembly } = result;
        if (manifest.ui) {
          if (manifest.ui.appMode) setAppMode(manifest.ui.appMode as any);
          if (manifest.ui.theme) setTheme(manifest.ui.theme as any);
          if (manifest.ui.lang) setLang(manifest.ui.lang as any);
        }
        clearAssets();
        addAssets(newAssetUrls);
        setAvailableFiles(newFiles);
        if (newAssembly) {
          setAssembly(newAssembly);
          setSidebarTab('workspace');
          const firstCompId = Object.keys(newAssembly.components)[0];
          if (firstCompId) {
            setRobot(newAssembly.components[firstCompId].robot);
          }
        }
        if (manifest.assets?.originalFileFormat) {
          setOriginalFileFormat(manifest.assets.originalFileFormat as any);
        }
        if (onShowToast) {
          onShowToast(t.importUspSuccess, 'success');
        }
        return;
      }

      const newRobotFiles: RobotFile[] = [];
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
            if (lowerPath.endsWith('.urdf') || lowerPath.endsWith('.xml') ||
                lowerPath.endsWith('.mjcf') || lowerPath.endsWith('.usda') ||
                lowerPath.endsWith('.usd') || lowerPath.endsWith('.xacro')) {
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

          if (lowerPath.endsWith('.urdf') || lowerPath.endsWith('.xml') ||
              lowerPath.endsWith('.mjcf') || lowerPath.endsWith('.usda') ||
              lowerPath.endsWith('.usd') || lowerPath.endsWith('.xacro')) {
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

      // 1. Process Motor Library
      if (libraryFiles.length > 0) {
        const newLibrary: Record<string, MotorSpec[]> = { ...DEFAULT_MOTOR_LIBRARY };
        libraryFiles.forEach(f => {
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
      const newAssets: Record<string, string> = {};
      const assetPromises = assetFiles.map(async f => {
        const ext = f.name.split('.').pop()?.toLowerCase();
        if (['stl', 'obj', 'dae', 'png', 'jpg', 'jpeg', 'tga', 'bmp', 'tiff', 'tif', 'webp'].includes(ext || '')) {
          const url = URL.createObjectURL(f.blob);
          newAssets[f.name] = url;
          const filename = f.name.split('/').pop()!;
          newAssets[filename] = url;
          if (f.name.includes('/meshes/')) {
            newAssets['/meshes/' + filename] = url;
          }
          // Store various path patterns
          const parts = f.name.split('/');
          for (let i = 0; i < parts.length; i++) {
            const subPath = parts.slice(i).join('/');
            if (!newAssets[subPath]) newAssets[subPath] = url;
            if (!newAssets['/' + subPath]) newAssets['/' + subPath] = url;
          }
        }
      });
      await Promise.all(assetPromises);

      // Add new assets (merge with existing)
      addAssets(newAssets);

      // 3. Set Available Files (merge with existing)
      const existingNames = new Set(availableFiles.map(f => f.name));
      const uniqueNewFiles = newRobotFiles.filter(f => !existingNames.has(f.name));
      const mergedFiles = [...availableFiles, ...uniqueNewFiles];
      setAvailableFiles(mergedFiles);

      // 4. Load first robot if available (prefer .urdf/.xml over .xacro)
      // Filter to get only real robot definition files (exclude mesh)
      const robotDefinitionFiles = newRobotFiles.filter(f => f.format !== 'mesh');
      if (newRobotFiles.length > 0) {
        if (availableFiles.length === 0) {
          // First import: initialize assembly and load robot
          initAssembly(robotName || 'my_project');
          const preferredFile = robotDefinitionFiles.find(f => f.format === 'urdf')
            || robotDefinitionFiles.find(f => f.format === 'mjcf')
            || robotDefinitionFiles.find(f => f.format === 'usd')
            || robotDefinitionFiles[0]
            || newRobotFiles[0];
          addComponent(preferredFile, { availableFiles: mergedFiles, assets: { ...assets, ...newAssets } });
          setSidebarTab('structure');
          loadRobot(preferredFile, mergedFiles, { ...assets, ...newAssets });
          setAppMode('detail');
        } else {
          // Subsequent import: notify user
          if (onShowToast) {
            onShowToast(
              t.addedFilesToAssetLibrary.replace('{count}', String(newRobotFiles.length)),
              'success',
            );
          }
        }
      } else if (libraryFiles.length > 0) {
        alert(t.libraryImportSuccessful);
      } else if (assetFiles.length === 0 && newRobotFiles.length === 0) {
        alert(t.noDefinitionFilesFound);
      }

    } catch (error: any) {
      console.error("Import failed:", error);
      alert(t.importFailedCheckFiles);
    }
  }, [assets, availableFiles, robotName, detectFormat, loadRobot, onLoadRobot, onShowToast, setAssets, addAssets, clearAssets, setAvailableFiles, setMotorLibrary, setAppMode, setTheme, setLang, setSidebarTab, setOriginalFileFormat, setRobot, initAssembly, setAssembly, addComponent, showImportWarning, t]);

  return {
    handleImport,
    loadRobot,
    detectFormat,
  };
}

export default useFileImport;
