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

// --- 0. First-run gesture coach (D26) ------------------------------------
// Must run BEFORE anything else touches the screen: the coach clears itself on
// the first pointerdown, so any earlier gesture in this script would dismiss it
// and the checks below would pass against an absent element.
const svgBox = await js(`(() => {
    const r = document.querySelector('svg.d3-timeline').getBoundingClientRect();
    return { cx: r.x + r.width / 2, cy: r.y + r.height / 2, top: r.y };
})()`);
{
    const coach = await js(`(() => {
        const el = document.querySelector('.gesture-coach');
        if (!el) return null;
        return {
            text: el.textContent,
            hints: getComputedStyle(document.querySelector('.timeline-info')).display,
        };
    })()`);
    check('gesture coach shows where the control hints are hidden',
        !!coach && coach.hints === 'none', coach ? `hints display: ${coach.hints}` : 'no coach');
    // The copy must be the coarse-pointer variant: telling a phone user to
    // Ctrl+scroll is worse than saying nothing.
    check('gesture coach uses touch copy',
        !!coach && /Pinch/.test(coach.text) && !/Ctrl/.test(coach.text),
        coach ? coach.text.replace(/\s+/g, ' ').trim().slice(0, 60) : '');

    // A tap on empty chart background: it must dismiss the coach, and — because
    // the panel is pointer-events:none — must still reach the chart underneath.
    // Dismissing may never cost the user their first gesture.
    await touch('touchStart', [{ x: svgBox.cx, y: svgBox.top + 12 }]);
    await touch('touchEnd', []);
    await sleep(400);
    const after = await js(`({
        gone: !document.querySelector('.gesture-coach'),
        modal: !!document.querySelector('.event-modal'),
    })`);
    check('first touch dismisses the coach', after.gone);
    check('the dismissing touch was not swallowed into a modal', !after.modal);
}

const pts = g => [{ x: svgBox.cx - g / 2, y: svgBox.cy }, { x: svgBox.cx + g / 2, y: svgBox.cy }];
await touch('touchStart', pts(60));
for (let i = 1; i <= 30; i++) {
    await touch('touchMove', pts(60 + i * 8));
    await sleep(16);
}
await touch('touchEnd', []);
await sleep(500);
// The phone profile renders PORTRAIT (D27), so "off-screen" and the edge-fade
// ramp are properties of the VERTICAL axis here. Asserting the orientation
// first is the point: both checks below measured screen-x, which in portrait is
// the cross axis, so they asked the wrong question and failed against a
// perfectly correct chart. A geometry check has to know which axis carries time
// before it can mean anything — and if portrait ever silently stopped
// engaging, this is what says so rather than everything quietly passing.
const isVertical = await js(`document.querySelector('svg.d3-timeline').classList.contains('vertical')`);
check('phone profile renders the portrait (vertical) layout', isVertical);

// What overscan actually guarantees is that a label may be ADMITTED while its
// anchor is outside the viewport — with plain edge-culling the anchor had to be
// within [0, axisLen], so nothing could enter except at the border.
//
// The old form of this check asked whether a label's rendered box sat entirely
// off-screen. That is a proxy, and it only worked because the horizontal band
// is ~310px against a ~150px label — a wide window for one to land in.
// Vertically the band is 28px against an 18px line, leaving a ~17px window per
// side, so whether any label happens to sit in it is down to the data at that
// zoom: the proxy fails on a chart that is behaving perfectly. Asserting the
// anchor position instead tests the property itself and is band-independent,
// which makes it the better check in BOTH orientations.
const overscanInfo = await js(`(() => {
    const svg = document.querySelector('svg.d3-timeline');
    const vert = svg.classList.contains('vertical');
    const axisLen = (vert ? svg.clientHeight : svg.clientWidth) - 40;
    // A label's along-time attribute IS its anchor: x horizontally, y vertically.
    const anchors = [...document.querySelectorAll('g.label-node text.event-label')]
        .map(t => +t.getAttribute(vert ? 'y' : 'x'));
    return {
        total: anchors.length,
        outside: anchors.filter(a => a < 0 || a > axisLen).length,
    };
})()`);
check('overscan admits labels whose anchor is off-screen', overscanInfo.outside > 0,
    `${overscanInfo.outside}/${overscanInfo.total} anchors outside the viewport`);

// --- 1b. Edge fade: label opacity ramps with distance from the border ------
// (mirrors edgeFadePx in Timeline.jsx: min(120, max(48, width * 0.14)))
const fadeInfo = await js(`(() => {
    const svg = document.querySelector('svg.d3-timeline');
    const vert = svg.classList.contains('vertical');
    // Both orientations spend 40px of the time axis on margins (20+20
    // horizontally, 26+14 vertically), so one expression covers each.
    const width = (vert ? svg.clientHeight : svg.clientWidth) - 40;
    const band = Math.min(120, Math.max(48, width * 0.14));
    const labels = [...document.querySelectorAll('text.event-label')].map(t => ({
        x: +t.getAttribute(vert ? 'y' : 'x'), o: +t.getAttribute('opacity'),
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

// --- 4. The pan gesture in portrait (D27 / PM-Q1) -------------------------
// Two checks, because neither alone is enough.
//
// (a) The DECLARATION. In portrait the pan is a vertical swipe — exactly the
// gesture D11 deliberately handed to the browser via `touch-action: pan-y`. So
// portrait must take it back with `none`, and that is asserted on the computed
// style, where it is exact.
//
// (b) The BEHAVIOUR, as a smoke test only. It cannot stand in for (a): a
// control run with `touch-action: pan-y` restored was tried, and this check
// still PASSED — CDP's Input.dispatchTouchEvent synthesizes touch events
// directly and does not reproduce the compositor's touch-action arbitration,
// so the browser never claims the gesture the way a real phone would. (The
// magnitude did collapse — 260 BCE → 376 BCE instead of → 13.4 kya — but
// gating on a magnitude threshold would be fitting a number to the control
// rather than testing the property.) Recorded because a check that cannot fail
// is worse than no check, and this one would have looked like protection.
const touchAction = await js(`(() => {
    const svg = document.querySelector('svg.d3-timeline');
    return { vert: svg.classList.contains('vertical'),
             value: getComputedStyle(svg).touchAction };
})()`);
check('portrait claims vertical gestures (touch-action: none)',
    !touchAction.vert || touchAction.value === 'none', touchAction.value);

await js(`document.querySelector('.event-modal-overlay')?.click()`);
await sleep(300);
const rangeBefore = await js(`document.querySelector('.range-readout').textContent`);
const dragPath = await js(`(() => {
    const svg = document.querySelector('svg.d3-timeline');
    const vert = svg.classList.contains('vertical');
    const r = svg.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    return { vert, cx, cy };
})()`);
await touch('touchStart', [{ x: dragPath.cx, y: dragPath.cy }]);
for (let i = 1; i <= 8; i++) {
    const d = i * 14;
    await touch('touchMove', [{
        x: dragPath.vert ? dragPath.cx : dragPath.cx + d,
        y: dragPath.vert ? dragPath.cy + d : dragPath.cy,
    }]);
    await sleep(16);
}
await touch('touchEnd', []);
await sleep(600);
const rangeAfter = await js(`document.querySelector('.range-readout').textContent`);
check(`drag along the time axis pans the chart (${dragPath.vert ? 'vertical' : 'horizontal'}, smoke)`,
    rangeBefore !== rangeAfter, `${rangeBefore} → ${rangeAfter}`);

if (consoleIssues.length) console.log('console errors/warnings:', consoleIssues);
console.log(fail === 0 ? `ALL ${pass} CHECKS PASS` : `${fail} CHECKS FAILED`);
close();
process.exit(fail === 0 ? 0 : 1);
