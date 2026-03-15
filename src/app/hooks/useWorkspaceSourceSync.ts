import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { computePreviewUrdf, generateMujocoXML, generateURDF } from '@/core/parsers';
import { resolveMJCFSource } from '@/core/parsers/mjcf/mjcfSourceResolver';
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
  isCodeViewerOpen: boolean;
  selectedFile: RobotFile | null;
  availableFiles: RobotFile[];
  allFileContents: Record<string, string>;
  originalUrdfContent: string | null;
  setSelectedFile: (file: RobotFile | null) => void;
  setAvailableFiles: (files: RobotFile[]) => void;
  setAllFileContents: (contents: Record<string, string>) => void;
  setOriginalUrdfContent: (content: string | null) => void;
}

function areJointSourceCompatible(
  prev: Record<string, UrdfJoint>,
  next: Record<string, UrdfJoint>,
): boolean {
  const prevKeys = Object.keys(prev);
  const nextKeys = Object.keys(next);

  if (prevKeys.length !== nextKeys.length) return false;

  for (const key of nextKeys) {
    const prevJoint = prev[key] as (UrdfJoint & { angle?: number }) | undefined;
    const nextJoint = next[key] as (UrdfJoint & { angle?: number }) | undefined;
    if (!prevJoint || !nextJoint) return false;
    if (prevJoint === nextJoint) continue;

    const comparedKeys = new Set([
      ...Object.keys(prevJoint),
      ...Object.keys(nextJoint),
    ]);

    for (const comparedKey of comparedKeys) {
      if (comparedKey === 'angle') continue;
      if ((prevJoint as Record<string, unknown>)[comparedKey] !== (nextJoint as Record<string, unknown>)[comparedKey]) {
        return false;
      }
    }
  }

  return true;
}

function stripTransientJointState(joints: Record<string, UrdfJoint>): Record<string, UrdfJoint> {
  return Object.fromEntries(
    Object.entries(joints).map(([jointId, joint]) => {
      const { angle: _angle, ...sourceJoint } = joint as UrdfJoint & { angle?: number };
      return [jointId, sourceJoint as UrdfJoint];
    }),
  );
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
  isCodeViewerOpen,
  selectedFile,
  availableFiles,
  allFileContents,
  originalUrdfContent,
  setSelectedFile,
  setAvailableFiles,
  setAllFileContents,
  setOriginalUrdfContent,
}: UseWorkspaceSourceSyncOptions) {
  const isWorkspaceAssembly = Boolean(assemblyState && sidebarTab === 'workspace');
  const [filePreviewFile, setFilePreviewFile] = useState<RobotFile | null>(null);
  const sourceJointsRef = useRef<Record<string, UrdfJoint>>({});

  const mergedRobotData = useMemo(() => {
    if (!isWorkspaceAssembly) return null;
    return getMergedRobotData() ?? null;
  }, [assemblyState, getMergedRobotData, isWorkspaceAssembly]);

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

  const sourceRobotJoints = useMemo(() => {
    if (areJointSourceCompatible(sourceJointsRef.current, robotJoints)) {
      return sourceJointsRef.current;
    }

    const nextSourceJoints = stripTransientJointState(robotJoints);
    sourceJointsRef.current = nextSourceJoints;
    return nextSourceJoints;
  }, [robotJoints]);

  const currentRobotSourceState = useMemo<RobotState>(() => ({
    name: robotName,
    links: robotLinks,
    joints: sourceRobotJoints,
    rootLinkId,
    selection: { type: null, id: null },
  }), [robotLinks, robotName, rootLinkId, sourceRobotJoints]);

  const generatedUrdfContent = useMemo(() => {
    if (isWorkspaceAssembly || selectedFile?.format === 'mjcf') {
      return null;
    }

    return generateURDF(currentRobotSourceState, false);
  }, [currentRobotSourceState, isWorkspaceAssembly, selectedFile?.format]);

  const viewerUrdfContent = useMemo(() => {
    if (isWorkspaceAssembly || selectedFile?.format === 'mjcf') {
      return null;
    }

    return generateURDF(currentRobotSourceState, { preserveMeshPaths: true });
  }, [currentRobotSourceState, isWorkspaceAssembly, selectedFile?.format]);

  const generatedMjcfContent = useMemo(() => {
    if (isWorkspaceAssembly || selectedFile?.format !== 'mjcf') {
      return null;
    }

    return generateMujocoXML(currentRobotSourceState, { meshdir: 'meshes/' });
  }, [currentRobotSourceState, isWorkspaceAssembly, selectedFile?.format]);

  const resolvedMjcfSource = useMemo(() => {
    if (!selectedFile || selectedFile.format !== 'mjcf') {
      return null;
    }

    return resolveMJCFSource(selectedFile, availableFiles);
  }, [availableFiles, selectedFile]);

  const workspaceViewerContent = useMemo(() => {
    if (!isWorkspaceAssembly) {
      return null;
    }

    return generateURDF({
      ...(mergedRobotData ?? emptyRobot),
      selection: { type: null, id: null },
    }, { preserveMeshPaths: true });
  }, [emptyRobot, isWorkspaceAssembly, mergedRobotData]);

  const syncedSourceContent = useMemo(() => {
    if (!selectedFile || isWorkspaceAssembly) {
      return null;
    }

    if (selectedFile.format === 'urdf') {
      return generatedUrdfContent;
    }

    if (selectedFile.format === 'mjcf' && isCodeViewerOpen) {
      return generatedMjcfContent;
    }

    return null;
  }, [generatedMjcfContent, generatedUrdfContent, isCodeViewerOpen, isWorkspaceAssembly, selectedFile]);

  const syncTextFileContent = useCallback((
    fileName: string,
    content: string,
    options: { syncOriginalContent?: boolean } = {},
  ) => {
    const { syncOriginalContent = false } = options;

    if (selectedFile?.name === fileName && selectedFile.content !== content) {
      setSelectedFile({
        ...selectedFile,
        content,
      });
    }

    const needsAvailableFileSync = availableFiles.some(
      (file) => file.name === fileName && file.content !== content,
    );

    if (needsAvailableFileSync) {
      setAvailableFiles(
        availableFiles.map((file) =>
          file.name === fileName
            ? { ...file, content }
            : file,
        ),
      );
    }

    if (allFileContents[fileName] !== content) {
      setAllFileContents({
        ...allFileContents,
        [fileName]: content,
      });
    }

    if (syncOriginalContent && originalUrdfContent !== content) {
      setOriginalUrdfContent(content);
    }
  }, [
    allFileContents,
    availableFiles,
    originalUrdfContent,
    selectedFile,
    setAllFileContents,
    setAvailableFiles,
    setOriginalUrdfContent,
    setSelectedFile,
  ]);

  const urdfContentForViewer = useMemo(() => {
    if (isWorkspaceAssembly) {
      return workspaceViewerContent!;
    }

    if (selectedFile?.format === 'mjcf') {
      return resolvedMjcfSource?.content ?? selectedFile.content;
    }

    return viewerUrdfContent ?? generateURDF(currentRobotSourceState, { preserveMeshPaths: true });
  }, [
    availableFiles,
    emptyRobot,
    isWorkspaceAssembly,
    mergedRobotData,
    resolvedMjcfSource,
    selectedFile,
    viewerUrdfContent,
    workspaceViewerContent,
    currentRobotSourceState,
  ]);

  const viewerSourceFilePath = useMemo(() => {
    if (isWorkspaceAssembly) {
      return undefined;
    }

    if (selectedFile?.format === 'mjcf') {
      return resolvedMjcfSource?.effectiveFile.name ?? selectedFile.name;
    }

    return selectedFile?.name;
  }, [isWorkspaceAssembly, resolvedMjcfSource, selectedFile]);

  useEffect(() => {
    if (!selectedFile) {
      return;
    }

    if (selectedFile.format === 'urdf' && generatedUrdfContent) {
      syncTextFileContent(selectedFile.name, generatedUrdfContent, { syncOriginalContent: true });
    }
  }, [generatedUrdfContent, selectedFile, syncTextFileContent]);

  useEffect(() => {
    if (!isWorkspaceAssembly || !assemblyState) {
      return;
    }

    const generatedComponentSources = new Map<string, string>();

    Object.values(assemblyState.components).forEach((component) => {
      const sourceFile = availableFiles.find((file) => file.name === component.sourceFile);
      if (!sourceFile) return;

      const sourceRobotState: RobotState = {
        ...component.robot,
        selection: { type: null, id: null },
      };

      if (sourceFile.format === 'urdf') {
        generatedComponentSources.set(sourceFile.name, generateURDF(sourceRobotState, false));
      }
    });

    if (generatedComponentSources.size === 0) {
      return;
    }

    let nextAvailableFiles: RobotFile[] | null = null;
    let nextAllFileContents: Record<string, string> | null = null;
    let nextSelectedFile: RobotFile | null = null;

    for (const [fileName, content] of generatedComponentSources) {
      if (selectedFile?.name === fileName && selectedFile.content !== content) {
        nextSelectedFile = {
          ...selectedFile,
          content,
        };
      }

      if (availableFiles.some((file) => file.name === fileName && file.content !== content)) {
        const baseFiles = nextAvailableFiles ?? availableFiles;
        nextAvailableFiles = baseFiles.map((file) =>
          file.name === fileName
            ? { ...file, content }
            : file,
        );
      }

      if (allFileContents[fileName] !== content) {
        nextAllFileContents = {
          ...(nextAllFileContents ?? allFileContents),
          [fileName]: content,
        };
      }
    }

    if (nextSelectedFile) {
      setSelectedFile(nextSelectedFile);
    }

    if (nextAvailableFiles) {
      setAvailableFiles(nextAvailableFiles);
    }

    if (nextAllFileContents) {
      setAllFileContents(nextAllFileContents);
    }
  }, [
    allFileContents,
    assemblyState,
    availableFiles,
    isWorkspaceAssembly,
    selectedFile,
    setAllFileContents,
    setAvailableFiles,
    setSelectedFile,
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
    viewerSourceFilePath,
    filePreview,
    previewFileName: filePreviewFile?.name,
    sourceCodeContent,
    handlePreviewFile,
    handleClosePreview,
  };
}
