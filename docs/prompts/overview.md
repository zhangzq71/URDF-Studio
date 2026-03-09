# AI Prompt 系统概述

本文件已瘦身为入口页，避免与其他 prompt 重复。

## 推荐读取顺序

1. 先读 `docs/prompts/CLAUDE.md`
2. 按任务跳转：
   - UI / 主题 / 可访问性 -> `CLAUDE.md` 第 6 节
   - `Visualizer` -> `CLAUDE.md` 第 7 节
   - `URDF Viewer` -> `CLAUDE.md` 第 8 节
3. AI 审阅标准直接读取：
   - `src/features/ai-assistant/config/urdf_inspect_standard_en.md`
   - `src/features/ai-assistant/config/urdf_inspect_stantard_zh.md`

## Prompt 编写建议

- 具体化：写清 `Link` / `Joint` 名称
- 结构化：描述父子连接关系
- 物理约束：涉及电机时补充力矩 / 传动范围
