/**
 * Shared Visualization Helpers
 * Used by both Visualizer.tsx and URDFViewer.tsx
 */

import React, { useMemo } from 'react';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { UrdfJoint, JointType } from '../../types';
import { MathUtils as DataUtils } from '../../services/mathUtils';

// Coordinate Axis Component with adjustable thickness and size
export const ThickerAxes = ({ size = 0.1, onClick }: { size?: number; onClick?: (e: any) => void }) => {
  const thickness = size * 0.04;
  const headSize = size * 0.2;
  const headRadius = thickness * 2.5;

  // Create a clickable sphere at the origin for selection
  const handleClick = (e: any) => {
    e.stopPropagation();
    if (onClick) onClick(e);
  };

  return (
    <group>
      {/* Invisible clickable sphere at origin for easier selection */}
      {onClick && (
        <mesh onClick={handleClick}>
          <sphereGeometry args={[size * 0.3, 16, 16]} />
          <meshBasicMaterial transparent opacity={0} />
        </mesh>
      )}

      {/* X Axis - Red */}
      <mesh rotation={[0, 0, -Math.PI / 2]} position={[size / 2, 0, 0]} onClick={onClick ? handleClick : undefined}>
        <cylinderGeometry args={[thickness, thickness, size, 12]} />
        <meshBasicMaterial color="#ef4444" depthTest={false} />
      </mesh>
      <mesh rotation={[0, 0, -Math.PI / 2]} position={[size, 0, 0]} onClick={onClick ? handleClick : undefined}>
        <coneGeometry args={[headRadius, headSize, 12]} />
        <meshBasicMaterial color="#ef4444" depthTest={false} />
      </mesh>

      {/* Y Axis - Green */}
      <mesh position={[0, size / 2, 0]} onClick={onClick ? handleClick : undefined}>
        <cylinderGeometry args={[thickness, thickness, size, 12]} />
        <meshBasicMaterial color="#22c55e" depthTest={false} />
      </mesh>
      <mesh position={[0, size, 0]} onClick={onClick ? handleClick : undefined}>
        <coneGeometry args={[headRadius, headSize, 12]} />
        <meshBasicMaterial color="#22c55e" depthTest={false} />
      </mesh>

      {/* Z Axis - Blue */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, size / 2]} onClick={onClick ? handleClick : undefined}>
        <cylinderGeometry args={[thickness, thickness, size, 12]} />
        <meshBasicMaterial color="#3b82f6" depthTest={false} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, size]} onClick={onClick ? handleClick : undefined}>
        <coneGeometry args={[headRadius, headSize, 12]} />
        <meshBasicMaterial color="#3b82f6" depthTest={false} />
      </mesh>
    </group>
  );
};

// Joint Axes Visualization
export const JointAxesVisual = React.memo(({ 
  joint, 
  scale = 1.0 
}: { 
  joint: UrdfJoint; 
  scale?: number;
}) => {
  const { type, axis } = joint;
  
  const quaternion = useMemo(() => {
    const axisVec = new THREE.Vector3(axis.x, axis.y, axis.z).normalize();
    return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), axisVec);
  }, [axis.x, axis.y, axis.z]);

  if (type === JointType.FIXED) return null;

  const color = "#d946ef";

  return (
    <group quaternion={quaternion} scale={[scale, scale, scale]}>
      <arrowHelper args={[new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, 0), 0.35, color, 0.08, 0.05]} />
      {(type === JointType.REVOLUTE || type === JointType.CONTINUOUS) && (
        <group>
          <mesh>
            <torusGeometry args={[0.15, 0.005, 8, 32, type === JointType.REVOLUTE ? Math.PI * 1.5 : Math.PI * 2]} />
            <meshBasicMaterial color={color} />
          </mesh>
          <mesh position={[0.15, 0, 0]} rotation={[Math.PI / 2, 0, -Math.PI / 2]}>
            <coneGeometry args={[0.015, 0.04, 8]} />
            <meshBasicMaterial color={color} />
          </mesh>
        </group>
      )}
      {type === JointType.PRISMATIC && (
        <group>
          <arrowHelper args={[new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 0, 0), 0.35, color, 0.08, 0.05]} />
        </group>
      )}
    </group>
  );
});

// Inertia Box Visualization Component
export const InertiaBox = React.memo(({ link }: { link: any }) => {
  const inertial = link.inertial;
  if (!inertial) return null;

  const boxData = DataUtils.computeInertiaBox(inertial);
  if (!boxData) return null;

  const { width, height, depth, rotation } = boxData;
  
  const origin = inertial.origin || { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } };
  const pos = origin.xyz || { x: 0, y: 0, z: 0 };
  
  const originRot = new THREE.Euler(
    origin.rpy?.r || 0,
    origin.rpy?.p || 0,
    origin.rpy?.y || 0,
    'XYZ'
  );
  const originQuat = new THREE.Quaternion().setFromEuler(originRot);
  const finalQuat = originQuat.multiply(rotation);
  const finalEuler = new THREE.Euler().setFromQuaternion(finalQuat);

  return (
    <group position={[pos.x, pos.y, pos.z]} rotation={finalEuler}>
      <mesh>
        <boxGeometry args={[width, height, depth]} />
        <meshPhongMaterial 
          color={0x4a9eff} 
          transparent 
          opacity={0.35}
          depthWrite={false}
          shininess={50}
        />
      </mesh>
    </group>
  );
});

// Center of Mass Indicator for individual links
export const LinkCenterOfMass = React.memo(({ link }: { link: any }) => {
  const inertial = link.inertial;
  if (!inertial || inertial.mass <= 0) return null;
  
  const origin = inertial.origin || { xyz: { x: 0, y: 0, z: 0 } };
  const pos = origin.xyz || { x: 0, y: 0, z: 0 };
  const radius = 0.015;

  return (
    <group position={[pos.x, pos.y, pos.z]}>
      {/* 8 octants forming a sphere */}
      <mesh rotation={[0, 0, 0]}>
        <sphereGeometry args={[radius, 16, 16, 0, Math.PI/2, 0, Math.PI/2]} />
        <meshBasicMaterial color="#000000" />
      </mesh>
      <mesh rotation={[0, Math.PI/2, 0]}>
        <sphereGeometry args={[radius, 16, 16, 0, Math.PI/2, 0, Math.PI/2]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <mesh rotation={[0, Math.PI, 0]}>
        <sphereGeometry args={[radius, 16, 16, 0, Math.PI/2, 0, Math.PI/2]} />
        <meshBasicMaterial color="#000000" />
      </mesh>
      <mesh rotation={[0, -Math.PI/2, 0]}>
        <sphereGeometry args={[radius, 16, 16, 0, Math.PI/2, 0, Math.PI/2]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>

      <mesh rotation={[Math.PI, 0, 0]}>
        <sphereGeometry args={[radius, 16, 16, 0, Math.PI/2, 0, Math.PI/2]} />
        <meshBasicMaterial color="#000000" />
      </mesh>
      <mesh rotation={[Math.PI, Math.PI/2, 0]}>
        <sphereGeometry args={[radius, 16, 16, 0, Math.PI/2, 0, Math.PI/2]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      <mesh rotation={[Math.PI, Math.PI, 0]}>
        <sphereGeometry args={[radius, 16, 16, 0, Math.PI/2, 0, Math.PI/2]} />
        <meshBasicMaterial color="#000000" />
      </mesh>
      <mesh rotation={[Math.PI, -Math.PI/2, 0]}>
        <sphereGeometry args={[radius, 16, 16, 0, Math.PI/2, 0, Math.PI/2]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      
      <Html position={[0.03, 0.03, 0]} style={{ pointerEvents: 'none' }}>
        <div className="text-[8px] text-red-400 bg-black/60 px-1 rounded whitespace-nowrap">
          CoM
        </div>
      </Html>
    </group>
  );
});
