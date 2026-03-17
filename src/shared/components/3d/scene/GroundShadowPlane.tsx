import * as THREE from 'three';
import type { Theme } from '@/types';
import { resolveEffectiveTheme } from './themeUtils';

interface GroundShadowPlaneProps {
  theme: Theme;
  groundOffset?: number;
}

const GROUND_SHADOW_STYLE = {
  light: {
    color: '#000000',
    opacity: 0.12,
  },
  dark: {
    color: '#000000',
    opacity: 0.2,
  },
} as const;

const ignoreRaycast = (_raycaster: THREE.Raycaster, _intersects: THREE.Intersection[]) => undefined;

export function GroundShadowPlane({ theme, groundOffset = 0 }: GroundShadowPlaneProps) {
  const effectiveTheme = resolveEffectiveTheme(theme);
  const shadowStyle = GROUND_SHADOW_STYLE[effectiveTheme];

  return (
    <mesh
      name="GroundShadowPlane"
      position={[0, 0, groundOffset - 0.0015]}
      renderOrder={-110}
      frustumCulled={false}
      receiveShadow
      raycast={ignoreRaycast}
    >
      <planeGeometry args={[48, 48]} />
      <shadowMaterial
        color={shadowStyle.color}
        transparent
        opacity={shadowStyle.opacity}
        depthWrite={false}
      />
    </mesh>
  );
}
