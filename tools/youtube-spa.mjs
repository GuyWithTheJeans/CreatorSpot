// YouTube single-page browsing check: click from video to video (no page reloads, like a real viewer)
// and, on each video, simulate YouTube dropping a companion ad into the sidebar. CreatorSpot must keep
// the sidebar ad replaced on every video, not just the first one.
// Usage: node tools/youtube-spa.mjs [chrome|brave|edge] [videos]
import path from 'node:path';
import { launch, openPage, BROWSERS } from './cdp.mjs';

const browser = process.argv[2] || 'chrome';
const videos = Number(process.argv[3] || 8);
const b = await launch(BROWSERS[browser], { width: 1600, height: 1000 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = true;
const check = (name, pass, detail) => {
  ok = ok && pass;
  console.log((pass ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + detail : ''));
};
// What YouTube does when a mid-roll ad brings a companion banner: it fills #player-ads with new renderers.
const injectAd = `(() => {
  const pa = document.querySelector('#player-ads');
  if (!pa) return 'no #player-ads';
  pa.querySelectorAll('ytd-player-legacy-desktop-watch-ads-renderer').forEach((n) => n.remove());
  const w = document.createElement('ytd-player-legacy-desktop-watch-ads-renderer');
  const slot = document.createElement('ytd-ad-slot-renderer');
  const ad = document.createElement('div');
  ad.className = 'fake-ad';
  ad.style.cssText = 'height:300px;background:#2266aa;color:#fff';
  ad.textContent = 'FAKE CORPAY AD · Sponsored';
  slot.appendChild(ad);
  w.appendChild(slot);
  pa.appendChild(w);
  return 'ok';
})()`;
const state = `(() => {
  const ad = document.querySelector('.fake-ad');
  const adVisible = !!ad && ad.getBoundingClientRect().height > 0;
  const promo = document.querySelector('#secondary creatorspot-promo');
  return { adVisible, promo: !!promo && promo.getBoundingClientRect().height > 0, url: location.search };
})()`;
try {
  await b.send('Extensions.loadUnpacked', { path: path.resolve('extension') });
  await sleep(1500);
  const page = await openPage(b);
  await page.setViewport(1600, 1000);
  await page.send('Page.navigate', { url: 'https://www.youtube.com/watch?v=7THYN-y_Z7o' });
  await sleep(10000);
  for (let i = 1; i <= videos; i++) {
    const inj = await page.eval(injectAd);
    await sleep(2500);
    const s = await page.eval(state);
    check('Video ' + i + ': sidebar ad hidden and promo shown', !s.adVisible && s.promo, inj + ' ' + JSON.stringify(s));
    if (i === videos) break;
    // Click the next related video (YouTube navigates without reloading the page).
    const clicked = await page.eval(`(() => {
      const a = [...document.querySelectorAll('#secondary a[href^="/watch?v="]')].find((x) => x.getBoundingClientRect().height > 20 && !x.href.includes(location.search.slice(3)));
      if (!a) return false; a.click(); return true;
    })()`);
    if (!clicked) { check('Found a related video to click', false); break; }
    await sleep(6000);
  }
  await page.screenshot('test-results/youtube-spa.png', { x: 0, y: 0, width: 1600, height: 1000, scale: 0.6 });
} catch (e) {
  check('Run completed', false, e.message);
} finally {
  await b.close();
}
process.exit(ok ? 0 : 1);
