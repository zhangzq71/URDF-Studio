# URDF-Studio Gemini 开发指南

> 本文件为 Gemini 提供项目上下文，用于 VibeCoding 开发。

## 项目概述

**URDF Studio** - 可视化机器人设计平台

- **技术栈**: React 19 + TypeScript + Three.js (R3F) + Vite + Tailwind CSS 4 + Zustand
- **在线地址**: https://urdf.d-robotics.cc/
- **许可证**: Apache 2.0

---

## 骨架选项 (Skeleton Options)

骨架模式用于搭建机器人基本结构 (Links & Joints)。

### 功能特性

- **变换模式切换**: 移动 (Translate) / 旋转 (Rotate)
- **几何显示**: 显示/隐藏连杆几何体
- **坐标轴显示**: 显示/隐藏骨架坐标原点
- **标签显示**: 显示/隐藏关节和连杆标签，可调节标签大小
- **关节轴显示**: 显示/隐藏关节轴，可调节轴尺寸

### 核心组件

```typescript
// src/features/visualizer/components/panels/SkeletonOptionsPanel.tsx
interface SkeletonOptionsPanelProps {
  transformMode: 'translate' | 'rotate';
  showGeometry: boolean;
  showSkeletonOrigin: boolean;
  showLabels: boolean;
  labelScale: number;
  showJointAxes: boolean;
  jointAxisSize: number;
  frameSize: number;
}
```

### 状态管理

使用 `useVisualizerState` hook 管理选项状态：

```typescript
const state = useVisualizerState({ propShowVisual, propSetShowVisual });
// state.showGeometry, state.setShowGeometry
// state.transformMode, state.setTransformMode
// ...
```

---

## 3D界面 (3D Interface)

3D 渲染核心由两个主要组件实现：

### Visualizer (骨架/硬件模式)

位于 `src/features/visualizer/components/Visualizer.tsx`

支持三种模式：
- **Skeleton**: 基础骨架编辑
- **Detail**: 完整几何编辑
- **Hardware**: 硬件配置视图

### URDFViewer (细节模式)

位于 `src/features/urdf-viewer/components/URDFViewer.tsx`

特性：
- 完整 URDF 渲染和交互
- 关节控制滑块
- 碰撞体变换控制
- 测量工具
- 惯量和质心显示

### 3D 交互组件

```typescript
// 关节变换控制
<JointTransformControls />

// 碰撞体变换控制 (Detail模式)
<TransformControls />

// 测量工具
<MeasureTool />

// 机器人模型渲染
<RobotModel />

// 场景光照
<SceneLighting />
<Environment files="/potsdamer_platz_1k.hdr" />
```

### 视图控制

- **左键**: 旋转视角
- **右键**: 平移视角
- **滚轮**: 缩放
- **Gizmo**: 右下角坐标轴导航器

---

## 广场 (URDF Square)

模型库广场，提供预设机器人模型的浏览和导入。

### 位置

`src/features/urdf-square/components/URDFSquare.tsx`

### 功能特性

- **分类浏览**: 四足/人形/机械臂/移动底盘
- **搜索过滤**: 按名称和标签搜索
- **3D预览**: 实时3D缩略图渲染
- **一键导入**: 直接导入到编辑器
- **窗口控制**: 支持最小化/最大化/关闭

### 模型数据结构

```typescript
interface RobotModel {
  id: string;
  name: string;
  author: string;
  description: string;
  thumbnail: string;
  category: 'Quadruped' | 'Humanoid' | 'Manipulator' | 'Mobile';
  stars: number;
  downloads: number;
  tags: string[];
  lastUpdated: string;
  urdfPath?: string;
  urdfFile?: string;
  sourceType: 'server' | 'url';
}
```

### 内置模型

- Unitree Go2 / Go1 / A1 / B1 / B2 / Aliengo (四足)
- Unitree G1 / H1 / H1 2.0 (人形)
- Unitree Z1 (机械臂)

---

## 快照 (Snapshot)

高清截图功能，支持导出当前3D视图。

### 位置

`src/features/file-io/hooks/useSnapshot.ts`

### 实现机制

```typescript
interface UseSnapshotReturn {
  snapshotActionRef: React.RefObject<(() => void) | null>;
  handleSnapshot: () => void;
}
```

### 工作原理

1. 使用 `SnapshotManager` 组件在 Three.js 上下文中捕获
2. 生成高分辨率 PNG 图片
3. 自动下载到本地

### UI 入口

- Header 工具栏中的相机图标按钮
- 移动端 "更多" 菜单中的 "快照" 选项

---

## 关于 (About)

应用信息模态框，显示版本、链接和致谢。

### 位置

`src/app/components/AboutModal.tsx`

### 内容

- **应用名称**: URDF Studio
- **版本**: v1.0.0
- **描述**: 专业的机器人 URDF 设计与可视化工作站
- **链接**:
  - GitHub: OpenLegged/URDF-Studio
  - Motphys: 超越物理，进化不止
  - D-Robotics: 地瓜机器人 (赞助商)
- **版权**: © 2025-2026 OpenLegged. Apache License 2.0

### 打开方式

Header → 更多菜单 (三点图标) → 关于

---

## 文件 (File)

文件导入导出功能。

### 导入功能

位置: `src/features/file-io/hooks/useFileImport.ts`

支持格式：
- **URDF** (.urdf, .xacro)
- **MJCF** (.mjcf, .xml)
- **USD** (.usd, .usda)
- **ZIP** (.zip) - 包含完整资源包

导入方式：
1. **导入文件夹** - 上传包含 URDF 和 mesh 文件的完整文件夹
2. **导入 ZIP / 文件** - 上传单个文件或 ZIP 压缩包

### 导出功能

位置: `src/features/file-io/hooks/useFileExport.ts`

支持格式：
- URDF (.urdf)
- MJCF (.mjcf)
- USD (.usd)
- ZIP (.zip) - 包含所有资源

### UI 入口

Header → "文件" 下拉菜单
- 导入文件夹
- 导入 ZIP / 文件
- 导出

---

## 工具箱 (Toolbox)

集成外部工具和 AI 功能的菜单。

### 位置

Header.tsx 中的 Toolbox 下拉菜单

### 功能项

| 功能 | 描述 | 链接 |
|------|------|------|
| **AI 助手** | AI 审阅机器人结构 | 内置功能 |
| **轨迹跟踪** | 动作捕捉和轨迹分析 | https://motion-tracking.axell.top/ |
| **轨迹编辑** | 运动序列可视化编辑器 | https://motion-editor.cyoahs.dev/ |
| **桥介引擎** | 在线机器人训练平台 | https://engine.bridgedp.com/ |

### AI 助手功能

位于 `src/features/ai-assistant/`

- **自然语言生成**: 描述机器人结构，AI 生成 URDF
- **AI 审阅**: 6 大类检查 (物理合理性、运动学、命名规范等)
- **评分报告**: PDF 导出审阅结果

配置环境变量：
```env
VITE_OPENAI_API_KEY=your_key
VITE_OPENAI_BASE_URL=https://api.openai.com/v1
VITE_OPENAI_MODEL=bce/deepseek-v3.2
```

---

## 项目结构

```
urdf-studio/
├── src/
│   ├── main.tsx                 # React 应用入口
│   ├── styles/index.css         # Tailwind CSS 全局样式
│   │
│   ├── types/                   # TypeScript 类型定义
│   │
│   ├── core/                    # 核心逻辑 (纯函数)
│   │   ├── robot/               # 机器人模型操作
│   │   ├── parsers/             # 格式解析器 (URDF/MJCF/USD/Xacro)
│   │   └── loaders/             # 网格加载器 (STL/OBJ/DAE)
│   │
│   ├── store/                   # Zustand 状态管理
│   │   ├── robotStore.ts        # 机器人模型状态 (CRUD)
│   │   ├── uiStore.ts           # UI 状态 (mode, theme, language)
│   │   ├── selectionStore.ts    # 选中状态
│   │   ├── assetsStore.ts       # 资源管理
│   │   └── historyMiddleware.ts # Undo/Redo
│   │
│   ├── shared/                  # 共享模块
│   │   ├── components/          # 通用 UI 组件
│   │   ├── hooks/               # 通用 Hooks
│   │   ├── utils/               # 工具函数
│   │   └── i18n/                # 国际化 (zh/en)
│   │
│   ├── features/                # 功能模块
│   │   ├── robot-tree/          # 机器人树编辑器
│   │   ├── property-editor/     # 属性编辑器
│   │   ├── visualizer/          # 3D 可视化 (Skeleton/Hardware)
│   │   ├── urdf-viewer/         # URDF 查看器 (Detail)
│   │   ├── code-editor/         # Monaco 代码编辑器
│   │   ├── hardware-config/     # 硬件配置
│   │   ├── ai-assistant/        # AI 助手
│   │   ├── urdf-square/         # 模型库广场
│   │   └── file-io/             # 文件 I/O (导入/导出/快照)
│   │
│   └── app/                     # 应用层
│       ├── App.tsx              # 根组件
│       ├── AppLayout.tsx        # 主布局
│       ├── Providers.tsx        # Context Providers
│       ├── components/          # Header, SettingsModal, AboutModal
│       └── hooks/               # 应用级 Hooks
│
├── public/                      # 静态资源
│   ├── logos/                   # Logo 图片
│   ├── samples/                 # 示例 URDF
│   └── library/                 # 模型库资源
│
└── docs/                        # 项目文档
    ├── tutorials/               # 用户使用教程
    └── prompts/                 # AI Prompt 文档
        ├── CLAUDE.md
        └── GEMINI.md            # 本文件
```

---

## 文件浏览 (File Browser)

导入文件后显示的可折叠文件树浏览器。

### 位置

`src/features/robot-tree/components/TreeEditor.tsx`

### 功能特性

- **文件夹树结构**: 层级展示导入的 URDF/MJCF/USD 文件
- **可折叠面板**: 支持展开/收起文件浏览区域
- **垂直调整大小**: 可拖动调整文件浏览器高度
- **双击加载**: 双击文件直接加载到编辑器
- **空状态提示**: 未导入文件时显示 "拖放或导入文件夹/ZIP"

### 数据结构

```typescript
interface RobotFile {
  name: string;      // 文件路径 (如 "unitree/go2_description/urdf/go2.urdf")
  content: string;   // 文件内容
  format: 'urdf' | 'mjcf' | 'usd' | 'xacro';
}
```

### UI 位置

左侧面板顶部区域，位于机器人名称输入框下方。

---

## 结构组件 (Structure Tree)

机器人连杆和关节的层级树形编辑器。

### 位置

`src/features/robot-tree/components/TreeEditor.tsx`

### 功能特性

- **层级展示**: 以树形结构展示 Links 和 Joints 的父子关系
- **选中高亮**: 点击节点选中并在 3D 视图中高亮对应物体
- **添加子连杆**: Skeleton 模式下可添加子 Link
- **删除节点**: 支持删除选中的连杆或关节
- **可视化切换**: 一键显示/隐藏所有可视化几何体
- **可折叠面板**: 与文件浏览器共享面板空间
- **水平调整大小**: 可拖动调整整个左侧面板宽度

### 树节点类型

```typescript
// Link 节点
interface LinkNode {
  type: 'link';
  id: string;
  name: string;
  children: JointNode[];
  visual: boolean;      // 是否显示可视化
}

// Joint 节点
interface JointNode {
  type: 'joint';
  id: string;
  name: string;
  childLinkId: string;
}
```

### 交互操作

| 操作 | 功能 |
|------|------|
| 点击节点 | 选中并在 3D 视图中聚焦 |
| 点击眼睛图标 | 切换可视化显示 |
| 点击 + 按钮 | 添加子连杆 (Skeleton 模式) |
| 点击垃圾桶 | 删除节点 |
| 长按文本 | 启用文本选择 (400ms) |

---

## 设置 (Settings)

可拖拽的设置面板，用于配置界面缩放。

### 位置

`src/app/components/SettingsModal.tsx`

### 功能特性

- **界面缩放**: 调整整个应用 UI 的缩放比例 (80% - 150%)
- **可拖拽**: 支持拖动标题栏移动面板位置
- **重置默认**: 一键恢复 100% 默认缩放

### 状态管理

```typescript
// UI Store
const uiScale = useUIStore((state) => state.uiScale);        // 当前缩放值
const setUiScale = useUIStore((state) => state.setUiScale);  // 设置缩放
const settingsPos = useUIStore((state) => state.settingsPos); // 面板位置
```

### 打开方式

Header → 更多菜单 (三点图标) → 设置

---

## 中英文切换 (Language Switch)

应用国际化语言切换功能。

### 实现位置

- **Header.tsx**: UI 入口 (地球图标按钮)
- **src/shared/i18n/**: 国际化模块
  - `locales/zh.ts`: 中文翻译
  - `locales/en.ts`: 英文翻译
  - `translations.ts`: 翻译注册表

### 切换方式

```typescript
const lang = useUIStore((state) => state.lang);
const setLang = useUIStore((state) => state.setLang);

// 切换语言
setLang(lang === 'en' ? 'zh' : 'en');
```

### UI 入口

1. **Header 主工具栏**: 地球图标按钮 (桌面端)
2. **移动端更多菜单**: "切换语言" 选项

### 覆盖范围

所有 UI 文本、提示信息、AI 对话、审阅报告均支持中英文。

---

## 面板选项 (Options Panel)

可拖拽、可折叠的选项面板系统，用于控制 3D 视图显示选项。

### 位置

`src/shared/components/Panel/OptionsPanel.tsx`

### 组件构成

```typescript
// 复选框选项
<CheckboxOption 
  checked={boolean} 
  onChange={(checked) => {}} 
  label="选项名称" 
/>

// 滑块选项
<SliderOption 
  label="尺寸" 
  value={number} 
  onChange={(value) => {}} 
  min={0} 
  max={1} 
  step={0.01} 
/>

// 切换按钮组
<ToggleButtonGroup 
  options={[{value: 'a', label: 'A'}, {value: 'b', label: 'B'}]} 
  value={currentValue} 
  onChange={(value) => {}} 
/>

// 面板头部
<OptionsPanelHeader 
  title="面板标题" 
  isCollapsed={boolean} 
  onToggleCollapse={() => {}} 
  onClose={() => {}} 
/>
```

### 使用方式

```typescript
const panel = useDraggablePanel();

<OptionsPanel
  title="选项面板标题"
  show={true}
  position={panel.position}
  isCollapsed={panel.isCollapsed}
  onToggleCollapse={panel.toggleCollapsed}
  onMouseDown={panel.handleMouseDown}
  panelRef={panel.panelRef}
>
  {/* 选项内容 */}
</OptionsPanel>
```

### 支持的面板

- **SkeletonOptionsPanel**: 骨架模式选项
- **DetailOptionsPanel**: 细节模式选项 (含碰撞体设置)
- **HardwareOptionsPanel**: 硬件模式选项
- **ViewerOptionsPanel**: URDF 查看器选项
- **JointsPanel**: 关节控制面板

### 交互特性

- **拖拽**: 拖动标题栏移动面板
- **折叠**: 点击上下箭头收起/展开内容
- **关闭**: 点击 X 关闭面板 (可选)
- **定位**: 记住上次拖拽位置

---

## 碰撞体设置选项 (Collision Options)

Detail 模式下控制碰撞体显示和编辑的选项。

### 位置

`src/features/visualizer/components/panels/DetailOptionsPanel.tsx`

### 选项列表

```typescript
interface DetailOptionsPanelProps {
  // 显示控制
  showCollision: boolean;        // 显示碰撞体
  setShowCollision: (show: boolean) => void;
  
  // 变换模式
  transformMode: 'translate' | 'rotate';  // 碰撞体编辑模式
  setTransformMode: (mode: 'translate' | 'rotate') => void;
  
  // 其他显示选项
  showVisual: boolean;           // 显示可视化几何体
  showDetailOrigin: boolean;     // 显示坐标原点
  showDetailLabels: boolean;     // 显示标签
  showInertia: boolean;          // 显示惯量
  showCenterOfMass: boolean;     // 显示质心
}
```

### 碰撞体变换控制

当 `showCollision` 开启且选中 Link 的 collision 子类型时：
- 在 3D 视图中显示 TransformControls
- 支持移动和旋转碰撞体
- 实时更新到机器人模型状态

### UI 入口

Detail 模式 → 右上角选项面板 → "显示碰撞体" 复选框

---

## 几何体选项 (Geometry Options)

属性编辑器中配置连杆几何体参数的选项。

### 位置

`src/features/property-editor/components/PropertyEditor.tsx`

### 几何体类型

```typescript
type GeometryType = 'box' | 'cylinder' | 'sphere' | 'mesh';

interface GeometryConfig {
  type: GeometryType;
  // Box
  width: number;   // X 轴宽度
  depth: number;   // Y 轴深度
  height: number;  // Z 轴高度
  // Cylinder/Sphere
  radius: number;  // 半径
  length?: number; // 圆柱长度
  // Mesh
  filename?: string; // 网格文件路径
}
```

### 属性编辑器中的几何体配置

当选中 Link 的 visual 或 collision 子类型时显示：

```typescript
// 几何体类型选择
<select value={geometryType}>
  <option value="box">方块 (Box)</option>
  <option value="cylinder">圆柱体 (Cylinder)</option>
  <option value="sphere">球体 (Sphere)</option>
  <option value="mesh">网格 (Mesh)</option>
</select>

// Box 参数
<InputGroup label={t.width}>   {/* 宽度 (X) */}
<InputGroup label={t.depth}>   {/* 深度 (Y) */}
<InputGroup label={t.height}>  {/* 高度 (Z) */}

// Cylinder/Sphere 参数
<InputGroup label={t.radius}>  {/* 半径 */}

// 位置/旋转原点
<InputGroup label="Origin XYZ">
<InputGroup label="Origin RPY">
```

### 切换几何体类型

更改类型时会保留当前尺寸参数，自动转换为新类型的对应尺寸。

### UI 位置

右侧面板 → 选中 Link 的 visual/collision → Geometry 部分

| 模式 | 用途 | 3D 组件 | 选项面板 |
|------|------|---------|----------|
| **Skeleton** | 搭建机器人骨架 | `Visualizer` | `SkeletonOptionsPanel` |
| **Detail** | 调整视觉/碰撞几何体 | `URDFViewer` | `ViewerOptionsPanel` |
| **Hardware** | 配置电机参数 | `Visualizer` | `HardwareOptionsPanel` |

---

## 架构设计

### 依赖规则

```
app/ → features/ → store/ → shared/ → core/ → types/
```

- **单向依赖**: 上层依赖下层，下层不依赖上层
- **Feature 隔离**: Features 间通过 Store 通信
- **路径别名**: `@/` 映射到 `src/` 目录

### 核心技术

- **状态管理**: Zustand + Immer
- **Undo/Redo**: historyMiddleware
- **3D 渲染**: Three.js + React Three Fiber (@react-three/fiber)
- **代码编辑**: Monaco Editor (@monaco-editor/react)

---

## 开发命令

```bash
npm run dev      # 开发服务器 (localhost:5173)
npm run build    # 生产构建
npm run preview  # 预览构建产物
```

---

## 国际化 (i18n)

- **中文**: `src/shared/i18n/locales/zh.ts`
- **英文**: `src/shared/i18n/locales/en.ts`

切换方式：Header → 地球图标按钮

---

## 主题

- **亮色模式**: `light`
- **暗色模式**: `dark` (默认)

切换方式：Header → 太阳/月亮图标按钮
