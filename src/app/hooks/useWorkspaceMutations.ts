import { useCallback } from 'react';
import {
  addChildToRobot,
  appendCollisionBody,
  getCollisionGeometryEntries,
  resolveClosedLoopJointOriginCompensation,
  resolveJointKey,
  resolveLinkKey,
  updateCollisionGeometryByObjectIndex,
} from '@/core/robot';
import { useAssemblyStore, useRobotStore } from '@/store';
import type { PendingCollisionTransform } from '@/store/collisionTransformStore';
import type {
  AssemblyState,
  RobotData,
  UrdfJoint,
  UrdfLink,
} from '@/types';
import {
  usePendingHistoryCoordinator,
  type UpdateCommitMode,
  type UpdateCommitOptions,
} from './usePendingHistoryCoordinator';

interface UseWorkspaceMutationsParams {
  sidebarTab: string;
  assemblyState: AssemblyState | null;
  robotLinks: Record<string, UrdfLink>;
  rootLinkId: string;
  setName: (name: string) => void;
  addChild: (parentId: string) => { jointId: string };
  deleteSubtree: (linkId: string) => void;
  updateLink: (
    id: string,
    updates: Partial<UrdfLink>,
    options?: { skipHistory?: boolean; label?: string },
  ) => void;
  updateJoint: (
    id: string,
    updates: Partial<UrdfJoint>,
    options?: { skipHistory?: boolean; label?: string },
  ) => void;
  setAllLinksVisibility: (visible: boolean) => void;
  setJointAngle: (jointName: string, angle: number) => void;
  updateComponentName: (
    componentId: string,
    name: string,
    options?: { skipHistory?: boolean; label?: string },
  ) => void;
  updateComponentRobot: (
    componentId: string,
    partialRobot: Partial<RobotData>,
    options?: { skipHistory?: boolean; label?: string },
  ) => void;
  removeComponent: (id: string) => void;
  removeBridge: (id: string) => void;
  focusOn: (id: string) => void;
  setSelection: (selection: {
    type: 'link' | 'joint' | null;
    id: string | null;
    subType?: 'visual' | 'collision';
    objectIndex?: number;
  }) => void;
  setPendingCollisionTransform: (transform: PendingCollisionTransform) => void;
  clearPendingCollisionTransform: () => void;
  handleTransformPendingChange: (pending: boolean) => void;
}

export function useWorkspaceMutations({
  sidebarTab,
  assemblyState,
  robotLinks,
  rootLinkId,
  setName,
  addChild,
  deleteSubtree,
  updateLink,
  updateJoint,
  setAllLinksVisibility,
  setJointAngle,
  updateComponentName,
  updateComponentRobot,
  removeComponent,
  removeBridge,
  focusOn,
  setSelection,
  setPendingCollisionTransform,
  clearPendingCollisionTransform,
  handleTransformPendingChange,
}: UseWorkspaceMutationsParams) {
  const createRobotSnapshot = useCallback(() => {
    const state = useRobotStore.getState();
    return structuredClone({
      name: state.name,
      links: state.links,
      joints: state.joints,
      rootLinkId: state.rootLinkId,
      materials: state.materials,
      closedLoopConstraints: state.closedLoopConstraints,
    });
  }, []);

  const createAssemblySnapshot = useCallback(() => {
    return structuredClone(useAssemblyStore.getState().assemblyState);
  }, []);

  const {
    commitPendingRobotHistory,
    commitPendingAssemblyHistory,
    ensurePendingRobotHistory,
    ensurePendingAssemblyHistory,
    schedulePendingRobotHistoryCommit,
    schedulePendingAssemblyHistoryCommit,
  } = usePendingHistoryCoordinator({
    sidebarTab,
    createRobotSnapshot,
    createAssemblySnapshot,
  });

  const handleNameChange = useCallback((name: string) => {
    if (assemblyState && sidebarTab === 'workspace') {
      useAssemblyStore.getState().setAssembly({ ...assemblyState, name });
    } else {
      setName(name);
    }
  }, [assemblyState, setName, sidebarTab]);

  const renameComponentRootWithDefaults = useCallback((
    componentId: string,
    nextRootNameRaw: string,
    options?: { skipHistory?: boolean; label?: string },
  ) => {
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

    Object.entries(component.robot.links).forEach(([id, currentLink]) => {
      if (id === rootId || !currentLink.name.startsWith(oldPrefix)) return;
      nextLinks[id] = {
        ...currentLink,
        name: `${nextRootName}_${currentLink.name.slice(oldPrefix.length)}`,
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

    updateComponentRobot(componentId, { links: nextLinks, joints: nextJoints }, options);
    updateComponentName(componentId, nextRootName, options);
  }, [updateComponentName, updateComponentRobot]);

  const applyUpdate = useCallback((
    type: 'link' | 'joint',
    id: string,
    data: UrdfLink | UrdfJoint,
    options: UpdateCommitOptions = {},
  ) => {
    const commitMode = options.commitMode ?? 'debounced';
    const latestAssemblyState = sidebarTab === 'workspace'
      ? useAssemblyStore.getState().assemblyState
      : null;

    if (latestAssemblyState) {
      for (const comp of Object.values(latestAssemblyState.components)) {
        const resolvedLinkId = type === 'link' ? resolveLinkKey(comp.robot.links, id) : null;
        if (type === 'link' && resolvedLinkId) {
          const nextLink = data as UrdfLink;
          const historyKey = options.historyKey ?? `assembly:component:${comp.id}:link:${resolvedLinkId}`;
          const historyLabel = options.historyLabel ?? 'Update assembly component';
          const isRootLink = resolvedLinkId === comp.robot.rootLinkId;

          if (isRootLink && comp.robot.links[resolvedLinkId].name !== nextLink.name) {
            ensurePendingAssemblyHistory(historyKey, historyLabel);
            renameComponentRootWithDefaults(comp.id, nextLink.name, {
              skipHistory: true,
              label: historyLabel,
            });

            const latestAssembly = useAssemblyStore.getState().assemblyState;
            const latestComp = latestAssembly?.components[comp.id];
            const latestRoot = latestComp?.robot.links[resolvedLinkId];
            if (latestComp && latestRoot) {
              updateComponentRobot(comp.id, {
                links: {
                  ...latestComp.robot.links,
                  [resolvedLinkId]: { ...latestRoot, ...nextLink, name: nextLink.name.trim() || latestRoot.name },
                },
              }, {
                skipHistory: true,
                label: historyLabel,
              });
            }

            if (commitMode === 'immediate') {
              commitPendingAssemblyHistory(historyKey);
            } else if (commitMode !== 'manual') {
              schedulePendingAssemblyHistoryCommit(historyKey, options.debounceMs);
            }
            return;
          }

          ensurePendingAssemblyHistory(historyKey, historyLabel);
          updateComponentRobot(comp.id, {
            links: { ...comp.robot.links, [resolvedLinkId]: nextLink },
          }, {
            skipHistory: true,
            label: historyLabel,
          });

          if (commitMode === 'immediate') {
            commitPendingAssemblyHistory(historyKey);
          } else if (commitMode !== 'manual') {
            schedulePendingAssemblyHistoryCommit(historyKey, options.debounceMs);
          }
          return;
        }

        const resolvedJointId = type === 'joint' ? resolveJointKey(comp.robot.joints, id) : null;
        if (type === 'joint' && resolvedJointId) {
          const historyKey = options.historyKey ?? `assembly:component:${comp.id}:joint:${resolvedJointId}`;
          const historyLabel = options.historyLabel ?? 'Update assembly component';

          ensurePendingAssemblyHistory(historyKey, historyLabel);
          updateComponentRobot(comp.id, {
            joints: { ...comp.robot.joints, [resolvedJointId]: data as UrdfJoint },
          }, {
            skipHistory: true,
            label: historyLabel,
          });

          if (commitMode === 'immediate') {
            commitPendingAssemblyHistory(historyKey);
          } else if (commitMode !== 'manual') {
            schedulePendingAssemblyHistoryCommit(historyKey, options.debounceMs);
          }
          return;
        }
      }

      if (type === 'joint' && latestAssemblyState.bridges[id]) {
        const historyKey = options.historyKey ?? `assembly:bridge:${id}`;
        const historyLabel = options.historyLabel ?? 'Update bridge joint';

        ensurePendingAssemblyHistory(historyKey, historyLabel);
        useAssemblyStore.getState().updateBridge(id, { joint: data as UrdfJoint }, {
          skipHistory: true,
          label: historyLabel,
        });

        if (commitMode === 'immediate') {
          commitPendingAssemblyHistory(historyKey);
        } else if (commitMode !== 'manual') {
          schedulePendingAssemblyHistoryCommit(historyKey, options.debounceMs);
        }
        return;
      }
    }

    if (type === 'link') {
      const resolvedLinkId = resolveLinkKey(useRobotStore.getState().links, id);
      if (resolvedLinkId) {
        const historyKey = options.historyKey ?? `robot:link:${resolvedLinkId}`;
        const historyLabel = options.historyLabel ?? 'Update link';

        ensurePendingRobotHistory(historyKey, historyLabel);
        updateLink(resolvedLinkId, data as Partial<UrdfLink>, {
          skipHistory: true,
          label: historyLabel,
        });

        if (commitMode === 'immediate') {
          commitPendingRobotHistory(historyKey);
        } else if (commitMode !== 'manual') {
          schedulePendingRobotHistoryCommit(historyKey, options.debounceMs);
        }
      }
    } else {
      const resolvedJointId = resolveJointKey(useRobotStore.getState().joints, id);
      if (resolvedJointId) {
        const historyKey = options.historyKey ?? `robot:joint:${resolvedJointId}`;
        const historyLabel = options.historyLabel ?? 'Update joint';
        const currentRobotState = useRobotStore.getState();
        const currentJoint = currentRobotState.joints[resolvedJointId];

        ensurePendingRobotHistory(historyKey, historyLabel);
        updateJoint(resolvedJointId, data as Partial<UrdfJoint>, {
          skipHistory: true,
          label: historyLabel,
        });

        if (currentJoint && (data as Partial<UrdfJoint>).origin) {
          const compensatedOrigins = resolveClosedLoopJointOriginCompensation(
            currentRobotState,
            resolvedJointId,
            (data as Partial<UrdfJoint>).origin ?? currentJoint.origin,
          );

          Object.entries(compensatedOrigins).forEach(([jointId, origin]) => {
            updateJoint(jointId, { origin }, {
              skipHistory: true,
              label: historyLabel,
            });
          });
        }

        if (commitMode === 'immediate') {
          commitPendingRobotHistory(historyKey);
        } else if (commitMode !== 'manual') {
          schedulePendingRobotHistoryCommit(historyKey, options.debounceMs);
        }
      }
    }
  }, [
    commitPendingAssemblyHistory,
    commitPendingRobotHistory,
    ensurePendingAssemblyHistory,
    ensurePendingRobotHistory,
    renameComponentRootWithDefaults,
    schedulePendingAssemblyHistoryCommit,
    schedulePendingRobotHistoryCommit,
    sidebarTab,
    updateComponentRobot,
    updateJoint,
    updateLink,
  ]);

  const handleUpdate = useCallback((type: 'link' | 'joint', id: string, data: UrdfLink | UrdfJoint) => {
    applyUpdate(type, id, data, { commitMode: 'debounced' });
  }, [applyUpdate]);

  const applyCollisionTransformUpdate = useCallback((
    linkId: string,
    position: { x: number; y: number; z: number },
    rotation: { r: number; p: number; y: number },
    commitMode: UpdateCommitMode,
    objectIndex?: number,
  ) => {
    const latestAssemblyState = sidebarTab === 'workspace'
      ? useAssemblyStore.getState().assemblyState
      : null;

    if (latestAssemblyState) {
      for (const comp of Object.values(latestAssemblyState.components)) {
        const resolvedLinkId = resolveLinkKey(comp.robot.links, linkId);
        if (!resolvedLinkId) continue;

        const link = comp.robot.links[resolvedLinkId];
        if (!link) return;

        const updatedLink = updateCollisionGeometryByObjectIndex(link, objectIndex ?? 0, {
          origin: {
            xyz: position,
            rpy: rotation,
          },
        });

        applyUpdate('link', resolvedLinkId, updatedLink, {
          historyKey: `collision-transform:${comp.id}:${resolvedLinkId}:${objectIndex ?? 0}`,
          historyLabel: 'Transform collision body',
          commitMode,
        });
        return;
      }

      return;
    }

    const latestLinks = useRobotStore.getState().links;
    const resolvedLinkId = resolveLinkKey(latestLinks, linkId);
    if (!resolvedLinkId) return;

    const link = latestLinks[resolvedLinkId];
    if (!link) return;

    const updatedLink = updateCollisionGeometryByObjectIndex(link, objectIndex ?? 0, {
      origin: {
        xyz: position,
        rpy: rotation,
      },
    });

    applyUpdate('link', resolvedLinkId, updatedLink, {
      historyKey: `collision-transform:${resolvedLinkId}:${objectIndex ?? 0}`,
      historyLabel: 'Transform collision body',
      commitMode,
    });
  }, [applyUpdate, sidebarTab]);

  const handleCollisionTransformPreview = useCallback((
    linkId: string,
    position: { x: number; y: number; z: number },
    rotation: { r: number; p: number; y: number },
    objectIndex?: number,
  ) => {
    const resolvedLinkId = resolveLinkKey(robotLinks, linkId) ?? linkId;
    setPendingCollisionTransform({
      linkId: resolvedLinkId,
      objectIndex: objectIndex ?? 0,
      position,
      rotation,
    });
  }, [resolveLinkKey, robotLinks, setPendingCollisionTransform]);

  const handleCollisionTransform = useCallback((
    linkId: string,
    position: { x: number; y: number; z: number },
    rotation: { r: number; p: number; y: number },
    objectIndex?: number,
  ) => {
    clearPendingCollisionTransform();
    applyCollisionTransformUpdate(linkId, position, rotation, 'immediate', objectIndex);
  }, [applyCollisionTransformUpdate, clearPendingCollisionTransform]);

  const handleCollisionTransformPendingChange = useCallback((pending: boolean) => {
    handleTransformPendingChange(pending);
    if (!pending) {
      clearPendingCollisionTransform();
    }
  }, [clearPendingCollisionTransform, handleTransformPendingChange]);

  const handleAddChild = useCallback((parentId: string) => {
    if (assemblyState && sidebarTab === 'workspace') {
      commitPendingAssemblyHistory();

      for (const component of Object.values(assemblyState.components)) {
        const resolvedParentId = resolveLinkKey(component.robot.links, parentId);
        if (!resolvedParentId) continue;

        const nextRobotState = addChildToRobot(
          {
            ...component.robot,
            selection: { type: null, id: null },
          },
          resolvedParentId,
        );
        const jointId = nextRobotState.selection.id;

        updateComponentRobot(component.id, {
          links: nextRobotState.links,
          joints: nextRobotState.joints,
        }, {
          label: 'Add child link',
        });

        if (jointId) {
          setSelection({ type: 'joint', id: jointId });
        }
        return;
      }
    }

    commitPendingRobotHistory();
    const { jointId } = addChild(parentId);
    setSelection({ type: 'joint', id: jointId });
  }, [
    addChild,
    assemblyState,
    commitPendingAssemblyHistory,
    commitPendingRobotHistory,
    setSelection,
    sidebarTab,
    updateComponentRobot,
  ]);

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

    const parentLink = robotLinks[parentId];
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
    robotLinks,
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
        Object.entries(component.robot.links).forEach(([id, currentLink]) => {
          if (!toDeleteLinks.has(id)) {
            nextLinks[id] = currentLink;
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

    if (linkId === rootLinkId) return;
    deleteSubtree(linkId);
    setSelection({ type: null, id: null });
  }, [
    assemblyState,
    deleteSubtree,
    removeBridge,
    removeComponent,
    rootLinkId,
    setSelection,
    sidebarTab,
    updateComponentRobot,
  ]);

  const handleRenameComponent = useCallback((componentId: string, name: string) => {
    if (!(assemblyState && sidebarTab === 'workspace')) return;
    renameComponentRootWithDefaults(componentId, name);
  }, [assemblyState, renameComponentRootWithDefaults, sidebarTab]);

  const handleSetShowVisual = useCallback((target: boolean) => {
    setAllLinksVisibility(target);
  }, [setAllLinksVisibility]);

  const handleJointChange = useCallback((jointName: string, angle: number) => {
    setJointAngle(jointName, angle);
  }, [setJointAngle]);

  return {
    handleNameChange,
    handleUpdate,
    handleCollisionTransformPreview,
    handleCollisionTransform,
    handleCollisionTransformPendingChange,
    handleAddChild,
    handleAddCollisionBody,
    handleDelete,
    handleRenameComponent,
    handleSetShowVisual,
    handleJointChange,
  };
}
