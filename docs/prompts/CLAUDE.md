# URDF-Studio 开发指南

> 单一主 Prompt 上下文。`overview.md`、`URDF_STUDIO_STYLE_GUIDE.md`、`urdf-viewer.md`、`visualizer.md` 现在只保留轻量入口，避免重复加载同一批信息。

## 1. 最小读取策略

建议按以下顺序读取，控制 token：

1. 先读本文件。
2. 仅在任务相关时再看对应轻量入口：
   - UI / 主题 / 可访问性：看本文件第 6 节
   - `Visualizer`（`Skeleton` / `Hardware`）：看本文件第 7 节
   - `URDF Viewer`（`Detail`）：看本文件第 8 节
3. AI 审阅标准直接读取：
   - `src/features/ai-assistant/config/urdf_inspect_standard_en.md`
   - `src/features/ai-assistant/config/urdf_inspect_stantard_zh.md`
4. 与 AI 对话时，优先给出：
   - 具体的 `Link` / `Joint` 名称
   - 期望的父子关系
   - 涉及电机时的力矩 / 传动约束

## 2. 项目快照

**URDF Studio** 是一个机器人设计与仿真平台，核心能力包括：

- 三模式编辑：`Skeleton` / `Detail` / `Hardware`
- 多 URDF 组装与桥接关节
- 多格式导入导出：`URDF` / `MJCF` / `USD` / `Xacro`
- AI 生成与 AI 审阅
- 项目级文件管理：`.usp`

**技术栈**

- React 19 + TypeScript 5.8
- Three.js + React Three Fiber + `@react-three/drei`
- Vite 6
- Tailwind CSS 4
- Zustand 5
- Monaco Editor

**源码分层**

- `src/app`：应用编排与主布局
- `src/features`：业务功能模块
- `src/store`：Zustand 状态层
- `src/shared`：共享组件、hooks、i18n、通用 3D 辅助
- `src/core`：纯逻辑、解析器、生成器
- `src/types`：跨模块类型定义
- `src/styles/index.css`：全局语义 token

## 3. 架构红线

### 依赖方向

```text
app/ -> features/ -> store/ -> shared/ -> core/ -> types/
```

必须遵守：

- 不新增反向依赖
- `features` 之间优先通过 `store` 通信
- `core/` 保持纯函数，不引入 React / UI 依赖
- 使用 `@/` 指向 `src/`

### 状态管理

- `robotStore`：机器人模型 CRUD、Undo/Redo、派生计算
- `uiStore`：模式、主题、语言、面板、侧边栏标签
- `selectionStore`：选中与悬停状态
- `assetsStore`：mesh、texture、电机库、素材
- `assemblyStore`：多 URDF 组装与桥接关节

### 国际化

- 文案位于 `src/shared/i18n/locales/en.ts` 与 `src/shared/i18n/locales/zh.ts`
- 新增界面文本时，必须同步双语

## 4. 三种编辑模式

| 模式 | 目标 | 主模块 | 典型任务 |
| --- | --- | --- | --- |
| `Skeleton` | 搭建运动链拓扑 | `Visualizer` | Link / Joint 增删、拓扑与关节参数 |
| `Detail` | 编辑几何体、材质、碰撞 | `URDF Viewer` | Visual / Collision、网格、材质、纹理 |
| `Hardware` | 配置电机与硬件参数 | `Visualizer` | 电机型号、传动比、阻尼、摩擦 |

新增功能前，先判断所属模式，避免跨模式逻辑缠绕。

## 5. 组装、文件与工作区

### 多 URDF 组装

- 每个组件导入后需要命名空间前缀，避免 `Link` / `Joint` 冲突
- 组件之间通过 `BridgeJoint` 连接
- 合并逻辑在 `assemblyStore` 与 `core/robot/assemblyMerger.ts`
- 改动组装功能时，重点检查：
  - 命名空间冲突
  - `BridgeJoint` 合法性
  - 合并导出一致性

### Workspace 交互

- `structure`：简单文件树
- `workspace`：素材库 + 组装树
- 文件加入组装的入口：
  - 右键菜单“添加”
  - 文件行右侧绿色按钮
- 单击文件会打开独立 3D 预览窗口，不直接加入组装

### 文件格式

- 导入：`URDF`、`MJCF`、`USD`、`Xacro`、`ZIP`、`.usp`
- 导出：`URDF`、`MJCF`、`USD`、`ZIP`、`PDF`、`CSV`

## 6. UI / 样式 / 可访问性

### 关键入口

- 语义 token：`src/styles/index.css`
- 主题状态：`src/store/uiStore.ts`
- 系统主题监听：`src/app/hooks/useAppEffects.ts`

### 必须遵守

- 使用语义色 token，不散落硬编码 `#RRGGBB`
- 所有组件在 `light + dark + prefers-contrast: more` 下都应可读
- 暗色界面使用 `base / surface / elevated` 层级，避免纯黑硬切
- 状态表达不能只依赖颜色，补充图标、文案或形态差异
- Focus 态必须可见，建议统一 `ring-system-blue/30`
- 小字号文本避免低对比度颜色

### 当前高频语义色

- `app-bg`：页面底色
- `panel-bg`：主面板
- `element-bg`：次级容器
- `element-hover`：悬浮层
- `border-black`：语义边框
- `text-primary` / `text-secondary` / `text-tertiary`
- `system-blue`：普通强调文本 / 图标
- `system-blue-solid`：主按钮底色
- `slider-accent`：线性高亮

### 蓝色使用强约束

- `#0088FF` 仅用于 `slider-accent`、进度线、细线型高亮
- `#0088FF` 禁止用于：
  - 主按钮实底
  - 小字号正文链接
  - 大面积背景填充
- 语义映射：
  - 线性高亮 -> `slider-accent`
  - 主按钮 -> `system-blue-solid`
  - 文本 / 图标强调 -> `system-blue`

### UI 验收

- `Light / Dark / 高对比` 三种场景均可读
- Hover / Active / Focus 行为一致且可感知
- 不新增分散硬编码色值

## 7. Visualizer（Skeleton / Hardware）

### 当前结构

- `src/features/visualizer/components/Visualizer.tsx`
- `src/features/visualizer/components/VisualizerScene.tsx`
- `src/features/visualizer/components/VisualizerPanels.tsx`
- `src/features/visualizer/components/VisualizerCanvas.tsx`
- `src/features/visualizer/components/nodes/*`
- `src/features/visualizer/components/controls/*`
- `src/features/visualizer/hooks/*`
- `src/features/visualizer/utils/materialCache.ts`
- 共享面板在 `src/shared/components/Panel/*`

### 核心模式

- 场景递归保持：

```text
RobotNode (Link) -> JointNode (Joint) -> RobotNode (child Link)
```

- 通过回调注册 THREE 引用：
  - `useJointPivots`
  - `useCollisionRefs`
- 编辑流程由 `useTransformControls` / `useVisualizerController` 编排

### 实现约束

- 新能力优先放入 hooks 或新组件，不继续增厚 `Visualizer.tsx`
- 材质必须通过 `materialCache` 复用，不在高频路径直接 `new` 材质
- 统一使用 `RobotState` 等共享类型，避免 `any`
- TransformControls 依赖的引用注册必须完整、可追踪
- 保持 `RobotNode <-> JointNode` 交替递归模式
- 涉及 THREE 资源时注意释放，避免材质 / 几何体泄漏

## 8. URDF Viewer（Detail）

### 当前结构

- `src/features/urdf-viewer/components/URDFViewer.tsx`
- `src/features/urdf-viewer/components/URDFViewerScene.tsx`
- `src/features/urdf-viewer/components/URDFViewerPanels.tsx`
- `src/features/urdf-viewer/components/RobotModel.tsx`
- `src/features/urdf-viewer/components/ViewerToolbar.tsx`
- `src/features/urdf-viewer/components/CollisionTransformControls.tsx`
- `src/features/urdf-viewer/hooks/*`
- `src/features/urdf-viewer/utils/*`
- `src/features/urdf-viewer/types.ts`
- 共享关节面板位于 `src/shared/components/Panel/JointsPanel.tsx`

### 工具与职责

- 工具模式：`select | translate | rotate | universal | view | face | measure`
- `useRobotLoader`：模型加载
- `useHighlightManager` / `useHoverDetection`：高亮与悬停
- `useMouseInteraction` / `JointInteraction`：交互处理
- `useVisualizationEffects`：惯性、质心、原点等辅助可视化

### 实现约束

- 优先复用 `src/features/urdf-viewer/utils/materials.ts`
- 卸载 / 切换时必须调用 `dispose` 清理 THREE 资源
- Props 与共享类型统一收口到 `types.ts`
- 可视化扩展通过 `visualizationFactories.ts`
- 避免在组件里散落临时材质、临时几何体、未释放纹理

## 9. AI 功能

### 环境变量

```env
VITE_OPENAI_API_KEY=your_key
VITE_OPENAI_BASE_URL=https://api.openai.com/v1
VITE_OPENAI_MODEL=deepseek-v3
```

### 审阅输入

- `src/features/ai-assistant/config/urdf_inspect_standard_en.md`
- `src/features/ai-assistant/config/urdf_inspect_stantard_zh.md`

说明：中文文件名当前仓库拼写为 `stantard`，属现状，不要擅自改名。

## 10. 常用检查命令

```bash
npm run dev
npm run build
npm run preview

# 依赖方向检查
rg -n "from ['\"]@/features/" src/core src/shared src/store
rg -n "from ['\"]@/features/" src/features
rg -n "from ['\"]@/store/" src/shared

# 样式检查
rg -n "#[0-9A-Fa-f]{3,8}" src
rg -n "#0088FF|#0088ff" src | rg -v "Slider.tsx|styles/index.css"
```

## 11. 开发注意事项

- 当前默认验证手段是 `npm run build`
- 历史上存在少量存量 TS 问题时，避免把无关问题一并扩大
- 新功能优先放进所属 `features/*`，不要把业务逻辑堆进 `app/`
- 涉及 3D 逻辑时，优先考虑资源释放、材质复用、引用注册与类型完整性
