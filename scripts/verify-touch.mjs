// Functional check of the coarse-pointer behaviors (TG-Q3 / LD10) on the
// production build in headless Edge:
//   1. edge overscan — once zoomed, labels exist fully outside the viewport
//      (they slide in during pans instead of popping at the border)
//   2. long-press on a label → preview tooltip shows above the finger,
//      release does NOT open the modal, preview lingers after release
//   3. plain tap on the same label → detail modal opens, lingering preview cleared
//
// Run: npm run build && npm run verify:touch
import { setTimeout as sleep } from 'node:timers/promises';
import { launchMobile } from './cdp-mobile.mjs';

const { js, touch, consoleIssues, close } = await launchMobile({ port: 4174, cdpPort: 9334 });

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? ' — ' + extra : ''}`);
    ok ? pass++ : fail++;
};

// --- 1. Overscan: zoom in first — at the default view the whole domain fits
// the viewport, so no off-screen labels can exist yet.
const svgBox = await js(`(() => {
    const r = document.querySelector('svg.d3-timeline').getBoundingClientRect();
    return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
})()`);
const pts = g => [{ x: svgBox.cx - g / 2, y: svgBox.cy }, { x: svgBox.cx + g / 2, y: svgBox.cy }];
await touch('touchStart', pts(60));
for (let i = 1; i <= 30; i++) {
    await touch('touchMove', pts(60 + i * 8));
    await sleep(16);
}
await touch('touchEnd', []);
await sleep(500);
const overscanInfo = await js(`(() => {
    const r = document.querySelector('svg.d3-timeline').getBoundingClientRect();
    const labels = [...document.querySelectorAll('g.label-node text.event-label')];
    const outside = labels.filter(t => {
        const b = t.getBoundingClientRect();
        return b.right < r.left || b.left > r.right;
    });
    return { total: labels.length, outside: outside.length };
})()`);
check('overscan places off-screen labels once zoomed', overscanInfo.outside > 0,
    `${overscanInfo.outside}/${overscanInfo.total} labels fully off-screen`);

// --- 1b. Edge fade: label opacity ramps with distance from the border ------
// (mirrors edgeFadePx in Timeline.jsx: min(120, max(48, width * 0.14)))
const fadeInfo = await js(`(() => {
    const svg = document.querySelector('svg.d3-timeline');
    const width = svg.clientWidth - 40; // minus left+right margins
    const band = Math.min(120, Math.max(48, width * 0.14));
    const labels = [...document.querySelectorAll('text.event-label')].map(t => ({
        x: +t.getAttribute('x'), o: +t.getAttribute('opacity'),
    }));
    return {
        ramp: labels.filter(l => l.o > 0 && l.o < 1).length,
        fullInterior: labels.filter(l => l.x > band && l.x < width - band)
            .every(l => l.o === 1),
        zeroOutside: labels.filter(l => l.x < 0 || l.x > width)
            .every(l => l.o === 0),
        total: labels.length,
    };
})()`);
check('edge fade: some labels mid-ramp', fadeInfo.ramp > 0,
    `${fadeInfo.ramp}/${fadeInfo.total} labels between 0 and 1`);
check('edge fade: interior labels at full opacity', fadeInfo.fullInterior);
check('edge fade: off-screen labels fully transparent', fadeInfo.zeroOutside);

// --- 2. Long-press a visible label: tooltip up, no modal on release --------
const target = await js(`(() => {
    const r = document.querySelector('svg.d3-timeline').getBoundingClientRect();
    const hits = [...document.querySelectorAll('g.label-node rect.label-hit')];
    const visible = hits.map(h => h.getBoundingClientRect())
        .find(b => b.left > r.left + 20 && b.right < r.right - 20);
    return { x: visible.x + visible.width / 2, y: visible.y + visible.height / 2 };
})()`);
await touch('touchStart', [target]);
await sleep(750);
const ttUp = await js(`document.querySelector('.timeline-tooltip').style.opacity === '1'`);
const ttText = await js(`document.querySelector('.timeline-tooltip').textContent`);
await touch('touchEnd', []);
await sleep(400);
const modalAfterHold = await js(`!!document.querySelector('.event-modal')`);
check('long-press shows preview tooltip', ttUp, JSON.stringify(ttText?.slice(0, 40)));
check('long-press release does not open modal', !modalAfterHold);
const ttAfterHold = await js(`document.querySelector('.timeline-tooltip').style.opacity === '1'`);
check('preview tooltip lingers after release', ttAfterHold);

// --- 3. Plain tap on the same label: modal opens, lingering preview cleared -
await touch('touchStart', [target]);
await sleep(60);
await touch('touchEnd', []);
await sleep(400);
const modalAfterTap = await js(`!!document.querySelector('.event-modal')`);
const modalTitle = await js(`document.querySelector('.event-modal h2')?.textContent`);
check('plain tap opens the detail modal', modalAfterTap, JSON.stringify(modalTitle));
const ttAfterTap = await js(`document.querySelector('.timeline-tooltip').style.opacity`);
check('tap cleared the lingering preview tooltip', ttAfterTap !== '1');

if (consoleIssues.length) console.log('console errors/warnings:', consoleIssues);
console.log(fail === 0 ? `ALL ${pass} CHECKS PASS` : `${fail} CHECKS FAILED`);
close();
process.exit(fail === 0 ? 0 : 1);
