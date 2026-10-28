import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { RowingMotion } from './rowing-motion.js';

const tick = (motion, seconds, pixels = 0, interval = 0.15) => {
    for (let n = 0; n < Math.round(seconds * 60); n += 1) {
        if (pixels && n % Math.round(interval * 60) === 0) motion.input(pixels);
        motion.update(1 / 60);
    }
};
const idle = new RowingMotion();
tick(idle, 3);
assert.equal(idle.active, false);
assert.equal(idle.phase, 0);
assert.equal(idle.progress, 0);

const slow = new RowingMotion();
const fast = new RowingMotion();
tick(slow, 15, 18, 0.2);
tick(fast, 15, 160, 0.15);
assert(slow.active && fast.active, '15 seconds of input must remain interactive');
assert(fast.period < slow.period, 'faster input slightly raises the stroke cadence');
assert(fast.progress < 1, 'the banks must not reach the endpoint after just 15 seconds');
assert(fast.cycles >= 5, 'rowing must repeat without a video duration limit');
tick(fast, 0.7);
assert(fast.finishing, 'releasing input finishes the current stroke');
tick(fast, 3.5);
assert.equal(fast.phase, 0);
assert.equal(fast.active, false);
const settledDistance = fast.distance;
tick(fast, 5);
assert.equal(fast.distance, settledDistance, 'the world must be still after settling');
fast.input(120);
tick(fast, 0.1);
assert(fast.active && fast.phase > 0, 'input restarts from the resting pose');
fast.setProgress(1);
tick(fast, 5, 120);
assert(fast.active, 'reaching the riverbank must not disable rowing');

const artifact = path => readFileSync(new URL(path, import.meta.url));
const block = code => code.toString().replaceAll('\r\n','\n').match(/\/\/ === WEBSITE PARTICLE MORPH: KEEP THIS BLOCK ===[\s\S]*?\/\/ === END WEBSITE PARTICLE MORPH ===/)[0];
assert.equal(block(artifact('./river-scene.js')), block(artifact('./archive/river-scene-before-three-20260907.js')));
const particleSettings = code => code.toString().replaceAll('\r\n', '\n')
    .match(/const WEBSITE_PALETTE = [\s\S]*?const state =/)[0];
assert.equal(particleSettings(artifact('./river-scene.js')),
    particleSettings(artifact('./archive/river-scene-before-three-20260907.js')));
for (const [file, hash] of [
    ['./01.jpg', 'abbda922636bce043ae1c0bcc2b1deb0f8ba3743951fe2f02425c6b0799bcf52'],
    ['./02.png', 'cef5ed0964305d8011bdc5199af96119157c761938e845968ab5ef84e4bc3572'],
    ['../../Part 3.png', 'fca6b24d98f7f7d39718ef105a0b7ade410ad55b3772b32e66f4086b59cd1680']
]) {
    assert.equal(createHash('sha256').update(artifact(file)).digest('hex'), hash, `${file} must remain byte-identical`);
}
console.log('PASS: idle, 15-second strokes, cadence, finishing, restart, endpoint, original images and particle block.');
