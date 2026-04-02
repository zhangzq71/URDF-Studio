import type { InteractionSelection, RobotFile } from '@/types';
import type {
  ToolMode,
  ViewerDocumentLoadEvent,
  ViewerInteractiveLayer,
  UsdLoadingProgress,
} from '../types';
import type { ViewerRobotDataResolution } from './viewerRobotData';

type OffscreenViewerSourceFile = Pick<RobotFile, 'name' | 'content' | 'blobUrl' | 'format'>;
type OffscreenViewerAvailableFile = Pick<RobotFile, 'name' | 'content' | 'blobUrl' | 'format'>;
export type OffscreenViewerInteractionSelection = Pick<
  InteractionSelection,
  'type' | 'id' | 'subType' | 'objectIndex' | 'helperKind'
>;

export interface UsdOffscreenViewerInitRequest {
  type: 'init';
  canvas: OffscreenCanvas;
  width: number;
  height: number;
  devicePixelRatio: number;
  active: boolean;
  groundPlaneOffset: number;
  showVisual: boolean;
  showCollision: boolean;
  showCollisionAlwaysOnTop: boolean;
  sourceFile: OffscreenViewerSourceFile;
  availableFiles: OffscreenViewerAvailableFile[];
  assets: Record<string, string>;
}

export interface UsdOffscreenViewerResizeRequest {
  type: 'resize';
  width: number;
  height: number;
  devicePixelRatio: number;
}

export interface UsdOffscreenViewerPointerDownRequest {
  type: 'pointer-down';
  pointerId: number;
  button: number;
  localX: number;
  localY: number;
}

export interface UsdOffscreenViewerPointerMoveRequest {
  type: 'pointer-move';
  pointerId: number;
  buttons: number;
  localX: number;
  localY: number;
}

export interface UsdOffscreenViewerPointerUpRequest {
  type: 'pointer-up';
  pointerId: number;
  buttons: number;
  localX: number;
  localY: number;
}

export interface UsdOffscreenViewerPointerLeaveRequest {
  type: 'pointer-leave';
}

export interface UsdOffscreenViewerWheelRequest {
  type: 'wheel';
  deltaY: number;
}

export interface UsdOffscreenViewerSetVisibilityRequest {
  type: 'set-visibility';
  showVisual: boolean;
  showCollision: boolean;
  showCollisionAlwaysOnTop: boolean;
}

export interface UsdOffscreenViewerSetGroundOffsetRequest {
  type: 'set-ground-offset';
  groundPlaneOffset: number;
}

export interface UsdOffscreenViewerSetActiveRequest {
  type: 'set-active';
  active: boolean;
}

export interface UsdOffscreenViewerSetInteractionStateRequest {
  type: 'set-interaction-state';
  toolMode: ToolMode;
  selection: OffscreenViewerInteractionSelection | null;
  hoveredSelection: OffscreenViewerInteractionSelection | null;
  hoverSelectionEnabled: boolean;
  interactionLayerPriority: ViewerInteractiveLayer[];
}

export interface UsdOffscreenViewerSetJointAngleRequest {
  type: 'set-joint-angle';
  jointId: string;
  angleRad: number;
}

export interface UsdOffscreenViewerDisposeRequest {
  type: 'dispose';
}

export type UsdOffscreenViewerWorkerRequest =
  | UsdOffscreenViewerInitRequest
  | UsdOffscreenViewerResizeRequest
  | UsdOffscreenViewerPointerDownRequest
  | UsdOffscreenViewerPointerMoveRequest
  | UsdOffscreenViewerPointerUpRequest
  | UsdOffscreenViewerPointerLeaveRequest
  | UsdOffscreenViewerWheelRequest
  | UsdOffscreenViewerSetVisibilityRequest
  | UsdOffscreenViewerSetGroundOffsetRequest
  | UsdOffscreenViewerSetActiveRequest
  | UsdOffscreenViewerSetInteractionStateRequest
  | UsdOffscreenViewerSetJointAngleRequest
  | UsdOffscreenViewerDisposeRequest;

export interface UsdOffscreenViewerProgressResponse {
  type: 'progress';
  progress: UsdLoadingProgress;
}

export interface UsdOffscreenViewerDocumentLoadResponse {
  type: 'document-load';
  event: ViewerDocumentLoadEvent;
}

export interface UsdOffscreenViewerRobotDataResponse {
  type: 'robot-data';
  resolution: ViewerRobotDataResolution;
}

export interface UsdOffscreenViewerSelectionChangeResponse {
  type: 'selection-change';
  selection: OffscreenViewerInteractionSelection | null;
  meshSelection: {
    linkId: string;
    objectIndex: number;
    objectType: 'visual' | 'collision';
  } | null;
}

export interface UsdOffscreenViewerHoverChangeResponse {
  type: 'hover-change';
  hoveredSelection: OffscreenViewerInteractionSelection | null;
}

export interface UsdOffscreenViewerJointAnglesChangeResponse {
  type: 'joint-angles-change';
  jointAngles: Record<string, number>;
}

export interface UsdOffscreenViewerFatalErrorResponse {
  type: 'fatal-error';
  error: string;
}

export type UsdOffscreenViewerLoadDebugStatus = 'pending' | 'resolved' | 'rejected';

export interface UsdOffscreenViewerLoadDebugEntry {
  sourceFileName: string;
  step: string;
  status: UsdOffscreenViewerLoadDebugStatus;
  timestamp: number;
  durationMs?: number;
  detail?: Record<string, unknown> | null;
}

export interface UsdOffscreenViewerLoadDebugResponse {
  type: 'load-debug';
  entry: UsdOffscreenViewerLoadDebugEntry;
}

export type UsdOffscreenViewerWorkerResponse =
  | UsdOffscreenViewerProgressResponse
  | UsdOffscreenViewerDocumentLoadResponse
  | UsdOffscreenViewerRobotDataResponse
  | UsdOffscreenViewerSelectionChangeResponse
  | UsdOffscreenViewerHoverChangeResponse
  | UsdOffscreenViewerJointAnglesChangeResponse
  | UsdOffscreenViewerFatalErrorResponse
  | UsdOffscreenViewerLoadDebugResponse;
