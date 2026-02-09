/**
 * GeometryEditor - Visual/Collision geometry editing for a Link.
 * Handles geometry type selection, dimension editing, mesh selection,
 * origin/rotation, color, and auto-align.
 */
import React, { useState, useRef, useMemo } from 'react';
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

    const update = (newData: Partial<typeof geomData>) => {
        onUpdate({ ...data, [category]: { ...geomData, ...newData } });
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
        const result = convertGeometryType(geomData, newType);
        update(result);
    };

    return (
        <div className={isTabbed ? "pt-2" : "border-t border-slate-200 dark:border-slate-700 pt-4"}>
            <div className={`flex items-center justify-between ${isTabbed ? 'mb-2' : 'mb-3'}`}>
                {!isTabbed && <h3 className="text-sm font-bold text-slate-900 dark:text-slate-200 capitalize">{category === 'visual' ? t.visualGeometry : t.collisionGeometry}</h3>}
                {isTabbed && <div />} {/* Spacer */}
                {geomData.type === GeometryType.CYLINDER && (
                    <button
                        onClick={handleAutoAlign}
                        className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 transition-colors"
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
                    className="bg-white dark:bg-[#000000] border border-slate-300 dark:border-[#48484A] rounded-lg px-2 py-1 text-sm text-slate-900 dark:text-white w-full"
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
                <div className="mb-4 bg-slate-100 dark:bg-google-dark-surface p-2 rounded-lg border border-slate-200 dark:border-google-dark-border">
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
                                    className="flex items-center gap-1 bg-google-blue hover:bg-blue-600 text-white text-xs px-2 py-1 rounded transition-colors"
                                >
                                    <Upload className="w-3 h-3" />
                                    {t.upload}
                                </button>
                             </div>

                             <div className="max-h-32 overflow-y-auto custom-scrollbar flex flex-col gap-1 mt-1">
                                {Object.keys(assets).filter(f => /\.(stl|obj|dae|gltf|glb)$/i.test(f)).length === 0 && (
                                    <div className="text-[10px] text-slate-500 italic"></div>
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
                                                    ? 'bg-blue-100 dark:bg-[#0060FA] text-google-blue dark:text-white border border-blue-200 dark:border-transparent'
                                                    : isPreviewing
                                                        ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700'
                                                        : 'hover:bg-slate-200 dark:hover:bg-google-dark-bg text-slate-700 dark:text-slate-300'
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
                                     <MeshPreview meshPath={previewMeshPath} assets={assets} />
                                     <div className="flex items-center gap-2">
                                         <button
                                             onClick={handleApplyMesh}
                                             className="flex-1 flex items-center justify-center gap-1 bg-google-blue hover:bg-blue-600 text-white text-xs px-2 py-1.5 rounded transition-colors"
                                         >
                                             <Check className="w-3 h-3" />
                                             {t.applyMesh}
                                         </button>
                                         <button
                                             onClick={() => setPreviewMeshPath(null)}
                                             className="flex-1 text-xs px-2 py-1.5 rounded border border-slate-300 dark:border-google-dark-border text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-google-dark-bg transition-colors"
                                         >
                                             {t.cancel}
                                         </button>
                                     </div>
                                 </div>
                             )}

                             {geomData.meshPath && !previewMeshPath && (
                                 <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-1">
                                     {t.selected}: <span className="text-google-blue dark:text-blue-400">{geomData.meshPath}</span>
                                 </div>
                             )}

                             {/* Hint for double-click */}
                             {!previewMeshPath && Object.keys(assets).length > 0 && (
                                 <div className="text-[9px] text-slate-400 dark:text-slate-500 mt-0.5">
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
                    <div className="text-[10px] text-slate-400">{t.position}</div>
                    <Vec3Input
                        value={geomData.origin?.xyz || {x:0, y:0, z:0}}
                        onChange={(v) => update({
                            origin: { ...(geomData.origin || { rpy: {r:0,p:0,y:0} }), xyz: v as { x: number; y: number; z: number } }
                        })}
                        labels={['X', 'Y', 'Z']}
                    />
                    <div className="text-[10px] text-slate-400 mt-2">{t.rotation}</div>
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
                            className="bg-white dark:bg-google-dark-surface border border-slate-300 dark:border-google-dark-border rounded-lg px-2 py-1 text-sm text-slate-900 dark:text-white flex-1"
                        />
                    </div>
                </InputGroup>
            )}
        </div>
    );
};
