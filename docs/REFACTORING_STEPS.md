# URDF-Studio 渐进式重构计划

> 本文档详细说明如何在不影响现有功能的前提下，逐步将代码从当前结构迁移到模块化架构。

## 重构原则

1. **渐进式迁移**：每个步骤完成后，应用必须能正常运行
2. **并行存在**：新旧代码可以同时存在，逐步替换
3. **向后兼容**：迁移过程中保持原有导出，避免破坏依赖
4. **可回滚**：每步完成后提交 Git，出问题可快速回滚
5. **功能验证**：每个阶段完成后进行完整功能测试

---

## 阶段概览

| 阶段 | 名称 | 主要工作 | 风险等级 |
|------|------|----------|----------|
| 1 | 基础设施准备 | 目录结构、路径别名、依赖安装 | 低 |
| 2 | 类型与工具迁移 | types/、shared/utils/、shared/hooks/ | 低 |
| 3 | 核心业务逻辑迁移 | core/parsers/、core/loaders/、core/robot/ | 中 |
| 4 | 共享组件迁移 | shared/components/、shared/components/3d/ | 中 |
| 5 | Store 层建立 | Zustand Store 创建，状态逐步迁移 | 高 |
| 6 | Feature 模块迁移 | 逐个迁移 features/ 下各模块 | 高 |
| 7 | App 层重构 | 重构 App.tsx，整合所有模块 | 高 |
| 8 | 清理与验证 | 删除旧文件，最终测试 | 低 |

---

## 阶段 1：基础设施准备

**目标**：搭建新的目录结构和配置，为后续迁移做准备

**影响**：无功能影响，仅添加新文件和配置

### 1.1 创建目录结构

```bash
# 创建 src 目录及子目录
mkdir -p src/{app,features,core,shared,store,types,styles,config}

# Features 子目录
mkdir -p src/features/{robot-tree,property-editor,visualizer,urdf-viewer,code-editor,hardware-config,ai-assistant,file-io}

# Core 子目录
mkdir -p src/core/{robot,parsers,loaders}
mkdir -p src/core/parsers/{urdf,mjcf,usd,xacro}

# Shared 子目录
mkdir -p src/shared/{components,hooks,utils,i18n}
mkdir -p src/shared/components/{Button,Input,Select,Slider,Modal,Panel,Tabs,Tooltip,3d}
mkdir -p src/shared/components/3d/helpers
```

### 1.2 配置路径别名

**修改 vite.config.ts**：

```typescript
import path from 'path'

export default defineConfig({
  // ... 现有配置
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // 临时别名，指向旧文件位置，便于渐进迁移
      '@legacy': path.resolve(__dirname, '.'),
    },
  },
})
```

**修改 tsconfig.json**：

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"],
      "@legacy/*": ["./*"]
    }
  }
}
```

### 1.3 安装新依赖

```bash
npm install zustand immer
```

### 1.4 创建占位 index 文件

在每个新目录创建 `index.ts`，暂时为空或导出空对象：

```typescript
// src/types/index.ts
export {}

// src/store/index.ts
export {}

// src/shared/hooks/index.ts
export {}
```

### 验证点

- [ ] `npm run dev` 正常启动
- [ ] 所有现有功能正常工作
- [ ] 新目录结构已创建
- [ ] 路径别名配置生效（可在任意文件中测试 `import {} from '@/types'`）

### Git 提交

```bash
git add .
git commit -m "chore: 阶段1 - 基础设施准备，创建目录结构和路径别名"
```

---

## 阶段 2：类型与工具迁移

**目标**：将类型定义和工具函数迁移到新位置，建立共享基础

**影响**：无功能影响，新旧文件并存

### 2.1 迁移类型定义

**步骤**：

1. 创建新的类型文件，从 `types.ts` 复制相关类型：

```typescript
// src/types/robot.ts
// 从 types.ts 复制 RobotState, UrdfLink, UrdfJoint 等

// src/types/geometry.ts
// 从 types.ts 复制 GeometryConfig, Material 等

// src/types/ui.ts
// 定义 Selection, AppMode 等 UI 相关类型

// src/types/hardware.ts
// 从 types.ts 复制 MotorSpec 等

// src/types/index.ts
export * from './robot'
export * from './geometry'
export * from './ui'
export * from './hardware'
```

2. 在原 `types.ts` 添加重导出（保持向后兼容）：

```typescript
// types.ts (原文件)
// ... 保留所有原有内容 ...

// 同时从新位置重导出，便于逐步迁移
export * from '@/types'
```

### 2.2 迁移工具函数

**步骤**：

1. 迁移数学工具：

```typescript
// src/shared/utils/math.ts
// 从 services/mathUtils.ts 复制内容
```

2. 迁移节流函数：

```typescript
// src/shared/utils/throttle.ts
// 从 services/throttle.ts 复制内容
```

3. 创建统一导出：

```typescript
// src/shared/utils/index.ts
export * from './math'
export * from './throttle'
// 后续添加更多
```

4. 在原文件添加重导出：

```typescript
// services/mathUtils.ts
export * from '@/shared/utils/math'

// services/throttle.ts
export * from '@/shared/utils/throttle'
```

### 2.3 迁移通用 Hooks

**步骤**：

1. 迁移 useHistory：

```typescript
// src/shared/hooks/useHistory.ts
// 从 hooks/useHistory.ts 复制内容
```

2. 创建统一导出：

```typescript
// src/shared/hooks/index.ts
export * from './useHistory'
```

3. 在原文件添加重导出：

```typescript
// hooks/useHistory.ts
export * from '@/shared/hooks/useHistory'
```

### 验证点

- [ ] `npm run dev` 正常启动
- [ ] `npm run build` 无类型错误
- [ ] 所有现有功能正常工作
- [ ] 新类型可以从 `@/types` 导入
- [ ] 新工具函数可以从 `@/shared/utils` 导入

### Git 提交

```bash
git add .
git commit -m "chore: 阶段2 - 类型与工具迁移完成"
```

---

## 阶段 3：核心业务逻辑迁移

**目标**：将解析器、加载器等核心业务逻辑迁移到 core/ 目录

**影响**：无功能影响，采用重导出保持兼容

### 3.1 迁移 URDF 解析器

**步骤**：

1. 复制文件：

```bash
cp services/urdfParser.ts src/core/parsers/urdf/urdfParser.ts
cp services/urdfGenerator.ts src/core/parsers/urdf/urdfGenerator.ts
```

2. 更新导入路径（在新文件中）：

```typescript
// src/core/parsers/urdf/urdfParser.ts
import type { RobotState, UrdfLink, UrdfJoint } from '@/types'
// ... 其他更新
```

3. 创建模块导出：

```typescript
// src/core/parsers/urdf/index.ts
export { parseURDF } from './urdfParser'
export { generateURDF } from './urdfGenerator'
```

4. 在原文件添加重导出：

```typescript
// services/urdfParser.ts
export * from '@/core/parsers/urdf/urdfParser'

// services/urdfGenerator.ts
export * from '@/core/parsers/urdf/urdfGenerator'
```

### 3.2 迁移 MJCF 解析器

**步骤**：

1. 复制文件：

```bash
cp services/mjcfParser.ts src/core/parsers/mjcf/mjcfParser.ts
cp services/mjcfLoader.ts src/core/parsers/mjcf/mjcfLoader.ts
cp services/mujocoGenerator.ts src/core/parsers/mjcf/mjcfGenerator.ts
```

2. 更新导入并创建导出（同上）

3. 原文件添加重导出

### 3.3 迁移 USD 解析器

```bash
cp services/usdParser.ts src/core/parsers/usd/usdParser.ts
cp services/usdLoader.ts src/core/parsers/usd/usdLoader.ts
```

### 3.4 迁移 Xacro 解析器

```bash
cp services/xacroParser.ts src/core/parsers/xacro/xacroParser.ts
```

### 3.5 迁移 Mesh 加载器

**步骤**：

1. 从 `components/URDFViewer/loaders.ts` 提取：

```typescript
// src/core/loaders/stlLoader.ts
// 提取 STL 加载逻辑

// src/core/loaders/objLoader.ts
// 提取 OBJ 加载逻辑

// src/core/loaders/daeLoader.ts
// 提取 DAE 加载逻辑

// src/core/loaders/meshLoaderFactory.ts
// 创建统一的加载器工厂
```

2. 创建统一导出：

```typescript
// src/core/loaders/index.ts
export { loadSTL } from './stlLoader'
export { loadOBJ } from './objLoader'
export { loadDAE } from './daeLoader'
export { createMeshLoader } from './meshLoaderFactory'
```

3. 原 `loaders.ts` 改为重导出

### 3.6 创建 core/robot 模块

```typescript
// src/core/robot/types.ts
// 机器人数据结构相关类型（可从 types.ts 移入）

// src/core/robot/validators.ts
// 数据验证函数

// src/core/robot/transforms.ts
// 坐标变换计算

// src/core/robot/builders.ts
// 数据构建器（创建默认 Link/Joint 等）

// src/core/robot/constants.ts
// 默认值和枚举
```

### 验证点

- [ ] `npm run dev` 正常启动
- [ ] URDF 导入功能正常
- [ ] MJCF 导入功能正常
- [ ] USD 导入功能正常
- [ ] Xacro 导入功能正常
- [ ] Mesh 文件加载正常（STL/OBJ/DAE）
- [ ] URDF 导出功能正常

### Git 提交

```bash
git add .
git commit -m "chore: 阶段3 - 核心业务逻辑迁移完成"
```

---

## 阶段 4：共享组件迁移

**目标**：将共享 UI 组件和 3D 组件迁移到 shared/ 目录

**影响**：无功能影响，新旧组件并存

### 4.1 迁移共享 3D 组件

**这是关键步骤**，因为 `MeshRenderers.tsx` 和 `VisualizationHelpers.tsx` 被多个模块使用。

**步骤**：

1. 迁移 MeshRenderers：

```typescript
// src/shared/components/3d/MeshRenderers.tsx
// 从 components/shared/MeshRenderers.tsx 复制
// 更新导入使用 @/core/loaders
```

2. 迁移 VisualizationHelpers，拆分为独立组件：

```typescript
// src/shared/components/3d/helpers/CoordinateAxes.tsx
// src/shared/components/3d/helpers/JointAxis.tsx
// src/shared/components/3d/helpers/InertiaBox.tsx
// src/shared/components/3d/helpers/CenterOfMass.tsx

// src/shared/components/3d/helpers/index.ts
export { CoordinateAxes } from './CoordinateAxes'
export { JointAxis } from './JointAxis'
export { InertiaBox } from './InertiaBox'
export { CenterOfMass } from './CenterOfMass'
```

3. 迁移 SceneUtilities：

```typescript
// src/shared/components/3d/SceneUtilities.tsx
```

4. 创建统一导出：

```typescript
// src/shared/components/3d/index.ts
export * from './MeshRenderers'
export * from './SceneUtilities'
export * from './helpers'
```

5. 在原文件添加重导出：

```typescript
// components/shared/MeshRenderers.tsx
export * from '@/shared/components/3d/MeshRenderers'

// components/shared/VisualizationHelpers.tsx
export * from '@/shared/components/3d/helpers'
```

### 4.2 迁移 UI 组件

从 `components/ui/` 迁移到 `src/shared/components/`：

```typescript
// src/shared/components/Panel/OptionsPanel.tsx
// 从 components/ui/OptionsPanel.tsx 复制

// src/shared/components/index.ts
export * from './Panel'
// 后续添加更多
```

### 4.3 迁移 i18n

**步骤**：

1. 拆分 i18n.ts：

```typescript
// src/shared/i18n/locales/en.ts
export const en = { /* 英文翻译 */ }

// src/shared/i18n/locales/zh.ts
export const zh = { /* 中文翻译 */ }

// src/shared/i18n/useTranslation.ts
// 创建 Hook

// src/shared/i18n/I18nProvider.tsx
// 创建 Provider（如需要）

// src/shared/i18n/index.ts
export { useTranslation } from './useTranslation'
export { I18nProvider } from './I18nProvider'
```

2. 原 `services/i18n.ts` 改为重导出

### 验证点

- [ ] `npm run dev` 正常启动
- [ ] 3D 场景中坐标轴显示正常
- [ ] 惯性盒、质心显示正常
- [ ] Mesh 渲染正常
- [ ] 国际化切换正常
- [ ] OptionsPanel 显示正常

### Git 提交

```bash
git add .
git commit -m "chore: 阶段4 - 共享组件迁移完成"
```

---

## 阶段 5：Store 层建立

**目标**：使用 Zustand 建立状态管理，逐步从 App.tsx 迁移状态

**影响**：这是风险最高的阶段，需要特别小心

### 5.1 创建基础 Store 结构

**步骤**：

1. 创建 UI Store（先迁移简单状态）：

```typescript
// src/store/uiStore.ts
import { create } from 'zustand'

interface UIState {
  // 应用模式
  appMode: 'skeleton' | 'detail' | 'hardware'
  setAppMode: (mode: 'skeleton' | 'detail' | 'hardware') => void

  // 视图选项
  viewOptions: {
    showGrid: boolean
    showAxes: boolean
    showJointAxes: boolean
    showInertia: boolean
    showCenterOfMass: boolean
    showCollision: boolean
  }
  setViewOption: <K extends keyof UIState['viewOptions']>(
    key: K,
    value: UIState['viewOptions'][K]
  ) => void

  // 面板状态
  panels: {
    codeEditor: boolean
    aiAssistant: boolean
  }
  togglePanel: (panel: keyof UIState['panels']) => void
}

export const useUIStore = create<UIState>()((set) => ({
  appMode: 'skeleton',
  setAppMode: (mode) => set({ appMode: mode }),

  viewOptions: {
    showGrid: true,
    showAxes: true,
    showJointAxes: false,
    showInertia: false,
    showCenterOfMass: false,
    showCollision: false,
  },
  setViewOption: (key, value) =>
    set((state) => ({
      viewOptions: { ...state.viewOptions, [key]: value },
    })),

  panels: {
    codeEditor: false,
    aiAssistant: false,
  },
  togglePanel: (panel) =>
    set((state) => ({
      panels: { ...state.panels, [panel]: !state.panels[panel] },
    })),
}))
```

2. 创建 Assets Store：

```typescript
// src/store/assetsStore.ts
import { create } from 'zustand'

interface AssetsState {
  meshFiles: Map<string, ArrayBuffer>
  textureFiles: Map<string, ArrayBuffer>

  addMeshFile: (path: string, data: ArrayBuffer) => void
  getMeshFile: (path: string) => ArrayBuffer | undefined
  addTextureFile: (path: string, data: ArrayBuffer) => void
  getTextureFile: (path: string) => ArrayBuffer | undefined
  clearAssets: () => void
}

export const useAssetsStore = create<AssetsState>()((set, get) => ({
  meshFiles: new Map(),
  textureFiles: new Map(),

  addMeshFile: (path, data) =>
    set((state) => {
      const newMap = new Map(state.meshFiles)
      newMap.set(path, data)
      return { meshFiles: newMap }
    }),

  getMeshFile: (path) => get().meshFiles.get(path),

  addTextureFile: (path, data) =>
    set((state) => {
      const newMap = new Map(state.textureFiles)
      newMap.set(path, data)
      return { textureFiles: newMap }
    }),

  getTextureFile: (path) => get().textureFiles.get(path),

  clearAssets: () =>
    set({ meshFiles: new Map(), textureFiles: new Map() }),
}))
```

3. 创建统一导出：

```typescript
// src/store/index.ts
export { useUIStore } from './uiStore'
export { useAssetsStore } from './assetsStore'
```

### 5.2 在 App.tsx 中集成 UI Store

**关键策略**：双写模式，同时更新 Store 和原有 state

```typescript
// App.tsx 中添加
import { useUIStore } from '@/store'

function App() {
  // 原有 state 保留
  const [appMode, setAppModeLocal] = useState<'skeleton' | 'detail' | 'hardware'>('skeleton')

  // 获取 Store
  const { setAppMode: setAppModeStore } = useUIStore()

  // 包装 setter，同时更新两边
  const setAppMode = useCallback((mode: 'skeleton' | 'detail' | 'hardware') => {
    setAppModeLocal(mode)  // 更新本地 state
    setAppModeStore(mode)  // 同时更新 Store
  }, [setAppModeStore])

  // ... 其他代码不变
}
```

### 5.3 逐步迁移子组件使用 Store

**步骤**（以 OptionsPanel 为例）：

1. 修改组件使用 Store：

```typescript
// 修改前
function OptionsPanel({ viewOptions, onViewOptionChange }) {
  // ...
}

// 修改后
function OptionsPanel() {
  const { viewOptions, setViewOption } = useUIStore()
  // ...
}
```

2. 更新父组件，移除 props 传递

3. 验证功能正常后，从 App.tsx 移除对应的 state

### 5.4 创建 Robot Store（复杂，需谨慎）

```typescript
// src/store/robotStore.ts
import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'

interface RobotState {
  name: string
  links: Record<string, UrdfLink>
  joints: Record<string, UrdfJoint>
  rootLinkId: string | null
  materials: Record<string, Material>
}

interface RobotActions {
  setName: (name: string) => void
  setRobot: (data: RobotState) => void

  // Link 操作
  addLink: (link: UrdfLink) => void
  updateLink: (id: string, updates: Partial<UrdfLink>) => void
  deleteLink: (id: string) => void

  // Joint 操作
  addJoint: (joint: UrdfJoint) => void
  updateJoint: (id: string, updates: Partial<UrdfJoint>) => void
  deleteJoint: (id: string) => void

  // 重置
  resetRobot: () => void
}

const initialState: RobotState = {
  name: 'my_robot',
  links: {},
  joints: {},
  rootLinkId: null,
  materials: {},
}

export const useRobotStore = create<RobotState & RobotActions>()(
  immer((set) => ({
    ...initialState,

    setName: (name) => set({ name }),

    setRobot: (data) => set(data),

    addLink: (link) =>
      set((state) => {
        state.links[link.id] = link
      }),

    updateLink: (id, updates) =>
      set((state) => {
        if (state.links[id]) {
          Object.assign(state.links[id], updates)
        }
      }),

    deleteLink: (id) =>
      set((state) => {
        delete state.links[id]
      }),

    addJoint: (joint) =>
      set((state) => {
        state.joints[joint.id] = joint
      }),

    updateJoint: (id, updates) =>
      set((state) => {
        if (state.joints[id]) {
          Object.assign(state.joints[id], updates)
        }
      }),

    deleteJoint: (id) =>
      set((state) => {
        delete state.joints[id]
      }),

    resetRobot: () => set(initialState),
  }))
)
```

### 5.5 添加历史记录中间件

```typescript
// src/store/historyMiddleware.ts
// 实现 undo/redo 功能
// 参考 MODULARIZATION_PLAN.md 中的实现
```

### 验证点

- [ ] `npm run dev` 正常启动
- [ ] 模式切换（Skeleton/Detail/Hardware）正常
- [ ] 视图选项切换正常
- [ ] 机器人数据加载正常
- [ ] Link/Joint 编辑正常
- [ ] Undo/Redo 功能正常

### Git 提交

```bash
git add .
git commit -m "chore: 阶段5 - Store层建立完成"
```

---

## 阶段 6：Feature 模块迁移

**目标**：逐个将功能模块迁移到 features/ 目录

**策略**：按依赖关系从底层到顶层迁移，每迁移一个模块就验证

### 6.1 迁移 code-editor 模块（最简单）

**选择理由**：相对独立，依赖较少

**步骤**：

1. 复制组件：

```bash
mkdir -p src/features/code-editor/components
cp components/SourceCodeEditor.tsx src/features/code-editor/components/
cp components/SourceCodeViewer.tsx src/features/code-editor/components/
```

2. 更新导入路径

3. 创建模块导出：

```typescript
// src/features/code-editor/index.ts
export { SourceCodeEditor } from './components/SourceCodeEditor'
export { SourceCodeViewer } from './components/SourceCodeViewer'
```

4. 在 App.tsx 中更新导入：

```typescript
// 修改前
import SourceCodeEditor from './components/SourceCodeEditor'

// 修改后
import { SourceCodeEditor } from '@/features/code-editor'
```

5. 验证功能正常后，删除原文件

### 6.2 迁移 hardware-config 模块

**步骤**：

1. 迁移电机库数据：

```bash
mkdir -p src/features/hardware-config/data
cp services/motorLibrary.ts src/features/hardware-config/data/
```

2. 拆分电机数据（可选）：

```typescript
// src/features/hardware-config/data/unitreeMotors.ts
// src/features/hardware-config/data/robstrideMotors.ts
// src/features/hardware-config/data/motorLibrary.ts (聚合)
```

3. 创建模块导出

4. 更新依赖并验证

### 6.3 迁移 robot-tree 模块

**步骤**：

1. 复制 TreeEditor：

```bash
mkdir -p src/features/robot-tree/components
cp components/TreeEditor.tsx src/features/robot-tree/components/
```

2. 逐步拆分（可选，根据时间）：
   - TreeNode.tsx
   - TreeNodeActions.tsx
   - TreeToolbar.tsx

3. 创建 Hooks：

```typescript
// src/features/robot-tree/hooks/useTreeOperations.ts
// 从 TreeEditor.tsx 提取树操作逻辑
```

4. 更新导入并验证

### 6.4 迁移 property-editor 模块

**步骤**：

1. 复制 PropertyEditor：

```bash
mkdir -p src/features/property-editor/components
cp components/PropertyEditor.tsx src/features/property-editor/components/
```

2. 拆分子组件（建议逐步进行）：

```typescript
// src/features/property-editor/components/link/
//   LinkEditor.tsx
//   GeometrySection.tsx
//   InertialSection.tsx
//   ...

// src/features/property-editor/components/joint/
//   JointEditor.tsx
//   LimitsSection.tsx
//   ...
```

3. 更新导入并验证

### 6.5 迁移 visualizer 模块

**步骤**：

1. 复制 Visualizer：

```bash
mkdir -p src/features/visualizer/components
cp components/Visualizer.tsx src/features/visualizer/components/
```

2. 拆分场景组件：

```typescript
// src/features/visualizer/components/scene/
//   SceneCanvas.tsx
//   CameraController.tsx
//   LightingSetup.tsx
//   GroundGrid.tsx
```

3. 拆分机器人可视化：

```typescript
// src/features/visualizer/components/robot/
//   SkeletonRobot.tsx
//   LinkVisualization.tsx
//   JointVisualization.tsx
```

4. 更新导入并验证

### 6.6 迁移 urdf-viewer 模块

**这是最复杂的模块**，RobotModel.tsx 有约 2273 行

**步骤**：

1. 复制整个 URDFViewer 目录：

```bash
mkdir -p src/features/urdf-viewer/components
cp -r components/URDFViewer/* src/features/urdf-viewer/components/
```

2. 更新导入路径

3. 逐步拆分 RobotModel.tsx：

```typescript
// src/features/urdf-viewer/components/model/
//   RobotModel.tsx (主组件，约300行)
//   LinkRenderer.tsx
//   JointRenderer.tsx
//   GeometryFactory.tsx
//   MeshRenderer.tsx

// src/features/urdf-viewer/hooks/
//   useModelLoader.ts
//   useJointAnimation.ts
//   useCollisionEdit.ts
```

4. 每拆分一个子组件就验证

### 6.7 迁移 ai-assistant 模块

**步骤**：

1. 迁移服务：

```bash
mkdir -p src/features/ai-assistant/services
cp services/geminiService.ts src/features/ai-assistant/services/aiService.ts
cp services/inspectionCriteria.ts src/features/ai-assistant/data/
```

2. 创建组件（如果需要）

3. 更新导入并验证

### 6.8 迁移 file-io 模块

**步骤**：

1. 从 App.tsx 提取导入导出逻辑：

```typescript
// src/features/file-io/services/
//   importService.ts
//   exportService.ts
//   zipService.ts
```

2. 创建组件（如需要 UI）

3. 更新导入并验证

### 验证点（每个子阶段都需要）

- [ ] `npm run dev` 正常启动
- [ ] 该模块的所有功能正常工作
- [ ] 没有控制台错误
- [ ] 没有 TypeScript 错误

### Git 提交（每完成一个模块就提交）

```bash
git add .
git commit -m "chore: 阶段6.X - 迁移 XXX 模块完成"
```

---

## 阶段 7：App 层重构

**目标**：重构 App.tsx，使用新的模块化结构

**影响**：高风险，需要仔细测试

### 7.1 创建 AppProviders

```typescript
// src/app/AppProviders.tsx
import { I18nProvider } from '@/shared/i18n'

interface AppProvidersProps {
  children: React.ReactNode
}

export function AppProviders({ children }: AppProvidersProps) {
  return (
    <I18nProvider>
      {children}
    </I18nProvider>
  )
}
```

### 7.2 创建 AppLayout

```typescript
// src/app/AppLayout.tsx
import { useUIStore } from '@/store'
import { TreeEditor } from '@/features/robot-tree'
import { PropertyEditor } from '@/features/property-editor'
import { Visualizer } from '@/features/visualizer'
import { URDFViewer } from '@/features/urdf-viewer'
import { SourceCodeEditor } from '@/features/code-editor'

export function AppLayout() {
  const { appMode, panels } = useUIStore()

  return (
    <div className="app-container h-screen flex flex-col">
      <Header />
      <main className="flex-1 flex overflow-hidden">
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
      {panels.codeEditor && <SourceCodeEditor />}
    </div>
  )
}
```

### 7.3 重构 App.tsx

```typescript
// src/app/App.tsx
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

### 7.4 更新入口文件

```typescript
// src/index.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './app/App'
import './styles/globals.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

### 验证点

- [ ] `npm run dev` 正常启动
- [ ] 所有三种模式（Skeleton/Detail/Hardware）正常切换
- [ ] TreeEditor 功能正常
- [ ] PropertyEditor 功能正常
- [ ] 3D 渲染正常
- [ ] 导入/导出功能正常
- [ ] AI 功能正常
- [ ] Undo/Redo 功能正常
- [ ] 国际化正常

### Git 提交

```bash
git add .
git commit -m "chore: 阶段7 - App层重构完成"
```

---

## 阶段 8：清理与验证

**目标**：删除旧文件，进行最终测试

### 8.1 清理重导出文件

检查并删除所有只包含重导出的旧文件：

```bash
# 检查原 services/ 目录
# 检查原 components/ 目录
# 检查原 hooks/ 目录
```

### 8.2 删除旧文件

```bash
# 删除已迁移的旧文件
rm services/mathUtils.ts
rm services/throttle.ts
rm services/urdfParser.ts
rm services/urdfGenerator.ts
# ... 等等

# 删除旧目录
rm -rf components/URDFViewer  # 已迁移到 features/urdf-viewer
rm -rf components/shared      # 已迁移到 shared/components/3d
rm -rf components/ui          # 已迁移到 shared/components
```

### 8.3 更新文档

```bash
# 更新 PROJECT_GUIDE.md 反映新结构
# 标记 MODULARIZATION_PLAN.md 为已完成
```

### 8.4 全面功能测试

**测试清单**：

- [ ] **导入功能**
  - [ ] URDF 文件导入
  - [ ] MJCF 文件导入
  - [ ] USD 文件导入
  - [ ] Xacro 文件导入
  - [ ] ZIP 包导入

- [ ] **导出功能**
  - [ ] URDF 导出
  - [ ] MuJoCo 导出
  - [ ] ZIP 包导出

- [ ] **Skeleton 模式**
  - [ ] 3D 渲染正常
  - [ ] Link/Joint 选择
  - [ ] 变换工具
  - [ ] 截图功能

- [ ] **Detail 模式**
  - [ ] URDF 模型渲染
  - [ ] Mesh 加载（STL/OBJ/DAE）
  - [ ] 材质显示
  - [ ] 关节控制
  - [ ] 碰撞体编辑

- [ ] **Hardware 模式**
  - [ ] 电机库显示
  - [ ] 电机配置

- [ ] **编辑功能**
  - [ ] TreeEditor 操作
  - [ ] PropertyEditor 编辑
  - [ ] Undo/Redo

- [ ] **AI 功能**
  - [ ] AI 生成
  - [ ] AI 检查

- [ ] **其他**
  - [ ] 国际化切换
  - [ ] 快捷键
  - [ ] 响应式布局

### 8.5 性能检查

```bash
npm run build
# 检查构建产物大小
# 检查是否有未使用的依赖
```

### 验证点

- [ ] 所有旧文件已删除
- [ ] 无 TypeScript 错误
- [ ] 无控制台警告
- [ ] 构建成功
- [ ] 所有功能测试通过

### Git 提交

```bash
git add .
git commit -m "chore: 阶段8 - 清理完成，模块化重构完成"
```

---

## 回滚策略

如果某个阶段出现严重问题：

1. **Git 回滚**：
   ```bash
   git reset --hard HEAD~1  # 回滚到上一个提交
   ```

2. **分支策略**：
   ```bash
   # 在重构开始前创建分支
   git checkout -b refactor/modularization

   # 出问题时切回主分支
   git checkout main
   ```

3. **渐进回退**：由于使用了重导出策略，可以逐个模块回退，而不是全部回退

---

## 时间估算参考

| 阶段 | 预估工作量 |
|------|-----------|
| 阶段 1 | 简单 |
| 阶段 2 | 简单 |
| 阶段 3 | 中等 |
| 阶段 4 | 中等 |
| 阶段 5 | 复杂 |
| 阶段 6 | 复杂 |
| 阶段 7 | 中等 |
| 阶段 8 | 简单 |

---

## 附录：检查清单模板

每完成一个阶段，复制此清单进行验证：

```markdown
### 阶段 X 完成检查

- [ ] `npm run dev` 正常启动
- [ ] `npm run build` 无错误
- [ ] 控制台无错误/警告
- [ ] 所有相关功能测试通过
- [ ] Git 已提交
- [ ] 文档已更新（如需要）
```

---

*文档版本: 1.0*
*创建日期: 2025-01*
