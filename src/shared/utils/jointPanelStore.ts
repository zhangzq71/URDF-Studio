export interface JointPanelSnapshot {
  jointAngles: Record<string, number>;
  activeJoint: string | null;
}

export interface JointPanelStore {
  getSnapshot: () => JointPanelSnapshot;
  subscribe: (listener: () => void) => () => void;
  patchJointAngles: (nextJointAngles: Record<string, number>) => boolean;
  replaceJointAngles: (nextJointAngles: Record<string, number>) => boolean;
  setActiveJoint: (jointName: string | null) => boolean;
  reset: (nextSnapshot?: Partial<JointPanelSnapshot>) => boolean;
}

function sanitizeJointAngles(nextJointAngles: Record<string, number>) {
  return Object.entries(nextJointAngles).reduce<Record<string, number>>((sanitized, [jointName, angle]) => {
    const numericAngle = Number(angle);
    if (Number.isFinite(numericAngle)) {
      sanitized[jointName] = numericAngle;
    }
    return sanitized;
  }, {});
}

function areJointAnglesEqual(a: Record<string, number>, b: Record<string, number>) {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);

  if (aKeys.length !== bKeys.length) {
    return false;
  }

  return aKeys.every((key) => a[key] === b[key]);
}

export function createJointPanelStore(initialSnapshot: Partial<JointPanelSnapshot> = {}): JointPanelStore {
  let snapshot: JointPanelSnapshot = {
    jointAngles: sanitizeJointAngles(initialSnapshot.jointAngles ?? {}),
    activeJoint: initialSnapshot.activeJoint ?? null,
  };
  const listeners = new Set<() => void>();

  const emitChange = () => {
    listeners.forEach((listener) => listener());
  };

  const commitSnapshot = (nextSnapshot: JointPanelSnapshot) => {
    if (
      snapshot.activeJoint === nextSnapshot.activeJoint &&
      areJointAnglesEqual(snapshot.jointAngles, nextSnapshot.jointAngles)
    ) {
      return false;
    }

    snapshot = nextSnapshot;
    emitChange();
    return true;
  };

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    patchJointAngles: (nextJointAngles) => {
      const sanitized = sanitizeJointAngles(nextJointAngles);
      if (Object.keys(sanitized).length === 0) {
        return false;
      }

      const mergedAngles = { ...snapshot.jointAngles };
      let changed = false;

      Object.entries(sanitized).forEach(([jointName, angle]) => {
        if (mergedAngles[jointName] !== angle) {
          mergedAngles[jointName] = angle;
          changed = true;
        }
      });

      if (!changed) {
        return false;
      }

      return commitSnapshot({
        ...snapshot,
        jointAngles: mergedAngles,
      });
    },
    replaceJointAngles: (nextJointAngles) =>
      commitSnapshot({
        ...snapshot,
        jointAngles: sanitizeJointAngles(nextJointAngles),
      }),
    setActiveJoint: (jointName) =>
      commitSnapshot({
        ...snapshot,
        activeJoint: jointName ?? null,
      }),
    reset: (nextSnapshot = {}) =>
      commitSnapshot({
        jointAngles: sanitizeJointAngles(nextSnapshot.jointAngles ?? {}),
        activeJoint: nextSnapshot.activeJoint ?? null,
      }),
  };
}
