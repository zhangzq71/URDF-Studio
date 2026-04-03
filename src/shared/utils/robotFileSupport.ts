import type { RobotFile } from '@/types';

const LIBRARY_ROBOT_EXPORTABLE_FORMATS = new Set<RobotFile['format']>([
  'urdf',
  'mjcf',
  'xacro',
  'sdf',
]);

export const ROBOT_IMPORT_ACCEPT_EXTENSIONS = [
  '.zip',
  '.urdf',
  '.sdf',
  '.xml',
  '.mjcf',
  '.usda',
  '.usdc',
  '.usdz',
  '.usd',
  '.xacro',
  '.usp',
] as const;

export const ROBOT_IMPORT_ACCEPT_ATTRIBUTE = ROBOT_IMPORT_ACCEPT_EXTENSIONS.join(',');

export function isLibraryRobotExportableFormat(format: RobotFile['format']): boolean {
  return LIBRARY_ROBOT_EXPORTABLE_FORMATS.has(format);
}
