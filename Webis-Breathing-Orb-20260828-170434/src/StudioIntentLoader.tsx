import { useEffect, useRef } from "react";
import { BREATHING_ORB_SIZE, BREATHING_ORB_SPEED, paintBreathingOrb } from "./breathingOrb";
import "./studio-intent-loader.css";

/** Layered, deforming particle band shared by Home and Console activity states. */
export function StudioIntentLoader({ active, size = 19 }: { active: boolean; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frameId = 0;
    let visible = true;
    let disposed = false;
    const draw = (time: number) => {
      const resolution = Math.round(size * Math.min(2, window.devicePixelRatio || 1));
      if (canvas.width !== resolution || canvas.height !== resolution) {
        canvas.width = resolution;
        canvas.height = resolution;
      }
      const scale = resolution / BREATHING_ORB_SIZE;
      context.setTransform(scale, 0, 0, scale, 0, 0);
      paintBreathingOrb(context, time, getComputedStyle(canvas).color);
    };
    const canAnimate = () => active && !reducedMotion.matches && visible
      && document.visibilityState !== "hidden" && !disposed;
    const tick = () => {
      frameId = 0;
      if (!canAnimate()) return;
      draw(performance.now() / 1000 * BREATHING_ORB_SPEED);
      frameId = requestAnimationFrame(tick);
    };
    const refresh = () => {
      cancelAnimationFrame(frameId);
      frameId = 0;
      draw(reducedMotion.matches || !active ? .6 : performance.now() / 1000 * BREATHING_ORB_SPEED);
      if (canAnimate()) frameId = requestAnimationFrame(tick);
    };
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      refresh();
    });
    observer?.observe(canvas);
    reducedMotion.addEventListener("change", refresh);
    document.addEventListener("visibilitychange", refresh);
    refresh();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      observer?.disconnect();
      reducedMotion.removeEventListener("change", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [active, size]);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="studio-intent-loader"
      data-active={active}
      height={size}
      width={size}
      style={{ width: size, height: size }}
    />
  );
}
