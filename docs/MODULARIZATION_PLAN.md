# URDF-Studio 模块化重构计划

> 本文档详细说明如何将 URDF-Studio 从当前的扁平结构重构为模块化架构，提升代码可维护性和可扩展性。

## 目录

- [1. 重构背景](#1-重构背景)
- [2. 目标架构](#2-目标架构)
- [3. 目录结构详解](#3-目录结构详解)
- [4. 文件迁移映射](#4-文件迁移映射)
- [5. 核心模块拆分方案](#5-核心模块拆分方案)
- [6. 状态管理重构](#6-状态管理重构)
- [7. 实施路线图](#7-实施路线图)
- [8. 模块依赖关系](#8-模块依赖关系)
- [9. 编码规范](#9-编码规范)

---

## 1. 重构背景

### 1.1 当前问题

| 文件 | 行数 | 主要问题 |
|------|------|----------|
| `App.tsx` | ~2,734 | 状态管理、业务逻辑、UI 渲染全部耦合，难以维护 |
| `RobotModel.tsx` | ~2,273 | 渲染、交互、数据处理、动画逻辑混杂 |
| `Visualizer.tsx` | ~1,575 | 多种模式逻辑、场景管理、工具逻辑耦合 |
| `mjcfLoader.ts` | ~1,225 | 解析、加载、渲染逻辑未分离 |
| `PropertyEditor.tsx` | ~1,151 | 所有属性编辑表单堆叠在一起 |

### 1.2 重构目标

- **单一职责**：每个文件控制在 200-400 行
- **高内聚低耦合**：模块内部紧密，模块间通过清晰接口通信
- **可测试性**：业务逻辑与 UI 分离，便于单元测试
- **可扩展性**：新增功能只需添加新模块，不影响现有代码
- **团队协作**：不同开发者可并行开发不同模块

---

## 2. 目标架构

### 2.1 架构分层

```
┌─────────────────────────────────────────────────────────────┐
│                        App Layer                            │
│                   (路由、布局、Provider)                      │
├─────────────────────────────────────────────────────────────┤
│                      Features Layer                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │robot-tree│ │property- │ │visualizer│ │urdf-     │  ...  │
│  │          │ │editor    │ │          │ │viewer    │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
├─────────────────────────────────────────────────────────────┤
│                       Store Layer                           │
│            (Zustand: robotStore, uiStore)                   │
├─────────────────────────────────────────────────────────────┤
│                        Core Layer                           │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                    │
│  │  robot   │ │ parsers  │ │ loaders  │                    │
│  │ (types)  │ │(urdf/mjcf│ │(stl/obj) │                    │
│  └──────────┘ └──────────┘ └──────────┘                    │
├─────────────────────────────────────────────────────────────┤
│                      Shared Layer                           │
│      (通用组件、3D组件、Hooks、工具函数、国际化)               │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 设计原则

| 原则 | 说明 |
|------|------|
| Feature-First | 按业务功能组织代码，而非按文件类型 |
| 单向依赖 | 上层可依赖下层，下层不可依赖上层 |
| 接口隔离 | 模块通过 `index.ts` 暴露公共 API |
| 状态集中 | 全局状态通过 Store 管理，组件内状态用 useState |
| 共享复用 | 被多模块使用的组件放在 shared 层，避免重复 |

---

## 3. 目录结构详解

```
src/
│
├── app/                                 # 应用入口层
│   ├── App.tsx                          # 主组件 (~150行)
│   ├── AppLayout.tsx                    # 布局结构
│   ├── AppProviders.tsx                 # Provider 组合
│   └── index.ts
│
├── features/                            # 功能模块层
│   │
│   ├── robot-tree/                      # 🌲 机器人树编辑
│   │   ├── components/
│   │   │   ├── TreeEditor.tsx           # 树编辑器容器 (~200行)
│   │   │   ├── TreeNode.tsx             # 单个节点组件 (~100行)
│   │   │   ├── TreeNodeActions.tsx      # 节点操作按钮 (~80行)
│   │   │   ├── TreeToolbar.tsx          # 工具栏 (~100行)
│   │   │   └── AddNodeDialog.tsx        # 添加节点弹窗 (~150行)
│   │   ├── hooks/
│   │   │   ├── useTreeOperations.ts     # 树操作逻辑 (~200行)
│   │   │   └── useTreeDragDrop.ts       # 拖拽逻辑 (~150行)
│   │   ├── types.ts                     # 模块内类型
│   │   └── index.ts                     # 公共导出
│   │
│   ├── property-editor/                 # 📝 属性编辑器
│   │   ├── components/
│   │   │   ├── PropertyEditor.tsx       # 容器组件 (~100行)
│   │   │   ├── link/
│   │   │   │   ├── LinkEditor.tsx       # Link 编辑器 (~150行)
│   │   │   │   ├── GeometrySection.tsx  # 几何体编辑 (~200行)
│   │   │   │   ├── InertialSection.tsx  # 惯性编辑 (~180行)
│   │   │   │   ├── VisualSection.tsx    # 可视化编辑 (~150行)
│   │   │   │   └── MaterialSection.tsx  # 材质编辑 (~120行)
│   │   │   ├── joint/
│   │   │   │   ├── JointEditor.tsx      # Joint 编辑器 (~150行)
│   │   │   │   ├── JointTypeSection.tsx # 类型选择 (~100行)
│   │   │   │   ├── LimitsSection.tsx    # 限制编辑 (~150行)
│   │   │   │   ├── DynamicsSection.tsx  # 动力学编辑 (~120行)
│   │   │   │   └── OriginSection.tsx    # 原点编辑 (~100行)
│   │   │   └── collision/
│   │   │       ├── CollisionEditor.tsx  # 碰撞体编辑 (~150行)
│   │   │       └── CollisionList.tsx    # 碰撞体列表 (~100行)
│   │   ├── hooks/
│   │   │   ├── usePropertyForm.ts       # 表单状态管理 (~150行)
│   │   │   └── usePropertyValidation.ts # 属性验证 (~100行)
│   │   └── index.ts
│   │
│   ├── visualizer/                      # 🎨 3D 可视化 (Skeleton/Hardware 模式)
│   │   ├── components/
│   │   │   ├── Visualizer.tsx           # 主容器 (~150行)
│   │   │   ├── scene/
│   │   │   │   ├── SceneCanvas.tsx      # Canvas 容器 (~100行)
│   │   │   │   ├── CameraController.tsx # 相机控制 (~150行)
│   │   │   │   ├── LightingSetup.tsx    # 光照设置 (~80行)
│   │   │   │   ├── GroundGrid.tsx       # 地面网格 (~60行)
│   │   │   │   └── EnvironmentSetup.tsx # 环境设置 (~80行)
│   │   │   ├── robot/
│   │   │   │   ├── SkeletonRobot.tsx    # 骨架模式机器人 (~250行)
│   │   │   │   ├── LinkVisualization.tsx # Link 可视化 (~150行)
│   │   │   │   ├── JointVisualization.tsx # Joint 可视化 (~150行)
│   │   │   │   └── SelectionHighlight.tsx # 选中高亮 (~100行)
│   │   │   └── tools/
│   │   │       ├── TransformTool.tsx    # 变换工具 (~200行)
│   │   │       ├── SnapshotTool.tsx     # 截图工具 (~80行)
│   │   │       └── ToolSelector.tsx     # 工具选择器 (~100行)
│   │   ├── hooks/
│   │   │   ├── useSceneSetup.ts         # 场景初始化 (~100行)
│   │   │   ├── useObjectSelection.ts    # 对象选择 (~150行)
│   │   │   ├── useRaycast.ts            # 射线检测 (~120行)
│   │   │   └── useTransformControls.ts  # 变换控制 (~150行)
│   │   ├── constants.ts                 # 可视化常量
│   │   └── index.ts
│   │
│   ├── urdf-viewer/                     # 🔍 URDF 查看器 (Detail 模式)
│   │   ├── components/
│   │   │   ├── URDFViewer.tsx           # 主容器 (~200行)
│   │   │   ├── model/
│   │   │   │   ├── RobotModel.tsx       # 模型渲染器 (~300行)
│   │   │   │   ├── LinkRenderer.tsx     # Link 渲染 (~200行)
│   │   │   │   ├── JointRenderer.tsx    # Joint 渲染 (~180行)
│   │   │   │   ├── GeometryFactory.tsx  # 几何体工厂 (~200行)
│   │   │   │   └── MeshRenderer.tsx     # 网格渲染 (~150行)
│   │   │   ├── controls/
│   │   │   │   ├── JointControlPanel.tsx # 关节控制面板 (~150行)
│   │   │   │   ├── JointControlItem.tsx # 关节控制项 (~100行)
│   │   │   │   ├── JointSlider.tsx      # 关节滑块 (~100行)
│   │   │   │   ├── ViewerToolbar.tsx    # 工具栏 (~120行)
│   │   │   │   └── ViewOptions.tsx      # 视图选项 (~100行)
│   │   │   ├── interaction/
│   │   │   │   ├── JointInteraction.tsx # 关节交互逻辑 (~150行)
│   │   │   │   └── CollisionTransformControls.tsx # 碰撞体变换 (~200行)
│   │   │   ├── panels/
│   │   │   │   ├── InfoPanel.tsx        # 信息面板 (~100行)
│   │   │   │   └── MeasurePanel.tsx     # 测量面板 (~150行)
│   │   │   └── tools/
│   │   │       ├── MeasureTool.tsx      # 测量工具 (~200行)
│   │   │       └── CollisionControls.tsx # 碰撞体控制 (~250行)
│   │   ├── hooks/
│   │   │   ├── useModelLoader.ts        # 模型加载 (~200行)
│   │   │   ├── useJointAnimation.ts     # 关节动画 (~150行)
│   │   │   └── useCollisionEdit.ts      # 碰撞体编辑 (~150行)
│   │   ├── utils/
│   │   │   ├── materials.ts             # 材质定义 (~200行)
│   │   │   ├── dispose.ts               # 资源释放 (~100行)
│   │   │   └── transforms.ts            # 变换工具 (~100行)
│   │   └── index.ts
│   │
│   ├── code-editor/                     # 💻 代码编辑器
│   │   ├── components/
│   │   │   ├── CodeEditorPanel.tsx      # 编辑器面板 (~150行)
│   │   │   ├── SourceCodeEditor.tsx     # 可编辑编辑器 (~300行)
│   │   │   ├── SourceCodeViewer.tsx     # 只读查看器 (~100行)
│   │   │   ├── EditorToolbar.tsx        # 编辑器工具栏 (~100行)
│   │   │   └── FormatSelector.tsx       # 格式选择器 (~80行)
│   │   ├── hooks/
│   │   │   ├── useMonacoSetup.ts        # Monaco 配置 (~150行)
│   │   │   └── useCodeSync.ts           # 代码同步 (~100行)
│   │   ├── config/
│   │   │   └── monacoConfig.ts          # Monaco 配置项 (~100行)
│   │   └── index.ts
│   │
│   ├── hardware-config/                 # ⚙️ 硬件配置
│   │   ├── components/
│   │   │   ├── HardwarePanel.tsx        # 硬件面板 (~150行)
│   │   │   ├── MotorSelector.tsx        # 电机选择器 (~200行)
│   │   │   ├── MotorCard.tsx            # 电机卡片 (~100行)
│   │   │   ├── MotorPreview.tsx         # 电机预览 (~100行)
│   │   │   └── MotorSpecTable.tsx       # 规格表格 (~120行)
│   │   ├── data/
│   │   │   ├── motorLibrary.ts          # 电机数据库 (~300行)
│   │   │   ├── unitreeMotors.ts         # Unitree 电机 (~100行)
│   │   │   └── robstrideMotors.ts       # RobStride 电机 (~100行)
│   │   ├── hooks/
│   │   │   └── useMotorSelection.ts     # 电机选择逻辑 (~100行)
│   │   └── index.ts
│   │
│   ├── ai-assistant/                    # 🤖 AI 助手
│   │   ├── components/
│   │   │   ├── AIPanel.tsx              # AI 面板容器 (~150行)
│   │   │   ├── ChatInterface.tsx        # 聊天界面 (~200行)
│   │   │   ├── ChatMessage.tsx          # 聊天消息 (~80行)
│   │   │   ├── GenerationWizard.tsx     # 生成向导 (~200行)
│   │   │   ├── InspectionReport.tsx     # 检查报告 (~200行)
│   │   │   └── InspectionCategory.tsx   # 检查类别 (~100行)
│   │   ├── services/
│   │   │   ├── aiService.ts             # AI API 调用 (~300行)
│   │   │   ├── promptTemplates.ts       # 提示词模板 (~150行)
│   │   │   └── responseParser.ts        # 响应解析 (~100行)
│   │   ├── data/
│   │   │   └── inspectionCriteria.ts    # 检查标准 (~200行)
│   │   ├── hooks/
│   │   │   ├── useAIChat.ts             # 聊天逻辑 (~150行)
│   │   │   └── useInspection.ts         # 检查逻辑 (~100行)
│   │   └── index.ts
│   │
│   └── file-io/                         # 📁 文件导入导出
│       ├── components/
│       │   ├── ImportDialog.tsx         # 导入对话框 (~200行)
│       │   ├── ExportDialog.tsx         # 导出对话框 (~200行)
│       │   ├── FormatOptions.tsx        # 格式选项 (~100行)
│       │   └── FileDropZone.tsx         # 文件拖放区 (~100行)
│       ├── services/
│       │   ├── importService.ts         # 导入服务 (~200行)
│       │   ├── exportService.ts         # 导出服务 (~200行)
│       │   ├── zipService.ts            # ZIP 处理 (~150行)
│       │   └── fileValidation.ts        # 文件验证 (~100行)
│       ├── hooks/
│       │   ├── useFileImport.ts         # 导入 Hook (~100行)
│       │   └── useFileExport.ts         # 导出 Hook (~100行)
│       └── index.ts
│
├── core/                                # 核心业务逻辑 (无 UI 依赖)
│   │
│   ├── robot/                           # 机器人数据模型
│   │   ├── types.ts                     # 核心类型定义 (~150行)
│   │   ├── constants.ts                 # 默认值和枚举 (~100行)
│   │   ├── validators.ts                # 数据验证函数 (~150行)
│   │   ├── transforms.ts                # 坐标变换计算 (~200行)
│   │   ├── builders.ts                  # 数据构建器 (~150行)
│   │   └── index.ts
│   │
│   ├── parsers/                         # 格式解析器
│   │   ├── urdf/
│   │   │   ├── urdfParser.ts            # URDF → RobotState (~250行)
│   │   │   ├── urdfGenerator.ts         # RobotState → URDF (~150行)
│   │   │   ├── urdfValidator.ts         # URDF 验证 (~100行)
│   │   │   └── index.ts
│   │   ├── mjcf/
│   │   │   ├── mjcfParser.ts            # MJCF 解析 (~300行)
│   │   │   ├── mjcfLoader.ts            # MJCF 加载渲染 (~400行)
│   │   │   ├── mjcfGenerator.ts         # MJCF 生成 (~150行)
│   │   │   └── index.ts
│   │   ├── usd/
│   │   │   ├── usdParser.ts             # USD 解析 (~250行)
│   │   │   ├── usdLoader.ts             # USD 加载 (~300行)
│   │   │   └── index.ts
│   │   ├── xacro/
│   │   │   ├── xacroParser.ts           # Xacro 解析 (~300行)
│   │   │   ├── macroExpander.ts         # 宏展开 (~200行)
│   │   │   └── index.ts
│   │   └── index.ts                     # 统一导出
│   │
│   └── loaders/                         # 网格文件加载器
│       ├── meshLoaderFactory.ts         # 加载器工厂 (~100行)
│       ├── stlLoader.ts                 # STL 加载 (~150行)
│       ├── objLoader.ts                 # OBJ 加载 (~150行)
│       ├── daeLoader.ts                 # DAE 加载 (~150行)
│       ├── cacheManager.ts              # 缓存管理 (~100行)
│       └── index.ts
│
├── shared/                              # 共享资源
│   │
│   ├── components/                      # 通用 UI 组件
│   │   ├── Button/
│   │   │   ├── Button.tsx               # 按钮组件 (~80行)
│   │   │   ├── IconButton.tsx           # 图标按钮 (~60行)
│   │   │   └── index.ts
│   │   ├── Input/
│   │   │   ├── TextInput.tsx            # 文本输入 (~80行)
│   │   │   ├── NumberInput.tsx          # 数字输入 (~100行)
│   │   │   ├── Vector3Input.tsx         # 向量输入 (~120行)
│   │   │   └── index.ts
│   │   ├── Select/
│   │   │   ├── Select.tsx               # 下拉选择 (~100行)
│   │   │   ├── ColorSelect.tsx          # 颜色选择 (~80行)
│   │   │   └── index.ts
│   │   ├── Slider/
│   │   │   ├── Slider.tsx               # 滑块 (~80行)
│   │   │   ├── RangeSlider.tsx          # 范围滑块 (~100行)
│   │   │   └── index.ts
│   │   ├── Modal/
│   │   │   ├── Modal.tsx                # 模态框 (~100行)
│   │   │   ├── ConfirmDialog.tsx        # 确认对话框 (~80行)
│   │   │   └── index.ts
│   │   ├── Panel/
│   │   │   ├── Panel.tsx                # 面板容器 (~60行)
│   │   │   ├── CollapsiblePanel.tsx     # 可折叠面板 (~100行)
│   │   │   ├── OptionsPanel.tsx         # 选项面板 (~150行)
│   │   │   └── index.ts
│   │   ├── Tabs/
│   │   │   ├── Tabs.tsx                 # 标签页 (~100行)
│   │   │   └── index.ts
│   │   ├── Tooltip/
│   │   │   ├── Tooltip.tsx              # 工具提示 (~60行)
│   │   │   └── index.ts
│   │   │
│   │   ├── 3d/                          # 🆕 共享 3D 组件 (被 visualizer 和 urdf-viewer 共用)
│   │   │   ├── MeshRenderers.tsx        # STL/OBJ/DAE 渲染器 (~200行)
│   │   │   ├── SceneUtilities.tsx       # 场景工具组件 (~150行)
│   │   │   ├── helpers/
│   │   │   │   ├── CoordinateAxes.tsx   # 坐标轴 (~80行)
│   │   │   │   ├── JointAxis.tsx        # 关节轴 (~100行)
│   │   │   │   ├── InertiaBox.tsx       # 惯性盒 (~120行)
│   │   │   │   ├── CenterOfMass.tsx     # 质心 (~80行)
│   │   │   │   └── index.ts
│   │   │   └── index.ts
│   │   │
│   │   └── index.ts                     # 统一导出
│   │
│   ├── hooks/                           # 通用 Hooks
│   │   ├── useHistory.ts                # Undo/Redo (~100行)
│   │   ├── useLocalStorage.ts           # 本地存储 (~60行)
│   │   ├── useKeyboardShortcut.ts       # 快捷键 (~80行)
│   │   ├── useThrottle.ts               # 节流 Hook (~40行)
│   │   ├── useDebounce.ts               # 防抖 (~40行)
│   │   ├── useClickOutside.ts           # 点击外部 (~50行)
│   │   └── index.ts
│   │
│   ├── utils/                           # 工具函数
│   │   ├── math.ts                      # 数学工具 (~200行)
│   │   ├── color.ts                     # 颜色处理 (~80行)
│   │   ├── file.ts                      # 文件工具 (~100行)
│   │   ├── string.ts                    # 字符串工具 (~60行)
│   │   ├── uuid.ts                      # ID 生成 (~30行)
│   │   ├── throttle.ts                  # 节流函数 (~50行)
│   │   └── index.ts
│   │
│   └── i18n/                            # 国际化
│       ├── I18nProvider.tsx             # Provider (~60行)
│       ├── useTranslation.ts            # Hook (~40行)
│       ├── locales/
│       │   ├── en.ts                    # 英文 (~200行)
│       │   └── zh.ts                    # 中文 (~200行)
│       └── index.ts
│
├── store/                               # 状态管理 (Zustand)
│   ├── robotStore.ts                    # 机器人数据状态 (~250行)
│   ├── uiStore.ts                       # UI 状态 (~150行)
│   ├── assetsStore.ts                   # 资源状态 (Mesh 文件等) (~100行)
│   ├── settingsStore.ts                 # 设置状态 (~100行)
│   ├── historyMiddleware.ts             # 历史中间件 (~100行)
│   └── index.ts
│
├── types/                               # 全局类型定义
│   ├── robot.ts                         # 机器人相关类型 (RobotState, UrdfLink, UrdfJoint)
│   ├── geometry.ts                      # 几何相关类型 (GeometryConfig, Material)
│   ├── ui.ts                            # UI 相关类型 (Selection, AppMode)
│   ├── hardware.ts                      # 硬件相关类型 (MotorSpec)
│   ├── api.ts                           # API 相关类型
│   └── index.ts
│
├── styles/                              # 样式文件
│   ├── globals.css                      # 全局样式
│   ├── variables.css                    # CSS 变量
│   └── tailwind.css                     # Tailwind 入口
│
├── config/                              # 配置文件
│   ├── env.ts                           # 环境变量
│   └── constants.ts                     # 全局常量
│
└── index.tsx                            # 应用入口
```

---

## 4. 文件迁移映射

> 当前文件 → 目标位置，便于重构时参考

### 4.1 根目录文件

| 当前位置 | 目标位置 | 说明 |
|---------|---------|------|
| `App.tsx` | `app/App.tsx` + `store/` | 状态迁移到 Store，UI 拆分到 AppLayout |
| `types.ts` | `types/*.ts` | 按类型拆分到多个文件 |
| `index.tsx` | `index.tsx` | 保持不变 |

### 4.2 components/ 目录

| 当前位置 | 目标位置 | 说明 |
|---------|---------|------|
| `TreeEditor.tsx` | `features/robot-tree/components/TreeEditor.tsx` | 拆分为多个子组件 |
| `PropertyEditor.tsx` | `features/property-editor/components/` | 按 link/joint/collision 拆分 |
| `Visualizer.tsx` | `features/visualizer/components/` | 拆分场景、机器人、工具 |
| `SourceCodeEditor.tsx` | `features/code-editor/components/SourceCodeEditor.tsx` | — |
| `SourceCodeViewer.tsx` | `features/code-editor/components/SourceCodeViewer.tsx` | — |

### 4.3 components/URDFViewer/ 目录

| 当前位置 | 目标位置 | 说明 |
|---------|---------|------|
| `index.tsx` | `features/urdf-viewer/components/URDFViewer.tsx` | — |
| `RobotModel.tsx` | `features/urdf-viewer/components/model/` | 拆分为多个渲染组件 |
| `JointControlItem.tsx` | `features/urdf-viewer/components/controls/JointControlItem.tsx` | — |
| `JointInteraction.tsx` | `features/urdf-viewer/components/interaction/JointInteraction.tsx` | — |
| `CollisionTransformControls.tsx` | `features/urdf-viewer/components/interaction/CollisionTransformControls.tsx` | — |
| `MeasureTool.tsx` | `features/urdf-viewer/components/tools/MeasureTool.tsx` | — |
| `ViewerToolbar.tsx` | `features/urdf-viewer/components/controls/ViewerToolbar.tsx` | — |
| `loaders.ts` | `core/loaders/` | 拆分为各格式加载器 |
| `materials.ts` | `features/urdf-viewer/utils/materials.ts` | — |
| `dispose.ts` | `features/urdf-viewer/utils/dispose.ts` | — |
| `types.ts` | `features/urdf-viewer/types.ts` | — |

### 4.4 components/shared/ 目录

| 当前位置 | 目标位置 | 说明 |
|---------|---------|------|
| `MeshRenderers.tsx` | `shared/components/3d/MeshRenderers.tsx` | 被多模块共用 |
| `VisualizationHelpers.tsx` | `shared/components/3d/helpers/` | 拆分为独立组件 |
| `SceneUtilities.tsx` | `shared/components/3d/SceneUtilities.tsx` | — |

### 4.5 components/ui/ 目录

| 当前位置 | 目标位置 | 说明 |
|---------|---------|------|
| `OptionsPanel.tsx` | `shared/components/Panel/OptionsPanel.tsx` | — |

### 4.6 services/ 目录

| 当前位置 | 目标位置 | 说明 |
|---------|---------|------|
| `urdfParser.ts` | `core/parsers/urdf/urdfParser.ts` | — |
| `urdfGenerator.ts` | `core/parsers/urdf/urdfGenerator.ts` | — |
| `mjcfParser.ts` | `core/parsers/mjcf/mjcfParser.ts` | — |
| `mjcfLoader.ts` | `core/parsers/mjcf/mjcfLoader.ts` | — |
| `mujocoGenerator.ts` | `core/parsers/mjcf/mjcfGenerator.ts` | 重命名 |
| `usdParser.ts` | `core/parsers/usd/usdParser.ts` | — |
| `usdLoader.ts` | `core/parsers/usd/usdLoader.ts` | — |
| `xacroParser.ts` | `core/parsers/xacro/xacroParser.ts` | — |
| `geminiService.ts` | `features/ai-assistant/services/aiService.ts` | 重命名 |
| `inspectionCriteria.ts` | `features/ai-assistant/data/inspectionCriteria.ts` | — |
| `motorLibrary.ts` | `features/hardware-config/data/motorLibrary.ts` | — |
| `i18n.ts` | `shared/i18n/` | 拆分为 Provider + Hook + locales |
| `mathUtils.ts` | `shared/utils/math.ts` | — |
| `throttle.ts` | `shared/utils/throttle.ts` | 同时提供 Hook 版本 |

### 4.7 hooks/ 目录

| 当前位置 | 目标位置 | 说明 |
|---------|---------|------|
| `useHistory.ts` | `store/historyMiddleware.ts` | 改为 Zustand 中间件实现 |

---

## 5. 核心模块拆分方案

### 5.1 App.tsx 拆分

**当前状态**: ~2,734 行，包含所有状态管理、业务逻辑、UI 渲染

**拆分后**:

```typescript
// src/app/App.tsx (~150行)
import { AppProviders } from './AppProviders'
import { AppLayout } from './AppLayout'

export function App() {
  return (
    <AppProviders>
      <AppLayout />
    </AppProviders>
  )
}
```

```typescript
// src/app/AppProviders.tsx (~50行)
import { I18nProvider } from '@/shared/i18n'

export function AppProviders({ children }) {
  return (
    <I18nProvider>
      {children}
    </I18nProvider>
  )
}
```

```typescript
// src/app/AppLayout.tsx (~200行)
import { TreeEditor } from '@/features/robot-tree'
import { PropertyEditor } from '@/features/property-editor'
import { Visualizer } from '@/features/visualizer'
import { URDFViewer } from '@/features/urdf-viewer'
import { CodeEditorPanel } from '@/features/code-editor'
import { useUIStore } from '@/store'

export function AppLayout() {
  const { appMode, panels } = useUIStore()

  return (
    <div className="app-container">
      <Header />
      <main className="app-main">
        <LeftPanel>
          <TreeEditor />
        </LeftPanel>
        <CenterPanel>
          {appMode === 'detail' ? <URDFViewer /> : <Visualizer />}
        </CenterPanel>
        <RightPanel>
          <PropertyEditor />
        </RightPanel>
      </main>
      {panels.codeEditor && <CodeEditorPanel />}
    </div>
  )
}
```

**状态迁移到 Store**:

```typescript
// src/store/robotStore.ts (~250行)
import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { createHistoryMiddleware } from './historyMiddleware'

interface RobotStore {
  // State
  name: string
  links: Record<string, UrdfLink>
  joints: Record<string, UrdfJoint>
  rootLinkId: string | null
  materials: Record<string, Material>

  // Actions
  setName: (name: string) => void
  addLink: (parentJointId?: string) => string
  updateLink: (id: string, data: Partial<UrdfLink>) => void
  deleteLink: (id: string) => void
  addJoint: (parentLinkId: string) => string
  updateJoint: (id: string, data: Partial<UrdfJoint>) => void
  deleteJoint: (id: string) => void

  // Bulk operations
  importRobot: (data: RobotData) => void
  resetRobot: () => void

  // History
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
}

export const useRobotStore = create<RobotStore>()(
  createHistoryMiddleware(
    immer((set, get) => ({
      // ... implementation
    }))
  )
)
```

```typescript
// src/store/uiStore.ts (~150行)
import { create } from 'zustand'

interface UIStore {
  // App mode
  appMode: 'skeleton' | 'detail' | 'hardware'
  setAppMode: (mode: AppMode) => void

  // Selection
  selection: {
    type: 'link' | 'joint' | null
    id: string | null
    subType?: 'visual' | 'collision'
  }
  setSelection: (selection: Selection) => void
  clearSelection: () => void

  // Panels
  panels: {
    codeEditor: boolean
    aiAssistant: boolean
    inspector: boolean
  }
  togglePanel: (panel: keyof Panels) => void

  // View options
  viewOptions: {
    showGrid: boolean
    showAxes: boolean
    showJointAxes: boolean
    showInertia: boolean
    showCenterOfMass: boolean
    // ...
  }
  setViewOption: (key: string, value: any) => void
}

export const useUIStore = create<UIStore>()((set) => ({
  // ... implementation
}))
```

```typescript
// src/store/assetsStore.ts (~100行)
import { create } from 'zustand'

interface AssetsStore {
  // Mesh 文件缓存
  meshFiles: Map<string, ArrayBuffer>
  textureFiles: Map<string, ArrayBuffer>

  // Actions
  addMeshFile: (path: string, data: ArrayBuffer) => void
  getMeshFile: (path: string) => ArrayBuffer | undefined
  clearAssets: () => void
}

export const useAssetsStore = create<AssetsStore>()((set, get) => ({
  // ... implementation
}))
```

### 5.2 RobotModel.tsx 拆分

**当前状态**: ~2,273 行，包含模型加载、渲染、交互、动画

**拆分后**:

```
features/urdf-viewer/components/
├── model/
│   ├── RobotModel.tsx       # 主协调组件 (~300行)
│   ├── LinkRenderer.tsx     # Link 渲染 (~200行)
│   ├── JointRenderer.tsx    # Joint 渲染 (~180行)
│   ├── GeometryFactory.tsx  # 几何体创建 (~200行)
│   └── MeshRenderer.tsx     # 网格文件渲染 (~150行)
├── interaction/
│   ├── JointInteraction.tsx # 关节交互 (~150行)
│   └── CollisionTransformControls.tsx # 碰撞体变换 (~200行)

features/urdf-viewer/hooks/
├── useModelLoader.ts    # 模型加载逻辑 (~200行)
├── useJointAnimation.ts # 关节动画 (~150行)
└── useCollisionEdit.ts  # 碰撞体编辑 (~150行)
```

**RobotModel.tsx 重构**:

```typescript
// src/features/urdf-viewer/components/model/RobotModel.tsx (~300行)
import { useModelLoader } from '../../hooks/useModelLoader'
import { LinkRenderer } from './LinkRenderer'
import { JointRenderer } from './JointRenderer'

interface RobotModelProps {
  urdfContent: string
  meshFiles: Map<string, File>
  onLinkClick?: (linkName: string) => void
}

export function RobotModel({ urdfContent, meshFiles, onLinkClick }: RobotModelProps) {
  const { robot, isLoading, error } = useModelLoader(urdfContent, meshFiles)

  if (isLoading) return <LoadingIndicator />
  if (error) return <ErrorDisplay error={error} />

  return (
    <group>
      {Object.values(robot.links).map(link => (
        <LinkRenderer
          key={link.id}
          link={link}
          onClick={() => onLinkClick?.(link.name)}
        />
      ))}
      {Object.values(robot.joints).map(joint => (
        <JointRenderer
          key={joint.id}
          joint={joint}
        />
      ))}
    </group>
  )
}
```

### 5.3 PropertyEditor.tsx 拆分

**当前状态**: ~1,151 行，所有属性编辑表单

**拆分后**:

```
features/property-editor/components/
├── PropertyEditor.tsx      # 容器，根据选择显示不同编辑器 (~100行)
├── link/
│   ├── LinkEditor.tsx      # Link 编辑器容器 (~150行)
│   ├── GeometrySection.tsx # 几何体设置 (~200行)
│   ├── InertialSection.tsx # 惯性设置 (~180行)
│   ├── VisualSection.tsx   # 可视化设置 (~150行)
│   └── MaterialSection.tsx # 材质设置 (~120行)
├── joint/
│   ├── JointEditor.tsx     # Joint 编辑器容器 (~150行)
│   ├── JointTypeSection.tsx # 类型选择 (~100行)
│   ├── LimitsSection.tsx   # 限制设置 (~150行)
│   ├── DynamicsSection.tsx # 动力学设置 (~120行)
│   └── OriginSection.tsx   # 原点设置 (~100行)
└── collision/
    ├── CollisionEditor.tsx # 碰撞体编辑 (~150行)
    └── CollisionList.tsx   # 碰撞体列表 (~100行)
```

**PropertyEditor.tsx 重构**:

```typescript
// src/features/property-editor/components/PropertyEditor.tsx (~100行)
import { useUIStore, useRobotStore } from '@/store'
import { LinkEditor } from './link/LinkEditor'
import { JointEditor } from './joint/JointEditor'

export function PropertyEditor() {
  const { selection } = useUIStore()
  const { links, joints } = useRobotStore()

  if (!selection.id) {
    return <EmptyState message="Select a link or joint to edit" />
  }

  if (selection.type === 'link') {
    const link = links[selection.id]
    return <LinkEditor link={link} subType={selection.subType} />
  }

  if (selection.type === 'joint') {
    const joint = joints[selection.id]
    return <JointEditor joint={joint} />
  }

  return null
}
```

### 5.4 Visualizer.tsx 拆分

**当前状态**: ~1,575 行，场景管理和机器人渲染

**拆分后**:

```
features/visualizer/components/
├── Visualizer.tsx          # 主容器 (~150行)
├── scene/
│   ├── SceneCanvas.tsx     # R3F Canvas (~100行)
│   ├── CameraController.tsx # 相机控制 (~150行)
│   ├── LightingSetup.tsx   # 光照 (~80行)
│   ├── GroundGrid.tsx      # 地面 (~60行)
│   └── EnvironmentSetup.tsx # 环境设置 (~80行)
├── robot/
│   ├── SkeletonRobot.tsx   # 骨架模式机器人 (~250行)
│   ├── LinkVisualization.tsx # Link 可视化 (~150行)
│   ├── JointVisualization.tsx # Joint 可视化 (~150行)
│   └── SelectionHighlight.tsx # 选中高亮 (~100行)
└── tools/
    ├── TransformTool.tsx   # 变换工具 (~200行)
    ├── SnapshotTool.tsx    # 截图 (~80行)
    └── ToolSelector.tsx    # 工具选择器 (~100行)
```

### 5.5 shared/components/3d/ 共享 3D 组件

> 被 `visualizer` 和 `urdf-viewer` 共用的 3D 组件

```
shared/components/3d/
├── MeshRenderers.tsx        # STL/OBJ/DAE 渲染器
│                            # 包含 STLRenderer, OBJRenderer, DAERenderer
├── SceneUtilities.tsx       # 场景工具 (相机重置、背景等)
├── helpers/
│   ├── CoordinateAxes.tsx   # 坐标轴显示
│   ├── JointAxis.tsx        # 关节轴显示
│   ├── InertiaBox.tsx       # 惯性盒可视化
│   ├── CenterOfMass.tsx     # 质心显示
│   └── index.ts
└── index.ts
```

---

## 6. 状态管理重构

### 6.1 引入 Zustand

**安装**:

```bash
npm install zustand immer
```

### 6.2 Store 结构

```typescript
// src/store/index.ts
export { useRobotStore } from './robotStore'
export { useUIStore } from './uiStore'
export { useAssetsStore } from './assetsStore'
export { useSettingsStore } from './settingsStore'
```

### 6.3 历史记录中间件

```typescript
// src/store/historyMiddleware.ts
import { StateCreator, StoreMutatorIdentifier } from 'zustand'

interface HistoryState<T> {
  past: T[]
  future: T[]
  canUndo: boolean
  canRedo: boolean
  undo: () => void
  redo: () => void
}

export const createHistoryMiddleware = <T extends object>(
  config: StateCreator<T>
): StateCreator<T & HistoryState<T>> => {
  return (set, get, api) => {
    const past: T[] = []
    const future: T[] = []

    // Wrap set to track history
    const wrappedSet = (partial, replace) => {
      const currentState = get()
      past.push(currentState)
      future.length = 0
      set(partial, replace)
    }

    return {
      ...config(wrappedSet, get, api),
      past,
      future,
      canUndo: past.length > 0,
      canRedo: future.length > 0,
      undo: () => {
        if (past.length === 0) return
        const previous = past.pop()!
        future.push(get())
        set(previous, true)
      },
      redo: () => {
        if (future.length === 0) return
        const next = future.pop()!
        past.push(get())
        set(next, true)
      }
    }
  }
}
```

### 6.4 使用示例

```typescript
// 在组件中使用
import { useRobotStore, useUIStore } from '@/store'

function MyComponent() {
  // 选择性订阅，避免不必要的重渲染
  const links = useRobotStore(state => state.links)
  const updateLink = useRobotStore(state => state.updateLink)
  const selection = useUIStore(state => state.selection)

  const handleUpdate = (id: string, data: Partial<UrdfLink>) => {
    updateLink(id, data)
  }

  return (/* ... */)
}
```

---

## 7. 实施路线图

### Phase 1: 基础设施

| 任务 | 优先级 | 说明 |
|------|--------|------|
| 创建 `src/` 目录结构 | P0 | 创建所有目录骨架 |
| 配置路径别名 (`@/`) | P0 | vite.config.ts + tsconfig.json |
| 安装 Zustand | P0 | `npm install zustand immer` |
| 创建 Store 基础结构 | P0 | robotStore, uiStore, assetsStore |
| 迁移全局类型到 `types/` | P1 | 按类型拆分 |

**vite.config.ts 配置**:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

**tsconfig.json 配置**:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  }
}
```

### Phase 2: 核心模块

| 任务 | 优先级 | 依赖 |
|------|--------|------|
| 拆分 `core/robot/` | P0 | Phase 1 |
| 拆分 `core/parsers/` | P0 | Phase 1 |
| 拆分 `core/loaders/` | P1 | Phase 1 |
| 创建 `shared/components/` | P0 | Phase 1 |
| 创建 `shared/components/3d/` | P0 | Phase 1 |
| 创建 `shared/hooks/` | P0 | Phase 1 |
| 创建 `shared/utils/` | P1 | Phase 1 |

### Phase 3: Feature 模块

| 任务 | 优先级 | 依赖 |
|------|--------|------|
| 拆分 `features/robot-tree/` | P0 | Phase 2 |
| 拆分 `features/property-editor/` | P0 | Phase 2 |
| 拆分 `features/visualizer/` | P0 | Phase 2 |
| 拆分 `features/urdf-viewer/` | P0 | Phase 2 |
| 拆分 `features/code-editor/` | P1 | Phase 2 |
| 拆分 `features/hardware-config/` | P1 | Phase 2 |
| 拆分 `features/ai-assistant/` | P2 | Phase 2 |
| 拆分 `features/file-io/` | P1 | Phase 2 |

### Phase 4: App 层重构

| 任务 | 优先级 | 依赖 |
|------|--------|------|
| 创建 `app/AppLayout.tsx` | P0 | Phase 3 |
| 创建 `app/AppProviders.tsx` | P0 | Phase 3 |
| 重构 `App.tsx` | P0 | Phase 3 |
| 清理旧文件 | P0 | All above |

### Phase 5: 测试与优化

| 任务 | 优先级 |
|------|--------|
| 添加单元测试 | P1 |
| 性能测试 | P1 |
| 文档更新 | P2 |
| Code Review | P0 |

---

## 8. 模块依赖关系

```
                           ┌─────────────┐
                           │   app/      │
                           │   App.tsx   │
                           └──────┬──────┘
                                  │
           ┌──────────────────────┼──────────────────────┐
           │                      │                      │
           ▼                      ▼                      ▼
   ┌───────────────┐     ┌───────────────┐     ┌───────────────┐
   │ robot-tree/   │     │  visualizer/  │     │property-editor│
   └───────┬───────┘     └───────┬───────┘     └───────┬───────┘
           │                     │                     │
           │         ┌───────────┼───────────┐        │
           │         │           │           │        │
           ▼         ▼           ▼           ▼        ▼
        ┌─────────────────────────────────────────────────┐
        │                    store/                        │
        │    (robotStore, uiStore, assetsStore, settings)  │
        └─────────────────────────┬───────────────────────┘
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        │                         │                         │
        ▼                         ▼                         ▼
   ┌──────────┐            ┌──────────┐             ┌──────────┐
   │  core/   │            │  shared/ │             │  types/  │
   │  robot/  │            │components│             │          │
   │ parsers/ │            │  3d/     │             │          │
   │ loaders/ │            │  hooks/  │             │          │
   └──────────┘            │  utils/  │             │          │
                           └──────────┘             └──────────┘
```

### 依赖规则

| 层级 | 可依赖 | 不可依赖 |
|------|--------|----------|
| `app/` | features, store, shared, core, types | - |
| `features/` | store, shared, core, types | app, 其他 features |
| `store/` | core, types | app, features, shared |
| `shared/` | types | app, features, store, core |
| `core/` | types | app, features, store, shared |
| `types/` | - | 所有 |

> **注意**: Features 之间不应直接依赖，通过 Store 通信

---

## 9. 编码规范

### 9.1 文件命名

| 类型 | 命名规则 | 示例 |
|------|----------|------|
| 组件 | PascalCase | `LinkEditor.tsx` |
| Hook | camelCase, use 前缀 | `useModelLoader.ts` |
| 工具函数 | camelCase | `transforms.ts` |
| 类型文件 | camelCase | `types.ts` |
| 常量文件 | camelCase | `constants.ts` |
| 测试文件 | *.test.ts | `LinkEditor.test.tsx` |

### 9.2 导出规范

每个模块必须有 `index.ts` 导出公共 API：

```typescript
// features/property-editor/index.ts
export { PropertyEditor } from './components/PropertyEditor'
export { usePropertyForm } from './hooks/usePropertyForm'
export type { PropertyEditorProps } from './types'
```

### 9.3 组件结构

```typescript
// 标准组件结构
import { memo } from 'react'

interface MyComponentProps {
  // Props with JSDoc
  /** The link to edit */
  link: UrdfLink
  /** Callback when link changes */
  onChange?: (link: UrdfLink) => void
}

export const MyComponent = memo(function MyComponent({
  link,
  onChange
}: MyComponentProps) {
  // 1. Hooks
  const { state, actions } = useMyHook()

  // 2. Derived state
  const derivedValue = useMemo(() => /* ... */, [deps])

  // 3. Handlers
  const handleClick = useCallback(() => /* ... */, [deps])

  // 4. Render
  return (
    <div>
      {/* ... */}
    </div>
  )
})
```

### 9.4 Import 顺序

```typescript
// 1. React
import { useState, useCallback } from 'react'

// 2. 第三方库
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'

// 3. Store
import { useRobotStore, useUIStore } from '@/store'

// 4. Features (同级别模块)
import { LinkRenderer } from './LinkRenderer'

// 5. Shared
import { Button, Input } from '@/shared/components'
import { useThrottle } from '@/shared/hooks'
import { CoordinateAxes, InertiaBox } from '@/shared/components/3d'

// 6. Core
import { parseURDF } from '@/core/parsers'

// 7. Types
import type { UrdfLink } from '@/types'

// 8. Styles
import './MyComponent.css'
```

---

## 附录：快速参考

### 常用命令

```bash
# 创建新 Feature
mkdir -p src/features/my-feature/{components,hooks}
touch src/features/my-feature/index.ts

# 创建新 Shared 组件
mkdir -p src/shared/components/MyComponent
touch src/shared/components/MyComponent/{MyComponent.tsx,index.ts}

# 创建新 3D 共享组件
mkdir -p src/shared/components/3d/helpers
touch src/shared/components/3d/MyHelper.tsx
```

### 模块模板

**Feature 模块**:

```
features/my-feature/
├── components/
│   ├── MyFeature.tsx
│   └── SubComponent.tsx
├── hooks/
│   └── useMyFeature.ts
├── types.ts
└── index.ts
```

**Shared 组件**:

```
shared/components/MyComponent/
├── MyComponent.tsx
├── MyComponent.test.tsx
└── index.ts
```

**Shared 3D 组件**:

```
shared/components/3d/
├── MyRenderer.tsx
├── helpers/
│   └── MyHelper.tsx
└── index.ts
```

---

*文档版本: 1.1*
*最后更新: 2025-01*
