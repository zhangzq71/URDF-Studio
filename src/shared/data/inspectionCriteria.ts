export interface InspectionItem {
  id: string
  name: string
  nameZh: string
  description: string
  descriptionZh: string
  maxScore: number
}

export interface InspectionCategory {
  id: string
  name: string
  nameZh: string
  weight: number
  items: InspectionItem[]
}

export type IssueType = 'error' | 'warning' | 'suggestion' | 'pass'

export const INSPECTION_CRITERIA: InspectionCategory[] = [
  {
    id: 'spec',
    name: 'URDF Spec Compliance',
    nameZh: 'URDF 规范合规',
    weight: 0.20,
    items: [
      {
        id: 'robot_root_contract',
        name: 'Robot Root Contract',
        nameZh: '机器人根节点契约',
        description:
          'Check that the document has a valid <robot> root with a stable name and only uses top-level elements compatible with the intended URDF consumer.',
        descriptionZh:
          '检查文档是否具有合法的 <robot> 根节点、稳定的 name，并且顶层元素与目标 URDF 消费方兼容。',
        maxScore: 10
      },
      {
        id: 'link_joint_required_fields',
        name: 'Link/Joint Required Fields',
        nameZh: 'Link/Joint 必填字段',
        description:
          'Check that every link and joint has required names, and every joint defines valid parent/child link references.',
        descriptionZh:
          '检查每个 link 和 joint 是否具备必需名称，以及每个 joint 是否定义了有效的 parent/child link 引用。',
        maxScore: 10
      },
      {
        id: 'topology_tree_constraint',
        name: 'Tree Topology Constraint',
        nameZh: '树拓扑约束',
        description:
          'Check that the robot remains a single-root tree with no orphan links, duplicate child ownership, or closed-loop structures in core URDF.',
        descriptionZh:
          '检查机器人是否保持单根树结构，不存在孤立 link、重复 child 归属或核心 URDF 不支持的闭环结构。',
        maxScore: 10
      },
      {
        id: 'joint_semantics',
        name: 'Joint Semantic Rules',
        nameZh: '关节语义规则',
        description:
          'Check type-specific rules for axis, limits, mimic, calibration, and other joint tags so they match URDF semantics instead of relying on consumer-specific guesswork.',
        descriptionZh:
          '检查 axis、limit、mimic、calibration 等关节标签是否符合对应关节类型的 URDF 语义，而不是依赖消费方猜测。',
        maxScore: 10
      },
      {
        id: 'extension_compatibility',
        name: 'Extension Compatibility',
        nameZh: '扩展兼容性',
        description:
          'Review transmission, gazebo, sensor, and custom tags, and flag when extension usage is undocumented, consumer-specific, or likely unsupported downstream.',
        descriptionZh:
          '审查 transmission、gazebo、sensor 以及自定义标签；若扩展用法未文档化、强依赖特定消费方或下游大概率不支持，则给出提示。',
        maxScore: 10
      }
    ]
  },
  {
    id: 'physical',
    name: 'Physical Plausibility',
    nameZh: '物理合理性',
    weight: 0.25,
    items: [
      {
        id: 'mass_check',
        name: 'Mass Validation',
        nameZh: '质量验证',
        description: 'Check that all dynamic links have mass > 0',
        descriptionZh: '检查所有动态链接的质量是否大于0',
        maxScore: 10
      },
      {
        id: 'inertia_diagonal',
        name: 'Inertia Diagonal Elements',
        nameZh: '惯性矩阵对角元素',
        description: 'Check that diagonal elements (ixx, iyy, izz) are all > 0',
        descriptionZh: '检查惯性矩阵对角元素 (ixx, iyy, izz) 是否都大于0',
        maxScore: 10
      },
      {
        id: 'inertia_triangle',
        name: 'Inertia Triangle Inequality',
        nameZh: '惯性矩阵三角不等式',
        description: 'Check triangle inequality: ixx + iyy > izz, ixx + izz > iyy, iyy + izz > ixx',
        descriptionZh: '检查三角不等式：ixx + iyy > izz, ixx + izz > iyy, iyy + izz > ixx',
        maxScore: 10
      },
      {
        id: 'center_of_mass',
        name: 'Center of Mass',
        nameZh: '质心位置',
        description: 'Check if center of mass is reasonably positioned relative to geometry',
        descriptionZh: '检查质心位置是否相对于几何形状合理',
        maxScore: 10
      }
    ]
  },
  {
    id: 'kinematics',
    name: 'Kinematics',
    nameZh: '运动学',
    weight: 0.25,
    items: [
      {
        id: 'axis_zero',
        name: 'Zero Axis Vector',
        nameZh: '零轴向量',
        description: 'Check for revolute/continuous/prismatic joints with axis vector [0,0,0]',
        descriptionZh: '检查旋转/连续/滑动关节的轴向量是否为[0,0,0]',
        maxScore: 10
      },
      {
        id: 'orphan_links',
        name: 'Orphan Links',
        nameZh: '孤立链接',
        description: 'Check for floating links not connected via joints (except root)',
        descriptionZh: '检查未通过关节连接的浮动链接（根链接除外）',
        maxScore: 10
      },
      {
        id: 'joint_connectivity',
        name: 'Joint Connectivity',
        nameZh: '关节连通性',
        description: 'Verify all joints properly connect parent and child links',
        descriptionZh: '验证所有关节是否正确连接父链接和子链接',
        maxScore: 10
      },
      {
        id: 'frame_alignment',
        name: 'Frame Alignment',
        nameZh: '坐标系对齐',
        description:
          'Check whether joint origins and local frames stay coherent along the kinematic chain. For MJCF-derived robots, use resolved joint transforms together with site/tendon evidence instead of expecting standalone frame links.',
        descriptionZh:
          '检查关节原点和局部坐标系是否沿运动链保持一致。对于 MJCF 派生机器人，应结合解析后的 joint 变换与 site/tendon 证据判断，而不是要求存在独立的 frame 链接。',
        maxScore: 10
      },
      {
        id: 'joint_limits',
        name: 'Joint Limits',
        nameZh: '关节限位',
        description: 'Check if joint limits are reasonable (lower < upper, reasonable ranges)',
        descriptionZh: '检查关节限位是否合理（下限 < 上限，范围合理）',
        maxScore: 10
      }
    ]
  },
  {
    id: 'naming',
    name: 'Naming Conventions',
    nameZh: '命名规范',
    weight: 0.10,
    items: [
      {
        id: 'duplicate_names',
        name: 'Duplicate Names',
        nameZh: '重复名称',
        description: 'Check for duplicate user-friendly names in joints or links',
        descriptionZh: '检查关节或链接中是否存在重复的用户友好名称',
        maxScore: 10
      },
      {
        id: 'naming_consistency',
        name: 'Naming Consistency',
        nameZh: '命名一致性',
        description: 'Check if naming follows consistent convention (snake_case vs camelCase)',
        descriptionZh: '检查命名是否遵循一致的约定（snake_case vs camelCase）',
        maxScore: 10
      },
      {
        id: 'descriptive_names',
        name: 'Descriptive Names',
        nameZh: '描述性名称',
        description: 'Check if names are descriptive and meaningful',
        descriptionZh: '检查名称是否具有描述性和意义',
        maxScore: 10
      }
    ]
  },
  {
    id: 'symmetry',
    name: 'Symmetry',
    nameZh: '对称性',
    weight: 0.10,
    items: [
      {
        id: 'left_right_pairs',
        name: 'Left/Right Pairs',
        nameZh: '左右配对',
        description: 'Identify and check Left/Right pairs (e.g., L_leg vs R_leg)',
        descriptionZh: '识别并检查左右配对（例如：L_leg vs R_leg）',
        maxScore: 10
      },
      {
        id: 'symmetry_properties',
        name: 'Symmetric Properties',
        nameZh: '对称属性',
        description: 'Check if symmetric pairs have similar physical properties (mass, inertia, dimensions)',
        descriptionZh: '检查对称配对是否具有相似的物理属性（质量、惯性、尺寸）',
        maxScore: 10
      }
    ]
  },
  {
    id: 'hardware',
    name: 'Hardware Configuration',
    nameZh: '硬件配置',
    weight: 0.10,
    items: [
      {
        id: 'motor_selection',
        name: 'Motor Selection',
        nameZh: '电机选择',
        description: 'Check if motor types are appropriate for joint requirements',
        descriptionZh: '检查电机类型是否适合关节要求',
        maxScore: 10
      },
      {
        id: 'motor_limits',
        name: 'Motor Limits',
        nameZh: '电机限位',
        description: 'Verify motor effort and velocity limits match joint requirements',
        descriptionZh: '验证电机力矩和速度限位是否匹配关节要求',
        maxScore: 10
      },
      {
        id: 'armature_config',
        name: 'Armature Configuration',
        nameZh: '电枢配置',
        description: 'Check if armature values are reasonable',
        descriptionZh: '检查电枢值是否合理',
        maxScore: 10
      }
    ]
  }
]

export function calculateItemScore(type: IssueType, hasIssue: boolean): number {
  if (!hasIssue) return 10

  switch (type) {
    case 'error':
      return Math.floor(Math.random() * 4)
    case 'warning':
      return 4 + Math.floor(Math.random() * 3)
    case 'suggestion':
      return 7 + Math.floor(Math.random() * 3)
    case 'pass':
      return 10
    default:
      return 5
  }
}

export function calculateCategoryScore(itemScores: number[]): number {
  if (itemScores.length === 0) return 0
  const sum = itemScores.reduce((a, b) => a + b, 0)
  return sum / itemScores.length
}

export function calculateOverallScore(
  categoryScores: Record<string, number>,
  itemScores?: number[]
): number {
  if (itemScores && itemScores.length > 0) {
    return itemScores.reduce((sum, score) => sum + score, 0)
  }

  let total = 0
  let totalWeight = 0

  INSPECTION_CRITERIA.forEach(category => {
    const score = categoryScores[category.id] || 0
    total += score * category.weight
    totalWeight += category.weight
  })

  return totalWeight > 0 ? total / totalWeight : 0
}

export function getInspectionItem(
  categoryId: string,
  itemId: string
): InspectionItem | undefined {
  const category = INSPECTION_CRITERIA.find(c => c.id === categoryId)
  return category?.items.find(item => item.id === itemId)
}

export function getInspectionCategory(
  categoryId: string
): InspectionCategory | undefined {
  return INSPECTION_CRITERIA.find(c => c.id === categoryId)
}
