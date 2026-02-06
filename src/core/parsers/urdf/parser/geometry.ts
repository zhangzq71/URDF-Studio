import { GeometryType, Vector3 } from '@/types/geometry';
import { DEFAULT_LINK } from '@/types/constants';
import { parseVec3 } from './utils';

export const parseGeometry = (geoEl: Element | null, defaultGeo: any = DEFAULT_LINK.visual) => {
    if (!geoEl) return defaultGeo;

    const box = geoEl.querySelector("box");
    const cylinder = geoEl.querySelector("cylinder");
    const sphere = geoEl.querySelector("sphere");
    const mesh = geoEl.querySelector("mesh");
    const capsule = geoEl.querySelector("capsule");

    if (box) {
        return {
            type: GeometryType.BOX,
            dimensions: parseVec3(box.getAttribute("size")),
        };
    } else if (cylinder) {
        return {
            type: GeometryType.CYLINDER,
            dimensions: {
                x: parseFloat(cylinder.getAttribute("radius") || "0.1"),
                y: parseFloat(cylinder.getAttribute("length") || "0.5"),
                z: 0
            }
        };
    } else if (sphere) {
        return {
            type: GeometryType.SPHERE,
            dimensions: {
                x: parseFloat(sphere.getAttribute("radius") || "0.1"),
                y: 0, z: 0
            }
        };
    } else if (capsule) {
        return {
            type: GeometryType.CAPSULE,
            dimensions: {
                x: parseFloat(capsule.getAttribute("radius") || "0.1"),
                y: parseFloat(capsule.getAttribute("length") || "0.5"),
                z: 0
            }
        };
    } else if (mesh) {
        const filename = mesh.getAttribute("filename") || "";
        // Keep the full path so the mesh loader can resolve it using its advanced lookup logic
        const cleanName = filename;

        // Parse scale attribute (supports "0.001 0.001 0.001" format with multiple spaces)
        const scaleAttr = mesh.getAttribute("scale");
        let scale = { x: 1, y: 1, z: 1 };
        if (scaleAttr) {
            const scaleParts = scaleAttr.trim().split(/\s+/).map(Number);
            if (scaleParts.length >= 3 && scaleParts.every(v => !isNaN(v))) {
                scale = { x: scaleParts[0], y: scaleParts[1], z: scaleParts[2] };
            } else if (scaleParts.length === 1 && !isNaN(scaleParts[0])) {
                // Uniform scale
                scale = { x: scaleParts[0], y: scaleParts[0], z: scaleParts[0] };
            }
        }

        return {
            type: GeometryType.MESH,
            dimensions: scale,
            meshPath: cleanName
        };
    }
    return null;
};
