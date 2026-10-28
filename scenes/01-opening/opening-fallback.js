/* Independent, origin-safe particle layer. drawImage does not read pixels,
 * so local file videos can be masked into particles without bypassing CORS.
 * CSS particles remain visible until an actual canvas frame is available. */
(() => {
    const canvas = document.getElementById('starry-fallback-canvas');
    const safety = document.getElementById('starry-particle-safety');
    const video = document.getElementById('starry-opening-video');
    const experience = document.getElementById('starry-experience');
    if (!canvas || !safety || !video || !experience) return;

    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    let context = null;
    let maskContext = null;
    const mask = document.createElement('canvas');
    try {
        context = canvas.getContext('2d');
        maskContext = mask.getContext('2d');
    } catch { /* CSS particles remain available. */ }
    const poster = new Image();
    let enabled = true;
    let active = true;
    let suspended = false;
    let frame = null;
    let lastFrame = -Infinity;
    let drawnFrames = 0;
    let particleCount = 0;
    let reason = 'loading';

    function hash(x, y) {
        const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
        return n - Math.floor(n);
    }

    function resize() {
        if (!context || !maskContext) return;
        const bounds = experience.getBoundingClientRect();
        const width = Math.max(1, Math.round(bounds.width));
        const height = Math.max(1, Math.round(bounds.height));
        if (canvas.width === width && canvas.height === height) return;
        canvas.width = mask.width = width;
        canvas.height = mask.height = height;
        const mobile = width < 768;
        const spacing = Math.max(mobile ? 4.4 : 4, Math.sqrt(width * height / (mobile ? 18000 : 60000))) * 0.85;
        const radius = (mobile ? 1.95 : 2.21) / 2;
        particleCount = 0;
        maskContext.beginPath();
        for (let y = -1; y <= Math.ceil(height / spacing); y++) {
            for (let x = -1; x <= Math.ceil(width / spacing); x++) {
                const px = x * spacing + (hash(x + 17.3, y + 4.1) - 0.5) * spacing * 0.72;
                const py = y * spacing + (hash(x + 3.7, y + 21.9) - 0.5) * spacing * 0.72;
                maskContext.moveTo(px + radius, py);
                maskContext.arc(px, py, radius, 0, Math.PI * 2);
                particleCount++;
            }
        }
        maskContext.fillStyle = '#fff';
        maskContext.fill();
    }

    function paint(time) {
        if (!context || !maskContext || context.isContextLost?.()) return false;
        resize();
        const source = !video.error && video.readyState >= 2 && video.videoWidth ? video
            : poster.complete && poster.naturalWidth ? poster : null;
        if (!source) return false;
        const width = source.videoWidth || source.naturalWidth;
        const height = source.videoHeight || source.naturalHeight;
        const scale = Math.max(canvas.width / width, canvas.height / height);
        try {
            context.globalCompositeOperation = 'source-over';
            context.clearRect(0, 0, canvas.width, canvas.height);
            // Match the video and WebGL layer: horizontal center, uncropped sky.
            context.drawImage(source, (canvas.width - width * scale) / 2,
                0, width * scale, height * scale);
            context.globalCompositeOperation = 'destination-in';
            const drift = motion.matches ? 0 : Math.sin(time / 4000) * 0.7;
            context.drawImage(mask, drift, drift * 0.6);
            context.globalCompositeOperation = 'source-over';
            canvas.hidden = false;
            safety.hidden = true;
            drawnFrames++;
            return true;
        } catch {
            canvas.hidden = true;
            safety.hidden = false;
            return false;
        }
    }

    function stop() {
        if (frame !== null) cancelAnimationFrame(frame);
        frame = null;
    }

    function render(time) {
        frame = null;
        if (!enabled || !active || suspended || document.hidden) return;
        if (time - lastFrame >= 1000 / 24 || motion.matches) {
            lastFrame = time;
            if (!paint(time)) {
                canvas.hidden = true;
                safety.hidden = false;
            }
        }
        if (!motion.matches) frame = requestAnimationFrame(render);
    }

    function refresh() {
        if (!enabled || !active || suspended || document.hidden) return;
        stop();
        lastFrame = -Infinity;
        // Paint synchronously when handing off from a lost WebGL context.
        if (!paint(performance.now())) safety.hidden = false;
        if (!motion.matches) frame = requestAnimationFrame(render);
    }

    window.StarryOpeningFallback = Object.freeze({
        show(cause = 'fallback') { enabled = true; reason = cause; refresh(); },
        hide() { enabled = false; stop(); canvas.hidden = true; safety.hidden = true; },
        activate() { active = true; suspended = false; refresh(); },
        deactivate() { active = false; stop(); },
        suspend() { suspended = true; stop(); },
        resume() { suspended = false; refresh(); },
        refresh,
        get status() {
            return { enabled, active, reason, frames: drawnFrames, particles: particleCount,
                renderer: !canvas.hidden ? 'canvas2d' : !safety.hidden ? 'css' : 'hidden' };
        }
    });
    for (const event of ['loadeddata', 'canplay', 'seeked', 'error', 'emptied']) video.addEventListener(event, refresh);
    poster.addEventListener('load', refresh);
    poster.addEventListener('error', refresh);
    window.addEventListener('resize', refresh, { passive: true });
    document.addEventListener('visibilitychange', () => document.hidden ? stop() : refresh());
    motion.addEventListener('change', refresh);
    canvas.addEventListener('contextlost', event => {
        event.preventDefault();
        if (enabled) { canvas.hidden = true; safety.hidden = false; }
    });
    canvas.addEventListener('contextrestored', () => { canvas.width = 0; refresh(); });
    poster.src = video.poster;
    refresh();
})();
