/// <reference lib="webworker" />

import * as THREE from 'three';
import { getCollisionGeometryEntries } from '@/core/robot';
import { disposeObject3D } from '@/shared/utils/three/dispose';
import { WORKSPACE_DEFAULT_CAMERA_FOV, WORKSPACE_DEFAULT_CAMERA_POSITION, WORKSPACE_DEFAULT_CAMERA_UP } from '@/shared/components/3d/scene/constants.ts';
import { getLowestMeshZ } from '@/shared/utils';
import { LinkRotationController } from '../runtime/viewer/link-rotation.js';
import type { PreparedUsdPreloadFile } from '../utils/usdStageOpenPreparation.ts';
import { preloadUsdStageEntries } from '../utils/usdStagePreloadExecution.ts';
import { prepareUsdStageOpenDataCore } from '../utils/usdStageOpenPreparationCore.ts';
import type { ViewerDocumentLoadEvent, UsdLoadingProgress } from '../types';
import { hydrateUsdViewerRobotResolutionFromRuntime } from '../utils/usdRuntimeRobotHydration.ts';
import { resolveUsdSceneRobotResolution } from '../utils/usdSceneRobotResolution.ts';
import { toVirtualUsdPath } from '../utils/usdPreloadSources.ts';
import { resolveUsdGroundAlignmentSettleDelaysMs } from '../utils/usdGroundAlignmentDelays.ts';
import { shouldSettleUsdGroundAlignmentAfterInitialLoad } from '../utils/usdGroundAlignmentPolicy.ts';
import {
  disposeUsdDriver,
  ensureUsdWasmRuntime,
  type UsdWasmRuntime,
} from '../utils/usdWasmRuntime.ts';
import { createHighlightOverrideMaterial, disposeMaterial } from '../utils/materials.ts';
import { hasPickableMaterial, isInternalHelperObject, isVisibleInHierarchy } from '../utils/pickFilter.ts';
import { collectSelectableHelperTargets } from '../utils/pickTargets.ts';
import { reconcileUsdCollisionMeshAssignments } from '../utils/usdCollisionMeshAssignments.ts';
import { resolveUsdStageInteractionPolicy } from '../utils/usdInteractionPolicy.ts';
import {
  resolvePreferredUsdGeometryRole,
  resolveUsdHelperHit,
  sortUsdInteractionCandidates,
  type ResolvedUsdHelperHit,
} from '../utils/usdInteractionPicking.ts';
import { resolveUsdRuntimeLinkPathForMesh } from '../utils/usdRuntimeMeshMapping.ts';
import { resolveUsdVisualMeshObjectOrder } from '../utils/usdRuntimeMeshObjectOrder.ts';
import { prepareUsdVisualMesh } from '../utils/usdVisualRendering.ts';
import { createEmbeddedUsdViewerLoadParams } from '../utils/usdViewerRenderParams.ts';
import {
  applyUsdWorkerOrbitPointerDelta,
  applyUsdWorkerOrbitToCamera,
  applyUsdWorkerOrbitZoomDelta,
  createUsdWorkerOrbitState,
  type UsdWorkerOrbitState,
} from '../utils/usdWorkerOrbit.ts';
import {
  computeCameraFrame,
  computeVisibleBounds,
  createCameraFrameStabilityKey,
  isBoundsVisibleToCamera,
} from '../utils/cameraFrame.ts';
import { scheduleStabilizedAutoFrame } from '../utils/stabilizedAutoFrame.ts';
import type {
  UsdOffscreenViewerInitRequest,
  type OffscreenViewerInteractionSelection,
  UsdOffscreenViewerLoadDebugEntry,
  UsdOffscreenViewerWorkerRequest,
  UsdOffscreenViewerWorkerResponse,
} from '../utils/usdOffscreenViewerProtocol.ts';
import type { ToolMode, ViewerInteractiveLayer } from '../types.ts';

type WorkerControls = {
  target: THREE.Vector3;
  update: () => boolean;
};

type RuntimeWindow = typeof globalThis & {
  window: typeof globalThis;
  self: typeof globalThis;
  innerWidth: number;
  innerHeight: number;
  devicePixelRatio: number;
  USD?: UsdWasmRuntime['USD'];
  scene?: THREE.Scene;
  camera?: THREE.PerspectiveCamera;
  renderer?: THREE.WebGLRenderer;
  usdRoot?: THREE.Group;
  renderInterface?: any;
  driver?: any;
  usdStage?: unknown;
  _controls?: WorkerControls;
};

interface ActivePointerState {
  pointerId: number;
  x: number;
  y: number;
}

type UsdMeshRole = 'visual' | 'collision';

type RuntimeMeshMeta = {
  linkPath: string;
  meshId: string;
  objectIndex?: number;
  authoredOrder?: number;
  role: UsdMeshRole;
};

type RuntimeInteractionTarget =
  | {
      kind: 'geometry';
      meta: RuntimeMeshMeta;
    }
  | {
      kind: 'helper';
      selection: ResolvedUsdHelperHit;
    };

type HighlightedMaterialState = {
  depthTest: boolean;
  depthWrite: boolean;
  opacity: number;
  transparent: boolean;
  colorHex?: number;
  emissiveHex?: number;
  emissiveIntensity?: number;
};

type HighlightedMeshSnapshot = {
  material: THREE.Material | THREE.Material[];
  materialStates: HighlightedMaterialState[];
  renderOrder: number;
  activeRole: UsdMeshRole | null;
};

const USD_VISUAL_SEGMENT_PATTERN = /(?:^|\/)visuals?(?:$|[/.])/i;
const USD_COLLISION_SEGMENT_PATTERN = /(?:^|\/)collisions?(?:$|[/.])/i;

const workerScope = globalThis as unknown as DedicatedWorkerGlobalScope;
const runtimeWindow = globalThis as RuntimeWindow;

let runtime: UsdWasmRuntime | null = null;
let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
let usdRoot: THREE.Group | null = null;
let controls: WorkerControls | null = null;
let currentOrbit: UsdWorkerOrbitState | null = null;
let currentDriver: unknown = null;
let activePointer: ActivePointerState | null = null;
let currentLoadGeneration = 0;
let disposed = false;
let viewerActive = true;
let interactionToolMode: ToolMode = 'select';
let interactionLayerPriority: ViewerInteractiveLayer[] = [];
let hoverSelectionEnabled = true;
let showVisual = true;
let showCollision = true;
let showCollisionAlwaysOnTop = true;
let groundPlaneOffset = 0;
let currentSourceFileName = '';
let shouldSettleGroundAlignmentAfterLoad = true;
let groundAlignmentTimeouts: Array<ReturnType<typeof setTimeout>> = [];
let disposeAutoFrame: (() => void) | null = null;
let resolvedRobotData: ViewerRobotDataResolution | null = null;
let selectionState: OffscreenViewerInteractionSelection | null = null;
let hoveredSelectionState: OffscreenViewerInteractionSelection | null = null;
let lastEmittedHoverState: OffscreenViewerInteractionSelection | null = null;
let runtimeMeshMetaByObject = new Map<THREE.Object3D, RuntimeMeshMeta>();
let runtimeMeshesByLinkKey = new Map<string, THREE.Mesh[]>();
let runtimePickMeshes: THREE.Mesh[] = [];
let runtimeHelperTargets: THREE.Object3D[] = [];
let highlightedMeshes = new Map<THREE.Mesh, HighlightedMeshSnapshot>();
const runtimeRaycaster = new THREE.Raycaster();
const runtimePointer = new THREE.Vector2();
let linkRotationController: LinkRotationController | null = null;

function clearScheduledAutoFrame(): void {
  if (!disposeAutoFrame) {
    return;
  }

  disposeAutoFrame();
  disposeAutoFrame = null;
}

function clearScheduledGroundAlignmentPasses(): void {
  if (groundAlignmentTimeouts.length === 0) {
    return;
  }

  groundAlignmentTimeouts.forEach((timeout) => clearTimeout(timeout));
  groundAlignmentTimeouts = [];
}

function scheduleGroundAlignmentSettlePasses(loadGeneration: number, stageSourcePath?: string | null): void {
  clearScheduledGroundAlignmentPasses();

  const settleDelays = resolveUsdGroundAlignmentSettleDelaysMs(
    stageSourcePath || currentSourceFileName,
  );
  settleDelays.forEach((delayMs) => {
    const timeout = setTimeout(() => {
      if (!isLoadGenerationActive(loadGeneration)) {
        return;
      }

      applyGroundAlignment();
      renderScene();
    }, delayMs);

    groundAlignmentTimeouts.push(timeout);
  });
}

function postWorkerMessage(message: UsdOffscreenViewerWorkerResponse): void {
  workerScope.postMessage(message);
}

function emitLoadDebugEntry(
  entry: Omit<UsdOffscreenViewerLoadDebugEntry, 'sourceFileName'> & {
    sourceFileName?: string;
  },
): void {
  postWorkerMessage({
    type: 'load-debug',
    entry: {
      sourceFileName: entry.sourceFileName || currentSourceFileName,
      step: entry.step,
      status: entry.status,
      timestamp: entry.timestamp,
      durationMs: entry.durationMs,
      detail: entry.detail ?? null,
    },
  });
}

async function trackWorkerLoadDebugStep<T>({
  sourceFileName,
  step,
  run,
  pendingDetail,
  resolveDetail,
}: {
  sourceFileName?: string;
  step: string;
  run: () => Promise<T>;
  pendingDetail?: Record<string, unknown> | null;
  resolveDetail?: (value: T) => Record<string, unknown> | null | undefined;
}): Promise<T> {
  const startedAt = Date.now();
  emitLoadDebugEntry({
    sourceFileName,
    step,
    status: 'pending',
    timestamp: startedAt,
    detail: pendingDetail ?? null,
  });

  try {
    const result = await run();
    emitLoadDebugEntry({
      sourceFileName,
      step,
      status: 'resolved',
      timestamp: Date.now(),
      durationMs: Date.now() - startedAt,
      detail: resolveDetail?.(result) ?? pendingDetail ?? null,
    });
    return result;
  } catch (error) {
    emitLoadDebugEntry({
      sourceFileName,
      step,
      status: 'rejected',
      timestamp: Date.now(),
      durationMs: Date.now() - startedAt,
      detail: {
        ...(pendingDetail ?? {}),
        error: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }
}

function installWorkerViewerGlobals(): void {
  const scope = runtimeWindow as RuntimeWindow & {
    CustomEvent?: typeof CustomEvent;
    requestAnimationFrame?: typeof requestAnimationFrame;
    cancelAnimationFrame?: typeof cancelAnimationFrame;
  };

  scope.innerWidth = Math.max(1, Number(scope.innerWidth || 1));
  scope.innerHeight = Math.max(1, Number(scope.innerHeight || 1));
  scope.devicePixelRatio = Math.max(1, Number(scope.devicePixelRatio || 1));

  if (typeof scope.CustomEvent !== 'function') {
    class WorkerCustomEvent<T = unknown> extends Event {
      readonly detail: T;

      constructor(type: string, init?: CustomEventInit<T>) {
        super(type, init);
        this.detail = init?.detail as T;
      }
    }

    scope.CustomEvent = WorkerCustomEvent as unknown as typeof CustomEvent;
  }

  if (typeof scope.requestAnimationFrame !== 'function') {
    let nextHandle = 1;
    const timeouts = new Map<number, ReturnType<typeof setTimeout>>();

    scope.requestAnimationFrame = ((callback: FrameRequestCallback): number => {
      const handle = nextHandle++;
      const timeout = setTimeout(() => {
        timeouts.delete(handle);
        callback(performance.now());
      }, 16);
      timeouts.set(handle, timeout);
      return handle;
    }) as typeof requestAnimationFrame;

    scope.cancelAnimationFrame = ((handle: number): void => {
      const timeout = timeouts.get(handle);
      if (!timeout) {
        return;
      }

      clearTimeout(timeout);
      timeouts.delete(handle);
    }) as typeof cancelAnimationFrame;
  }
}

function installRuntimeWindowAlias(): void {
  const scope = runtimeWindow;
  if (!('window' in scope) || scope.window !== scope) {
    Object.defineProperty(scope, 'window', {
      configurable: true,
      value: scope,
    });
  }
}

function isLoadGenerationActive(loadGeneration: number): boolean {
  return !disposed && loadGeneration === currentLoadGeneration;
}

function emitDocumentLoadEvent(event: ViewerDocumentLoadEvent): void {
  postWorkerMessage({
    type: 'document-load',
    event,
  });
}

function emitLoadingProgress(progress: UsdLoadingProgress): void {
  postWorkerMessage({
    type: 'progress',
    progress,
  });
  emitDocumentLoadEvent({
    status: 'loading',
    phase: progress.phase,
    message: progress.message ?? null,
    progressPercent: progress.progressPercent ?? null,
    loadedCount: progress.loadedCount ?? null,
    totalCount: progress.totalCount ?? null,
  });
}

function emitWorkerLoadingStep(
  phase: UsdLoadingProgress['phase'],
  message: string,
  progressPercent: number | null = null,
): void {
  emitLoadingProgress({
    phase,
    message,
    progressPercent,
    loadedCount: null,
    totalCount: null,
  });
}

function syncViewportMetrics(width: number, height: number, devicePixelRatio: number): void {
  runtimeWindow.innerWidth = Math.max(1, Math.floor(width) || 1);
  runtimeWindow.innerHeight = Math.max(1, Math.floor(height) || 1);
  runtimeWindow.devicePixelRatio = Math.max(1, Number(devicePixelRatio || 1));
}

function getBasePixelRatio(): number {
  return Math.max(0.5, Math.min(runtimeWindow.devicePixelRatio || 1, 1));
}

function renderScene(): void {
  if (!renderer || !scene || !camera) {
    return;
  }

  renderer.render(scene, camera);
}

function getCurrentInteractionPolicy() {
  return resolveUsdStageInteractionPolicy('editor', interactionToolMode);
}

function areSelectionStatesEqual(
  left: OffscreenViewerInteractionSelection | null | undefined,
  right: OffscreenViewerInteractionSelection | null | undefined,
): boolean {
  return (left?.type ?? null) === (right?.type ?? null)
    && (left?.id ?? null) === (right?.id ?? null)
    && left?.subType === right?.subType
    && (left?.objectIndex ?? -1) === (right?.objectIndex ?? -1)
    && left?.helperKind === right?.helperKind;
}

function cloneSelectionState(
  selection: OffscreenViewerInteractionSelection | null | undefined,
): OffscreenViewerInteractionSelection | null {
  if (!selection || !selection.type || !selection.id) {
    return null;
  }

  return {
    type: selection.type,
    id: selection.id,
    subType: selection.subType,
    objectIndex: selection.objectIndex,
    helperKind: selection.helperKind,
  };
}

function emitSelectionChange(
  selection: OffscreenViewerInteractionSelection | null,
  meshSelection: {
    linkId: string;
    objectIndex: number;
    objectType: 'visual' | 'collision';
  } | null = null,
): void {
  selectionState = cloneSelectionState(selection);
  postWorkerMessage({
    type: 'selection-change',
    selection: selectionState,
    meshSelection,
  });
}

function emitHoverChange(selection: OffscreenViewerInteractionSelection | null): void {
  if (areSelectionStatesEqual(lastEmittedHoverState, selection)) {
    return;
  }

  const nextHoverState = cloneSelectionState(selection);
  lastEmittedHoverState = nextHoverState;
  hoveredSelectionState = nextHoverState;
  postWorkerMessage({
    type: 'hover-change',
    hoveredSelection: nextHoverState,
  });
}

function clearRuntimeHover(): void {
  emitHoverChange(null);
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
      colorHex: (material as any)?.color?.isColor ? (material as any).color.getHex() : undefined,
      emissiveHex: (material as any)?.emissive?.isColor ? (material as any).emissive.getHex() : undefined,
      emissiveIntensity: Number.isFinite((material as any)?.emissiveIntensity)
        ? Number((material as any).emissiveIntensity)
        : undefined,
    })),
    activeRole: null,
  };
}

function disposeHighlightOverrideMaterials(material: THREE.Material | THREE.Material[]): void {
  const materials = Array.isArray(material) ? material : [material];
  materials.forEach((entry) => {
    if (!entry) {
      return;
    }
    if ((entry as any).userData?.isHighlightOverrideMaterial !== true) {
      return;
    }
    disposeMaterial(entry, false);
  });
}

function restoreHighlightedMeshSnapshot(mesh: THREE.Mesh, snapshot: HighlightedMeshSnapshot): void {
  const currentMaterial = mesh.material;
  if (currentMaterial !== snapshot.material) {
    disposeHighlightOverrideMaterials(currentMaterial as THREE.Material | THREE.Material[]);
  }

  mesh.material = snapshot.material;
  mesh.renderOrder = snapshot.renderOrder;

  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  materials.forEach((material, index) => {
    const materialState = snapshot.materialStates[index];
    if (!material || !materialState) {
      return;
    }

    material.transparent = materialState.transparent;
    material.opacity = materialState.opacity;
    material.depthTest = materialState.depthTest;
    material.depthWrite = materialState.depthWrite;
    if (materialState.colorHex !== undefined && (material as any).color?.isColor) {
      (material as any).color.setHex(materialState.colorHex);
    }
    if (materialState.emissiveHex !== undefined && (material as any).emissive?.isColor) {
      (material as any).emissive.setHex(materialState.emissiveHex);
    }
    if (
      materialState.emissiveIntensity !== undefined
      && 'emissiveIntensity' in (material as any)
    ) {
      (material as any).emissiveIntensity = materialState.emissiveIntensity;
    }
    material.needsUpdate = true;
  });

  snapshot.activeRole = null;
}

function revertInteractionHighlights(): void {
  highlightedMeshes.forEach((snapshot, mesh) => {
    restoreHighlightedMeshSnapshot(mesh, snapshot);
  });
  highlightedMeshes.clear();
}

function getPathBasename(path: string | null | undefined): string {
  const normalized = String(path || '').trim().replace(/[<>]/g, '');
  if (!normalized) {
    return '';
  }

  const segments = normalized.split('/').filter(Boolean);
  return segments[segments.length - 1] || '';
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

function rebuildRuntimeMeshIndex(): void {
  const renderInterface = runtimeWindow.renderInterface;
  const currentRobotLinks = resolvedRobotData?.robotData.links || {};
  const nextMeshMetaByObject = new Map<THREE.Object3D, RuntimeMeshMeta>();
  const nextMeshesByLinkKey = new Map<string, THREE.Mesh[]>();
  const nextPickMeshes: THREE.Mesh[] = [];
  const nextHelperTargets = collectSelectableHelperTargets(usdRoot);
  const nextCollisionMeshGroups = new Map<string, Array<{ mesh: THREE.Mesh; meta: RuntimeMeshMeta }>>();
  const collisionMeshFallbackOrderByLinkPath = new Map<string, number>();
  const visualMeshFallbackOrderByLinkPath = new Map<string, number>();

  for (const [meshId, hydraMesh] of Object.entries((renderInterface as any)?.meshes || {})) {
    const meshRecord = hydraMesh as { _mesh?: THREE.Mesh } | null;
    const mesh = meshRecord?._mesh;
    if (!mesh) {
      continue;
    }

    const resolvedPrimPath = (
      (renderInterface as any)?.getResolvedVisualTransformPrimPathForMeshId?.(meshId)
      || (renderInterface as any)?.getResolvedPrimPathForMeshId?.(meshId)
      || null
    );
    const linkPath = resolveUsdRuntimeLinkPathForMesh({
      meshId,
      resolution: resolvedRobotData,
      resolvedPrimPath,
    });
    if (!linkPath) {
      continue;
    }

    const role = getUsdMeshRole(meshId, mesh.name || '');
    const collisionFallbackOrder = collisionMeshFallbackOrderByLinkPath.get(linkPath) ?? 0;
    if (role === 'collision') {
      collisionMeshFallbackOrderByLinkPath.set(linkPath, collisionFallbackOrder + 1);
    }
    const visualFallbackOrder = visualMeshFallbackOrderByLinkPath.get(linkPath) ?? 0;
    const authoredOrder = role === 'collision'
      ? resolveUsdCollisionMeshAuthoredOrder({
          renderInterface,
          linkPath,
          meshId,
          fallbackOrder: collisionFallbackOrder,
        })
      : resolveUsdVisualMeshObjectOrder({
          renderInterface,
          meshId,
          fallbackOrder: visualFallbackOrder,
        });
    if (role === 'visual') {
      visualMeshFallbackOrderByLinkPath.set(linkPath, Math.max(visualFallbackOrder, authoredOrder + 1));
      prepareUsdVisualMesh(mesh);
    }

    mesh.userData = mesh.userData || {};
    mesh.userData.geometryRole = role;
    mesh.userData.isCollisionMesh = role === 'collision';
    mesh.userData.isVisualMesh = role === 'visual';
    mesh.userData.usdObjectIndex = role === 'collision' ? undefined : authoredOrder;
    mesh.userData.usdLinkPath = linkPath;
    mesh.userData.usdMeshId = meshId;

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
    const reconciledAssignments = reconcileUsdCollisionMeshAssignments({
      meshes: collisionMeshes.map(({ meta }) => ({
        meshId: meta.meshId,
        authoredOrder: meta.authoredOrder ?? 0,
      })),
      currentCount,
    });

    collisionMeshes.forEach(({ mesh, meta }) => {
      const objectIndex = reconciledAssignments.get(meta.meshId);
      meta.objectIndex = objectIndex;
      mesh.userData.usdObjectIndex = objectIndex;
    });
  });

  runtimeMeshMetaByObject = nextMeshMetaByObject;
  runtimeMeshesByLinkKey = nextMeshesByLinkKey;
  runtimePickMeshes = nextPickMeshes;
  runtimeHelperTargets = nextHelperTargets;
}

function applyInteractionHighlight(candidate: OffscreenViewerInteractionSelection | null | undefined): void {
  if (!resolvedRobotData || !candidate?.type || !candidate.id) {
    return;
  }

  const targetLinkPath = candidate.type === 'joint'
    ? resolvedRobotData.childLinkPathByJointId[candidate.id]
    : resolvedRobotData.linkPathById[candidate.id];
  if (!targetLinkPath) {
    return;
  }

  const fallbackRole = resolvePreferredUsdGeometryRole({
    interactionLayerPriority,
    showVisual,
    showCollision,
    showCollisionAlwaysOnTop,
  });
  if (!candidate.subType && !fallbackRole) {
    return;
  }

  const targetRole: UsdMeshRole = (candidate.subType ?? fallbackRole) === 'collision'
    ? 'collision'
    : 'visual';
  if ((targetRole === 'visual' && !showVisual) || (targetRole === 'collision' && !showCollision)) {
    return;
  }

  const meshes = runtimeMeshesByLinkKey.get(`${targetLinkPath}:${targetRole}`) || [];
  for (const mesh of meshes) {
    if (!mesh.visible || mesh.userData?.isGizmo) {
      continue;
    }
    if (
      typeof candidate.objectIndex === 'number'
      && (mesh.userData?.usdObjectIndex ?? -1) !== candidate.objectIndex
    ) {
      continue;
    }

    let snapshot = highlightedMeshes.get(mesh);
    if (!snapshot) {
      snapshot = captureHighlightedMeshSnapshot(mesh);
      highlightedMeshes.set(mesh, snapshot);
    } else if (snapshot.activeRole === targetRole) {
      mesh.renderOrder = targetRole === 'collision' ? 1000 : 1001;
      continue;
    } else {
      restoreHighlightedMeshSnapshot(mesh, snapshot);
    }

    const sourceMaterials = Array.isArray(snapshot.material)
      ? snapshot.material
      : [snapshot.material];
    const overrideMaterials = sourceMaterials.map((sourceMaterial) => (
      createHighlightOverrideMaterial(sourceMaterial, targetRole)
    ));
    mesh.material = Array.isArray(snapshot.material) ? overrideMaterials : overrideMaterials[0];
    mesh.renderOrder = targetRole === 'collision' ? 1000 : 1001;
    snapshot.activeRole = targetRole;
  }
}

function syncInteractionHighlights(): void {
  revertInteractionHighlights();
  applyInteractionHighlight(selectionState);
  if (hoverSelectionEnabled) {
    applyInteractionHighlight(hoveredSelectionState);
  }
  renderScene();
}

function ensureLinkRotationController(): LinkRotationController {
  if (!linkRotationController) {
    linkRotationController = new LinkRotationController();
  }

  return linkRotationController;
}

function emitCurrentJointAngles(): Record<string, number> {
  const jointAngles: Record<string, number> = {};
  if (!linkRotationController || !resolvedRobotData) {
    return jointAngles;
  }

  Object.entries(resolvedRobotData.childLinkPathByJointId).forEach(([jointId, childLinkPath]) => {
    if (!childLinkPath) {
      return;
    }

    const jointInfo = linkRotationController?.getJointInfoForLink?.(childLinkPath);
    if (!jointInfo || !Number.isFinite(Number(jointInfo.angleDeg))) {
      return;
    }

    jointAngles[jointId] = (Number(jointInfo.angleDeg) * Math.PI) / 180;
  });

  postWorkerMessage({
    type: 'joint-angles-change',
    jointAngles,
  });

  return jointAngles;
}

function pickRuntimeInteractionTargetAtLocalPoint(localX: number, localY: number): RuntimeInteractionTarget | null {
  if (!camera) {
    return null;
  }

  const width = Math.max(1, runtimeWindow.innerWidth || 1);
  const height = Math.max(1, runtimeWindow.innerHeight || 1);
  if (localX < 0 || localX > width || localY < 0 || localY > height) {
    return null;
  }

  runtimePointer.set(
    (localX / width) * 2 - 1,
    -(localY / height) * 2 + 1,
  );
  runtimeRaycaster.setFromCamera(runtimePointer, camera);

  const rawHits = runtimeRaycaster.intersectObjects(runtimePickMeshes, false);
  const geometryCandidates: Array<{
    kind: 'geometry';
    distance: number;
    layer: UsdMeshRole;
    meta: RuntimeMeshMeta;
    object: THREE.Object3D;
  }> = [];

  for (const hit of rawHits) {
    if (
      hit.object.visible === false
      || isInternalHelperObject(hit.object)
      || !isVisibleInHierarchy(hit.object)
      || ((hit.object as THREE.Mesh).isMesh && !hasPickableMaterial((hit.object as THREE.Mesh).material))
    ) {
      continue;
    }

    const meta = runtimeMeshMetaByObject.get(hit.object);
    if (!meta) {
      continue;
    }
    if (meta.role === 'collision' && !Number.isInteger(meta.objectIndex)) {
      continue;
    }

    geometryCandidates.push({
      kind: 'geometry',
      meta,
      layer: meta.role,
      object: hit.object,
      distance: hit.distance,
    });
  }

  const helperCandidates = runtimeHelperTargets.length > 0
    ? runtimeRaycaster.intersectObjects(runtimeHelperTargets, false).flatMap((hit) => {
        const resolvedHelperHit = resolveUsdHelperHit(hit.object, resolvedRobotData);
        if (!resolvedHelperHit) {
          return [];
        }

        return [{
          kind: 'helper' as const,
          distance: hit.distance,
          layer: resolvedHelperHit.layer,
          object: hit.object,
          selection: resolvedHelperHit,
        }];
      })
    : [];

  const exactCandidates = sortUsdInteractionCandidates(
    geometryCandidates.concat(helperCandidates),
    interactionLayerPriority,
  );
  const exactCandidate = exactCandidates[0] ?? null;
  if (exactCandidate?.kind === 'helper') {
    return {
      kind: 'helper',
      selection: exactCandidate.selection,
    };
  }

  return exactCandidate?.kind === 'geometry'
    ? {
        kind: 'geometry',
        meta: exactCandidate.meta,
      }
    : null;
}

function commitRuntimeHoverTarget(pickedTarget: RuntimeInteractionTarget | null): void {
  if (!hoverSelectionEnabled || !getCurrentInteractionPolicy().enableContinuousHover) {
    clearRuntimeHover();
    return;
  }

  if (!pickedTarget) {
    clearRuntimeHover();
    return;
  }

  if (pickedTarget.kind === 'helper') {
    emitHoverChange({
      type: pickedTarget.selection.type,
      id: pickedTarget.selection.id,
      helperKind: pickedTarget.selection.helperKind,
    });
    return;
  }

  const meta = pickedTarget.meta;
  const linkId = resolvedRobotData?.linkIdByPath[meta.linkPath] ?? null;
  if (!linkId) {
    clearRuntimeHover();
    return;
  }

  emitHoverChange({
    type: 'link',
    id: linkId,
    subType: meta.role,
    objectIndex: meta.objectIndex,
  });
}

function disposeUsdRootChildren(rootGroup: THREE.Group): void {
  const children = [...rootGroup.children];
  children.forEach((child) => {
    disposeObject3D(child, true);
  });
}

function disposeStageResources(): void {
  clearScheduledAutoFrame();
  clearScheduledGroundAlignmentPasses();
  shouldSettleGroundAlignmentAfterLoad = true;
  resolvedRobotData = null;
  runtimeMeshMetaByObject.clear();
  runtimeMeshesByLinkKey.clear();
  runtimePickMeshes = [];
  runtimeHelperTargets = [];
  revertInteractionHighlights();
  linkRotationController?.setEnabled(false);
  linkRotationController?.setRenderInterface(null);

  if (runtime && currentDriver) {
    disposeUsdDriver(runtime, currentDriver);
  }

  runtimeWindow.renderInterface?.dispose?.();
  currentDriver = null;
  runtimeWindow.driver = undefined;
  runtimeWindow.renderInterface = undefined;
  runtimeWindow.usdStage = undefined;

  if (usdRoot) {
    disposeUsdRootChildren(usdRoot);
    usdRoot.clear();
    usdRoot.position.set(0, 0, 0);
    usdRoot.rotation.set(0, 0, 0);
    usdRoot.scale.set(1, 1, 1);
    usdRoot.updateMatrixWorld(true);
  }

  runtime?.usdFsHelper.clearStageFiles(usdRoot ?? null);
}

function createWorkerRenderer(canvas: OffscreenCanvas): THREE.WebGLRenderer {
  const nextRenderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });

  nextRenderer.setPixelRatio(getBasePixelRatio());
  nextRenderer.setSize(runtimeWindow.innerWidth, runtimeWindow.innerHeight, false);
  nextRenderer.outputColorSpace = THREE.SRGBColorSpace;
  nextRenderer.toneMapping = THREE.NeutralToneMapping;
  nextRenderer.toneMappingExposure = 1.0;
  nextRenderer.setClearColor(0x000000, 0);

  return nextRenderer;
}

function initializeSceneGraph(canvas: OffscreenCanvas): void {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(
    WORKSPACE_DEFAULT_CAMERA_FOV,
    runtimeWindow.innerWidth / runtimeWindow.innerHeight,
    0.1,
    3500,
  );
  camera.position.fromArray(WORKSPACE_DEFAULT_CAMERA_POSITION);
  camera.up.fromArray(WORKSPACE_DEFAULT_CAMERA_UP);

  usdRoot = new THREE.Group();
  usdRoot.name = 'USD Root';
  scene.add(usdRoot);

  const ambient = new THREE.AmbientLight(0xffffff, 0.42);
  ambient.name = 'OffscreenViewerAmbientLight';
  scene.add(ambient);

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.18);
  keyLight.position.set(6, 8, 6);
  keyLight.name = 'OffscreenViewerKeyLight';
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xd7e6ff, 0.8);
  fillLight.position.set(-7, 4, -6);
  fillLight.name = 'OffscreenViewerFillLight';
  scene.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0xfff2d4, 0.48);
  rimLight.position.set(0, 10, -10);
  rimLight.name = 'OffscreenViewerRimLight';
  scene.add(rimLight);

  controls = {
    target: new THREE.Vector3(0, 0, 0),
    update: () => false,
  };

  renderer = createWorkerRenderer(canvas);
  runtimeWindow.scene = scene;
  runtimeWindow.camera = camera;
  runtimeWindow.renderer = renderer;
  runtimeWindow.usdRoot = usdRoot;
  runtimeWindow._controls = controls;
  currentOrbit = createUsdWorkerOrbitState(camera.position, controls.target);
}

function resizeViewer(width: number, height: number, devicePixelRatio: number): void {
  syncViewportMetrics(width, height, devicePixelRatio);

  if (!renderer || !camera) {
    return;
  }

  renderer.setPixelRatio(getBasePixelRatio());
  renderer.setSize(runtimeWindow.innerWidth, runtimeWindow.innerHeight, false);
  camera.aspect = runtimeWindow.innerWidth / runtimeWindow.innerHeight;
  camera.updateProjectionMatrix();
  renderScene();
}

function syncOrbitFromCamera(): void {
  if (!camera || !controls) {
    return;
  }

  currentOrbit = createUsdWorkerOrbitState(camera.position, controls.target);
}

function sampleWorkerAutoFrameBounds() {
  const bounds = usdRoot ? computeVisibleBounds(usdRoot) : null;
  return {
    stabilityKey: createCameraFrameStabilityKey(bounds),
    state: bounds,
  };
}

function applyWorkerCameraFrame(sample: ReturnType<typeof sampleWorkerAutoFrameBounds>): boolean {
  if (!usdRoot || !camera || !controls) {
    return false;
  }

  const frame = computeCameraFrame(usdRoot, camera, controls.target, sample.state);
  if (!frame) {
    return false;
  }

  controls.target.copy(frame.focusTarget);
  camera.position.copy(frame.cameraPosition);
  camera.lookAt(controls.target);
  camera.updateMatrixWorld(true);
  syncOrbitFromCamera();
  renderScene();
  return true;
}

function scheduleWorkerAutoFrameSettlePasses(loadGeneration: number): void {
  clearScheduledAutoFrame();
  disposeAutoFrame = scheduleStabilizedAutoFrame({
    sample: sampleWorkerAutoFrameBounds,
    applyFrame: applyWorkerCameraFrame,
    isActive: () => isLoadGenerationActive(loadGeneration),
    delays: [0, 96, 224],
    onSettled: () => {
      if (!isLoadGenerationActive(loadGeneration)) {
        return;
      }

      renderScene();
    },
  });
}

function summarizeWorkerRenderedScene() {
  let visibleMeshCount = 0;
  if (usdRoot) {
    usdRoot.updateMatrixWorld(true);
    usdRoot.traverseVisible((child) => {
      if ((child as THREE.Mesh).isMesh) {
        visibleMeshCount += 1;
      }
    });
  }

  const visibleBounds = usdRoot ? computeVisibleBounds(usdRoot) : null;
  const loadedMeshCount = runtimeWindow.renderInterface?.meshes
    ? Object.keys(runtimeWindow.renderInterface.meshes).length
    : 0;
  const isCameraFramed = isBoundsVisibleToCamera(visibleBounds, camera);

  return {
    loadedMeshCount,
    visibleMeshCount,
    hasVisibleBounds: Boolean(visibleBounds && !visibleBounds.isEmpty()),
    isCameraFramed,
    visibleBounds: visibleBounds
      ? {
          min: {
            x: visibleBounds.min.x,
            y: visibleBounds.min.y,
            z: visibleBounds.min.z,
          },
          max: {
            x: visibleBounds.max.x,
            y: visibleBounds.max.y,
            z: visibleBounds.max.z,
          },
        }
      : null,
  };
}

async function waitForWorkerSceneSettle(loadGeneration: number, delayMs = 320): Promise<boolean> {
  await new Promise<void>((resolve) => {
    setTimeout(() => resolve(), delayMs);
  });

  return isLoadGenerationActive(loadGeneration);
}

function validateWorkerRenderedScene(sourceFileName: string): void {
  if (!showVisual && !showCollision) {
    return;
  }

  const summary = summarizeWorkerRenderedScene();
  if (
    summary.loadedMeshCount > 0
    && (
      summary.visibleMeshCount === 0
      || !summary.hasVisibleBounds
      || !summary.isCameraFramed
    )
  ) {
    throw new Error(
      `USD offscreen worker produced no visible scene for "${sourceFileName}" `
      + `(loaded meshes: ${summary.loadedMeshCount}, visible meshes: ${summary.visibleMeshCount}, `
      + `camera framed: ${summary.isCameraFramed ? 'yes' : 'no'}).`,
    );
  }
}

function applyGroundAlignment(): void {
  if (!usdRoot) {
    return;
  }

  let lowestVisualZ = getLowestMeshZ(usdRoot, {
    includeInvisible: false,
    includeVisual: true,
    includeCollision: false,
  });

  if (lowestVisualZ === null) {
    lowestVisualZ = getLowestMeshZ(usdRoot, {
      includeInvisible: true,
      includeVisual: true,
      includeCollision: false,
    });
  }

  if (lowestVisualZ === null) {
    return;
  }

  usdRoot.position.z += groundPlaneOffset - lowestVisualZ;
  usdRoot.updateMatrixWorld(true);
}

function applyRuntimeVisibility(): void {
  if (!runtime?.applyMeshVisibilityFilters || !runtimeWindow.renderInterface) {
    return;
  }

  runtime.applyMeshVisibilityFilters(
    runtimeWindow.renderInterface,
    showVisual,
    showCollision,
    showCollisionAlwaysOnTop,
  );
  syncInteractionHighlights();
}

function normalizePreparedUsdPreloadBytes(
  bytes: PreparedUsdPreloadFile['bytes'],
): Uint8Array | null {
  if (!bytes) {
    return null;
  }

  if (bytes instanceof Uint8Array) {
    return bytes.byteLength > 0 ? bytes : null;
  }

  if (bytes instanceof ArrayBuffer) {
    return bytes.byteLength > 0 ? new Uint8Array(bytes) : null;
  }

  return null;
}

function getSharedConfigurationVirtualPath(path: string): string | null {
  const normalizedPath = toVirtualUsdPath(path);
  if (!normalizedPath.toLowerCase().includes('/configuration/')) {
    return null;
  }

  const fileName = normalizedPath.split('/').pop();
  return fileName ? `/configuration/${fileName}` : null;
}

async function writeUsdBytesToVirtualPath(
  activeRuntime: UsdWasmRuntime,
  virtualPath: string,
  bytes: Uint8Array,
  isActive: () => boolean,
): Promise<boolean> {
  if (!isActive() || !activeRuntime.usdFsHelper.canOperateOnUsdFilesystem()) {
    return false;
  }

  const normalizedVirtualPath = toVirtualUsdPath(virtualPath);
  const fileName = normalizedVirtualPath.split('/').pop() || 'resource.usd';
  const lastSlashIndex = normalizedVirtualPath.lastIndexOf('/');
  const directory = lastSlashIndex >= 0
    ? normalizedVirtualPath.slice(0, lastSlashIndex + 1)
    : '/';

  if (
    typeof activeRuntime.USD.FS_createPath !== 'function'
    || (
      typeof activeRuntime.USD.FS_writeFile !== 'function'
      && (
        typeof activeRuntime.USD.FS_createDataFile !== 'function'
        || typeof activeRuntime.USD.FS_unlink !== 'function'
      )
    )
  ) {
    return false;
  }

  activeRuntime.USD.FS_createPath('', directory, true, true);
  if (typeof activeRuntime.USD.FS_writeFile === 'function') {
    try {
      activeRuntime.USD.FS_writeFile(normalizedVirtualPath, bytes);
      activeRuntime.usdFsHelper.trackVirtualFilePath?.(normalizedVirtualPath);
      return activeRuntime.usdFsHelper.hasVirtualFilePath(normalizedVirtualPath);
    } catch {
      // Fall back to the older unlink/createDataFile path if direct writes fail.
    }
  }

  try {
    activeRuntime.USD.FS_unlink(normalizedVirtualPath);
  } catch {}
  activeRuntime.usdFsHelper.untrackVirtualFilePath?.(normalizedVirtualPath);
  activeRuntime.USD.FS_createDataFile(directory, fileName, bytes, true, true, true);
  activeRuntime.usdFsHelper.trackVirtualFilePath?.(normalizedVirtualPath);

  return activeRuntime.usdFsHelper.hasVirtualFilePath(normalizedVirtualPath);
}

async function readUsdBlobBytes(
  blob: Blob,
  isActive: () => boolean,
): Promise<Uint8Array | null> {
  if (!isActive()) {
    return null;
  }

  const arrayBuffer = await blob.arrayBuffer();
  if (!isActive() || arrayBuffer.byteLength <= 0) {
    return null;
  }

  return new Uint8Array(arrayBuffer);
}

async function resolvePreparedUsdPreloadWriteBytes(
  entry: PreparedUsdPreloadFile,
  isActive: () => boolean,
): Promise<Uint8Array | null> {
  const normalizedBytes = normalizePreparedUsdPreloadBytes(entry.bytes);
  if (normalizedBytes) {
    return normalizedBytes;
  }

  if (!entry.blob) {
    return null;
  }

  const blobBytes = await readUsdBlobBytes(entry.blob, isActive);
  if (!blobBytes) {
    return null;
  }

  const blobMimeType = entry.blob.type || null;
  entry.bytes = blobBytes;
  entry.blob = null;
  entry.mimeType = entry.mimeType ?? blobMimeType;
  return blobBytes;
}

async function preloadUsdEntry(
  activeRuntime: UsdWasmRuntime,
  entry: PreparedUsdPreloadFile,
  isActive: () => boolean,
): Promise<boolean> {
  if (!isActive()) {
    return false;
  }

  const resolvedBytes = await resolvePreparedUsdPreloadWriteBytes(entry, isActive);
  if (!resolvedBytes) {
    return false;
  }

  const loaded = await writeUsdBytesToVirtualPath(activeRuntime, entry.path, resolvedBytes, isActive);

  if (!loaded) {
    return false;
  }

  const sharedConfigurationPath = getSharedConfigurationVirtualPath(entry.path);
  if (
    sharedConfigurationPath
    && sharedConfigurationPath !== entry.path
    && !activeRuntime.usdFsHelper.hasVirtualFilePath(sharedConfigurationPath)
  ) {
    await writeUsdBytesToVirtualPath(activeRuntime, sharedConfigurationPath, resolvedBytes, isActive);
  }

  return activeRuntime.usdFsHelper.hasVirtualFilePath(entry.path);
}

async function preloadUsdDependencies(
  activeRuntime: UsdWasmRuntime,
  stageSourcePath: string,
  entries: PreparedUsdPreloadFile[],
  isActive: () => boolean,
): Promise<void> {
  await preloadUsdStageEntries({
    stageSourcePath,
    entries,
    isActive,
    preloadEntry: async (entry, entryIsActive) => {
      await preloadUsdEntry(activeRuntime, entry, entryIsActive);
    },
  });
}

async function ensureCriticalUsdDependenciesLoaded(
  activeRuntime: UsdWasmRuntime,
  stagePath: string,
  requiredPaths: string[],
  entries: PreparedUsdPreloadFile[],
  isActive: () => boolean,
): Promise<void> {
  const entryByPath = new Map(entries.map((entry) => [entry.path, entry]));
  const missingPaths: string[] = [];

  for (const requiredPath of requiredPaths) {
    if (!isActive()) {
      return;
    }

    if (activeRuntime.usdFsHelper.hasVirtualFilePath(requiredPath)) {
      continue;
    }

    let loaded = false;
    const exactEntry = entryByPath.get(requiredPath);
    if (exactEntry) {
      loaded = await preloadUsdEntry(activeRuntime, exactEntry, isActive);
    }

    if (!loaded) {
      const fileName = requiredPath.split('/').pop();
      const sharedConfigurationPath = fileName ? `/configuration/${fileName}` : null;

      if (sharedConfigurationPath) {
        try {
          const response = await fetch(sharedConfigurationPath);
          if (response.ok) {
            const blob = await response.blob();
            const sharedConfigurationBytes = await readUsdBlobBytes(blob, isActive);
            if (sharedConfigurationBytes) {
              loaded = await writeUsdBytesToVirtualPath(
                activeRuntime,
                sharedConfigurationPath,
                sharedConfigurationBytes,
                isActive,
              );
            }
            if (loaded) {
              loaded = await writeUsdBytesToVirtualPath(
                activeRuntime,
                requiredPath,
                sharedConfigurationBytes!,
                isActive,
              );
            }
          }
        } catch (error) {
          console.error(`Skipping shared USD configuration preload for ${requiredPath}`, error);
        }
      }
    }

    if (!loaded) {
      missingPaths.push(requiredPath);
    }
  }

  if (missingPaths.length > 0) {
    throw new Error(`Critical USD dependencies are missing for "${stagePath}": ${missingPaths.join(', ')}`);
  }
}

async function publishResolvedRobotData(): Promise<ViewerRobotDataResolution> {
  if (!runtimeWindow.renderInterface) {
    throw new Error('USD offscreen worker cannot publish RobotData before the render interface is ready.');
  }

  const {
    snapshot,
    resolution: initialRobotResolution,
  } = resolveUsdSceneRobotResolution({
    renderInterface: runtimeWindow.renderInterface,
    driver: currentDriver,
    stageSourcePath: currentSourceFileName,
    fileName: currentSourceFileName,
    allowWarmup: true,
  });

  const resolvedViewerRobotData = hydrateUsdViewerRobotResolutionFromRuntime(
    initialRobotResolution,
    snapshot,
    runtimeWindow.renderInterface,
  ) || initialRobotResolution;

  const resolutionWithSnapshot: ViewerRobotDataResolution = {
    ...resolvedViewerRobotData,
    usdSceneSnapshot: snapshot,
  };
  resolvedRobotData = resolutionWithSnapshot;
  rebuildRuntimeMeshIndex();
  syncInteractionHighlights();

  postWorkerMessage({
    type: 'robot-data',
    resolution: resolutionWithSnapshot,
  });
  emitCurrentJointAngles();

  return resolutionWithSnapshot;
}

async function loadUsdStageIntoWorker(message: UsdOffscreenViewerInitRequest): Promise<void> {
  const loadGeneration = ++currentLoadGeneration;
  currentSourceFileName = message.sourceFile.name;
  viewerActive = message.active;
  showVisual = message.showVisual;
  showCollision = message.showCollision;
  showCollisionAlwaysOnTop = message.showCollisionAlwaysOnTop;
  groundPlaneOffset = message.groundPlaneOffset;

  emitDocumentLoadEvent({
    status: 'loading',
    phase: 'checking-path',
    message: null,
    progressPercent: 0,
    loadedCount: null,
    totalCount: null,
  });

  try {
    emitWorkerLoadingStep('checking-path', 'Initializing USD runtime...', 1);
    runtime = await ensureUsdWasmRuntime();
    if (!isLoadGenerationActive(loadGeneration)) {
      return;
    }
    installRuntimeWindowAlias();
    runtimeWindow.USD = runtime.USD;

    emitWorkerLoadingStep('preloading-dependencies', 'Preparing USD preload bundle...', 4);
    disposeStageResources();

    const preparedStageOpenData = await trackWorkerLoadDebugStep({
      sourceFileName: message.sourceFile.name,
      step: 'prepare-stage-open-data',
      pendingDetail: {
        stagePreparationMode: 'worker',
        rendererMode: 'offscreen-worker',
        availableFileCount: message.availableFiles.length,
      },
      run: async () => await prepareUsdStageOpenDataCore(
        message.sourceFile,
        message.availableFiles,
        message.assets,
      ),
      resolveDetail: (result) => ({
        stagePreparationMode: 'worker',
        rendererMode: 'offscreen-worker',
        availableFileCount: message.availableFiles.length,
        preloadFileCount: result.preloadFiles.length,
        criticalDependencyCount: result.criticalDependencyPaths.length,
        stageSourcePath: result.stageSourcePath,
      }),
    });
    if (!isLoadGenerationActive(loadGeneration)) {
      return;
    }

    emitWorkerLoadingStep('preloading-dependencies', 'Writing USD preload files into WASM FS...', 8);
    await preloadUsdDependencies(
      runtime,
      preparedStageOpenData.stageSourcePath,
      preparedStageOpenData.preloadFiles,
      () => isLoadGenerationActive(loadGeneration),
    );
    emitWorkerLoadingStep('preloading-dependencies', 'Verifying critical USD dependencies...', 12);
    await ensureCriticalUsdDependenciesLoaded(
      runtime,
      preparedStageOpenData.stageSourcePath,
      preparedStageOpenData.criticalDependencyPaths,
      preparedStageOpenData.preloadFiles,
      () => isLoadGenerationActive(loadGeneration),
    );

    emitWorkerLoadingStep('initializing-renderer', 'Opening USD stage inside worker renderer...', 18);
    const params = createEmbeddedUsdViewerLoadParams(runtime.threadCount, {
      preferWorkerResolvedRobotData: true,
      dependenciesPreloadedToVirtualFs: true,
    });

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
      loadPassLabel: 'offscreen-worker',
      params,
      displayName: message.sourceFile.name,
      pathToLoad: preparedStageOpenData.stageSourcePath,
      isLoadActive: () => isLoadGenerationActive(loadGeneration),
      onResolvedFilename: (normalizedPath: string) => {
        currentSourceFileName = normalizedPath;
      },
      applyMeshFilters: () => {
        applyRuntimeVisibility();
      },
      rebuildLinkAxes: () => {},
      renderFrame: () => {
        renderScene();
      },
      onProgress: (progress) => {
        if (!isLoadGenerationActive(loadGeneration)) {
          return;
        }
        emitLoadingProgress(progress);
      },
    });

    currentDriver = loadState?.driver ?? null;
    runtimeWindow.driver = currentDriver;
    if (!isLoadGenerationActive(loadGeneration)) {
      disposeStageResources();
      return;
    }

    if (!loadState?.driver) {
      throw new Error(
        `USD offscreen worker did not receive a render driver for "${message.sourceFile.name}" `
        + `(${preparedStageOpenData.stageSourcePath}).`,
      );
    }

    if (loadState.drawFailed) {
      const reason = String(loadState.drawFailureReason || '').trim();
      throw new Error(
        reason
          ? `USD offscreen worker initial draw failed for "${message.sourceFile.name}" `
            + `(${preparedStageOpenData.stageSourcePath}): ${reason}`
          : `USD offscreen worker initial draw failed for "${message.sourceFile.name}" `
            + `(${preparedStageOpenData.stageSourcePath}).`,
      );
    }

    const nextLinkRotationController = ensureLinkRotationController();
    nextLinkRotationController.setRenderInterface(runtimeWindow.renderInterface);
    nextLinkRotationController.setStageSourcePath(
      currentSourceFileName || preparedStageOpenData.stageSourcePath || message.sourceFile.name,
    );
    nextLinkRotationController.setEnabled(true);

    applyRuntimeVisibility();
    shouldSettleGroundAlignmentAfterLoad = shouldSettleUsdGroundAlignmentAfterInitialLoad({
      name: currentSourceFileName || preparedStageOpenData.stageSourcePath || message.sourceFile.name,
      content: message.sourceFile.content,
    });
    if (shouldSettleGroundAlignmentAfterLoad) {
      scheduleGroundAlignmentSettlePasses(
        loadGeneration,
        currentSourceFileName || preparedStageOpenData.stageSourcePath || message.sourceFile.name,
      );
    } else {
      applyGroundAlignment();
    }
    scheduleWorkerAutoFrameSettlePasses(loadGeneration);
    syncOrbitFromCamera();
    renderScene();
    const workerResolvedRobotData = await trackWorkerLoadDebugStep({
      sourceFileName: message.sourceFile.name,
      step: 'resolve-worker-robot-data',
      pendingDetail: {
        resolutionSource: 'worker-bootstrap',
        rendererMode: 'offscreen-worker',
      },
      run: async () => await publishResolvedRobotData(),
      resolveDetail: (result) => ({
        resolutionSource: 'worker-bootstrap',
        rendererMode: 'offscreen-worker',
        stageSourcePath: result.stageSourcePath,
        linkCount: Object.keys(result.robotData.links || {}).length,
        jointCount: Object.keys(result.robotData.joints || {}).length,
        metadataSource: result.usdSceneSnapshot?.robotMetadataSnapshot?.source ?? null,
      }),
    });
    if (!await waitForWorkerSceneSettle(loadGeneration)) {
      return;
    }
    validateWorkerRenderedScene(currentSourceFileName || message.sourceFile.name);

    emitLoadDebugEntry({
      sourceFileName: message.sourceFile.name,
      step: 'ready',
      status: 'resolved',
      timestamp: Date.now(),
      detail: {
        rendererMode: 'offscreen-worker',
        stageSourcePath: workerResolvedRobotData.stageSourcePath,
        metadataSource: workerResolvedRobotData.usdSceneSnapshot?.robotMetadataSnapshot?.source ?? null,
        rootChildrenCount: usdRoot?.children.length ?? 0,
      },
    });

    emitDocumentLoadEvent({
      status: 'ready',
      phase: 'ready',
      message: null,
      progressPercent: 100,
      loadedCount: null,
      totalCount: null,
    });
  } catch (error) {
    disposeStageResources();
    if (!isLoadGenerationActive(loadGeneration)) {
      return;
    }

    const errorMessage = error instanceof Error ? error.message : 'Failed to load USD stage in offscreen worker';
    emitLoadDebugEntry({
      sourceFileName: message.sourceFile.name,
      step: 'load-failed',
      status: 'rejected',
      timestamp: Date.now(),
      detail: {
        rendererMode: 'offscreen-worker',
        error: errorMessage,
      },
    });
    postWorkerMessage({
      type: 'fatal-error',
      error: errorMessage,
    });
    emitDocumentLoadEvent({
      status: 'error',
      phase: null,
      message: null,
      progressPercent: null,
      loadedCount: null,
      totalCount: null,
      error: errorMessage,
    });
  }
}

function handlePointerDown(message: Extract<UsdOffscreenViewerWorkerRequest, { type: 'pointer-down' }>): void {
  if (!viewerActive || !camera) {
    return;
  }

  activePointer = {
    pointerId: message.pointerId,
    x: message.localX,
    y: message.localY,
  };

  if (message.button !== 0 || !getCurrentInteractionPolicy().enableMeshSelection) {
    return;
  }

  const pickedTarget = pickRuntimeInteractionTargetAtLocalPoint(message.localX, message.localY);
  if (!pickedTarget) {
    emitSelectionChange(null, null);
    syncInteractionHighlights();
    return;
  }

  if (pickedTarget.kind === 'helper') {
    emitSelectionChange({
      type: pickedTarget.selection.type,
      id: pickedTarget.selection.id,
      helperKind: pickedTarget.selection.helperKind,
    });
    syncInteractionHighlights();
    return;
  }

  const pickedMeshMeta = pickedTarget.meta;
  if (pickedMeshMeta.role === 'collision' && !Number.isInteger(pickedMeshMeta.objectIndex)) {
    return;
  }

  const linkId = resolvedRobotData?.linkIdByPath[pickedMeshMeta.linkPath] ?? null;
  if (!linkId) {
    return;
  }

  emitSelectionChange(
    {
      type: 'link',
      id: linkId,
      subType: pickedMeshMeta.role,
      objectIndex: pickedMeshMeta.objectIndex,
    },
    {
      linkId,
      objectIndex: pickedMeshMeta.objectIndex ?? 0,
      objectType: pickedMeshMeta.role,
    },
  );
  syncInteractionHighlights();
}

function handlePointerMove(message: Extract<UsdOffscreenViewerWorkerRequest, { type: 'pointer-move' }>): void {
  if (!viewerActive || !camera || !currentOrbit) {
    return;
  }

  if (activePointer && activePointer.pointerId === message.pointerId) {
    const deltaX = message.localX - activePointer.x;
    const deltaY = message.localY - activePointer.y;
    activePointer = {
      pointerId: message.pointerId,
      x: message.localX,
      y: message.localY,
    };

    if (message.buttons !== 0) {
      clearRuntimeHover();
      applyUsdWorkerOrbitPointerDelta(currentOrbit, deltaX, deltaY);
      applyUsdWorkerOrbitToCamera(currentOrbit, camera);
      renderScene();
      return;
    }
  }

  if (message.buttons !== 0 || !hoverSelectionEnabled || !getCurrentInteractionPolicy().enableContinuousHover) {
    clearRuntimeHover();
    return;
  }

  commitRuntimeHoverTarget(pickRuntimeInteractionTargetAtLocalPoint(message.localX, message.localY));
  syncInteractionHighlights();
}

function handlePointerUp(message: Extract<UsdOffscreenViewerWorkerRequest, { type: 'pointer-up' }>): void {
  if (activePointer?.pointerId === message.pointerId) {
    activePointer = null;
  }
}

function handlePointerLeave(): void {
  activePointer = null;
  clearRuntimeHover();
  syncInteractionHighlights();
}

function handleWheel(message: Extract<UsdOffscreenViewerWorkerRequest, { type: 'wheel' }>): void {
  if (!viewerActive || !camera || !currentOrbit) {
    return;
  }

  applyUsdWorkerOrbitZoomDelta(currentOrbit, message.deltaY);
  applyUsdWorkerOrbitToCamera(currentOrbit, camera);
  renderScene();
}

function handleSetInteractionState(
  message: Extract<UsdOffscreenViewerWorkerRequest, { type: 'set-interaction-state' }>,
): void {
  interactionToolMode = message.toolMode;
  hoverSelectionEnabled = message.hoverSelectionEnabled;
  interactionLayerPriority = [...message.interactionLayerPriority];
  selectionState = cloneSelectionState(message.selection);
  hoveredSelectionState = cloneSelectionState(message.hoveredSelection);
  lastEmittedHoverState = cloneSelectionState(message.hoveredSelection);

  if (!hoverSelectionEnabled || !getCurrentInteractionPolicy().enableContinuousHover) {
    if (lastEmittedHoverState) {
      emitHoverChange(null);
    } else {
      lastEmittedHoverState = null;
      hoveredSelectionState = null;
    }
  }

  syncInteractionHighlights();
}

function handleSetJointAngle(
  message: Extract<UsdOffscreenViewerWorkerRequest, { type: 'set-joint-angle' }>,
): void {
  if (!viewerActive || !resolvedRobotData || !runtimeWindow.renderInterface) {
    return;
  }

  const childLinkPath = resolvedRobotData.childLinkPathByJointId[message.jointId];
  if (!childLinkPath) {
    return;
  }

  const controller = ensureLinkRotationController();
  controller.setEnabled(true);
  controller.setRenderInterface(runtimeWindow.renderInterface);
  controller.setStageSourcePath(currentSourceFileName || resolvedRobotData.stageSourcePath || currentSourceFileName);

  controller.setJointAngleForLink(
    childLinkPath,
    (message.angleRad * 180) / Math.PI,
    { emitSelectionChanged: false },
  );
  controller.apply(runtimeWindow.renderInterface, { force: true });
  renderScene();
  emitCurrentJointAngles();
}

function disposeWorker(): void {
  disposed = true;
  currentLoadGeneration += 1;
  activePointer = null;
  disposeStageResources();

  renderer?.dispose();
  renderer = null;
  scene = null;
  camera = null;
  usdRoot = null;
  controls = null;
  currentOrbit = null;

  runtimeWindow.scene = undefined;
  runtimeWindow.camera = undefined;
  runtimeWindow.renderer = undefined;
  runtimeWindow.usdRoot = undefined;
  runtimeWindow._controls = undefined;

  workerScope.close();
}

installWorkerViewerGlobals();

workerScope.addEventListener('message', (event: MessageEvent<UsdOffscreenViewerWorkerRequest>) => {
  const message = event.data;
  if (!message || disposed) {
    return;
  }

  switch (message.type) {
    case 'init': {
      emitDocumentLoadEvent({
        status: 'loading',
        phase: 'checking-path',
        message: 'Offscreen worker booted.',
        progressPercent: 0,
        loadedCount: null,
        totalCount: null,
      });
      syncViewportMetrics(message.width, message.height, message.devicePixelRatio);
      initializeSceneGraph(message.canvas);
      emitDocumentLoadEvent({
        status: 'loading',
        phase: 'initializing-renderer',
        message: 'Offscreen renderer initialized.',
        progressPercent: 0,
        loadedCount: null,
        totalCount: null,
      });
      void loadUsdStageIntoWorker(message);
      return;
    }
    case 'resize': {
      resizeViewer(message.width, message.height, message.devicePixelRatio);
      return;
    }
    case 'pointer-down': {
      handlePointerDown(message);
      return;
    }
    case 'pointer-move': {
      handlePointerMove(message);
      return;
    }
    case 'pointer-up': {
      handlePointerUp(message);
      return;
    }
    case 'pointer-leave': {
      handlePointerLeave();
      return;
    }
    case 'wheel': {
      handleWheel(message);
      return;
    }
    case 'set-visibility': {
      showVisual = message.showVisual;
      showCollision = message.showCollision;
      showCollisionAlwaysOnTop = message.showCollisionAlwaysOnTop;
      applyRuntimeVisibility();
      return;
    }
    case 'set-ground-offset': {
      groundPlaneOffset = message.groundPlaneOffset;
      if (shouldSettleGroundAlignmentAfterLoad) {
        scheduleGroundAlignmentSettlePasses(currentLoadGeneration, currentSourceFileName);
      } else {
        renderScene();
      }
      return;
    }
    case 'set-active': {
      viewerActive = message.active;
      if (!viewerActive) {
        handlePointerLeave();
      }
      return;
    }
    case 'set-interaction-state': {
      handleSetInteractionState(message);
      return;
    }
    case 'set-joint-angle': {
      handleSetJointAngle(message);
      return;
    }
    case 'dispose': {
      disposeWorker();
      return;
    }
    default: {
      return;
    }
  }
});
