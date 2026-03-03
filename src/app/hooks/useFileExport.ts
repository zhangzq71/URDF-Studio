/**
 * File Export Hook
 * Handles exporting robot as URDF, extended URDF, BOM, and MuJoCo XML
 */
import { useCallback } from 'react';
import JSZip from 'jszip';
import type { RobotState, UrdfLink } from '@/types';
import { GeometryType } from '@/types';
import { generateURDF, generateMujocoXML } from '@/core/parsers';
import { normalizeMeshPathForExport, resolveMeshAssetUrl } from '@/core/parsers/meshPathUtils';
import { useRobotStore, useAssetsStore, useUIStore, useAssemblyStore } from '@/store';
import { exportProject } from '@/features/file-io/utils';

export function useFileExport() {
  const lang = useUIStore((state) => state.lang);
  const theme = useUIStore((state) => state.theme);
  const appMode = useUIStore((state) => state.appMode);
  const sidebarTab = useUIStore((state) => state.sidebarTab);
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

  const downloadBlob = useCallback((blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  const buildRobotForExport = useCallback((): RobotState => {
    // Keep export source aligned with current viewer:
    // workspace tab -> merged assembly; structure tab -> current robot store.
    if (assemblyState && sidebarTab === 'workspace') {
      const mergedData = getMergedRobotData();
      if (mergedData) {
        return { ...mergedData, selection: { type: null, id: null } };
      }

      return {
        name: '',
        links: {
          empty_root: {
            id: 'empty_root',
            name: 'base_link',
            visual: { type: 'none' },
            collision: { type: 'none' },
            inertial: {
              mass: 0,
              origin: {
                xyz: { x: 0, y: 0, z: 0 },
                rpy: { r: 0, p: 0, y: 0 },
              },
              inertia: { ixx: 0, ixy: 0, ixz: 0, iyy: 0, iyz: 0, izz: 0 },
            },
          },
        },
        joints: {},
        rootLinkId: 'empty_root',
        selection: { type: null, id: null },
      };
    }

    return {
      name: robotName,
      links: robotLinks,
      joints: robotJoints,
      rootLinkId,
      selection: { type: null, id: null },
    };
  }, [assemblyState, sidebarTab, getMergedRobotData, robotName, robotLinks, robotJoints, rootLinkId]);

  const getRobotExportName = useCallback((robot: RobotState): string => {
    const trimmed = robot.name?.trim();
    return trimmed && trimmed.length > 0 ? trimmed : 'robot';
  }, []);

  const addMeshesToZip = useCallback(async (robot: RobotState, zip: JSZip) => {
    const meshFolder = zip.folder("meshes");
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
    const exportedMeshPaths = new Set<string>();

    referencedFiles.forEach((meshPath) => {
      const exportPath = normalizeMeshPathForExport(meshPath);
      if (!exportPath || exportedMeshPaths.has(exportPath)) return;
      exportedMeshPaths.add(exportPath);

      const blobUrl = resolveMeshAssetUrl(meshPath, assets);
      if (!blobUrl) {
        console.warn(`[Export] Mesh asset not found for: ${meshPath}`);
        return;
      }

      const p = fetch(blobUrl)
        .then(res => res.blob())
        .then(blob => {
          meshFolder?.file(exportPath, blob);
        })
        .catch((err: any) => console.error(`Failed to load mesh ${meshPath}`, err));

      promises.push(p);
    });

    await Promise.all(promises);
  }, [assets]);

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

  const handleExportURDF = useCallback(async () => {
    const robot = buildRobotForExport();
    const exportName = getRobotExportName(robot);
    const zip = new JSZip();

    zip.file(`${exportName}.urdf`, generateURDF(robot, false));
    await addMeshesToZip(robot, zip);

    const content = await zip.generateAsync({ type: "blob" });
    downloadBlob(content, `${exportName}_urdf.zip`);
  }, [buildRobotForExport, getRobotExportName, addMeshesToZip, downloadBlob]);

  const handleExportMJCF = useCallback(async () => {
    const robot = buildRobotForExport();
    const exportName = getRobotExportName(robot);
    const zip = new JSZip();

    zip.file(`${exportName}.xml`, generateMujocoXML(robot, { meshdir: 'meshes/' }));
    await addMeshesToZip(robot, zip);

    const content = await zip.generateAsync({ type: "blob" });
    downloadBlob(content, `${exportName}_mjcf.zip`);
  }, [buildRobotForExport, getRobotExportName, addMeshesToZip, downloadBlob]);

  // Export handler
  const handleExport = useCallback(async () => {
    const robot = buildRobotForExport();
    const exportName = getRobotExportName(robot);

    const zip = new JSZip();
    const hardwareFolder = zip.folder("hardware");

    // 1. Generate Standard URDF
    const xml = generateURDF(robot, false);
    zip.file(`${exportName}.urdf`, xml);

    // 2. Generate Extended URDF (with hardware info)
    const extendedXml = generateURDF(robot, true);
    zip.file(`${exportName}_extended.urdf`, extendedXml);

    // 3. Generate BOM
    const bomCsv = generateBOM(robot);
    hardwareFolder?.file("bom_list.csv", bomCsv);

    // 4. Generate MuJoCo XML
    const mujocoXml = generateMujocoXML(robot, { meshdir: 'meshes/' });
    zip.file(`${exportName}.xml`, mujocoXml);

    // 5. Add Meshes
    await addMeshesToZip(robot, zip);

    // Generate and download ZIP
    const content = await zip.generateAsync({ type: "blob" });
    downloadBlob(content, `${exportName}_package.zip`);
  }, [buildRobotForExport, getRobotExportName, generateBOM, addMeshesToZip, downloadBlob]);

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
    handleExportURDF,
    handleExportMJCF,
    handleExport,
    handleExportProject,
    generateBOM,
  };
}

export default useFileExport;
