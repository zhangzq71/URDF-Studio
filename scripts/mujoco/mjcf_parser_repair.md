# MJCF Parser Repair Workflow

你现在在 `URDF-Studio` 仓库中工作。

你的目标是：

**对比验证某个 MJCF 文件在 TS 侧的解析正确性，并在发现差异后，按最小改动原则修复解析问题。**

这份文档是后续给 AI 直接使用的标准工作流。只要用户说：

- “查看文档 `docs/prompts/mjcf_parser_repair.md`”
- “对比验证 `<某个 MJCF 文件>` 的 TS 解析正确性”
- “并修复问题”

就应该严格按这里的流程执行，而不是自由发挥。

---

## 1. 任务目标

对于任意一个 MJCF 文件，建立并执行下面这条闭环：

1. 用 TS 侧逻辑解析 MJCF
2. 用 MuJoCo 官方 Python API 生成 oracle
3. 把两边都转换成统一的 canonical snapshot
4. 输出结构化 diff
5. 按 diff 类型定向修复 TS 解析逻辑
6. 修复后重新运行同一 case
7. 确认 diff 数量下降，直到当前 case 通过或明确剩余问题

重点是：

- 不做人眼大 JSON 漫游
- 不做原始 XML 文本 diff
- 不依赖前端页面点击验证
- 只用可重复执行的 headless 脚本验证

---

## 2. 必须使用的文件

本流程围绕这些文件执行：

- `scripts/read_mjcf.py`
- `scripts/mjcf_compare.ts`
- `src/core/parsers/mjcf/mjcfSourceResolver.ts`
- `src/core/parsers/mjcf/mjcfModel.ts`
- `src/core/parsers/mjcf/mjcfParser.ts`
- `src/core/parsers/mjcf/mjcfLoader.ts`
- `src/core/parsers/mjcf/mjcfSnapshot.ts`

如果修复 MJCF 解析问题，优先检查这些入口，不要先改 UI。

---

## 3. 标准验证原则

### 3.1 TS 侧验证目标

至少验证下面 3 层：

1. `resolveMJCFSource(...)`
2. `parseMJCF(...)`
3. `loadMJCFToThreeJS(...)` 的 smoke test（可选，但推荐在修复后跑一次）

### 3.2 Python 侧 oracle

Python oracle 只能使用：

```bash
uv run --with mujoco --script scripts/read_mjcf.py <mjcf-file> --full-json --output <oracle-json>
```

不要改成系统 Python，不要换别的脚本。

### 3.3 diff 方式

必须使用语义 diff。

不要做：

- 原始 XML 文本 diff
- 两份 JSON 的字符串 diff
- 只凭日志猜哪里错了

---

## 4. 标准执行步骤

对任意 case，必须按这个顺序执行。

### 第一步：确定 case 文件

确认用户给出的 MJCF 文件路径，例如：

```text
E:\codes\mujoco_menagerie\flybody\fruitfly.xml
```

### 第二步：生成 Python oracle

运行：

```bash
uv run --with mujoco --script scripts/read_mjcf.py <mjcf-file> --full-json --output .tmp/mjcf-compare/<case>.oracle.json
```

示例：

```bash
uv run --with mujoco --script scripts/read_mjcf.py E:\codes\mujoco_menagerie\flybody\fruitfly.xml --full-json --output .tmp/mjcf-compare/fruitfly.oracle.json
```

### 第三步：运行 TS compare 脚本

运行：

```bash
npm run mjcf:compare -- <mjcf-file> --oracle-json .tmp/mjcf-compare/<case>.oracle.json --output .tmp/<case>.compare.json
```

示例：

```bash
npm run mjcf:compare -- E:\codes\mujoco_menagerie\flybody\fruitfly.xml --oracle-json .tmp/mjcf-compare/fruitfly.oracle.json --output .tmp/fruitfly.compare.json
```

### 第四步：读取 diff 结果

重点查看：

- `diffCount`
- `diffSummary`
- `diffs`

如果 `diffCount = 0`，说明当前 case 在 TS 语义层已通过。

### 第五步：按 diff 类型修复

不要同时修很多类问题。

每次只选一类主要问题修复，例如：

- `SOURCE_RESOLUTION_MISMATCH`
- `BODY_MISSING`
- `BODY_PARENT_MISMATCH`
- `JOINT_MISSING`
- `JOINT_TYPE_MISMATCH`
- `JOINT_AXIS_MISMATCH`
- `JOINT_RANGE_MISMATCH`
- `GEOM_MISSING`
- `GEOM_TYPE_MISMATCH`
- `GEOM_BODY_MISMATCH`
- `GEOM_SIZE_MISMATCH`
- `MESH_PATH_MISMATCH`
- `COUNT_MISMATCH`

### 第六步：重新运行同一 case

修复后必须立刻重新执行：

1. oracle 生成（如已有可复用文件，可直接复用）
2. compare 脚本
3. 查看新的 `diffCount` 与 `diffSummary`

### 第七步：必要时跑 smoke load

如果解析层修复已经完成，建议再跑一次 loader smoke test：

```bash
npm run mjcf:compare -- <mjcf-file> --oracle-json .tmp/mjcf-compare/<case>.oracle.json --smoke-load --output .tmp/<case>.smoke.compare.json
```

这一步主要检查 `loadMJCFToThreeJS(...)` 是否还能正常构建层级。

---

## 5. 当前 compare 脚本的职责

`scripts/mjcf_compare.ts` 负责完成以下工作：

1. 扫描 case 所在目录下的 MJCF/XML 文件
2. 调用 `resolveMJCFSource(...)`
3. 调用 `parseMJCF(...)`
4. 调用 `parseMJCFModel(...)`
5. 读取 oracle JSON
6. 将 TS 结果与 oracle 结果转成 canonical snapshot
7. 输出结构化 diff JSON

因此后续 AI 不需要再重新发明一套 compare 逻辑，应该优先复用这条链路。

---

## 6. 修复时的硬性要求

### 6.1 小步迭代

每次只修一类主要错误，然后马上回归。

### 6.2 优先修根因

优先修：

- 共享解析模型的错误
- `childclass` / `default class` 继承错误
- `<freejoint>` / `<joint>` / `<geom>` 直接子节点解析错误
- 稳定主键问题
- mesh 路径归一化问题

不要优先修：

- UI 展示问题
- 面板文案问题
- 非 MJCF 主链路问题

### 6.3 主键必须稳定

不允许使用随机名称做 diff 主键。

必须遵守：

1. 有 `name` 时优先用 `name`
2. 无 `name` 时使用稳定路径键
3. 不允许用 `Date.now()`、`Math.random()` 作为快照主键

### 6.4 允许存在的 compare 归一化

为了减少无意义 diff，允许在 snapshot 层做归一化，例如：

- MuJoCo enum 名称转成统一小写类型名
- mesh 文件路径去掉目录前缀，只比文件名
- 尾随 `0` 的尺寸裁剪
- `NaN` 转 `null`

注意：

这些归一化只允许发生在“测试快照层”。
不要把业务语义偷偷改坏。

---

## 7. AI 执行时的输出要求

每轮修复完成后，必须明确输出：

1. 本轮验证的 case 是什么
2. compare 命令是什么
3. 修复前 `diffCount` 是多少
4. 修复后 `diffCount` 是多少
5. 本轮修复了哪一类问题
6. 还剩哪些差异类型
7. 下一步建议修哪一类问题

不要只说“我修好了”。
必须给出机器可复跑的结果依据。

---

## 8. 推荐的 AI 任务模板

以后用户可以直接这样下指令：

### 模板 A：验证并修复单个 MJCF case

```text
查看 docs/prompts/mjcf_parser_repair.md，
对比验证 <MJCF文件路径> 的 MJCF 解析在 TS 脚本上的正确性，
必要时修复问题。

要求：
1. 先生成 oracle
2. 再运行 compare
3. 输出 diffSummary
4. 只修一类主要问题
5. 修复后重新 compare
6. 汇报 diffCount 的变化
```

### 模板 B：只做验证，不改代码

```text
查看 docs/prompts/mjcf_parser_repair.md，
只对比验证 <MJCF文件路径> 的 TS 解析正确性，
不要修改代码。

要求输出：
1. compare 命令
2. diffSummary
3. 最主要的 3 类差异
4. 你认为最值得优先修复的根因
```

### 模板 C：继续上一次修复

```text
继续按照 docs/prompts/mjcf_parser_repair.md 的流程，
对 <MJCF文件路径> 继续修复剩余差异。

要求：
1. 先读取上一次的 compare 输出
2. 选剩余 diff 中数量最多的一类
3. 做最小修复
4. 重新 compare
5. 汇报剩余 diffSummary
```

---

## 9. 推荐的最小命令清单

### 生成 oracle

```bash
uv run --with mujoco --script scripts/read_mjcf.py <mjcf-file> --full-json --output .tmp/mjcf-compare/<case>.oracle.json
```

### 运行 compare

```bash
npm run mjcf:compare -- <mjcf-file> --oracle-json .tmp/mjcf-compare/<case>.oracle.json --output .tmp/<case>.compare.json
```

### 运行 compare + smoke load

```bash
npm run mjcf:compare -- <mjcf-file> --oracle-json .tmp/mjcf-compare/<case>.oracle.json --smoke-load --output .tmp/<case>.smoke.compare.json
```

---

## 10. 成功标准

对于当前修复轮次，至少满足以下条件之一：

### 理想完成

- `diffCount = 0`

### 或者阶段性完成

- compare 链路可执行
- 输出了结构化 diff
- 修复了一类真实解析问题
- 修复后 `diffCount` 明显下降
- 结果可复跑

---

## 11. 失败时的处理方式

如果没能完成，必须明确说明是哪一层失败：

- oracle 失败
- source resolution 失败
- TS parse 失败
- canonical snapshot 构建失败
- diff 逻辑不稳定
- smoke load 失败

并说明下一步最小可行修复方案。

不要只说“失败了”。

---

## 12. 一句话总结

后续所有 MJCF 解析修复任务，都应该先跑：

**oracle -> compare -> 看 diff -> 修一类问题 -> 重新 compare**

不要跳过 compare，不要跳过回归，不要先改 UI。
