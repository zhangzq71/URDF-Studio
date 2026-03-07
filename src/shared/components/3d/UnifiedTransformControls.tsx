import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { TransformControls as DreiTransformControls } from '@react-three/drei';

type DreiTransformControlsProps = React.ComponentProps<typeof DreiTransformControls>;
type SharedControlRef = React.MutableRefObject<any | null> | React.RefObject<any | null>;

export type UnifiedTransformMode = 'translate' | 'rotate' | 'scale' | 'universal';

interface UnifiedTransformControlsProps extends Omit<DreiTransformControlsProps, 'mode'> {
  mode: UnifiedTransformMode;
  rotateRef?: SharedControlRef;
  rotateSize?: number;
  rotateEnabled?: boolean;
  onRotateChange?: DreiTransformControlsProps['onChange'];
  enableUniversalPriority?: boolean;
}

const isTransformAxis = (axis: unknown): axis is 'X' | 'Y' | 'Z' =>
  axis === 'X' || axis === 'Y' || axis === 'Z';

/**
 * Single shared entry point for stock Three.js/Drei TransformControls behavior.
 * Visualizer and URDF Viewer should both render their gizmos through this file
 * so future official-style tweaks happen in one place.
 */
export const UnifiedTransformControls = forwardRef<any, UnifiedTransformControlsProps>(
  function UnifiedTransformControls(
    {
      mode,
      rotateRef,
      rotateSize,
      rotateEnabled,
      onChange,
      onRotateChange,
      enableUniversalPriority = true,
      enabled = true,
      space = 'local',
      size,
      ...restProps
    },
    ref
  ) {
    const translateRef = useRef<any>(null);
    const localRotateRef = useRef<any>(null);
    const effectiveRotateRef = rotateRef ?? localRotateRef;

    useImperativeHandle(ref, () => translateRef.current);

    useEffect(() => {
      if (translateRef.current) {
        translateRef.current.enabled = enabled;
      }

      if (effectiveRotateRef.current) {
        effectiveRotateRef.current.enabled = rotateEnabled ?? enabled;
      }
    }, [enabled, rotateEnabled, effectiveRotateRef]);

    useFrame(() => {
      if (mode !== 'universal' || !enableUniversalPriority) return;

      const translateControls = translateRef.current;
      const rotateControls = effectiveRotateRef.current;
      if (!translateControls || !rotateControls) return;

      const translateActive =
        Boolean(translateControls.dragging) || isTransformAxis(translateControls.axis);
      const rotateActive =
        Boolean(rotateControls.dragging) || isTransformAxis(rotateControls.axis);

      if (rotateActive) {
        rotateControls.enabled = rotateEnabled ?? enabled;
        translateControls.enabled = false;
        return;
      }

      if (translateActive) {
        translateControls.enabled = enabled;
        rotateControls.enabled = false;
        return;
      }

      translateControls.enabled = enabled;
      rotateControls.enabled = rotateEnabled ?? enabled;
    }, 1000);

    return (
      <>
        <DreiTransformControls
          ref={translateRef}
          mode={mode === 'universal' ? 'translate' : mode}
          enabled={enabled}
          space={space}
          size={size}
          onChange={onChange}
          {...restProps}
        />

        {mode === 'universal' && (
          <DreiTransformControls
            ref={effectiveRotateRef}
            mode="rotate"
            enabled={rotateEnabled ?? enabled}
            space={space}
            size={rotateSize ?? size}
            onChange={onRotateChange ?? onChange}
            {...restProps}
          />
        )}
      </>
    );
  }
);
