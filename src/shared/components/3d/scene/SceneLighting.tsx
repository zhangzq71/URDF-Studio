import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { Theme } from '@/types';
import { LIGHTING_CONFIG } from './constants';
import { resolveEffectiveTheme } from './themeUtils';

interface SceneLightingProps {
  theme?: Theme;
  cameraFollowPrimary?: boolean;
  enableShadows?: boolean;
  shadowMapSize?: number;
}

export function SceneLighting({
  theme = 'system',
  cameraFollowPrimary = false,
  enableShadows = true,
  shadowMapSize,
}: SceneLightingProps) {
  const { scene, gl } = useThree();
  const cameraKeyLightRef = useRef<THREE.DirectionalLight>(null);
  const cameraSoftFrontLightRef = useRef<THREE.DirectionalLight>(null);
  const cameraFillRightLightRef = useRef<THREE.DirectionalLight>(null);
  const cameraFillLeftLightRef = useRef<THREE.DirectionalLight>(null);
  const cameraDirectionRef = useRef(new THREE.Vector3());
  const cameraTargetRef = useRef(new THREE.Vector3());
  const cameraRightRef = useRef(new THREE.Vector3());
  const cameraUpRef = useRef(new THREE.Vector3());
  const lastCameraPositionRef = useRef(new THREE.Vector3(Number.NaN, Number.NaN, Number.NaN));
  const lastCameraQuaternionRef = useRef(
    new THREE.Quaternion(Number.NaN, Number.NaN, Number.NaN, Number.NaN),
  );

  const effectiveTheme = resolveEffectiveTheme(theme);
  const shouldUseShadows = enableShadows && (cameraFollowPrimary || effectiveTheme !== 'light');
  const resolvedShadowMapSize = shadowMapSize ?? (cameraFollowPrimary ? 1024 : 768);
  const staticDirectionalScale = cameraFollowPrimary
    ? (effectiveTheme === 'light' ? 0.4 : 0.42)
    : 1;
  const rimDirectionalScale = cameraFollowPrimary ? 0.08 : staticDirectionalScale;
  const ambientIntensity = cameraFollowPrimary
    ? (effectiveTheme === 'light' ? 0.22 : 0.2)
    : (effectiveTheme === 'light' ? 0.68 : LIGHTING_CONFIG.ambientIntensity);
  const hemisphereIntensity = cameraFollowPrimary
    ? (effectiveTheme === 'light' ? 0.24 : 0.22)
    : (effectiveTheme === 'light' ? 0.46 : LIGHTING_CONFIG.hemisphereIntensity);
  const cameraKeyIntensity = cameraFollowPrimary
    ? (
      effectiveTheme === 'light'
        ? LIGHTING_CONFIG.cameraKeyPriorityIntensityLight
        : LIGHTING_CONFIG.cameraKeyPriorityIntensityDark
    )
    : (
      effectiveTheme === 'light'
        ? LIGHTING_CONFIG.cameraKeyIntensityLight
        : LIGHTING_CONFIG.cameraKeyIntensityDark
    );
  const cameraFillIntensity = cameraFollowPrimary
    ? (
      effectiveTheme === 'light'
        ? LIGHTING_CONFIG.cameraFillIntensityLight
        : LIGHTING_CONFIG.cameraFillIntensityDark
    )
    : 0;
  const cameraSoftFrontIntensity = cameraFollowPrimary
    ? (
      effectiveTheme === 'light'
        ? LIGHTING_CONFIG.cameraSoftFrontIntensityLight
        : LIGHTING_CONFIG.cameraSoftFrontIntensityDark
    )
    : 0;

  useEffect(() => {
    gl.shadowMap.enabled = shouldUseShadows;
    gl.shadowMap.autoUpdate = shouldUseShadows;
    if (shouldUseShadows) {
      gl.shadowMap.type = THREE.PCFSoftShadowMap;
    } else {
      gl.shadowMap.needsUpdate = false;
    }

    scene.receiveShadow = true;
    gl.toneMapping = cameraFollowPrimary ? THREE.NeutralToneMapping : THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = cameraFollowPrimary
      ? (effectiveTheme === 'light' ? 1.04 : 1.02)
      : (effectiveTheme === 'light' ? 1.12 : 1.16);
    gl.outputColorSpace = THREE.SRGBColorSpace;
  }, [cameraFollowPrimary, effectiveTheme, gl, scene, shouldUseShadows]);

  useEffect(() => {
    const keyLight = cameraKeyLightRef.current;
    const softFrontLight = cameraSoftFrontLightRef.current;
    const fillRightLight = cameraFillRightLightRef.current;
    const fillLeftLight = cameraFillLeftLightRef.current;
    if (!keyLight || !softFrontLight || !fillRightLight || !fillLeftLight) return;

    scene.add(keyLight.target);
    scene.add(softFrontLight.target);
    scene.add(fillRightLight.target);
    scene.add(fillLeftLight.target);

    return () => {
      scene.remove(keyLight.target);
      scene.remove(softFrontLight.target);
      scene.remove(fillRightLight.target);
      scene.remove(fillLeftLight.target);
    };
  }, [scene]);

  useFrame(({ camera }) => {
    const keyLight = cameraKeyLightRef.current;
    const softFrontLight = cameraSoftFrontLightRef.current;
    const fillRightLight = cameraFillRightLightRef.current;
    const fillLeftLight = cameraFillLeftLightRef.current;
    if (!keyLight || !softFrontLight || !fillRightLight || !fillLeftLight) return;

    if (
      lastCameraPositionRef.current.equals(camera.position)
      && lastCameraQuaternionRef.current.equals(camera.quaternion)
    ) {
      return;
    }

    lastCameraPositionRef.current.copy(camera.position);
    lastCameraQuaternionRef.current.copy(camera.quaternion);

    camera.getWorldDirection(cameraDirectionRef.current);
    cameraTargetRef.current.copy(camera.position).addScaledVector(cameraDirectionRef.current, 10);

    keyLight.position.copy(camera.position);
    keyLight.target.position.copy(cameraTargetRef.current);
    keyLight.target.updateMatrixWorld();

    softFrontLight.position.copy(camera.position).addScaledVector(
      cameraUpRef.current.set(0, 1, 0).applyQuaternion(camera.quaternion),
      0.9,
    );
    softFrontLight.target.position.copy(cameraTargetRef.current);
    softFrontLight.target.updateMatrixWorld();

    cameraRightRef.current.set(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
    cameraUpRef.current.set(0, 1, 0).applyQuaternion(camera.quaternion).normalize();

    fillRightLight.position.copy(camera.position)
      .addScaledVector(cameraRightRef.current, 3.0)
      .addScaledVector(cameraUpRef.current, 1.6);
    fillRightLight.target.position.copy(cameraTargetRef.current);
    fillRightLight.target.updateMatrixWorld();

    fillLeftLight.position.copy(camera.position)
      .addScaledVector(cameraRightRef.current, -3.0)
      .addScaledVector(cameraUpRef.current, 1.6);
    fillLeftLight.target.position.copy(cameraTargetRef.current);
    fillLeftLight.target.updateMatrixWorld();
  });

  return (
    <>
      <ambientLight intensity={ambientIntensity} color="#ffffff" />

      <hemisphereLight
        args={[
          LIGHTING_CONFIG.hemisphereSky,
          LIGHTING_CONFIG.hemisphereGround,
          hemisphereIntensity,
        ]}
        position={[0, 1, 0]}
      />

      <directionalLight
        name="MainLight"
        position={LIGHTING_CONFIG.mainLightPosition}
        intensity={(effectiveTheme === 'light' ? 0.5 : LIGHTING_CONFIG.mainLightIntensity) * staticDirectionalScale}
        color="#ffffff"
        castShadow={shouldUseShadows}
        shadow-mapSize-width={resolvedShadowMapSize}
        shadow-mapSize-height={resolvedShadowMapSize}
        shadow-camera-far={50}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
        shadow-bias={-0.0001}
        shadow-normalBias={0.02}
      />

      <directionalLight
        name="FillLightLeft"
        position={LIGHTING_CONFIG.leftFillPosition}
        intensity={LIGHTING_CONFIG.leftFillIntensity * staticDirectionalScale}
        color="#ffffff"
        castShadow={false}
      />

      <directionalLight
        name="FillLightLeftSide"
        position={LIGHTING_CONFIG.leftSidePosition}
        intensity={LIGHTING_CONFIG.leftSideIntensity * staticDirectionalScale}
        color="#ffffff"
        castShadow={false}
      />

      <directionalLight
        name="FillLightRight"
        position={LIGHTING_CONFIG.rightFillPosition}
        intensity={LIGHTING_CONFIG.rightFillIntensity * staticDirectionalScale}
        color="#ffffff"
        castShadow={false}
      />

      <directionalLight
        name="RimLight"
        position={LIGHTING_CONFIG.rimLightPosition}
        intensity={LIGHTING_CONFIG.rimLightIntensity * rimDirectionalScale}
        color="#ffffff"
        castShadow={false}
      />

      <directionalLight
        ref={cameraKeyLightRef}
        name="CameraKeyLight"
        position={[0, 0, 0]}
        intensity={cameraKeyIntensity}
        color="#ffffff"
        castShadow={false}
      />
      <directionalLight
        ref={cameraSoftFrontLightRef}
        name="CameraSoftFrontLight"
        position={[0, 0, 0]}
        intensity={cameraSoftFrontIntensity}
        color="#ffffff"
        castShadow={false}
      />
      <directionalLight
        ref={cameraFillRightLightRef}
        name="CameraFillLightRight"
        position={[0, 0, 0]}
        intensity={cameraFillIntensity}
        color="#ffffff"
        castShadow={false}
      />
      <directionalLight
        ref={cameraFillLeftLightRef}
        name="CameraFillLightLeft"
        position={[0, 0, 0]}
        intensity={cameraFillIntensity}
        color="#ffffff"
        castShadow={false}
      />
    </>
  );
}
