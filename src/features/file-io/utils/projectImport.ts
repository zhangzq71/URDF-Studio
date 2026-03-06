import JSZip from 'jszip';
import { 
  AssemblyState, 
  RobotData, 
  RobotFile, 
  BridgeJoint,
  JointType,
  UrdfJoint
} from '@/types';
import type { Language } from '@/shared/i18n';
import { ProjectManifest } from './projectExport';

export interface ImportResult {
  manifest: ProjectManifest;
  assets: Record<string, string>; // Maps path to new blob URL
  availableFiles: RobotFile[];
  assemblyState: AssemblyState | null;
}

/**
 * Parse bridge.xml content into bridges state
 */
function parseBridgeXml(xmlContent: string): Record<string, BridgeJoint> {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');
  const bridgeNodes = xmlDoc.getElementsByTagName('bridge');
  const bridges: Record<string, BridgeJoint> = {};

  Array.from(bridgeNodes).forEach(node => {
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
      }
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
}

/**
 * Main function to import the project from a .usp (ZIP) file
 */
export async function importProject(file: File, lang: Language = 'en'): Promise<ImportResult> {
  const zip = await JSZip.loadAsync(file);
  
  // 1. Read Manifest
  const manifestContent = await zip.file('project.json')?.async('string');
  if (!manifestContent) {
    throw new Error(
      lang === 'zh'
        ? '无效的工程文件：缺少 project.json'
        : 'Invalid project file: project.json not found'
    );
  }
  const manifest = JSON.parse(manifestContent) as ProjectManifest;

  // 2. Load All Assets from everywhere in the ZIP
  // (Both global in assets/ and component-specific in components/<id>/)
  const newAssets: Record<string, string> = {};
  const allAssetPromises: Promise<void>[] = [];

  zip.forEach((relativePath, fileEntry) => {
    if (fileEntry.dir) return;
    
    // Check if it's an asset (stl, obj, dae, png, jpg, etc.)
    const lowerPath = relativePath.toLowerCase();
    if (
      lowerPath.endsWith('.stl') || lowerPath.endsWith('.obj') || 
      lowerPath.endsWith('.dae') || lowerPath.endsWith('.png') || 
      lowerPath.endsWith('.jpg') || lowerPath.endsWith('.jpeg') ||
      lowerPath.endsWith('.hdr')
    ) {
      const p = fileEntry.async('blob').then(blob => {
        const url = URL.createObjectURL(blob);
        newAssets[relativePath] = url;
        
        // Also register with name-only for convenience
        const fileName = relativePath.split('/').pop()!;
        if (!newAssets[fileName]) newAssets[fileName] = url;
      });
      allAssetPromises.push(p);
    }
  });
  await Promise.all(allAssetPromises);

  // 3. Load Available Files
  const availableFiles: RobotFile[] = [];
  if (manifest.assets.availableFiles) {
    for (const fileInfo of manifest.assets.availableFiles) {
      // Try nested path first components/<compId>/<fileName>
      // Since we don't know the compId here easily without manifest.assembly,
      // let's just search for the file in the zip
      let content: string | undefined;
      
      // Search logic for source files
      zip.forEach((path, entry) => {
        if (path.endsWith(fileInfo.name) && !entry.dir) {
          content = undefined; // We'll get it via async
        }
      });
      
      // Better way: find any file in components/ that matches the name
      const entries = Object.keys(zip.files).filter(k => k.includes('components/') && k.endsWith(fileInfo.name));
      if (entries.length > 0) {
        content = await zip.file(entries[0])?.async('string');
      } else {
        // Fallback to root or other locations
        content = await zip.file(fileInfo.name)?.async('string');
      }

      if (content) {
        availableFiles.push({
          name: fileInfo.name,
          content,
          format: fileInfo.format as any,
        });
      }
    }
  }

  // 4. Reconstruct Assembly State
  let assemblyState: AssemblyState | null = null;
  if (manifest.assembly) {
    assemblyState = {
      name: manifest.assembly.name,
      components: {},
      bridges: {},
    };

    // Load component robot data
    for (const [compId, compInfo] of Object.entries(manifest.assembly.components)) {
      // Try nested path: components/<compId>/state.json
      let robotJson = await zip.file(`components/${compId}/state.json`)?.async('string');
      
      // Fallback to old path: components/<compId>.json
      if (!robotJson) {
        robotJson = await zip.file(`components/${compId}.json`)?.async('string');
      }

      if (robotJson) {
        assemblyState.components[compId] = {
          ...compInfo,
          robot: JSON.parse(robotJson) as RobotData,
        };
      }
    }

    // Load bridges
    const bridgeXml = await zip.file('bridges/bridge.xml')?.async('string');
    if (bridgeXml) {
      assemblyState.bridges = parseBridgeXml(bridgeXml);
    }
  }

  return {
    manifest,
    assets: newAssets,
    availableFiles,
    assemblyState,
  };
}
