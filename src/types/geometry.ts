/**
 * Geometry and math-related types
 */

export type Vector3 = { x: number; y: number; z: number };
export type Euler = { r: number; p: number; y: number };

export enum GeometryType {
  BOX = 'box',
  CYLINDER = 'cylinder',
  SPHERE = 'sphere',
  CAPSULE = 'capsule',
  MESH = 'mesh',
  NONE = 'none',
}

export interface UrdfVisualMaterial {
  name?: string;
  color?: string;
  texture?: string;
}

export interface UrdfVisual {
  type: GeometryType;
  dimensions: Vector3; // Used variably based on type (x=radius, y=length for cylinder)
  color: string;
  materialSource?: 'inline' | 'named' | 'gazebo';
  authoredMaterials?: UrdfVisualMaterial[];
  meshPath?: string; // For later detailed design
  origin: { xyz: Vector3; rpy: Euler }; // Offset relative to link frame
  visible?: boolean;
}
