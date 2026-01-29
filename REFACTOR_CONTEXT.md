# Visualizer.tsx 模块化重构 - 继续任务

## 项目背景
URDF Studio 是一个基于 React + TypeScript + Three.js 的机器人可视化设计平台。当前正在重构 `src/features/visualizer/components/Visualizer.tsx`（原 1577 行），将其拆分为更小的、可维护的模块。

**分支**: `ifan/modular_visualizer`
**原文件**: `/Users/wyf/URDF-Studio/src/features/visualizer/components/Visualizer.tsx`

---

## 已完成的模块 ✅

### 1. 目录结构
```
src/features/visualizer/
├── hooks/                      # 自定义 Hooks
│   ├── useVisualizerState.ts   # 状态管理（完成）
│   ├── useDraggablePanel.ts    # 面板拖拽（完成）
│   ├── useJointPivots.ts       # 关节枢轴管理（完成）
│   ├── useCollisionRefs.ts     # 碰撞引用管理（完成）
│   ├── useTransformControls.ts # Transform 控制逻辑（完成）
│   └── index.ts
├── utils/
│   ├── materialCache.ts        # 材质缓存（完成）
│   └── index.ts
├── components/
│   ├── panels/                 # 选项面板组件
│   │   ├── SkeletonOptionsPanel.tsx   # 骨架模式面板（完成）
│   │   ├── DetailOptionsPanel.tsx     # 细节模式面板（完成）
│   │   ├── HardwareOptionsPanel.tsx   # 硬件模式面板（完成）
│   │   └── index.ts
│   ├── nodes/                  # 节点渲染组件
│   │   ├── GeometryRenderer.tsx       # 几何体渲染器（完成）
│   │   ├── JointNode.tsx              # 关节节点（待提取）
│   │   └── RobotNode.tsx              # Link 节点（待提取）
│   ├── controls/               # 控制组件
│   │   ├── TransformConfirmUI.tsx     # 确认/取消 UI（待提取）
│   │   └── JointTransformControls.tsx # 关节变换控制（待提取）
│   ├── VisualizerCanvas.tsx    # Canvas 封装（待提取）
│   └── Visualizer.tsx          # 主组件（待重构）
```

### 2. 已提取的模块详情

#### **Hooks** (5个)
- **useVisualizerState**: 管理所有显示状态（skeleton/detail/hardware 模式的各种开关）
- **useDraggablePanel**: 面板拖拽、位置和折叠状态管理
- **useJointPivots**: 管理关节枢轴引用，用于 TransformControls
- **useCollisionRefs**: 管理碰撞几何体引用
- **useTransformControls**: TransformControls 的拖拽、确认、取消逻辑

#### **Utils**
- **materialCache.ts**: 材质缓存，避免重复创建材质导致性能问题

#### **Panels** (3个)
- **SkeletonOptionsPanel**: 骨架模式的选项面板（显示几何体、坐标系、标签等）
- **DetailOptionsPanel**: 细节模式的选项面板（显示视觉/碰撞几何、惯性等）
- **HardwareOptionsPanel**: 硬件模式的选项面板（显示坐标系、标签）

#### **Nodes**
- **GeometryRenderer**: 渲染 Box/Cylinder/Sphere/Mesh 几何体，处理 hover/selection 状态

---

## 剩余任务 📋

### 第一优先级：提取节点组件
1. **提取 JointNode.tsx**（原文件 168-333 行）
   - 从 Visualizer.tsx 中提取 `JointNode` 组件
   - 导入 `GeometryRenderer` 替代内联的几何体渲染逻辑
   - 保持所有 props 和逻辑不变

2. **提取 RobotNode.tsx**（原文件 335-716 行）
   - 从 Visualizer.tsx 中提取 `RobotNode` 组件
   - 使用 `GeometryRenderer` 替代 `renderGeometry` 函数
   - 保持递归结构和所有交互逻辑

### 第二优先级：提取控制组件
3. **提取 TransformConfirmUI.tsx**（原文件 1453-1516 行）
   - 提取确认/取消输入框 UI
   - 接收 pendingEdit 状态和回调函数

4. **提取 JointTransformControls.tsx**
   - 封装 Joint 的 TransformControls 逻辑（原文件 1427-1450 行）
   - 结合 TransformConfirmUI 组件

### 第三优先级：Canvas 封装
5. **提取 VisualizerCanvas.tsx**（原文件 1378-1573 行）
   - 封装 Canvas、OrbitControls、Grid、GizmoHelper
   - 提供干净的 children 插槽

### 第四优先级：重构主组件
6. **重构 Visualizer.tsx**
   - 使用所有提取的 hooks 和组件
   - 简化主组件到 ~200 行
   - 保持功能完全一致

### 第五优先级：测试
7. **运行测试**
   - 执行 `npm run dev`
   - 测试三种模式（skeleton/detail/hardware）
   - 验证所有交互功能正常

---

## 关键设计决策

### 1. Props 传递策略
- **CommonVisualizerProps**: 所有节点组件共享的 props 接口（原文件 126-152 行）
- 使用展开运算符 `{...state}` 传递状态

### 2. 材质缓存优化
- 使用 `getCachedMaterial()` 避免重复创建材质
- 缓存键包含所有影响材质的属性

### 3. Hooks 解耦原则
- 每个 hook 只负责单一功能
- 返回值包含状态和处理函数
- 避免 hooks 之间的直接依赖

### 4. 组件 memo 优化
- 所有节点组件使用 `memo()` 包裹
- 避免不必要的重渲染

---

## 下一步操作指南

### 立即执行
```bash
# 确认当前分支
git branch

# 查看已创建的文件
ls -R src/features/visualizer/
```

### 提取 JointNode（第一步）
1. 阅读原 Visualizer.tsx 的 168-333 行（JointNode 定义）
2. 创建 `src/features/visualizer/components/nodes/JointNode.tsx`
3. 复制 JointNode 组件代码
4. 导入必要的依赖和类型
5. 导入 `GeometryRenderer` 不需要（JointNode 不直接渲染几何体）
6. 导出组件

### 提取 RobotNode（第二步）
1. 阅读原 Visualizer.tsx 的 335-716 行（RobotNode 定义）
2. 创建 `src/features/visualizer/components/nodes/RobotNode.tsx`
3. 复制 RobotNode 组件代码
4. **关键**：删除 `renderGeometry` 函数（406-577 行）
5. 导入 `GeometryRenderer` 组件
6. 用 `<GeometryRenderer />` 替换 `renderGeometry(false)` 和 `renderGeometry(true)` 调用
7. 导出组件

### 重构主 Visualizer.tsx（最后一步）
1. 删除已提取的组件定义和函数
2. 从新模块中导入：
   ```typescript
   import { useVisualizerState, useDraggablePanel, useJointPivots, useCollisionRefs, useTransformControls } from '../hooks';
   import { SkeletonOptionsPanel, DetailOptionsPanel, HardwareOptionsPanel } from './panels';
   import { RobotNode } from './nodes/RobotNode';
   ```
3. 替换状态声明为 hook 调用
4. 替换面板组件渲染

---

## 重要提醒

### 必须保持不变的内容
- ✅ 所有功能逻辑（不改变行为）
- ✅ Props 接口和类型定义
- ✅ 组件的递归结构（RobotNode → JointNode → RobotNode）
- ✅ TransformControls 的事件处理逻辑

### 可以调整的内容
- ✅ 文件组织结构
- ✅ 导入语句
- ✅ 代码格式和注释

### 测试检查点
- [ ] Skeleton 模式：显示骨架、标签、关节轴
- [ ] Detail 模式：显示视觉/碰撞几何体、拖拽碰撞体
- [ ] Hardware 模式：显示硬件相关信息
- [ ] TransformControls：拖拽关节、确认/取消
- [ ] 面板：拖拽、折叠、选项切换

---

## 快速启动命令

```bash
# 1. 确认分支
git status

# 2. 查看原文件结构（了解要提取的内容）
head -n 50 src/features/visualizer/components/Visualizer.tsx

# 3. 查看已完成的模块
ls -la src/features/visualizer/hooks/
ls -la src/features/visualizer/components/panels/

# 4. 开始提取下一个组件
# 从 JointNode 开始...
```

---

## 联系点

- **原始讨论**: 询问如何拆分 Visualizer.tsx
- **分支**: ifan/modular_visualizer
- **测试命令**: `npm run dev`
- **检查原文件**: 1577 行，需要拆分到 ~200 行

**目标**: 保持功能完全一致，但代码更模块化、可维护性更强。
