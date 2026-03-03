/**
 * Assets Store - Manages mesh and texture file resources
 * Handles blob URLs for imported 3D assets
 */
import { create } from 'zustand';
import type { RobotFile, MotorSpec } from '@/types';
import { DEFAULT_MOTOR_LIBRARY } from '@/features/hardware-config';

interface AssetsState {
  // Mesh and texture assets (blob URLs)
  assets: Record<string, string>;
  setAssets: (assets: Record<string, string>) => void;
  addAsset: (path: string, url: string) => void;
  addAssets: (newAssets: Record<string, string>) => void;
  getAsset: (path: string) => string | undefined;
  clearAssets: () => void;

  // Available robot files (URDF/MJCF/USD/Xacro)
  availableFiles: RobotFile[];
  setAvailableFiles: (files: RobotFile[]) => void;
  addRobotFile: (file: RobotFile) => void;
  removeRobotFile: (fileName: string) => void;
  removeRobotFolder: (folderPath: string) => void;

  // Currently selected file in file browser
  selectedFile: RobotFile | null;
  setSelectedFile: (file: RobotFile | null) => void;

  // All text file contents for xacro includes
  allFileContents: Record<string, string>;
  setAllFileContents: (contents: Record<string, string>) => void;
  addFileContent: (path: string, content: string) => void;

  // Motor library
  motorLibrary: Record<string, MotorSpec[]>;
  setMotorLibrary: (library: Record<string, MotorSpec[]>) => void;
  addMotorSpec: (brand: string, spec: MotorSpec) => void;

  // Original URDF content (for preserving material colors)
  originalUrdfContent: string;
  setOriginalUrdfContent: (content: string) => void;

  // Original file format
  originalFileFormat: 'urdf' | 'mjcf' | 'usd' | 'xacro' | null;
  setOriginalFileFormat: (format: 'urdf' | 'mjcf' | 'usd' | 'xacro' | null) => void;

  // Upload a single file and create blob URL
  uploadAsset: (file: File) => string;

  // Cleanup all blob URLs
  revokeAllAssets: () => void;
}

export const useAssetsStore = create<AssetsState>()((set, get) => ({
  // Assets (blob URLs)
  assets: {},
  setAssets: (assets) => set({ assets }),
  addAsset: (path, url) =>
    set((state) => ({
      assets: { ...state.assets, [path]: url },
    })),
  addAssets: (newAssets) =>
    set((state) => ({
      assets: { ...state.assets, ...newAssets },
    })),
  getAsset: (path) => get().assets[path],
  clearAssets: () => {
    // Revoke all existing blob URLs before clearing
    Object.values(get().assets).forEach((url) => {
      if (url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
      }
    });
    set({ assets: {} });
  },

  // Robot files
  availableFiles: [],
  setAvailableFiles: (files) => set({ availableFiles: files }),
  addRobotFile: (file) =>
    set((state) => ({
      availableFiles: [...state.availableFiles, file],
    })),
  removeRobotFile: (fileName) =>
    set((state) => {
      if (!state.availableFiles.some((file) => file.name === fileName)) return state;

      const nextAvailableFiles = state.availableFiles.filter((file) => file.name !== fileName);
      const nextSelectedFile =
        state.selectedFile?.name === fileName ? null : state.selectedFile;

      const nextAllFileContents = { ...state.allFileContents };
      delete nextAllFileContents[fileName];

      const removableKeys = new Set<string>([fileName]);
      const baseName = fileName.split('/').pop();
      if (baseName) {
        removableKeys.add(baseName);
        removableKeys.add(`/meshes/${baseName}`);
      }

      const parts = fileName.split('/');
      for (let i = 0; i < parts.length; i += 1) {
        const subPath = parts.slice(i).join('/');
        removableKeys.add(subPath);
        removableKeys.add(`/${subPath}`);
      }

      const targetUrl = state.assets[fileName];
      const removeByUrl = Boolean(targetUrl && targetUrl.startsWith('blob:'));
      const nextAssets: Record<string, string> = {};

      Object.entries(state.assets).forEach(([key, url]) => {
        if (removableKeys.has(key)) return;
        if (removeByUrl && url === targetUrl) return;
        nextAssets[key] = url;
      });

      if (removeByUrl && targetUrl) {
        URL.revokeObjectURL(targetUrl);
      }

      return {
        availableFiles: nextAvailableFiles,
        selectedFile: nextSelectedFile,
        allFileContents: nextAllFileContents,
        assets: nextAssets,
      };
    }),
  removeRobotFolder: (folderPath) =>
    set((state) => {
      const normalizedFolder = folderPath.replace(/\/+$/, '');
      if (!normalizedFolder) return state;

      const shouldRemove = (path: string) =>
        path === normalizedFolder || path.startsWith(`${normalizedFolder}/`);

      const removedFiles = state.availableFiles.filter((file) => shouldRemove(file.name));
      if (removedFiles.length === 0) return state;

      const removedFileNames = new Set(removedFiles.map((file) => file.name));
      const nextAvailableFiles = state.availableFiles.filter((file) => !removedFileNames.has(file.name));
      const nextSelectedFile =
        state.selectedFile && shouldRemove(state.selectedFile.name) ? null : state.selectedFile;

      const nextAllFileContents: Record<string, string> = {};
      Object.entries(state.allFileContents).forEach(([path, content]) => {
        if (!shouldRemove(path)) {
          nextAllFileContents[path] = content;
        }
      });

      const targetUrls = new Set<string>();
      Object.entries(state.assets).forEach(([key, url]) => {
        if (shouldRemove(key) && url.startsWith('blob:')) {
          targetUrls.add(url);
        }
      });

      const nextAssets: Record<string, string> = {};
      Object.entries(state.assets).forEach(([key, url]) => {
        if (shouldRemove(key)) return;
        if (targetUrls.has(url)) return;
        nextAssets[key] = url;
      });

      targetUrls.forEach((url) => URL.revokeObjectURL(url));

      return {
        availableFiles: nextAvailableFiles,
        selectedFile: nextSelectedFile,
        allFileContents: nextAllFileContents,
        assets: nextAssets,
      };
    }),

  // Selected file
  selectedFile: null,
  setSelectedFile: (file) => set({ selectedFile: file }),

  // File contents
  allFileContents: {},
  setAllFileContents: (contents) => set({ allFileContents: contents }),
  addFileContent: (path, content) =>
    set((state) => ({
      allFileContents: { ...state.allFileContents, [path]: content },
    })),

  // Motor library
  motorLibrary: DEFAULT_MOTOR_LIBRARY,
  setMotorLibrary: (library) => set({ motorLibrary: library }),
  addMotorSpec: (brand, spec) =>
    set((state) => {
      const existing = state.motorLibrary[brand] || [];
      // Avoid duplicates
      if (existing.some((m) => m.name === spec.name)) {
        return state;
      }
      return {
        motorLibrary: {
          ...state.motorLibrary,
          [brand]: [...existing, spec],
        },
      };
    }),

  // Original content
  originalUrdfContent: '',
  setOriginalUrdfContent: (content) => set({ originalUrdfContent: content }),

  // Original format
  originalFileFormat: null,
  setOriginalFileFormat: (format) => set({ originalFileFormat: format }),

  // Upload helper
  uploadAsset: (file) => {
    const url = URL.createObjectURL(file);
    set((state) => ({
      assets: { ...state.assets, [file.name]: url },
    }));
    return url;
  },

  // Cleanup
  revokeAllAssets: () => {
    Object.values(get().assets).forEach((url) => {
      if (url.startsWith('blob:')) {
        URL.revokeObjectURL(url);
      }
    });
  },
}));
