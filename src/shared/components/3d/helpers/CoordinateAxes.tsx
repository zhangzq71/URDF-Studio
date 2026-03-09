/**
 * Coordinate Axes Component
 * Displays XYZ coordinate axes with adjustable thickness and size
 */

import React from 'react';

interface CoordinateAxesProps {
  size?: number;
  position?: [number, number, number];
  depthTest?: boolean;
  renderOrder?: number;
  opacity?: number;
  onClick?: (e: any) => void;
}

export const ThickerAxes = ({
  size = 0.1,
  position = [0, 0, 0],
  depthTest = true,
  renderOrder = 0,
  opacity = 1,
  onClick,
}: CoordinateAxesProps) => {
  const thickness = size * 0.04;
  const headSize = size * 0.2;
  const headRadius = thickness * 2.5;
  const transparent = opacity < 1;
  const ignoreRaycast = (_raycaster: any, _intersects: any[]) => undefined;

  // Create a clickable sphere at the origin for selection
  const handleClick = (e: any) => {
    e.stopPropagation();
    if (onClick) onClick(e);
  };

  return (
    <group position={position}>
      {/* Invisible clickable sphere at origin for easier selection */}
      {onClick && (
        <mesh onClick={handleClick}>
          <sphereGeometry args={[size * 0.3, 16, 16]} />
          <meshBasicMaterial transparent opacity={0} />
        </mesh>
      )}

      {/* X Axis - Red */}
      <mesh
        rotation={[0, 0, -Math.PI / 2]}
        position={[size / 2, 0, 0]}
        onClick={onClick ? handleClick : undefined}
        renderOrder={renderOrder}
        raycast={onClick ? undefined : ignoreRaycast}
      >
        <cylinderGeometry args={[thickness, thickness, size, 12]} />
        <meshBasicMaterial color="#ef4444" depthTest={depthTest} depthWrite={depthTest} transparent={transparent} opacity={opacity} />
      </mesh>
      <mesh
        rotation={[0, 0, -Math.PI / 2]}
        position={[size, 0, 0]}
        onClick={onClick ? handleClick : undefined}
        renderOrder={renderOrder}
        raycast={onClick ? undefined : ignoreRaycast}
      >
        <coneGeometry args={[headRadius, headSize, 12]} />
        <meshBasicMaterial color="#ef4444" depthTest={depthTest} depthWrite={depthTest} transparent={transparent} opacity={opacity} />
      </mesh>

      {/* Y Axis - Green */}
      <mesh
        position={[0, size / 2, 0]}
        onClick={onClick ? handleClick : undefined}
        renderOrder={renderOrder}
        raycast={onClick ? undefined : ignoreRaycast}
      >
        <cylinderGeometry args={[thickness, thickness, size, 12]} />
        <meshBasicMaterial color="#22c55e" depthTest={depthTest} depthWrite={depthTest} transparent={transparent} opacity={opacity} />
      </mesh>
      <mesh
        position={[0, size, 0]}
        onClick={onClick ? handleClick : undefined}
        renderOrder={renderOrder}
        raycast={onClick ? undefined : ignoreRaycast}
      >
        <coneGeometry args={[headRadius, headSize, 12]} />
        <meshBasicMaterial color="#22c55e" depthTest={depthTest} depthWrite={depthTest} transparent={transparent} opacity={opacity} />
      </mesh>

      {/* Z Axis - Blue */}
      <mesh
        rotation={[Math.PI / 2, 0, 0]}
        position={[0, 0, size / 2]}
        onClick={onClick ? handleClick : undefined}
        renderOrder={renderOrder}
        raycast={onClick ? undefined : ignoreRaycast}
      >
        <cylinderGeometry args={[thickness, thickness, size, 12]} />
        <meshBasicMaterial color="#3b82f6" depthTest={depthTest} depthWrite={depthTest} transparent={transparent} opacity={opacity} />
      </mesh>
      <mesh
        rotation={[Math.PI / 2, 0, 0]}
        position={[0, 0, size]}
        onClick={onClick ? handleClick : undefined}
        renderOrder={renderOrder}
        raycast={onClick ? undefined : ignoreRaycast}
      >
        <coneGeometry args={[headRadius, headSize, 12]} />
        <meshBasicMaterial color="#3b82f6" depthTest={depthTest} depthWrite={depthTest} transparent={transparent} opacity={opacity} />
      </mesh>
    </group>
  );
};

interface WorldOriginAxesProps {
  size?: number;
  lift?: number;
  opacity?: number;
  renderOrder?: number;
}

export const WorldOriginAxes = ({
  size = 0.08,
  lift = 0.001,
  opacity = 1,
  renderOrder = 10,
}: WorldOriginAxesProps) => (
  <ThickerAxes
    size={size}
    position={[0, 0, lift]}
    depthTest
    renderOrder={renderOrder}
    opacity={opacity}
  />
);

// Alias for backwards compatibility
export const CoordinateAxes = ThickerAxes;
