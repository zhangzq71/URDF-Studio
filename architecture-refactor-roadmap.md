# URDF Studio 架构收口与模块化重构路线图

## 背景

当前项目的整体目录结构是健康的，已经具备比较明确的分层：

- `app`
- `features`
- `store`
- `shared`
- `core`
- `types`

从架构意图上看，这套设计是成立的；但随着功能继续增长，已经出现几个典型信号：

- `app` 层逐渐承担过多编排职责
- `shared` 开始混入部分业务感知逻辑
- 少量 `core -> shared`、`shared -> store`、`feature -> feature` 的边界穿透
- 多个超大文件已经接近或超过单一职责的合理上限

因此，这次工作的目标不是“重写架构”，而是做一轮 **架构收口**：先收紧模块边界，再拆高风险热点文件，提升后续迭代效率。

## 总目标

在不打断当前业务开发的前提下，逐步把项目从“目录层面的模块化”推进到“API 边界明确、职责稳定、可持续扩展的模块化”。

## 范围

### In

- feature 对外 API 收口
- app 层编排拆分
- shared / core 依赖清理
- feature 间耦合收敛
- 超大文件拆分
- 架构例外项梳理与验证

### Out

- 视觉风格重构
- 业务流程重写
- Three.js 渲染方案整体替换
- Zustand 状态方案替换
- 大规模命名体系重构

## 当前判断

### 优点

- 顶层目录分层清楚，维护成本优于多数同类 React 项目
- `store` 分层相对清晰，UI / selection / robot / assets / assembly 责任边界较明确
- 多数核心 feature 已具备 `components / hooks / utils` 结构
- `Visualizer` 模块的拆分方式较好，主组件相对轻，逻辑已下沉到 hooks

### 主要问题

- `app` 层过重，承担了太多 feature 编排与流程控制
- 一些模块被 deep import 直接访问内部实现，feature 边界不够稳定
- `shared` 中存在带业务耦合的组件与 hook，削弱了中立层定位
- `core` 存在少量反向依赖 `shared` 的情况，不符合架构红线
- 存在少量 feature 互引，长期可能扩散
- 多个核心文件已经明显偏大，后续修改风险逐步升高

## 重构原则

1. **先收边界，再拆文件**
   - 先控制依赖方向，再做文件级重构，避免越拆越乱。

2. **优先低风险高收益**
   - 优先处理 deep import、反向依赖、source of truth 不清晰的问题。

3. **主组件只做编排**
   - 状态协调、流程逻辑、纯渲染、纯工具逻辑尽量拆开。

4. **feature 以公开 API 暴露能力**
   - `app` 与其它模块优先通过 `index.ts` 或稳定 facade 使用 feature。

5. **shared 保持中立**
   - `shared` 尽量只保留通用 UI、通用 hooks、通用 3D 基建、无业务语义工具。

6. **core 保持纯逻辑**
   - 不向上依赖 UI、feature、shared 业务层能力。

## 优先级总览

### P0：立即开始，低风险高收益

目标：先把边界收紧，让后续拆分有稳定基础。

### P1：中期治理，清理关键架构破口

目标：消除最危险的反向依赖和 feature 间耦合。

### P2：热点瘦身，提升长期维护性

目标：拆分超大文件，巩固模块职责。

---

## P0 路线：先收口

### P0-1 收紧 feature 出口

#### 目标

让 `app` 和其它调用方优先通过 feature 的公开 API 使用能力，而不是直接 deep import 内部实现。

#### 重点动作

- 为 `visualizer`、`urdf-viewer`、`file-io` 完善稳定导出入口
- 在 `index.ts` 中聚合对外公开组件、hooks、types
- 逐步替换 `app` 中对 feature 内部 `components / hooks / utils` 的直接引用

#### 重点收益

- 降低外部对 feature 内部结构的耦合
- 后续 feature 内部重构成本更低

#### 完成标准

- `src/app` 不再直接依赖大部分 feature 内部子路径
- feature 对外入口职责清晰

---

### P0-2 降低 `app` 总控复杂度

#### 目标

让 `app` 层更多只做布局与装配，而不是承载复杂业务编排。

#### 重点动作

- 将 `AppLayout` 中的逻辑拆为 app-level hooks 或 adapter
- 按职责拆分：
  - viewer 编排
  - workspace / assembly 操作
  - editor / modal / panel 状态编排
- 保留 `AppLayout` 作为布局壳层

#### 推荐拆分方向

- `useWorkspaceAssemblyActions`
- `useViewerOrchestration`
- `useEditorPanelsState`

#### 完成标准

- `AppLayout` 聚焦布局装配
- 复杂逻辑从组件体移出

---

### P0-3 拆分 `App` 容器职责

#### 目标

让根组件不再混合文件导入导出、AI、modal 状态、机器人加载流程等多种职责。

#### 重点动作

- 将 modal 状态下沉为独立 hook
- 将机器人加载 / 文件解析流程抽成独立 hook
- 将 toast、导入导出流程等辅助控制逻辑抽离

#### 完成标准

- `App.tsx` 以根级装配和 provider 接线为主
- 复杂副作用与流程逻辑从根组件移出

---

## P1 路线：修关键破口

### P1-1 清理 `shared` 的业务耦合

#### 目标

让 `shared` 恢复为通用层，而不是“半业务层”。

#### 重点动作

- 审查 `shared` 中直接依赖 `store` 的 hook / component
- 把明显属于特定业务域的面板或交互组件迁回对应 feature
- 保留真正通用的 UI primitives、3D helpers、基础 hooks

#### 判断标准

如果某个 shared 组件：

- 强依赖某个 store
- 强依赖某个业务实体结构
- 只能被单个 feature 使用

则优先迁回 feature，而不是继续留在 `shared`

#### 完成标准

- `shared -> store` 依赖下降到最少
- `shared` 中的组件更可复用、更中立

---

### P1-2 修复 `core -> shared` 反向依赖

#### 目标

把最危险的架构红线破口先补上。

#### 重点动作

- 审查 MJCF parser 相关文件对 `shared` 的依赖
- 将通用材质逻辑按需要：
  - 下沉回 `core` 私有 helper
  - 或抽成不依赖上层语义的更底层工具
- 避免 parser 直接依赖 `shared` 业务侧实现

#### 原则

- parser / loader 只依赖解析和渲染所需最小能力
- 不引入 UI 语义、业务语义命名

#### 完成标准

- `rg "from '@/shared/" src/core` 命中显著下降
- `core` 重新回到纯逻辑定位

---

### P1-3 收口 feature 互引

#### 目标

把少量存量互相引用控制住，避免继续扩散。

#### 重点动作

- 处理 `property-editor` 对 `urdf-viewer` 的工具依赖
- 处理 `ai-assistant` 与 `file-io` 的互相引用
- 评估这些能力应当：
  - 抽到 `shared`
  - 下沉到 `core`
  - 或改成单向依赖

#### 决策原则

- 与业务域强相关：留在 feature
- 通用工具：迁到 `shared`
- 纯算法/纯数据处理：迁到 `core`

#### 完成标准

- feature 互引减少
- 例外项可明确解释、可维护

---

## P2 路线：拆热点文件

### P2-1 优先拆超大高风险文件

#### 第一批建议

- `src/features/property-editor/utils/geometryConversion.ts`
- `src/features/robot-tree/components/TreeNode.tsx`
- `src/features/urdf-viewer/hooks/useRobotLoader.ts`

#### 拆分思路

##### `geometryConversion.ts`

按能力拆分为：

- geometry normalization
- collision conversion
- mesh patching
- disposal / cleanup adapter

##### `TreeNode.tsx`

按渲染职责拆分为：

- link node view
- joint node view
- tree row actions
- inline edit / toggle controls

##### `useRobotLoader.ts`

按加载流程拆分为：

- loader setup
- material enhancement
- URDF patching
- MJCF compatibility
- scene cleanup lifecycle

#### 完成标准

- 每个文件职责更单一
- 新文件按 `components / hooks / utils` 归位
- 原文件只保留 orchestrator 角色

---

### P2-2 继续瘦身主组件

#### 第二批建议

- `src/features/robot-tree/components/TreeEditor.tsx`
- `src/features/urdf-viewer/components/URDFViewer.tsx`
- `src/shared/components/3d/SceneUtilities.tsx`

#### 拆分方向

##### `TreeEditor.tsx`

- tree 容器编排
- workspace file browser
- assembly 区域
- context menu / dialog 状态

##### `URDFViewer.tsx`

- viewer shell
- toolbar / options panel / measure panel
- interaction state
- camera / tool mode coordination

##### `SceneUtilities.tsx`

- environment / lighting
- hover invalidation
- resize / render sync
- scene helpers

#### 完成标准

- 主组件不再同时承担“状态 + UI + 流程 + 工具”
- 更容易测试和局部修改

---

### P2-3 去掉重复数据源

#### 目标

统一 `motorLibrary` 的 source of truth。

#### 重点动作

- 保留一个真实定义文件
- 其它位置仅保留 re-export
- 更新所有引用路径，避免后续维护混乱

#### 完成标准

- 全项目只有一个真实 `DEFAULT_MOTOR_LIBRARY` 定义
- 所有调用者都能明确知道数据源归属

---

### P2-4 最后做验证清扫

#### 目标

确认重构没有让架构更“看起来更整齐，实际上更脆”。

#### 必做验证

- 检查潜在反向依赖
- 检查 feature 间直接耦合
- 检查 `shared -> store` 是否继续扩大
- 检查构建是否通过

#### 推荐命令

```bash
rg -n "from ['\"]@/features/" src/core src/shared src/store
rg -n "from ['\"]@/features/" src/features
rg -n "from ['\"]@/store/" src/shared
npm run build
```

#### 交付物

- 一份最新的“架构例外清单”
- 一份已收敛的模块边界说明

---

## 推荐执行顺序

### 第一批：先做

1. P0-1 收紧 feature 出口
2. P0-2 降低 `app` 总控复杂度
3. P1-2 修复 `core -> shared`

### 第二批：随后做

4. P1-1 清理 `shared` 业务耦合
5. P1-3 收口 feature 互引
6. P2-3 去掉重复数据源

### 第三批：最后做

7. P2-1 拆第一批超大文件
8. P2-2 拆第二批主组件
9. P2-4 统一验证与归档

## 为什么这样排

- `app` 与 feature 出口问题最影响后续开发效率
- `core -> shared` 虽然数量不多，但性质最差，必须尽早修
- 超大文件拆分收益高，但改动面更广，放在边界收紧之后更稳

## 建议的两周实施节奏

### Week 1

- 完成 P0-1
- 完成 P0-2
- 完成 P1-2

### Week 2

- 完成 P1-1
- 完成 P1-3
- 完成 P2-3
- 启动 P2-1 第一刀拆分

## Done When

- `app` 主要只做装配，不再深挖 feature 内部实现
- `shared` 基本保持中立，不再持续吸收业务逻辑
- `core` 不再反向依赖 `shared`
- feature 互引显著减少，并可被清晰解释
- 重点超大文件得到实质性拆分
- `npm run build` 通过
- 架构例外项被明确记录且不再继续扩散

