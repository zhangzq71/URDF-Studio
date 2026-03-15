export interface MJCFCompilerSettings {
    angleUnit: 'radian' | 'degree';
    meshdir: string;
}

export interface MJCFMesh {
    name: string;
    file: string;
    scale?: number[];
}

export interface MJCFMaterial {
    name: string;
    rgba?: number[];
    shininess?: number;
    specular?: number;
}

export interface MJCFPosition {
    x: number;
    y: number;
    z: number;
}

export interface MJCFQuaternion {
    w: number;
    x: number;
    y: number;
    z: number;
}

type MJCFElementType = 'body' | 'geom' | 'joint' | 'inertial' | 'mesh';

type MJCFAttributeMap = Record<string, string>;

interface MJCFElementDefaults {
    body: MJCFAttributeMap;
    geom: MJCFAttributeMap;
    joint: MJCFAttributeMap;
    inertial: MJCFAttributeMap;
    mesh: MJCFAttributeMap;
}

interface MJCFDefaultClassEntry {
    qname: string;
    className: string;
    parentQName?: string;
    defaults: MJCFElementDefaults;
    children: string[];
}

export interface MJCFDefaultsRegistry {
    root: MJCFElementDefaults;
    classesByQName: Map<string, MJCFDefaultClassEntry>;
    qnamesByClassName: Map<string, string[]>;
}

const MJCF_ROOT_PATTERN = /^\s*(?:<\?xml[\s\S]*?\?>\s*)?(?:<!--[\s\S]*?-->\s*)*(?:<!DOCTYPE[\s\S]*?>\s*)*<mujoco\b/i;

export function looksLikeMJCFDocument(content: string): boolean {
    if (!content) {
        return false;
    }

    return MJCF_ROOT_PATTERN.test(content.slice(0, 2048));
}

export function parseNumbers(str: string | null): number[] {
    if (!str) return [];

    return str.trim().split(/\s+/).map((segment) => {
        const value = parseFloat(segment);
        return isNaN(value) ? 0 : value;
    });
}

export function parseCompilerSettings(doc: Document): MJCFCompilerSettings {
    const compiler = doc.querySelector('compiler');
    // MuJoCo defaults compiler angle units to degrees when the attribute is omitted.
    const angleAttr = compiler?.getAttribute('angle')?.toLowerCase() || 'degree';
    const meshdir = compiler?.getAttribute('meshdir') || '';

    return {
        angleUnit: angleAttr === 'degree' ? 'degree' : 'radian',
        meshdir
    };
}

export function parsePosAsTuple(str: string | null): [number, number, number] {
    const nums = parseNumbers(str);

    return [
        nums.length > 0 ? nums[0] : 0,
        nums.length > 1 ? nums[1] : 0,
        nums.length > 2 ? nums[2] : 0
    ];
}

export function parsePosAsObject(str: string | null): MJCFPosition {
    const [x, y, z] = parsePosAsTuple(str);
    return { x, y, z };
}

export function parseQuatAsTuple(str: string | null): [number, number, number, number] | undefined {
    const nums = parseNumbers(str);
    if (nums.length < 4) return undefined;

    const w = nums[0];
    const x = nums[1];
    const y = nums[2];
    const z = nums[3];
    const length = Math.hypot(w, x, y, z);

    if (length <= 1e-8) {
        return [1, 0, 0, 0];
    }

    return [w / length, x / length, y / length, z / length];
}

export function parseQuatAsObject(str: string | null): MJCFQuaternion | undefined {
    const quat = parseQuatAsTuple(str);
    if (!quat) return undefined;

    const [w, x, y, z] = quat;
    return { w, x, y, z };
}

function createEmptyDefaults(): MJCFElementDefaults {
    return {
        body: {},
        geom: {},
        joint: {},
        inertial: {},
        mesh: {},
    };
}

function cloneDefaults(defaults: MJCFElementDefaults): MJCFElementDefaults {
    return {
        body: { ...defaults.body },
        geom: { ...defaults.geom },
        joint: { ...defaults.joint },
        inertial: { ...defaults.inertial },
        mesh: { ...defaults.mesh },
    };
}

function mergeDefaults(base: MJCFElementDefaults, override: Partial<MJCFElementDefaults>): MJCFElementDefaults {
    return {
        body: { ...base.body, ...(override.body || {}) },
        geom: { ...base.geom, ...(override.geom || {}) },
        joint: { ...base.joint, ...(override.joint || {}) },
        inertial: { ...base.inertial, ...(override.inertial || {}) },
        mesh: { ...base.mesh, ...(override.mesh || {}) },
    };
}

function collectDirectAttributes(element: Element, selector: MJCFElementType): MJCFAttributeMap {
    const directChild = element.querySelector(`:scope > ${selector}`);
    if (!directChild) {
        return {};
    }

    const attributes: MJCFAttributeMap = {};
    for (const attribute of Array.from(directChild.attributes)) {
        attributes[attribute.name] = attribute.value;
    }

    return attributes;
}

function collectDefaultAttributes(defaultEl: Element): Partial<MJCFElementDefaults> {
    return {
        body: collectDirectAttributes(defaultEl, 'body'),
        geom: collectDirectAttributes(defaultEl, 'geom'),
        joint: collectDirectAttributes(defaultEl, 'joint'),
        inertial: collectDirectAttributes(defaultEl, 'inertial'),
        mesh: collectDirectAttributes(defaultEl, 'mesh'),
    };
}

function registerDefaultClass(
    registry: MJCFDefaultsRegistry,
    className: string,
    qname: string,
    parentQName: string | undefined,
    defaults: MJCFElementDefaults,
): void {
    const entry: MJCFDefaultClassEntry = {
        qname,
        className,
        parentQName,
        defaults,
        children: [],
    };

    registry.classesByQName.set(qname, entry);

    const qnames = registry.qnamesByClassName.get(className) || [];
    qnames.push(qname);
    registry.qnamesByClassName.set(className, qnames);

    if (parentQName) {
        const parent = registry.classesByQName.get(parentQName);
        if (parent) {
            parent.children.push(qname);
        }
    }
}

function visitDefaultElement(
    defaultEl: Element,
    registry: MJCFDefaultsRegistry,
    scopeDefaults: MJCFElementDefaults,
    activeNamedQName?: string,
): MJCFElementDefaults {
    const mergedDefaults = mergeDefaults(scopeDefaults, collectDefaultAttributes(defaultEl));
    const className = defaultEl.getAttribute('class')?.trim();

    let nextNamedQName = activeNamedQName;
    if (className) {
        nextNamedQName = activeNamedQName ? `${activeNamedQName}/${className}` : className;
        registerDefaultClass(registry, className, nextNamedQName, activeNamedQName, cloneDefaults(mergedDefaults));
    }

    const childDefaults = cloneDefaults(mergedDefaults);
    const childDefaultElements = defaultEl.querySelectorAll(':scope > default');
    childDefaultElements.forEach((childDefaultEl) => {
        visitDefaultElement(childDefaultEl, registry, childDefaults, nextNamedQName);
    });

    return mergedDefaults;
}

export function parseMJCFDefaults(doc: Document): MJCFDefaultsRegistry {
    const registry: MJCFDefaultsRegistry = {
        root: createEmptyDefaults(),
        classesByQName: new Map<string, MJCFDefaultClassEntry>(),
        qnamesByClassName: new Map<string, string[]>(),
    };

    const mujocoEl = doc.querySelector('mujoco');
    if (!mujocoEl) {
        return registry;
    }

    const topLevelDefaults = mujocoEl.querySelectorAll(':scope > default');
    topLevelDefaults.forEach((defaultEl) => {
        const mergedDefaults = visitDefaultElement(defaultEl, registry, registry.root, undefined);
        if (!defaultEl.getAttribute('class')) {
            registry.root = mergeDefaults(registry.root, mergedDefaults);
        }
    });

    return registry;
}

function findDescendantClassQName(
    registry: MJCFDefaultsRegistry,
    rootQName: string,
    className: string,
): string | undefined {
    const root = registry.classesByQName.get(rootQName);
    if (!root) {
        return undefined;
    }

    for (const childQName of root.children) {
        const child = registry.classesByQName.get(childQName);
        if (!child) {
            continue;
        }

        if (child.className === className) {
            return child.qname;
        }

        const nestedMatch = findDescendantClassQName(registry, childQName, className);
        if (nestedMatch) {
            return nestedMatch;
        }
    }

    return undefined;
}

export function resolveDefaultClassQName(
    registry: MJCFDefaultsRegistry,
    className: string | null | undefined,
    activeClassQName?: string,
): string | undefined {
    const normalizedClassName = className?.trim();
    if (!normalizedClassName) {
        return activeClassQName;
    }

    if (activeClassQName) {
        const activeEntry = registry.classesByQName.get(activeClassQName);
        if (activeEntry?.className === normalizedClassName) {
            return activeClassQName;
        }

        const descendantMatch = findDescendantClassQName(registry, activeClassQName, normalizedClassName);
        if (descendantMatch) {
            return descendantMatch;
        }
    }

    const qnames = registry.qnamesByClassName.get(normalizedClassName);
    return qnames?.[0];
}

export function resolveElementAttributes(
    registry: MJCFDefaultsRegistry,
    elementType: MJCFElementType,
    element: Element,
    activeClassQName?: string,
): MJCFAttributeMap {
    const resolvedAttributes: MJCFAttributeMap = {
        ...registry.root[elementType],
    };

    if (activeClassQName) {
        const activeEntry = registry.classesByQName.get(activeClassQName);
        if (activeEntry) {
            Object.assign(resolvedAttributes, activeEntry.defaults[elementType]);
        }
    }

    const explicitClassQName = resolveDefaultClassQName(registry, element.getAttribute('class'), activeClassQName);
    if (explicitClassQName) {
        const explicitEntry = registry.classesByQName.get(explicitClassQName);
        if (explicitEntry) {
            Object.assign(resolvedAttributes, explicitEntry.defaults[elementType]);
        }
    }

    for (const attribute of Array.from(element.attributes)) {
        if (
            attribute.name === 'size'
            && typeof resolvedAttributes.size === 'string'
        ) {
            const explicitParts = attribute.value.trim().split(/\s+/).filter(Boolean);
            const defaultParts = resolvedAttributes.size.trim().split(/\s+/).filter(Boolean);
            const canMerge = explicitParts.length > 0
                && explicitParts.length < defaultParts.length
                && explicitParts.every((part) => Number.isFinite(Number(part)))
                && defaultParts.every((part) => Number.isFinite(Number(part)));

            if (canMerge) {
                resolvedAttributes[attribute.name] = [
                    ...explicitParts,
                    ...defaultParts.slice(explicitParts.length),
                ].join(' ');
                continue;
            }
        }

        resolvedAttributes[attribute.name] = attribute.value;
    }

    return resolvedAttributes;
}

export function parseMeshAssets(doc: Document, settings?: MJCFCompilerSettings, defaultsRegistry?: MJCFDefaultsRegistry): Map<string, MJCFMesh> {
    const meshMap = new Map<string, MJCFMesh>();
    const defaults = defaultsRegistry || parseMJCFDefaults(doc);
    const mujocoEl = doc.querySelector('mujoco');
    if (!mujocoEl) {
        return meshMap;
    }

    const assetSections = mujocoEl.querySelectorAll(':scope > asset');
    let meshIndex = 0;
    assetSections.forEach((assetEl) => {
        const meshes = assetEl.querySelectorAll(':scope > mesh');
        meshes.forEach((meshEl) => {
            const meshAttrs = resolveElementAttributes(defaults, 'mesh', meshEl);
            let name = meshEl.getAttribute('name') || meshAttrs.name;
            let file = meshEl.getAttribute('file') || meshAttrs.file;

            if (!file) {
                meshIndex += 1;
                return;
            }

            if (settings?.meshdir && !file.startsWith('/') && !file.includes(':')) {
                const prefix = settings.meshdir.endsWith('/') ? settings.meshdir : `${settings.meshdir}/`;
                file = `${prefix}${file}`;
            }

            if (!name) {
                const fileName = file.split('/').pop()?.split('\\').pop() || '';
                const lastDotIndex = fileName.lastIndexOf('.');
                name = (lastDotIndex > 0 ? fileName.slice(0, lastDotIndex) : fileName) || `mesh_${meshIndex}`;
            }

            const scale = parseNumbers(meshAttrs.scale || null);
            meshMap.set(name, {
                name,
                file,
                scale: scale.length >= 3 ? scale : undefined,
            });

            meshIndex += 1;
        });
    });

    return meshMap;
}


export function parseMaterialAssets(doc: Document): Map<string, MJCFMaterial> {
    const materialMap = new Map<string, MJCFMaterial>();
    const mujocoEl = doc.querySelector('mujoco');
    if (!mujocoEl) {
        return materialMap;
    }

    const assetSections = mujocoEl.querySelectorAll(':scope > asset');
    assetSections.forEach((assetEl) => {
        const materials = assetEl.querySelectorAll(':scope > material');
        materials.forEach((materialEl) => {
            const name = materialEl.getAttribute('name');
            if (!name) return;

            const rgba = parseNumbers(materialEl.getAttribute('rgba'));
            const shininess = materialEl.getAttribute('shininess');
            const specular = materialEl.getAttribute('specular');

            materialMap.set(name, {
                name,
                rgba: rgba.length >= 3 ? rgba : undefined,
                shininess: shininess != null ? parseFloat(shininess) : undefined,
                specular: specular != null ? parseFloat(specular) : undefined,
            });
        });
    });

    return materialMap;
}
