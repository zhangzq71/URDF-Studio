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

export const ROBOT_MODELS: RobotModel[] = [
  {
    id: 'go2',
    name: 'Unitree Go2',
    author: 'Unitree Robotics',
    description: 'High-performance quadruped robot for research and entertainment.',
    overview: 'A compact all-round quadruped package that works well as a starting point for motion-chain editing, geometry inspection, and hardware parameter experiments inside URDF Studio.',
    thumbnail: '/library/urdf/unitree/go2_description/urdf/Normal_collision_model.png',
    category: 'Quadruped',
    stars: 1250,
    downloads: 3200,
    tags: ['Research', 'Quadruped', 'Mobile'],
    lastUpdated: '2026-01-17',
    urdfPath: '/library/urdf/unitree/go2_description',
    sourceType: 'server',
    recommendedModes: ['skeleton', 'detail', 'hardware'],
    highlights: [
      'Balanced package for topology editing and visual verification',
      'Suitable for quick iteration with full-body locomotion layouts',
      'Good reference robot for educational demos and workspace imports',
    ],
    bestFor: [
      'Legged robot structure studies',
      'Previewing full URDF import flows',
      'Rapid demonstrations inside the gallery',
    ],
  },
  {
    id: 'go1',
    name: 'Unitree Go1',
    author: 'Unitree Robotics',
    description: 'Consumer-grade quadruped robot for education and beginner research.',
    overview: 'Go1 is a beginner-friendly quadruped entry with approachable asset packaging, making it useful for classroom demos, onboarding, and first-time library imports.',
    thumbnail: '',
    category: 'Quadruped',
    stars: 980,
    downloads: 2100,
    tags: ['Education', 'Quadruped', 'Beginner'],
    lastUpdated: '2026-01-15',
    urdfPath: '/library/urdf/unitree/go1_description',
    sourceType: 'server',
    recommendedModes: ['skeleton', 'detail', 'hardware'],
    bestFor: [
      'Onboarding to URDF Studio',
      'Teaching basic joint hierarchy concepts',
      'Building lightweight demo assemblies',
    ],
  },
  {
    id: 'g1',
    name: 'Unitree G1',
    author: 'Unitree Robotics',
    description: 'General-purpose humanoid robot for education and research.',
    overview: 'G1 is a full-body humanoid package with a richer joint tree and a hand-enabled entry file, ideal for validating larger hierarchies and more complex review flows.',
    thumbnail: '/library/urdf/unitree/g1_description/thumbnail.png',
    category: 'Humanoid',
    stars: 2100,
    downloads: 4500,
    tags: ['Humanoid', 'Bipedal', 'Research'],
    lastUpdated: '2026-01-17',
    urdfPath: '/library/urdf/unitree/g1_description',
    urdfFile: 'g1_29dof_with_hand.urdf',
    sourceType: 'server',
    recommendedModes: ['skeleton', 'detail', 'hardware'],
    highlights: [
      'Good reference for dense humanoid kinematic trees',
      'Includes a preferred hand-enabled URDF entry file',
      'Useful when reviewing larger model structures in one package',
    ],
  },
  {
    id: 'h1',
    name: 'Unitree H1',
    author: 'Unitree Robotics',
    description: 'High-performance humanoid robot for advanced research.',
    overview: 'H1 targets more advanced humanoid workflows and is well suited for evaluating how detailed body packages behave across geometry, hierarchy, and hardware editing modes.',
    thumbnail: '/library/urdf/unitree/h1_description/thumbnail.png',
    category: 'Humanoid',
    stars: 1800,
    downloads: 3800,
    tags: ['Humanoid', 'High-Performance', 'Research'],
    lastUpdated: '2026-01-16',
    urdfPath: '/library/urdf/unitree/h1_description',
    sourceType: 'server',
    recommendedModes: ['skeleton', 'detail', 'hardware'],
  },
  {
    id: 'h1_2',
    name: 'Unitree H1 2.0',
    author: 'Unitree Robotics',
    description: 'Second generation high-performance humanoid robot.',
    overview: 'The second-generation H1 package is a solid choice when you want a modern humanoid example with updated assets and a polished import experience for review sessions.',
    thumbnail: '/library/urdf/unitree/h1_2_description/thumbnail.png',
    category: 'Humanoid',
    stars: 1500,
    downloads: 2800,
    tags: ['Humanoid', 'Bipedal', 'Next-Gen'],
    lastUpdated: '2026-01-18',
    urdfPath: '/library/urdf/unitree/h1_2_description',
    sourceType: 'server',
    recommendedModes: ['skeleton', 'detail', 'hardware'],
  },
  {
    id: 'a1',
    name: 'Unitree A1',
    author: 'Unitree Robotics',
    description: 'Agile quadruped robot for dynamic motion research.',
    overview: 'A1 offers a compact quadruped structure that is convenient for comparing locomotion-oriented packages and inspecting lightweight geometry sets inside the detail mode.',
    thumbnail: '/library/urdf/unitree/a1_description/meshes/trunk_A1.png',
    category: 'Quadruped',
    stars: 1100,
    downloads: 2500,
    tags: ['Research', 'Quadruped', 'Agile'],
    lastUpdated: '2026-01-14',
    urdfPath: '/library/urdf/unitree/a1_description',
    sourceType: 'server',
    recommendedModes: ['skeleton', 'detail', 'hardware'],
  },
  {
    id: 'b1',
    name: 'Unitree B1',
    author: 'Unitree Robotics',
    description: 'Industrial-grade quadruped robot for inspection tasks.',
    overview: 'B1 is better suited for industrial demo stories where you want a stronger inspection-oriented robot package and a more utilitarian model presentation.',
    thumbnail: '',
    category: 'Quadruped',
    stars: 750,
    downloads: 1800,
    tags: ['Industrial', 'Quadruped', 'Inspection'],
    lastUpdated: '2026-01-12',
    urdfPath: '/library/urdf/unitree/b1_description',
    sourceType: 'server',
    recommendedModes: ['skeleton', 'detail', 'hardware'],
  },
  {
    id: 'b2',
    name: 'Unitree B2',
    author: 'Unitree Robotics',
    description: 'Next-generation industrial quadruped robot.',
    overview: 'B2 provides a more modern industrial quadruped package for validation workflows that need a robust body layout, richer assets, and a clear import path.',
    thumbnail: '/library/urdf/unitree/b2_description_mujoco/Screenshot from 2023-12-11 21-44-55.png',
    category: 'Quadruped',
    stars: 890,
    downloads: 2000,
    tags: ['Industrial', 'Quadruped', 'Inspection'],
    lastUpdated: '2026-01-13',
    urdfPath: '/library/urdf/unitree/b2_description',
    sourceType: 'server',
    recommendedModes: ['skeleton', 'detail', 'hardware'],
  },
  {
    id: 'aliengo',
    name: 'Unitree Aliengo',
    author: 'Unitree Robotics',
    description: 'Medium-sized quadruped robot for various applications.',
    overview: 'Aliengo sits nicely between educational and industrial packages, making it useful when you want a flexible quadruped reference for multiple editing scenarios.',
    thumbnail: '/library/urdf/unitree/aliengo_description/meshes/trunk_uv_base_final.png',
    category: 'Quadruped',
    stars: 650,
    downloads: 1500,
    tags: ['Research', 'Quadruped', 'General'],
    lastUpdated: '2026-01-10',
    urdfPath: '/library/urdf/unitree/aliengo_description',
    sourceType: 'server',
    recommendedModes: ['skeleton', 'detail', 'hardware'],
  },
  {
    id: 'z1',
    name: 'Unitree Z1',
    author: 'Unitree Robotics',
    description: 'Compact manipulator package for arm-centric editing and integration studies.',
    overview: 'Z1 gives the gallery a true manipulator category entry and works well for testing arm-only hierarchies, geometry tuning, and focused hardware configurations.',
    thumbnail: '',
    category: 'Manipulator',
    stars: 920,
    downloads: 1900,
    tags: ['Manipulator', 'Arm', 'Integration'],
    lastUpdated: '2026-01-11',
    urdfPath: '/library/urdf/unitree/z1_description',
    urdfFile: 'xacro/z1.urdf',
    sourceType: 'server',
    recommendedModes: ['skeleton', 'detail', 'hardware'],
    assetBundle: [
      'URDF arm entry file inside the xacro folder',
      'Visual and collision meshes for the full arm chain',
      'Compact package for standalone or assembly-driven use',
    ],
  },
  {
    id: 'go2w',
    name: 'Unitree Go2-W',
    author: 'Unitree Robotics',
    description: 'Wheel-legged mobile robot package for hybrid mobility workflows.',
    overview: 'Go2-W expands the mobile category with a wheel-legged package that is useful when you want to compare hybrid locomotion structures against standard quadrupeds.',
    thumbnail: '',
    category: 'Mobile',
    stars: 860,
    downloads: 1760,
    tags: ['Mobile', 'Wheel-Legged', 'Hybrid'],
    lastUpdated: '2026-01-19',
    urdfPath: '/library/urdf/unitree/go2w_description',
    urdfFile: 'urdf/go2w_description.urdf',
    sourceType: 'server',
    recommendedModes: ['skeleton', 'detail', 'hardware'],
  },
  {
    id: 'b2w',
    name: 'Unitree B2-W',
    author: 'Unitree Robotics',
    description: 'Industrial wheel-legged mobile robot for terrain and inspection demos.',
    overview: 'B2-W is a good mobile-platform reference when you need an industrial package that bridges legged articulation and wheeled deployment in one model bundle.',
    thumbnail: '',
    category: 'Mobile',
    stars: 780,
    downloads: 1620,
    tags: ['Mobile', 'Industrial', 'Wheel-Legged'],
    lastUpdated: '2026-01-20',
    urdfPath: '/library/urdf/unitree/b2w_description',
    urdfFile: 'urdf/b2w_description.urdf',
    sourceType: 'server',
    recommendedModes: ['skeleton', 'detail', 'hardware'],
  },
];

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
