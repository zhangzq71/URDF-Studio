# URDF-Studio Agent Guide

本文件是仓库内 AI Coding Agent 的统一执行规范，基于仓库当前结构（核对日期：2026-04-06）整理。

## 1. 目标与范围

- 项目：URDF Studio（机器人设计、装配、可视化与导出工作台）
- 技术栈：React 19.2 + TypeScript 5.8 + Three.js/R3F + Vite 6.2 + Tailwind CSS 4.1 + Zustand 5
- 核心能力：
  - 单模式 `Editor` 编辑（统一承载拓扑、几何、碰撞、测量与硬件配置）
  - 多 URDF 组装、桥接关节与工作区文件管理
  - `URDF` / `MJCF` / `SDF` / `USD` / `Xacro` / `ZIP` / `.usp` 导入导出
  - AI 生成、AI 审阅、PDF/CSV 报告
  - 可复用 `react-robot-canvas` 画布封装与对外发布

适用任务：

- 代码实现与重构
- UI/交互改造
- 3D/R3F/Three.js/URDF/USD 相关功能扩展
- Workspace / import-export / hydration / roundtrip 流程开发
- AI 审阅、提示词上下文与报告导出相关开发

## 2. Prompt 文档来源（Source of Truth）

建议按“单主文档 + 按需补充”读取：

- 主 Source of Truth（默认先读）：
  - `docs/prompts/CLAUDE.md`：项目架构、目录职责、依赖规则、Viewer/样式约束
- 轻量补充入口（仅在任务相关时读取）：
  - `docs/prompts/urdf-viewer.md`
  - `docs/prompts/URDF_STUDIO_STYLE_GUIDE.md`
  - `docs/prompts/overview.md`
- 非 prompts 补充文档（边界/发布/runtime 审计任务时读取）：
  - `docs/architecture-boundaries.md`
  - `docs/robot-canvas-lib.md`
  - `docs/runtime-fallback-audit.md`
- 若文档描述与当前 `src/` 真实结构冲突，以仓库现状为准，并优先回补 `CLAUDE.md`

AI 审阅标准输入（以仓库真实路径为准）：

- `src/features/ai-assistant/config/urdf_inspect_standard_en.md`
- `src/features/ai-assistant/config/urdf_inspect_stantard_zh.md`

说明：

- 中文文件名当前仍是 `stantard`（仓库现状），不要擅自改名，除非任务明确要求修复命名。

## 2.5 本机 ROS 2 环境（2026-03-27 已核实）

- 本机已安装 ROS 2 Humble，`ros2` 实际路径为 `/opt/ros/humble/bin/ros2`。
- 当前非交互 shell 默认可能未注入 ROS 环境，直接执行 `ros2` 可能出现 `command not found`。
- 运行 ROS 2 / RViz / URDF 检查相关命令前，优先先执行：

```bash
source /opt/ros/humble/setup.bash
```

- 用户的 `/home/xyk/.bashrc` 当前已包含：

```bash
source /opt/ros/humble/setup.bash
```

- 若 agent 需要核对 ROS 侧真值（如 `ros2`、`rviz2`、URDF 可视化或相关 CLI），不要先假设系统未安装 ROS，应先 source 上述环境后再检查。

## 2.6 Skill-first 替代策略（降低 MCP / prompt token 开销）

默认原则：

- 若需求本质上是“工作流指导、最佳实践、排障框架、测试套路、设计约束”，优先使用 skill，而不是在 prompt 里显式堆一串 MCP/tool 名称。
- skill 负责压缩“怎么做”的上下文；只有在确实需要执行外部能力时，才继续调用对应 MCP/tool。
- 不要把 skill 当成 capability replacement。skill 能替代的是提示词和决策开销，不是浏览器点击、远程 API、Figma 读取、`.pen` 编辑这类真实执行能力本身。

本仓库优先替代映射：

- 浏览器验证 / 页面联调 / 截图：
  - 优先 `webapp-testing`、`playwright`、`browser-automation`
  - 营销或文档截图优先 `screenshots`
  - 仅当需要真实浏览器交互、DOM 快照、网络面板或 DevTools 级检查时，再使用 Playwright / Chrome DevTools MCP
- 3D / R3F / Three.js / WebGL：
  - 优先 `threejs-skills`
  - 不要在 prompt 中重复展开 Three.js 基础套路
- URDF Studio UI 改造：
  - 优先 `urdf-studio-style`
  - 通用前端视觉与交互再补 `frontend-design` 或 `ui-ux-pro-max`
- 调试 / 问题定位：
  - 优先 `systematic-debugging`、`debugger`
  - 不要一开始就堆浏览器 MCP、trace MCP、console MCP；先按调试 workflow 收敛问题
- 测试 / QA：
  - 优先 `testing-qa`
  - 细分场景再补 `javascript-testing-patterns`、`e2e-testing-patterns`、`webapp-testing`
- 库文档 / 最新框架资料：
  - 优先 `context7-auto-research`
  - OpenAI 相关优先 `openai-docs`
  - 仅当 skill 无法覆盖时，再直接使用 Context7 / Web 搜索类工具
- 代码审阅 / 风险扫描：
  - 优先 `requesting-code-review`、`find-bugs`、`code-reviewer`
- 泛搜索 / 调研：
  - 优先 `search-specialist`
  - 深度外部调研再补 `exa-search` 或 `deep-research`

使用约束：

- 同一任务优先选择 1 个主 skill；只有主 skill 明显不足时，再补 1 到 2 个辅助 skill。
- 不要为了“保险”同时声明多个重叠 skill，例如浏览器任务同时堆 `playwright`、`playwright-skill`、`browser-automation`、`webapp-testing`。
- 若任务已经能被 repo 内现成脚本、测试、build 命令完成，优先本地命令；不要为了形式统一改走 MCP。
- 若任务要求真实外部状态读取或修改，例如浏览器点击、Figma 节点读取、在线搜索、设计文件写入、MCP 服务侧资源查询，则 skill 不能单独替代该能力。

## 3. 当前结构快照（2026-04-06）

顶层目录（核心）：

- `src/`：业务源码
- `docs/`：Agent 上下文、架构边界、runtime 审计与对外库说明
- `packages/react-robot-canvas/`：对外发布包工作区
- `public/`：静态资源（字体、logo、Monaco、USD bindings 等）
- `scripts/`：辅助脚本；高频子树包括 `regression/`、`versioning/`、`mujoco/`、`codex_key_router/`
- `log/`：本地运行日志与排障输出
- `.tmp/`：脚本/构建使用的临时 scratch 目录
- `output/`：导出结果与用户可见验证产物
- `tmp/`：浏览器截图、trace、临时调试与中间产物
- `test/`：外部工程镜像、浏览器回归样本与大型 fixtures
- `dist/`：构建产物
- `.worktrees/`：本地 git worktree 隔离工作区

`src/` 一级模块：

- `app/`：应用编排层；负责 App shell、viewer 组合、导入导出流程、workspace/source sync、USD hydration/roundtrip、document loading 与 worker handoff 协调；当前重点子树为 `components/unified-viewer/*`、`components/header/*`、`components/settings/*`、`hooks/file-export/*`
- `features/`：业务功能层
  - `ai-assistant/`
  - `assembly/`
  - `code-editor/`
  - `editor/`
  - `file-io/`
  - `hardware-config/`
  - `property-editor/`
  - `robot-tree/`
  - `urdf-viewer/`
- `store/`：Zustand 状态层
- `shared/`：共享组件、3D 基础设施、hooks、i18n、数据、调试桥接、workers、通用工具
- `core/`：纯逻辑、解析器、robot core、mesh loaders、parse workers、runtime diagnostics
- `lib/`：面向外部复用的 `RobotCanvas` 封装、类型与样式入口
- `styles/`：全局样式与语义 token
- `types/`：跨模块类型定义

补充说明：

- `src/app/components/unified-viewer/*` 是统一 viewer 的当前热区，承载 mode module loading、scene root、overlay、raycast interactivity 与 joints panel 适配。
- `src/app/hooks/file-export/*` 是应用级导出 workflow 的辅助子树；`useFileExport.ts` 作为入口编排这些 helper。
- `src/app/components/header/*`、`src/app/components/settings/*` 已独立成子树，Header/Settings 不再全部堆在单文件里。
- `src/features/urdf-viewer/runtime/*` 现已细分为 `embed/`、`hydra/`、`viewer/`、`types/`、`vendor/`，不要只把它理解成单一 runtime 目录。
- `shared/data/` 已存在，承载 inspection criteria、motor library 等共享静态数据。
- `shared/data/*` 是共享静态数据 canonical source；`features/hardware-config/data/motorLibrary.ts` 等同名文件当前仅作 re-export / 兼容层使用。
- `shared/debug/` 已存在，承载 regression/debug bridge，不要把调试桥接逻辑散落到业务组件里。
- `shared/workers/closedLoopMotionPreview.worker.ts` 当前承载共享闭环运动预览 worker；需要跨 viewer 复用的 worker 优先收口到 `shared/workers/`。
- `core/loaders/workers/*` 当前承载 `collada` / `obj` / `stl` 解析 worker；mesh 解析不要重新在 feature 层复制一套 worker 管线。
- `app/components/` 现已细分出 `header/*`、`settings/*`、`unified-viewer/*` 等子树；新增 App 级 UI 逻辑优先先落到对应子目录。
- `app/hooks/file-export/*` 当前承载导出进度、assembly history、project export、USD export 辅助逻辑；不要再把这些 helper 回塞进 `useFileExport.ts` 单文件。
- `features/robot-tree/components/` 当前已拆出 `tree-editor/*` 与 `tree-node/*` 子树；树结构相关 UI 优先按这两个方向继续拆分。
- `features/property-editor/utils/geometry-conversion/*` 已作为几何转换细分子树存在；几何转换逻辑不要再全部堆回单一 util 文件。
- `shared/components/3d/workspace/*` 已作为共享画布宿主子树存在；应用层 `WorkspaceCanvas` 主要负责组合，而底层 WebGL 清理与错误边界更多在共享层维护。
- `src/lib/` 当前已细分 `components/` 与 `hooks/`，对外封装不再只有单一入口文件。
- 单元测试当前主要采用源码邻近放置（`src/**/*.test.*`）；`test/` 不再是唯一测试入口。
- `test/` 当前重点样本集包括 `test/unitree_model`、`test/gazebo_models`、`test/awesome_robot_descriptions_repos`、`test/usd-viewer`。
- 当前已存在多个 worker 子树：`src/app/workers`、`src/features/code-editor/workers`、`src/features/file-io/workers`、`src/features/property-editor/workers`、`src/features/urdf-viewer/workers`、`src/core/loaders/workers`、`src/shared/workers`。

## 4. 架构红线（必须遵守）

应用运行时代码必须保持“只向下依赖”的单向结构：

`app -> features -> store -> shared -> core -> types`

按层约束理解为：

- `app` 可以编排 `features/store/shared/core/types`，但不能把业务细节反向塞回下层。
- `features` 可以依赖 `store/shared/core/types`，禁止依赖 `app`。
- `store` 与 `shared` 不应新增对 `features` 的运行时依赖。
- `core` 保持纯函数，不引入 React/UI/Feature 依赖。
- `types` 只提供类型与常量，不回指上层。
- 使用 `@/` 路径别名指向 `src/`。

`src/lib/` 与 `packages/react-robot-canvas/` 约束：

- `src/lib/` 视为对外复用封装层，只收稳定、通用、与应用壳无关的能力。
- 应用内部不要把 `src/lib/` 当业务逻辑 source of truth。
- 若能力仍强依赖 `robotStore`、workspace、app overlays 或特定业务流程，不要急于抽进 `src/lib/`。

当前存量例外（运行时代码，仅记录，禁止扩散）：

- `src/shared/components/Panel/JointControlItem.tsx` 依赖 `@/store/robotStore`
- `src/shared/hooks/useEffectiveTheme.ts` 依赖 `@/store/uiStore`
- `src/features/ai-assistant/utils/pdfExport.ts` 依赖 `@/features/file-io/components/InspectionReportTemplate`

当前测试期例外（仅测试，不作为运行时先例）：

- `src/features/file-io/utils/usdFloatingRoundtrip.test.ts` 依赖 `urdf-viewer` 的 runtime/utils 做 roundtrip 验证
- `src/features/file-io/utils/usdGo2Roundtrip.test.ts` 依赖 `urdf-viewer` 的 runtime/utils 做 roundtrip 验证

## 4.5 调试优先：默认少兜底

本仓库默认采用“debuggability first”原则：兜底不是默认美德，很多 silent fallback 会掩盖真实问题、污染状态并拉高排障成本。

必须遵循：

- 默认优先暴露真实错误，不要为了“看起来还能跑”就吞错、改写异常或偷偷切到备用路径。
- 禁止新增 `catch -> 返回空值/默认值/旧缓存/伪成功状态` 这一类 silent fallback，除非任务明确要求保活且能证明收益大于调试损失。
- 禁止在导入、导出、hydration、roundtrip、解析、viewer 初始化这类 source-of-truth 链路里做不透明兜底；这些链路一旦异常，优先报出原始错误和上下文。
- 导入准备、robot import、USD stage preparation、hydration、prepared export、archive/roundtrip 这类 worker bridge / off-main-thread 链路，默认必须 **fail fast**；不要因为 worker 不可用、worker 初始化失败或 postMessage 失败，就在同一调用路径里悄悄改走主线程实现。
- 禁止用“自动重试 + 自动降级 + 自动切换备用实现”掩盖根因，尤其是格式解析、资源加载、3D runtime 初始化与 store 同步流程。
- 若确实必须保留窄兜底，必须同时满足：
  - 保留原始错误信息、栈与触发条件，不能吞掉；
  - 能被用户或开发者明确观察到，例如 console/error state/debug panel 中可见；
  - 不得悄悄改写 source of truth，不得制造“表面成功、数据已偏”的假象；
  - 需要在注释或实现附近说明为何必须兜底，以及主路径失败时实际降级到什么。

实现倾向：

- 优先选择 fail fast、显式 error state、显式禁用某按钮/面板，也不要返回一个看似正常但不可 debug 的假结果。
- 如果要保活 UI，优先把失败隔离在边界处，并把错误显式透传到调用方或调试通道，而不是在底层 util 里悄悄吃掉。
- 调试期发现历史遗留 silent fallback 时，可以顺手收紧，但前提是不破坏本次任务边界。

错误处理补充约束：

- 不要静默吞掉错误（空 catch）。
- 错误信息应包含足够上下文，至少覆盖触发阶段、关键输入和模块来源，便于快速定位。
- 可恢复错误（如网络超时）优先采用有限重试；默认不做自动降级。确需降级时，必须满足上文“窄兜底”全部条件并明确说明原因。
- 不可恢复错误应尽早失败并上抛，由上层边界统一处理与展示。

内存 / 生命周期补充约束：

- 每次新增或修改 `ResizeObserver`、全局事件监听、RAF、`setTimeout` / `setInterval`、worker listener、`ImageBitmap`、object URL、THREE 材质/几何体/纹理、OffscreenCanvas/runtime owner 时，必须同时检查并实现对称 cleanup。
- shared worker / singleton runtime 若为了复用而常驻，必须明确其所有者和释放边界；不能以“下次可能复用”为理由保留已经失效的 scene graph、driver、observer、message listener 或 pending request。
- 新增 shared worker / singleton runtime 时，代码评审里必须能直接指出对应的 `dispose*` / `reset*` / owner teardown 调用点；如果说不清谁负责释放，就不要引入该常驻对象。
- 临时调试缓存、prepared snapshot、context map 必须有上限、淘汰策略或显式 dispose/reset 路径；不要默认无限增长。
- 做 memory / fallback 审计时，优先检查：worker bridge 的 `pendingRequests` / `workerUnavailable` 分支、`addEventListener/removeEventListener` 是否成对、`ResizeObserver.disconnect()`、`URL.revokeObjectURL()`、`ImageBitmap.close()`、以及 THREE 资源释放是否覆盖材质/几何体/纹理/renderer。

## 4.6 设计哲学补充：符合 Linux 哲学与 Linus taste

适用范围：

- 所有新增代码、重构、API 设计、状态流调整、worker bridge、viewer/runtime 适配层

优先级：

- 这是一级工程约束，不是“风格建议”。当“模式统一”“抽象好看”“先包一层再说”和 Linux 哲学 / Linus taste 冲突时，默认前者让路。

默认工程取向：

- 优先简单直接的数据流与控制流，不为“理论优雅”引入额外抽象层。
- 优先解决真实问题，不为未来也许会出现的场景预埋复杂框架。
- 优先把复杂度消灭在设计里，而不是把复杂度包进 helper、manager、factory、coordinator 名字里。
- 若一个设计需要靠大量注释解释“为什么这样绕”，通常说明设计本身就不够好。

必须遵循：

- 小而清晰的接口优先。函数、hook、store action、worker message shape 都应尽量只表达一件事。
- 优先组合现有稳定模块，不轻易新增“万能层”“统一抽象层”“Base\*”或过度泛化的中间封装。
- 数据结构优先于分支堆砌。能通过更好的数据建模消掉 `if/else` 和特殊情况，就不要继续堆条件。
- 能删除就先删除；能合并特殊情况就先合并；能把例外变成正常数据形态，就不要再保留分支补丁。
- 命名必须直白，优先用真实语义描述所有权、生命周期和失败路径，避免 `misc`、`manager`、`helper`、`temp` 这类弱语义命名。
- 禁止把坏状态悄悄修平。出现异常状态时，应优先暴露不变量被破坏的位置，而不是在下游补丁式兼容。
- 新逻辑默认先问“能不能删掉特殊情况”，再问“要不要新增分支”。
- 新抽象必须证明自己减少了调用点的整体复杂度；若只是把复杂度移动到别处，则不要抽象。
- 公共层不得为迁就单一业务场景而污染接口；宁可让特例留在边界层，也不要把整个共享层做脏。
- 性能优化应以真实热点为目标，避免引入牺牲可读性的投机性缓存、记忆化和多态分发。
- 错误处理要保留锋利边界。不要因为想让调用方“省心”就吞掉上下文、来源和失败条件。

Linus taste 落地检查：

- 这段代码能不能通过更直接的数据结构或更少的状态把一半逻辑删掉？
- 这个改动是否减少了特殊情况，而不是重新包装特殊情况？
- 这个接口是否能让调用方一眼看懂，而不需要追三层抽象？
- 这个状态/生命周期的 owner 是否唯一且明确？
- 这段逻辑是否在解决真实需求，而不是为了架构好看？
- 如果未来要删掉这段代码，边界是否清楚、代价是否可控？

明确不鼓励：

- 为了“模式统一”引入仓库当前并不需要的架构层。
- 过度 OO、过度继承、过度配置化、过度泛型化。
- 把复杂交互拆成大量彼此弱关联的小文件，导致阅读路径碎片化。
- 用 silent fallback、隐式同步、魔法默认值维持表面整洁。
- 为避免修改旧代码而额外包一层适配器，结果使主路径更难理解。

## 5. 单模式开发语义

- `Editor`：统一承载运动链拓扑、几何体/材质/纹理、碰撞与测量、电机与硬件参数配置

实现新功能前，必须先判断属于 `Editor` 下的哪类子能力，避免跨子系统逻辑耦合。

快速映射：

- 统一公开入口落在 `features/editor`
- 具体实现位于 `features/urdf-viewer`（包含原拓扑/硬件与几何/碰撞/测量能力）
- 跨子域共享交互优先落在 `app` 编排层或 `shared/components/3d`

## 6. App 编排层（当前重点）

关键入口：

- `src/app/App.tsx`：根组件，装配 Providers、懒加载模态框、全局导入导出入口、回归调试桥接
- `src/app/AppLayout.tsx`：应用壳、Header、TreeEditor、PropertyEditor、UnifiedViewer、workspace/source 同步主编排
- `src/app/components/UnifiedViewer.tsx`：组合 `Editor` 两个子域场景（拓扑/硬件 + 几何/碰撞/测量），统一 selection/hover/preview/tool mode/resource scope
- `src/app/components/WorkspaceCanvas.tsx`：应用层对共享画布入口的 re-export；底层 `WorkspaceCanvas` runtime 在 `src/shared/components/3d/workspace/*`
- `src/app/components/AppLayoutOverlays.tsx` 与 `src/app/utils/overlayLoaders.ts`：懒加载业务浮层（如 bridge create、collision optimization）
- `src/app/components/ConnectedDocumentLoadingOverlay.tsx` / `src/app/components/DocumentLoadingOverlay.tsx` / `src/app/components/ImportPreparationOverlay.tsx`：导入准备、文档加载与 worker 进度反馈
- `src/app/components/SnapshotDialog.tsx`：统一快照导出与预览弹层
- `src/app/components/unified-viewer/*`：统一 viewer 的 scene root、overlay、derived state、mode module loader 与 joints panel 适配
- `src/app/components/header/*`：Header actions/menus/overflow/toolbox 等子结构
- `src/app/components/settings/*`：设置面板子页与 about pane

当前 `app/hooks/*` 职责：

- `useAppShellState.ts` / `useAppEffects.ts` / `useAppLayoutEffects.ts` / `useAppState.ts`：App shell、mode/panel、副作用与 layout 编排
- `useViewerOrchestration.ts`：selection / hover / pulse / focus / transform pending 协调
- `useFileImport.ts`：App 级导入流程；组合 `store + parsers + feature file-io`
- `useFileExport.ts`：App 级导出流程；组合当前 viewer 状态、assembly history、USD roundtrip、project export、archive assets
- `hooks/file-export/*`：导出 workflow 的 helper 子树，当前主要包含 `src/app/hooks/file-export/assemblyHistory.ts`、`src/app/hooks/file-export/progress.ts`、`src/app/hooks/file-export/projectExport.ts`、`src/app/hooks/file-export/usdExport.ts`
- `useWorkspaceSourceSync.ts` / `useWorkspaceMutations.ts` / `useLibraryFileActions.ts`：workspace、source code、assembly、library 文件行为编排
- `src/app/hooks/useWorkspaceModeTransitions.ts` / `src/app/hooks/useWorkspaceOverlayActions.ts`：workspace 视图切换、浮层动作与 UI 呈现收口
- `src/app/hooks/usePreparedUsdViewerAssets.ts` / `src/app/hooks/useAnimatedWorkspaceViewerRobotData.ts` / `src/app/hooks/useSourceCodeEditorWarmup.ts`：viewer 资产预热、workspace viewer 动画数据与代码编辑器预热
- `src/app/hooks/useImportInputBinding.ts`：App 级文件输入绑定与导入入口整合
- `src/app/hooks/useEditableSourcePatches.ts` / `src/app/hooks/useUnsavedChangesPrompt.ts`：编辑源码 patch 生命周期与离开保护
- `useCollisionOptimizationWorkflow.ts`：碰撞优化 UI 流程与状态协调
- `usePendingHistoryCoordinator.ts`：pending history 与 viewer/export 生命周期协同
- `robotImportWorkerBridge.ts` / `importPreparationWorkerBridge.ts`：App 层 worker bridge，连接导入准备与 robot import worker

当前 `app/utils/*` 重点：

- USD/roundtrip/hydration：`usdExportContext.ts`、`usdHydrationPersistence.ts`、`usdStageHydration.ts`、`liveUsdRoundtripExport.ts`、`usdRoundtripExportArchive.ts`
- 导出辅助：`exportArchiveAssets.ts`、`usdBinaryArchive.ts`、`urdfSourceExportUtils.ts`、`currentUsdExportMode.ts`
- 编辑器与显示：`sourceCodeDisplay.ts`、`sourceCodeEditorLoader.ts`
- 历史与缓存：`pendingHistory.ts`、`pendingUsdCache.ts`
- 导入准备 / 文档加载：`documentLoadFlow.ts`、`contentChangeAppMode.ts`、`importPreparation.ts`、`importPreparationTransfer.ts`、`importPackageAssetReferences.ts`、`contextualPreResolvedImports.ts`
- workspace/source：`workspaceGeneratedSourceState.ts`、`workspaceSourceSyncUtils.ts`、`workspaceViewerAnimation.ts`、`workspaceViewerPresentation.ts`
- Unified viewer 切换与 viewport handoff：`unifiedViewerForcedSessionState.ts`、`unifiedViewerHandoffReadyState.ts`、`unifiedViewerLoadReleaseState.ts`、`unifiedViewerOptionsRestore.ts`、`unifiedViewerResourceScopes.ts`、`unifiedViewerSceneMode.ts`、`unifiedViewerSceneProps.ts`、`unifiedViewerViewportState.ts`、`viewerViewportHandoff.ts`
- Worker payload / transfer：`robotImportWorkerPayload.ts`、`importPreparationTransfer.ts`、`usdBinaryArchiveWorkerTransfer.ts`
- App workers：`app/workers/importPreparation.worker.ts`、`app/workers/robotImport.worker.ts`、`app/workers/usdBinaryArchive.worker.ts`

约束：

- 只要逻辑横跨多个 store、多个 feature、viewer 当前状态或 hydration/export 生命周期，优先放在 `app`。
- 单一 feature 内闭环的逻辑不要硬塞进 `app`。
- `features/file-io` 负责底层文件能力，`app/hooks/useFileImport.ts` / `useFileExport.ts` 才是当前应用工作流 source of truth。
- `app` 当前会直接 deep import 若干 feature 内部 `utils/*`；新增长期编排能力时，优先通过 feature 的 `index.ts` 或 facade 暴露稳定入口，避免 `app` 继续绑死内部文件布局。

## 7. Editor 统一 Viewer 子域要求（`editor` 入口 + `urdf-viewer` 实现）

本节即该子域的规范入口（不再维护旧的双入口描述）。

3D / Three.js / R3F / WebGL 相关任务补充要求：

- 若任务涉及 3D 场景、Three.js、React Three Fiber、WebGL 或 `Editor` 两个 viewer 子域能力，agent 必须优先使用 `threejs-skills` skill。
- 在满足本仓库架构约束的前提下，优先复用该 skill 中关于场景组织、材质、动画循环、交互和资源释放的最佳实践。

当前结构：

- `src/features/editor/index.ts`
- `src/features/urdf-viewer/components/*`
- `src/features/urdf-viewer/hooks/*`
- `src/features/urdf-viewer/utils/*`
- `src/features/urdf-viewer/runtime/*`

关键约束：

- 扩展功能优先放入 hooks 或新增组件，避免回到独立壳组件形态。
- 保持 `RobotNode <-> JointNode` 交替递归渲染模式。
- TransformControls 与拖拽链路依赖的引用注册必须完整可追踪。
- 材质必须通过 `materials.ts` / `urdfMaterials.ts` 或共享工厂复用，不要在高频路径直接 `new` 材质。
- 使用 `RobotState` 与现有共享类型，避免 `any`。
- 与闭环、碰撞拖拽相关的能力优先复用：
  - `useViewerController`
  - `useMouseInteraction`
  - `useHoverDetection`
  - `useVisualizationEffects`

## 8. Editor 几何/碰撞/测量子域要求（`urdf-viewer` 目录）

对应文档：`docs/prompts/urdf-viewer.md`

当前结构：

- React 层：
  - `src/features/urdf-viewer/components/*`
  - `src/features/urdf-viewer/hooks/*`
  - `src/features/urdf-viewer/types.ts`
- 运行时与嵌入层：
  - `src/features/urdf-viewer/runtime/embed/*`
  - `src/features/urdf-viewer/runtime/hydra/*`
  - `src/features/urdf-viewer/runtime/types/*`
  - `src/features/urdf-viewer/runtime/vendor/*`
  - `src/features/urdf-viewer/runtime/viewer/*`
  - `src/features/urdf-viewer/runtime/UPSTREAM.md`
- 工具与适配层：
  - `src/features/urdf-viewer/utils/*`
- Worker 层：
  - `src/features/urdf-viewer/workers/*`

关键边界：

- `runtime/*` 是 vendored usd-viewer runtime，当前来源见 `src/features/urdf-viewer/runtime/UPSTREAM.md`。
- URDF Studio 应该把 runtime 输出适配到自己的 `ViewerRobotDataResolution` / `RobotData`，不要在 `src/core/parsers/usd/*` 重复实现 viewer runtime 职责。
- `public/usd/bindings/*` 必须保持可在浏览器运行时 fetch，不要迁入源码模块。

关键文件与职责：

- `UsdWasmStage.tsx`：WASM stage 嵌入入口
- `UsdOffscreenStage.tsx`：offscreen canvas + worker 模式下的 USD viewer 宿主
- `src/features/urdf-viewer/components/ViewerCanvas.tsx`：viewer 画布层与共享 canvas 适配
- `src/features/urdf-viewer/components/ViewerToolbar.tsx`：viewer 顶部工具条
- `src/features/urdf-viewer/components/ViewerLoadingHud.tsx`：viewer/stage loading 状态 HUD 与反馈层
- `src/features/urdf-viewer/utils/viewerRobotData.ts`：统一 viewer 层消费的数据形态
- `src/features/urdf-viewer/utils/viewerResourceScope.ts`：围绕 source file / assets / robot links 构建稳定资源域
- `src/features/urdf-viewer/utils/usdExportBundle.ts`：USD viewer 场景快照与导出缓存协调
- `src/features/urdf-viewer/utils/usdRuntimeRobotHydration.ts`：runtime -> RobotData hydration
- `src/features/urdf-viewer/utils/usdSceneRobotResolution.ts`：场景级 robot resolution
- `src/features/urdf-viewer/utils/usdViewerRobotAdapter.ts`：viewer runtime / snapshot 到应用数据的适配
- `src/features/urdf-viewer/utils/usdOffscreenViewerProtocol.ts`：主线程与 offscreen worker 的协议与消息形态
- `src/features/urdf-viewer/utils/usdOffscreenViewerWorkerClient.ts`：主线程对 offscreen worker 的请求封装
- `src/features/urdf-viewer/utils/usdWorkerRendererSupport.ts` / `src/features/urdf-viewer/utils/usdWorkerOrbit.ts`：worker 渲染支持与轨道控制协同
- `src/features/urdf-viewer/utils/usdStageOpenPreparationWorkerBridge.ts` / `src/features/urdf-viewer/utils/usdPreparedExportCacheWorkerBridge.ts`：prepared-open / prepared-export 链路的 worker bridge
- `src/features/urdf-viewer/utils/runtimeSceneMetadata.ts`：runtime scene metadata 的标准化读模型
- `src/features/urdf-viewer/utils/visualizationFactories.ts`：辅助可视化对象创建
- `src/features/urdf-viewer/utils/dispose.ts`：THREE 资源清理

关键约束：

- 优先复用 `utils/materials.ts`、`utils/urdfMaterials.ts`、`utils/dispose.ts`，不要散落临时材质与几何体。
- Props 与共享类型统一收口到 `types.ts`。
- 可视化对象新增优先通过 `visualizationFactories.ts`。
- 卸载、切换、reload、hydration rollback 时必须确认 THREE 资源释放。
- `JointsPanel` 仍位于 `src/shared/components/Panel/JointsPanel.tsx`，共享逻辑不要回灌到 viewer 私有层。

### 8.1 USD worker / metadata 链路约束（2026-03-30）

适用范围：

- `src/features/urdf-viewer/runtime/hydra/render-delegate/*`
- `src/features/urdf-viewer/workers/*`
- `src/features/urdf-viewer/utils/usd*`
- `src/app/hooks/useFileImport.ts` / `src/app/hooks/useFileExport.ts` 中会消费 worker 结果的 USD 工作流

必须遵循：

- 涉及 USD stage preparation、runtime metadata extraction、robot hydration、prepared export cache、roundtrip archive 的修复，默认优先放在 `worker/runtime` 链路里完成，不要为了“先跑通”把修复偷偷搬到主线程 adapter 或 debug bridge。
- `runtime/hydra/render-delegate/*` 产出的 metadata snapshot 是该链路的 source of truth；若 snapshot 缺字段，应修 worker/runtime 生成逻辑，而不是在上层 UI、store 或 regression bridge 做补丁式回填。
- 禁止新增“worker 结果缺失 -> 主线程重建 metadata -> 静默继续”的 fallback。worker 真失败就应显式暴露，或直接把根因修在 worker。
- 对 folded fixed link、collision-only semantic child link、synthetic parent-child pair 这类推断，只能基于 stage/truth 中的明确证据推进；不要做纯命名猜测式补 link。
- 若 stage 原始数据本身不包含目标语义（例如 fixture 里没有对应 child link 证据），应如实暴露这一事实，不要在 UI 层伪造“看起来正确”的 metadata。

验证要求：

- 改动上述链路时，除定向单测外，必须额外跑 `test/unitree_model` 的整套 USD 浏览器批量验证，确认所有主要 Unitree 样本仍满足：
  - `loaded = true`
  - `stageReady = true`
  - `stagePreparationMode = "worker"`
  - `metadataSource` 指向 worker/runtime 结果（当前应为 `usd-stage-cpp` 或同类 worker source）
- 浏览器批量验证产物默认写入 `tmp/regression/`，并在最终回复中明确说明结果文件路径。
- 若 `test/unitree_model` fixture 缺少外部 mesh 资源，允许出现可解释的 mesh lookup error；但这不能作为跳过 worker metadata 验证、跳过 hydration 验证或引入 fallback 的理由。

### 8.2 USD offscreen / runtime 生命周期约束（2026-03-30）

适用范围：

- `src/features/urdf-viewer/components/UsdOffscreenStage.tsx`
- `src/features/urdf-viewer/workers/usdOffscreenViewer.worker.ts`
- `src/features/urdf-viewer/runtime/hydra/render-delegate/*`
- `src/shared/utils/three/dispose.ts`

必须遵循：

- worker/offscreen renderer 的主线程宿主只负责 handoff、尺寸同步与错误透传；不要在主线程重新构建 runtime truth 或默默补 runtime 缺失状态。
- teardown 必须完整释放 observer、DOM/worker 事件监听、RAF/timer、OffscreenCanvas 关联 runtime、scene graph 与 driver 引用。
- 若 runtime 注册了全局 handler / registry / active owner，新增能力时必须同时提供对称的 unregister/reset；禁止只注册不解绑。
- worker 侧若创建了 `ImageBitmap`、object URL、临时 geometry/material/texture，销毁路径必须显式 close/revoke/dispose，不能假设 GC 或 `Texture.dispose()` 会兜底。
- 任何“reload 后继续复用旧 delegate / 旧 render interface / 旧 stage metadata”的做法都必须有明确生命周期边界，禁止通过全局单例把旧实例挂死。

## 9. File I/O、Workspace 与导出链路

当前职责拆分：

- `src/features/file-io/`：格式检测、BOM、project import/export、archive/asset registry、USD/SDF export、ExportDialog/ExportProgressDialog、snapshot/pdf hooks、导入/导出 worker bridge
- `src/app/hooks/useFileImport.ts`：应用级导入工作流
- `src/app/hooks/useFileExport.ts`：应用级导出工作流
- `src/app/hooks/file-export/*`：应用导出流程的子模块 helper；当前主要包括 `assemblyHistory.ts`、`progress.ts`、`projectExport.ts`、`usdExport.ts`
- `src/features/robot-tree/`：structure/workspace 文件树、树编辑器、上下文菜单、布局；组件层已拆分为 `tree-editor/*` 与 `tree-node/*`
- `src/features/assembly/`：桥接组件创建与组装入口
- `src/features/property-editor/`：属性编辑、几何编辑、碰撞优化、`geometry-conversion/*` 与 mesh worker

当前工作流事实：

- `features/file-io/hooks/useFileExport.ts` 已移除，应用导出 source of truth 在 `app/hooks/useFileExport.ts`。
- 应用导入 source of truth 在 `src/app/hooks/useFileImport.ts`；不要在 `features/file-io` 内恢复旧导入 hook。
- 新增导出辅助逻辑时，优先补到 `app/hooks/file-export/*`，而不是把 `useFileExport.ts` 重新做成大而全单文件。
- `.usp` project import/export、USD prepared export cache、live USD roundtrip archive 已进入主工作流。
- `projectArchive.worker.ts`、`usdExport.worker.ts`、`usdBinaryArchive.worker.ts` 已进入主导出链路；涉及大型归档或序列化任务时，优先走现有 worker/transfer 路径。
- `projectImport.worker.ts` 已进入 project import 链路；项目归档导入相关问题优先在 worker/bridge 修，不要把补丁塞回 UI。
- `DisconnectedWorkspaceUrdfExportDialog.tsx` 是 workspace 断联 URDF 导出的特例入口；相关逻辑不要重新塞回通用导出弹层。
- `ExportProgressDialog.tsx` / `ExportProgressView.tsx` 是当前长时导出反馈的统一 UI，不要在业务层重新发明一套导出进度弹层。
- `output/` 可包含用户可见导出与回归结果；新的临时浏览器验证产物仍默认写入 `tmp/`。

多 URDF 组装相关改动，需重点检查：

- 命名空间前缀冲突规避
- `BridgeJoint` 连接合法性
- 合并导出行为一致性
- workspace 与 structure 视图切换时的 source file / selected file 同步

## 10. Shared / Core / Lib 约束

`shared/`：

- `shared/components/3d/*` 是双 viewer 共享的 3D 基础设施 source of truth。
- 当前已分化出 `scene/*`、`renderers/*`、`helpers/*`、`unified-transform-controls/*` 等子树；涉及画布基础设施时优先先定位到对应子目录，而不是直接在 viewer 组件层搜索。
- `shared/components/3d/workspace/*` 已承载共享 `WorkspaceCanvas` 宿主、renderer cleanup 与 WebGL 能力检查；App 层画布入口主要做业务编排。
- 优先复用：
  - `ReferenceGrid`
  - `GroundShadowPlane`
  - `SceneLighting`
  - `WorkspaceOrbitControls`
  - `UnifiedTransformControls`
  - `SnapshotManager`
  - `TransformConfirmOverlay`
- `MeshAssetNode.tsx`、`MeshRenderers.tsx` 与 `shared/components/3d/renderers/*` 属于共享 mesh 呈现层；涉及 primitive/object 生命周期时优先在这里集中治理。
- `GLTFRendererImpl.tsx` 已存在于共享渲染层；不要在 feature 内重新拼 glTF 渲染入口。
- 通用 THREE 释放优先使用 `shared/utils/three/dispose.ts` 或 viewer 已有 `dispose.ts`。
- `shared/workers/closedLoopMotionPreview.worker.ts` 是共享 worker，不要把同类预览逻辑复制回 feature 私有 worker。
- `shared/debug/regressionBridge.ts` 仅做调试/回归桥接，不要让业务层依赖调试 API 才能工作。
- DAE / OBJ / STL mesh 渲染优先复用 `shared/components/3d/renderers/*`，其底层 mesh/collada 处理依赖 `core/loaders/*`；不要在 feature 组件里重新拼一套 loader + renderer 管线。

`core/`：

- 当前包含 `parsers/`、`loaders/`、`loaders/workers/`、`robot/`、`stl-compressor/`、`utils/`。
- 维持纯逻辑与可测试性，不引入 React/UI/DOM。
- Mesh、MJCF、URDF、USD、Xacro 解析器与 robot algebra 统一留在 `core/`。
- `core/utils/runtimeDiagnostics.ts`、`core/utils/ensureWorkerXmlDomApis.ts` 等运行时辅助也归 `core`，不要把这类纯工具上移到 feature。

`lib/`：

- 当前主要对外暴露 `RobotCanvas`、`lib/types.ts`、`lib/styles.css` 与 `lib/hooks/useControllableState.ts`。
- 只有确认“与应用壳无关、可稳定发布”的能力才允许抽入 `lib/`。
- `packages/react-robot-canvas/dist/*` 当前作为包发布产物保留在仓库内；除非任务明确针对发包结果，禁止手改这些文件，统一通过包内 build / `scripts/postbuild.mjs` / prepack 流程生成。

## 11. 状态管理与文件职责提示

Zustand 关键 Store：

- `robotStore`：模型 CRUD、Undo/Redo、派生计算、closed loop constraints
- `uiStore`：mode/theme/lang/sidebar/panels/view options 等（含持久化）
- `selectionStore`：选中、悬停、pulse、focus
- `assetsStore`：mesh/texture/robot files/motor library/USD scene snapshot/prepared export cache
- `assemblyStore`：多 URDF 组装、组件管理、BridgeJoint、组装历史
- `assemblySelectionStore`：workspace 中的组件 / bridge / source file 选区作用域
- `collisionTransformStore`：碰撞 gizmo 的瞬时 pending transform
- `jointInteractionPreviewStore`：跨 viewer 的关节交互预览与瞬时状态

约束：

- 共享 UI 组件不要直接操纵多个 store；跨 store 协调优先放 `app/hooks/*`。
- 新增持久化字段前，先确认是否属于 `uiStore` / `assetsStore` 的长期状态，而不是一次性交互缓存。
- USD hydration / roundtrip 中间态优先落在 `assetsStore` 缓存或 `app/utils/*`，不要在组件局部散落。

## 12. UI 风格与可访问性要求

对应文档：`docs/prompts/URDF_STUDIO_STYLE_GUIDE.md`

必须遵循：

- 使用语义色 token，不散落硬编码色值
- 组件在 `light + dark + prefers-contrast: more` 下都需可读
- 暗色层次使用 `base/surface/elevated`，避免纯黑硬切
- 状态表达不只依赖颜色，补充图标/文本/形态差异
- Focus 态可见，建议统一 `ring-system-blue/30`

蓝色强约束：

- `#0088FF` 仅用于 Slider/进度线/细线型高亮（`slider-accent`）
- `#0088FF` 禁止用于主按钮实底、小字号正文链接、大面积背景
- 主按钮底色使用 `system-blue-solid`，文本/图标强调用 `system-blue`

面板文案约束：

- 常驻工具面板默认使用短标签、短标题、短状态文案；不要为了“解释清楚”塞整段说明。
- 像测量、吸附、显示开关这类高频操作，优先直接提供可选项，不额外重复解释“该选项是什么”。
- 只有首次使用门槛高、流程较长或存在明显误操作成本的区域（如 toolbox、批量优化、复杂导入导出流程）才保留简短 helper copy。
- 若一个面板已经能通过标题、字段名、占位文案和按钮标签表达清楚，就删除冗余说明文本。

## 13. 代码变更工作流（建议）

1. 定位任务所属模式与模块边界。
2. 明确改动是在 `app` 编排层、单一 `feature`、还是 `shared/core` 通用层。
3. 检查依赖方向是否符合架构红线，避免新增例外。
4. 优先复用现有 hooks/utils/components，不重复造轮子。
5. 保持类型完整性，避免 `any`。
6. 涉及 3D/USD/mesh 时，检查材质缓存、资源释放、hydration/export 生命周期。
7. 做最小必要改动并验证。

单文件与模块化策略：

- 默认优先模块化拆分，不把新能力堆到单个大文件。
- 允许单文件：仅限小改动（文案、样式微调、局部 bug 修复）且不引入新职责。
- 必须拆分的场景：
  - 同时引入“状态 + 视图 + 业务逻辑”
  - 新增可复用逻辑（优先抽为 hook/utils）
  - 文件已明显过大且继续修改会降低可维护性
- 对 `Editor` 两个 viewer 子域 / `AppLayout` / `UnifiedViewer` 的改动，优先新增 hooks/components，避免继续增厚主组件。

当前明确热点文件（新增逻辑优先抽离，而不是继续增厚）：

- `src/features/property-editor/utils/geometryConversion.ts`
- `src/features/file-io/utils/usdExport.ts`
- `src/features/urdf-viewer/components/UsdWasmStage.tsx`
- `src/features/urdf-viewer/utils/usdExportBundle.ts`
- `src/app/hooks/useFileExport.ts`
- `src/app/AppLayout.tsx`

## 14. 浏览器/MCP 截图与收尾清理

- 若任务中使用了 Chrome DevTools、Playwright、浏览器自动化或其他 MCP 工具，浏览器验证产物默认统一写入仓库内 `tmp/`，可按需放在 `tmp/screenshots/`、`tmp/playwright/`、`tmp/chrome-devtools/` 等子目录。
- 禁止将浏览器截图或其他临时验证产物直接写到仓库根目录。
- `output/` 仅用于用户可见导出结果、回归归档或明确要保留的产物；临时截图/trace 不要默认写入 `output/`。
- 浏览器截图前，默认先关闭会遮挡主体画面的侧栏、浮层和调试面板，尤其是 `Editor` 的选项面板。
- 除非任务明确要求保留 UI 状态，截图应优先提供无遮挡 clean shot；如需展示面板，建议额外补一张无遮挡截图。
- 完成验证后必须清理残留上下文，关闭不再使用的浏览器标签页、DevTools 面板、Playwright 页面、隔离 context 与临时调试会话。
- 若测试过程中启动了额外的浏览器实例、调试端口、后台线程、本地预览服务或临时辅助进程，结束前应主动关闭，除非用户明确要求保留。
- 最终回复中，若保留了任何必须继续运行的进程，需要明确说明用途与访问地址；否则默认应清理干净。

## 15. 验收清单

- [ ] Light / Dark / 高对比模式下可读性通过
- [ ] 无新增分散硬编码颜色
- [ ] 3D 资源无明显泄漏（材质/几何体/纹理释放）
- [ ] worker/offscreen 生命周期完整释放（listener / observer / timer / worker / global handler / ImageBitmap）
- [ ] 新增的 observer / listener / timer / object URL / ImageBitmap / pending request map 均有对称 cleanup 或容量上限
- [ ] USD hydration / roundtrip / export 未破坏当前 source-of-truth 流程
- [ ] 浏览器验证产物已放入 `tmp/`，未新增根目录截图/trace
- [ ] 浏览器测试结束后无残留 Chrome DevTools / Playwright 会话、线程或临时进程
- [ ] 变更符合模块职责，没有破坏依赖方向
- [ ] 新增依赖未扩大现有架构例外
- [ ] 未新增 silent fallback / 吞错式兜底，异常路径仍可定位和 debug
- [ ] import/export/hydration 等 source-of-truth worker bridge 在失败时显式报错，没有静默主线程降级
- [ ] 若改动 USD worker / metadata 链路，已完成 `test/unitree_model` 全量浏览器验证且结果落盘到 `tmp/regression/`
- [ ] 若改动运行时代码，已完成对应测试或构建验证

推荐命令：

```bash
npm run dev
npm run lint
npm run typecheck
npm run test
npm run build
npm run verify:fast
npm run verify:full

# 快速查看当前模块结构
find src -maxdepth 3 -type d | sort

# 查看 app / features 主入口
find src/app src/features -maxdepth 2 -type f | sort | sed -n '1,240p'

# 大仓库搜索时默认排除 vendor / 产物 / 临时目录
rg -n "pattern" src docs scripts packages/react-robot-canvas \
  -g '!test/**' -g '!.tmp/**' -g '!tmp/**' -g '!dist/**' -g '!node_modules/**'

# 检查潜在反向依赖（重点关注 core/shared/store 对 features 的引用）
rg -n "from ['\"]@/features/" src/core src/shared src/store

# 检查 feature 间直接耦合（控制存量，不新增）
rg -n "from ['\"]@/features/" src/features

# 检查 shared 对 store 的依赖（控制存量，不新增）
rg -n "from ['\"]@/store/" src/shared

# 检查硬编码色值
rg -n "#[0-9A-Fa-f]{3,8}" src

# 检查 #0088FF 使用范围
rg -n "#0088FF|#0088ff" src | rg -v "Slider.tsx|styles/index.css"

# 仓库级快速验证
npm run check
npm run test:unit:app-hooks

# USD worker / metadata 链路回归
node --test \
  src/features/urdf-viewer/runtime/hydra/render-delegate/robot-metadata-stage-fallback.test.js \
  src/features/urdf-viewer/runtime/hydra/render-delegate/folded-fixed-link-truth.test.js

npx tsx --test \
  src/features/urdf-viewer/utils/usdViewerRobotAdapter.test.ts \
  src/features/urdf-viewer/utils/usdRuntimeRobotHydration.test.ts

# Unitree roundtrip / archive 样本验证
npx tsx scripts/regression/validate_unitree_model_roundtrip_archive.ts

# 现成 fixture 回归入口
npm run test:fixtures:imports
npm run test:fixtures:myosuite-imports
npm run test:fixtures:unitree-usd
npm run test:fixtures:unitree-ros-urdfs
npm run test:fixtures:unitree-ros-usda

# 打包对外库（仅在改到 src/lib 或 packages/react-robot-canvas 时执行）
npm run build:package:react-robot-canvas

# 额外工具
bash scripts/inspect_urdf.sh path/to/robot.urdf --compact
npm run codex:retry
npm run codex:key-router:deploy:dry
```

说明：

- 根 `package.json` 当前已提供统一的 `npm run lint`、`npm run test`、`npm run build`、`npm run check`、`npm run verify:fast`、`npm run verify:fixtures`、`npm run verify:full` 脚本；默认优先用这些入口，再按模块补跑定向测试。

## 16. 常用 test 样本索引（给 agent 直接复用）

当任务需要真实模型做导入、viewer、hydration、roundtrip、导出或浏览器回归验证时，优先复用 `test/` 里现成样本，不要临时去外网再找模型。

### 16.1 USD / worker / roundtrip 主样本

- `test/unitree_model/Go2/usd/go2.usd`
  - Unitree 四足基准样本；适合 USD stage open、worker metadata、hydration、viewer smoke test。
- `test/unitree_model/Go2W/usd/go2w.usd`
  - Go2 轮足变体；适合验证变体资产、命名差异与 roundtrip 稳定性。
- `test/unitree_model/B2/usd/b2.usd`
  - 更大体量四足样本；适合检查 stage truth、folded fixed link 与复杂 link/joint 结构。
- `test/unitree_model/H1-2/h1_2/h1_2.usd`
  - Humanoid USD 样本；适合验证双足/人形链路与 viewer hydration。
- `test/unitree_model/H1-2/h1_2_handless/h1_2_handless.usd`
  - H1-2 handless 变体；适合检查 asset/配置差异下的 runtime 行为。
- `test/unitree_model/B2/usd/b2.viewer_roundtrip.usd`
- `test/unitree_model/Go2/usd/go2.viewer_roundtrip.usd`
- `test/unitree_model/Go2W/usd/go2w.viewer_roundtrip.usd`
  - 以上 roundtrip 产物可用于导出后 diff、回归对照与 viewer roundtrip 验证。

默认规则：

- 只要改动 USD worker、runtime metadata、hydration、prepared export cache、roundtrip archive，默认先用 `test/unitree_model`。
- 不要只拿单个 Go2 过一遍就宣称链路稳定；这类改动默认至少覆盖 `Go2 + B2 + H1-2`。

### 16.2 SDF / Gazebo 资产链路样本

- `test/gazebo_models/camera/model.sdf`
  - 轻量 smoke 样本；适合快速验证 SDF 导入是否整体可用。
- `test/gazebo_models/cordless_drill/model.sdf`
  - 小型对象样本；同时包含 `DAE + STL + texture`，适合 mesh/材质路径回归。
- `test/gazebo_models/bus_stop/model.sdf`
  - 复合场景样本；包含多 mesh、贴图与混合格式，适合资源解析和路径解析回归。
- `test/gazebo_models/apartment/model.sdf`
  - 大场景样本；适合验证大体量静态环境、纹理与 viewer 性能/稳定性。
- `test/gazebo_models/camera/model-1_2.sdf`
- `test/gazebo_models/camera/model-1_3.sdf`
- `test/gazebo_models/camera/model-1_4.sdf`
- `test/gazebo_models/cordless_drill/model-1_2.sdf`
- `test/gazebo_models/cordless_drill/model-1_3.sdf`
- `test/gazebo_models/cordless_drill/model-1_4.sdf`
  - 版本化 SDF 文件可用于验证不同 schema/version 兼容性。

### 16.3 URDF / 外部仓库镜像样本

- `test/awesome_robot_descriptions_repos/anymal_c_simple_description/urdf/anymal.urdf`
  - 纹理与 `DAE` 较完整的四足 URDF；适合常规 URDF viewer/import 回归。
- `test/awesome_robot_descriptions_repos/mini_cheetah_urdf/urdf/mini_cheetah.urdf`
  - 混合 `OBJ/STL` 资产链路；适合 mesh loader 与相对路径解析回归。
- `test/awesome_robot_descriptions_repos/cassie_description/urdf/cassie_v4.urdf`
  - 双足/人形 URDF；适合复杂关节层级和碰撞/惯性链路检查。
- `test/awesome_robot_descriptions_repos/fanuc_m710ic_description/urdf/m710ic70.urdf`
  - 工业机械臂；适合关节轴、层级清晰度与属性编辑面板回归。
- `test/awesome_robot_descriptions_repos/models/franka_description/urdf/panda_arm_hand.urdf`
  - `gltf + ktx2 + png/bin` 资产链路；适合现代 mesh 资源解析与纹理引用验证。
- `test/awesome_robot_descriptions_repos/onshape-to-robot-examples/quadruped_urdf/robot.urdf`
  - 结构较直接的 Onshape 导出样本；适合快速排查导入器对简化 URDF 的兼容性。

### 16.4 MJCF / MuJoCo 样本

- `test/awesome_robot_descriptions_repos/mujoco_menagerie/unitree_go2/go2.xml`
  - 标准 MuJoCo menagerie 样本；适合 MJCF 导入与 Unitree 对照验证。
- `test/awesome_robot_descriptions_repos/mujoco_menagerie/unitree_go2/scene.xml`
  - 带场景包装的 MJCF；适合检查 scene 级引用与资源装配。

### 16.5 样本选择建议

- 快速 smoke：
  - `test/gazebo_models/camera/model.sdf`
  - `test/awesome_robot_descriptions_repos/fanuc_m710ic_description/urdf/m710ic70.urdf`
  - `test/unitree_model/Go2/usd/go2.usd`
- 资源加载/路径解析回归：
  - `test/gazebo_models/bus_stop/model.sdf`
  - `test/awesome_robot_descriptions_repos/models/franka_description/urdf/panda_arm_hand.urdf`
  - `test/awesome_robot_descriptions_repos/mini_cheetah_urdf/urdf/mini_cheetah.urdf`
- 复杂层级/人形链路：
  - `test/unitree_model/H1-2/h1_2/h1_2.usd`
  - `test/awesome_robot_descriptions_repos/cassie_description/urdf/cassie_v4.urdf`
- USD worker / metadata / roundtrip：
  - 整套 `test/unitree_model`

使用要求：

- 在任务描述、脚本参数、回归记录里直接写具体文件路径，不要只写“跑一下 test 里的模型”。
- 若任务只影响某一种格式，优先选对应格式样本，不要默认把所有大样本都跑一遍。
- 若新增了长期稳定、可重复复用的高价值样本，可顺手补充到本节，而不是只留在临时聊天记录里。

## 17. Prompt 编写建议（给 AI 指令使用者）

- 具体化：明确 `Link` / `Joint` 名称、源文件名、当前模式
- 结构化：描述期望父子连接关系、workspace 还是 structure 视图、是否涉及 merged assembly
- 导出/回归：说明目标格式（`URDF` / `MJCF` / `USD` / `.usp`）、是否要保留 roundtrip 能力
- 物理约束：涉及电机替换时给出力矩、减速比、阻尼/摩擦范围

以上可显著提升 AI 输出的可执行性与一致性。

## 18. 近期结构变化记录（2026-03 / 2026-04-06）

- App 编排层已明显增厚：导入导出、USD hydration、workspace/source sync、overlay lazy loading 主要在 `src/app/*` 完成。
- `src/app/*` 新增了 document loading / import preparation / robot import / usd binary archive 等 worker bridge 与 transfer utils；导入和大文件导出不再只靠主线程串行处理。
- `src/app/components/unified-viewer/*` 与 `src/app/hooks/file-export/*` 已拆成稳定子树；`UnifiedViewer.tsx` / `useFileExport.ts` 作为入口编排，细分逻辑优先放到这些子模块。
- `src/app/components/WorkspaceCanvas.tsx` 当前只是应用层导出入口；共享画布 runtime、WebGL 检查、renderer cleanup 与 error boundary 已沉到 `src/shared/components/3d/workspace/*`。
- `UnifiedViewer` 周边已新增一批 forced session、handoff ready、load release、resource scope、viewport handoff 工具；涉及 viewer 切换状态时优先复用这些工具，而不是在组件里散写本地状态机。
- `features/file-io/hooks/useFileExport.ts` 已移除，当前应用导出工作流 source of truth 为 `src/app/hooks/useFileExport.ts`。
- `features/file-io` 目前仅保留 `usePdfExport.tsx`、`useSnapshot.ts` 等局部 hooks；应用导入工作流 source of truth 为 `src/app/hooks/useFileImport.ts`。
- `features/file-io/*` 目前已接入 `projectArchive.worker.ts`、`projectImport.worker.ts`、`usdExport.worker.ts` 与 `ExportProgressDialog.tsx`，project import/export 与长时导出默认应走 worker + progress UI。
- `robot-tree` 已拆成 `tree-editor/*` 与 `tree-node/*` 子树；结构树 UI 与文件浏览器 UI 不再继续堆到单个组件里。
- `property-editor` 已形成 `components/* + hooks/* + utils/geometry-conversion/* + workers/*` 结构；几何转换和 mesh analysis 优先在 util/worker 链路解决。
- `urdf-viewer` 已形成“React 层 + vendored runtime + adapter/utils + workers”结构，并新增 `UsdOffscreenStage.tsx`、`usdOffscreenViewer.worker.ts` 与 offscreen 协议/渲染支持工具。
- `urdf-viewer/runtime/*` 现已细分出 `types/*` 与 `vendor/*` 子树；涉及上游 vendored runtime 的协议类型与兼容性适配优先落这里。
- `urdf-viewer` 已新增一批 USD roundtrip/hydration/resolution/prepared-open/prepared-export 工具，相关 source-of-truth 默认收口在 runtime/worker 链路。
- `shared/data/` 与 `shared/debug/` 已加入仓库，分别承载共享静态数据和回归调试桥接。
- `shared/workers/*` 与 `core/loaders/workers/*` 已进入常规结构，worker 并行能力不再只存在于 feature/app 层。
- 根 `package.json` 已提供统一的 `lint` / `test` / `check` / `verify:*` 入口；文档与 agent workflow 不应再假设“只能按模块手拼命令”。
- collision overlay material / render order 已下沉到 `src/shared/utils/three/collisionOverlayMaterial.ts`，`core` 不应再直接依赖 `features/urdf-viewer/utils/materials`。
- `src/lib/*` 与 `packages/react-robot-canvas/*` 已进入稳定工作区，用于通用画布封装与发布。
- `src/lib/` 当前已细分 `components/*` 与 `hooks/*`；对外复用逻辑不再只靠单一 `index.ts` 暴露。
- `packages/react-robot-canvas/` 当前附带 `dist/` 发布产物，默认由包构建脚本与 `scripts/postbuild.mjs` 维护。
- `docs/` 现已补充 `architecture-boundaries.md`、`robot-canvas-lib.md`、`runtime-fallback-audit.md`，做边界说明、对外库说明与 runtime fallback 审计参考。
- `test/` 中包含外部工程镜像和大型样本，修改前先确认是否真的是本次任务范围。
- 2026-03-30：USD runtime metadata 的 folded collision semantic child link 修复已明确收口到 `runtime/hydra/render-delegate/*` 的 worker/runtime 链路，不应再把同类问题修到主线程 adapter、UI store 或 regression bridge。
- 2026-03-30：`test/unitree_model` 目前是 USD worker/stage metadata 链路的主浏览器回归样本集；后续改动该链路时，默认要补跑整套 Unitree 验证，而不是只跑单个 Go2 fixture。
