/**
 * File Export Hook
 * Handles exporting robot as URDF, extended URDF, BOM, and MuJoCo XML
 */
import { useCallback } from 'react';
import JSZip from 'jszip';
import type { RobotState, UrdfLink } from '@/types';
import { DEFAULT_LINK, GeometryType } from '@/types';
import { generateURDF, generateMujocoXML, generateSkeletonXML, injectGazeboTags } from '@/core/parsers';
import { normalizeMeshPathForExport, resolveMeshAssetUrl } from '@/core/parsers/meshPathUtils';
import { compressSTLBlob } from '@/core/stl-compressor';
import { useAssemblyStore, useAssetsStore, useRobotStore, useUIStore } from '@/store';
import { exportProject, type ExportDialogConfig } from '@/features/file-io';
import { translations } from '@/shared/i18n';

export function useFileExport() {
  const lang = useUIStore((state) => state.lang);
  const t = translations[lang];
  const appMode = useUIStore((state) => state.appMode);
  const sidebarTab = useUIStore((state) => state.sidebarTab);
  const assets = useAssetsStore((state) => state.assets);
  const availableFiles = useAssetsStore((state) => state.availableFiles);
  const allFileContents = useAssetsStore((state) => state.allFileContents);
  const motorLibrary = useAssetsStore((state) => state.motorLibrary);
  const selectedFile = useAssetsStore((state) => state.selectedFile);
  const originalUrdfContent = useAssetsStore((state) => state.originalUrdfContent);
  const originalFileFormat = useAssetsStore((state) => state.originalFileFormat);
  const assemblyState = useAssemblyStore((state) => state.assemblyState);
  const assemblyHistory = useAssemblyStore((state) => state._history);
  const assemblyActivity = useAssemblyStore((state) => state._activity);
  const getMergedRobotData = useAssemblyStore((state) => state.getMergedRobotData);

  // Get robot state from store
  const robotName = useRobotStore((state) => state.name);
  const robotLinks = useRobotStore((state) => state.links);
  const robotJoints = useRobotStore((state) => state.joints);
  const rootLinkId = useRobotStore((state) => state.rootLinkId);
  const robotMaterials = useRobotStore((state) => state.materials);
  const robotHistory = useRobotStore((state) => state._history);
  const robotActivity = useRobotStore((state) => state._activity);

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
            ...DEFAULT_LINK,
            id: 'empty_root',
            name: 'base_link',
            visual: {
              ...DEFAULT_LINK.visual,
              type: GeometryType.NONE,
              dimensions: { x: 0, y: 0, z: 0 },
            },
            collision: {
              ...DEFAULT_LINK.collision,
              type: GeometryType.NONE,
              dimensions: { x: 0, y: 0, z: 0 },
            },
            inertial: {
              ...DEFAULT_LINK.inertial,
              mass: 0,
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

  const createArchiveRoot = useCallback((zip: JSZip, exportName: string): JSZip => {
    return zip.folder(exportName) ?? zip;
  }, []);

  const addSkeletonToZip = useCallback((
    robot: RobotState,
    zip: JSZip,
    exportName: string,
    includeMeshes: boolean,
  ) => {
    zip.file(
      `${exportName}_skeleton.xml`,
      generateSkeletonXML(robot, {
        meshdir: 'meshes/',
        includeMeshes,
        includeActuators: true,
      }),
    );
  }, []);

  const addMeshesToZip = useCallback(async (
    robot: RobotState,
    zip: JSZip,
    compressOptions?: { compressSTL: boolean; stlQuality: number },
  ) => {
    const meshFolder = zip.folder("meshes");
    const referencedFiles = new Set<string>();

    Object.values(robot.links).forEach((link: UrdfLink) => {
      if (link.visual.type === GeometryType.MESH && link.visual.meshPath) {
        referencedFiles.add(link.visual.meshPath);
      }
      if (link.collision && link.collision.type === GeometryType.MESH && link.collision.meshPath) {
        referencedFiles.add(link.collision.meshPath);
      }
      (link.collisionBodies || []).forEach((body) => {
        if (body.type === GeometryType.MESH && body.meshPath) {
          referencedFiles.add(body.meshPath);
        }
      });
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
        .then(async (blob) => {
          if (compressOptions?.compressSTL) {
            const filename = exportPath.split('/').pop() ?? exportPath;
            const result = await compressSTLBlob(blob, filename, { quality: compressOptions.stlQuality });
            meshFolder?.file(exportPath, result.blob);
          } else {
            meshFolder?.file(exportPath, blob);
          }
        })
        .catch((err: any) => console.error(`Failed to load mesh ${meshPath}`, err));

      promises.push(p);
    });

    await Promise.all(promises);
  }, [assets]);

  // Generate BOM (Bill of Materials) CSV
  const generateBOM = useCallback((robot: RobotState): string => {
    const headers = [t.jointName, t.type, t.motorType, t.motorId, t.direction, t.armature, t.lower, t.upper];

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
  }, [t]);

  const handleExportURDF = useCallback(async () => {
    const robot = buildRobotForExport();
    const exportName = getRobotExportName(robot);
    const zip = new JSZip();
    const archiveRoot = createArchiveRoot(zip, exportName);

    archiveRoot.file(`${exportName}.urdf`, generateURDF(robot, false));
    await addMeshesToZip(robot, archiveRoot);

    const content = await zip.generateAsync({ type: "blob" });
    downloadBlob(content, `${exportName}_urdf.zip`);
  }, [buildRobotForExport, getRobotExportName, createArchiveRoot, addMeshesToZip, downloadBlob]);

  const handleExportMJCF = useCallback(async () => {
    const robot = buildRobotForExport();
    const exportName = getRobotExportName(robot);
    const zip = new JSZip();
    const archiveRoot = createArchiveRoot(zip, exportName);

    archiveRoot.file(`${exportName}.xml`, generateMujocoXML(robot, { meshdir: 'meshes/' }));
    await addMeshesToZip(robot, archiveRoot);

    const content = await zip.generateAsync({ type: "blob" });
    downloadBlob(content, `${exportName}_mjcf.zip`);
  }, [buildRobotForExport, getRobotExportName, createArchiveRoot, addMeshesToZip, downloadBlob]);

  // Export handler
  const handleExport = useCallback(async () => {
    const robot = buildRobotForExport();
    const exportName = getRobotExportName(robot);

    const zip = new JSZip();
    const archiveRoot = createArchiveRoot(zip, exportName);
    const hardwareFolder = archiveRoot.folder("hardware");

    // 1. Generate Standard URDF
    const xml = generateURDF(robot, false);
    archiveRoot.file(`${exportName}.urdf`, xml);

    // 2. Generate Extended URDF (with hardware info)
    const extendedXml = generateURDF(robot, true);
    archiveRoot.file(`${exportName}_extended.urdf`, extendedXml);

    // 3. Generate BOM
    const bomCsv = generateBOM(robot);
    hardwareFolder?.file("bom_list.csv", bomCsv);

    // 4. Generate MuJoCo XML
    const mujocoXml = generateMujocoXML(robot, { meshdir: 'meshes/' });
    archiveRoot.file(`${exportName}.xml`, mujocoXml);

    // 5. Add Meshes
    await addMeshesToZip(robot, archiveRoot);

    // Generate and download ZIP
    const content = await zip.generateAsync({ type: "blob" });
    downloadBlob(content, `${exportName}_package.zip`);
  }, [buildRobotForExport, getRobotExportName, createArchiveRoot, generateBOM, addMeshesToZip, downloadBlob]);

  const handleExportWithConfig = useCallback(async (config: ExportDialogConfig) => {
    const robot = buildRobotForExport();
    const exportName = getRobotExportName(robot);
    const zip = new JSZip();
    const archiveRoot = createArchiveRoot(zip, exportName);
    const skeletonUsesMeshes =
      config.format === 'mjcf'
        ? config.mjcf.includeMeshes
        : config.format === 'urdf'
          ? config.urdf.includeMeshes
          : config.xacro.includeMeshes;

    if (config.includeSkeleton) {
      addSkeletonToZip(robot, archiveRoot, exportName, skeletonUsesMeshes);
    }

    if (config.format === 'mjcf') {
      const { meshdir, addFloatBase, includeActuators, actuatorType, includeMeshes, compressSTL, stlQuality } = config.mjcf;
      archiveRoot.file(
        `${exportName}.xml`,
        generateMujocoXML(robot, { meshdir, addFloatBase, includeActuators, actuatorType }),
      );
      if (includeMeshes) await addMeshesToZip(robot, archiveRoot, { compressSTL, stlQuality });
      const content = await zip.generateAsync({ type: 'blob' });
      downloadBlob(content, `${exportName}_mjcf.zip`);
    } else if (config.format === 'urdf') {
      const { includeExtended, includeBOM, useRelativePaths, includeMeshes, compressSTL, stlQuality } = config.urdf;
      archiveRoot.file(`${exportName}.urdf`, generateURDF(robot, { extended: includeExtended, useRelativePaths }));
      if (includeBOM) {
        const hardwareFolder = archiveRoot.folder('hardware');
        hardwareFolder?.file('bom_list.csv', generateBOM(robot));
      }
      if (includeMeshes) await addMeshesToZip(robot, archiveRoot, { compressSTL, stlQuality });
      const content = await zip.generateAsync({ type: 'blob' });
      downloadBlob(content, `${exportName}_urdf.zip`);
    } else if (config.format === 'xacro') {
      const { rosVersion, rosHardwareInterface, useRelativePaths, includeMeshes, compressSTL, stlQuality } = config.xacro;
      const xacroContent = injectGazeboTags(generateURDF(robot, { useRelativePaths }), robot, rosVersion, rosHardwareInterface);
      archiveRoot.file(`${exportName}.urdf.xacro`, xacroContent);
      if (includeMeshes) await addMeshesToZip(robot, archiveRoot, { compressSTL, stlQuality });
      const content = await zip.generateAsync({ type: 'blob' });
      downloadBlob(content, `${exportName}_xacro.zip`);
    }
  }, [addMeshesToZip, addSkeletonToZip, buildRobotForExport, createArchiveRoot, downloadBlob, generateBOM, getRobotExportName]);

  // Export project as .usp
  const handleExportProject = useCallback(async () => {
    const blob = await exportProject({
      name: robotName || assemblyState?.name || 'my_project',
      uiState: {
        appMode,
        lang,
      },
      assetsState: {
        availableFiles,
        assets,
        allFileContents,
        motorLibrary,
        selectedFileName: selectedFile?.name ?? null,
        originalUrdfContent,
        originalFileFormat,
      },
      robotState: {
        present: {
          name: robotName,
          links: robotLinks,
          joints: robotJoints,
          rootLinkId,
          materials: robotMaterials,
        },
        history: robotHistory,
        activity: robotActivity,
      },
      assemblyState: {
        present: assemblyState,
        history: assemblyHistory,
        activity: assemblyActivity,
      },
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
  }, [
    robotName,
    robotLinks,
    robotJoints,
    rootLinkId,
    robotMaterials,
    robotHistory,
    robotActivity,
    assemblyState,
    assemblyHistory,
    assemblyActivity,
    appMode,
    lang,
    availableFiles,
    assets,
    allFileContents,
    motorLibrary,
    selectedFile?.name,
    originalUrdfContent,
    originalFileFormat,
    getMergedRobotData,
  ]);

  return {
    handleExportURDF,
    handleExportMJCF,
    handleExport,
    handleExportProject,
    handleExportWithConfig,
    generateBOM,
  };
}

export default useFileExport;
