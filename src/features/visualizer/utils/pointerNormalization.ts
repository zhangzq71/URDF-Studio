export interface CanvasPointerMeasurement {
  x: number;
  y: number;
  width: number;
  height: number;
  inside: boolean;
}

interface RectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function measureCanvasPointerPosition(
  clientX: number,
  clientY: number,
  rect: RectLike,
): CanvasPointerMeasurement {
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  const inside = x >= 0 && y >= 0 && x <= rect.width && y <= rect.height;

  return {
    x,
    y,
    width: rect.width,
    height: rect.height,
    inside,
  };
}

export function normalizeCanvasPointerPosition(
  measurement: Pick<CanvasPointerMeasurement, 'x' | 'y' | 'width' | 'height'>,
): { x: number; y: number } | null {
  if (measurement.width <= 0 || measurement.height <= 0) {
    return null;
  }

  return {
    x: (measurement.x / measurement.width) * 2 - 1,
    y: -(measurement.y / measurement.height) * 2 + 1,
  };
}
