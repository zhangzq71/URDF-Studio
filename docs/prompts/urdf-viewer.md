# URDF Viewer 模块入口

本文件改为轻量入口，完整上下文已并入 `docs/prompts/CLAUDE.md` 第 8 节。

## 快速定位

- 主组件：`src/features/urdf-viewer/components/URDFViewer.tsx`
- 场景编排：`src/features/urdf-viewer/components/URDFViewerScene.tsx`
- 面板编排：`src/features/urdf-viewer/components/URDFViewerPanels.tsx`
- 共享关节面板：`src/shared/components/Panel/JointsPanel.tsx`
- 材质：`src/features/urdf-viewer/utils/materials.ts`
- 可视化工厂：`src/features/urdf-viewer/utils/visualizationFactories.ts`
- 资源清理：`src/features/urdf-viewer/utils/dispose.ts`

## 关键约束

- 优先复用共享材质
- 切换 / 卸载必须清理 THREE 资源
- 共享类型统一放在 `src/features/urdf-viewer/types.ts`
- 不在组件内部散落临时材质与未释放几何体
