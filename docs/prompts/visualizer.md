# Visualizer 模块入口

本文件改为轻量入口，完整上下文已并入 `docs/prompts/CLAUDE.md` 第 7 节。

## 快速定位

- 主组件：`src/features/visualizer/components/Visualizer.tsx`
- 场景编排：`src/features/visualizer/components/VisualizerScene.tsx`
- 面板编排：`src/features/visualizer/components/VisualizerPanels.tsx`
- 画布：`src/features/visualizer/components/VisualizerCanvas.tsx`
- 约束覆盖：`src/features/visualizer/components/constraints/*`
- 节点递归：`src/features/visualizer/components/nodes/*`
- 控制器：`src/features/visualizer/components/controls/*`
- Hooks：`src/features/visualizer/hooks/*`
- 材质缓存：`src/features/visualizer/utils/materialCache.ts`

## 关键约束

- 新功能优先拆到 hooks / 新组件，不继续堆进 `Visualizer.tsx`
- 保持 `RobotNode <-> JointNode` 交替递归结构
- 引用注册必须完整，避免 TransformControls 失联
- 材质通过缓存复用，避免高频路径直接创建
- 类型优先用 `RobotState`，避免 `any`
- 闭环与碰撞拖拽优先复用现有 hooks：`useClosedLoopDragSync`、`useJointPivots`、`useCollisionRefs`、`useTransformControls`
