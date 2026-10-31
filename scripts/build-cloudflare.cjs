const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const output = path.join(root, '.cloudflare-dist');
const files = [
    'index.html', 'starry-opening.js', 'Part 3.png',
    'coze 客服系统.png', 'coze标书系统.png', 'Saas插件 coze系统.png', 'Girl dog 醒图PS版.jpg',
    'scenes/01-opening/opening-fallback.js', 'scenes/01-opening/01-opening.js',
    'scenes/01-opening/starry-v007-poster.jpg',
    'scenes/02-transition/02 River Bank.png', 'scenes/02-transition/transition-scene.js',
    'scenes/03-river-Boating/01.jpg', 'scenes/03-river-Boating/02.png',
    'scenes/03-river-Boating/river-scene.js', 'scenes/03-river-Boating/river-three.js',
    'scenes/03-river-Boating/rowing-motion.js', 'scenes/03-river-Boating/vendor/CCDIKSolver.js',
    'scenes/03-river-Boating/vendor/three.module.min.js', 'scenes/03-river-Boating/vendor/three.core.min.js',
];
const video = 'scenes/01-opening/星月夜-树影修正与月晕分速-5秒-4K-v007.mp4';
const inputs = [...files.map(file => [file, file]), ['deployment-assets/starry-opening.mp4', video]];
for (const [source] of inputs) {
    const stat = fs.statSync(path.join(root, source));
    if (!stat.isFile() || stat.size > 25 * 1024 * 1024) throw new Error(`Invalid Cloudflare asset: ${source}`);
}
if (fs.existsSync(output)) throw new Error(`Output directory already exists: ${output}`);
for (const [source, destination] of inputs) {
    const target = path.join(output, destination);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(root, source), target);
}
console.log(`Prepared ${inputs.length} Cloudflare assets in ${output}`);
