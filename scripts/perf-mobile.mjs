// Emulated-mobile performance check (TG-Q3): drives real touch gestures on
// the production build in headless Edge and reports rAF frame-time stats per
// gesture. CPU throttling approximates phone hardware (4x ≈ mid-range,
// 6x ≈ low-end). Reference numbers live in docs/design/touch-gestures.md §5.
//
// Run: npm run build && npm run perf:mobile [-- <cpuThrottle>]   (default 4)
import { setTimeout as sleep } from 'node:timers/promises';
import { launchMobile } from './cdp-mobile.mjs';

const THROTTLE = Number(process.argv[2] ?? 4);
const { js, touch, close } = await launchMobile({ port: 4173, cdpPort: 9333, cpuThrottle: THROTTLE });

console.log(`viewport 390x844@3x mobile, CPU throttle ${THROTTLE}x`);
console.log('pointer coarse:', await js(`matchMedia('(pointer: coarse)').matches`));
console.log('svg nodes:', await js(`document.querySelectorAll('svg.d3-timeline *').length`),
    '| labels:', await js(`document.querySelectorAll('g.label-node').length`),
    '| chips:', await js(`document.querySelectorAll('g.cluster-chip').length`));

const box = await js(`JSON.stringify(document.querySelector('svg.d3-timeline').getBoundingClientRect())`)
    .then(JSON.parse);
const cx = Math.round(box.x + box.width / 2);
const cy = Math.round(box.y + box.height / 2);

const drag = async (fromX, dx, steps, stepMs) => {
    await touch('touchStart', [{ x: fromX, y: cy }]);
    for (let i = 1; i <= steps; i++) {
        await touch('touchMove', [{ x: fromX + dx * i / steps, y: cy }]);
        await sleep(stepMs);
    }
    await touch('touchEnd', []);
};
const pinch = async (startGap, endGap, steps, stepMs) => {
    const pts = g => [{ x: cx - g / 2, y: cy }, { x: cx + g / 2, y: cy }];
    await touch('touchStart', pts(startGap));
    for (let i = 1; i <= steps; i++) {
        await touch('touchMove', pts(startGap + (endGap - startGap) * i / steps));
        await sleep(stepMs);
    }
    await touch('touchEnd', []);
};

// rAF frame-time collection around a gesture.
const measure = async (name, fn, settleMs = 0) => {
    await js(`window.__f = []; window.__on = true;
        (function loop(){ if (!window.__on) return;
            window.__f.push(performance.now()); requestAnimationFrame(loop); })();`);
    await fn();
    if (settleMs) await sleep(settleMs);
    const frames = await js(`(window.__on = false, window.__f)`);
    const dts = frames.slice(2).map((t, i) => t - frames[i + 1]).filter(dt => dt > 0);
    if (dts.length < 5) { console.log(`${name}: too few frames (${dts.length})`); return; }
    dts.sort((a, b) => a - b);
    const q = p => dts[Math.min(dts.length - 1, Math.floor(dts.length * p))];
    const mean = dts.reduce((a, b) => a + b, 0) / dts.length;
    const jank = dts.filter(dt => dt > 33.4).length / dts.length * 100;
    console.log(`${name}: ${dts.length} frames | mean ${mean.toFixed(1)}ms (${(1000 / mean).toFixed(0)}fps) | ` +
        `p50 ${q(0.5).toFixed(1)} | p95 ${q(0.95).toFixed(1)} | max ${q(1).toFixed(1)} | >33ms: ${jank.toFixed(0)}%`);
};

await measure('slow drag  (350px, ~1.2s)', () => drag(cx + 175, -350, 70, 16));
await sleep(300);
await measure('flick + glide', () => drag(cx + 120, -240, 8, 16), 1500);
await sleep(300);
await measure('pinch zoom in (5x)', () => pinch(60, 300, 50, 16));
await sleep(300);
await measure('drag while zoomed', () => drag(cx + 175, -350, 70, 16));
await sleep(300);
await measure('pinch zoom out', () => pinch(300, 60, 50, 16));
await sleep(300);
// Double-tap: two quick taps slightly off-center → step-zoom flight.
await measure('double-tap flight', async () => {
    for (const _ of [0, 1]) {
        await touch('touchStart', [{ x: cx + 60, y: cy }]);
        await touch('touchEnd', []);
        await sleep(80);
    }
}, 900);

console.log('svg nodes after:', await js(`document.querySelectorAll('svg.d3-timeline *').length`));
close();
process.exit(0);
