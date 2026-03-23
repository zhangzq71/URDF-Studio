import type { Camera, Group, Scene, WebGLRenderer } from "three";
import type { UsdViewerApi, ViewerRoundtripExportResult } from "../embed/usd-viewer-api.js";

declare global {
  interface Window {
    camera?: Camera;
    scene?: Scene;
    renderer?: WebGLRenderer;
    _controls?: any;
    usdRoot?: Group;
    driver?: any;
    usdStage?: any;
    renderInterface?: any;
    linkRotationController?: any;
    linkDynamicsController?: any;
    USD?: any;
    usdViewerApi?: UsdViewerApi;
    exportLoadedStageSnapshot?: (
      options?: Record<string, unknown>,
    ) => Promise<ViewerRoundtripExportResult | { ok: false; error: string }>;
  }
}

export {};
