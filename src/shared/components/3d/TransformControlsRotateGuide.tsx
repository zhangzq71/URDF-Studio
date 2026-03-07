import React, { memo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useEffectiveTheme } from '@/shared/hooks';
import {
  applyFusionRotateStyle,
  getFusionRotatePalette,
  getTransformControlsScale,
  isTransformAxis,
  type TransformAxis,
} from './transformControlsGizmo';

interface TransformControlsRotateGuideProps {
  controlsRef: React.RefObject<any>;
  targetObject: THREE.Object3D | null;
  active: boolean;
}

const HOVER_SWEEP = Math.PI * 0.34;
const GUIDE_RADIUS = 1.12;
const GUIDE_SEGMENTS = 48;
const FRONT_RENDER_ORDER = 10020;
const BACK_RENDER_ORDER = 10015;

const AXIS_BASIS: Record<TransformAxis, {
  normal: THREE.Vector3;
  tangentU: THREE.Vector3;
  tangentV: THREE.Vector3;
}> = {
  X: {
    normal: new THREE.Vector3(1, 0, 0),
    tangentU: new THREE.Vector3(0, 1, 0),
    tangentV: new THREE.Vector3(0, 0, 1),
  },
  Y: {
    normal: new THREE.Vector3(0, 1, 0),
    tangentU: new THREE.Vector3(1, 0, 0),
    tangentV: new THREE.Vector3(0, 0, 1),
  },
  Z: {
    normal: new THREE.Vector3(0, 0, 1),
    tangentU: new THREE.Vector3(1, 0, 0),
    tangentV: new THREE.Vector3(0, 1, 0),
  },
};

const buildArcPoints = (
  axis: TransformAxis,
  startAngle: number,
  endAngle: number,
  segments: number,
  radius: number
) => {
  const basis = AXIS_BASIS[axis];
  const points: THREE.Vector3[] = [];

  for (let index = 0; index <= segments; index += 1) {
    const alpha = index / segments;
    const theta = startAngle + (endAngle - startAngle) * alpha;
    const point = new THREE.Vector3()
      .addScaledVector(basis.tangentU, Math.cos(theta) * radius)
      .addScaledVector(basis.tangentV, Math.sin(theta) * radius);

    points.push(point);
  }

  return points;
};

const updateLineGeometry = (line: THREE.Line | null, points: THREE.Vector3[]) => {
  if (!line) return;

  const geometry = line.geometry as THREE.BufferGeometry;
  geometry.setFromPoints(points);
  geometry.computeBoundingSphere();
  line.computeLineDistances();
};

export const TransformControlsRotateGuide = memo(function TransformControlsRotateGuide({
  controlsRef,
  targetObject,
  active,
}: TransformControlsRotateGuideProps) {
  const defaultCamera = useThree((state) => state.camera);
  const effectiveTheme = useEffectiveTheme();

  const groupRef = useRef<THREE.Group>(null);
  const frontLineRef = useRef<THREE.Line>(null);
  const backLineRef = useRef<THREE.Line>(null);

  const worldPositionRef = useRef(new THREE.Vector3());
  const worldQuaternionRef = useRef(new THREE.Quaternion());
  const inverseQuaternionRef = useRef(new THREE.Quaternion());
  const localEyeRef = useRef(new THREE.Vector3());
  const projectedEyeRef = useRef(new THREE.Vector3());

  useFrame(() => {
    const controls = controlsRef.current;
    const group = groupRef.current;
    const frontLine = frontLineRef.current;
    const backLine = backLineRef.current;

    if (!controls || !group || !frontLine || !backLine || !targetObject || !active) {
      if (group) group.visible = false;
      return;
    }

    applyFusionRotateStyle(controls, effectiveTheme);

    const activeAxis = isTransformAxis(controls.axis) ? controls.axis : null;
    if (!activeAxis) {
      group.visible = false;
      return;
    }

    const dragging = Boolean(controls.dragging);

    targetObject.getWorldPosition(worldPositionRef.current);
    targetObject.getWorldQuaternion(worldQuaternionRef.current);
    inverseQuaternionRef.current.copy(worldQuaternionRef.current).invert();

    group.visible = true;
    group.position.copy(worldPositionRef.current);
    group.quaternion.copy(worldQuaternionRef.current);
    group.scale.setScalar(getTransformControlsScale(controls));

    const controlCamera = (controls.camera as THREE.Camera | undefined) ?? defaultCamera;
    const guideColor = getFusionRotatePalette(effectiveTheme).guide;

    localEyeRef.current
      .copy(controlCamera.position)
      .sub(worldPositionRef.current)
      .applyQuaternion(inverseQuaternionRef.current);

    const basis = AXIS_BASIS[activeAxis];
    projectedEyeRef.current
      .copy(localEyeRef.current)
      .addScaledVector(basis.normal, -localEyeRef.current.dot(basis.normal));

    if (projectedEyeRef.current.lengthSq() < 1e-6) {
      projectedEyeRef.current.copy(basis.tangentU);
    } else {
      projectedEyeRef.current.normalize();
    }

    const phase = Math.atan2(
      projectedEyeRef.current.dot(basis.tangentV),
      projectedEyeRef.current.dot(basis.tangentU)
    );

    if (dragging) {
      updateLineGeometry(
        frontLine,
        buildArcPoints(activeAxis, phase - Math.PI / 2, phase + Math.PI / 2, GUIDE_SEGMENTS, GUIDE_RADIUS)
      );
      updateLineGeometry(
        backLine,
        buildArcPoints(activeAxis, phase + Math.PI / 2, phase + Math.PI * 1.5, GUIDE_SEGMENTS, GUIDE_RADIUS)
      );
    } else {
      updateLineGeometry(
        frontLine,
        buildArcPoints(activeAxis, phase - HOVER_SWEEP / 2, phase + HOVER_SWEEP / 2, GUIDE_SEGMENTS, GUIDE_RADIUS)
      );
      updateLineGeometry(
        backLine,
        buildArcPoints(
          activeAxis,
          phase + Math.PI - HOVER_SWEEP / 2,
          phase + Math.PI + HOVER_SWEEP / 2,
          GUIDE_SEGMENTS,
          GUIDE_RADIUS
        )
      );
    }

    const frontMaterial = frontLine.material as THREE.LineBasicMaterial;
    frontMaterial.color.copy(guideColor);
    frontMaterial.opacity = 0.92;
    frontMaterial.needsUpdate = true;

    const backMaterial = backLine.material as THREE.LineDashedMaterial;
    backMaterial.color.copy(guideColor);
    backMaterial.opacity = dragging ? 0.68 : 0.52;
    backMaterial.needsUpdate = true;
  }, 1000);

  return (
    <group ref={groupRef} visible={false}>
      <line ref={backLineRef} frustumCulled={false} renderOrder={BACK_RENDER_ORDER}>
        <bufferGeometry />
        <lineDashedMaterial
          transparent
          depthTest={false}
          depthWrite={false}
          dashSize={0.14}
          gapSize={0.08}
          toneMapped={false}
        />
      </line>
      <line ref={frontLineRef} frustumCulled={false} renderOrder={FRONT_RENDER_ORDER}>
        <bufferGeometry />
        <lineBasicMaterial
          transparent
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
        />
      </line>
    </group>
  );
});
