# URDF-Studio 开发指南

> 本文件为 Claude Code 提供项目上下文，帮助理解项目架构与开发规范。

## 项目概述

**URDF Studio** — 专业级可视化机器人设计与仿真平台

- **技术栈**: React 19 + TypeScript 5.8 + Three.js (R3F) + Vite 6 + Tailwind CSS 4 + Zustand 5
- **在线地址**: https://urdf.d-robotics.cc/
- **仓库地址**: https://github.com/OpenLegged/URDF-Studio
- **许可证**: Apache 2.0

### 核心能力

- 三模式设计 (Skeleton / Detail / Hardware)
- 多 URDF 组装 (Assembly) 与桥接关节
- 多格式支持 (URDF / MJCF / USD / Xacro)
- AI 生成与审阅 (OpenAI API)
- 项目级文件管理 (.usp 格式)

## 项目结构

```
urdf-studio/
├── index.html                 # HTML 入口
├── vite.config.ts             # Vite 构建配置 (别名 @/ → src/)
├── tsconfig.json              # TypeScript 编译配置
├── package.json               # npm 依赖和脚本
├── metadata.json              # 项目元数据
├── README.md / README_CN.md   # 英文 / 中文文档
├── LICENSE                    # Apache 2.0
│
├── public/                    # 静态资源
│   ├── logos/                 # Logo 图片
│   ├── library/               # 示例 URDF 文件 (Unitree Go2, H1 等)
│   ├── fonts/                 # Web 字体
│   ├── monaco-editor/         # Monaco Editor 资源
│   └── potsdamer_platz_1k.hdr # 3D 环境贴图 (HDR)
│
├── docs/                      # 项目文档
│   ├── tutorials/             # 用户教程
│   │   ├── zh/                # 中文教程
│   │   └── en/                # 英文教程
│   └── prompts/               # AI 提示词 / 上下文文档
│       ├── CLAUDE.md          # Claude Code 上下文 (本文件)
│       ├── GEMINI.md          # Gemini 上下文
│       ├── overview.md        # 项目概览
│       ├── visualizer.md      # Visualizer 模块文档
│       └── urdf-viewer.md     # URDFViewer 模块文档
│
└── src/
    ├── main.tsx               # React 应用入口
    │
    ├── types/                 # TypeScript 类型定义
    │   ├── robot.ts           # RobotState, UrdfLink, UrdfJoint,
    │   │                      # AssemblyComponent, BridgeJoint, AssemblyState
    │   ├── geometry.ts        # Vector3, Euler, GeometryType, UrdfVisual, UrdfCollision
    │   ├── hardware.ts        # MotorSpec, HardwareConfig
    │   ├── inspection.ts      # AI 审阅类型
    │   ├── ui.ts              # AppMode, Theme
    │   ├── constants.ts       # DEFAULT_LINK, DEFAULT_JOINT
    │   └── index.ts           # 统一导出
    │
    ├── core/                  # 核心逻辑 (纯函数，无 React 依赖)
    │   ├── robot/             # 机器人模型操作
    │   │   ├── builders.ts    # 构建辅助函数
    │   │   ├── transforms.ts  # 几何变换
    │   │   ├── validators.ts  # 数据校验
    │   │   ├── assemblyMerger.ts # 多 URDF 合并逻辑
    │   │   └── constants.ts   # 核心常量
    │   ├── parsers/           # 格式解析器
    │   │   ├── urdf/          # URDF Parser + Generator (XML ↔ RobotState)
    │   │   │   ├── loader/    # URDFLoader, URDFClasses
    │   │   │   ├── parser/    # linkParser, jointParser, geometryParser
    │   │   │   └── urdfGenerator.ts
    │   │   ├── mjcf/          # MuJoCo 格式支持
    │   │   ├── usd/           # USD 格式支持
    │   │   └── xacro/         # Xacro 宏展开
    │   └── loaders/           # 网格加载器 (STL/OBJ/DAE)
    │
    ├── store/                 # Zustand 状态管理 (5 个 Store)
    │   ├── robotStore.ts      # 机器人模型状态 (CRUD + Undo/Redo)
    │   ├── uiStore.ts         # UI 状态 (mode, theme, lang, panels, sidebarTab)
    │   ├── selectionStore.ts  # 选中/悬停状态
    │   ├── assetsStore.ts     # 资源管理 (meshes, textures, 电机库)
    │   ├── assemblyStore.ts   # 多 URDF 组装状态 (components, bridgeJoints)
    │   └── historyMiddleware.ts # Undo/Redo 中间件
    │
    ├── shared/                # 共享模块
    │   ├── components/        # 通用 UI 组件
    │   │   ├── 3d/            # 3D 辅助组件
    │   │   │   ├── MeshRenderers.tsx    # 网格渲染器
    │   │   │   ├── SceneUtilities.tsx   # 场景工具
    │   │   │   ├── UsageGuide.tsx       # 使用引导
    │   │   │   └── helpers/            # CoordinateAxes, JointAxis, CenterOfMass, InertiaBox
    │   │   ├── Button/        # 按钮组件
    │   │   ├── Input/         # 输入组件
    │   │   ├── Modal/         # 模态框
    │   │   ├── Panel/         # 面板组件
    │   │   ├── Select/        # 选择器
    │   │   ├── Slider/        # 滑动条
    │   │   ├── Tabs/          # 标签页
    │   │   ├── Tooltip/       # 提示框
    │   │   ├── FilePreviewCard.tsx # 文件预览卡片 (可复用模板)
    │   │   └── ui/            # 底层 UI 原语
    │   ├── hooks/             # 通用 Hooks (useHistory)
    │   ├── utils/             # 工具函数 (math, throttle)
    │   └── i18n/              # 国际化
    │       ├── types.ts       # TranslationKeys 类型
    │       ├── translations.ts # 语言切换辅助
    │       └── locales/       # en.ts, zh.ts
    │
    ├── features/              # 功能模块 (独立可组合)
    │   ├── robot-tree/        # 左侧树编辑器 (Simple / Pro Workspace)
    │   │   └── components/    # TreeEditor, FileTreeNode, AssemblyTreeView,
    │   │                      # FilePreviewWindow, FileTreeContextMenu
    │   ├── property-editor/   # 属性编辑面板
    │   ├── visualizer/        # 3D 可视化 (Skeleton / Hardware 模式)
    │   ├── urdf-viewer/       # URDF 查看器 (Detail 模式，完整渲染 + 交互)
    │   ├── code-editor/       # Monaco 代码编辑器
    │   ├── hardware-config/   # 硬件配置 (电机库数据)
    │   ├── ai-assistant/      # AI 助手
    │   │   ├── components/    # AI UI 组件
    │   │   ├── services/      # OpenAI API 调用
    │   │   ├── config/        # 审阅标准 Prompt
    │   │   └── utils/         # 评分计算逻辑
    │   ├── assembly/          # 多 URDF 组装
    │   │   └── components/    # BridgeCreateModal (桥接关节创建)
    │   ├── file-io/           # 文件 I/O
    │   │   ├── components/    # 导入/导出 UI
    │   │   ├── hooks/         # useFileImport, useFileExport, usePdfExport, useSnapshot
    │   │   └── utils/         # projectImport/Export, assetUtils, bomGenerator,
    │   │                      # formatDetection, fileTraverser, generatePdfFromHtml
    │   └── urdf-gallery/      # 模型广场 (浏览/导入示例机器人)
    │
    └── app/                   # 应用层
        ├── App.tsx            # 根组件
        ├── AppLayout.tsx      # 主布局 (集成所有 features)
        ├── Providers.tsx      # Context Providers
        ├── components/        # Header, SettingsModal, AboutModal
        └── hooks/             # useAppState, useAppEffects, useFileImport, useFileExport
```

## 架构设计

### 依赖规则 (单向依赖，严禁反向)

```
app/ → features/ → store/ → shared/ → core/ → types/
```

- **Feature 隔离**: Features 之间通过 Store 通信，不直接互相依赖
- **Core 纯逻辑**: `core/` 层无 React/UI 依赖，纯函数实现
- **路径别名**: `@/` 映射到 `src/` 目录

### 状态管理 (Zustand + Immer)

| Store | 职责 | 持久化 |
|-------|------|--------|
| `robotStore` | 机器人模型 CRUD、Undo/Redo、计算属性 (getRootLink, getChildJoints) | 否 |
| `uiStore` | 编辑模式、主题、语言、面板可见性、侧边栏标签 | 是 |
| `selectionStore` | 选中 Link/Joint、悬停状态、相机聚焦目标 | 否 |
| `assetsStore` | Mesh/Texture 上传、电机库 | 否 |
| `assemblyStore` | 多 URDF 组装组件、桥接关节 (BridgeJoint) | 否 |

### 核心技术栈

| 领域 | 技术 |
|------|------|
| UI 框架 | React 19 + TypeScript 5.8 |
| 构建工具 | Vite 6 |
| 样式方案 | Tailwind CSS 4 (@tailwindcss/vite) |
| 状态管理 | Zustand 5 + Immer |
| 3D 渲染 | Three.js + React Three Fiber + @react-three/drei |
| 代码编辑 | Monaco Editor |
| AI 集成 | OpenAI SDK |
| 文件处理 | JSZip + jsPDF + jsdom |
| 图标 | Lucide React |

## 三种编辑模式

| 模式 | 用途 | 3D 组件 | 功能 |
|------|------|---------|------|
| **Skeleton** | 搭建运动链拓扑 | `Visualizer` | 添加/删除 Links & Joints，设置关节类型与限位 |
| **Detail** | 编辑几何体与外观 | `URDFViewer` | 导入 STL/OBJ/DAE 网格，设置 Visual/Collision，材质与纹理 |
| **Hardware** | 配置硬件参数 | `Visualizer` | 选择电机型号，配置传动比、阻尼、摩擦 |

## 多 URDF 组装 (Assembly)

- 导入多个 URDF 文件作为组件 (AssemblyComponent)
- 自动为 Link/Joint 添加命名空间前缀，避免冲突
- 通过桥接关节 (BridgeJoint) 连接不同组件
- 合并渲染与导出 (assemblyMerger)
- Workspace（专业模式）文件树交互:
  - 左键文件: 打开独立 3D 预览窗口 (不直接加入组装)
  - 右键文件: 弹出菜单并执行“添加”
  - 文件行右侧绿色按钮: 一键“添加”到组装
- 项目文件格式: `.usp` (ZIP 压缩包，含 project.json + robot/ + meshes/)

## 左侧栏专业模式 (Workspace) 交互要点

### 当前交互流程

1. 切换到 `workspace` 标签（专业模式）后，左侧上半部分显示素材库文件树，下半部分显示组装树。
2. 单击文件节点会打开“独立可拖拽预览窗口”，使用真实 3D 画布渲染预览（非静态图）。
3. 将文件加入组装有两种入口:
   - 右键文件节点 → 菜单“添加”
   - 文件行最右侧绿色“添加”按钮
4. 简单模式 (`structure`) 保持原有文件树行为，不展示专业模式添加入口。

### 关键文件与职责

- `src/features/robot-tree/components/TreeEditor.tsx`
  - 专业/简单模式切换
  - 文件树、组装树、右键菜单、预览窗口状态编排
- `src/features/robot-tree/components/FileTreeNode.tsx`
  - 文件节点渲染
  - 左键预览、右键菜单触发、专业模式绿色添加按钮
- `src/features/robot-tree/components/FileTreeContextMenu.tsx`
  - 文件节点右键菜单 UI
- `src/features/robot-tree/components/FilePreviewWindow.tsx`
  - 独立预览窗口
  - 预览格式转换: URDF 直出，Xacro 展开，MJCF/USD 转 URDF，mesh 构造单 link 预览
- `src/app/AppLayout.tsx`
  - `handleAddComponent` 对接 `assemblyStore.addComponent`
- `src/store/assemblyStore.ts`
  - 组件添加、命名空间前缀、组装合并
- `src/store/uiStore.ts`
  - `sidebarTab: 'structure' | 'workspace'` 为模式切换状态源

### i18n 相关

- 专业模式文案位于:
  - `src/shared/i18n/locales/zh.ts`
  - `src/shared/i18n/locales/en.ts`
- 文案类型定义位于:
  - `src/shared/i18n/types.ts`

## 文件格式支持

| 方向 | 格式 |
|------|------|
| **导入** | URDF, MJCF, USD, Xacro, ZIP, .usp |
| **导出** | URDF, MJCF, USD, ZIP (含 meshes), PDF (审阅报告), CSV (BOM) |

## AI 功能

配置 `.env.local`:

```env
VITE_OPENAI_API_KEY=your_key
VITE_OPENAI_BASE_URL=https://api.openai.com/v1
VITE_OPENAI_MODEL=deepseek-v3
```

- **自然语言生成**: 描述机器人结构，AI 生成 URDF
- **AI 审阅**: 6 大类检查 (物理合理性、运动学、命名规范、几何完整性、安全性、最佳实践)
- **评分报告**: PDF 导出审阅结果

## 国际化 (i18n)

- **支持语言**: 英文 (en)、中文 (zh)
- **文件位置**: `src/shared/i18n/locales/`
- **使用方式**: `const lang = useUIStore(s => s.lang); translations[lang].key`
- 新增文本需同时在 `en.ts` 和 `zh.ts` 中添加对应翻译

## 开发命令

```bash
npm run dev      # 开发服务器 (localhost:5173，vite.config 中可配置端口)
npm run build    # 生产构建 (输出到 dist/)
npm run preview  # 预览构建产物
```

## 开发注意事项

- 无测试框架 (Jest/Vitest)，通过 TypeScript 编译检查类型正确性
- 存在部分预存 TS 错误 (URDFClasses, capsule/visuals/physics 相关)，与业务逻辑无关
- 构建验证: `npm run build` 应成功通过
- 遵循现有代码风格和目录约定，新增功能放入 `features/` 对应模块
- 新增 Store 操作使用 Immer 的不可变更新模式
