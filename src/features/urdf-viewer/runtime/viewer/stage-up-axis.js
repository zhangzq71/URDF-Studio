function normalizeStageUpAxisToken(value) {
    const normalizedValue = String(value || "").trim().toLowerCase();
    if (normalizedValue === "z")
        return "z";
    if (normalizedValue === "y")
        return "y";
    return null;
}
export function extractStageUpAxisFromLayerText(layerText) {
    if (!layerText || typeof layerText !== "string")
        return null;
    const upAxisMatch = layerText.match(/\bupAxis\s*=\s*"([YyZz])"/);
    return normalizeStageUpAxisToken(upAxisMatch?.[1] || null);
}
export function safeExportStageRootLayerText(stage) {
    if (!stage || typeof stage.GetRootLayer !== "function")
        return "";
    try {
        const rootLayer = stage.GetRootLayer();
        if (!rootLayer || typeof rootLayer.ExportToString !== "function")
            return "";
        const exported = rootLayer.ExportToString();
        return typeof exported === "string" ? exported : String(exported || "");
    }
    catch {
        return "";
    }
}
export function resolveStageUpAxis({ reportedUpAxis = null, stage = null } = {}) {
    const normalizedReportedAxis = normalizeStageUpAxisToken(reportedUpAxis);
    if (normalizedReportedAxis) {
        return normalizedReportedAxis;
    }
    const exportedRootLayerText = safeExportStageRootLayerText(stage);
    const axisFromLayerText = extractStageUpAxisFromLayerText(exportedRootLayerText);
    if (axisFromLayerText) {
        return axisFromLayerText;
    }
    return null;
}
export function resolveAxisAlignmentRotationX({ sourceUpAxis = null, targetUpAxis = "z" } = {}) {
    const normalizedSourceAxis = normalizeStageUpAxisToken(sourceUpAxis);
    const normalizedTargetAxis = normalizeStageUpAxisToken(targetUpAxis);
    if (!normalizedSourceAxis || !normalizedTargetAxis || normalizedSourceAxis === normalizedTargetAxis) {
        return 0;
    }
    if (normalizedSourceAxis === "y" && normalizedTargetAxis === "z") {
        return Math.PI / 2;
    }
    if (normalizedSourceAxis === "z" && normalizedTargetAxis === "y") {
        return -Math.PI / 2;
    }
    return 0;
}
export function applyStageAxisAlignmentToRoot(root, { reportedUpAxis = null, stage = null, targetUpAxis = "z" } = {}) {
    if (!root?.rotation) {
        return 0;
    }
    const stageUpAxis = resolveStageUpAxis({
        reportedUpAxis,
        stage,
    });
    const rotationX = resolveAxisAlignmentRotationX({
        sourceUpAxis: stageUpAxis,
        targetUpAxis,
    });
    root.rotation.x = rotationX;
    return rotationX;
}
