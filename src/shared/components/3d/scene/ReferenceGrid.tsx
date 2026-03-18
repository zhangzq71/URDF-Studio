import { useLayoutEffect, useRef } from 'react';
import { Grid } from '@react-three/drei';
import * as THREE from 'three';
import type { Theme } from '@/types';
import { resolveEffectiveTheme } from './themeUtils';

interface ReferenceGridProps {
  theme: Theme;
  groundOffset?: number;
}

const REFERENCE_GRID_RENDER_ORDER = -100;
const REFERENCE_GRID_STYLE = {
  light: {
    cellColor: '#cfd8e2',
    sectionColor: '#bcc7d3',
  },
  dark: {
    cellColor: '#303741',
    sectionColor: '#485362',
  },
} as const;

export function ReferenceGrid({ theme, groundOffset }: ReferenceGridProps) {
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
      renderOrder={REFERENCE_GRID_RENDER_ORDER}
      side={THREE.DoubleSide}
      infiniteGrid
      followCamera
      fadeDistance={100}
      fadeFrom={0.58}
      fadeStrength={0.98}
      sectionSize={1}
      cellSize={0.1}
      sectionThickness={0.78}
      cellThickness={0.14}
      cellColor={gridStyle.cellColor}
      sectionColor={gridStyle.sectionColor}
      rotation={[Math.PI / 2, 0, 0]}
      position={[0, 0, groundPlaneOffset]}
      receiveShadow={false}
    />
  );
}
