// Generates the site's icon set and social-share image into public/.
//
// Everything here is derived from ONE artwork definition (iconSvg below), so
// the favicon, the PWA icons, the Apple touch icon and the OG card can never
// drift apart. Rasterizing needs a renderer; this machine has no sharp/resvg
// (and no Playwright — see scripts/cdp-mobile.mjs), so we drive headless Edge
// over CDP and screenshot a page sized exactly to each target.
//
//   npm run icons
//
// Committed output is checked in — this script only needs re-running when the
// artwork changes.
import { spawn } from 'node:child_process';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const EDGE_CANDIDATES = [
    process.env.EDGE_PATH,
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].filter(Boolean);

// The app's palette (src/format.js) and page background (src/App.css).
const BG = '#0a0e27';
const SPINE = '#3d4a7a';
const TEXT = '#e0e0e0';
const MUTED = '#8b93b8';
const CAT = {
    natural: '#ff6b6b', history: '#4ecdc4', science: '#45b7d1',
    technology: '#f9ca24', future: '#a29bfe',
};

// The mark: a timeline spine with three event dots whose gaps shrink toward
// the right — the symlog compression of recent history that defines this
// project, reduced to the few strokes that survive a 16px favicon. Three
// dots at r=6 is the most that stays legible there; four would mush.
//
// `radius` is the background's corner rounding, in viewBox units (0-64) — it
// scales with the output size, so one value serves every target. Rounded for
// the favicon and PWA icons, square for apple-touch-icon (iOS applies its own
// mask and a pre-rounded source would show a doubled corner).
function iconSvg({ radius = 14 } = {}) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Timeline of Everything">
  <rect width="64" height="64" rx="${radius}" fill="${BG}"/>
  <line x1="10" y1="32" x2="54" y2="32" stroke="${SPINE}" stroke-width="3.5" stroke-linecap="round"/>
  <circle cx="14" cy="32" r="6" fill="${CAT.natural}"/>
  <circle cx="32" cy="32" r="6" fill="${CAT.history}"/>
  <circle cx="46" cy="32" r="6" fill="${CAT.future}"/>
</svg>`;
}

// Social-share card (1200x630). Same visual language as the app: dark field,
// category-colored marks on a spine, one span bar (the app renders endYear
// events as bars), with real dates so the card reads as a timeline and not
// as decoration.
function ogHtml() {
    const marks = [
        { x: 90, label: 'Big Bang', year: '13.8 Bya', cat: 'natural' },
        { x: 340, label: 'First life', year: '3.7 Bya', cat: 'natural' },
        { x: 610, label: 'Cuneiform', year: '3200 BCE', cat: 'history' },
        { x: 800, label: 'Moon landing', year: '1969', cat: 'technology' },
        { x: 1010, label: 'Sun dies', year: '+5 Bya', cat: 'future' },
    ];
    const dots = marks.map(m => `
    <circle cx="${m.x}" cy="470" r="11" fill="${CAT[m.cat]}"/>
    <text x="${m.x}" y="436" text-anchor="middle" fill="${TEXT}" font-size="21">${m.label}</text>
    <text x="${m.x}" y="508" text-anchor="middle" fill="${MUTED}" font-size="18">${m.year}</text>`).join('');

    return `<!doctype html><meta charset="utf-8">
<style>
  html,body { margin:0; padding:0; width:1200px; height:630px; overflow:hidden; }
  body { background:${BG};
         font-family:'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, sans-serif; }
</style>
<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="glow" cx="50%" cy="34%" r="62%">
      <stop offset="0%" stop-color="#1b2456"/>
      <stop offset="100%" stop-color="${BG}"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#glow)"/>

  <text x="600" y="212" text-anchor="middle" fill="${TEXT}"
        font-size="72" font-weight="700" letter-spacing="-1">Timeline of Everything</text>
  <text x="600" y="268" text-anchor="middle" fill="${MUTED}" font-size="29">
    13.8 billion years, from the Big Bang to speculative futures
  </text>

  <line x1="60" y1="470" x2="1140" y2="470"
        stroke="${SPINE}" stroke-width="4" stroke-linecap="round"/>
  <rect x="690" y="462" width="86" height="16" rx="8" fill="${CAT.history}" opacity="0.75"/>
  ${dots}

  <text x="600" y="586" text-anchor="middle" fill="${MUTED}" font-size="21"
        letter-spacing="0.4">ybachmann.github.io/TimelineOfEverything</text>
</svg>`;
}

// Wrap an SVG in a page sized exactly to the capture, so the screenshot is
// the artwork and nothing else.
function iconHtml(size, radius) {
    return `<!doctype html><meta charset="utf-8">
<style>
  html,body { margin:0; padding:0; width:${size}px; height:${size}px; overflow:hidden; }
  svg { display:block; width:${size}px; height:${size}px; }
</style>
${iconSvg({ radius })}`;
}

async function main() {
    const edgePath = EDGE_CANDIDATES.find(p => existsSync(p));
    if (!edgePath) throw new Error('msedge.exe not found — set EDGE_PATH');
    mkdirSync(PUBLIC, { recursive: true });

    // The favicon ships as vector (crisp at every size); the rest are rasters
    // required by platforms that refuse SVG.
    writeFileSync(join(PUBLIC, 'favicon.svg'), iconSvg() + '\n');
    console.log('  favicon.svg');

    const work = join(tmpdir(), 'toe-icons');
    mkdirSync(work, { recursive: true });
    const targets = [
        { file: 'icon-192.png', w: 192, h: 192, html: iconHtml(192, 14) },
        { file: 'icon-512.png', w: 512, h: 512, html: iconHtml(512, 14) },
        // Maskable icons must keep their content inside a 40%-radius safe
        // zone, so this one renders the mark smaller on a full-bleed field.
        { file: 'icon-512-maskable.png', w: 512, h: 512, html: maskableHtml(512) },
        { file: 'apple-touch-icon.png', w: 180, h: 180, html: iconHtml(180, 0) },
        { file: 'og-image.png', w: 1200, h: 630, html: ogHtml() },
    ];

    const kids = [];
    const cleanup = () => { for (const k of kids) try { k.kill(); } catch { /* gone */ } };
    process.on('exit', cleanup);

    const edge = spawn(edgePath, [
        '--headless=new', '--remote-debugging-port=9333',
        `--user-data-dir=${work}\\profile`,
        '--no-first-run', '--mute-audio', '--hide-scrollbars',
        '--force-device-scale-factor=1', 'about:blank',
    ], { stdio: 'ignore' });
    kids.push(edge);

    let wsUrl = null;
    for (let i = 0; !wsUrl; i++) {
        try {
            const targetList = await (await fetch('http://127.0.0.1:9333/json/list')).json();
            wsUrl = targetList.find(t => t.type === 'page')?.webSocketDebuggerUrl;
        } catch { /* not up yet */ }
        if (!wsUrl) { if (i > 50) throw new Error('no CDP page target'); await sleep(200); }
    }

    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let msgId = 0;
    const pending = new Map();
    let loaded = false;
    ws.onmessage = (m) => {
        const msg = JSON.parse(m.data);
        if (msg.id && pending.has(msg.id)) {
            const { res, rej } = pending.get(msg.id);
            pending.delete(msg.id);
            msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
        } else if (msg.method === 'Page.loadEventFired') loaded = true;
    };
    const cdp = (method, params = {}) => new Promise((res, rej) => {
        const id = ++msgId;
        pending.set(id, { res, rej });
        ws.send(JSON.stringify({ id, method, params }));
    });

    await cdp('Page.enable');
    for (const t of targets) {
        const src = join(work, t.file + '.html');
        writeFileSync(src, t.html);
        // Viewport must match the target exactly — captureScreenshot grabs
        // the viewport, and any mismatch would scale or letterbox the art.
        await cdp('Emulation.setDeviceMetricsOverride',
            { width: t.w, height: t.h, deviceScaleFactor: 1, mobile: false });
        loaded = false;
        await cdp('Page.navigate', { url: pathToFileURL(src).href });
        for (let i = 0; i < 100 && !loaded; i++) await sleep(50);
        await sleep(250); // fonts settle before the grab
        const { data } = await cdp('Page.captureScreenshot', { format: 'png' });
        writeFileSync(join(PUBLIC, t.file), Buffer.from(data, 'base64'));
        console.log(`  ${t.file}  ${t.w}x${t.h}`);
    }

    try { ws.close(); } catch { /* fine */ }
    cleanup();
}

// Android adaptive icons crop to an arbitrary shape; keep the mark within the
// inner ~80% so no platform mask clips a dot.
function maskableHtml(size) {
    return `<!doctype html><meta charset="utf-8">
<style>
  html,body { margin:0; padding:0; width:${size}px; height:${size}px;
              overflow:hidden; background:${BG}; }
  svg { display:block; width:${size * 0.72}px; height:${size * 0.72}px;
        margin:${size * 0.14}px auto; }
</style>
${iconSvg({ radius: 0 })}`;
}

main().then(() => console.log('icons written to public/'),
    err => { console.error(err); process.exit(1); });
