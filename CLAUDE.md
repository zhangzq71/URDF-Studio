# URDF-Studio 重构助手指南

> 本文件为 Claude Code 提供项目上下文，用于完成模块化重构最后一步。

## 项目概述

**URDF Studio** - 基于 Web 的可视化机器人设计平台

- **技术栈**: React 19 + TypeScript + Three.js (R3F) + Vite + Tailwind CSS + Zustand
- **在线体验**: https://urdf.d-robotics.cc/

## 当前重构状态

| 阶段 | 名称             | 状态      |
| ---- | ---------------- | --------- |
| 1-5  | 基础设施/类型/Core/Shared/Store | ✅ 已完成 |
| 6    | Feature 模块迁移 | ✅ 已完成 |
| 7    | **App 层重构**   | 🔴 进行中（最后一步） |
| 8    | 清理与验证       | 待开始    |

### 已完成的架构

```
src/
├── app/                    # ✅ 部分完成 (AppLayout, Header, Providers)
├── features/               # ✅ 已完成 (8个模块)
│   ├── robot-tree/         ├── property-editor/
│   ├── visualizer/         ├── urdf-viewer/
│   ├── code-editor/        ├── hardware-config/
│   ├── ai-assistant/       └── file-io/
├── core/                   # ✅ 已完成 (robot, parsers, loaders)
├── shared/                 # ✅ 已完成 (components, hooks, utils, i18n)
├── store/                  # ✅ 已完成 (robotStore, uiStore, selectionStore, assetsStore)
└── types/                  # ✅ 已完成
```

### 🎯 最后一步：迁移 App.tsx

**当前状态**: 根目录 `App.tsx` (2760行) 仍在项目根目录，需要迁移到 `src/app/`

---

## App.tsx 拆分任务

将 App.tsx 拆分为以下子任务，按顺序执行：

### 任务 1: 提取模态框组件

| 组件 | 当前位置 | 目标位置 | 行数 |
|------|---------|---------|------|
| Settings Modal | App.tsx:2564-2619 | `src/app/components/SettingsModal.tsx` | ~55 |
| About Modal | App.tsx:2620-2760 | `src/app/components/AboutModal.tsx` | ~140 |
| AI Modal | App.tsx:2147-2536 | `src/features/ai-assistant/components/AIModal.tsx` | ~390 |

### 任务 2: 提取 Hooks

| Hook | 职责 | 目标位置 |
|------|------|---------|
| `useAppState` | 主题、语言、UI 缩放 | `src/app/hooks/useAppState.ts` |
| `useFileImport` | 文件导入逻辑 | `src/app/hooks/useFileImport.ts` |
| `useFileExport` | 文件导出逻辑 | `src/app/hooks/useFileExport.ts` |
| `useSidebarState` | 侧边栏折叠状态 | `src/app/hooks/useSidebarState.ts` |

### 任务 3: 迁移状态到 Store

App.tsx 中仍使用 `useState` 的状态，应迁移到对应 Store：

| 状态 | 当前方式 | 目标 Store |
|------|---------|-----------|
| `theme`, `lang`, `uiScale` | useState | `useUIStore` (已有 appMode) |
| `assets`, `availableFiles` | useState | `useAssetsStore` |
| `originalUrdfContent`, `originalFileFormat` | useState | `useAssetsStore` |

**注意**: 当前使用"双写模式"同步状态，最终应完全迁移到 Store。

### 任务 4: 简化主 App 组件

**目标**: `src/app/App.tsx` 约 100-150 行

```typescript
// src/app/App.tsx (目标结构)
import { Providers } from './Providers'
import { AppLayout } from './AppLayout'

export default function App() {
  return (
    <Providers>
      <AppLayout />
    </Providers>
  )
}
```

### 任务 5: 更新入口文件

1. 更新 `index.tsx` 导入路径
2. 将根目录 `App.tsx` 改为重导出（过渡期）
3. 验证所有功能正常后删除旧文件

---

## 执行顺序建议

```
1. 提取 SettingsModal → 验证
2. 提取 AboutModal → 验证
3. 提取 AIModal 到 ai-assistant → 验证
4. 创建 useAppState hook → 验证
5. 创建 useFileImport/Export hooks → 验证
6. 迁移剩余状态到 Store → 验证
7. 简化 App.tsx → 验证
8. 更新入口文件 → 最终验证
```

每步完成后运行 `npm run dev` 验证。

---

## 关键文件位置

| 文件 | 说明 |
|------|------|
| `/App.tsx` | 🔴 待迁移的主文件 (2760行) |
| `src/app/AppLayout.tsx` | 已部分完成的布局组件 |
| `src/app/Providers.tsx` | Provider 组合 |
| `src/app/components/Header.tsx` | 已迁移的 Header |
| `src/store/` | Zustand stores (robotStore, uiStore, selectionStore, assetsStore) |

---

## 验证清单

每步完成后验证：

- [ ] `npm run dev` 正常启动
- [ ] `npm run build` 无错误
- [ ] 三种模式 (Skeleton/Detail/Hardware) 正常切换
- [ ] 导入/导出功能正常
- [ ] TreeEditor、PropertyEditor 编辑正常
- [ ] Undo/Redo 正常
- [ ] 主题切换正常
- [ ] 语言切换正常

---

## 常用命令

```bash
npm run dev      # 开发服务器
npm run build    # 生产构建
```

## 依赖规则

```
app/ → features/ → store/ → shared/ → core/ → types/
```

Features 之间**不可直接依赖**，通过 Store 通信。

## 详细文档

- [docs/MODULARIZATION_PLAN.md](docs/MODULARIZATION_PLAN.md) - 完整架构规划
- [docs/REFACTORING_STEPS.md](docs/REFACTORING_STEPS.md) - 详细重构步骤
