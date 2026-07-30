export interface VideoRect {
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
}

// The video is letterboxed (objectFit="contain"); compute its actual rectangle from container and aspect.
export function videoRect(containerW: number, containerH: number, aspect: number): VideoRect {
  if (containerW <= 0 || containerH <= 0) return { offsetX: 0, offsetY: 0, width: containerW, height: containerH };
  const containerAspect = containerW / containerH;
  if (containerAspect > aspect) {
    const width = containerH * aspect;
    return { offsetX: (containerW - width) / 2, offsetY: 0, width, height: containerH };
  }
  const height = containerW / aspect;
  return { offsetX: 0, offsetY: (containerH - height) / 2, width: containerW, height };
}

// Map a touch point in the view to normalized 0..1 coordinates within the video
export function toNormalized(
  touchX: number,
  touchY: number,
  rect: VideoRect,
): { x: number; y: number } {
  return {
    x: (touchX - rect.offsetX) / rect.width,
    y: (touchY - rect.offsetY) / rect.height,
  };
}
