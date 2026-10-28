import { describe, expect, it, vi } from "vitest";
import { BREATHING_ORB_SPEED, breathingOrbFrame, paintBreathingOrb } from "./breathingOrb";

describe("Breathing orb geometry", () => {
  // Golden vectors from upstream frameRibbon/resolvePreset('breathing', 64),
  // commit c8f7d5ae1cd31f77ed9b4039d276f27ce201bbb3. Do not replace with a
  // circularity threshold: its changing, uneven silhouette is intentional.
  it.each([
    [0, 53.38219343640752, 22.235079449978855, -8.814908204199405, .4681543484046206],
    [.6, 41.79159139514164, 53.440594440958165, -8.838984288614135, .4679216922266599],
    [5, 47.46061256972008, 49.842498050582904, -8.853378150673237, .4677825989723302],
  ])("matches the reference frame at %s seconds", (time, x, y, z, r) => {
    const dots = breathingOrbFrame(time);
    expect(dots).toHaveLength(484);
    for (const [key, value] of Object.entries({ x, y, z, r })) {
      expect(dots[0][key as "x" | "y" | "z" | "r"]).toBeCloseTo(value, 10);
    }
    expect(BREATHING_ORB_SPEED).toBe(3.24);
  });

  it("keeps the band layered, depth-sorted and unclipped throughout the animation", () => {
    for (let time = 0; time <= 20; time += .25) {
      const dots = breathingOrbFrame(time);
      expect(new Set(dots.map(dot => dot.r)).size).toBeGreaterThan(100);
      dots.forEach((dot, index) => {
        expect(dot.z).toBeGreaterThanOrEqual(dots[Math.max(0, index - 1)].z);
        expect(Math.min(dot.x, dot.y) - dot.r).toBeGreaterThan(0);
        expect(Math.max(dot.x, dot.y) + dot.r).toBeLessThan(64);
      });
    }
    expect(breathingOrbFrame(0)).not.toEqual(breathingOrbFrame(1));
  });

  it("uses the supplied Webis ink with depth opacity, not a flat ring stroke", () => {
    const alphas: number[] = [];
    const context = { clearRect: vi.fn(), beginPath: vi.fn(), arc: vi.fn(),
      globalAlpha: 1, fillStyle: "", fill: () => alphas.push(context.globalAlpha),
    } as unknown as CanvasRenderingContext2D;
    paintBreathingOrb(context, .6, "rgb(142, 155, 79)");
    expect(context.fillStyle).toBe("rgb(142, 155, 79)");
    expect(context.arc).toHaveBeenCalledTimes(484);
    expect(new Set(alphas).size).toBeGreaterThan(100);
    expect(context.globalAlpha).toBe(1);
  });
});
