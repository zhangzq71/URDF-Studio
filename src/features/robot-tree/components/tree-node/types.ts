import type { RobotState } from '@/types';

export interface TreeNodeEditingTarget {
  type: 'link' | 'joint';
  id: string;
  draft: string;
}

export type TreeNodeContextMenuTarget =
  | { type: 'link'; id: string; name: string }
  | { type: 'joint'; id: string; name: string }
  | { type: 'geometry'; linkId: string; subType: 'visual' | 'collision'; objectIndex: number };

export interface TreeNodeContextMenuState {
  x: number;
  y: number;
  target: TreeNodeContextMenuTarget;
}

export interface VisibleCollisionBody {
  body: NonNullable<RobotState['links'][string]['collisionBodies']>[number];
  bodyIndex: number;
  objectIndex: number;
}
