import { Box, Globe, User, Wrench } from 'lucide-react';
import { translations } from '@/shared/i18n';
import type {
  GalleryCategory,
  GalleryCategoryId,
  ModelTranslation,
  RecommendedMode,
  RobotCategory,
  RobotModel,
} from '../types';

type LocalizedFallbackCopy = {
  overview: { en: string; zh: string };
  highlights: { en: string[]; zh: string[] };
  bestFor: { en: string[]; zh: string[] };
  assetBundle: { en: string[]; zh: string[] };
};

export const CATEGORIES: GalleryCategory[] = [
  { id: 'all', icon: Box },
  { id: 'Quadruped', icon: Box },
  { id: 'Manipulator', icon: Wrench },
  { id: 'Humanoid', icon: User },
  { id: 'Mobile', icon: Globe },
];

// Closed-source builds can ship without the bundled sample robot library.
export const ROBOT_MODELS: RobotModel[] = [];

const CATEGORY_COPY: Record<RobotCategory, LocalizedFallbackCopy> = {
  Quadruped: {
    overview: {
      en: 'This category is aimed at full-body legged platforms and is especially useful for reviewing topology, symmetry, and full-package import behavior.',
      zh: '这个分类面向完整的四足平台，适合查看运动链拓扑、对称结构以及整包导入后的表现。',
    },
    highlights: {
      en: [
        'Full-body locomotion hierarchy',
        'Good for structure and collision sanity checks',
        'Fits showcase-style gallery previews well',
      ],
      zh: [
        '完整的四足运动链层级',
        '适合做结构与碰撞快速检查',
        '非常适合做广场型展示预览',
      ],
    },
    bestFor: {
      en: [
        'Legged robotics demos',
        'Joint-tree inspection',
        'Quick import and preview loops',
      ],
      zh: [
        '四足机器人演示',
        '关节树检查',
        '快速导入与预览循环',
      ],
    },
    assetBundle: {
      en: [
        'URDF entry package',
        'Mesh resources for visuals and collisions',
        'Launch, config, or xacro support depending on the model',
      ],
      zh: [
        'URDF 入口包',
        '视觉与碰撞所需的网格资源',
        '根据模型提供 launch、config 或 xacro 支持',
      ],
    },
  },
  Humanoid: {
    overview: {
      en: 'Humanoid packages are better suited for larger kinematic trees, denser body structures, and workflows that benefit from richer detail and review contexts.',
      zh: '人形机器人更适合展示更大的运动学树、更密集的身体结构，以及需要更丰富审阅上下文的工作流。',
    },
    highlights: {
      en: [
        'Large multi-joint hierarchy',
        'Useful for rich review and inspection scenarios',
        'Works well across all three editor modes',
      ],
      zh: [
        '大规模多关节层级',
        '适合复杂审阅与检查场景',
        '在三种编辑模式下都很有代表性',
      ],
    },
    bestFor: {
      en: [
        'Humanoid structure audits',
        'Detailed package comparisons',
        'AI-assisted model review examples',
      ],
      zh: [
        '人形结构审查',
        '复杂模型包对比',
        'AI 审阅示例',
      ],
    },
    assetBundle: {
      en: [
        'Preferred URDF entry file when available',
        'Mesh resources for body parts and accessories',
        'Supporting launch or documentation assets in some packages',
      ],
      zh: [
        '优先入口 URDF 文件（若存在）',
        '身体部件与附件所需的网格资源',
        '部分包附带 launch 或文档资源',
      ],
    },
  },
  Manipulator: {
    overview: {
      en: 'Manipulator packages focus on arm-chain editing, compact package inspection, and integration-friendly asset layouts for assemblies and hardware studies.',
      zh: '机械臂包更聚焦于臂链编辑、紧凑资源包检查，以及适合组装与硬件研究的资产布局。',
    },
    highlights: {
      en: [
        'Arm-centric hierarchy',
        'Compact and easy to inspect',
        'Helpful for end-effector integration studies',
      ],
      zh: [
        '以机械臂为核心的层级结构',
        '包体紧凑，便于检查',
        '适合做末端执行器集成研究',
      ],
    },
    bestFor: {
      en: [
        'Manipulator configuration work',
        'Assembly-level integration',
        'Focused geometry and hardware tuning',
      ],
      zh: [
        '机械臂配置工作',
        '组装级集成',
        '聚焦几何与硬件调参',
      ],
    },
    assetBundle: {
      en: [
        'URDF or xacro arm entry file',
        'Visual and collision mesh set',
        'Lightweight package for focused imports',
      ],
      zh: [
        'URDF 或 xacro 机械臂入口文件',
        '视觉与碰撞网格集合',
        '适合精简导入的轻量资源包',
      ],
    },
  },
  Mobile: {
    overview: {
      en: 'Mobile-platform packages help compare non-standard mobility systems and are useful when showcasing hybrid or wheel-legged structures in the gallery.',
      zh: '移动平台包适合对比非标准移动机构，也很适合在广场里展示轮足混合等移动结构。',
    },
    highlights: {
      en: [
        'Hybrid mobility structure',
        'Good for comparing wheel and leg integration',
        'Useful for package diversity in the gallery',
      ],
      zh: [
        '混合移动结构',
        '适合对比轮系与腿系集成',
        '可以提升广场内容多样性',
      ],
    },
    bestFor: {
      en: [
        'Hybrid mobility demos',
        'Alternative drive-train layouts',
        'Comparing platform-level structures',
      ],
      zh: [
        '混合移动演示',
        '差异化驱动方案展示',
        '平台级结构对比',
      ],
    },
    assetBundle: {
      en: [
        'URDF mobile-platform entry file',
        'Wheel, leg, and base mesh assets',
        'Model package suited for comparison-oriented imports',
      ],
      zh: [
        '移动平台 URDF 入口文件',
        '轮系、腿部与底座网格资源',
        '适合做对比导入的模型包',
      ],
    },
  },
};

export const MODEL_TRANSLATIONS: Record<string, ModelTranslation> = {
  go2: {
    nameZh: 'Unitree Go2 四足机器人',
    descriptionZh: '高性能四足机器人，适用于科研与展示场景。',
    overviewZh: 'Go2 是一个很适合作为 URDF 广场首页样板的四足模型，既适合做运动链编辑，也适合做几何检查与硬件参数演示。',
    tagsZh: ['科研', '四足', '移动'],
    highlightsZh: ['拓扑、几何、硬件三种模式都适合', '整包导入路径清晰', '适合做展示级预览'],
    bestForZh: ['四足结构学习', '导入流程演示', '机器人广场精选展示'],
  },
  go1: {
    nameZh: 'Unitree Go1 四足机器人',
    descriptionZh: '更偏教育与入门使用的四足机器人模型。',
    overviewZh: 'Go1 更适合作为入门级广场模型，适合教学、首次导入和轻量级结构浏览。',
    tagsZh: ['教育', '四足', '入门'],
  },
  g1: {
    nameZh: 'Unitree G1 人形机器人',
    descriptionZh: '通用型人形机器人，适合教育与科研。',
    overviewZh: 'G1 具备更复杂的人形层级结构，并提供带手部的优先入口文件，适合展示更完整的模型详情页。',
    tagsZh: ['人形', '双足', '科研'],
    highlightsZh: ['复杂的人形运动学结构', '带手部的优先 URDF 入口', '适合详情页深度展示'],
  },
  h1: {
    nameZh: 'Unitree H1 人形机器人',
    descriptionZh: '面向高级研究场景的高性能人形机器人。',
    overviewZh: 'H1 适合用于更高复杂度的人形编辑与审阅场景，能够很好体现广场详情页的层次化信息结构。',
    tagsZh: ['人形', '高性能', '科研'],
  },
  h1_2: {
    nameZh: 'Unitree H1 2.0 人形机器人',
    descriptionZh: '第二代高性能人形机器人模型。',
    overviewZh: 'H1 2.0 更适合作为“新一代模型”的展示案例，用于强调模型描述、资源包信息与相关推荐。',
    tagsZh: ['人形', '双足', '新一代'],
  },
  a1: {
    nameZh: 'Unitree A1 四足机器人',
    descriptionZh: '敏捷型四足机器人，适合动态运动研究。',
    overviewZh: 'A1 是一个轻量而灵活的四足模型，适合在广场中展示结构与几何两侧的快速浏览体验。',
    tagsZh: ['科研', '四足', '敏捷'],
  },
  b1: {
    nameZh: 'Unitree B1 四足机器人',
    descriptionZh: '工业巡检取向的四足机器人。',
    overviewZh: 'B1 更偏工业应用展示，适合用来丰富广场中“工业 / 巡检”这一类描述与标签维度。',
    tagsZh: ['工业', '四足', '巡检'],
  },
  b2: {
    nameZh: 'Unitree B2 四足机器人',
    descriptionZh: '新一代工业四足机器人。',
    overviewZh: 'B2 适合作为工业级四足案例，能够体现详情页里“资源包内容 + 适用场景 + 推荐模式”的信息组织。',
    tagsZh: ['工业', '四足', '巡检'],
  },
  aliengo: {
    nameZh: 'Unitree Aliengo 四足机器人',
    descriptionZh: '通用型中型四足机器人。',
    overviewZh: 'Aliengo 处于教育与工业之间，适合用来承接“相关推荐”与“同类模型切换”的体验。',
    tagsZh: ['科研', '四足', '通用'],
  },
  z1: {
    nameZh: 'Unitree Z1 机械臂',
    descriptionZh: '适合机械臂编辑与集成研究的紧凑型模型包。',
    overviewZh: 'Z1 为广场补上了真正可用的机械臂分类入口，适合在详情页里展示机械臂描述、入口文件与资源包结构。',
    tagsZh: ['机械臂', '臂链', '集成'],
    assetBundleZh: ['xacro 目录内的机械臂入口 URDF', '完整的视觉与碰撞网格资源', '适合单独导入或参与组装'],
  },
  go2w: {
    nameZh: 'Unitree Go2-W 轮足机器人',
    descriptionZh: '用于混合移动结构对比的轮足机器人模型。',
    overviewZh: 'Go2-W 可以作为移动平台分类的代表模型，用于展示轮足混合结构的描述与资源详情。',
    tagsZh: ['移动平台', '轮足', '混合驱动'],
  },
  b2w: {
    nameZh: 'Unitree B2-W 轮足机器人',
    descriptionZh: '偏工业场景的轮足移动机器人模型。',
    overviewZh: 'B2-W 适合作为工业移动平台案例，用来展示详情页里的分类切换与同类相关推荐。',
    tagsZh: ['移动平台', '工业', '轮足'],
  },
};

export const getCategoryName = (
  categoryId: GalleryCategoryId,
  t: typeof translations.en,
) => {
  switch (categoryId) {
    case 'all':
      return t.allModels;
    case 'Quadruped':
      return t.quadruped;
    case 'Manipulator':
      return t.manipulators;
    case 'Humanoid':
      return t.humanoids;
    case 'Mobile':
      return t.mobileBases;
    default:
      return categoryId;
  }
};

export const getLocalizedModelContent = (
  model: RobotModel,
  lang: 'en' | 'zh',
) => {
  const translation = MODEL_TRANSLATIONS[model.id];
  const fallbackCopy = CATEGORY_COPY[model.category];

  return {
    name: lang === 'zh' ? translation?.nameZh ?? model.name : model.name,
    description: lang === 'zh' ? translation?.descriptionZh ?? model.description : model.description,
    overview: lang === 'zh'
      ? translation?.overviewZh ?? fallbackCopy.overview.zh
      : model.overview ?? fallbackCopy.overview.en,
    tags: lang === 'zh' ? translation?.tagsZh ?? model.tags : model.tags,
    highlights: lang === 'zh'
      ? translation?.highlightsZh ?? model.highlights ?? fallbackCopy.highlights.zh
      : model.highlights ?? fallbackCopy.highlights.en,
    bestFor: lang === 'zh'
      ? translation?.bestForZh ?? model.bestFor ?? fallbackCopy.bestFor.zh
      : model.bestFor ?? fallbackCopy.bestFor.en,
    assetBundle: lang === 'zh'
      ? translation?.assetBundleZh ?? model.assetBundle ?? fallbackCopy.assetBundle.zh
      : model.assetBundle ?? fallbackCopy.assetBundle.en,
  };
};

export const getRecommendedModeLabels = (
  modes: RecommendedMode[],
  t: typeof translations.en,
) => modes.map((mode) => {
  switch (mode) {
    case 'skeleton':
      return t.skeleton;
    case 'detail':
      return t.detail;
    case 'hardware':
      return t.hardware;
    default:
      return mode;
  }
});
