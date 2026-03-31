import type { RobotFile } from '@/types';
import type { ViewerDocumentLoadEvent, UsdLoadingProgress } from '../types';
import type { ViewerRobotDataResolution } from './viewerRobotData';

type OffscreenViewerSourceFile = Pick<RobotFile, 'name' | 'content' | 'blobUrl' | 'format'>;
type OffscreenViewerAvailableFile = Pick<RobotFile, 'name' | 'content' | 'blobUrl' | 'format'>;

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
  clientX: number;
  clientY: number;
}

export interface UsdOffscreenViewerPointerMoveRequest {
  type: 'pointer-move';
  pointerId: number;
  buttons: number;
  clientX: number;
  clientY: number;
}

export interface UsdOffscreenViewerPointerUpRequest {
  type: 'pointer-up';
  pointerId: number;
  buttons: number;
  clientX: number;
  clientY: number;
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

export interface UsdOffscreenViewerDisposeRequest {
  type: 'dispose';
}

export type UsdOffscreenViewerWorkerRequest =
  | UsdOffscreenViewerInitRequest
  | UsdOffscreenViewerResizeRequest
  | UsdOffscreenViewerPointerDownRequest
  | UsdOffscreenViewerPointerMoveRequest
  | UsdOffscreenViewerPointerUpRequest
  | UsdOffscreenViewerWheelRequest
  | UsdOffscreenViewerSetVisibilityRequest
  | UsdOffscreenViewerSetGroundOffsetRequest
  | UsdOffscreenViewerSetActiveRequest
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
  | UsdOffscreenViewerFatalErrorResponse
  | UsdOffscreenViewerLoadDebugResponse;
