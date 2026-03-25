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
  ExportProgressState,
} from './types';
export type {
  ExportDialogConfig,
  ExportFormat,
  MjcfExportConfig,
  UrdfExportConfig,
  XacroExportConfig,
  UsdExportConfig,
} from './components/ExportDialog';
export type {
  ExportRobotToUsdOptions,
  ExportRobotToUsdPayload,
  ExportRobotToUsdPhase,
  ExportRobotToUsdProgress,
  UsdMeshCompressionOptions,
} from './utils';

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
  prepareMjcfMeshExportAssets,
  exportRobotToUsd,
  exportLibraryRobotFile,
  getDroppedFiles,
  createImportPathCollisionMap,
  remapImportedPath,
  exportProject,
  importProject,
} from './utils';

// Hooks
export {
  useFileImport,
  useSnapshot,
  usePdfExport,
} from './hooks';

export { ExportDialog } from './components/ExportDialog';
