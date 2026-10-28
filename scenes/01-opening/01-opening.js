/*
 * Starry River - 01 第一幕：星月夜高斯泼溅
 *
 * 渲染思路：
 *   1. 视频作为纹理底层（缓缓流动的星月夜）。
 *   2. 屏幕上铺一层高密度圆点网格，采样视频颜色，保持原有离散粒子外观。
 *   3. 星云流动：每个点采样纹理时，把采样坐标绕「星星/月亮」做角向旋转，
 *      旋转角速度随距离衰减 -> 形成一圈圈缓慢转动的圆环星云。
 *      因为旋转是绕固定圆心的纯角向运动，每个点的采样点沿圆周循环，
 *      不会随时间累积拉花，可以长期稳定运行。
 *   4. 水面（地平线以下）不参与圆环流动，只做轻微闪烁。
 */
(() => {
    const experience = document.getElementById('starry-experience');
    const openingVideo = document.getElementById('starry-opening-video');
    const enterButton = document.getElementById('starry-enter');
    const canvas = document.getElementById('starry-splat-canvas');

    if (!experience || !openingVideo || !enterButton || !canvas) return;

    const MAX_STARS = 12;

    /*
     * 可调参数。控制台里用 __STARRY__.set({ ... }) 改，实时生效。
     * 每一项的「调大 / 调小」效果见 __STARRY__.help()。
     */
    const SPLAT_SETTINGS = {
        /*
         * 当前 v007 视频是 24fps，保持原速播放。
         * 慢放不会自动补帧；纹理只在视频有新帧时上传。
         * 想更慢又不卡，只能重新导出一个帧数更高的慢速视频。
         */
        playbackRate: 1.0,        // 底层视频速度：低于 0.7 就会开始看出卡顿
        // ↓↓ 均匀离散粒子的手感：数量 + 大小 ↓↓
        desktopTargetCount: 60000,// 颗粒数量：调大=更密更满，调小=更离散、黑底缝隙更明显
        mobileTargetCount: 18000,
        desktopPointSize: 2.21,   // 原 3.4 × 0.65：单颗粒缩小 35%
        mobilePointSize: 1.95,    // 原 3.0 × 0.65
        particleSpacingScale: 0.85,// 间距缩小 15%；如确实想增大 15%，改成 1.15
        ringSpeed: 0.001,         // 标红星云区域降到原速度的 10%
        renderFps: 30,            // 粒子绘制频率；视频纹理按实际解码帧更新
        ringTightness: 55.0,      // 旋转范围：调大=圈收紧贴星星，调小=铺得更开
        horizon: 0.60,            // 地平线：其下算水面，不参与旋转
        opacity: 1.0,             // 颗粒整体不透明度：调小=颗粒变淡、露出更多底层视频
        darkGate: 0.16,           // 暗部门槛：调大=更多暗区(树/岸)被冻住不转
        // ↓↓ 调色：鲜亮、浓墨重彩（Codex 风）↓↓
        brightness: 1.28,         // 曝光：调大=整体更亮
        saturation: 1.45,         // 饱和度：调大=蓝更蓝、金更金（浓墨重彩靠它）
        contrast: 1.16,           // 对比度：调大=更通透、明暗更分明
        skyBoost: 0.15,           // 星空比树/河水亮多少：0.15=亮15%（你的要求）
        // ↓↓ 这两个决定「看到多少原画」↓↓
        splatOpacity: 1.0,        // 颗粒 ←→ 原视频 交叉淡化：1=全是颗粒，0=全是原视频
        videoOpacity: 1.0         // 从颗粒缝隙透上来的视频亮度：调小=缝隙发黑发灰
    };

    /*
     * 兜底星位（uv 坐标 + 强度），量自「星月夜融合」参考图。
     * 用 file:// 直接打开时 canvas 会被判定跨域、读不到像素，此时用这组值。
     * 通过 http 预览时会被下面的亮度峰值自动检测覆盖。
     */
    const FALLBACK_STARS = [
        [0.906, 0.167, 1.00], // 月亮
        [0.461, 0.357, 0.86], // 中央大漩涡
        [0.370, 0.514, 0.72],
        [0.662, 0.476, 0.70], // 右侧漩涡
        [0.695, 0.244, 0.62],
        [0.265, 0.185, 0.62],
        [0.605, 0.110, 0.60],
        [0.361, 0.081, 0.58],
        [0.347, 0.337, 0.58],
        [0.159, 0.462, 0.52],
        [0.129, 0.054, 0.50],
        [0.079, 0.446, 0.40]
    ];

    function applyPlaybackRate() {
        openingVideo.defaultPlaybackRate = SPLAT_SETTINGS.playbackRate;
        openingVideo.playbackRate = SPLAT_SETTINGS.playbackRate;
    }

    function playOpeningVideo() {
        applyPlaybackRate();
        const attempt = openingVideo.play();
        if (attempt && typeof attempt.catch === 'function') attempt.catch(() => {});
    }

    applyPlaybackRate();

    const fallback = window.StarryOpeningFallback;
    let gl = null;
    try { gl = canvas.getContext('webgl', {
        alpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        premultipliedAlpha: true,
        preserveDrawingBuffer: false,
        powerPreference: 'high-performance'
    }); } catch { /* The independent 2D/CSS particle layer remains visible. */ }

    // 顶点着色器里采样纹理不是所有 GPU 都支持，不支持就跳过亮度门控
    const supportsVertexTexture = !!gl && gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS) > 0;

    const vertexShaderSource = `
        precision highp float;
        ${supportsVertexTexture ? '#define USE_DARK_GATE 1' : ''}

        attribute vec2 a_uv;
        attribute float a_seed;

        uniform vec2 u_resolution;
        uniform vec2 u_mouse;
        uniform vec2 u_cover;
        uniform float u_mouse_active;
        uniform float u_time;
        uniform float u_point_size;
        uniform float u_ring_speed;
        uniform float u_ring_tightness;
        uniform float u_horizon;
        uniform float u_dark_gate;
        uniform sampler2D u_video;
        uniform vec3 u_stars[${MAX_STARS}];

        varying vec2 v_texture_uv;
        varying float v_seed;
        varying float v_influence;
        varying float v_water;
        varying float v_gate;

        vec2 rotate(vec2 delta, float angle) {
            float s = sin(angle);
            float c = cos(angle);
            return vec2(delta.x * c - delta.y * s, delta.x * s + delta.y * c);
        }

        // 某个采样坐标处「有多亮」：1 = 天空可以自由流动，0 = 暗部(树/岸)必须冻住
        float lumaGate(vec2 uv) {
            vec2 texel = clamp(vec2(
                0.5 + (uv.x - 0.5) * u_cover.x,
                uv.y * u_cover.y
            ), 0.001, 0.999);
            vec3 sampled = texture2D(u_video, texel).rgb;
            float luma = dot(sampled, vec3(0.2126, 0.7152, 0.0722));
            return smoothstep(u_dark_gate, u_dark_gate + 0.16, luma);
        }

        // 绕各颗星星做角向旋转，得到最终的纹理采样坐标
        vec2 swirlFlow(vec2 base, float aspect, float sky, float gate) {
            vec2 flow = base;
            for (int i = 0; i < ${MAX_STARS}; i++) {
                vec3 star = u_stars[i];
                vec2 delta = vec2((flow.x - star.x) * aspect, flow.y - star.y);
                float weight = exp(-dot(delta, delta) * u_ring_tightness) * star.z * sky * gate;
                vec2 turned = rotate(delta, u_time * u_ring_speed * weight);
                flow += vec2((turned.x - delta.x) / aspect, turned.y - delta.y);
            }
            return flow;
        }

        void main() {
            float aspect = u_resolution.x / max(u_resolution.y, 1.0);
            vec2 grid = a_uv;

            float sky = 1.0 - smoothstep(u_horizon - 0.07, u_horizon + 0.03, grid.y);
            float water = 1.0 - sky;

            /*
             * 亮度门控（两道）：柏树、河岸这些暗部不该被星云卷进去。
             *
             * 旋转转的是「纹理采样坐标」，所以只检查出发点是不够的——
             * 一颗出发于亮天空的粒子，转完之后落点可能正好在树上，
             * 于是天空的亮色被拖进树里，看起来就是漩涡吃掉了树。
             *
             * 因此先用出发点亮度试转一次，再检查落点亮度，两边取严：
             * 出发点或落点只要有一边在暗部，这次旋转就不许发生。
             */
            float gate = 1.0;
            #ifdef USE_DARK_GATE
                float gateSource = lumaGate(grid);
                vec2 probe = swirlFlow(grid, aspect, sky, gateSource);
                gate = min(gateSource, lumaGate(probe));
            #endif

            // ---- 星云圆环流动 ----
            vec2 flow = swirlFlow(grid, aspect, sky, gate);

            // ---- 水面：只有极轻微的起伏 ----
            flow.y += sin(u_time * 0.6 + grid.x * 24.0 + a_seed * 6.2831853) * 0.0015 * water;

            // ---- 屏幕位置：整体缓慢呼吸 + 鼠标处的涡旋牵引 ----
            // 粒子本身跟随与纹理相同的星云流场，避免出现“只有底图在转、点阵钉死”的感觉。
            vec2 position = flow;
            float drift = u_time * 0.05 + a_seed * 6.2831853;
            position += vec2(cos(drift) / aspect, sin(drift) * 0.6) * 0.0018 * sky * gate;

            vec2 mouseDelta = vec2((position.x - u_mouse.x) * aspect, position.y - u_mouse.y);
            float influence = (1.0 - smoothstep(0.03, 0.24, length(mouseDelta))) * u_mouse_active;
            vec2 swirled = rotate(mouseDelta, influence * 1.15);
            position += vec2((swirled.x - mouseDelta.x) / aspect, swirled.y - mouseDelta.y);

            vec2 textureUv = vec2(
                0.5 + (flow.x - 0.5) * u_cover.x,
                flow.y * u_cover.y
            );

            v_texture_uv = clamp(textureUv, 0.001, 0.999);
            v_seed = a_seed;
            v_influence = influence;
            v_water = water;
            v_gate = gate; // 天空≈1，树/河水暗部≈0，供片元做亮度分区

            gl_Position = vec4(position.x * 2.0 - 1.0, 1.0 - position.y * 2.0, 0.0, 1.0);
            // 均匀：每颗大小完全一致，不再随机、也不随鼠标缩放
            gl_PointSize = u_point_size;
        }
    `;

    const fragmentShaderSource = `
        precision mediump float;

        uniform sampler2D u_video;
        uniform float u_opacity;
        uniform float u_brightness;
        uniform float u_saturation;
        uniform float u_contrast;
        uniform float u_sky_boost;

        varying vec2 v_texture_uv;
        varying float v_seed;
        varying float v_influence;
        varying float v_water;
        varying float v_gate;

        void main() {
            /*
             * 均匀的实心圆点：带 ~1px 抗锯齿边，大小完全一致，
             * 不发光、不忽大忽小 —— 参考 Black Hole 那种干净离散的粒子。
             */
            float d = length(gl_PointCoord - 0.5);
            // 圆形：0.5 处才到边，用较宽的过渡带做抗锯齿，避免看起来像圆角方块
            float mask = 1.0 - smoothstep(0.32, 0.5, d);
            if (mask < 0.02) discard;

            // 颜色 = 底图本身的颜色（树=黑、河水=暗、天空=亮），不加任何辉光
            vec3 color = texture2D(u_video, v_texture_uv).rgb;

            // 轻度调色，默认很淡，基本保持原画颜色
            float grey = dot(color, vec3(0.2126, 0.7152, 0.0722));
            color = mix(vec3(grey), color, u_saturation);
            color = (color - 0.5) * u_contrast + 0.5;
            color *= u_brightness;

            // 星空区域比树/河水区域亮一档（v_gate：天空≈1，树/河水≈0）
            color *= 1.0 + u_sky_boost * v_gate;

            color = max(color, vec3(0.0));

            // 实心：alpha 只由圆点遮罩决定，和明暗无关 -> 树/河水的暗粒子也照常可见
            float alpha = clamp(mask * u_opacity, 0.0, 1.0);
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
            throw new Error(message || 'Unable to compile Starry River shader');
        }
        return shader;
    }

    function createProgram() {
        const program = gl.createProgram();
        let vertexShader;
        let fragmentShader;
        try {
            vertexShader = compileShader(gl.VERTEX_SHADER, vertexShaderSource);
            fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentShaderSource);
            gl.attachShader(program, vertexShader);
            gl.attachShader(program, fragmentShader);
            gl.linkProgram(program);
            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
                throw new Error(gl.getProgramInfoLog(program) || 'Unable to link Starry River shader');
            }
            return program;
        } catch (error) {
            gl.deleteProgram(program);
            throw error;
        } finally {
            if (vertexShader) gl.deleteShader(vertexShader);
            if (fragmentShader) gl.deleteShader(fragmentShader);
        }
    }

    let program = null;
    let locations = {};
    let particleBuffer = null;
    let videoTexture = null;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const textureCanvas = document.createElement('canvas');
    let textureContext = null;
    try { textureContext = textureCanvas.getContext('2d'); } catch { /* Upload the video directly. */ }
    const hasVideoFrameCallback = typeof openingVideo.requestVideoFrameCallback === 'function';
    let videoFrame = null;

    const state = {
        active: true,
        suspended: false,
        frame: null,
        lastRenderTime: 0,
        startTime: performance.now(),
        lastVideoTime: -1,
        videoFrameDirty: true,
        particleCount: 0,
        width: 1,
        height: 1,
        dpr: 1,
        videoTextureReady: false,
        textureUploadFailed: false,
        starsDetected: false,
        resourcesReady: false,
        securityBlocked: location.protocol === 'file:',
        uploadFailures: 0,
        nextUploadAttempt: 0,
        renderer: 'fallback',
        fallbackReason: 'loading',
        resourceGeneration: 0,
        renderedFrames: 0
    };
    const pointer = { x: 0.5, y: 0.5, active: 0 };

    function showFallback(reason) {
        state.renderer = 'fallback';
        state.fallbackReason = reason;
        canvas.style.display = 'none';
        experience.classList.remove('is-webgl-splat');
        fallback?.show(reason);
    }

    function disposeResources() {
        state.resourcesReady = false;
        state.videoTextureReady = false;
        if (gl && !gl.isContextLost()) {
            if (videoTexture) gl.deleteTexture(videoTexture);
            if (particleBuffer) gl.deleteBuffer(particleBuffer);
            if (program) gl.deleteProgram(program);
        }
        videoTexture = particleBuffer = program = null;
        locations = {};
    }

    function initializeResources() {
        if (!gl || gl.isContextLost() || state.securityBlocked) {
            showFallback(state.securityBlocked ? 'local-file' : 'webgl-unavailable');
            return false;
        }
        disposeResources();
        try {
            program = createProgram();
            locations = {
                uv: gl.getAttribLocation(program, 'a_uv'),
                seed: gl.getAttribLocation(program, 'a_seed'),
                resolution: gl.getUniformLocation(program, 'u_resolution'),
                mouse: gl.getUniformLocation(program, 'u_mouse'),
                cover: gl.getUniformLocation(program, 'u_cover'),
                mouseActive: gl.getUniformLocation(program, 'u_mouse_active'),
                time: gl.getUniformLocation(program, 'u_time'),
                pointSize: gl.getUniformLocation(program, 'u_point_size'),
                ringSpeed: gl.getUniformLocation(program, 'u_ring_speed'),
                ringTightness: gl.getUniformLocation(program, 'u_ring_tightness'),
                horizon: gl.getUniformLocation(program, 'u_horizon'),
                opacity: gl.getUniformLocation(program, 'u_opacity'),
                darkGate: gl.getUniformLocation(program, 'u_dark_gate'),
                brightness: gl.getUniformLocation(program, 'u_brightness'),
                saturation: gl.getUniformLocation(program, 'u_saturation'),
                contrast: gl.getUniformLocation(program, 'u_contrast'),
                skyBoost: gl.getUniformLocation(program, 'u_sky_boost'),
                stars: gl.getUniformLocation(program, 'u_stars[0]'),
                video: gl.getUniformLocation(program, 'u_video')
            };

            particleBuffer = gl.createBuffer();
            videoTexture = gl.createTexture();
            if (!particleBuffer || !videoTexture) throw new Error('Particle resources could not be allocated');
            gl.useProgram(program);
            gl.bindTexture(gl.TEXTURE_2D, videoTexture);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([5, 15, 34, 255]));
            gl.uniform1i(locations.video, 0);
            gl.uniform1f(locations.ringSpeed, SPLAT_SETTINGS.ringSpeed);
            gl.uniform1f(locations.ringTightness, SPLAT_SETTINGS.ringTightness);
            gl.uniform1f(locations.horizon, SPLAT_SETTINGS.horizon);
            gl.uniform1f(locations.opacity, SPLAT_SETTINGS.opacity);
            gl.uniform1f(locations.darkGate, SPLAT_SETTINGS.darkGate);
            gl.uniform1f(locations.brightness, SPLAT_SETTINGS.brightness);
            gl.uniform1f(locations.saturation, SPLAT_SETTINGS.saturation);
            gl.uniform1f(locations.contrast, SPLAT_SETTINGS.contrast);
            gl.uniform1f(locations.skyBoost, SPLAT_SETTINGS.skyBoost);
            experience.style.setProperty('--starry-video-opacity', String(SPLAT_SETTINGS.videoOpacity));
            experience.style.setProperty('--starry-splat-opacity', String(SPLAT_SETTINGS.splatOpacity));
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
            gl.disable(gl.DEPTH_TEST);
            state.resourcesReady = true;
            state.textureUploadFailed = false;
            state.uploadFailures = 0;
            state.nextUploadAttempt = 0;
            state.lastVideoTime = -1;
            state.videoFrameDirty = true;
            state.resourceGeneration++;
            uploadStars(state.stars || FALLBACK_STARS);
            resize();
            return true;
        } catch (error) {
            disposeResources();
            showFallback('webgl-initialization');
            console.warn('Starry River: using 2D particles after WebGL initialization failed.', error);
            return false;
        }
    }

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function hash(x, y) {
        const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
        return value - Math.floor(value);
    }

    function uploadStars(stars) {
        state.stars = stars;
        if (!state.resourcesReady || gl.isContextLost()) return;
        const data = new Float32Array(MAX_STARS * 3);
        for (let i = 0; i < MAX_STARS; i += 1) {
            const star = stars[i];
            // 空槽强度置 0，等于不参与流场（GLSL 循环必须是常量上界）
            data[i * 3] = star ? star[0] : 0;
            data[i * 3 + 1] = star ? star[1] : 0;
            data[i * 3 + 2] = star ? star[2] : 0;
        }
        gl.useProgram(program);
        gl.uniform3fv(locations.stars, data);
    }

    /*
     * 从当前视频帧里找出最亮的若干个「星星/月亮」中心：
     * 缩到低分辨率 -> 求亮度 -> 非极大值抑制 -> 取前 MAX_STARS 个。
     * 换一段新视频也能自动适配，不用手动填坐标。
     */
    function detectStars() {
        if (state.starsDetected) return;
        if (!openingVideo.videoWidth || !openingVideo.videoHeight) return;

        try {
            const sampleWidth = 192;
            const sampleHeight = Math.max(
                8,
                Math.round(sampleWidth * (openingVideo.videoHeight / openingVideo.videoWidth))
            );
            const probe = document.createElement('canvas');
            probe.width = sampleWidth;
            probe.height = sampleHeight;
            const probeContext = probe.getContext('2d', { willReadFrequently: true });
            probeContext.drawImage(openingVideo, 0, 0, sampleWidth, sampleHeight);

            const pixels = probeContext.getImageData(0, 0, sampleWidth, sampleHeight).data;
            const skyRows = Math.floor(sampleHeight * SPLAT_SETTINGS.horizon);
            const luminance = new Float32Array(sampleWidth * skyRows);
            let peak = 0;

            for (let y = 0; y < skyRows; y += 1) {
                for (let x = 0; x < sampleWidth; x += 1) {
                    const index = (y * sampleWidth + x) * 4;
                    const value =
                        pixels[index] * 0.2126 + pixels[index + 1] * 0.7152 + pixels[index + 2] * 0.0722;
                    luminance[y * sampleWidth + x] = value;
                    if (value > peak) peak = value;
                }
            }

            if (peak <= 0) return;

            const threshold = peak * 0.55;
            const radius = Math.round(sampleWidth * 0.045);
            const candidates = [];

            for (let y = 1; y < skyRows - 1; y += 1) {
                for (let x = 1; x < sampleWidth - 1; x += 1) {
                    const value = luminance[y * sampleWidth + x];
                    if (value < threshold) continue;

                    let isLocalMax = true;
                    for (let oy = -radius; oy <= radius && isLocalMax; oy += 1) {
                        const ny = y + oy;
                        if (ny < 0 || ny >= skyRows) continue;
                        for (let ox = -radius; ox <= radius; ox += 1) {
                            const nx = x + ox;
                            if (nx < 0 || nx >= sampleWidth) continue;
                            if (luminance[ny * sampleWidth + nx] > value) {
                                isLocalMax = false;
                                break;
                            }
                        }
                    }
                    if (isLocalMax) candidates.push({ x, y, value });
                }
            }

            if (candidates.length < 3) return;

            candidates.sort((a, b) => b.value - a.value);

            const minSeparation = sampleWidth * 0.07;
            const picked = [];
            for (const candidate of candidates) {
                if (picked.length >= MAX_STARS) break;
                const tooClose = picked.some(
                    (other) => Math.hypot(other.x - candidate.x, other.y - candidate.y) < minSeparation
                );
                if (!tooClose) picked.push(candidate);
            }

            const strongest = picked[0].value;
            const stars = picked.map((candidate) => [
                candidate.x / sampleWidth,
                candidate.y / sampleHeight,
                clamp(0.38 + (candidate.value / strongest) * 0.62, 0.3, 1)
            ]);

            uploadStars(stars);
            state.starsDetected = true;
            state.stars = stars;
        } catch (error) {
            // file:// 下 canvas 被判跨域读不到像素 —— 保持兜底星位即可。
            console.info('Starry River: 无法读取视频像素，使用内置星位。', error);
            state.starsDetected = true;
        }
    }

    function buildParticleGrid() {
        if (!state.resourcesReady || gl.isContextLost()) return;
        const area = state.width * state.height;
        const isMobile = state.width < 768;
        const targetCount = isMobile ? SPLAT_SETTINGS.mobileTargetCount : SPLAT_SETTINGS.desktopTargetCount;
        const minimumSpacing = isMobile ? 4.4 : 4.0;
        const spacing = Math.max(minimumSpacing, Math.sqrt(area / targetCount))
            * SPLAT_SETTINGS.particleSpacingScale;
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
        // Match object-fit: cover / object-position: center top. Keeping the
        // vertical sampling origin at zero preserves the moon on wide screens.
        const sourceWidth = openingVideo.videoWidth || 3840;
        const sourceHeight = openingVideo.videoHeight || 2160;
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
        if (state.resourcesReady && !gl.isContextLost()) {
            gl.viewport(0, 0, canvas.width, canvas.height);
            buildParticleGrid();
        }
        if (reduceMotion.matches) startRendering();
    }

    function updateVideoTexture(time) {
        if (
            !state.resourcesReady || state.securityBlocked || state.uploadFailures >= 3
            || gl.isContextLost() || openingVideo.error || time < state.nextUploadAttempt
            || openingVideo.readyState < 2
            || (state.videoTextureReady && !state.videoFrameDirty && hasVideoFrameCallback)
            || (state.videoTextureReady && !state.videoFrameDirty && openingVideo.currentTime === state.lastVideoTime)
        ) return;

        try {
            // Keep the displayed video at 4K, but do not upload 4K pixels for 2px points.
            const maxWidth = Math.min(1920, gl.getParameter(gl.MAX_TEXTURE_SIZE));
            const scale = Math.min(1, maxWidth / openingVideo.videoWidth,
                maxWidth / openingVideo.videoHeight);
            let textureSource = openingVideo;
            if (textureContext) {
                const width = Math.max(1, Math.round(openingVideo.videoWidth * scale));
                const height = Math.max(1, Math.round(openingVideo.videoHeight * scale));
                if (textureCanvas.width !== width || textureCanvas.height !== height) {
                    textureCanvas.width = width;
                    textureCanvas.height = height;
                }
                textureContext.drawImage(openingVideo, 0, 0, width, height);
                textureSource = textureCanvas;
            }
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, videoTexture);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textureSource);
            const errorCode = gl.getError();
            if (errorCode !== gl.NO_ERROR) throw new Error(`Video texture upload failed: ${errorCode}`);
            state.lastVideoTime = openingVideo.currentTime;
            state.videoFrameDirty = false;
            state.textureUploadFailed = false;
            state.uploadFailures = 0;

            if (!state.videoTextureReady) {
                state.videoTextureReady = true;
                detectStars();
            }
        } catch (error) {
            state.textureUploadFailed = true;
            state.videoTextureReady = false;
            state.uploadFailures++;
            state.securityBlocked = error.name === 'SecurityError';
            state.nextUploadAttempt = time + Math.min(2000, 250 * 2 ** state.uploadFailures);
            showFallback(state.securityBlocked ? 'texture-security' : 'texture-retry');
            if (state.uploadFailures === 1) console.warn('Starry River: using 2D particles while the video texture is unavailable.', error);
        }
    }

    function render(time) {
        state.frame = null;
        if (!state.active || state.suspended || document.hidden || !state.resourcesReady || gl.isContextLost()) return;

        const frameInterval = 1000 / SPLAT_SETTINGS.renderFps;
        if (!reduceMotion.matches && time - state.lastRenderTime < frameInterval) {
            state.frame = window.requestAnimationFrame(render);
            return;
        }
        state.lastRenderTime = time;

        updateVideoTexture(time);
        if (!state.videoTextureReady) {
            if (!reduceMotion.matches && !state.securityBlocked && state.uploadFailures < 3) {
                state.frame = window.requestAnimationFrame(render);
            }
            return;
        }

        gl.clearColor(0, 0, 0, 0);
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
        gl.uniform1f(locations.time, reduceMotion.matches ? 0 : (time - state.startTime) / 1000);
        gl.uniform1f(
            locations.pointSize,
            (state.width < 768 ? SPLAT_SETTINGS.mobilePointSize : SPLAT_SETTINGS.desktopPointSize) * state.dpr
        );
        gl.drawArrays(gl.POINTS, 0, state.particleCount);
        if (gl.getError() !== gl.NO_ERROR || gl.isContextLost()) {
            showFallback('webgl-draw');
            disposeResources();
            return;
        }
        state.renderedFrames++;
        if (state.renderer !== 'webgl') {
            // Only retire the fallback after a real particle frame has been drawn.
            canvas.style.display = '';
            experience.classList.add('is-webgl-splat');
            state.renderer = 'webgl';
            state.fallbackReason = null;
            fallback?.hide();
        }
        if (!reduceMotion.matches) state.frame = window.requestAnimationFrame(render);
    }

    function startRendering() {
        if (state.frame !== null || !state.active || state.suspended || document.hidden || !state.resourcesReady) return;
        state.lastRenderTime = 0;
        state.frame = window.requestAnimationFrame(render);
    }

    function stopRendering() {
        if (state.frame === null) return;
        window.cancelAnimationFrame(state.frame);
        state.frame = null;
    }

    function requestTransition() {
        if (!state.active) return;
        enterButton.disabled = true;
        window.dispatchEvent(new CustomEvent('starry:opening-enter'));
    }

    function activate({ restart = false } = {}) {
        state.active = true;
        state.suspended = false;
        enterButton.disabled = false;
        fallback?.activate();

        if (restart) {
            openingVideo.currentTime = 0;
            state.startTime = performance.now();
            state.lastVideoTime = -1;
        }
        resume();
    }

    function deactivate() {
        state.active = false;
        enterButton.disabled = true;
        stopRendering();
        stopVideoFrames();
        fallback?.deactivate();
        openingVideo.pause();
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

    enterButton.addEventListener('click', requestTransition);

    let resizeFrame = null;
    window.addEventListener('resize', () => {
        if (resizeFrame) window.cancelAnimationFrame(resizeFrame);
        resizeFrame = window.requestAnimationFrame(() => { resizeFrame = null; resize(); });
    }, { passive: true });

    reduceMotion.addEventListener('change', () => {
        stopRendering();
        resume();
    });

    openingVideo.addEventListener('loadedmetadata', applyPlaybackRate);
    for (const event of ['loadeddata', 'canplay', 'seeked']) {
        openingVideo.addEventListener(event, () => {
            state.videoFrameDirty = true;
            state.uploadFailures = 0;
            state.nextUploadAttempt = 0;
            if (reduceMotion.matches) openingVideo.pause();
            if (state.active && !state.suspended && !document.hidden) startRendering();
        });
    }
    openingVideo.addEventListener('emptied', () => {
        state.videoTextureReady = false;
        state.lastVideoTime = -1;
        state.starsDetected = false;
        state.videoFrameDirty = true;
        state.securityBlocked = location.protocol === 'file:';
        showFallback('video-loading');
    });

    openingVideo.addEventListener('ratechange', () => {
        if (Math.abs(openingVideo.playbackRate - SPLAT_SETTINGS.playbackRate) > 0.001) {
            applyPlaybackRate();
        }
    });

    openingVideo.addEventListener('error', () => {
        stopRendering();
        state.videoTextureReady = false;
        showFallback('video-error');
    });

    function watchVideoFrames() {
        if (!hasVideoFrameCallback || videoFrame !== null || !state.active || state.suspended || reduceMotion.matches || document.hidden) return;
        videoFrame = openingVideo.requestVideoFrameCallback(() => {
            videoFrame = null;
            state.videoFrameDirty = true;
            watchVideoFrames();
        });
    }

    function stopVideoFrames() {
        if (videoFrame !== null) openingVideo.cancelVideoFrameCallback(videoFrame);
        videoFrame = null;
    }

    function resume() {
        if (!state.active || state.suspended || document.hidden) return;
        fallback?.resume();
        if (!state.resourcesReady) initializeResources();
        state.videoFrameDirty = true;
        state.uploadFailures = 0;
        state.nextUploadAttempt = 0;
        if (reduceMotion.matches) {
            openingVideo.pause();
            stopVideoFrames();
        } else {
            playOpeningVideo();
            watchVideoFrames();
        }
        startRendering();
    }

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            stopRendering();
            stopVideoFrames();
            openingVideo.pause();
        } else resume();
    });

    window.addEventListener('pageshow', () => {
        state.suspended = false;
        resume();
    });

    canvas.addEventListener('webglcontextlost', (event) => {
        event.preventDefault();
        stopRendering();
        disposeResources();
        showFallback('context-lost');
        if (!reduceMotion.matches && state.active) playOpeningVideo();
    });

    canvas.addEventListener('webglcontextrestored', () => {
        initializeResources();
        resume();
    });

    window.addEventListener('pagehide', (event) => {
        state.suspended = true;
        stopRendering();
        stopVideoFrames();
        fallback?.suspend();
        openingVideo.pause();
        if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame);
        resizeFrame = null;
        // BFCache keeps the document alive: retain its GPU objects for pageshow.
        if (!event.persisted) {
            disposeResources();
            showFallback('page-suspended');
        }
    });

    canvas.style.display = 'none';
    resize();
    resume();

    window.StarryOpeningScene = Object.freeze({
        activate,
        deactivate,
        restart() { activate({ restart: true }); }
    });

    // 调参用：控制台里 __STARRY__.set({ ... }) 即时生效，__STARRY__.help() 看说明
    window.__STARRY__ = {
        get particleCount() { return state.renderer === 'webgl' ? state.particleCount : fallback?.status.particles || state.particleCount; },
        get scene() { return state.active ? 'opening' : 'inactive'; },
        get textureReady() { return state.videoTextureReady; },
        get textureUploadFailed() { return state.textureUploadFailed; },
        get stars() { return state.stars || FALLBACK_STARS; },
        get settings() { return { ...SPLAT_SETTINGS }; },
        get darkGateSupported() { return supportsVertexTexture; },
        get status() {
            return { renderer: state.renderer === 'webgl' ? 'webgl' : fallback?.status.renderer || 'css',
                reason: state.fallbackReason, resourcesReady: state.resourcesReady,
                resourceGeneration: state.resourceGeneration, renderedFrames: state.renderedFrames,
                suspended: state.suspended, uploadFailures: state.uploadFailures,
                contextLost: !!gl?.isContextLost(), fallback: fallback?.status };
        },

        set(options) {
            let needsRebuild = false;
            const uniforms = { ringSpeed: 'ringSpeed', ringTightness: 'ringTightness',
                horizon: 'horizon', opacity: 'opacity', darkGate: 'darkGate', brightness: 'brightness',
                saturation: 'saturation', contrast: 'contrast', skyBoost: 'skyBoost' };
            if (state.resourcesReady) gl.useProgram(program);
            for (const [key, location] of Object.entries(uniforms)) {
                if (Number.isFinite(options[key])) {
                    SPLAT_SETTINGS[key] = options[key];
                    if (state.resourcesReady) gl.uniform1f(locations[location], options[key]);
                }
            }
            if (typeof options.videoOpacity === 'number') {
                SPLAT_SETTINGS.videoOpacity = options.videoOpacity;
                experience.style.setProperty('--starry-video-opacity', String(options.videoOpacity));
            }
            if (typeof options.splatOpacity === 'number') {
                SPLAT_SETTINGS.splatOpacity = options.splatOpacity;
                experience.style.setProperty('--starry-splat-opacity', String(options.splatOpacity));
            }
            if (typeof options.playbackRate === 'number') {
                SPLAT_SETTINGS.playbackRate = options.playbackRate;
                applyPlaybackRate();
            }
            if (typeof options.count === 'number') {
                SPLAT_SETTINGS.desktopTargetCount = options.count;
                needsRebuild = true;
            }
            if (typeof options.pointSize === 'number') {
                SPLAT_SETTINGS.desktopPointSize = options.pointSize;
            }
            if (Array.isArray(options.stars)) uploadStars(options.stars);
            if (needsRebuild) buildParticleGrid();
            startRendering();
        },

        help() {
            console.log([
                '__STARRY__.set({ 参数: 值 })  —— 改完立刻生效，刷新页面复原',
                '',
                '── 均匀粒子的手感 ──',
                '  ★ count      颗粒数量      调小 = 更离散、黑底缝隙更明显  调大 = 更密更满',
                `               现在 ${SPLAT_SETTINGS.desktopTargetCount}，想更像离散粒子试 40000，想铺满试 90000`,
                '',
                '  ★ pointSize  单颗大小      所有颗粒统一这个尺寸（不再随机）',
                `               现在 ${SPLAT_SETTINGS.desktopPointSize}，范围大概 3 ~ 7`,
                '',
                '  opacity      颗粒不透明度  调小 = 颗粒变淡、露出底层视频  调大 = 颗粒更实',
                `               现在 ${SPLAT_SETTINGS.opacity}`,
                '',
                '── 颜色（默认很淡＝基本保持底图原色）──',
                '  brightness   曝光          调小 = 更暗沉             调大 = 整体更亮',
                `               现在 ${SPLAT_SETTINGS.brightness}`,
                '  saturation   饱和度        调小 = 灰调               调大 = 蓝更蓝、金更金',
                `               现在 ${SPLAT_SETTINGS.saturation}`,
                '  contrast     对比度        调小 = 发灰发平           调大 = 更通透',
                `               现在 ${SPLAT_SETTINGS.contrast}`,
                '  ★ skyBoost   星空亮多少     星空比树/河水亮的比例，0.15 = 亮15%',
                `               现在 ${SPLAT_SETTINGS.skyBoost}（0 = 全区一样亮）`,
                '',
                '── 底图显隐 ──',
                '  splatOpacity 颗粒⇄原视频   0 = 全是原视频           1 = 全是颗粒',
                `               现在 ${SPLAT_SETTINGS.splatOpacity}`,
                '  videoOpacity 缝隙里的视频  调小 = 颗粒缝隙发黑       1 = 缝隙透出原画',
                `               现在 ${SPLAT_SETTINGS.videoOpacity}`,
                '',
                '── 运动 ──',
                '  ringSpeed    旋转速度      调小 = 转更慢             调大 = 转更快',
                `               现在 ${SPLAT_SETTINGS.ringSpeed}，0.02 很慢，0.08 已经偏快`,
                '  ringTightness 旋转范围     调小 = 漩涡铺得更开       调大 = 只贴着星星转',
                `               现在 ${SPLAT_SETTINGS.ringTightness}`,
                '  darkGate     暗部冻结      调小 = 暗部也跟着转       调大 = 更多暗部(树/岸)冻住',
                `               现在 ${SPLAT_SETTINGS.darkGate}，树还被卷就加到 0.22；天空太死就降到 0.10`,
                `               当前显卡支持暗部门控: ${supportsVertexTexture ? '是' : '否（darkGate/skyBoost 无效）'}`,
                '  playbackRate 视频速度      调小 = 更慢但会卡顿       1.0 = 流畅',
                `               现在 ${SPLAT_SETTINGS.playbackRate}（24fps × 本值 = ${Math.round(24 * SPLAT_SETTINGS.playbackRate)}fps）`,
                '',
                '例：__STARRY__.set({ count: 40000, pointSize: 4, skyBoost: 0.15 })'
            ].join('\n'));
        }
    };
})();
