import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { TransformControls as DreiTransformControls } from '@react-three/drei';
import * as THREE from 'three';

type DreiTransformControlsProps = React.ComponentProps<typeof DreiTransformControls>;
type SharedControlRef = React.MutableRefObject<any | null> | React.RefObject<any | null>;

export type UnifiedTransformMode = 'translate' | 'rotate' | 'scale' | 'universal';
export const VISUALIZER_UNIFIED_GIZMO_SIZE = 0.82;

interface UnifiedTransformControlsProps extends Omit<DreiTransformControlsProps, 'mode'> {
  mode: UnifiedTransformMode;
  rotateRef?: SharedControlRef;
  rotateSize?: number;
  rotateEnabled?: boolean;
  onRotateChange?: DreiTransformControlsProps['onChange'];
  enableUniversalPriority?: boolean;
}

type UniversalOwner = 'translate' | 'rotate' | null;
type ControlsWithEnabled = THREE.EventDispatcher & { enabled: boolean };
const OFFICIAL_ACTIVE_COLOR = new THREE.Color(0xffff00);
const THICK_TRANSLATE_SHAFT_RADIUS = 0.032;
const THICK_TRANSLATE_TIP_RADIUS = 0.085;
const THICK_ROTATE_ARC_RADIUS = 0.017;
const THICK_ROTATE_PICKER_RADIUS = 0.14;

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

const cloneAxisMaterial = (sourceMaterial: any) => {
  const color = new THREE.Color(0xffffff);
  if (sourceMaterial?.color) {
    color.copy(sourceMaterial.color);
  }

  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: typeof sourceMaterial?.opacity === 'number' ? sourceMaterial.opacity : 1,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
};

const matchesHighlightedAxis = (handleName: string, axis: string) =>
  handleName === axis || axis.split('').some((part) => handleName === part);

const applyOfficialHoverAppearance = (controls: any) => {
  const gizmo = controls?.gizmo;
  const mode = gizmo?.mode;
  const handles = [
    ...(gizmo?.picker?.[mode]?.children ?? []),
    ...(gizmo?.gizmo?.[mode]?.children ?? []),
    ...(gizmo?.helper?.[mode]?.children ?? []),
  ];

  for (const handle of handles) {
    const handleName = typeof handle?.name === 'string' ? handle.name : '';

    for (const material of getHandleMaterials(handle)) {
      const baseColor = material?.tempColor;
      const baseOpacity = material?.tempOpacity;
      if (!baseColor || typeof baseOpacity !== 'number') continue;

      material.color.copy(baseColor);
      material.opacity = baseOpacity;

      if (!gizmo.enabled) {
        material.opacity *= 0.5;
        continue;
      }

      if (typeof gizmo.axis === 'string' && matchesHighlightedAxis(handleName, gizmo.axis)) {
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

const patchGizmoThickness = (controls: any) => {
  const gizmo = controls?.gizmo;
  if (!gizmo || gizmo.userData?.urdfThicknessPatched) return;

  enhanceTranslateThickness(gizmo.gizmo?.translate);
  enhanceRotateThickness(gizmo.gizmo?.rotate);
  enhanceRotatePickers(gizmo.picker?.rotate);

  gizmo.userData.urdfThicknessPatched = true;
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
      patchGizmoThickness(translateRef.current);
      patchGizmoThickness(effectiveRotateRef.current);
      patchOfficialHoverBehavior(translateRef.current);
      patchOfficialHoverBehavior(effectiveRotateRef.current);
    }, [effectiveRotateRef, mode]);

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
          size={size}
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
