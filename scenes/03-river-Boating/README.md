# Part 3: Scroll-controlled river

Core rule: **Scroll = Player input.** The boat and world remain still at rest.
Wheel input starts a stroke; additional input slightly increases cadence. On
release, the current stroke finishes at the resting pose before motion stops.
Website particles retain their existing, independently animated interaction.

## Files and tuning

- `rowing-motion.js`: input response and catch / drive / release / recovery
  keyframes. `slowPeriod` and `fastPeriod` are seconds per stroke;
  `journeySeconds` is accumulated propulsion time, not a video duration.
- `river-three.js`: local Three.js renderer, original-image surface, joint
  constraints, oar pivots, riverbank depth, water and small dog expressions.
- `river-scene.js`: scene lifecycle, wheel input and the existing Website
  particle system. Its `WEBSITE_PALETTE`, `WEBSITE_STAR`, `WEBSITE_MORPH` and
  marked `WEBSITE PARTICLE MORPH: KEEP THIS BLOCK` are preserved.
- `archive/river-scene-before-three-20260907.js`: pre-change source backup.
- `vendor/`: Three.js 0.180.0 and its CCDIKSolver, with the upstream license.
  No CDN or video playback is required for this scene.

`01.jpg` remains the first-frame texture. `02.png` supplies the approaching
riverbanks and denser reflections. Both originals and the particle reference
`../../Part 3.png` are byte-identical to their pre-change files.

## Representation limits

This is a 2.5D original-image animation, not a fully modeled character.
Shoulder and elbow joints follow targets attached to the oar handles, and the
result drives a continuous textured surface. Movement is deliberately bounded
to avoid exposing unseen anatomy or inventing artwork. The dog expressions
deform existing image details; no new mouth interior is generated.

The girl and boat follow the camera's anchor while the banks have separate
depth. Bank approach ends at the second composition, but rowing remains usable
after arrival. Reduced-motion preferences stop the rowing/world animation
while leaving the Website interaction available.

## Verification

Serve the project root over HTTP and open `index.html`; ES modules require an
HTTP origin. The local preview uses port 8765.

Run from the project root:

```powershell
node scenes/03-river-Boating/rowing-motion.test.mjs
```

The regression test checks idle, 15-second continuous input, cadence, settling,
restart, arrival, original image hashes and exact particle implementation.
Browser verification also covered real wheel input, 15 seconds of sustained
input, Website hover/click, reduced motion, desktop/mobile canvas rendering,
first-frame pixel comparison, and JavaScript/local asset errors.
