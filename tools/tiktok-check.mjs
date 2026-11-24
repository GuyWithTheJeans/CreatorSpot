// Live check of TikTok background videos in promos: a creator campaign with TikTok video links is shown on the
// local test site; the video must start on its own (muted), at most 2 play per page, and the sound horn must
// toggle without opening the link or counting a click. Saves screenshots to test-results/.
// Usage: node tools/tiktok-check.mjs [chrome|brave|edge] [tiktokVideoId]
import http from 'node:http';
import path from 'node:path';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { launch, openPage, BROWSERS } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXT = process.env.CS_EXT_DIR || path.join(ROOT, 'extension');
const SHOTS = path.join(ROOT, 'test-results');
mkdirSync(SHOTS, { recursive: true });
const browser = process.argv[2] || 'chrome';
const VIDEO = process.argv[3] || '6718335390845095173'; // public sample from TikTok's embed documentation
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name, ok, detail) => {
  if (!ok) failed++;
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' — ' + detail : ''));
};

const server = http.createServer((req, res) => {
  const file = path.join(ROOT, 'test-site', 'index.html');
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(readFileSync(file, 'utf8'));
});
await new Promise((r) => server.listen(8788, '127.0.0.1', r));

console.log('=== ' + browser.toUpperCase() + ' ===');
const b = await launch(BROWSERS[browser], { headless: false, width: 1300, height: 950 });
try {
  const { id } = await b.send('Extensions.loadUnpacked', { path: EXT });
  await sleep(2000);
  const ext = await openPage(b, `chrome-extension://${id}/dashboard/dashboard.html`);
  await ext.waitFor('!!document.querySelector(".kpis")', 10000);
  // One of "your" creators with TikTok videos on its campaign; "Promote myself" so every slot is theirs.
  await ext.eval(`(async () => {
    await CreatorSpot.store.saveProfiles(
      [{ id: 'cr_tt', name: 'TikTok Tester', isOwn: true, accent: '#F472B6', platforms: [{ type: 'tiktok', url: 'https://www.tiktok.com/@scout2015' }] }],
      [{ id: 'cp_tt', creatorId: 'cr_tt', headline: 'New TikToks every day!', message: 'Tap to watch the full video.', format: 'spotlight', tiktok: ['https://www.tiktok.com/@scout2015/video/${VIDEO}'] }]
    );
    await CreatorSpot.store.saveSettings({ mode: 'self', maxPerPage: 6 });
    return true;
  })()`);
  const stored = await ext.eval(`CreatorSpot.store.getAll().then((d) => d.campaigns.find((c) => c.id === 'cp_tt').tiktok)`);
  check('TikTok link saved as a video ID', JSON.stringify(stored) === JSON.stringify([VIDEO]), JSON.stringify(stored));

  const page = await openPage(b, 'http://127.0.0.1:8788/');
  await page.setViewport(1280, 900);
  await page.waitFor(`document.querySelectorAll('creatorspot-promo').length >= 3`, 15000);
  const count = await page.eval(`[...document.querySelectorAll('creatorspot-promo')].filter((h) => h.shadowRoot.querySelector('iframe.bg-tiktok')).length`);
  check('At most 2 TikTok videos per page', count >= 1 && count <= 2, count + ' with video');
  // The first video promo is at the top of the page; wait for TikTok's player to start it.
  const ready = await page
    .waitFor(`[...document.querySelectorAll('creatorspot-promo')].some((h) => h.shadowRoot.querySelector('.cs.tt-ready'))`, 25000)
    .then(() => true, () => false);
  check('Video starts playing on its own (muted)', ready);
  await sleep(2500);
  await page.screenshot(path.join(SHOTS, browser + '-tiktok-page.png'), { x: 0, y: 0, width: 1280, height: 900, scale: 1 });

  // Sound horn: toggles sound, does not open the link, is not counted as a click.
  const pages = async () => (await b.send('Target.getTargets')).targetInfos.filter((t) => t.type === 'page').length;
  const targetsBefore = await pages();
  const horn = await page.eval(`(() => {
    const h = [...document.querySelectorAll('creatorspot-promo')].find((x) => x.shadowRoot.querySelector('.cs.tt-ready'));
    if (!h) return null;
    h.scrollIntoView({ block: 'center' });
    const r = h.shadowRoot.querySelector('.horn').getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, label: h.shadowRoot.querySelector('.horn').getAttribute('aria-label') };
  })()`);
  if (horn) {
    await sleep(600);
    const pos = await page.eval(`(() => { const h = [...document.querySelectorAll('creatorspot-promo')].find((x) => x.shadowRoot.querySelector('.cs.tt-ready')); const r = h.shadowRoot.querySelector('.horn').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    for (const type of ['mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, x: pos.x, y: pos.y, button: 'left', clickCount: 1 });
    await sleep(1500);
    const after = await page.eval(`[...document.querySelectorAll('creatorspot-promo')].find((x) => x.shadowRoot.querySelector('.cs.tt-ready')).shadowRoot.querySelector('.horn').getAttribute('aria-label')`);
    const targetsAfter = await pages();
    check('Sound button turns sound on', horn.label === 'Turn sound on' && after === 'Turn sound off', horn.label + ' -> ' + after);
    check('Sound button does not open the link', targetsAfter <= targetsBefore, targetsBefore + ' -> ' + targetsAfter + ' tabs');
    const stats = await ext.eval(`CreatorSpot.store.getStats().then((s) => Object.values(s).reduce((n, d) => n + Object.values(d).reduce((a, r) => a + r.c, 0), 0))`);
    check('Sound button is not counted as a click', stats === 0, stats + ' clicks');
    const shot = await page.eval(`(() => { const h = [...document.querySelectorAll('creatorspot-promo')].find((x) => x.shadowRoot.querySelector('.cs.tt-ready')); const r = h.getBoundingClientRect(); return { x: Math.max(0, r.x - 10), y: Math.max(0, r.y - 10), width: r.width + 20, height: r.height + 20, scale: 1 }; })()`);
    await page.screenshot(path.join(SHOTS, browser + '-tiktok-promo.png'), shot);
  } else check('Sound button found', false);

  // Turning the setting off removes the videos.
  await ext.eval(`CreatorSpot.store.saveSettings({ tiktokVideos: false })`);
  await page.goto('http://127.0.0.1:8788/');
  await page.waitFor(`document.querySelectorAll('creatorspot-promo').length >= 3`, 15000);
  await sleep(1500);
  const off = await page.eval(`[...document.querySelectorAll('creatorspot-promo')].filter((h) => h.shadowRoot.querySelector('iframe.bg-tiktok')).length`);
  check('Setting off: no TikTok videos', off === 0, off + ' with video');
} catch (e) {
  check('Run completed', false, e.message);
} finally {
  await b.close();
  server.close();
}
console.log(failed ? failed + ' failed' : 'TikTok backgrounds work');
process.exit(failed ? 1 : 0);
