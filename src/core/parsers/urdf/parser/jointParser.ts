import { UrdfJoint, JointType } from '@/types';
import { parseVec3, parseRPY, parseFloatSafe } from './utils';

export const parseJoints = (robotEl: Element): Record<string, UrdfJoint> => {
    const joints: Record<string, UrdfJoint> = {};

    Array.from(robotEl.children).forEach(child => {
        if (child.tagName !== 'joint') return;
        const jointEl = child;
        const jointName = jointEl.getAttribute("name");
        if (!jointName) return;
        const id = jointName;

        const parentEl = jointEl.querySelector("parent");
        const childEl = jointEl.querySelector("child");
        let originEl = jointEl.querySelector("origin");
        
        // Fallback: iterate children if querySelector fails (robustness for some XML parsers)
        if (!originEl) {
          // Try children collection first
          if (jointEl.children && jointEl.children.length > 0) {
              for (let i = 0; i < jointEl.children.length; i++) {
                  if (jointEl.children[i].tagName === 'origin') {
                      originEl = jointEl.children[i];
                      break;
                  }
              }
          }
          // Fallback to childNodes (for parsers that might not support children on Elements)
          if (!originEl && jointEl.childNodes) {
              for (let i = 0; i < jointEl.childNodes.length; i++) {
                  const node = jointEl.childNodes[i];
                  if (node.nodeType === 1 && (node as Element).tagName === 'origin') { // Node.ELEMENT_NODE
                      originEl = node as Element;
                      break;
                  }
              }
          }
        }

        const axisEl = jointEl.querySelector("axis");
        const limitEl = jointEl.querySelector("limit");
        const dynamicsEl = jointEl.querySelector("dynamics");
        const hardwareEl = jointEl.querySelector("hardware");

        let hardware = {
            armature: 0,
            motorType: 'None',
            motorId: '',
            motorDirection: 1 as 1 | -1
        };

        if (hardwareEl) {
            hardware = {
                motorType: hardwareEl.querySelector("motorType")?.textContent || 'None',
                motorId: hardwareEl.querySelector("motorId")?.textContent || '',
                motorDirection: (parseInt(hardwareEl.querySelector("motorDirection")?.textContent || "1") as 1 | -1),
                armature: parseFloat(hardwareEl.querySelector("armature")?.textContent || "0")
            };
        }

        joints[id] = {
            id,
            name: jointName,
            type: (jointEl.getAttribute("type") as JointType) || JointType.REVOLUTE,
            parentLinkId: parentEl?.getAttribute("link") || "",
            childLinkId: childEl?.getAttribute("link") || "",
            origin: {
                xyz: parseVec3(originEl?.getAttribute("xyz")),
                rpy: parseRPY(originEl?.getAttribute("rpy"))
            },
            axis: parseVec3(axisEl?.getAttribute("xyz") || "0 0 1"),
            limit: {
                lower: parseFloatSafe(limitEl?.getAttribute("lower"), -1.57),
                upper: parseFloatSafe(limitEl?.getAttribute("upper"), 1.57),
                effort: parseFloatSafe(limitEl?.getAttribute("effort"), 100),
                velocity: parseFloatSafe(limitEl?.getAttribute("velocity"), 10)
            },
            dynamics: {
                damping: parseFloatSafe(dynamicsEl?.getAttribute("damping"), 0),
                friction: parseFloatSafe(dynamicsEl?.getAttribute("friction"), 0)
            },
            hardware: hardware
        };
    });

    return joints;
};
