// Minimal Chrome DevTools Protocol client over --remote-debugging-pipe (no dependencies).
// Lets the end-to-end tests load the unpacked extension into real Chrome, Edge and Brave.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export const BROWSERS = {
  chrome: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  edge: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  brave: 'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
};

export async function launch(exe, { headless = true, width = 1280, height = 900, extraArgs = [] } = {}) {
  const profile = mkdtempSync(path.join(tmpdir(), 'cs-e2e-'));
  const args = [
    '--remote-debugging-pipe',
    '--enable-unsafe-extension-debugging',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-search-engine-choice-screen',
    '--user-data-dir=' + profile,
    `--window-size=${width},${height}`,
    ...(headless ? ['--headless=new'] : []),
    ...extraArgs,
    'about:blank',
  ];
  const proc = spawn(exe, args, { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
  const out = proc.stdio[3];
  const inp = proc.stdio[4];
  let id = 0;
  const pending = new Map();
  const listeners = [];
  let buf = '';
  inp.on('data', (chunk) => {
    buf += chunk.toString('utf8');
    let i;
    while ((i = buf.indexOf('\0')) >= 0) {
      const msg = JSON.parse(buf.slice(0, i));
      buf = buf.slice(i + 1);
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      } else if (msg.method) listeners.forEach((l) => l(msg));
    }
  });
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const mid = ++id;
      const timer = setTimeout(() => {
        pending.delete(mid);
        reject(new Error('CDP timeout: ' + method));
      }, 30000);
      pending.set(mid, {
        resolve: (v) => (clearTimeout(timer), resolve(v)),
        reject: (e) => (clearTimeout(timer), reject(e)),
      });
      out.write(JSON.stringify({ id: mid, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0');
    });
  const on = (fn) => listeners.push(fn);
  const close = async () => {
    try { await send('Browser.close'); } catch {}
    await new Promise((r) => setTimeout(r, 800));
    try { proc.kill(); } catch {}
    try { rmSync(profile, { recursive: true, force: true }); } catch {}
  };
  return { send, on, close, proc };
}

/** Open a page and return a small helper bound to its session. */
export async function openPage(b, url) {
  const { targetId } = await b.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await b.send('Target.attachToTarget', { targetId, flatten: true });
  const s = (m, p) => b.send(m, p, sessionId);
  await s('Page.enable');
  await s('Runtime.enable');
  const page = {
    targetId,
    sessionId,
    send: s,
    async goto(u) {
      await s('Page.navigate', { url: u });
      await page.waitFor('document.readyState === "complete"', 15000);
    },
    async eval(expr) {
      const r = await s('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    },
    async waitFor(expr, timeout = 10000) {
      const t0 = Date.now();
      while (Date.now() - t0 < timeout) {
        try { if (await page.eval(expr)) return true; } catch {}
        await new Promise((r) => setTimeout(r, 150));
      }
      throw new Error('Timed out waiting for: ' + expr);
    },
    async screenshot(file, clip) {
      const { data } = await s('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, ...(clip ? { clip } : {}) });
      const { writeFileSync } = await import('node:fs');
      writeFileSync(file, Buffer.from(data, 'base64'));
    },
    async setViewport(width, height) {
      await s('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    },
  };
  if (url) await page.goto(url);
  return page;
}
