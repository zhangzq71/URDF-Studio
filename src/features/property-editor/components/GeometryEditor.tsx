/**
 * GeometryEditor - Visual/Collision geometry editing for a Link.
 * Handles geometry type selection, dimension editing, mesh selection,
 * origin/rotation, color, and auto-align.
 */
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Upload, File, Wand, Check } from 'lucide-react';
import type { RobotState, UrdfLink } from '@/types';
import { GeometryType } from '@/types';
import { translations } from '@/shared/i18n';
import { InputGroup, NumberInput, Vec3Input } from './FormControls';
import { MeshPreview } from './MeshPreview';
import { computeAutoAlign, convertGeometryType } from '../utils/geometryConversion';

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const geomData = data[category] || {} as any;
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [previewMeshPath, setPreviewMeshPath] = useState<string | null>(null);
    const geometrySnapshotCacheRef = useRef<Record<string, Partial<Record<GeometryType, {
      dimensions?: { x: number; y: number; z: number };
      origin?: { xyz: { x: number; y: number; z: number }; rpy: { r: number; p: number; y: number } };
      meshPath?: string;
      color?: string;
    }>>>>({});
    const snapshotKey = `${data.id}:${category}`;

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

    const update = (newData: Partial<typeof geomData>) => {
        onUpdate({ ...data, [category]: { ...geomData, ...newData } });
    };

    useEffect(() => {
      const currentType = geomData.type || GeometryType.CYLINDER;
      if (!geometrySnapshotCacheRef.current[snapshotKey]) {
        geometrySnapshotCacheRef.current[snapshotKey] = {};
      }
      geometrySnapshotCacheRef.current[snapshotKey][currentType] = createSnapshot(geomData);
    }, [geomData, snapshotKey]);

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
        if (cachedTarget) {
          update({
            type: newType,
            dimensions: cachedTarget.dimensions || geomData.dimensions,
            origin: cachedTarget.origin || geomData.origin,
            meshPath: newType === GeometryType.MESH ? cachedTarget.meshPath : undefined,
            color: cachedTarget.color || geomData.color,
          });
          return;
        }

        const converted = convertGeometryType(geomData, newType);
        const nextGeom = {
          ...converted,
          meshPath: newType === GeometryType.MESH ? geomData.meshPath : undefined,
          color: geomData.color,
        };
        cacheByType[newType] = createSnapshot(nextGeom);
        update(nextGeom);
    };

    return (
        <div className={isTabbed ? "pt-2" : "border-t border-border-black pt-4"}>
            <div className={`flex items-center justify-between ${isTabbed ? 'mb-2' : 'mb-3'}`}>
                {!isTabbed && <h3 className="text-sm font-bold text-text-primary capitalize">{category === 'visual' ? t.visualGeometry : t.collisionGeometry}</h3>}
                {isTabbed && <div />} {/* Spacer */}
                {geomData.type === GeometryType.CYLINDER && (
                    <button
                        onClick={handleAutoAlign}
                        className="p-1 hover:bg-element-hover rounded text-system-blue hover:text-system-blue-hover transition-colors"
                        title={t.autoAlign}
                    >
                        <Wand className="w-4 h-4" />
                    </button>
                )}
            </div>

            <InputGroup label={t.type}>
                <select
                    value={geomData.type || GeometryType.CYLINDER}
                    onChange={handleTypeChange}
                    className="bg-input-bg border border-border-strong rounded-lg px-2 py-1 text-sm text-text-primary w-full focus:outline-none focus:border-system-blue"
                >
                    <option value={GeometryType.BOX}>{t.box}</option>
                    <option value={GeometryType.CYLINDER}>{t.cylinder}</option>
                    <option value={GeometryType.SPHERE}>{t.sphere}</option>
                    <option value={GeometryType.CAPSULE}>{t.capsule}</option>
                    <option value={GeometryType.MESH}>{t.mesh}</option>
                    <option value={GeometryType.NONE}>{t.none}</option>
                </select>
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
                                    className="flex items-center gap-1 bg-system-blue-solid hover:bg-system-blue-hover text-white text-xs px-2 py-1 rounded transition-colors"
                                >
                                    <Upload className="w-3 h-3" />
                                    {t.upload}
                                </button>
                             </div>

                             <div className="max-h-32 overflow-y-auto custom-scrollbar flex flex-col gap-1 mt-1">
                                {Object.keys(assets).filter(f => /\.(stl|obj|dae|gltf|glb)$/i.test(f)).length === 0 && (
                                    <div className="text-[10px] text-text-tertiary italic"></div>
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
                                                flex items-center gap-2 p-1.5 rounded cursor-pointer text-xs transition-colors
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
                                             className="flex-1 flex items-center justify-center gap-1 bg-system-blue-solid hover:bg-system-blue-hover text-white text-xs px-2 py-1.5 rounded transition-colors"
                                         >
                                             <Check className="w-3 h-3" />
                                             {t.applyMesh}
                                         </button>
                                         <button
                                             onClick={() => setPreviewMeshPath(null)}
                                             className="flex-1 text-xs px-2 py-1.5 rounded border border-border-strong text-text-secondary hover:bg-element-hover transition-colors"
                                         >
                                             {t.cancel}
                                         </button>
                                     </div>
                                 </div>
                             )}

                             {geomData.meshPath && !previewMeshPath && (
                                 <div className="text-[10px] text-text-tertiary truncate mt-1">
                                     {t.selected}: <span className="text-system-blue">{geomData.meshPath}</span>
                                 </div>
                             )}

                             {/* Hint for double-click */}
                             {!previewMeshPath && Object.keys(assets).length > 0 && (
                                 <div className="text-[9px] text-text-tertiary mt-0.5">
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
                            step={0.01}
                        />
                        <NumberInput
                            label={t.depth || 'Depth (Y)'}
                            value={geomData.dimensions?.y || 0.1}
                            onChange={(v: number) => update({ dimensions: { ...geomData.dimensions, y: v } })}
                            step={0.01}
                        />
                        <NumberInput
                            label={t.height || 'Height (Z)'}
                            value={geomData.dimensions?.z || 0.1}
                            onChange={(v: number) => update({ dimensions: { ...geomData.dimensions, z: v } })}
                            step={0.01}
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
                        step={0.01}
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
                            step={0.01}
                        />
                        <NumberInput
                            label={t.height || 'Height'}
                            value={geomData.dimensions?.y || 0.5}
                            onChange={(v: number) => update({ dimensions: { ...geomData.dimensions, y: v } })}
                            step={0.01}
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
                            step={0.01}
                        />
                        <NumberInput
                            label={t.totalLength || 'Total Length'}
                            value={geomData.dimensions?.y || 0.5}
                            onChange={(v: number) => update({ dimensions: { ...geomData.dimensions, y: v } })}
                            step={0.01}
                        />
                    </div>
                </InputGroup>
            )}

            {geomData.type !== GeometryType.NONE && (
                <InputGroup label={t.originRelativeLink}>
                    <div className="space-y-2">
                    <div className="text-[10px] text-text-tertiary">{t.position}</div>
                    <Vec3Input
                        value={geomData.origin?.xyz || {x:0, y:0, z:0}}
                        onChange={(v) => update({
                            origin: { ...(geomData.origin || { rpy: {r:0,p:0,y:0} }), xyz: v as { x: number; y: number; z: number } }
                        })}
                        labels={['X', 'Y', 'Z']}
                    />
                    <div className="text-[10px] text-text-tertiary mt-2">{t.rotation}</div>
                    <Vec3Input
                        value={geomData.origin?.rpy || {r:0, p:0, y:0}}
                        onChange={(v) => update({
                            origin: { ...(geomData.origin || { xyz: {x:0,y:0,z:0} }), rpy: v as { r: number; p: number; y: number } }
                        })}
                        labels={[t.roll, t.pitch, t.yaw]}
                        keys={['r', 'p', 'y']}
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
                            className="bg-input-bg border border-border-strong rounded-lg px-2 py-1 text-sm text-text-primary flex-1 focus:outline-none focus:border-system-blue"
                        />
                    </div>
                </InputGroup>
            )}
        </div>
    );
};
