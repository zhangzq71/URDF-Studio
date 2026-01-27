# URDF-Studio 开发指南

> 本文件为 Claude Code 提供项目上下文。

## 项目概述

**URDF Studio** - 可视化机器人设计平台

- **技术栈**: React 19 + TypeScript + Three.js (R3F) + Vite + Tailwind CSS 4 + Zustand
- **在线地址**: https://urdf.d-robotics.cc/
- **许可证**: Apache 2.0

## 项目结构

```
urdf-studio/
├── index.html              # HTML 入口
├── vite.config.ts          # Vite 构建配置
├── tsconfig.json           # TypeScript 编译配置
├── package.json            # npm 依赖和脚本
├── package-lock.json       # npm 依赖锁定
├── metadata.json           # 项目元数据
├── test-api.js             # API 测试脚本
├── README.md               # 英文文档
├── README_CN.md            # 中文文档
├── LICENSE                 # Apache 2.0 许可证
├── .gitignore              # Git 忽略配置
│
├── public/                 # 静态资源
│   ├── logos/              # Logo 图片
│   └── samples/            # 示例 URDF 文件 (Go2, H1)
│
├── docs/                   # 项目文档
│   ├── CLAUDE.md           # AI 开发指南 (本文件)
│   └── urdf_inspect_standard_{zh,en}.md  # AI 审阅标准
│
└── src/
    ├── main.tsx            # React 应用入口
    ├── styles/index.css    # Tailwind CSS 全局样式
    │
    ├── types/              # TypeScript 类型定义 (robot, geometry, hardware, inspection, ui, constants)
    │
    ├── core/               # 核心逻辑 (纯函数，无 React 依赖)
    │   ├── robot/          # 机器人模型操作 (builders, transforms, validators)
    │   ├── parsers/        # 格式解析器 (URDF, MJCF, USD, Xacro)
    │   │   ├── urdf/       # Parser + Generator (XML ↔ Robot)
    │   │   ├── mjcf/       # MuJoCo 格式支持
    │   │   ├── usd/        # USD 格式支持
    │   │   └── xacro/      # Xacro 宏展开
    │   └── loaders/        # 网格加载器 (STL/OBJ/DAE)
    │
    ├── store/              # Zustand 状态管理
    │   ├── robotStore.ts   # 机器人模型状态 (CRUD)
    │   ├── uiStore.ts      # UI 状态 (mode, theme, language, panels)
    │   ├── selectionStore.ts # 选中状态
    │   ├── assetsStore.ts  # 资源管理 (meshes, textures)
    │   └── historyMiddleware.ts # Undo/Redo 中间件
    │
    ├── shared/             # 共享模块
    │   ├── components/     # 通用 UI 组件
    │   │   ├── Panel/      # 面板组件
    │   │   └── 3d/         # 3D 辅助组件 (MeshRenderers, SceneUtilities, helpers)
    │   ├── hooks/          # 通用 Hooks (useHistory)
    │   ├── utils/          # 工具函数 (math, throttle)
    │   └── i18n/           # 国际化 (zh, en)
    │
    ├── features/           # 功能模块 (独立可组合)
    │   ├── robot-tree/     # 机器人树编辑器 (TreeEditor)
    │   ├── property-editor/ # 属性编辑器 (PropertyEditor)
    │   ├── visualizer/     # 3D 可视化 (Skeleton/Hardware 模式)
    │   ├── urdf-viewer/    # URDF 查看器 (Detail 模式，含完整渲染和交互)
    │   ├── code-editor/    # Monaco 代码编辑器 (可编辑/只读)
    │   ├── hardware-config/ # 硬件配置 (电机库数据)
    │   ├── ai-assistant/   # AI 助手 (对话、审阅、OpenAI API)
    │   └── file-io/        # 文件 I/O (导入/导出/PDF/截图)
    │
    └── app/                # 应用层
        ├── App.tsx         # 根组件
        ├── AppLayout.tsx   # 主布局 (集成所有 features)
        ├── Providers.tsx   # Context Providers
        ├── components/     # Header, SettingsModal, AboutModal
        └── hooks/          # 应用级 Hooks (状态、副作用、文件操作)
```

## 架构设计

### 依赖规则

```
app/ → features/ → store/ → shared/ → core/ → types/
```

- **单向依赖**: 上层依赖下层，下层不依赖上层
- **Feature 隔离**: Features 间通过 Store 通信，不直接依赖
- **路径别名**: `@/` 映射到 `src/` 目录

### 核心技术

- **状态管理**: Zustand + Immer (不可变更新)
- **Undo/Redo**: historyMiddleware 拦截状态变更
- **3D 渲染**: Three.js + React Three Fiber
- **代码编辑**: Monaco Editor

## 三种编辑模式

| 模式 | 用途 | 3D 组件 |
|------|------|---------|
| **Skeleton** | 搭建机器人骨架 (Links & Joints) | `Visualizer` |
| **Detail** | 调整视觉/碰撞几何体，导入网格 | `URDFViewer` |
| **Hardware** | 配置电机参数、力矩、传动比 | `Visualizer` |

## 文件格式

- **导入**: URDF, MJCF, USD, ZIP
- **导出**: URDF, MJCF, USD, ZIP, PDF (审阅报告), CSV (BOM)

## AI 功能

配置 `.env.local`:

```env
VITE_OPENAI_API_KEY=your_key
VITE_OPENAI_BASE_URL=https://api.openai.com/v1
VITE_OPENAI_MODEL=bce/deepseek-v3.2
```

- **自然语言生成**: 描述机器人结构，AI 生成 URDF
- **AI 审阅**: 6 大类检查 (物理合理性、运动学、命名规范等)
- **评分报告**: PDF 导出审阅结果

## 开发命令

```bash
npm run dev      # 开发服务器 (localhost:5173)
npm run build    # 生产构建
npm run preview  # 预览构建产物
```
