import JSZip from 'jszip';
import {
  AssemblyState,
  BridgeJoint,
  GeometryType,
  JointType,
  RobotData,
  RobotFile,
  UsdPreparedExportCache,
  UrdfLink,
} from '@/types';
import { generateMujocoXML, generateURDF } from '@/core/parsers';
import { normalizeMeshPathForExport, resolveMeshAssetUrl } from '@/core/parsers/meshPathUtils';
import { generateBOM } from './bomGenerator';
import { prepareMjcfMeshExportAssets } from './mjcfMeshExport';
import {
  buildAssetArchivePath,
  buildLibraryArchivePath,
  chooseCanonicalLogicalPath,
  ensureUniqueLogicalPath,
  PROJECT_ALL_FILE_CONTENTS_FILE,
  PROJECT_ASSEMBLY_HISTORY_FILE,
  PROJECT_ASSET_MANIFEST_FILE,
  PROJECT_MOTOR_LIBRARY_FILE,
  PROJECT_ORIGINAL_URDF_FILE,
  PROJECT_ROBOT_HISTORY_FILE,
  PROJECT_VERSION,
} from './projectArchive';
import { writeUsdPreparedExportCaches } from './projectUsdPreparedExportCaches';
import {
  stripTransientJointMotionFromJoint,
  stripTransientJointMotionFromRobotData,
} from '@/shared/utils/robot/semanticSnapshot';

const AXIS_EXPORT_TYPES = new Set<JointType>([
  JointType.REVOLUTE,
  JointType.CONTINUOUS,
  JointType.PRISMATIC,
  JointType.PLANAR,
]);

const FULL_LIMIT_EXPORT_TYPES = new Set<JointType>([
  JointType.REVOLUTE,
  JointType.PRISMATIC,
]);

const EFFORT_VELOCITY_LIMIT_EXPORT_TYPES = new Set<JointType>([JointType.CONTINUOUS]);
const DYNAMICS_EXPORT_TYPES = new Set<JointType>([
  JointType.REVOLUTE,
  JointType.CONTINUOUS,
  JointType.PRISMATIC,
]);

const USP_README_EN = `# URDF Studio Project (.usp) File Format

The .usp file is a ZIP-compressed package that contains the full URDF Studio workspace state.

## Directory Structure
- project.json: Project manifest, UI state, and workspace pointers.
- components/: Self-contained assembly components.
- assets/: Packed project asset blobs and manifest.
- library/: Asset library source files and extra text content.
- history/: Undo/redo checkpoints and change logs.
- bridges/: Multi-robot assembly connection data.
- output/: Auto-generated export artifacts.
`;

const USP_README_ZH = `# URDF Studio 工程文件 (.usp) 格式说明

.usp 文件是一个 ZIP 压缩包，包含 URDF Studio 的完整工程状态。

## 目录结构
- project.json: 工程清单、UI 状态和工作区指针。
- components/: 自包含的装配组件。
- assets/: 打包后的工程素材及清单。
- library/: 素材库源文件与额外文本内容。
- history/: 撤销/重做快照与变更日志。
- bridges/: 多机器人装配连接数据。
- output/: 自动生成的导出产物。
`;

const COMPONENT_README_EN = `# URDF Studio Component Format

A component folder is a self-contained robot definition.

## Directory Structure
- model.urdf: Original robot description.
- state.json: JSON snapshot of the component's RobotData.
- meshes/: Component-specific 3D assets.
`;

const COMPONENT_README_ZH = `# URDF Studio 组件格式说明

组件文件夹是一个自包含的机器人定义。

## 目录结构
- model.urdf: 原始机器人描述文件。
- state.json: 组件 RobotData 的当前状态快照。
- meshes/: 组件专用的 3D 资源。
`;

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

type ProjectAssetEntry = {
  logicalPath: string;
  archivePath: string;
};

export interface ProjectManifest {
  version: string;
  name: string;
  lastModified: string;
  ui: {
    appMode?: string;
  };
  workspace?: {
    selectedFile: string | null;
  };
  assets: {
    availableFiles: { name: string; format: string }[];
    originalFileFormat: 'urdf' | 'mjcf' | 'usd' | 'xacro' | null;
    assetEntries?: ProjectAssetEntry[];
    allFileContentsFile?: string;
    motorLibraryFile?: string;
    originalUrdfContentFile?: string;
  };
  history?: {
    robotFile?: string;
    assemblyFile?: string;
  };
  assembly?: {
    name: string;
    components: Record<
      string,
      {
        id: string;
        name: string;
        sourceFile: string;
        visible: boolean;
      }
    >;
  };
}

const normalizeActivityLog = (
  activity: Array<{ id?: string; timestamp?: string; label?: string }> | undefined,
): ProjectActivityEntry[] =>
  (activity ?? []).slice(-MAX_ACTIVITY_LOG).map((entry, index) => ({
    id: entry.id ?? `activity_${index}`,
    timestamp: entry.timestamp ?? new Date(0).toISOString(),
    label: entry.label ?? 'Unknown change',
  }));

const generateBridgeXml = (bridges: Record<string, BridgeJoint>): string => {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<bridges>\n';

  Object.values(bridges).forEach((bridge) => {
    const { joint } = bridge;
    xml += `  <bridge id="${bridge.id}" name="${bridge.name}" `;
    xml += `parent_comp="${bridge.parentComponentId}" parent_link="${bridge.parentLinkId}" `;
    xml += `child_comp="${bridge.childComponentId}" child_link="${bridge.childLinkId}">\n`;
    xml += `    <joint name="${joint.name}" type="${joint.type}">\n`;
    xml += `      <origin xyz="${joint.origin.xyz.x} ${joint.origin.xyz.y} ${joint.origin.xyz.z}" `;
    xml += `rpy="${joint.origin.rpy.r} ${joint.origin.rpy.p} ${joint.origin.rpy.y}" />\n`;

    if (AXIS_EXPORT_TYPES.has(joint.type) && joint.axis) {
      xml += `      <axis xyz="${joint.axis.x} ${joint.axis.y} ${joint.axis.z}" />\n`;

      if (FULL_LIMIT_EXPORT_TYPES.has(joint.type) && joint.limit) {
        xml += `      <limit lower="${joint.limit.lower}" upper="${joint.limit.upper}" effort="${joint.limit.effort}" velocity="${joint.limit.velocity}" />\n`;
      } else if (EFFORT_VELOCITY_LIMIT_EXPORT_TYPES.has(joint.type) && joint.limit) {
        xml += `      <limit effort="${joint.limit.effort}" velocity="${joint.limit.velocity}" />\n`;
      }
    }

    if (
      DYNAMICS_EXPORT_TYPES.has(joint.type)
      && joint.dynamics
      && (joint.dynamics.damping !== 0 || joint.dynamics.friction !== 0)
    ) {
      xml += `      <dynamics damping="${joint.dynamics.damping}" friction="${joint.dynamics.friction}" />\n`;
    }

    if (joint.mimic?.joint) {
      const mimicAttributes = [`joint="${joint.mimic.joint}"`];
      if (typeof joint.mimic.multiplier === 'number' && Number.isFinite(joint.mimic.multiplier)) {
        mimicAttributes.push(`multiplier="${joint.mimic.multiplier}"`);
      }
      if (typeof joint.mimic.offset === 'number' && Number.isFinite(joint.mimic.offset)) {
        mimicAttributes.push(`offset="${joint.mimic.offset}"`);
      }
      xml += `      <mimic ${mimicAttributes.join(' ')} />\n`;
    }

    xml += '    </joint>\n';
    xml += '  </bridge>\n';
  });

  xml += '</bridges>';
  return xml;
};

const getReferencedMeshes = (robot: RobotData): Set<string> => {
  const referencedFiles = new Set<string>();

  Object.values(robot.links).forEach((link: UrdfLink) => {
    if (link.visual.type === GeometryType.MESH && link.visual.meshPath) {
      referencedFiles.add(link.visual.meshPath);
    }
    if (link.collision.type === GeometryType.MESH && link.collision.meshPath) {
      referencedFiles.add(link.collision.meshPath);
    }
    (link.collisionBodies || []).forEach((body) => {
      if (body.type === GeometryType.MESH && body.meshPath) {
        referencedFiles.add(body.meshPath);
      }
    });
  });

  return referencedFiles;
};

const writeReferencedMeshesToFolder = async (
  folder: JSZip,
  robot: RobotData,
  assets: Record<string, string>,
  skipMeshPaths?: ReadonlySet<string>,
): Promise<void> => {
  const writtenPaths = new Set<string>();

  await Promise.all(
    Array.from(getReferencedMeshes(robot)).map(async (meshPath) => {
      if (skipMeshPaths?.has(meshPath)) return;

      const exportPath = normalizeMeshPathForExport(meshPath);
      if (!exportPath || writtenPaths.has(exportPath)) return;
      writtenPaths.add(exportPath);

      const blobUrl = resolveMeshAssetUrl(meshPath, assets);
      if (!blobUrl) return;

      try {
        const response = await fetch(blobUrl);
        const blob = await response.blob();
        folder.file(exportPath, new Uint8Array(await blob.arrayBuffer()));
      } catch (error) {
        console.warn(`[ProjectExport] Failed to package mesh "${meshPath}"`, error);
      }
    }),
  );
};

const stripTransientAssemblyState = (state: AssemblyState | null): AssemblyState | null => {
  if (!state) return null;
  const clone = structuredClone(state);
  Object.values(clone.components).forEach((component) => {
    component.robot = stripTransientJointMotionFromRobotData(component.robot);
  });
  Object.values(clone.bridges).forEach((bridge) => {
    bridge.joint = stripTransientJointMotionFromJoint(bridge.joint) as BridgeJoint['joint'];
  });
  return clone;
};

const writeTextLibraryFiles = (
  zip: JSZip,
  availableFiles: RobotFile[],
): void => {
  availableFiles.forEach((file) => {
    if (file.content.length === 0) return;
    zip.file(buildLibraryArchivePath(file.name), file.content);
  });
};

const writePackedAssets = async (
  zip: JSZip,
  assetMap: Record<string, string>,
): Promise<ProjectAssetEntry[]> => {
  const urlToKeys = new Map<string, string[]>();
  Object.entries(assetMap).forEach(([key, url]) => {
    if (!url) return;
    const existingKeys = urlToKeys.get(url) ?? [];
    existingKeys.push(key);
    urlToKeys.set(url, existingKeys);
  });

  const usedLogicalPaths = new Set<string>();
  const assetEntries: ProjectAssetEntry[] = [];

  await Promise.all(
    Array.from(urlToKeys.entries()).map(async ([url, keys], index) => {
      try {
        const fallbackName = keys.find((key) => /\.[a-z0-9]+$/i.test(key)) ?? `asset_${index}`;
        const canonicalPath = chooseCanonicalLogicalPath(keys, fallbackName);
        const logicalPath = ensureUniqueLogicalPath(canonicalPath, usedLogicalPaths, fallbackName);
        const archivePath = buildAssetArchivePath(logicalPath);
        const response = await fetch(url);
        const blob = await response.blob();
        zip.file(archivePath, new Uint8Array(await blob.arrayBuffer()));
        assetEntries.push({ logicalPath, archivePath });
      } catch (error) {
        console.warn('[ProjectExport] Failed to pack asset', keys[0] ?? url, error);
      }
    }),
  );

  assetEntries.sort((left, right) => left.logicalPath.localeCompare(right.logicalPath));
  zip.file(PROJECT_ASSET_MANIFEST_FILE, JSON.stringify(assetEntries, null, 2));
  return assetEntries;
};

export async function exportProject(params: {
  name: string;
  uiState: {
    appMode: string;
    lang: string;
  };
  assetsState: {
    availableFiles: RobotFile[];
    assets: Record<string, string>;
    allFileContents: Record<string, string>;
    motorLibrary: Record<string, unknown>;
    selectedFileName: string | null;
    originalUrdfContent: string;
    originalFileFormat: 'urdf' | 'mjcf' | 'usd' | 'xacro' | null;
    usdPreparedExportCaches: Record<string, UsdPreparedExportCache>;
  };
  robotState: {
    present: RobotData;
    history: { past: RobotData[]; future: RobotData[] };
    activity: Array<{ id?: string; timestamp?: string; label?: string }>;
  };
  assemblyState: {
    present: AssemblyState | null;
    history: { past: Array<AssemblyState | null>; future: Array<AssemblyState | null> };
    activity: Array<{ id?: string; timestamp?: string; label?: string }>;
  };
  getMergedRobotData: () => RobotData | null;
}) {
  const {
    name,
    uiState,
    assetsState,
    robotState,
    assemblyState,
    getMergedRobotData,
  } = params;

  const zip = new JSZip();
  const currentAssembly = stripTransientAssemblyState(assemblyState.present);
  const currentRobot = stripTransientJointMotionFromRobotData(robotState.present);
  const assetEntries = await writePackedAssets(zip, assetsState.assets);
  writeTextLibraryFiles(zip, assetsState.availableFiles);
  await writeUsdPreparedExportCaches(zip, assetsState.usdPreparedExportCaches);

  zip.file(PROJECT_ALL_FILE_CONTENTS_FILE, JSON.stringify(assetsState.allFileContents, null, 2));
  zip.file(PROJECT_MOTOR_LIBRARY_FILE, JSON.stringify(assetsState.motorLibrary, null, 2));

  if (assetsState.originalUrdfContent) {
    zip.file(PROJECT_ORIGINAL_URDF_FILE, assetsState.originalUrdfContent);
  }

  const serializedRobotHistory: ProjectHistorySnapshot<RobotData> = {
    present: currentRobot,
    past: clampHistoryEntries(robotState.history.past).map((snapshot) => stripTransientJointMotionFromRobotData(snapshot)),
    future: clampFutureEntries(robotState.history.future).map((snapshot) => stripTransientJointMotionFromRobotData(snapshot)),
    activity: normalizeActivityLog(robotState.activity),
  };
  zip.file(PROJECT_ROBOT_HISTORY_FILE, JSON.stringify(serializedRobotHistory, null, 2));

  const serializedAssemblyHistory: ProjectHistorySnapshot<AssemblyState | null> = {
    present: currentAssembly,
    past: clampHistoryEntries(assemblyState.history.past).map((snapshot) => stripTransientAssemblyState(snapshot)),
    future: clampFutureEntries(assemblyState.history.future).map((snapshot) => stripTransientAssemblyState(snapshot)),
    activity: normalizeActivityLog(assemblyState.activity),
  };
  zip.file(PROJECT_ASSEMBLY_HISTORY_FILE, JSON.stringify(serializedAssemblyHistory, null, 2));

  const manifest: ProjectManifest = {
    version: PROJECT_VERSION,
    name: name || 'unnamed_project',
    lastModified: new Date().toISOString(),
    ui: {
      appMode: uiState.appMode,
    },
    workspace: {
      selectedFile: assetsState.selectedFileName,
    },
    assets: {
      availableFiles: assetsState.availableFiles.map((file) => ({
        name: file.name,
        format: file.format,
      })),
      originalFileFormat: assetsState.originalFileFormat,
      assetEntries,
      allFileContentsFile: PROJECT_ALL_FILE_CONTENTS_FILE,
      motorLibraryFile: PROJECT_MOTOR_LIBRARY_FILE,
      originalUrdfContentFile: assetsState.originalUrdfContent
        ? PROJECT_ORIGINAL_URDF_FILE
        : undefined,
    },
    history: {
      robotFile: PROJECT_ROBOT_HISTORY_FILE,
      assemblyFile: PROJECT_ASSEMBLY_HISTORY_FILE,
    },
    assembly: currentAssembly
      ? {
          name: currentAssembly.name,
          components: Object.fromEntries(
            Object.entries(currentAssembly.components).map(([id, component]) => [
              id,
              {
                id: component.id,
                name: component.name,
                sourceFile: component.sourceFile,
                visible: component.visible !== false,
              },
            ]),
          ),
        }
      : undefined,
  };

  zip.file('project.json', JSON.stringify(manifest, null, 2));
  zip.file('README.md', USP_README_EN);
  zip.file('README_ZH.md', USP_README_ZH);

  const componentsFolder = zip.folder('components');
  if (componentsFolder) {
    if (currentAssembly) {
      const componentAssetTasks: Promise<void>[] = [];

      Object.values(currentAssembly.components).forEach((component) => {
        const componentFolder = componentsFolder.folder(component.id);
        if (!componentFolder) return;

        componentFolder.file('state.json', JSON.stringify(component.robot, null, 2));
        componentFolder.file('README.md', COMPONENT_README_EN);
        componentFolder.file('README_ZH.md', COMPONENT_README_ZH);

        const sourceFile = assetsState.availableFiles.find((file) => file.name === component.sourceFile);
        if (sourceFile?.content) {
          componentFolder.file(sourceFile.name.split('/').pop() || 'model.urdf', sourceFile.content);
        }

        const referencedMeshes = getReferencedMeshes(component.robot);
        if (referencedMeshes.size === 0) return;

        const componentMeshesFolder = componentFolder.folder('meshes');
        if (!componentMeshesFolder) return;

        referencedMeshes.forEach((meshPath) => {
          const blobUrl = assetsState.assets[meshPath];
          if (!blobUrl) return;
          const task = fetch(blobUrl)
            .then((response) => response.blob())
            .then(async (blob) => {
              componentMeshesFolder.file(
                meshPath.split('/').pop() || meshPath,
                new Uint8Array(await blob.arrayBuffer()),
              );
            })
            .catch((error) => {
              console.warn(
                `[ProjectExport] Failed to package component mesh "${meshPath}" for ${component.id}`,
                error,
              );
            });
          componentAssetTasks.push(task);
        });
      });

      await Promise.all(componentAssetTasks);
    } else {
      const mainRobotFolder = componentsFolder.folder('main_robot');
      const mergedRobot = getMergedRobotData() ?? robotState.present;

      if (mainRobotFolder && mergedRobot) {
        mainRobotFolder.file('state.json', JSON.stringify(mergedRobot, null, 2));
        mainRobotFolder.file('README.md', COMPONENT_README_EN);
        mainRobotFolder.file('README_ZH.md', COMPONENT_README_ZH);

        const componentMeshesFolder = mainRobotFolder.folder('meshes');

        if (componentMeshesFolder) {
          await writeReferencedMeshesToFolder(componentMeshesFolder, mergedRobot, assetsState.assets);
        }

        assetsState.availableFiles.forEach((file) => {
          if (file.content.length === 0) return;
          componentsFolder.file(file.name, file.content);
        });
      }
    }
  }

  if (currentAssembly && Object.keys(currentAssembly.bridges).length > 0) {
    const bridgesFolder = zip.folder('bridges');
    bridgesFolder?.file('bridge.xml', generateBridgeXml(currentAssembly.bridges));
  }

  const outputFolder = zip.folder('output');
  if (outputFolder) {
    const mergedRobot = getMergedRobotData() ?? robotState.present;
    if (mergedRobot) {
      const robotForExport = {
        ...mergedRobot,
        selection: { type: null, id: null },
      } as RobotData & { selection: { type: null; id: null } };
      const mjcfMeshExport = await prepareMjcfMeshExportAssets({
        robot: robotForExport,
        assets: assetsState.assets,
      });

      outputFolder.file(`${mergedRobot.name}.urdf`, generateURDF(robotForExport, false));
      outputFolder.file(`${mergedRobot.name}_extended.urdf`, generateURDF(robotForExport, true));
      outputFolder.file(`${mergedRobot.name}.xml`, generateMujocoXML(robotForExport, {
        meshdir: 'meshes/',
        meshPathOverrides: mjcfMeshExport.meshPathOverrides,
        visualMeshVariants: mjcfMeshExport.visualMeshVariants,
      }));
      outputFolder.file('bom.csv', generateBOM(robotForExport, uiState.lang as 'en' | 'zh'));

      const outputMeshesFolder = outputFolder.folder('meshes');
      if (outputMeshesFolder) {
        await writeReferencedMeshesToFolder(
          outputMeshesFolder,
          mergedRobot,
          assetsState.assets,
          mjcfMeshExport.convertedSourceMeshPaths,
        );
        await Promise.all(
          Array.from(mjcfMeshExport.archiveFiles.entries()).map(async ([relativePath, blob]) => {
            outputMeshesFolder.file(relativePath, new Uint8Array(await blob.arrayBuffer()));
          }),
        );
      }
    }
  }

  return zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}
