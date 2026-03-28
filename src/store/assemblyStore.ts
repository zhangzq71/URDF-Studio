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
  RobotClosedLoopConstraint,
  RobotData,
  RobotFile,
  UrdfLink,
  UrdfJoint,
} from '@/types';
import { DEFAULT_JOINT, JointType } from '@/types';
import { resolveRobotFileData } from '@/core/parsers';
import type { RobotImportResult } from '@/core/parsers/importRobotFile';
import { syncRobotMaterialsForLinkUpdate } from '@/core/robot/materials';
import { mergeAssembly } from '@/core/robot/assemblyMerger';
import { failFastInDev } from '@/core/utils/runtimeDiagnostics';

interface AssemblyContext {
  availableFiles?: RobotFile[];
  assets?: Record<string, string>;
  allFileContents?: Record<string, string>;
  preResolvedImportResult?: RobotImportResult | null;
  preResolvedRobotData?: RobotData | null;
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
  const linkNameMap: Record<string, string> = {};
  const links: Record<string, UrdfLink> = {};
  const joints: Record<string, UrdfJoint> = {};
  const closedLoopConstraints: RobotClosedLoopConstraint[] = [];
  const materials: NonNullable<RobotData['materials']> = {};

  // Find the asset prefix used during import (from useFileImport)
  // We can't easily get the timestamp here, so we'll use a prefixing strategy
  // that matches what we do in useFileImport or ensures the visualization can find it.

  for (const [id, link] of Object.entries(data.links)) {
    const newId = idPrefix + id;
    linkIdMap[id] = newId;
    const originalName = link.name?.trim() || id;
    const isRootLink = id === data.rootLinkId;
    const newName = isRootLink ? rootName : `${rootName}_${originalName}`;
    linkNameMap[originalName] = newId;
    
    // Create namespaced link
    links[newId] = {
      ...link,
      id: newId,
      name: newName,
    };
  }

  Object.entries(data.materials || {}).forEach(([key, material]) => {
    const targetLinkId = linkIdMap[key] || linkNameMap[key] || key;
    materials[targetLinkId] = { ...material };
  });

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

  (data.closedLoopConstraints || []).forEach((constraint) => {
    closedLoopConstraints.push({
      ...constraint,
      id: `${idPrefix}${constraint.id}`,
      linkAId: linkIdMap[constraint.linkAId] ?? idPrefix + constraint.linkAId,
      linkBId: linkIdMap[constraint.linkBId] ?? idPrefix + constraint.linkBId,
      source: constraint.source
        ? {
            ...constraint.source,
            body1Name: `${rootName}_${constraint.source.body1Name}`,
            body2Name: `${rootName}_${constraint.source.body2Name}`,
          }
        : undefined,
    });
  });

  return {
    name: data.name,
    links,
    joints,
    rootLinkId,
    materials: Object.keys(materials).length > 0 ? materials : undefined,
    closedLoopConstraints: closedLoopConstraints.length > 0 ? closedLoopConstraints : undefined,
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

function normalizeAssemblySourcePath(path: string): string {
  return path.trim().replace(/^\/+/, '').replace(/\/+/g, '/').replace(/\/+$/, '');
}

function isSameOrNestedAssemblySourcePath(path: string, basePath: string): boolean {
  const normalizedPath = normalizeAssemblySourcePath(path);
  return normalizedPath === basePath || normalizedPath.startsWith(`${basePath}/`);
}

function replaceAssemblySourcePathPrefix(path: string, fromPath: string, toPath: string): string {
  const normalizedPath = normalizeAssemblySourcePath(path);
  if (normalizedPath === fromPath) {
    return toPath;
  }

  if (normalizedPath.startsWith(`${fromPath}/`)) {
    return `${toPath}/${normalizedPath.slice(fromPath.length + 1)}`;
  }

  return normalizedPath;
}

function buildAssemblyComponentImportError(file: RobotFile, importResult: Exclude<RobotImportResult, { status: 'ready' }>): Error {
  const detail = importResult.status === 'needs_hydration'
    ? 'USD scene data is not hydrated yet.'
    : importResult.reason === 'unsupported_format'
      ? `Unsupported format "${file.format}".`
      : importResult.reason === 'source_only_fragment'
        ? 'The selected source file is only a fragment and cannot be assembled as a standalone component.'
        : 'Source parsing failed.';

  return new Error(`Failed to add assembly component from "${file.name}". ${detail}`);
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
  renameComponentSourceFolder: (fromPath: string, toPath: string, options?: UpdateOptions) => void;
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
        const importResult = (
          context.preResolvedImportResult?.status === 'ready'
          && context.preResolvedImportResult.format === file.format
          ? context.preResolvedImportResult
          : resolveRobotFileData(file, {
            availableFiles: context.availableFiles,
            assets: context.assets,
            allFileContents: context.allFileContents,
            usdRobotData: context.preResolvedRobotData ?? null,
          })
        );

        if (importResult.status !== 'ready') {
          failFastInDev(
            'AssemblyStore:addComponent',
            buildAssemblyComponentImportError(file, importResult),
          );
          return null;
        }

        const robotData = importResult.robotData;

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

      renameComponentSourceFolder: (fromPath, toPath, options) => {
        const normalizedFromPath = normalizeAssemblySourcePath(fromPath);
        const normalizedToPath = normalizeAssemblySourcePath(toPath);

        if (!normalizedFromPath || !normalizedToPath || normalizedFromPath === normalizedToPath) {
          return;
        }

        const currentAssembly = get().assemblyState;
        if (!currentAssembly) {
          return;
        }

        const hasMatchingComponent = Object.values(currentAssembly.components).some((component) => (
          isSameOrNestedAssemblySourcePath(component.sourceFile, normalizedFromPath)
        ));

        if (!hasMatchingComponent) {
          return;
        }

        if (!options?.skipHistory) {
          saveToHistory(options?.label ?? 'Rename assembly component sources');
        }

        set((s) => {
          const components = s.assemblyState?.components;
          if (!components) return;

          Object.values(components).forEach((component) => {
            if (isSameOrNestedAssemblySourcePath(component.sourceFile, normalizedFromPath)) {
              component.sourceFile = replaceAssemblySourcePathPrefix(
                component.sourceFile,
                normalizedFromPath,
                normalizedToPath,
              );
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
            const hasExplicitMaterials = Object.prototype.hasOwnProperty.call(robotUpdates, 'materials');
            let nextMaterials = hasExplicitMaterials
              ? robotUpdates.materials
              : component.robot.materials;

            if (!hasExplicitMaterials && robotUpdates.links) {
              Object.entries(robotUpdates.links).forEach(([linkId, nextLink]) => {
                const previousLink = component.robot.links[linkId];
                if (previousLink === nextLink) {
                  return;
                }

                nextMaterials = syncRobotMaterialsForLinkUpdate(
                  nextMaterials,
                  nextLink,
                  previousLink,
                );
              });
            }

            Object.assign(component.robot, robotUpdates);

            if (!hasExplicitMaterials && nextMaterials !== component.robot.materials) {
              component.robot.materials = nextMaterials;
            }
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
