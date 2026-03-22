import { UrdfLink, GeometryType } from '@/types';
import { DEFAULT_LINK } from '@/types/constants';
import { parseVec3, parseRPY, parseColor, parseTexture } from './utils';
import { parseGeometry } from './geometry';

interface ParsedMaterialDefinition {
    color?: string;
    texture?: string;
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

        // Visual
        const visualEl = linkEl.querySelector("visual");
        const visualOriginEl = visualEl?.querySelector("origin");

        let visualGeo: Partial<UrdfLink['visual']>;
        let visualColor: string | undefined = undefined;
        let visualTexture: string | undefined = undefined;
        let materialSource: 'inline' | 'named' | 'gazebo' | undefined = undefined;

        if (visualEl) {
            visualGeo = parseGeometry(visualEl.querySelector("geometry"), DEFAULT_LINK.visual);
            if (!visualGeo) visualGeo = { type: GeometryType.NONE, dimensions: { x: 0, y: 0, z: 0 } };

            const materialEls = Array.from(visualEl.children).filter(
                (node): node is Element => node.tagName === 'material',
            );
            const hasMultipleMeshMaterials = visualGeo.type === GeometryType.MESH && materialEls.length > 1;

            // URDF visuals can only express a single material override cleanly.
            // When imported mesh visuals carry multiple named material tags
            // (common for Collada assets such as Unitree go2/go2w), collapsing
            // them into one link-level color would destroy the mesh's embedded
            // material palette on export. Preserve the mesh materials instead.
            if (!hasMultipleMeshMaterials) {
                const materialEl = materialEls[0] ?? null;
                const inlineColor = parseColor(materialEl);
                const inlineTexture = parseTexture(materialEl);
                const matName = materialEl?.getAttribute("name");
                const namedMaterial = matName ? globalMaterials[matName] : undefined;

                if (namedMaterial) {
                    // Isaac Sim resolves same-name conflicts to the global definition.
                    visualColor = namedMaterial.color || inlineColor;
                    visualTexture = namedMaterial.texture || inlineTexture;
                    materialSource = 'named';
                } else {
                    visualColor = inlineColor;
                    visualTexture = inlineTexture;
                    if (visualColor || visualTexture) {
                        materialSource = 'inline';
                    }
                }
            }
        } else {
            // If no visual tag exists, map to NONE
            visualGeo = { type: GeometryType.NONE, dimensions: { x:0, y:0, z:0 } };
        }

        // Gazebo material override:
        // - Inline RGBA in URDF keeps highest priority
        // - Named URDF material can be overridden by gazebo reference
        if (!visualColor && linkGazeboMaterials[linkName]) {
            visualColor = linkGazeboMaterials[linkName];
            materialSource = 'gazebo';
        }

        // Collision (Handle multiple collisions)
        const collisionEls = linkEl.querySelectorAll("collision");
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
            visual: {
                ...DEFAULT_LINK.visual,
                ...visualGeo,
                origin: {
                    xyz: parseVec3(visualOriginEl?.getAttribute("xyz")),
                    rpy: parseRPY(visualOriginEl?.getAttribute("rpy"))
                },
                color: visualColor,
                materialSource
            },
            collision: {
                ...DEFAULT_LINK.collision,
                ...mainCollisionGeo,
                origin: mainCollisionOrigin
            },
            collisionBodies: [],
            inertial
        };

        if (visualColor || visualTexture) {
            linkMaterials[id] = {
                ...(visualColor ? { color: visualColor } : {}),
                ...(visualTexture ? { texture: visualTexture } : {}),
            };
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
