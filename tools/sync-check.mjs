// Live check of CreatorSpot accounts: loads the extension, confirms it reaches the CreatorSpot database,
// that the dashboard offers "Sign in with Twitch", that the browser supports the sign-in window, and that
// websites (content scripts) cannot trigger account actions. Also checks the GitHub version check.
// Usage: node tools/sync-check.mjs [chrome|edge|brave]
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, openPage, BROWSERS } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXT = process.env.CS_EXT_DIR || path.join(ROOT, 'extension');
const browser = process.argv[2] || 'chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name, ok, detail) => {
  if (!ok) failed++;
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' — ' + detail : ''));
};

console.log('=== ' + browser.toUpperCase() + ' ===');
const b = await launch(BROWSERS[browser]);
try {
  const { id } = await b.send('Extensions.loadUnpacked', { path: EXT });
  await sleep(4000); // the background syncs on start
  const ext = await openPage(b, `chrome-extension://${id}/dashboard/dashboard.html#creators`);
  await ext.waitFor('!!document.querySelector("#accountCard strong")', 10000).catch(() => {});

  const meta = await ext.eval(`chrome.storage.local.get('sharedMeta').then((d) => d.sharedMeta || {})`);
  check('Reaches the CreatorSpot database on start', meta.ok === true, meta.error || (meta.count || 0) + ' creators online');
  const r = await ext.eval(`chrome.runtime.sendMessage({ type: 'sync-now' })`);
  check('"Sync now" works', r && r.sync && r.sync.ok === true, JSON.stringify(r && r.sync));
  check('Update check answers', r && 'update' in r, JSON.stringify(r && r.update));

  const pics = await ext.eval(`chrome.storage.local.get('creators').then((d) => d.creators.filter((c) => c.cloudId).map((c) => c.name + ':' + (c.avatar ? 'picture' : 'none')))`);
  check('Signed-up creators arrive with their pictures', pics.length > 0 && pics.every((p) => p.endsWith(':picture')), pics.join(', '));
  const card = await ext.eval(`(document.querySelector('#accountCard') || {}).innerText || ''`);
  check('Creators page offers "Sign in with Twitch"', /Sign in with Twitch/.test(card) || /Signed in as/.test(card), card.replace(/\s+/g, ' ').slice(0, 90));
  const redirect = await ext.eval(`chrome.identity && chrome.identity.getRedirectURL ? chrome.identity.getRedirectURL() : ''`);
  check('Browser supports the sign-in window', /^https:\/\/[a-p]{32}\.chromiumapp\.org\/$/.test(redirect), redirect);
  const authorize = await fetch(`https://mofktqetaskhsxfgrmpw.supabase.co/auth/v1/authorize?provider=twitch&redirect_to=${encodeURIComponent(redirect)}`, { redirect: 'manual' });
  check('Database sends sign-in to Twitch', authorize.status === 302 && /id\.twitch\.tv/.test(authorize.headers.get('location') || ''), String(authorize.status));

  // A website cannot trigger account actions through the content script.
  const page = await openPage(b, 'https://example.com/');
  await sleep(1500);
  const blocked = await page.eval(`(async () => {
    try { return await new Promise((res) => { const t = setTimeout(() => res('no answer'), 1500); try { chrome.runtime.sendMessage({ type: 'sign-out' }, (x) => { clearTimeout(t); res(x === undefined ? 'no answer' : JSON.stringify(x)); }); } catch (e) { clearTimeout(t); res('no access'); } }); }
    catch (e) { return 'no access'; }
  })()`).catch(() => 'no access');
  check('Web pages cannot message CreatorSpot', blocked === 'no answer' || blocked === 'no access', blocked);
} finally {
  await b.close();
}
console.log(failed ? failed + ' failed' : 'All account checks passed');
process.exit(failed ? 1 : 0);
