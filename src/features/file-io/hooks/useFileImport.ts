/**
 * useFileImport Hook
 * Handle file import operations for URDF/MJCF/USD/Xacro files
 */

import { useCallback, useRef } from 'react';
import JSZip from 'jszip';
import { translations } from '@/shared/i18n';
import { useAssetsStore, useUIStore } from '@/store';
import { DEFAULT_MOTOR_LIBRARY } from '@/shared/data/motorLibrary';
import type { RobotFile, MotorSpec } from '@/types';
import type { AssetFile, LibraryFile, ImportResult } from '../types';
import {
  detectFormat,
  isRobotDefinitionFile,
  isAssetFile,
  isMeshFile,
  isMotorLibraryFile,
  shouldSkipPath,
  createAssetUrls,
} from '../utils';

interface UseFileImportOptions {
  onImportComplete?: (result: ImportResult) => void;
  onLoadRobot?: (file: RobotFile) => void;
  onError?: (error: Error) => void;
  showPrivacyToast?: () => void;
}

interface UseFileImportReturn {
  importInputRef: React.RefObject<HTMLInputElement | null>;
  importFolderInputRef: React.RefObject<HTMLInputElement | null>;
  handleImport: (input: React.ChangeEvent<HTMLInputElement> | FileList | File[] | null) => Promise<void>;
  handleUploadAsset: (file: File) => void;
}

export function useFileImport(options: UseFileImportOptions = {}): UseFileImportReturn {
  const { onImportComplete, onLoadRobot, onError, showPrivacyToast } = options;

  const importInputRef = useRef<HTMLInputElement | null>(null);
  const importFolderInputRef = useRef<HTMLInputElement | null>(null);

  const lang = useUIStore((s) => s.lang);
  const t = translations[lang];
  const assets = useAssetsStore((s) => s.assets);
  const revokeAllAssets = useAssetsStore((s) => s.revokeAllAssets);
  const addAssets = useAssetsStore((s) => s.addAssets);
  const setAvailableFiles = useAssetsStore((s) => s.setAvailableFiles);
  const setMotorLibrary = useAssetsStore((s) => s.setMotorLibrary);
  const uploadAsset = useAssetsStore((s) => s.uploadAsset);

  const handleImport = useCallback(async (input: React.ChangeEvent<HTMLInputElement> | FileList | File[] | null) => {
    // Show privacy toast when import starts
    showPrivacyToast?.();

    if (!input) return;

    let files: File[] = [];
    if (Array.isArray(input)) {
      files = input;
    } else if (input instanceof FileList) {
      files = Array.from(input);
    } else if (input && 'target' in input && input.target.files) {
       files = Array.from(input.target.files);
    }

    if (files.length === 0) return;

    try {
      const newRobotFiles: RobotFile[] = [];
      const assetFiles: AssetFile[] = [];
      const libraryFiles: LibraryFile[] = [];

      // Mode 1: Single ZIP file
      if (files.length === 1 && files[0].name.toLowerCase().endsWith('.zip')) {
        const zip = await JSZip.loadAsync(files[0]);

        const promises: Promise<void>[] = [];
        zip.forEach((relativePath, fileEntry) => {
          if (fileEntry.dir) return;

          // Skip hidden files/folders
          if (shouldSkipPath(relativePath)) return;

          const lowerPath = relativePath.toLowerCase();
          const p = (async () => {
            // Check for robot definition files
            if (isRobotDefinitionFile(relativePath)) {
              const content = await fileEntry.async('string');
              const format = detectFormat(content, relativePath);
              if (format) {
                newRobotFiles.push({ name: relativePath, content, format });
              }
            } else if (isMotorLibraryFile(relativePath)) {
              const content = await fileEntry.async('string');
              libraryFiles.push({ path: relativePath, content });
            } else {
              // Assume asset
              const blob = await fileEntry.async('blob');
              assetFiles.push({ name: relativePath, blob });
              // Mesh files also appear in file browser
              if (isMeshFile(relativePath)) {
                newRobotFiles.push({ name: relativePath, content: '', format: 'mesh' });
              }
            }
          })();
          promises.push(p);
        });
        await Promise.all(promises);

      } else {
        // Mode 2: Multiple Files (Folder upload or Multi-select)
        // files is already File[]

        const promises = files.map(async (f) => {
          const lowerName = f.name.toLowerCase();
          // Use webkitRelativePath if available (from folder upload or our traverser), else fallback to name
          const path = f.webkitRelativePath || f.name;

          // Skip hidden files/folders
          if (shouldSkipPath(path)) return;

          // Check for robot definition files
          if (isRobotDefinitionFile(f.name)) {
            const content = await f.text();
            const format = detectFormat(content, f.name);
            if (format) {
              newRobotFiles.push({ name: path, content, format });
            }
          } else if (isMotorLibraryFile(path)) {
            const content = await f.text();
            libraryFiles.push({ path, content });
          } else {
            assetFiles.push({ name: path, blob: f });
            // Mesh files also appear in file browser
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
        libraryFiles.forEach((f) => {
          try {
            const parts = f.path.split('/');
            // Expecting .../Brand/Motor.txt
            if (parts.length >= 2) {
              const brand = parts[parts.length - 2];
              const spec = JSON.parse(f.content) as MotorSpec;
              if (!newLibrary[brand]) newLibrary[brand] = [];
              if (!newLibrary[brand].some((m) => m.name === spec.name)) {
                newLibrary[brand].push(spec);
              }
            }
          } catch (err) {
            console.warn('Failed to parse motor spec', f.path);
          }
        });
        setMotorLibrary(newLibrary);
      }

      // 2. Load Assets
      const newAssets = createAssetUrls(assetFiles);

      // Cleanup old assets
      revokeAllAssets();
      addAssets(newAssets);

      // 3. Set Available Files
      setAvailableFiles(newRobotFiles);

      // 4. Notify completion
      const result: ImportResult = { robotFiles: newRobotFiles, assetFiles, libraryFiles };
      onImportComplete?.(result);

      // 5. Load first robot file if available (prefer real robot files over mesh)
      const robotDefinitionFiles = newRobotFiles.filter(f => f.format !== 'mesh');
      if (robotDefinitionFiles.length > 0) {
        onLoadRobot?.(robotDefinitionFiles[0]);
      } else if (newRobotFiles.length > 0) {
        onLoadRobot?.(newRobotFiles[0]);
      } else if (libraryFiles.length > 0) {
        alert(t.libraryImportSuccessful);
      } else if (assetFiles.length === 0) {
        alert(t.noDefinitionFilesFound);
      }

    } catch (error: any) {
      console.error('Import failed:', error);
      onError?.(error);
      alert(t.importFailedCheckFiles);
    } finally {
      if (importInputRef.current) importInputRef.current.value = '';
      if (importFolderInputRef.current) importFolderInputRef.current.value = '';
    }
  }, [
    t,
    showPrivacyToast,
    revokeAllAssets,
    addAssets,
    setAvailableFiles,
    setMotorLibrary,
    onImportComplete,
    onLoadRobot,
    onError,
  ]);

  const handleUploadAsset = useCallback((file: File) => {
    uploadAsset(file);
  }, [uploadAsset]);

  return {
    importInputRef,
    importFolderInputRef,
    handleImport,
    handleUploadAsset,
  };
}
