/**
 * UI related types
 */

export type AppMode = 'detail';
export type Theme = 'light' | 'dark' | 'system';
export type DetailLinkTab = 'visual' | 'collision' | 'physics';

export type InteractionHelperKind =
  | 'center-of-mass'
  | 'inertia'
  | 'origin-axes'
  | 'joint-axis';

export interface InteractionSelection {
  type: 'link' | 'joint' | null;
  id: string | null;
  subType?: 'visual' | 'collision';
  objectIndex?: number;
  helperKind?: InteractionHelperKind;
}
