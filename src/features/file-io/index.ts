/**
 * File I/O Feature Module
 * Handles file import/export operations for URDF, MJCF, USD, Xacro formats
 */

// Types
export type {
  FileFormat,
  AssetFile,
  LibraryFile,
  ImportResult,
  ExportOptions,
  PdfExportOptions,
} from './types';
export type {
  ExportDialogConfig,
  ExportFormat,
  MjcfExportConfig,
  UrdfExportConfig,
} from './components/ExportDialog';

// Utilities
export {
  detectFormat,
  isRobotDefinitionFile,
  isAssetFile,
  isMotorLibraryFile,
  isMeshFile,
  shouldSkipPath,
  generateBOM,
  createAssetUrls,
  collectReferencedMeshes,
  fetchMeshBlobs,
  downloadBlob,
  exportLibraryRobotFile,
  getDroppedFiles,
  exportProject,
  importProject,
} from './utils';

// Hooks
export {
  useFileImport,
  useFileExport,
  useSnapshot,
  usePdfExport,
} from './hooks';

export { ExportDialog } from './components/ExportDialog';
