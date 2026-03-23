export type JointInfoSnapshot = {
  linkPath: string;
  jointPath: string;
  axisToken: "X" | "Y" | "Z";
  lowerLimitDeg: number;
  upperLimitDeg: number;
  angleDeg: number;
};

export const LinkRotationController: any;
