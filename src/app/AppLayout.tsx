/**
 * App Layout Component
 * Main application layout with Header and workspace area
 */
import React, { useRef, useMemo, useCallback, useEffect, useState } from 'react';
import { Header } from './components/Header';
import { TreeEditor } from '@/features/robot-tree';
import { PropertyEditor } from '@/features/property-editor';
import { Visualizer } from '@/features/visualizer';
import { URDFViewer } from '@/features/urdf-viewer';
import { SourceCodeEditor } from '@/features/code-editor';
import { BridgeCreateModal } from '@/features/assembly';
import { useUIStore, useSelectionStore, useAssetsStore, useRobotStore, useCanUndo, useCanRedo, useAssemblyStore } from '@/store';
import { parseURDF, generateURDF } from '@/core/parsers';
import { getDroppedFiles } from '@/features/file-io/utils';
import {
  DEFAULT_JOINT,
  DEFAULT_LINK,
  GeometryType,
  JointType,
} from '@/types';
import type { RobotState, UrdfLink, UrdfJoint, RobotFile, AssemblyState } from '@/types';

interface AppLayoutProps {
  // Import handlers (passed from App)
  importInputRef: React.RefObject<HTMLInputElement>;
  importFolderInputRef: React.RefObject<HTMLInputElement>;
  onFileDrop: (files: File[]) => void;
  onExport: () => void;
  onExportURDF: () => void;
  onExportMJCF: () => void;
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

const ZERO_VECTOR = { x: 0, y: 0, z: 0 } as const;
const ZERO_RPY = { r: 0, p: 0, y: 0 } as const;

function buildCollisionGeometryFromParent(parentLink: UrdfLink): UrdfLink['collision'] {
  const sourceGeometry = parentLink.visual.type !== GeometryType.NONE
    ? parentLink.visual
    : parentLink.collision.type !== GeometryType.NONE
      ? parentLink.collision
      : DEFAULT_LINK.collision;

  return {
    ...DEFAULT_LINK.collision,
    ...sourceGeometry,
    color: DEFAULT_LINK.collision.color,
    materialSource: undefined,
  };
}

function getNextCollisionBodyIndex(
  parentLinkId: string,
  parentLinkName: string,
  links: Record<string, UrdfLink>,
  joints: Record<string, UrdfJoint>,
): number {
  const prefix = `${parentLinkName}_collision_`;
  let maxIndex = 0;

  Object.values(joints).forEach((joint) => {
    if (joint.parentLinkId !== parentLinkId) return;

    const child = links[joint.childLinkId];
    if (!child || !child.name.startsWith(prefix)) return;

    const rawIndex = child.name.slice(prefix.length);
    const parsedIndex = Number.parseInt(rawIndex, 10);
    if (Number.isFinite(parsedIndex)) {
      maxIndex = Math.max(maxIndex, parsedIndex);
    }
  });

  return maxIndex + 1;
}

export function AppLayout({
  importInputRef,
  importFolderInputRef,
  onFileDrop,
  onExport,
  onExportURDF,
  onExportMJCF,
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
  // UI Store
  const appMode = useUIStore((state) => state.appMode);
  const lang = useUIStore((state) => state.lang);
  const theme = useUIStore((state) => state.theme);
  const os = useUIStore((state) => state.os);
  const sidebar = useUIStore((state) => state.sidebar);
  const toggleSidebar = useUIStore((state) => state.toggleSidebar);
  const sidebarTab = useUIStore((state) => state.sidebarTab);

  // Selection Store
  const selection = useSelectionStore((state) => state.selection);
  const setSelection = useSelectionStore((state) => state.setSelection);
  const hoveredSelection = useSelectionStore((state) => state.hoveredSelection);
  const setHoveredSelection = useSelectionStore((state) => state.setHoveredSelection);
  const focusTarget = useSelectionStore((state) => state.focusTarget);
  const focusOn = useSelectionStore((state) => state.focusOn);

  // Assets Store
  const assets = useAssetsStore((state) => state.assets);
  const motorLibrary = useAssetsStore((state) => state.motorLibrary);
  const availableFiles = useAssetsStore((state) => state.availableFiles);
  const selectedFile = useAssetsStore((state) => state.selectedFile);
  const originalUrdfContent = useAssetsStore((state) => state.originalUrdfContent);
  const uploadAsset = useAssetsStore((state) => state.uploadAsset);
  const removeRobotFile = useAssetsStore((state) => state.removeRobotFile);
  const removeRobotFolder = useAssetsStore((state) => state.removeRobotFolder);

  // Robot Store
  const robotName = useRobotStore((state) => state.name);
  const robotLinks = useRobotStore((state) => state.links);
  const robotJoints = useRobotStore((state) => state.joints);
  const rootLinkId = useRobotStore((state) => state.rootLinkId);
  const setName = useRobotStore((state) => state.setName);
  const setRobot = useRobotStore((state) => state.setRobot);
  const resetRobot = useRobotStore((state) => state.resetRobot);
  const addChild = useRobotStore((state) => state.addChild);
  const deleteSubtree = useRobotStore((state) => state.deleteSubtree);
  const updateLink = useRobotStore((state) => state.updateLink);
  const updateJoint = useRobotStore((state) => state.updateJoint);
  const setAllLinksVisibility = useRobotStore((state) => state.setAllLinksVisibility);
  const setJointAngle = useRobotStore((state) => state.setJointAngle);
  const undo = useRobotStore((state) => state.undo);
  const redo = useRobotStore((state) => state.redo);
  const canUndo = useCanUndo();
  const canRedo = useCanRedo();

  // Assembly Store
  const assemblyState = useAssemblyStore((state) => state.assemblyState);
  const addComponent = useAssemblyStore((state) => state.addComponent);
  const removeComponent = useAssemblyStore((state) => state.removeComponent);
  const addBridge = useAssemblyStore((state) => state.addBridge);
  const removeBridge = useAssemblyStore((state) => state.removeBridge);
  const getMergedRobotData = useAssemblyStore((state) => state.getMergedRobotData);
  const updateComponentName = useAssemblyStore((state) => state.updateComponentName);
  const updateComponentRobot = useAssemblyStore((state) => state.updateComponentRobot);

  // Snapshot ref
  const snapshotActionRef = useRef<(() => void) | null>(null);
  const [isBridgeModalOpen, setIsBridgeModalOpen] = useState(false);

  // Merged robot data for assembly mode
  const mergedRobotData = useMemo(() => {
    if (assemblyState && sidebarTab === 'workspace') {
      return getMergedRobotData();
    }
    return null;
  }, [assemblyState, sidebarTab, getMergedRobotData]);

  // Construct robot object for legacy components
  // Pro mode: use merged assembly data, or empty robot if no components
  // Simple mode: use robotStore data
  const emptyRobot: RobotState = useMemo(() => ({
    name: '',
    links: { empty_root: { id: 'empty_root', name: 'base_link', visual: { type: 'none' as const }, collision: { type: 'none' as const }, inertial: { mass: 0, origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } }, inertia: { ixx: 0, ixy: 0, ixz: 0, iyy: 0, iyz: 0, izz: 0 } } } },
    joints: {},
    rootLinkId: 'empty_root',
    selection: { type: null, id: null },
  }), []);

  const robot: RobotState = useMemo(() => {
    if (assemblyState && sidebarTab === 'workspace') {
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
  }, [robotName, robotLinks, robotJoints, rootLinkId, selection, assemblyState, sidebarTab, mergedRobotData, emptyRobot]);

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
    if (assemblyState && sidebarTab === 'workspace') {
      const merged = getMergedRobotData();
      if (merged) {
        return generateURDF(merged as unknown as RobotState, false);
      }
      // Pro mode with no components: empty URDF
      return generateURDF(emptyRobot, false);
    }
    return generateURDF(robot, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [robotLinks, robotJoints, rootLinkId, emptyRobot, assemblyState?.components, assemblyState?.bridges, sidebarTab, getMergedRobotData]);

  // Handlers
  const handleSelect = useCallback((type: 'link' | 'joint', id: string, subType?: 'visual' | 'collision') => {
    setSelection({ type, id, subType });
  }, [setSelection]);

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

        const nextIndex = getNextCollisionBodyIndex(
          parentId,
          parentLink.name,
          component.robot.links,
          component.robot.joints,
        );

        const ts = Date.now();
        let suffix = 0;
        let newLinkId = `${component.id}_collision_link_${ts}`;
        let newJointId = `${component.id}_collision_joint_${ts}`;
        while (component.robot.links[newLinkId] || component.robot.joints[newJointId]) {
          suffix += 1;
          newLinkId = `${component.id}_collision_link_${ts}_${suffix}`;
          newJointId = `${component.id}_collision_joint_${ts}_${suffix}`;
        }

        const newLink: UrdfLink = {
          ...DEFAULT_LINK,
          id: newLinkId,
          name: `${parentLink.name}_collision_${nextIndex}`,
          visible: true,
          visual: {
            ...DEFAULT_LINK.visual,
            type: GeometryType.NONE,
            dimensions: { ...ZERO_VECTOR },
            meshPath: undefined,
            materialSource: undefined,
          },
          collision: buildCollisionGeometryFromParent(parentLink),
          inertial: {
            ...DEFAULT_LINK.inertial,
            mass: 0,
          },
        };

        const newJoint: UrdfJoint = {
          ...DEFAULT_JOINT,
          id: newJointId,
          name: `${parentLink.name}_collision_joint_${nextIndex}`,
          type: JointType.FIXED,
          parentLinkId: parentId,
          childLinkId: newLinkId,
          origin: { xyz: { ...ZERO_VECTOR }, rpy: { ...ZERO_RPY } },
          axis: { ...ZERO_VECTOR },
        };

        updateComponentRobot(component.id, {
          links: {
            ...component.robot.links,
            [newLinkId]: newLink,
          },
          joints: {
            ...component.robot.joints,
            [newJointId]: newJoint,
          },
        });

        setSelection({ type: 'link', id: newLinkId, subType: 'collision' });
        focusOn(newLinkId);
        return;
      }
      return;
    }

    const parentLink = robot.links[parentId];
    if (!parentLink) return;

    const nextIndex = getNextCollisionBodyIndex(
      parentId,
      parentLink.name,
      robot.links,
      robot.joints,
    );

    const { linkId, jointId } = addChild(parentId);
    const latestState = useRobotStore.getState();
    const createdLink = latestState.links[linkId];
    const createdJoint = latestState.joints[jointId];
    if (!createdLink || !createdJoint) return;

    updateLink(linkId, {
      ...createdLink,
      name: `${parentLink.name}_collision_${nextIndex}`,
      visible: true,
      visual: {
        ...DEFAULT_LINK.visual,
        type: GeometryType.NONE,
        dimensions: { ...ZERO_VECTOR },
        meshPath: undefined,
        materialSource: undefined,
      },
      collision: buildCollisionGeometryFromParent(parentLink),
      inertial: {
        ...createdLink.inertial,
        mass: 0,
      },
    });

    updateJoint(jointId, {
      ...createdJoint,
      name: `${parentLink.name}_collision_joint_${nextIndex}`,
      type: JointType.FIXED,
      origin: { xyz: { ...ZERO_VECTOR }, rpy: { ...ZERO_RPY } },
      axis: { ...ZERO_VECTOR },
    });

    setSelection({ type: 'link', id: linkId, subType: 'collision' });
    focusOn(linkId);
  }, [
    addChild,
    assemblyState,
    focusOn,
    robot.joints,
    robot.links,
    setSelection,
    sidebarTab,
    updateComponentRobot,
    updateJoint,
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

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        if (canUndo) {
          undo();
          e.preventDefault();
        }
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        if (canRedo) {
          redo();
          e.preventDefault();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, canUndo, canRedo]);

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
        onExport={onExport}
        onExportURDF={onExportURDF}
        onExportMJCF={onExportMJCF}
        onExportProject={onExportProject}
        onOpenAI={onOpenAI}
        onOpenCodeViewer={() => setIsCodeViewerOpen(true)}
        onOpenSettings={onOpenSettings}
        onOpenAbout={onOpenAbout}
        onOpenURDFGallery={onOpenURDFGallery}
        onSnapshot={handleSnapshot}
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
          onCreateBridge={handleCreateBridge}
          onRemoveComponent={removeComponent}
          onRemoveBridge={removeBridge}
          onRenameComponent={handleRenameComponent}
        />

        {/* Viewer Container */}
        <div className="flex-1 relative min-w-0">
          {/* URDFViewer for detail/hardware modes */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: (appMode === 'detail' || appMode === 'hardware') && urdfContentForViewer ? 'block' : 'none'
          }}>
            <URDFViewer
              key="urdf-viewer"
              urdfContent={urdfContentForViewer}
              assets={assets}
              lang={lang}
              mode={appMode as 'detail' | 'hardware'}
              onSelect={handleSelect}
              onHover={handleHover}
              selection={robot.selection}
              hoveredSelection={hoveredSelection}
              focusTarget={focusTarget}
              theme={theme}
              robotLinks={robot.links}
              showVisual={showVisual}
              setShowVisual={handleSetShowVisual}
              jointAngleState={jointAngleState}
              snapshotAction={snapshotActionRef}
              showToolbar={viewConfig.showToolbar}
              setShowToolbar={(show) => setViewConfig(prev => ({ ...prev, showToolbar: show }))}
              showOptionsPanel={viewConfig.showOptionsPanel}
              setShowOptionsPanel={(show) => setViewConfig(prev => ({ ...prev, showOptionsPanel: show }))}
              showJointPanel={viewConfig.showJointPanel}
              setShowJointPanel={(show) => setViewConfig(prev => ({ ...prev, showJointPanel: show }))}
              onJointChange={handleJointChange}
              onCollisionTransform={(linkId, position, rotation) => {
                if (linkId && robot.links[linkId]) {
                  const link = robot.links[linkId];
                  const updatedLink = {
                    ...link,
                    collision: {
                      ...link.collision,
                      origin: {
                        xyz: position,
                        rpy: rotation
                      }
                    }
                  };
                  handleUpdate('link', linkId, updatedLink);
                }
              }}
            />
          </div>

          {/* Visualizer for skeleton mode */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: appMode === 'skeleton' ? 'block' : 'none'
          }}>
            <Visualizer
              key="visualizer"
              robot={robot}
              onSelect={handleSelect}
              onUpdate={handleUpdate}
              mode={appMode}
              assets={assets}
              lang={lang}
              theme={theme}
              os={os}
              showVisual={showVisual}
              setShowVisual={handleSetShowVisual}
              snapshotAction={snapshotActionRef}
              showOptionsPanel={viewConfig.showSkeletonOptionsPanel}
              setShowOptionsPanel={(show) => setViewConfig(prev => ({ ...prev, showSkeletonOptionsPanel: show }))}
            />
          </div>
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
