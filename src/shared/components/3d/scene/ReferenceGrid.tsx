import { useLayoutEffect, useRef } from 'react';
import { Grid } from '@react-three/drei';
import * as THREE from 'three';
import { useUIStore } from '@/store';
import type { Theme } from '@/types';
import { resolveEffectiveTheme } from './themeUtils';

interface ReferenceGridProps {
  theme: Theme;
  groundOffset?: number;
}

const REFERENCE_GRID_RENDER_ORDER = -100;
const REFERENCE_GRID_STYLE = {
  light: {
    cellColor: '#e5e7eb',
    sectionColor: '#cbd5e1',
  },
  dark: {
    cellColor: '#3d3d3d',
    sectionColor: '#5a5a5a',
  },
} as const;

export function ReferenceGrid({ theme, groundOffset }: ReferenceGridProps) {
  const gridRef = useRef<THREE.Mesh>(null);
  const storedGroundPlaneOffset = useUIStore((state) => state.groundPlaneOffset);
  const groundPlaneOffset = groundOffset ?? storedGroundPlaneOffset;
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
      renderOrder={REFERENCE_GRID_RENDER_ORDER}
      side={THREE.DoubleSide}
      infiniteGrid
      followCamera
      fadeDistance={100}
      fadeFrom={0.35}
      fadeStrength={1.35}
      sectionSize={1}
      cellSize={0.1}
      sectionThickness={1.15}
      cellThickness={0.3}
      cellColor={gridStyle.cellColor}
      sectionColor={gridStyle.sectionColor}
      rotation={[Math.PI / 2, 0, 0]}
      position={[0, 0, groundPlaneOffset]}
      receiveShadow={false}
    />
  );
}
