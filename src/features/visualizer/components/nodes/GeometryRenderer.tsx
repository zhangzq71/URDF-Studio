import { memo, useCallback, useEffect, useMemo, type ReactNode } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { GeometryType, UrdfLink, UrdfVisual } from '@/types';
import { STLRenderer, OBJRenderer, DAERenderer, GLTFRenderer } from '@/shared/components/3d';
import { useSelectionStore } from '@/store/selectionStore';
import { DEFAULT_VISUAL_COLOR } from '@/core/robot/constants';
import {
  buildMaterialCacheKey,
  getCachedMaterial,
  releaseCachedMaterial,
  retainCachedMaterial,
} from '../../utils/materialCache';
import {
  createVisualizerHoverUserData,
  findNearestVisualizerTargetFromHits,
  type VisualizerHoverTarget,
} from '../../utils/hoverPicking';
import { findAssetByPath } from '@/core/loaders/meshLoader';
import {
  shouldNormalizeColladaGeometry,
  type ColladaRootNormalizationHints,
} from '@/core/loaders/colladaRootNormalization';
import { getSourceFileDirectory } from '@/core/parsers/meshPathUtils';
import { resolveGeometryVisibilityState } from './geometryVisibility';
import { buildVisualizerMeshLoadKey } from '../../utils/visualizerMeshLoading';

interface GeometryRendererProps {
  isCollision: boolean;
  link: UrdfLink;
  mode: 'skeleton' | 'detail' | 'hardware';
  showGeometry: boolean;
  showCollision: boolean;
  assets: Record<string, string>;
  isSelected: boolean;
  selectionSubType?: 'visual' | 'collision';
  onLinkClick: (
    event: ThreeEvent<MouseEvent>,
    target?: VisualizerHoverTarget | null,
  ) => void;
  setVisualRef?: (ref: THREE.Group | null) => void;
  setCollisionRef?: (ref: THREE.Group | null) => void;
  geometryData?: UrdfVisual;
  geometryId?: string;
  objectIndex?: number;
  colladaRootNormalizationHints?: ColladaRootNormalizationHints | null;
  onMeshResolved?: (meshLoadKey: string) => void;
}

/**
 * GeometryRenderer - Renders visual or collision geometry for a link
 * Handles different geometry types: Box, Cylinder, Sphere, and Mesh (STL/OBJ/DAE)
 */
export const GeometryRenderer = memo(function GeometryRenderer({
  isCollision,
  link,
  mode,
  showGeometry,
  showCollision,
  assets,
  isSelected,
  selectionSubType,
  onLinkClick,
  setVisualRef,
  setCollisionRef,
  geometryData,
  geometryId,
  objectIndex,
  colladaRootNormalizationHints,
  onMeshResolved,
}: GeometryRendererProps) {
  const data = geometryData || (isCollision ? link.collision : link.visual);
  const visibilityState = resolveGeometryVisibilityState({
    mode,
    isCollision,
    showGeometry,
    showCollision,
  });

  if (!data) return null;
  if (data?.visible === false) return null;

  if (!visibilityState.shouldRender) return null;

  if (mode === 'detail' && !isCollision && link.visible === false) {
    return null;
  }

  const { type, dimensions, color, origin, meshPath } = data;
  // Keep Visualizer origin handling aligned with URDF/Viewer quaternion conversion.
  const originRotation = origin
    ? new THREE.Euler(origin.rpy.r, origin.rpy.p, origin.rpy.y, 'ZYX')
    : undefined;

  // IF TYPE IS NONE, RENDER NOTHING
  if (type === GeometryType.NONE) return null;

  // Material cache key: includes all visual properties. Dimensions are intentionally excluded
  // because they don't affect material appearance (they're applied to geometry args instead).
  const geometryKey = `${isCollision ? 'col' : 'vis'}-${geometryId || 'primary'}-${type}-${meshPath || 'none'}`;
  // Group key: only changes when geometry TYPE or MESH PATH changes (requiring full remount).
  // Dimension changes are handled in-place by R3F and must NOT change this key, otherwise
  // React unmounts/remounts the group on every +/- press causing a one-frame blank flicker.
  const groupKey = geometryKey;

  const isSkeleton = mode === 'skeleton';
  const geometrySubType = isCollision ? 'collision' : 'visual';
  const meshLoadKey = type === GeometryType.MESH && meshPath
    ? buildVisualizerMeshLoadKey({
        linkId: link.id,
        geometryRole: geometrySubType,
        geometryId: geometryId || 'primary',
        objectIndex: objectIndex ?? 0,
        meshPath,
      })
    : null;
  const handleMeshResolved = useCallback(() => {
    if (!meshLoadKey) {
      return;
    }
    onMeshResolved?.(meshLoadKey);
  }, [meshLoadKey, onMeshResolved]);
  const isHovered = useSelectionStore((state) => {
    const hovered = state.hoveredSelection;
    if (hovered.type !== 'link' || hovered.id !== link.id) return false;
    if (!hovered.subType) return geometrySubType === 'visual';
    if (hovered.subType !== geometrySubType) return false;
    return (hovered.objectIndex ?? 0) === (objectIndex ?? 0);
  });

  // Interaction States
  const isVisualHighlight = !isCollision && isSelected && (selectionSubType === 'visual' || !selectionSubType);
  const isCollisionHighlight = isCollision && isSelected && selectionSubType === 'collision';

  // Collision styling - Purple wireframe default
  const colColor = '#a855f7'; // Purple-500

  // Opacity: Higher if selected or hovered
  const matOpacity = isCollision
    ? isCollisionHighlight || isHovered
      ? 0.6
      : 0.3
    : isSkeleton
    ? 0.2
    : 1.0;

  // Wireframe: Fill if selected or hovered (for collision)
  const matWireframe = isCollision ? !isCollisionHighlight && !isHovered : isSkeleton;

  const baseColor = isCollision ? colColor : (color || DEFAULT_VISUAL_COLOR);

  // Colors
  const selectionColorVisual = '#60a5fa'; // Blue-400
  const selectionColorCollision = '#d946ef'; // Fuchsia-500
  const hoverColorVisual = '#93c5fd'; // Blue-300 (Lighter)
  const hoverColorCollision = '#e879f9'; // Fuchsia-400 (Lighter)

  let finalColor = baseColor;
  if (isVisualHighlight) finalColor = selectionColorVisual;
  else if (isCollisionHighlight) finalColor = selectionColorCollision;
  else if (isHovered) finalColor = isCollision ? hoverColorCollision : hoverColorVisual;

  // Emissive Logic
  let emissiveColor = '#000000';
  let emissiveIntensity = 0;

  if (isVisualHighlight) {
    emissiveColor = '#1e40af';
    emissiveIntensity = 0.5;
  } else if (isCollisionHighlight) {
    emissiveColor = '#86198f';
    emissiveIntensity = 0.5;
  } else if (isHovered) {
    emissiveColor = isCollision ? '#d946ef' : '#3b82f6';
    emissiveIntensity = 0.3;
  }

  const materialOptions = useMemo(() => ({
    isSkeleton,
    finalColor,
    matOpacity,
    matWireframe,
    isCollision,
    emissiveColor,
    emissiveIntensity,
  }), [
    emissiveColor,
    emissiveIntensity,
    finalColor,
    isCollision,
    isSkeleton,
    matOpacity,
    matWireframe,
  ]);
  const materialKey = useMemo(
    () => buildMaterialCacheKey(materialOptions),
    [materialOptions],
  );
  const material = useMemo(
    () => getCachedMaterial(materialOptions),
    [materialOptions],
  );

  useEffect(() => {
    retainCachedMaterial(materialKey);
    return () => {
      releaseCachedMaterial(materialKey);
    };
  }, [materialKey]);

  // Use array format for position/rotation to avoid creating new objects
  const wrapperProps = {
    onClick: visibilityState.interactive
      ? (event: ThreeEvent<MouseEvent>) => {
          const nearestTarget = findNearestVisualizerTargetFromHits(event.intersections);
          onLinkClick(event, nearestTarget);
        }
      : undefined,
    position: origin
      ? ([origin.xyz.x, origin.xyz.y, origin.xyz.z] as [number, number, number])
      : undefined,
    rotation: originRotation,
    ref: isCollision ? setCollisionRef : setVisualRef,
    visible: visibilityState.visible,
    userData: {
      geometryRole: isCollision ? 'collision' : 'visual',
      ...createVisualizerHoverUserData({
        type: 'link',
        id: link.id,
        subType: geometrySubType,
        objectIndex: objectIndex ?? 0,
      }),
    },
  };

  let geometryNode: ReactNode;
  const radialSegments = isSkeleton ? 8 : 32;
  const boxSegments = isSkeleton ? 1 : 2;
  // For cylinder, we need to rotate to align with Z-up
  let meshRotation: [number, number, number] = [0, 0, 0];

  // Three.js best practice (threejs-geometry skill): create geometry at unit size
  // and apply dimensions via mesh.scale. This avoids disposing + recreating
  // BufferGeometry objects on every dimension change, eliminating flicker when
  // the user continuously presses +/- to resize collision bodies.
  if (type === GeometryType.BOX) {
    // Unit box (1×1×1) scaled to target dimensions
    geometryNode = (
      <mesh scale={[dimensions.x, dimensions.y, dimensions.z]}>
        <boxGeometry args={[1, 1, 1, boxSegments, boxSegments, boxSegments]} />
        <primitive object={material} attach="material" />
      </mesh>
    );
  } else if (type === GeometryType.CYLINDER) {
    // Unit cylinder (radius=1, height=1) scaled to target dimensions.
    // Rotated -90° around X to align with Z-up coordinate system.
    meshRotation = [-Math.PI / 2, 0, 0];
    // scale: X/Z = radius, Y = height
    geometryNode = (
      <mesh rotation={meshRotation} scale={[dimensions.x, dimensions.y, dimensions.z || dimensions.x]}>
        <cylinderGeometry args={[1, 1, 1, radialSegments, 1]} />
        <primitive object={material} attach="material" />
      </mesh>
    );
  } else if (type === GeometryType.SPHERE) {
    // Unit sphere (radius=1) scaled per axis so MJCF ellipsoids render correctly.
    const sx = dimensions.x;
    const sy = dimensions.y || sx;
    const sz = dimensions.z || sx;
    geometryNode = (
      <mesh scale={[sx, sy, sz]}>
        <sphereGeometry args={[1, radialSegments, radialSegments]} />
        <primitive object={material} attach="material" />
      </mesh>
    );
  } else if (type === GeometryType.CAPSULE) {
    // Capsule shape depends on the radius-to-length ratio, so the geometry
    // topology changes with each resize — must recreate args. This is expected
    // for capsule but rare compared to box/sphere/cylinder.
    meshRotation = [-Math.PI / 2, 0, 0];
    const cylinderLength = Math.max(0, dimensions.y - 2 * dimensions.x);
    geometryNode = (
      <mesh rotation={meshRotation}>
        <capsuleGeometry args={[dimensions.x, cylinderLength, radialSegments / 2, radialSegments]} />
        <primitive object={material} attach="material" />
      </mesh>
    );
  } else if (type === GeometryType.MESH) {
    let assetUrl = meshPath ? findAssetByPath(meshPath, assets) : undefined;

    if (meshPath && assetUrl) {
      const url = assetUrl;
      const ext = meshPath.split('.').pop()?.toLowerCase();
      const assetBaseDir = getSourceFileDirectory(meshPath);
      const preserveOriginalMaterial = !isCollision
        && !isSkeleton
        && !isVisualHighlight
        && !isCollisionHighlight
        && !isHovered
        && !color;

      if (ext === 'stl') {
        geometryNode = <STLRenderer url={url} material={material} scale={dimensions} onResolved={handleMeshResolved} />;
      } else if (ext === 'obj') {
        geometryNode = (
          <OBJRenderer
            url={url}
            material={material}
            color={finalColor}
            assets={assets}
            assetBaseDir={assetBaseDir}
            scale={dimensions}
            onResolved={handleMeshResolved}
          />
        );
      } else if (ext === 'dae') {
        geometryNode = (
          <DAERenderer
            url={url}
            material={material}
            assets={assets}
            assetBaseDir={assetBaseDir}
            normalizeRoot={shouldNormalizeColladaGeometry(meshPath, origin, colladaRootNormalizationHints)}
            preserveOriginalMaterial={preserveOriginalMaterial}
            scale={dimensions}
            onResolved={handleMeshResolved}
          />
        );
      } else if (ext === 'gltf' || ext === 'glb') {
        geometryNode = (
          <GLTFRenderer
            url={url}
            material={material}
            assets={assets}
            assetBaseDir={assetBaseDir}
            preserveOriginalMaterial={preserveOriginalMaterial}
            scale={dimensions}
            onResolved={handleMeshResolved}
          />
        );
      } else {
        // Fallback for unknown extension
        geometryNode = (
          <mesh>
            <boxGeometry args={[0.1, 0.1, 0.1]} />
            <primitive object={material} attach="material" />
          </mesh>
        );
      }
    } else {
      // Placeholder if no mesh loaded
      geometryNode = (
        <mesh>
          <boxGeometry args={[0.1, 0.1, 0.1]} />
          <meshStandardMaterial color={isCollision ? 'red' : 'gray'} wireframe />
        </mesh>
      );
    }
  }

  return (
    <group key={groupKey} {...wrapperProps}>
      {geometryNode}
    </group>
  );
});
