import * as THREE from 'three';
import type { Theme } from '@/types';
import { resolveEffectiveTheme } from './themeUtils';

interface GroundShadowPlaneProps {
  theme: Theme;
  groundOffset?: number;
  centerX?: number;
  centerY?: number;
  size?: number;
}

const GROUND_SHADOW_STYLE = {
  light: {
    color: '#000000',
    opacity: 0.08,
  },
  dark: {
    color: '#000000',
    opacity: 0.2,
  },
} as const;

const ignoreRaycast = (_raycaster: THREE.Raycaster, _intersects: THREE.Intersection[]) => undefined;

export function GroundShadowPlane({
  theme,
  groundOffset = 0,
  centerX = 0,
  centerY = 0,
  size = 20,
}: GroundShadowPlaneProps) {
  const effectiveTheme = resolveEffectiveTheme(theme);
  const shadowStyle = GROUND_SHADOW_STYLE[effectiveTheme];

  return (
    <mesh
      name="GroundShadowPlane"
      userData={{ isHelper: true, excludeFromSceneBounds: true }}
      position={[centerX, centerY, groundOffset - 0.0015]}
      renderOrder={-110}
      frustumCulled={false}
      receiveShadow
      raycast={ignoreRaycast}
    >
      <planeGeometry args={[size, size]} />
      <shadowMaterial
        color={shadowStyle.color}
        transparent
        opacity={shadowStyle.opacity}
        depthWrite={false}
      />
    </mesh>
  );
}
