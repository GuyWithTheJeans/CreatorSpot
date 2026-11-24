// Screenshots of every CreatorSpot screen (dashboard pages, editors, popup, welcome page) at a typical
// full-screen size, for design review. Shows a signed-in creator (display only: no login token, nothing is sent).
// Usage: node tools/ui-shots.mjs [width] [height] [tag]   -> test-results/ui/<tag>-*.png
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { launch, openPage, BROWSERS } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const W = Number(process.argv[2]) || 1920;
const H = Number(process.argv[3]) || 1080;
const TAG = process.argv[4] || 'before';
const OUT = path.join(ROOT, 'test-results', 'ui');
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const b = await launch(BROWSERS.chrome, { width: W, height: H });
try {
  const { id } = await b.send('Extensions.loadUnpacked', { path: path.join(ROOT, 'extension') });
  await sleep(2500);
  const shotPage = async (name, url, w, h, prep) => {
    const p = await openPage(b);
    await p.setViewport(w, h);
    await p.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
    await p.goto(url);
    await sleep(1800);
    if (prep) await prep(p);
    await sleep(900);
    await p.screenshot(path.join(OUT, TAG + '-' + name + '.png'));
    await b.send('Target.closeTarget', { targetId: p.targetId }).catch(() => {});
    console.log('  ' + name);
  };
  const base = `chrome-extension://${id}/dashboard/dashboard.html`;
  // Signed in as Doughnut (display only) so the creator screens show what he sees.
  const setup = await openPage(b, base);
  await setup.eval(`(async () => {
    const rows = await fetch(CreatorSpot.CLOUD.url + '/rest/v1/profiles?select=id,twitch_login,name,featured&twitch_login=eq.iamdoughnutdude', { headers: { apikey: CreatorSpot.CLOUD.key } }).then((r) => r.json());
    const p = rows[0];
    await chrome.storage.local.set({ account: { id: p.id, login: p.twitch_login, name: p.name, featured: p.featured, localId: CreatorSpot.cloud.localId(p) } });
    await chrome.runtime.sendMessage({ type: 'sync-now' });
    return true;
  })()`);
  for (const view of ['overview', 'creators', 'campaigns', 'rotation', 'analytics', 'settings']) {
    await shotPage('dash-' + view, base + '#' + view, W, H);
  }
  await shotPage('dash-edit-profile', base + '#creators', W, H, async (p) => {
    await p.eval(`document.querySelector('[data-edit]') && document.querySelector('[data-edit]').click(); true`);
  });
  await shotPage('dash-edit-campaign', base + '#campaigns', W, H, async (p) => {
    await p.eval(`document.querySelector('[data-cedit]') && document.querySelector('[data-cedit]').click(); true`);
  });
  await shotPage('dash-my-tiktoks', base + '#creators', W, H, async (p) => {
    await p.eval(`(async () => { const b = document.querySelector('[data-tiktoks]'); if (!b) return false; b.click(); await new Promise((r) => setTimeout(r, 400)); const i = document.querySelector('#ttLink'); i.value = 'https://www.tiktok.com/@scout2015/video/6718335390845095173'; document.querySelector('#ttAddBtn').click(); return true; })()`);
    await sleep(6000);
  });
  await shotPage('popup', `chrome-extension://${id}/popup/popup.html`, 380, 620);
  await shotPage('welcome', `chrome-extension://${id}/onboarding/welcome.html`, W, H);
  await setup.eval(`chrome.storage.local.remove('account')`);
} finally {
  await b.close();
}
console.log('Saved to test-results/ui');
