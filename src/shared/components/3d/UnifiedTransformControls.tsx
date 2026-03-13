import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { TransformControls as DreiTransformControls } from '@react-three/drei';
import * as THREE from 'three';

type DreiTransformControlsProps = React.ComponentProps<typeof DreiTransformControls>;
type SharedControlRef = React.MutableRefObject<any | null> | React.RefObject<any | null>;

export type UnifiedTransformMode = 'translate' | 'rotate' | 'scale' | 'universal';
export type UnifiedTransformHoverStyle = 'stock' | 'single-axis';
export type UnifiedTransformDisplayStyle = 'stock' | 'thick-primary';

export const VISUALIZER_UNIFIED_GIZMO_SIZE = 0.96;
const DEFAULT_DISPLAY_THICKNESS_SCALE = 1;

interface UnifiedTransformControlsProps extends Omit<DreiTransformControlsProps, 'mode'> {
  mode: UnifiedTransformMode;
  translateObject?: THREE.Object3D;
  translateSpace?: DreiTransformControlsProps['space'];
  rotateRef?: SharedControlRef;
  rotateObject?: THREE.Object3D;
  rotateSize?: number;
  rotateSpace?: DreiTransformControlsProps['space'];
  rotateEnabled?: boolean;
  onRotateChange?: DreiTransformControlsProps['onChange'];
  enableUniversalPriority?: boolean;
  hoverStyle?: UnifiedTransformHoverStyle;
  displayStyle?: UnifiedTransformDisplayStyle;
  displayThicknessScale?: number;
}

type UniversalOwner = 'translate' | 'rotate' | null;
type ControlsWithEnabled = THREE.EventDispatcher & { enabled: boolean };
type VisibleControlHit = {
  owner: Exclude<UniversalOwner, null>;
  axis: 'X' | 'Y' | 'Z';
  renderOrder: number;
  distance: number;
  score: number;
};

const AXIS_NAMES = new Set(['X', 'Y', 'Z']);
const FALLBACK_ACTIVE_AXIS_COLOR = new THREE.Color(0x0a84ff);
const RESOLVED_ACTIVE_AXIS_COLOR = new THREE.Color(0x0a84ff);
const THICK_TRANSLATE_SHAFT_RADIUS = 0.042;
const THICK_TRANSLATE_TIP_RADIUS = 0.17;
const TRANSLATE_ARROW_BASE_RADIUS = 0.05;
const TRANSLATE_ARROW_LENGTH = 0.42;
const THICK_ROTATE_ARC_RADIUS = 0.038;
const THICK_TRANSLATE_PICKER_RADIUS = 0.115;
const THICK_ROTATE_PICKER_ARC_RADIUS = 0.076;
const TRANSLATE_CENTER_GAP = 0.18;
const TRANSLATE_RING_INTERSECTION_RADIUS = 0.5;
const TRANSLATE_RING_INTERSECTION_GAP = THICK_ROTATE_ARC_RADIUS * 3.6;
const MIN_TRANSLATE_SHAFT_SEGMENT_LENGTH = 0.025;
const TRANSLATE_ARROW_HANDLE_OFFSET = 1.14;
const TRANSLATE_GAP_BRIDGE_DASH_COUNT = 3;
const TRANSLATE_GAP_BRIDGE_RADIUS = 0.026;
const TRANSLATE_GAP_BRIDGE_OPACITY = 0.9;
const TRANSLATE_AUXILIARY_NAMES = new Set(['XY', 'YZ', 'XZ', 'XYZ']);
const ROTATE_AUXILIARY_NAMES = new Set(['E', 'XYZE']);
const GIZMO_BASE_RENDER_ORDER = 10000;
const GIZMO_ARC_RENDER_ORDER = 10005;
const DISPLAY_BEHAVIOR_PATCH_VERSION = 'thick-primary-v20';
const GIZMO_TAG_VERSION = 'interactive-only-v2';
const TRANSLATE_AXIS_SCALE_EPSILON = 1e-8;
const AXIS_GEOMETRY_RADIAL_SEGMENTS = 16;
const TRANSLATE_PICKER_START_OFFSET = 0.82;
const TRANSLATE_PICKER_END_PADDING = 0.04;
const ROTATE_ARC_GAP_SAMPLE_COUNT = 2;
const ROTATE_ARC_BACK_OPACITY = 0.34;
const ROTATE_ARC_FRONT_OPACITY = 0.94;
const TRANSLATE_SCREEN_HOVER_SAMPLE_COUNT = 11;
const TRANSLATE_SCREEN_HOVER_PADDING_PX = 1;
const ROTATE_SCREEN_HOVER_PADDING_PX = 0.5;
const ROTATE_SCREEN_HOVER_MIN_RADIUS_PX = 1.5;
const ROTATE_BACK_HIT_THRESHOLD_SCALE = 0.55;
const ROTATE_BACK_HIT_SCORE_PENALTY = 0.18;

const hasEnabledFlag = (controls: unknown): controls is ControlsWithEnabled =>
  typeof controls === 'object' &&
  controls !== null &&
  'enabled' in controls &&
  typeof (controls as { enabled?: unknown }).enabled === 'boolean';

const isObjectAttachedToSceneGraph = (
  scene: THREE.Object3D | null | undefined,
  object: THREE.Object3D | null | undefined
) => {
  if (!scene || !object) return false;

  let current: THREE.Object3D | null = object;
  while (current) {
    if (current === scene) {
      return true;
    }
    current = current.parent;
  }

  return false;
};

const resolveActiveAxisColor = () => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return FALLBACK_ACTIVE_AXIS_COLOR;
  }

  const rootStyle = window.getComputedStyle(document.documentElement);
  const colorValue =
    rootStyle.getPropertyValue('--color-system-blue').trim()
    || rootStyle.getPropertyValue('--ui-accent').trim();

  if (!colorValue) {
    return FALLBACK_ACTIVE_AXIS_COLOR;
  }

  try {
    RESOLVED_ACTIVE_AXIS_COLOR.set(colorValue);
    return RESOLVED_ACTIVE_AXIS_COLOR;
  } catch {
    return FALLBACK_ACTIVE_AXIS_COLOR;
  }
};

const getGizmoRoot = (controls: any) => {
  if (!controls) return null;

  if (controls._gizmo?.isTransformControlsGizmo) {
    return controls._gizmo;
  }

  if (typeof controls.getHelper === 'function') {
    const helperRoot = controls.getHelper();
    const gizmoChild = helperRoot?.children?.find?.((child: THREE.Object3D & { isTransformControlsGizmo?: boolean }) =>
      Boolean(child?.isTransformControlsGizmo)
    );
    if (gizmoChild) return gizmoChild;
  }

  if (controls._root?.children?.length) {
    const gizmoChild = controls._root.children.find((child: THREE.Object3D & { isTransformControlsGizmo?: boolean }) =>
      Boolean(child?.isTransformControlsGizmo)
    );
    if (gizmoChild) return gizmoChild;
  }

  return controls?.children?.[0] ?? controls?.gizmo ?? null;
};

const getHandleMaterials = (handle: any) => {
  const material = handle?.material;
  if (!material) return [] as THREE.Material[];
  return Array.isArray(material) ? material : [material];
};

const getPositiveScale = (scale: THREE.Vector3) => new THREE.Vector3(
  Math.abs(scale.x),
  Math.abs(scale.y),
  Math.abs(scale.z),
);

const tagGizmoBranch = (branch: unknown) => {
  if (!branch) return;

  if (branch instanceof THREE.Object3D || typeof (branch as { traverse?: unknown }).traverse === 'function') {
    (branch as THREE.Object3D).traverse((node: THREE.Object3D) => {
      node.userData = {
        ...node.userData,
        isGizmo: true,
      };
    });
    return;
  }

  if (typeof branch === 'object') {
    Object.values(branch as Record<string, unknown>).forEach(tagGizmoBranch);
  }
};

const markGizmoObjects = (controls: any) => {
  const gizmo = getGizmoRoot(controls);
  if (!gizmo || gizmo.userData?.urdfGizmoTagVersion === GIZMO_TAG_VERSION) return;

  gizmo.traverse((node: THREE.Object3D) => {
    if (!node.userData?.isGizmo) return;
    const nextUserData = { ...node.userData };
    delete nextUserData.isGizmo;
    node.userData = nextUserData;
  });

  tagGizmoBranch(gizmo.gizmo);
  tagGizmoBranch(gizmo.picker);
  gizmo.userData.urdfGizmoTagVersion = GIZMO_TAG_VERSION;
};

const rememberBaseMaterialState = (material: THREE.Material & { color?: THREE.Color }) => {
  if (material.userData.urdfBaseOpacity === undefined) {
    material.userData.urdfBaseOpacity = material.opacity;
  }
  if (material.userData.urdfBaseTransparent === undefined) {
    material.userData.urdfBaseTransparent = material.transparent;
  }
  if (!material.userData.urdfBaseColor && material.color instanceof THREE.Color) {
    material.userData.urdfBaseColor = material.color.clone();
  }
};

const getBaseOpacity = (material: THREE.Material) =>
  typeof material.userData.urdfBaseOpacity === 'number'
    ? (material.userData.urdfBaseOpacity as number)
    : material.opacity;

const getBaseColor = (material: THREE.Material & { color?: THREE.Color }) => {
  if (material.userData.urdfBaseColor instanceof THREE.Color) {
    return material.userData.urdfBaseColor as THREE.Color;
  }
  return material.color instanceof THREE.Color ? material.color : null;
};

const getMaterialAxis = (handle: any, material: THREE.Material & { color?: THREE.Color }) => {
  if (AXIS_NAMES.has(handle?.userData?.urdfAxis)) {
    return handle.userData.urdfAxis as 'X' | 'Y' | 'Z';
  }

  if (AXIS_NAMES.has(handle?.name)) {
    return handle.name as 'X' | 'Y' | 'Z';
  }

  const color = getBaseColor(material);
  if (!color) return null;

  if (color.r > 0.5 && color.g < 0.4 && color.b < 0.4) return 'X';
  if (color.g > 0.5 && color.r < 0.4 && color.b < 0.4) return 'Y';
  if (color.b > 0.5 && color.r < 0.4 && color.g < 0.4) return 'Z';
  return null;
};

const applySingleAxisHoverAppearance = (controls: any) => {
  const gizmo = getGizmoRoot(controls);
  const mode = controls?.mode ?? gizmo?.mode;
  const activeAxisColor = resolveActiveAxisColor();
  const activeAxis =
    controls?.enabled && typeof controls.axis === 'string' && AXIS_NAMES.has(controls.axis)
      ? (controls.axis as 'X' | 'Y' | 'Z')
      : null;

  const handles = [
    ...(gizmo?.picker?.[mode]?.children ?? []).map((handle: THREE.Object3D) => ({
      handle,
      source: 'picker' as const,
    })),
    ...(gizmo?.gizmo?.[mode]?.children ?? []).map((handle: THREE.Object3D) => ({
      handle,
      source: 'gizmo' as const,
    })),
    ...(gizmo?.helper?.[mode]?.children ?? []).map((handle: THREE.Object3D) => ({
      handle,
      source: 'helper' as const,
    })),
  ];

  for (const { handle, source } of handles) {
    for (const material of getHandleMaterials(handle)) {
      if (!(material instanceof THREE.Material)) continue;

      rememberBaseMaterialState(material as THREE.Material & { color?: THREE.Color });

      const baseOpacity = getBaseOpacity(material);
      const baseColor = getBaseColor(material as THREE.Material & { color?: THREE.Color });

      material.opacity = baseOpacity;
      material.transparent = true;
      material.depthTest = false;
      material.depthWrite = false;

      if (baseColor && 'color' in material && material.color instanceof THREE.Color) {
        material.color.copy(baseColor);
      }

      if (source === 'picker') {
        material.opacity = 0;
        material.transparent = true;
        material.needsUpdate = true;
        continue;
      }

      const isGapBridge = Boolean(handle?.userData?.urdfTranslateGapBridge);
      if (isGapBridge) {
        const materialAxis = getMaterialAxis(handle, material as THREE.Material & { color?: THREE.Color });
        const isActiveBridge = Boolean(activeAxis && materialAxis === activeAxis);
        handle.visible = isActiveBridge;

        if (!isActiveBridge) {
          material.opacity = 0;
          material.transparent = true;
          material.needsUpdate = true;
          continue;
        }

        if ('color' in material && material.color instanceof THREE.Color) {
          material.color.copy(activeAxisColor);
        }
        material.opacity = TRANSLATE_GAP_BRIDGE_OPACITY;
        material.transparent = true;
        material.needsUpdate = true;
        continue;
      }

      if (!activeAxis) {
        material.needsUpdate = true;
        continue;
      }

      const materialAxis = getMaterialAxis(handle, material as THREE.Material & { color?: THREE.Color });
      if (materialAxis === activeAxis) {
        if ('color' in material && material.color instanceof THREE.Color) {
          material.color.copy(activeAxisColor);
        }
        material.opacity = 1;
        material.transparent = true;
        material.needsUpdate = true;
      } else {
        material.needsUpdate = true;
      }
    }
  }
};

const enforcePatchedVisibility = (controls: any) => {
  const gizmo = getGizmoRoot(controls);
  if (!gizmo) return;

  gizmo.traverse((node: THREE.Object3D) => {
    if (node.userData?.urdfHideStockAxisLine) {
      node.visible = false;
    }

    if (!node.userData?.urdfTranslateFixedVisible) {
      return;
    }

    const scaledNode = node as THREE.Object3D & { scale?: THREE.Vector3 };
    if (scaledNode.scale instanceof THREE.Vector3) {
      if (scaledNode.scale.lengthSq() > TRANSLATE_AXIS_SCALE_EPSILON) {
        const normalizedScale = getPositiveScale(scaledNode.scale);
        scaledNode.scale.copy(normalizedScale);
        node.userData.urdfTranslateStableScale = normalizedScale;
      } else if (node.userData.urdfTranslateStableScale instanceof THREE.Vector3) {
        const stableScale = node.userData.urdfTranslateStableScale as THREE.Vector3;
        scaledNode.scale.copy(getPositiveScale(stableScale));
      }
    }

    node.visible = true;
  });
};

const preRecordGizmoMaterialStates = (controls: any) => {
  // Pre-record the base material state of every visible handle before
  // TransformControls gets a chance to modify opacity/color on first hover.
  // Without this, `rememberBaseMaterialState` might capture a TC-modified color
  // (e.g. yellow hover highlight) as the "base", causing permanent visual glitches.
  const gizmo = getGizmoRoot(controls);
  if (!gizmo) return;

  const mode = controls?.mode;
  const groups = mode
    ? [gizmo?.gizmo?.[mode], gizmo?.picker?.[mode], gizmo?.helper?.[mode]]
    : [gizmo?.gizmo?.translate, gizmo?.gizmo?.rotate, gizmo?.gizmo?.scale,
       gizmo?.picker?.translate, gizmo?.picker?.rotate, gizmo?.picker?.scale];

  for (const group of groups) {
    if (!group) continue;
    (group as THREE.Object3D).traverse?.((node: THREE.Object3D) => {
      for (const material of getHandleMaterials(node as any)) {
        if (material instanceof THREE.Material) {
          rememberBaseMaterialState(material as THREE.Material & { color?: THREE.Color });
        }
      }
    });
  }
};

const patchHoverBehavior = (controls: any, hoverStyle: UnifiedTransformHoverStyle) => {
  const gizmo = getGizmoRoot(controls);
  if (!gizmo || hoverStyle !== 'single-axis') return;
  if (gizmo.userData?.urdfHoverBehaviorPatched) return;

  // Record base states NOW, before TransformControls can mutate them.
  preRecordGizmoMaterialStates(controls);

  const originalUpdateMatrixWorld = gizmo.updateMatrixWorld.bind(gizmo);
  gizmo.updateMatrixWorld = (...args: any[]) => {
    const result = originalUpdateMatrixWorld(...args);
    enforcePatchedVisibility(controls);
    applySingleAxisHoverAppearance(controls);
    return result;
  };

  gizmo.userData.urdfHoverBehaviorPatched = true;
  enforcePatchedVisibility(controls);
  applySingleAxisHoverAppearance(controls);
};

const getAxisFromObjectBranch = (object: THREE.Object3D | null | undefined): 'X' | 'Y' | 'Z' | null => {
  let current: THREE.Object3D | null | undefined = object;

  while (current) {
    if (AXIS_NAMES.has((current as THREE.Object3D & { userData?: Record<string, unknown> }).userData?.urdfAxis)) {
      return (current.userData.urdfAxis as 'X' | 'Y' | 'Z');
    }

    if (AXIS_NAMES.has(current.name)) {
      return current.name as 'X' | 'Y' | 'Z';
    }

    current = current.parent;
  }

  return null;
};

const getPointerScreenPosition = (
  pointer: { x: number; y: number },
  rect: DOMRect
) => new THREE.Vector2(
  ((pointer.x + 1) * 0.5) * rect.width,
  ((1 - pointer.y) * 0.5) * rect.height,
);

const projectWorldPointToScreen = (
  worldPoint: THREE.Vector3,
  camera: THREE.Camera,
  rect: DOMRect,
  target: THREE.Vector2
) => {
  const projected = worldPoint.clone().project(camera);
  if (!Number.isFinite(projected.x) || !Number.isFinite(projected.y) || projected.z < -1 || projected.z > 1) {
    return null;
  }

  target.set(
    ((projected.x + 1) * 0.5) * rect.width,
    ((1 - projected.y) * 0.5) * rect.height,
  );
  return target;
};

const getTranslateHandleLocalSamples = (handle: THREE.Mesh, axis: 'X' | 'Y' | 'Z') => {
  const geometry = handle.geometry as THREE.BufferGeometry;
  const geometryVersion = `${geometry.uuid}:${axis}:${TRANSLATE_SCREEN_HOVER_SAMPLE_COUNT}`;

  if (
    handle.userData.urdfTranslateScreenSampleVersion === geometryVersion &&
    Array.isArray(handle.userData.urdfTranslateScreenSamples)
  ) {
    return handle.userData.urdfTranslateScreenSamples as THREE.Vector3[];
  }

  if (!geometry.boundingBox) {
    geometry.computeBoundingBox();
  }

  const boundingBox = geometry.boundingBox;
  if (!boundingBox) {
    handle.userData.urdfTranslateScreenSamples = [new THREE.Vector3()];
    handle.userData.urdfTranslateScreenSampleVersion = geometryVersion;
    return handle.userData.urdfTranslateScreenSamples as THREE.Vector3[];
  }

  const center = boundingBox.getCenter(new THREE.Vector3());
  const axisKey = axis.toLowerCase() as 'x' | 'y' | 'z';
  const start = boundingBox.min[axisKey];
  const end = boundingBox.max[axisKey];
  const samples: THREE.Vector3[] = [];

  for (let index = 0; index < TRANSLATE_SCREEN_HOVER_SAMPLE_COUNT; index += 1) {
    const alpha = TRANSLATE_SCREEN_HOVER_SAMPLE_COUNT === 1
      ? 0.5
      : index / (TRANSLATE_SCREEN_HOVER_SAMPLE_COUNT - 1);
    const point = center.clone();
    point[axisKey] = THREE.MathUtils.lerp(start, end, alpha);
    samples.push(point);
  }

  handle.userData.urdfTranslateScreenSamples = samples;
  handle.userData.urdfTranslateScreenSampleVersion = geometryVersion;
  return samples;
};

const TRANSLATE_AXIS_PERP_COMPONENTS: Record<'X' | 'Y' | 'Z', readonly ['x' | 'y' | 'z', 'x' | 'y' | 'z']> = {
  X: ['y', 'z'],
  Y: ['x', 'z'],
  Z: ['x', 'y'],
};

const getTranslateHandleLocalRadius = (
  handle: THREE.Object3D,
  alpha: number
) => {
  if (handle.userData?.urdfTranslateTip) {
    return TRANSLATE_ARROW_BASE_RADIUS * Math.max(0, 1 - alpha);
  }

  if (handle.userData?.urdfTranslateGapBridge) {
    return TRANSLATE_GAP_BRIDGE_RADIUS;
  }

  return THICK_TRANSLATE_SHAFT_RADIUS;
};

const distancePointToSegment2D = (
  point: THREE.Vector2,
  start: THREE.Vector2,
  end: THREE.Vector2
) => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSq = dx * dx + dy * dy;

  if (lengthSq <= 1e-8) {
    return point.distanceTo(start);
  }

  const t = THREE.MathUtils.clamp(
    ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSq,
    0,
    1
  );

  const projectedX = start.x + dx * t;
  const projectedY = start.y + dy * t;
  return Math.hypot(point.x - projectedX, point.y - projectedY);
};

const preferVisibleControlHit = (
  currentHit: VisibleControlHit | null,
  nextHit: VisibleControlHit,
  previousOwner?: UniversalOwner
) => {
  if (!currentHit) return nextHit;

  const renderOrderDelta = nextHit.renderOrder - currentHit.renderOrder;
  if (Math.abs(renderOrderDelta) > 1e-6) {
    return renderOrderDelta > 0 ? nextHit : currentHit;
  }

  const distanceDelta = currentHit.distance - nextHit.distance;
  if (Math.abs(distanceDelta) > 1e-6) {
    return distanceDelta > 0 ? nextHit : currentHit;
  }

  const scoreDelta = currentHit.score - nextHit.score;
  if (Math.abs(scoreDelta) > 1e-6) {
    return scoreDelta > 0 ? nextHit : currentHit;
  }

  if (previousOwner) {
    if (nextHit.owner === previousOwner && currentHit.owner !== previousOwner) {
      return nextHit;
    }
    if (currentHit.owner === previousOwner && nextHit.owner !== previousOwner) {
      return currentHit;
    }
  }

  return currentHit;
};

const resolveVisibleTranslateHit = (
  controls: any,
  pointer: { x: number; y: number },
  axisFilter?: 'X' | 'Y' | 'Z'
): VisibleControlHit | null => {
  if (!controls || controls.mode !== 'translate' || !controls.camera || !controls.domElement) {
    return null;
  }

  const gizmo = getGizmoRoot(controls);
  const translateGroup = gizmo?.gizmo?.translate as THREE.Object3D | undefined;
  if (!translateGroup) return null;

  const rect = controls.domElement.getBoundingClientRect?.();
  if (!rect || rect.width <= 0 || rect.height <= 0) return null;

  const pointerPx = getPointerScreenPosition(pointer, rect);
  const projectedPoint = new THREE.Vector2();
  const projectedOffsetA = new THREE.Vector2();
  const projectedOffsetB = new THREE.Vector2();
  const worldSamplePoint = new THREE.Vector3();
  const worldOffsetPoint = new THREE.Vector3();
  const cameraWorldPosition = new THREE.Vector3();
  controls.camera.getWorldPosition(cameraWorldPosition);
  let bestHit: VisibleControlHit | null = null;

  translateGroup.traverse((node) => {
    const handle = node as THREE.Mesh;
    const axis = getAxisFromObjectBranch(handle);
    if (!axis || !handle.visible || !handle.isMesh) return;
    if (axisFilter && axis !== axisFilter) return;
    if (
      !handle.userData?.urdfTranslateShaft &&
      !handle.userData?.urdfTranslateTip &&
      !handle.userData?.urdfTranslateGapBridge
    ) {
      return;
    }

    const perpendicularComponents = TRANSLATE_AXIS_PERP_COMPONENTS[axis];
    if (!perpendicularComponents) return;

    const localSamples = getTranslateHandleLocalSamples(handle, axis);
    let handleBestScore = Number.POSITIVE_INFINITY;
    let handleBestDistance = Number.POSITIVE_INFINITY;

    for (let index = 0; index < localSamples.length; index += 1) {
      const localSample = localSamples[index];
      const alpha = localSamples.length === 1 ? 0.5 : index / (localSamples.length - 1);
      const localRadius = getTranslateHandleLocalRadius(handle, alpha);
      if (localRadius <= 0) continue;

      worldSamplePoint.copy(localSample).applyMatrix4(handle.matrixWorld);
      const projected = projectWorldPointToScreen(worldSamplePoint, controls.camera, rect, projectedPoint);
      if (!projected) continue;

      const distancePx = projected.distanceTo(pointerPx);
      worldOffsetPoint.copy(localSample);
      worldOffsetPoint[perpendicularComponents[0]] += localRadius;
      worldOffsetPoint.applyMatrix4(handle.matrixWorld);
      const projectedRadiusA = projectWorldPointToScreen(worldOffsetPoint, controls.camera, rect, projectedOffsetA);

      worldOffsetPoint.copy(localSample);
      worldOffsetPoint[perpendicularComponents[1]] += localRadius;
      worldOffsetPoint.applyMatrix4(handle.matrixWorld);
      const projectedRadiusB = projectWorldPointToScreen(worldOffsetPoint, controls.camera, rect, projectedOffsetB);

      const radiusPx = Math.max(
        projectedRadiusA ? projectedRadiusA.distanceTo(projected) : 0,
        projectedRadiusB ? projectedRadiusB.distanceTo(projected) : 0,
      );
      if (radiusPx <= 0) continue;

      const thresholdPx = radiusPx + TRANSLATE_SCREEN_HOVER_PADDING_PX;
      if (distancePx > thresholdPx) continue;

      const normalizedScore = distancePx / thresholdPx;
      const sampleDistance = cameraWorldPosition.distanceTo(worldSamplePoint);

      if (
        normalizedScore < handleBestScore ||
        (Math.abs(normalizedScore - handleBestScore) <= 1e-6 && sampleDistance < handleBestDistance)
      ) {
        handleBestScore = normalizedScore;
        handleBestDistance = sampleDistance;
      }
    }

    if (!Number.isFinite(handleBestScore) || !Number.isFinite(handleBestDistance)) {
      return;
    }

    const candidateHit: VisibleControlHit = {
      owner: 'translate',
      axis,
      renderOrder: handle.renderOrder ?? 0,
      distance: handleBestDistance,
      score: handleBestScore,
    };
    bestHit = preferVisibleControlHit(bestHit, candidateHit);
  });

  return bestHit;
};

const resolveTranslateAxisByScreenDistance = (
  controls: any,
  pointer: { x: number; y: number },
  axisFilter?: 'X' | 'Y' | 'Z'
): 'X' | 'Y' | 'Z' | null => resolveVisibleTranslateHit(controls, pointer, axisFilter)?.axis ?? null;

const resolveVisibleRotateHit = (
  controls: any,
  pointer: { x: number; y: number },
  axisFilter?: 'X' | 'Y' | 'Z'
): VisibleControlHit | null => {
  if (!controls || controls.mode !== 'rotate' || !controls.camera || !controls.domElement) return null;

  const gizmo = getGizmoRoot(controls);
  const rotateGroup = gizmo?.gizmo?.rotate as THREE.Object3D | undefined;
  if (!rotateGroup) return null;

  const rect = controls.domElement.getBoundingClientRect?.();
  if (!rect || rect.width <= 0 || rect.height <= 0) return null;

  const pointerPx = getPointerScreenPosition(pointer, rect);
  const projectedStart = new THREE.Vector2();
  const projectedEnd = new THREE.Vector2();
  const projectedMid = new THREE.Vector2();
  const projectedOffsetA = new THREE.Vector2();
  const projectedOffsetB = new THREE.Vector2();
  const worldStart = new THREE.Vector3();
  const worldEnd = new THREE.Vector3();
  const worldMid = new THREE.Vector3();
  const worldOffset = new THREE.Vector3();
  const cameraWorldPosition = new THREE.Vector3();
  const cameraRight = new THREE.Vector3();
  const cameraUp = new THREE.Vector3();

  controls.camera.getWorldPosition(cameraWorldPosition);
  cameraRight.setFromMatrixColumn(controls.camera.matrixWorld, 0).normalize();
  cameraUp.setFromMatrixColumn(controls.camera.matrixWorld, 1).normalize();

  let bestHit: VisibleControlHit | null = null;
  rotateGroup.traverse((node) => {
    const handle = node as THREE.Mesh;
    const axis = getAxisFromObjectBranch(handle);
    if (!axis || !handle.visible || !handle.isMesh) return;
    if (axisFilter && axis !== axisFilter) return;
    if (!handle.userData?.urdfRotateArcMesh) return;
    const isBackArc = handle.userData?.urdfRotateArcLayer === 'back';

    const centerline = Array.isArray(handle.userData?.urdfRotateCenterlinePoints)
      ? (handle.userData.urdfRotateCenterlinePoints as THREE.Vector3[])
      : null;
    if (!centerline || centerline.length < 2) return;

    const parameters = (handle.geometry as THREE.BufferGeometry & {
      parameters?: { tube?: number };
    }).parameters;
    const localTubeRadius =
      typeof parameters?.tube === 'number' && parameters.tube > 0
        ? parameters.tube
        : THICK_ROTATE_ARC_RADIUS;

    let handleBestScore = Number.POSITIVE_INFINITY;
    let handleBestDistance = Number.POSITIVE_INFINITY;

    for (let index = 0; index < centerline.length - 1; index += 1) {
      worldStart.copy(centerline[index]).applyMatrix4(handle.matrixWorld);
      worldEnd.copy(centerline[index + 1]).applyMatrix4(handle.matrixWorld);

      const startProjected = projectWorldPointToScreen(worldStart, controls.camera, rect, projectedStart);
      const endProjected = projectWorldPointToScreen(worldEnd, controls.camera, rect, projectedEnd);
      if (!startProjected || !endProjected) continue;

      const distancePx = distancePointToSegment2D(pointerPx, startProjected, endProjected);

      worldMid.lerpVectors(worldStart, worldEnd, 0.5);
      const midProjected = projectWorldPointToScreen(worldMid, controls.camera, rect, projectedMid);
      if (!midProjected) continue;

      worldOffset.copy(worldMid).addScaledVector(cameraRight, localTubeRadius);
      const offsetProjectedA = projectWorldPointToScreen(worldOffset, controls.camera, rect, projectedOffsetA);

      worldOffset.copy(worldMid).addScaledVector(cameraUp, localTubeRadius);
      const offsetProjectedB = projectWorldPointToScreen(worldOffset, controls.camera, rect, projectedOffsetB);

      const radiusPx = Math.max(
        offsetProjectedA ? offsetProjectedA.distanceTo(midProjected) : 0,
        offsetProjectedB ? offsetProjectedB.distanceTo(midProjected) : 0,
        ROTATE_SCREEN_HOVER_MIN_RADIUS_PX
      );
      const thresholdPx = (radiusPx + ROTATE_SCREEN_HOVER_PADDING_PX)
        * (isBackArc ? ROTATE_BACK_HIT_THRESHOLD_SCALE : 1);
      if (distancePx > thresholdPx) continue;

      const normalizedScore = (distancePx / thresholdPx)
        + (isBackArc ? ROTATE_BACK_HIT_SCORE_PENALTY : 0);
      const sampleDistance = cameraWorldPosition.distanceTo(worldMid);

      if (
        normalizedScore < handleBestScore ||
        (Math.abs(normalizedScore - handleBestScore) <= 1e-6 && sampleDistance < handleBestDistance)
      ) {
        handleBestScore = normalizedScore;
        handleBestDistance = sampleDistance;
      }
    }

    if (!Number.isFinite(handleBestScore) || !Number.isFinite(handleBestDistance)) {
      return;
    }

    const candidateHit: VisibleControlHit = {
      owner: 'rotate',
      axis,
      renderOrder: handle.renderOrder ?? 0,
      distance: handleBestDistance,
      score: handleBestScore,
    };
    bestHit = preferVisibleControlHit(bestHit, candidateHit);
  });

  return bestHit;
};

const intersectVisibleTranslateAxis = (
  controls: any,
  pointer: { x: number; y: number }
): 'X' | 'Y' | 'Z' | null => {
  if (!controls || controls.mode !== 'translate') return null;

  const gizmo = getGizmoRoot(controls);
  const translateGroup = gizmo?.gizmo?.translate;
  if (!translateGroup || !controls.camera) return null;

  const raycaster =
    typeof controls.getRaycaster === 'function'
      ? controls.getRaycaster()
      : new THREE.Raycaster();

  raycaster.setFromCamera(pointer, controls.camera);

  const intersections = raycaster.intersectObject(translateGroup, true);
  for (const intersection of intersections) {
    const axis = getAxisFromObjectBranch(intersection.object);
    if (!axis) continue;
    return axis;
  }

  return null;
};

const resolveVisibleAxisHit = (
  controls: any,
  pointer: { x: number; y: number }
): 'X' | 'Y' | 'Z' | null => {
  if (!controls || !pointer) return null;
  if (controls.mode === 'translate') {
    return resolveTranslateAxisByScreenDistance(controls, pointer);
  }
  if (controls.mode === 'rotate') {
    return resolveVisibleRotateHit(controls, pointer)?.axis ?? null;
  }
  return null;
};

const patchVisibleHoverHitFallback = (controls: any) => {
  if (!controls || controls.userData?.urdfVisibleHoverHitFallbackPatched) return;

  const originalPointerHover =
    typeof controls.pointerHover === 'function'
      ? controls.pointerHover.bind(controls)
      : null;

  if (!originalPointerHover) return;

  controls.pointerHover = (pointer: { x: number; y: number; button?: number } | null) => {
    originalPointerHover(pointer);

    if (controls.object === undefined || controls.dragging === true) return;
    if (!pointer) return;
    if (controls.mode !== 'translate' && controls.mode !== 'rotate') return;

    // Hover should only react to the currently visible gizmo geometry,
    // not the oversized invisible picker volume used for dragging.
    controls.axis = resolveVisibleAxisHit(controls, pointer);
  };

  controls.userData = {
    ...controls.userData,
    urdfVisibleHoverHitFallbackPatched: true,
  };
};

const patchVisiblePointerDownFallback = (controls: any) => {
  if (!controls || controls.userData?.urdfVisiblePointerDownFallbackPatched) return;

  const originalPointerDown =
    typeof controls.pointerDown === 'function'
      ? controls.pointerDown.bind(controls)
      : null;

  if (!originalPointerDown) return;

  controls.pointerDown = (pointer: { x: number; y: number; button?: number } | null) => {
    if (
      controls.object !== undefined &&
      controls.dragging !== true &&
      (pointer == null || pointer.button === undefined || pointer.button === 0) &&
      (controls.mode === 'translate' || controls.mode === 'rotate')
    ) {
      const visibleAxis = pointer ? resolveVisibleAxisHit(controls, pointer) : null;
      controls.axis = visibleAxis;

      if (!visibleAxis) {
        return;
      }
    }

    originalPointerDown(pointer);
  };

  controls.userData = {
    ...controls.userData,
    urdfVisiblePointerDownFallbackPatched: true,
  };
};

const removeHandlesByNames = (group: THREE.Object3D | undefined, names: Set<string>) => {
  if (!group) return;

  const nodesToRemove: THREE.Object3D[] = [];
  group.traverse((node) => {
    if (node === group) return;
    if (!names.has(node.name)) return;
    if ((node as any).isLine || (node as any).isMesh || (node as any).isObject3D) {
      nodesToRemove.push(node);
    }
  });

  for (const node of nodesToRemove) {
    node.parent?.remove(node);
  }
};

const disposeObjectResources = (object: THREE.Object3D) => {
  object.traverse((node) => {
    const geometry = (node as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
    const material = (node as THREE.Mesh & { material?: THREE.Material | THREE.Material[] }).material;

    geometry?.dispose?.();

    if (Array.isArray(material)) {
      material.forEach((entry) => entry?.dispose?.());
      return;
    }

    material?.dispose?.();
  });
};

const removeGeneratedHandles = (
  group: THREE.Object3D | undefined,
  predicate: (node: THREE.Object3D) => boolean
) => {
  if (!group) return;

  const nodesToRemove: THREE.Object3D[] = [];
  group.traverse((node) => {
    if (node === group) return;
    if (!predicate(node)) return;
    nodesToRemove.push(node);
  });

  for (const node of nodesToRemove) {
    node.parent?.remove(node);
    disposeObjectResources(node);
  }
};

const getDisplayBehaviorPatchKey = (thicknessScale: number) =>
  `${DISPLAY_BEHAVIOR_PATCH_VERSION}:${thicknessScale.toFixed(3)}`;

const getAxisComponentKey = (axisName: 'X' | 'Y' | 'Z') =>
  axisName.toLowerCase() as 'x' | 'y' | 'z';

const cloneAxisColorMaterial = (sourceMaterial: THREE.Material | null) => {
  const color = new THREE.Color(0xffffff);
  if (sourceMaterial && 'color' in sourceMaterial && sourceMaterial.color instanceof THREE.Color) {
    color.copy(sourceMaterial.color);
  }

  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 1,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });

  material.userData = {
    ...material.userData,
    urdfBaseColor: color.clone(),
  };

  return material;
};

const createAxisAlignedCylinderGeometry = (
  axis: 'X' | 'Y' | 'Z',
  startOffset: number,
  endOffset: number,
  radius: number
) => {
  const segmentLength = endOffset - startOffset;
  const geometry = new THREE.CylinderGeometry(radius, radius, segmentLength, AXIS_GEOMETRY_RADIAL_SEGMENTS);
  const segmentCenter = startOffset + segmentLength * 0.5;

  if (axis === 'X') {
    geometry.rotateZ(-Math.PI / 2);
    geometry.translate(segmentCenter, 0, 0);
  } else if (axis === 'Y') {
    geometry.translate(0, segmentCenter, 0);
  } else {
    geometry.rotateX(Math.PI / 2);
    geometry.translate(0, 0, segmentCenter);
  }

  return geometry;
};

const createAxisAlignedArrowGeometry = (
  axis: 'X' | 'Y' | 'Z',
  startOffset: number,
  length: number,
  radius: number
) => {
  const geometry = new THREE.CylinderGeometry(0, radius, length, AXIS_GEOMETRY_RADIAL_SEGMENTS);
  const segmentCenter = startOffset + length * 0.5;

  if (axis === 'X') {
    geometry.rotateZ(-Math.PI / 2);
    geometry.translate(segmentCenter, 0, 0);
  } else if (axis === 'Y') {
    geometry.translate(0, segmentCenter, 0);
  } else {
    geometry.rotateX(Math.PI / 2);
    geometry.translate(0, 0, segmentCenter);
  }

  return geometry;
};

const createTranslateDisplayName = (kind: 'shaft' | 'tip' | 'gap', axis: 'X' | 'Y' | 'Z') =>
  `translate-${kind}-${axis.toLowerCase()}`;

const hideStockAxisLines = (group: THREE.Object3D | undefined) => {
  if (!group) return;

  group.traverse((node) => {
    const line = node as THREE.Line;
    if (!line.isLine) return;
    if (!AXIS_NAMES.has(line.name)) return;

    line.userData.urdfHideStockAxisLine = true;
    line.visible = false;
  });
};

const addTranslateShaftMeshes = (
  group: THREE.Object3D | undefined,
  {
    leaveRingGap = false,
  }: {
    leaveRingGap?: boolean;
  } = {}
) => {
  if (!group) return;

  removeGeneratedHandles(group, (node) => Boolean(node.userData?.urdfTranslateShaft));

  const axisMaterials = new Map<string, THREE.Material>();
  group.traverse((node) => {
    const line = node as THREE.Line & { material?: THREE.Material | THREE.Material[] };
    if (!line.isLine) return;
    if (!AXIS_NAMES.has(line.name)) return;
    if (axisMaterials.has(line.name)) return;

    const material = Array.isArray(line.material) ? line.material[0] : line.material;
    if (material) {
      axisMaterials.set(line.name, material);
    }
  });

  const shaftStart = TRANSLATE_CENTER_GAP;
  const shaftEnd = TRANSLATE_ARROW_HANDLE_OFFSET;

  for (const axis of ['X', 'Y', 'Z'] as const) {
    const segments: Array<[number, number]> = [];

    if (leaveRingGap) {
      const gapStart = Math.max(shaftStart, TRANSLATE_RING_INTERSECTION_RADIUS - TRANSLATE_RING_INTERSECTION_GAP * 0.5);
      const gapEnd = Math.min(shaftEnd, TRANSLATE_RING_INTERSECTION_RADIUS + TRANSLATE_RING_INTERSECTION_GAP * 0.5);

      if (gapStart - shaftStart > MIN_TRANSLATE_SHAFT_SEGMENT_LENGTH) {
        segments.push([shaftStart, gapStart]);
      }
      if (shaftEnd - gapEnd > MIN_TRANSLATE_SHAFT_SEGMENT_LENGTH) {
        segments.push([gapEnd, shaftEnd]);
      }
    }

    if (segments.length === 0) {
      segments.push([shaftStart, shaftEnd]);
    }

    for (const [startOffset, endOffset] of segments) {
      const shaft = new THREE.Mesh(
        createAxisAlignedCylinderGeometry(axis, startOffset, endOffset, THICK_TRANSLATE_SHAFT_RADIUS),
        cloneAxisColorMaterial(axisMaterials.get(axis) ?? null)
      );
      shaft.name = createTranslateDisplayName('shaft', axis);
      shaft.renderOrder = GIZMO_ARC_RENDER_ORDER;
      shaft.userData = {
        ...shaft.userData,
        isGizmo: true,
        urdfAxis: axis,
        urdfTranslateShaft: true,
      };
      group.add(shaft);
    }
  }
};

const addTranslateGapBridgeMeshes = (group: THREE.Object3D | undefined) => {
  if (!group) return;

  removeGeneratedHandles(group, (node) => Boolean(node.userData?.urdfTranslateGapBridge));

  const axisMaterials = new Map<string, THREE.Material>();
  group.traverse((node) => {
    const line = node as THREE.Line & { material?: THREE.Material | THREE.Material[] };
    if (!line.isLine) return;
    if (!AXIS_NAMES.has(line.name)) return;
    if (axisMaterials.has(line.name)) return;

    const material = Array.isArray(line.material) ? line.material[0] : line.material;
    if (material) {
      axisMaterials.set(line.name, material);
    }
  });

  const gapStart = TRANSLATE_RING_INTERSECTION_RADIUS - TRANSLATE_RING_INTERSECTION_GAP * 0.5;
  const gapEnd = TRANSLATE_RING_INTERSECTION_RADIUS + TRANSLATE_RING_INTERSECTION_GAP * 0.5;
  const bridgeGapSize = 0.006;
  const dashLength =
    (gapEnd - gapStart - bridgeGapSize * (TRANSLATE_GAP_BRIDGE_DASH_COUNT - 1)) /
    TRANSLATE_GAP_BRIDGE_DASH_COUNT;

  if (dashLength <= 0) return;

  for (const axis of ['X', 'Y', 'Z'] as const) {
    for (let index = 0; index < TRANSLATE_GAP_BRIDGE_DASH_COUNT; index += 1) {
      const startOffset = gapStart + index * (dashLength + bridgeGapSize);
      const endOffset = startOffset + dashLength;
      const bridge = new THREE.Mesh(
        createAxisAlignedCylinderGeometry(axis, startOffset, endOffset, TRANSLATE_GAP_BRIDGE_RADIUS),
        cloneAxisColorMaterial(axisMaterials.get(axis) ?? null)
      );

      bridge.name = axis;
      bridge.name = createTranslateDisplayName('gap', axis);
      bridge.visible = false;
      bridge.renderOrder = GIZMO_ARC_RENDER_ORDER + 1;
      bridge.userData = {
        ...bridge.userData,
        isGizmo: true,
        urdfAxis: axis,
        urdfTranslateGapBridge: true,
      };
      group.add(bridge);
    }
  }
};

const removeStockTranslateVisibleMeshes = (group: THREE.Object3D | undefined) => {
  if (!group) return;

  const nodesToRemove: THREE.Object3D[] = [];
  group.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh || !AXIS_NAMES.has(mesh.name)) return;

    const geoType = (mesh.geometry as THREE.BufferGeometry & { type?: string }).type;
    if (geoType !== 'CylinderGeometry') return;
    nodesToRemove.push(mesh);
  });

  for (const node of nodesToRemove) {
    node.parent?.remove(node);
    disposeObjectResources(node);
  }
};

const addTranslateArrowMeshes = (group: THREE.Object3D | undefined) => {
  if (!group) return;

  removeGeneratedHandles(group, (node) => Boolean(node.userData?.urdfTranslateTip));

  const axisMaterials = new Map<string, THREE.Material>();
  group.traverse((node) => {
    const line = node as THREE.Line & { material?: THREE.Material | THREE.Material[] };
    if (!line.isLine) return;
    if (!AXIS_NAMES.has(line.name)) return;
    if (axisMaterials.has(line.name)) return;

    const material = Array.isArray(line.material) ? line.material[0] : line.material;
    if (material) {
      axisMaterials.set(line.name, material);
    }
  });

  for (const axis of ['X', 'Y', 'Z'] as const) {
    const tip = new THREE.Mesh(
      createAxisAlignedArrowGeometry(
        axis,
        TRANSLATE_ARROW_HANDLE_OFFSET,
        TRANSLATE_ARROW_LENGTH,
        TRANSLATE_ARROW_BASE_RADIUS
      ),
      cloneAxisColorMaterial(axisMaterials.get(axis) ?? null)
    );
    tip.name = createTranslateDisplayName('tip', axis);
    tip.renderOrder = GIZMO_ARC_RENDER_ORDER + 2;
    tip.userData = {
      ...tip.userData,
      isGizmo: true,
      urdfAxis: axis,
      urdfTranslateTip: true,
    };
    group.add(tip);
  }
};

const patchTranslateArrowGeometry = (group: THREE.Object3D | undefined) => {
  if (!group) return;

  const geometryKey = [
    TRANSLATE_ARROW_HANDLE_OFFSET.toFixed(3),
    TRANSLATE_ARROW_LENGTH.toFixed(3),
    TRANSLATE_ARROW_BASE_RADIUS.toFixed(3),
  ].join(':');
  const zeroTolerance = 1e-6;

  group.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (!AXIS_NAMES.has(mesh.name)) return;

    const geoType = (mesh.geometry as THREE.BufferGeometry & { type?: string }).type;
    if (geoType !== 'CylinderGeometry') return;

    const parameters = (mesh.geometry as THREE.BufferGeometry & {
      parameters?: { radiusTop?: number; radiusBottom?: number };
    }).parameters ?? {};

    const radiusTop = parameters.radiusTop ?? 0;
    const radiusBottom = parameters.radiusBottom ?? 0;
    if (Math.abs(radiusTop - radiusBottom) <= zeroTolerance) return;
    if (mesh.userData?.urdfTranslateArrowGeometryKey === geometryKey) return;

    replaceMeshGeometry(
      mesh,
      createAxisAlignedArrowGeometry(
        mesh.name as 'X' | 'Y' | 'Z',
        TRANSLATE_ARROW_HANDLE_OFFSET,
        TRANSLATE_ARROW_LENGTH,
        TRANSLATE_ARROW_BASE_RADIUS
      )
    );
    delete mesh.userData.urdfTranslateThicknessKey;
    mesh.userData.urdfTranslateArrowGeometryKey = geometryKey;
  });
};

const patchTranslatePickerGeometry = (group: THREE.Object3D | undefined) => {
  if (!group) return;

  const pickerEnd = TRANSLATE_ARROW_HANDLE_OFFSET + TRANSLATE_ARROW_LENGTH + TRANSLATE_PICKER_END_PADDING;
  const geometryKey = [
    TRANSLATE_PICKER_START_OFFSET.toFixed(3),
    pickerEnd.toFixed(3),
    THICK_TRANSLATE_PICKER_RADIUS.toFixed(3),
  ].join(':');

  group.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (!AXIS_NAMES.has(mesh.name)) return;

    const geoType = (mesh.geometry as THREE.BufferGeometry & { type?: string }).type;
    if (geoType !== 'CylinderGeometry') return;
    if (mesh.userData?.urdfTranslatePickerGeometryKey === geometryKey) return;

    replaceMeshGeometry(
      mesh,
      createAxisAlignedCylinderGeometry(
        mesh.name as 'X' | 'Y' | 'Z',
        TRANSLATE_PICKER_START_OFFSET,
        pickerEnd,
        THICK_TRANSLATE_PICKER_RADIUS
      )
    );
    delete mesh.userData.urdfTranslateThicknessKey;
    mesh.userData.urdfTranslatePickerGeometryKey = geometryKey;
  });
};

const removeNegativeTranslateHandles = (group: THREE.Object3D | undefined) => {
  if (!group) return;

  const nodesToRemove: THREE.Object3D[] = [];
  group.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh || !AXIS_NAMES.has(mesh.name)) return;

    const geoType = (mesh.geometry as THREE.BufferGeometry & { type?: string }).type;
    if (geoType !== 'CylinderGeometry') return;

    const axisName = mesh.name as 'X' | 'Y' | 'Z';
    const axisKey = getAxisComponentKey(axisName);
    if (node.position[axisKey] < -1e-6) {
      nodesToRemove.push(node);
    }
  });

  for (const node of nodesToRemove) {
    node.parent?.remove(node);
    disposeObjectResources(node);
  }
};

const removeTranslateBackwardHandles = (group: THREE.Object3D | undefined) => {
  if (!group) return;

  const nodesToRemove: THREE.Object3D[] = [];
  group.traverse((node) => {
    const mesh = node as THREE.Mesh & { tag?: string };
    if (!mesh.isMesh || !AXIS_NAMES.has(mesh.name)) return;
    if (mesh.tag !== 'bwd') return;
    nodesToRemove.push(mesh);
  });

  for (const node of nodesToRemove) {
    node.parent?.remove(node);
    disposeObjectResources(node);
  }
};

const markFixedTranslateHandles = (group: THREE.Object3D | undefined) => {
  if (!group) return;

  group.traverse((node) => {
    if (node.userData?.urdfTranslateShaft || node.userData?.urdfTranslateGapBridge) {
      node.userData = {
        ...node.userData,
        urdfTranslateFixedVisible: true,
        urdfTranslateStableScale: getPositiveScale(
          (node as THREE.Object3D & { scale?: THREE.Vector3 }).scale ?? new THREE.Vector3(1, 1, 1)
        ),
      };
      return;
    }

    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh || !AXIS_NAMES.has(mesh.name)) return;

    const geoType = (mesh.geometry as THREE.BufferGeometry & { type?: string }).type;
    if (geoType !== 'CylinderGeometry') return;

    node.userData = {
      ...node.userData,
      urdfTranslateFixedVisible: true,
      urdfTranslateStableScale: getPositiveScale(mesh.scale),
    };
  });
};

const createRotateArcMaterial = (
  sourceMaterial: THREE.Material | null,
  opacity: number
) => {
  const material = cloneAxisColorMaterial(sourceMaterial);
  material.transparent = true;
  material.opacity = opacity;
  material.userData = {
    ...material.userData,
    urdfBaseOpacity: opacity,
    urdfBaseTransparent: true,
  };
  return material;
};

const createTubeArcGeometry = (points: THREE.Vector3[]) => {
  const curve = new THREE.CatmullRomCurve3(points, false);
  return new THREE.TubeGeometry(
    curve,
    Math.max(points.length * 3, 64),
    THICK_ROTATE_ARC_RADIUS,
    12,
    false
  );
};

const splitArcIntoOpenSegments = (points: THREE.Vector3[]) => {
  const endTrim = Math.min(
    ROTATE_ARC_GAP_SAMPLE_COUNT,
    Math.max(0, Math.floor((points.length - 4) / 2))
  );
  const midTrim = Math.min(
    ROTATE_ARC_GAP_SAMPLE_COUNT,
    Math.max(0, Math.floor((points.length - 6) / 4))
  );
  const middleIndex = Math.floor(points.length / 2);

  const segments = [
    points.slice(endTrim, Math.max(endTrim + 2, middleIndex - midTrim + 1)),
    points.slice(Math.min(points.length - 2, middleIndex + midTrim), points.length - endTrim),
  ];

  return segments.filter((segment) => segment.length >= 3);
};

const addRotateArcMeshes = (group: THREE.Object3D | undefined) => {
  if (!group) return;

  removeGeneratedHandles(group, (node) => Boolean(node.userData?.urdfRotateArcMesh));

  group.traverse((node) => {
    const line = node as THREE.Line & { material?: THREE.Material | THREE.Material[] };
    if (!line.isLine) return;
    if (!AXIS_NAMES.has(line.name)) return;

    const position = line.geometry.getAttribute('position');
    if (!position || position.count < 3) return;

    const points: THREE.Vector3[] = [];
    for (let index = 0; index < position.count; index += 1) {
      points.push(new THREE.Vector3(position.getX(index), position.getY(index), position.getZ(index)));
    }

    if (points.length > 2 && points[0].distanceToSquared(points[points.length - 1]) < 1e-8) {
      points.pop();
    }

    const frontSegments = splitArcIntoOpenSegments(points);
    if (frontSegments.length === 0) return;

    const material = Array.isArray(line.material) ? line.material[0] : line.material;

    frontSegments.forEach((segment, index) => {
      const frontArcMesh = new THREE.Mesh(
        createTubeArcGeometry(segment),
        createRotateArcMaterial(material ?? null, ROTATE_ARC_FRONT_OPACITY)
      );
      frontArcMesh.name = line.name;
      frontArcMesh.renderOrder = GIZMO_ARC_RENDER_ORDER + 1;
      frontArcMesh.userData = {
        ...frontArcMesh.userData,
        isGizmo: true,
        urdfRotateArcMesh: true,
        urdfRotateArcLayer: 'front',
        urdfRotateArcSegmentIndex: index,
        urdfRotateCenterlinePoints: segment.map((point) => point.clone()),
      };
      group.add(frontArcMesh);

      const backArcMesh = new THREE.Mesh(
        createTubeArcGeometry(
          segment
            .map((point) => point.clone().multiplyScalar(-1))
            .reverse()
        ),
        createRotateArcMaterial(material ?? null, ROTATE_ARC_BACK_OPACITY)
      );
      backArcMesh.name = line.name;
      backArcMesh.renderOrder = GIZMO_ARC_RENDER_ORDER;
      backArcMesh.userData = {
        ...backArcMesh.userData,
        isGizmo: true,
        urdfRotateArcMesh: true,
        urdfRotateArcLayer: 'back',
        urdfRotateArcSegmentIndex: index,
        urdfRotateCenterlinePoints: segment
          .map((point) => point.clone().multiplyScalar(-1))
          .reverse(),
      };
      group.add(backArcMesh);
    });
  });
};

const convertRotateLinesToFullCircle = (group: THREE.Object3D | undefined) => {
  if (!group) return;

  const fallbackBasis: Record<'X' | 'Y' | 'Z', { u: THREE.Vector3; v: THREE.Vector3 }> = {
    X: { u: new THREE.Vector3(0, 1, 0), v: new THREE.Vector3(0, 0, 1) },
    Y: { u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 0, 1) },
    Z: { u: new THREE.Vector3(1, 0, 0), v: new THREE.Vector3(0, 1, 0) },
  };

  group.traverse((node) => {
    const line = node as THREE.Line;
    if (!line.isLine || !AXIS_NAMES.has(line.name)) return;
    if (line.userData?.urdfRotateLineFullCircleApplied) return;

    const position = line.geometry.getAttribute('position');
    if (!position || position.count < 3) return;

    const samples: THREE.Vector3[] = [];
    for (let i = 0; i < position.count; i += 1) {
      samples.push(new THREE.Vector3(position.getX(i), position.getY(i), position.getZ(i)));
    }

    const radiusCandidates = samples.map((point) => point.length()).filter((len) => len > 1e-4);
    const radius = radiusCandidates.length > 0
      ? radiusCandidates.reduce((sum, len) => sum + len, 0) / radiusCandidates.length
      : 0.5;

    let u = samples.find((point) => point.lengthSq() > 1e-6)?.clone().normalize();
    let v: THREE.Vector3 | undefined;

    if (u) {
      for (const sample of samples) {
        const candidate = sample.clone();
        if (candidate.lengthSq() <= 1e-6) continue;
        candidate.normalize();

        const normal = u.clone().cross(candidate);
        if (normal.lengthSq() <= 1e-4) continue;
        normal.normalize();
        v = normal.clone().cross(u).normalize();
        break;
      }
    }

    if (!u || !v || v.lengthSq() <= 1e-6) {
      const basis = fallbackBasis[line.name as 'X' | 'Y' | 'Z'];
      u = basis.u.clone();
      v = basis.v.clone();
    }

    const segments = 128;
    const vertices: number[] = [];
    for (let i = 0; i <= segments; i += 1) {
      const theta = (i / segments) * Math.PI * 2;
      const point = u.clone().multiplyScalar(Math.cos(theta) * radius).add(
        v.clone().multiplyScalar(Math.sin(theta) * radius)
      );
      vertices.push(point.x, point.y, point.z);
    }

    const fullGeometry = new THREE.BufferGeometry();
    fullGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    replaceMeshGeometry(line as unknown as THREE.Mesh, fullGeometry);
    line.userData.urdfRotateLineFullCircleApplied = true;
  });
};

const patchRotateHandleScale = (
  group: THREE.Object3D | undefined,
  thicknessScale: number
) => {
  if (!group) return;

  const scaleKey = thicknessScale.toFixed(3);
  const handleScale = Math.max(1, 0.9 + thicknessScale * 0.7);

  group.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh || !AXIS_NAMES.has(mesh.name)) return;

    const geoType = (mesh.geometry as THREE.BufferGeometry & { type?: string }).type;
    if (geoType !== 'OctahedronGeometry') return;
    if (mesh.userData?.urdfRotateHandleScaleKey === scaleKey) return;

    const baseScale =
      mesh.userData?.urdfRotateBaseScale instanceof THREE.Vector3
        ? (mesh.userData.urdfRotateBaseScale as THREE.Vector3)
        : mesh.scale.clone();

    mesh.userData.urdfRotateBaseScale = baseScale.clone();
    mesh.scale.copy(baseScale).multiplyScalar(handleScale);
    mesh.userData.urdfRotateHandleScaleKey = scaleKey;
  });
};

// Maps each axis name to the two scale axes that represent "thickness"
// (i.e. perpendicular to the axis direction in world space for baked geometry).
const AXIS_THICKNESS_SCALE: Record<string, { a: 'x' | 'y' | 'z'; b: 'x' | 'y' | 'z' }> = {
  X: { a: 'y', b: 'z' },
  Y: { a: 'x', b: 'z' },
  Z: { a: 'x', b: 'y' },
};

// Scale-based approach: geometry in Three.js TransformControls has its matrix
// baked into the vertices, so we cannot rely on `geometry.parameters` to reflect
// the correct orientation after baking.  Instead we enlarge meshes by adjusting
// `mesh.scale` in the two axes perpendicular to the named axis direction.
const patchTranslateThickness = (
  group: THREE.Object3D | undefined,
  {
    isPicker = false,
    thicknessScale = DEFAULT_DISPLAY_THICKNESS_SCALE,
  }: { isPicker?: boolean; thicknessScale?: number } = {}
) => {
  if (!group) return;

  const zeroTolerance = 1e-6;
  const scaleKey = `${isPicker ? 'picker' : 'visible'}:${thicknessScale.toFixed(3)}`;

  group.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;

    const axisName = mesh.name as string;
    const scaleAxes = AXIS_THICKNESS_SCALE[axisName];
    if (!scaleAxes) return;

    const geoType = (mesh.geometry as THREE.BufferGeometry & { type?: string }).type;
    if (geoType !== 'CylinderGeometry') return;

    const params = (mesh.geometry as THREE.BufferGeometry & {
      parameters?: { radiusTop?: number; radiusBottom?: number };
    }).parameters ?? {};

    if (
      mesh.userData?.urdfTranslateThicknessKey === scaleKey &&
      mesh.userData?.urdfTranslateBaseScale instanceof THREE.Vector3
    ) {
      return;
    }

    const baseScale =
      mesh.userData?.urdfTranslateBaseScale instanceof THREE.Vector3
        ? (mesh.userData.urdfTranslateBaseScale as THREE.Vector3)
        : mesh.scale.clone();
    mesh.userData.urdfTranslateBaseScale = baseScale.clone();
    mesh.scale.copy(baseScale);

    const radiusTop = params.radiusTop ?? 0;
    const radiusBottom = params.radiusBottom ?? 0;
    const isShaft = Math.abs(radiusTop - radiusBottom) < zeroTolerance;

    let scaleFactor: number;
    if (isShaft) {
      // shaft: original radius ≈ 0.0075, target ≈ THICK_TRANSLATE_SHAFT_RADIUS or picker variant
      const targetRadius = (isPicker ? THICK_TRANSLATE_PICKER_RADIUS : THICK_TRANSLATE_SHAFT_RADIUS) * thicknessScale;
      const srcRadius = Math.max(radiusTop, zeroTolerance);
      scaleFactor = targetRadius / srcRadius;
    } else {
      // arrowhead cone: original bottom radius ≈ 0.04, target ≈ THICK_TRANSLATE_TIP_RADIUS
      const targetRadius = (isPicker ? THICK_TRANSLATE_PICKER_RADIUS : THICK_TRANSLATE_TIP_RADIUS) * thicknessScale;
      const srcRadius = Math.max(Math.max(radiusTop, radiusBottom), zeroTolerance);
      scaleFactor = targetRadius / srcRadius;
    }

    mesh.scale[scaleAxes.a] *= scaleFactor;
    mesh.scale[scaleAxes.b] *= scaleFactor;
    mesh.userData.urdfTranslateThicknessKey = scaleKey;
  });
};

// Baked-rotation lookup for each axis in the rotate gizmo.
// The base torus geometry in CircleGeometry bakes: rotateY(π/2) then rotateX(π/2).
// setupGizmo additionally bakes the per-axis rotation listed in gizmoRotate.
const ROTATE_GIZMO_SETUP_ROTATION: Record<'X' | 'Y' | 'Z', THREE.Euler> = {
  X: new THREE.Euler(0, 0, 0),
  Y: new THREE.Euler(0, 0, -Math.PI / 2),
  Z: new THREE.Euler(0, Math.PI / 2, 0),
};
// pickerRotate uses raw TorusGeometry (no CircleGeometry bake), different per-axis rotations.
const ROTATE_PICKER_SETUP_ROTATION: Record<'X' | 'Y' | 'Z', THREE.Euler> = {
  X: new THREE.Euler(0, -Math.PI / 2, -Math.PI / 2),
  Y: new THREE.Euler(Math.PI / 2, 0, 0),
  Z: new THREE.Euler(0, 0, -Math.PI / 2),
};

const replaceMeshGeometry = (mesh: THREE.Mesh, nextGeometry: THREE.BufferGeometry) => {
  const previousGeometry = mesh.geometry as THREE.BufferGeometry | undefined;
  mesh.geometry = nextGeometry;
  previousGeometry?.dispose?.();
};

const patchRotateThickness = (
  group: THREE.Object3D | undefined,
  {
    isPicker = false,
    thicknessScale = DEFAULT_DISPLAY_THICKNESS_SCALE,
  }: { isPicker?: boolean; thicknessScale?: number } = {}
) => {
  if (!group) return;

  const scaleKey = `${isPicker ? 'picker' : 'visible'}:${thicknessScale.toFixed(3)}`;

  group.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (!AXIS_NAMES.has(mesh.name)) return;

    const geoType = (mesh.geometry as THREE.BufferGeometry & { type?: string }).type;
    if (geoType !== 'TorusGeometry') return;

    const parameters = (mesh.geometry as THREE.BufferGeometry & {
      parameters?: { radius?: number; tube?: number; radialSegments?: number; tubularSegments?: number; arc?: number };
    }).parameters ?? {};

    if (mesh.userData?.urdfRotateThicknessKey === scaleKey) return;

    const originalTube = parameters?.tube ?? 0.0075;
    const targetTube = (isPicker ? THICK_ROTATE_PICKER_ARC_RADIUS : THICK_ROTATE_ARC_RADIUS) * thicknessScale;
    if (targetTube <= originalTube) return;

    const axisName = mesh.name as 'X' | 'Y' | 'Z';

    const arc = !isPicker
      ? Math.PI * 2
      : (parameters.arc ?? Math.PI * 2);

    const newGeo = new THREE.TorusGeometry(
      parameters.radius ?? 0.5,
      targetTube,
      Math.max(parameters.radialSegments ?? 8, 8),
      Math.max(parameters.tubularSegments ?? 64, 64),
      arc
    );

    if (!isPicker) {
      // Recreate the CircleGeometry bake: rotateY(π/2) then rotateX(π/2).
      newGeo.rotateY(Math.PI / 2);
      newGeo.rotateX(Math.PI / 2);
      // Re-apply setupGizmo per-axis rotation for gizmo (gizmoRotate rotations).
      const setupRot = ROTATE_GIZMO_SETUP_ROTATION[axisName];
      if (setupRot) {
        newGeo.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(setupRot));
      }
    } else {
      // Picker uses raw TorusGeometry, only setupGizmo rotation is baked (pickerRotate rotations).
      const setupRot = ROTATE_PICKER_SETUP_ROTATION[axisName];
      if (setupRot) {
        newGeo.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(setupRot));
      }
    }

    replaceMeshGeometry(mesh, newGeo);
    mesh.userData.urdfRotateThicknessKey = scaleKey;
  });
};

/** Ensure every mesh in gizmo groups renders above scene geometry (e.g. grid). */
const enforceGizmoRenderPriority = (gizmo: any) => {
  const groups = [
    gizmo?.gizmo?.translate,
    gizmo?.gizmo?.rotate,
    gizmo?.picker?.translate,
    gizmo?.picker?.rotate,
    gizmo?.helper?.translate,
    gizmo?.helper?.rotate,
  ];

  for (const group of groups) {
    if (!group) continue;
    (group as THREE.Object3D).traverse((node: THREE.Object3D) => {
      const preferredRenderOrder =
        typeof node.userData?.urdfRenderOrder === 'number'
          ? node.userData.urdfRenderOrder
          : (Number.isFinite(node.renderOrder) && node.renderOrder > 0
              ? node.renderOrder
              : GIZMO_BASE_RENDER_ORDER);

      node.renderOrder = preferredRenderOrder;
      if (typeof node.userData?.urdfRenderOrder !== 'number') {
        node.userData = {
          ...node.userData,
          urdfRenderOrder: preferredRenderOrder,
        };
      }

      const material = (node as THREE.Mesh & { material?: THREE.Material | THREE.Material[] }).material;
      if (!material) return;
      const materials = Array.isArray(material) ? material : [material];
      for (const mat of materials) {
        mat.depthTest = false;
        mat.depthWrite = false;
      }
    });
  }
};

const patchDisplayBehavior = (
  controls: any,
  displayStyle: UnifiedTransformDisplayStyle,
  thicknessScale: number,
  {
    leaveTranslateRingGap = false,
  }: {
    leaveTranslateRingGap?: boolean;
  } = {}
) => {
  const gizmo = getGizmoRoot(controls);
  if (!gizmo || displayStyle !== 'thick-primary') return;

  const normalizedThicknessScale = Number.isFinite(thicknessScale) && thicknessScale > 0
    ? thicknessScale
    : DEFAULT_DISPLAY_THICKNESS_SCALE;
  const patchKey = `${getDisplayBehaviorPatchKey(normalizedThicknessScale)}:${leaveTranslateRingGap ? 'gap' : 'solid'}`;
  if (gizmo.userData?.urdfDisplayBehaviorVersion === patchKey) return;

  removeHandlesByNames(gizmo.gizmo?.translate, TRANSLATE_AUXILIARY_NAMES);
  removeHandlesByNames(gizmo.picker?.translate, TRANSLATE_AUXILIARY_NAMES);
  removeHandlesByNames(gizmo.gizmo?.rotate, ROTATE_AUXILIARY_NAMES);
  removeHandlesByNames(gizmo.picker?.rotate, ROTATE_AUXILIARY_NAMES);
  removeTranslateBackwardHandles(gizmo.gizmo?.translate);
  removeNegativeTranslateHandles(gizmo.gizmo?.translate);
  removeNegativeTranslateHandles(gizmo.picker?.translate);
  removeStockTranslateVisibleMeshes(gizmo.gizmo?.translate);
  patchTranslatePickerGeometry(gizmo.picker?.translate);
  patchTranslateThickness(gizmo.gizmo?.translate, { thicknessScale: normalizedThicknessScale });
  patchTranslateThickness(gizmo.picker?.translate, {
    isPicker: true,
    thicknessScale: normalizedThicknessScale,
  });
  hideStockAxisLines(gizmo.gizmo?.translate);
  addTranslateShaftMeshes(gizmo.gizmo?.translate, {
    leaveRingGap: leaveTranslateRingGap,
  });
  addTranslateArrowMeshes(gizmo.gizmo?.translate);
  if (leaveTranslateRingGap) {
    addTranslateGapBridgeMeshes(gizmo.gizmo?.translate);
  } else {
    removeGeneratedHandles(gizmo.gizmo?.translate, (node) => Boolean(node.userData?.urdfTranslateGapBridge));
  }
  markFixedTranslateHandles(gizmo.gizmo?.translate);
  markFixedTranslateHandles(gizmo.picker?.translate);

  hideStockAxisLines(gizmo.gizmo?.rotate);
  addRotateArcMeshes(gizmo.gizmo?.rotate);
  patchRotateHandleScale(gizmo.gizmo?.rotate, normalizedThicknessScale);

  patchRotateThickness(gizmo.gizmo?.rotate, { thicknessScale: normalizedThicknessScale });
  patchRotateThickness(gizmo.picker?.rotate, {
    isPicker: true,
    thicknessScale: normalizedThicknessScale,
  });

  enforceGizmoRenderPriority(gizmo);

  gizmo.userData.urdfDisplayBehaviorVersion = patchKey;
};

const hasHoveredHandle = (controls: any): boolean =>
  typeof controls?.axis === 'string' && controls.axis.length > 0;

const resolvePreferredVisibleOwner = (
  translateHit: VisibleControlHit | null,
  rotateHit: VisibleControlHit | null,
  previousOwner: UniversalOwner
): UniversalOwner => {
  if (!translateHit && !rotateHit) return null;
  if (!translateHit) return 'rotate';
  if (!rotateHit) return 'translate';

  return preferVisibleControlHit(translateHit, rotateHit, previousOwner).owner;
};

const resolveUniversalOwner = (
  translateControls: any,
  rotateControls: any,
  pointerOwner: UniversalOwner
): UniversalOwner => {
  if (translateControls.dragging) return 'translate';
  if (rotateControls.dragging) return 'rotate';

  if (pointerOwner === 'rotate') return 'rotate';
  if (pointerOwner === 'translate') return 'translate';

  return null;
};

const forceReleaseTransformControl = (controls: any): boolean => {
  if (!controls) return false;

  const wasActive = Boolean(controls.dragging) || controls.axis !== null;
  if (!wasActive) return false;

  if (typeof controls.pointerUp === 'function') {
    controls.pointerUp({ button: 0 });
  } else {
    controls.dragging = false;
    controls.axis = null;
  }

  return true;
};

export const UnifiedTransformControls = forwardRef<any, UnifiedTransformControlsProps>(
  function UnifiedTransformControls(
    {
      mode,
      object,
      translateObject,
      translateSpace,
      rotateRef,
      rotateObject,
      rotateSize,
      rotateSpace,
      rotateEnabled,
      onChange,
      onRotateChange,
      onMouseDown,
      onMouseUp,
      onDraggingChanged,
      enableUniversalPriority = true,
      hoverStyle = 'stock',
      displayStyle = 'stock',
      displayThicknessScale = DEFAULT_DISPLAY_THICKNESS_SCALE,
      enabled = true,
      space = 'local',
      size,
      ...restProps
    },
    ref
  ) {
    const defaultControls = useThree((state) => state.controls);
    const pointer = useThree((state) => state.pointer);
    const scene = useThree((state) => state.scene);
    const translateRef = useRef<any>(null);
    const localRotateRef = useRef<any>(null);
    const effectiveRotateRef = rotateRef ?? localRotateRef;
    const universalOwnerRef = useRef<UniversalOwner>(null);
    const defaultControlsSuppressedRef = useRef(false);
    const defaultControlsEnabledBeforeSuppressRef = useRef(true);
    const orbitPassthroughRef = useRef(false);
    const resolvedTranslateObject = translateObject ?? object;
    const resolvedRotateObject = rotateObject ?? object;
    const attachedTranslateObject = isObjectAttachedToSceneGraph(scene, resolvedTranslateObject)
      ? resolvedTranslateObject
      : undefined;
    const attachedRotateObject = isObjectAttachedToSceneGraph(scene, resolvedRotateObject)
      ? resolvedRotateObject
      : undefined;
    const primaryMode = mode === 'universal' ? 'translate' : mode;
    const primaryObject = primaryMode === 'rotate' ? attachedRotateObject : attachedTranslateObject;
    const primarySpace = primaryMode === 'rotate' ? (rotateSpace ?? space) : (translateSpace ?? space);

    useImperativeHandle(ref, () => translateRef.current);

    const releaseDragLock = useCallback(() => {
      const releasedTranslate = forceReleaseTransformControl(translateRef.current);
      const releasedRotate = forceReleaseTransformControl(effectiveRotateRef.current);

      if (releasedTranslate || releasedRotate) {
        universalOwnerRef.current = null;
      }

      if (hasEnabledFlag(defaultControls) && defaultControlsSuppressedRef.current) {
        defaultControls.enabled = defaultControlsEnabledBeforeSuppressRef.current;
        defaultControlsSuppressedRef.current = false;
      }
    }, [defaultControls, effectiveRotateRef]);

    const restoreDefaultControls = useCallback(() => {
      if (hasEnabledFlag(defaultControls) && defaultControlsSuppressedRef.current) {
        defaultControls.enabled = defaultControlsEnabledBeforeSuppressRef.current;
        defaultControlsSuppressedRef.current = false;
      }
    }, [defaultControls]);

    const suppressDefaultControls = useCallback(() => {
      if (!hasEnabledFlag(defaultControls)) return;

      if (!defaultControlsSuppressedRef.current) {
        defaultControlsEnabledBeforeSuppressRef.current = defaultControls.enabled;
        defaultControlsSuppressedRef.current = true;
      }

      defaultControls.enabled = false;
    }, [defaultControls]);

    const clearHoveredAxes = useCallback(() => {
      if (translateRef.current && !translateRef.current.dragging && translateRef.current.axis !== null) {
        translateRef.current.axis = null;
      }

      if (
        effectiveRotateRef.current &&
        effectiveRotateRef.current !== translateRef.current &&
        !effectiveRotateRef.current.dragging &&
        effectiveRotateRef.current.axis !== null
      ) {
        effectiveRotateRef.current.axis = null;
      }

      universalOwnerRef.current = null;
    }, [effectiveRotateRef]);

    const syncControlEnabledState = useCallback(() => {
      if (orbitPassthroughRef.current) {
        if (translateRef.current) {
          translateRef.current.enabled = false;
        }

        if (effectiveRotateRef.current) {
          effectiveRotateRef.current.enabled = false;
        }
        return;
      }

      if (translateRef.current) {
        translateRef.current.enabled = mode === 'universal' ? false : enabled;
      }

      if (effectiveRotateRef.current) {
        effectiveRotateRef.current.enabled = mode === 'universal' ? false : (rotateEnabled ?? enabled);
      }
    }, [effectiveRotateRef, enabled, mode, rotateEnabled]);

    const handleControlMouseDown = useCallback((event: any) => {
      suppressDefaultControls();
      onMouseDown?.(event);
    }, [onMouseDown, suppressDefaultControls]);

    const handleControlMouseUp = useCallback((event: any) => {
      restoreDefaultControls();
      onMouseUp?.(event);
    }, [onMouseUp, restoreDefaultControls]);

    const handleControlDraggingChanged = useCallback((event: any) => {
      if (event?.value) {
        suppressDefaultControls();
      } else {
        restoreDefaultControls();
      }

      onDraggingChanged?.(event);
    }, [onDraggingChanged, restoreDefaultControls, suppressDefaultControls]);

    useEffect(() => {
      const translateControls = translateRef.current;
      const rotateControls = effectiveRotateRef.current;

      const cleanupCallbacks: Array<() => void> = [];

      const bindDraggingChanged = (controls: any) => {
        if (!controls?.addEventListener || !controls?.removeEventListener) {
          return;
        }

        controls.addEventListener('dragging-changed', handleControlDraggingChanged);
        cleanupCallbacks.push(() => {
          controls.removeEventListener('dragging-changed', handleControlDraggingChanged);
        });
      };

      bindDraggingChanged(translateControls);

      if (rotateControls && rotateControls !== translateControls) {
        bindDraggingChanged(rotateControls);
      }

      return () => {
        cleanupCallbacks.forEach((cleanup) => cleanup());
      };
    }, [effectiveRotateRef, handleControlDraggingChanged, mode]);

    useEffect(() => {
      markGizmoObjects(translateRef.current);
      markGizmoObjects(effectiveRotateRef.current);
      patchDisplayBehavior(translateRef.current, displayStyle, displayThicknessScale, {
        leaveTranslateRingGap: mode === 'universal',
      });
      patchDisplayBehavior(effectiveRotateRef.current, displayStyle, displayThicknessScale);
      patchVisibleHoverHitFallback(translateRef.current);
      patchVisibleHoverHitFallback(effectiveRotateRef.current);
      patchVisiblePointerDownFallback(translateRef.current);
      patchVisiblePointerDownFallback(effectiveRotateRef.current);
      patchHoverBehavior(translateRef.current, hoverStyle);
      patchHoverBehavior(effectiveRotateRef.current, hoverStyle);
    }, [displayStyle, displayThicknessScale, effectiveRotateRef, hoverStyle, mode]);

    useEffect(() => {
      return () => {
        if (!hasEnabledFlag(defaultControls) || !defaultControlsSuppressedRef.current) return;
        defaultControls.enabled = defaultControlsEnabledBeforeSuppressRef.current;
        defaultControlsSuppressedRef.current = false;
      };
    }, [defaultControls]);

    useEffect(() => {
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'hidden') {
          releaseDragLock();
        }
      };

      window.addEventListener('mouseup', releaseDragLock);
      window.addEventListener('pointerup', releaseDragLock);
      window.addEventListener('pointercancel', releaseDragLock);
      window.addEventListener('blur', releaseDragLock);
      document.addEventListener('visibilitychange', handleVisibilityChange);

      return () => {
        window.removeEventListener('mouseup', releaseDragLock);
        window.removeEventListener('pointerup', releaseDragLock);
        window.removeEventListener('pointercancel', releaseDragLock);
        window.removeEventListener('blur', releaseDragLock);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
    }, [releaseDragLock]);

    useEffect(() => {
      syncControlEnabledState();

      // When the gizmo becomes disabled (e.g. pendingEdit confirmation is
      // showing), no drag can be active, so proactively restore orbit controls
      // that our useFrame(1100) suppression may still be holding disabled.
      if (!enabled && defaultControlsSuppressedRef.current && hasEnabledFlag(defaultControls)) {
        defaultControls.enabled = defaultControlsEnabledBeforeSuppressRef.current;
        defaultControlsSuppressedRef.current = false;
      }
    }, [defaultControls, enabled, syncControlEnabledState]);

    useEffect(() => {
      if (!defaultControls) return;
      if (defaultControls === translateRef.current || defaultControls === effectiveRotateRef.current) {
        return;
      }

      const controlsWithEvents = defaultControls as THREE.EventDispatcher & {
        addEventListener?: (type: string, listener: (...args: any[]) => void) => void;
        removeEventListener?: (type: string, listener: (...args: any[]) => void) => void;
      };

      if (
        typeof controlsWithEvents.addEventListener !== 'function' ||
        typeof controlsWithEvents.removeEventListener !== 'function'
      ) {
        return;
      }

      const handleViewDragStart = () => {
        if (translateRef.current?.dragging || effectiveRotateRef.current?.dragging) return;
        orbitPassthroughRef.current = true;
        clearHoveredAxes();
        syncControlEnabledState();
      };

      const handleViewDragEnd = () => {
        orbitPassthroughRef.current = false;
        clearHoveredAxes();
        syncControlEnabledState();
      };

      controlsWithEvents.addEventListener('start', handleViewDragStart);
      controlsWithEvents.addEventListener('end', handleViewDragEnd);
      window.addEventListener('pointerup', handleViewDragEnd);
      window.addEventListener('pointercancel', handleViewDragEnd);
      window.addEventListener('blur', handleViewDragEnd);

      return () => {
        controlsWithEvents.removeEventListener?.('start', handleViewDragStart);
        controlsWithEvents.removeEventListener?.('end', handleViewDragEnd);
        window.removeEventListener('pointerup', handleViewDragEnd);
        window.removeEventListener('pointercancel', handleViewDragEnd);
        window.removeEventListener('blur', handleViewDragEnd);
      };
    }, [clearHoveredAxes, defaultControls, effectiveRotateRef, syncControlEnabledState]);

    useFrame(() => {
      if (!defaultControls) return;
      if (defaultControls === translateRef.current || defaultControls === effectiveRotateRef.current) {
        return;
      }
      if (!hasEnabledFlag(defaultControls)) return;

      const shouldSuppressDefaultControls =
        hasHoveredHandle(translateRef.current) ||
        hasHoveredHandle(effectiveRotateRef.current) ||
        Boolean(translateRef.current?.dragging) ||
        Boolean(effectiveRotateRef.current?.dragging);

      if (!shouldSuppressDefaultControls) {
        if (defaultControlsSuppressedRef.current) {
          defaultControls.enabled = defaultControlsEnabledBeforeSuppressRef.current;
          defaultControlsSuppressedRef.current = false;
        } else {
          defaultControlsEnabledBeforeSuppressRef.current = defaultControls.enabled;
        }
        return;
      }

      if (!defaultControlsSuppressedRef.current) {
        // Do NOT re-capture defaultControls.enabled here.
        // The idle-tracking branch above already holds the correct pre-drag
        // value.  React-driven props (e.g. OrbitControls enabled={!isDragging})
        // may have already toggled defaultControls.enabled to false by this
        // point, so re-capturing would save the wrong value and permanently
        // break orbit on restoration.
        defaultControlsSuppressedRef.current = true;
      }

      defaultControls.enabled = false;
    }, 1100);

    useEffect(() => {
      if (mode !== 'universal' || !enableUniversalPriority) {
        universalOwnerRef.current = null;
        return;
      }

      const translateControls = translateRef.current;
      const rotateControls = effectiveRotateRef.current;
      if (!translateControls || !rotateControls) return;

      const clearOwnerIfIdle = () => {
        if (
          !translateControls.dragging &&
          !rotateControls.dragging &&
          !hasHoveredHandle(translateControls) &&
          !hasHoveredHandle(rotateControls)
        ) {
          universalOwnerRef.current = null;
        }
      };

      const handleTranslateAxisChange = (event: { value: string | null }) => {
        if (event.value) {
          universalOwnerRef.current = 'translate';
          return;
        }

        clearOwnerIfIdle();
      };

      const handleRotateAxisChange = (event: { value: string | null }) => {
        if (event.value) {
          universalOwnerRef.current = 'rotate';
          return;
        }

        clearOwnerIfIdle();
      };

      const handleTranslateDragChange = (event: { value: boolean }) => {
        if (event.value) {
          universalOwnerRef.current = 'translate';
          return;
        }

        clearOwnerIfIdle();
      };

      const handleRotateDragChange = (event: { value: boolean }) => {
        if (event.value) {
          universalOwnerRef.current = 'rotate';
          return;
        }

        clearOwnerIfIdle();
      };

      translateControls.addEventListener('axis-changed', handleTranslateAxisChange);
      rotateControls.addEventListener('axis-changed', handleRotateAxisChange);
      translateControls.addEventListener('dragging-changed', handleTranslateDragChange);
      rotateControls.addEventListener('dragging-changed', handleRotateDragChange);

      return () => {
        translateControls.removeEventListener('axis-changed', handleTranslateAxisChange);
        rotateControls.removeEventListener('axis-changed', handleRotateAxisChange);
        translateControls.removeEventListener('dragging-changed', handleTranslateDragChange);
        rotateControls.removeEventListener('dragging-changed', handleRotateDragChange);
      };
    }, [mode, enableUniversalPriority, effectiveRotateRef]);

    useFrame(() => {
      if (mode !== 'universal' || !enableUniversalPriority) return;

      const translateControls = translateRef.current;
      const rotateControls = effectiveRotateRef.current;
      if (!translateControls || !rotateControls) return;

      if (orbitPassthroughRef.current) {
        translateControls.enabled = false;
        rotateControls.enabled = false;
        return;
      }

      let pointerOwner: UniversalOwner = null;
      const translateVisibleHit = resolveVisibleTranslateHit(translateControls, pointer);
      const rotateVisibleHit = resolveVisibleRotateHit(rotateControls, pointer);

      pointerOwner = resolvePreferredVisibleOwner(
        translateVisibleHit,
        rotateVisibleHit,
        universalOwnerRef.current
      );

      const activeOwner = resolveUniversalOwner(
        translateControls,
        rotateControls,
        pointerOwner
      );
      universalOwnerRef.current = activeOwner;

      if (activeOwner === 'rotate') {
        if (!translateControls.dragging && translateControls.axis !== null) {
          translateControls.axis = null;
        }
        if (!rotateControls.dragging) {
          rotateControls.axis = rotateVisibleHit?.axis ?? null;
        }

        rotateControls.enabled = rotateEnabled ?? enabled;
        translateControls.enabled = false;
        return;
      }

      if (activeOwner === 'translate') {
        if (!rotateControls.dragging && rotateControls.axis !== null) {
          rotateControls.axis = null;
        }
        if (!translateControls.dragging) {
          translateControls.axis = translateVisibleHit?.axis ?? null;
        }

        translateControls.enabled = enabled;
        rotateControls.enabled = false;
        return;
      }

      if (!translateControls.dragging && translateControls.axis !== null) {
        translateControls.axis = null;
      }
      if (!rotateControls.dragging && rotateControls.axis !== null) {
        rotateControls.axis = null;
      }

      translateControls.enabled = false;
      rotateControls.enabled = false;
    }, 1000);

    if (!primaryObject || (mode === 'universal' && !attachedRotateObject)) {
      return null;
    }

    return (
      <>
        <DreiTransformControls
          ref={translateRef}
          object={primaryObject}
          mode={primaryMode}
          enabled={enabled}
          space={primarySpace}
          size={mode === 'rotate' ? (rotateSize ?? size) : size}
          onChange={onChange}
          onMouseDown={handleControlMouseDown}
          onMouseUp={handleControlMouseUp}
          {...restProps}
        />

        {mode === 'universal' && (
          <DreiTransformControls
            ref={effectiveRotateRef}
            object={attachedRotateObject}
            mode="rotate"
            enabled={rotateEnabled ?? enabled}
            space={rotateSpace ?? space}
            size={rotateSize ?? size}
            onChange={onRotateChange ?? onChange}
            onMouseDown={handleControlMouseDown}
            onMouseUp={handleControlMouseUp}
            {...restProps}
          />
        )}
      </>
    );
  }
);
