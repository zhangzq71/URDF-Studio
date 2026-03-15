import { useCallback } from 'react';
import { exportLibraryRobotFile } from '@/features/file-io';
import type { AssemblyState, RobotData, RobotFile } from '@/types';

type EmptyRobotState = Pick<RobotData, 'links' | 'joints' | 'rootLinkId'>;

interface UseLibraryFileActionsParams {
  assets: Record<string, string>;
  availableFiles: RobotFile[];
  selectedFile: RobotFile | null;
  assemblyState: AssemblyState | null;
  emptyRobot: EmptyRobotState;
  removeComponent: (id: string) => void;
  removeRobotFile: (path: string) => void;
  removeRobotFolder: (path: string) => void;
  clearRobotLibrary: () => void;
  resetRobot: (data: { name: string } & EmptyRobotState) => void;
  clearSelection: () => void;
  uploadAsset: (file: File) => void;
  showToast: (message: string, type?: 'info' | 'success') => void;
  t: Record<string, string>;
}

export function useLibraryFileActions({
  assets,
  availableFiles,
  selectedFile,
  assemblyState,
  emptyRobot,
  removeComponent,
  removeRobotFile,
  removeRobotFolder,
  clearRobotLibrary,
  resetRobot,
  clearSelection,
  uploadAsset,
  showToast,
  t,
}: UseLibraryFileActionsParams) {
  const handleUploadAsset = useCallback((file: File) => {
    uploadAsset(file);
  }, [uploadAsset]);

  const clearLoadedModel = useCallback(() => {
    resetRobot({
      name: '',
      links: emptyRobot.links,
      joints: emptyRobot.joints,
      rootLinkId: emptyRobot.rootLinkId,
    });
    clearSelection();
  }, [clearSelection, emptyRobot, resetRobot]);

  const isPathInFolder = useCallback((path: string, folderPath: string) => {
    const normalized = folderPath.replace(/\/+$/, '');
    return path === normalized || path.startsWith(`${normalized}/`);
  }, []);

  const handleDeleteLibraryFile = useCallback((file: RobotFile) => {
    const isCurrentModel = selectedFile?.name === file.name;
    const relatedComponentIds = assemblyState
      ? Object.values(assemblyState.components)
          .filter((component) => component.sourceFile === file.name)
          .map((component) => component.id)
      : [];

    removeRobotFile(file.name);
    relatedComponentIds.forEach((componentId) => removeComponent(componentId));
    if (isCurrentModel) {
      clearLoadedModel();
    }

    const fileLabel = file.name.split('/').pop() ?? file.name;
    showToast(
      t.removedFromAssetLibrary.replace('{name}', fileLabel),
      'success',
    );
  }, [
    assemblyState,
    clearLoadedModel,
    removeComponent,
    removeRobotFile,
    selectedFile?.name,
    showToast,
    t,
  ]);

  const handleDeleteLibraryFolder = useCallback((folderPath: string) => {
    const normalizedFolder = folderPath.replace(/\/+$/, '');
    if (!normalizedFolder) return;

    const isCurrentModel = selectedFile?.name
      ? isPathInFolder(selectedFile.name, normalizedFolder)
      : false;
    const relatedComponentIds = assemblyState
      ? Object.values(assemblyState.components)
          .filter((component) => isPathInFolder(component.sourceFile, normalizedFolder))
          .map((component) => component.id)
      : [];

    removeRobotFolder(normalizedFolder);
    relatedComponentIds.forEach((componentId) => removeComponent(componentId));
    if (isCurrentModel) {
      clearLoadedModel();
    }

    showToast(
      t.removedFolder.replace('{path}', normalizedFolder),
      'success',
    );
  }, [
    assemblyState,
    clearLoadedModel,
    isPathInFolder,
    removeComponent,
    removeRobotFolder,
    selectedFile?.name,
    showToast,
    t,
  ]);

  const handleDeleteAllLibraryFiles = useCallback(() => {
    if (availableFiles.length === 0) return;

    const availableFileNames = new Set(availableFiles.map((file) => file.name));
    const shouldClearCurrentModel = selectedFile?.name
      ? availableFileNames.has(selectedFile.name)
      : false;
    const relatedComponentIds = assemblyState
      ? Object.values(assemblyState.components)
          .filter((component) => availableFileNames.has(component.sourceFile))
          .map((component) => component.id)
      : [];

    relatedComponentIds.forEach((componentId) => removeComponent(componentId));

    if (shouldClearCurrentModel) {
      clearLoadedModel();
    }

    clearRobotLibrary();

    showToast(
      t.deletedAllLibraryFiles.replace('{count}', String(availableFiles.length)),
      'success',
    );
  }, [
    assemblyState,
    availableFiles,
    clearLoadedModel,
    clearRobotLibrary,
    removeComponent,
    selectedFile?.name,
    showToast,
    t,
  ]);

  const handleExportLibraryFile = useCallback(async (file: RobotFile, format: 'urdf' | 'mjcf') => {
    const result = await exportLibraryRobotFile({
      file,
      targetFormat: format,
      assets,
    });

    if (!result.success) {
      if (result.reason === 'unsupported-file-format') {
        showToast(t.onlyUrdfMjcfExport, 'info');
        return;
      }

      showToast(t.exportFailedParse, 'info');
      return;
    }

    if (result.missingMeshPaths.length > 0) {
      showToast(
        t.exportedWithMissingMeshes.replace('{count}', String(result.missingMeshPaths.length)),
        'info',
      );
      return;
    }

    showToast(
      t.exportedSuccess.replace('{name}', result.zipFileName ?? ''),
      'success',
    );
  }, [assets, showToast, t]);

  return {
    handleUploadAsset,
    handleDeleteLibraryFile,
    handleDeleteLibraryFolder,
    handleDeleteAllLibraryFiles,
    handleExportLibraryFile,
  };
}
