(() => {
    const experience = document.getElementById('starry-experience');
    const openingVideo = document.getElementById('starry-opening-video');
    const enterButton = document.getElementById('starry-enter');
    const fallbackCanvas = document.getElementById('starry-splat-canvas');

    if (!experience || !openingVideo || !enterButton || !fallbackCanvas) return;

    const SPLAT_SETTINGS = Object.freeze({
        shape: 'round',
        playbackRate: 0.5,
        desktopTargetCount: 85000,
        mobileTargetCount: 42000,
        desktopPointSize: 5.8,
        mobilePointSize: 5.2
    });

    function applyPlaybackRate() {
        openingVideo.defaultPlaybackRate = SPLAT_SETTINGS.playbackRate;
        openingVideo.playbackRate = SPLAT_SETTINGS.playbackRate;
    }

    function playOpeningVideo() {
        applyPlaybackRate();
        const playAttempt = openingVideo.play();
        if (playAttempt && typeof playAttempt.catch === 'function') {
            playAttempt.catch(() => {});
        }
    }

    applyPlaybackRate();

    const canvas = document.createElement('canvas');
    canvas.id = fallbackCanvas.id;
    canvas.className = fallbackCanvas.className;
    canvas.setAttribute('aria-hidden', 'true');

    const gl = canvas.getContext('webgl', {
        alpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        premultipliedAlpha: true,
        preserveDrawingBuffer: false,
        powerPreference: 'high-performance'
    });

    if (!gl) return;

    const vertexShaderSource = `
        precision highp float;

        attribute vec2 a_uv;
        attribute float a_seed;

        uniform vec2 u_resolution;
        uniform vec2 u_mouse;
        uniform vec2 u_cover;
        uniform float u_mouse_active;
        uniform float u_time;
        uniform float u_point_size;
        uniform float u_round_splats;

        varying vec2 v_texture_uv;
        varying float v_seed;
        varying float v_influence;

        vec2 tangent(vec2 vector) {
            return normalize(vec2(-vector.y, vector.x) + vec2(0.00001));
        }

        void main() {
            vec2 position = a_uv;
            float aspect = u_resolution.x / max(u_resolution.y, 1.0);
            float sky_mask = 1.0 - smoothstep(0.58, 0.78, a_uv.y);

            vec2 first_center = vec2(0.54, 0.34);
            vec2 second_center = vec2(0.72, 0.48);
            vec2 first_delta = vec2((position.x - first_center.x) * aspect, position.y - first_center.y);
            vec2 second_delta = vec2((position.x - second_center.x) * aspect, position.y - second_center.y);
            float first_weight = exp(-dot(first_delta, first_delta) * 7.0);
            float second_weight = exp(-dot(second_delta, second_delta) * 11.0);
            float base_phase = u_time * 0.045 + a_seed * 6.2831853;
            vec2 base_tangent = tangent(first_delta) * first_weight + tangent(second_delta) * second_weight * 0.72;
            vec2 base_radial = normalize(first_delta + vec2(0.00001)) * first_weight
                + normalize(second_delta + vec2(0.00001)) * second_weight * 0.72;
            vec2 base_flow = base_tangent * sin(base_phase) + base_radial * cos(base_phase) * 0.32;
            position += vec2(base_flow.x / aspect, base_flow.y) * 0.0062 * sky_mask;

            vec2 mouse_delta = vec2((position.x - u_mouse.x) * aspect, position.y - u_mouse.y);
            float mouse_distance = length(mouse_delta);
            float influence = (1.0 - smoothstep(0.035, 0.22, mouse_distance)) * u_mouse_active * sky_mask;
            float rotation_speed = mix(0.045, 0.11, influence);
            float mouse_phase = u_time * rotation_speed + a_seed * 6.2831853;
            vec2 mouse_tangent = tangent(mouse_delta);
            vec2 mouse_radial = normalize(mouse_delta + vec2(0.00001));
            vec2 mouse_flow = mouse_tangent * sin(mouse_phase) * 0.015 + mouse_radial * cos(mouse_phase) * 0.0045;
            position += vec2(mouse_flow.x / aspect, mouse_flow.y) * influence;

            vec2 texture_uv = vec2(
                0.5 + (a_uv.x - 0.5) * u_cover.x,
                0.5 + (a_uv.y - 0.5) * u_cover.y
            );

            v_texture_uv = clamp(texture_uv, 0.001, 0.999);
            v_seed = a_seed;
            v_influence = influence;

            gl_Position = vec4(position.x * 2.0 - 1.0, 1.0 - position.y * 2.0, 0.0, 1.0);
            gl_PointSize = u_point_size * (0.76 + a_seed * 0.62) * (1.0 + influence * 0.28);
        }
    `;

    const fragmentShaderSource = `
        precision mediump float;

        uniform sampler2D u_video;
        uniform float u_round_splats;

        varying vec2 v_texture_uv;
        varying float v_seed;
        varying float v_influence;

        void main() {
            vec2 point = gl_PointCoord - 0.5;
            float angle = v_seed * 6.2831853;
            float sine = sin(angle);
            float cosine = cos(angle);
            vec2 brush_point = mat2(cosine, -sine, sine, cosine) * point;
            brush_point *= vec2(0.72, 1.42);

            float round_radius = dot(point, point);
            float brush_radius = dot(brush_point, brush_point);
            float radius = mix(brush_radius, round_radius, u_round_splats);
            float gaussian = exp(-radius * 13.5);
            if (gaussian < 0.018) discard;

            vec3 video_color = texture2D(u_video, v_texture_uv).rgb;
            float luminance = dot(video_color, vec3(0.2126, 0.7152, 0.0722));
            float highlight = smoothstep(0.42, 0.9, luminance);
            float shadow_lift = 1.0 - smoothstep(0.04, 0.34, luminance);
            video_color = mix(video_color, vec3(0.055, 0.105, 0.19), shadow_lift * 0.68);
            video_color *= 0.92 + highlight * 0.24;
            video_color += vec3(0.015, 0.022, 0.035) * (1.0 - luminance);

            float tone_alpha = mix(0.58, 1.0, smoothstep(0.04, 0.62, luminance));
            float alpha = gaussian * tone_alpha * (0.78 + highlight * 0.16 + v_influence * 0.06);
            gl_FragColor = vec4(video_color * alpha, alpha);
        }
    `;

    function compileShader(type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            const message = gl.getShaderInfoLog(shader);
            gl.deleteShader(shader);
            throw new Error(message || 'Unable to compile Starry River shader');
        }
        return shader;
    }

    function createProgram() {
        const program = gl.createProgram();
        const vertexShader = compileShader(gl.VERTEX_SHADER, vertexShaderSource);
        const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentShaderSource);
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            const message = gl.getProgramInfoLog(program);
            gl.deleteProgram(program);
            throw new Error(message || 'Unable to link Starry River shader');
        }

        return program;
    }

    let program;
    try {
        program = createProgram();
    } catch (error) {
        console.warn('Starry River WebGL fallback:', error);
        return;
    }

    window.STARRY_SPLAT_WEBGL = true;
    fallbackCanvas.replaceWith(canvas);

    const locations = {
        uv: gl.getAttribLocation(program, 'a_uv'),
        seed: gl.getAttribLocation(program, 'a_seed'),
        resolution: gl.getUniformLocation(program, 'u_resolution'),
        mouse: gl.getUniformLocation(program, 'u_mouse'),
        cover: gl.getUniformLocation(program, 'u_cover'),
        mouseActive: gl.getUniformLocation(program, 'u_mouse_active'),
        time: gl.getUniformLocation(program, 'u_time'),
        pointSize: gl.getUniformLocation(program, 'u_point_size'),
        roundSplats: gl.getUniformLocation(program, 'u_round_splats'),
        video: gl.getUniformLocation(program, 'u_video')
    };

    const particleBuffer = gl.createBuffer();
    const videoTexture = gl.createTexture();
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const state = {
        scene: 'opening',
        frame: null,
        transitionTimer: null,
        startTime: performance.now(),
        lastVideoTime: -1,
        particleCount: 0,
        width: 1,
        height: 1,
        dpr: 1,
        videoTextureReady: false,
        textureUploadFailed: false
    };
    const pointer = {
        x: 0.5,
        y: 0.5,
        active: 0
    };

    gl.useProgram(program);
    gl.bindTexture(gl.TEXTURE_2D, videoTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        1,
        1,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        new Uint8Array([5, 15, 34, 255])
    );
    gl.uniform1i(locations.video, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST);

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function hash(x, y) {
        const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
        return value - Math.floor(value);
    }

    function buildParticleGrid() {
        const area = state.width * state.height;
        const isMobile = state.width < 768;
        const targetCount = isMobile ? SPLAT_SETTINGS.mobileTargetCount : SPLAT_SETTINGS.desktopTargetCount;
        const minimumSpacing = isMobile ? 4.4 : 4.0;
        const spacing = Math.max(minimumSpacing, Math.sqrt(area / targetCount));
        const columns = Math.ceil(state.width / spacing) + 2;
        const rows = Math.ceil(state.height / spacing) + 2;
        const data = new Float32Array(columns * rows * 3);
        let offset = 0;

        for (let row = 0; row < rows; row += 1) {
            for (let column = 0; column < columns; column += 1) {
                const seed = hash(column, row);
                const jitterX = (hash(column + 17.3, row + 4.1) - 0.5) * spacing * 0.72;
                const jitterY = (hash(column + 3.7, row + 21.9) - 0.5) * spacing * 0.72;
                data[offset] = clamp((column * spacing + jitterX) / state.width, 0, 1);
                data[offset + 1] = clamp((row * spacing + jitterY) / state.height, 0, 1);
                data[offset + 2] = seed;
                offset += 3;
            }
        }

        state.particleCount = columns * rows;
        gl.bindBuffer(gl.ARRAY_BUFFER, particleBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(locations.uv);
        gl.vertexAttribPointer(locations.uv, 2, gl.FLOAT, false, 12, 0);
        gl.enableVertexAttribArray(locations.seed);
        gl.vertexAttribPointer(locations.seed, 1, gl.FLOAT, false, 12, 8);
    }

    function getCoverScale() {
        const sourceWidth = openingVideo.videoWidth || 1656;
        const sourceHeight = openingVideo.videoHeight || 1150;
        const viewportAspect = state.width / state.height;
        const sourceAspect = sourceWidth / sourceHeight;

        if (viewportAspect > sourceAspect) {
            return [1, sourceAspect / viewportAspect];
        }
        return [viewportAspect / sourceAspect, 1];
    }

    function resize() {
        const bounds = experience.getBoundingClientRect();
        state.width = Math.max(1, bounds.width);
        state.height = Math.max(1, bounds.height);
        state.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        canvas.width = Math.round(state.width * state.dpr);
        canvas.height = Math.round(state.height * state.dpr);
        canvas.style.width = `${state.width}px`;
        canvas.style.height = `${state.height}px`;
        gl.viewport(0, 0, canvas.width, canvas.height);
        buildParticleGrid();
    }

    function updateVideoTexture() {
        if (
            state.textureUploadFailed
            || openingVideo.readyState < 2
            || openingVideo.currentTime === state.lastVideoTime
        ) return;

        try {
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, videoTexture);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, openingVideo);
            state.lastVideoTime = openingVideo.currentTime;

            if (!state.videoTextureReady) {
                state.videoTextureReady = true;
                experience.classList.add('is-webgl-splat');
            }
        } catch (error) {
            state.textureUploadFailed = true;
            canvas.style.display = 'none';
            experience.classList.remove('is-webgl-splat');
            console.warn('Starry River video texture unavailable; showing the moving video fallback.', error);
        }
    }

    function render(time) {
        if (state.scene === 'river' || document.hidden) {
            state.frame = null;
            return;
        }

        updateVideoTexture();
        if (state.textureUploadFailed) {
            state.frame = null;
            return;
        }

        gl.clearColor(0.016, 0.052, 0.116, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(program);
        gl.bindBuffer(gl.ARRAY_BUFFER, particleBuffer);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, videoTexture);

        const cover = getCoverScale();
        gl.uniform2f(locations.resolution, state.width, state.height);
        gl.uniform2f(locations.mouse, pointer.x, pointer.y);
        gl.uniform2f(locations.cover, cover[0], cover[1]);
        gl.uniform1f(locations.mouseActive, pointer.active);
        gl.uniform1f(locations.time, (time - state.startTime) / 1000);
        gl.uniform1f(
            locations.pointSize,
            (state.width < 768 ? SPLAT_SETTINGS.mobilePointSize : SPLAT_SETTINGS.desktopPointSize) * state.dpr
        );
        gl.uniform1f(locations.roundSplats, SPLAT_SETTINGS.shape === 'round' ? 1 : 0);
        gl.drawArrays(gl.POINTS, 0, state.particleCount);

        state.frame = window.requestAnimationFrame(render);
    }

    function startRendering() {
        if (state.frame || state.scene === 'river') return;
        state.frame = window.requestAnimationFrame(render);
    }

    function stopRendering() {
        if (!state.frame) return;
        window.cancelAnimationFrame(state.frame);
        state.frame = null;
    }

    function setScene(nextScene) {
        state.scene = nextScene;
        experience.dataset.scene = nextScene;
        experience.classList.toggle('is-transitioning', nextScene === 'transition');
        experience.classList.toggle('is-river', nextScene === 'river');

        if (nextScene === 'river') {
            stopRendering();
            openingVideo.pause();
        }
    }

    function enterRiver() {
        if (state.scene !== 'opening') return;
        setScene('transition');
        enterButton.disabled = true;
        window.clearTimeout(state.transitionTimer);
        state.transitionTimer = window.setTimeout(() => {
            setScene('river');
        }, reduceMotion.matches ? 450 : 2800);
    }

    function resetOpening() {
        window.clearTimeout(state.transitionTimer);
        setScene('opening');
        enterButton.disabled = false;
        openingVideo.currentTime = 0;
        state.startTime = performance.now();
        state.lastVideoTime = -1;

        if (!reduceMotion.matches) {
            playOpeningVideo();
        }
        startRendering();
    }

    experience.addEventListener('pointermove', (event) => {
        const bounds = experience.getBoundingClientRect();
        pointer.x = clamp((event.clientX - bounds.left) / bounds.width, 0, 1);
        pointer.y = clamp((event.clientY - bounds.top) / bounds.height, 0, 1);
        pointer.active = 1;
    }, { passive: true });

    experience.addEventListener('pointerleave', () => {
        pointer.active = 0;
    });

    enterButton.addEventListener('click', enterRiver);

    window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && state.scene !== 'opening') resetOpening();
    });

    let resizeFrame = null;
    window.addEventListener('resize', () => {
        if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
        resizeFrame = window.requestAnimationFrame(resize);
    }, { passive: true });

    reduceMotion.addEventListener('change', () => {
        if (reduceMotion.matches) {
            openingVideo.pause();
            stopRendering();
        } else if (state.scene === 'opening') {
            playOpeningVideo();
            startRendering();
        }
    });

    openingVideo.addEventListener('loadedmetadata', applyPlaybackRate);
    openingVideo.addEventListener('canplay', () => {
        if (!reduceMotion.matches && state.scene === 'opening') playOpeningVideo();
    });

    openingVideo.addEventListener('ratechange', () => {
        if (Math.abs(openingVideo.playbackRate - SPLAT_SETTINGS.playbackRate) > 0.001) {
            applyPlaybackRate();
        }
    });

    openingVideo.addEventListener('error', () => {
        stopRendering();
        canvas.style.display = 'none';
        experience.classList.remove('is-webgl-splat');
    }, { once: true });

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            stopRendering();
        } else if (state.scene !== 'river') {
            if (!reduceMotion.matches) playOpeningVideo();
            startRendering();
        }
    });

    window.addEventListener('pageshow', () => {
        if (!reduceMotion.matches && state.scene === 'opening') {
            playOpeningVideo();
            startRendering();
        }
    });

    canvas.addEventListener('webglcontextlost', (event) => {
        event.preventDefault();
        stopRendering();
        experience.classList.remove('is-webgl-splat');
        canvas.style.display = 'none';
        if (!reduceMotion.matches && state.scene === 'opening') playOpeningVideo();
    });

    window.addEventListener('pagehide', () => {
        stopRendering();
        window.clearTimeout(state.transitionTimer);
        gl.deleteTexture(videoTexture);
        gl.deleteBuffer(particleBuffer);
        gl.deleteProgram(program);
    }, { once: true });

    resize();
    if (reduceMotion.matches) {
        openingVideo.pause();
    } else {
        playOpeningVideo();
        startRendering();
    }

    window.__STARRY_SPLAT_DEBUG__ = {
        get particleCount() { return state.particleCount; },
        get scene() { return state.scene; },
        get textureReady() { return state.videoTextureReady; },
        get textureUploadFailed() { return state.textureUploadFailed; },
        get shape() { return SPLAT_SETTINGS.shape; },
        get playbackRate() { return openingVideo.playbackRate; },
        get videoPaused() { return openingVideo.paused; },
        get videoTime() { return openingVideo.currentTime; }
    };
})();
