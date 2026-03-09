import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { TransformControls as DreiTransformControls } from '@react-three/drei';
import * as THREE from 'three';

type DreiTransformControlsProps = React.ComponentProps<typeof DreiTransformControls>;
type SharedControlRef = React.MutableRefObject<any | null> | React.RefObject<any | null>;

export type UnifiedTransformMode = 'translate' | 'rotate' | 'scale' | 'universal';
type UnifiedGizmoPreset = 'default' | 'official' | 'collision-precise';
export const VISUALIZER_UNIFIED_GIZMO_SIZE = 0.82;

interface UnifiedTransformControlsProps extends Omit<DreiTransformControlsProps, 'mode'> {
  mode: UnifiedTransformMode;
  rotateRef?: SharedControlRef;
  rotateSize?: number;
  rotateEnabled?: boolean;
  onRotateChange?: DreiTransformControlsProps['onChange'];
  enableUniversalPriority?: boolean;
  gizmoPreset?: UnifiedGizmoPreset;
  axesOnly?: boolean;
}

type UniversalOwner = 'translate' | 'rotate' | null;
type ControlsWithEnabled = THREE.EventDispatcher & { enabled: boolean };
const AXIS_NAMES = new Set(['X', 'Y', 'Z']);
const TRANSLATE_PICKER_REMOVE_NAMES = new Set(['XY', 'YZ', 'XZ', 'XYZ']);
const TRANSLATE_VISUAL_REMOVE_NAMES = new Set(['X', 'Y', 'Z', 'XY', 'YZ', 'XZ', 'XYZ']);
const OFFICIAL_ROTATE_REMOVE_NAMES = new Set(['E', 'XYZE']);
const OFFICIAL_ACTIVE_COLOR = new THREE.Color(0xffff00);
const OFFICIAL_INACTIVE_DIM_FACTOR = 0.42;
const THICK_TRANSLATE_SHAFT_RADIUS = 0.04;
const THICK_TRANSLATE_TIP_RADIUS = 0.095;
const THICK_ROTATE_ARC_RADIUS = 0.021;
const THICK_ROTATE_PICKER_RADIUS = 0.16;
const COLLISION_TRANSLATE_AXIS_LENGTH = 0.5;
const COLLISION_TRANSLATE_INNER_GAP = 0.11;
const COLLISION_TRANSLATE_DASH_SIZE = 0.1;
const COLLISION_TRANSLATE_GAP_SIZE = 0.06;
const COLLISION_TRANSLATE_VISIBLE_OPACITY = 0.78;
const COLLISION_TRANSLATE_HOVER_OPACITY = 0.9;
const COLLISION_TRANSLATE_ARROW_LENGTH = 0.1;
const COLLISION_ROTATE_RING_RADIUS = 0.5;
const COLLISION_ROTATE_ARC_SPAN = (Math.PI * 2) / 3;
const COLLISION_ROTATE_PICKER_RADIUS = 0.1;
const COLLISION_ROTATE_KNOB_RADIUS = 0.072;
const COLLISION_ROTATE_REMAINDER_OPACITY = 0.48;
const COLLISION_ROTATE_REMAINDER_DASH_SIZE = 0.12;
const COLLISION_ROTATE_REMAINDER_GAP_SIZE = 0.075;
const COLLISION_ROTATE_VISIBLE_OPACITY = 0.92;
const COLLISION_PICKER_OPACITY = 0.001;
const COLLISION_ROTATE_START_ANGLE: Record<'X' | 'Y' | 'Z', number> = {
  X: -COLLISION_ROTATE_ARC_SPAN / 2,
  Y: -COLLISION_ROTATE_ARC_SPAN / 2,
  Z: -COLLISION_ROTATE_ARC_SPAN / 2,
};
const ROTATE_HANDLE_NAMES = new Set(['X', 'Y', 'Z', 'E', 'XYZE']);

const hasEnabledFlag = (controls: unknown): controls is ControlsWithEnabled =>
  typeof controls === 'object' &&
  controls !== null &&
  'enabled' in controls &&
  typeof (controls as { enabled?: unknown }).enabled === 'boolean';

const getHandleMaterials = (handle: any) => {
  const material = handle?.material;
  if (!material) return [] as any[];
  return Array.isArray(material) ? material : [material];
};

const getSingleHandleMaterial = (handle: any) => {
  const material = handle?.material;
  return Array.isArray(material) ? material[0] : material;
};

const rememberHandleMaterialState = <T extends THREE.Material>(
  material: T,
  color: THREE.Color,
  opacity: number,
  extraUserData: Record<string, unknown> = {}
) => {
  (material as any).tempColor = color.clone();
  (material as any).tempOpacity = opacity;
  material.userData = {
    ...material.userData,
    urdfBaseColor: color.clone(),
    urdfBaseOpacity: opacity,
    ...extraUserData,
  };
  return material;
};

const getHandleBaseColor = (material: any) => {
  if (material?.userData?.urdfBaseColor instanceof THREE.Color) {
    return material.userData.urdfBaseColor as THREE.Color;
  }
  if (material?.tempColor instanceof THREE.Color) {
    return material.tempColor as THREE.Color;
  }
  if (material?.color instanceof THREE.Color) {
    return material.color as THREE.Color;
  }
  return null;
};

const getHandleBaseOpacity = (material: any) => {
  if (typeof material?.userData?.urdfBaseOpacity === 'number') {
    return material.userData.urdfBaseOpacity as number;
  }
  if (typeof material?.tempOpacity === 'number') {
    return material.tempOpacity as number;
  }
  if (typeof material?.opacity === 'number') {
    return material.opacity as number;
  }
  return null;
};

const resolveHandleColor = (sourceMaterial: any) => {
  const color = new THREE.Color(0xffffff);
  const baseColor = getHandleBaseColor(sourceMaterial);
  if (baseColor) {
    color.copy(baseColor);
  } else if (sourceMaterial?.color) {
    color.copy(sourceMaterial.color);
  }
  return color;
};

const cloneAxisMaterial = (
  sourceMaterial: any,
  options: {
    color?: THREE.ColorRepresentation;
    opacity?: number;
    extraUserData?: Record<string, unknown>;
  } = {}
) => {
  const color = options.color !== undefined
    ? new THREE.Color(options.color)
    : resolveHandleColor(sourceMaterial);
  const opacity = typeof options.opacity === 'number'
    ? options.opacity
    : typeof getHandleBaseOpacity(sourceMaterial) === 'number'
      ? (getHandleBaseOpacity(sourceMaterial) as number)
      : 1;

  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });

  return rememberHandleMaterialState(material, color, opacity, options.extraUserData);
};

const createCollisionPickerMaterial = () => {
  const color = new THREE.Color(0xffffff);
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: COLLISION_PICKER_OPACITY,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
};

const createCollisionRemainderMaterial = (sourceMaterial: any) => {
  const color = resolveHandleColor(sourceMaterial);
  const material = new THREE.LineDashedMaterial({
    color,
    transparent: true,
    opacity: 0,
    dashSize: COLLISION_ROTATE_REMAINDER_DASH_SIZE,
    gapSize: COLLISION_ROTATE_REMAINDER_GAP_SIZE,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });

  return rememberHandleMaterialState(material, color, 0, {
    urdfCollisionRemainder: true,
  });
};

const createCollisionTranslateMaterial = (
  sourceMaterial: any,
  opacity: number,
  extraUserData: Record<string, unknown> = {}
) => {
  const color = resolveHandleColor(sourceMaterial);
  const material = new THREE.LineDashedMaterial({
    color,
    transparent: true,
    opacity,
    dashSize: COLLISION_TRANSLATE_DASH_SIZE,
    gapSize: COLLISION_TRANSLATE_GAP_SIZE,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });

  return rememberHandleMaterialState(material, color, opacity, extraUserData);
};

const matchesHighlightedAxis = (handleName: string, axis: string) => {
  if (axis === 'E' || axis === 'XYZE' || axis === 'XYZ') {
    return false;
  }

  return handleName === axis || axis.split('').some((part) => handleName === part);
};

const getHandleAxisName = (handle: any) => {
  if (typeof handle?.userData?.urdfAxisName === 'string') {
    return handle.userData.urdfAxisName as string;
  }
  return typeof handle?.name === 'string' ? handle.name : '';
};

const applyOfficialHoverAppearance = (controls: any) => {
  const gizmo = controls?.gizmo;
  const mode = gizmo?.mode;
  const hasActiveAxis = gizmo.enabled && typeof gizmo.axis === 'string';
  const handles = [
    ...(gizmo?.picker?.[mode]?.children ?? []),
    ...(gizmo?.gizmo?.[mode]?.children ?? []),
    ...(gizmo?.helper?.[mode]?.children ?? []),
  ];

  for (const handle of handles) {
    const handleAxisName = getHandleAxisName(handle);

    for (const material of getHandleMaterials(handle)) {
      const baseColor = getHandleBaseColor(material);
      const baseOpacity = getHandleBaseOpacity(material);
      if (!baseColor || typeof baseOpacity !== 'number') continue;

      material.color.copy(baseColor);
      material.opacity = baseOpacity;

      if (material.userData?.urdfCollisionPicker) {
        material.opacity = gizmo.enabled ? COLLISION_PICKER_OPACITY : COLLISION_PICKER_OPACITY * 0.5;
        continue;
      }

      if (
        material.userData?.urdfCollisionVisibleArc ||
        material.userData?.urdfCollisionVisibleKnob
      ) {
        const isAxisHovered =
          gizmo.enabled &&
          typeof gizmo.axis === 'string' &&
          matchesHighlightedAxis(handleAxisName, gizmo.axis);
        material.color.copy(isAxisHovered ? OFFICIAL_ACTIVE_COLOR : baseColor);
        material.opacity = gizmo.enabled ? baseOpacity : baseOpacity * 0.5;
        continue;
      }

      if (material.userData?.urdfCollisionTranslateVisibleLine) {
        const isAxisHovered =
          gizmo.enabled &&
          typeof gizmo.axis === 'string' &&
          matchesHighlightedAxis(handleAxisName, gizmo.axis);
        material.color.copy(isAxisHovered ? OFFICIAL_ACTIVE_COLOR : baseColor);
        material.opacity = gizmo.enabled ? baseOpacity : baseOpacity * 0.5;
        continue;
      }

      if (material.userData?.urdfCollisionTranslateHoverLine) {
        const shouldShowHoverLine =
          gizmo.enabled &&
          typeof gizmo.axis === 'string' &&
          matchesHighlightedAxis(handleAxisName, gizmo.axis);
        material.color.copy(shouldShowHoverLine ? OFFICIAL_ACTIVE_COLOR : baseColor);
        material.opacity = shouldShowHoverLine ? COLLISION_TRANSLATE_HOVER_OPACITY : 0;
        continue;
      }

      if (material.userData?.urdfCollisionStaticVisual) {
        material.opacity = gizmo.enabled ? baseOpacity : baseOpacity * 0.5;
        continue;
      }

      if (material.userData?.urdfCollisionRemainder) {
        const shouldShowRemainder =
          gizmo.enabled &&
          typeof gizmo.axis === 'string' &&
          matchesHighlightedAxis(handleAxisName, gizmo.axis);
        material.opacity = shouldShowRemainder ? COLLISION_ROTATE_REMAINDER_OPACITY : 0;
        continue;
      }

      if (!gizmo.enabled) {
        material.opacity *= 0.5;
        continue;
      }

      if (hasActiveAxis && !matchesHighlightedAxis(handleAxisName, gizmo.axis)) {
        material.opacity = Math.max(baseOpacity * OFFICIAL_INACTIVE_DIM_FACTOR, 0.16);
        continue;
      }

      if (hasActiveAxis && matchesHighlightedAxis(handleAxisName, gizmo.axis)) {
        material.color.copy(OFFICIAL_ACTIVE_COLOR);
        material.opacity = 1;
      }
    }
  }
};

const getLineEndpoint = (line: THREE.Line) => {
  const position = line.geometry.getAttribute('position');
  if (!position || position.count < 2) return null;

  let farthestIndex = 0;
  let farthestLengthSq = -1;

  for (let index = 0; index < position.count; index += 1) {
    const candidate = new THREE.Vector3(
      position.getX(index),
      position.getY(index),
      position.getZ(index)
    );
    const candidateLengthSq = candidate.lengthSq();
    if (candidateLengthSq > farthestLengthSq) {
      farthestLengthSq = candidateLengthSq;
      farthestIndex = index;
    }
  }

  return new THREE.Vector3(
    position.getX(farthestIndex),
    position.getY(farthestIndex),
    position.getZ(farthestIndex)
  );
};

const setRotateAxisOrientation = (object: THREE.Object3D, axis: 'X' | 'Y' | 'Z') => {
  object.rotation.set(0, 0, 0);
  if (axis === 'Y') {
    object.rotation.z = -Math.PI / 2;
  } else if (axis === 'Z') {
    object.rotation.y = Math.PI / 2;
  }
};

const setTranslateAxisOrientation = (object: THREE.Object3D, axis: 'X' | 'Y' | 'Z') => {
  if (axis === 'X') {
    object.rotation.z = -Math.PI / 2;
  } else if (axis === 'Z') {
    object.rotation.x = Math.PI / 2;
  }
};

const getAxisDirection = (axis: 'X' | 'Y' | 'Z') => {
  if (axis === 'X') return new THREE.Vector3(1, 0, 0);
  if (axis === 'Y') return new THREE.Vector3(0, 1, 0);
  return new THREE.Vector3(0, 0, 1);
};

const createAxisLinePoints = (axis: 'X' | 'Y' | 'Z', start: number, end: number) => {
  const direction = getAxisDirection(axis);
  return [
    direction.clone().multiplyScalar(start),
    direction.clone().multiplyScalar(end),
  ];
};

const createOfficialRotateArcGeometry = (
  radius: number,
  tubeRadius: number,
  arc: number,
  radialSegments: number,
  tubularSegments: number,
  startAngle = 0
) => {
  const geometry = new THREE.TorusGeometry(
    radius,
    tubeRadius,
    radialSegments,
    tubularSegments,
    arc
  );
  geometry.rotateY(Math.PI / 2);
  geometry.rotateX(Math.PI / 2);
  if (startAngle !== 0) {
    geometry.rotateX(startAngle);
  }
  return geometry;
};

const createOfficialRotateArcPoints = (
  radius: number,
  startAngle: number,
  endAngle: number,
  segments: number
) => {
  const points: THREE.Vector3[] = [];
  for (let index = 0; index <= segments; index += 1) {
    const alpha = index / segments;
    const angle = startAngle + (endAngle - startAngle) * alpha;
    points.push(new THREE.Vector3(
      0,
      Math.cos(angle) * radius,
      Math.sin(angle) * radius
    ));
  }
  return points;
};

const createOfficialRotateArcPoint = (radius: number, angle: number) =>
  new THREE.Vector3(
    0,
    Math.cos(angle) * radius,
    Math.sin(angle) * radius
  );

const collectAxisMaterials = (group: THREE.Object3D | undefined) => {
  const materials = new Map<'X' | 'Y' | 'Z', any>();
  if (!group) return materials;

  group.traverse((node) => {
    if (!AXIS_NAMES.has(node.name)) return;
    const axis = node.name as 'X' | 'Y' | 'Z';
    if (materials.has(axis)) return;

    const material = getSingleHandleMaterial(node);
    if (material) {
      materials.set(axis, material);
    }
  });

  return materials;
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

const removeRotateAxisHandles = (group: THREE.Object3D | undefined) => {
  if (!group) return;

  const nodesToRemove: THREE.Object3D[] = [];
  group.traverse((node) => {
    if (node === group) return;
    if (!ROTATE_HANDLE_NAMES.has(node.name)) return;
    if ((node as any).isLine || (node as any).isMesh) {
      nodesToRemove.push(node);
    }
  });

  for (const node of nodesToRemove) {
    node.parent?.remove(node);
  }
};

const patchOfficialAxesOnlyGizmo = (controls: any) => {
  const gizmo = controls?.gizmo;
  if (!gizmo || gizmo.userData?.urdfOfficialAxesOnlyPatched) return;

  removeHandlesByNames(gizmo.gizmo?.translate, TRANSLATE_PICKER_REMOVE_NAMES);
  removeHandlesByNames(gizmo.picker?.translate, TRANSLATE_PICKER_REMOVE_NAMES);
  removeHandlesByNames(gizmo.gizmo?.rotate, OFFICIAL_ROTATE_REMOVE_NAMES);
  removeHandlesByNames(gizmo.picker?.rotate, OFFICIAL_ROTATE_REMOVE_NAMES);

  gizmo.userData.urdfOfficialAxesOnlyPatched = true;
};

const patchCollisionRotateVisuals = (group: THREE.Object3D | undefined) => {
  if (!group || group.userData?.urdfCollisionRotateVisualsPatched) return;

  const axisMaterials = collectAxisMaterials(group);
  removeRotateAxisHandles(group);

  for (const axis of ['X', 'Y', 'Z'] as const) {
    const startAngle = COLLISION_ROTATE_START_ANGLE[axis];
    const sourceMaterial = axisMaterials.get(axis) ?? null;
    const knobPoint = createOfficialRotateArcPoint(
      COLLISION_ROTATE_RING_RADIUS,
      startAngle + COLLISION_ROTATE_ARC_SPAN * 0.5
    );

    const visibleGeometry = createOfficialRotateArcGeometry(
      COLLISION_ROTATE_RING_RADIUS,
      THICK_ROTATE_ARC_RADIUS,
      COLLISION_ROTATE_ARC_SPAN,
      10,
      72,
      startAngle
    );

    const visibleMaterial = cloneAxisMaterial(sourceMaterial, {
      opacity: COLLISION_ROTATE_VISIBLE_OPACITY,
      extraUserData: { urdfCollisionVisibleArc: true, urdfCollisionStaticVisual: true },
    });
    const visibleArc = new THREE.Mesh(visibleGeometry, visibleMaterial);
    visibleArc.name = `URDF_ROTATE_ARC_${axis}`;
    visibleArc.userData.isGizmo = true;
    visibleArc.userData.urdfCollisionPreciseHandle = true;
    visibleArc.userData.urdfAxisName = axis;
    setRotateAxisOrientation(visibleArc, axis);
    group.add(visibleArc);

    const remainderGeometry = new THREE.BufferGeometry().setFromPoints(
      createOfficialRotateArcPoints(
        COLLISION_ROTATE_RING_RADIUS,
        startAngle + COLLISION_ROTATE_ARC_SPAN,
        startAngle + Math.PI * 2,
        80
      )
    );
    const remainderArc = new THREE.Line(
      remainderGeometry,
      createCollisionRemainderMaterial(sourceMaterial)
    );
    remainderArc.computeLineDistances();
    remainderArc.name = `URDF_ROTATE_REMAINDER_${axis}`;
    remainderArc.userData.isGizmo = true;
    remainderArc.userData.urdfCollisionPreciseHandle = true;
    remainderArc.userData.urdfAxisName = axis;
    setRotateAxisOrientation(remainderArc, axis);
    group.add(remainderArc);

    const knobGeometry = new THREE.SphereGeometry(COLLISION_ROTATE_KNOB_RADIUS, 20, 16);
    knobGeometry.translate(knobPoint.x, knobPoint.y, knobPoint.z);
    const knob = new THREE.Mesh(
      knobGeometry,
      cloneAxisMaterial(sourceMaterial, {
        opacity: COLLISION_ROTATE_VISIBLE_OPACITY,
        extraUserData: { urdfCollisionVisibleKnob: true, urdfCollisionStaticVisual: true },
      })
    );
    knob.name = `URDF_ROTATE_KNOB_${axis}`;
    knob.userData.isGizmo = true;
    knob.userData.urdfCollisionPreciseHandle = true;
    knob.userData.urdfAxisName = axis;
    setRotateAxisOrientation(knob, axis);
    group.add(knob);
  }

  group.userData.urdfCollisionRotateVisualsPatched = true;
};

const patchCollisionRotatePickers = (group: THREE.Object3D | undefined) => {
  if (!group || group.userData?.urdfCollisionRotatePickersPatched) return;

  removeRotateAxisHandles(group);

  for (const axis of ['X', 'Y', 'Z'] as const) {
    const startAngle = COLLISION_ROTATE_START_ANGLE[axis];
    const knobPoint = createOfficialRotateArcPoint(
      COLLISION_ROTATE_RING_RADIUS,
      startAngle + COLLISION_ROTATE_ARC_SPAN * 0.5
    );
    const pickerMaterial = rememberHandleMaterialState(
      createCollisionPickerMaterial(),
      new THREE.Color(0xffffff),
      COLLISION_PICKER_OPACITY,
      { urdfCollisionPicker: true }
    );

    const arcPicker = new THREE.Mesh(
      createOfficialRotateArcGeometry(
        COLLISION_ROTATE_RING_RADIUS,
        COLLISION_ROTATE_PICKER_RADIUS,
        COLLISION_ROTATE_ARC_SPAN,
        6,
        48,
        startAngle
      ),
      pickerMaterial
    );
    arcPicker.name = axis;
    arcPicker.userData.isGizmo = true;
    arcPicker.userData.urdfCollisionPrecisePicker = true;
    arcPicker.userData.urdfAxisName = axis;
    setRotateAxisOrientation(arcPicker, axis);
    group.add(arcPicker);

    const knobGeometry = new THREE.SphereGeometry(COLLISION_ROTATE_PICKER_RADIUS, 12, 10);
    knobGeometry.translate(knobPoint.x, knobPoint.y, knobPoint.z);
    const knobPicker = new THREE.Mesh(knobGeometry, pickerMaterial);
    knobPicker.name = axis;
    knobPicker.userData.isGizmo = true;
    knobPicker.userData.urdfCollisionPrecisePicker = true;
    knobPicker.userData.urdfAxisName = axis;
    setRotateAxisOrientation(knobPicker, axis);
    group.add(knobPicker);
  }

  group.userData.urdfCollisionRotatePickersPatched = true;
};

const patchCollisionTranslatePickers = (group: THREE.Object3D | undefined) => {
  if (!group || group.userData?.urdfCollisionTranslatePickersPatched) return;

  removeHandlesByNames(group, AXIS_NAMES);
  removeHandlesByNames(group, TRANSLATE_PICKER_REMOVE_NAMES);

  const pickerLength = COLLISION_TRANSLATE_AXIS_LENGTH + COLLISION_TRANSLATE_ARROW_LENGTH * 0.9;

  for (const axis of ['X', 'Y', 'Z'] as const) {
    const geometry = new THREE.CylinderGeometry(0.16, 0.16, pickerLength, 10);
    geometry.translate(0, pickerLength * 0.5, 0);

    const material = rememberHandleMaterialState(
      createCollisionPickerMaterial(),
      new THREE.Color(0xffffff),
      COLLISION_PICKER_OPACITY,
      { urdfCollisionPicker: true }
    );

    const picker = new THREE.Mesh(geometry, material);
    picker.name = axis;
    picker.userData.isGizmo = true;
    picker.userData.urdfCollisionPrecisePicker = true;
    picker.userData.urdfAxisName = axis;
    setTranslateAxisOrientation(picker, axis);
    group.add(picker);
  }

  group.userData.urdfCollisionTranslatePickersPatched = true;
};

const createTranslateArrowGeometry = () => {
  const geometry = new THREE.CylinderGeometry(
    0,
    THICK_TRANSLATE_TIP_RADIUS,
    COLLISION_TRANSLATE_ARROW_LENGTH,
    14
  );
  geometry.translate(0, COLLISION_TRANSLATE_ARROW_LENGTH * 0.5, 0);
  return geometry;
};

const patchCollisionTranslateVisuals = (group: THREE.Object3D | undefined) => {
  if (!group || group.userData?.urdfCollisionTranslateVisualsPatched) return;

  const axisMaterials = collectAxisMaterials(group);
  removeHandlesByNames(group, TRANSLATE_VISUAL_REMOVE_NAMES);

  for (const axis of ['X', 'Y', 'Z'] as const) {
    const sourceMaterial = axisMaterials.get(axis) ?? null;
    const visibleLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(
        createAxisLinePoints(axis, COLLISION_TRANSLATE_INNER_GAP, COLLISION_TRANSLATE_AXIS_LENGTH)
      ),
      createCollisionTranslateMaterial(sourceMaterial, COLLISION_TRANSLATE_VISIBLE_OPACITY, {
        urdfCollisionTranslateVisibleLine: true,
      })
    );
    visibleLine.computeLineDistances();
    visibleLine.name = `URDF_TRANSLATE_LINE_${axis}`;
    visibleLine.userData.isGizmo = true;
    visibleLine.userData.urdfAxisName = axis;
    visibleLine.userData.urdfCollisionPreciseHandle = true;
    group.add(visibleLine);

    const hoverLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(
        createAxisLinePoints(axis, 0, COLLISION_TRANSLATE_AXIS_LENGTH)
      ),
      createCollisionTranslateMaterial(sourceMaterial, 0, {
        urdfCollisionTranslateHoverLine: true,
      })
    );
    hoverLine.computeLineDistances();
    hoverLine.name = `URDF_TRANSLATE_HOVER_LINE_${axis}`;
    hoverLine.userData.isGizmo = true;
    hoverLine.userData.urdfAxisName = axis;
    hoverLine.userData.urdfCollisionPreciseHandle = true;
    group.add(hoverLine);

    const tipMesh = new THREE.Mesh(
      createTranslateArrowGeometry(),
      cloneAxisMaterial(sourceMaterial, {
        extraUserData: { urdfCollisionStaticVisual: true },
      })
    );
    tipMesh.name = `URDF_TRANSLATE_TIP_${axis}`;
    tipMesh.userData.isGizmo = true;
    tipMesh.userData.urdfAxisName = axis;
    tipMesh.userData.urdfCollisionPreciseHandle = true;
    tipMesh.position.copy(getAxisDirection(axis).multiplyScalar(COLLISION_TRANSLATE_AXIS_LENGTH));
    setTranslateAxisOrientation(tipMesh, axis);
    group.add(tipMesh);
  }

  group.userData.urdfCollisionTranslateVisualsPatched = true;
};

const enhanceTranslateThickness = (group: THREE.Object3D | undefined) => {
  if (!group || group.userData?.urdfTranslateThicknessPatched) return;

  const lineByAxis = new Map<'X' | 'Y' | 'Z', THREE.Line>();
  group.traverse((node) => {
    const line = node as THREE.Line;
    if (!line.isLine) return;
    if (line.name !== 'X' && line.name !== 'Y' && line.name !== 'Z') return;
    if (!lineByAxis.has(line.name)) {
      lineByAxis.set(line.name, line);
    }
  });

  for (const axis of ['X', 'Y', 'Z'] as const) {
    const line = lineByAxis.get(axis);
    if (!line) continue;

    const lineMaterial = getSingleHandleMaterial(line);
    const shaftMaterial = cloneAxisMaterial(lineMaterial);
    const shaftGeometry = new THREE.CylinderGeometry(
      THICK_TRANSLATE_SHAFT_RADIUS,
      THICK_TRANSLATE_SHAFT_RADIUS,
      0.82,
      12
    );

    if (axis === 'X') {
      shaftGeometry.rotateZ(-Math.PI / 2);
      shaftGeometry.translate(0.41, 0, 0);
    } else if (axis === 'Y') {
      shaftGeometry.translate(0, 0.41, 0);
    } else {
      shaftGeometry.rotateX(Math.PI / 2);
      shaftGeometry.translate(0, 0, 0.41);
    }

    const shaftMesh = new THREE.Mesh(shaftGeometry, shaftMaterial);
    shaftMesh.name = axis;
    shaftMesh.userData.isGizmo = true;
    shaftMesh.userData.urdfThicknessHandle = true;
    group.add(shaftMesh);

    const tip = getLineEndpoint(line);
    if (!tip) continue;

    const tipMaterial = cloneAxisMaterial(lineMaterial);
    const tipMesh = new THREE.Mesh(
      new THREE.SphereGeometry(THICK_TRANSLATE_TIP_RADIUS, 16, 14),
      tipMaterial
    );
    tipMesh.name = axis;
    tipMesh.position.copy(tip);
    tipMesh.userData.isGizmo = true;
    tipMesh.userData.urdfThicknessHandle = true;
    group.add(tipMesh);
  }

  group.userData.urdfTranslateThicknessPatched = true;
};

const enhanceRotateThickness = (group: THREE.Object3D | undefined) => {
  if (!group || group.userData?.urdfRotateThicknessPatched) return;

  group.traverse((node) => {
    const line = node as THREE.Line;
    if (!line.isLine) return;
    if (line.name !== 'X' && line.name !== 'Y' && line.name !== 'Z') return;
    if (line.userData?.urdfRotateArcMesh) return;

    line.visible = false;

    const arcGeometry = new THREE.TorusGeometry(1, THICK_ROTATE_ARC_RADIUS, 10, 96);
    if (line.name === 'X') {
      arcGeometry.rotateY(Math.PI / 2);
    } else if (line.name === 'Y') {
      arcGeometry.rotateX(Math.PI / 2);
    }

    const arcMesh = new THREE.Mesh(arcGeometry, cloneAxisMaterial(getSingleHandleMaterial(line)));
    arcMesh.name = line.name;
    arcMesh.userData.isGizmo = true;
    arcMesh.userData.urdfRotateArcMesh = true;
    group.add(arcMesh);
  });

  group.userData.urdfRotateThicknessPatched = true;
};

const enhanceRotatePickers = (group: THREE.Object3D | undefined) => {
  if (!group || group.userData?.urdfRotatePickersPatched) return;

  group.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (mesh.name !== 'X' && mesh.name !== 'Y' && mesh.name !== 'Z') return;
    if ((mesh.geometry as THREE.BufferGeometry).type !== 'TorusGeometry') return;

    const parameters = (mesh.geometry as any).parameters ?? {};
    const radius = typeof parameters.radius === 'number' ? parameters.radius : 1;
    const radialSegments =
      typeof parameters.radialSegments === 'number' ? Math.max(parameters.radialSegments, 8) : 8;
    const tubularSegments =
      typeof parameters.tubularSegments === 'number'
        ? Math.max(parameters.tubularSegments, 48)
        : 48;
    const arc = typeof parameters.arc === 'number' ? parameters.arc : Math.PI * 2;

    const nextGeometry = new THREE.TorusGeometry(
      radius,
      Math.max(
        typeof parameters.tube === 'number' ? parameters.tube : 0.1,
        THICK_ROTATE_PICKER_RADIUS
      ),
      radialSegments,
      tubularSegments,
      arc
    );

    mesh.geometry.dispose();
    mesh.geometry = nextGeometry;
  });

  group.userData.urdfRotatePickersPatched = true;
};

const patchGizmoThickness = (
  controls: any,
  options: { expandRotatePickers?: boolean } = {}
) => {
  const gizmo = controls?.gizmo;
  if (!gizmo || gizmo.userData?.urdfThicknessPatched) return;
  const { expandRotatePickers = true } = options;

  enhanceTranslateThickness(gizmo.gizmo?.translate);
  enhanceRotateThickness(gizmo.gizmo?.rotate);
  if (expandRotatePickers) {
    enhanceRotatePickers(gizmo.picker?.rotate);
  }

  gizmo.userData.urdfThicknessPatched = true;
};

const patchCollisionPreciseGizmo = (controls: any) => {
  const gizmo = controls?.gizmo;
  if (!gizmo || gizmo.userData?.urdfCollisionPrecisePatched) return;

  patchCollisionTranslateVisuals(gizmo.gizmo?.translate);
  patchCollisionTranslatePickers(gizmo.picker?.translate);
  patchCollisionRotateVisuals(gizmo.gizmo?.rotate);
  patchCollisionRotatePickers(gizmo.picker?.rotate);

  gizmo.userData.urdfCollisionPrecisePatched = true;
};

const patchOfficialHoverBehavior = (controls: any) => {
  const gizmo = controls?.gizmo;
  if (!gizmo || gizmo.userData?.urdfOfficialHoverPatched) return;

  const originalUpdateMatrixWorld = gizmo.updateMatrixWorld.bind(gizmo);
  gizmo.updateMatrixWorld = (...args: any[]) => {
    const result = originalUpdateMatrixWorld(...args);
    applyOfficialHoverAppearance(controls);
    return result;
  };
  gizmo.userData.urdfOfficialHoverPatched = true;
  applyOfficialHoverAppearance(controls);
};

const hasHoveredHandle = (controls: any): boolean =>
  typeof controls?.axis === 'string' && controls.axis.length > 0;

const resolveUniversalOwner = (
  translateControls: any,
  rotateControls: any,
  previousOwner: UniversalOwner
): UniversalOwner => {
  if (translateControls.dragging) return 'translate';
  if (rotateControls.dragging) return 'rotate';

  const translateHovered = hasHoveredHandle(translateControls);
  const rotateHovered = hasHoveredHandle(rotateControls);

  if (translateHovered && !rotateHovered) return 'translate';
  if (rotateHovered && !translateHovered) return 'rotate';
  if (translateHovered && rotateHovered) return previousOwner ?? 'translate';

  return null;
};

/**
 * Single shared entry point for stock Three.js/Drei TransformControls behavior.
 * Visualizer and URDF Viewer should both render their gizmos through this file
 * so future official-style tweaks happen in one place.
 */
export const UnifiedTransformControls = forwardRef<any, UnifiedTransformControlsProps>(
  function UnifiedTransformControls(
    {
      mode,
      rotateRef,
      rotateSize,
      rotateEnabled,
      onChange,
      onRotateChange,
      enableUniversalPriority = true,
      gizmoPreset = 'default',
      axesOnly = false,
      enabled = true,
      space = 'local',
      size,
      ...restProps
    },
    ref
  ) {
    const defaultControls = useThree((state) => state.controls);
    const translateRef = useRef<any>(null);
    const localRotateRef = useRef<any>(null);
    const effectiveRotateRef = rotateRef ?? localRotateRef;
    const universalOwnerRef = useRef<UniversalOwner>(null);
    const defaultControlsSuppressedRef = useRef(false);
    const defaultControlsEnabledBeforeSuppressRef = useRef(true);

    useImperativeHandle(ref, () => translateRef.current);

    useEffect(() => {
      if (gizmoPreset === 'collision-precise') {
        patchCollisionPreciseGizmo(translateRef.current);
        patchCollisionPreciseGizmo(effectiveRotateRef.current);
      } else if (gizmoPreset === 'default') {
        patchGizmoThickness(translateRef.current);
        patchGizmoThickness(effectiveRotateRef.current);
      } else if (gizmoPreset === 'official') {
        if (axesOnly) {
          patchOfficialAxesOnlyGizmo(translateRef.current);
          patchOfficialAxesOnlyGizmo(effectiveRotateRef.current);
        }
        patchGizmoThickness(translateRef.current, { expandRotatePickers: false });
        patchGizmoThickness(effectiveRotateRef.current, { expandRotatePickers: false });
      }
      patchOfficialHoverBehavior(translateRef.current);
      patchOfficialHoverBehavior(effectiveRotateRef.current);
    }, [axesOnly, effectiveRotateRef, gizmoPreset, mode]);

    useEffect(() => {
      return () => {
        if (!hasEnabledFlag(defaultControls) || !defaultControlsSuppressedRef.current) return;
        defaultControls.enabled = defaultControlsEnabledBeforeSuppressRef.current;
        defaultControlsSuppressedRef.current = false;
      };
    }, [defaultControls]);

    useEffect(() => {
      if (translateRef.current) {
        translateRef.current.enabled = enabled;
      }

      if (effectiveRotateRef.current) {
        effectiveRotateRef.current.enabled = rotateEnabled ?? enabled;
      }
    }, [enabled, rotateEnabled, effectiveRotateRef]);

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
        defaultControlsEnabledBeforeSuppressRef.current = defaultControls.enabled;
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

      const activeOwner = resolveUniversalOwner(
        translateControls,
        rotateControls,
        universalOwnerRef.current
      );
      universalOwnerRef.current = activeOwner;

      if (activeOwner === 'rotate') {
        if (!translateControls.dragging && translateControls.axis !== null) {
          translateControls.axis = null;
        }

        rotateControls.enabled = rotateEnabled ?? enabled;
        translateControls.enabled = false;
        return;
      }

      if (activeOwner === 'translate') {
        if (!rotateControls.dragging && rotateControls.axis !== null) {
          rotateControls.axis = null;
        }

        translateControls.enabled = enabled;
        rotateControls.enabled = false;
        return;
      }

      translateControls.enabled = enabled;
      rotateControls.enabled = rotateEnabled ?? enabled;
    }, 1000);

    return (
      <>
        <DreiTransformControls
          ref={translateRef}
          mode={mode === 'universal' ? 'translate' : mode}
          enabled={enabled}
          space={space}
          size={mode === 'rotate' ? (rotateSize ?? size) : size}
          onChange={onChange}
          {...restProps}
        />

        {mode === 'universal' && (
          <DreiTransformControls
            ref={effectiveRotateRef}
            mode="rotate"
            enabled={rotateEnabled ?? enabled}
            space={space}
            size={rotateSize ?? size}
            onChange={onRotateChange ?? onChange}
            {...restProps}
          />
        )}
      </>
    );
  }
);
