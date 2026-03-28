import { UrdfLink, GeometryType, type UrdfVisualMaterial } from '@/types';
import { DEFAULT_LINK } from '@/types/constants';
import { parseVec3, parseRPY, parseColor, parseTexture } from './utils';
import { parseGeometry } from './geometry';

interface ParsedMaterialDefinition {
    color?: string;
    texture?: string;
}

interface ParsedVisualGeometry {
    geometry: UrdfLink['visual'];
    material?: ParsedMaterialDefinition;
}

function resolveMaterialDefinition(
    materialEl: Element,
    globalMaterials: Record<string, ParsedMaterialDefinition>,
): ParsedMaterialDefinition & { name?: string } {
    const inlineColor = parseColor(materialEl);
    const inlineTexture = parseTexture(materialEl);
    const materialName = materialEl.getAttribute("name")?.trim() || undefined;
    const namedMaterial = materialName ? globalMaterials[materialName] : undefined;

    return {
        ...(materialName ? { name: materialName } : {}),
        ...(namedMaterial?.color || inlineColor ? { color: namedMaterial?.color || inlineColor } : {}),
        ...(namedMaterial?.texture || inlineTexture ? { texture: namedMaterial?.texture || inlineTexture } : {}),
    };
}

function parseAuthoredMaterials(
    materialEls: Element[],
    globalMaterials: Record<string, ParsedMaterialDefinition>,
): UrdfVisualMaterial[] | undefined {
    const authoredMaterials = materialEls
        .map((materialEl) => resolveMaterialDefinition(materialEl, globalMaterials))
        .filter((material) => Boolean(material.name || material.color || material.texture));

    return authoredMaterials.length > 0 ? authoredMaterials : undefined;
}

function getDirectChildElements(parent: Element, tagName: string): Element[] {
    return Array.from(parent.children).filter(
        (child): child is Element => child.tagName === tagName,
    );
}

function parseVisualElement(
    visualEl: Element,
    globalMaterials: Record<string, ParsedMaterialDefinition>,
    linkGazeboMaterial?: string,
): ParsedVisualGeometry {
    const visualOriginEl = getDirectChildElements(visualEl, 'origin')[0];
    let visualGeo = parseGeometry(visualEl.querySelector("geometry"), DEFAULT_LINK.visual);
    if (!visualGeo) {
        visualGeo = { type: GeometryType.NONE, dimensions: { x: 0, y: 0, z: 0 } };
    }

    const materialEls = getDirectChildElements(visualEl, 'material');
    const hasMultipleMeshMaterials = visualGeo.type === GeometryType.MESH && materialEls.length > 1;
    const authoredMaterials = hasMultipleMeshMaterials
        ? parseAuthoredMaterials(materialEls, globalMaterials)
        : undefined;

    let visualColor: string | undefined;
    let visualTexture: string | undefined;
    let materialSource: 'inline' | 'named' | 'gazebo' | undefined;

    if (!hasMultipleMeshMaterials) {
        const materialEl = materialEls[0] ?? null;
        const resolvedMaterial = materialEl
            ? resolveMaterialDefinition(materialEl, globalMaterials)
            : {};

        if (resolvedMaterial.name && globalMaterials[resolvedMaterial.name]) {
            visualColor = resolvedMaterial.color;
            visualTexture = resolvedMaterial.texture;
            materialSource = 'named';
        } else {
            visualColor = resolvedMaterial.color;
            visualTexture = resolvedMaterial.texture;
            if (visualColor || visualTexture) {
                materialSource = 'inline';
            }
        }
    }

    if (!visualColor && linkGazeboMaterial) {
        visualColor = linkGazeboMaterial;
        materialSource = 'gazebo';
    }

    return {
        geometry: {
            ...DEFAULT_LINK.visual,
            ...visualGeo,
            origin: {
                xyz: parseVec3(visualOriginEl?.getAttribute("xyz")),
                rpy: parseRPY(visualOriginEl?.getAttribute("rpy"))
            },
            color: visualColor,
            ...(authoredMaterials ? { authoredMaterials } : {}),
            materialSource,
        },
        material: (visualColor || visualTexture)
            ? {
                ...(visualColor ? { color: visualColor } : {}),
                ...(visualTexture ? { texture: visualTexture } : {}),
            }
            : undefined,
    };
}

export const parseLinks = (
    robotEl: Element,
    globalMaterials: Record<string, ParsedMaterialDefinition>,
    linkGazeboMaterials: Record<string, string>,
) => {
    const links: Record<string, UrdfLink> = {};
    const extraJoints: any[] = []; // Reserved for backward compatibility
    const linkMaterials: Record<string, ParsedMaterialDefinition> = {};

    Array.from(robotEl.children).forEach(child => {
        if (child.tagName !== 'link') return;
        const linkEl = child;
        const linkName = linkEl.getAttribute("name");
        if (!linkName) return;
        const id = linkName; // Use name as ID for imported structure

        const visualEls = getDirectChildElements(linkEl, 'visual');
        const parsedVisuals = visualEls.map((visualEl) => (
            parseVisualElement(visualEl, globalMaterials, linkGazeboMaterials[linkName])
        ));
        const primaryVisual = parsedVisuals[0]?.geometry ?? {
            ...DEFAULT_LINK.visual,
            type: GeometryType.NONE,
            dimensions: { x: 0, y: 0, z: 0 },
            origin: {
                xyz: parseVec3(undefined),
                rpy: parseRPY(undefined),
            },
            color: undefined,
            materialSource: undefined,
        };
        const visualBodies = parsedVisuals.slice(1).map((visual) => visual.geometry);
        const primaryVisualMaterial = parsedVisuals[0]?.material;

        // Collision (Handle multiple collisions)
        const collisionEls = getDirectChildElements(linkEl, 'collision');
        let mainCollisionGeo: any = { type: GeometryType.NONE, dimensions: { x: 0, y: 0, z: 0 } };
        let mainCollisionOrigin = { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } };

        if (collisionEls.length > 0) {
            // Process primary collision (index 0)
            const firstCol = collisionEls[0];
            const parsedGeo = parseGeometry(firstCol.querySelector("geometry"), DEFAULT_LINK.collision);
            if (parsedGeo) mainCollisionGeo = parsedGeo;
            
            const originEl = firstCol.querySelector("origin");
            mainCollisionOrigin = {
                xyz: parseVec3(originEl?.getAttribute("xyz")),
                rpy: parseRPY(originEl?.getAttribute("rpy"))
            };
        }

        // Inertial
        const inertialEl = linkEl.querySelector("inertial");
        const massEl = inertialEl?.querySelector("mass");
        const inertiaEl = inertialEl?.querySelector("inertia");
        const inertialOriginEl = inertialEl?.querySelector("origin");

        const inertial = inertialEl
            ? {
                mass: parseFloat(massEl?.getAttribute("value") || "0"),
                origin: inertialOriginEl ? {
                    xyz: parseVec3(inertialOriginEl.getAttribute("xyz")),
                    rpy: parseRPY(inertialOriginEl.getAttribute("rpy"))
                } : undefined,
                inertia: {
                    ixx: parseFloat(inertiaEl?.getAttribute("ixx") || "0"),
                    ixy: parseFloat(inertiaEl?.getAttribute("ixy") || "0"),
                    ixz: parseFloat(inertiaEl?.getAttribute("ixz") || "0"),
                    iyy: parseFloat(inertiaEl?.getAttribute("iyy") || "0"),
                    iyz: parseFloat(inertiaEl?.getAttribute("iyz") || "0"),
                    izz: parseFloat(inertiaEl?.getAttribute("izz") || "0"),
                }
            }
            : undefined;

        links[id] = {
            id,
            name: linkName,
            visual: primaryVisual,
            visualBodies,
            collision: {
                ...DEFAULT_LINK.collision,
                ...mainCollisionGeo,
                origin: mainCollisionOrigin
            },
            collisionBodies: [],
            inertial
        };

        if (primaryVisualMaterial) {
            linkMaterials[id] = primaryVisualMaterial;
        }

        // Keep additional collisions on the same link
        for (let i = 1; i < collisionEls.length; i++) {
            const colEl = collisionEls[i];

            // Parse geometry and origin for this collision
            let colGeo = parseGeometry(colEl.querySelector("geometry"), DEFAULT_LINK.collision);
            if (!colGeo) colGeo = { type: GeometryType.NONE, dimensions: { x: 0, y: 0, z: 0 } };
            
            const originEl = colEl.querySelector("origin");
            const colOrigin = {
                xyz: parseVec3(originEl?.getAttribute("xyz")),
                rpy: parseRPY(originEl?.getAttribute("rpy"))
            };

            links[id].collisionBodies = links[id].collisionBodies || [];
            links[id].collisionBodies.push({
                ...DEFAULT_LINK.collision,
                ...colGeo,
                origin: colOrigin
            });
        }
    });

    return { links, extraJoints, linkMaterials };
};
