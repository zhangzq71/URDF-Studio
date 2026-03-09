# `read_mjcf.py`

一个简洁的 MJCF 读取与校验脚本，基于 MuJoCo 官方 Python API：
- 读取 `MJCF/XML` 文件
- 编译模型并输出摘要信息
- 导出 `body` 树结构 JSON
- 导出更完整的结构化 JSON，便于和 TS 解析结果做对比

## 运行方式

只使用 `uv` 运行，避免系统里多个 Python 解释器带来的环境混乱。
脚本顶部已经包含 `uv` 可识别的依赖声明。

```bash
uv run scripts/read_mjcf.py <path-to-mjcf>
```

## 常用命令

### 1. 文本摘要

```bash
uv run scripts/read_mjcf.py public/library/urdf/unitree/h1_description/mjcf/h1.xml
```

### 2. 摘要 JSON

```bash
uv run scripts/read_mjcf.py public/library/urdf/unitree/h1_description/mjcf/h1.xml --json --output h1.summary.json
```

### 3. 树结构 JSON

```bash
uv run scripts/read_mjcf.py public/library/urdf/unitree/h1_description/mjcf/h1.xml --tree-json --output h1.tree.json
```

### 4. 完整导出 JSON

```bash
uv run scripts/read_mjcf.py public/library/urdf/unitree/h1_description/mjcf/h1.xml --full-json --output h1.full.json
```

### 5. 导出解析后的 XML

```bash
uv run scripts/read_mjcf.py public/library/urdf/unitree/h1_description/mjcf/h1.xml --dump-xml resolved.xml
```

## 输出模式

- 默认输出：文本摘要，适合快速查看模型规模
- `--json`：摘要 JSON，适合冒烟对比
- `--tree-json`：只看 `worldbody/body/frame` 树及其挂载对象
- `--full-json`：树结构 + 平铺对象表，适合做详细 diff

## 推荐校验流程

如果你要拿它校验 TS 解析器，建议按这个顺序：

1. 先比 `--json` 的 `counts/spec_counts/samples`
2. 再比 `--tree-json` 的父子层级
3. 最后比 `--full-json` 的 `name/parent/path/attrs`

## 说明

这个脚本更适合作为 **MuJoCo 语义层** 的参考输出，
不适合作为原始 XML 文本结构或注释顺序的精确标准。
