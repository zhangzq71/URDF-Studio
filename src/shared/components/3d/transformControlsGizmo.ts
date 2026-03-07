import * as THREE from 'three';

export type TransformAxis = 'X' | 'Y' | 'Z';
export type TransformGizmoTheme = 'light' | 'dark';

type TransformModeKey = 'translate' | 'rotate' | 'scale';

type TransformGizmoRoot = THREE.Object3D & {
  gizmo?: Partial<Record<TransformModeKey, THREE.Object3D>>;
};

type TransformControlsLike = {
  camera?: THREE.Camera;
  size?: number;
  worldPosition?: THREE.Vector3;
  children?: THREE.Object3D[];
};

const DEFAULT_AXIS_COLORS: Record<TransformAxis, THREE.Color> = {
  X: new THREE.Color(0xff5555),
  Y: new THREE.Color(0x55dd88),
  Z: new THREE.Color(0x5599ff),
};

const FUSION_SMALL_ARC_SWEEP = Math.PI * 0.34;
const FUSION_SMALL_ARC_ANCHOR: Record<TransformAxis, number> = {
  X: Math.PI * 0.08,
  Y: Math.PI * 0.74,
  Z: Math.PI * 1.38,
};
const FUSION_ARC_RENDER_ORDER = 10005;
const FUSION_HANDLE_RENDER_ORDER = 10020;
const FUSION_ROTATE_STYLE_VERSION = 2;

const AXIS_BASIS: Record<TransformAxis, {
  tangentU: THREE.Vector3;
  tangentV: THREE.Vector3;
}> = {
  X: {
    tangentU: new THREE.Vector3(0, 1, 0),
    tangentV: new THREE.Vector3(0, 0, 1),
  },
  Y: {
    tangentU: new THREE.Vector3(1, 0, 0),
    tangentV: new THREE.Vector3(0, 0, 1),
  },
  Z: {
    tangentU: new THREE.Vector3(1, 0, 0),
    tangentV: new THREE.Vector3(0, 1, 0),
  },
};

export const isTransformAxis = (axis: unknown): axis is TransformAxis =>
  axis === 'X' || axis === 'Y' || axis === 'Z';

export const getTransformGizmoRoot = (controls: unknown) => {
  const root = (controls as TransformControlsLike | null)?.children?.[0] as TransformGizmoRoot | undefined;
  return root ?? null;
};

export const getTransformAxisColor = (controls: unknown, axis: TransformAxis) => {
  const rotateGizmo = getTransformGizmoRoot(controls)?.gizmo?.rotate;
  let resolvedColor: THREE.Color | null = null;

  rotateGizmo?.traverse((child) => {
    if (resolvedColor || child.name !== axis) return;

    const material = (child as THREE.Object3D & { material?: THREE.Material | THREE.Material[] }).material;
    const firstMaterial = Array.isArray(material) ? material[0] : material;
    if (firstMaterial && 'color' in firstMaterial && firstMaterial.color instanceof THREE.Color) {
      resolvedColor = firstMaterial.color.clone();
    }
  });

  return resolvedColor ?? DEFAULT_AXIS_COLORS[axis].clone();
};

export const getFusionRotatePalette = (theme: TransformGizmoTheme) => ({
  arc: new THREE.Color(theme === 'light' ? 0x202124 : 0xe5e7eb),
  handle: new THREE.Color(theme === 'light' ? 0x202124 : 0xf3f4f6),
  guide: new THREE.Color(theme === 'light' ? 0x7da6bf : 0x9fc3da),
});

const setMaterialColor = (
  material: THREE.Material | THREE.Material[] | undefined,
  color: THREE.Color,
  opacity = 1
) => {
  if (!material) return;

  const materials = Array.isArray(material) ? material : [material];
  for (const currentMaterial of materials) {
    if (!currentMaterial) continue;
    currentMaterial.transparent = true;
    currentMaterial.depthTest = false;
    currentMaterial.depthWrite = false;
    currentMaterial.toneMapped = false;
    currentMaterial.opacity = opacity;
    if ('color' in currentMaterial && currentMaterial.color instanceof THREE.Color) {
      currentMaterial.color.copy(color);
    }
    currentMaterial.needsUpdate = true;
  }
};

const createSmallArcGeometry = (
  axis: TransformAxis,
  startAngle: number,
  endAngle: number,
  radius = 1,
  segments = 48
) => {
  const basis = AXIS_BASIS[axis];
  const points: THREE.Vector3[] = [];

  for (let index = 0; index <= segments; index += 1) {
    const alpha = index / segments;
    const theta = startAngle + (endAngle - startAngle) * alpha;
    points.push(
      new THREE.Vector3()
        .addScaledVector(basis.tangentU, Math.cos(theta) * radius)
        .addScaledVector(basis.tangentV, Math.sin(theta) * radius)
    );
  }

  return new THREE.BufferGeometry().setFromPoints(points);
};

export const applyFusionRotateStyle = (
  controls: unknown,
  theme: TransformGizmoTheme
) => {
  const root = getTransformGizmoRoot(controls);
  const rotateGizmo = root?.gizmo?.rotate;
  if (!root || !rotateGizmo) return;

  const appliedTheme = root.userData.fusionRotateTheme as TransformGizmoTheme | undefined;
  const appliedVersion = root.userData.fusionRotateStyleVersion as number | undefined;
  if (appliedTheme === theme && appliedVersion === FUSION_ROTATE_STYLE_VERSION) return;

  const palette = getFusionRotatePalette(theme);

  rotateGizmo.traverse((child) => {
    child.frustumCulled = false;

    if (child.name === 'E' || child.name === 'XYZE') {
      child.visible = false;
      return;
    }

    if (!isTransformAxis(child.name)) return;

    if (child.userData?.urdfRotateArcMesh) {
      child.visible = false;
      return;
    }

    if (child instanceof THREE.Line) {
      const startAngle = FUSION_SMALL_ARC_ANCHOR[child.name] - FUSION_SMALL_ARC_SWEEP / 2;
      const endAngle = FUSION_SMALL_ARC_ANCHOR[child.name] + FUSION_SMALL_ARC_SWEEP / 2;

      const nextGeometry = createSmallArcGeometry(child.name, startAngle, endAngle);
      const previousGeometry = child.geometry as THREE.BufferGeometry | undefined;
      child.geometry = nextGeometry;
      previousGeometry?.dispose?.();
      child.renderOrder = FUSION_ARC_RENDER_ORDER;
      child.visible = true;
      setMaterialColor(child.material, palette.arc, 1);
      return;
    }

    const objectWithMaterial = child as THREE.Object3D & {
      material?: THREE.Material | THREE.Material[];
      isMesh?: boolean;
    };

    if (child.userData?.urdfRotateKnobOutline) {
      setMaterialColor(objectWithMaterial.material, palette.handle, 0);
      return;
    }

    if (objectWithMaterial.isMesh) {
      child.renderOrder = FUSION_HANDLE_RENDER_ORDER;
      child.visible = true;
      setMaterialColor(objectWithMaterial.material, palette.handle, 1);
    }
  });

  root.userData.fusionRotateTheme = theme;
  root.userData.fusionRotateStyleVersion = FUSION_ROTATE_STYLE_VERSION;
};

export const getTransformControlsScale = (controls: unknown) => {
  const currentControls = controls as TransformControlsLike | null;
  const camera = currentControls?.camera;
  const worldPosition = currentControls?.worldPosition;
  const size = currentControls?.size ?? 1;

  if (!camera || !worldPosition) return 1;

  if ((camera as THREE.OrthographicCamera).isOrthographicCamera) {
    const orthographicCamera = camera as THREE.OrthographicCamera;
    return ((orthographicCamera.top - orthographicCamera.bottom) / orthographicCamera.zoom) * size / 7;
  }

  if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
    const perspectiveCamera = camera as THREE.PerspectiveCamera;
    const factor = worldPosition.distanceTo(perspectiveCamera.position) * Math.min(
      (1.9 * Math.tan((Math.PI * perspectiveCamera.fov) / 360)) / perspectiveCamera.zoom,
      7
    );

    return (factor * size) / 7;
  }

  return size;
};
