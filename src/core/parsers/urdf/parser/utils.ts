import { Vector3, Euler } from '@/types/geometry';

/**
 * Preprocess XML content to fix common issues
 */
export function preprocessXML(content: string): string {
    // Remove XML declaration if it's not at the start (after comments)
    const xmlDeclMatch = content.match(/(<\?xml[^?]*\?>)/);
    if (xmlDeclMatch) {
        const declIndex = content.indexOf(xmlDeclMatch[1]);
        // Check if there's non-whitespace content before the declaration
        const beforeDecl = content.substring(0, declIndex).trim();
        if (beforeDecl.length > 0) {
            // Move the declaration to the beginning or remove it
            content = content.replace(xmlDeclMatch[1], '');
            content = xmlDeclMatch[1] + '\n' + content;
        }
    }

    // Remove <transmission> blocks to prevent parsing errors or duplicates if needed
    // But for the pure parser we might want to keep them if we ever support transmission parsing
    // For now, we clean them only if they cause issues, but the original code didn't remove them in parseURDF, 
    // only in the loader preprocessor. We'll stick to basic cleanup here.

    return content.trim();
}

export const parseFloatSafe = (val: string | null | undefined, def: number): number => {
    if (val === null || val === undefined) return def;
    const n = parseFloat(val);
    return isNaN(n) ? def : n;
};

export const parseVec3 = (str: string | null): Vector3 => {
    if (!str) return { x: 0, y: 0, z: 0 };
    const parts = str.trim().split(/\s+/).map(v => parseFloat(v));
    const result = { 
        x: isNaN(parts[0]) ? 0 : parts[0], 
        y: isNaN(parts[1]) ? 0 : parts[1], 
        z: isNaN(parts[2]) ? 0 : parts[2] 
    };
    return result;
};

export const parseRPY = (str: string | null): Euler => {
    if (!str) return { r: 0, p: 0, y: 0 };
    const parts = str.trim().split(/\s+/).map(v => parseFloat(v));
    return { 
        r: isNaN(parts[0]) ? 0 : parts[0], 
        p: isNaN(parts[1]) ? 0 : parts[1], 
        y: isNaN(parts[2]) ? 0 : parts[2] 
    };
};

export const parseColor = (materialEl: Element | null): string | undefined => {
    if (!materialEl) return undefined;
    const colorEl = materialEl.querySelector("color");
    if (!colorEl) return undefined;

    const rgba = colorEl.getAttribute("rgba");
    if (!rgba) return undefined;

    const parts = rgba.trim().split(/\s+/).map(Number);
    if (parts.length < 3) return undefined;

    // Convert RGB to Hex
    const r = Math.floor(parts[0] * 255);
    const g = Math.floor(parts[1] * 255);
    const b = Math.floor(parts[2] * 255);

    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
};

export const GAZEBO_COLORS: Record<string, string> = {
    'Gazebo/Black': '#000000',
    'Gazebo/Blue': '#0000FF',
    'Gazebo/Green': '#00FF00',
    'Gazebo/Red': '#FF0000',
    'Gazebo/White': '#FFFFFF',
    'Gazebo/Yellow': '#FFFF00',
    'Gazebo/Grey': '#808080',
    'Gazebo/DarkGrey': '#333333',
    'Gazebo/LightGrey': '#CCCCCC',
    'Gazebo/Orange': '#FFA500',
    'Gazebo/Purple': '#800080',
    'Gazebo/Turquoise': '#40E0D0',
    'Gazebo/Gold': '#FFD700',
    'Gazebo/Indigo': '#4B0082',
    'Gazebo/SkyBlue': '#87CEEB',
    'Gazebo/Wood': '#8B4513',
    'Gazebo/FlatBlack': '#000000',
};
