(() => {
    const scene = document.getElementById('starry-river-scene');
    const canvas = document.getElementById('starry-river-canvas');
    const artCanvas = document.getElementById('starry-river-art-canvas');
    const backgroundImage = scene?.querySelector('.starry-river-image');
    const particleReferenceImage = new Image();
    const panel = document.getElementById('website-project-panel');
    const closeButton = document.getElementById('website-project-close');

    if (!scene || !canvas || !artCanvas || !backgroundImage || !panel || !closeButton) return;

    const context = canvas.getContext('2d', { alpha: true });
    if (!context) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const TAU = Math.PI * 2;
    particleReferenceImage.decoding = 'async';
    particleReferenceImage.src = 'Part 3.png';

    const WEBSITE_PALETTE = [
        '#f3eed2', '#b7dce9', '#f4cf74', '#fffbe8', '#e7a849',
        '#f8f4dc', '#6f9fb9', '#fffef7', '#87bdd4', '#f6da91'
    ];

    /*
     * Website 粒子聚字速度：等待 600ms + 聚合约 400ms，总体约 1 秒。
     * hoverDelay 越小越快；interpolation 越大，粒子聚合越快。
     */
    const WEBSITE_MORPH = {
        hoverDelay: 600,
        interpolation: 0.006
    };

    const WEBSITE_STAR = {
        label: 'Website',
        count: 620,
        fallbackU: 0.765,
        fallbackV: 0.57,
        sourceRegion: { left: 0.67, top: 0.47, right: 0.84, bottom: 0.7 }
    };

    const state = {
        active: false,
        frame: null,
        lastTime: performance.now(),
        width: 1,
        height: 1,
        dpr: 1,
        targetProgress: 0,
        progress: 0,
        scrollVelocity: 0,
        lastWheelTime: -Infinity,
        isRowing: false,
        rowingIntensity: 0,
        rowingPhase: 0,
        rowingCycleDuration: 2.9,
        rowingStopRequested: false,
        pointerX: -1000,
        pointerY: -1000,
        pointerInside: false,
        dragging: false,
        dragY: 0,
        dragDistance: 0,
        hoverStarted: 0,
        hoveringWebsite: false,
        morphPinned: false,
        morph: 0,
        websiteStar: null
    };

    let artRenderer = null;
    let pendingInput = 0;
    import('./river-three.js?v=20260907-1')
        .then(module => module.createRiverRenderer(artCanvas, backgroundImage))
        .then(renderer => {
            artRenderer = renderer;
            resize();
            if (pendingInput && state.active) renderer.input(pendingInput);
            pendingInput = 0;
            renderer.render();
        })
        .catch(error => {
            scene.dataset.artError = 'true';
            console.error('Starry River: Three.js scene could not start.', error);
        });

    function randomBetween(min, max) {
        return min + Math.random() * (max - min);
    }

    function createFallbackParticle(index) {
        const angle = Math.random() * TAU;
        const radius = Math.pow(Math.random(), 0.72);
        return {
            sourceU: WEBSITE_STAR.fallbackU + Math.cos(angle) * radius * 0.032,
            sourceV: WEBSITE_STAR.fallbackV + Math.sin(angle) * radius * 0.055,
            phase: Math.random() * TAU,
            size: randomBetween(0.7, 2.2),
            color: ['#fff5c7', '#f4cf74', '#e7a849', '#fffbe8'][index % 4],
            targetX: 0,
            targetY: 0
        };
    }

    function createWebsiteStar() {
        return {
            centerU: WEBSITE_STAR.fallbackU,
            centerV: WEBSITE_STAR.fallbackV,
            particles: Array.from({ length: WEBSITE_STAR.count }, (_, index) => createFallbackParticle(index))
        };
    }

    // === WEBSITE PARTICLE MORPH: KEEP THIS BLOCK ===
    function buildWebsiteTargets(star) {
        const textCanvas = document.createElement('canvas');
        const textContext = textCanvas.getContext('2d', { willReadFrequently: true });
        textCanvas.width = 420;
        textCanvas.height = 110;
        textContext.clearRect(0, 0, textCanvas.width, textCanvas.height);
        textContext.fillStyle = '#fff';
        textContext.font = '700 58px Georgia, serif';
        textContext.textAlign = 'center';
        textContext.textBaseline = 'middle';
        textContext.fillText(WEBSITE_STAR.label, textCanvas.width / 2, textCanvas.height / 2 + 2);

        const pixels = textContext.getImageData(0, 0, textCanvas.width, textCanvas.height).data;
        const targets = [];
        for (let y = 0; y < textCanvas.height; y += 3) {
            for (let x = 0; x < textCanvas.width; x += 3) {
                if (pixels[(y * textCanvas.width + x) * 4 + 3] > 90) {
                    targets.push({ x: x - textCanvas.width / 2, y: y - textCanvas.height / 2 });
                }
            }
        }

        for (let index = 0; index < star.particles.length; index += 1) {
            const target = targets[(index * 7) % targets.length];
            star.particles[index].targetX = target.x;
            star.particles[index].targetY = target.y;
        }
    }

    function sampleRiverReflection(star) {
        if (!particleReferenceImage.naturalWidth || !particleReferenceImage.naturalHeight) return;

        const sourceCanvas = document.createElement('canvas');
        const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently: true });
        sourceCanvas.width = particleReferenceImage.naturalWidth;
        sourceCanvas.height = particleReferenceImage.naturalHeight;

        try {
            sourceContext.drawImage(particleReferenceImage, 0, 0);
            const imageData = sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height).data;
            const region = WEBSITE_STAR.sourceRegion;
            const left = Math.floor(region.left * sourceCanvas.width);
            const right = Math.ceil(region.right * sourceCanvas.width);
            const top = Math.floor(region.top * sourceCanvas.height);
            const bottom = Math.ceil(region.bottom * sourceCanvas.height);
            const candidates = [];

            for (let y = top; y < bottom; y += 2) {
                for (let x = left; x < right; x += 2) {
                    const pixelIndex = (y * sourceCanvas.width + x) * 4;
                    const red = imageData[pixelIndex];
                    const green = imageData[pixelIndex + 1];
                    const blue = imageData[pixelIndex + 2];
                    const alpha = imageData[pixelIndex + 3];
                    const luminance = red * 0.28 + green * 0.58 + blue * 0.14;
                    const warmLight = red > blue * 1.08 && green > blue * 0.78;

                    if (alpha > 180 && luminance > 112 && warmLight) {
                        candidates.push({ x, y, red, green, blue, luminance });
                    }
                }
            }

            if (candidates.length < 80) return;
            candidates.sort(() => Math.random() - 0.5);
            let centerU = 0;
            let centerV = 0;

            for (let index = 0; index < star.particles.length; index += 1) {
                const source = candidates[index % candidates.length];
                const particle = star.particles[index];
                particle.sourceU = source.x / sourceCanvas.width;
                particle.sourceV = source.y / sourceCanvas.height;
                particle.size = randomBetween(0.65, 1.9) * (0.75 + source.luminance / 255 * 0.45);
                particle.color = WEBSITE_PALETTE[(index * 7) % WEBSITE_PALETTE.length];
                centerU += particle.sourceU;
                centerV += particle.sourceV;
            }

            star.centerU = centerU / star.particles.length;
            star.centerV = centerV / star.particles.length;
        } catch (error) {
            console.warn('Starry River: using the built-in reflection fallback.', error);
        }
    }

    function getCoverPoint(u, v) {
        const sourceWidth = backgroundImage.naturalWidth || 1672;
        const sourceHeight = backgroundImage.naturalHeight || 942;
        const scale = Math.max(state.width / sourceWidth, state.height / sourceHeight);
        const offsetX = (state.width - sourceWidth * scale) / 2;
        const offsetY = (state.height - sourceHeight * scale) / 2;
        return {
            x: offsetX + u * sourceWidth * scale,
            y: offsetY + v * sourceHeight * scale
        };
    }

    function websitePosition() {
        const raw = getCoverPoint(state.websiteStar.centerU, state.websiteStar.centerV);
        const textHalfWidth = Math.min(190, state.width * 0.3);
        return {
            x: Math.min(state.width - textHalfWidth, Math.max(textHalfWidth, raw.x)),
            y: Math.min(state.height - 70, Math.max(70, raw.y))
        };
    }

    function drawWebsiteParticles(time) {
        const star = state.websiteStar;
        const targetCenter = websitePosition();
        const targetScale = Math.min(1, state.width / 1100);
        const morph = state.morph;

        context.save();
        context.globalCompositeOperation = 'lighter';
        for (let index = 0; index < star.particles.length; index += 1) {
            const particle = star.particles[index];
            const source = getCoverPoint(particle.sourceU, particle.sourceV);
            const shimmerX = Math.sin(time * 0.0014 + particle.phase) * 1.25;
            const shimmerY = Math.cos(time * 0.0018 + particle.phase) * 0.8;
            const x = (source.x + shimmerX) * (1 - morph)
                + (targetCenter.x + particle.targetX * targetScale) * morph;
            const y = (source.y + shimmerY) * (1 - morph)
                + (targetCenter.y + particle.targetY * targetScale) * morph;
            const pulse = 0.48 + Math.sin(time * 0.003 + particle.phase) * 0.18;

            context.globalAlpha = Math.min(1, pulse + morph * 0.48 + (state.hoveringWebsite ? 0.12 : 0));
            context.fillStyle = particle.color;
            context.beginPath();
            context.arc(x, y, particle.size * (1 + morph * 0.22), 0, TAU);
            context.fill();
        }
        context.restore();
    }
    // === END WEBSITE PARTICLE MORPH ===

    function resize() {
        state.width = Math.max(1, scene.clientWidth);
        state.height = Math.max(1, scene.clientHeight);
        state.dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.round(state.width * state.dpr);
        canvas.height = Math.round(state.height * state.dpr);
        canvas.style.width = `${state.width}px`;
        canvas.style.height = `${state.height}px`;
        context.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
        artRenderer?.resize(state.width, state.height, state.dpr);
        artRenderer?.render();
        if (state.active && reduceMotion.matches) drawStill();
    }

    function isWebsiteAt(x, y) {
        const position = websitePosition();
        const textExtra = state.morph > 0.32 ? Math.min(190, state.width * 0.3) * state.morph : 0;
        return Math.abs(x - position.x) < 116 + textExtra
            && Math.abs(y - position.y) < 96;
    }

    function addScrollInput(distance) {
        if (distance <= 0 || reduceMotion.matches) return;
        if (artRenderer) artRenderer.input(distance);
        else pendingInput = Math.min(500, pendingInput + distance);
    }

    function updateJourney(delta) {
        if (!artRenderer || reduceMotion.matches || panel.classList.contains('is-open')) return;
        artRenderer.update(delta);
        const motion = artRenderer.motion;
        state.progress = motion.progress;
        state.targetProgress = motion.progress;
        state.scrollVelocity = motion.drive;
        state.isRowing = motion.active;
        state.rowingPhase = motion.phase;
        state.rowingIntensity = motion.intensity;
        state.rowingCycleDuration = motion.period;
        state.rowingStopRequested = motion.finishing;
        scene.classList.toggle('is-rowing', motion.active);
        scene.dataset.rowing = String(motion.active);
    }

    function stopRowing() {
        pendingInput = 0;
        artRenderer?.stop();
        state.isRowing = false;
        state.rowingIntensity = 0;
        state.rowingPhase = 0;
        state.scrollVelocity = 0;
        scene.classList.remove('is-rowing');
        scene.dataset.rowing = 'false';
    }

    function drawStill() {
        artRenderer?.render();
        context.clearRect(0, 0, state.width, state.height);
        drawWebsiteParticles(0);
    }

    function updateWebsiteMorph(time, delta) {
        const nextHover = state.pointerInside && !state.dragging
            && isWebsiteAt(state.pointerX, state.pointerY);
        if (nextHover !== state.hoveringWebsite) {
            state.hoveringWebsite = nextHover;
            state.hoverStarted = time;
        }
        const hoverReady = state.hoveringWebsite
            && time - state.hoverStarted >= WEBSITE_MORPH.hoverDelay;
        const targetMorph = state.morphPinned || hoverReady ? 1 : 0;
        state.morph += (targetMorph - state.morph)
            * Math.min(1, delta * WEBSITE_MORPH.interpolation);
        scene.style.cursor = state.hoveringWebsite ? 'pointer' : (state.dragging ? 'grabbing' : 'grab');
    }

    function render(time) {
        if (!state.active) {
            state.frame = null;
            return;
        }
        if (time - state.lastTime < 16) {
            state.frame = window.requestAnimationFrame(render);
            return;
        }

        const delta = Math.min(250, Math.max(0, time - state.lastTime));
        state.lastTime = time;
        updateJourney(delta);
        updateWebsiteMorph(time, delta);

        artRenderer?.render();
        context.clearRect(0, 0, state.width, state.height);
        drawWebsiteParticles(time);
        state.frame = window.requestAnimationFrame(render);
    }

    function start() {
        if (state.frame) return;
        state.lastTime = performance.now();
        state.frame = window.requestAnimationFrame(render);
    }

    function stop() {
        if (state.frame) window.cancelAnimationFrame(state.frame);
        state.frame = null;
    }

    function activate() {
        state.active = true;
        scene.dataset.active = 'true';
        resize();
        start();
    }

    function deactivate() {
        state.active = false;
        state.dragging = false;
        state.scrollVelocity = 0;
        state.lastWheelTime = -Infinity;
        stopRowing();
        scene.dataset.active = 'false';
        closeWebsiteProject();
        stop();
    }

    function setProgress(progress) {
        state.targetProgress = Math.min(1, Math.max(0, Number(progress) || 0));
        state.progress = state.targetProgress;
        artRenderer?.setProgress(state.progress);
        drawStill();
    }

    function openWebsiteProject() {
        stopRowing();
        panel.classList.add('is-open');
        panel.setAttribute('aria-hidden', 'false');
        closeButton.focus({ preventScroll: true });
    }

    function closeWebsiteProject() {
        panel.classList.remove('is-open');
        panel.setAttribute('aria-hidden', 'true');
    }

    scene.addEventListener('pointerdown', (event) => {
        if (!state.active || panel.classList.contains('is-open')) return;
        state.dragging = true;
        state.dragY = event.clientY;
        state.dragDistance = 0;
        scene.classList.add('is-dragging');
        scene.setPointerCapture?.(event.pointerId);
    });

    scene.addEventListener('pointermove', (event) => {
        const bounds = scene.getBoundingClientRect();
        state.pointerX = (event.clientX - bounds.left) * (state.width / bounds.width);
        state.pointerY = (event.clientY - bounds.top) * (state.height / bounds.height);
        state.pointerInside = true;
        if (!state.dragging) return;
        const deltaY = state.dragY - event.clientY;
        state.dragY = event.clientY;
        state.dragDistance += Math.abs(deltaY);
    });

    function endDrag(event) {
        if (!state.dragging) return;
        state.dragging = false;
        scene.classList.remove('is-dragging');
        scene.releasePointerCapture?.(event.pointerId);
    }

    scene.addEventListener('pointerup', (event) => {
        const clickedWebsite = state.dragDistance < 12
            && isWebsiteAt(state.pointerX, state.pointerY);
        endDrag(event);
        if (!clickedWebsite) return;

        if (state.morph < 0.82) {
            state.morphPinned = true;
            return;
        }
        openWebsiteProject();
    });
    scene.addEventListener('pointercancel', endDrag);
    scene.addEventListener('pointerleave', () => { state.pointerInside = false; });
    scene.addEventListener('pointerenter', () => { state.pointerInside = true; });

    scene.addEventListener('wheel', (event) => {
        if (!state.active || panel.classList.contains('is-open') || event.deltaY === 0) return;

        const modeScale = event.deltaMode === 1 ? 18 : (event.deltaMode === 2 ? state.height : 1);
        const distance = Math.min(220, Math.abs(event.deltaY) * modeScale);
        event.preventDefault();
        addScrollInput(distance);
    }, { passive: false });

    closeButton.addEventListener('click', closeWebsiteProject);
    panel.querySelectorAll('[data-close-website-project]').forEach((link) => {
        link.addEventListener('click', closeWebsiteProject);
    });
    window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && panel.classList.contains('is-open')) {
            event.stopImmediatePropagation();
            closeWebsiteProject();
        }
    }, true);
    window.addEventListener('resize', resize, { passive: true });
    reduceMotion.addEventListener('change', () => {
        if (reduceMotion.matches) stopRowing();
        if (state.active) start();
    });
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) { stopRowing(); stop(); }
        else if (state.active) start();
    });
    window.addEventListener('pagehide', () => { stop(); artRenderer?.dispose(); }, { once: true });

    state.websiteStar = createWebsiteStar();
    buildWebsiteTargets(state.websiteStar);
    if (particleReferenceImage.complete && particleReferenceImage.naturalWidth) {
        sampleRiverReflection(state.websiteStar);
    } else {
        particleReferenceImage.addEventListener(
            'load',
            () => sampleRiverReflection(state.websiteStar),
            { once: true }
        );
    }
    resize();

    window.StarryRiverScene = Object.freeze({
        activate,
        deactivate,
        setProgress,
        openWebsiteProject,
        get progress() { return state.progress; },
        get journeyProgress() { return state.progress; },
        get targetProgress() { return state.targetProgress; },
        get scrollVelocity() { return state.scrollVelocity; },
        get isRowing() { return state.isRowing; },
        get rowingIntensity() { return state.rowingIntensity; },
        get rowingPhase() { return state.rowingPhase; },
        get rowingCycleDuration() { return state.rowingCycleDuration; },
        get diagnostics() { return artRenderer?.diagnostics || null; },
        get artReady() { return Boolean(artRenderer?.ready); },
        get websitePosition() { return { ...websitePosition() }; },
        get morph() { return state.morph; },
        get morphSettings() { return { ...WEBSITE_MORPH }; }
    });
})();
