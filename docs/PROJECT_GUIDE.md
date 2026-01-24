# URDF-Studio 项目指南

> 本文档为 AI 助手提供项目快速导航，帮助定位各模块功能和文件位置。

## 项目概述

**URDF Studio** 是一个基于 Web 的可视化机器人设计平台，用于创建、编辑和导出 URDF（Unified Robot Description Format）模型。

- **在线体验**: https://urdf.d-robotics.cc/
- **技术栈**: React 19 + TypeScript + Three.js + Vite + Tailwind CSS

### 三种设计模式

| 模式 | 用途 | 主要组件 |
|------|------|----------|
| Skeleton | 骨架/运动学设计 | `Visualizer.tsx` |
| Detail | 几何体/材质/惯性编辑 | `URDFViewer/` |
| Hardware | 电机/执行器配置 | `PropertyEditor.tsx` + `motorLibrary.ts` |

---

## 目录结构速查

```
URDF-Studio/
├── App.tsx                 # 主应用组件（状态管理中心）
├── index.tsx               # React 入口
├── types.ts                # 全局类型定义
│
├── components/             # UI 组件层
│   ├── URDFViewer/         # Detail 模式 3D 渲染
│   ├── shared/             # 共享渲染组件
│   ├── ui/                 # 通用 UI 组件
│   ├── Visualizer.tsx      # Skeleton/Hardware 模式渲染
│   ├── TreeEditor.tsx      # 机器人结构树编辑器
│   ├── PropertyEditor.tsx  # 属性编辑面板
│   └── SourceCodeEditor.tsx # 代码编辑器
│
├── services/               # 业务逻辑层
│   ├── urdfParser.ts       # URDF 解析
│   ├── urdfGenerator.ts    # URDF 生成
│   ├── mjcfParser.ts       # MuJoCo 解析
│   ├── xacroParser.ts      # Xacro 宏处理
│   ├── geminiService.ts    # AI 服务集成
│   └── motorLibrary.ts     # 电机规格库
│
├── hooks/                  # React Hooks
│   └── useHistory.ts       # Undo/Redo 状态管理
│
└── docs/                   # 文档
```

---

## 核心文件定位

### 1. 状态与数据流

| 文件 | 职责 | 关键内容 |
|------|------|----------|
| [App.tsx](../App.tsx) | 应用状态中心 | `robotData`, `selection`, `appMode`, `assets` 状态管理 |
| [types.ts](../types.ts) | 类型定义 | `RobotState`, `UrdfLink`, `UrdfJoint`, `MotorSpec` |
| [useHistory.ts](../hooks/useHistory.ts) | Undo/Redo | `past`, `present`, `future` 状态栈 |

### 2. 3D 渲染系统

| 文件 | 职责 | 使用场景 |
|------|------|----------|
| [Visualizer.tsx](../components/Visualizer.tsx) | 骨架模式渲染 | Skeleton/Hardware 模式的圆柱体链接可视化 |
| [URDFViewer/index.tsx](../components/URDFViewer/index.tsx) | Detail 模式容器 | 完整 URDF 模型渲染 |
| [URDFViewer/RobotModel.tsx](../components/URDFViewer/RobotModel.tsx) | 3D 模型核心 | Mesh 加载、材质应用、交互处理 |
| [URDFViewer/loaders.ts](../components/URDFViewer/loaders.ts) | Mesh 加载器 | STL/OBJ/DAE 文件加载 |
| [URDFViewer/materials.ts](../components/URDFViewer/materials.ts) | 材质管理 | Three.js 材质定义与缓存 |
| [shared/MeshRenderers.tsx](../components/shared/MeshRenderers.tsx) | Mesh 渲染组件 | `STLRenderer`, `OBJRenderer`, `DAERenderer` |
| [shared/VisualizationHelpers.tsx](../components/shared/VisualizationHelpers.tsx) | 可视化辅助 | 坐标轴、惯性盒、质心显示 |

### 3. 编辑器组件

| 文件 | 职责 | UI 位置 |
|------|------|---------|
| [TreeEditor.tsx](../components/TreeEditor.tsx) | 结构树编辑 | 左侧边栏 |
| [PropertyEditor.tsx](../components/PropertyEditor.tsx) | 属性编辑 | 右侧边栏 |
| [SourceCodeEditor.tsx](../components/SourceCodeEditor.tsx) | 代码编辑 | 底部/模态框 |
| [ui/OptionsPanel.tsx](../components/ui/OptionsPanel.tsx) | 选项面板 | 3D 视图叠加层 |

### 4. 格式解析与生成

| 文件 | 输入 | 输出 |
|------|------|------|
| [urdfParser.ts](../services/urdfParser.ts) | URDF XML | `RobotState` |
| [urdfGenerator.ts](../services/urdfGenerator.ts) | `RobotState` | URDF XML |
| [mjcfParser.ts](../services/mjcfParser.ts) | MuJoCo XML | `RobotState` |
| [mjcfLoader.ts](../services/mjcfLoader.ts) | MuJoCo XML | Three.js Object |
| [usdParser.ts](../services/usdParser.ts) | USD/USDA | `RobotState` |
| [xacroParser.ts](../services/xacroParser.ts) | Xacro XML | 展开后的 URDF |
| [mujocoGenerator.ts](../services/mujocoGenerator.ts) | `RobotState` | MuJoCo XML |

### 5. AI 与辅助服务

| 文件 | 职责 |
|------|------|
| [geminiService.ts](../services/geminiService.ts) | AI 集成（OpenAI/DeepSeek API），机器人生成与检查 |
| [inspectionCriteria.ts](../services/inspectionCriteria.ts) | 检查标准与评分算法 |
| [motorLibrary.ts](../services/motorLibrary.ts) | 内置电机库（Unitree、RobStride） |
| [i18n.ts](../services/i18n.ts) | 国际化（中英文） |
| [mathUtils.ts](../services/mathUtils.ts) | 矩阵运算、特征值分解 |

---

## 核心数据结构

### RobotState（机器人模型）

```typescript
interface RobotState {
  name: string;
  links: Record<string, UrdfLink>;    // 所有 link
  joints: Record<string, UrdfJoint>;  // 所有 joint
  rootLinkId: string;                  // 根 link ID
  materials?: Record<string, Material>;
}
```

### UrdfLink（连杆）

```typescript
interface UrdfLink {
  id: string;
  name: string;
  visual: {
    geometry: GeometryConfig;
    material?: MaterialConfig;
    origin?: { xyz, rpy };
  };
  collision?: CollisionConfig;
  inertial?: InertialConfig;
}
```

### UrdfJoint（关节）

```typescript
interface UrdfJoint {
  id: string;
  name: string;
  type: 'fixed' | 'revolute' | 'continuous' | 'prismatic';
  parentLinkId: string;
  childLinkId: string;
  origin: { xyz, rpy };
  axis?: { xyz };
  limits?: { lower, upper, velocity, effort };
  hardware?: MotorSpec;  // 电机配置
}
```

---

## 关键流程

### 导入流程

```
ZIP 文件 → 解压 → 检测格式 (URDF/MJCF/USD/Xacro)
    ↓
对应 Parser → RobotState → 加载 Mesh 到 assets
    ↓
UI 渲染 (TreeEditor + Visualizer/URDFViewer)
```

### 导出流程

```
RobotState → urdfGenerator.ts → URDF XML
    ↓
收集 assets (Mesh 文件) → 打包 ZIP → 下载
```

### AI 检查流程

```
RobotState → geminiService.runRobotInspection()
    ↓
按类别评估 (物理合理性、框架、装配、运动学、硬件、命名)
    ↓
生成 InspectionReport → 显示问题与评分
```

---

## 配置文件

| 文件 | 用途 |
|------|------|
| [vite.config.ts](../vite.config.ts) | Vite 构建配置，端口 3000 |
| [tsconfig.json](../tsconfig.json) | TypeScript 配置，ES2022 |
| [package.json](../package.json) | 依赖与脚本 |
| [tailwind.config.js](../tailwind.config.js) | Tailwind CSS 配置 |

### 环境变量

```bash
VITE_OPENAI_API_KEY     # OpenAI API 密钥
VITE_OPENAI_BASE_URL    # 自定义 API 端点
VITE_OPENAI_MODEL       # 模型名称
```

---

## 开发命令

```bash
npm run dev      # 启动开发服务器 (localhost:3000)
npm run build    # 生产构建
npm run preview  # 预览生产构建
```

---

## 技术栈速查

| 类别 | 技术 |
|------|------|
| 框架 | React 19.2, TypeScript 5.8 |
| 3D 引擎 | Three.js 0.181, React Three Fiber |
| 样式 | Tailwind CSS 4.1 |
| 构建 | Vite 6.2 |
| 代码编辑 | Monaco Editor |
| 文件处理 | JSZip, jsPDF |
| AI | OpenAI SDK (兼容 DeepSeek 等) |

---

## 常见任务定位

| 任务 | 相关文件 |
|------|----------|
| 添加新的 Joint 类型 | `types.ts`, `urdfParser.ts`, `urdfGenerator.ts` |
| 修改 3D 渲染效果 | `URDFViewer/RobotModel.tsx`, `materials.ts` |
| 添加新的文件格式支持 | `services/` 下创建新 parser |
| 修改属性编辑面板 | `PropertyEditor.tsx` |
| 添加新电机型号 | `motorLibrary.ts` |
| 修改 AI 检查逻辑 | `geminiService.ts`, `inspectionCriteria.ts` |
| 添加新语言 | `i18n.ts` |
| 修改骨架可视化 | `Visualizer.tsx` |
| 修改导入/导出逻辑 | `App.tsx` 中的 `handleImport`/`handleExport` |

---

## 相关文档

- [模块化重构计划](./MODULARIZATION_PLAN.md) - 架构改进路线图
- [URDF 检查标准 (EN)](./urdf_inspect_standard_en.md)
- [URDF 检查标准 (ZH)](./urdf_inspect_stantard_zh.md)
