// Diagnostic: lists ad-like elements on a real page (with the extension loaded) so site adapters can be tuned.
// Usage: node tools/probe-ads.mjs <url> [browser] [--no-block]
import path from 'node:path';
import { launch, openPage, BROWSERS } from './cdp.mjs';

const url = process.argv[2];
const browser = process.argv.slice(3).find((a) => !a.startsWith('--')) || 'chrome';
const b = await launch(BROWSERS[browser], { width: 1366, height: 900 });
try {
  const { id } = await b.send('Extensions.loadUnpacked', { path: path.resolve('extension') });
  await new Promise((r) => setTimeout(r, 1500));
  if (process.argv.includes('--no-block')) {
    const ext = await openPage(b, `chrome-extension://${id}/dashboard/dashboard.html`);
    await ext.eval(`CreatorSpot.store.saveSettings({ blockAdRequests: false })`);
    await new Promise((r) => setTimeout(r, 500));
  }
  const page = await openPage(b);
  await page.setViewport(1366, 900);
  await page.send('Page.navigate', { url });
  await new Promise((r) => setTimeout(r, 10000));
  for (let y = 0; y < 3; y++) {
    await page.eval('window.scrollBy(0, 900)');
    await new Promise((r) => setTimeout(r, 1200));
  }
  const out = await page.eval(`(() => {
    const re = /(^|[-_ ])(ad|ads|advert|advertisement|dfp|gpt|banner|sponsor|leaderboard|mrec|billboard|skyscraper)([-_ 0-9]|$)/i;
    const list = [];
    document.querySelectorAll('div, ins, aside, section, iframe').forEach((el) => {
      const sig = (el.id || '') + ' ' + (typeof el.className === 'string' ? el.className : '') + ' ' + [...el.attributes].map(a => a.name).filter(n => /ad/i.test(n)).join(' ');
      if (!re.test(sig)) return;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      list.push({ tag: el.tagName.toLowerCase(), id: el.id.slice(0, 40), cls: String(el.className).slice(0, 60), size: Math.round(r.width) + 'x' + Math.round(r.height), disp: cs.display, claimed: el.getAttribute('data-cs-claimed') || '', attrs: [...el.attributes].map(a => a.name).filter(n => /ad|slot/i.test(n)).join(',') });
    });
    return { promos: document.querySelectorAll('creatorspot-promo').length, count: list.length, list: list.slice(0, 45) };
  })()`);
  console.log(JSON.stringify(out, null, 1));
} finally {
  await b.close();
}
