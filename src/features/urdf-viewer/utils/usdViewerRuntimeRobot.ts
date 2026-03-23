import { JointType } from '@/types';
import type { ViewerRobotDataResolution } from './viewerRobotData';

type RuntimeJointInfo = {
  angleDeg?: number;
  lowerLimitDeg?: number;
  upperLimitDeg?: number;
} | null | undefined;

type LinkRotationControllerLike = {
  apply: (renderInterface?: unknown, options?: Record<string, unknown>) => unknown;
  getJointInfoForLink?: (linkPath: string) => RuntimeJointInfo;
  setJointAngleForLink: (
    linkPath: string,
    angleDeg: number,
    options?: { emitSelectionChanged?: boolean },
  ) => RuntimeJointInfo;
};

export interface CreateUsdViewerRuntimeRobotOptions {
  flushDecorationRefresh?: () => void;
  linkRotationController: LinkRotationControllerLike;
  requestRender?: () => void;
  resolution: ViewerRobotDataResolution;
  scheduleDecorationRefresh?: () => void;
}

function degreesToRadians(value: number | null | undefined): number | undefined {
  return Number.isFinite(Number(value)) ? (Number(value) * Math.PI) / 180 : undefined;
}

function getResolvedJointLimits(
  lowerLimitDeg: number | null | undefined,
  upperLimitDeg: number | null | undefined,
  fallbackLower: number,
  fallbackUpper: number,
) {
  return {
    lower: degreesToRadians(lowerLimitDeg) ?? fallbackLower,
    upper: degreesToRadians(upperLimitDeg) ?? fallbackUpper,
  };
}

export function createUsdViewerRuntimeRobot({
  flushDecorationRefresh,
  linkRotationController,
  requestRender,
  resolution,
  scheduleDecorationRefresh,
}: CreateUsdViewerRuntimeRobotOptions) {
  const joints = Object.fromEntries(
    Object.entries(resolution.robotData.joints).map(([jointId, joint]) => {
      const childLinkPath = resolution.childLinkPathByJointId[jointId] || '';
      const jointInfo = childLinkPath
        ? linkRotationController.getJointInfoForLink?.(childLinkPath)
        : null;
      const resolvedLimits = getResolvedJointLimits(
        jointInfo?.lowerLimitDeg,
        jointInfo?.upperLimitDeg,
        joint.limit.lower,
        joint.limit.upper,
      );
      const runtimeJoint = {
        id: jointId,
        name: joint.name || jointId,
        type: joint.type,
        jointType: joint.type,
        child: { name: joint.childLinkId },
        ignoreLimits: false,
        limit: {
          ...joint.limit,
          ...resolvedLimits,
        },
        angle: degreesToRadians(jointInfo?.angleDeg) ?? joint.angle ?? 0,
        setJointValue(nextValue: number) {
          const numericValue = Number(nextValue);
          if (!Number.isFinite(numericValue)) {
            return;
          }

          const previousAngle = Number(this.angle);
          let resolvedAngle = numericValue;

          if (childLinkPath && joint.type !== JointType.FIXED) {
            if (Number.isFinite(previousAngle) && Math.abs(previousAngle - numericValue) <= 1e-8) {
              return;
            }

            const updatedJointInfo = linkRotationController.setJointAngleForLink(
              childLinkPath,
              (numericValue * 180) / Math.PI,
              { emitSelectionChanged: false },
            );
            resolvedAngle = degreesToRadians(updatedJointInfo?.angleDeg) ?? numericValue;
            requestRender?.();
            scheduleDecorationRefresh?.();
          }

          this.angle = resolvedAngle;
        },
        finalizeJointValue() {
          flushDecorationRefresh?.();
        },
      };

      return [jointId, runtimeJoint];
    }),
  );

  return {
    joints,
  };
}
