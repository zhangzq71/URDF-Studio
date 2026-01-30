# Design Modes Deep Dive

URDF Studio provides three specialized modes covering different stages of robot design.

## 1. Skeleton Mode
**Goal**: Establish the robot's topological structure.
- **Add Link**: Click the `+` button in the tree view.
- **Adjust Joint**:
    - Moving the joint position changes the offset of the child link relative to the parent.
    - Modify joint types (Fixed, Revolute, Continuous, Prismatic) in the property panel.

## 2. Detail Mode
**Goal**: Define the robot's physical appearance and collision manifolds.
- **Visual Model**: Set colors or upload STL/OBJ/DAE meshes.
- **Collision Model**:
    - **Optimization**: It is recommended to use primitive geometries (Box, Cylinder) as collision bodies instead of directly copying visual meshes.
    - **Local Reloading**: Modifying collision parameters triggers a partial scene refresh for instant feedback.
- **Inertial Properties**: Set Mass and Inertia matrices for each link.

## 3. Hardware Mode
**Goal**: Configure electromechanical specifications.
- **Motor Library**: Select actuators from built-in brands like Unitree and RobStride.
- **Auto-Sync**: The system automatically fills Effort and Velocity limits based on motor specs.
- **Joint Limits**: Adjust the angular rotation range based on the mechanical structure.
