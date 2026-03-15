import type { LucideIcon } from 'lucide-react';

export type RobotCategory = 'Quadruped' | 'Manipulator' | 'Humanoid' | 'Mobile';
export type GalleryCategoryId = 'all' | RobotCategory;
export type GalleryDetailTab = 'overview' | 'specs' | 'resources';
export type ModelSourceType = 'server' | 'url';
export type RecommendedMode = 'skeleton' | 'detail' | 'hardware';

export interface RobotModel {
  id: string;
  name: string;
  author: string;
  description: string;
  overview?: string;
  thumbnail: string;
  category: RobotCategory;
  stars: number;
  downloads: number;
  tags: string[];
  lastUpdated: string;
  urdfPath?: string;
  urdfFile?: string;
  previewVideo?: string;
  sourceType: ModelSourceType;
  highlights?: string[];
  bestFor?: string[];
  assetBundle?: string[];
  recommendedModes: RecommendedMode[];
}

export interface ModelTranslation {
  nameZh: string;
  descriptionZh: string;
  overviewZh?: string;
  tagsZh: string[];
  highlightsZh?: string[];
  bestForZh?: string[];
  assetBundleZh?: string[];
}

export interface GalleryCategory {
  id: GalleryCategoryId;
  icon: LucideIcon;
}
