import * as THREE from 'three';

import { MathUtils as SharedMathUtils } from '@/shared/utils';
import type { UrdfLink } from '@/types';

import {
  createCoMVisual,
  createInertiaBox,
  createJointAxisViz,
  createOriginAxes,
} from './visualizationFactories';

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

const scratchLinkBox = new THREE.Box3();
const scratchLinkSize = new THREE.Vector3();
const scratchEuler = new THREE.Euler();
const scratchQuaternion = new THREE.Quaternion();

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
      vizGroup.userData = { isGizmo: true };
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
