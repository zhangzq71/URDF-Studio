import type { RobotData } from './robot';

export interface UsdMeshRange {
  offset: number;
  count: number;
  stride: number;
}

export interface UsdMeshDescriptorRanges {
  positions?: UsdMeshRange | null;
  indices?: UsdMeshRange | null;
  normals?: UsdMeshRange | null;
  uvs?: UsdMeshRange | null;
  transform?: UsdMeshRange | null;
}

export interface UsdSceneMeshDescriptor {
  meshId?: string | null;
  sectionName?: string | null;
  resolvedPrimPath?: string | null;
  primType?: string | null;
  axis?: string | null;
  size?: number | null;
  radius?: number | null;
  height?: number | null;
  extentSize?: ArrayLike<number> | null;
  materialId?: string | null;
  geometry?: {
    materialId?: string | null;
  } | null;
  ranges?: UsdMeshDescriptorRanges | null;
}

export interface UsdSceneMaterialRecord {
  materialId?: string | null;
  name?: string | null;
  color?: ArrayLike<number> | null;
  opacity?: number | null;
  mapPath?: string | null;
}

export interface UsdMeshCountsEntry {
  visualMeshCount?: number;
  collisionMeshCount?: number;
  collisionPrimitiveCounts?: Record<string, number | undefined>;
}

export interface UsdJointCatalogEntry {
  linkPath?: string | null;
  childLinkPath?: string | null;
  parentLinkPath?: string | null;
  jointPath?: string | null;
  jointName?: string | null;
  jointType?: string | null;
  jointTypeName?: string | null;
  axisToken?: string | null;
  axisLocal?: ArrayLike<number> | null;
  lowerLimitDeg?: number | null;
  upperLimitDeg?: number | null;
  localPivotInLink?: ArrayLike<number> | null;
  originXyz?: ArrayLike<number> | null;
  originQuatWxyz?: ArrayLike<number> | null;
}

export interface UsdLinkDynamicsEntry {
  linkPath?: string | null;
  mass?: number | null;
  centerOfMassLocal?: ArrayLike<number> | null;
  diagonalInertia?: ArrayLike<number> | null;
  principalAxesLocal?: ArrayLike<number> | null;
  principalAxesLocalWxyz?: ArrayLike<number> | null;
}

export interface UsdRobotMetadataSnapshot {
  stageSourcePath?: string | null;
  linkParentPairs?: ArrayLike<[string, string | null]>;
  jointCatalogEntries?: ArrayLike<UsdJointCatalogEntry>;
  linkDynamicsEntries?: ArrayLike<UsdLinkDynamicsEntry>;
  meshCountsByLinkPath?: Record<string, UsdMeshCountsEntry>;
}

export interface UsdSceneBuffers {
  positions?: ArrayLike<number> | null;
  indices?: ArrayLike<number> | null;
  normals?: ArrayLike<number> | null;
  uvs?: ArrayLike<number> | null;
  transforms?: ArrayLike<number> | null;
  rangesByMeshId?: Record<string, UsdMeshDescriptorRanges> | null;
}

export interface UsdSceneSnapshot {
  stageSourcePath?: string | null;
  stage?: {
    defaultPrimPath?: string | null;
  } | null;
  robotTree?: {
    linkParentPairs?: ArrayLike<[string, string | null]>;
    jointCatalogEntries?: ArrayLike<UsdJointCatalogEntry>;
    rootLinkPaths?: ArrayLike<string>;
  } | null;
  physics?: {
    linkDynamicsEntries?: ArrayLike<UsdLinkDynamicsEntry>;
  } | null;
  render?: {
    meshDescriptors?: ArrayLike<UsdSceneMeshDescriptor>;
    materials?: ArrayLike<UsdSceneMaterialRecord>;
    preferredVisualMaterialsByLinkPath?: Record<string, UsdSceneMaterialRecord>;
  } | null;
  robotMetadataSnapshot?: UsdRobotMetadataSnapshot | null;
  buffers?: UsdSceneBuffers | null;
}

export interface UsdPreparedExportCache {
  stageSourcePath?: string | null;
  robotData: RobotData;
  meshFiles: Record<string, Blob>;
}
