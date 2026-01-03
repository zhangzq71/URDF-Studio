/**
 * URDF 机器人评估标准配置
 * 定义评估章节、检查条目和评分标准
 */

export interface InspectionItem {
  id: string;
  name: string;
  description: string;
  maxScore: number; // 满分，默认 10
}

export interface InspectionCategory {
  id: string;
  name: string;
  nameZh: string;
  weight: number; // 权重（0-1），用于计算总分
  items: InspectionItem[];
}

export const INSPECTION_CRITERIA: InspectionCategory[] = [
  {
    id: 'physical',
    name: 'Physical Plausibility',
    nameZh: '物理合理性',
    weight: 0.30,
    items: [
      {
        id: 'mass_check',
        name: 'Mass Validation',
        description: 'Check that all dynamic links have mass > 0',
        maxScore: 10
      },
      {
        id: 'inertia_diagonal',
        name: 'Inertia Diagonal Elements',
        description: 'Check that diagonal elements (ixx, iyy, izz) are all > 0',
        maxScore: 10
      },
      {
        id: 'inertia_triangle',
        name: 'Inertia Triangle Inequality',
        description: 'Check triangle inequality: ixx + iyy > izz, ixx + izz > iyy, iyy + izz > ixx',
        maxScore: 10
      },
      {
        id: 'center_of_mass',
        name: 'Center of Mass',
        description: 'Check if center of mass is reasonably positioned relative to geometry',
        maxScore: 10
      }
    ]
  },
  {
    id: 'kinematics',
    name: 'Kinematics',
    nameZh: '运动学',
    weight: 0.30,
    items: [
      {
        id: 'axis_zero',
        name: 'Zero Axis Vector',
        description: 'Check for revolute/continuous/prismatic joints with axis vector [0,0,0]',
        maxScore: 10
      },
      {
        id: 'orphan_links',
        name: 'Orphan Links',
        description: 'Check for floating links not connected via joints (except root)',
        maxScore: 10
      },
      {
        id: 'joint_connectivity',
        name: 'Joint Connectivity',
        description: 'Verify all joints properly connect parent and child links',
        maxScore: 10
      },
      {
        id: 'joint_limits',
        name: 'Joint Limits',
        description: 'Check if joint limits are reasonable (lower < upper, reasonable ranges)',
        maxScore: 10
      }
    ]
  },
  {
    id: 'naming',
    name: 'Naming Conventions',
    nameZh: '命名规范',
    weight: 0.15,
    items: [
      {
        id: 'duplicate_names',
        name: 'Duplicate Names',
        description: 'Check for duplicate user-friendly names in joints or links',
        maxScore: 10
      },
      {
        id: 'naming_consistency',
        name: 'Naming Consistency',
        description: 'Check if naming follows consistent convention (snake_case vs camelCase)',
        maxScore: 10
      },
      {
        id: 'descriptive_names',
        name: 'Descriptive Names',
        description: 'Check if names are descriptive and meaningful',
        maxScore: 10
      }
    ]
  },
  {
    id: 'symmetry',
    name: 'Symmetry',
    nameZh: '对称性',
    weight: 0.15,
    items: [
      {
        id: 'left_right_pairs',
        name: 'Left/Right Pairs',
        description: 'Identify and check Left/Right pairs (e.g., L_leg vs R_leg)',
        maxScore: 10
      },
      {
        id: 'symmetry_properties',
        name: 'Symmetric Properties',
        description: 'Check if symmetric pairs have similar physical properties (mass, inertia, dimensions)',
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
        description: 'Check if motor types are appropriate for joint requirements',
        maxScore: 10
      },
      {
        id: 'motor_limits',
        name: 'Motor Limits',
        description: 'Verify motor effort and velocity limits match joint requirements',
        maxScore: 10
      },
      {
        id: 'armature_config',
        name: 'Armature Configuration',
        description: 'Check if armature values are reasonable',
        maxScore: 10
      }
    ]
  }
];

/**
 * 根据检查结果类型计算得分
 * @param type 问题类型
 * @param hasIssue 是否存在问题
 * @returns 得分 (0-10)
 */
export function calculateItemScore(type: 'error' | 'warning' | 'suggestion' | 'pass', hasIssue: boolean): number {
  if (!hasIssue) return 10; // 通过检查
  
  switch (type) {
    case 'error':
      return Math.floor(Math.random() * 4); // 0-3 分
    case 'warning':
      return 4 + Math.floor(Math.random() * 3); // 4-6 分
    case 'suggestion':
      return 7 + Math.floor(Math.random() * 3); // 7-9 分
    case 'pass':
      return 10;
    default:
      return 5;
  }
}

/**
 * 计算章节得分（该章节下所有条目得分的平均值）
 */
export function calculateCategoryScore(itemScores: number[]): number {
  if (itemScores.length === 0) return 0;
  const sum = itemScores.reduce((a, b) => a + b, 0);
  return sum / itemScores.length;
}

/**
 * 计算总分（各章节得分的加权平均）
 */
export function calculateOverallScore(categoryScores: Record<string, number>): number {
  let total = 0;
  let totalWeight = 0;
  
  INSPECTION_CRITERIA.forEach(category => {
    const score = categoryScores[category.id] || 0;
    total += score * category.weight;
    totalWeight += category.weight;
  });
  
  return totalWeight > 0 ? total / totalWeight : 0;
}

/**
 * 根据 ID 获取检查条目
 */
export function getInspectionItem(categoryId: string, itemId: string): InspectionItem | undefined {
  const category = INSPECTION_CRITERIA.find(c => c.id === categoryId);
  return category?.items.find(item => item.id === itemId);
}

/**
 * 根据 ID 获取章节
 */
export function getInspectionCategory(categoryId: string): InspectionCategory | undefined {
  return INSPECTION_CRITERIA.find(c => c.id === categoryId);
}

