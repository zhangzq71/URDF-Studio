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
  setJointAngleForLink: (linkPath: string, angleDeg: number) => unknown;
};

export interface CreateUsdViewerRuntimeRobotOptions {
  afterJointValueApplied?: () => void;
  linkRotationController: LinkRotationControllerLike;
  resolution: ViewerRobotDataResolution;
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
  afterJointValueApplied,
  linkRotationController,
  resolution,
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
          this.angle = nextValue;

          if (childLinkPath && joint.type !== JointType.FIXED) {
            linkRotationController.setJointAngleForLink(
              childLinkPath,
              (Number(nextValue) * 180) / Math.PI,
            );
            linkRotationController.apply(undefined, { force: true });
            afterJointValueApplied?.();
          }
        },
      };

      return [jointId, runtimeJoint];
    }),
  );

  return {
    joints,
  };
}
