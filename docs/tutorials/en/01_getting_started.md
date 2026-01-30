# Getting Started Guide

Welcome to **URDF Studio**! This guide will walk you through the process of designing your first robot from scratch.

## 1. Core Workflow Preview
Designing a robot typically follows this sequence:
1. **Build Skeleton**: Define the hierarchical structure in `Skeleton` mode.
2. **Refine Geometry**: Add visual models and collision bodies in `Detail` mode.
3. **Configure Hardware**: Select motors and actuators in `Hardware` mode.
4. **AI Inspection**: Check for physical plausibility and naming conventions.
5. **Export**: Generate a simulation-ready package.

## 2. Interface Layout
- **Left Panel**: Robot Tree, manages parent-child relationships between Links and Joints.
- **Center Area**: 3D Viewport, supports real-time transformation via Gizmos.
- **Right Panel**: Property Editor, used to adjust specific numerical parameters.
- **Top Bar**: Switch modes, access AI tools, and perform import/export operations.

## 3. Basic Operations
- **Translate/Rotate**: Click a component in the 3D view and use the arrows/rings to drag it.
- **Focus**: Click a node in the tree view to automatically center the view on that component.
- **Undo/Redo**: Use keyboard shortcuts `Ctrl+Z` / `Ctrl+Y`.
