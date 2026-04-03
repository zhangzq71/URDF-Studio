URDF 机器人检查标准 (详细版)

本文档详细说明了 URDF 机器人检查系统的评估标准。所有检查项均采用 10分制，最终结果基于已选项目的得分累加百分比。

评分体系说明 (Scoring Model)

当前总分 (Current Total): $Score_{total} = \sum ItemScore_i$

理论最高分 (Max Possible): $Score_{max} = n \times 10$ (n 为勾选项目数)

最终达成率 (Achievement Rate): $Rate = (Score_{total} / Score_{max}) \times 100\%$

0. URDF 规范合规 (URDF Spec Compliance)

章节ID: spec
章节权重: 0.20

0.1 机器人根节点契约 (Robot Root Contract)

项目ID: robot_root_contract

判定标准:

文档必须具有唯一的 `<robot>` 根节点，并带有稳定的 `name`。

顶层子元素应与目标消费方兼容：核心 URDF（`link`、`joint`、`material`）以及被明确说明的扩展（`transmission`、`gazebo`、`sensor`、自定义标签）。

得分参考: 根节点缺失/非法计 0 分；未说明的扩展混用计 4-6 分。

0.2 Link / Joint 必填字段 (Link / Joint Required Fields)

项目ID: link_joint_required_fields

判定标准:

每个 `link` 都必须有唯一 `name`。

每个 `joint` 都必须有 `name`、`type`、`<parent link="...">` 与 `<child link="...">`。

parent/child 引用必须指向真实存在的 link。

得分参考: 必填字段缺失或引用断裂计 0-3 分。

0.3 树拓扑约束 (Tree Topology Constraint)

项目ID: topology_tree_constraint

判定标准:

核心 URDF 模型是树，不是一般图结构。

应当只有一个逻辑根节点，不允许存在孤立 link，也不应直接在核心 URDF 语义中编码闭环，除非闭环由下游工具在 URDF 之外额外表达。

得分参考: 多根、断裂子图或直接用普通 URDF 编码闭环计 0-2 分。

0.4 关节语义规则 (Joint Semantic Rules)

项目ID: joint_semantics

判定标准:

axis、limit、mimic、calibration 与安全相关标签必须符合对应关节类型的语义。

`continuous` 关节不应依赖位置上下界。

`mimic` 的目标关节必须存在，且关系应是明确、有意图的。

得分参考: 与类型冲突的标签或自相矛盾的关节语义计 2-5 分。

0.5 扩展兼容性 (Extension Compatibility)

项目ID: extension_compatibility

判定标准:

`transmission`、`gazebo`、`sensor` 以及自定义标签属于扩展面，不是所有消费方都支持的核心 URDF。

需要审查文件是否说明了目标消费方，以及这些扩展在不支持的环境中是可忽略的，还是实际上依赖它们才能正确工作。

得分参考: 存在隐藏的消费方依赖，或必须扩展却没有说明，计 3-6 分。

1. 物理合理性 (Physical Plausibility)

章节ID: physical
章节权重: 0.20

1.1 质量与惯性有效性 (Mass & Inertia)

项目ID: mass_inertia_basic

判定标准:

所有 Link 质量必须 $>0$。

惯性矩阵对角线元素 $(ixx, iyy, izz)$ 必须全部 $>0$。

必须满足三角不等式：$ixx + iyy > izz, ixx + izz > iyy, iyy + izz > ixx$。

得分参考: 存在 0 或负值计 0 分；不满足不等式计 2-4 分。

1.2 惯性分布与体积匹配 (Inertia-Visual Match)

项目ID: inertia_overlap

判定标准:

在仿真器（如 MuJoCo）中，惯性块的大小应与 Link 本身的体积大致相当。

惯性块位置应与几何形状高度重叠，姿态反映质量分布主轴。

得分参考: 惯性块严重偏移或大小极其不成比例计 4 分。

1.3 左右对称一致性 (Symmetry)

项目ID: symmetry_check

判定标准:

身体两侧对称 Link 的质量、惯性张量、质心位置应保持严格对称（误差 $<1\%$）。

惯性坐标系的姿态也需满足镜像对称。

得分参考: 两侧参数偏差明显计 6 分。

2. 坐标系位置与朝向 (Link Frames)

章节ID: frames
章节权重: 0.15

2.1 关节原点共线关系 (Joint Collinearity)

项目ID: frame_alignment

判定标准:

机器人处于标准站立姿态时，四肢关节原点应构成共线关系。

矢状面：关节连线接近一条从上到下的贯穿线。

冠状面：双腿/双臂原点连线应构成四条相互平行的垂直线。

调整手段：通过将坐标系从法兰盘移至电机转轴中心来实现。

得分参考: 原点分布杂乱、未考虑电机转轴对齐计 5 分。

2.2 坐标系朝向公约 (Axis Convention)

项目ID: axis_convention

判定标准:

统一公约：Z轴向上，Y轴向左，X轴向前。

特殊关节（如斜向 hip pitch）：Z轴垂直于法兰平面，Y轴符合右手定则，X轴保持向前。

旋转面与地面不平行的关节（如部分 hip yaw）：仍需强制 X 朝前，Z 朝上。

得分参考: 轴向不统一计 3 分。

2.3 腰部中心与等长对齐 (Waist Centering)

项目ID: waist_check

判定标准: 腰部关节 (waist) 必须位于几何中心，确保左右侧肢体到腰部原点的距离完全等长。

得分参考: 偏置或非对称中心计 5 分。

3. 装配逻辑合理性 (Assembly Logic)

章节ID: assembly
章节权重: 0.10

3.1 驱动器质量归属 (Actuator Attribution)

项目ID: motor_placement

判定标准:

若驱动电机物理安装在上级 Link 内部，其质量和惯性必须计入上级 Link。

例如：大腿内部的位移电机质量应计入大腿 Link。

得分参考: 电机归属 Link 错误计 4 分。

3.2 传动与连杆归属 (Linkage Attribution)

项目ID: linkage_placement

判定标准:

驱动连杆及传动件应划归到其实际驱动的子级 Link 中。

脚部驱动连杆归属于 Foot Link，而非小腿。

得分参考: 传动件质量分配混乱计 6 分。

4. 运动学与仿真属性 (Kinematics & Simulation)

章节ID: simulation
章节权重: 0.15

4.1 树状结构验证 (Topology)

项目ID: tree_connectivity

判定标准: 必须单一根节点（如 base_link），不允许存在闭环或孤立 Link。

得分参考: 逻辑结构错误计 0 分。

4.2 关节限位合理性 (Joint Limits)

项目ID: joint_limits

判定标准: lower < upper；限位值需与电机规格及机械硬限位匹配。

得分参考: 限位反向计 0 分；未定义限位计 5 分。

4.3 碰撞体优化 (Collision)

项目ID: collision_simplify

判定标准: 碰撞模型必须简化（使用 Box/Cylinder 等），禁止直接复制高精度 Visual Mesh。

得分参考: 未简化计 5 分。

5. 硬件参数配置 (Hardware)

章节ID: hardware
章节权重: 0.10

5.1 电机力矩与速度限位 (Motor Specs)

项目ID: motor_limits

判定标准: effort 和 velocity 限位值需符合选型电机的额定/峰值参数。

得分参考: 参数缺失计 6 分。

5.2 电枢/转子惯量 (Armature Config)

项目ID: armature_config

判定标准: 是否配置了反映电机转子和减速比等效惯量的 armature 值（特别是对小质量高减速比机器人）。

得分参考: 缺失计 7 分。

6. 命名规范 (Naming)

章节ID: naming
章节权重: 0.10

6.1 唯一性与描述性

项目ID: naming_standard

判定标准:

名称全局唯一，具有语义化（如 L_hip_pitch_link）。

遵循 snake_case 风格。

得分参考: 重名计 0 分；风格不统一计 8 分。
