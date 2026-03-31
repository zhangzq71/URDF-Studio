/// <reference lib="webworker" />

import * as THREE from 'three';
import { disposeObject3D } from '@/shared/utils/three/dispose';
import { WORKSPACE_DEFAULT_CAMERA_FOV, WORKSPACE_DEFAULT_CAMERA_POSITION, WORKSPACE_DEFAULT_CAMERA_UP } from '@/shared/components/3d/scene/constants.ts';
import { getLowestMeshZ } from '@/shared/utils';
import type { PreparedUsdPreloadFile } from '../utils/usdStageOpenPreparation.ts';
import { preloadUsdStageEntries } from '../utils/usdStagePreloadExecution.ts';
import { prepareUsdStageOpenDataCore } from '../utils/usdStageOpenPreparationCore.ts';
import type { ViewerDocumentLoadEvent, UsdLoadingProgress } from '../types';
import { hydrateUsdViewerRobotResolutionFromRuntime } from '../utils/usdRuntimeRobotHydration.ts';
import { resolveUsdSceneRobotResolution } from '../utils/usdSceneRobotResolution.ts';
import { toVirtualUsdPath } from '../utils/usdPreloadSources.ts';
import { resolveUsdGroundAlignmentSettleDelaysMs } from '../utils/usdGroundAlignmentDelays.ts';
import {
  disposeUsdDriver,
  ensureUsdWasmRuntime,
  type UsdWasmRuntime,
} from '../utils/usdWasmRuntime.ts';
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
  UsdOffscreenViewerLoadDebugEntry,
  UsdOffscreenViewerWorkerRequest,
  UsdOffscreenViewerWorkerResponse,
} from '../utils/usdOffscreenViewerProtocol.ts';

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
let showVisual = true;
let showCollision = true;
let showCollisionAlwaysOnTop = true;
let groundPlaneOffset = 0;
let currentSourceFileName = '';
let groundAlignmentTimeouts: Array<ReturnType<typeof setTimeout>> = [];
let disposeAutoFrame: (() => void) | null = null;

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

function disposeUsdRootChildren(rootGroup: THREE.Group): void {
  const children = [...rootGroup.children];
  children.forEach((child) => {
    disposeObject3D(child, true);
  });
}

function disposeStageResources(): void {
  clearScheduledAutoFrame();
  clearScheduledGroundAlignmentPasses();

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
  renderScene();
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
    || typeof activeRuntime.USD.FS_createDataFile !== 'function'
    || typeof activeRuntime.USD.FS_unlink !== 'function'
  ) {
    return false;
  }

  activeRuntime.USD.FS_createPath('', directory, true, true);
  try {
    activeRuntime.USD.FS_unlink(normalizedVirtualPath);
  } catch {}
  activeRuntime.usdFsHelper.untrackVirtualFilePath?.(normalizedVirtualPath);
  activeRuntime.USD.FS_createDataFile(directory, fileName, bytes, true, true, true);
  activeRuntime.usdFsHelper.trackVirtualFilePath?.(normalizedVirtualPath);

  return activeRuntime.usdFsHelper.hasVirtualFilePath(normalizedVirtualPath);
}

async function writeUsdBlobToVirtualPath(
  activeRuntime: UsdWasmRuntime,
  virtualPath: string,
  blob: Blob,
  isActive: () => boolean,
): Promise<boolean> {
  if (!isActive()) {
    return false;
  }

  const bytes = new Uint8Array(await blob.arrayBuffer());
  return writeUsdBytesToVirtualPath(activeRuntime, virtualPath, bytes, isActive);
}

async function preloadUsdEntry(
  activeRuntime: UsdWasmRuntime,
  entry: PreparedUsdPreloadFile,
  isActive: () => boolean,
): Promise<boolean> {
  if (!isActive()) {
    return false;
  }

  const normalizedBytes = normalizePreparedUsdPreloadBytes(entry.bytes);
  if (!normalizedBytes && !entry.blob) {
    return false;
  }

  const loaded = normalizedBytes
    ? await writeUsdBytesToVirtualPath(activeRuntime, entry.path, normalizedBytes, isActive)
    : await writeUsdBlobToVirtualPath(activeRuntime, entry.path, entry.blob!, isActive);

  if (!loaded) {
    return false;
  }

  const sharedConfigurationPath = getSharedConfigurationVirtualPath(entry.path);
  if (
    sharedConfigurationPath
    && sharedConfigurationPath !== entry.path
    && !activeRuntime.usdFsHelper.hasVirtualFilePath(sharedConfigurationPath)
  ) {
    if (normalizedBytes) {
      await writeUsdBytesToVirtualPath(activeRuntime, sharedConfigurationPath, normalizedBytes, isActive);
    } else {
      await writeUsdBlobToVirtualPath(activeRuntime, sharedConfigurationPath, entry.blob!, isActive);
    }
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
            loaded = await writeUsdBlobToVirtualPath(activeRuntime, sharedConfigurationPath, blob, isActive);
            if (loaded) {
              loaded = await writeUsdBlobToVirtualPath(activeRuntime, requiredPath, blob, isActive);
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

  const resolvedRobotData = hydrateUsdViewerRobotResolutionFromRuntime(
    initialRobotResolution,
    snapshot,
    runtimeWindow.renderInterface,
  ) || initialRobotResolution;

  const resolutionWithSnapshot: ViewerRobotDataResolution = {
    ...resolvedRobotData,
    usdSceneSnapshot: snapshot,
  };

  postWorkerMessage({
    type: 'robot-data',
    resolution: resolutionWithSnapshot,
  });

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

    applyRuntimeVisibility();
    scheduleGroundAlignmentSettlePasses(
      loadGeneration,
      currentSourceFileName || preparedStageOpenData.stageSourcePath || message.sourceFile.name,
    );
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
    x: message.clientX,
    y: message.clientY,
  };
}

function handlePointerMove(message: Extract<UsdOffscreenViewerWorkerRequest, { type: 'pointer-move' }>): void {
  if (!viewerActive || !camera || !currentOrbit || !activePointer || activePointer.pointerId !== message.pointerId) {
    return;
  }

  const deltaX = message.clientX - activePointer.x;
  const deltaY = message.clientY - activePointer.y;
  activePointer = {
    pointerId: message.pointerId,
    x: message.clientX,
    y: message.clientY,
  };

  if (message.buttons === 0) {
    return;
  }

  applyUsdWorkerOrbitPointerDelta(currentOrbit, deltaX, deltaY);
  applyUsdWorkerOrbitToCamera(currentOrbit, camera);
  renderScene();
}

function handlePointerUp(message: Extract<UsdOffscreenViewerWorkerRequest, { type: 'pointer-up' }>): void {
  if (activePointer?.pointerId === message.pointerId) {
    activePointer = null;
  }
}

function handleWheel(message: Extract<UsdOffscreenViewerWorkerRequest, { type: 'wheel' }>): void {
  if (!viewerActive || !camera || !currentOrbit) {
    return;
  }

  applyUsdWorkerOrbitZoomDelta(currentOrbit, message.deltaY);
  applyUsdWorkerOrbitToCamera(currentOrbit, camera);
  renderScene();
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
      scheduleGroundAlignmentSettlePasses(currentLoadGeneration, currentSourceFileName);
      return;
    }
    case 'set-active': {
      viewerActive = message.active;
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
