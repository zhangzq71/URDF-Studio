import * as THREE from 'three';

export interface ResolvedSelectionTarget {
    urdfElement: THREE.Object3D | null;
    objectIndex: number;
    highlightTarget: THREE.Object3D;
}

export function resolveSelectionTarget(
    hitObject: THREE.Object3D,
    linkObject: THREE.Object3D
): ResolvedSelectionTarget {
    let current: THREE.Object3D | null = hitObject;
    let urdfElement: THREE.Object3D | null = null;

    while (current && current !== linkObject) {
        if ((current as any).isURDFVisual || (current as any).isURDFCollider) {
            urdfElement = current;
            break;
        }
        current = current.parent;
    }

    let objectIndex = 0;
    if (urdfElement) {
        const isCollider = Boolean((urdfElement as any).isURDFCollider);
        const siblings = linkObject.children.filter((child: any) =>
            isCollider ? child.isURDFCollider : child.isURDFVisual
        );
        const siblingIndex = siblings.indexOf(urdfElement);
        if (siblingIndex >= 0) {
            objectIndex = siblingIndex;
        }
    }

    let highlightTarget = hitObject;
    if (urdfElement) {
        let bodyRoot = hitObject;
        while (bodyRoot.parent && bodyRoot.parent !== urdfElement) {
            bodyRoot = bodyRoot.parent;
        }
        highlightTarget = bodyRoot;
    }

    return {
        urdfElement,
        objectIndex,
        highlightTarget
    };
}
