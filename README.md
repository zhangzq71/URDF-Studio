<div align="center">

# URDF Studio
[![React](https://img.shields.io/badge/React-19.2-blue?logo=react)](https://reactjs.org/)
[![Three.js](https://img.shields.io/badge/Three.js-0.181-black?logo=three.js)](https://threejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6.2-purple?logo=vite)](https://vitejs.dev/)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

**Next-Generation Visual Robot Design Platform**

**Live demo:** [urdf.d-robotics.cc](https://urdf.d-robotics.cc/)

[English](./README.md) | [中文](./README_CN.md)

</div>

---

## 📖 Project Overview

**URDF Studio** is a powerful, web-based visual environment designed for creating, editing, and exporting Unified Robot Description Format (URDF) models. It abstracts complex XML authoring into an intuitive graphical interface, allowing roboticists to focus on kinematic design, geometric detailing, and hardware specification.

The platform integrates **Generative AI** for rapid prototyping and automated model auditing, ensuring your designs are physically plausible and simulation-ready for environments like MuJoCo.

## ✨ Key Features

### 🦴 Advanced Design Modalities
*   **Skeleton Mode**: Build kinematic chains (Links & Joints) and define topological relationships.
*   **Detail Mode**: Fine-tune visual and collision geometries using primitives or high-resolution mesh imports (STL/OBJ/DAE).
*   **Hardware Mode**: Specify electromechanical parameters, motor selection, and transmission ratios.
*   **Multi-Robot Assembly**: Merge multiple URDFs into a single model (e.g., attaching a robotic hand to an arm) with automatic joint re-parenting.
*   **Precision Collision Editor**: Edit collision bodies independently from visual geometry for accurate physics simulation.

### 🎨 Immersive 3D Workspace
*   **High-Fidelity Rendering**: PBR materials and photorealistic rendering via Three.js.
*   **Intuitive Controls**: Industry-standard transformation gizmos for precise manipulation.
*   **Visual Analytics**: Real-time visualization of joint axes, center of mass (CoM), and inertia tensors.
*   **Optimized Performance**: Features specialized partial reloading for collision body updates, ensuring instant feedback during fine-tuning.

### 🤖 AI-Augmented Engineering
*   **Generative AI**: Create robot structures using natural language prompts.
*   **AI Inspector**: Automated 6-category quality assessment (Physical Plausibility, Kinematics, Naming, etc.) with detailed scoring and PDF reports.

### 📥 Interoperability & Export
*   **Import**: Load existing projects via ZIP (URDF + meshes).
*   **Export**: Production-ready packages including URDF, consolidated meshes, BOM (CSV), and MuJoCo XML.

## 📚 Documentation & Tutorials

Learn how to master URDF Studio with our step-by-step guides:

1.  **[Getting Started](./docs/tutorials/en/01_getting_started.md)**: Your first 5 minutes in URDF Studio.
2.  **[Design Modes](./docs/tutorials/en/02_design_modes.md)**: Deep dive into Skeleton, Detail, and Hardware modes.
3.  **[AI Assistant & Inspector](./docs/tutorials/en/03_ai_features.md)**: Leveraging AI to speed up your design workflow.

---

## 🚀 Installation Guide

### Prerequisites
*   [Node.js](https://nodejs.org/) (v18 or higher)
*   npm or yarn

### Setup
1.  **Clone the Repository**
    ```bash
    git clone https://github.com/OpenLegged/URDF-Studio.git
    cd URDF-Studio
    ```
2.  **Install Dependencies**
    ```bash
    npm install
    ```
3.  **Configure Environment (Optional for AI)**
    Create a `.env.local` file:
    ```env
    VITE_OPENAI_API_KEY=your_api_key
    VITE_OPENAI_BASE_URL=https://api.openai.com/v1
    VITE_OPENAI_MODEL=deepseek-v3
    ```
4.  **Start Development Server**
    ```bash
    npm run dev
    ```
    Visit `http://localhost:5173` in your browser.

## 📝 Usage Instructions

1.  **Kinematic Setup**: Use the **Skeleton Mode** to add links and joints. Use the tree view to manage the robot hierarchy.
2.  **Geometry & Physics**: Switch to **Detail Mode** to assign STL/OBJ meshes or primitive shapes to your links. You can adjust mass and inertia properties in the Property Editor.
3.  **Actuator Selection**: In **Hardware Mode**, select joints to assign motors from the built-in library (Unitree, RobStride, etc.).
4.  **Verification**: Use the **AI Inspector** to run a comprehensive check on your model. Review the scores and suggestions before exporting.
5.  **Exporting**: Use the **Export** button to download a complete ZIP package compatible with ROS and MuJoCo.

## 🤝 Contribution Guidelines

We welcome contributions! To contribute:
1.  **Fork** the repository.
2.  **Create a Feature Branch** (`git checkout -b feature/amazing-feature`).
3.  **Commit Your Changes** (`git commit -m 'Add some amazing feature'`).
4.  **Push to the Branch** (`git push origin feature/amazing-feature`).
5.  **Open a Pull Request**.

Please ensure your code adheres to the project's TypeScript and React conventions.

## 📄 License

This project is licensed under the **Apache License 2.0**. See the [LICENSE](LICENSE) file for details.

---

## Acknowledgments
Supported by [D-Robotics](https://developer.d-robotics.cc/).

[![Star History Chart](https://api.star-history.com/svg?repos=OpenLegged/URDF-Studio&type=date&legend=top-left)](https://www.star-history.com/#OpenLegged/URDF-Studio&type=date&legend=top-left)