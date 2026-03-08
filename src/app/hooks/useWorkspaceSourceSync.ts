import { useCallback, useEffect, useMemo, useState } from 'react';
import { computePreviewUrdf, generateMujocoXML, generateURDF } from '@/core/parsers';
import { DEFAULT_LINK, GeometryType, type AssemblyState, type RobotData, type RobotFile, type RobotState, type UrdfJoint, type UrdfLink } from '@/types';

interface UseWorkspaceSourceSyncOptions {
  assemblyState: AssemblyState | null;
  sidebarTab: string;
  getMergedRobotData: () => RobotData | null | undefined;
  selection: RobotState['selection'];
  robotName: string;
  robotLinks: Record<string, UrdfLink>;
  robotJoints: Record<string, UrdfJoint>;
  rootLinkId: string;
  selectedFile: RobotFile | null;
  availableFiles: RobotFile[];
  originalUrdfContent: string | null;
  setSelectedFile: (file: RobotFile | null) => void;
  setAvailableFiles: (files: RobotFile[]) => void;
  setOriginalUrdfContent: (content: string | null) => void;
}

export function useWorkspaceSourceSync({
  assemblyState,
  sidebarTab,
  getMergedRobotData,
  selection,
  robotName,
  robotLinks,
  robotJoints,
  rootLinkId,
  selectedFile,
  availableFiles,
  originalUrdfContent,
  setSelectedFile,
  setAvailableFiles,
  setOriginalUrdfContent,
}: UseWorkspaceSourceSyncOptions) {
  const isWorkspaceAssembly = Boolean(assemblyState && sidebarTab === 'workspace');
  const [filePreviewFile, setFilePreviewFile] = useState<RobotFile | null>(null);

  const mergedRobotData = useMemo(() => {
    if (!isWorkspaceAssembly) return null;
    return getMergedRobotData() ?? null;
  }, [getMergedRobotData, isWorkspaceAssembly]);

  const emptyRobot = useMemo<RobotState>(() => ({
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
  }), []);

  const robot = useMemo<RobotState>(() => {
    if (isWorkspaceAssembly) {
      if (mergedRobotData) {
        return { ...mergedRobotData, selection };
      }

      return emptyRobot;
    }

    return {
      name: robotName,
      links: robotLinks,
      joints: robotJoints,
      rootLinkId,
      selection,
    };
  }, [emptyRobot, isWorkspaceAssembly, mergedRobotData, robotJoints, robotLinks, robotName, rootLinkId, selection]);

  const jointAngleState = useMemo(() => {
    const angles: Record<string, number> = {};
    Object.values(robot.joints).forEach((joint) => {
      const angle = (joint as UrdfJoint & { angle?: number }).angle;
      if (angle !== undefined) {
        angles[joint.name] = angle;
      }
    });

    return angles;
  }, [robot.joints]);

  const showVisual = useMemo(() => {
    return Object.values(robot.links).some((link) => link.visible !== false);
  }, [robot.links]);

  const urdfContentForViewer = useMemo(() => {
    if (isWorkspaceAssembly) {
      return generateURDF({
        ...(mergedRobotData ?? emptyRobot),
        selection: { type: null, id: null },
      }, false);
    }

    return generateURDF({
      name: robotName,
      links: robotLinks,
      joints: robotJoints,
      rootLinkId,
      selection: { type: null, id: null },
    }, false);
  }, [emptyRobot, isWorkspaceAssembly, mergedRobotData, robotJoints, robotLinks, robotName, rootLinkId]);

  const currentRobotSourceState = useMemo<RobotState>(() => ({
    name: robotName,
    links: robotLinks,
    joints: robotJoints,
    rootLinkId,
    selection: { type: null, id: null },
  }), [robotJoints, robotLinks, robotName, rootLinkId]);

  const syncedSourceContent = useMemo(() => {
    if (!selectedFile || isWorkspaceAssembly) {
      return null;
    }

    if (selectedFile.format === 'urdf') {
      return generateURDF(currentRobotSourceState, false);
    }

    if (selectedFile.format === 'mjcf') {
      return generateMujocoXML(currentRobotSourceState, { meshdir: 'meshes/' });
    }

    return null;
  }, [currentRobotSourceState, isWorkspaceAssembly, selectedFile]);

  useEffect(() => {
    if (!selectedFile || !syncedSourceContent) {
      return;
    }

    if (selectedFile.content !== syncedSourceContent) {
      setSelectedFile({
        ...selectedFile,
        content: syncedSourceContent,
      });
    }

    const needsAvailableFileSync = availableFiles.some(
      (file) => file.name === selectedFile.name && file.content !== syncedSourceContent,
    );

    if (needsAvailableFileSync) {
      setAvailableFiles(
        availableFiles.map((file) =>
          file.name === selectedFile.name
            ? { ...file, content: syncedSourceContent }
            : file,
        ),
      );
    }

    if (selectedFile.format === 'urdf' && originalUrdfContent !== syncedSourceContent) {
      setOriginalUrdfContent(syncedSourceContent);
    }
  }, [
    availableFiles,
    originalUrdfContent,
    selectedFile,
    setAvailableFiles,
    setOriginalUrdfContent,
    setSelectedFile,
    syncedSourceContent,
  ]);

  const filePreview = useMemo(() => {
    if (!filePreviewFile) return undefined;
    const urdf = computePreviewUrdf(filePreviewFile, availableFiles);
    return urdf != null
      ? { urdfContent: urdf, fileName: filePreviewFile.name }
      : undefined;
  }, [availableFiles, filePreviewFile]);

  const sourceCodeContent = syncedSourceContent ?? (selectedFile ? selectedFile.content : urdfContentForViewer);

  const handlePreviewFile = useCallback((file: RobotFile) => {
    setFilePreviewFile(file);
  }, []);

  const handleClosePreview = useCallback(() => {
    setFilePreviewFile(null);
  }, []);

  useEffect(() => {
    if (!filePreviewFile) return;
    const exists = availableFiles.some((file) => file.name === filePreviewFile.name);
    if (!exists) {
      setFilePreviewFile(null);
    }
  }, [availableFiles, filePreviewFile]);

  return {
    isWorkspaceAssembly,
    mergedRobotData,
    emptyRobot,
    robot,
    jointAngleState,
    showVisual,
    urdfContentForViewer,
    filePreview,
    previewFileName: filePreviewFile?.name,
    sourceCodeContent,
    handlePreviewFile,
    handleClosePreview,
  };
}
