import { describe, it, expect } from "vitest";
import { videoRect, toNormalized } from "./coords";

describe("videoRect (letterboxing)", () => {
  it("pillarboxes when the container is wider than the video", () => {
    // 2000x1000 container (2.0), 16:9 video (~1.78) → bars on left/right
    const r = videoRect(2000, 1000, 16 / 9);
    expect(r.height).toBe(1000);
    expect(Math.round(r.width)).toBe(Math.round(1000 * (16 / 9)));
    expect(r.offsetX).toBeGreaterThan(0);
    expect(r.offsetY).toBe(0);
  });

  it("letterboxes when the container is taller than the video", () => {
    const r = videoRect(1000, 1000, 16 / 9);
    expect(r.width).toBe(1000);
    expect(r.offsetY).toBeGreaterThan(0);
    expect(r.offsetX).toBe(0);
  });
});

describe("toNormalized", () => {
  it("maps the center of the video to (0.5, 0.5)", () => {
    const r = videoRect(1920, 1080, 16 / 9);
    const { x, y } = toNormalized(960, 540, r);
    expect(x).toBeCloseTo(0.5, 5);
    expect(y).toBeCloseTo(0.5, 5);
  });

  it("accounts for the pillarbox offset", () => {
    const r = videoRect(2000, 1000, 16 / 9);
    // A touch at the very left edge of the video (not the container)
    const { x } = toNormalized(r.offsetX, 500, r);
    expect(x).toBeCloseTo(0, 5);
  });
});
