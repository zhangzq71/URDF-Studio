import JSZip from 'jszip';
import { 
  AssemblyState, 
  RobotData, 
  RobotFile, 
  BridgeJoint,
  GeometryType,
  UrdfLink,
  JointType
} from '@/types';
import { generateURDF, generateMujocoXML } from '@/core/parsers';
import { generateBOM } from './bomGenerator';

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

The .usp file is a ZIP-compressed package that contains all necessary data to restore a URDF Studio project.

## Directory Structure
- project.json: Project manifest and UI state.
- components/: Robot components used in the project.
- assets/: Global assets (shared resources).
- bridges/: Multi-robot assembly connection data.
- output/: Auto-generated export artifacts.
`;

const USP_README_ZH = `# URDF Studio 工程文件 (.usp) 格式说明

.usp 文件是一个 ZIP 压缩包，包含了恢复 URDF Studio 项目所需的所有数据。

## 目录结构
- project.json: 项目清单和 UI 状态元数据。
- components/: 项目中使用的机器人组件。
- assets/: 全局资源（共享资源）。
- bridges/: 多机器人装配连接数据。
- output/: 自动生成的导出产物。
`;

const COMPONENT_README_EN = `# URDF Studio Component Format

A component folder is a self-contained robot definition.

## Directory Structure
- model.urdf: Original robot description.
- state.json: JSON snapshot of the component's RobotData.
- <assets>: Component-specific 3D assets.
`;

const COMPONENT_README_ZH = `# URDF Studio 组件格式说明

组件文件夹是一个自包含的机器人定义。

## 目录结构
- model.urdf: 原始机器人描述文件。
- state.json: 组件 RobotData 的当前状态快照。
- <assets>: 组件专用的 3D 资源。
`;

export interface ProjectManifest {
  version: string;
  name: string;
  lastModified: string;
  ui: {
    appMode: string;
    lang: string;
    theme: string;
  };
  assets: {
    availableFiles: { name: string; format: string }[];
    originalFileFormat: string | null;
  };
  assembly?: {
    name: string;
    components: Record<string, {
      id: string;
      name: string;
      sourceFile: string;
      visible: boolean;
    }>;
  };
}

/**
 * Generate bridge.xml content from bridges state
 */
function generateBridgeXml(bridges: Record<string, BridgeJoint>): string {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<bridges>\n';
  
  Object.values(bridges).forEach(bridge => {
    const { joint } = bridge;
    xml += `  <bridge id="${bridge.id}" name="${bridge.name}" `;
    xml += `parent_comp="${bridge.parentComponentId}" parent_link="${bridge.parentLinkId}" `;
    xml += `child_comp="${bridge.childComponentId}" child_link="${bridge.childLinkId}">\n`;
    
    xml += `    <joint name="${joint.name}" type="${joint.type}">\n`;
    xml += `      <origin xyz="${joint.origin.xyz.x} ${joint.origin.xyz.y} ${joint.origin.xyz.z}" `;
    xml += `rpy="${joint.origin.rpy.r} ${joint.origin.rpy.p} ${joint.origin.rpy.y}" />\n`;
    
    if (AXIS_EXPORT_TYPES.has(joint.type)) {
      xml += `      <axis xyz="${joint.axis.x} ${joint.axis.y} ${joint.axis.z}" />\n`;

      if (FULL_LIMIT_EXPORT_TYPES.has(joint.type)) {
        xml += `      <limit lower="${joint.limit.lower}" upper="${joint.limit.upper}" effort="${joint.limit.effort}" velocity="${joint.limit.velocity}" />\n`;
      } else if (EFFORT_VELOCITY_LIMIT_EXPORT_TYPES.has(joint.type)) {
        xml += `      <limit effort="${joint.limit.effort}" velocity="${joint.limit.velocity}" />\n`;
      }
    }

    if (DYNAMICS_EXPORT_TYPES.has(joint.type)) {
      if (joint.dynamics && (joint.dynamics.damping !== 0 || joint.dynamics.friction !== 0)) {
        xml += `      <dynamics damping="${joint.dynamics.damping}" friction="${joint.dynamics.friction}" />\n`;
      }
    }
    xml += `    </joint>\n`;
    xml += `  </bridge>\n`;
  });
  
  xml += '</bridges>';
  return xml;
}

/**
 * Helper to collect referenced meshes from a robot
 */
function getReferencedMeshes(robot: RobotData): Set<string> {
  const referencedFiles = new Set<string>();
  Object.values(robot.links).forEach((link: UrdfLink) => {
    if (link.visual.type === GeometryType.MESH && link.visual.meshPath) {
      referencedFiles.add(link.visual.meshPath);
    }
    if (link.collision && link.collision.type === GeometryType.MESH && link.collision.meshPath) {
      referencedFiles.add(link.collision.meshPath);
    }
  });
  return referencedFiles;
}

/**
 * Main function to export the project as a .usp (ZIP) file
 */
export async function exportProject(params: {
  name: string;
  uiState: { appMode: string; lang: string; theme: string };
  assetsState: {
    availableFiles: RobotFile[];
    assets: Record<string, string>;
    originalFileFormat: string | null;
  };
  assemblyState: AssemblyState | null;
  getMergedRobotData: () => RobotData | null;
}) {
  const { name, uiState, assetsState, assemblyState, getMergedRobotData } = params;
  const zip = new JSZip();

  // 1. Create Manifest
  const manifest: ProjectManifest = {
    version: '1.0',
    name: name || 'unnamed_project',
    lastModified: new Date().toISOString(),
    ui: {
      appMode: uiState.appMode,
      lang: uiState.lang,
      theme: uiState.theme,
    },
    assets: {
      availableFiles: assetsState.availableFiles.map(f => ({ name: f.name, format: f.format })),
      originalFileFormat: assetsState.originalFileFormat,
    },
    assembly: assemblyState ? {
      name: assemblyState.name,
      components: Object.fromEntries(
        Object.entries(assemblyState.components).map(([id, comp]) => [
          id,
          {
            id: comp.id,
            name: comp.name,
            sourceFile: comp.sourceFile,
            visible: comp.visible !== false,
          }
        ])
      )
    } : undefined,
  };

  zip.file('project.json', JSON.stringify(manifest, null, 2));
  zip.file('README.md', USP_README_EN);
  zip.file('README_ZH.md', USP_README_ZH);

  // 2. Components Folder
  const componentsFolder = zip.folder('components');
  if (componentsFolder) {
    if (assemblyState) {
      // For each component, create a self-contained folder
      const compPromises: Promise<void>[] = [];

      Object.values(assemblyState.components).forEach(comp => {
        const compSubfolder = componentsFolder.folder(comp.id);
        if (!compSubfolder) return;

        // Save state snapshot
        compSubfolder.file('state.json', JSON.stringify(comp.robot, null, 2));
        compSubfolder.file('README.md', COMPONENT_README_EN);
        compSubfolder.file('README_ZH.md', COMPONENT_README_ZH);

        // Save original source file if it exists in assetsState
        const sourceFile = assetsState.availableFiles.find(f => f.name === comp.sourceFile);
        if (sourceFile) {
          compSubfolder.file(sourceFile.name.split('/').pop() || 'model.urdf', sourceFile.content);
        }

        // Save meshes specific to this component
        const referencedMeshes = getReferencedMeshes(comp.robot);
        if (referencedMeshes.size > 0) {
          const compMeshesFolder = compSubfolder.folder('meshes');
          referencedMeshes.forEach(meshName => {
            const blobUrl = assetsState.assets[meshName];
            if (blobUrl && compMeshesFolder) {
              const p = fetch(blobUrl)
                .then(res => res.blob())
                .then(blob => {
                  compMeshesFolder.file(meshName.split('/').pop() || meshName, blob);
                })
                .catch(err => console.error(`Failed to load asset ${meshName} for component ${comp.id}`, err));
              compPromises.push(p);
            }
          });
        }
      });
      await Promise.all(compPromises);
    } else {
      // Single robot mode - save into a default component folder
      const compSubfolder = componentsFolder.folder('main_robot');
      const merged = getMergedRobotData();
      if (compSubfolder && merged) {
        compSubfolder.file('state.json', JSON.stringify(merged, null, 2));
        compSubfolder.file('README.md', COMPONENT_README_EN);
        compSubfolder.file('README_ZH.md', COMPONENT_README_ZH);
        
        const referencedMeshes = getReferencedMeshes(merged);
        if (referencedMeshes.size > 0) {
          const compMeshesFolder = compSubfolder.folder('meshes');
          const assetPromises: Promise<void>[] = [];
          referencedMeshes.forEach(meshName => {
            const blobUrl = assetsState.assets[meshName];
            if (blobUrl && compMeshesFolder) {
              const p = fetch(blobUrl)
                .then(res => res.blob())
                .then(blob => {
                  compMeshesFolder.file(meshName.split('/').pop() || meshName, blob);
                })
                .catch(err => console.error(`Failed to load asset ${meshName}`, err));
              assetPromises.push(p);
            }
          });
          await Promise.all(assetPromises);
        }

        // Also save the available files in root of components for backward compatibility or reference
        assetsState.availableFiles.forEach(file => {
          componentsFolder.file(file.name, file.content);
        });
      }
    }
  }

  // 3. Global Assets Folder (Global/Shared resources)
  zip.folder('assets');
  // Currently we don't have a concept of global assets in the store yet, 
  // but we provide the folder structure as requested.

  // 4. Bridges Folder
  if (assemblyState && Object.keys(assemblyState.bridges).length > 0) {
    const bridgesFolder = zip.folder('bridges');
    if (bridgesFolder) {
      bridgesFolder.file('bridge.xml', generateBridgeXml(assemblyState.bridges));
    }
  }

  // 5. Output Folder
  const outputFolder = zip.folder('output');
  if (outputFolder) {
    const mergedRobot = getMergedRobotData();
    if (mergedRobot) {
      const robotState = { ...mergedRobot, selection: { type: null, id: null } } as any;
      outputFolder.file(`${mergedRobot.name}.urdf`, generateURDF(robotState, false));
      outputFolder.file(`${mergedRobot.name}_extended.urdf`, generateURDF(robotState, true));
      outputFolder.file(`${mergedRobot.name}.xml`, generateMujocoXML(robotState));
      outputFolder.file('bom.csv', generateBOM(robotState, uiState.lang as any));
    }
  }

  return await zip.generateAsync({ type: 'blob' });
}
