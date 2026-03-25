import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type RefObject } from 'react';
import * as THREE from 'three';
import { getCollisionGeometryEntries } from '@/core/robot';
import { getLowestMeshZ } from '@/shared/utils';
import type { RobotFile, UrdfLink } from '@/types';
import { disposeObject3D } from '@/shared/utils/three/dispose';
import { UsdCollisionTransformControls, type UsdCollisionTransformTarget } from './UsdCollisionTransformControls';
import { ViewerLoadingHud } from './ViewerLoadingHud';
import { LinkAxesController } from '../runtime/viewer/link-axes.js';
import { LinkDynamicsController } from '../runtime/viewer/link-dynamics.js';
import { LinkRotationController } from '../runtime/viewer/link-rotation.js';
import type {
  MeasureTargetResolver,
  ToolMode,
  URDFViewerProps,
  ViewerRuntimeStageBridge,
  UsdLoadingPhaseLabels,
  UsdLoadingProgress,
} from '../types';
import { disposeUsdDriver, ensureUsdWasmRuntime, type UsdWasmRuntime } from '../utils/usdWasmRuntime';
import { collisionHighlightMaterial, highlightMaterial } from '../utils/materials';
import { UsdJointAxesController } from '../utils/usdJointAxesController';
import { createUsdJointAxesDisplayResolution } from '../utils/usdJointAxesDisplayResolution';
import {
  computeCameraFrame,
  computeVisibleBounds,
  createCameraFrameStabilityKey,
} from '../utils/cameraFrame';
import {
  buildUsdBundlePreloadEntries,
} from '../utils/usdPreloadSources';
import { hydrateUsdViewerRobotResolutionFromRuntime } from '../utils/usdRuntimeRobotHydration';
import { resolveUsdSceneRobotResolution } from '../utils/usdSceneRobotResolution';
import { resolveUsdRuntimeLinkPathForMesh } from '../utils/usdRuntimeMeshMapping';
import { createUsdViewerRuntimeRobot } from '../utils/usdViewerRuntimeRobot';
import {
  buildUsdLinkDynamicsRecordMap,
  composeUsdMeshOverrideWorldMatrixFromBaseLocal,
  deriveUsdMeshBaseLocalMatrix,
  isUsdRuntimeGeometryVisible,
  resolveUsdRuntimeGeometry,
  resolveUsdVisualColorOverride,
} from '../utils/usdRuntimeLinkOverrides';
import {
  clearUsdHoverPointerState,
  markUsdHoverRaycastDirty,
  setUsdHoverPointerState,
} from '../utils/usdHoverPointerState';
import { resolveEffectiveInteractionSubType } from '../utils/interactionMode';
import { hasPickableMaterial, isInternalHelperObject, isVisibleInHierarchy } from '../utils/pickFilter';
import { collectGizmoRaycastTargets, isGizmoObject } from '../utils/raycast';
import { resolveUsdMeasureTargetFromSelection } from '../utils/measureTargetResolvers';
import { reconcileUsdCollisionMeshAssignments } from '../utils/usdCollisionMeshAssignments';
import {
  resolveUsdStageInteractionPolicy,
  resolveUsdStageJointRotationRuntime,
} from '../utils/usdInteractionPolicy';
import { prepareUsdVisualMesh } from '../utils/usdVisualRendering';
import { createEmbeddedUsdViewerLoadParams } from '../utils/usdViewerRenderParams';
import { resolveUsdStageJointPreview, type UsdStageJointInfoLike } from '../utils/usdStageJointPreview';
import {
  armSelectionMissGuard,
  clearSelectionMissGuardTimer,
  scheduleSelectionMissGuardReset,
} from '../utils/selectionMissGuard';
import { scheduleStabilizedAutoFrame } from '../utils/stabilizedAutoFrame';
import { buildViewerLoadingHudState } from '../utils/viewerLoadingHud';
import type { ViewerRobotDataResolution } from '../utils/viewerRobotData';

interface UsdWasmStageProps {
  active?: boolean;
  sourceFile: RobotFile;
  availableFiles: RobotFile[];
  assets: Record<string, string>;
  mode: 'detail' | 'hardware';
  justSelectedRef?: RefObject<boolean>;
  groundPlaneOffset?: number;
  selection?: URDFViewerProps['selection'];
  hoveredSelection?: URDFViewerProps['hoveredSelection'];
  hoverSelectionEnabled?: boolean;
  onHover?: URDFViewerProps['onHover'];
  onMeshSelect?: URDFViewerProps['onMeshSelect'];
  showOrigins: boolean;
  showOriginsOverlay: boolean;
  originSize: number;
  showJointAxes: boolean;
  showJointAxesOverlay: boolean;
  jointAxisSize: number;
  highlightMode: 'link' | 'collision';
  showCenterOfMass: boolean;
  showCoMOverlay: boolean;
  centerOfMassSize: number;
  showInertia: boolean;
  showInertiaOverlay: boolean;
  showVisual: boolean;
  showCollision: boolean;
  toolMode: ToolMode;
  robotLinks?: Record<string, UrdfLink>;
  transformMode?: 'select' | 'translate' | 'rotate' | 'universal';
  onCollisionTransformPreview?: URDFViewerProps['onCollisionTransformPreview'];
  onCollisionTransformEnd?: URDFViewerProps['onCollisionTransform'];
  onTransformPending?: (pending: boolean) => void;
  setIsDragging?: (dragging: boolean) => void;
  loadingLabel: string;
  loadingDetailLabel: string;
  loadingPhaseLabels: UsdLoadingPhaseLabels;
  onRobotDataResolved?: (result: ViewerRobotDataResolution) => void;
  runtimeBridge?: ViewerRuntimeStageBridge;
  measureTargetResolverRef?: MutableRefObject<MeasureTargetResolver | null>;
}

type ViewerControls = {
  update?: () => boolean;
  target?: THREE.Vector3;
};

const RUNTIME_DECORATION_REFRESH_DEBOUNCE_MS = 96;

type RuntimeWindow = Window & {
  USD?: unknown;
  usdRoot?: THREE.Group;
  usdStage?: unknown;
  renderInterface?: unknown;
  driver?: unknown;
  camera?: THREE.Camera;
  _controls?: ViewerControls;
  scene?: THREE.Scene;
};

type ViewerRuntimeInterface = {
  getCachedRobotSceneSnapshot?: (stageSourcePath?: string | null) => unknown;
  warmupRobotSceneSnapshotFromDriver?: (driver: unknown, options?: Record<string, unknown>) => unknown;
  getResolvedPrimPathForMeshId?: (meshId: string) => string | null;
  getResolvedVisualTransformPrimPathForMeshId?: (meshId: string) => string | null;
  getPreferredLinkWorldTransform?: (linkPath: string) => unknown;
  getWorldTransformForPrimPath?: (primPath: string) => unknown;
};

type UsdMeshRole = 'visual' | 'collision';

type RuntimeMeshMeta = {
  linkPath: string;
  meshId: string;
  objectIndex?: number;
  authoredOrder?: number;
  role: UsdMeshRole;
};

type RuntimeMeshIndex = {
  meshMetaByObject: Map<THREE.Object3D, RuntimeMeshMeta>;
  meshesByLinkKey: Map<string, THREE.Mesh[]>;
  pickMeshes: THREE.Mesh[];
};

type RuntimePreviewCollisionTransform = {
  linkId: string;
  objectIndex: number;
  position: { x: number; y: number; z: number };
  rotation: { r: number; p: number; y: number };
};

type HighlightedMaterialState = {
  depthTest: boolean;
  depthWrite: boolean;
  opacity: number;
  transparent: boolean;
};

type HighlightedMeshSnapshot = {
  material: THREE.Material | THREE.Material[];
  materialStates: HighlightedMaterialState[];
  renderOrder: number;
};

const USD_VISUAL_SEGMENT_PATTERN = /(?:^|\/)visuals?(?:$|[/.])/i;
const USD_COLLISION_SEGMENT_PATTERN = /(?:^|\/)collisions?(?:$|[/.])/i;

type PreloadEntry = {
  path: string;
  loadBlob: () => Promise<Blob>;
};

const dependencyStemByRootUsdFile: Record<string, string> = {
  'g1_29dof_rev_1_0.usd': 'g1_29dof_rev_1_0',
  'g1_23dof_rev_1_0.usd': 'g1_23dof_rev_1_0',
  'go2.usd': 'go2_description',
  'go2w.usd': 'go2w_description',
  'h1.usd': 'h1',
  'h1_2.usd': 'h1_2',
  'h1_2_handless.usd': 'h1_2_handless',
  'b2.usd': 'b2_description',
  'b2w.usd': 'b2w_description',
};

function getPathBasename(path: string | null | undefined): string {
  const normalized = String(path || '').trim().replace(/[<>]/g, '');
  if (!normalized) return '';

  const segments = normalized.split('/').filter(Boolean);
  return segments[segments.length - 1] || '';
}

function parseUsdMeshObjectIndex(meshId: string): number | undefined {
  const match = String(meshId || '').match(/(?:\.proto_(?:mesh|[a-z]+)_id)(\d+)$/i);
  if (!match) return undefined;

  const index = Number(match[1]);
  return Number.isInteger(index) && index >= 0 ? index : undefined;
}

function resolveUsdCollisionMeshAuthoredOrder({
  renderInterface,
  linkPath,
  meshId,
  fallbackOrder,
}: {
  renderInterface: any;
  linkPath: string;
  meshId: string;
  fallbackOrder: number;
}): number {
  const truth = renderInterface?.getUrdfTruthForCurrentStage?.();
  const runtimeEntry = renderInterface?.getUrdfCollisionEntryForMeshId?.(meshId);
  const linkName = getPathBasename(linkPath);
  const authoredEntries = linkName
    ? truth?.collisionsByLinkName?.get?.(linkName)?.all
    : null;

  if (runtimeEntry && Array.isArray(authoredEntries)) {
    const authoredIndex = authoredEntries.indexOf(runtimeEntry);
    if (authoredIndex >= 0) {
      return authoredIndex;
    }
  }

  return fallbackOrder;
}

function isUsdVisualMeshId(meshId: string, meshName = ''): boolean {
  return USD_VISUAL_SEGMENT_PATTERN.test(String(meshId || '').toLowerCase())
    || USD_VISUAL_SEGMENT_PATTERN.test(String(meshName || '').toLowerCase());
}

function isUsdCollisionMeshId(meshId: string, meshName = ''): boolean {
  return USD_COLLISION_SEGMENT_PATTERN.test(String(meshId || '').toLowerCase())
    || USD_COLLISION_SEGMENT_PATTERN.test(String(meshName || '').toLowerCase());
}

function getUsdMeshRole(meshId: string, meshName = ''): UsdMeshRole {
  if (isUsdCollisionMeshId(meshId, meshName)) {
    return 'collision';
  }

  return isUsdVisualMeshId(meshId, meshName) ? 'visual' : 'visual';
}

function areSelectionStatesEqual(
  left: URDFViewerProps['selection'] | URDFViewerProps['hoveredSelection'],
  right: URDFViewerProps['selection'] | URDFViewerProps['hoveredSelection'],
): boolean {
  return (left?.type ?? null) === (right?.type ?? null)
    && (left?.id ?? null) === (right?.id ?? null)
    && left?.subType === right?.subType
    && (left?.objectIndex ?? -1) === (right?.objectIndex ?? -1);
}

function captureHighlightedMeshSnapshot(mesh: THREE.Mesh): HighlightedMeshSnapshot {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];

  return {
    material: mesh.material,
    renderOrder: mesh.renderOrder,
    materialStates: materials.map((material) => ({
      transparent: material?.transparent ?? false,
      opacity: material?.opacity ?? 1,
      depthTest: material?.depthTest ?? true,
      depthWrite: material?.depthWrite ?? true,
    })),
  };
}

function restoreHighlightedMeshSnapshot(mesh: THREE.Mesh, snapshot: HighlightedMeshSnapshot): void {
  mesh.material = snapshot.material;
  mesh.renderOrder = snapshot.renderOrder;

  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  materials.forEach((material, index) => {
    const materialState = snapshot.materialStates[index];
    if (!material || !materialState) return;

    material.transparent = materialState.transparent;
    material.opacity = materialState.opacity;
    material.depthTest = materialState.depthTest;
    material.depthWrite = materialState.depthWrite;
    material.needsUpdate = true;
  });
}

function disposeUsdOverrideMaterial(material: THREE.Material | THREE.Material[] | undefined): void {
  const materials = Array.isArray(material) ? material : [material];
  materials.forEach((entry) => {
    entry?.dispose?.();
  });
}

function createUsdVisualColorOverrideMaterial(
  material: THREE.Material,
  colorOverride: string,
): THREE.Material {
  const clonedMaterial = material.clone();
  const materialWithColor = clonedMaterial as THREE.Material & { color?: THREE.Color; map?: unknown };
  if (materialWithColor.color && !materialWithColor.map) {
    materialWithColor.color = materialWithColor.color.clone();
    materialWithColor.color.set(colorOverride);
  }
  clonedMaterial.needsUpdate = true;
  return clonedMaterial;
}

function syncUsdVisualColorOverride(mesh: THREE.Mesh, colorOverride: string | null): void {
  const meshUserData = mesh.userData as THREE.Object3D['userData'] & {
    __usdOriginalVisualMaterial?: THREE.Material | THREE.Material[];
    __usdVisualColorOverride?: string | null;
    __usdVisualOverrideMaterial?: THREE.Material | THREE.Material[];
  };

  if (!colorOverride) {
    if (meshUserData.__usdOriginalVisualMaterial) {
      mesh.material = meshUserData.__usdOriginalVisualMaterial;
    }
    if (meshUserData.__usdVisualOverrideMaterial) {
      disposeUsdOverrideMaterial(meshUserData.__usdVisualOverrideMaterial);
    }
    delete meshUserData.__usdVisualOverrideMaterial;
    delete meshUserData.__usdVisualColorOverride;
    return;
  }

  if (!meshUserData.__usdOriginalVisualMaterial) {
    meshUserData.__usdOriginalVisualMaterial = mesh.material;
  }

  if (meshUserData.__usdVisualColorOverride === colorOverride && meshUserData.__usdVisualOverrideMaterial) {
    mesh.material = meshUserData.__usdVisualOverrideMaterial;
    return;
  }

  if (meshUserData.__usdVisualOverrideMaterial) {
    disposeUsdOverrideMaterial(meshUserData.__usdVisualOverrideMaterial);
  }

  const originalMaterial = meshUserData.__usdOriginalVisualMaterial;
  const overrideMaterial = Array.isArray(originalMaterial)
    ? originalMaterial.map((material) => createUsdVisualColorOverrideMaterial(material, colorOverride))
    : createUsdVisualColorOverrideMaterial(originalMaterial, colorOverride);

  meshUserData.__usdVisualOverrideMaterial = overrideMaterial;
  meshUserData.__usdVisualColorOverride = colorOverride;
  mesh.material = overrideMaterial;
}

function toVirtualUsdPath(path: string): string {
  const normalizedPath = path.replace(/\\/g, '/').replace(/^\/+/, '');
  return `/${normalizedPath}`;
}

function getVirtualUsdDirectory(path: string): string {
  const normalizedPath = toVirtualUsdPath(path);
  const lastSlashIndex = normalizedPath.lastIndexOf('/');
  if (lastSlashIndex < 0) return '/';
  return normalizedPath.slice(0, lastSlashIndex + 1);
}

function getSharedConfigurationVirtualPath(path: string): string | null {
  const normalizedPath = toVirtualUsdPath(path);
  if (!normalizedPath.toLowerCase().includes('/configuration/')) return null;

  const fileName = normalizedPath.split('/').pop();
  if (!fileName) return null;
  return `/configuration/${fileName}`;
}

function inferUsdDependencyStem(stagePath: string): string | null {
  const normalizedPath = toVirtualUsdPath(stagePath).toLowerCase();
  const fileName = normalizedPath.split('/').pop() || '';
  if (!fileName) return null;

  const mappedStem = dependencyStemByRootUsdFile[fileName];
  if (mappedStem) return mappedStem;

  const inferredStem = fileName.replace(/\.usd[a-z]?$/i, '');
  if (!inferredStem) return null;
  if (!normalizedPath.includes('/configuration/')) return inferredStem;

  return inferredStem.replace(/_(base|physics|robot|sensor)$/i, '');
}

function buildCriticalUsdDependencyPaths(stagePath: string): string[] {
  const normalizedStagePath = toVirtualUsdPath(stagePath);
  const dependencyStem = inferUsdDependencyStem(normalizedStagePath);
  if (!dependencyStem) return [];

  const rootDirectory = getVirtualUsdDirectory(normalizedStagePath);
  const configurationDirectory = rootDirectory.toLowerCase().endsWith('/configuration/')
    ? rootDirectory
    : `${rootDirectory}configuration/`;

  const suffixes = dependencyStem === 'h1_2_handless'
    ? ['base', 'physics', 'robot']
    : ['base', 'physics', 'sensor'];

  return suffixes.map((suffix) => `${configurationDirectory}${dependencyStem}_${suffix}.usd`);
}

function getRuntimeWindow(): RuntimeWindow {
  return window as RuntimeWindow;
}

function disposeUsdRootChildren(rootGroup: THREE.Group): void {
  const children = [...rootGroup.children];
  children.forEach((child) => {
    disposeObject3D(child, true);
  });
}

async function preloadUsdEntry(
  runtime: UsdWasmRuntime,
  entry: PreloadEntry,
  isActive: () => boolean,
): Promise<boolean> {
  if (!isActive()) return false;

  let blob: Blob;
  try {
    blob = await entry.loadBlob();
  } catch (error) {
    console.warn(`Skipping USD dependency preload for ${entry.path}`, error);
    return false;
  }
  if (!isActive()) return false;

  const loaded = await writeUsdBlobToVirtualPath(runtime, entry.path, blob, isActive);
  if (!loaded) return false;

  const sharedConfigurationPath = getSharedConfigurationVirtualPath(entry.path);
  if (
    sharedConfigurationPath
    && sharedConfigurationPath !== entry.path
    && !runtime.usdFsHelper.hasVirtualFilePath(sharedConfigurationPath)
  ) {
    await writeUsdBlobToVirtualPath(runtime, sharedConfigurationPath, blob, isActive);
  }

  return runtime.usdFsHelper.hasVirtualFilePath(entry.path);
}

async function writeUsdBlobToVirtualPath(
  runtime: UsdWasmRuntime,
  virtualPath: string,
  blob: Blob,
  isActive: () => boolean,
): Promise<boolean> {
  if (!isActive()) return false;

  const fileName = virtualPath.split('/').pop() || 'resource.usd';
  const browserFile = new File([blob], fileName, {
    type: blob.type || 'application/octet-stream',
  });

  await runtime.loadVirtualFile({
    USD: runtime.USD,
    usdFsHelper: runtime.usdFsHelper,
    messageLog: null,
    file: browserFile,
    fullPath: virtualPath,
    isRootFile: false,
    onLoadRootUsdPath: async () => {},
  });

  return runtime.usdFsHelper.hasVirtualFilePath(virtualPath);
}

async function preloadUsdDependencies(
  runtime: UsdWasmRuntime,
  entries: PreloadEntry[],
  isActive: () => boolean,
): Promise<void> {
  for (const entry of entries) {
    if (!isActive()) return;
    await preloadUsdEntry(runtime, entry, isActive);
  }
}

async function ensureCriticalUsdDependenciesLoaded(
  runtime: UsdWasmRuntime,
  stagePath: string,
  entries: PreloadEntry[],
  isActive: () => boolean,
): Promise<void> {
  const entryByPath = new Map(entries.map((entry) => [entry.path, entry]));
  const requiredPaths = buildCriticalUsdDependencyPaths(stagePath);
  if (requiredPaths.length === 0) return;

  const missingPaths: string[] = [];
  for (const requiredPath of requiredPaths) {
    if (!isActive()) return;

    if (runtime.usdFsHelper.hasVirtualFilePath(requiredPath)) continue;

    const exactEntry = entryByPath.get(requiredPath);

    let loaded = false;

    if (exactEntry) {
      loaded = await preloadUsdEntry(runtime, exactEntry, isActive);
    }

    if (!loaded) {
      const fileName = requiredPath.split('/').pop();
      const sharedConfigurationPath = fileName ? `/configuration/${fileName}` : null;

      if (sharedConfigurationPath) {
        try {
          const response = await fetch(sharedConfigurationPath);
          if (response.ok) {
            const sharedConfigurationBlob = await response.blob();
            loaded = await writeUsdBlobToVirtualPath(runtime, sharedConfigurationPath, sharedConfigurationBlob, isActive);
            if (loaded) {
              loaded = await writeUsdBlobToVirtualPath(runtime, requiredPath, sharedConfigurationBlob, isActive);
            }
          }
        } catch (error) {
          console.warn(`Skipping shared USD configuration preload for ${requiredPath}`, error);
        }
      }
    }

    if (!loaded) {
      missingPaths.push(requiredPath);
    }
  }

  if (missingPaths.length > 0) {
    console.warn('Critical USD dependency paths are missing before stage load.', {
      stagePath,
      missingPaths,
      availableEntryPaths: Array.from(entryByPath.keys()),
    });
  }
}

export function UsdWasmStage({
  active = true,
  sourceFile,
  availableFiles,
  assets,
  mode,
  justSelectedRef,
  groundPlaneOffset = 0,
  selection,
  hoveredSelection,
  hoverSelectionEnabled = true,
  onHover,
  onMeshSelect,
  showOrigins,
  showOriginsOverlay,
  originSize,
  showJointAxes,
  showJointAxesOverlay,
  jointAxisSize,
  highlightMode,
  showCenterOfMass,
  showCoMOverlay,
  centerOfMassSize,
  showInertia,
  showInertiaOverlay,
  showVisual,
  showCollision,
  toolMode,
  robotLinks,
  transformMode = 'select',
  onCollisionTransformPreview,
  onCollisionTransformEnd,
  onTransformPending,
  setIsDragging,
  loadingLabel,
  loadingDetailLabel,
  loadingPhaseLabels,
  onRobotDataResolved,
  runtimeBridge,
  measureTargetResolverRef,
}: UsdWasmStageProps) {
  const rootGroup = useMemo(() => {
    const group = new THREE.Group();
    group.name = 'usd-wasm-root';
    return group;
  }, []);
  const threeState = useThree();
  const { camera, scene, invalidate, gl } = threeState;
  const controls = (threeState as typeof threeState & { controls?: unknown }).controls;
  const onRuntimeRobotResolved = runtimeBridge?.onRobotResolved;
  const onRuntimeSelectionChange = runtimeBridge?.onSelectionChange;
  const onRuntimeActiveJointChange = runtimeBridge?.onActiveJointChange;
  const onRuntimeJointAnglesChange = runtimeBridge?.onJointAnglesChange;
  const driverRef = useRef<any>(null);
  const runtimeRef = useRef<UsdWasmRuntime | null>(null);
  const renderInterfaceRef = useRef<any>(null);
  const activeRef = useRef(active);
  const resolvedRobotDataRef = useRef<ViewerRobotDataResolution | null>(null);
  const jointAxesResolutionRef = useRef<ViewerRobotDataResolution | null>(null);
  const baselineRobotLinksRef = useRef<Record<string, UrdfLink> | null>(null);
  const collisionMeshObjectIndexByMeshIdRef = useRef(new Map<string, number | undefined>());
  const previousCollisionCountByLinkPathRef = useRef(new Map<string, number>());
  const previousSelectionRef = useRef<URDFViewerProps['selection']>(selection);
  const meshMetaByObjectRef = useRef(new Map<THREE.Object3D, RuntimeMeshMeta>());
  const meshesByLinkKeyRef = useRef(new Map<string, THREE.Mesh[]>());
  const pickMeshesRef = useRef<THREE.Object3D[]>([]);
  const baseLocalMatrixByMeshRef = useRef<WeakMap<THREE.Object3D, THREE.Matrix4>>(new WeakMap());
  const highlightedMeshesRef = useRef(new Map<THREE.Mesh, HighlightedMeshSnapshot>());
  const initialGroundedLowestZRef = useRef<number | null>(null);
  const linkAxesControllerRef = useRef(new LinkAxesController());
  const linkDynamicsControllerRef = useRef(new LinkDynamicsController());
  const linkRotationControllerRef = useRef(new LinkRotationController());
  const jointAxesControllerRef = useRef(new UsdJointAxesController());
  const loadTokenRef = useRef(0);
  const lastRuntimeSelectionRef = useRef<URDFViewerProps['selection']>({
    type: null,
    id: null,
    subType: undefined,
    objectIndex: undefined,
  });
  const lastPointerDownMeshMetaRef = useRef<RuntimeMeshMeta | null>(null);
  const lastRuntimeJointAnglesRef = useRef<Record<string, number>>({});
  const lastRuntimeHoverRef = useRef<URDFViewerProps['hoveredSelection']>({
    type: null,
    id: null,
    subType: undefined,
    objectIndex: undefined,
  });
  const selectionResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visibilityRef = useRef({ showVisual, showCollision });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState<UsdLoadingProgress | null>(null);
  const [visibleStagePath, setVisibleStagePath] = useState<string | null>(null);
  const [previewCollisionTransform, setPreviewCollisionTransform] = useState<RuntimePreviewCollisionTransform | null>(null);
  const runtimeDecorationRefreshTimerRef = useRef<number | null>(null);
  const interactionPolicy = useMemo(() => resolveUsdStageInteractionPolicy(mode), [mode]);
  const jointRotationRuntime = useMemo(() => (
    resolveUsdStageJointRotationRuntime({
      mode,
      highlightMode,
      showVisual,
      showCollision,
      toolMode,
    })
  ), [highlightMode, mode, showCollision, showVisual, toolMode]);
  const jointRotationRuntimeRef = useRef(jointRotationRuntime);
  const gizmoTargetsRef = useRef<THREE.Object3D[]>([]);
  const gizmoTargetsCacheKeyRef = useRef('');
  const gizmoTargetsUpdatedAtRef = useRef(0);
  const hoverPointerClientRef = useRef<{ x: number; y: number } | null>(null);
  const hoverPointerInsideRef = useRef(false);
  const hoverNeedsRaycastRef = useRef(false);
  const lastHoverCameraPositionRef = useRef(new THREE.Vector3());
  const lastHoverCameraQuaternionRef = useRef(new THREE.Quaternion());
  const runtimePointerRef = useRef(new THREE.Vector2());
  const runtimeRaycasterRef = useRef(new THREE.Raycaster());
  const loadingHudState = useMemo(() => buildViewerLoadingHudState({
    loadedCount: loadingProgress?.loadedCount,
    totalCount: loadingProgress?.totalCount,
    progressPercent: loadingProgress?.progressPercent,
    fallbackDetail: loadingDetailLabel,
  }), [loadingDetailLabel, loadingProgress?.loadedCount, loadingProgress?.progressPercent, loadingProgress?.totalCount]);
  const loadingStageLabel = loadingProgress?.phase && loadingProgress.phase !== 'ready'
    ? loadingPhaseLabels[loadingProgress.phase]
    : null;
  const loadingDetail = loadingHudState.detail === loadingStageLabel ? '' : loadingHudState.detail;

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    visibilityRef.current = { showVisual, showCollision };
  }, [showCollision, showVisual]);

  useEffect(() => {
    previousSelectionRef.current = selection;
  }, [selection]);

  useEffect(() => {
    markUsdHoverRaycastDirty(hoverNeedsRaycastRef, invalidate);
  }, [highlightMode, interactionPolicy.enableContinuousHover, invalidate, showCollision, showVisual]);

  useEffect(() => {
    jointRotationRuntimeRef.current = jointRotationRuntime;
  }, [jointRotationRuntime]);

  useEffect(() => {
    const linkRotationController = linkRotationControllerRef.current;
    linkRotationController.setPickSubType(jointRotationRuntime.pickSubType);
    linkRotationController.setEnabled(active && jointRotationRuntime.enabled);
    markUsdHoverRaycastDirty(hoverNeedsRaycastRef, invalidate);
  }, [active, invalidate, jointRotationRuntime.enabled, jointRotationRuntime.pickSubType]);

  useEffect(() => {
    if (
      mode !== 'detail'
      || transformMode === 'select'
      || selection?.type !== 'link'
      || selection.subType !== 'collision'
      || !selection.id
    ) {
      setPreviewCollisionTransform(null);
    }
  }, [mode, selection, transformMode]);

  const resolveUsdCollisionTransformTarget = useCallback((
    currentSelection: NonNullable<URDFViewerProps['selection']>,
  ): UsdCollisionTransformTarget | null => {
    if (currentSelection.type !== 'link' || currentSelection.subType !== 'collision' || !currentSelection.id) {
      return null;
    }

    if (!Number.isInteger(currentSelection.objectIndex)) {
      return null;
    }

    const resolvedRobotData = resolvedRobotDataRef.current;
    const renderInterface = renderInterfaceRef.current;
    if (!resolvedRobotData || !renderInterface) {
      return null;
    }

    const linkId = currentSelection.id;
    const objectIndex = currentSelection.objectIndex;
    const linkPath = resolvedRobotData.linkPathById[linkId];
    if (!linkPath) {
      return null;
    }

    return {
      linkId,
      objectIndex,
      getGeometry: () => {
        const activeResolution = resolvedRobotDataRef.current;
        if (!activeResolution) {
          return undefined;
        }

        const currentRobotLinks = robotLinks || activeResolution.robotData.links;
        return resolveUsdRuntimeGeometry(currentRobotLinks[linkId], 'collision', objectIndex);
      },
      getLinkWorldMatrix: () => {
        const activeRenderInterface = renderInterfaceRef.current;
        if (!activeRenderInterface) {
          return null;
        }

        return linkRotationControllerRef.current.getCurrentLinkFrameMatrix(linkPath)
          ?? activeRenderInterface.getPreferredLinkWorldTransform?.(linkPath)
          ?? activeRenderInterface.getWorldTransformForPrimPath?.(linkPath)
          ?? null;
      },
      getMeshWorldMatrix: () => {
        let fallbackMesh: THREE.Mesh | null = null;
        let visibleMesh: THREE.Mesh | null = null;

        meshMetaByObjectRef.current.forEach((meta, object) => {
          if (
            meta.role !== 'collision'
            || meta.linkPath !== linkPath
            || meta.objectIndex !== objectIndex
            || !(object instanceof THREE.Mesh)
          ) {
            return;
          }

          fallbackMesh ||= object;
          if (object.visible) {
            visibleMesh ||= object;
          }
        });

        const selectedMesh = visibleMesh ?? fallbackMesh;
        if (!selectedMesh) {
          return null;
        }

        selectedMesh.updateMatrixWorld(true);
        return selectedMesh.matrixWorld.clone();
      },
    };
  }, [robotLinks]);

  const handleUsdCollisionTransformPreview = useCallback((
    linkId: string,
    position: { x: number; y: number; z: number },
    rotation: { r: number; p: number; y: number },
    objectIndex?: number,
  ) => {
    if (!Number.isInteger(objectIndex)) {
      setPreviewCollisionTransform(null);
      return;
    }

    setPreviewCollisionTransform({
      linkId,
      objectIndex,
      position,
      rotation,
    });
    onCollisionTransformPreview?.(linkId, position, rotation, objectIndex);
  }, [onCollisionTransformPreview]);

  const handleUsdCollisionTransformEnd = useCallback((
    linkId: string,
    position: { x: number; y: number; z: number },
    rotation: { r: number; p: number; y: number },
    objectIndex?: number,
  ) => {
    onCollisionTransformEnd?.(linkId, position, rotation, objectIndex);
  }, [onCollisionTransformEnd]);

  const handleUsdCollisionTransformPending = useCallback((pending: boolean) => {
    if (!pending) {
      setPreviewCollisionTransform(null);
    }
    onTransformPending?.(pending);
  }, [onTransformPending]);

  const rebuildRuntimeMeshIndex = useCallback((): RuntimeMeshIndex => {
    const renderInterface = renderInterfaceRef.current;
    const resolvedRobotData = resolvedRobotDataRef.current;
    const currentRobotLinks = robotLinks || resolvedRobotData?.robotData.links || {};
    const nextMeshMetaByObject = new Map<THREE.Object3D, RuntimeMeshMeta>();
    const nextMeshesByLinkKey = new Map<string, THREE.Mesh[]>();
    const nextPickMeshes: THREE.Mesh[] = [];
    const nextCollisionMeshGroups = new Map<string, Array<{ mesh: THREE.Mesh; meta: RuntimeMeshMeta }>>();
    const nextCollisionAssignments = new Map<string, number | undefined>();
    const nextCollisionCountByLinkPath = new Map<string, number>();
    const collisionMeshFallbackOrderByLinkPath = new Map<string, number>();
    const previousCollisionCounts = previousCollisionCountByLinkPathRef.current;
    const previousSelection = previousSelectionRef.current;

    for (const [meshId, hydraMesh] of Object.entries(renderInterface?.meshes || {})) {
      const meshRecord = hydraMesh as { _mesh?: THREE.Mesh } | null;
      const mesh = meshRecord?._mesh;
      if (!mesh) continue;

      const resolvedPrimPath = (
        renderInterface?.getResolvedVisualTransformPrimPathForMeshId?.(meshId)
        || renderInterface?.getResolvedPrimPathForMeshId?.(meshId)
        || null
      );
      const linkPath = resolveUsdRuntimeLinkPathForMesh({
        meshId,
        resolution: resolvedRobotData,
        resolvedPrimPath,
      });
      if (!linkPath) continue;

      const role = getUsdMeshRole(meshId, mesh.name || '');
      const fallbackOrder = collisionMeshFallbackOrderByLinkPath.get(linkPath) ?? 0;
      if (role === 'collision') {
        collisionMeshFallbackOrderByLinkPath.set(linkPath, fallbackOrder + 1);
      }
      const authoredOrder = role === 'collision'
        ? resolveUsdCollisionMeshAuthoredOrder({
            renderInterface,
            linkPath,
            meshId,
            fallbackOrder,
          })
        : parseUsdMeshObjectIndex(meshId);
      mesh.userData = mesh.userData || {};
      mesh.userData.geometryRole = role;
      mesh.userData.isCollisionMesh = role === 'collision';
      mesh.userData.isVisualMesh = role === 'visual';
      mesh.userData.usdObjectIndex = role === 'collision'
        ? undefined
        : authoredOrder;
      mesh.userData.usdLinkPath = linkPath;
      mesh.userData.usdMeshId = meshId;

      if (role === 'visual') {
        prepareUsdVisualMesh(mesh);
      }

      const meta: RuntimeMeshMeta = {
        linkPath,
        meshId,
        authoredOrder,
        objectIndex: role === 'collision' ? undefined : authoredOrder,
        role,
      };
      nextMeshMetaByObject.set(mesh, meta);
      nextPickMeshes.push(mesh);

      const key = `${linkPath}:${role}`;
      const meshes = nextMeshesByLinkKey.get(key) || [];
      meshes.push(mesh);
      nextMeshesByLinkKey.set(key, meshes);

      if (role === 'collision') {
        const collisionMeshes = nextCollisionMeshGroups.get(linkPath) || [];
        collisionMeshes.push({ mesh, meta });
        nextCollisionMeshGroups.set(linkPath, collisionMeshes);
      }
    }

    nextCollisionMeshGroups.forEach((collisionMeshes, linkPath) => {
      const linkId = resolvedRobotData?.linkIdByPath[linkPath];
      const linkData = linkId ? currentRobotLinks[linkId] : undefined;
      const currentCount = linkData ? getCollisionGeometryEntries(linkData).length : 0;
      nextCollisionCountByLinkPath.set(linkPath, currentCount);

      const previousCount = previousCollisionCounts.get(linkPath);
      const shouldApplyDeleteShift = (
        previousCount !== undefined
        && previousCount - currentCount === 1
        && previousSelection?.type === 'link'
        && previousSelection.subType === 'collision'
        && previousSelection.id
        && typeof previousSelection.objectIndex === 'number'
        && previousSelection.id === linkId
      );

      const previousAssignments = new Map<string, number>();
      collisionMeshes.forEach(({ meta }) => {
        const previousObjectIndex = collisionMeshObjectIndexByMeshIdRef.current.get(meta.meshId);
        if (Number.isInteger(previousObjectIndex)) {
          previousAssignments.set(meta.meshId, previousObjectIndex as number);
        }
      });

      const reconciledAssignments = reconcileUsdCollisionMeshAssignments({
        meshes: collisionMeshes.map(({ meta }) => ({
          meshId: meta.meshId,
          authoredOrder: meta.authoredOrder ?? 0,
        })),
        currentCount,
        previousAssignments,
        deletedObjectIndex: shouldApplyDeleteShift ? previousSelection.objectIndex ?? null : null,
      });

      collisionMeshes.forEach(({ mesh, meta }) => {
        const objectIndex = reconciledAssignments.get(meta.meshId);
        meta.objectIndex = objectIndex;
        mesh.userData.usdObjectIndex = objectIndex;
        nextCollisionAssignments.set(meta.meshId, objectIndex);
      });
    });

    collisionMeshObjectIndexByMeshIdRef.current = nextCollisionAssignments;
    previousCollisionCountByLinkPathRef.current = nextCollisionCountByLinkPath;
    meshMetaByObjectRef.current = nextMeshMetaByObject;
    meshesByLinkKeyRef.current = nextMeshesByLinkKey;
    pickMeshesRef.current = nextPickMeshes;
    return {
      meshMetaByObject: nextMeshMetaByObject,
      meshesByLinkKey: nextMeshesByLinkKey,
      pickMeshes: nextPickMeshes,
    };
  }, [robotLinks]);

  const getGizmoTargets = useCallback(() => {
    const nextCacheKey = [
      scene.children.length,
      mode,
      transformMode,
      selection?.type ?? 'none',
      selection?.id ?? '',
    ].join(':');
    const now = performance.now();

    if (
      gizmoTargetsCacheKeyRef.current !== nextCacheKey
      || now - gizmoTargetsUpdatedAtRef.current > 120
    ) {
      gizmoTargetsRef.current = collectGizmoRaycastTargets(scene);
      gizmoTargetsCacheKeyRef.current = nextCacheKey;
      gizmoTargetsUpdatedAtRef.current = now;
    }

    return gizmoTargetsRef.current;
  }, [mode, scene, selection?.id, selection?.type, transformMode]);

  useEffect(() => {
    if (!measureTargetResolverRef) {
      return undefined;
    }

    const resolveMeasureTarget: MeasureTargetResolver = (selection, fallbackSelection, anchorMode) => (
      resolveUsdMeasureTargetFromSelection({
        resolution: resolvedRobotDataRef.current,
        meshesByLinkKey: meshesByLinkKeyRef.current,
        linkWorldTransformResolver: (linkPath) => (
          linkRotationControllerRef.current.getCurrentLinkFrameMatrix(linkPath)
          ?? renderInterfaceRef.current?.getPreferredLinkWorldTransform?.(linkPath)
          ?? renderInterfaceRef.current?.getWorldTransformForPrimPath?.(linkPath)
          ?? null
        ),
      }, selection, fallbackSelection, anchorMode)
    );

    measureTargetResolverRef.current = resolveMeasureTarget;

    return () => {
      if (measureTargetResolverRef.current === resolveMeasureTarget) {
        measureTargetResolverRef.current = null;
      }
    };
  }, [measureTargetResolverRef]);

  const revertUsdHighlights = useCallback(() => {
    highlightedMeshesRef.current.forEach((snapshot, mesh) => {
      restoreHighlightedMeshSnapshot(mesh, snapshot);
    });
    highlightedMeshesRef.current.clear();
  }, []);

  const applyUsdHighlight = useCallback((candidate?: URDFViewerProps['selection']) => {
    const resolvedRobotData = resolvedRobotDataRef.current;
    if (!resolvedRobotData || !candidate?.type || !candidate.id) {
      return;
    }

    const targetLinkPath = candidate.type === 'joint'
      ? resolvedRobotData.childLinkPathByJointId[candidate.id]
      : resolvedRobotData.linkPathById[candidate.id];
    if (!targetLinkPath) {
      return;
    }

    const targetRole: UsdMeshRole = (candidate.subType ?? (highlightMode === 'collision' ? 'collision' : 'visual')) === 'collision'
      ? 'collision'
      : 'visual';
    if ((targetRole === 'visual' && !showVisual) || (targetRole === 'collision' && !showCollision)) {
      return;
    }

    const { meshesByLinkKey } = rebuildRuntimeMeshIndex();
    const meshes = meshesByLinkKey.get(`${targetLinkPath}:${targetRole}`) || [];
    for (const mesh of meshes) {
      if (!mesh.visible || mesh.userData?.isGizmo) continue;
      if (
        targetRole === 'collision'
        && typeof candidate.objectIndex === 'number'
        && (mesh.userData?.usdObjectIndex ?? -1) !== candidate.objectIndex
      ) {
        continue;
      }
      if (!highlightedMeshesRef.current.has(mesh)) {
        highlightedMeshesRef.current.set(mesh, captureHighlightedMeshSnapshot(mesh));
      }
      mesh.material = targetRole === 'collision' ? collisionHighlightMaterial : highlightMaterial;
      mesh.renderOrder = targetRole === 'collision' ? 1000 : 1001;
    }
  }, [highlightMode, rebuildRuntimeMeshIndex, showCollision, showVisual]);

  const syncUsdHighlights = useCallback(() => {
    revertUsdHighlights();
    applyUsdHighlight(selection);
    applyUsdHighlight(hoverSelectionEnabled ? hoveredSelection : undefined);
    invalidate();
  }, [applyUsdHighlight, hoveredSelection, hoverSelectionEnabled, invalidate, revertUsdHighlights, selection]);

  const captureUsdInitialGroundBaseline = useCallback(() => {
    let lowestVisualZ = getLowestMeshZ(rootGroup, {
      includeInvisible: false,
      includeVisual: true,
      includeCollision: false,
    });

    if (lowestVisualZ === null) {
      lowestVisualZ = getLowestMeshZ(rootGroup, {
        includeInvisible: true,
        includeVisual: true,
        includeCollision: false,
      });
    }

    initialGroundedLowestZRef.current = lowestVisualZ;
    return lowestVisualZ;
  }, [rootGroup]);

  const alignUsdRootToGround = useCallback((lowestVisualZ?: number | null) => {
    const baseline = lowestVisualZ ?? initialGroundedLowestZRef.current;
    if (baseline === null || baseline === undefined) {
      return false;
    }

    rootGroup.position.z = groundPlaneOffset - baseline;
    rootGroup.updateMatrixWorld(true);
    return true;
  }, [groundPlaneOffset, rootGroup]);

  const sampleUsdAutoFrameBounds = useCallback(() => {
    const bounds = computeVisibleBounds(rootGroup);
    return {
      stabilityKey: createCameraFrameStabilityKey(bounds),
      state: bounds,
    };
  }, [rootGroup]);

  const applyUsdCameraFrame = useCallback((bounds?: THREE.Box3 | null) => {
    if (!activeRef.current) return false;

    const orbitControls = controls as ViewerControls | null;
    if (!orbitControls?.target) return false;

    const frameBounds = bounds ?? computeVisibleBounds(rootGroup);
    const frame = computeCameraFrame(rootGroup, camera, orbitControls.target, frameBounds);
    if (!frame) return false;

    orbitControls.target.copy(frame.focusTarget);
    camera.position.copy(frame.cameraPosition);
    if ('updateProjectionMatrix' in camera && typeof camera.updateProjectionMatrix === 'function') {
      camera.updateProjectionMatrix();
    }
    orbitControls.update?.();
    invalidate();
    return true;
  }, [camera, controls, invalidate, rootGroup]);

  const applyUsdRuntimeLinkOverrides = useCallback(() => {
    const resolvedRobotData = resolvedRobotDataRef.current;
    const renderInterface = renderInterfaceRef.current;
    if (
      !resolvedRobotData
      || !renderInterface
      || resolvedRobotData.runtimeLinkMappingMode === 'synthetic-root'
    ) {
      return;
    }

    const currentRobotLinks = robotLinks || resolvedRobotData.robotData.links;
    const baselineRobotLinks = baselineRobotLinksRef.current;

    meshMetaByObjectRef.current.forEach((meta, object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh?.isMesh) {
        return;
      }

      const linkId = resolvedRobotData.linkIdByPath[meta.linkPath];
      const linkData = linkId ? currentRobotLinks[linkId] : undefined;
      const baseGeometry = (
        meta.role === 'collision' && !Number.isInteger(meta.objectIndex)
      )
        ? undefined
        : resolveUsdRuntimeGeometry(linkData, meta.role, meta.objectIndex);
      const baselineLinkData = linkId ? baselineRobotLinks?.[linkId] : undefined;
      const baselineGeometry = (
        meta.role === 'collision' && !Number.isInteger(meta.objectIndex)
      )
        ? undefined
        : resolveUsdRuntimeGeometry(baselineLinkData, meta.role, meta.objectIndex);
      const geometry = (
        meta.role === 'collision'
        && previewCollisionTransform
        && linkId === previewCollisionTransform.linkId
        && meta.objectIndex === previewCollisionTransform.objectIndex
        && baseGeometry
      )
        ? {
            ...baseGeometry,
            origin: {
              xyz: previewCollisionTransform.position,
              rpy: previewCollisionTransform.rotation,
            },
          }
        : baseGeometry;
      mesh.visible = meta.role === 'collision' && !Number.isInteger(meta.objectIndex)
        ? false
        : isUsdRuntimeGeometryVisible({
            link: linkData,
            role: meta.role,
            objectIndex: meta.objectIndex,
            showVisual,
            showCollision,
          });

      if (meta.role === 'visual') {
        if (!highlightedMeshesRef.current.has(mesh)) {
          syncUsdVisualColorOverride(
            mesh,
            resolveUsdVisualColorOverride(geometry, baselineGeometry ?? geometry),
          );
        }
      }

      if (!mesh.visible) {
        return;
      }

      const linkWorldMatrix = linkRotationControllerRef.current.getCurrentLinkFrameMatrix(meta.linkPath)
        ?? renderInterface.getPreferredLinkWorldTransform?.(meta.linkPath)
        ?? renderInterface.getWorldTransformForPrimPath?.(meta.linkPath)
        ?? null;
      if (!linkWorldMatrix) {
        return;
      }

      let baseLocalMatrix = baseLocalMatrixByMeshRef.current.get(mesh);
      if (!baseLocalMatrix) {
        baseLocalMatrix = deriveUsdMeshBaseLocalMatrix({
          authoredWorldMatrix: mesh.matrix,
          baselineGeometry,
          linkWorldMatrix,
        });
        baseLocalMatrixByMeshRef.current.set(mesh, baseLocalMatrix);
      }

      mesh.matrix.copy(composeUsdMeshOverrideWorldMatrixFromBaseLocal({
        baseLocalMatrix,
        geometry,
        linkWorldMatrix,
      }));
      mesh.matrixAutoUpdate = false;
      mesh.matrixWorldNeedsUpdate = true;
    });

    linkDynamicsControllerRef.current.linkDynamicsByLinkPath = buildUsdLinkDynamicsRecordMap({
      resolution: resolvedRobotData,
      robotLinks: currentRobotLinks,
    });
  }, [previewCollisionTransform, robotLinks, showCollision, showVisual]);

  const refreshRuntimeDecorations = useCallback(() => {
    const runtime = runtimeRef.current;
    const renderInterface = renderInterfaceRef.current;
    if (!runtime || !renderInterface) return;

    runtime.applyMeshVisibilityFilters(renderInterface, showVisual, showCollision);
    rebuildRuntimeMeshIndex();

    const linkRotationController = linkRotationControllerRef.current;
    linkRotationController.apply(renderInterface, { force: true });
    applyUsdRuntimeLinkOverrides();

    linkAxesControllerRef.current.rebuild(rootGroup, renderInterface, {
      showLinkAxes: showOrigins,
      axisSize: originSize,
      linkFrameResolver: (linkPath) => linkRotationController.getCurrentLinkFrameMatrix(linkPath),
      overlay: showOriginsOverlay,
    });

    jointAxesControllerRef.current.rebuild({
      jointAxisSize,
      linkFrameResolver: (linkPath) => linkRotationController.getCurrentLinkFrameMatrix(linkPath),
      overlay: showJointAxesOverlay,
      renderInterface,
      resolution: jointAxesResolutionRef.current ?? resolvedRobotDataRef.current,
      showJointAxes,
      usdRoot: rootGroup,
    });

    const linkDynamicsController = linkDynamicsControllerRef.current;
    linkDynamicsController.setCurrentLinkFrameResolver((linkPath) => (
      linkRotationController.getCurrentLinkFrameMatrix(linkPath)
    ));
    linkDynamicsController.clear(rootGroup, { invalidateRequestId: false });
    void linkDynamicsController.rebuild(rootGroup, renderInterface, {
      showCenterOfMass,
      showCoMOverlay,
      centerOfMassSize,
      showInertia,
      showInertiaOverlay,
    });

    markUsdHoverRaycastDirty(hoverNeedsRaycastRef, invalidate);
    syncUsdHighlights();
    invalidate();
  }, [
    centerOfMassSize,
    invalidate,
    jointAxisSize,
    originSize,
    applyUsdRuntimeLinkOverrides,
    rebuildRuntimeMeshIndex,
    rootGroup,
    showCoMOverlay,
    showCenterOfMass,
    showCollision,
    showInertia,
    showInertiaOverlay,
    showJointAxes,
    showJointAxesOverlay,
    showOrigins,
    showOriginsOverlay,
    showVisual,
    syncUsdHighlights,
  ]);

  const clearScheduledRuntimeDecorationRefresh = useCallback(() => {
    if (runtimeDecorationRefreshTimerRef.current === null) {
      return;
    }

    window.clearTimeout(runtimeDecorationRefreshTimerRef.current);
    runtimeDecorationRefreshTimerRef.current = null;
  }, []);

  const requestRuntimeRender = useCallback(() => {
    invalidate();
  }, [invalidate]);

  const scheduleRuntimeDecorationRefresh = useCallback(() => {
    clearScheduledRuntimeDecorationRefresh();
    runtimeDecorationRefreshTimerRef.current = window.setTimeout(() => {
      runtimeDecorationRefreshTimerRef.current = null;
      refreshRuntimeDecorationsRef.current();
    }, RUNTIME_DECORATION_REFRESH_DEBOUNCE_MS);
  }, [clearScheduledRuntimeDecorationRefresh]);

  const flushRuntimeDecorationRefresh = useCallback(() => {
    clearScheduledRuntimeDecorationRefresh();
    refreshRuntimeDecorationsRef.current();
  }, [clearScheduledRuntimeDecorationRefresh]);

  const syncRuntimeJointPanelRobot = useCallback(() => {
    if (!onRuntimeRobotResolved) return;

    const resolvedRobotData = resolvedRobotDataRef.current;
    if (!resolvedRobotData) {
      onRuntimeRobotResolved(null);
      return;
    }

    onRuntimeRobotResolved(createUsdViewerRuntimeRobot({
      flushDecorationRefresh: flushRuntimeDecorationRefresh,
      requestRender: requestRuntimeRender,
      resolution: resolvedRobotData,
      linkRotationController: linkRotationControllerRef.current,
      scheduleDecorationRefresh: scheduleRuntimeDecorationRefresh,
    }));
  }, [
    flushRuntimeDecorationRefresh,
    onRuntimeRobotResolved,
    requestRuntimeRender,
    scheduleRuntimeDecorationRefresh,
  ]);

  const emitRuntimeSelectionChange = useCallback((linkPath: string | null) => {
    if (!linkPath) {
      lastRuntimeSelectionRef.current = { type: null, id: null, subType: undefined, objectIndex: undefined };
      return;
    }

    armSelectionMissGuard(justSelectedRef);

    const resolvedRobotData = resolvedRobotDataRef.current;
    const linkId = resolvedRobotData?.linkIdByPath[linkPath] ?? null;
    if (!linkId) {
      return;
    }

    const pickedMeshMeta = lastPointerDownMeshMetaRef.current?.linkPath === linkPath
      ? lastPointerDownMeshMetaRef.current
      : null;
    const effectivePickedMeshMeta = pickedMeshMeta?.role === 'collision' && !Number.isInteger(pickedMeshMeta.objectIndex)
      ? null
      : pickedMeshMeta;
    const nextSelection: URDFViewerProps['selection'] = {
      type: 'link',
      id: linkId,
      subType: effectivePickedMeshMeta?.role,
      objectIndex: effectivePickedMeshMeta?.objectIndex,
    };

    if (areSelectionStatesEqual(lastRuntimeSelectionRef.current, nextSelection)) {
      return;
    }

    lastRuntimeSelectionRef.current = nextSelection;
    onRuntimeSelectionChange?.('link', linkId, effectivePickedMeshMeta?.role);
    if (effectivePickedMeshMeta) {
      onMeshSelect?.(linkId, null, effectivePickedMeshMeta.objectIndex, effectivePickedMeshMeta.role);
    }
  }, [justSelectedRef, onMeshSelect, onRuntimeSelectionChange]);

  const emitRuntimeJointAnglesChange = useCallback(() => {
    if (!onRuntimeJointAnglesChange) return;

    const resolvedRobotData = resolvedRobotDataRef.current;
    if (!resolvedRobotData) return;

    const nextJointAngles: Record<string, number> = {};
    let changed = false;
    const previousJointAngles = lastRuntimeJointAnglesRef.current;

    Object.entries(resolvedRobotData.childLinkPathByJointId).forEach(([jointId, childLinkPath]) => {
      if (!childLinkPath) return;

      const jointInfo = linkRotationControllerRef.current.getJointInfoForLink?.(childLinkPath);
      if (!jointInfo || !Number.isFinite(Number(jointInfo.angleDeg))) return;

      const angle = (Number(jointInfo.angleDeg) * Math.PI) / 180;
      nextJointAngles[jointId] = angle;
      if (previousJointAngles[jointId] === undefined || Math.abs(previousJointAngles[jointId] - angle) > 1e-6) {
        changed = true;
      }
    });

    if (!changed && Object.keys(previousJointAngles).length === Object.keys(nextJointAngles).length) {
      return;
    }

    lastRuntimeJointAnglesRef.current = nextJointAngles;
    onRuntimeJointAnglesChange(nextJointAngles);
  }, [onRuntimeJointAnglesChange]);

  const emitRuntimeJointPreview = useCallback((
    linkPath: string | null,
    jointInfo: UsdStageJointInfoLike | null | undefined,
  ) => {
    const preview = resolveUsdStageJointPreview(
      resolvedRobotDataRef.current,
      linkPath,
      jointInfo,
    );

    if (preview.activeJointId) {
      onRuntimeActiveJointChange?.(preview.activeJointId);
    }

    if (Object.keys(preview.jointAngles).length > 0) {
      onRuntimeJointAnglesChange?.(preview.jointAngles);
    }
  }, [onRuntimeActiveJointChange, onRuntimeJointAnglesChange]);

  const pickRuntimeMeshMetaAtClientPoint = useCallback((clientX: number, clientY: number): RuntimeMeshMeta | null => {
    if (!camera) return null;

    const { subType: interactiveSubType } = resolveEffectiveInteractionSubType(
      highlightMode,
      visibilityRef.current.showVisual,
      visibilityRef.current.showCollision,
    );
    if (!interactiveSubType) return null;

    const rect = gl.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
      return null;
    }

    const pointer = runtimePointerRef.current.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    const raycaster = runtimeRaycasterRef.current;
    raycaster.setFromCamera(pointer, camera);

    const gizmoTargets = getGizmoTargets();
    const nearestSceneHit = gizmoTargets.length > 0
      ? raycaster.intersectObjects(gizmoTargets, false)[0]
      : undefined;
    if (nearestSceneHit && isGizmoObject(nearestSceneHit.object)) {
      return null;
    }

    const { meshMetaByObject, pickMeshes } = rebuildRuntimeMeshIndex();
    const hits = raycaster.intersectObjects(pickMeshes, false).sort((left, right) => left.distance - right.distance);
    for (const hit of hits) {
      if (
        hit.object.visible === false
        || isGizmoObject(hit.object)
        || isInternalHelperObject(hit.object)
        || !isVisibleInHierarchy(hit.object)
        || ((hit.object as THREE.Mesh).isMesh && !hasPickableMaterial((hit.object as THREE.Mesh).material))
      ) {
        continue;
      }

      const meta = meshMetaByObject.get(hit.object);
      if (meta && meta.role === interactiveSubType) {
        if (meta.role === 'collision' && !Number.isInteger(meta.objectIndex)) {
          continue;
        }
        return meta;
      }
    }

    return null;
  }, [camera, getGizmoTargets, gl.domElement, highlightMode, rebuildRuntimeMeshIndex]);

  const pickRuntimeMeshMetaAtPointer = useCallback((event: PointerEvent | MouseEvent): RuntimeMeshMeta | null => (
    pickRuntimeMeshMetaAtClientPoint(event.clientX, event.clientY)
  ), [pickRuntimeMeshMetaAtClientPoint]);

  const refreshRuntimeDecorationsRef = useRef(refreshRuntimeDecorations);
  const syncRuntimeJointPanelRobotRef = useRef(syncRuntimeJointPanelRobot);
  const emitRuntimeSelectionChangeRef = useRef(emitRuntimeSelectionChange);
  const emitRuntimeJointPreviewRef = useRef(emitRuntimeJointPreview);
  const emitRuntimeJointAnglesChangeRef = useRef(emitRuntimeJointAnglesChange);
  const applyUsdRuntimeLinkOverridesRef = useRef(applyUsdRuntimeLinkOverrides);
  const rebuildRuntimeMeshIndexRef = useRef(rebuildRuntimeMeshIndex);
  const onRobotDataResolvedRef = useRef(onRobotDataResolved);
  const onRuntimeActiveJointChangeRef = useRef(onRuntimeActiveJointChange);
  const onRuntimeRobotResolvedRef = useRef(onRuntimeRobotResolved);
  const currentStageSourcePath = useMemo(() => toVirtualUsdPath(sourceFile.name), [sourceFile.name]);

  useEffect(() => {
    refreshRuntimeDecorationsRef.current = refreshRuntimeDecorations;
  }, [refreshRuntimeDecorations]);

  useEffect(() => {
    return () => {
      clearScheduledRuntimeDecorationRefresh();
    };
  }, [clearScheduledRuntimeDecorationRefresh]);

  useEffect(() => {
    syncRuntimeJointPanelRobotRef.current = syncRuntimeJointPanelRobot;
  }, [syncRuntimeJointPanelRobot]);

  useEffect(() => {
    emitRuntimeSelectionChangeRef.current = emitRuntimeSelectionChange;
  }, [emitRuntimeSelectionChange]);

  useEffect(() => {
    emitRuntimeJointPreviewRef.current = emitRuntimeJointPreview;
  }, [emitRuntimeJointPreview]);

  useEffect(() => {
    emitRuntimeJointAnglesChangeRef.current = emitRuntimeJointAnglesChange;
  }, [emitRuntimeJointAnglesChange]);

  useEffect(() => {
    applyUsdRuntimeLinkOverridesRef.current = applyUsdRuntimeLinkOverrides;
  }, [applyUsdRuntimeLinkOverrides]);

  useEffect(() => {
    rebuildRuntimeMeshIndexRef.current = rebuildRuntimeMeshIndex;
  }, [rebuildRuntimeMeshIndex]);

  useEffect(() => {
    onRobotDataResolvedRef.current = onRobotDataResolved;
  }, [onRobotDataResolved]);

  useEffect(() => {
    onRuntimeActiveJointChangeRef.current = onRuntimeActiveJointChange;
  }, [onRuntimeActiveJointChange]);

  useEffect(() => {
    onRuntimeRobotResolvedRef.current = onRuntimeRobotResolved;
  }, [onRuntimeRobotResolved]);

  const publishResolvedRobotData = useCallback((options: { allowWarmup?: boolean } = {}) => {
    const renderInterface = renderInterfaceRef.current;
    if (!renderInterface) {
      return null;
    }

    const {
      snapshot,
      resolution: initialRobotResolution,
    } = resolveUsdSceneRobotResolution({
      renderInterface,
      driver: driverRef.current,
      stageSourcePath: currentStageSourcePath,
      fileName: sourceFile.name,
      allowWarmup: options.allowWarmup ?? false,
    });

    const usdSceneSnapshot = snapshot;
    const resolvedRobotData = hydrateUsdViewerRobotResolutionFromRuntime(
      initialRobotResolution,
      usdSceneSnapshot,
      renderInterface,
    ) || initialRobotResolution;

    resolvedRobotDataRef.current = resolvedRobotData;
    jointAxesResolutionRef.current = createUsdJointAxesDisplayResolution(
      resolvedRobotData,
      initialRobotResolution,
    );
    baselineRobotLinksRef.current = resolvedRobotData
      ? structuredClone(resolvedRobotData.robotData.links)
      : null;
    rebuildRuntimeMeshIndexRef.current();
    markUsdHoverRaycastDirty(hoverNeedsRaycastRef, invalidate);

    onRobotDataResolvedRef.current?.({
      ...resolvedRobotData,
      usdSceneSnapshot,
    });

    syncRuntimeJointPanelRobotRef.current();
    emitRuntimeJointAnglesChangeRef.current();
    refreshRuntimeDecorationsRef.current();

    return resolvedRobotData;
  }, [currentStageSourcePath, invalidate, sourceFile.name]);

  const emitRuntimeHoverState = useCallback((nextState: URDFViewerProps['hoveredSelection']) => {
    if (areSelectionStatesEqual(lastRuntimeHoverRef.current, nextState)) {
      return;
    }

    lastRuntimeHoverRef.current = {
      type: nextState?.type ?? null,
      id: nextState?.id ?? null,
      subType: nextState?.subType,
      objectIndex: nextState?.objectIndex,
    };
    onHover?.(nextState?.type ?? null, nextState?.id ?? null, nextState?.subType, nextState?.objectIndex);
  }, [onHover]);

  const clearRuntimeHover = useCallback(() => {
    emitRuntimeHoverState({ type: null, id: null, subType: undefined, objectIndex: undefined });
  }, [emitRuntimeHoverState]);

  useEffect(() => {
    if (active) {
      return;
    }

    setIsDragging?.(false);
    onTransformPending?.(false);
    clearRuntimeHover();
  }, [active, clearRuntimeHover, onTransformPending, setIsDragging]);

  const emitRuntimeMeshSelection = useCallback((pickedMeshMeta: RuntimeMeshMeta | null) => {
    if (!pickedMeshMeta) {
      return;
    }

    if (pickedMeshMeta.role === 'collision' && !Number.isInteger(pickedMeshMeta.objectIndex)) {
      return;
    }

    armSelectionMissGuard(justSelectedRef);

    const resolvedRobotData = resolvedRobotDataRef.current;
    const linkId = resolvedRobotData?.linkIdByPath[pickedMeshMeta.linkPath] ?? null;
    if (!linkId) {
      return;
    }

    const nextSelection: URDFViewerProps['selection'] = {
      type: 'link',
      id: linkId,
      subType: pickedMeshMeta.role,
      objectIndex: pickedMeshMeta.objectIndex,
    };

    lastRuntimeSelectionRef.current = nextSelection;
    onRuntimeSelectionChange?.('link', linkId, pickedMeshMeta.role);
    onMeshSelect?.(linkId, null, pickedMeshMeta.objectIndex, pickedMeshMeta.role);
    markUsdHoverRaycastDirty(hoverNeedsRaycastRef, invalidate);
  }, [invalidate, justSelectedRef, onMeshSelect, onRuntimeSelectionChange]);

  useEffect(() => {
    syncUsdHighlights();
    return () => {
      revertUsdHighlights();
    };
  }, [revertUsdHighlights, syncUsdHighlights]);

  useEffect(() => {
    const domElement = gl.domElement;
    if (!domElement) return;

    const handlePointerDownCapture = (event: PointerEvent) => {
      setUsdHoverPointerState({
        hoverPointerClientRef,
        hoverPointerInsideRef,
        hoverNeedsRaycastRef,
      }, { x: event.clientX, y: event.clientY }, invalidate);
      const pickedMeshMeta = pickRuntimeMeshMetaAtPointer(event);
      lastPointerDownMeshMetaRef.current = pickedMeshMeta;
      if (pickedMeshMeta) {
        armSelectionMissGuard(justSelectedRef);
      }
    };
    const handleMouseDown = (event: MouseEvent) => {
      if (!interactionPolicy.enableMeshSelection || event.button !== 0) {
        return;
      }

      emitRuntimeMeshSelection(pickRuntimeMeshMetaAtPointer(event));
    };
    const clearPointerDownMeta = () => {
      lastPointerDownMeshMetaRef.current = null;
    };
    const handlePointerUp = () => {
      scheduleSelectionMissGuardReset({
        justSelectedRef,
        timerRef: selectionResetTimerRef,
        onReset: () => {
          markUsdHoverRaycastDirty(hoverNeedsRaycastRef, invalidate);
        },
      });
      clearPointerDownMeta();
    };

    domElement.addEventListener('pointerdown', handlePointerDownCapture, true);
    domElement.addEventListener('mousedown', handleMouseDown);
    domElement.addEventListener('pointerleave', clearPointerDownMeta);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      domElement.removeEventListener('pointerdown', handlePointerDownCapture, true);
      domElement.removeEventListener('mousedown', handleMouseDown);
      domElement.removeEventListener('pointerleave', clearPointerDownMeta);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      clearSelectionMissGuardTimer(selectionResetTimerRef);
      clearPointerDownMeta();
    };
  }, [
    emitRuntimeMeshSelection,
    gl.domElement,
    interactionPolicy.enableMeshSelection,
    invalidate,
    justSelectedRef,
    pickRuntimeMeshMetaAtPointer,
  ]);

  useEffect(() => {
    const domElement = gl.domElement;
    if (!domElement) return;
    const updatePointer = (clientX: number, clientY: number) => {
      setUsdHoverPointerState({
        hoverPointerClientRef,
        hoverPointerInsideRef,
        hoverNeedsRaycastRef,
      }, { x: clientX, y: clientY }, invalidate);
    };

    const handlePointerEnter = (event: PointerEvent) => {
      updatePointer(event.clientX, event.clientY);
    };
    const handlePointerMove = (event: PointerEvent) => {
      updatePointer(event.clientX, event.clientY);
    };
    const handlePointerLeave = () => {
      clearUsdHoverPointerState({
        hoverPointerClientRef,
        hoverPointerInsideRef,
        hoverNeedsRaycastRef,
      }, invalidate);
      clearRuntimeHover();
    };

    domElement.addEventListener('pointerenter', handlePointerEnter);
    domElement.addEventListener('pointermove', handlePointerMove);
    domElement.addEventListener('pointerleave', handlePointerLeave);

    if (!hoverSelectionEnabled) {
      handlePointerLeave();
    }

    return () => {
      domElement.removeEventListener('pointerenter', handlePointerEnter);
      domElement.removeEventListener('pointermove', handlePointerMove);
      domElement.removeEventListener('pointerleave', handlePointerLeave);
      handlePointerLeave();
    };
  }, [clearRuntimeHover, gl.domElement, hoverSelectionEnabled, invalidate]);

  useEffect(() => {
    if (!controls) return;

    const runtimeWindow = getRuntimeWindow();
    const currentLoadToken = loadTokenRef.current + 1;
    loadTokenRef.current = currentLoadToken;
    let disposeAutoFrame = () => {};

    let disposed = false;
    const isCurrentLoadActive = () => !disposed && loadTokenRef.current === currentLoadToken;

    setIsLoading(true);
    setErrorMessage(null);
    setLoadingProgress({
      phase: 'checking-path',
      progressPercent: 0,
      message: null,
      loadedCount: null,
      totalCount: null,
    });
    setVisibleStagePath(null);

    const clearCurrentStage = () => {
      resolvedRobotDataRef.current = null;
      jointAxesResolutionRef.current = null;
      baselineRobotLinksRef.current = null;
      initialGroundedLowestZRef.current = null;
      collisionMeshObjectIndexByMeshIdRef.current.clear();
      previousCollisionCountByLinkPathRef.current.clear();
      meshMetaByObjectRef.current.clear();
      meshesByLinkKeyRef.current.clear();
      pickMeshesRef.current = [];
      baseLocalMatrixByMeshRef.current = new WeakMap();
      revertUsdHighlights();
      lastRuntimeSelectionRef.current = { type: null, id: null, subType: undefined, objectIndex: undefined };
      lastPointerDownMeshMetaRef.current = null;
      lastRuntimeJointAnglesRef.current = {};
      lastRuntimeHoverRef.current = { type: null, id: null, subType: undefined, objectIndex: undefined };
      onRuntimeActiveJointChangeRef.current?.(null);
      clearUsdHoverPointerState({
        hoverPointerClientRef,
        hoverPointerInsideRef,
        hoverNeedsRaycastRef,
      });
      onHover?.(null, null);
      onRuntimeRobotResolvedRef.current?.(null);
      linkAxesControllerRef.current.clear(rootGroup);
      jointAxesControllerRef.current.clear(rootGroup);
      linkDynamicsControllerRef.current.clear(rootGroup);
      linkRotationControllerRef.current.setOnSelectionChanged(null);
      linkRotationControllerRef.current.attach(null, null, null);
      linkRotationControllerRef.current.setPickSubType(null);
      linkRotationControllerRef.current.clear();
      linkRotationControllerRef.current.setEnabled(false);

      const runtime = runtimeRef.current;
      if (runtime) {
        disposeUsdDriver(runtime, driverRef.current);
        driverRef.current = null;
        renderInterfaceRef.current = null;
        disposeUsdRootChildren(rootGroup);
        runtime.usdFsHelper.clearStageFiles(rootGroup);
      } else {
        disposeUsdRootChildren(rootGroup);
        rootGroup.clear();
      }

      rootGroup.position.set(0, 0, 0);
      rootGroup.rotation.set(0, 0, 0);
      rootGroup.scale.set(1, 1, 1);
      rootGroup.updateMatrixWorld(true);

      if (runtimeWindow.usdRoot === rootGroup) {
        runtimeWindow.usdStage = undefined;
        runtimeWindow.driver = undefined;
        runtimeWindow.renderInterface = undefined;
        runtimeWindow.exportLoadedStageSnapshot = undefined;
      }
    };

    const loadUsdStageIntoScene = async () => {
      const isActive = isCurrentLoadActive;

      runtimeWindow.camera = camera;
      runtimeWindow._controls = controls as ViewerControls;
      runtimeWindow.scene = scene;
      runtimeWindow.usdRoot = rootGroup;

      // Let React commit the loading HUD before the next USD parse blocks the main thread.
      await new Promise<void>((resolve) => {
        if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
          resolve();
          return;
        }
        window.requestAnimationFrame(() => resolve());
      });
      if (!isActive()) return;

      clearCurrentStage();

      try {
        const runtime = await ensureUsdWasmRuntime();
        if (!isActive()) return;

        runtimeRef.current = runtime;
        runtimeWindow.USD = runtime.USD;

        const preloadEntries = buildUsdBundlePreloadEntries(sourceFile, availableFiles, assets);
        const stageSourcePath = currentStageSourcePath;
        await preloadUsdDependencies(runtime, preloadEntries, isActive);
        await ensureCriticalUsdDependenciesLoaded(runtime, stageSourcePath, preloadEntries, isActive);
        if (!isActive()) return;

        const params = createEmbeddedUsdViewerLoadParams(runtime.threadCount);

        const loadState = await runtime.loadUsdStage({
          USD: runtime.USD,
          usdFsHelper: runtime.usdFsHelper,
          messageLog: null,
          progressBar: null,
          progressLabel: null,
          showLoadUi: false,
          readStageMetadata: true,
          loadCollisionPrims: true,
          loadVisualPrims: true,
          loadPassLabel: 'workspace',
          params,
          displayName: sourceFile.name.split('/').pop() || sourceFile.name,
          pathToLoad: stageSourcePath,
          isLoadActive: isActive,
          debugFileHandling: false,
          onResolvedFilename: () => {},
          applyMeshFilters: () => {
            const activeRenderInterface = runtimeWindow.renderInterface;
            if (!activeRenderInterface) return;
            runtime.applyMeshVisibilityFilters(
              activeRenderInterface,
              visibilityRef.current.showVisual,
              visibilityRef.current.showCollision,
            );
          },
          rebuildLinkAxes: () => {},
          renderFrame: () => invalidate(),
          onProgress: (nextProgress) => {
            if (!isActive()) return;
            setLoadingProgress((current) => ({
              phase: nextProgress.phase,
              progressPercent: nextProgress.progressPercent !== undefined
                ? nextProgress.progressPercent ?? null
                : current?.progressPercent ?? null,
              message: nextProgress.message !== undefined
                ? nextProgress.message ?? null
                : current?.message ?? null,
              loadedCount: nextProgress.loadedCount !== undefined
                ? nextProgress.loadedCount ?? null
                : current?.loadedCount ?? null,
              totalCount: nextProgress.totalCount !== undefined
                ? nextProgress.totalCount ?? null
                : current?.totalCount ?? null,
            }));
          },
        });
        if (!isActive()) {
          disposeUsdDriver(runtime, loadState?.driver);
          return;
        }

        driverRef.current = loadState?.driver ?? null;
        renderInterfaceRef.current = runtimeWindow.renderInterface;
        runtimeWindow.exportLoadedStageSnapshot = (options = {}) => {
          const activeRenderInterface = renderInterfaceRef.current ?? runtimeWindow.renderInterface;
          if (!activeRenderInterface || typeof activeRenderInterface.exportLoadedStageSnapshot !== 'function') {
            return Promise.resolve({ ok: false, error: 'export-unavailable' });
          }

          return activeRenderInterface.exportLoadedStageSnapshot({
            stageSourcePath,
            ...options,
          });
        };
        runtime.applyMeshVisibilityFilters(
          runtimeWindow.renderInterface,
          visibilityRef.current.showVisual,
          visibilityRef.current.showCollision,
        );
        rebuildRuntimeMeshIndexRef.current();
        markUsdHoverRaycastDirty(hoverNeedsRaycastRef, invalidate);
        alignUsdRootToGround(captureUsdInitialGroundBaseline());

        const renderInterface = runtimeWindow.renderInterface as (ViewerRuntimeInterface & Record<string, unknown>) | undefined;
        const linkRotationController = linkRotationControllerRef.current;
        const linkDynamicsController = linkDynamicsControllerRef.current;
        const activeJointRotationRuntime = jointRotationRuntimeRef.current;

        if (renderInterface) {
          linkRotationController.attach(gl.domElement, camera, controls as ViewerControls);
          linkRotationController.setOnSelectionChanged((linkPath: string | null, jointInfo?: UsdStageJointInfoLike | null) => {
            emitRuntimeSelectionChangeRef.current(linkPath);
            emitRuntimeJointPreviewRef.current(linkPath, jointInfo);

            if (!linkRotationController.dragging) {
              emitRuntimeJointAnglesChangeRef.current();
            }
          });
          linkRotationController.setPickSubType(activeJointRotationRuntime.pickSubType);
          linkRotationController.setEnabled(activeRef.current && activeJointRotationRuntime.enabled);
          linkRotationController.setStageSourcePath(stageSourcePath);
          linkRotationController.setRenderInterface(renderInterface);
          linkRotationController.prewarmInteractivePoseCaches();
          window.requestAnimationFrame(() => {
            if (!isActive()) return;
            void linkRotationController.prewarmJointCatalog().then(() => {
              if (!isActive()) return;
              syncRuntimeJointPanelRobotRef.current();
              emitRuntimeJointAnglesChangeRef.current();
            });
          });

          linkDynamicsController.setStageSourcePath(stageSourcePath);
          linkDynamicsController.setCurrentLinkFrameResolver((linkPath) => (
            linkRotationController.getCurrentLinkFrameMatrix(linkPath)
          ));
          void linkDynamicsController.prewarmCatalogForInteractive(renderInterface);
        }

        if (renderInterface) {
          publishResolvedRobotData({ allowWarmup: true });
        }

        syncRuntimeJointPanelRobotRef.current();
        emitRuntimeJointAnglesChangeRef.current();
        refreshRuntimeDecorationsRef.current();
        disposeAutoFrame = scheduleStabilizedAutoFrame({
          sample: sampleUsdAutoFrameBounds,
          applyFrame: ({ state }) => applyUsdCameraFrame(state),
          isActive: () => activeRef.current && isActive(),
          delays: [0, 96, 224],
          onSettled: () => {
            if (!isActive()) return;
            setLoadingProgress({
              phase: 'ready',
              progressPercent: 100,
              message: null,
              loadedCount: null,
              totalCount: null,
            });
            setVisibleStagePath(sourceFile.name);
            setIsLoading(false);
            invalidate();
          },
        });
      } catch (error) {
        if (!isActive()) return;
        console.error('Failed to load USD stage', error);
        setErrorMessage(error instanceof Error ? error.message : 'Failed to load USD stage');
        setVisibleStagePath(null);
        setIsLoading(false);
        setLoadingProgress(null);
      }
    };

    void loadUsdStageIntoScene();

    return () => {
      disposed = true;
      disposeAutoFrame();
      clearCurrentStage();
    };
  }, [
    alignUsdRootToGround,
    applyUsdCameraFrame,
    assets,
    availableFiles,
    camera,
    captureUsdInitialGroundBaseline,
    controls,
    gl,
    invalidate,
    sampleUsdAutoFrameBounds,
    rootGroup,
    scene,
    currentStageSourcePath,
    publishResolvedRobotData,
    sourceFile,
  ]);

  useEffect(() => {
    refreshRuntimeDecorations();
  }, [refreshRuntimeDecorations]);

  useFrame(() => {
    if (activeRef.current && interactionPolicy.enableContinuousHover && hoverSelectionEnabled && onHover) {
      const pointer = hoverPointerClientRef.current;
      const cameraMoved = !camera.position.equals(lastHoverCameraPositionRef.current)
        || !camera.quaternion.equals(lastHoverCameraQuaternionRef.current);

      if (cameraMoved) {
        lastHoverCameraPositionRef.current.copy(camera.position);
        lastHoverCameraQuaternionRef.current.copy(camera.quaternion);
        markUsdHoverRaycastDirty(hoverNeedsRaycastRef);
      }

      if (
        hoverPointerInsideRef.current
        && pointer
        && hoverNeedsRaycastRef.current
        && justSelectedRef?.current !== true
        && (linkRotationControllerRef.current as { dragging?: boolean }).dragging !== true
      ) {
        hoverNeedsRaycastRef.current = false;

        const meta = pickRuntimeMeshMetaAtClientPoint(pointer.x, pointer.y);
        if (!meta) {
          clearRuntimeHover();
        } else {
          const resolvedRobotData = resolvedRobotDataRef.current;
          const linkId = resolvedRobotData?.linkIdByPath[meta.linkPath] ?? null;
          if (!linkId) {
            clearRuntimeHover();
          } else {
            emitRuntimeHoverState({
              type: 'link',
              id: linkId,
              subType: meta.role,
              objectIndex: meta.objectIndex,
            });
          }
        }
      }
    }

    const renderInterface = renderInterfaceRef.current;
    if (!renderInterface) return;

    let changed = false;
    const poseChanged = linkRotationControllerRef.current.apply(renderInterface) === true;
    if (poseChanged) {
      applyUsdRuntimeLinkOverridesRef.current();
      markUsdHoverRaycastDirty(hoverNeedsRaycastRef);
      changed = true;
    }

    if (showCenterOfMass || showInertia) {
      changed = linkDynamicsControllerRef.current.syncLinkDynamicsTransforms(renderInterface) === true || changed;
    }

    if (changed) {
      if ((linkRotationControllerRef.current as { dragging?: boolean }).dragging !== true) {
        emitRuntimeJointAnglesChangeRef.current();
      }
      invalidate();
    }
  });

  return (
    <>
      {visibleStagePath === sourceFile.name ? <primitive object={rootGroup} /> : null}
      <UsdCollisionTransformControls
        mode={mode}
        highlightMode={highlightMode}
        selection={selection}
        transformMode={transformMode}
        resolveTarget={resolveUsdCollisionTransformTarget}
        onTransformChange={handleUsdCollisionTransformPreview}
        onTransformEnd={handleUsdCollisionTransformEnd}
        onTransformPending={handleUsdCollisionTransformPending}
        setIsDragging={setIsDragging ?? (() => {})}
      />
      {isLoading && (
        <Html fullscreen>
          <div className="pointer-events-none absolute inset-0 flex items-end justify-end p-4">
            <ViewerLoadingHud
              title={loadingLabel}
              detail={loadingDetail}
              progress={loadingHudState.progress}
              statusLabel={loadingHudState.statusLabel}
              stageLabel={loadingStageLabel}
              delayMs={0}
            />
          </div>
        </Html>
      )}
      {errorMessage && !isLoading && (
        <Html center>
          <div className="rounded bg-red-900/80 px-4 py-2 text-sm text-red-200">
            {errorMessage}
          </div>
        </Html>
      )}
    </>
  );
}
