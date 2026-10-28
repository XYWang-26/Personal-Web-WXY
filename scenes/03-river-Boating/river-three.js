import * as THREE from './vendor/three.module.min.js';
import { CCDIKSolver } from './vendor/CCDIKSolver.js';
import { RowingMotion } from './rowing-motion.js';

const WIDTH = 1672;
const HEIGHT = 941;
const CAMERA_DISTANCE = 1200;
const clamp = THREE.MathUtils.clamp;
const smooth = x => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
const point = (x, y, z = 0) => new THREE.Vector3(x - WIDTH / 2, HEIGHT / 2 - y, z);

// Traced in source-image pixels. Textures always come from the supplied photographs.
const LEFT_ARM = [[754,448],[737,457],[729,477],[718,512],[706,538],[686,553],[661,553],[650,542],[640,538],[629,546],[621,557],[627,571],[646,578],[673,588],[699,592],[712,588],[728,568],[746,539],[762,501],[775,467]];
const RIGHT_ARM = [[910,449],[928,457],[939,482],[949,514],[965,546],[982,558],[1007,561],[1017,550],[1027,546],[1040,552],[1049,564],[1054,573],[1041,580],[1018,585],[990,589],[964,590],[950,582],[935,555],[916,518],[898,478]];
const BODY = [[756,450],[750,433],[753,409],[761,383],[769,345],[786,320],[812,306],[836,301],[858,305],[879,323],[892,352],[899,384],[906,415],[902,441],[916,454],[903,481],[892,513],[894,551],[907,583],[931,612],[950,646],[966,680],[969,700],[953,720],[917,735],[879,739],[846,741],[807,737],[775,727],[751,709],[740,685],[735,661],[741,631],[751,601],[766,570],[775,537],[773,503],[770,474]];
const LEFT_OAR = [[650,550],[649,562],[420,717],[402,739],[327,795],[300,801],[270,792],[285,774],[386,713],[403,709]];
const RIGHT_OAR = [[1016,557],[1029,556],[1231,719],[1255,726],[1333,797],[1360,817],[1328,819],[1297,803],[1222,742],[1214,731]];
const BOAT = [[787,468],[875,466],[950,538],[1034,596],[1082,657],[1114,747],[1117,807],[1083,865],[1030,908],[1010,941],[661,941],[631,914],[590,868],[557,816],[550,756],[575,678],[621,598],[694,534]];
const SKYLINE_1 = [[0,343],[16,339],[30,310],[41,300],[52,316],[82,313],[97,296],[107,317],[139,313],[160,329],[182,331],[199,311],[209,339],[224,348],[246,323],[257,343],[287,347],[306,362],[343,351],[375,370],[414,363],[451,382],[498,376],[537,397],[587,398],[634,411],[670,416]];
const SKYLINE_2 = [[0,188],[15,184],[23,201],[36,217],[39,227],[41,211],[50,212],[52,225],[65,220],[69,213],[71,221],[79,219],[81,212],[85,213],[86,222],[115,220],[121,214],[130,236],[143,261],[145,205],[151,197],[153,181],[157,184],[163,158],[170,132],[174,111],[180,162],[184,180],[185,196],[192,202],[195,182],[197,202],[201,206],[199,209],[198,273],[208,267],[213,263],[217,271],[235,270],[244,268],[248,248],[251,239],[253,258],[258,265],[258,286],[266,288],[269,281],[275,281],[277,273],[280,276],[295,279],[302,282],[306,272],[311,268],[313,248],[315,228],[316,250],[320,268],[322,283],[326,280],[333,291],[350,293],[351,288],[354,294],[371,298],[374,294],[382,305],[387,306],[389,302],[392,310],[403,313],[414,317],[421,313],[426,300],[430,281],[434,317],[440,327],[443,332],[450,335],[456,331],[463,334],[470,333],[473,344],[482,343],[485,337],[488,346],[498,350],[508,369],[525,365],[546,384],[566,383],[589,396],[611,393],[636,405],[670,413]];
const SKYLINE_RIGHT_2 = [[1002,411],[1024,407],[1045,397],[1057,394],[1067,379],[1080,383],[1096,368],[1110,366],[1127,353],[1139,336],[1145,326],[1152,323],[1165,330],[1174,317],[1186,320],[1191,282],[1197,261],[1204,260],[1212,278],[1224,279],[1238,274],[1244,276],[1247,268],[1252,273],[1269,272],[1277,264],[1281,260],[1288,262],[1292,258],[1293,251],[1298,252],[1303,261],[1313,261],[1318,254],[1324,259],[1325,225],[1332,220],[1330,197],[1337,192],[1338,174],[1343,161],[1343,150],[1348,138],[1346,126],[1349,120],[1352,138],[1358,145],[1361,151],[1359,164],[1368,186],[1373,195],[1370,217],[1381,222],[1379,243],[1391,239],[1394,218],[1400,216],[1405,222],[1405,233],[1427,219],[1431,211],[1435,216],[1448,215],[1450,210],[1457,211],[1457,220],[1470,196],[1474,188],[1479,174],[1482,150],[1483,125],[1484,116],[1488,146],[1492,165],[1496,174],[1492,186],[1497,185],[1502,173],[1509,174],[1511,181],[1532,192],[1557,203],[1554,171],[1556,165],[1561,162],[1567,167],[1568,181],[1585,151],[1590,154],[1616,158],[1618,142],[1615,139],[1620,133],[1627,101],[1629,71],[1632,100],[1638,122],[1641,134],[1649,140],[1647,155],[1655,162],[1655,150],[1660,145],[1666,149],[1667,167],[1672,170]];

function makeCanvas() {
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    return canvas;
}

function polygon(context, points) {
    context.beginPath();
    points.forEach(([x, y], i) => i ? context.lineTo(x, y) : context.moveTo(x, y));
    context.closePath();
}

function maskFor(polygons, padding = 0) {
    const canvas = makeCanvas();
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.fillStyle = '#000';
    context.fillRect(0, 0, WIDTH, HEIGHT);
    context.fillStyle = '#fff';
    context.strokeStyle = '#fff';
    context.lineJoin = 'round';
    context.lineWidth = padding * 2;
    for (const points of polygons) {
        polygon(context, points);
        context.fill();
        if (padding) context.stroke();
    }
    return canvas;
}

function canvasTexture(canvas, color = false) {
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    return texture;
}

function patchGeometry(points, step = 7) {
    const left = Math.max(0, Math.floor(Math.min(...points.map(p => p[0])) - 3));
    const right = Math.min(WIDTH, Math.ceil(Math.max(...points.map(p => p[0])) + 3));
    const top = Math.max(0, Math.floor(Math.min(...points.map(p => p[1])) - 3));
    const bottom = Math.min(HEIGHT, Math.ceil(Math.max(...points.map(p => p[1])) + 3));
    const geometry = new THREE.PlaneGeometry(right - left, bottom - top, Math.ceil((right - left) / step), Math.ceil((bottom - top) / step));
    geometry.translate((left + right - WIDTH) / 2, (HEIGHT - top - bottom) / 2, 0);
    const positions = geometry.attributes.position;
    const uv = geometry.attributes.uv;
    for (let i = 0; i < positions.count; i += 1) {
        uv.setXY(i, (positions.getX(i) + WIDTH / 2) / WIDTH, (positions.getY(i) + HEIGHT / 2) / HEIGHT);
    }
    return geometry;
}

function materialFor(texture, points) {
    return new THREE.MeshBasicMaterial({
        map: texture,
        alphaMap: canvasTexture(maskFor([points])),
        transparent: true,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false
    });
}

function bankMask(image, outline) {
    const mask = maskFor([outline]);
    const feathered = makeCanvas();
    const context = feathered.getContext('2d');
    context.filter = 'blur(1.2px)';
    context.drawImage(mask, 0, 0);
    return feathered;
}

function polygonDistance(x, y, outline) {
    let inside = false;
    let distance = Infinity;
    for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
        const [ax, ay] = outline[j];
        const [bx, by] = outline[i];
        if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
        const dx = bx - ax;
        const dy = by - ay;
        const t = clamp(((x - ax) * dx + (y - ay) * dy) / Math.max(1, dx * dx + dy * dy), 0, 1);
        distance = Math.min(distance, Math.hypot(x - ax - t * dx, y - ay - t * dy));
    }
    return inside ? -distance : distance;
}

function jointWeight(x, y, shoulder, elbow, hand) {
    function distance(a, b) {
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const t = clamp(((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy), 0, 1);
        return Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t);
    }
    return smooth((distance(shoulder, elbow) - distance(elbow, hand) + 12) / 24);
}

function continuousArtGeometry() {
    const geometry = new THREE.PlaneGeometry(WIDTH, HEIGHT, 300, 170);
    const position = geometry.attributes.position;
    const left = [];
    const right = [];
    for (let i = 0; i < position.count; i += 1) {
        const x = position.getX(i) + WIDTH / 2;
        const y = HEIGHT / 2 - position.getY(i);
        const edge = smooth(Math.min(x, WIDTH - x, y, HEIGHT - y) / 85);
        const dBody = polygonDistance(x, y, BODY);
        const dBoat = polygonDistance(x, y, BOAT);
        const dLeft = polygonDistance(x, y, LEFT_ARM);
        const dRight = polygonDistance(x, y, RIGHT_ARM);
        const dOarLeft = polygonDistance(x, y, LEFT_OAR);
        const dOarRight = polygonDistance(x, y, RIGHT_OAR);
        const outsideBody = smooth((dBody + 2) / 22);
        const outsideBoat = smooth((dBoat + 6) / 45);
        let armLeft = smooth(1 - Math.max(0, dLeft) / 46) * (dLeft <= 0 ? 1 : outsideBody);
        let armRight = smooth(1 - Math.max(0, dRight) / 46) * (dRight <= 0 ? 1 : outsideBody);
        if (dOarLeft < 0 && dLeft > 1) armLeft = 0;
        if (dOarRight < 0 && dRight > 1) armRight = 0;
        const arm = Math.max(armLeft, armRight);
        const oarLeft = smooth(1 - Math.max(0, dOarLeft) / 190) * (1 - arm) * (dOarLeft < 0 ? 1 : outsideBoat) * outsideBody;
        const oarRight = smooth(1 - Math.max(0, dOarRight) / 190) * (1 - arm) * (dOarRight < 0 ? 1 : outsideBoat) * outsideBody;
        const body = smooth(1 - Math.max(0, dBody) / 25)
            * smooth((725 - y) / 270) * (1 - arm);
        const lowerLeft = jointWeight(x, y, [754,465], [705,576], [644,559]);
        const lowerRight = jointWeight(x, y, [915,468], [964,576], [1028,567]);
        const total = Math.max(1, armLeft + armRight + oarLeft + oarRight);
        left.push(armLeft * (1 - lowerLeft) / total * edge, armLeft * lowerLeft / total * edge, oarLeft / total * edge, body * edge);
        right.push(armRight * (1 - lowerRight) / total * edge, armRight * lowerRight / total * edge, oarRight / total * edge, 0);
    }
    geometry.setAttribute('leftWeights', new THREE.Float32BufferAttribute(left, 4));
    geometry.setAttribute('rightWeights', new THREE.Float32BufferAttribute(right, 4));
    return geometry;
}

function armRig(texture, outline, shoulder, elbow, wrist, side) {
    const geometry = patchGeometry(outline, 4);
    const positions = geometry.attributes.position;
    const indices = [];
    const weights = [];
    const s = point(...shoulder);
    const e = point(...elbow);
    const w = point(...wrist);
    const upper = new THREE.Line3(s, e);
    const lower = new THREE.Line3(e, w);
    const closestUpper = new THREE.Vector3();
    const closestLower = new THREE.Vector3();
    const vertex = new THREE.Vector3();
    for (let i = 0; i < positions.count; i += 1) {
        vertex.fromBufferAttribute(positions, i);
        upper.closestPointToPoint(vertex, true, closestUpper);
        lower.closestPointToPoint(vertex, true, closestLower);
        const dUpper = vertex.distanceTo(closestUpper);
        const dLower = vertex.distanceTo(closestLower);
        const forearm = smooth((dUpper - dLower + 10) / 20);
        indices.push(0, 1, 0, 0);
        weights.push(1 - forearm, forearm, 0, 0);
    }
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
    const mesh = new THREE.SkinnedMesh(geometry, materialFor(texture, outline));
    mesh.frustumCulled = false;
    mesh.renderOrder = 30;
    const root = new THREE.Bone();
    const middle = new THREE.Bone();
    const hand = new THREE.Bone();
    const target = new THREE.Bone();
    root.position.copy(s);
    middle.position.copy(e).sub(s);
    hand.position.copy(w).sub(e);
    target.position.copy(w);
    root.add(middle);
    middle.add(hand);
    mesh.add(root, target);
    mesh.bind(new THREE.Skeleton([root, middle, hand, target]));
    const solver = new CCDIKSolver(mesh, [{
        target: 3, effector: 2, iteration: 20, maxAngle: 0.12,
        links: [
            { index: 1, rotationMin: new THREE.Vector3(0, 0, side < 0 ? -0.65 : -0.95), rotationMax: new THREE.Vector3(0, 0, side < 0 ? 0.95 : 0.65) },
            { index: 0, rotationMin: new THREE.Vector3(0, 0, -0.6), rotationMax: new THREE.Vector3(0, 0, 0.6) }
        ]
    }]);
    return { mesh, root, middle, hand, target, solver, shoulder: s, wrist: w };
}

function createOar(texture, outline, pivot, grip, tip, side) {
    const geometry = patchGeometry(outline, 8);
    const center = point(...pivot);
    geometry.translate(-center.x, -center.y, 0);
    const mesh = new THREE.Mesh(geometry, materialFor(texture, outline));
    mesh.position.copy(center);
    mesh.renderOrder = 20;
    mesh.frustumCulled = false;
    return { mesh, center, grip: point(...grip).sub(center), tip: point(...tip).sub(center), side };
}

export async function createRiverRenderer(canvas, image) {
    if (!image.complete || !image.naturalWidth) await image.decode();
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.NoToneMapping;
    const world = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(2 * Math.atan(HEIGHT / (2 * CAMERA_DISTANCE)) * 180 / Math.PI, WIDTH / HEIGHT, 1, 4000);
    camera.position.z = CAMERA_DISTANCE;
    const anchor = new THREE.Group();
    world.add(anchor);
    const motion = new RowingMotion();
    const original = new THREE.Texture(image);
    original.colorSpace = THREE.SRGBColorSpace;
    original.minFilter = THREE.LinearFilter;
    original.magFilter = THREE.LinearFilter;
    original.generateMipmaps = false;
    original.needsUpdate = true;
    const stableMask = canvasTexture(maskFor([BOAT, BODY, LEFT_ARM, RIGHT_ARM]));
    const textureLoader = new THREE.TextureLoader();
    const near = await textureLoader.loadAsync(new URL('./02.png', import.meta.url).href);
    near.colorSpace = THREE.SRGBColorSpace;
    near.minFilter = THREE.LinearFilter;
    near.generateMipmaps = false;

    const baseUniforms = {
        source: { value: original }, near: { value: near }, stable: { value: stableMask },
        progress: { value: 0 }, distance: { value: 0 }, blink: { value: 0 }, yawn: { value: 0 },
        leftTip: { value: new THREE.Vector2() }, rightTip: { value: new THREE.Vector2() },
        stroke: { value: 0 }, waterPower: { value: 0 }, lean: { value: 0 },
        leftUpper: { value: new THREE.Matrix4() }, leftLower: { value: new THREE.Matrix4() },
        rightUpper: { value: new THREE.Matrix4() }, rightLower: { value: new THREE.Matrix4() },
        leftOar: { value: new THREE.Matrix4() }, rightOar: { value: new THREE.Matrix4() }
    };
    const baseMaterial = new THREE.ShaderMaterial({
        uniforms: baseUniforms,
        depthTest: false, depthWrite: false,
        vertexShader: `
            attribute vec4 leftWeights, rightWeights;
            uniform mat4 leftUpper, leftLower, rightUpper, rightLower, leftOar, rightOar;
            uniform float lean;
            varying vec2 vUv;
            void main() {
                vUv = uv;
                vec4 p = vec4(position, 1.);
                vec3 moved = position;
                moved += (leftUpper * p - p).xyz * leftWeights.x;
                moved += (leftLower * p - p).xyz * leftWeights.y;
                moved += (leftOar * p - p).xyz * leftWeights.z;
                moved += (rightUpper * p - p).xyz * rightWeights.x;
                moved += (rightLower * p - p).xyz * rightWeights.y;
                moved += (rightOar * p - p).xyz * rightWeights.z;
                moved.y -= lean * leftWeights.w;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(moved, 1.);
            }`,
        fragmentShader: `
            uniform sampler2D source, near, stable;
            uniform float progress, distance, blink, yawn, stroke, waterPower;
            uniform vec2 leftTip, rightTip;
            varying vec2 vUv;
            float ellipse(vec2 p, vec2 c, vec2 r) {
                return 1.0 - smoothstep(0.55, 1.0, length((p - c) / r));
            }
            vec2 blinkEye(vec2 uv, vec2 center) {
                vec2 px = uv * vec2(1672., 941.);
                float region = ellipse(px, center, vec2(11., 10.));
                float local = (px.y - center.y) / max(0.12, 1. - blink * 0.88);
                px.y = mix(px.y, center.y + local, region * blink);
                return px / vec2(1672., 941.);
            }
            void main() {
                vec2 uv = vUv;
                float fixedPart = texture2D(stable, uv).r;
                float water = (1. - smoothstep(0.53, 0.57, uv.y)) * (1. - fixedPart);
                // Perspective flow accelerates toward the foreground and is driven by travel only.
                float depth = pow(max(0., (0.565 - uv.y) / 0.565), 1.7);
                uv.x += sin(uv.y * 57. + distance * 0.7) * 0.0011 * sin(distance * 0.5) * water * depth;
                uv.y += sin(distance * 0.6) * 0.005 * water * depth;
                vec2 dogUv = blinkEye(uv, vec2(862.5, 941. - 778.5));
                dogUv = blinkEye(dogUv, vec2(903., 941. - 779.));
                vec2 px = dogUv * vec2(1672., 941.);
                float mouth = ellipse(px, vec2(886., 941. - 826.), vec2(16., 10.));
                dogUv.y += mouth * yawn * (px.y - (941. - 823.)) / 941. * -0.72;
                vec4 color = texture2D(source, dogUv);
                vec4 arrivingWater = texture2D(near, uv);
                color = mix(color, arrivingWater, progress * water * 0.88);
                vec2 p = vec2(vUv.x, 1. - vUv.y);
                float ring = 0.;
                for (int i = 0; i < 2; i++) {
                    vec2 tip = i == 0 ? leftTip : rightTip;
                    vec2 delta = (p - tip) * vec2(1., 3.2);
                    float radius = length(delta);
                    float wave = pow(max(0., cos(radius * 620. - stroke * 13.)), 14.);
                    ring += wave * exp(-radius * 36.) * smoothstep(0., 0.012, radius);
                }
                color.rgb += ring * waterPower * water * vec3(0.035, 0.055, 0.065);
                gl_FragColor = color;
                #include <colorspace_fragment>
            }
        `
    });
    const base = new THREE.Mesh(continuousArtGeometry(), baseMaterial);
    anchor.add(base);

    const arms = [
        armRig(original, LEFT_ARM, [754,465], [705,576], [644,559], -1),
        armRig(original, RIGHT_ARM, [915,468], [964,576], [1028,567], 1)
    ];
    const oars = [
        createOar(original, LEFT_OAR, [558,614], [644,559], [302,787], -1),
        createOar(original, RIGHT_OAR, [1113,632], [1028,567], [1328,808], 1)
    ];

    const banks = [];
    for (const side of [-1, 1]) {
        for (const [i, profile] of [SKYLINE_1, SKYLINE_2].entries()) {
            const outline = i === 1 && side > 0
                ? [...SKYLINE_RIGHT_2, [WIDTH,451], [1002,437]]
                : [...profile, [670, 437], [0, 451]].map(([x, y]) => [side < 0 ? x : WIDTH - x, y]);
            const geometry = patchGeometry(outline, 12);
            const rest = geometry.attributes.position.array.slice();
            const material = materialFor(i === 0 ? original : near, outline);
            material.alphaMap.dispose();
            material.alphaMap = canvasTexture(bankMask(i === 0 ? image : near.image, outline));
            const bank = new THREE.Mesh(geometry, material);
            bank.renderOrder = 5 + i;
            bank.frustumCulled = false;
            world.add(bank);
            banks.push({ mesh: bank, rest, index: i, side });
        }
    }

    let ready = true;
    let disposed = false;
    let viewWidth = WIDTH;
    let viewHeight = HEIGHT;
    let lastRenderKey = '';
    const handPosition = new THREE.Vector3();
    const tipPosition = new THREE.Vector3();
    let gripError = 0;

    function updatePose(pose, progress, dog = { blink: 0, yawn: 0 }) {
        camera.position.z = CAMERA_DISTANCE - progress * 110;
        anchor.position.z = camera.position.z - CAMERA_DISTANCE;
        baseUniforms.lean.value = pose.lean;
        gripError = 0;
        for (let i = 0; i < oars.length; i += 1) {
            const oar = oars[i];
            const arm = arms[i];
            const angle = -oar.side * pose.sweep;
            oar.mesh.quaternion.setFromAxisAngle(new THREE.Vector3(0,0,1), -angle);
            // In the projection the oarlock stays fixed; pitch raises the blade while lowering the grip.
            oar.mesh.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0), pose.lift * 0.006));
            oar.mesh.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(oar.grip.clone().normalize(), pose.roll * 0.85));
            oar.mesh.updateMatrix();
            handPosition.copy(oar.grip).applyMatrix4(oar.mesh.matrix);
            handPosition.z = 0;
            arm.root.position.copy(arm.shoulder);
            arm.root.position.y -= pose.lean * 0.92;
            arm.root.quaternion.identity();
            arm.middle.quaternion.identity();
            arm.target.position.copy(handPosition);
            arm.mesh.updateMatrixWorld(true);
            if (Math.abs(pose.sweep) + Math.abs(pose.lean) + Math.abs(pose.lift) > 0.0001) arm.solver.update();
            arm.mesh.updateMatrixWorld(true);
            arm.mesh.skeleton.update();
            baseUniforms[i === 0 ? 'leftUpper' : 'rightUpper'].value.fromArray(arm.mesh.skeleton.boneMatrices, 0);
            baseUniforms[i === 0 ? 'leftLower' : 'rightLower'].value.fromArray(arm.mesh.skeleton.boneMatrices, 16);
            baseUniforms[i === 0 ? 'leftOar' : 'rightOar'].value.copy(oar.mesh.matrix)
                .multiply(new THREE.Matrix4().makeTranslation(-oar.center.x, -oar.center.y, 0));
            const actual = new THREE.Vector3();
            arm.hand.getWorldPosition(actual);
            actual.z = 0;
            gripError = Math.max(gripError, actual.distanceTo(handPosition));
            tipPosition.copy(oar.tip).applyMatrix4(oar.mesh.matrix);
            baseUniforms[i === 0 ? 'leftTip' : 'rightTip'].value.set((tipPosition.x + WIDTH / 2) / WIDTH, (HEIGHT / 2 - tipPosition.y) / HEIGHT);
        }
        const journey = smooth(progress);
        for (const bank of banks) {
            const position = bank.mesh.geometry.attributes.position;
            const horizon = HEIGHT / 2 - 421;
            const expansion = bank.index === 0 ? 1 + journey * 1.65 : 0.38 + journey * 0.62;
            // Calibrated depth starts pixel-aligned, then perspective gradually opens the river banks.
            const depth = -180;
            const calibration = (CAMERA_DISTANCE - depth) / CAMERA_DISTANCE;
            for (let i = 0; i < position.count; i += 1) {
                const x = bank.rest[i * 3];
                const y = bank.rest[i * 3 + 1];
                position.setXYZ(i, x * calibration, (horizon + (y - horizon) * expansion) * calibration, 0);
            }
            position.needsUpdate = true;
            bank.mesh.position.z = depth;
            bank.mesh.material.opacity = bank.index === 0 ? 1 - journey : journey;
        }
        baseUniforms.progress.value = journey;
        baseUniforms.distance.value = motion.distance;
        baseUniforms.blink.value = dog.blink;
        baseUniforms.yawn.value = dog.yawn;
        baseUniforms.stroke.value = motion.phase;
        baseUniforms.waterPower.value = pose.water * motion.intensity;
    }

    function resize(width, height, dpr) {
        viewWidth = width;
        viewHeight = height;
        renderer.setPixelRatio(Math.min(2, dpr));
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        // The same cover projection is used by the original particle canvas.
        const visibleHeight = Math.min(HEIGHT, WIDTH / camera.aspect);
        camera.fov = 2 * Math.atan(visibleHeight / (2 * CAMERA_DISTANCE)) * 180 / Math.PI;
        camera.updateProjectionMatrix();
        lastRenderKey = '';
    }

    function render() {
        if (disposed) return;
        const dog = motion.dog;
        const key = [motion.phase, motion.intensity, motion.progress, motion.distance, dog.blink, dog.yawn].join(':');
        if (key === lastRenderKey) return;
        lastRenderKey = key;
        updatePose(motion.pose, motion.progress, dog);
        renderer.render(world, camera);
    }

    canvas.addEventListener('webglcontextlost', event => {
        event.preventDefault();
        motion.stop();
        ready = false;
    });
    canvas.addEventListener('webglcontextrestored', () => { ready = true; lastRenderKey = ''; render(); });
    return {
        motion, resize, render,
        update(delta) {
            let remaining = Math.min(delta / 1000, 0.25);
            while (remaining > 0) {
                const step = Math.min(remaining, 1 / 60);
                motion.update(step);
                remaining -= step;
            }
        },
        input(pixels) { motion.input(pixels); },
        stop() { motion.stop(); render(); },
        setProgress(value) { motion.setProgress(value); render(); },
        get ready() { return ready; },
        get diagnostics() {
            return { engine: 'Three.js', revision: THREE.REVISION, width: viewWidth, height: viewHeight,
                phase: motion.phase, stage: motion.pose.stage, active: motion.active, finishing: motion.finishing,
                cycles: motion.cycles, progress: motion.progress, period: motion.period, gripError,
                blink: motion.dog.blink, yawn: motion.dog.yawn, triangles: renderer.info.render.triangles };
        },
        dispose() {
            disposed = true;
            motion.stop();
            world.traverse(object => {
                object.geometry?.dispose();
                object.material?.alphaMap?.dispose();
                object.material?.dispose();
            });
            for (const { mesh } of [...arms, ...oars]) {
                mesh.geometry.dispose();
                mesh.material.alphaMap.dispose();
                mesh.material.dispose();
                mesh.skeleton?.dispose();
            }
            for (const texture of [original, stableMask, near]) texture.dispose();
            renderer.dispose();
        }
    };
}
