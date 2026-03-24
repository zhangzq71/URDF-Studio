# URDF Viewer 模块入口

本文件改为轻量入口，完整上下文已并入 `docs/prompts/CLAUDE.md` 第 8 节。

## 快速定位

- 主组件：`src/features/urdf-viewer/components/URDFViewer.tsx`
- 场景编排：`src/features/urdf-viewer/components/URDFViewerScene.tsx`
- 面板编排：`src/features/urdf-viewer/components/URDFViewerPanels.tsx`
- USD 嵌入入口：`src/features/urdf-viewer/components/UsdWasmStage.tsx`
- 共享关节面板：`src/shared/components/Panel/JointsPanel.tsx`
- Runtime 上游说明：`src/features/urdf-viewer/runtime/UPSTREAM.md`
- Viewer 数据形态：`src/features/urdf-viewer/utils/viewerRobotData.ts`
- 资源域：`src/features/urdf-viewer/utils/viewerResourceScope.ts`
- 导出缓存：`src/features/urdf-viewer/utils/usdExportBundle.ts`
- Hydration：`src/features/urdf-viewer/utils/usdRuntimeRobotHydration.ts`
- Scene resolution：`src/features/urdf-viewer/utils/usdSceneRobotResolution.ts`
- Viewer adapter：`src/features/urdf-viewer/utils/usdViewerRobotAdapter.ts`
- 材质：`src/features/urdf-viewer/utils/materials.ts` / `urdfMaterials.ts`
- 可视化工厂：`src/features/urdf-viewer/utils/visualizationFactories.ts`
- 资源清理：`src/features/urdf-viewer/utils/dispose.ts`

## 关键约束

- 优先复用共享材质
- 切换 / 卸载 / reload / hydration rollback 时必须清理 THREE 资源
- 共享类型统一放在 `src/features/urdf-viewer/types.ts`
- 不在组件内部散落临时材质与未释放几何体
- `runtime/*` 是 vendored `usd-viewer` runtime，不要在 `core/parsers/usd/*` 重复实现同层职责
- `public/usd/bindings/*` 必须保留在静态资源目录，供浏览器运行时 fetch
