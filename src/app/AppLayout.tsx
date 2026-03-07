/**
 * App Layout Component
 * Main application layout with Header and workspace area
 */
import React, { useRef, useMemo, useCallback, useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Header } from './components/Header';
import { UnifiedViewer } from './components/UnifiedViewer';
import { TreeEditor } from '@/features/robot-tree';
import { PropertyEditor } from '@/features/property-editor';
import { SourceCodeEditor, preloadSourceCodeEditor } from '@/features/code-editor';
import { BridgeCreateModal } from '@/features/assembly';
import { useUIStore, useSelectionStore, useAssetsStore, useRobotStore, useCanUndo, useCanRedo, useAssemblyStore } from '@/store';
import { parseURDF, generateMujocoXML, generateURDF } from '@/core/parsers';
import { getDroppedFiles, exportLibraryRobotFile } from '@/features/file-io/utils';
import type { RobotState, UrdfLink, UrdfJoint, RobotFile, AssemblyState } from '@/types';
import { DEFAULT_LINK, GeometryType } from '@/types';
import { appendCollisionBody, optimizeCylinderCollisionsToCapsules } from '@/core/robot';
import { computePreviewUrdf } from '@/core/parsers';

interface AppLayoutProps {
  // Import handlers (passed from App)
  importInputRef: React.RefObject<HTMLInputElement>;
  importFolderInputRef: React.RefObject<HTMLInputElement>;
  onFileDrop: (files: File[]) => void;
  onOpenExport: () => void;
  onExportProject: () => void;
  // Toast handler
  showToast: (message: string, type?: 'info' | 'success') => void;
  // Modal handlers
  onOpenAI: () => void;
  isCodeViewerOpen: boolean;
  setIsCodeViewerOpen: (open: boolean) => void;
  onOpenSettings: () => void;
  onOpenAbout: () => void;
  onOpenURDFGallery: () => void;
  // View config
  viewConfig: {
    showToolbar: boolean;
    showOptionsPanel: boolean;
    showSkeletonOptionsPanel: boolean;
    showJointPanel: boolean;
  };
  setViewConfig: React.Dispatch<React.SetStateAction<{
    showToolbar: boolean;
    showOptionsPanel: boolean;
    showSkeletonOptionsPanel: boolean;
    showJointPanel: boolean;
  }>>;
  // Robot file handling
  onLoadRobot: (file: RobotFile) => void;
}

export function AppLayout({
  importInputRef,
  importFolderInputRef,
  onFileDrop,
  onOpenExport,
  onExportProject,
  showToast,
  onOpenAI,
  isCodeViewerOpen,
  setIsCodeViewerOpen,
  onOpenSettings,
  onOpenAbout,
  onOpenURDFGallery,
  viewConfig,
  setViewConfig,
  onLoadRobot,
}: AppLayoutProps) {
  // UI Store (grouped with useShallow to reduce subscriptions)
  const { appMode, lang, theme, sidebar, toggleSidebar, sidebarTab } = useUIStore(
    useShallow((state) => ({
      appMode: state.appMode,
      lang: state.lang,
      theme: state.theme,
      sidebar: state.sidebar,
      toggleSidebar: state.toggleSidebar,
      sidebarTab: state.sidebarTab,
    }))
  );

  // Selection Store
  const { selection, setSelection, hoveredSelection, setHoveredSelection, focusTarget, focusOn } = useSelectionStore(
    useShallow((state) => ({
      selection: state.selection,
      setSelection: state.setSelection,
      hoveredSelection: state.hoveredSelection,
      setHoveredSelection: state.setHoveredSelection,
      focusTarget: state.focusTarget,
      focusOn: state.focusOn,
    }))
  );

  // Assets Store
  const {
    assets, motorLibrary, availableFiles, selectedFile,
    setAvailableFiles, setSelectedFile, originalUrdfContent, setOriginalUrdfContent,
    uploadAsset, removeRobotFile, removeRobotFolder,
  } = useAssetsStore(
    useShallow((state) => ({
      assets: state.assets,
      motorLibrary: state.motorLibrary,
      availableFiles: state.availableFiles,
      selectedFile: state.selectedFile,
      setAvailableFiles: state.setAvailableFiles,
      setSelectedFile: state.setSelectedFile,
      originalUrdfContent: state.originalUrdfContent,
      setOriginalUrdfContent: state.setOriginalUrdfContent,
      uploadAsset: state.uploadAsset,
      removeRobotFile: state.removeRobotFile,
      removeRobotFolder: state.removeRobotFolder,
    }))
  );

  // Robot Store
  const {
    robotName, robotLinks, robotJoints, rootLinkId, robotMaterials,
    setName, setRobot, resetRobot, addChild, deleteSubtree,
    updateLink, updateJoint, setAllLinksVisibility, setJointAngle, undo, redo,
  } = useRobotStore(
    useShallow((state) => ({
      robotName: state.name,
      robotLinks: state.links,
      robotJoints: state.joints,
      rootLinkId: state.rootLinkId,
      robotMaterials: state.materials,
      setName: state.setName,
      setRobot: state.setRobot,
      resetRobot: state.resetRobot,
      addChild: state.addChild,
      deleteSubtree: state.deleteSubtree,
      updateLink: state.updateLink,
      updateJoint: state.updateJoint,
      setAllLinksVisibility: state.setAllLinksVisibility,
      setJointAngle: state.setJointAngle,
      undo: state.undo,
      redo: state.redo,
    }))
  );
  const canUndo = useCanUndo();
  const canRedo = useCanRedo();

  // Assembly Store
  const {
    assemblyState, addComponent, removeComponent,
    addBridge, removeBridge, getMergedRobotData,
    updateComponentName, updateComponentRobot,
  } = useAssemblyStore(
    useShallow((state) => ({
      assemblyState: state.assemblyState,
      addComponent: state.addComponent,
      removeComponent: state.removeComponent,
      addBridge: state.addBridge,
      removeBridge: state.removeBridge,
      getMergedRobotData: state.getMergedRobotData,
      updateComponentName: state.updateComponentName,
      updateComponentRobot: state.updateComponentRobot,
    }))
  );

  // Snapshot ref
  const snapshotActionRef = useRef<(() => void) | null>(null);
  const transformPendingRef = useRef(false);
  const [isBridgeModalOpen, setIsBridgeModalOpen] = useState(false);
  const isWorkspaceAssembly = Boolean(assemblyState && sidebarTab === 'workspace');

  // File preview (rendered inside the main WorkspaceCanvas instead of a separate window)
  const [filePreviewFile, setFilePreviewFile] = useState<RobotFile | null>(null);

  // Merged robot data for assembly mode
  const mergedRobotData = useMemo(() => {
    if (!isWorkspaceAssembly) return null;
    return getMergedRobotData();
  }, [isWorkspaceAssembly, assemblyState, getMergedRobotData]);

  // Construct robot object for legacy components
  // Pro mode: use merged assembly data, or empty robot if no components
  // Simple mode: use robotStore data
  const emptyRobot: RobotState = useMemo(() => ({
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

  const robot: RobotState = useMemo(() => {
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
  }, [robotName, robotLinks, robotJoints, rootLinkId, selection, isWorkspaceAssembly, mergedRobotData, emptyRobot]);

  // Joint angle state for URDFViewer
  const jointAngleState = useMemo(() => {
    const angles: Record<string, number> = {};
    Object.values(robot.joints).forEach((joint) => {
      const angle = (joint as { angle?: number }).angle;
      if (angle !== undefined) {
        angles[joint.name] = angle;
      }
    });
    return angles;
  }, [robot.joints]);

  // Show visual computed from links
  const showVisual = useMemo(() => {
    return Object.values(robot.links).some(l => l.visible !== false);
  }, [robot.links]);

  // URDF content for viewer
  // Always use generated URDF to reflect user modifications in real-time
  // This ensures collision geometry and other property changes are immediately visible
  // NOTE: Depends on links/joints only (not name) to avoid re-rendering on name input
  const urdfContentForViewer = useMemo(() => {
    if (isWorkspaceAssembly) {
      if (mergedRobotData) {
        return generateURDF(mergedRobotData as unknown as RobotState, false);
      }
      // Pro mode with no components: empty URDF
      return generateURDF(emptyRobot, false);
    }
    return generateURDF({
      name: robotName,
      links: robotLinks,
      joints: robotJoints,
      rootLinkId,
      selection: { type: null, id: null },
    }, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [robotName, robotLinks, robotJoints, rootLinkId, emptyRobot, isWorkspaceAssembly, mergedRobotData]);

  // File preview: compute URDF from the selected preview file
  const filePreview = useMemo(() => {
    if (!filePreviewFile) return undefined;
    const urdf = computePreviewUrdf(filePreviewFile, availableFiles);
    return urdf != null
      ? { urdfContent: urdf, fileName: filePreviewFile.name }
      : undefined;
  }, [filePreviewFile, availableFiles]);

  const handlePreviewFile = useCallback((file: RobotFile) => {
    setFilePreviewFile(file);
  }, []);

  const handleClosePreview = useCallback(() => {
    setFilePreviewFile(null);
  }, []);

  // Auto-close preview when the previewed file is removed from availableFiles
  useEffect(() => {
    if (!filePreviewFile) return;
    const exists = availableFiles.some((f) => f.name === filePreviewFile.name);
    if (!exists) setFilePreviewFile(null);
  }, [availableFiles, filePreviewFile]);

  // Handlers
  const handleSelect = useCallback((type: 'link' | 'joint', id: string, subType?: 'visual' | 'collision') => {
    if (transformPendingRef.current) return;
    setSelection({ type, id, subType });
  }, [setSelection]);

  const handleMeshSelect = useCallback((linkId: string, jointId: string | null, objectIndex: number, objectType: 'visual' | 'collision') => {
    if (transformPendingRef.current) return;
    setSelection({ type: 'link', id: linkId, subType: objectType, objectIndex });
  }, [setSelection]);

  const handleTransformPendingChange = useCallback((pending: boolean) => {
    transformPendingRef.current = pending;
  }, []);

  const handleHover = useCallback((type: 'link' | 'joint' | null, id: string | null, subType?: 'visual' | 'collision') => {
    const current = useSelectionStore.getState().hoveredSelection;
    if (current.type === type && current.id === id && current.subType === subType) {
      return;
    }
    setHoveredSelection({ type, id, subType });
  }, [setHoveredSelection]);

  const handleFocus = useCallback((id: string) => {
    focusOn(id);
  }, [focusOn]);

  const handleNameChange = useCallback((name: string) => {
    if (assemblyState && sidebarTab === 'workspace') {
      useAssemblyStore.getState().setAssembly({ ...assemblyState, name });
    } else {
      setName(name);
    }
  }, [setName, assemblyState, sidebarTab]);

  const renameComponentRootWithDefaults = useCallback((componentId: string, nextRootNameRaw: string) => {
    const nextRootName = nextRootNameRaw.trim();
    if (!nextRootName) return;

    const latestAssembly = useAssemblyStore.getState().assemblyState;
    if (!latestAssembly) return;
    const component = latestAssembly.components[componentId];
    if (!component) return;

    const rootId = component.robot.rootLinkId;
    const rootLink = component.robot.links[rootId];
    if (!rootLink) return;

    const oldRootName = rootLink.name;
    const oldPrefix = `${oldRootName}_`;

    const nextLinks: Record<string, UrdfLink> = { ...component.robot.links };
    nextLinks[rootId] = { ...rootLink, name: nextRootName };

    Object.entries(component.robot.links).forEach(([id, link]) => {
      if (id === rootId) return;
      if (!link.name.startsWith(oldPrefix)) return;
      nextLinks[id] = {
        ...link,
        name: `${nextRootName}_${link.name.slice(oldPrefix.length)}`,
      };
    });

    const nextJoints: Record<string, UrdfJoint> = { ...component.robot.joints };
    Object.entries(component.robot.joints).forEach(([id, joint]) => {
      if (!joint.name.startsWith(oldPrefix)) return;
      nextJoints[id] = {
        ...joint,
        name: `${nextRootName}_${joint.name.slice(oldPrefix.length)}`,
      };
    });

    updateComponentRobot(componentId, { links: nextLinks, joints: nextJoints });
    updateComponentName(componentId, nextRootName);
  }, [updateComponentName, updateComponentRobot]);

  const handleUpdate = useCallback((type: 'link' | 'joint', id: string, data: UrdfLink | UrdfJoint) => {
    if (assemblyState && sidebarTab === 'workspace') {
      // Find which component owns this link/joint
      for (const comp of Object.values(assemblyState.components)) {
        if (type === 'link' && comp.robot.links[id]) {
          const nextLink = data as UrdfLink;
          const isRootLink = id === comp.robot.rootLinkId;
          if (isRootLink && comp.robot.links[id].name !== nextLink.name) {
            renameComponentRootWithDefaults(comp.id, nextLink.name);

            const latestAssembly = useAssemblyStore.getState().assemblyState;
            const latestComp = latestAssembly?.components[comp.id];
            const latestRoot = latestComp?.robot.links[id];
            if (latestComp && latestRoot) {
              updateComponentRobot(comp.id, {
                links: {
                  ...latestComp.robot.links,
                  [id]: { ...latestRoot, ...nextLink, name: nextLink.name.trim() || latestRoot.name },
                },
              });
            }
            return;
          }

          updateComponentRobot(comp.id, {
            links: { ...comp.robot.links, [id]: nextLink },
          });
          return;
        }
        if (type === 'joint' && comp.robot.joints[id]) {
          updateComponentRobot(comp.id, {
            joints: { ...comp.robot.joints, [id]: data as UrdfJoint },
          });
          return;
        }
      }
      // Check if it's a bridge joint
      if (type === 'joint' && assemblyState.bridges[id]) {
        const store = useAssemblyStore.getState();
        store.updateBridge(id, { joint: data as UrdfJoint });
        return;
      }
    }
    if (type === 'link') {
      updateLink(id, data as Partial<UrdfLink>);
    } else {
      updateJoint(id, data as Partial<UrdfJoint>);
    }
  }, [
    updateLink,
    updateJoint,
    assemblyState,
    sidebarTab,
    updateComponentRobot,
    renameComponentRootWithDefaults,
  ]);

  const handleAddComponent = useCallback((file: RobotFile) => {
    const component = addComponent(file, { availableFiles, assets });
    if (component) {
      showToast(lang === 'zh' ? `已添加组件: ${component.name}` : `Added component: ${component.name}`, 'success');
    }
  }, [addComponent, availableFiles, assets, showToast, lang]);

  const handleCreateBridge = useCallback(() => {
    setIsBridgeModalOpen(true);
  }, []);

  const handleAddChild = useCallback((parentId: string) => {
    const { jointId } = addChild(parentId);
    setSelection({ type: 'joint', id: jointId });
  }, [addChild, setSelection]);

  const handleAddCollisionBody = useCallback((parentId: string) => {
    if (assemblyState && sidebarTab === 'workspace') {
      for (const component of Object.values(assemblyState.components)) {
        const parentLink = component.robot.links[parentId];
        if (!parentLink) continue;
        const updatedParentLink = appendCollisionBody(parentLink);

        updateComponentRobot(component.id, {
          links: {
            ...component.robot.links,
            [parentId]: updatedParentLink,
          },
        });

        setSelection({ type: 'link', id: parentId, subType: 'collision' });
        focusOn(parentId);
        return;
      }
      return;
    }

    const parentLink = robot.links[parentId];
    if (!parentLink) return;
    const updatedParentLink = appendCollisionBody(parentLink);
    updateLink(parentId, updatedParentLink);
    setSelection({ type: 'link', id: parentId, subType: 'collision' });
    focusOn(parentId);
  }, [
    assemblyState,
    focusOn,
    robot.links,
    setSelection,
    sidebarTab,
    updateComponentRobot,
    updateLink,
  ]);

  const handleDelete = useCallback((linkId: string) => {
    if (assemblyState && sidebarTab === 'workspace') {
      for (const component of Object.values(assemblyState.components)) {
        if (!component.robot.links[linkId]) continue;

        if (linkId === component.robot.rootLinkId) {
          removeComponent(component.id);
          setSelection({ type: null, id: null });
          return;
        }

        const toDeleteLinks = new Set<string>();
        const toDeleteJoints = new Set<string>();
        const collect = (currentLinkId: string) => {
          if (toDeleteLinks.has(currentLinkId)) return;
          toDeleteLinks.add(currentLinkId);

          Object.values(component.robot.joints).forEach((joint) => {
            if (joint.parentLinkId === currentLinkId) {
              toDeleteJoints.add(joint.id);
              collect(joint.childLinkId);
            }
            if (joint.childLinkId === currentLinkId) {
              toDeleteJoints.add(joint.id);
            }
          });
        };
        collect(linkId);

        const nextLinks: Record<string, UrdfLink> = {};
        Object.entries(component.robot.links).forEach(([id, link]) => {
          if (!toDeleteLinks.has(id)) {
            nextLinks[id] = link;
          }
        });

        const nextJoints: Record<string, UrdfJoint> = {};
        Object.entries(component.robot.joints).forEach(([id, joint]) => {
          if (!toDeleteJoints.has(id)) {
            nextJoints[id] = joint;
          }
        });

        updateComponentRobot(component.id, {
          links: nextLinks,
          joints: nextJoints,
        });

        Object.values(assemblyState.bridges).forEach((bridge) => {
          const isAffectedParent = bridge.parentComponentId === component.id && toDeleteLinks.has(bridge.parentLinkId);
          const isAffectedChild = bridge.childComponentId === component.id && toDeleteLinks.has(bridge.childLinkId);
          if (isAffectedParent || isAffectedChild) {
            removeBridge(bridge.id);
          }
        });

        setSelection({ type: null, id: null });
        return;
      }
      return;
    }

    if (linkId === robot.rootLinkId) return;
    deleteSubtree(linkId);
    setSelection({ type: null, id: null });
  }, [
    assemblyState,
    sidebarTab,
    robot.rootLinkId,
    deleteSubtree,
    removeBridge,
    removeComponent,
    setSelection,
    updateComponentRobot,
  ]);

  const handleRenameComponent = useCallback((componentId: string, name: string) => {
    if (!(assemblyState && sidebarTab === 'workspace')) return;
    renameComponentRootWithDefaults(componentId, name);
  }, [assemblyState, sidebarTab, renameComponentRootWithDefaults]);

  const handleSetShowVisual = useCallback((target: boolean) => {
    setAllLinksVisibility(target);
  }, [setAllLinksVisibility]);

  const handleOptimizeCollisionBodies = useCallback(() => {
    if (assemblyState && sidebarTab === 'workspace') {
      let totalOptimized = 0;

      Object.values(assemblyState.components).forEach((component) => {
        let componentOptimized = 0;
        const nextLinks: Record<string, UrdfLink> = {};

        Object.entries(component.robot.links).forEach(([linkId, link]) => {
          const { link: optimizedLink, optimizedCount } = optimizeCylinderCollisionsToCapsules(link);
          nextLinks[linkId] = optimizedLink;
          componentOptimized += optimizedCount;
        });

        if (componentOptimized > 0) {
          updateComponentRobot(component.id, { links: nextLinks });
          totalOptimized += componentOptimized;
        }
      });

      showToast(
        totalOptimized > 0
          ? (lang === 'zh'
              ? `已优化 ${totalOptimized} 个碰撞体（Cylinder → Capsule）`
              : `Optimized ${totalOptimized} collision bodies (Cylinder → Capsule)`)
          : (lang === 'zh'
              ? '未找到可优化的 Cylinder 碰撞体'
              : 'No cylinder collision bodies found to optimize'),
        totalOptimized > 0 ? 'success' : 'info'
      );
      return;
    }

    let totalOptimized = 0;
    const nextLinks: Record<string, UrdfLink> = {};

    Object.entries(robotLinks).forEach(([linkId, link]) => {
      const { link: optimizedLink, optimizedCount } = optimizeCylinderCollisionsToCapsules(link);
      nextLinks[linkId] = optimizedLink;
      totalOptimized += optimizedCount;
    });

    if (totalOptimized > 0) {
      const optimizedRobotData = {
        name: robotName,
        links: nextLinks,
        joints: robotJoints,
        rootLinkId,
        materials: robotMaterials,
      };

      setRobot({
        ...optimizedRobotData,
      });

      // Keep source text in sync after one-click optimization (URDF/MJCF XML).
      if (selectedFile && (selectedFile.format === 'urdf' || selectedFile.format === 'mjcf')) {
        const robotForExport: RobotState = {
          ...optimizedRobotData,
          selection: { type: null, id: null },
        };
        const optimizedSourceContent = selectedFile.format === 'urdf'
          ? generateURDF(robotForExport, false)
          : generateMujocoXML(robotForExport, { meshdir: 'meshes/' });

        const updatedSelectedFile: RobotFile = {
          ...selectedFile,
          content: optimizedSourceContent,
        };
        setSelectedFile(updatedSelectedFile);
        setAvailableFiles(
          availableFiles.map((file) =>
            file.name === selectedFile.name
              ? { ...file, content: optimizedSourceContent }
              : file
          )
        );

        if (selectedFile.format === 'urdf') {
          setOriginalUrdfContent(optimizedSourceContent);
        }
      }
    }

    showToast(
      totalOptimized > 0
        ? (lang === 'zh'
            ? `已优化 ${totalOptimized} 个碰撞体（Cylinder → Capsule）`
            : `Optimized ${totalOptimized} collision bodies (Cylinder → Capsule)`)
        : (lang === 'zh'
            ? '未找到可优化的 Cylinder 碰撞体'
            : 'No cylinder collision bodies found to optimize'),
      totalOptimized > 0 ? 'success' : 'info'
    );
  }, [
    assemblyState,
    lang,
    robotJoints,
    robotLinks,
    robotMaterials,
    robotName,
    rootLinkId,
    selectedFile,
    availableFiles,
    setAvailableFiles,
    setOriginalUrdfContent,
    setSelectedFile,
    setRobot,
    showToast,
    sidebarTab,
    updateComponentRobot,
  ]);

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
    setSelection({ type: null, id: null });
  }, [resetRobot, emptyRobot, setSelection]);

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
      lang === 'zh'
        ? `已从素材库删除: ${fileLabel}`
        : `Removed from asset library: ${fileLabel}`,
      'success',
    );
  }, [
    assemblyState,
    clearLoadedModel,
    lang,
    removeComponent,
    removeRobotFile,
    selectedFile?.name,
    showToast,
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
      lang === 'zh'
        ? `已删除文件夹: ${normalizedFolder}`
        : `Removed folder: ${normalizedFolder}`,
      'success',
    );
  }, [
    assemblyState,
    clearLoadedModel,
    isPathInFolder,
    lang,
    removeComponent,
    removeRobotFolder,
    selectedFile?.name,
    showToast,
  ]);

  const handleExportLibraryFile = useCallback(async (file: RobotFile, format: 'urdf' | 'mjcf') => {
    const result = await exportLibraryRobotFile({
      file,
      targetFormat: format,
      assets,
    });

    if (!result.success) {
      if (result.reason === 'unsupported-file-format') {
        showToast(
          lang === 'zh'
            ? '仅支持从 URDF/MJCF 文件导出'
            : 'Only URDF/MJCF files support export',
          'info',
        );
        return;
      }

      showToast(
        lang === 'zh'
          ? '导出失败：文件解析失败'
          : 'Export failed: file parse error',
        'info',
      );
      return;
    }

    if (result.missingMeshPaths.length > 0) {
      showToast(
        lang === 'zh'
          ? `导出完成，但有 ${result.missingMeshPaths.length} 个 mesh 未找到`
          : `Exported with ${result.missingMeshPaths.length} missing mesh file(s)`,
        'info',
      );
      return;
    }

    showToast(
      lang === 'zh'
        ? `导出成功: ${result.zipFileName ?? ''}`
        : `Exported: ${result.zipFileName ?? ''}`,
      'success',
    );
  }, [assets, lang, showToast]);

  const handleJointChange = useCallback((jointName: string, angle: number) => {
    setJointAngle(jointName, angle);
  }, [setJointAngle]);

  const handleCodeChange = useCallback((newCode: string) => {
    const newState = parseURDF(newCode);
    if (newState) {
      const { selection: _, ...newData } = newState;
      setRobot(newData);
    }
  }, [setRobot]);

  const handleSnapshot = useCallback(() => {
    if (snapshotActionRef.current) {
      try {
        snapshotActionRef.current();
        showToast(lang === 'zh' ? '正在生成快照...' : 'Generating Snapshot...', 'info');
      } catch (e) {
        console.error('Snapshot failed:', e);
        showToast(lang === 'zh' ? '快照失败' : 'Snapshot failed', 'info');
      }
    }
  }, [lang, showToast]);

  const handleOpenCodeViewer = useCallback(() => {
    void preloadSourceCodeEditor();
    setIsCodeViewerOpen(true);
  }, [setIsCodeViewerOpen]);

  const handlePrefetchCodeViewer = useCallback(() => {
    void preloadSourceCodeEditor();
  }, []);

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        if (canUndo) {
          undo();
          e.preventDefault();
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) {
        if (canRedo) {
          redo();
          e.preventDefault();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, canUndo, canRedo]);

  // Warm up Monaco in the background so the first Source Code open is faster.
  useEffect(() => {
    const warmup = () => {
      void preloadSourceCodeEditor();
    };

    const idleWindow = window as Window & {
      requestIdleCallback?: typeof window.requestIdleCallback;
      cancelIdleCallback?: typeof window.cancelIdleCallback;
    };

    if (typeof idleWindow.requestIdleCallback === 'function') {
      const idleId = idleWindow.requestIdleCallback(warmup, { timeout: 1800 });
      return () => idleWindow.cancelIdleCallback?.(idleId);
    }

    const timer = window.setTimeout(warmup, 800);
    return () => window.clearTimeout(timer);
  }, []);

  // Clean up selection if selected item no longer exists
  // Use robot.links/joints (which includes merged assembly data in workspace mode)
  useEffect(() => {
    if (selection.id && selection.type) {
      const exists = selection.type === 'link'
        ? robot.links[selection.id]
        : robot.joints[selection.id];
      if (!exists) {
        setSelection({ type: null, id: null });
      }
    }
  }, [robot.links, robot.joints, selection, setSelection]);

  // Drag and Drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.dataTransfer.items) {
      try {
        const files = await getDroppedFiles(e.dataTransfer.items);
        if (files.length > 0) {
          onFileDrop(files);
        }
      } catch (err) {
        console.error('Failed to process dropped files:', err);
        showToast(lang === 'zh' ? '处理文件失败' : 'Failed to process files', 'info');
      }
    }
  }, [onFileDrop, showToast, lang]);

  return (
    <div
      className="flex flex-col h-screen font-sans bg-google-light-bg dark:bg-app-bg text-slate-800 dark:text-slate-200"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Hidden file inputs */}
      <input
        type="file"
        accept=".zip,.urdf,.xml,.usda,.usd,.xacro,.usp"
        ref={importInputRef}
        className="hidden"
      />
      <input
        type="file"
        ref={importFolderInputRef}
        className="hidden"
        {...{ webkitdirectory: '', directory: '' } as React.InputHTMLAttributes<HTMLInputElement>}
      />

      {/* Header */}
      <Header
        onImportFile={() => importInputRef.current?.click()}
        onImportFolder={() => importFolderInputRef.current?.click()}
        onOpenExport={onOpenExport}
        onExportProject={onExportProject}
        onOpenAI={onOpenAI}
        onOpenCodeViewer={handleOpenCodeViewer}
        onPrefetchCodeViewer={handlePrefetchCodeViewer}
        onOpenSettings={onOpenSettings}
        onOpenAbout={onOpenAbout}
        onOpenURDFGallery={onOpenURDFGallery}
        onSnapshot={handleSnapshot}
        onOptimizeCollisionCylinders={handleOptimizeCollisionBodies}
        viewConfig={viewConfig}
        setViewConfig={setViewConfig}
      />

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden">
        <TreeEditor
          robot={robot}
          onSelect={handleSelect}
          onFocus={handleFocus}
          onAddChild={handleAddChild}
          onAddCollisionBody={handleAddCollisionBody}
          onDelete={handleDelete}
          onNameChange={handleNameChange}
          onUpdate={handleUpdate}
          showVisual={showVisual}
          setShowVisual={handleSetShowVisual}
          mode={appMode}
          lang={lang}
          theme={theme}
          collapsed={sidebar.leftCollapsed}
          onToggle={() => toggleSidebar('left')}
          availableFiles={availableFiles}
          onLoadRobot={onLoadRobot}
          currentFileName={selectedFile?.name}
          assemblyState={assemblyState}
          onAddComponent={handleAddComponent}
          onDeleteLibraryFile={handleDeleteLibraryFile}
          onDeleteLibraryFolder={handleDeleteLibraryFolder}
          onExportLibraryFile={handleExportLibraryFile}
          onCreateBridge={handleCreateBridge}
          onRemoveComponent={removeComponent}
          onRemoveBridge={removeBridge}
          onRenameComponent={handleRenameComponent}
          onPreviewFile={handlePreviewFile}
          previewFileName={filePreviewFile?.name}
        />

        {/* Viewer Container */}
        <div className="flex-1 relative min-w-0">
          <UnifiedViewer
            robot={robot}
            mode={appMode}
            onSelect={handleSelect}
            onHover={handleHover}
            onUpdate={handleUpdate}
            assets={assets}
            lang={lang}
            theme={theme}
            showVisual={showVisual}
            setShowVisual={handleSetShowVisual}
            snapshotAction={snapshotActionRef}
            showToolbar={viewConfig.showToolbar}
            setShowToolbar={(show) => setViewConfig(prev => ({ ...prev, showToolbar: show }))}
            showOptionsPanel={viewConfig.showOptionsPanel}
            setShowOptionsPanel={(show) => setViewConfig(prev => ({ ...prev, showOptionsPanel: show }))}
            showSkeletonOptionsPanel={viewConfig.showSkeletonOptionsPanel}
            setShowSkeletonOptionsPanel={(show) => setViewConfig(prev => ({ ...prev, showSkeletonOptionsPanel: show }))}
            showJointPanel={viewConfig.showJointPanel}
            setShowJointPanel={(show) => setViewConfig(prev => ({ ...prev, showJointPanel: show }))}
            urdfContent={urdfContentForViewer}
            jointAngleState={jointAngleState}
            onJointChange={handleJointChange}
            selection={robot.selection}
            hoveredSelection={hoveredSelection}
            focusTarget={focusTarget}
            isMeshPreview={selectedFile?.format === 'mesh'}
            onTransformPendingChange={handleTransformPendingChange}
            onCollisionTransform={(linkId, position, rotation, objectIndex) => {
              if (linkId && robot.links[linkId]) {
                const link = robot.links[linkId];
                
                let updatedLink = { ...link };
                
                if (objectIndex && objectIndex > 0 && link.collisionBodies && link.collisionBodies.length >= objectIndex) {
                  const newCollisionBodies = [...link.collisionBodies];
                  newCollisionBodies[objectIndex - 1] = {
                    ...newCollisionBodies[objectIndex - 1],
                    origin: {
                      xyz: position,
                      rpy: rotation,
                    },
                  };
                  updatedLink.collisionBodies = newCollisionBodies;
                } else {
                  updatedLink.collision = {
                    ...link.collision,
                    origin: {
                      xyz: position,
                      rpy: rotation,
                    },
                  };
                }
                
                handleUpdate('link', linkId, updatedLink);
              }
            }}
            filePreview={filePreview}
            onClosePreview={handleClosePreview}
          />
        </div>

        <PropertyEditor
          robot={robot}
          onUpdate={handleUpdate}
          onSelect={handleSelect}
          onHover={handleHover}
          mode={appMode}
          assets={assets}
          onUploadAsset={handleUploadAsset}
          motorLibrary={motorLibrary}
          lang={lang}
          theme={theme}
          collapsed={sidebar.rightCollapsed}
          onToggle={() => toggleSidebar('right')}
        />
      </div>

      {/* Source Code Editor */}
      {isCodeViewerOpen && (
        <SourceCodeEditor
          code={selectedFile ? selectedFile.content : urdfContentForViewer}
          onCodeChange={handleCodeChange}
          onClose={() => setIsCodeViewerOpen(false)}
          theme={theme}
          fileName={selectedFile ? selectedFile.name.split('/').pop() || `${robot.name}.urdf` : `${robot.name}.urdf`}
          lang={lang}
        />
      )}

      {/* Bridge Create Modal */}
      {assemblyState && (
        <BridgeCreateModal
          isOpen={isBridgeModalOpen}
          onClose={() => setIsBridgeModalOpen(false)}
          onCreate={addBridge}
          assemblyState={assemblyState}
          lang={lang}
        />
      )}
    </div>
  );
}

export default AppLayout;
