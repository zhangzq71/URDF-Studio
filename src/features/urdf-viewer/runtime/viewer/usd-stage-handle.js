export function disposeUsdStageHandle(usdModule, stage) {
    if (!stage)
        return;
    try {
        if (typeof stage.isDeleted === "function" && stage.isDeleted()) {
            return;
        }
    }
    catch {
        // Ignore deleted-state probe failures and attempt direct disposal.
    }
    let deleted = false;
    try {
        if (typeof stage.delete === "function") {
            stage.delete();
            deleted = true;
        }
    }
    catch (error) {
        console.warn("[USD Viewer] Failed to dispose opened USD stage handle.", error);
    }
    if (!deleted)
        return;
    try {
        usdModule?.flushPendingDeletes?.();
    }
    catch {
        // Flush is best-effort.
    }
}
