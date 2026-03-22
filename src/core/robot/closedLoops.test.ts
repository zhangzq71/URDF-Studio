import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { JSDOM } from 'jsdom';
import * as THREE from 'three';

import { GeometryType, JointType, type RobotState, type UrdfVisual } from '@/types';
import { parseMJCF } from '@/core/parsers/mjcf/mjcfParser.ts';
import { computeLinkWorldMatrices } from '@/core/robot/kinematics.ts';

import {
    resolveClosedLoopJointMotionCompensation,
    resolveClosedLoopJointAngleCompensation,
    resolveClosedLoopJointOriginCompensation,
} from './closedLoops.ts';

function installDomGlobals(): void {
    const dom = new JSDOM('<!doctype html><html><body></body></html>', { contentType: 'text/html' });
    globalThis.window = dom.window as any;
    globalThis.document = dom.window.document as any;
    globalThis.DOMParser = dom.window.DOMParser as any;
    globalThis.XMLSerializer = dom.window.XMLSerializer as any;
    globalThis.Node = dom.window.Node as any;
    globalThis.Element = dom.window.Element as any;
    globalThis.Document = dom.window.Document as any;
}

function createNoneVisual(): UrdfVisual {
  return {
    type: GeometryType.NONE,
    dimensions: { x: 0, y: 0, z: 0 },
    color: '#000000',
    origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
  };
}

const robotWithClosedLoop: RobotState = {
    name: 'closed-loop-test',
    rootLinkId: 'base',
    selection: { type: null, id: null },
    links: {
        base: {
            id: 'base',
            name: 'base',
            visible: true,
            visual: createNoneVisual(),
            collision: createNoneVisual(),
            collisionBodies: [],
            inertial: {
                mass: 0,
                origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
                inertia: { ixx: 0, ixy: 0, ixz: 0, iyy: 0, iyz: 0, izz: 0 },
            },
        },
        link_a: {
            id: 'link_a',
            name: 'link_a',
            visible: true,
            visual: createNoneVisual(),
            collision: createNoneVisual(),
            collisionBodies: [],
            inertial: {
                mass: 0,
                origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
                inertia: { ixx: 0, ixy: 0, ixz: 0, iyy: 0, iyz: 0, izz: 0 },
            },
        },
        link_b: {
            id: 'link_b',
            name: 'link_b',
            visible: true,
            visual: createNoneVisual(),
            collision: createNoneVisual(),
            collisionBodies: [],
            inertial: {
                mass: 0,
                origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
                inertia: { ixx: 0, ixy: 0, ixz: 0, iyy: 0, iyz: 0, izz: 0 },
            },
        },
    },
    joints: {
        joint_a: {
            id: 'joint_a',
            name: 'joint_a',
            type: JointType.REVOLUTE,
            parentLinkId: 'base',
            childLinkId: 'link_a',
            origin: { xyz: { x: 1, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
            axis: { x: 0, y: 0, z: 1 },
            limit: { lower: -1, upper: 1, effort: 1, velocity: 1 },
            dynamics: { damping: 0, friction: 0 },
            hardware: { armature: 0, motorType: '', motorId: '', motorDirection: 1 },
        },
        joint_b: {
            id: 'joint_b',
            name: 'joint_b',
            type: JointType.REVOLUTE,
            parentLinkId: 'base',
            childLinkId: 'link_b',
            origin: { xyz: { x: 1.2, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
            axis: { x: 0, y: 0, z: 1 },
            limit: { lower: -1, upper: 1, effort: 1, velocity: 1 },
            dynamics: { damping: 0, friction: 0 },
            hardware: { armature: 0, motorType: '', motorId: '', motorDirection: 1 },
        },
    },
    closedLoopConstraints: [
        {
            id: 'connect-link-a-link-b',
            type: 'connect',
            linkAId: 'link_a',
            linkBId: 'link_b',
            anchorWorld: { x: 1.2, y: 0, z: 0 },
            anchorLocalA: { x: 0.2, y: 0, z: 0 },
            anchorLocalB: { x: 0, y: 0, z: 0 },
            source: { format: 'mjcf', body1Name: 'link_a', body2Name: 'link_b' },
        },
    ],
};

test('resolveClosedLoopJointOriginCompensation moves the opposite branch to preserve a connect loop', () => {
    const compensation = resolveClosedLoopJointOriginCompensation(
        robotWithClosedLoop,
        'joint_a',
        {
            xyz: { x: 2, y: 0, z: 0 },
            rpy: { r: 0, p: 0, y: 0 },
        },
    );

    assert.deepEqual(compensation, {
        joint_b: {
            xyz: { x: 2.2, y: 0, z: 0 },
            rpy: { r: 0, p: 0, y: 0 },
        },
    });
});

test('resolveClosedLoopJointOriginCompensation skips constraints fully inside the dragged subtree', () => {
    const robot: RobotState = {
        ...robotWithClosedLoop,
        links: {
            root: {
                ...robotWithClosedLoop.links.base,
                id: 'root',
                name: 'root',
            },
            ...robotWithClosedLoop.links,
        },
        rootLinkId: 'root',
        joints: {
            root_joint: {
                ...robotWithClosedLoop.joints.joint_a,
                id: 'root_joint',
                name: 'root_joint',
                parentLinkId: 'root',
                childLinkId: 'base',
                origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
            },
            ...robotWithClosedLoop.joints,
        },
    };

    const compensation = resolveClosedLoopJointOriginCompensation(
        robot,
        'root_joint',
        {
            xyz: { x: 0.5, y: 0, z: 0 },
            rpy: { r: 0, p: 0, y: 0 },
        },
    );

    assert.deepEqual(compensation, {});
});

test('resolveClosedLoopJointAngleCompensation solves a mirrored loop by adjusting the opposite joint angle', () => {
    const robot: RobotState = {
        ...robotWithClosedLoop,
        joints: {
            joint_a: {
                ...robotWithClosedLoop.joints.joint_a,
                origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
                limit: { lower: -Math.PI, upper: Math.PI, effort: 1, velocity: 1 },
                angle: 0,
            },
            joint_b: {
                ...robotWithClosedLoop.joints.joint_b,
                origin: { xyz: { x: 0, y: 0, z: 0 }, rpy: { r: 0, p: 0, y: 0 } },
                limit: { lower: -Math.PI, upper: Math.PI, effort: 1, velocity: 1 },
                angle: 0,
            },
        },
        closedLoopConstraints: [
            {
                id: 'connect-rotating-links',
                type: 'connect',
                linkAId: 'link_a',
                linkBId: 'link_b',
                anchorWorld: { x: 1, y: 0, z: 0 },
                anchorLocalA: { x: 1, y: 0, z: 0 },
                anchorLocalB: { x: 1, y: 0, z: 0 },
                source: { format: 'mjcf', body1Name: 'link_a', body2Name: 'link_b' },
            },
        ],
    };

    const compensation = resolveClosedLoopJointAngleCompensation(robot, 'joint_a', 0.42);

    assert.ok(Math.abs((compensation.joint_b ?? 0) - 0.42) < 1e-3);
});

test('resolveClosedLoopJointAngleCompensation reduces Cassie plantar loop error and solves passive joints', () => {
    installDomGlobals();

    const xml = fs.readFileSync(
        'test/mujoco_menagerie-main/agility_cassie/cassie.xml',
        'utf8',
    );
    const robot = parseMJCF(xml);

    assert.ok(robot);

    const constraint = robot.closedLoopConstraints?.find((entry) => (
        entry.id.includes('left-plantar-rod-left-foot')
    ));

    assert.ok(constraint);

    const computeError = (angleOverrides: Record<string, number>) => {
        const linkWorldMatrices = computeLinkWorldMatrices(robot, { angles: angleOverrides });
        const anchorA = new THREE.Vector3(
            constraint.anchorLocalA.x,
            constraint.anchorLocalA.y,
            constraint.anchorLocalA.z,
        ).applyMatrix4(linkWorldMatrices[constraint.linkAId]);
        const anchorB = new THREE.Vector3(
            constraint.anchorLocalB.x,
            constraint.anchorLocalB.y,
            constraint.anchorLocalB.z,
        ).applyMatrix4(linkWorldMatrices[constraint.linkBId]);
        return anchorA.distanceTo(anchorB);
    };

    const selectedAngles = { 'left-foot': -0.4 };
    const compensation = resolveClosedLoopJointAngleCompensation(robot, 'left-foot', -0.4);

    assert.ok(typeof compensation['left-foot-crank'] === 'number');
    assert.ok(typeof compensation['left-plantar-rod'] === 'number');

    const before = computeError(selectedAngles);
    const after = computeError({ ...selectedAngles, ...compensation });

    assert.ok(after < before, `expected closed-loop error to decrease, before=${before}, after=${after}`);
});

test('resolveClosedLoopJointMotionCompensation solves Cassie achilles loop with a ball joint quaternion', () => {
    installDomGlobals();

    const xml = fs.readFileSync(
        'test/mujoco_menagerie-main/agility_cassie/cassie.xml',
        'utf8',
    );
    const robot = parseMJCF(xml);

    assert.ok(robot);

    const constraint = robot.closedLoopConstraints?.find((entry) => (
        entry.id.includes('left-achilles-rod-left-heel-spring')
    ));

    assert.ok(constraint);

    const computeError = (overrides: { angles?: Record<string, number>; quaternions?: Record<string, { x: number; y: number; z: number; w: number }> }) => {
        const linkWorldMatrices = computeLinkWorldMatrices(robot, overrides);
        const anchorA = new THREE.Vector3(
            constraint.anchorLocalA.x,
            constraint.anchorLocalA.y,
            constraint.anchorLocalA.z,
        ).applyMatrix4(linkWorldMatrices[constraint.linkAId]);
        const anchorB = new THREE.Vector3(
            constraint.anchorLocalB.x,
            constraint.anchorLocalB.y,
            constraint.anchorLocalB.z,
        ).applyMatrix4(linkWorldMatrices[constraint.linkBId]);
        return anchorA.distanceTo(anchorB);
    };

    const selectedAngles = { 'left-knee': -1.2 };
    const compensation = resolveClosedLoopJointMotionCompensation(robot, 'left-knee', -1.2);

    assert.ok(compensation.quaternions['left-achilles-rod']);
    assert.ok(typeof compensation.angles['left-shin'] === 'number');

    const before = computeError({ angles: selectedAngles });
    const after = computeError({
        angles: { ...selectedAngles, ...compensation.angles },
        quaternions: compensation.quaternions,
    });

    assert.ok(after < before, `expected achilles closed-loop error to decrease, before=${before}, after=${after}`);
    assert.ok(after < 1e-4, `expected achilles closed-loop error to be nearly closed, after=${after}`);
});
