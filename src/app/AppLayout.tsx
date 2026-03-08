/**
 * App Layout Component
 * Main application layout with Header and workspace area
 */
import React, { lazy, Suspense, useRef, useMemo, useCallback, useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Header } from './components/Header';
import { UnifiedViewer } from './components/UnifiedViewer';
import { LazyOverlayFallback } from './components/LazyOverlayFallback';
import { TreeEditor } from '@/features/robot-tree';
import { PropertyEditor } from '@/features/property-editor/components/PropertyEditor';
import { useViewerOrchestration, useWorkspaceSourceSync } from './hooks';
import { useUIStore, useSelectionStore, useAssetsStore, useRobotStore, useCanUndo, useCanRedo, useAssemblyStore } from '@/store';
import { parseMJCF, parseURDF } from '@/core/parsers';
import { getDroppedFiles, exportLibraryRobotFile } from '@/features/file-io';
import { GeometryType, type RobotState, type UrdfLink, type UrdfJoint, type RobotFile, type AssemblyState } from '@/types';
import {
  appendCollisionBody,
  getCollisionGeometryEntries,
  updateCollisionGeometryByObjectIndex,
} from '@/core/robot';
import { translations } from '@/shared/i18n';
import type {
  CollisionOptimizationOperation,
  CollisionOptimizationSource,
  CollisionTargetRef,
} from '@/features/property-editor/utils';
import { applyCollisionOptimizationOperationsToLinks } from '@/features/property-editor/utils';

const loadSourceCodeEditorModule = () => import('@/features/code-editor/components/SourceCodeEditor');
const loadCollisionOptimizationDialogModule = () => import('@/features/property-editor/components/CollisionOptimizationDialog');
const loadBridgeCreateModalModule = () => import('@/features/assembly/components/BridgeCreateModal');

const SourceCodeEditor = lazy(() =>
  loadSourceCodeEditorModule().then((module) => ({ default: module.SourceCodeEditor }))
);

const CollisionOptimizationDialog = lazy(() =>
  loadCollisionOptimizationDialogModule().then((module) => ({ default: module.CollisionOptimizationDialog }))
);

const BridgeCreateModal = lazy(() =>
  loadBridgeCreateModalModule().then((module) => ({ default: module.BridgeCreateModal }))
);

const preloadSourceCodeEditor = async () => {
  const module = await loadSourceCodeEditorModule();
  return module.preloadSourceCodeEditor();
};

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
  const t = translations[lang];

  // Selection Store
  const { selection, setSelection, hoveredSelection, setHoveredSelection, focusTarget, focusOn, pulseSelection } = useSelectionStore(
    useShallow((state) => ({
      selection: state.selection,
      setSelection: state.setSelection,
      hoveredSelection: state.hoveredSelection,
      setHoveredSelection: state.setHoveredSelection,
      focusTarget: state.focusTarget,
      focusOn: state.focusOn,
      pulseSelection: state.pulseSelection,
    }))
  );

  // Assets Store
  const {
    assets, motorLibrary, availableFiles, selectedFile,
    setAvailableFiles, setSelectedFile, originalUrdfContent, setOriginalUrdfContent,
    uploadAsset, removeRobotFile, removeRobotFolder, clearRobotLibrary,
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
      clearRobotLibrary: state.clearRobotLibrary,
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
  const [isCollisionOptimizerOpen, setIsCollisionOptimizerOpen] = useState(false);
  const [shouldRenderBridgeModal, setShouldRenderBridgeModal] = useState(false);
  const {
    isWorkspaceAssembly,
    mergedRobotData,
    emptyRobot,
    robot,
    jointAngleState,
    showVisual,
    urdfContentForViewer,
    sourceCodeContent,
    filePreview,
    previewFileName,
    handlePreviewFile,
    handleClosePreview,
  } = useWorkspaceSourceSync({
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
    setSelectedFile,
    setAvailableFiles,
    originalUrdfContent,
    setOriginalUrdfContent,
  });

  const {
    handleSelect,
    handleSelectGeometry,
    handleViewerSelect,
    handleViewerMeshSelect,
    handleTransformPendingChange,
    handleHover,
    handleFocus,
  } = useViewerOrchestration({
    transformPendingRef,
    setSelection,
    pulseSelection,
    setHoveredSelection,
    focusOn,
  });

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
      showToast(t.addedComponent.replace('{name}', component.name), 'success');
    }
  }, [addComponent, availableFiles, assets, showToast, t]);

  const handleCreateBridge = useCallback(() => {
    setShouldRenderBridgeModal(true);
    void loadBridgeCreateModalModule();
    setIsBridgeModalOpen(true);
  }, []);

  const handleOpenCollisionOptimizer = useCallback(() => {
    void loadCollisionOptimizationDialogModule();
    setIsCollisionOptimizerOpen(true);
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
        const nextCollisionEntries = getCollisionGeometryEntries(updatedParentLink);
        const nextObjectIndex = Math.max(0, nextCollisionEntries.length - 1);

        updateComponentRobot(component.id, {
          links: {
            ...component.robot.links,
            [parentId]: updatedParentLink,
          },
        });

        setSelection({ type: 'link', id: parentId, subType: 'collision', objectIndex: nextObjectIndex });
        focusOn(parentId);
        return;
      }
      return;
    }

    const parentLink = robot.links[parentId];
    if (!parentLink) return;
    const updatedParentLink = appendCollisionBody(parentLink);
    const nextCollisionEntries = getCollisionGeometryEntries(updatedParentLink);
    const nextObjectIndex = Math.max(0, nextCollisionEntries.length - 1);
    updateLink(parentId, updatedParentLink);
    setSelection({ type: 'link', id: parentId, subType: 'collision', objectIndex: nextObjectIndex });
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

  const collisionOptimizationSource = useMemo<CollisionOptimizationSource>(() => {
    if (assemblyState && sidebarTab === 'workspace') {
      return {
        kind: 'assembly',
        assembly: assemblyState,
      };
    }

    return {
      kind: 'robot',
      robot: {
        name: robotName,
        links: robotLinks,
        joints: robotJoints,
        rootLinkId,
        materials: robotMaterials,
      },
    };
  }, [assemblyState, robotJoints, robotLinks, robotMaterials, robotName, rootLinkId, sidebarTab]);

  const handlePreviewCollisionOptimizationTarget = useCallback((target: CollisionTargetRef) => {
    const nextSelection = {
      type: 'link' as const,
      id: target.linkId,
      subType: 'collision' as const,
      objectIndex: target.objectIndex,
    };

    setSelection(nextSelection);
    pulseSelection(nextSelection);
    focusOn(target.linkId);
  }, [focusOn, pulseSelection, setSelection]);

  const handleApplyCollisionOptimization = useCallback((operations: CollisionOptimizationOperation[]) => {
    if (operations.length === 0) {
      showToast(t.noCollisionOptimizationApplied, 'info');
      return;
    }

    if (assemblyState && sidebarTab === 'workspace') {
      const operationsByComponent = new Map<string, CollisionOptimizationOperation[]>();
      operations.forEach((operation) => {
        if (!operation.componentId) return;
        const bucket = operationsByComponent.get(operation.componentId) ?? [];
        bucket.push(operation);
        operationsByComponent.set(operation.componentId, bucket);
      });

      operationsByComponent.forEach((componentOperations, componentId) => {
        const component = assemblyState.components[componentId];
        if (!component) return;

        updateComponentRobot(componentId, {
          links: applyCollisionOptimizationOperationsToLinks(component.robot.links, componentOperations),
        });
      });
    } else {
      setRobot({
        name: robotName,
        links: applyCollisionOptimizationOperationsToLinks(robotLinks, operations),
        joints: robotJoints,
        rootLinkId,
        materials: robotMaterials,
      });
    }

    const meshConvertedCount = operations.filter((operation) => operation.fromType === GeometryType.MESH).length;
    const primitiveConvertedCount = operations.length - meshConvertedCount;

    const message = t.collisionOptimizationApplied
      .replace('{count}', String(operations.length))
      .replace('{meshCount}', String(meshConvertedCount))
      .replace('{primitiveCount}', String(primitiveConvertedCount));

    showToast(message, 'success');
  }, [
    assemblyState,
    robotJoints,
    robotMaterials,
    robotName,
    rootLinkId,
    setRobot,
    showToast,
    sidebarTab,
    robotLinks,
    updateComponentRobot,
    t,
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

  const handleJointChange = useCallback((jointName: string, angle: number) => {
    setJointAngle(jointName, angle);
  }, [setJointAngle]);

  const handleCodeChange = useCallback((newCode: string) => {
    const newState = selectedFile?.format === 'mjcf'
      ? parseMJCF(newCode)
      : parseURDF(newCode);
    if (newState) {
      const { selection: _, ...newData } = newState;
      setRobot(newData);
    }
  }, [selectedFile?.format, setRobot]);

  const handleSnapshot = useCallback(() => {
    if (snapshotActionRef.current) {
      try {
        snapshotActionRef.current();
        showToast(t.generatingSnapshot, 'info');
      } catch (e) {
        console.error('Snapshot failed:', e);
        showToast(t.snapshotFailed, 'info');
      }
    }
  }, [showToast, t]);

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
        showToast(t.failedToProcessFiles, 'info');
      }
    }
  }, [onFileDrop, showToast, t]);

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
        onOpenCollisionOptimizer={handleOpenCollisionOptimizer}
        viewConfig={viewConfig}
        setViewConfig={setViewConfig}
      />

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden">
        <TreeEditor
          robot={robot}
          onSelect={handleSelect}
          onSelectGeometry={handleSelectGeometry}
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
          onDeleteAllLibraryFiles={handleDeleteAllLibraryFiles}
          onExportLibraryFile={handleExportLibraryFile}
          onCreateBridge={handleCreateBridge}
          onRemoveComponent={removeComponent}
          onRemoveBridge={removeBridge}
          onRenameComponent={handleRenameComponent}
          onPreviewFile={handlePreviewFile}
          previewFileName={previewFileName}
        />

        {/* Viewer Container */}
        <div className="flex-1 relative min-w-0">
          <UnifiedViewer
            robot={robot}
            mode={appMode}
            onSelect={handleViewerSelect}
            onMeshSelect={handleViewerMeshSelect}
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
                const updatedLink = updateCollisionGeometryByObjectIndex(link, objectIndex ?? 0, {
                  origin: {
                    xyz: position,
                    rpy: rotation,
                  },
                });

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
        <Suspense fallback={<LazyOverlayFallback label={t.loadingEditor} />}>
          <SourceCodeEditor
            code={sourceCodeContent}
            onCodeChange={handleCodeChange}
            onClose={() => setIsCodeViewerOpen(false)}
            theme={theme}
            fileName={selectedFile ? selectedFile.name.split('/').pop() || `${robot.name}.urdf` : `${robot.name}.urdf`}
            lang={lang}
          />
        </Suspense>
      )}

      {isCollisionOptimizerOpen && (
        <Suspense fallback={<LazyOverlayFallback label={t.loadingOptimizer} />}>
          <CollisionOptimizationDialog
            source={collisionOptimizationSource}
            lang={lang}
            assets={assets}
            selection={selection}
            onClose={() => setIsCollisionOptimizerOpen(false)}
            onSelectTarget={handlePreviewCollisionOptimizationTarget}
            onApply={handleApplyCollisionOptimization}
          />
        </Suspense>
      )}

      {/* Bridge Create Modal */}
      {assemblyState && shouldRenderBridgeModal && (
        <Suspense fallback={<LazyOverlayFallback label={t.loadingBridgeDialog} />}>
          <BridgeCreateModal
            isOpen={isBridgeModalOpen}
            onClose={() => setIsBridgeModalOpen(false)}
            onCreate={addBridge}
            assemblyState={assemblyState}
            lang={lang}
          />
        </Suspense>
      )}
    </div>
  );
}

export default AppLayout;
