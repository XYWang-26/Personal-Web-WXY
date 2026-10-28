// Browser regression checks. Requires playwright and pngjs on NODE_PATH.
// Run: node scenes/01-opening/opening-browser.test.cjs [http://127.0.0.1:8766] [chrome|msedge]
const { chromium } = require('playwright');
const { PNG } = require('pngjs');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const base = process.argv[2] || 'http://127.0.0.1:8766';
const channel = process.argv[3] || 'chrome';
const output = process.env.STARRY_TEST_OUTPUT || require('node:os').tmpdir();
const fileUrl = pathToFileURL(path.resolve(__dirname, '../../index.html')).href;
const results = [];
let browser;

async function test(name, options, run) {
    const context = await browser.newContext({ viewport: options.mobile
        ? { width: 390, height: 844 } : { width: 1440, height: 900 },
        reducedMotion: options.reduced ? 'reduce' : 'no-preference',
        javaScriptEnabled: !options.noJS });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => {
        if (/01-opening|opening-fallback/.test(error.stack)) errors.push(error.message);
    });
    page.on('console', message => {
        if (/attempt to use a deleted object|no buffer is bound/.test(message.text())) errors.push(message.text());
    });
    try {
        // Opening styles and resources are local; external portfolio assets are unrelated.
        await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, route => route.fulfill({ status: 200, body: '' }));
        if (options.missingVideo) await page.route('**/*.mp4', route => route.fulfill({ status: 404, body: '' }));
        if (options.missingPoster) await page.route('**/starry-v007-poster.jpg', route => route.fulfill({ status: 404, body: '' }));
        await page.addInitScript(config => {
            window.__faults = config.failures || 0;
            window.__particlePixels = 0;
            const getContext = HTMLCanvasElement.prototype.getContext;
            HTMLCanvasElement.prototype.getContext = function (type, ...args) {
                if (this.id === 'starry-splat-canvas' && config.noWebGL && type === 'webgl') return null;
                if (this.id === 'starry-fallback-canvas' && config.no2D && type === '2d') return null;
                return getContext.call(this, type, ...args);
            };
            const proto = WebGLRenderingContext.prototype;
            const shaderParameter = proto.getShaderParameter;
            proto.getShaderParameter = function (shader, key) {
                if (this.canvas.id === 'starry-splat-canvas' && config.shaderFailure && key === this.COMPILE_STATUS) return false;
                return shaderParameter.call(this, shader, key);
            };
            const upload = proto.texImage2D;
            proto.texImage2D = function (...args) {
                if (this.canvas.id === 'starry-splat-canvas' && !ArrayBuffer.isView(args.at(-1)) && window.__faults > 0) {
                    window.__faults--;
                    if (config.securityFailure) throw new DOMException('Injected cross-origin media failure', 'SecurityError');
                    throw new Error('Injected temporary texture failure');
                }
                return upload.apply(this, args);
            };
            const draw = proto.drawArrays;
            proto.drawArrays = function (...args) {
                draw.apply(this, args);
                if (this.canvas.id === 'starry-splat-canvas') {
                    const pixels = new Uint8Array(100 * 100 * 4);
                    this.readPixels(Math.floor(this.canvas.width / 2), Math.floor(this.canvas.height / 3),
                        100, 100, this.RGBA, this.UNSIGNED_BYTE, pixels);
                    window.__particlePixels = pixels.filter((v, i) => i % 4 === 3 && v > 0).length;
                }
            };
            if (config.noVideoCallback) Object.defineProperty(HTMLVideoElement.prototype, 'requestVideoFrameCallback', { value: undefined });
            if (config.blockPlay) {
                HTMLMediaElement.prototype.play = () => Promise.reject(new DOMException('Blocked', 'NotAllowedError'));
                const preventAutoplay = () => {
                    const video = document.getElementById('starry-opening-video');
                    if (video) { video.autoplay = false; video.pause(); }
                };
                new MutationObserver(preventAutoplay).observe(document, { childList: true, subtree: true });
                document.addEventListener('DOMContentLoaded', preventAutoplay);
            }
        }, options);
        await page.goto(options.file ? fileUrl : base + '/index.html', { waitUntil: 'domcontentloaded' });
        await run(page);
        assert.deepEqual(errors, [], 'No opening exceptions or deleted GPU resources');
        const state = await page.evaluate(() => window.__STARRY__?.status || { renderer: 'css-no-js' });
        results.push({ name, pass: true, state });
        console.log('PASS', channel, name, state.renderer);
    } catch (error) {
        results.push({ name, pass: false, error: error.message, errors });
        console.error('FAIL', channel, name, error.message);
        await page.screenshot({ path: path.join(output, `${channel}-${name}-failed.png`) }).catch(() => {});
    } finally { await context.close(); }
}

const waitRenderer = (page, renderer) => page.waitForFunction(expected =>
    window.__STARRY__?.status.renderer === expected && (expected !== 'webgl' || window.__particlePixels > 50), renderer);

async function visualProof(page, label) {
    await page.evaluate(() => document.getElementById('starry-opening-video').pause());
    await page.waitForTimeout(150);
    const withParticles = await page.screenshot({ path: path.join(output, `${channel}-${label}.png`) });
    await page.evaluate(() => {
        for (const id of ['starry-splat-canvas', 'starry-fallback-canvas', 'starry-particle-safety']) {
            document.getElementById(id).style.visibility = 'hidden';
        }
    });
    const withoutParticles = await page.screenshot();
    await page.evaluate(() => {
        for (const id of ['starry-splat-canvas', 'starry-fallback-canvas', 'starry-particle-safety']) {
            document.getElementById(id).style.visibility = '';
        }
    });
    const a = PNG.sync.read(withParticles).data;
    const b = PNG.sync.read(withoutParticles).data;
    let changed = 0;
    for (let i = 0; i < a.length; i += 4) {
        if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 24) changed++;
    }
    assert(changed > 500, `Particles must actually affect screenshot pixels: ${changed}`);
}

(async () => {
    await fs.mkdir(output, { recursive: true });
    browser = await chromium.launch({ channel, headless: true });
    try {
        await test('http-and-scenes', {}, async page => {
            await waitRenderer(page, 'webgl');
            await visualProof(page, 'http-particles');
            await page.click('#starry-enter');
            await page.waitForFunction(() => window.__STARRY_RIVER__.scene === 'river');
            await page.keyboard.press('Escape');
            await waitRenderer(page, 'webgl');
            await page.reload({ waitUntil: 'domcontentloaded' });
            await waitRenderer(page, 'webgl');
        });
        await test('file-direct', { file: true }, async page => {
            await waitRenderer(page, 'canvas2d');
            await visualProof(page, 'file-particles');
            await page.click('#starry-enter');
            await page.keyboard.press('Escape');
            await waitRenderer(page, 'canvas2d');
        });
        await test('context-loss-twice', {}, async page => {
            await waitRenderer(page, 'webgl');
            for (let i = 0; i < 2; i++) {
                const generation = await page.evaluate(() => window.__STARRY__.status.resourceGeneration);
                await page.evaluate(() => {
                    window.__lose = document.getElementById('starry-splat-canvas').getContext('webgl').getExtension('WEBGL_lose_context');
                    window.__lose.loseContext();
                });
                await waitRenderer(page, 'canvas2d');
                if (i === 0) await visualProof(page, 'gpu-lost-particles');
                await page.evaluate(() => window.__lose.restoreContext());
                await waitRenderer(page, 'webgl');
                assert((await page.evaluate(() => window.__STARRY__.status.resourceGeneration)) > generation);
            }
        });
        await test('lifecycle-return', {}, async page => {
            await waitRenderer(page, 'webgl');
            for (const persisted of [true, true, false, true]) {
                const before = await page.evaluate(() => window.__STARRY__.status);
                await page.evaluate(persisted => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted })), persisted);
                const paused = await page.evaluate(() => window.__STARRY__.status);
                assert.equal(paused.suspended, true);
                assert.equal(paused.resourcesReady, persisted);
                await page.evaluate(persisted => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted })), persisted);
                await page.waitForFunction(frames => window.__STARRY__.status.renderedFrames > frames && window.__particlePixels > 50, before.renderedFrames);
                const after = await page.evaluate(() => window.__STARRY__.status);
                assert.equal(after.resourceGeneration, before.resourceGeneration + (persisted ? 0 : 1));
            }
            // Visibility notification uses the real handler; hidden state is simulated.
            await page.evaluate(() => {
                Object.defineProperty(document, 'hidden', { configurable: true, value: true });
                document.dispatchEvent(new Event('visibilitychange'));
            });
            const stopped = await page.evaluate(() => window.__STARRY__.status.renderedFrames);
            await page.waitForTimeout(250);
            assert.equal(await page.evaluate(() => window.__STARRY__.status.renderedFrames), stopped);
            await page.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
            await page.waitForFunction(frames => window.__STARRY__.status.renderedFrames > frames, stopped);
        });
        await test('no-webgl', { noWebGL: true }, async page => {
            await waitRenderer(page, 'canvas2d');
            await visualProof(page, '2d-particles');
        });
        await test('shader-failure', { shaderFailure: true }, page => waitRenderer(page, 'canvas2d'));
        await test('temporary-texture-error', { failures: 2 }, async page => {
            await waitRenderer(page, 'webgl');
            assert.equal(await page.evaluate(() => window.__faults), 0);
        });
        await test('retry-exhaustion-and-recovery', { failures: 100 }, async page => {
            await page.waitForFunction(() => window.__STARRY__?.status.uploadFailures >= 3);
            await waitRenderer(page, 'canvas2d');
            await page.evaluate(() => { window.__faults = 0; document.getElementById('starry-opening-video').dispatchEvent(new Event('canplay')); });
            await waitRenderer(page, 'webgl');
        });
        await test('texture-security', { failures: 100, securityFailure: true }, page => waitRenderer(page, 'canvas2d'));
        await test('video-missing', { missingVideo: true }, async page => {
            await waitRenderer(page, 'canvas2d');
            await visualProof(page, 'poster-particles');
        });
        await test('video-and-poster-missing', { missingVideo: true, missingPoster: true }, async page => {
            await waitRenderer(page, 'css');
            await visualProof(page, 'css-missing-media');
        });
        await test('no-canvas', { noWebGL: true, no2D: true }, async page => {
            await waitRenderer(page, 'css');
            await visualProof(page, 'css-particles');
        });
        await test('reduced-motion', { reduced: true }, async page => {
            await waitRenderer(page, 'webgl');
            assert(await page.evaluate(() => document.getElementById('starry-opening-video').paused));
            await visualProof(page, 'static-particles');
            const before = await page.evaluate(() => window.__STARRY__.status.renderedFrames);
            await page.waitForTimeout(300);
            assert.equal(await page.evaluate(() => window.__STARRY__.status.renderedFrames), before);
            await page.emulateMedia({ reducedMotion: 'no-preference' });
            await page.waitForFunction(frames => window.__STARRY__.status.renderedFrames > frames + 2, before);
            await page.emulateMedia({ reducedMotion: 'reduce' });
            await waitRenderer(page, 'webgl');
        });
        await test('file-reduced-motion', { file: true, reduced: true }, async page => {
            await waitRenderer(page, 'canvas2d');
            await visualProof(page, 'file-static-particles');
        });
        await test('mobile-resize', { mobile: true }, async page => {
            await waitRenderer(page, 'webgl');
            await visualProof(page, 'mobile-particles');
            await page.setViewportSize({ width: 844, height: 390 });
            await waitRenderer(page, 'webgl');
            assert(await page.evaluate(() => document.getElementById('starry-splat-canvas').width === 844));
        });
        await test('autoplay-blocked', { blockPlay: true }, async page => {
            await page.waitForFunction(() => ['webgl', 'canvas2d'].includes(window.__STARRY__?.status.renderer));
            assert(await page.evaluate(() => document.getElementById('starry-opening-video').paused));
            await visualProof(page, 'blocked-play-particles');
        });
        await test('no-video-frame-callback', { noVideoCallback: true }, page => waitRenderer(page, 'webgl'));
        await test('javascript-disabled', { noJS: true }, async page => {
            assert(await page.locator('#starry-particle-safety').isVisible());
            await visualProof(page, 'no-js-particles');
        });
    } finally {
        await browser.close();
        await fs.writeFile(path.join(output, `opening-${channel}-results.json`), JSON.stringify(results, null, 2));
    }
    const failed = results.filter(result => !result.pass);
    console.log(`${results.length - failed.length}/${results.length} ${channel} checks passed`);
    if (failed.length) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
