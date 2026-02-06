import { UrdfLink, GeometryType } from '@/types';
import { DEFAULT_LINK, DEFAULT_JOINT } from '@/types/constants';
import { parseVec3, parseRPY, parseColor } from './utils';
import { parseGeometry } from './geometry';

export const parseLinks = (robotEl: Element, globalMaterials: Record<string, string>, linkGazeboMaterials: Record<string, string>) => {
    const links: Record<string, UrdfLink> = {};
    const extraJoints: any[] = []; // To return virtual joints for multi-collision

    Array.from(robotEl.children).forEach(child => {
        if (child.tagName !== 'link') return;
        const linkEl = child;
        const linkName = linkEl.getAttribute("name");
        if (!linkName) return;
        const id = linkName; // Use name as ID for imported structure

        // Visual
        const visualEl = linkEl.querySelector("visual");
        const visualOriginEl = visualEl?.querySelector("origin");

        let visualGeo;
        let visualColor: string | undefined = undefined;
        let materialSource: 'inline' | 'named' | 'gazebo' | undefined = undefined;

        let hasInlineMaterial = false;
        if (visualEl) {
            visualGeo = parseGeometry(visualEl.querySelector("geometry"), DEFAULT_LINK.visual);
            if (!visualGeo) visualGeo = { type: GeometryType.NONE, dimensions: { x: 0, y: 0, z: 0 } };

            // Parse Material Color
            const materialEl = visualEl.querySelector("material");
            const parsedColor = parseColor(materialEl);

            if (parsedColor) {
                visualColor = parsedColor;
                materialSource = 'inline';
                hasInlineMaterial = true;
            } else if (materialEl) {
                // Handle named material reference
                const matName = materialEl.getAttribute("name");
                if (matName && globalMaterials[matName]) {
                    visualColor = globalMaterials[matName];
                    materialSource = 'named';
                }
            }
        } else {
            // If no visual tag exists, map to NONE
            visualGeo = { type: GeometryType.NONE, dimensions: { x:0, y:0, z:0 } };
        }

        // Gazebo material override:
        // - Inline RGBA in URDF keeps highest priority
        // - Named URDF material can be overridden by gazebo reference
        if (!hasInlineMaterial && linkGazeboMaterials[linkName]) {
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
            inertial: {
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
        };

        // Handle additional collisions as virtual links
        for (let i = 1; i < collisionEls.length; i++) {
            const colEl = collisionEls[i];
            const virtualLinkId = `${id}_collision_${i}`;
            const virtualJointId = `${id}_collision_joint_${i}`;

            // Parse geometry and origin for this collision
            let colGeo = parseGeometry(colEl.querySelector("geometry"), DEFAULT_LINK.collision);
            if (!colGeo) colGeo = { type: GeometryType.NONE, dimensions: { x: 0, y: 0, z: 0 } };
            
            const originEl = colEl.querySelector("origin");
            const colOrigin = {
                xyz: parseVec3(originEl?.getAttribute("xyz")),
                rpy: parseRPY(originEl?.getAttribute("rpy"))
            };

            // Create Virtual Link
            links[virtualLinkId] = {
                id: virtualLinkId,
                name: virtualLinkId,
                visual: { ...DEFAULT_LINK.visual, type: GeometryType.NONE }, // Invisible
                collision: {
                    ...DEFAULT_LINK.collision,
                    ...colGeo,
                    origin: colOrigin
                },
                inertial: { ...DEFAULT_LINK.inertial, mass: 0 } // Massless
            };

            // Create Fixed Joint attaching to parent
            extraJoints.push({
                ...DEFAULT_JOINT,
                id: virtualJointId,
                name: virtualJointId,
                type: 'fixed',
                parentLinkId: id,
                childLinkId: virtualLinkId,
                origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
                axis: { x: 0, y: 0, z: 0 }
            });
        }
    });

    return { links, extraJoints };
};
