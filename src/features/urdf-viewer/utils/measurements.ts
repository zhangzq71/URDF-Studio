import * as THREE from 'three';
import type { UrdfLink } from '@/types';

export type MeasureSlot = 'first' | 'second';
export type MeasureObjectType = 'visual' | 'collision';
export type MeasureAnchorMode = 'frame' | 'centerOfMass' | 'geometry';

export interface MeasureTargetInput {
  linkName: string;
  objectType: MeasureObjectType;
  objectIndex: number;
  point: THREE.Vector3;
}

export interface MeasureTarget {
  key: string;
  label: string;
  linkName: string;
  objectType: MeasureObjectType;
  objectIndex: number;
  point: THREE.Vector3;
}

export type MeasureLinkData = Pick<UrdfLink, 'inertial'>;

export interface MeasurementMetrics {
  distance: number;
  delta: {
    x: number;
    y: number;
    z: number;
  };
  absoluteDelta: {
    x: number;
    y: number;
    z: number;
  };
  isDiagonal: boolean;
}

export interface MeasureMeasurement extends MeasurementMetrics {
  id: string;
  groupId: string;
  groupIndex: number;
  first: MeasureTarget;
  second: MeasureTarget;
}

export interface MeasureGroup {
  id: string;
  activeSlot: MeasureSlot;
  first: MeasureTarget | null;
  second: MeasureTarget | null;
}

export interface MeasureState {
  groups: MeasureGroup[];
  activeGroupId: string;
  hoverTarget: MeasureTarget | null;
}

const AXIS_EPSILON = 1e-6;

function normalizeNumber(value: number): number {
  return Math.abs(value) < AXIS_EPSILON ? 0 : value;
}

function parseVector3Text(value: string | null | undefined): THREE.Vector3 | null {
  if (!value) {
    return null;
  }

  const parts = value
    .trim()
    .split(/\s+/)
    .map((component) => Number(component));

  if (parts.length < 3 || parts.slice(0, 3).some((component) => !Number.isFinite(component))) {
    return null;
  }

  return new THREE.Vector3(parts[0], parts[1], parts[2]);
}

function getLinkDataCenterOfMassLocal(linkData?: MeasureLinkData | null): THREE.Vector3 | null {
  const xyz = linkData?.inertial?.origin?.xyz;
  if (!xyz) {
    return null;
  }

  const x = Number(xyz.x);
  const y = Number(xyz.y);
  const z = Number(xyz.z);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    return null;
  }

  return new THREE.Vector3(x, y, z);
}

function getLinkUrdfNodeCenterOfMassLocal(linkObject?: THREE.Object3D | null): THREE.Vector3 | null {
  const urdfNode = (linkObject as THREE.Object3D & {
    urdfNode?: { querySelector?: (selector: string) => { getAttribute?: (name: string) => string | null } | null } | null;
  } | null)?.urdfNode;

  if (!urdfNode || typeof urdfNode.querySelector !== 'function') {
    return null;
  }

  const originNode = urdfNode.querySelector('inertial > origin');
  if (!originNode || typeof originNode.getAttribute !== 'function') {
    return null;
  }

  return parseVector3Text(originNode.getAttribute('xyz'));
}

export function getLinkCenterOfMassLocal(
  linkData?: MeasureLinkData | null,
  linkObject?: THREE.Object3D | null,
): THREE.Vector3 | null {
  return getLinkDataCenterOfMassLocal(linkData)
    ?? getLinkUrdfNodeCenterOfMassLocal(linkObject);
}

export function getLinkCenterOfMassWorld(
  linkObject: THREE.Object3D,
  linkData?: MeasureLinkData | null,
): THREE.Vector3 | null {
  const localCenterOfMass = getLinkCenterOfMassLocal(linkData, linkObject);
  if (!localCenterOfMass) {
    return null;
  }

  linkObject.updateMatrixWorld(true);
  return localCenterOfMass.applyMatrix4(linkObject.matrixWorld);
}

export function getObjectWorldCenter(object: THREE.Object3D): THREE.Vector3 {
  const boundingBox = new THREE.Box3().setFromObject(object);
  if (boundingBox.isEmpty()) {
    return object.getWorldPosition(new THREE.Vector3());
  }
  return boundingBox.getCenter(new THREE.Vector3());
}

export function getLinkFrameWorldPoint(linkObject: THREE.Object3D): THREE.Vector3 {
  linkObject.updateMatrixWorld(true);
  return linkObject.getWorldPosition(new THREE.Vector3());
}

function isMeasureBody(
  object: THREE.Object3D,
  objectType: MeasureObjectType,
): boolean {
  if (objectType === 'collision') {
    return Boolean((object as any).isURDFCollider || object.userData?.isCollisionGroup === true);
  }

  return Boolean((object as any).isURDFVisual || object.userData?.isVisualGroup === true);
}

function isCollisionMeasureMesh(object: THREE.Object3D): boolean {
  return Boolean(
    object.userData?.isCollisionMesh === true
    || object.userData?.isCollision === true
    || object.userData?.geometryRole === 'collision',
  );
}

function isMeasureMesh(
  object: THREE.Object3D,
  objectType: MeasureObjectType,
): object is THREE.Mesh {
  if (!(object as THREE.Mesh).isMesh) {
    return false;
  }

  return objectType === 'collision'
    ? isCollisionMeasureMesh(object)
    : !isCollisionMeasureMesh(object);
}

function isDirectLinkMeasureObject(object: THREE.Object3D): boolean {
  if (object.userData?.isHelper === true || object.userData?.isGizmo === true || String(object.name || '').startsWith('__')) {
    return false;
  }

  if ((object as any).isURDFJoint || (object as any).isURDFLink) {
    return false;
  }

  return Boolean(
    (object as any).isURDFVisual
    || (object as any).isURDFCollider
    || object.userData?.isVisualGroup === true
    || object.userData?.isCollisionGroup === true
    || (object as any).isMesh,
  );
}

function expandBoundsWithObject(
  bounds: THREE.Box3,
  object: THREE.Object3D,
): boolean {
  const objectBounds = new THREE.Box3().setFromObject(object);
  if (objectBounds.isEmpty()) {
    return false;
  }

  bounds.union(objectBounds);
  return true;
}

export function getLinkMeasureCenter(
  linkObject: THREE.Object3D,
  objectType: MeasureObjectType = 'visual',
  objectIndex = 0,
): THREE.Vector3 {
  const linkBounds = new THREE.Box3();
  let hasLinkBounds = false;

  linkObject.children.forEach((child) => {
    if (!isDirectLinkMeasureObject(child)) {
      return;
    }

    hasLinkBounds = expandBoundsWithObject(linkBounds, child) || hasLinkBounds;
  });

  if (hasLinkBounds) {
    return linkBounds.getCenter(new THREE.Vector3());
  }

  const directBodies = linkObject.children.filter((child) => isMeasureBody(child, objectType));
  const targetBody = directBodies[objectIndex] ?? directBodies[0] ?? null;
  if (targetBody) {
    return getObjectWorldCenter(targetBody);
  }

  const directMeshes = linkObject.children.filter((child): child is THREE.Mesh => (
    isMeasureMesh(child, objectType)
  ));
  const targetMesh = directMeshes[objectIndex] ?? directMeshes[0] ?? null;
  if (targetMesh) {
    return getObjectWorldCenter(targetMesh);
  }

  return linkObject.getWorldPosition(new THREE.Vector3());
}

export function getLinkMeasurePoint(
  linkObject: THREE.Object3D,
  linkData?: MeasureLinkData | null,
  anchorMode: MeasureAnchorMode = 'frame',
  objectType: MeasureObjectType = 'visual',
  objectIndex = 0,
): THREE.Vector3 {
  if (anchorMode === 'centerOfMass') {
    return getLinkCenterOfMassWorld(linkObject, linkData) ?? getLinkFrameWorldPoint(linkObject);
  }

  if (anchorMode === 'geometry') {
    return getLinkMeasureCenter(linkObject, objectType, objectIndex);
  }

  return getLinkFrameWorldPoint(linkObject);
}

function countNonZeroAxes(delta: MeasurementMetrics['absoluteDelta']): number {
  return [delta.x, delta.y, delta.z].filter((value) => value > AXIS_EPSILON).length;
}

function createMeasureGroup(): MeasureGroup {
  return {
    id: `measure-group:${crypto.randomUUID()}`,
    activeSlot: 'first',
    first: null,
    second: null,
  };
}

function updateMeasureGroup(
  state: MeasureState,
  groupId: string,
  updater: (group: MeasureGroup) => MeasureGroup,
): MeasureState {
  let changed = false;

  const groups = state.groups.map((group) => {
    if (group.id !== groupId) {
      return group;
    }

    changed = true;
    return updater(group);
  });

  return changed ? { ...state, groups } : state;
}

export function createEmptyMeasureState(): MeasureState {
  const initialGroup = createMeasureGroup();
  return {
    groups: [initialGroup],
    activeGroupId: initialGroup.id,
    hoverTarget: null,
  };
}

export function createMeasureTarget({
  linkName,
  objectType,
  objectIndex,
  point,
}: MeasureTargetInput): MeasureTarget {
  return {
    key: `link:${linkName}`,
    label: linkName,
    linkName,
    objectType,
    objectIndex,
    point: point.clone(),
  };
}

export function getMeasurementMetrics(
  start: THREE.Vector3,
  end: THREE.Vector3,
): MeasurementMetrics {
  const delta = {
    x: normalizeNumber(end.x - start.x),
    y: normalizeNumber(end.y - start.y),
    z: normalizeNumber(end.z - start.z),
  };
  const absoluteDelta = {
    x: Math.abs(delta.x),
    y: Math.abs(delta.y),
    z: Math.abs(delta.z),
  };

  return {
    distance: normalizeNumber(start.distanceTo(end)),
    delta,
    absoluteDelta,
    isDiagonal: countNonZeroAxes(absoluteDelta) > 1,
  };
}

export function createMeasureMeasurement(
  group: MeasureGroup,
  groupIndex = 1,
): MeasureMeasurement {
  if (!group.first || !group.second) {
    throw new Error('Cannot create a measurement from an incomplete measure group.');
  }

  return {
    id: group.id,
    groupId: group.id,
    groupIndex,
    first: createMeasureTarget(group.first),
    second: createMeasureTarget(group.second),
    ...getMeasurementMetrics(group.first.point, group.second.point),
  };
}

export function getActiveMeasureGroup(state: MeasureState): MeasureGroup {
  return state.groups.find((group) => group.id === state.activeGroupId) ?? state.groups[0];
}

export function getMeasureStateMeasurements(state: MeasureState): MeasureMeasurement[] {
  return state.groups.flatMap((group, index) => (
    group.first && group.second ? [createMeasureMeasurement(group, index + 1)] : []
  ));
}

export function getActiveMeasureMeasurement(state: MeasureState): MeasureMeasurement | null {
  const activeGroup = getActiveMeasureGroup(state);
  if (!activeGroup.first || !activeGroup.second) {
    return null;
  }

  const activeGroupIndex = state.groups.findIndex((group) => group.id === activeGroup.id);
  return createMeasureMeasurement(activeGroup, activeGroupIndex >= 0 ? activeGroupIndex + 1 : 1);
}

export function addMeasureGroup(state: MeasureState): MeasureState {
  const nextGroup = createMeasureGroup();

  return {
    ...state,
    groups: [...state.groups, nextGroup],
    activeGroupId: nextGroup.id,
    hoverTarget: null,
  };
}

export function removeMeasureGroup(
  state: MeasureState,
  groupId: string,
): MeasureState {
  const groupIndex = state.groups.findIndex((group) => group.id === groupId);
  if (groupIndex < 0) {
    return state;
  }

  const remainingGroups = state.groups.filter((group) => group.id !== groupId);
  if (remainingGroups.length === 0) {
    return createEmptyMeasureState();
  }

  const nextActiveGroupId = state.activeGroupId === groupId
    ? remainingGroups[Math.min(groupIndex, remainingGroups.length - 1)]?.id ?? remainingGroups[0].id
    : state.activeGroupId;

  return {
    ...state,
    groups: remainingGroups,
    activeGroupId: nextActiveGroupId,
    hoverTarget: null,
  };
}

export function setActiveMeasureGroup(
  state: MeasureState,
  groupId: string,
): MeasureState {
  if (!state.groups.some((group) => group.id === groupId) || state.activeGroupId === groupId) {
    return state;
  }

  return {
    ...state,
    activeGroupId: groupId,
    hoverTarget: null,
  };
}

export function setActiveMeasureSlot(
  state: MeasureState,
  slot: MeasureSlot,
): MeasureState {
  return {
    ...updateMeasureGroup(state, state.activeGroupId, (group) => ({
      ...group,
      activeSlot: slot,
    })),
    hoverTarget: null,
  };
}

export function setMeasureHoverTarget(
  state: MeasureState,
  target: MeasureTarget | null,
): MeasureState {
  return {
    ...state,
    hoverTarget: target ? createMeasureTarget(target) : null,
  };
}

export function applyMeasurePick(
  state: MeasureState,
  target: MeasureTarget,
  slot: MeasureSlot = getActiveMeasureGroup(state).activeSlot,
): MeasureState {
  const activeGroup = getActiveMeasureGroup(state);
  const otherSlot = slot === 'first' ? 'second' : 'first';
  const shouldAutoAdvance = !activeGroup[slot] && !activeGroup[otherSlot];

  return {
    ...updateMeasureGroup(state, activeGroup.id, (group) => ({
      ...group,
      [slot]: createMeasureTarget(target),
      activeSlot: shouldAutoAdvance ? otherSlot : slot,
    })),
    hoverTarget: null,
  };
}

export function clearMeasureSlot(
  state: MeasureState,
  slot: MeasureSlot,
): MeasureState {
  return {
    ...updateMeasureGroup(state, state.activeGroupId, (group) => ({
      ...group,
      [slot]: null,
      activeSlot: slot,
    })),
    hoverTarget: null,
  };
}

export function clearActiveMeasureGroup(state: MeasureState): MeasureState {
  return {
    ...updateMeasureGroup(state, state.activeGroupId, (group) => ({
      ...group,
      activeSlot: 'first',
      first: null,
      second: null,
    })),
    hoverTarget: null,
  };
}

export function undoMeasureState(state: MeasureState): MeasureState {
  const activeGroup = getActiveMeasureGroup(state);
  if (activeGroup.first || activeGroup.second || state.hoverTarget) {
    return clearActiveMeasureGroup(state);
  }

  for (let index = state.groups.length - 1; index >= 0; index -= 1) {
    const group = state.groups[index];
    if (!group.first && !group.second) {
      continue;
    }

    return {
      ...updateMeasureGroup(state, group.id, (item) => ({
        ...item,
        activeSlot: 'first',
        first: null,
        second: null,
      })),
      activeGroupId: group.id,
      hoverTarget: null,
    };
  }

  return state;
}

export function clearMeasureState(): MeasureState {
  return createEmptyMeasureState();
}
