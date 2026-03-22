import { throttle } from '../../../shared/utils/throttle.ts';

interface JointDragStoreSyncOptions {
  onDragChange?: (jointName: string, angle: number) => void;
  onDragCommit?: (jointName: string, angle: number) => void;
  throttleChanges?: boolean;
  intervalMs?: number;
}

export interface JointDragStoreSync {
  emit: (jointName: string, angle: number) => void;
  commit: (jointName: string, angle: number) => void;
  dispose: () => void;
}

const DEFAULT_INTERVAL_MS = 33;

export function createJointDragStoreSync({
  onDragChange,
  onDragCommit,
  throttleChanges = false,
  intervalMs = DEFAULT_INTERVAL_MS,
}: JointDragStoreSyncOptions): JointDragStoreSync {
  const emitImmediate = (jointName: string, angle: number) => {
    onDragChange?.(jointName, angle);
  };

  const emitThrottled = throttle(emitImmediate, intervalMs);
  const emit = throttleChanges ? emitThrottled : emitImmediate;

  return {
    emit(jointName, angle) {
      emit(jointName, angle);
    },
    commit(jointName, angle) {
      emitThrottled.cancel();
      onDragCommit?.(jointName, angle);
    },
    dispose() {
      emitThrottled.cancel();
    },
  };
}
