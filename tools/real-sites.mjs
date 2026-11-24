// Real-world compatibility check: visits public, ad-supported sites with the extension loaded
// and records how many placements were replaced, plus a screenshot of each page.
// Usage: node tools/real-sites.mjs [browser] [--headed]
import path from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { launch, openPage, BROWSERS } from './cdp.mjs';

const SITES = [
  'https://www.dictionary.com/browse/creator',
  'https://www.thesaurus.com/browse/creative',
  'https://www.accuweather.com/',
  'https://www.speedtest.net/',
  'https://www.merriam-webster.com/dictionary/stream',
  'https://www.ign.com/',
  'https://www.gamespot.com/',
  'https://www.youtube.com/results?search_query=indie+games',
];
const browser = process.argv.slice(2).find((a) => !a.startsWith('--')) || 'chrome';
const headed = process.argv.includes('--headed');
const OUT = path.resolve('test-results', 'real-sites');
mkdirSync(OUT, { recursive: true });

const b = await launch(BROWSERS[browser], { headless: !headed, width: 1366, height: 900 });
const rows = [];
try {
  await b.send('Extensions.loadUnpacked', { path: path.resolve('extension') });
  await new Promise((r) => setTimeout(r, 1500));
  const page = await openPage(b);
  await page.setViewport(1366, 900);
  for (const url of SITES) {
    const host = new URL(url).hostname;
    try {
      await page.send('Page.navigate', { url });
      await new Promise((r) => setTimeout(r, 9000));
      // Scroll to trigger lazy-loaded slots, then come back up.
      for (let y = 0; y < 4; y++) {
        await page.eval('window.scrollBy(0, 900)');
        await new Promise((r) => setTimeout(r, 1200));
      }
      await page.eval('window.scrollTo(0, 0)');
      await new Promise((r) => setTimeout(r, 1500));
      const info = await page.eval(`(() => ({
        title: document.title.slice(0, 60),
        promos: [...document.querySelectorAll('creatorspot-promo')].map((h) => { const r = h.getBoundingClientRect(); return Math.round(r.width) + 'x' + Math.round(r.height); }),
        skipped: document.querySelectorAll('[data-cs-claimed="skip"]').length,
        bodyHeight: document.body ? document.body.scrollHeight : 0,
      }))()`);
      rows.push({ host, ...info });
      console.log(host.padEnd(26), String(info.promos.length).padStart(2), 'promos', info.promos.join(' '), '|', info.title);
      await page.screenshot(path.join(OUT, browser + '-' + host + '.png'));
    } catch (e) {
      rows.push({ host, error: e.message });
      console.log(host.padEnd(26), 'ERROR', e.message);
    }
  }
} finally {
  await b.close();
}
writeFileSync(path.join(OUT, browser + '-results.json'), JSON.stringify(rows, null, 2));
