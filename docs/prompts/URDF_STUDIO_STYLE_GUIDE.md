# URDF Studio Style Guide

> 目标：将 URDF Studio 的界面风格统一为动态语义色、暗色分层、可访问对比度策略。

## 1. 适用场景

- 需要新增或重构 UI 组件
- 需要调整 Light / Dark / System 三种外观
- 需要统一全局颜色与交互状态颜色（hover / active / focus）
- 需要提升可读性与对比度（尤其小字号与边界线）

## 2. 核心原则（必须遵守）

1. 使用语义色，不使用散落硬编码色值。
2. 所有组件必须在 `light + dark + prefers-contrast: more` 下可读。
3. 相同语义只使用一套颜色策略（例如主操作色不可混用多套蓝色）。
4. 暗色界面使用层级分离（base / surface / elevated），避免大面积纯黑硬切。
5. 不仅靠颜色传达状态，必须辅以图标、文本或形状差异。

## 3. 项目 Token 入口

- 全局语义 token：`src/styles/index.css`
- 主题切换逻辑：`src/store/uiStore.ts`
- 系统主题监听：`src/app/hooks/useAppEffects.ts`

## 4. 当前语义色映射（项目约定）

- `app-bg`：页面底色（light/dark）
- `panel-bg`：主面板底色
- `element-bg`：次级容器底色
- `element-hover`：悬浮层级色
- `border-black`：语义边框色（并非纯黑）
- `text-primary`：主文本
- `text-secondary`：次文本
- `text-tertiary`：弱化文本
- `system-blue`：主强调色（文本、图标、可交互态）
- `system-blue-solid`：实底主按钮色
- `slider-accent`：`#0088FF`，仅用于 Slider/进度线等线性高亮

## 4.1 蓝色使用范围（强约束）

1. `#0088FF` 只用于线性高亮：
   - Slider 已选中轨道
   - 进度条已完成段
   - 细线型选中指示（非文本承载）
2. `#0088FF` 禁止用于：
   - 主按钮实底（尤其白字按钮）
   - 小字号正文/链接文本
   - 大面积背景填充
3. 语义映射要求：
   - 线性高亮 -> `slider-accent`
   - 主按钮底色 -> `system-blue-solid`
   - 普通强调文本/图标 -> `system-blue`

## 5. 基础组件改造顺序

1. `Button`
2. `Input` / `Select`
3. `Switch` / `Checkbox` / `Slider`
4. `SegmentedControl`
5. `Dialog` / `Card` / `Label` / `Separator`
6. 页面级容器（Header、Modal、Panel）

## 6. 代码实施规范

- 优先使用 `bg-*`, `text-*`, `border-*` 的语义类，不直接写 `#RRGGBB`
- Focus 态必须可见，建议统一 `ring-system-blue/30`
- 小字号（`text-xs` 及以下）避免低对比文本颜色
- 暗色边界不要使用纯黑边框；使用语义边框 token

## 7. 验收清单

- [ ] Light / Dark 切换后布局与层级仍清晰
- [ ] 主要文本可读，弱文本不过淡
- [ ] 主按钮、输入框、分段控件视觉一致
- [ ] Hover / Active / Focus 行为一致且可感知
- [ ] 未新增分散硬编码色值

## 8. 回归检查建议

```bash
# 检查 hard-coded hex（逐步收敛）
rg -n "#[0-9A-Fa-f]{3,8}" src

# 检查 #0088FF 是否只出现在 Slider/Token 定义
rg -n "#0088FF|#0088ff" src | rg -v "Slider.tsx|styles/index.css"

# 构建检查
npm run build
```
