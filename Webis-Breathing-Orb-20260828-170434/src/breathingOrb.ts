/*!
 * Adapted from thinking-orbs (Breathing, 64px preset), by Jakub Antalik.
 * https://github.com/Jakubantalik/Libraries/tree/c8f7d5ae1cd31f77ed9b4039d276f27ce201bbb3/packages/thinking-orbs
 * Only the breathing renderer is retained; Webis supplies its own ink color.
 *
 * MIT License
 * Copyright (c) 2026 Jakub Antalik
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

export const BREATHING_ORB_SIZE = 64;
export const BREATHING_ORB_SPEED = 3.24;

export interface BreathingDot {
  x: number;
  y: number;
  z: number;
  r: number;
  white: number;
  a: number;
}

// Resolve the original 64px tuning once. Keep its layered band and phase offsets
// at every display size instead of substituting a different small-icon preset.
const segments = Math.round(88 * Math.sqrt(.25));
const lanes = Math.round(Math.round(5 * Math.sqrt(.25)) * 3.627);
const wobble = .368;
const radius = BREATHING_ORB_SIZE / 2 * .78;
const baseRadius = radius / (1 + .85 * .23 * wobble);
const dotScale = (BREATHING_ORB_SIZE / 300) ** .6;
const cameraTilt = .3;
const sinTilt = Math.sin(cameraTilt);
const cosTilt = Math.cos(cameraTilt);

/** Original face-on ribbon geometry. Time is the preset-scaled clock, in seconds. */
export function breathingOrbFrame(time: number): BreathingDot[] {
  const dots: BreathingDot[] = [];
  for (let lane = 0; lane < lanes; lane++) {
    const offset = (lane - (lanes - 1) / 2) * .075;
    const edge = Math.abs(lane - (lanes - 1) / 2) / ((lanes - 1) / 2);
    for (let segment = 0; segment < segments; segment++) {
      const angle = segment / segments * 2 * Math.PI;
      const wave = (.16 * Math.sin(angle * 3 - time * 1.7 + lane * .22)
        + .07 * Math.sin(angle * 5 + time * 1.1)) * wobble;
      // Face-on plane (pitch = -cameraTilt), with spin disabled by the preset.
      const x = Math.cos(angle);
      const y = cosTilt * Math.sin(angle) + sinTilt * offset;
      const z = -sinTilt * Math.sin(angle) + cosTilt * offset;
      const length = Math.sqrt(x * x + y * y + z * z);
      const rr = baseRadius * (1 + wave);
      const px = x / length * rr;
      const py = y / length * rr;
      const pz = z / length * rr;
      const depthZ = py * sinTilt + pz * cosTilt;
      const depth = (depthZ / radius + 1) / 2;
      dots.push({
        x: BREATHING_ORB_SIZE / 2 + px,
        y: BREATHING_ORB_SIZE / 2 - (py * cosTilt - pz * sinTilt),
        z: depthZ,
        r: Math.max(.3, (1.1 * .956 + 1.7 * .956 * depth) * (1 - .25 * edge) * dotScale),
        white: .52 - .44 * depth + .18 * edge,
        a: .4 + .6 * depth,
      });
    }
  }
  return dots.sort((a, b) => a.z - b.z);
}

export function paintBreathingOrb(context: CanvasRenderingContext2D, time: number, ink: string) {
  context.clearRect(0, 0, BREATHING_ORB_SIZE, BREATHING_ORB_SIZE);
  context.fillStyle = ink;
  for (const dot of breathingOrbFrame(time)) {
    // Preserve the original depth shading as ink coverage, in the brand color.
    context.globalAlpha = dot.a * (1 - Math.min(1, Math.max(0, dot.white)));
    context.beginPath();
    context.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;
}
