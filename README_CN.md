<div align="center">

# URDF Studio
[![React](https://img.shields.io/badge/React-19.2-blue?logo=react)](https://reactjs.org/)
[![Three.js](https://img.shields.io/badge/Three.js-0.181-black?logo=three.js)](https://threejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6.2-purple?logo=vite)](https://vitejs.dev/)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

**下一代可视化机器人设计平台**

**在线体验：** [urdf.d-robotics.cc](https://urdf.d-robotics.cc/)

[English](./README.md) | [中文](./README_CN.md)

</div>

---

## 📖 项目概述

**URDF Studio** 是一款先进的 Web 端可视化机器人设计环境，专为简化 URDF（Unified Robot Description Format）模型的创建、编辑与导出而开发。它将繁琐的 XML 代码编写抽象为直观的图形化交互，让机器人工程师能够专注于运动学设计、几何细节打磨以及硬件参数配置。

平台集成了 **生成式 AI** 技术，用于快速原型生成和自动化模型审计，确保您的设计符合物理逻辑，并能无缝接入 MuJoCo 等工业级仿真环境。

## ✨ 核心特性

### 🦴 多维设计模式
*   **骨架模式 (Skeleton)**：构建运动学链条，定义连杆（Link）与关节（Joint）的拓扑关系。
*   **细节模式 (Detail)**：精细化编辑视觉与碰撞几何体，支持基础几何体及高精度网格（STL/OBJ/DAE）导入。
*   **硬件模式 (Hardware)**：配置机电参数、执行器选型及传动比。
*   **多机器人组装**：支持将多个 URDF 模型合并为一个整体（例如：将灵巧手安装到机械臂末端），自动处理关节父子关系。
*   **精准碰撞体编辑**：独立编辑碰撞几何体（Collision Geometry），确保物理仿真的准确性。

### 🎨 沉浸式 3D 工作区
*   **高保真渲染**：基于 Three.js 提供增强的 PBR 材质与逼真视觉体验。
*   **直观操控**：采用工业标准变换控件（Gizmos），实现精确的空间操作。
*   **可视化分析**：实时显示关节轴、质心（CoM）及惯量张量。
*   **性能优化**：支持碰撞体参数的局部实时更新，无需全局重新加载，提供极速的编辑反馈。

### 🤖 AI 增强工程
*   **自然语言生成**：通过自然语言描述直接生成或修改机器人结构。
*   **AI 审阅 (Inspector)**：自动化 6 大维度质量评估（物理合理性、运动学、命名规范等），生成详细评分及 PDF 报告。

### 📥 互操作性与导出
*   **项目导入**：支持加载包含 URDF 和网格资产的 ZIP 归档。
*   **一键导出**：生成生产级资源包，包含标准 URDF、整合后的网格文件、BOM 清单（CSV）及 MuJoCo 仿真 XML。

## 📚 文档与教程

通过以下步骤指南快速掌握 URDF Studio：

1.  **[快速入门](./docs/tutorials/zh/01_getting_started.md)**：在 URDF Studio 的最初 5 分钟。
2.  **[设计模式详解](./docs/tutorials/zh/02_design_modes.md)**：深入了解骨架、细节和硬件模式。
3.  **[AI 助手与审阅](./docs/tutorials/zh/03_ai_features.md)**：利用 AI 加速您的设计工作流。

---

## 🚀 安装指南

### 环境要求
*   [Node.js](https://nodejs.org/) (v18 或更高版本)
*   npm 或 yarn

### 本地部署
1.  **克隆项目**
    ```bash
    git clone https://github.com/OpenLegged/URDF-Studio.git
    cd URDF-Studio
    ```
2.  **安装依赖**
    ```bash
    npm install
    ```
3.  **配置 AI 接口 (可选)**
    在根目录创建 `.env.local` 文件：
    ```env
    VITE_OPENAI_API_KEY=your_api_key
    VITE_OPENAI_BASE_URL=https://api.openai.com/v1
    VITE_OPENAI_MODEL=deepseek-v3
    ```
4.  **启动开发服务器**
    ```bash
    npm run dev
    ```
    在浏览器中访问 `http://localhost:5173`。

## 📝 使用方法

1.  **构建拓扑**：在**骨架模式**下，通过树状视图添加子连杆，并使用 3D 控件调整关节位置。
2.  **定义物理属性**：在**细节模式**下，为连杆指定网格模型或基础形状，并在属性面板中调整质量与惯量参数。
3.  **选型硬件**：在**硬件模式**下，为关节分配内置电机库（如 Unitree、RobStride 系列）中的执行器。
4.  **模型审计**：使用 **AI 审阅** 功能对模型进行全面检查，根据评分和改进建议优化设计。
5.  **导出交付**：点击 **导出** 按钮下载完整的项目压缩包，即可直接用于 ROS 开发或物理仿真。

## 🤝 贡献指南

我们欢迎任何形式的贡献！
1.  **Fork** 本仓库。
2.  **创建功能分支** (`git checkout -b feature/amazing-feature`)。
3.  **提交更改** (`git commit -m 'Add some amazing feature'`)。
4.  **推送到分支** (`git push origin feature/amazing-feature`)。
5.  **发起 Pull Request**。

请确保您的代码符合项目的 TypeScript 和 React 开发规范。

## 📄 许可证信息

本项目采用 **Apache License 2.0** 许可证。详情请参阅 [LICENSE](LICENSE) 文件。

---

## 致谢
感谢 [地瓜机器人 (D-Robotics)](https://developer.d-robotics.cc/) 的技术支持。

[![Star History Chart](https://api.star-history.com/svg?repos=OpenLegged/URDF-Studio&type=date&legend=top-left)](https://www.star-history.com/#OpenLegged/URDF-Studio&type=date&legend=top-left)