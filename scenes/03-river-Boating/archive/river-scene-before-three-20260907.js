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

    // Part 3 core rule: Scroll = Player input. No scroll means no journey movement.
    const JOURNEY_SETTINGS = {
        inputGain: 0.000045,
        maxVelocity: 0.024,
        velocityDecay: 0.84,
        progressEasing: 0.065,
        baseScale: 1.02,
        maxScale: 1.066,
        maxVerticalShift: 0.42
    };
    const ROWING_SETTINGS = {
        startThreshold: 0.00018,
        stopThreshold: 0.000075,
        inputHoldDuration: 340,
        minimumIntensity: 0.36,
        finishingIntensity: 0.28,
        intensityEasing: 0.16,
        slowCycleDuration: 1.72,
        fastCycleDuration: 1.22
    };
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
        rowingCycleDuration: ROWING_SETTINGS.slowCycleDuration,
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

    function createShader(gl, type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            const message = gl.getShaderInfoLog(shader);
            gl.deleteShader(shader);
            throw new Error(message || 'Unable to compile the river shader.');
        }
        return shader;
    }

    function createRowingArtRenderer(target, image) {
        const gl = target.getContext('webgl', {
            alpha: true,
            antialias: true,
            depth: false,
            preserveDrawingBuffer: false
        });
        if (!gl) return null;

        const vertexSource = `
            attribute vec2 a_position;
            attribute vec2 a_uv;
            uniform vec2 u_uvScale;
            uniform vec2 u_uvOffset;
            uniform float u_phase;
            uniform float u_intensity;
            uniform float u_progress;
            varying vec2 v_uv;

            float ellipse(vec2 uv, vec2 center, vec2 radius) {
                vec2 d = (uv - center) / radius;
                return exp(-dot(d, d) * 2.8);
            }

            float segmentMask(vec2 uv, vec2 start, vec2 end, float width) {
                vec2 segment = end - start;
                float t = clamp(dot(uv - start, segment) / dot(segment, segment), 0.0, 1.0);
                float distanceToSegment = length(uv - (start + segment * t));
                return exp(-pow(distanceToSegment / width, 2.0) * 2.4);
            }

            void main() {
                vec2 uv = a_uv;
                vec2 position = a_position;
                float angle = u_phase * 6.28318530718;
                float stroke = sin(angle) + sin(angle * 2.0 - 0.45) * 0.18;
                float lift = cos(angle - 0.4);

                float leftArm = ellipse(uv, vec2(0.397, 0.558), vec2(0.105, 0.125));
                float rightArm = ellipse(uv, vec2(0.603, 0.558), vec2(0.105, 0.125));
                float torso = ellipse(uv, vec2(0.5, 0.57), vec2(0.135, 0.22));
                float leftOar = segmentMask(uv, vec2(0.39, 0.57), vec2(0.10, 0.84), 0.035);
                float rightOar = segmentMask(uv, vec2(0.61, 0.57), vec2(0.90, 0.84), 0.035);

                vec2 motion = vec2(0.0);
                motion.x += (-leftArm + rightArm) * stroke * 0.050;
                motion.y += (leftArm + rightArm) * lift * 0.048;
                motion.y += torso * stroke * 0.016;
                motion.x += (-leftOar + rightOar) * stroke * 0.035;
                motion.y += (leftOar + rightOar) * lift * 0.055;
                position += motion * u_intensity;

                float boatAnchor = ellipse(uv, vec2(0.5, 0.75), vec2(0.31, 0.31));
                float environment = (1.0 - boatAnchor) * u_progress * 0.022;
                position = vec2(0.0, -0.22) + (position - vec2(0.0, -0.22)) * (1.0 + environment);

                v_uv = u_uvOffset + uv * u_uvScale;
                gl_Position = vec4(position, 0.0, 1.0);
            }
        `;
        const fragmentSource = `
            precision mediump float;
            uniform sampler2D u_texture;
            varying vec2 v_uv;
            void main() {
                gl_FragColor = texture2D(u_texture, v_uv);
            }
        `;

        let program;
        try {
            const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexSource);
            const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
            program = gl.createProgram();
            gl.attachShader(program, vertexShader);
            gl.attachShader(program, fragmentShader);
            gl.linkProgram(program);
            gl.deleteShader(vertexShader);
            gl.deleteShader(fragmentShader);
            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
                throw new Error(gl.getProgramInfoLog(program) || 'Unable to link the river shader.');
            }
        } catch (error) {
            console.warn('Starry River: WebGL art layer unavailable.', error);
            return null;
        }

        const columns = 80;
        const rows = 45;
        const vertices = [];
        const indices = [];
        for (let row = 0; row <= rows; row += 1) {
            for (let column = 0; column <= columns; column += 1) {
                const u = column / columns;
                const v = row / rows;
                vertices.push(u * 2 - 1, 1 - v * 2, u, v);
            }
        }
        for (let row = 0; row < rows; row += 1) {
            for (let column = 0; column < columns; column += 1) {
                const topLeft = row * (columns + 1) + column;
                const bottomLeft = (row + 1) * (columns + 1) + column;
                indices.push(topLeft, bottomLeft, topLeft + 1, topLeft + 1, bottomLeft, bottomLeft + 1);
            }
        }

        const vertexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
        const indexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

        const positionLocation = gl.getAttribLocation(program, 'a_position');
        const uvLocation = gl.getAttribLocation(program, 'a_uv');
        const uniforms = {
            uvScale: gl.getUniformLocation(program, 'u_uvScale'),
            uvOffset: gl.getUniformLocation(program, 'u_uvOffset'),
            phase: gl.getUniformLocation(program, 'u_phase'),
            intensity: gl.getUniformLocation(program, 'u_intensity'),
            progress: gl.getUniformLocation(program, 'u_progress')
        };
        const texture = gl.createTexture();
        let ready = false;
        let viewWidth = 1;
        let viewHeight = 1;
        let pixelRatio = 1;

        function uploadTexture() {
            if (!image.naturalWidth || !image.naturalHeight) return;
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
            ready = true;
            renderRenderer(0, 0, 0);
        }

        function resizeRenderer(width, height, dpr) {
            viewWidth = Math.max(1, width);
            viewHeight = Math.max(1, height);
            pixelRatio = dpr;
            target.width = Math.round(viewWidth * pixelRatio);
            target.height = Math.round(viewHeight * pixelRatio);
            target.style.width = `${viewWidth}px`;
            target.style.height = `${viewHeight}px`;
            gl.viewport(0, 0, target.width, target.height);
        }

        function renderRenderer(phase, intensity, progress) {
            if (!ready) return;
            gl.useProgram(program);
            gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
            gl.enableVertexAttribArray(positionLocation);
            gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 16, 0);
            gl.enableVertexAttribArray(uvLocation);
            gl.vertexAttribPointer(uvLocation, 2, gl.FLOAT, false, 16, 8);
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, texture);

            const viewAspect = viewWidth / viewHeight;
            const imageAspect = image.naturalWidth / image.naturalHeight;
            let scaleX = 1;
            let scaleY = 1;
            if (viewAspect > imageAspect) scaleY = imageAspect / viewAspect;
            else scaleX = viewAspect / imageAspect;
            gl.uniform2f(uniforms.uvScale, scaleX, scaleY);
            gl.uniform2f(uniforms.uvOffset, (1 - scaleX) / 2, (1 - scaleY) / 2);
            gl.uniform1f(uniforms.phase, phase);
            gl.uniform1f(uniforms.intensity, intensity);
            gl.uniform1f(uniforms.progress, progress);
            gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0);
        }

        if (image.complete && image.naturalWidth) uploadTexture();
        else image.addEventListener('load', uploadTexture, { once: true });

        return {
            resize: resizeRenderer,
            render: renderRenderer,
            get ready() { return ready; }
        };
    }

    const artRenderer = createRowingArtRenderer(artCanvas, backgroundImage);

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
        artRenderer?.render(state.rowingPhase, state.rowingIntensity, state.progress);
        if (state.active && reduceMotion.matches) drawStill();
    }

    function isWebsiteAt(x, y) {
        const position = websitePosition();
        const textExtra = state.morph > 0.32 ? Math.min(190, state.width * 0.3) * state.morph : 0;
        return Math.abs(x - position.x) < 116 + textExtra
            && Math.abs(y - position.y) < 96;
    }

    function addScrollInput(distance) {
        if (distance <= 0) return;
        state.lastWheelTime = performance.now();
        state.scrollVelocity = Math.min(
            JOURNEY_SETTINGS.maxVelocity,
            state.scrollVelocity + distance * JOURNEY_SETTINGS.inputGain
        );
    }

    function updateJourney(delta) {
        const frameScale = delta / 16.67;
        if (state.scrollVelocity > 0.00001) {
            if (state.targetProgress < 1) {
                state.targetProgress = Math.min(
                    1,
                    state.targetProgress + state.scrollVelocity * frameScale
                );
            }
            state.scrollVelocity *= Math.pow(JOURNEY_SETTINGS.velocityDecay, frameScale);
        } else {
            state.scrollVelocity = 0;
        }

        const easing = 1 - Math.pow(1 - JOURNEY_SETTINGS.progressEasing, frameScale);
        state.progress += (state.targetProgress - state.progress) * easing;

        if (Math.abs(state.targetProgress - state.progress) < 0.00001) {
            state.progress = state.targetProgress;
        }

        const scale = JOURNEY_SETTINGS.baseScale
            + state.progress * (JOURNEY_SETTINGS.maxScale - JOURNEY_SETTINGS.baseScale);
        const verticalShift = state.progress * JOURNEY_SETTINGS.maxVerticalShift;
        scene.style.setProperty('--journey-scale', scale.toFixed(5));
        scene.style.setProperty('--journey-y', `${verticalShift.toFixed(4)}%`);
    }

    function applyRowingPose() {
        if (!state.isRowing || state.rowingIntensity <= 0.0001) {
            scene.classList.remove('is-rowing');
            scene.dataset.rowing = 'false';
            return;
        }
        scene.classList.add('is-rowing');
        scene.dataset.rowing = 'true';
    }

    function stopRowing() {
        state.isRowing = false;
        state.rowingStopRequested = false;
        state.rowingIntensity = 0;
        state.rowingPhase = 0;
        state.rowingCycleDuration = ROWING_SETTINGS.slowCycleDuration;
        applyRowingPose();
    }

    function updateRowing(delta, time) {
        const threshold = state.isRowing
            ? ROWING_SETTINGS.stopThreshold
            : ROWING_SETTINGS.startThreshold;
        const hasRecentWheelInput = time - state.lastWheelTime
            < ROWING_SETTINGS.inputHoldDuration;
        const hasRowingInput = hasRecentWheelInput || state.scrollVelocity > threshold;

        if (hasRowingInput) {
            state.isRowing = true;
            state.rowingStopRequested = false;
        } else if (state.isRowing) {
            state.rowingStopRequested = true;
        }

        if (!state.isRowing) {
            applyRowingPose();
            return;
        }

        const normalizedVelocity = Math.min(
            1,
            state.scrollVelocity / JOURNEY_SETTINGS.maxVelocity
        );
        const activeIntensity = ROWING_SETTINGS.minimumIntensity
            + Math.sqrt(normalizedVelocity) * (1 - ROWING_SETTINGS.minimumIntensity);
        const targetIntensity = hasRowingInput
            ? activeIntensity
            : ROWING_SETTINGS.finishingIntensity;
        const frameScale = delta / 16.67;
        const intensityEase = 1 - Math.pow(1 - ROWING_SETTINGS.intensityEasing, frameScale);
        state.rowingIntensity += (targetIntensity - state.rowingIntensity) * intensityEase;
        state.rowingCycleDuration = ROWING_SETTINGS.slowCycleDuration
            - (ROWING_SETTINGS.slowCycleDuration - ROWING_SETTINGS.fastCycleDuration)
                * state.rowingIntensity;

        const previousPhase = state.rowingPhase;
        const phaseAdvance = delta / (state.rowingCycleDuration * 1000);
        const nextPhase = previousPhase + phaseAdvance;

        if (state.rowingStopRequested && nextPhase >= 1) {
            stopRowing();
            return;
        }

        state.rowingPhase = nextPhase % 1;
        applyRowingPose();
    }

    function drawStill() {
        artRenderer?.render(state.rowingPhase, state.rowingIntensity, state.progress);
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

        const delta = Math.min(48, Math.max(8, time - state.lastTime));
        state.lastTime = time;
        updateJourney(delta);
        updateRowing(delta, time);
        updateWebsiteMorph(time, delta);

        artRenderer?.render(state.rowingPhase, state.rowingIntensity, state.progress);
        context.clearRect(0, 0, state.width, state.height);
        drawWebsiteParticles(time);
        state.frame = window.requestAnimationFrame(render);
    }

    function start() {
        if (state.frame || reduceMotion.matches) return;
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
        if (reduceMotion.matches) drawStill();
        else start();
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
        state.scrollVelocity = 0;
        if (reduceMotion.matches) {
            state.progress = state.targetProgress;
            updateJourney(16.67);
            drawStill();
        }
    }

    function openWebsiteProject() {
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
        if (state.targetProgress < 0.995) event.preventDefault();
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
        if (reduceMotion.matches) stop();
        else if (state.active) start();
    });
    window.addEventListener('pagehide', stop, { once: true });

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
        get artReady() { return Boolean(artRenderer?.ready); },
        get websitePosition() { return { ...websitePosition() }; },
        get morph() { return state.morph; },
        get morphSettings() { return { ...WEBSITE_MORPH }; }
    });
})();
