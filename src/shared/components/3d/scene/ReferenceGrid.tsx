import { useLayoutEffect, useRef } from 'react';
import { Grid } from '@react-three/drei';
import * as THREE from 'three';
import type { Theme } from '@/types';
import { resolveEffectiveTheme } from './themeUtils';

interface ReferenceGridProps {
  theme: Theme;
  groundOffset?: number;
  centerX?: number;
  centerY?: number;
  size?: number;
  fadeDistance?: number;
  fadeFrom?: number;
}

const REFERENCE_GRID_RENDER_ORDER = -100;
const REFERENCE_GRID_STYLE = {
  light: {
    cellColor: '#aeb8c6',
    sectionColor: '#8693a6',
  },
  dark: {
    cellColor: '#566172',
    sectionColor: '#748092',
  },
} as const;

export function ReferenceGrid({
  theme,
  groundOffset,
  centerX = 0,
  centerY = 0,
  size = 20,
  fadeDistance = 20 * 100,
  fadeFrom = 1,
}: ReferenceGridProps) {
  const gridRef = useRef<THREE.Mesh>(null);
  const groundPlaneOffset = groundOffset ?? 0;
  const effectiveTheme = resolveEffectiveTheme(theme);
  const gridStyle = REFERENCE_GRID_STYLE[effectiveTheme];

  useLayoutEffect(() => {
    if (!gridRef.current) return;

    const gridMaterial = gridRef.current.material as THREE.Material | undefined;
    if (!gridMaterial) return;

    gridMaterial.depthWrite = false;
    gridMaterial.polygonOffset = true;
    gridMaterial.polygonOffsetFactor = 1;
    gridMaterial.polygonOffsetUnits = 1;
    gridMaterial.needsUpdate = true;
  }, []);

  return (
    <Grid
      ref={gridRef}
      name="ReferenceGrid"
      userData={{ isHelper: true, excludeFromSceneBounds: true }}
      renderOrder={REFERENCE_GRID_RENDER_ORDER}
      args={[size, size]}
      side={THREE.DoubleSide}
      fadeDistance={fadeDistance}
      fadeFrom={fadeFrom}
      fadeStrength={0.86}
      sectionSize={1}
      cellSize={0.1}
      sectionThickness={0.96}
      cellThickness={0.18}
      cellColor={gridStyle.cellColor}
      sectionColor={gridStyle.sectionColor}
      rotation={[Math.PI / 2, 0, 0]}
      position={[centerX, centerY, groundPlaneOffset]}
      receiveShadow={false}
    />
  );
}
