import JSZip from 'jszip';
import type { AssetFile } from '../types';
import {
  AssemblyState,
  BridgeJoint,
  JointType,
  MotorSpec,
  RobotData,
  RobotFile,
  UsdPreparedExportCache,
  UrdfJoint,
} from '@/types';
import { DEFAULT_MOTOR_LIBRARY } from '@/shared/data/motorLibrary';
import { translations, type Language } from '@/shared/i18n';
import { createAssetUrls } from './assetUtils';
import {
  buildLibraryArchivePath,
  PROJECT_ALL_FILE_CONTENTS_FILE,
  PROJECT_ASSEMBLY_HISTORY_FILE,
  PROJECT_ASSET_MANIFEST_FILE,
  PROJECT_MOTOR_LIBRARY_FILE,
  PROJECT_ORIGINAL_URDF_FILE,
  PROJECT_ROBOT_HISTORY_FILE,
} from './projectArchive';
import type { ProjectManifest } from './projectExport';
import { readUsdPreparedExportCaches } from './projectUsdPreparedExportCaches';

type ProjectActivityEntry = {
  id: string;
  timestamp: string;
  label: string;
};

type ProjectHistorySnapshot<T> = {
  present: T;
  past: T[];
  future: T[];
  activity: ProjectActivityEntry[];
};

const MAX_HISTORY = 50;
const MAX_ACTIVITY_LOG = 200;

const clampHistoryEntries = <T>(entries: T[] | undefined): T[] => (entries ?? []).slice(-MAX_HISTORY);
const clampFutureEntries = <T>(entries: T[] | undefined): T[] => (entries ?? []).slice(0, MAX_HISTORY);

export interface ImportResult {
  manifest: ProjectManifest;
  assets: Record<string, string>;
  availableFiles: RobotFile[];
  allFileContents: Record<string, string>;
  motorLibrary: Record<string, MotorSpec[]>;
  selectedFileName: string | null;
  originalUrdfContent: string;
  originalFileFormat: 'urdf' | 'mjcf' | 'usd' | 'xacro' | null;
  usdPreparedExportCaches: Record<string, UsdPreparedExportCache>;
  robotState: RobotData | null;
  robotHistory: { past: RobotData[]; future: RobotData[] };
  robotActivity: ProjectActivityEntry[];
  assemblyState: AssemblyState | null;
  assemblyHistory: { past: Array<AssemblyState | null>; future: Array<AssemblyState | null> };
  assemblyActivity: ProjectActivityEntry[];
}

const normalizeActivity = (
  activity: Array<{ id?: string; timestamp?: string; label?: string }> | undefined,
): ProjectActivityEntry[] =>
  (activity ?? []).slice(-MAX_ACTIVITY_LOG).map((entry, index) => ({
    id: entry.id ?? `activity_${index}`,
    timestamp: entry.timestamp ?? new Date(0).toISOString(),
    label: entry.label ?? 'Unknown change',
  }));

const parseBridgeXml = (xmlContent: string): Record<string, BridgeJoint> => {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');
  const bridgeNodes = xmlDoc.getElementsByTagName('bridge');
  const bridges: Record<string, BridgeJoint> = {};

  Array.from(bridgeNodes).forEach((node) => {
    const id = node.getAttribute('id') || `bridge_${Date.now()}_${Math.random()}`;
    const name = node.getAttribute('name') || 'unnamed_bridge';
    const parentComponentId = node.getAttribute('parent_comp') || '';
    const parentLinkId = node.getAttribute('parent_link') || '';
    const childComponentId = node.getAttribute('child_comp') || '';
    const childLinkId = node.getAttribute('child_link') || '';

    const jointNode = node.getElementsByTagName('joint')[0];
    if (!jointNode) return;

    const jointName = jointNode.getAttribute('name') || 'joint';
    const jointType = (jointNode.getAttribute('type') as JointType) || JointType.FIXED;

    const originNode = jointNode.getElementsByTagName('origin')[0];
    const xyz = originNode?.getAttribute('xyz')?.split(' ').map(Number) || [0, 0, 0];
    const rpy = originNode?.getAttribute('rpy')?.split(' ').map(Number) || [0, 0, 0];

    const axisNode = jointNode.getElementsByTagName('axis')[0];
    const axisXyz = axisNode?.getAttribute('xyz')?.split(' ').map(Number) || [0, 0, 1];

    const limitNode = jointNode.getElementsByTagName('limit')[0];
    const limit = {
      lower: Number(limitNode?.getAttribute('lower') || 0),
      upper: Number(limitNode?.getAttribute('upper') || 0),
      effort: Number(limitNode?.getAttribute('effort') || 0),
      velocity: Number(limitNode?.getAttribute('velocity') || 0),
    };

    const dynamicsNode = jointNode.getElementsByTagName('dynamics')[0];
    const dynamics = {
      damping: Number(dynamicsNode?.getAttribute('damping') || 0),
      friction: Number(dynamicsNode?.getAttribute('friction') || 0),
    };

    const joint: UrdfJoint = {
      id,
      name: jointName,
      type: jointType,
      parentLinkId,
      childLinkId,
      origin: {
        xyz: { x: xyz[0], y: xyz[1], z: xyz[2] },
        rpy: { r: rpy[0], p: rpy[1], y: rpy[2] },
      },
      axis: { x: axisXyz[0], y: axisXyz[1], z: axisXyz[2] },
      limit,
      dynamics,
      hardware: {
        armature: 0,
        motorType: 'None',
        motorId: '',
        motorDirection: 1,
      },
    };

    bridges[id] = {
      id,
      name,
      parentComponentId,
      parentLinkId,
      childComponentId,
      childLinkId,
      joint,
    };
  });

  return bridges;
};

const loadPackedAssets = async (
  zip: JSZip,
  manifest: ProjectManifest,
): Promise<Record<string, string>> => {
  const assetEntriesFromManifest = manifest.assets.assetEntries
    ?? await loadJsonRecord(zip, PROJECT_ASSET_MANIFEST_FILE, [] as Array<{ logicalPath: string; archivePath: string }>);
  if (!assetEntriesFromManifest || assetEntriesFromManifest.length === 0) {
    return {};
  }

  const assetFiles: AssetFile[] = [];
  await Promise.all(
    assetEntriesFromManifest.map(async (entry) => {
      const blob = await zip.file(entry.archivePath)?.async('blob');
      if (!blob) return;
      assetFiles.push({ name: entry.logicalPath, blob });
    }),
  );

  return createAssetUrls(assetFiles);
};

const loadHistoryFile = async <T>(
  zip: JSZip,
  path: string | undefined,
): Promise<ProjectHistorySnapshot<T> | null> => {
  if (!path) return null;
  const content = await zip.file(path)?.async('string');
  if (!content) return null;
  return JSON.parse(content) as ProjectHistorySnapshot<T>;
};

const loadLibraryFiles = async (
  zip: JSZip,
  manifest: ProjectManifest,
  assets: Record<string, string>,
): Promise<RobotFile[]> => {
  const availableFiles: RobotFile[] = [];

  for (const fileInfo of manifest.assets.availableFiles ?? []) {
    let content = '';

    if (fileInfo.format !== 'mesh') {
      content = await zip.file(buildLibraryArchivePath(fileInfo.name))?.async('string') ?? '';
    }

    availableFiles.push({
      name: fileInfo.name,
      content,
      format: fileInfo.format as RobotFile['format'],
      blobUrl: assets[fileInfo.name],
    });
  }

  return availableFiles;
};

const loadJsonRecord = async <T>(
  zip: JSZip,
  path: string | undefined,
  fallback: T,
): Promise<T> => {
  if (!path) return fallback;
  const content = await zip.file(path)?.async('string');
  if (!content) return fallback;
  return JSON.parse(content) as T;
};

export async function importProject(file: File, lang: Language = 'en'): Promise<ImportResult> {
  const t = translations[lang];
  const zip = await JSZip.loadAsync(file);

  const manifestContent = await zip.file('project.json')?.async('string');
  if (!manifestContent) {
    throw new Error(t.projectImportMissingProjectJson);
  }

  const manifest = JSON.parse(manifestContent) as ProjectManifest;
  const assets = await loadPackedAssets(zip, manifest);
  const availableFiles = await loadLibraryFiles(zip, manifest, assets);
  const usdPreparedExportCaches = await readUsdPreparedExportCaches(zip);

  const allFileContents = await loadJsonRecord(
    zip,
    manifest.assets.allFileContentsFile ?? PROJECT_ALL_FILE_CONTENTS_FILE,
    Object.fromEntries(
      availableFiles
        .filter((fileEntry) => fileEntry.content.length > 0)
        .map((fileEntry) => [fileEntry.name, fileEntry.content]),
    ),
  );

  const motorLibrary = await loadJsonRecord<Record<string, MotorSpec[]>>(
    zip,
    manifest.assets.motorLibraryFile ?? PROJECT_MOTOR_LIBRARY_FILE,
    DEFAULT_MOTOR_LIBRARY,
  );

  const originalUrdfContent = manifest.assets.originalUrdfContentFile
    ? await zip.file(manifest.assets.originalUrdfContentFile)?.async('string') ?? ''
    : await zip.file(PROJECT_ORIGINAL_URDF_FILE)?.async('string') ?? '';

  const robotHistoryFile = manifest.history?.robotFile ?? PROJECT_ROBOT_HISTORY_FILE;
  const robotHistorySnapshot = await loadHistoryFile<RobotData>(zip, robotHistoryFile);

  const assemblyHistoryFile = manifest.history?.assemblyFile ?? PROJECT_ASSEMBLY_HISTORY_FILE;
  const assemblyHistorySnapshot = await loadHistoryFile<AssemblyState | null>(zip, assemblyHistoryFile);

  const assemblyState = assemblyHistorySnapshot?.present ?? null;
  const firstAssemblyComponent = assemblyState
    ? Object.values(assemblyState.components)[0]?.robot ?? null
    : null;
  const robotState = robotHistorySnapshot?.present
    ?? firstAssemblyComponent;

  return {
    manifest,
    assets,
    availableFiles,
    allFileContents,
    motorLibrary,
    selectedFileName: manifest.workspace?.selectedFile ?? null,
    originalUrdfContent,
    originalFileFormat: manifest.assets.originalFileFormat ?? null,
    usdPreparedExportCaches,
    robotState,
    robotHistory: {
      past: clampHistoryEntries(robotHistorySnapshot?.past),
      future: clampFutureEntries(robotHistorySnapshot?.future),
    },
    robotActivity: normalizeActivity(robotHistorySnapshot?.activity),
    assemblyState,
    assemblyHistory: {
      past: clampHistoryEntries(assemblyHistorySnapshot?.past),
      future: clampFutureEntries(assemblyHistorySnapshot?.future),
    },
    assemblyActivity: normalizeActivity(assemblyHistorySnapshot?.activity),
  };
}
