import * as THREE from 'three';

import { MathUtils as SharedMathUtils } from '@/shared/utils';
import type { UrdfLink } from '@/types';

import {
  createCoMVisual,
  createInertiaBox,
  createJointAxisViz,
  createOriginAxes,
} from './visualizationFactories.ts';

interface SyncOriginAxesVisualizationOptions {
  links: THREE.Object3D[];
  showOrigins: boolean;
  showOriginsOverlay: boolean;
  originSize: number;
}

interface SyncJointAxesVisualizationOptions {
  joints: THREE.Object3D[];
  showJointAxes: boolean;
  showJointAxesOverlay: boolean;
  jointAxisSize: number;
}

interface SyncInertiaVisualizationOptions {
  links: THREE.Object3D[];
  robotLinks?: Record<string, UrdfLink>;
  showInertia: boolean;
  showInertiaOverlay: boolean;
  showCenterOfMass: boolean;
  showCoMOverlay: boolean;
  centerOfMassSize: number;
  pooledLinkBox?: THREE.Box3;
  pooledLinkSize?: THREE.Vector3;
}

interface SyncLinkHelperInteractionStateOptions {
  links: THREE.Object3D[];
  hoveredLinkId?: string | null;
  selectedLinkId?: string | null;
}

interface SyncJointHelperInteractionStateOptions {
  joints: THREE.Object3D[];
  hoveredJointId?: string | null;
  selectedJointId?: string | null;
}

const scratchLinkBox = new THREE.Box3();
const scratchLinkSize = new THREE.Vector3();
const scratchEuler = new THREE.Euler();
const scratchQuaternion = new THREE.Quaternion();
const scratchHelperObjects = new Set<THREE.Object3D>();

type HelperInteractionState = 'idle' | 'selected' | 'hovered';

function updateVisible(object: THREE.Object3D, visible: boolean): boolean {
  if (object.visible === visible) return false;
  object.visible = visible;
  return true;
}

function updateScale(object: THREE.Object3D, scale: number): boolean {
  if (
    object.scale.x === scale
    && object.scale.y === scale
    && object.scale.z === scale
  ) {
    return false;
  }

  object.scale.set(scale, scale, scale);
  return true;
}

function updatePosition(object: THREE.Object3D, x: number, y: number, z: number): boolean {
  if (object.position.x === x && object.position.y === y && object.position.z === z) {
    return false;
  }

  object.position.set(x, y, z);
  return true;
}

function updateQuaternion(object: THREE.Object3D, quaternion: THREE.Quaternion): boolean {
  if (
    object.quaternion.x === quaternion.x
    && object.quaternion.y === quaternion.y
    && object.quaternion.z === quaternion.z
    && object.quaternion.w === quaternion.w
  ) {
    return false;
  }

  object.quaternion.copy(quaternion);
  return true;
}

function updateMaterialState(
  material: THREE.Material & {
    opacity?: number;
    transparent?: boolean;
    depthTest?: boolean;
    depthWrite?: boolean;
    needsUpdate?: boolean;
  },
  nextState: {
    opacity?: number;
    transparent?: boolean;
    depthTest?: boolean;
    depthWrite?: boolean;
  },
): boolean {
  let changed = false;

  if (nextState.opacity !== undefined && material.opacity !== nextState.opacity) {
    material.opacity = nextState.opacity;
    changed = true;
  }

  if (nextState.transparent !== undefined && material.transparent !== nextState.transparent) {
    material.transparent = nextState.transparent;
    changed = true;
  }

  if (nextState.depthTest !== undefined && material.depthTest !== nextState.depthTest) {
    material.depthTest = nextState.depthTest;
    changed = true;
  }

  if (nextState.depthWrite !== undefined && material.depthWrite !== nextState.depthWrite) {
    material.depthWrite = nextState.depthWrite;
    changed = true;
  }

  if (changed) {
    material.needsUpdate = true;
  }

  return changed;
}

function updateRenderOrder(object: THREE.Object3D & { renderOrder?: number }, renderOrder: number): boolean {
  if (object.renderOrder === renderOrder) return false;
  object.renderOrder = renderOrder;
  return true;
}

function resolveHelperInteractionState(isHovered: boolean, isSelected: boolean): HelperInteractionState {
  if (isHovered) return 'hovered';
  if (isSelected) return 'selected';
  return 'idle';
}

function updateInteractionScale(object: THREE.Object3D, multiplier: number): boolean {
  const previousMultiplier = typeof object.userData.__interactionScaleMultiplier === 'number'
    ? object.userData.__interactionScaleMultiplier
    : 1;
  const baseScaleX = object.scale.x / previousMultiplier;
  const baseScaleY = object.scale.y / previousMultiplier;
  const baseScaleZ = object.scale.z / previousMultiplier;
  const nextScaleX = baseScaleX * multiplier;
  const nextScaleY = baseScaleY * multiplier;
  const nextScaleZ = baseScaleZ * multiplier;

  if (
    object.scale.x === nextScaleX
    && object.scale.y === nextScaleY
    && object.scale.z === nextScaleZ
  ) {
    object.userData.__interactionScaleMultiplier = multiplier;
    return false;
  }

  object.scale.set(nextScaleX, nextScaleY, nextScaleZ);
  object.userData.__interactionScaleMultiplier = multiplier;
  return true;
}

function updateInteractionRenderOrder(
  object: THREE.Object3D & { renderOrder?: number },
  offset: number,
): boolean {
  const previousOffset = typeof object.userData.__interactionRenderOrderOffset === 'number'
    ? object.userData.__interactionRenderOrderOffset
    : 0;
  const baseRenderOrder = object.renderOrder - previousOffset;
  const nextRenderOrder = baseRenderOrder + offset;

  if (object.renderOrder === nextRenderOrder) {
    object.userData.__interactionRenderOrderOffset = offset;
    return false;
  }

  object.renderOrder = nextRenderOrder;
  object.userData.__interactionRenderOrderOffset = offset;
  return true;
}

function updateInteractionOpacity(
  material: THREE.Material & {
    opacity?: number;
    transparent?: boolean;
    needsUpdate?: boolean;
  },
  multiplier: number,
): boolean {
  if (typeof material.opacity !== 'number') {
    return false;
  }

  const previousMultiplier = typeof material.userData.__interactionOpacityMultiplier === 'number'
    ? material.userData.__interactionOpacityMultiplier
    : 1;
  const baseOpacity = material.opacity / previousMultiplier;
  const nextOpacity = THREE.MathUtils.clamp(baseOpacity * multiplier, 0, 1);
  const nextTransparent = material.transparent || nextOpacity < 1;
  let changed = false;

  if (material.opacity !== nextOpacity) {
    material.opacity = nextOpacity;
    changed = true;
  }

  if (material.transparent !== nextTransparent) {
    material.transparent = nextTransparent;
    changed = true;
  }

  if (changed) {
    material.needsUpdate = true;
  }

  material.userData.__interactionOpacityMultiplier = multiplier;
  return changed;
}

function updateInteractionColor(
  material: THREE.Material & {
    color?: THREE.Color;
    needsUpdate?: boolean;
  },
  activeColorHex?: number,
): boolean {
  if (!material.color?.isColor) {
    return false;
  }

  const previousOverride = typeof material.userData.__interactionColorOverride === 'number'
    ? material.userData.__interactionColorOverride
    : null;
  const baseColorHex = previousOverride !== null
    ? Number(material.userData.__interactionBaseColorHex ?? material.color.getHex())
    : material.color.getHex();
  const nextColorHex = activeColorHex ?? baseColorHex;

  material.userData.__interactionBaseColorHex = baseColorHex;
  material.userData.__interactionColorOverride = activeColorHex ?? null;

  if (material.color.getHex() === nextColorHex) {
    return false;
  }

  material.color.setHex(nextColorHex);
  material.needsUpdate = true;
  return true;
}

function collectUniqueHelperObjects(...objects: Array<THREE.Object3D | null | undefined>): THREE.Object3D[] {
  scratchHelperObjects.clear();

  objects.forEach((object) => {
    if (object) {
      scratchHelperObjects.add(object);
    }
  });

  return Array.from(scratchHelperObjects);
}

function getLinkHelperObjects(link: any): THREE.Object3D[] {
  return collectUniqueHelperObjects(
    link.userData.__originAxes as THREE.Object3D | undefined,
    link.children.find((child: any) => child.name === '__link_axes_helper__'),
    link.userData.__comVisual as THREE.Object3D | undefined,
    link.userData.__inertiaBox as THREE.Object3D | undefined,
  );
}

function getJointHelperObjects(joint: any): THREE.Object3D[] {
  return collectUniqueHelperObjects(
    joint.userData.__jointAxisViz as THREE.Object3D | undefined,
    joint.children.find((child: any) => child.name === '__joint_axis_helper__'),
  );
}

function getHelperScaleMultiplier(state: HelperInteractionState, hoveredScale: number, selectedScale: number): number {
  if (state === 'hovered') return hoveredScale;
  if (state === 'selected') return selectedScale;
  return 1;
}

function getHelperRenderOrderOffset(state: HelperInteractionState): number {
  if (state === 'hovered') return 40;
  if (state === 'selected') return 20;
  return 0;
}

function getHelperOpacityMultiplier(state: HelperInteractionState, hoveredOpacity: number, selectedOpacity: number): number {
  if (state === 'hovered') return hoveredOpacity;
  if (state === 'selected') return selectedOpacity;
  return 1;
}

export function syncOriginAxesVisualizationForLinks({
  links,
  showOrigins,
  showOriginsOverlay,
  originSize,
}: SyncOriginAxesVisualizationOptions): boolean {
  let changed = false;

  links.forEach((link: any) => {
    if (!link.isURDFLink) return;

    let originAxes = link.userData.__originAxes as THREE.Group | undefined;
    if (originAxes && originAxes.parent !== link) {
      originAxes = undefined;
      link.userData.__originAxes = undefined;
    }

    if (!originAxes && showOrigins) {
      originAxes = createOriginAxes(originSize);
      link.add(originAxes);
      originAxes.userData.size = originSize;
      link.userData.__originAxes = originAxes;
      changed = true;
    }

    if (!originAxes) return;

    changed = updateVisible(originAxes, showOrigins) || changed;
    if (!showOrigins) return;

    changed = updateScale(originAxes, 1) || changed;

    const previousSize = originAxes.userData.size;
    if (typeof previousSize !== 'number' || Math.abs(previousSize - originSize) > 0.001) {
      while (originAxes.children.length > 0) {
        const child = originAxes.children[0];
        originAxes.remove(child);
        if ((child as any).geometry) (child as any).geometry.dispose();
        if ((child as any).material) (child as any).material.dispose();
      }

      const replacementAxes = createOriginAxes(originSize);
      while (replacementAxes.children.length > 0) {
        originAxes.add(replacementAxes.children[0]);
      }
      originAxes.userData.size = originSize;
      changed = true;
    }

    originAxes.traverse((child: any) => {
      if (child.material) {
        changed = updateMaterialState(child.material, {
          depthTest: !showOriginsOverlay,
          depthWrite: !showOriginsOverlay,
          transparent: showOriginsOverlay,
        }) || changed;
      }

      if (child.isMesh) {
        changed = updateRenderOrder(child, showOriginsOverlay ? 10001 : 0) || changed;
      }
    });
  });

  return changed;
}

export function syncJointAxesVisualizationForJoints({
  joints,
  showJointAxes,
  showJointAxesOverlay,
  jointAxisSize,
}: SyncJointAxesVisualizationOptions): boolean {
  let changed = false;

  joints.forEach((joint: any) => {
    if (!joint.isURDFJoint || joint.jointType === 'fixed') return;

    let jointAxisViz = joint.userData.__jointAxisViz as THREE.Object3D | undefined;
    if (jointAxisViz && jointAxisViz.parent !== joint) {
      jointAxisViz = undefined;
      joint.userData.__jointAxisViz = undefined;
    }

    if (!jointAxisViz && showJointAxes) {
      const axis = joint.axis || new THREE.Vector3(0, 0, 1);
      jointAxisViz = createJointAxisViz(joint.jointType, axis, jointAxisSize);
      joint.add(jointAxisViz);
      jointAxisViz.userData.size = jointAxisSize;
      joint.userData.__jointAxisViz = jointAxisViz;
      changed = true;
    }

    if (!jointAxisViz) return;

    changed = updateVisible(jointAxisViz, showJointAxes) || changed;
    if (!showJointAxes) return;

    const originalScale = jointAxisViz.userData.size;
    if (typeof originalScale !== 'number' || Math.abs(jointAxisSize - originalScale) > 0.01) {
      joint.remove(jointAxisViz);
      jointAxisViz.traverse((child: any) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });

      const axis = joint.axis || new THREE.Vector3(0, 0, 1);
      const replacement = createJointAxisViz(joint.jointType, axis, jointAxisSize);
      joint.add(replacement);
      replacement.userData.size = jointAxisSize;
      joint.userData.__jointAxisViz = replacement;
      jointAxisViz = replacement;
      changed = true;
    }

    jointAxisViz.traverse((child: any) => {
      if (child.material) {
        changed = updateMaterialState(child.material, {
          depthTest: !showJointAxesOverlay,
          depthWrite: !showJointAxesOverlay,
          transparent: showJointAxesOverlay,
        }) || changed;
      }

      if (child.isMesh) {
        changed = updateRenderOrder(child, showJointAxesOverlay ? 10001 : 0) || changed;
      }
    });
  });

  return changed;
}

export function syncInertiaVisualizationForLinks({
  links,
  robotLinks,
  showInertia,
  showInertiaOverlay,
  showCenterOfMass,
  showCoMOverlay,
  centerOfMassSize,
  pooledLinkBox,
  pooledLinkSize,
}: SyncInertiaVisualizationOptions): boolean {
  let changed = false;
  const linkBox = pooledLinkBox ?? scratchLinkBox;
  const linkSize = pooledLinkSize ?? scratchLinkSize;

  links.forEach((link: any) => {
    if (!link.isURDFLink) return;

    const linkData = robotLinks?.[link.name];
    const inertialData = linkData?.inertial;
    if (!inertialData || inertialData.mass <= 0) return;

    let vizGroup = link.userData.__inertiaVisualGroup as THREE.Group | undefined;
    if (vizGroup && vizGroup.parent !== link) {
      vizGroup = undefined;
      link.userData.__inertiaVisualGroup = undefined;
      link.userData.__comVisual = undefined;
      link.userData.__inertiaBox = undefined;
    }

    if (!vizGroup) {
      vizGroup = new THREE.Group();
      vizGroup.name = '__inertia_visual__';
      vizGroup.userData = { isGizmo: true, isSelectableHelper: true };
      link.add(vizGroup);
      link.userData.__inertiaVisualGroup = vizGroup;
      changed = true;
    }

    let comVisual = link.userData.__comVisual as THREE.Object3D | undefined;
    if (comVisual && comVisual.parent !== vizGroup) {
      comVisual = undefined;
      link.userData.__comVisual = undefined;
    }
    if (!comVisual) {
      comVisual = createCoMVisual();
      vizGroup.add(comVisual);
      link.userData.__comVisual = comVisual;
      changed = true;
    }

    const sizeScale = centerOfMassSize / 0.01;
    changed = updateScale(comVisual, sizeScale) || changed;
    changed = updateVisible(comVisual, showCenterOfMass) || changed;

    if (showCenterOfMass) {
      comVisual.traverse((child: any) => {
        if (child.material) {
          changed = updateMaterialState(child.material, {
            opacity: 0.95,
            transparent: true,
            depthTest: !showCoMOverlay,
            depthWrite: !showCoMOverlay,
          }) || changed;
        }

        if (child.isMesh) {
          changed = updateRenderOrder(child, showCoMOverlay ? 10001 : 0) || changed;
        }
      });
    }

    let inertiaBox = link.userData.__inertiaBox as THREE.Object3D | undefined;
    if (inertiaBox && inertiaBox.parent !== vizGroup) {
      inertiaBox = undefined;
      link.userData.__inertiaBox = undefined;
    }

    if (!inertiaBox) {
      let maxLinkSize: number | undefined;
      try {
        const cachedMaxLinkSize = link.userData.__cachedMaxLinkSize;
        if (typeof cachedMaxLinkSize === 'number' && isFinite(cachedMaxLinkSize) && cachedMaxLinkSize > 0) {
          maxLinkSize = cachedMaxLinkSize;
        } else {
          const sizeVector = linkBox.setFromObject(link).getSize(linkSize);
          maxLinkSize = Math.max(sizeVector.x, sizeVector.y, sizeVector.z);
          if (isFinite(maxLinkSize) && maxLinkSize > 0) {
            link.userData.__cachedMaxLinkSize = maxLinkSize;
          }
        }

        if (!isFinite(maxLinkSize) || maxLinkSize <= 0) {
          maxLinkSize = undefined;
        }
      } catch {
        maxLinkSize = undefined;
      }

      const boxData = SharedMathUtils.computeInertiaBox(inertialData, maxLinkSize);
      if (boxData) {
        const { width, height, depth, rotation } = boxData;
        inertiaBox = createInertiaBox(width, height, depth, rotation);
        vizGroup.add(inertiaBox);
        link.userData.__inertiaBox = inertiaBox;
        changed = true;
      }
    }

    if (inertiaBox) {
      changed = updateVisible(inertiaBox, showInertia) || changed;

      if (showInertia) {
        inertiaBox.traverse((child: any) => {
          if (child.material) {
            changed = updateMaterialState(child.material, {
              opacity: child.type === 'Mesh' ? 0.25 : child.type === 'LineSegments' ? 0.6 : undefined,
              transparent: true,
              depthTest: !showInertiaOverlay,
              depthWrite: !showInertiaOverlay,
            }) || changed;
          }

          if (child.isMesh || child.type === 'LineSegments') {
            changed = updateRenderOrder(child, showInertiaOverlay ? 10001 : 0) || changed;
          }
        });
      }
    }

    const origin = inertialData.origin;
    if (origin) {
      const xyz = origin.xyz || { x: 0, y: 0, z: 0 };
      const rpy = origin.rpy || { r: 0, p: 0, y: 0 };

      changed = updatePosition(vizGroup, xyz.x, xyz.y, xyz.z) || changed;
      scratchEuler.set(rpy.r, rpy.p, rpy.y, 'ZYX');
      scratchQuaternion.setFromEuler(scratchEuler);
      changed = updateQuaternion(vizGroup, scratchQuaternion) || changed;
    }

    changed = updateVisible(vizGroup, showInertia || showCenterOfMass) || changed;
  });

  return changed;
}

export function syncLinkHelperInteractionStateForLinks({
  links,
  hoveredLinkId = null,
  selectedLinkId = null,
}: SyncLinkHelperInteractionStateOptions): boolean {
  let changed = false;

  links.forEach((link: any) => {
    if (!link.isURDFLink) return;

    const state = resolveHelperInteractionState(
      hoveredLinkId === link.name,
      selectedLinkId === link.name,
    );
    const helperObjects = getLinkHelperObjects(link);

    helperObjects.forEach((helperObject) => {
      const helperName = helperObject.name;
      const scaleMultiplier = helperName === '__com_visual__'
        ? getHelperScaleMultiplier(state, 1.16, 1.08)
        : helperName === '__inertia_box__'
          ? getHelperScaleMultiplier(state, 1.02, 1.01)
          : getHelperScaleMultiplier(state, 1.14, 1.05);
      const renderOrderOffset = getHelperRenderOrderOffset(state);

      changed = updateInteractionScale(helperObject, scaleMultiplier) || changed;

      helperObject.traverse((child: any) => {
        if (child.isMesh || child.type === 'LineSegments') {
          changed = updateInteractionRenderOrder(child, renderOrderOffset) || changed;
        }

        if (!child.material) {
          return;
        }

        const opacityMultiplier = helperName === '__inertia_box__'
          ? child.type === 'LineSegments'
            ? getHelperOpacityMultiplier(state, 1.45, 1.2)
            : getHelperOpacityMultiplier(state, 1.8, 1.45)
          : helperName === '__com_visual__'
            ? getHelperOpacityMultiplier(state, 1.08, 1.03)
            : getHelperOpacityMultiplier(state, 1, 1);

        changed = updateInteractionOpacity(child.material, opacityMultiplier) || changed;
      });
    });
  });

  return changed;
}

export function syncJointHelperInteractionStateForJoints({
  joints,
  hoveredJointId = null,
  selectedJointId = null,
}: SyncJointHelperInteractionStateOptions): boolean {
  let changed = false;

  joints.forEach((joint: any) => {
    if (!joint.isURDFJoint || joint.jointType === 'fixed') return;

    const state = resolveHelperInteractionState(
      hoveredJointId === joint.name,
      selectedJointId === joint.name,
    );
    const helperObjects = getJointHelperObjects(joint);
    const activeColorHex = state === 'hovered'
      ? 0xfbbf24
      : state === 'selected'
        ? 0xf472b6
        : undefined;

    helperObjects.forEach((helperObject) => {
      changed = updateInteractionScale(
        helperObject,
        getHelperScaleMultiplier(state, 1.16, 1.06),
      ) || changed;

      helperObject.traverse((child: any) => {
        if (child.isMesh || child.type === 'LineSegments') {
          changed = updateInteractionRenderOrder(child, getHelperRenderOrderOffset(state)) || changed;
        }

        if (!child.material) {
          return;
        }

        changed = updateInteractionColor(child.material, activeColorHex) || changed;
      });
    });
  });

  return changed;
}
