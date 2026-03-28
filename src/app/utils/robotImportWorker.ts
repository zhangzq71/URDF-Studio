import type {
  ResolveRobotFileDataOptions,
  RobotImportResult,
} from '@/core/parsers/importRobotFile';
import type { RobotFile } from '@/types';
import type { ParseEditableRobotSourceOptions } from './parseEditableRobotSource';
import type { RobotState } from '@/types';

export interface RobotImportWorkerContextSnapshot {
  availableFiles?: RobotFile[];
  assets?: Record<string, string>;
  allFileContents?: Record<string, string>;
}

export interface SyncRobotImportWorkerContextRequest {
  type: 'sync-context';
  contextId: string;
  context: RobotImportWorkerContextSnapshot;
}

export interface ResolveRobotImportWorkerRequest {
  type: 'resolve-robot-file';
  requestId: number;
  file: RobotFile;
  options: ResolveRobotFileDataOptions;
  contextId?: string;
}

export interface ParseEditableRobotSourceWorkerRequest {
  type: 'parse-editable-robot-source';
  requestId: number;
  options: ParseEditableRobotSourceOptions;
  contextId?: string;
}

export interface ResolveRobotImportWorkerResponse {
  type: 'resolve-robot-file-result' | 'resolve-robot-file-error';
  requestId: number;
  result?: RobotImportResult;
  error?: string;
}

export interface ParseEditableRobotSourceWorkerResponse {
  type: 'parse-editable-robot-source-result' | 'parse-editable-robot-source-error';
  requestId: number;
  result?: RobotState | null;
  error?: string;
}

export type RobotImportWorkerRequest =
  | SyncRobotImportWorkerContextRequest
  | ResolveRobotImportWorkerRequest
  | ParseEditableRobotSourceWorkerRequest;

export type RobotImportWorkerResponse =
  | ResolveRobotImportWorkerResponse
  | ParseEditableRobotSourceWorkerResponse;
