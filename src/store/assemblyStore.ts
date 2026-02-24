/**
 * Assembly Store - Manages multi-URDF assembly state
 * Components + Bridges, with merge for rendering/export
 */
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type {
  AssemblyState,
  AssemblyComponent,
  BridgeJoint,
  RobotData,
  RobotFile,
  UrdfLink,
  UrdfJoint,
} from '@/types';
import { DEFAULT_JOINT, JointType, GeometryType } from '@/types';
import { parseURDF, parseMJCF, parseUSDA, parseXacro } from '@/core/parsers';
import { mergeAssembly } from '@/core/robot/assemblyMerger';

interface AssemblyContext {
  availableFiles?: RobotFile[];
  assets?: Record<string, string>;
}

function applyPrefix(
  data: RobotData,
  prefix: string
): RobotData {
  const linkIdMap: Record<string, string> = {};
  const links: Record<string, UrdfLink> = {};
  const joints: Record<string, UrdfJoint> = {};

  // Find the asset prefix used during import (from useFileImport)
  // We can't easily get the timestamp here, so we'll use a prefixing strategy
  // that matches what we do in useFileImport or ensures the visualization can find it.

  for (const [id, link] of Object.entries(data.links)) {
    const newId = prefix + id;
    linkIdMap[id] = newId;
    
    // Create namespaced link
    links[newId] = {
      ...link,
      id: newId,
      name: prefix + link.name,
    };
  }

  for (const [id, joint] of Object.entries(data.joints)) {
    const newId = prefix + id;
    const parentId = linkIdMap[joint.parentLinkId] ?? prefix + joint.parentLinkId;
    const childId = linkIdMap[joint.childLinkId] ?? prefix + joint.childLinkId;
    joints[newId] = {
      ...joint,
      id: newId,
      name: prefix + joint.name,
      parentLinkId: parentId,
      childLinkId: childId,
    };
  }

  const rootLinkId = linkIdMap[data.rootLinkId] ?? prefix + data.rootLinkId;

  return {
    name: data.name,
    links,
    joints,
    rootLinkId,
    materials: data.materials,
  };
}

export function sanitizeComponentId(filename: string): string {
  const base = filename.split('/').pop()?.replace(/\.[^/.]+$/, '') ?? 'component';
  return base.replace(/[^a-zA-Z0-9_]/g, '_');
}

interface AssemblyActions {
  setAssembly: (state: AssemblyState | null) => void;
  initAssembly: (name?: string) => void;
  exitAssembly: () => void;

  addComponent: (
    file: RobotFile,
    context?: AssemblyContext
  ) => AssemblyComponent | null;
  removeComponent: (id: string) => void;
  updateComponentName: (id: string, name: string) => void;
  updateComponentRobot: (id: string, robot: Partial<RobotData>) => void;
  toggleComponentVisibility: (id: string, visible?: boolean) => void;

  addBridge: (params: {
    name: string;
    parentComponentId: string;
    parentLinkId: string;
    childComponentId: string;
    childLinkId: string;
    joint: Partial<UrdfJoint>;
  }) => BridgeJoint;
  removeBridge: (id: string) => void;
  updateBridge: (id: string, updates: Partial<BridgeJoint>) => void;

  getMergedRobotData: () => RobotData | null;
}

export const useAssemblyStore = create<
  { assemblyState: AssemblyState | null } & AssemblyActions
>()(
  immer((set, get) => ({
    assemblyState: null,

    setAssembly: (state) => set({ assemblyState: state }),

    initAssembly: (name = 'assembly') => {
      set({
        assemblyState: {
          name,
          components: {},
          bridges: {},
        },
      });
    },

    exitAssembly: () => set({ assemblyState: null }),

    addComponent: (file, context = {}) => {
      let robotData: RobotData | null = null;

      switch (file.format) {
        case 'urdf':
          robotData = parseURDF(file.content);
          break;
        case 'mjcf':
          robotData = parseMJCF(file.content);
          break;
        case 'usd':
          robotData = parseUSDA(file.content);
          break;
        case 'xacro': {
          const fileMap: Record<string, string> = {};
          (context.availableFiles ?? []).forEach((f) => {
            fileMap[f.name] = f.content;
          });
          const pathParts = file.name.split('/');
          pathParts.pop();
          const basePath = pathParts.join('/');
          const parsed = parseXacro(file.content, {}, fileMap, basePath);
          robotData = parsed
            ? {
                name: parsed.name,
                links: parsed.links,
                joints: parsed.joints,
                rootLinkId: parsed.rootLinkId,
                materials: (parsed as RobotData & { materials?: RobotData['materials'] }).materials,
              }
            : null;
          break;
        }
        case 'mesh': {
          const meshName = file.name.split('/').pop()?.replace(/\.[^/.]+$/, '') ?? 'mesh';
          const linkId = 'base_link';
          robotData = {
            name: meshName,
            links: {
              [linkId]: {
                id: linkId,
                name: 'base_link',
                visible: true,
                visual: {
                  type: GeometryType.MESH,
                  dimensions: { x: 1, y: 1, z: 1 },
                  color: '#808080',
                  meshPath: file.name,
                  origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
                },
                collision: {
                  type: GeometryType.NONE,
                  dimensions: { x: 0, y: 0, z: 0 },
                  color: '#ef4444',
                  origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
                },
                inertial: {
                  mass: 1.0,
                  origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
                  inertia: { ixx: 0.1, ixy: 0, ixz: 0, iyy: 0.1, iyz: 0, izz: 0.1 },
                },
              },
            },
            joints: {},
            rootLinkId: linkId,
          };
          break;
        }
      }

      if (!robotData) return null;

      const baseId = sanitizeComponentId(file.name);
      let compId = `comp_${baseId}`;
      let suffix = 0;
      const state = get().assemblyState;
      if (state) {
        while (state.components[compId]) {
          compId = `comp_${baseId}_${++suffix}`;
        }
      }

      const displayName =
        baseId.charAt(0).toUpperCase() + baseId.slice(1) + '_Component';
      const prefix = compId + '_';
      const namespacedRobot = applyPrefix(robotData, prefix);

      const component: AssemblyComponent = {
        id: compId,
        name: displayName,
        sourceFile: file.name,
        robot: namespacedRobot,
        visible: true,
      };

      set((s) => {
        if (!s.assemblyState) {
          s.assemblyState = {
            name: 'assembly',
            components: {},
            bridges: {},
          };
        }
        s.assemblyState!.components[compId] = component;
      });

      return component;
    },

    removeComponent: (id) => {
      set((s) => {
        if (!s.assemblyState) return;
        delete s.assemblyState.components[id];
        Object.keys(s.assemblyState.bridges).forEach((bridgeId) => {
          const b = s.assemblyState!.bridges[bridgeId];
          if (b.parentComponentId === id || b.childComponentId === id) {
            delete s.assemblyState!.bridges[bridgeId];
          }
        });
      });
    },

    updateComponentName: (id, name) => {
      set((s) => {
        const comp = s.assemblyState?.components[id];
        if (comp) comp.name = name;
      });
    },

    updateComponentRobot: (id, robotUpdates) => {
      set((s) => {
        const comp = s.assemblyState?.components[id];
        if (comp) {
          Object.assign(comp.robot, robotUpdates);
        }
      });
    },

    toggleComponentVisibility: (id, visible) => {
      set((s) => {
        const comp = s.assemblyState?.components[id];
        if (comp) {
          comp.visible = visible !== undefined ? visible : !comp.visible;
        }
      });
    },

    addBridge: (params) => {
      const id = `bridge_${Date.now()}`;
      const fullJoint: UrdfJoint = {
        ...DEFAULT_JOINT,
        id,
        name: params.name,
        type: params.joint.type ?? JointType.FIXED,
        parentLinkId: params.parentLinkId,
        childLinkId: params.childLinkId,
        origin: params.joint.origin ?? {
          xyz: { x: 0, y: 0, z: 0 },
          rpy: { r: 0, p: 0, y: 0 },
        },
        axis: params.joint.axis ?? { x: 0, y: 0, z: 1 },
        limit: params.joint.limit ?? DEFAULT_JOINT.limit,
        dynamics: params.joint.dynamics ?? DEFAULT_JOINT.dynamics,
        hardware: params.joint.hardware ?? DEFAULT_JOINT.hardware,
      };

      const bridge: BridgeJoint = {
        id,
        name: params.name,
        parentComponentId: params.parentComponentId,
        parentLinkId: params.parentLinkId,
        childComponentId: params.childComponentId,
        childLinkId: params.childLinkId,
        joint: fullJoint,
      };

      set((s) => {
        if (!s.assemblyState) s.assemblyState = { name: 'assembly', components: {}, bridges: {} };
        s.assemblyState!.bridges[id] = bridge;
      });

      return bridge;
    },

    removeBridge: (id) => {
      set((s) => {
        if (s.assemblyState) delete s.assemblyState.bridges[id];
      });
    },

    updateBridge: (id, updates) => {
      set((s) => {
        const b = s.assemblyState?.bridges[id];
        if (b) Object.assign(b, updates);
      });
    },

    getMergedRobotData: () => {
      const { assemblyState } = get();
      if (!assemblyState || Object.keys(assemblyState.components).length === 0) {
        return null;
      }

      // Filter visible components
      const visibleComponents: Record<string, AssemblyComponent> = {};
      const visibleCompIds = new Set<string>();
      Object.entries(assemblyState.components).forEach(([id, comp]) => {
        if (comp.visible !== false) {
          visibleComponents[id] = comp;
          visibleCompIds.add(id);
        }
      });

      if (Object.keys(visibleComponents).length === 0) return null;

      // Filter bridges that connect visible components
      const visibleBridges: Record<string, BridgeJoint> = {};
      Object.entries(assemblyState.bridges).forEach(([id, bridge]) => {
        if (visibleCompIds.has(bridge.parentComponentId) && visibleCompIds.has(bridge.childComponentId)) {
          visibleBridges[id] = bridge;
        }
      });

      return mergeAssembly({
        ...assemblyState,
        components: visibleComponents,
        bridges: visibleBridges,
      });
    },
  }))
);
