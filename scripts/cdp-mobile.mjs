// Shared harness for headless browser verification: serves the production
// build (vite preview), launches headless Edge with device emulation, and
// exposes a minimal CDP client over Node's native WebSocket — no Playwright/
// Puppeteer on this machine.
//
// Two profiles: launchMobile() (390x844 @3x, touch — perf-mobile.mjs,
// verify-touch.mjs) and launchDesktop() (1280x800, mouse + keyboard —
// verify-a11y.mjs). Both require `npm run build` first (vite preview serves
// dist/).
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EDGE_CANDIDATES = [
    process.env.EDGE_PATH,
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].filter(Boolean);

const MOBILE = { width: 390, height: 844, deviceScaleFactor: 3, mobile: true };
const DESKTOP = { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false };

export const launchMobile = (opts) => launch({ ...opts, device: MOBILE, touch: true });
export const launchDesktop = (opts) => launch({ ...opts, device: DESKTOP, touch: false });

export async function launch({ port, cdpPort, cpuThrottle = 0, device = MOBILE, touch: touchEnabled = true }) {
    const url = `http://127.0.0.1:${port}/TimelineOfEverything/`;
    const edgePath = EDGE_CANDIDATES.find(p => existsSync(p));
    if (!edgePath) throw new Error('msedge.exe not found — set EDGE_PATH');

    const kids = [];
    const cleanup = () => { for (const k of kids) try { k.kill(); } catch { /* gone */ } };
    process.on('exit', cleanup);

    // --host 127.0.0.1: without it vite preview binds IPv6 ::1 only and the
    // IPv4 loopback (which Edge and fetch may resolve to) is refused.
    const server = spawn(process.execPath,
        [join(ROOT, 'node_modules/vite/bin/vite.js'), 'preview',
            '--port', String(port), '--strictPort', '--host', '127.0.0.1'],
        { cwd: ROOT, stdio: 'ignore' });
    kids.push(server);
    // Poll until the server answers — Edge shows its error page on a refused
    // connection and never retries, so a too-early navigate strands the run.
    for (let i = 0; ; i++) {
        try { await fetch(url); break; }
        catch { if (i > 50) throw new Error('preview server never came up — did you build?'); await sleep(200); }
    }

    const edge = spawn(edgePath, [
        '--headless=new', `--remote-debugging-port=${cdpPort}`,
        `--user-data-dir=${process.env.TEMP}\\toe-mobile-check-profile`,
        '--no-first-run', '--mute-audio', '--hide-scrollbars', 'about:blank',
    ], { stdio: 'ignore' });
    kids.push(edge);

    let wsUrl = null;
    for (let i = 0; !wsUrl; i++) {
        try {
            const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
            wsUrl = targets.find(t => t.type === 'page')?.webSocketDebuggerUrl;
        } catch { /* not up yet */ }
        if (!wsUrl) { if (i > 50) throw new Error('no CDP page target'); await sleep(200); }
    }

    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let msgId = 0;
    const pending = new Map();
    let loaded = false;
    const consoleIssues = [];
    ws.onmessage = (m) => {
        const msg = JSON.parse(m.data);
        if (msg.id && pending.has(msg.id)) {
            const { res, rej } = pending.get(msg.id);
            pending.delete(msg.id);
            msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
        } else if (msg.method === 'Page.loadEventFired') loaded = true;
        else if (msg.method === 'Runtime.consoleAPICalled' &&
            ['error', 'warning'].includes(msg.params.type)) {
            consoleIssues.push(msg.params.args.map(a => a.value ?? a.description).join(' '));
        }
    };
    const cdp = (method, params = {}) => new Promise((res, rej) => {
        const id = ++msgId;
        pending.set(id, { res, rej });
        ws.send(JSON.stringify({ id, method, params }));
    });
    const js = async (expression) => {
        const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
        return r.result.value;
    };
    // Each dispatch passes the FULL set of active touch points; touchEnd with
    // an empty array releases all fingers.
    const touch = (type, points) => cdp('Input.dispatchTouchEvent', {
        type, touchPoints: points.map((p, i) => ({ x: Math.round(p.x), y: Math.round(p.y), id: i })),
    });
    const click = async (x, y) => {
        const at = { x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1 };
        await cdp('Input.dispatchMouseEvent', { type: 'mouseMoved', ...at, button: 'none' });
        await cdp('Input.dispatchMouseEvent', { type: 'mousePressed', ...at });
        await cdp('Input.dispatchMouseEvent', { type: 'mouseReleased', ...at });
    };
    // Real key events (not element.dispatchEvent) so React's handlers see what
    // a keyboard user's would produce. rawKeyDown carries no character; pass
    // `text` for a key that should also TYPE (that's the difference between
    // testing "/" as a shortcut and "/" as a character). Bulk text goes in via
    // Input.insertText.
    const KEYS = {
        Tab: { code: 'Tab', vk: 9 },
        Enter: { code: 'Enter', vk: 13 },
        Escape: { code: 'Escape', vk: 27 },
        ArrowUp: { code: 'ArrowUp', vk: 38 },
        ArrowDown: { code: 'ArrowDown', vk: 40 },
        f: { code: 'KeyF', vk: 70 },
        '/': { code: 'Slash', vk: 191 },
    };
    const key = async (name, { shift = false, ctrl = false, text } = {}) => {
        const k = KEYS[name];
        if (!k) throw new Error(`unmapped key: ${name}`);
        const common = {
            key: name, code: k.code, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk,
            modifiers: (ctrl ? 2 : 0) | (shift ? 8 : 0),
        };
        await cdp('Input.dispatchKeyEvent',
            text ? { type: 'keyDown', text, ...common } : { type: 'rawKeyDown', ...common });
        await cdp('Input.dispatchKeyEvent', { type: 'keyUp', ...common });
    };
    const type = (text) => cdp('Input.insertText', { text });
    // CSS media emulation — reduced motion, color scheme, print. Pass [] to
    // hand control back to the OS/browser defaults.
    const setMedia = (features) => cdp('Emulation.setEmulatedMedia', { features });

    await cdp('Page.enable');
    await cdp('Runtime.enable');
    await cdp('Emulation.setDeviceMetricsOverride', device);
    // maxTouchPoints must stay in 1..16 even when disabling — CDP rejects 0.
    await cdp('Emulation.setTouchEmulationEnabled', { enabled: touchEnabled, maxTouchPoints: 5 });
    if (cpuThrottle > 1) await cdp('Emulation.setCPUThrottlingRate', { rate: cpuThrottle });
    await cdp('Page.navigate', { url });
    for (let i = 0; i < 100 && !loaded; i++) await sleep(100);
    await sleep(1500); // let the scene build + fonts settle

    const close = () => { try { ws.close(); } catch { /* fine */ } cleanup(); };
    return { cdp, js, touch, click, key, type, setMedia, consoleIssues, close };
}
