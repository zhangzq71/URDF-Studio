URDF Robot Inspection Standard (Detailed Version)

This document provides detailed specifications for the URDF robot inspection system evaluation criteria. All inspection items use a 10-point scoring system, with the final result based on the cumulative percentage of scores from selected items.

Scoring System Description

Current Total Score: $Score_{total} = \sum ItemScore_i$

Theoretical Maximum Score: $Score_{max} = n \times 10$ (where n is the number of selected items)

Final Achievement Rate: $Rate = (Score_{total} / Score_{max}) \times 100\%$

1. Physical Plausibility

Category ID: physical

1.1 Mass & Inertia Validity

Item ID: mass_inertia_basic

Criteria:

All Link masses must be $>0$.

All diagonal elements of the inertia matrix $(ixx, iyy, izz)$ must be $>0$.

Must satisfy triangle inequality: $ixx + iyy > izz, ixx + izz > iyy, iyy + izz > ixx$.

Scoring Reference: 0 or negative values score 0 points; inequality violations score 2-4 points.

1.2 Inertia-Visual Match

Item ID: inertia_overlap

Criteria:

In simulators (e.g., MuJoCo), the inertia block size should roughly match the Link's own volume.

The inertia block position should highly overlap with the geometry, and its orientation should reflect the principal axes of mass distribution.

Scoring Reference: Severe offset or extremely disproportionate size of inertia block scores 4 points.

1.3 Symmetry Consistency

Item ID: symmetry_check

Criteria:

Symmetric Links on both sides of the body should maintain strict symmetry in mass, inertia tensor, and center of mass position (error $<1\%$).

The orientation of the inertia coordinate system should also satisfy mirror symmetry.

Scoring Reference: Obvious deviation in parameters between both sides scores 6 points.

2. Link Frames (Coordinate System Position & Orientation)

Category ID: frames

2.1 Joint Collinearity

Item ID: frame_alignment

Criteria:

When the robot is in standard standing posture, the joint origins of the limbs should form collinear relationships.

Sagittal plane: Joint connections should form a nearly vertical line from top to bottom.

Coronal plane: Origin connections of both legs/arms should form four mutually parallel vertical lines.

Adjustment method: Achieved by moving the coordinate system from the flange to the motor rotation axis center.

Scoring Reference: Chaotic origin distribution or failure to consider motor axis alignment scores 5 points.

2.2 Axis Convention

Item ID: axis_convention

Criteria:

Unified convention: Z-axis upward, Y-axis leftward, X-axis forward.

Special joints (e.g., oblique hip pitch): Z-axis perpendicular to the flange plane, Y-axis follows right-hand rule, X-axis maintains forward direction.

Joints whose rotation plane is not parallel to the ground (e.g., some hip yaw): Still must enforce X forward, Z upward.

Scoring Reference: Inconsistent axes score 3 points.

2.3 Waist Centering & Equal Length Alignment

Item ID: waist_check

Criteria: The waist joint must be located at the geometric center, ensuring that the distances from the left and right limbs to the waist origin are completely equal in length.

Scoring Reference: Offset or asymmetric center scores 5 points.

3. Assembly Logic

Category ID: assembly

3.1 Actuator Mass Attribution

Item ID: motor_placement

Criteria:

If the drive motor is physically installed inside the parent Link, its mass and inertia must be included in the parent Link.

Example: The mass of a linear motor inside the thigh should be included in the thigh Link.

Scoring Reference: Incorrect motor attribution to Link scores 4 points.

3.2 Linkage Attribution

Item ID: linkage_placement

Criteria:

Drive linkages and transmission components should be assigned to the child Link they actually drive.

Foot drive linkages belong to the Foot Link, not the shank.

Scoring Reference: Confused mass allocation of transmission components scores 6 points.

4. Kinematics & Simulation Properties

Category ID: simulation

4.1 Topology Validation

Item ID: tree_connectivity

Criteria: Must have a single root node (e.g., base_link), no closed loops or isolated Links allowed.

Scoring Reference: Logical structure errors score 0 points.

4.2 Joint Limits Reasonableness

Item ID: joint_limits

Criteria: lower < upper; limit values must match motor specifications and mechanical hard limits.

Scoring Reference: Reversed limits score 0 points; undefined limits score 5 points.

4.3 Collision Body Optimization

Item ID: collision_simplify

Criteria: Collision models must be simplified (using Box/Cylinder, etc.), prohibiting direct copying of high-precision Visual Mesh.

Scoring Reference: Not simplified scores 5 points.

5. Hardware Parameter Configuration

Category ID: hardware

5.1 Motor Torque & Velocity Limits

Item ID: motor_limits

Criteria: Effort and velocity limit values must conform to the rated/peak parameters of the selected motor.

Scoring Reference: Missing parameters score 6 points.

5.2 Armature/Rotor Inertia

Item ID: armature_config

Criteria: Whether armature values reflecting the motor rotor and reduction ratio equivalent inertia are configured (especially important for low-mass, high-reduction-ratio robots).

Scoring Reference: Missing configuration scores 7 points.

6. Naming Conventions

Category ID: naming

6.1 Uniqueness & Descriptiveness

Item ID: naming_standard

Criteria:

Names must be globally unique and semantic (e.g., L_hip_pitch_link).

Follow snake_case style.

Scoring Reference: Duplicate names score 0 points; inconsistent style scores 8 points.

