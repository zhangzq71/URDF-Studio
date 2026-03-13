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
import { resolveMJCFSource } from '@/core/parsers/mjcf/mjcfSourceResolver';

interface AssemblyContext {
  availableFiles?: RobotFile[];
  assets?: Record<string, string>;
}

interface UpdateOptions {
  skipHistory?: boolean;
  label?: string;
}

function applyPrefix(
  data: RobotData,
  options: { idPrefix: string; rootName: string }
): RobotData {
  const { idPrefix, rootName } = options;
  const linkIdMap: Record<string, string> = {};
  const links: Record<string, UrdfLink> = {};
  const joints: Record<string, UrdfJoint> = {};

  // Find the asset prefix used during import (from useFileImport)
  // We can't easily get the timestamp here, so we'll use a prefixing strategy
  // that matches what we do in useFileImport or ensures the visualization can find it.

  for (const [id, link] of Object.entries(data.links)) {
    const newId = idPrefix + id;
    linkIdMap[id] = newId;
    const originalName = link.name?.trim() || id;
    const isRootLink = id === data.rootLinkId;
    
    // Create namespaced link
    links[newId] = {
      ...link,
      id: newId,
      name: isRootLink ? rootName : `${rootName}_${originalName}`,
    };
  }

  for (const [id, joint] of Object.entries(data.joints)) {
    const newId = idPrefix + id;
    const parentId = linkIdMap[joint.parentLinkId] ?? idPrefix + joint.parentLinkId;
    const childId = linkIdMap[joint.childLinkId] ?? idPrefix + joint.childLinkId;
    const originalName = joint.name?.trim() || id;
    joints[newId] = {
      ...joint,
      id: newId,
      name: `${rootName}_${originalName}`,
      parentLinkId: parentId,
      childLinkId: childId,
    };
  }

  const rootLinkId = linkIdMap[data.rootLinkId] ?? idPrefix + data.rootLinkId;

  return {
    name: data.name,
    links,
    joints,
    rootLinkId,
    materials: data.materials,
  };
}

export function sanitizeComponentId(filename: string): string {
  const base = filename.split('/').pop()?.replace(/\.[^/.]+$/, '') ?? 'robot';
  const sanitized = base.replace(/[^a-zA-Z0-9_]/g, '_');
  return sanitized || 'robot';
}

function createUniqueComponentName(baseName: string, existingNames: Set<string>): string {
  if (!existingNames.has(baseName)) {
    return baseName;
  }

  let suffix = 1;
  let candidate = `${baseName}_${suffix}`;
  while (existingNames.has(candidate)) {
    suffix += 1;
    candidate = `${baseName}_${suffix}`;
  }
  return candidate;
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
  updateComponentName: (id: string, name: string, options?: UpdateOptions) => void;
  updateComponentRobot: (id: string, robot: Partial<RobotData>, options?: UpdateOptions) => void;
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
  updateBridge: (id: string, updates: Partial<BridgeJoint>, options?: UpdateOptions) => void;

  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  clearHistory: () => void;
  pushHistorySnapshot: (snapshot: AssemblySnapshot, label: string) => void;

  getMergedRobotData: () => RobotData | null;
}

type AssemblySnapshot = AssemblyState | null;

interface AssemblyHistoryState {
  past: AssemblySnapshot[];
  future: AssemblySnapshot[];
}

interface ChangeLogEntry {
  id: string;
  timestamp: string;
  label: string;
}

const MAX_HISTORY = 50;
const MAX_ACTIVITY_LOG = 200;

const cloneAssemblySnapshot = (snapshot: AssemblySnapshot): AssemblySnapshot =>
  snapshot ? structuredClone(snapshot) : null;
const createChangeLogEntry = (label: string): ChangeLogEntry => ({
  id: `assembly_log_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  timestamp: new Date().toISOString(),
  label,
});

export const useAssemblyStore = create<
  {
    assemblyState: AssemblyState | null;
    _history: AssemblyHistoryState;
    _activity: ChangeLogEntry[];
  } & AssemblyActions
>()(
  immer((set, get) => {
    let cachedAssemblyState: AssemblyState | null | undefined;
    let cachedMergedRobotData: RobotData | null = null;
    const appendHistorySnapshot = (snapshot: AssemblySnapshot, label: string) => {
      set((state) => {
        state._history.past = [...state._history.past, cloneAssemblySnapshot(snapshot)].slice(-MAX_HISTORY);
        state._history.future = [];
        state._activity = [...state._activity, createChangeLogEntry(label)].slice(-MAX_ACTIVITY_LOG);
      });
    };

    const saveToHistory = (label: string) => {
      appendHistorySnapshot(get().assemblyState, label);
    };

    return {
      assemblyState: null,
      _history: { past: [], future: [] },
      _activity: [],

      setAssembly: (state) => {
        saveToHistory('Load assembly state');
        set({ assemblyState: cloneAssemblySnapshot(state) });
      },

      initAssembly: (name = 'assembly') => {
        saveToHistory('Initialize assembly');
        set({
          assemblyState: {
            name,
            components: {},
            bridges: {},
          },
        });
      },

      exitAssembly: () => {
        saveToHistory('Exit assembly');
        set({ assemblyState: null });
      },

      addComponent: (file, context = {}) => {
        let robotData: RobotData | null = null;

        switch (file.format) {
          case 'urdf':
            robotData = parseURDF(file.content);
            break;
          case 'mjcf': {
            const resolved = resolveMJCFSource(file, context.availableFiles ?? []);
            robotData = parseMJCF(resolved.content);
            break;
          }
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
        const state = get().assemblyState;
        const existingNames = new Set(
          state ? Object.values(state.components).map((component) => component.name) : []
        );
        const displayName = createUniqueComponentName(baseId, existingNames);

        let compId = `comp_${displayName}`;
        let suffix = 1;
        if (state) {
          while (state.components[compId]) {
            compId = `comp_${displayName}_${suffix++}`;
          }
        }

        const namespacedRobot = applyPrefix(robotData, {
          idPrefix: `${compId}_`,
          rootName: displayName,
        });

        const component: AssemblyComponent = {
          id: compId,
          name: displayName,
          sourceFile: file.name,
          robot: namespacedRobot,
          visible: true,
        };

        saveToHistory('Add assembly component');
        set((s) => {
          if (!s.assemblyState) {
            s.assemblyState = {
              name: 'assembly',
              components: {},
              bridges: {},
            };
          }
          s.assemblyState.components[compId] = component;
        });

        return component;
      },

      removeComponent: (id) => {
        saveToHistory('Remove assembly component');
        set((s) => {
          if (!s.assemblyState) return;
          delete s.assemblyState.components[id];
          Object.keys(s.assemblyState.bridges).forEach((bridgeId) => {
            const bridge = s.assemblyState!.bridges[bridgeId];
            if (bridge.parentComponentId === id || bridge.childComponentId === id) {
              delete s.assemblyState!.bridges[bridgeId];
            }
          });
        });
      },

      updateComponentName: (id, name, options) => {
        if (!options?.skipHistory) {
          saveToHistory(options?.label ?? 'Rename assembly component');
        }
        set((s) => {
          const component = s.assemblyState?.components[id];
          if (component) component.name = name;
        });
      },

      updateComponentRobot: (id, robotUpdates, options) => {
        if (!options?.skipHistory) {
          saveToHistory(options?.label ?? 'Update assembly component');
        }
        set((s) => {
          const component = s.assemblyState?.components[id];
          if (component) {
            Object.assign(component.robot, robotUpdates);
          }
        });
      },

      toggleComponentVisibility: (id, visible) => {
        saveToHistory('Toggle component visibility');
        set((s) => {
          const component = s.assemblyState?.components[id];
          if (component) {
            component.visible = visible !== undefined ? visible : !component.visible;
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

        saveToHistory('Add bridge joint');
        set((s) => {
          if (!s.assemblyState) {
            s.assemblyState = { name: 'assembly', components: {}, bridges: {} };
          }
          s.assemblyState.bridges[id] = bridge;
        });

        return bridge;
      },

      removeBridge: (id) => {
        saveToHistory('Remove bridge joint');
        set((s) => {
          if (s.assemblyState) delete s.assemblyState.bridges[id];
        });
      },

      updateBridge: (id, updates, options) => {
        if (!options?.skipHistory) {
          saveToHistory(options?.label ?? 'Update bridge joint');
        }
        set((s) => {
          const bridge = s.assemblyState?.bridges[id];
          if (bridge) Object.assign(bridge, updates);
        });
      },

      undo: () => {
        const { _history, assemblyState } = get();
        if (_history.past.length === 0) return;

        const previous = cloneAssemblySnapshot(_history.past[_history.past.length - 1]);
        const currentSnapshot = cloneAssemblySnapshot(assemblyState);

        set((state) => {
          state.assemblyState = previous;
          state._history.past = state._history.past.slice(-(MAX_HISTORY + 1), -1);
          state._history.future = [currentSnapshot, ...state._history.future].slice(0, MAX_HISTORY);
        });
      },

      redo: () => {
        const { _history, assemblyState } = get();
        if (_history.future.length === 0) return;

        const next = cloneAssemblySnapshot(_history.future[0]);
        const currentSnapshot = cloneAssemblySnapshot(assemblyState);

        set((state) => {
          state.assemblyState = next;
          state._history.past = [...state._history.past, currentSnapshot].slice(-MAX_HISTORY);
          state._history.future = state._history.future.slice(1, MAX_HISTORY + 1);
        });
      },

      canUndo: () => get()._history.past.length > 0,
      canRedo: () => get()._history.future.length > 0,

      clearHistory: () => {
        set((state) => {
          state._history = { past: [], future: [] };
        });
      },

      pushHistorySnapshot: (snapshot, label) => {
        appendHistorySnapshot(snapshot, label);
      },

      getMergedRobotData: () => {
        const { assemblyState } = get();
        if (assemblyState === cachedAssemblyState) {
          return cachedMergedRobotData;
        }
        if (!assemblyState || Object.keys(assemblyState.components).length === 0) {
          cachedAssemblyState = assemblyState;
          cachedMergedRobotData = null;
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

        if (Object.keys(visibleComponents).length === 0) {
          cachedAssemblyState = assemblyState;
          cachedMergedRobotData = null;
          return null;
        }

      // Filter bridges that connect visible components
      const visibleBridges: Record<string, BridgeJoint> = {};
      Object.entries(assemblyState.bridges).forEach(([id, bridge]) => {
        if (visibleCompIds.has(bridge.parentComponentId) && visibleCompIds.has(bridge.childComponentId)) {
          visibleBridges[id] = bridge;
        }
      });

        cachedAssemblyState = assemblyState;
        cachedMergedRobotData = mergeAssembly({
          ...assemblyState,
          components: visibleComponents,
          bridges: visibleBridges,
        });

        return cachedMergedRobotData;
      },
    };
  })
);

export const useAssemblyCanUndo = () => useAssemblyStore((state) => state._history.past.length > 0);
export const useAssemblyCanRedo = () => useAssemblyStore((state) => state._history.future.length > 0);
