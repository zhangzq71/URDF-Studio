export interface MJCFCompilerSettings {
    angleUnit: 'radian' | 'degree';
    meshdir: string;
}

export interface MJCFMesh {
    name: string;
    file: string;
    scale?: number[];
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

export function parseNumbers(str: string | null): number[] {
    if (!str) return [];

    return str.trim().split(/\s+/).map((segment) => {
        const value = parseFloat(segment);
        return isNaN(value) ? 0 : value;
    });
}

export function parseCompilerSettings(doc: Document): MJCFCompilerSettings {
    const compiler = doc.querySelector('compiler');
    const angleAttr = compiler?.getAttribute('angle')?.toLowerCase() || 'radian';
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
    return [nums[0], nums[1], nums[2], nums[3]];
}

export function parseQuatAsObject(str: string | null): MJCFQuaternion | undefined {
    const quat = parseQuatAsTuple(str);
    if (!quat) return undefined;

    const [w, x, y, z] = quat;
    return { w, x, y, z };
}
