// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudioIntentLoader } from "./StudioIntentLoader";

describe("StudioIntentLoader lifecycle", () => {
  let container: HTMLDivElement;
  let root: Root;
  let reduced: boolean;
  let visibility: DocumentVisibilityState;
  let motionListener: () => void;
  let intersection: IntersectionObserverCallback;
  let nextId: number;
  const pending = new Map<number, FrameRequestCallback>();
  const disconnect = vi.fn();
  const clear = vi.fn();
  const transform = vi.fn();

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    reduced = false;
    visibility = "visible";
    nextId = 0;
    pending.clear();
    vi.clearAllMocks();
    vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
    vi.spyOn(window, "devicePixelRatio", "get").mockReturnValue(3);
    vi.spyOn(window, "matchMedia").mockImplementation(() => ({
      get matches() { return reduced; },
      addEventListener: (_: string, callback: () => void) => { motionListener = callback; },
      removeEventListener: vi.fn(),
    }) as unknown as MediaQueryList);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      setTransform: transform, clearRect: clear, beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      pending.set(++nextId, callback);
      return nextId;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => pending.delete(id));
    vi.stubGlobal("IntersectionObserver", class {
      constructor(callback: IntersectionObserverCallback) { intersection = callback; }
      observe() {}
      disconnect = disconnect;
    });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    expect(pending.size).toBe(0);
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const render = (active = true, size = 48) => act(() => root.render(<StudioIntentLoader active={active} size={size}/>));
  const tick = () => {
    const [id, callback] = [...pending][0];
    pending.delete(id);
    act(() => callback(100));
  };

  it("keeps the CSS slot size while capping canvas resolution at 2x", () => {
    render();
    const canvas = container.querySelector("canvas")!;
    expect(canvas.style.width).toBe("48px");
    expect(canvas.width).toBe(96);
    expect(transform).toHaveBeenCalledWith(1.5, 0, 0, 1.5, 0, 0);
    expect(canvas.getAttribute("aria-hidden")).toBe("true");
    expect(pending.size).toBe(1);
    tick();
    expect(clear).toHaveBeenCalledTimes(2);
    render(true, 19);
    expect(canvas.width).toBe(38);
    expect(canvas.style.width).toBe("19px");
    expect(pending.size).toBe(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("draws a static frame when inactive and responds to reduced-motion changes", () => {
    render(false);
    expect(clear).toHaveBeenCalledTimes(1);
    expect(pending.size).toBe(0);
    render();
    expect(pending.size).toBe(1);
    reduced = true;
    act(() => motionListener());
    expect(pending.size).toBe(0);
    reduced = false;
    act(() => motionListener());
    expect(pending.size).toBe(1);
  });

  it("pauses offscreen and on hidden tabs, then resumes only when both are visible", () => {
    render();
    const intersect = (isIntersecting: boolean) => act(() => intersection(
      [{ isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver,
    ));
    intersect(false);
    expect(pending.size).toBe(0);
    visibility = "hidden";
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    intersect(true);
    expect(pending.size).toBe(0);
    visibility = "visible";
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(pending.size).toBe(1);
  });
});
