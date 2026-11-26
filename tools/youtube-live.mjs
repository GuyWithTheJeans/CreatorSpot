// Live YouTube diagnosis: open a real watch page with CreatorSpot loaded and report every ad-looking
// element in the sidebar, whether CreatorSpot claimed it, and what it filled.
// Usage: node tools/youtube-live.mjs [chrome|brave|edge] [videoId]
import path from 'node:path';
import { launch, openPage, BROWSERS } from './cdp.mjs';

const browser = process.argv[2] || 'chrome';
const vid = process.argv[3] || '7THYN-y_Z7o';
const b = await launch(BROWSERS[browser], { width: 1600, height: 1000 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  await b.send('Extensions.loadUnpacked', { path: path.resolve('extension') });
  await sleep(1500);
  const page = await openPage(b);
  await page.setViewport(1600, 1000);
  for (let round = 0; round < 3; round++) {
    await page.send('Page.navigate', { url: 'https://www.youtube.com/watch?v=' + vid });
    await sleep(12000);
    const info = await page.eval(`(() => {
      const out = [];
      const sec = document.querySelector('#secondary');
      const seen = new Set();
      const sel = '[id*="ad" i], [class*="ad-" i], [class*="Ad" ], [class*="sponsor" i], ytd-ad-slot-renderer, #player-ads, ytd-companion-slot-renderer, ytd-engagement-panel-section-list-renderer[target-id*="ads"]';
      (sec ? sec.querySelectorAll(sel) : []).forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width < 100 || r.height < 40) return;
        const chain = [];
        for (let n = el; n && n !== sec; n = n.parentElement) chain.unshift(n.tagName.toLowerCase() + (n.id ? '#' + n.id : ''));
        const key = chain.join('>');
        if (seen.has(key)) return; seen.add(key);
        out.push({ chain: chain.slice(-6).join(' > '), cls: String(el.className).slice(0, 80), size: Math.round(r.width) + 'x' + Math.round(r.height), claimed: el.getAttribute('data-cs-claimed'), promo: !!el.querySelector('creatorspot-promo') });
      });
      const sponsored = [...document.querySelectorAll('#secondary *')].filter((n) => n.children.length === 0 && /^\\s*Sponsored/.test(n.textContent)).map((n) => { const c = []; for (let p = n; p && p.id !== 'secondary'; p = p.parentElement) c.unshift(p.tagName.toLowerCase() + (p.id ? '#' + p.id : '')); return c.slice(0, 8).join(' > '); });
      return { promos: document.querySelectorAll('creatorspot-promo').length, claimed: [...document.querySelectorAll('[data-cs-claimed]')].map((e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + '=' + e.getAttribute('data-cs-claimed')), sponsored, out: out.slice(0, 25) };
    })()`);
    console.log('--- round', round + 1, JSON.stringify(info, null, 1));
    await page.screenshot('test-results/youtube-live-' + (round + 1) + '.png', { x: 0, y: 0, width: 1600, height: 1000, scale: 0.6 });
    if (info.sponsored.length) break;
  }
} finally {
  await b.close();
}
