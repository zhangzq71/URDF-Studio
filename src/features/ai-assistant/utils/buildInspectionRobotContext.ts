import type { RobotState } from '@/types'

const serializeGeometryForInspection = (geometry: RobotState['links'][string]['visual']) => ({
  origin: geometry.origin,
  geometry: {
    type: geometry.type,
    dimensions: geometry.dimensions
  }
})

export const buildInspectionRobotContext = (robot: RobotState) => {
  return {
    name: robot.name,
    links: Object.values(robot.links).map(link => ({
      id: link.id,
      name: link.name,
      inertial: {
        mass: link.inertial?.mass ?? 0,
        origin: link.inertial?.origin,
        inertia: link.inertial?.inertia
      },
      visual: serializeGeometryForInspection(link.visual),
      collision: serializeGeometryForInspection(link.collision),
      collisionBodies: link.collisionBodies?.map(serializeGeometryForInspection)
    })),
    joints: Object.values(robot.joints).map(joint => ({
      id: joint.id,
      name: joint.name,
      type: joint.type,
      parent: joint.parentLinkId,
      child: joint.childLinkId,
      origin: joint.origin,
      axis: joint.axis,
      limit: joint.limit,
      dynamics: joint.dynamics,
      hardware: joint.hardware,
      referencePosition: joint.referencePosition
    })),
    rootId: robot.rootLinkId,
    inspectionContext: robot.inspectionContext
  }
}
