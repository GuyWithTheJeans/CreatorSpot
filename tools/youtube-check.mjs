// YouTube adapter check on the real youtube.com page.
// YouTube only serves ads to some sessions, so this test simulates the two signals the adapter
// watches: a display-ad renderer in the sidebar, and the player's "ad-showing" class.
// It verifies the adapter replaces the display slot, shows the companion card beside the player,
// never touches the player, and removes the companion when the ad ends.
import path from 'node:path';
import { launch, openPage, BROWSERS } from './cdp.mjs';

const browser = process.argv[2] || 'chrome';
const b = await launch(BROWSERS[browser], { width: 1400, height: 900 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = true;
const check = (name, pass, detail) => {
  ok = ok && pass;
  console.log((pass ? 'PASS ' : 'FAIL ') + name + (detail ? ' — ' + detail : ''));
};
try {
  await b.send('Extensions.loadUnpacked', { path: path.resolve('extension') });
  await sleep(1500);
  const page = await openPage(b);
  await page.setViewport(1400, 900);
  await page.send('Page.navigate', { url: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ' });
  await sleep(9000);
  const hasPlayer = await page.eval(`!!document.querySelector('#movie_player')`);
  check('Watch page loaded with player', hasPlayer);
  const playerHtmlBefore = await page.eval(`document.querySelector('#movie_player') ? document.querySelector('#movie_player').querySelectorAll('*').length : 0`);

  // 1. Display ad renderer in the sidebar (as YouTube inserts them).
  await page.eval(`(() => {
    const side = document.querySelector('#secondary-inner') || document.querySelector('#secondary');
    const slot = document.createElement('ytd-ad-slot-renderer');
    slot.id = 'cs-test-slot';
    slot.style.cssText = 'display:block;width:100%;height:250px;background:#333';
    side.insertBefore(slot, side.firstChild);
  })()`);
  await sleep(1500);
  const display = await page.eval(`(() => { const h = document.querySelector('#cs-test-slot creatorspot-promo'); return h ? h.shadowRoot.querySelector('.name').textContent + ' ' + Math.round(h.getBoundingClientRect().width) + 'x' + Math.round(h.getBoundingClientRect().height) : null; })()`);
  check('Sidebar display ad slot replaced', !!display, display || 'not replaced');

  // 1b. Newer spots: the "ads" panel above related videos, and a renamed ad box that only wears the Sponsored badge.
  await page.eval(`(() => {
    const side = document.querySelector('#secondary-inner') || document.querySelector('#secondary');
    let panels = side.querySelector('#panels');
    if (!panels) { panels = document.createElement('div'); panels.id = 'panels'; side.insertBefore(panels, side.firstChild); }
    const p = document.createElement('ytd-engagement-panel-section-list-renderer');
    p.setAttribute('target-id', 'engagement-panel-ads');
    p.id = 'cs-test-panel';
    p.style.cssText = 'display:block;width:100%;height:300px;background:#246';
    panels.appendChild(p);
    const items = document.querySelector('#related #items') || document.querySelector('#related');
    const box = document.createElement('some-new-ad-layout');
    box.id = 'cs-test-badge';
    box.style.cssText = 'display:block;width:100%;height:280px;background:#642';
    const inner = document.createElement('div');
    inner.appendChild(document.createElement('ad-badge-view-model')).textContent = 'Sponsored';
    box.appendChild(inner);
    items.insertBefore(box, items.firstChild);
  })()`);
  await sleep(2000);
  for (const id of ['cs-test-panel', 'cs-test-badge']) {
    const r = await page.eval(`(() => { const s = document.getElementById('${id}'); const h = s && s.querySelector('creatorspot-promo'); const hiddenKids = s ? [...s.children].filter((c) => c !== h).every((c) => getComputedStyle(c).display === 'none') : false; return h ? Math.round(h.getBoundingClientRect().height) + 'px, original hidden: ' + hiddenKids : null; })()`);
    check('Newer sidebar ad (' + id + ') replaced', !!r && r.endsWith('true'), r || 'not replaced');
  }
  const related = await page.eval(`document.querySelectorAll('#related ytd-compact-video-renderer creatorspot-promo, #related yt-lockup-view-model creatorspot-promo').length`);
  check('Normal related videos are left alone', related === 0, related + ' promos inside normal videos');

  // 2. Video ad starts: YouTube adds the "ad-showing" class to the player.
  await page.eval(`document.querySelector('#movie_player').classList.add('ad-showing')`);
  await sleep(2500);
  const companion = await page.eval(`(() => { const h = document.querySelector('[data-cs-companion]'); return h ? h.shadowRoot.querySelector('.label').textContent + ' | ' + h.shadowRoot.querySelector('.name').textContent : null; })()`);
  check('Companion card appears beside the player during a video ad', !!companion, companion || 'none');
  check('Companion is labeled as alongside the ad, not a replacement', !!companion && companion.includes('Shown alongside this ad'));
  const insidePlayer = await page.eval(`!!document.querySelector('#movie_player creatorspot-promo, #movie_player [data-cs-companion]')`);
  check('Nothing is inserted into the video player', !insidePlayer);
  const playerHtmlAfter = await page.eval(`document.querySelector('#movie_player').querySelectorAll('*').length`);
  check('Player DOM untouched by CreatorSpot', Math.abs(playerHtmlAfter - playerHtmlBefore) < 50, playerHtmlBefore + ' → ' + playerHtmlAfter + ' nodes (YouTube itself mutates the player)');
  await page.screenshot('test-results/youtube-companion.png', { x: 0, y: 0, width: 1400, height: 900, scale: 1 });

  // 3. Ad ends.
  await page.eval(`document.querySelector('#movie_player').classList.remove('ad-showing')`);
  await sleep(2000);
  check('Companion removed when the ad ends', !(await page.eval(`!!document.querySelector('[data-cs-companion]')`)));
} catch (e) {
  check('Run completed', false, e.message);
} finally {
  await b.close();
}
process.exit(ok ? 0 : 1);
