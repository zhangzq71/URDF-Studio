import test from 'node:test';
import assert from 'node:assert/strict';

import { ThreeRenderDelegateCore } from './ThreeRenderDelegateCore.js';

const exportedRootLayerText = `#usda 1.0
(
    defaultPrim = "Robot"
    upAxis = "Z"
    metersPerUnit = 1
    subLayers = [
        @configuration/two_link_robot_description_base.usd@,
        @configuration/two_link_robot_description_physics.usd@,
        @configuration/two_link_robot_description_sensor.usd@,
    ]
)
`;

const exportedBaseLayerText = `#usda 1.0
(
    defaultPrim = "Robot"
    upAxis = "Z"
    metersPerUnit = 1
)

def Xform "Robot"
{
    def Xform "base_link"
    {
        def Xform "visuals"
        {
            def Cube "visual_0"
            {
            }
        }

        def Xform "collisions"
        {
            def Cube "collision_0"
            {
                uniform token purpose = "guide"
            }
        }

        def Xform "link1"
        {
            double3 xformOp:translate = (1, 2, 3)
            quatf xformOp:orient = (0.707107, 0, 0, 0.707107)
            uniform token[] xformOpOrder = ["xformOp:translate", "xformOp:orient"]

            def Xform "visuals"
            {
                def Cylinder "visual_0"
                {
                }
            }

            def Xform "collisions"
            {
                def Sphere "collision_0"
                {
                    uniform token purpose = "guide"
                }
            }
        }
    }
}
`;

const exportedPhysicsLayerText = `#usda 1.0
(
    defaultPrim = "Robot"
)

over "Robot"
{
    prepend apiSchemas = ["PhysicsArticulationRootAPI"]

    over "base_link"
    {
        prepend apiSchemas = ["PhysicsRigidBodyAPI", "PhysicsMassAPI"]
        float physics:mass = 2
        float3 physics:centerOfMass = (0.01, 0.02, 0.03)
        float3 physics:diagonalInertia = (0.1, 0.2, 0.3)
        quatf physics:principalAxes = (1, 0, 0, 0)

        over "collisions"
        {
            over "collision_0"
            {
                bool physics:collisionEnabled = true
            }
        }

        over "link1"
        {
            prepend apiSchemas = ["PhysicsRigidBodyAPI", "PhysicsMassAPI"]
            float physics:mass = 1.25
            float3 physics:centerOfMass = (0.1, 0.2, 0.3)
            float3 physics:diagonalInertia = (1, 2, 3)
            quatf physics:principalAxes = (1, 0, 0, 0)

            over "collisions"
            {
                over "collision_0"
                {
                    bool physics:collisionEnabled = true
                }
            }
        }
    }
}

def Scope "joints"
{
    def PhysicsRevoluteJoint "joint_link1"
    {
        rel physics:body0 = </Robot/base_link>
        rel physics:body1 = </Robot/base_link/link1>
        uniform token physics:axis = "Z"
        custom float3 urdf:axisLocal = (0, 0, -1)
        float physics:lowerLimit = -90
        float physics:upperLimit = 60
        point3f physics:localPos0 = (1, 2, 3)
        quatf physics:localRot0 = (0.707107, 0, 0, 0.707107)
        point3f physics:localPos1 = (0, 0, 0)
        quatf physics:localRot1 = (1, 0, 0, 0)
    }
}
`;

const exportedSensorLayerText = `#usda 1.0
(
    defaultPrim = "Sensors"
)

def Xform "Sensors"
{
}
`;

function createLayer(text) {
    return {
        ExportToString() {
            return text;
        },
    };
}

function createFallbackMetadataDelegate() {
    const delegate = Object.create(ThreeRenderDelegateCore.prototype);
    delegate.meshes = {
        '/Robot/base_link/visuals.proto_mesh_id0': {},
        '/Robot/base_link/collisions.proto_box_id0': {},
        '/Robot/base_link/link1/visuals.proto_cylinder_id0': {},
        '/Robot/base_link/link1/collisions.proto_sphere_id0': {},
    };
    delegate._protoMeshMetadataByMeshId = new Map();
    delegate._robotMetadataSnapshotByStageSource = new Map();
    delegate._robotMetadataBuildPromisesByStageSource = new Map();
    delegate._nowPerfMs = () => 1234;
    delegate.getNormalizedStageSourcePath = () => '/robots/two_link_robot.usd';
    delegate.getStage = () => ({
        GetRootLayer() {
            return createLayer(exportedRootLayerText);
        },
        GetUsedLayers() {
            return [
                createLayer(exportedBaseLayerText),
                createLayer(exportedPhysicsLayerText),
                createLayer(exportedSensorLayerText),
            ];
        },
    });
    return delegate;
}

test('buildRobotMetadataSnapshotForStage reconstructs robot metadata from exported stage layers when driver metadata is unavailable', () => {
    const previousWindow = globalThis.window;
    globalThis.window = { driver: null };

    try {
        const delegate = createFallbackMetadataDelegate();
        const snapshot = delegate.buildRobotMetadataSnapshotForStage('/robots/two_link_robot.usd', null);

        assert.ok(snapshot);
        assert.equal(snapshot.source, 'usd-stage');
        assert.deepEqual(snapshot.linkParentPairs, [
            ['/Robot/base_link/link1', '/Robot/base_link'],
        ]);
        assert.equal(snapshot.jointCatalogEntries.length, 1);
        assert.equal(snapshot.linkDynamicsEntries.length, 2);

        const joint = snapshot.jointCatalogEntries[0];
        assert.equal(joint.linkPath, '/Robot/base_link/link1');
        assert.equal(joint.parentLinkPath, '/Robot/base_link');
        assert.equal(joint.jointName, 'joint_link1');
        assert.equal(joint.jointType, 'revolute');
        assert.equal(joint.axisToken, 'Z');
        assert.deepEqual(joint.axisLocal, [0, 0, -1]);
        assert.deepEqual(joint.localPivotInLink, [0, 0, 0]);
        assert.deepEqual(joint.originXyz, [1, 2, 3]);
        assert.deepEqual(joint.originQuatWxyz.map((value) => Number(value.toFixed(6))), [0.707107, 0, 0, 0.707107]);
        assert.equal(joint.lowerLimitDeg, -90);
        assert.equal(joint.upperLimitDeg, 60);

        const baseDynamics = snapshot.linkDynamicsEntries.find((entry) => entry.linkPath === '/Robot/base_link');
        const childDynamics = snapshot.linkDynamicsEntries.find((entry) => entry.linkPath === '/Robot/base_link/link1');
        assert.deepEqual(baseDynamics, {
            linkPath: '/Robot/base_link',
            mass: 2,
            centerOfMassLocal: [0.01, 0.02, 0.03],
            diagonalInertia: [0.1, 0.2, 0.3],
            principalAxesLocal: [0, 0, 0, 1],
        });
        assert.deepEqual(childDynamics, {
            linkPath: '/Robot/base_link/link1',
            mass: 1.25,
            centerOfMassLocal: [0.1, 0.2, 0.3],
            diagonalInertia: [1, 2, 3],
            principalAxesLocal: [0, 0, 0, 1],
        });

        assert.deepEqual(snapshot.meshCountsByLinkPath, {
            '/Robot/base_link': {
                visualMeshCount: 1,
                collisionMeshCount: 1,
                collisionPrimitiveCounts: { box: 1 },
            },
            '/Robot/base_link/link1': {
                visualMeshCount: 1,
                collisionMeshCount: 1,
                collisionPrimitiveCounts: { sphere: 1 },
            },
        });
    }
    finally {
        globalThis.window = previousWindow;
    }
});
