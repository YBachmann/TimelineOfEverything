// Contrast audit + gate (A-Q3) for the production build, in headless Edge.
//
// WHY A BROWSER AND NOT A CSS PARSE. Three of this app's foreground colors
// cannot be read out of App.css at all:
//   * the on-canvas event labels are mixed at run time by d3.interpolateLab()
//     from the category color toward '#f5f7ff' (tier 1) / '#e0e0e0' (tier 2),
//     so there are 10 label colors and none of them appear in any source file;
//   * the <h1> paints a gradient clipped to the glyphs
//     (-webkit-text-fill-color: transparent), so its `color` is a lie and the
//     real foreground is the gradient's stops;
//   * translucent marks (fill-opacity 0.55 dots and span bars, stroke-opacity
//     0.35 spine) only have a color once composited over what is behind them.
// So the honest measurement is of the rendered page, and most of the palette
// only exists once the app is driven into a state that shows it — a tooltip, a
// modal, an open dropdown. Hence: a state walk, not a stylesheet audit.
//
// WHAT IS CHECKED. WCAG 2.2 SC 1.4.3 (text: 4.5:1, or 3:1 for large text —
// >=24px, or >=18.66px bold) and SC 1.4.11 (non-text: 3:1 for the marks and
// control boundaries that carry meaning). Ratios are computed from sRGB
// relative luminance per the WCAG formula.
//
// HOW BACKGROUNDS ARE RESOLVED. Walk the ancestor chain compositing every
// translucent background-color onto the first opaque one. Two wrinkles:
//   * a gradient background has no single color, so every stop becomes a
//     candidate and the WORST (lowest-contrast) one is reported — conservative,
//     and it needs no guess about where in the gradient the text sits;
//   * SVG text has no CSS background. For chip counts the visual background is
//     a sibling <rect> in the same <g>, which is read directly; for everything
//     else the walk reaches svg.d3-timeline's own background-color. That is
//     correct for event labels specifically because of their halo (LD4):
//     paint-order stroke in the svg background color knocks out whatever passes
//     behind the glyphs, so the background is #0a0e27 by construction rather
//     than by luck.
//
// Run: npm run build && npm run verify:contrast
//      (--audit reports the full table without failing, for a survey run)
import { setTimeout as sleep } from 'node:timers/promises';
import { launchDesktop } from './cdp-mobile.mjs';

const AUDIT_ONLY = process.argv.includes('--audit');

// Deliberate exceptions: a surface whose ratio is below threshold BY DESIGN,
// with the reason. Anything failing that is not listed here fails the run — so
// accepting a shortfall is an explicit, reviewable edit to this list rather
// than a number quietly drifting. Keyed by surface name.
const ACCEPTED = {
    'chart: fuzzy dot rim (outer 35%)':
        'D22: the rim fade IS the fuzzy-date cue. Its whole job is to lose '
        + 'contrast toward the edge; the core (measured separately) carries the '
        + 'mark. Gating the rim would gate the feature.',
    'chart: fuzzy span bar end fade':
        'D15/SR-Q2: the same cue as the dot rim, on spans. The end fade exists '
        + 'to lose contrast; measuring it against threshold measures the '
        + 'feature. The bar body is measured separately.',
    'chart: spine':
        'A structural guide, not a data mark: it carries no value of its own, '
        + 'and position IS carried by the x-axis ticks and their labels, which '
        + 'both pass. Raising it to 3:1 needs stroke-opacity ~0.68, roughly '
        + 'doubling the presence of the longest mark on screen and putting the '
        + 'brightest pixels on the least important thing — the opposite of what '
        + 'the de-cluttering hierarchy (LD3) exists to do.',
    'minimap: viewport window fill':
        'SC 1.4.11 asks about a component\'s BOUNDARY, and this component\'s '
        + 'boundary is its stroke, which passes at 3.33:1. The fill is a tint '
        + 'whose job is to let the era bands and event marks underneath stay '
        + 'readable through it; it cannot reach 3:1 at any alpha that keeps '
        + 'them visible (0.35 only gets to 1.65:1).',
    'footer separator':
        'Pure decoration, and marked as such in the DOM: the "·" between the '
        + 'footer links carries aria-hidden="true" and no meaning a sighted '
        + 'reader needs. Explicitly exempt under SC 1.4.11.',
};

// The in-page measurement library. Injected once and called per surface; it
// runs in the page so it can read getComputedStyle on live nodes.
function contrastLib() {
    const parse = (s) => {
        if (!s) return null;
        const m = /^rgba?\(([^)]+)\)$/.exec(String(s).trim());
        if (!m) return null;
        const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
        if (p.length < 3 || p.some(Number.isNaN)) return null;
        return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    };
    const hex = (c) => '#' + [c.r, c.g, c.b]
        .map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
    // Source-over compositing of a translucent color onto an opaque one.
    const over = (f, b) => ({
        r: f.r * f.a + b.r * (1 - f.a),
        g: f.g * f.a + b.g * (1 - f.a),
        b: f.b * f.a + b.b * (1 - f.a),
        a: 1,
    });
    const lum = (c) => {
        const f = (v) => {
            const x = v / 255;
            return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
        };
        return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    };
    const ratio = (x, y) => {
        const a = lum(x), b = lum(y);
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    };
    // An ancestor's opacity fades an element as surely as its own, and the
    // chart's edge fade (LD10) lives exactly there — on the label group.
    const chainOpacity = (el) => {
        let o = 1;
        for (let n = el; n && n.nodeType === 1; n = n.parentNode) {
            const v = parseFloat(getComputedStyle(n).opacity);
            if (!Number.isNaN(v)) o *= v;
        }
        return o;
    };
    const stopsOf = (cs) => {
        const bg = cs.backgroundImage;
        if (!bg || bg === 'none' || !/gradient/.test(bg)) return [];
        const out = [];
        for (const m of bg.match(/rgba?\([^)]+\)/g) || []) {
            const c = parse(m);
            if (c) out.push(c);
        }
        return out;
    };
    // An SVG paint of the form url(#id) — resolve to the referenced gradient's
    // stops so a gradient-filled mark still yields measurable colors.
    const paintStops = (paint) => {
        const id = /^url\(["']?#([^)"']+)["']?\)$/.exec(String(paint).trim())?.[1];
        const def = id && document.getElementById(id);
        if (!def) return [];
        return [...def.querySelectorAll('stop')].map(s => {
            const cs = getComputedStyle(s);
            const c = parse(cs.stopColor) || { r: 0, g: 0, b: 0, a: 1 };
            const o = parseFloat(cs.stopOpacity);
            return { ...c, a: c.a * (Number.isNaN(o) ? 1 : o) };
        });
    };

    // Every candidate background behind `el`, composited to opacity 1.
    // `skipSelf` when the element's own background-color is the FOREGROUND
    // being measured (a category swatch), or it would compare against itself.
    const backgrounds = (el, skipSelf) => {
        const layers = [];   // painted over the base; innermost first
        let bases = [];

        // Chip counts are the one text in this scene that sits on a painted
        // rect (its pill) rather than on the svg background, and no ancestor
        // knows about it. Matched by class on BOTH sides on purpose: "any rect
        // in my parent group" grabbed a chip pill for the spine and the range
        // readout, which share the chart's top-level <g> with every chip.
        if (el.classList?.contains('chip-count') && el.parentNode?.querySelector) {
            const rect = el.parentNode.querySelector('rect.chip-bg');
            if (rect) {
                const rs = getComputedStyle(rect);
                const f = parse(rs.fill);
                const fo = parseFloat(rs.fillOpacity);
                const a = f ? f.a * (Number.isNaN(fo) ? 1 : fo) : 0;
                if (a > 0.02) layers.push({ ...f, a });
            }
        }

        // Start at the element ITSELF, not its parent: a badge or a pill paints
        // its own background-color behind its own glyphs, and starting one level
        // up measured `.event-category` against the modal panel instead of
        // against the category color it actually sits on.
        for (let n = skipSelf ? el.parentNode : el; n && n.nodeType === 1; n = n.parentNode) {
            const cs = getComputedStyle(n);
            const own = parseFloat(cs.opacity);
            const fade = Number.isNaN(own) ? 1 : own;
            // `background-clip: text` means the background is painted into the
            // glyphs, not behind them — it is this element's foreground (the
            // <h1>), so it must not also be counted as its background.
            const clippedToText = n === el
                && /text/.test(cs.webkitBackgroundClip || cs.backgroundClip || '');
            const bgc = clippedToText ? null : parse(cs.backgroundColor);
            if (bgc && bgc.a > 0.001) {
                const a = bgc.a * fade;
                if (a >= 0.999) { bases = [bgc]; break; }
                layers.push({ ...bgc, a });
            }
            const stops = clippedToText ? [] : stopsOf(cs);
            if (stops.length) { bases = stops; break; }
        }
        if (!bases.length) bases = [{ r: 255, g: 255, b: 255, a: 1 }]; // canvas

        return bases.map(base => {
            let acc = { ...base, a: 1 };
            for (let i = layers.length - 1; i >= 0; i--) acc = over(layers[i], acc);
            return acc;
        });
    };

    // Candidate foreground colors, each carrying its effective alpha.
    const foregrounds = (el, o) => {
        const cs = getComputedStyle(el, o.pseudo || null);
        const chain = chainOpacity(el);
        const svg = !!el.ownerSVGElement;

        // An explicit property (border/outline/stroke/fill) for non-text checks.
        if (o.prop) {
            const raw = cs[o.prop];
            const stops = paintStops(raw);
            const extra = o.prop === 'stroke' ? parseFloat(cs.strokeOpacity)
                : o.prop === 'fill' ? parseFloat(cs.fillOpacity) : NaN;
            const mul = chain * (Number.isNaN(extra) ? 1 : extra);
            if (stops.length) {
                // A gradient paint has no single color. Pick by ALPHA, not by
                // position: a fuzzy dot's gradient runs opaque→transparent but
                // a fuzzy span bar's runs transparent→opaque→transparent, so
                // "first stop" means the mark's body in one case and its
                // invisible edge in the other. 'core' = the most opaque stop
                // (what the mark is), 'rim' = the least (its fade-out).
                const byAlpha = [...stops].sort((x, y) => x.a - y.a);
                const pick = o.gradientStop === 'rim' ? byAlpha[0] : byAlpha[byAlpha.length - 1];
                return [{ ...pick, a: pick.a * mul }];
            }
            const c = parse(raw);
            return c ? [{ ...c, a: c.a * mul }] : [];
        }

        // A gradient clipped to the glyphs means the TEXT is the gradient and
        // the `color` property is unused — the <h1> does exactly this.
        const clip = cs.webkitBackgroundClip || cs.backgroundClip || '';
        const fillT = parse(cs.webkitTextFillColor);
        if (/text/.test(clip) && fillT && fillT.a === 0) {
            const stops = stopsOf(cs);
            if (stops.length) return stops.map(c => ({ ...c, a: c.a * chain }));
        }

        const base = parse(svg ? cs.fill : cs.color);
        if (!base) return [];
        const fo = svg ? parseFloat(cs.fillOpacity) : NaN;
        return [{ ...base, a: base.a * (Number.isNaN(fo) ? 1 : fo) * chain }];
    };

    const hasOwnText = (el) =>
        [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());

    const visible = (el) => {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') return false;
        if (el.classList?.contains('sr-only')) return false;
        const b = el.getBoundingClientRect();
        // SVG geometry is legitimately zero-thickness in one axis: the spine is
        // a horizontal line, an axis tick a vertical one. Requiring both would
        // silently skip exactly the marks 1.4.11 is about.
        const flat = el.ownerSVGElement
            ? (b.width < 1 && b.height < 1)
            : (b.width < 1 || b.height < 1);
        if (flat) return false;
        return chainOpacity(el) > 0.05;
    };

    // One row per matching element: the worst pairing of any foreground
    // candidate against any background candidate.
    const measure = (selector, opts) => {
        const o = opts || {};
        const rows = [];
        let skipped = 0;
        for (const el of document.querySelectorAll(selector)) {
            if (!visible(el)) continue;
            if (!o.prop && !o.pseudo && !hasOwnText(el)) continue;
            // The chart's edge fade (LD10) is a deliberate ramp to zero, so a
            // mid-fade mark would report a meaningless ratio. Interior marks
            // only, when the caller asks.
            if (o.minChainOpacity && chainOpacity(el) < o.minChainOpacity) continue;
            const fgs = foregrounds(el, o);
            if (!fgs.length) { skipped++; continue; }
            const bgs = backgrounds(el, o.prop === 'backgroundColor');
            const cs = getComputedStyle(el, o.pseudo || null);
            let worst = null;
            for (const f of fgs) for (const b of bgs) {
                const eff = over(f, b);
                const r = ratio(eff, b);
                if (!worst || r < worst.ratio) {
                    worst = { ratio: r, fg: hex(eff), bg: hex(b), alpha: +f.a.toFixed(3) };
                }
            }
            rows.push({
                text: (el.getAttribute?.('data-c-text') || el.textContent || '').trim().slice(0, 28),
                fontPx: Math.round(parseFloat(cs.fontSize) || 0),
                weight: parseInt(cs.fontWeight, 10) || 400,
                ...worst,
            });
        }
        return { rows, skipped };
    };

    return { measure };
}

const { cdp, js, click, key, type, setMedia, consoleIssues, close } =
    await launchDesktop({ port: 4176, cdpPort: 9336 });
await js(`window.__c = (${contrastLib.toString()})()`);

const results = [];
let hardFail = 0;

// Threshold per WCAG: large text (>=24px, or >=18.66px bold) may sit at 3:1.
const thresholdFor = (kind, row) => {
    if (kind === 'nontext') return 3;
    const large = row.fontPx >= 24 || (row.fontPx >= 18.66 && row.weight >= 700);
    return large ? 3 : 4.5;
};

// Measure one surface and record its worst instance.
async function sample(surface, selector, opts = {}) {
    const { kind = 'text', required = true, ...rest } = opts;
    const out = await js(`__c.measure(${JSON.stringify(selector)}, ${JSON.stringify(rest)})`);
    if (!out.rows.length) {
        if (required) {
            console.log(`WARN: no sample for "${surface}" (${selector}) — state not reached?`);
            hardFail++;
        }
        return;
    }
    let worst = out.rows[0];
    for (const r of out.rows) {
        if (r.ratio / thresholdFor(kind, r) < worst.ratio / thresholdFor(kind, worst)) worst = r;
    }
    results.push({
        surface, kind, n: out.rows.length, skipped: out.skipped,
        ...worst, threshold: thresholdFor(kind, worst),
    });
}

// --- 1. The page at rest: chrome + the chart scene -------------------------
await sample('title (h1, gradient clipped to glyphs)', 'h1');
await sample('subtitle', '.subtitle');
await sample('category button (resting)', '.filters button:not(.active)');
await sample('category button (active)', '.filters button.active');
await sample('search placeholder', '.search-input', { pseudo: '::placeholder' });
await sample('era preset button', '.era-presets button');
await sample('control hints body', '.timeline-info p');
await sample('control hints strong', '.timeline-info strong');
await sample('control hints kbd', '.timeline-info kbd');
// The footer's own color applies to the "Built by" text node in its span; the
// footer element itself has no direct text of its own.
await sample('footer text', '.site-footer span:not(.footer-sep)');
await sample('footer link', '.site-footer a, .footer-link');
await sample('footer separator', '.footer-sep', { kind: 'nontext' });
await sample('chart: axis tick labels', '.x-axis text');
await sample('chart: range readout', '.range-readout');
await sample('chart: era band labels (minimap)', '.era-band-label');
// Interior labels only: the edge fade ramps opacity to 0 on purpose (LD10).
await sample('chart: event labels (interior)', 'text.event-label', { minChainOpacity: 0.99 });
// Chips fade at the border like labels do, so interior chips only.
await sample('chart: cluster chip count', 'text.chip-count',
    { minChainOpacity: 0.99, required: false });

// Non-text: the marks and boundaries that carry meaning (SC 1.4.11).
await sample('chart: event dot (solid + fuzzy core)', 'circle.event-dot',
    { kind: 'nontext', prop: 'fill', gradientStop: 'core' });
await sample('chart: fuzzy dot rim (outer 35%)', 'circle.event-dot',
    { kind: 'nontext', prop: 'fill', gradientStop: 'rim' });
await sample('chart: span bar body', '.span-bar',
    { kind: 'nontext', prop: 'fill', gradientStop: 'core', required: false });
await sample('chart: fuzzy span bar end fade', '.span-bar',
    { kind: 'nontext', prop: 'fill', gradientStop: 'rim', required: false });
await sample('chart: spine', 'line.timeline-spine', { kind: 'nontext', prop: 'stroke' });
await sample('chart: axis tick marks', '.x-axis line', { kind: 'nontext', prop: 'stroke' });
await sample('minimap: viewport window fill', '.mini-window', { kind: 'nontext', prop: 'fill' });
await sample('minimap: viewport window stroke', '.mini-window', { kind: 'nontext', prop: 'stroke' });
await sample('search box border', '.search-box', { kind: 'nontext', prop: 'borderTopColor' });
await sample('button border (resting)', '.filters button:not(.active)', { kind: 'nontext', prop: 'borderTopColor' });

// --- 2. Hover states ------------------------------------------------------
const btn = await js(`(() => {
    const b = document.querySelector('.filters button:not(.active)');
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
})()`);
await js(`document.querySelector('.filters button:not(.active)')
    .setAttribute('data-c-text', 'hovered button')`);
await click(btn.x, btn.y);   // mouseMoved first — enough to trigger :hover
await sleep(150);
await sample('category button (hover)', '.filters button:hover', { required: false });
// Clicking it filtered the chart; put it back.
await js(`[...document.querySelectorAll('.filters button')]
    .find(b => b.textContent.trim() === 'All').click()`);
await sleep(600);

// --- 3. Search dropdown ---------------------------------------------------
await js(`document.querySelector('.search-input').focus()`);
await type('a');
await sleep(400);
await key('ArrowDown');   // raise the .active option
await sleep(200);
await sample('dropdown section header', '.sug-header');
// The row's text lives in .sug-label — .sug-item itself holds only spans, so
// it has no direct text node to measure.
await sample('dropdown item (resting)', '.sug-item:not(.active) .sug-label');
await sample('dropdown item (active)', '.sug-item.active .sug-label');
await sample('dropdown item count pill', '.sug-count');
await sample('dropdown event year', '.sug-year', { required: false });
await sample('dropdown category dot', '.sug-dot', { kind: 'nontext', prop: 'backgroundColor', required: false });
await sample('dropdown panel border', '.search-dropdown', { kind: 'nontext', prop: 'borderTopColor' });
await sample('search result count', '.result-count');
await sample('search clear button', '.search-clear');

// --- 4. A pinned filter chip ---------------------------------------------
// Enter picks the active suggestion, which pins it as a chip.
await key('Enter');
await sleep(400);
await sample('filter chip', '.search-chip');
await sample('filter chip remove', '.chip-remove');
await js(`document.querySelector('.search-clear')?.click()`);
await sleep(600);

// --- 5. Hover tooltip ----------------------------------------------------
const mark = await js(`(() => {
    const r = document.querySelector('svg.d3-timeline').getBoundingClientRect();
    const b = [...document.querySelectorAll('g.label-node rect.label-hit')]
        .map(h => h.getBoundingClientRect())
        .find(b => b.left > r.left + 60 && b.right < r.right - 60);
    return b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null;
})()`);
if (mark) {
    // A real CDP mouse move, not a synthetic MouseEvent: the tooltip is raised
    // by d3's mouseenter behind an 80ms intent delay (LD7), which a dispatched
    // mousemove on one element does not produce.
    await cdp('Input.dispatchMouseEvent', {
        type: 'mouseMoved', x: Math.round(mark.x), y: Math.round(mark.y), button: 'none',
    });
    await sleep(500);
    await sample('tooltip title', '.timeline-tooltip .tt-title');
    await sample('tooltip year', '.timeline-tooltip .tt-year');
    await sample('tooltip category (per-category color)', '.timeline-tooltip .tt-cat');
    await sample('tooltip hint', '.timeline-tooltip .tt-hint', { required: false });
    await sample('tooltip panel border', '.timeline-tooltip', { kind: 'nontext', prop: 'borderTopColor' });
}

// --- 6. The detail modal, once per category ------------------------------
// One representative event per category, each carrying a precision pill so the
// badge, the pill and the link rows are all measured against the panel.
const PER_CATEGORY = [
    ['natural', 'Big Bang'],
    ['history', 'Agricultural Revolution'],
    ['science', 'Discovery of Electricity'],
    ['technology', 'Invention of Paper'],
    ['future', 'Oceans Evaporate'],
];
for (const [cat, title] of PER_CATEGORY) {
    await js(`(() => {
        const i = document.querySelector('.search-input');
        i.focus();
    })()`);
    await js(`document.querySelector('.search-clear')?.click()`);
    await sleep(200);
    await js(`document.querySelector('.search-input').focus()`);
    await type(title);
    await sleep(500);
    const opened = await js(`(() => {
        const opt = [...document.querySelectorAll('.sug-item')]
            .find(b => b.querySelector('.sug-year'));
        if (!opt) return false;
        opt.click();
        return true;
    })()`);
    await sleep(400);
    if (!opened || !(await js(`!!document.querySelector('.event-modal')`))) {
        console.log(`WARN: could not open the detail modal for ${cat} ("${title}")`);
        hardFail++;
        continue;
    }
    await sample(`modal title (${cat})`, '.event-modal h2');
    await sample(`modal year (${cat})`, '.event-modal .event-year');
    await sample(`modal description (${cat})`, '.event-modal .event-description');
    await sample(`modal category badge (${cat})`, `.event-category.category-${cat}`);
    await sample(`modal precision pill (${cat})`, '.event-precision', { required: false });
    await sample(`modal precision pill border (${cat})`, '.event-precision',
        { kind: 'nontext', prop: 'borderTopColor', required: false });
    await sample(`modal close button (${cat})`, '.modal-close');
    await sample(`modal "Connected events" heading (${cat})`, '.related-events h3', { required: false });
    await sample(`modal relation type (${cat})`, '.relation-type', { required: false });
    await sample(`modal relation row (${cat})`, '.related-item .cluster-item-title', { required: false });
    await sample(`modal relation row year (${cat})`, '.related-item .cluster-item-year', { required: false });
    await sample(`modal relation note (${cat})`, '.relation-note', { required: false });
    await sample(`modal category dot (${cat})`, '.related-item .cluster-item-dot',
        { kind: 'nontext', prop: 'backgroundColor', required: false });
    await sample(`modal panel border (${cat})`, '.event-modal', { kind: 'nontext', prop: 'borderTopColor' });
    await key('Escape');
    await sleep(250);
}
await js(`document.querySelector('.search-clear')?.click()`);
await sleep(600);

// --- 7. The cluster modal (a +N chip's member list) ---------------------
const chip = await js(`(() => {
    const c = document.querySelector('g.cluster-chip rect.chip-hit, g.cluster-chip rect.chip-bg');
    if (!c) return null;
    const b = c.getBoundingClientRect();
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
})()`);
if (chip) {
    await click(chip.x, chip.y);
    await sleep(700);
    const isList = await js(`!!document.querySelector('.cluster-list')`);
    if (isList) {
        await sample('cluster list row', '.cluster-item .cluster-item-title');
        await sample('cluster list year', '.cluster-item .cluster-item-year');
        await sample('cluster modal heading', '.event-modal h2');
        await key('Escape');
        await sleep(250);
    } else {
        // The chip was splittable, so the click zoomed instead of listing.
        // .cluster-item shares its palette with .related-item, already measured.
        console.log('note: the default-view chip zooms rather than lists — '
            + 'cluster rows share .cluster-item-* with the relation rows above');
        await js(`[...document.querySelectorAll('.era-presets button')]
            .find(b => /All/i.test(b.textContent))?.click()`);
        await sleep(700);
    }
}

// --- 8. Empty result set ------------------------------------------------
await js(`document.querySelector('.search-input').focus()`);
await type('zzzznotarealevent');
await sleep(600);
await sample('empty-result message', '.timeline-empty');
await js(`document.querySelector('.search-clear')?.click()`);
await sleep(600);

// --- 9. The legal dialog ------------------------------------------------
await js(`document.querySelector('.footer-link').click()`);
await sleep(400);
await sample('legal dialog heading', '.legal-header h2');
await sample('legal dialog body', '.legal-body p');
await sample('legal dialog subheading', '.legal-body h3');
await sample('legal dialog link', '.legal-body a');
await sample('legal dialog list item', '.legal-list li', { required: false });
await sample('legal language toggle', '.legal-lang');
await sample('legal close button', '.legal-close');
await sample('legal language toggle border', '.legal-lang', { kind: 'nontext', prop: 'borderTopColor' });
await key('Escape');
await sleep(300);

// --- 10. The keyboard focus ring and cursor ----------------------------
// Tab until the chart takes focus, so :focus-visible actually applies.
for (let i = 0; i < 20; i++) {
    await key('Tab');
    if (await js(`document.activeElement?.classList?.contains('d3-timeline')`)) break;
}
await sample('chart focus ring', '.d3-timeline:focus-visible',
    { kind: 'nontext', prop: 'outlineColor', required: false });
await key('ArrowRight');
await sleep(600);
await sample('keyboard cursor ring', 'circle.kb-cursor-ring',
    { kind: 'nontext', prop: 'stroke', required: false });
// A chrome focus ring: Shift+Tab back out of the chart onto a real button.
await key('Tab', { shift: true });
await sleep(200);
await sample('chrome focus ring', 'button:focus-visible, input:focus-visible',
    { kind: 'nontext', prop: 'outlineColor', required: false });

// --- Report ------------------------------------------------------------
await setMedia([]);
results.sort((a, b) => a.ratio / a.threshold - b.ratio / b.threshold);

const pad = (s, n) => String(s).padEnd(n);
const verdict = (r) => {
    if (r.ratio >= r.threshold) return 'PASS';
    return ACCEPTED[r.surface] ? 'ACCEPTED' : 'FAIL';
};
console.log('\n  ratio  need  kind     surface                                        fg → bg');
console.log('  ' + '-'.repeat(94));
for (const r of results) {
    const v = verdict(r);
    console.log(`  ${pad(r.ratio.toFixed(2), 6)} ${pad(r.threshold.toFixed(1), 5)} `
        + `${pad(r.kind, 8)} ${pad(r.surface.slice(0, 45), 46)} `
        + `${r.fg} on ${r.bg}  ${pad(v === 'PASS' ? '' : v, 8)}`
        + (r.n > 1 ? ` (worst of ${r.n})` : ''));
}

const failures = results.filter(r => verdict(r) === 'FAIL');
const accepted = results.filter(r => verdict(r) === 'ACCEPTED');
console.log('');
for (const r of accepted) console.log(`ACCEPTED: ${r.surface} — ${ACCEPTED[r.surface]}`);
for (const r of failures) {
    console.log(`FAIL: ${r.surface} — ${r.ratio.toFixed(2)}:1, needs ${r.threshold}:1 `
        + `(${r.fg} on ${r.bg}${r.fontPx ? `, ${r.fontPx}px/${r.weight}` : ''}`
        + `${r.text ? `, e.g. "${r.text}"` : ''})`);
}
if (consoleIssues.length) console.log('console errors/warnings:', consoleIssues);

const total = results.length;
console.log(`\n${total} surfaces measured — ${total - failures.length - accepted.length} pass, `
    + `${accepted.length} accepted by design, ${failures.length} fail`
    + (hardFail ? `, ${hardFail} state(s) unreachable` : ''));
close();
process.exit(AUDIT_ONLY ? 0 : (failures.length || hardFail) ? 1 : 0);
