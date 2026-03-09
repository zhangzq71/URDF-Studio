import * as THREE from 'three';
import { createMatteMaterial } from '@/core/utils/materialFactory';

// Uses unified material factory for consistent URDF/MJCF appearance
export function applyRgbaToMesh(mesh: THREE.Object3D, rgba: [number, number, number, number]): void {
    // Validate and clamp rgba values to 0-1 range
    const r = isFinite(rgba[0]) ? Math.max(0, Math.min(1, rgba[0])) : 0.8;
    const g = isFinite(rgba[1]) ? Math.max(0, Math.min(1, rgba[1])) : 0.8;
    const b = isFinite(rgba[2]) ? Math.max(0, Math.min(1, rgba[2])) : 0.8;
    const alpha = isFinite(rgba[3]) ? Math.max(0, Math.min(1, rgba[3])) : 1.0;

    mesh.traverse((child: any) => {
        if (child.isMesh && child.material) {
            // Create unified matte material using the factory
            // This ensures MJCF and URDF have identical visual appearance
            const newMat = createMatteMaterial({
                color: new THREE.Color(r, g, b),
                opacity: alpha,
                transparent: alpha < 1.0,
                name: child.material?.name || 'mjcf_material'
            });

            if (Array.isArray(child.material)) {
                child.material = child.material.map(() => newMat.clone());
            } else {
                child.material = newMat;
            }

            // Enable shadows for ground contact
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });
}

/**
 * Create link coordinate axes (RGB = XYZ)
 * Matching robot_viewer/CoordinateAxesManager.js createAxesGeometry()
 */
export function createLinkAxesHelper(axesSize: number = 0.1): THREE.Object3D {
    const axesGroup = new THREE.Group();
    axesGroup.name = '__link_axes_helper__';
    axesGroup.userData.isGizmo = true;

    const axisRadius = Math.max(0.001, axesSize * 0.015);
    const axisGeometry = new THREE.CylinderGeometry(axisRadius, axisRadius, axesSize, 8);

    // X axis (red)
    const xAxis = new THREE.Mesh(axisGeometry, new THREE.MeshPhongMaterial({
        color: 0xff0000, shininess: 30, depthTest: true
    }));
    xAxis.position.x = axesSize / 2;
    xAxis.rotation.z = -Math.PI / 2;
    xAxis.castShadow = false;
    xAxis.receiveShadow = false;
    xAxis.userData.isGizmo = true;
    xAxis.raycast = () => {};
    axesGroup.add(xAxis);

    // Y axis (green)
    const yAxis = new THREE.Mesh(axisGeometry, new THREE.MeshPhongMaterial({
        color: 0x00ff00, shininess: 30, depthTest: true
    }));
    yAxis.position.y = axesSize / 2;
    yAxis.castShadow = false;
    yAxis.receiveShadow = false;
    yAxis.userData.isGizmo = true;
    yAxis.raycast = () => {};
    axesGroup.add(yAxis);

    // Z axis (blue)
    const zAxis = new THREE.Mesh(axisGeometry, new THREE.MeshPhongMaterial({
        color: 0x0000ff, shininess: 30, depthTest: true
    }));
    zAxis.position.z = axesSize / 2;
    zAxis.rotation.x = Math.PI / 2;
    zAxis.castShadow = false;
    zAxis.receiveShadow = false;
    zAxis.userData.isGizmo = true;
    zAxis.raycast = () => {};
    axesGroup.add(zAxis);

    return axesGroup;
}

/**
 * Create rotation direction indicator (arc arrow)
 * Matching robot_viewer/CoordinateAxesManager.js createRotationIndicator()
 */
function createRotationIndicator(axisDirection: THREE.Vector3, baseLength: number): THREE.Object3D {
    const group = new THREE.Group();
    const radius = baseLength * 0.3;
    const tubeRadius = 0.001;
    const arrowSize = 0.004;
    const color = 0x00ff00; // Green

    // Create arc curve (270 degrees)
    const arcAngle = Math.PI * 1.5;
    const curve = new THREE.EllipseCurve(
        0, 0,
        radius, radius,
        0, arcAngle,
        false,
        0
    );

    // Generate arc path points
    const points = curve.getPoints(50);
    const points3D = points.map(p => new THREE.Vector3(p.x, p.y, 0));

    // Create tube geometry
    const curvePath = new THREE.CatmullRomCurve3(points3D);
    const tubeGeometry = new THREE.TubeGeometry(curvePath, 50, tubeRadius, 8, false);
    const tubeMaterial = new THREE.MeshBasicMaterial({ color: color, depthTest: false });
    const tubeMesh = new THREE.Mesh(tubeGeometry, tubeMaterial);
    tubeMesh.userData.isGizmo = true;
    tubeMesh.raycast = () => {};
    group.add(tubeMesh);

    // Create arrow at arc end (cone)
    const coneGeometry = new THREE.ConeGeometry(arrowSize, arrowSize * 2, 8);
    const coneMaterial = new THREE.MeshBasicMaterial({ color: color, depthTest: false });
    const coneMesh = new THREE.Mesh(coneGeometry, coneMaterial);
    coneMesh.userData.isGizmo = true;
    coneMesh.raycast = () => {};

    // Calculate arrow position and direction
    const endPoint = points3D[points3D.length - 1];
    const preEndPoint = points3D[points3D.length - 5];
    const tangent = new THREE.Vector3().subVectors(endPoint, preEndPoint).normalize();

    coneMesh.position.copy(endPoint);
    coneMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
    group.add(coneMesh);

    // Rotate entire arc arrow so it's perpendicular to axis direction
    const rotQuat = new THREE.Quaternion();
    rotQuat.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axisDirection);
    group.quaternion.copy(rotQuat);

    return group;
}

/**
 * Create a visual helper for joint axis with rotation indicator.
 * Matching robot_viewer/CoordinateAxesManager.js createJointArrowGeometry()
 *
 * The helper is positioned at the JointNode origin (which is already at joint.pos),
 * so no additional positioning is needed.
 */
export function createJointAxisHelper(axis: THREE.Vector3): THREE.Object3D {
    // Reduced size for better visual proportion (user requested 0.05-0.1)
    const arrowLength = 0.08;
    const shaftLength = arrowLength * 0.7;
    const headLength = arrowLength * 0.3;
    const shaftRadius = 0.002;
    const headRadius = 0.006;
    const arrowMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000, depthTest: false });

    const shaftGeometry = new THREE.CylinderGeometry(shaftRadius, shaftRadius, shaftLength, 16, 1);
    const shaftMesh = new THREE.Mesh(shaftGeometry, arrowMaterial);
    shaftMesh.position.y = shaftLength / 2;
    shaftMesh.userData.isGizmo = true;
    shaftMesh.raycast = () => {};

    const headGeometry = new THREE.ConeGeometry(headRadius, headLength, 16);
    const headMesh = new THREE.Mesh(headGeometry, arrowMaterial);
    headMesh.position.y = shaftLength + headLength / 2;
    headMesh.userData.isGizmo = true;
    headMesh.raycast = () => {};

    const arrow = new THREE.Group();
    arrow.add(shaftMesh);
    arrow.add(headMesh);

    // Rotate arrow to point in axis direction
    const upVector = new THREE.Vector3(0, 1, 0);
    const quaternion = new THREE.Quaternion();
    quaternion.setFromUnitVectors(upVector, axis.clone().normalize());
    arrow.quaternion.copy(quaternion);

    const axisGroup = new THREE.Group();
    axisGroup.name = '__joint_axis_helper__';
    axisGroup.userData.isGizmo = true;
    axisGroup.add(arrow);

    // Add rotation direction indicator (green arc arrow)
    const rotationIndicator = createRotationIndicator(axis.clone().normalize(), arrowLength);
    axisGroup.add(rotationIndicator);

    return axisGroup;
}
