/**
 * File Export Hook
 * Handles exporting robot as URDF, extended URDF, BOM, and MuJoCo XML
 */
import { useCallback } from 'react';
import JSZip from 'jszip';
import type { RobotState, UrdfLink } from '@/types';
import { GeometryType } from '@/types';
import { generateURDF, generateMujocoXML } from '@/core/parsers';
import { useRobotStore, useAssetsStore, useUIStore, useAssemblyStore } from '@/store';
import { exportProject } from '@/features/file-io/utils';

export function useFileExport() {
  const lang = useUIStore((state) => state.lang);
  const theme = useUIStore((state) => state.theme);
  const appMode = useUIStore((state) => state.appMode);
  const assets = useAssetsStore((state) => state.assets);
  const availableFiles = useAssetsStore((state) => state.availableFiles);
  const originalFileFormat = useAssetsStore((state) => state.originalFileFormat);
  const assemblyState = useAssemblyStore((state) => state.assemblyState);
  const getMergedRobotData = useAssemblyStore((state) => state.getMergedRobotData);

  // Get robot state from store
  const robotName = useRobotStore((state) => state.name);
  const robotLinks = useRobotStore((state) => state.links);
  const robotJoints = useRobotStore((state) => state.joints);
  const rootLinkId = useRobotStore((state) => state.rootLinkId);

  // Generate BOM (Bill of Materials) CSV
  const generateBOM = useCallback((robot: RobotState): string => {
    const headers = lang === 'zh'
      ? ['关节名称', '类型', '电机型号', '电机 ID', '方向', '电枢', '下限', '上限']
      : ['Joint Name', 'Type', 'Motor Type', 'Motor ID', 'Direction', 'Armature', 'Lower Limit', 'Upper Limit'];

    const rows = Object.values(robot.joints).map(j => {
      if (j.type === 'fixed') return null;
      if (!j.hardware?.motorType || j.hardware.motorType === 'None') return null;

      return [
        j.name,
        j.type,
        j.hardware?.motorType,
        j.hardware?.motorId || '',
        j.hardware?.motorDirection || 1,
        j.hardware?.armature || 0,
        j.limit.lower,
        j.limit.upper
      ].join(',');
    }).filter(row => row !== null);

    return [headers.join(','), ...rows].join('\n');
  }, [lang]);

  // Export handler
  const handleExport = useCallback(async () => {
    // Build robot state from store
    let robot: RobotState;
    if (assemblyState) {
      const mergedData = getMergedRobotData();
      robot = mergedData
        ? { ...mergedData, selection: { type: null, id: null } }
        : { name: robotName, links: robotLinks, joints: robotJoints, rootLinkId, selection: { type: null, id: null } };
    } else {
      robot = {
        name: robotName,
        links: robotLinks,
        joints: robotJoints,
        rootLinkId,
        selection: { type: null, id: null },
      };
    }

    const zip = new JSZip();
    const urdfFolder = zip.folder("urdf");
    const meshFolder = zip.folder("meshes");
    const hardwareFolder = zip.folder("hardware");
    const mujocoFolder = zip.folder("mujoco");

    // 1. Generate Standard URDF
    const xml = generateURDF(robot, false);
    urdfFolder?.file(`${robot.name}.urdf`, xml);

    // 2. Generate Extended URDF (with hardware info)
    const extendedXml = generateURDF(robot, true);
    urdfFolder?.file(`${robot.name}_extended.urdf`, extendedXml);

    // 3. Generate BOM
    const bomCsv = generateBOM(robot);
    hardwareFolder?.file("bom_list.csv", bomCsv);

    // 4. Generate MuJoCo XML
    const mujocoXml = generateMujocoXML(robot);
    mujocoFolder?.file(`${robot.name}.xml`, mujocoXml);

    // 5. Add Meshes
    const referencedFiles = new Set<string>();
    Object.values(robot.links).forEach((link: UrdfLink) => {
      if (link.visual.type === GeometryType.MESH && link.visual.meshPath) {
        referencedFiles.add(link.visual.meshPath);
      }
      if (link.collision && link.collision.type === GeometryType.MESH && link.collision.meshPath) {
        referencedFiles.add(link.collision.meshPath);
      }
    });

    const promises: Promise<void>[] = [];
    referencedFiles.forEach(fileName => {
      const blobUrl = assets[fileName];
      if (blobUrl) {
        const p = fetch(blobUrl)
          .then(res => res.blob())
          .then(blob => {
            meshFolder?.file(fileName, blob);
          })
          .catch((err: any) => console.error(`Failed to load mesh ${fileName}`, err));
        promises.push(p);
      }
    });

    await Promise.all(promises);

    // Generate and download ZIP
    zip.generateAsync({ type: "blob" })
      .then(function (content: Blob) {
        const url = URL.createObjectURL(content);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${robot.name}_package.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      });
  }, [robotName, robotLinks, robotJoints, rootLinkId, assets, generateBOM, assemblyState, getMergedRobotData]);

  // Export project as .usp
  const handleExportProject = useCallback(async () => {
    const blob = await exportProject({
      name: robotName || assemblyState?.name || 'my_project',
      uiState: { appMode, lang, theme },
      assetsState: { availableFiles, assets, originalFileFormat },
      assemblyState,
      getMergedRobotData,
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${robotName || assemblyState?.name || 'my_project'}.usp`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [robotName, assemblyState, appMode, lang, theme, availableFiles, assets, originalFileFormat, getMergedRobotData]);

  return {
    handleExport,
    handleExportProject,
    generateBOM,
  };
}

export default useFileExport;
