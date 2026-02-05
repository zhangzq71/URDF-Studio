import React, { memo, useState } from 'react';
import * as THREE from 'three';
import { GeometryType, UrdfLink } from '@/types';
import { STLRenderer, OBJRenderer, DAERenderer } from '@/shared/components/3d';
import { getCachedMaterial } from '../../utils/materialCache';
import { findAssetByPath } from '@/core/loaders/meshLoader';

interface GeometryRendererProps {
  isCollision: boolean;
  link: UrdfLink;
  mode: 'skeleton' | 'detail' | 'hardware';
  showGeometry: boolean;
  showCollision: boolean;
  assets: Record<string, string>;
  isSelected: boolean;
  selectionSubType?: 'visual' | 'collision';
  onLinkClick: (e: any, subType?: 'visual' | 'collision') => void;
  setVisualRef?: (ref: THREE.Group | null) => void;
  setCollisionRef?: (ref: THREE.Group | null) => void;
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
}: GeometryRendererProps) {
  const data = isCollision ? link.collision : link.visual;

  // Fallback if collision data doesn't exist yet
  if (isCollision && !data) return null;

  if (mode === 'skeleton' && !showGeometry && !isCollision) return null;

  if (mode === 'detail') {
    if (isCollision && !showCollision) return null;
    if (!isCollision && link.visible === false) return null;
  } else {
    if (isCollision && !showCollision) return null;
    if (isCollision) return null;
  }

  const { type, dimensions, color, origin, meshPath } = data;

  // IF TYPE IS NONE, RENDER NOTHING
  if (type === GeometryType.NONE) return null;

  // Create a unique key based on geometry properties
  const geometryKey = `${isCollision ? 'col' : 'vis'}-${type}-${dimensions.x}-${dimensions.y}-${dimensions.z}-${meshPath || 'none'}`;

  const isSkeleton = mode === 'skeleton';

  // Hover State for highlighting before selection
  const [hoveredType, setHoveredType] = useState<'visual' | 'collision' | null>(null);

  // Interaction States
  const isHovered = hoveredType === (isCollision ? 'collision' : 'visual');
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

  const baseColor = isCollision ? colColor : color;

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

  // Use cached material to avoid shader recompilation
  const material = getCachedMaterial({
    key: geometryKey,
    isSkeleton,
    finalColor,
    matOpacity,
    matWireframe,
    isCollision,
    emissiveColor,
    emissiveIntensity,
  });

  // Use array format for position/rotation to avoid creating new objects
  const wrapperProps = {
    onClick: (e: any) => {
      onLinkClick(e, isCollision ? 'collision' : 'visual');
    },
    onPointerOver: (e: any) => {
      e.stopPropagation();
      setHoveredType(isCollision ? 'collision' : 'visual');
    },
    onPointerOut: (e: any) => {
      e.stopPropagation();
      setHoveredType(null);
    },
    position: origin
      ? ([origin.xyz.x, origin.xyz.y, origin.xyz.z] as [number, number, number])
      : undefined,
    rotation: origin
      ? ([origin.rpy.r, origin.rpy.p, origin.rpy.y] as [number, number, number])
      : undefined,
    ref: isCollision ? setCollisionRef : setVisualRef,
  };

  let geometryNode;
  const radialSegments = isSkeleton ? 8 : 32;
  const boxSegments = isSkeleton ? 1 : 2;
  // For cylinder, we need to rotate to align with Z-up
  let meshRotation: [number, number, number] = [0, 0, 0];

  if (type === GeometryType.BOX) {
    // Box dimensions: x=width (along X), y=depth (along Y), z=height (along Z)
    geometryNode = (
      <mesh>
        <boxGeometry args={[dimensions.x, dimensions.y, dimensions.z, boxSegments, boxSegments, boxSegments]} />
        <primitive object={material} attach="material" />
      </mesh>
    );
  } else if (type === GeometryType.CYLINDER) {
    // Three.js CylinderGeometry is Y-axis aligned by default (extends along +Y)
    // Our scene uses Z-up coordinate system
    // To align cylinder along +Z: rotate -90 degrees around X axis
    meshRotation = [-Math.PI / 2, 0, 0];
    // args: [radiusTop, radiusBottom, height, radialSegments]
    // dimensions.x = radius, dimensions.y = height/length
    geometryNode = (
      <mesh rotation={meshRotation}>
        <cylinderGeometry args={[dimensions.x, dimensions.x, dimensions.y, radialSegments, 1]} />
        <primitive object={material} attach="material" />
      </mesh>
    );
  } else if (type === GeometryType.SPHERE) {
    geometryNode = (
      <mesh>
        <sphereGeometry args={[dimensions.x, radialSegments, radialSegments]} />
        <primitive object={material} attach="material" />
      </mesh>
    );
  } else if (type === GeometryType.CAPSULE) {
    // Three.js CapsuleGeometry is Y-axis aligned by default
    // Rotate -90 degrees around X axis to align with Z-up coordinate system
    meshRotation = [-Math.PI / 2, 0, 0];
    // args: [radius, length, capSegments, radialSegments]
    // dimensions.x = radius, dimensions.y = total length (including caps)
    // CapsuleGeometry length is the cylindrical section only, so subtract the sphere caps
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

      if (ext === 'stl') {
        geometryNode = <STLRenderer url={url} material={material} scale={dimensions} />;
      } else if (ext === 'obj') {
        geometryNode = (
          <OBJRenderer url={url} material={material} color={finalColor} assets={assets} scale={dimensions} />
        );
      } else if (ext === 'dae') {
        geometryNode = <DAERenderer url={url} material={material} assets={assets} scale={dimensions} />;
      } else {
        // Fallback for unknown extension
        geometryNode = <mesh geometry={new THREE.BoxGeometry(0.1, 0.1, 0.1)} material={material} />;
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
    <group key={geometryKey} {...wrapperProps}>
      {geometryNode}
    </group>
  );
});
