(() => {
    const scene = document.getElementById('starry-transition-scene');
    const image = document.getElementById('starry-transition-image');
    const canvas = document.getElementById('starry-transition-canvas');

    if (!scene || !image || !canvas) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const gl = canvas.getContext('webgl', {
        alpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        premultipliedAlpha: true,
        powerPreference: 'high-performance'
    });

    const fallbackController = Object.freeze({
        activate() {},
        deactivate() {}
    });

    if (!gl) {
        canvas.hidden = true;
        window.StarryTransitionScene = fallbackController;
        return;
    }

    const settings = {
        desktopCount: 52000,
        mobileCount: 16000,
        desktopPointSize: 2.11,
        mobilePointSize: 1.89,
        particleSpacingScale: 0.85,
        pointerRadius: 0.23,
        pointerRotation: 1.05,
        brightness: 1.2,
        saturation: 1.12
    };

    const vertexSource = `
        precision highp float;

        attribute vec2 a_uv;
        attribute float a_seed;

        uniform vec2 u_resolution;
        uniform vec2 u_cover;
        uniform vec2 u_pointer;
        uniform float u_pointer_active;
        uniform float u_pointer_radius;
        uniform float u_pointer_rotation;
        uniform float u_point_size;
        uniform float u_time;

        varying vec2 v_texture_uv;
        varying float v_influence;

        vec2 rotatePoint(vec2 value, float angle) {
            float sine = sin(angle);
            float cosine = cos(angle);
            return vec2(
                value.x * cosine - value.y * sine,
                value.x * sine + value.y * cosine
            );
        }

        void main() {
            float aspect = u_resolution.x / max(u_resolution.y, 1.0);
            vec2 position = a_uv;

            vec2 pointerDelta = vec2(
                (position.x - u_pointer.x) * aspect,
                position.y - u_pointer.y
            );
            float distanceToPointer = length(pointerDelta);
            float influence = (
                1.0 - smoothstep(0.025, u_pointer_radius, distanceToPointer)
            ) * u_pointer_active;

            float pulse = 0.9 + sin(u_time * 0.72 + a_seed * 6.2831853) * 0.1;
            vec2 turned = rotatePoint(pointerDelta, influence * u_pointer_rotation * pulse);
            position += vec2(
                (turned.x - pointerDelta.x) / aspect,
                turned.y - pointerDelta.y
            );

            v_texture_uv = clamp(vec2(
                0.5 + (a_uv.x - 0.5) * u_cover.x,
                0.5 + (a_uv.y - 0.5) * u_cover.y
            ), 0.001, 0.999);
            v_influence = influence;

            gl_Position = vec4(
                position.x * 2.0 - 1.0,
                1.0 - position.y * 2.0,
                0.0,
                1.0
            );
            gl_PointSize = u_point_size * (1.0 + influence * 0.16);
        }
    `;

    const fragmentSource = `
        precision mediump float;

        uniform sampler2D u_image;
        uniform float u_brightness;
        uniform float u_saturation;

        varying vec2 v_texture_uv;
        varying float v_influence;

        void main() {
            float distanceFromCenter = length(gl_PointCoord - 0.5);
            float circle = 1.0 - smoothstep(0.34, 0.5, distanceFromCenter);
            if (circle < 0.02) discard;

            vec3 color = texture2D(u_image, v_texture_uv).rgb;
            float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
            color = mix(vec3(luminance), color, u_saturation);
            color *= u_brightness * (1.0 + v_influence * 0.08);

            float alpha = circle * (0.88 + v_influence * 0.12);
            gl_FragColor = vec4(color * alpha, alpha);
        }
    `;

    function compileShader(type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            const message = gl.getShaderInfoLog(shader);
            gl.deleteShader(shader);
            throw new Error(message || 'Transition particle shader failed');
        }
        return shader;
    }

    function createProgram() {
        const program = gl.createProgram();
        const vertexShader = compileShader(gl.VERTEX_SHADER, vertexSource);
        const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentSource);
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            const message = gl.getProgramInfoLog(program);
            gl.deleteProgram(program);
            throw new Error(message || 'Transition particle program failed');
        }
        return program;
    }

    let program;
    try {
        program = createProgram();
    } catch (error) {
        console.warn('Starry River transition: WebGL unavailable.', error);
        canvas.hidden = true;
        window.StarryTransitionScene = fallbackController;
        return;
    }

    const locations = {
        uv: gl.getAttribLocation(program, 'a_uv'),
        seed: gl.getAttribLocation(program, 'a_seed'),
        resolution: gl.getUniformLocation(program, 'u_resolution'),
        cover: gl.getUniformLocation(program, 'u_cover'),
        pointer: gl.getUniformLocation(program, 'u_pointer'),
        pointerActive: gl.getUniformLocation(program, 'u_pointer_active'),
        pointerRadius: gl.getUniformLocation(program, 'u_pointer_radius'),
        pointerRotation: gl.getUniformLocation(program, 'u_pointer_rotation'),
        pointSize: gl.getUniformLocation(program, 'u_point_size'),
        time: gl.getUniformLocation(program, 'u_time'),
        brightness: gl.getUniformLocation(program, 'u_brightness'),
        saturation: gl.getUniformLocation(program, 'u_saturation'),
        image: gl.getUniformLocation(program, 'u_image')
    };

    const particleBuffer = gl.createBuffer();
    const imageTexture = gl.createTexture();
    const pointer = { x: 0.5, y: 0.5, active: 0 };
    const state = {
        active: false,
        frame: null,
        startTime: performance.now(),
        width: 1,
        height: 1,
        dpr: 1,
        particleCount: 0,
        textureReady: false
    };

    gl.useProgram(program);
    gl.bindTexture(gl.TEXTURE_2D, imageTexture);
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
        new Uint8Array([6, 17, 35, 255])
    );
    gl.uniform1i(locations.image, 0);
    gl.uniform1f(locations.pointerRadius, settings.pointerRadius);
    gl.uniform1f(locations.pointerRotation, settings.pointerRotation);
    gl.uniform1f(locations.brightness, settings.brightness);
    gl.uniform1f(locations.saturation, settings.saturation);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST);

    function clamp(value, minimum, maximum) {
        return Math.min(maximum, Math.max(minimum, value));
    }

    function randomSeed(column, row) {
        const value = Math.sin(column * 127.1 + row * 311.7) * 43758.5453;
        return value - Math.floor(value);
    }

    function uploadTexture() {
        if (!image.complete || !image.naturalWidth) return;
        try {
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, imageTexture);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
            state.textureReady = true;
        } catch (error) {
            canvas.hidden = true;
            console.warn('Starry River transition: image texture unavailable.', error);
        }
    }

    function buildParticleGrid() {
        const isMobile = state.width < 768;
        const targetCount = isMobile ? settings.mobileCount : settings.desktopCount;
        const spacing = Math.max(isMobile ? 4.6 : 4.1, Math.sqrt((state.width * state.height) / targetCount))
            * settings.particleSpacingScale;
        const columns = Math.ceil(state.width / spacing) + 2;
        const rows = Math.ceil(state.height / spacing) + 2;
        const data = new Float32Array(columns * rows * 3);
        let offset = 0;

        for (let row = 0; row < rows; row += 1) {
            for (let column = 0; column < columns; column += 1) {
                const seed = randomSeed(column, row);
                const jitterX = (randomSeed(column + 17.3, row + 4.1) - 0.5) * spacing * 0.72;
                const jitterY = (randomSeed(column + 3.7, row + 21.9) - 0.5) * spacing * 0.72;
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
        const sourceAspect = (image.naturalWidth || 1672) / (image.naturalHeight || 939);
        const viewportAspect = state.width / state.height;
        if (viewportAspect > sourceAspect) return [1, sourceAspect / viewportAspect];
        return [viewportAspect / sourceAspect, 1];
    }

    function resize() {
        const bounds = scene.getBoundingClientRect();
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

    function render(time) {
        if (!state.active || document.hidden || reduceMotion.matches || canvas.hidden) {
            state.frame = null;
            return;
        }

        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(program);
        gl.bindBuffer(gl.ARRAY_BUFFER, particleBuffer);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, imageTexture);

        const cover = getCoverScale();
        gl.uniform2f(locations.resolution, state.width, state.height);
        gl.uniform2f(locations.cover, cover[0], cover[1]);
        gl.uniform2f(locations.pointer, pointer.x, pointer.y);
        gl.uniform1f(locations.pointerActive, pointer.active);
        gl.uniform1f(locations.time, (time - state.startTime) / 1000);
        gl.uniform1f(
            locations.pointSize,
            (state.width < 768 ? settings.mobilePointSize : settings.desktopPointSize) * state.dpr
        );
        gl.drawArrays(gl.POINTS, 0, state.particleCount);
        state.frame = window.requestAnimationFrame(render);
    }

    function startRendering() {
        if (state.frame || !state.active || reduceMotion.matches) return;
        state.frame = window.requestAnimationFrame(render);
    }

    function stopRendering() {
        if (!state.frame) return;
        window.cancelAnimationFrame(state.frame);
        state.frame = null;
    }

    function activate() {
        state.active = true;
        state.startTime = performance.now();
        if (!state.textureReady) uploadTexture();
        startRendering();
    }

    function deactivate() {
        state.active = false;
        pointer.active = 0;
        stopRendering();
    }

    scene.addEventListener('pointermove', (event) => {
        if (!state.active) return;
        const bounds = scene.getBoundingClientRect();
        pointer.x = clamp((event.clientX - bounds.left) / bounds.width, 0, 1);
        pointer.y = clamp((event.clientY - bounds.top) / bounds.height, 0, 1);
        pointer.active = 1;
    }, { passive: true });

    scene.addEventListener('pointerleave', () => {
        pointer.active = 0;
    });

    let resizeFrame = null;
    window.addEventListener('resize', () => {
        if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
        resizeFrame = window.requestAnimationFrame(resize);
    }, { passive: true });

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) stopRendering();
        else startRendering();
    });

    reduceMotion.addEventListener('change', () => {
        if (reduceMotion.matches) stopRendering();
        else startRendering();
    });

    image.addEventListener('load', () => {
        uploadTexture();
        resize();
    }, { once: true });

    resize();
    if (image.complete) uploadTexture();

    window.StarryTransitionScene = Object.freeze({ activate, deactivate });
})();
