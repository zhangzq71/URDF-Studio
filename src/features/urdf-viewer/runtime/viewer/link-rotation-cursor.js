export function resolveLinkRotationCursor({ enabled, dragging }) {
    // USD link rotation should preserve the default canvas cursor so its
    // interaction feedback matches URDF/MJCF transform editing.
    if (!enabled)
        return "";
    return "";
}
