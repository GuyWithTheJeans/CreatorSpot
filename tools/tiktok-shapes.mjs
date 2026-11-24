// Screenshot a TikTok-background promo in every common ad shape (for checking the design).
// Usage: node tools/tiktok-shapes.mjs [videoId]   -> test-results/tiktok-shapes.png
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, openPage, BROWSERS } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VIDEO = process.argv[2] || '6718335390845095173';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await launch(BROWSERS.chrome, { headless: false, width: 1400, height: 1000 });
try {
  const { id } = await b.send('Extensions.loadUnpacked', { path: path.join(ROOT, 'extension') });
  await sleep(1500);
  const page = await openPage(b, `chrome-extension://${id}/privacy.html`);
  await page.setViewport(1340, 900);
  await page.eval(`(async () => {
    const CS = window.CreatorSpot;
    document.body.innerHTML = '';
    document.body.style.cssText = 'margin:0;padding:20px;background:#e9e9ef;display:flex;flex-wrap:wrap;gap:20px;align-items:flex-start';
    for (const s of ${JSON.stringify(['load'])}) void s;
    return true;
  })()`).catch(() => null);
  // privacy.html does not load the render library, so add it.
  await page.eval(`new Promise((ok) => { const add = (src) => new Promise((r) => { const sc = document.createElement('script'); sc.src = src; sc.onload = r; document.head.appendChild(sc); }); add('lib/core.js').then(() => add('lib/platforms.js')).then(() => add('lib/render.js')).then(ok); })`);
  await page.eval(`(() => {
    const CS = window.CreatorSpot;
    const sizes = [[300, 250], [300, 600], [970, 250], [728, 90], [336, 280]];
    for (const [w, h] of sizes) {
      const host = document.createElement('div');
      host.style.cssText = 'position:relative;width:' + w + 'px;height:' + h + 'px';
      document.body.appendChild(host);
      CS.render.mount(host, {
        creator: { id: 'x', name: 'DoughnutDude', accent: '#F472B6', category: 'Gaming', bio: 'Sweet plays and chaotic fun.', avatarUrl: null },
        campaign: { id: 'c', format: 'spotlight', headline: 'Catch my next stream!', message: 'Grab a snack and come hang out.', cta: '' },
        platform: { type: 'tiktok', url: 'https://www.tiktok.com/@imdoughnutdude', handle: '@imdoughnutdude' },
        live: null, animations: true, tiktok: '${VIDEO}',
      }, { w, h });
    }
    return true;
  })()`);
  await page.waitFor(`[...document.querySelectorAll('div')].filter((d) => d.shadowRoot && d.shadowRoot.querySelector('.tt-ready')).length >= 3`, 30000).catch(() => null);
  await sleep(3000);
  await page.screenshot(path.join(ROOT, 'test-results', 'tiktok-shapes.png'));
  console.log('saved test-results/tiktok-shapes.png');
} finally {
  await b.close();
}
