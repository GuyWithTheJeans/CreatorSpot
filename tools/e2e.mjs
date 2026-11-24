// End-to-end acceptance tests: loads the real, unpacked extension into installed browsers
// and checks the MVP definition of success against the local test site.
// Usage: node tools/e2e.mjs [chrome|edge|brave ...] [--headed]
import http from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, openPage, BROWSERS } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXT = process.env.CS_EXT_DIR || path.join(ROOT, 'extension'); // CS_EXT_DIR: test a packaged copy
const SHOTS = path.join(ROOT, 'test-results');
mkdirSync(SHOTS, { recursive: true });

const args = process.argv.slice(2);
const headed = args.includes('--headed');
const which = args.filter((a) => !a.startsWith('--'));
const targets = (which.length ? which : Object.keys(BROWSERS)).filter((b) => existsSync(BROWSERS[b]));

// ---- Static server for the test site ----
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const file = path.join(ROOT, 'test-site', url.pathname === '/' ? 'index.html' : url.pathname);
  if (!file.startsWith(path.join(ROOT, 'test-site')) || !existsSync(file)) {
    res.writeHead(404).end('Not found');
    return;
  }
  let body = readFileSync(file, 'utf8');
  // ?hide simulates a browser ad blocker (e.g. Brave Shields) hiding ad slots with a stylesheet.
  if (url.searchParams.has('hide')) body = body.replace('</head>', '<style>ins.adsbygoogle,[id^="div-gpt-ad"],.ad-slot,[data-ad-slot]{display:none!important}</style></head>');
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(body);
});
await new Promise((r) => server.listen(8787, '127.0.0.1', r));
const SITE = 'http://127.0.0.1:8787/';

const EXPECTED = ['slot-leaderboard', 'div-gpt-ad-1234-0', 'slot-responsive', 'slot-mobile', 'slot-sky', 'slot-narrow', 'div-gpt-ad-billboard', 'div-gpt-ad-sticky', 'slot-dynamic'];
const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function check(browser, name, ok, detail) {
  results.push({ browser, name, ok: !!ok, detail: detail || '' });
  console.log((ok ? '  PASS ' : '  FAIL ') + name + (detail ? ' — ' + detail : ''));
}

const COLLECT = `(() => [...document.querySelectorAll('creatorspot-promo')].map((h) => {
  const a = h.shadowRoot.querySelector('a');
  const r = h.getBoundingClientRect();
  const slot = h.closest('[data-cs-claimed]') || h.nextElementSibling;
  const name = h.shadowRoot.querySelector('.name');
  const headline = h.shadowRoot.querySelector('.headline');
  const fs = (el) => el ? parseFloat(getComputedStyle(el).fontSize) : null;
  return { slot: slot && slot.id, w: Math.round(r.width), h: Math.round(r.height), name: name && name.textContent,
    href: a.href, cls: a.className, label: (() => { const l = h.shadowRoot.querySelector('.label'); return l && getComputedStyle(l).display !== 'none' ? l.textContent : (h.shadowRoot.querySelector('.eyebrow') || {}).textContent || ''; })(),
    nameSize: fs(name), headSize: headline && getComputedStyle(headline).display !== 'none' ? fs(headline) : null,
    overflowX: (() => {
      const box = a.getBoundingClientRect();
      return ['.name', '.headline', '.msg', '.cta', '.label', '.avatar'].some((s) => {
        const el = h.shadowRoot.querySelector(s);
        if (!el || getComputedStyle(el).display === 'none') return false;
        const r = el.getBoundingClientRect();
        if (!r.width) return false;
        return r.left < box.left - 1 || r.right > box.right + 1 || r.top < box.top - 1 || r.bottom > box.bottom + 1;
      });
    })(),
    nameTruncated: name ? (() => { if (name.classList.contains('wrap')) return name.scrollHeight > name.clientHeight + 1; const r = document.createRange(); r.selectNodeContents(name); const cs = getComputedStyle(name); return r.getBoundingClientRect().width > name.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) + 0.5; })() : false };
}))()`;

async function setStorage(ext, expr) {
  await ext.eval(`(async () => { ${expr} })()`);
  await sleep(300);
}

for (const browser of targets) {
  console.log('\n=== ' + browser.toUpperCase() + ' ===');
  const b = await launch(BROWSERS[browser], { headless: !headed });
  try {
    const version = (await b.send('Browser.getVersion')).product;
    console.log('  ' + version);
    await b.send('Target.setDiscoverTargets', { discover: true });
    const created = [];
    b.on((m) => {
      if (m.method === 'Target.targetCreated') created.push(Object.assign({}, m.params.targetInfo));
      if (m.method === 'Target.targetInfoChanged') {
        const t = created.find((x) => x.targetId === m.params.targetInfo.targetId);
        if (t && m.params.targetInfo.url && m.params.targetInfo.url !== 'about:blank') t.url = m.params.targetInfo.url;
      }
    });

    const { id } = await b.send('Extensions.loadUnpacked', { path: EXT });
    check(browser, 'Extension installs', !!id, id);
    await sleep(1500);
    check(browser, 'Onboarding opens on install', created.some((t) => t.url.includes(id + '/onboarding/welcome.html')));

    const ext = await openPage(b, `chrome-extension://${id}/dashboard/dashboard.html`);
    await ext.waitFor('!!document.querySelector(".kpis")', 8000);
    const rules = await ext.eval('chrome.declarativeNetRequest.getEnabledRulesets()');
    check(browser, 'Ad-network ruleset off by default', !rules.includes('ad_networks'), JSON.stringify(rules));
    await setStorage(ext, `await CreatorSpot.store.saveSettings({ blockAdRequests: true });`);
    const rulesOn = await ext.eval('chrome.declarativeNetRequest.getEnabledRulesets()');
    check(browser, 'Ad-network ruleset turns on with the setting', rulesOn.includes('ad_networks'), JSON.stringify(rulesOn));
    await setStorage(ext, `await CreatorSpot.store.saveSettings({ maxPerPage: 12 });`);
    // The featured creators' names and links are live (they edit them through their accounts), so read them.
    await ext.eval(`chrome.runtime.sendMessage({ type: 'sync-now' })`).catch(() => null);
    const FEAT = await ext.eval(`CreatorSpot.store.getAll().then(({ creators }) => creators.filter((c) => c.featured).map((c) => ({ name: c.name, urls: c.platforms.map((p) => p.url) })))`);
    const FEAT_NAMES = FEAT.map((f) => f.name).sort();
    const urlsOf = (name) => (FEAT.find((f) => f.name === name) || { urls: [] }).urls;
    const hostOf = (u) => { try { return new URL(u).hostname.replace(/^(www|m)./, ''); } catch (e) { return ''; } };
    console.log('  Featured right now: ' + FEAT.map((f) => f.name + ' (' + f.urls.length + ' links)').join(', '));

    // ---- Stage 1: detection + replacement ----
    const page = await openPage(b, SITE);
    await page.setViewport(1280, 900);
    await page.goto(SITE);
    await sleep(3500);
    let promos = await page.eval(COLLECT);
    const slots = promos.map((p) => p.slot);
    check(browser, 'All ' + EXPECTED.length + ' eligible placements replaced', EXPECTED.every((s) => slots.includes(s)) && promos.length === EXPECTED.length, slots.join(', '));
    await page.eval('window.scrollBy(0, 400)');
    await sleep(800);
    check(browser, 'Sticky ad that forces itself back on scroll stays hidden', await page.eval(`getComputedStyle(document.getElementById('sticky-creative')).display === 'none'`));
    await page.eval('window.scrollTo(0, 0)');
    check(browser, 'Real content untouched', await page.eval(`!!document.querySelector('#real-content') && getComputedStyle(document.querySelector('#real-content')).display !== 'none'`));
    check(browser, 'False-positive ad-like box left alone', await page.eval(`!document.querySelector('#false-positive').hasAttribute('data-cs-claimed') && document.querySelector('#false-positive').offsetHeight > 0`));
    check(browser, 'Slot hidden by the site is not surfaced', !slots.includes('div-gpt-ad-hidden-1'));
    check(browser, 'Lazy-loaded ad replaced (mutation observer)', slots.includes('slot-dynamic'));
    const sizes = Object.fromEntries(promos.map((p) => [p.slot, p.w + 'x' + p.h]));
    check(browser, 'Promotions keep the slot size', sizes['slot-leaderboard'] === '728x90' && sizes['div-gpt-ad-1234-0'] === '300x250' && sizes['slot-narrow'] === '160x600' && sizes['div-gpt-ad-billboard'] === '970x250' && sizes['slot-mobile'] === '320x50', JSON.stringify(sizes));
    check(browser, 'Every promotion is labeled', promos.every((p) => /Creator promo/.test(p.label)));
    check(browser, 'Text stays inside the promotion and readable', promos.every((p) => !p.overflowX && p.nameSize >= 12 && (p.headSize == null || p.headSize >= 11)), JSON.stringify(promos.filter((p) => p.overflowX).map((p) => p.slot)));
    check(browser, 'Creator names are never cut off', promos.every((p) => !p.nameTruncated), JSON.stringify(promos.filter((p) => p.nameTruncated).map((p) => p.slot)));
    const layouts = Object.fromEntries(promos.map((p) => [p.slot, p.cls.match(/\b(strip|tall|wide|card)\b/)[1]]));
    check(browser, 'Layouts adapt to slot shape', layouts['slot-leaderboard'] === 'strip' && layouts['slot-narrow'] === 'tall' && layouts['div-gpt-ad-billboard'] === 'wide' && layouts['div-gpt-ad-1234-0'] === 'card', JSON.stringify(layouts));
    await page.screenshot(path.join(SHOTS, browser + '-test-site.png'));

    // ---- Stage 2: both creators, correct links, rotation ----
    const names = new Set(promos.map((p) => p.name));
    check(browser, 'Both featured creators displayed', FEAT_NAMES.length === 2 && FEAT_NAMES.every((n) => names.has(n)), [...names].join(', '));
    const linkOk = promos.every((p) => urlsOf(p.name).includes(p.href));
    check(browser, "Each promotion links to that creator's own channel", linkOk, promos.filter((p) => !urlsOf(p.name).includes(p.href)).map((p) => p.name + ' -> ' + p.href).join(', '));
    const seq = promos.map((p) => p.name);
    check(browser, 'Creators alternate on a page', seq.every((n, i) => i === 0 || n !== seq[i - 1]), seq.join(' → '));
    const firsts = [];
    for (let i = 0; i < 4; i++) {
      await page.goto(SITE);
      await page.waitFor(`document.querySelectorAll('creatorspot-promo').length >= 6`, 8000);
      firsts.push(await page.eval(`[...new Set([...document.querySelectorAll('creatorspot-promo')].map((h) => h.shadowRoot.querySelector('.name').textContent))].sort().join('+')`));
    }
    check(browser, 'Both creators appear on every page load', firsts.every((f) => f === FEAT_NAMES.join('+')), firsts.join(' | '));

    // Click opens the right channel in a new tab.
    await sleep(1500); // allow impression timers (1 s) to fire
    await page.waitFor(`document.querySelectorAll('creatorspot-promo').length >= 2`, 10000);
    const before = created.length;
    const box = await page.eval(`(() => { const h = [...document.querySelectorAll('creatorspot-promo')].find((x) => x.offsetHeight >= 200) || document.querySelector('creatorspot-promo'); h.id = 'cs-click-target'; return { name: h.shadowRoot.querySelector('.name').textContent }; })()`);
    await page.eval(`document.getElementById('cs-click-target').scrollIntoView({block:'center'})`);
    const box2 = await page.eval(`(() => { const r = document.getElementById('cs-click-target').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    for (const type of ['mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, x: box2.x, y: box2.y, button: 'left', clickCount: 1 });
    await sleep(2500);
    const opened = created.slice(before).find((t) => t.type === 'page');
    check(browser, 'Clicking opens the creator channel in a new tab', opened && urlsOf(box.name).some((u) => hostOf(u) === hostOf(opened.url)), opened ? opened.url : 'no tab');
    if (opened) await b.send('Target.closeTarget', { targetId: opened.targetId }).catch(() => {});

    const stats = await ext.eval(`CreatorSpot.store.getStats()`);
    const day = Object.values(stats)[0] || {};
    const imps = Object.values(day).reduce((a, r) => a + r.i, 0);
    const clicks = Object.values(day).reduce((a, r) => a + r.c, 0);
    check(browser, 'Displays and clicks are recorded', imps > 0 && clicks === 1, imps + ' displays, ' + clicks + ' clicks');

    // ---- Settings: frequency, page cap, interchangeability, site pause, master switch ----
    await setStorage(ext, `await CreatorSpot.store.saveSettings({ replaceRate: 50 });`);
    await page.goto(SITE);
    await sleep(3000);
    promos = await page.eval(COLLECT);
    check(browser, 'Replacement rate 50% replaces half the placements', promos.length === Math.floor(EXPECTED.length / 2), promos.length + ' of ' + EXPECTED.length);

    await setStorage(ext, `await CreatorSpot.store.saveSettings({ replaceRate: 100, maxPerPage: 6 });`);
    await page.goto(SITE);
    await sleep(3000);
    check(browser, 'Default page cap of 6 is respected', (await page.eval(COLLECT)).length === 6);

    await setStorage(ext, `await CreatorSpot.store.saveProfiles([{ id: 'cr_test', name: 'SwapTestCreator', platforms: [{ type: 'youtube', url: 'https://www.youtube.com/@swaptest' }], isOwn: true }], [{ id: 'cp_test', creatorId: 'cr_test', headline: 'Subscribe for new videos', format: 'gaming' }]);`);
    await page.goto(SITE);
    await sleep(3000);
    promos = await page.eval(COLLECT);
    const swapNames = new Set(promos.map((p) => p.name));
    check(browser, 'A new creator added through settings joins the rotation', promos.some((p) => p.name === 'SwapTestCreator' && p.href === 'https://www.youtube.com/@swaptest'), [...swapNames].join(', '));
    check(browser, 'Featured creators stay in the rotation', FEAT_NAMES.every((n) => swapNames.has(n)), [...swapNames].join(', '));

    await setStorage(ext, `chrome.runtime.sendMessage({ type: 'reset-demo' });`);
    await sleep(500);
    await setStorage(ext, `await CreatorSpot.store.saveSettings({ disabledSites: ['127.0.0.1'] });`);
    await page.goto(SITE);
    await sleep(2500);
    check(browser, 'Paused site is left untouched', (await page.eval(COLLECT)).length === 0);
    await setStorage(ext, `await CreatorSpot.store.saveSettings({ disabledSites: [], enabled: false });`);
    await page.goto(SITE);
    await sleep(2500);
    check(browser, 'Master switch off shows nothing', (await page.eval(COLLECT)).length === 0);
    const rulesOff = await ext.eval('chrome.declarativeNetRequest.getEnabledRulesets()');
    check(browser, 'Ad-network ruleset disabled when switched off', !rulesOff.includes('ad_networks'));
    await setStorage(ext, `await CreatorSpot.store.saveSettings({ enabled: true });`);

    // ---- Live switch: turning a site off removes promotions without reload ----
    await page.goto(SITE);
    await sleep(2500);
    const n1 = (await page.eval(COLLECT)).length;
    await setStorage(ext, `await CreatorSpot.store.saveSettings({ enabled: false });`);
    await sleep(500);
    const n2 = (await page.eval(COLLECT)).length;
    const adsBack = await page.eval(`getComputedStyle(document.querySelector('#aswift_1')).display !== 'none'`);
    check(browser, 'Turning off restores the page live', n1 > 0 && n2 === 0 && adsBack, n1 + ' → ' + n2);
    await setStorage(ext, `await CreatorSpot.store.saveSettings({ enabled: true });`);

    // ---- Ad-blocker compatibility (simulated hidden slots) ----
    await setStorage(ext, `await CreatorSpot.store.saveSettings({ compatMode: 'on', maxPerPage: 12 });`);
    await page.goto(SITE + '?hide');
    await sleep(3000);
    promos = await page.eval(COLLECT);
    check(browser, 'Compatibility mode places promotions beside blocker-hidden slots', promos.length >= 6, promos.length + ' placed');
    await page.screenshot(path.join(SHOTS, browser + '-compat.png'));
    await setStorage(ext, `await CreatorSpot.store.saveSettings({ compatMode: 'auto', maxPerPage: 6 });`);

    // ---- Brave in its default configuration (Shields up) ----
    if (browser === 'brave') {
      await page.goto(SITE);
      await sleep(3000);
      promos = await page.eval(COLLECT);
      check(browser, 'Brave default (Shields on, compatibility automatic): promotions shown', promos.length >= 4, promos.length + ' placed');
    }

    // ---- UI screenshots for visual review ----
    for (const [name, url, w, h] of [
      ['dashboard-overview', 'dashboard/dashboard.html#overview', 1360, 900],
      ['dashboard-creators', 'dashboard/dashboard.html#creators', 1360, 900],
      ['dashboard-campaigns', 'dashboard/dashboard.html#campaigns', 1360, 900],
      ['dashboard-editor', 'dashboard/dashboard.html#campaigns/new', 1360, 1000],
      ['dashboard-rotation', 'dashboard/dashboard.html#rotation', 1360, 1000],
      ['dashboard-analytics', 'dashboard/dashboard.html#analytics', 1360, 900],
      ['dashboard-settings', 'dashboard/dashboard.html#settings', 1360, 1000],
      ['onboarding', 'onboarding/welcome.html', 1280, 820],
      ['popup', 'popup/popup.html', 360, 600],
    ]) {
      if (browser !== targets[0]) break;
      const shot = await openPage(b);
      await shot.setViewport(w, h);
      await shot.goto(`chrome-extension://${id}/${url}`);
      await sleep(1200);
      await shot.screenshot(path.join(SHOTS, name + '.png'));
      await b.send('Target.closeTarget', { targetId: shot.targetId }).catch(() => {});
    }
  } catch (e) {
    check(browser, 'Run completed without errors', false, e.message);
  } finally {
    await b.close();
  }
}

server.close();
const failed = results.filter((r) => !r.ok);
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' checks passed across ' + targets.join(', '));
const { writeFileSync } = await import('node:fs');
writeFileSync(path.join(SHOTS, 'e2e-results.json'), JSON.stringify(results, null, 2));
process.exit(failed.length ? 1 : 0);
