// Functional check of the accessibility contract (Q10) on the production
// build, in headless Edge with a desktop profile (mouse + keyboard):
//
//   1. dialog semantics — a modal opened from an SVG mark is role="dialog",
//      aria-modal, labelled by its own heading, and holds focus
//   2. focus trap — Tab cycles inside the panel instead of walking into the
//      chart behind it
//   3. focus restore — Escape closes and hands focus back to the OPENER: the
//      chart for a mark click (SVG marks can't hold focus themselves), the
//      search input for a dropdown pick. Never <body>.
//   4. combobox ARIA — role/aria-expanded/aria-controls, and
//      aria-activedescendant naming a real option as the arrow keys move
//   5. search shortcuts — Ctrl+F and "/" focus the search box, "/" still
//      types a character inside it, and neither escapes an open dialog
//   6. keyboard navigation of the chart (D19) — one tab stop, a cursor the
//      arrow keys step through the events in time order, each move spoken in
//      a live region, flown into view, drawn as its own mark, and openable
//      with Enter
//   7. reduced motion — era flights snap instead of animating when
//      prefers-reduced-motion is set, and still animate when it is not
//
// These are behaviors no static check can see: they only exist once a real
// browser has focus, a key queue and a media state.
//
// Run: npm run build && npm run verify:a11y
import { setTimeout as sleep } from 'node:timers/promises';
import { launchDesktop } from './cdp-mobile.mjs';

const { js, click, key, type, setMedia, consoleIssues, close } =
    await launchDesktop({ port: 4175, cdpPort: 9335 });

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? ' — ' + extra : ''}`);
    ok ? pass++ : fail++;
};
// Describe the focused element well enough to debug a failure from the log.
const activeDesc = () => js(`(() => {
    const a = document.activeElement;
    if (!a) return 'null';
    return a.tagName.toLowerCase()
        + (a.className?.baseVal ?? (typeof a.className === 'string' ? a.className : ''))
            .split(' ').filter(Boolean).map(c => '.' + c).join('')
        + (a.textContent && a.tagName !== 'BODY'
            ? ' "' + a.textContent.trim().slice(0, 20) + '"' : '');
})()`);

// --- 1/2/3. Modal opened by clicking an event label on the chart -----------
const label = await js(`(() => {
    const r = document.querySelector('svg.d3-timeline').getBoundingClientRect();
    const b = [...document.querySelectorAll('g.label-node rect.label-hit')]
        .map(h => h.getBoundingClientRect())
        .find(b => b.left > r.left + 40 && b.right < r.right - 40);
    return b ? { x: b.x + b.width / 2, y: b.y + b.height / 2 } : null;
})()`);
if (!label) { console.log('FAIL: no on-screen label to click'); close(); process.exit(1); }
await click(label.x, label.y);
await sleep(300);

const dialog = await js(`(() => {
    const p = document.querySelector('.event-modal');
    if (!p) return null;
    const labelledBy = p.getAttribute('aria-labelledby');
    const heading = labelledBy && document.getElementById(labelledBy);
    return {
        role: p.getAttribute('role'),
        modal: p.getAttribute('aria-modal'),
        labelledBy,
        headingText: heading?.textContent ?? null,
        focusInside: p.contains(document.activeElement),
    };
})()`);
check('mark click opens a role="dialog" panel', dialog?.role === 'dialog');
check('dialog is aria-modal', dialog?.modal === 'true');
check('dialog is labelled by its own heading',
    !!dialog?.headingText, JSON.stringify(dialog?.headingText));
check('focus moves into the dialog on open', dialog?.focusInside === true,
    await activeDesc());

// Tab past the end of the panel's focusables and back around: focus must
// never leave. One extra press beyond the count proves the wrap.
const inPanel = `document.querySelector('.event-modal').contains(document.activeElement)`;
const checkTrap = async (label) => {
    const focusables = await js(
        `document.querySelectorAll('.event-modal a[href], .event-modal button').length`);
    let escaped = null;
    for (let i = 0; i <= focusables; i++) {
        await key('Tab');
        if (!await js(inPanel)) { escaped = i + 1; break; }
    }
    check(`Tab stays trapped inside the ${label} dialog`, escaped === null,
        escaped ? `focus left after ${escaped} presses`
            : `${focusables + 1} presses, ${focusables} focusables`);
    // Shift+Tab off the first element must wrap backwards, not step out.
    for (let i = 0; i <= focusables; i++) await key('Tab', { shift: true });
    check(`Shift+Tab stays trapped in the ${label} dialog`, await js(inPanel), await activeDesc());
};
await checkTrap('mark-opened');

await key('Escape');
await sleep(200);
check('Escape closes the dialog', !await js(`!!document.querySelector('.event-modal')`));
const afterMarkClose = await js(`(() => {
    const a = document.activeElement;
    return { onChart: a === document.querySelector('svg.d3-timeline'), body: a === document.body };
})()`);
check('focus returns to the chart, not <body>',
    afterMarkClose.onChart && !afterMarkClose.body, await activeDesc());

// --- 4. Combobox ARIA, and the keyboard route to an event's details --------
// The search path to an event's details: reaches any of the 191 by name, where
// the chart's own cursor (section 6) reaches them by walking time order.
await js(`document.querySelector('.search-input').focus()`);
await type('moon landing');
await sleep(400);
const closedState = await js(`(() => {
    const i = document.querySelector('.search-input');
    return { role: i.getAttribute('role'), autocomplete: i.getAttribute('aria-autocomplete') };
})()`);
check('search input is a combobox', closedState.role === 'combobox'
    && closedState.autocomplete === 'list');

await key('ArrowDown');
await sleep(150);
const combo = await js(`(() => {
    const i = document.querySelector('.search-input');
    const controls = i.getAttribute('aria-controls');
    const listbox = controls && document.getElementById(controls);
    const activeId = i.getAttribute('aria-activedescendant');
    const opt = activeId && document.getElementById(activeId);
    return {
        expanded: i.getAttribute('aria-expanded'),
        listboxRole: listbox?.getAttribute('role') ?? null,
        activeId,
        optRole: opt?.getAttribute('role') ?? null,
        optSelected: opt?.getAttribute('aria-selected') ?? null,
        optHighlighted: opt?.classList.contains('active') ?? null,
        optLabel: opt?.getAttribute('aria-label') ?? null,
        selectedCount: document.querySelectorAll('[role=option][aria-selected=true]').length,
    };
})()`);
check('aria-expanded is true while the list is open', combo.expanded === 'true');
check('aria-controls points at the listbox', combo.listboxRole === 'listbox');
check('aria-activedescendant names a real option',
    combo.optRole === 'option' && combo.optSelected === 'true', combo.activeId);
check('the named option is the visually highlighted one', combo.optHighlighted === true,
    JSON.stringify(combo.optLabel));
check('exactly one option is aria-selected', combo.selectedCount === 1,
    `${combo.selectedCount} selected`);

await key('Enter');
await sleep(300);
const fromSearch = await js(`(() => {
    const p = document.querySelector('.event-modal');
    return p ? { title: p.querySelector('h2')?.textContent, focusInside: p.contains(document.activeElement) } : null;
})()`);
check('Enter on an event option opens its details', !!fromSearch,
    JSON.stringify(fromSearch?.title));
check('focus moves into that dialog too', fromSearch?.focusInside === true);
// Same trap, now over a panel with a "Connected events" list — more than one
// focusable, so the cycle is a real one rather than a self-wrap.
await checkTrap('search-opened');
await key('Escape');
await sleep(200);
check('Escape returns focus to the search input, not the chart',
    await js(`document.activeElement === document.querySelector('.search-input')`),
    await activeDesc());

// --- 5. Search shortcuts (Ctrl+F / "/") -----------------------------------
// Clearing the search here also serves the motion checks below: with one event
// matching, the domain collapses to a few decades and every era button outside
// it becomes a no-op — those checks would then pass by measuring nothing.
await js(`document.querySelector('.search-clear').click()`);
await sleep(1200); // the refilter's own entry flight has to settle first
check('search cleared, full scene back',
    await js(`document.querySelectorAll('g.label-node').length > 10`));

const searchFocused = `document.activeElement === document.querySelector('.search-input')`;
await js(`document.querySelector('svg.d3-timeline').focus()`);
await key('f', { ctrl: true });
await sleep(150);
check('Ctrl+F focuses the search box', await js(searchFocused), await activeDesc());

// A slash typed INTO the box must stay a slash, not re-trigger the shortcut.
await key('/', { text: '/' });
await sleep(200);
check('"/" inside the search box types a character',
    await js(`document.querySelector('.search-input').value`) === '/');
await js(`document.querySelector('.search-clear').click()`);
await sleep(1200);

// And from a neutral spot, "/" is the shortcut.
await js(`document.querySelector('svg.d3-timeline').focus()`);
await key('/', { text: '/' });
await sleep(150);
check('"/" outside a text field focuses the search box instead of typing',
    await js(searchFocused) && await js(`document.querySelector('.search-input').value`) === '');

// With a dialog open the shortcut must stand down — pulling focus out would
// break the trap and leave the user typing into something they can't see.
await js(`document.querySelector('svg.d3-timeline').focus()`);
await click(label.x, label.y);
await sleep(300);
await key('f', { ctrl: true });
await sleep(150);
check('Ctrl+F does not escape an open dialog', await js(inPanel), await activeDesc());
await key('Escape');
await sleep(200);

// --- 6. Keyboard navigation of the chart (D19) ----------------------------
// The cursor is both the keyboard's way around the chart and the ONLY reading
// of the SVG scene a screen reader gets, so every move has to land on a real
// event, say so out loud, come into view, and be drawn as its own mark.
const chart = `document.querySelector('svg.d3-timeline')`;
const chartAria = await js(`(() => {
    const s = ${chart};
    const d = document.getElementById(s.getAttribute('aria-describedby'));
    return {
        tabIndex: s.tabIndex, role: s.getAttribute('role'),
        label: s.getAttribute('aria-label'), describes: d?.textContent.trim() ?? '',
    };
})()`);
check('the chart is a tab stop', chartAria.tabIndex === 0, `tabIndex=${chartAria.tabIndex}`);
check('the chart takes an application role, so arrow keys reach it',
    chartAria.role === 'application', chartAria.role);
check('its accessible name says how many events, over what span',
    /\d+ events from .+ to .+/.test(chartAria.label), JSON.stringify(chartAria.label));
check('its description lists the keys',
    /arrow/i.test(chartAria.describes) && /Enter/.test(chartAria.describes));

// The cursor's live region is Timeline's own — App has a second one for the
// filter result count, and confusing the two would make this section vacuous.
const spoken = () => js(`document.querySelector('.timeline-wrapper [role=status]').textContent`);
// Ring geometry, in client coords, against the chart's own box.
const cursorAt = () => js(`(() => {
    const g = document.querySelector('g.kb-cursor');
    if (!g || g.style.display === 'none') return null;
    const b = g.getBoundingClientRect();
    const r = ${chart}.getBoundingClientRect();
    return { cx: b.left + b.width / 2, onScreen: b.left >= r.left && b.right <= r.right };
})()`);
// Is the cursor's event drawn as its own mark (a shown dot, or a span bar
// covering it)? At the fitted view most events are swallowed by +N chips, so
// this fails unless the cursor is genuinely exempt from clustering.
const cursorMark = () => js(`(() => {
    const g = document.querySelector('g.kb-cursor');
    if (!g || g.style.display === 'none') return null;
    const b = g.getBoundingClientRect();
    const cx = b.left + b.width / 2;
    const near = n => { const d = n.getBoundingClientRect();
        return d.left - 1 <= cx && cx <= d.right + 1; };
    return [...document.querySelectorAll('g.dot-mark')].some(n => n.style.display !== 'none' && near(n))
        || [...document.querySelectorAll('rect.span-bar')].some(near);
})()`);
const windowW = () => js(
    `parseFloat(document.querySelector('rect.mini-window').getAttribute('width'))`);

await js(`${chart}.focus()`);
check('no cursor before the first keypress', await cursorAt() === null);

await key('ArrowRight');
await sleep(700);
const step1 = { said: await spoken(), at: await cursorAt() };
check('ArrowRight raises a cursor and speaks the event it landed on',
    !!step1.at && /^.+\. .+\. \w+\. \d+ of \d+\.$/.test(step1.said), JSON.stringify(step1.said));
await key('ArrowRight');
await sleep(700);
const step2 = await spoken();
check('ArrowRight again moves to a different event', step2 !== step1.said,
    JSON.stringify(step2));

await key('Home');
await sleep(900);
const home = { said: await spoken(), at: await cursorAt() };
check('Home reaches the first event and flies it into view',
    / 1 of \d+\.$/.test(home.said) && home.at?.onScreen === true,
    `${JSON.stringify(home.said)} onScreen=${home.at?.onScreen}`);
await key('End');
await sleep(900);
const end = { said: await spoken(), at: await cursorAt() };
const total = /of (\d+)\.$/.exec(end.said)?.[1];
check('End reaches the last event, also on screen',
    end.said.endsWith(`${total} of ${total}.`) && end.at?.onScreen === true,
    `${JSON.stringify(end.said)} onScreen=${end.at?.onScreen}`);

await key('Enter');
await sleep(300);
const kbOpened = await js(`document.querySelector('.event-modal h2')?.textContent ?? null`);
check('Enter opens the details of the event the cursor is on',
    !!kbOpened && end.said.startsWith(`${kbOpened}.`),
    `${JSON.stringify(kbOpened)} vs ${JSON.stringify(end.said)}`);
await key('Escape');
await sleep(300);
check('Escape returns focus to the chart with the cursor still standing',
    await js(`document.activeElement === ${chart}`) && !!await cursorAt(), await activeDesc());

// Zoom keys, measured on the scrubber's viewport window — a direct, numeric
// render of how much of the timeline is on screen.
await key('0');
await sleep(900);
const fitW = await windowW();
await key('+');
await sleep(400);
const inW = await windowW();
const zoomed = await cursorAt();
check('"+" zooms in and keeps the cursor on screen',
    inW < fitW && zoomed?.onScreen === true, `window ${fitW} → ${inW}`);
await key('-');
await sleep(400);
const outW = await windowW();
check('"-" zooms back out', outW > inW, `window ${inW} → ${outW}`);
await key('0');
await sleep(900);
check('"0" fits the whole timeline again', Math.abs(await windowW() - fitW) < 1);

// At the fitted view most events are inside +N chips; the cursor's never is.
let drawn = 0;
for (let i = 0; i < 5; i++) {
    await key('ArrowRight');
    await sleep(300);
    if (await cursorMark()) drawn++;
}
check('the cursor event is always drawn as its own mark, never inside a chip',
    drawn === 5, `${drawn}/5 steps`);

// --- 7. Reduced motion: era flights snap ----------------------------------
// The readout is a direct render of the camera's position, so sampling it
// mid-flight tells us whether a flight is running at all.
const readout = () => js(`document.querySelector('text.range-readout')?.textContent ?? ''`);
const flyTo = async (label) => {
    await js(`[...document.querySelectorAll('.era-presets button')]
        .find(b => b.textContent.trim() === ${JSON.stringify(label)}).click()`);
    await sleep(60);
    const early = await readout();
    await sleep(700);
    return { early, settled: await readout() };
};

await setMedia([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
await sleep(100);
const reduced = await flyTo('Human Era');
check('reduced motion: era flight lands in one frame',
    reduced.early === reduced.settled && reduced.settled !== '',
    JSON.stringify(reduced.early));

// Control: the same flight must still animate without the preference, or the
// check above would pass for the wrong reason (e.g. a broken era button).
await setMedia([]);
await sleep(100);
const normal = await flyTo('Cosmic');
check('without the preference the flight still animates',
    normal.early !== normal.settled,
    `${JSON.stringify(normal.early)} → ${JSON.stringify(normal.settled)}`);

// --- 8. The footer's legal dialog on the shared shell ---------------------
// It donated the keyboard contract; after moving it into Modal, re-check that
// the donor still has it. Opened with a programmatic click on purpose — that
// is the case where a dialog restoring focus from document.activeElement (the
// approach D17 rejected) silently drops it on <body>, because the trigger was
// never focused.
await js(`document.querySelector('.footer-link').click()`);
await sleep(300);
const legal = await js(`(() => {
    const p = document.querySelector('.legal-panel');
    if (!p) return null;
    const h = document.getElementById(p.getAttribute('aria-labelledby'));
    return {
        role: p.getAttribute('role'), modal: p.getAttribute('aria-modal'),
        heading: h?.textContent ?? null, focusInside: p.contains(document.activeElement),
    };
})()`);
check('legal dialog keeps its dialog semantics after the refactor',
    legal?.role === 'dialog' && legal?.modal === 'true' && !!legal?.heading,
    JSON.stringify(legal?.heading));
check('legal dialog takes focus on open', legal?.focusInside === true, await activeDesc());
await key('Escape');
await sleep(200);
check('Escape closes the legal dialog and focus returns to its trigger',
    await js(`!document.querySelector('.legal-panel')
        && document.activeElement === document.querySelector('.footer-link')`),
    await activeDesc());

if (consoleIssues.length) console.log('console errors/warnings:', consoleIssues);
check('no console errors or warnings', consoleIssues.length === 0);
console.log(fail === 0 ? `ALL ${pass} CHECKS PASS` : `${fail} CHECKS FAILED`);
close();
process.exit(fail === 0 ? 0 : 1);
