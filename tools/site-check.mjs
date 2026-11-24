// Checks one real site at a given window size and rotation mode, and saves a screenshot.
// Usage: node tools/site-check.mjs <url> [browser] [width] [mode]
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { launch, openPage, BROWSERS } from './cdp.mjs';

const [url, browser = 'brave', width = '2000', mode = 'network'] = process.argv.slice(2);
const W = Number(width);
const H = 1080;
mkdirSync('test-results/real-sites', { recursive: true });
const b = await launch(BROWSERS[browser], { width: W, height: H });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  const { id } = await b.send('Extensions.loadUnpacked', { path: path.resolve('extension') });
  await sleep(1500);
  const ext = await openPage(b, `chrome-extension://${id}/dashboard/dashboard.html`);
  await ext.eval(`CreatorSpot.store.saveSettings({ mode: '${mode}' })`);
  await sleep(400);
  const page = await openPage(b);
  await page.setViewport(W, H);
  await page.send('Page.navigate', { url });
  await sleep(10000);
  for (let i = 0; i < 4; i++) {
    await page.eval('window.scrollBy(0, 900)');
    await sleep(1200);
  }
  await page.eval('window.scrollTo(0, 0)');
  await sleep(2000);
  const info = await page.eval(`[...document.querySelectorAll('creatorspot-promo')].map((h) => { const r = h.getBoundingClientRect(); return h.shadowRoot.querySelector('.name').textContent + ' ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' @y' + Math.round(r.top + scrollY); })`);
  console.log(info.length + ' promotions:\n  ' + info.join('\n  '));
  const host = new URL(url).hostname;
  await page.screenshot(path.resolve('test-results/real-sites', `${browser}-${host}-${W}.png`), { x: 0, y: 0, width: W, height: H, scale: 0.6 });
} finally {
  await b.close();
}
