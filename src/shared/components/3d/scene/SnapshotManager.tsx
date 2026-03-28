import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { RefObject } from 'react';

const SNAPSHOT_MIN_LONG_EDGE = 3840;
const SNAPSHOT_GRID_OBJECT_NAME = 'ReferenceGrid';

interface SnapshotManagerProps {
  actionRef?: RefObject<(() => void) | null>;
  robotName: string;
}

export const SnapshotManager = ({ actionRef, robotName }: SnapshotManagerProps) => {
  const { gl, get, invalidate } = useThree();
  const pendingCaptureRef = useRef<number | null>(null);

  useEffect(() => {
    if (!actionRef) return;

    const clearPendingFrames = () => {
      if (pendingCaptureRef.current !== null) {
        cancelAnimationFrame(pendingCaptureRef.current);
        pendingCaptureRef.current = null;
      }
    };

    const resolveSnapshotSize = () => {
      const drawingBufferSize = gl.getDrawingBufferSize(new THREE.Vector2());
      const baseWidth = Math.max(1, Math.round(drawingBufferSize.x || 1));
      const baseHeight = Math.max(1, Math.round(drawingBufferSize.y || 1));
      const longEdge = Math.max(baseWidth, baseHeight);
      const scale = longEdge >= SNAPSHOT_MIN_LONG_EDGE ? 1 : SNAPSHOT_MIN_LONG_EDGE / longEdge;

      return {
        baseWidth,
        baseHeight,
        targetWidth: Math.max(1, Math.round(baseWidth * scale)),
        targetHeight: Math.max(1, Math.round(baseHeight * scale)),
      };
    };

    const downloadCanvas = (canvas: HTMLCanvasElement, onDone?: () => void) => {
      const safeRobotName = (robotName || 'robot').replace(/[\\/:*?"<>|]/g, '_');
      const now = new Date();
      const timestamp = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0'),
        '_',
        String(now.getHours()).padStart(2, '0'),
        String(now.getMinutes()).padStart(2, '0'),
        String(now.getSeconds()).padStart(2, '0'),
      ].join('');
      const filename = `${safeRobotName}_snapshot_${timestamp}.png`;

      const downloadBlob = (blob: Blob | null) => {
        if (!blob) {
          console.error('[Snapshot] Failed to generate PNG blob.');
          onDone?.();
          return;
        }

        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        onDone?.();
      };

      if (canvas.toBlob) {
        canvas.toBlob(downloadBlob, 'image/png');
        return;
      }

      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      onDone?.();
    };

    const tryCaptureRendererCanvas = (
      sourceCanvas: HTMLCanvasElement,
      targetWidth: number,
      targetHeight: number,
    ) => {
      const captureCanvas = document.createElement('canvas');
      captureCanvas.width = targetWidth;
      captureCanvas.height = targetHeight;
      const ctx = captureCanvas.getContext('2d');

      if (!ctx) {
        return null;
      }

      try {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(sourceCanvas, 0, 0, targetWidth, targetHeight);
        return captureCanvas;
      } catch (error) {
        console.warn('[Snapshot] Falling back to framebuffer capture.', error);
        return null;
      }
    };

    const readFramebufferToCanvas = (width: number, height: number) => {
      const context = gl.getContext();
      const pixelBuffer = new Uint8Array(width * height * 4);
      const captureCanvas = document.createElement('canvas');
      captureCanvas.width = width;
      captureCanvas.height = height;
      const ctx = captureCanvas.getContext('2d');

      if (!ctx) {
        return captureCanvas;
      }

      context.readPixels(0, 0, width, height, context.RGBA, context.UNSIGNED_BYTE, pixelBuffer);

      const imageData = ctx.createImageData(width, height);
      const rowStride = width * 4;

      for (let sourceRow = 0; sourceRow < height; sourceRow += 1) {
        const destinationRow = height - sourceRow - 1;
        const sourceOffset = sourceRow * rowStride;
        const destinationOffset = destinationRow * rowStride;
        imageData.data.set(
          pixelBuffer.subarray(sourceOffset, sourceOffset + rowStride),
          destinationOffset,
        );
      }

      ctx.putImageData(imageData, 0, 0);
      return captureCanvas;
    };

    const createExportCanvas = (sourceCanvas: HTMLCanvasElement, targetWidth: number, targetHeight: number) => {
      if (sourceCanvas.width === targetWidth && sourceCanvas.height === targetHeight) {
        return sourceCanvas;
      }

      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = targetWidth;
      exportCanvas.height = targetHeight;
      const ctx = exportCanvas.getContext('2d');

      if (!ctx) {
        return sourceCanvas;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(sourceCanvas, 0, 0, targetWidth, targetHeight);
      return exportCanvas;
    };

    const hideSnapshotGrid = (scene: THREE.Scene) => {
      const hiddenObjects: Array<{ object: THREE.Object3D; visible: boolean }> = [];

      scene.traverse((object) => {
        if (object.name !== SNAPSHOT_GRID_OBJECT_NAME) return;
        hiddenObjects.push({ object, visible: object.visible });
        object.visible = false;
      });

      return () => {
        hiddenObjects.forEach(({ object, visible }) => {
          object.visible = visible;
        });
      };
    };

    const waitFrames = (count: number, onDone: () => void) => {
      if (count <= 0) {
        onDone();
        return;
      }

      pendingCaptureRef.current = requestAnimationFrame(() => {
        pendingCaptureRef.current = null;
        waitFrames(count - 1, onDone);
      });
    };

    const renderAndDownloadHighRes = (onDone?: () => void) => {
      const { targetWidth, targetHeight, baseWidth, baseHeight } = resolveSnapshotSize();
      let restoreSnapshotGrid: (() => void) | null = null;

      try {
        waitFrames(2, () => {
          const { scene: latestScene, camera: latestCamera } = get();
          restoreSnapshotGrid = hideSnapshotGrid(latestScene);
          gl.render(latestScene, latestCamera);
          const capturedCanvas =
            tryCaptureRendererCanvas(gl.domElement, targetWidth, targetHeight)
            ?? createExportCanvas(readFramebufferToCanvas(baseWidth, baseHeight), targetWidth, targetHeight);
          restoreSnapshotGrid();
          restoreSnapshotGrid = null;
          downloadCanvas(capturedCanvas, () => {
            invalidate();
            onDone?.();
          });
        });
      } catch (error) {
        restoreSnapshotGrid?.();
        invalidate();
        throw error;
      }
    };

    actionRef.current = () => {
      try {
        clearPendingFrames();
        invalidate();
        waitFrames(2, () => {
          try {
            renderAndDownloadHighRes(() => {
              invalidate();
            });
          } catch (error) {
            console.error('[Snapshot] Failed:', error);
            invalidate();
          }
        });
      } catch (error) {
        console.error('[Snapshot] Failed:', error);
        invalidate();
      }
    };

    return () => {
      clearPendingFrames();
      actionRef.current = null;
    };
  }, [actionRef, get, gl, invalidate, robotName]);

  return null;
};
