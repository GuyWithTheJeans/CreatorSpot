// Diagnostic: scrolls a page and reports what element is showing at a screen point (e.g. a sticky ad).
// Usage: node tools/probe-sticky.mjs <url> [browser] [width] [x] [y]
import path from 'node:path';
import { launch, openPage, BROWSERS } from './cdp.mjs';

const [url, browser = 'brave', width = '1250', x = '600', y = '100'] = process.argv.slice(2);
const b = await launch(BROWSERS[browser], { width: Number(width), height: 1000 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  await b.send('Extensions.loadUnpacked', { path: path.resolve('extension') });
  await sleep(1500);
  const page = await openPage(b);
  await page.setViewport(Number(width), 1000);
  await page.send('Page.navigate', { url });
  await sleep(10000);
  const describe = `(() => {
    const out = [];
    for (let el = document.elementFromPoint(${x}, ${y}); el && el !== document.body; el = el.parentElement) {
      const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
      out.push(el.tagName.toLowerCase() + (el.id ? '#' + el.id.slice(0, 40) : '') + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\\s+/).slice(0, 3).join('.') : '') +
        ' ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' pos=' + cs.position + (el.getAttribute('data-cs-claimed') ? ' CLAIMED=' + el.getAttribute('data-cs-claimed') : '') +
        ' attrs=' + [...el.attributes].map(a => a.name).filter(n => /ad|slot|google/i.test(n)).join(','));
    }
    return { promos: document.querySelectorAll('creatorspot-promo').length, chain: out };
  })()`;
  console.log('BEFORE SCROLL', JSON.stringify(await page.eval(describe), null, 1));
  for (let i = 0; i < 3; i++) { await page.eval('window.scrollBy(0, 600)'); await sleep(1500); }
  await sleep(3000);
  console.log('AFTER SCROLL', JSON.stringify(await page.eval(describe), null, 1));
  await page.screenshot(path.resolve('test-results/real-sites/sticky-probe.png'), { x: 0, y: 0, width: Number(width), height: 1000, scale: 0.6 });
} finally {
  await b.close();
}
