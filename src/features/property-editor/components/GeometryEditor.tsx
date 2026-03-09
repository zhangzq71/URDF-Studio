/**
 * GeometryEditor - Visual/Collision geometry editing for a Link.
 * Handles geometry type selection, dimension editing, mesh selection,
 * origin/rotation, color, and auto-align.
 */
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Upload, File, Wand, Check, Trash2 } from 'lucide-react';
import type { RobotState, UrdfLink, UrdfVisual } from '@/types';
import { GeometryType } from '@/types';
import { translations } from '@/shared/i18n';
import { useSelectionStore } from '@/store';
import {
  getCollisionGeometryByObjectIndex,
  getCollisionGeometryEntries,
  removeCollisionGeometryByObjectIndex,
  updateCollisionGeometryByObjectIndex,
} from '@/core/robot';
import {
  InputGroup,
  NumberInput,
  Vec3InlineInput,
  PROPERTY_EDITOR_HELPER_TEXT_CLASS,
  PROPERTY_EDITOR_INPUT_CLASS,
  PROPERTY_EDITOR_PRIMARY_BUTTON_CLASS,
  PROPERTY_EDITOR_SECONDARY_BUTTON_CLASS,
  PROPERTY_EDITOR_SECTION_TITLE_CLASS,
  PROPERTY_EDITOR_SELECT_CLASS,
} from './FormControls';
import { MeshPreview } from './MeshPreview';
import {
  computeAutoAlign,
  convertGeometryType,
} from '../utils/geometryConversion';
import type { MeshAnalysis, MeshAnalysisOptions, MeshClearanceObstacle } from '../utils/geometryConversion';
import { analyzeMeshBatchWithWorker } from '../utils/meshAnalysisWorkerBridge';
import {
  GEOMETRY_DIMENSION_STEP,
  MAX_GEOMETRY_DIMENSION_DECIMALS,
  MAX_TRANSFORM_DECIMALS,
  TRANSFORM_STEP,
} from '@/core/utils/numberPrecision';

const GEOMETRY_EDITOR_MESH_ANALYSIS_OPTIONS = {
  includePrimitiveFits: true,
  includeSurfacePoints: false,
  pointCollectionLimit: 2048,
} satisfies MeshAnalysisOptions;

const GEOMETRY_EDITOR_RELAXED_OVERLAP_ALLOWANCE_RATIO = 0.12;
const GEOMETRY_EDITOR_RELAXED_FIT_VOLUME_WINDOW_RATIO = 1.75;

async function yieldToNextFrame(): Promise<void> {
  await new Promise<void>((resolve) => {
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => resolve());
      return;
    }

    setTimeout(resolve, 0);
  });
}

interface GeometryEditorProps {
  data: UrdfLink;
  robot: RobotState;
  category: 'visual' | 'collision';
  onUpdate: (d: UrdfLink) => void;
  assets: Record<string, string>;
  onUploadAsset: (file: File) => void;
  t: typeof translations['en'];
  isTabbed?: boolean;
}

export const GeometryEditor: React.FC<GeometryEditorProps> = ({
  data,
  robot,
  category,
  onUpdate,
  assets,
  onUploadAsset,
  t,
  isTabbed = false
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [previewMeshPath, setPreviewMeshPath] = useState<string | null>(null);
    const meshAnalysisRef = useRef<MeshAnalysis | null>(null);
    const meshAnalysisKeyRef = useRef<string | null>(null);
    const meshAnalysisCacheRef = useRef<Record<string, MeshAnalysis | null>>({});
    const meshAnalysisPromiseCacheRef = useRef<Record<string, Promise<MeshAnalysis | null>>>({});
    const typeChangeRequestRef = useRef(0);
    const setSelection = useSelectionStore((state) => state.setSelection);

    const selectedCollisionObjectIndex = category === 'collision'
      && robot.selection.type === 'link'
      && robot.selection.id === data.id
      && robot.selection.subType === 'collision'
        ? (robot.selection.objectIndex ?? 0)
        : 0;
    const selectedCollisionGeometry = category === 'collision'
      ? getCollisionGeometryByObjectIndex(data, selectedCollisionObjectIndex)
      : null;
    const geomData = category === 'collision'
      ? (selectedCollisionGeometry?.geometry || data.collision)
      : data.visual;

    const geometrySnapshotCacheRef = useRef<Record<string, Partial<Record<GeometryType, {
      dimensions?: { x: number; y: number; z: number };
      origin?: { xyz: { x: number; y: number; z: number }; rpy: { r: number; p: number; y: number } };
      meshPath?: string;
      color?: string;
    }>>>>({});
    const snapshotKey = category === 'collision'
      ? `${data.id}:${category}:${selectedCollisionGeometry?.bodyIndex ?? 'primary'}`
      : `${data.id}:${category}`;

    const createSnapshot = (source: typeof geomData) => ({
      dimensions: source?.dimensions
        ? {
            x: source.dimensions.x,
            y: source.dimensions.y,
            z: source.dimensions.z,
          }
        : undefined,
      origin: source?.origin
        ? {
            xyz: {
              x: source.origin.xyz.x,
              y: source.origin.xyz.y,
              z: source.origin.xyz.z,
            },
            rpy: {
              r: source.origin.rpy.r,
              p: source.origin.rpy.p,
              y: source.origin.rpy.y,
            },
          }
        : undefined,
      meshPath: source?.meshPath,
      color: source?.color,
    });

    const normalizeColor = (value?: string) => value?.trim().toLowerCase();

    const createMeshAnalysisKey = (geometry: Pick<UrdfVisual, 'meshPath' | 'dimensions'>) =>
      `${geometry.meshPath ?? ''}:${geometry.dimensions?.x ?? 1}:${geometry.dimensions?.y ?? 1}:${geometry.dimensions?.z ?? 1}`;

    const analyzeMeshGeometry = async (
      geometry: Pick<UrdfVisual, 'meshPath' | 'dimensions' | 'type'>,
      signal?: AbortSignal,
    ): Promise<MeshAnalysis | null> => {
      if (geometry.type !== GeometryType.MESH || !geometry.meshPath) {
        return null;
      }

      const analysisKey = createMeshAnalysisKey(geometry);
      const workerResults = await analyzeMeshBatchWithWorker({
        assets,
        tasks: [{
          targetId: analysisKey,
          cacheKey: analysisKey,
          meshPath: geometry.meshPath,
          dimensions: geometry.dimensions,
        }],
        options: GEOMETRY_EDITOR_MESH_ANALYSIS_OPTIONS,
        signal,
      });

      return workerResults[analysisKey] ?? null;
    };

    const cloneGeometry = (geometry: UrdfVisual): UrdfVisual => ({
      ...geometry,
      dimensions: geometry.dimensions
        ? { ...geometry.dimensions }
        : geometry.dimensions,
      origin: geometry.origin
        ? {
            xyz: { ...geometry.origin.xyz },
            rpy: { ...geometry.origin.rpy },
          }
        : geometry.origin,
      meshPath: geometry.meshPath,
      color: geometry.color,
    });

    const update = (newData: Partial<typeof geomData>) => {
        if (category === 'collision') {
            if (selectedCollisionGeometry) {
                onUpdate(updateCollisionGeometryByObjectIndex(data, selectedCollisionObjectIndex, newData));
                return;
            }

            onUpdate({
                ...data,
                collision: {
                    ...data.collision,
                    ...newData,
                },
            });
            return;
        }

        onUpdate({
            ...data,
            visual: {
                ...data.visual,
                ...newData,
            },
        });
    };

    useEffect(() => {
      const currentType = geomData.type || GeometryType.CYLINDER;
      if (!geometrySnapshotCacheRef.current[snapshotKey]) {
        geometrySnapshotCacheRef.current[snapshotKey] = {};
      }
      geometrySnapshotCacheRef.current[snapshotKey][currentType] = createSnapshot(geomData);
    }, [geomData, snapshotKey]);

    useEffect(() => {
      if (geomData.type !== GeometryType.MESH || !geomData.meshPath) {
        return;
      }
      const analysisKey = createMeshAnalysisKey(geomData);
      if (meshAnalysisKeyRef.current === analysisKey && meshAnalysisRef.current) {
        return;
      }
      if (meshAnalysisPromiseCacheRef.current[analysisKey]) {
        return;
      }
      meshAnalysisKeyRef.current = analysisKey;
      meshAnalysisRef.current = null;
      const controller = new AbortController();
      const analysisPromise = analyzeMeshGeometry(geomData, controller.signal);
      meshAnalysisPromiseCacheRef.current[analysisKey] = analysisPromise;
      void analysisPromise.then((analysis) => {
        if (meshAnalysisPromiseCacheRef.current[analysisKey] === analysisPromise) {
          delete meshAnalysisPromiseCacheRef.current[analysisKey];
        }
        if (!controller.signal.aborted) {
          meshAnalysisCacheRef.current[analysisKey] = analysis;
          meshAnalysisRef.current = analysis;
        }
      }).catch(() => {
        if (meshAnalysisPromiseCacheRef.current[analysisKey] === analysisPromise) {
          delete meshAnalysisPromiseCacheRef.current[analysisKey];
        }
      });
      return () => { controller.abort(); };
    }, [geomData.meshPath, geomData.type, geomData.dimensions?.x, geomData.dimensions?.y, geomData.dimensions?.z, assets]);

    const resolveMeshAnalysisForGeometry = async (geometry: UrdfVisual): Promise<MeshAnalysis | null> => {
        if (geometry.type !== GeometryType.MESH || !geometry.meshPath) {
          return null;
        }

        const analysisKey = createMeshAnalysisKey(geometry);
        if (analysisKey in meshAnalysisCacheRef.current) {
          return meshAnalysisCacheRef.current[analysisKey];
        }
        if (meshAnalysisKeyRef.current === analysisKey && meshAnalysisRef.current) {
          meshAnalysisCacheRef.current[analysisKey] = meshAnalysisRef.current;
          return meshAnalysisRef.current;
        }

        const pendingAnalysis = meshAnalysisPromiseCacheRef.current[analysisKey];
        if (pendingAnalysis) {
          const analysis = await pendingAnalysis;
          meshAnalysisCacheRef.current[analysisKey] = analysis;
          return analysis;
        }

        const analysisPromise = analyzeMeshGeometry(geometry);
        meshAnalysisPromiseCacheRef.current[analysisKey] = analysisPromise;
        try {
          const analysis = await analysisPromise;
          meshAnalysisCacheRef.current[analysisKey] = analysis;

          if (geometry.meshPath === geomData.meshPath && analysisKey === createMeshAnalysisKey(geomData)) {
            meshAnalysisKeyRef.current = analysisKey;
            meshAnalysisRef.current = analysis;
          }

          return analysis;
        } finally {
          if (meshAnalysisPromiseCacheRef.current[analysisKey] === analysisPromise) {
            delete meshAnalysisPromiseCacheRef.current[analysisKey];
          }
        }
    };

    const resolveCollisionClearanceContext = async (): Promise<{
      siblingGeometries?: UrdfVisual[];
      meshClearanceObstacles?: MeshClearanceObstacle[];
      overlapAllowanceRatio?: number;
      fitVolumeWindowRatio?: number;
    }> => {
        if (category !== 'collision') {
          return {};
        }

        return {
          overlapAllowanceRatio: GEOMETRY_EDITOR_RELAXED_OVERLAP_ALLOWANCE_RATIO,
          fitVolumeWindowRatio: GEOMETRY_EDITOR_RELAXED_FIT_VOLUME_WINDOW_RATIO,
        };
    };

    const handleApplyMesh = () => {
        if (previewMeshPath) {
            update({ meshPath: previewMeshPath });
            setPreviewMeshPath(null);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            onUploadAsset(e.target.files[0]);
        }
    };

    // Memoized auto-align calculation
    const autoAlignResult = useMemo(
      () => computeAutoAlign(robot, data.id),
      [robot.joints, data.id]
    );

    const handleAutoAlign = () => {
       if (!autoAlignResult) return;

       const currentDims = geomData.dimensions || { x: 0.05, y: 0.5, z: 0.05 };
       const newDims = { ...currentDims, y: autoAlignResult.dimensions.y };

       update({
          dimensions: newDims,
          origin: autoAlignResult.origin
       });
    };

    const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newType = e.target.value as GeometryType;
        const currentType = geomData.type || GeometryType.CYLINDER;
        if (newType === currentType) return;

        if (!geometrySnapshotCacheRef.current[snapshotKey]) {
          geometrySnapshotCacheRef.current[snapshotKey] = {};
        }
        const cacheByType = geometrySnapshotCacheRef.current[snapshotKey];
        cacheByType[currentType] = createSnapshot(geomData);

        const cachedTarget = cacheByType[newType];
        const representativeMeshColor =
          currentType === GeometryType.MESH && newType !== GeometryType.MESH
            ? meshAnalysisRef.current?.representativeColor
            : undefined;
        if (cachedTarget) {
          const shouldUseRepresentativeMeshColor =
            Boolean(representativeMeshColor) &&
            newType !== GeometryType.MESH &&
            (
              !cachedTarget.color ||
              normalizeColor(cachedTarget.color) === normalizeColor(geomData.color)
            );

          update({
            type: newType,
            dimensions: cachedTarget.dimensions || geomData.dimensions,
            origin: cachedTarget.origin || geomData.origin,
            meshPath: newType === GeometryType.MESH ? cachedTarget.meshPath : undefined,
            color: shouldUseRepresentativeMeshColor
              ? representativeMeshColor
              : (cachedTarget.color || geomData.color),
          });
          return;
        }

        const requestId = ++typeChangeRequestRef.current;

        void (async () => {
          await yieldToNextFrame();

          const meshAnalysis =
            currentType === GeometryType.MESH
              ? await resolveMeshAnalysisForGeometry(geomData)
              : undefined;
          const resolvedRepresentativeMeshColor =
            currentType === GeometryType.MESH && newType !== GeometryType.MESH
              ? meshAnalysis?.representativeColor
              : undefined;
          const clearanceContext = newType !== GeometryType.MESH
            ? await resolveCollisionClearanceContext()
            : undefined;

          if (typeChangeRequestRef.current !== requestId) {
            return;
          }

          const converted = convertGeometryType(geomData, newType, meshAnalysis ?? undefined, clearanceContext);
          const nextGeom = {
            ...converted,
            meshPath: newType === GeometryType.MESH ? geomData.meshPath : undefined,
            color: newType === GeometryType.MESH
              ? geomData.color
              : resolvedRepresentativeMeshColor || geomData.color,
          };

          cacheByType[newType] = createSnapshot(nextGeom);
          update(nextGeom);
        })();
    };

    const handleDeleteCollision = () => {
        if (category !== 'collision') return;

        if (!selectedCollisionGeometry) {
            if (data.collision.type === GeometryType.NONE) return;
            onUpdate({
                ...data,
                collision: {
                    ...data.collision,
                    type: GeometryType.NONE,
                    meshPath: undefined,
                },
            });
            setSelection({ type: 'link', id: data.id });
            return;
        }

        const { link: nextLink, removed, nextObjectIndex } = removeCollisionGeometryByObjectIndex(
            data,
            selectedCollisionObjectIndex,
        );

        if (!removed) return;

        onUpdate(nextLink);
        if (nextObjectIndex === null) {
            setSelection({ type: 'link', id: data.id });
            return;
        }

        setSelection({
            type: 'link',
            id: data.id,
            subType: 'collision',
            objectIndex: nextObjectIndex,
        });
    };

    return (
        <div className={isTabbed ? "pt-1" : "border-t border-border-black pt-4"}>
            {!isTabbed && (
                <div className="mb-2.5">
                    <h3 className={`${PROPERTY_EDITOR_SECTION_TITLE_CLASS} capitalize`}>{category === 'visual' ? t.visualGeometry : t.collisionGeometry}</h3>
                </div>
            )}

            <InputGroup label={t.type}>
                <div className="flex items-center gap-2">
                    <select
                        value={geomData.type || GeometryType.CYLINDER}
                        onChange={handleTypeChange}
                        className={`${PROPERTY_EDITOR_SELECT_CLASS} min-w-0 flex-1`}
                    >
                        <option value={GeometryType.BOX}>{t.box}</option>
                        <option value={GeometryType.CYLINDER}>{t.cylinder}</option>
                        <option value={GeometryType.SPHERE}>{t.sphere}</option>
                        <option value={GeometryType.CAPSULE}>{t.capsule}</option>
                        <option value={GeometryType.MESH}>{t.mesh}</option>
                        <option value={GeometryType.NONE}>{t.none}</option>
                    </select>
                    {geomData.type === GeometryType.CYLINDER && (
                        <button
                            onClick={handleAutoAlign}
                            className={`${PROPERTY_EDITOR_SECONDARY_BUTTON_CLASS} h-8 shrink-0 px-2`}
                            title={t.autoAlign}
                        >
                            <Wand className="w-3.5 h-3.5" />
                            <span>{t.autoAlign}</span>
                        </button>
                    )}
                </div>
            </InputGroup>

            {/* Mesh Selection UI */}
            {geomData.type === GeometryType.MESH && (
                <div className="mb-4 bg-element-bg p-2 rounded-lg border border-border-black">
                    <InputGroup label={t.meshLibrary}>
                        <div className="flex flex-col gap-2">
                             <div className="flex items-center gap-2">
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    className="hidden"
                                    accept=".stl,.STL,.obj,.OBJ,.dae,.DAE,.gltf,.GLTF,.glb,.GLB"
                                    onChange={handleFileChange}
                                />
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className={PROPERTY_EDITOR_PRIMARY_BUTTON_CLASS}
                                >
                                    <Upload className="w-3 h-3" />
                                    {t.upload}
                                </button>
                             </div>

                             <div className="max-h-32 overflow-y-auto custom-scrollbar flex flex-col gap-1 mt-1">
                                {Object.keys(assets).filter(f => /\.(stl|obj|dae|gltf|glb)$/i.test(f)).length === 0 && (
                                    <div className={`${PROPERTY_EDITOR_HELPER_TEXT_CLASS} italic`}></div>
                                )}
                                {Object.keys(assets).filter(f => /\.(stl|obj|dae|gltf|glb)$/i.test(f)).map(filename => {
                                    const isApplied = geomData.meshPath === filename && !previewMeshPath;
                                    const isPreviewing = previewMeshPath === filename;
                                    return (
                                        <div
                                            key={filename}
                                            onClick={() => setPreviewMeshPath(filename)}
                                            onDoubleClick={() => {
                                                update({ meshPath: filename });
                                                setPreviewMeshPath(null);
                                            }}
                                            className={`
                                                flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer text-[11px] transition-colors
                                                ${isApplied
                                                    ? 'bg-system-blue/10 dark:bg-system-blue/20 text-system-blue border border-system-blue/30 dark:border-system-blue/35'
                                                    : isPreviewing
                                                        ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700'
                                                        : 'hover:bg-element-hover text-text-secondary dark:text-text-secondary'
                                                }
                                            `}
                                        >
                                            <File className="w-3 h-3 shrink-0" />
                                            <span className="truncate">{filename}</span>
                                            {isApplied && <Check className="w-3 h-3 shrink-0 ml-auto" />}
                                        </div>
                                    );
                                })}
                             </div>

                             {/* Inline 3D Preview */}
                             {previewMeshPath && (
                                 <div className="mt-1 flex flex-col gap-1.5">
                                     <MeshPreview meshPath={previewMeshPath} assets={assets} notFoundText={t.meshNotFound} />
                                     <div className="flex items-center gap-2">
                                         <button
                                             onClick={handleApplyMesh}
                                             className={`${PROPERTY_EDITOR_PRIMARY_BUTTON_CLASS} flex-1`}
                                         >
                                             <Check className="w-3 h-3" />
                                             {t.applyMesh}
                                         </button>
                                         <button
                                             onClick={() => setPreviewMeshPath(null)}
                                             className={`${PROPERTY_EDITOR_SECONDARY_BUTTON_CLASS} flex-1`}
                                         >
                                             {t.cancel}
                                         </button>
                                     </div>
                                 </div>
                             )}

                             {geomData.meshPath && !previewMeshPath && (
                                 <div className={`${PROPERTY_EDITOR_HELPER_TEXT_CLASS} truncate mt-1`}>
                                     {t.selected}: <span className="text-system-blue">{geomData.meshPath}</span>
                                 </div>
                             )}

                             {/* Hint for double-click */}
                             {!previewMeshPath && Object.keys(assets).length > 0 && (
                                 <div className={`${PROPERTY_EDITOR_HELPER_TEXT_CLASS} mt-0.5`}>
                                     {t.meshHint}
                                 </div>
                             )}
                        </div>
                    </InputGroup>
                </div>
            )}

            {/* Box dimensions: Width (X), Depth (Y), Height (Z) */}
            {geomData.type === GeometryType.BOX && (
                <InputGroup label={t.dimensions}>
                    <div className="grid grid-cols-3 gap-2">
                        <NumberInput
                            label={t.width || 'Width (X)'}
                            value={geomData.dimensions?.x || 0.1}
                            onChange={(v: number) => update({ dimensions: { ...geomData.dimensions, x: v } })}
                            step={GEOMETRY_DIMENSION_STEP}
                            precision={MAX_GEOMETRY_DIMENSION_DECIMALS}
                        />
                        <NumberInput
                            label={t.depth || 'Depth (Y)'}
                            value={geomData.dimensions?.y || 0.1}
                            onChange={(v: number) => update({ dimensions: { ...geomData.dimensions, y: v } })}
                            step={GEOMETRY_DIMENSION_STEP}
                            precision={MAX_GEOMETRY_DIMENSION_DECIMALS}
                        />
                        <NumberInput
                            label={t.height || 'Height (Z)'}
                            value={geomData.dimensions?.z || 0.1}
                            onChange={(v: number) => update({ dimensions: { ...geomData.dimensions, z: v } })}
                            step={GEOMETRY_DIMENSION_STEP}
                            precision={MAX_GEOMETRY_DIMENSION_DECIMALS}
                        />
                    </div>
                </InputGroup>
            )}

            {/* Sphere dimensions: Radius only */}
            {geomData.type === GeometryType.SPHERE && (
                <InputGroup label={t.dimensions}>
                    <NumberInput
                        label={t.radius || 'Radius'}
                        value={geomData.dimensions?.x || 0.1}
                        onChange={(v: number) => update({ dimensions: { x: v, y: v, z: v } })}
                        step={GEOMETRY_DIMENSION_STEP}
                        precision={MAX_GEOMETRY_DIMENSION_DECIMALS}
                    />
                </InputGroup>
            )}

            {/* Cylinder dimensions: Radius and Height */}
            {geomData.type === GeometryType.CYLINDER && (
                <InputGroup label={t.dimensions}>
                    <div className="grid grid-cols-2 gap-2">
                        <NumberInput
                            label={t.radius || 'Radius'}
                            value={geomData.dimensions?.x || 0.05}
                            onChange={(v: number) => update({ dimensions: { ...geomData.dimensions, x: v, z: v } })}
                            step={GEOMETRY_DIMENSION_STEP}
                            precision={MAX_GEOMETRY_DIMENSION_DECIMALS}
                        />
                        <NumberInput
                            label={t.height || 'Height'}
                            value={geomData.dimensions?.y || 0.5}
                            onChange={(v: number) => update({ dimensions: { ...geomData.dimensions, y: v } })}
                            step={GEOMETRY_DIMENSION_STEP}
                            precision={MAX_GEOMETRY_DIMENSION_DECIMALS}
                        />
                    </div>
                </InputGroup>
            )}

            {/* Capsule dimensions: Radius and Total Length */}
            {geomData.type === GeometryType.CAPSULE && (
                <InputGroup label={t.dimensions}>
                    <div className="grid grid-cols-2 gap-2">
                        <NumberInput
                            label={t.radius || 'Radius'}
                            value={geomData.dimensions?.x || 0.05}
                            onChange={(v: number) => update({ dimensions: { ...geomData.dimensions, x: v, z: v } })}
                            step={GEOMETRY_DIMENSION_STEP}
                            precision={MAX_GEOMETRY_DIMENSION_DECIMALS}
                        />
                        <NumberInput
                            label={t.totalLength || 'Total Length'}
                            value={geomData.dimensions?.y || 0.5}
                            onChange={(v: number) => update({ dimensions: { ...geomData.dimensions, y: v } })}
                            step={GEOMETRY_DIMENSION_STEP}
                            precision={MAX_GEOMETRY_DIMENSION_DECIMALS}
                        />
                    </div>
                </InputGroup>
            )}

            {geomData.type !== GeometryType.NONE && (
                <InputGroup label={t.originRelativeLink}>
                    <div className="space-y-2">
                    <Vec3InlineInput
                        value={geomData.origin?.xyz || {x:0, y:0, z:0}}
                        onChange={(v) => update({
                            origin: { ...(geomData.origin || { rpy: {r:0,p:0,y:0} }), xyz: v as { x: number; y: number; z: number } }
                        })}
                        labels={['X', 'Y', 'Z']}
                        compact
                        step={TRANSFORM_STEP}
                        precision={MAX_TRANSFORM_DECIMALS}
                    />
                    <Vec3InlineInput
                        value={geomData.origin?.rpy || {r:0, p:0, y:0}}
                        onChange={(v) => update({
                            origin: { ...(geomData.origin || { xyz: {x:0,y:0,z:0} }), rpy: v as { r: number; p: number; y: number } }
                        })}
                        labels={[t.roll, t.pitch, t.yaw]}
                        keys={['r', 'p', 'y']}
                        compact
                        step={TRANSFORM_STEP}
                        precision={MAX_TRANSFORM_DECIMALS}
                    />
                    </div>
                </InputGroup>
            )}

            {category === 'visual' && geomData.type !== GeometryType.NONE && (
                <InputGroup label={t.color}>
                    <div className="flex gap-2">
                        <input
                            type="color"
                            value={geomData.color || '#ffffff'}
                            onChange={(e) => update({ color: e.target.value })}
                            className="h-8 w-8 rounded cursor-pointer border-none p-0 bg-transparent"
                        />
                        <input
                            type="text"
                            value={geomData.color || '#ffffff'}
                            onChange={(e) => update({ color: e.target.value })}
                            className={`${PROPERTY_EDITOR_INPUT_CLASS} flex-1`}
                        />
                    </div>
                </InputGroup>
            )}

            {category === 'collision' && geomData.type !== GeometryType.NONE && (
                <div className="mt-4 border-t border-border-black pt-3">
                    <button
                        type="button"
                        onClick={handleDeleteCollision}
                        className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-2.5 text-[11px] font-medium text-red-600 transition-colors hover:bg-red-100 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300 dark:hover:bg-red-900/30"
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>{t.deleteCollisionGeometry}</span>
                    </button>
                </div>
            )}
        </div>
    );
};
