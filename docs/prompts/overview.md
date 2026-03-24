# AI Prompt 系统概览

这里只做跳转，不再复述规则。

## 默认读取

1. 先读仓库根目录 `AGENTS.md`
2. 再读 `docs/prompts/CLAUDE.md`
3. 只在需要文件锚点时再看：
   - `docs/prompts/URDF_STUDIO_STYLE_GUIDE.md`
   - `docs/prompts/visualizer.md`
   - `docs/prompts/urdf-viewer.md`
4. AI 审阅标准直接读取：
   - `src/features/ai-assistant/config/urdf_inspect_standard_en.md`
   - `src/features/ai-assistant/config/urdf_inspect_stantard_zh.md`
5. 若文档与当前 `src/` 结构冲突，以 `AGENTS.md` 和真实源码为准
