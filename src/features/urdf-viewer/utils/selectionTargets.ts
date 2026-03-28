import * as THREE from 'three';

export interface ResolvedLinkTarget {
    linkId: string;
    linkObject: THREE.Object3D;
}

export interface ResolvedSelectionTarget {
    urdfElement: THREE.Object3D | null;
    objectIndex: number;
    highlightTarget: THREE.Object3D;
}

export interface ResolvedSelectionHit extends ResolvedSelectionTarget {
    linkId: string;
    linkObject: THREE.Object3D;
}

export function resolveHitLinkTarget(
    robot: THREE.Object3D | null,
    hitObject: THREE.Object3D
): ResolvedLinkTarget | null {
    const robotLinks = (robot as { links?: Record<string, THREE.Object3D> } | null)?.links;
    const metadataLinkId = typeof hitObject.userData?.parentLinkName === 'string'
        ? hitObject.userData.parentLinkName.trim()
        : '';

    if (metadataLinkId) {
        const metadataLinkObject = robotLinks?.[metadataLinkId] ?? null;
        if (metadataLinkObject) {
            return {
                linkId: metadataLinkId,
                linkObject: metadataLinkObject,
            };
        }
    }

    let current: THREE.Object3D | null = hitObject;
    while (current) {
        if (current.userData?.isGizmo) return null;
        if ((current as any).isURDFLink || (current as any).type === 'URDFLink') {
            return {
                linkId: current.name,
                linkObject: current,
            };
        }
        if (robotLinks?.[current.name]) {
            return {
                linkId: current.name,
                linkObject: current,
            };
        }
        if (current === robot) break;
        current = current.parent;
    }

    return null;
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

export function resolveSelectionHit(
    robot: THREE.Object3D | null,
    hitObject: THREE.Object3D
): ResolvedSelectionHit | null {
    const resolvedLink = resolveHitLinkTarget(robot, hitObject);
    if (!resolvedLink) {
        return null;
    }

    return {
        ...resolveSelectionTarget(hitObject, resolvedLink.linkObject),
        linkId: resolvedLink.linkId,
        linkObject: resolvedLink.linkObject,
    };
}
