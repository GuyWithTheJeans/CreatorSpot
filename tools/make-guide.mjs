// Builds the picture-by-picture install guide images (docs/install/*.png).
// Real screenshots of chrome://extensions and the CreatorSpot dashboard, with red boxes on what to click,
// plus simple drawings of the Windows steps (unzip, folder picker, pinning) that cannot be screenshotted.
// Usage: node tools/make-guide.mjs
import path from 'node:path';
import { mkdirSync, cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { launch, openPage, BROWSERS } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs', 'install');
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Finds an element anywhere, including inside the shadow roots chrome://extensions is built from.
const DEEP = `
window.__deep = (test) => {
  const walk = (root) => {
    for (const el of root.querySelectorAll('*')) {
      if (test(el)) return el;
      if (el.shadowRoot) { const f = walk(el.shadowRoot); if (f) return f; }
    }
    return null;
  };
  return walk(document);
};
window.__mark = (el, label, opts = {}) => {
  const r = el.getBoundingClientRect();
  const pad = opts.pad == null ? 8 : opts.pad;
  const box = document.createElement('div');
  box.className = '__cs_mark';
  box.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;border:5px solid #F472B6;border-radius:14px;box-shadow:0 0 0 5px rgba(124,92,255,.35),0 0 24px rgba(244,114,182,.55);' +
    'left:' + (r.left - pad) + 'px;top:' + (r.top - pad) + 'px;width:' + (r.width + pad * 2) + 'px;height:' + (r.height + pad * 2) + 'px';
  const tag = document.createElement('div');
  tag.className = '__cs_mark';
  tag.textContent = label;
  const below = opts.side === 'below';
  const left = opts.side === 'left';
  tag.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;background:linear-gradient(135deg,#7C5CFF,#B26BF0 55%,#F472B6);color:#fff;font:700 21px/1.2 Segoe UI,Arial,sans-serif;padding:9px 16px;border-radius:12px;white-space:nowrap;box-shadow:0 4px 14px rgba(0,0,0,.25);' +
    (left ? 'top:' + (r.top + r.height / 2 - 20) + 'px;right:' + (innerWidth - r.left + pad + 14) + 'px'
          : below ? 'top:' + (r.bottom + pad + 12) + 'px;left:' + Math.max(8, Math.min(r.left - pad, innerWidth - 420)) + 'px'
          : 'top:' + Math.max(8, r.top - pad - 52) + 'px;left:' + Math.max(8, Math.min(r.left - pad, innerWidth - 420)) + 'px');
  document.body.append(box, tag);
};
window.__clear = () => document.querySelectorAll('.__cs_mark').forEach((e) => e.remove());
true`;

async function shot(page, name, clip) {
  await sleep(300);
  await page.screenshot(path.join(OUT, name), clip);
  console.log('  saved ' + name);
}

const b = await launch(BROWSERS.chrome, { width: 1200, height: 760 });
try {
  // ---------- Real screenshots: chrome://extensions ----------
  const ext = await openPage(b);
  await ext.setViewport(1200, 680);
  await ext.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
  await ext.goto('chrome://extensions');
  await sleep(1200);
  await ext.eval(DEEP);
  // Make sure Developer mode starts OFF for the first picture.
  await ext.eval(`(() => { const t = __deep((e) => e.id === 'devMode'); if (t && (t.checked || t.hasAttribute('checked'))) t.click(); return true; })()`);
  await sleep(500);
  await ext.eval(`__mark(__deep((e) => e.id === 'devMode'), 'Turn this ON', { side: 'below' })`);
  await shot(ext, '03-developer-mode.png', { x: 500, y: 0, width: 700, height: 380, scale: 1.4 });

  await ext.eval(`__clear(); __deep((e) => e.id === 'devMode').click(); true`);
  await sleep(800);
  await ext.eval(`__mark(__deep((e) => e.id === 'loadUnpacked'), 'Click "Load unpacked"', { side: 'below' })`);
  await shot(ext, '04-load-unpacked.png', { x: 0, y: 0, width: 760, height: 400, scale: 1.4 });

  // Install CreatorSpot from a folder named like the real one.
  const dir = path.join(mkdtempSync(path.join(tmpdir(), 'cs-guide-')), 'CreatorSpot');
  cpSync(path.join(ROOT, 'extension'), dir, { recursive: true });
  const { id } = await b.send('Extensions.loadUnpacked', { path: dir });
  await sleep(2500);
  // Close the welcome tab the install opens.
  for (const t of (await b.send('Target.getTargets')).targetInfos) {
    if (t.url.includes('/onboarding/')) await b.send('Target.closeTarget', { targetId: t.targetId }).catch(() => {});
  }
  await ext.goto('chrome://extensions');
  await sleep(1200);
  await ext.eval(DEEP);
  await ext.eval(`__mark(__deep((e) => e.tagName === 'EXTENSIONS-ITEM' && e.id === '${id}'), 'CreatorSpot is installed', { side: 'below', pad: 6 })`);
  await shot(ext, '06-installed.png');

  await ext.eval(`__clear(); (() => { const item = __deep((e) => e.tagName === 'EXTENSIONS-ITEM' && e.id === '${id}'); const btn = item.shadowRoot.querySelector('#dev-reload-button'); __mark(btn, 'Click to update', { side: 'left', pad: 6 }); return true; })()`);
  await shot(ext, '10-reload.png', { x: 300, y: 150, width: 460, height: 330, scale: 1.6 });

  // ---------- Real screenshots: the CreatorSpot dashboard ----------
  const dash = await openPage(b);
  await dash.setViewport(1200, 680);
  await dash.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
  await dash.goto(`chrome-extension://${id}/dashboard/dashboard.html#creators`);
  await dash.waitFor('!!document.querySelector("#signIn")', 15000);
  await sleep(1500);
  await dash.eval(DEEP);
  await dash.eval(`__mark(document.querySelector('#signIn'), 'Click "Sign in with Twitch"', { side: 'below' })`);
  await shot(dash, '08-sign-in.png');

  // Show what a signed-in creator sees (display only: no login token, nothing is sent anywhere).
  await dash.eval(`(async () => {
    const rows = await fetch(CreatorSpot.CLOUD.url + '/rest/v1/profiles?select=id,twitch_login,name,featured&twitch_login=eq.iamdoughnutdude', { headers: { apikey: CreatorSpot.CLOUD.key } }).then((r) => r.json());
    const p = rows[0];
    await chrome.storage.local.set({ account: { id: p.id, login: p.twitch_login, name: p.name, featured: p.featured, localId: CreatorSpot.cloud.localId(p) } });
    await chrome.runtime.sendMessage({ type: 'sync-now' });
    return true;
  })()`);
  await dash.goto(`chrome-extension://${id}/dashboard/dashboard.html#creators`);
  await dash.waitFor('!!document.querySelector("[data-edit]")', 15000);
  await sleep(1500);
  await dash.eval(DEEP);
  await dash.eval(`__clear(); __mark(document.querySelector('[data-edit]'), 'Click "Edit my profile"', { side: 'below' })`);
  await shot(dash, '09-edit-profile.png');
  await dash.eval(`chrome.storage.local.remove('account')`);
  rmSync(path.dirname(dir), { recursive: true, force: true });

  // ---------- Drawings of the Windows steps ----------
  const draw = await openPage(b);
  await draw.setViewport(1000, 560);
  const mocks = {
    '01-extract-all.png': `
      <div class="desk"><div class="file sel"><div class="zip"></div>CreatorSpot-for-Chrome.zip</div>
      <div class="menu"><div class="mi hl">📂&nbsp; Extract All...</div><div class="mi">Open with</div><div class="mi">Share</div><div class="mi">Copy as path</div><div class="mi">Properties</div></div>
      <div class="note n1">1. Find the ZIP you downloaded (usually in <b>Downloads</b>)<br>2. <b>Right-click</b> it, then click <b>Extract All...</b></div></div>`,
    '02-extract-desktop.png': `
      <div class="win"><div class="tb">Extract Compressed (Zipped) Folders</div><div class="body">
      <h3>Select a Destination and Extract Files</h3><p>Files will be extracted to this folder:</p>
      <div class="row"><div class="input">C:\\Users\\You\\Desktop</div><div class="btn hl">Browse...</div></div>
      <label class="chk"><input type="checkbox" checked> Show extracted files when complete</label>
      <div class="foot"><div class="btn primary hl2">Extract</div><div class="btn">Cancel</div></div></div></div>
      <div class="note n2">1. Click <b>Browse...</b> and pick <b>Desktop</b><br>2. Click <b>Extract</b></div>`,
    '05-pick-folder.png': `
      <div class="win wide"><div class="tb">Select the extension directory.</div><div class="body2">
      <div class="side"><div class="si hl">🖥️ Desktop</div><div class="si">⬇️ Downloads</div><div class="si">📄 Documents</div><div class="si">🖼️ Pictures</div></div>
      <div class="main"><div class="fi sel2">📁 CreatorSpot</div><div class="fi">📁 Some other folder</div></div></div>
      <div class="foot2"><span>Folder:</span><div class="input sm">CreatorSpot</div><div class="btn primary hl2">Select Folder</div><div class="btn">Cancel</div></div></div>
      <div class="note n3">1. Click <b>Desktop</b> on the left<br>2. Click the <b>CreatorSpot</b> folder <b>once</b><br>3. Click <b>Select Folder</b></div>`,
    '07-pin.png': `
      <div class="browser"><div class="bar"><div class="url">🔒 example.com</div><div class="icons"><div class="ic hl">🧩</div><div class="ic">⋮</div></div></div>
      <div class="drop"><div class="dh">Extensions</div><div class="de"><span class="spark">✦</span> CreatorSpot <span class="pin hl">📌</span></div><div class="dm">⚙️ Manage extensions</div></div>
      <div class="note n4">1. Click the <b>puzzle piece</b> (top right of Chrome)<br>2. Click the <b>pin</b> next to CreatorSpot<br>Its ✦ icon now stays in your toolbar.</div></div>`,
  };
  const css = `
    html,body{overflow:hidden}body{margin:0;width:1000px;height:560px;background:radial-gradient(circle at 15% 20%,rgba(124,92,255,.45),transparent 45%),radial-gradient(circle at 85% 85%,rgba(244,114,182,.35),transparent 45%),#0D0D14;font:16px Segoe UI,Arial,sans-serif;color:#111;overflow:hidden;position:relative}
    .hl,.hl2{outline:5px solid #F472B6;outline-offset:4px;border-radius:8px;box-shadow:0 0 0 9px rgba(124,92,255,.3)}
    .note{position:absolute;background:#16161F;color:#F3F2FA;border:1px solid #2A2A39;border-left:8px solid #F472B6;border-radius:14px;padding:16px 20px;font-size:21px;line-height:1.5;box-shadow:0 10px 30px rgba(0,0,0,.5)}.note b{color:#fff;background:linear-gradient(135deg,#B7A6FF,#F9A8D4);-webkit-background-clip:text;background-clip:text;color:transparent}
    .desk{position:absolute;inset:0}
    .file{position:absolute;left:70px;top:70px;width:150px;text-align:center;color:#F3F2FA;font-size:14px;padding:10px;border-radius:8px}
    .file.sel{background:rgba(255,255,255,.25);outline:2px solid rgba(255,255,255,.7)}
    .zip{width:64px;height:76px;margin:0 auto 8px;background:linear-gradient(#facc15,#eab308);border-radius:6px;position:relative}
    .zip:after{content:'';position:absolute;left:28px;top:0;width:8px;height:44px;background:repeating-linear-gradient(#555 0 5px,#ddd 5px 10px)}
    .menu{position:absolute;left:210px;top:120px;background:#fbfbfb;border-radius:10px;padding:6px;width:250px;box-shadow:0 12px 32px rgba(0,0,0,.35)}
    .mi{padding:10px 14px;border-radius:6px}
    .mi.hl{background:#e0ecff;font-weight:600}
    .n1{left:520px;top:150px;width:400px}
    .win{position:absolute;left:60px;top:50px;width:560px;background:#fff;border-radius:10px;box-shadow:0 16px 40px rgba(0,0,0,.4);overflow:hidden}
    .win.wide{width:600px}
    .tb{background:#f3f3f3;padding:10px 16px;font-size:14px;border-bottom:1px solid #ddd}
    .body{padding:18px 22px}
    .body h3{margin:0 0 14px;color:#1e3a8a;font-weight:500}
    .row{display:flex;gap:10px;align-items:center;margin:10px 0 16px}
    .input{flex:1;border:1px solid #999;padding:8px 10px;border-radius:4px;font-size:15px;background:#fff}
    .input.sm{flex:1}
    .btn{border:1px solid #aaa;padding:8px 18px;border-radius:5px;background:#f6f6f6;font-size:15px}
    .btn.primary{background:#0067c0;color:#fff;border-color:#0067c0}
    .chk{font-size:14px}
    .foot{display:flex;justify-content:flex-end;gap:10px;margin-top:40px}
    .n2{right:24px;top:170px;width:290px}
    .body2{display:flex;height:300px}
    .side{width:170px;background:#f7f7f7;padding:10px;border-right:1px solid #e5e5e5}
    .si{padding:9px 10px;border-radius:6px;margin-bottom:4px}
    .main{flex:1;padding:12px}
    .fi{padding:10px 12px;border-radius:6px;margin-bottom:6px}
    .fi.sel2{background:#cce4ff;outline:5px solid #F472B6;outline-offset:3px}
    .foot2{display:flex;gap:10px;align-items:center;padding:12px 16px;border-top:1px solid #e5e5e5;background:#fafafa}
    .n3{right:24px;top:150px;width:270px}
    .browser{position:absolute;left:40px;top:40px;width:920px;height:480px;background:#fff;border-radius:12px;box-shadow:0 16px 40px rgba(0,0,0,.4);overflow:hidden}
    .bar{display:flex;align-items:center;gap:12px;background:#dfe3eb;padding:12px 16px}
    .url{flex:1;background:#fff;border-radius:20px;padding:8px 16px;color:#444}
    .icons{display:flex;gap:14px}
    .ic{font-size:22px;padding:4px 8px}
    .drop{position:absolute;right:20px;top:64px;width:330px;background:#fff;border-radius:10px;box-shadow:0 10px 28px rgba(0,0,0,.3);padding:12px}
    .dh{font-weight:700;margin-bottom:8px}
    .de{display:flex;align-items:center;gap:10px;padding:10px;border-radius:8px;background:#f3f4f6}
    .spark{display:inline-grid;place-items:center;width:28px;height:28px;border-radius:8px;background:linear-gradient(135deg,#7c3aed,#ec4899);color:#fff}
    .pin{margin-left:auto;font-size:20px;padding:2px 6px}
    .dm{padding:10px;color:#555}
    .n4{left:40px;top:150px;width:470px}
  `;
  for (const [name, html] of Object.entries(mocks)) {
    await draw.send('Page.setDocumentContent', { frameId: (await draw.send('Page.getFrameTree')).frameTree.frame.id, html: '<!doctype html><meta charset="utf-8"><style>' + css + '</style>' + html });
    await shot(draw, name);
  }
} finally {
  await b.close();
}
console.log('Guide images are in docs/install');
