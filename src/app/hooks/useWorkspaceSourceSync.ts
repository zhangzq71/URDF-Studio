import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { computePreviewUrdf, generateMujocoXML, generateURDF } from '@/core/parsers';
import { resolveMJCFSource } from '@/core/parsers/mjcf/mjcfSourceResolver';
import { DEFAULT_LINK, GeometryType, type AssemblyState, type JointQuaternion, type RobotClosedLoopConstraint, type RobotData, type RobotFile, type RobotState, type UrdfJoint, type UrdfLink } from '@/types';
import { stripTransientJointMotionFromJoints } from '@/shared/utils/robot/semanticSnapshot';
import { getSourceCodeDocumentFlavor, type SourceCodeDocumentFlavor } from '@/app/utils/sourceCodeDisplay';
import {
  createPreviewRobotState,
  createRobotSourceSnapshot,
  getPreferredMjcfContent,
  getPreferredUrdfContent,
} from './workspaceSourceSyncUtils';

export interface JointMotionStateValue {
  angle?: number;
  quaternion?: JointQuaternion;
}

interface UseWorkspaceSourceSyncOptions {
  assemblyState: AssemblyState | null;
  sidebarTab: string;
  getMergedRobotData: () => RobotData | null | undefined;
  selection: RobotState['selection'];
  robotName: string;
  robotLinks: Record<string, UrdfLink>;
  robotJoints: Record<string, UrdfJoint>;
  rootLinkId: string;
  robotMaterials?: RobotState['materials'];
  closedLoopConstraints?: RobotClosedLoopConstraint[];
  isCodeViewerOpen: boolean;
  selectedFile: RobotFile | null;
  availableFiles: RobotFile[];
  allFileContents: Record<string, string>;
  originalUrdfContent: string | null;
  isSelectedUsdHydrating: boolean;
  assets: Record<string, string>;
  getUsdPreparedExportCache: (path: string) => { robotData?: RobotData } | null;
  setSelectedFile: (file: RobotFile | null) => void;
  setAvailableFiles: (files: RobotFile[]) => void;
  setAllFileContents: (contents: Record<string, string>) => void;
  setOriginalUrdfContent: (content: string | null) => void;
}

function areJointSourceCompatible(
  prev: Record<string, UrdfJoint>,
  next: Record<string, UrdfJoint>,
): boolean {
  type ComparableJoint = UrdfJoint & { angle?: number };
  const prevKeys = Object.keys(prev);
  const nextKeys = Object.keys(next);

  if (prevKeys.length !== nextKeys.length) return false;

  for (const key of nextKeys) {
    const prevJoint = prev[key] as ComparableJoint | undefined;
    const nextJoint = next[key] as ComparableJoint | undefined;
    if (!prevJoint || !nextJoint) return false;
    if (prevJoint === nextJoint) continue;

    const comparedKeys = new Set<keyof ComparableJoint>([
      ...(Object.keys(prevJoint) as Array<keyof ComparableJoint>),
      ...(Object.keys(nextJoint) as Array<keyof ComparableJoint>),
    ]);

    for (const comparedKey of comparedKeys) {
      if (comparedKey === 'angle') continue;
      if (prevJoint[comparedKey] !== nextJoint[comparedKey]) {
        return false;
      }
    }
  }

  return true;
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
  robotMaterials,
  closedLoopConstraints,
  isCodeViewerOpen,
  selectedFile,
  availableFiles,
  allFileContents,
  originalUrdfContent,
  isSelectedUsdHydrating,
  assets,
  getUsdPreparedExportCache,
  setSelectedFile,
  setAvailableFiles,
  setAllFileContents,
  setOriginalUrdfContent,
}: UseWorkspaceSourceSyncOptions) {
  const isWorkspaceAssembly = Boolean(assemblyState && sidebarTab === 'workspace');
  const [filePreviewFile, setFilePreviewFile] = useState<RobotFile | null>(null);
  const sourceJointsRef = useRef<Record<string, UrdfJoint>>({});
  const urdfSourceBaselineRef = useRef<{ fileName: string | null; snapshot: string | null }>({
    fileName: null,
    snapshot: null,
  });
  const mjcfViewerBaselineKeyRef = useRef<string | null>(null);
  const mjcfViewerBaselineContentRef = useRef<string | null>(null);
  const sourceCodeDocumentFlavor = useMemo<SourceCodeDocumentFlavor>(
    () => getSourceCodeDocumentFlavor(selectedFile),
    [selectedFile],
  );

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

    if (isSelectedUsdHydrating) {
      return emptyRobot;
    }

    return {
      name: robotName,
      links: robotLinks,
      joints: robotJoints,
      rootLinkId,
      materials: robotMaterials,
      closedLoopConstraints,
      selection,
    };
  }, [closedLoopConstraints, emptyRobot, isSelectedUsdHydrating, isWorkspaceAssembly, mergedRobotData, robotJoints, robotLinks, robotMaterials, robotName, rootLinkId, selection]);

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

  const jointMotionState = useMemo<Record<string, JointMotionStateValue>>(() => {
    const motions: Record<string, JointMotionStateValue> = {};
    Object.values(robot.joints).forEach((joint) => {
      const nextState: JointMotionStateValue = {};
      if (joint.angle !== undefined) {
        nextState.angle = joint.angle;
      }
      if (joint.quaternion) {
        nextState.quaternion = joint.quaternion;
      }
      if (nextState.angle !== undefined || nextState.quaternion) {
        motions[joint.name] = nextState;
      }
    });

    return motions;
  }, [robot.joints]);

  const showVisual = useMemo(() => {
    return Object.values(robot.links).some((link) => link.visible !== false);
  }, [robot.links]);

  const sourceRobotJoints = useMemo(() => {
    if (areJointSourceCompatible(sourceJointsRef.current, robotJoints)) {
      return sourceJointsRef.current;
    }

    const nextSourceJoints = stripTransientJointMotionFromJoints(robotJoints);
    sourceJointsRef.current = nextSourceJoints;
    return nextSourceJoints;
  }, [robotJoints]);

  const currentRobotSourceState = useMemo<RobotState>(() => ({
    name: robotName,
    links: robotLinks,
    joints: sourceRobotJoints,
    rootLinkId,
    materials: robotMaterials,
    closedLoopConstraints,
    selection: { type: null, id: null },
  }), [closedLoopConstraints, robotLinks, robotMaterials, robotName, rootLinkId, sourceRobotJoints]);

  const currentRobotSourceSnapshot = useMemo(
    () => createRobotSourceSnapshot(currentRobotSourceState),
    [currentRobotSourceState],
  );

  const selectedFilePreviewSourceSnapshot = useMemo(() => {
    if (isWorkspaceAssembly || !selectedFile) {
      return null;
    }

    const previewRobotState = createPreviewRobotState(selectedFile, {
      availableFiles,
      assets,
      usdRobotData: getUsdPreparedExportCache(selectedFile.name)?.robotData ?? null,
    });

    if (!previewRobotState) {
      return null;
    }

    return createRobotSourceSnapshot(previewRobotState);
  }, [assets, availableFiles, getUsdPreparedExportCache, isWorkspaceAssembly, selectedFile]);

  useEffect(() => {
    if (isWorkspaceAssembly || !selectedFile || selectedFile.format !== 'urdf') {
      urdfSourceBaselineRef.current = { fileName: null, snapshot: null };
      return;
    }

    if (selectedFilePreviewSourceSnapshot !== currentRobotSourceSnapshot) {
      return;
    }

    if (
      urdfSourceBaselineRef.current.fileName === selectedFile.name
      && urdfSourceBaselineRef.current.snapshot === currentRobotSourceSnapshot
    ) {
      return;
    }

    urdfSourceBaselineRef.current = {
      fileName: selectedFile.name,
      snapshot: currentRobotSourceSnapshot,
    };
  }, [
    currentRobotSourceSnapshot,
    isWorkspaceAssembly,
    selectedFile,
    selectedFilePreviewSourceSnapshot,
  ]);

  const hasUrdfStoreEdits = useMemo(() => {
    if (isWorkspaceAssembly || !selectedFile || selectedFile.format !== 'urdf') {
      return false;
    }

    const baseline = urdfSourceBaselineRef.current;
    if (!baseline.fileName || baseline.fileName !== selectedFile.name) {
      return false;
    }

    return baseline.snapshot !== currentRobotSourceSnapshot;
  }, [currentRobotSourceSnapshot, isWorkspaceAssembly, selectedFile]);

  const generatedUrdfContent = useMemo(() => {
    if (isWorkspaceAssembly || isSelectedUsdHydrating || selectedFile?.format === 'mjcf') {
      return null;
    }

    return generateURDF(currentRobotSourceState, { includeHardware: 'auto' });
  }, [currentRobotSourceState, isSelectedUsdHydrating, isWorkspaceAssembly, selectedFile?.format]);

  const viewerUrdfContent = useMemo(() => {
    if (isWorkspaceAssembly || isSelectedUsdHydrating || selectedFile?.format === 'mjcf') {
      return null;
    }

    return getPreferredUrdfContent({
      fileContent: selectedFile?.format === 'urdf' ? selectedFile.content : null,
      originalContent: originalUrdfContent,
      generatedContent: generateURDF(currentRobotSourceState, { preserveMeshPaths: true }),
      hasStoreEdits: selectedFile?.format === 'urdf' ? hasUrdfStoreEdits : true,
    });
  }, [currentRobotSourceState, hasUrdfStoreEdits, isSelectedUsdHydrating, isWorkspaceAssembly, originalUrdfContent, selectedFile]);

  const generatedMjcfContent = useMemo(() => {
    const shouldGenerateMjcfSource = !isWorkspaceAssembly && !isSelectedUsdHydrating && (
      selectedFile?.format === 'mjcf'
      || (isCodeViewerOpen && sourceCodeDocumentFlavor === 'equivalent-mjcf')
    );

    if (!shouldGenerateMjcfSource) {
      return null;
    }

    return generateMujocoXML(currentRobotSourceState, {
      meshdir: 'meshes/',
      includeSceneHelpers: false,
    });
  }, [currentRobotSourceState, isCodeViewerOpen, isSelectedUsdHydrating, isWorkspaceAssembly, selectedFile?.format, sourceCodeDocumentFlavor]);

  const resolvedMjcfSource = useMemo(() => {
    if (!selectedFile || selectedFile.format !== 'mjcf') {
      return null;
    }

    return resolveMJCFSource(selectedFile, availableFiles);
  }, [availableFiles, selectedFile]);

  const mjcfViewerBaselineKey = useMemo(
    () => (selectedFile?.format === 'mjcf'
      ? `${selectedFile.name}\u0000${resolvedMjcfSource?.content ?? selectedFile.content}`
      : null),
    [resolvedMjcfSource?.content, selectedFile],
  );

  useEffect(() => {
    if (!mjcfViewerBaselineKey) {
      mjcfViewerBaselineKeyRef.current = null;
      mjcfViewerBaselineContentRef.current = null;
      return;
    }

    if (mjcfViewerBaselineKeyRef.current !== mjcfViewerBaselineKey) {
      mjcfViewerBaselineKeyRef.current = mjcfViewerBaselineKey;
      mjcfViewerBaselineContentRef.current = null;
    }

    if (
      !generatedMjcfContent
      || selectedFilePreviewSourceSnapshot !== currentRobotSourceSnapshot
      || mjcfViewerBaselineContentRef.current !== null
    ) {
      return;
    }

    mjcfViewerBaselineContentRef.current = generatedMjcfContent;
  }, [
    currentRobotSourceSnapshot,
    generatedMjcfContent,
    mjcfViewerBaselineKey,
    selectedFilePreviewSourceSnapshot,
  ]);

  const hasMjcfViewerEdits = useMemo(() => {
    if (!mjcfViewerBaselineKey || !generatedMjcfContent) {
      return false;
    }

    if (mjcfViewerBaselineKeyRef.current !== mjcfViewerBaselineKey) {
      return false;
    }

    if (mjcfViewerBaselineContentRef.current === null) {
      return false;
    }

    return mjcfViewerBaselineContentRef.current !== generatedMjcfContent;
  }, [generatedMjcfContent, mjcfViewerBaselineKey]);

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
      return getPreferredUrdfContent({
        fileContent: selectedFile.content,
        originalContent: originalUrdfContent,
        generatedContent: generatedUrdfContent,
        hasStoreEdits: hasUrdfStoreEdits,
      });
    }

    if (selectedFile.format === 'mjcf' && isCodeViewerOpen) {
      return getPreferredMjcfContent({
        sourceContent: selectedFile.content,
        generatedContent: generatedMjcfContent,
        hasViewerEdits: hasMjcfViewerEdits,
      });
    }

    if (selectedFile.format === 'usd' && sourceCodeDocumentFlavor === 'equivalent-mjcf' && isCodeViewerOpen) {
      return generatedMjcfContent;
    }

    return null;
  }, [
    generatedMjcfContent,
    generatedUrdfContent,
    hasMjcfViewerEdits,
    hasUrdfStoreEdits,
    isCodeViewerOpen,
    isWorkspaceAssembly,
    originalUrdfContent,
    resolvedMjcfSource,
    selectedFile,
    sourceCodeDocumentFlavor,
  ]);

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

    if (selectedFile?.format === 'usd' && isSelectedUsdHydrating) {
      return selectedFile.content ?? '';
    }

    if (selectedFile?.format === 'mjcf') {
      const sourceMjcfContent = resolvedMjcfSource?.content ?? selectedFile.content;

      if (!hasMjcfViewerEdits) {
        return sourceMjcfContent;
      }

      return generatedMjcfContent ?? sourceMjcfContent;
    }

    return viewerUrdfContent ?? generateURDF(currentRobotSourceState, { preserveMeshPaths: true });
  }, [
    currentRobotSourceState,
    generatedMjcfContent,
    hasMjcfViewerEdits,
    isSelectedUsdHydrating,
    isWorkspaceAssembly,
    resolvedMjcfSource,
    selectedFile,
    viewerUrdfContent,
    workspaceViewerContent,
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
    if (!selectedFile || selectedFile.format !== 'urdf' || !generatedUrdfContent || !hasUrdfStoreEdits) {
      return;
    }

    syncTextFileContent(selectedFile.name, generatedUrdfContent);
  }, [generatedUrdfContent, hasUrdfStoreEdits, selectedFile, syncTextFileContent]);

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
        generatedComponentSources.set(sourceFile.name, generateURDF(sourceRobotState, { includeHardware: 'auto' }));
      }

      if (sourceFile.format === 'mjcf') {
        generatedComponentSources.set(sourceFile.name, generateMujocoXML(sourceRobotState, { meshdir: 'meshes/' }));
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

  const previewRobot = useMemo(() => {
    if (!filePreviewFile) {
      return null;
    }

    return createPreviewRobotState(filePreviewFile, {
      availableFiles,
      assets,
      usdRobotData: getUsdPreparedExportCache(filePreviewFile.name)?.robotData ?? null,
    });
  }, [assets, availableFiles, filePreviewFile, getUsdPreparedExportCache]);

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
    jointMotionState,
    showVisual,
    urdfContentForViewer,
    viewerSourceFilePath,
    filePreview,
    previewRobot,
    previewFileName: filePreviewFile?.name,
    sourceCodeContent,
    sourceCodeDocumentFlavor,
    handlePreviewFile,
    handleClosePreview,
  };
}
