// Shared harness for headless mobile verification: serves the production
// build (vite preview), launches headless Edge with phone emulation
// (390x844 @3x, touch enabled), and exposes a minimal CDP client over
// Node's native WebSocket — no Playwright/Puppeteer on this machine.
//
// Used by perf-mobile.mjs and verify-touch.mjs. Requires `npm run build`
// first (vite preview serves dist/).
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

export async function launchMobile({ port, cdpPort, cpuThrottle = 0 }) {
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

    await cdp('Page.enable');
    await cdp('Runtime.enable');
    await cdp('Emulation.setDeviceMetricsOverride',
        { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
    await cdp('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    if (cpuThrottle > 1) await cdp('Emulation.setCPUThrottlingRate', { rate: cpuThrottle });
    await cdp('Page.navigate', { url });
    for (let i = 0; i < 100 && !loaded; i++) await sleep(100);
    await sleep(1500); // let the scene build + fonts settle

    const close = () => { try { ws.close(); } catch { /* fine */ } cleanup(); };
    return { cdp, js, touch, consoleIssues, close };
}
