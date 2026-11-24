// Live check of the GitHub link: loads the extension, scrambles a featured profile locally, and confirms
// the copy on GitHub (profiles/featured.json) wins. Also checks the update check reads the version.
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

const remote = await (await fetch('https://raw.githubusercontent.com/GuyWithTheJeans/CreatorSpot/main/profiles/featured.json?t=' + Date.now())).json();
const remoteBio = remote.creators.find((c) => c.id === 'demo_iamdoughnutdude').bio;

const b = await launch(BROWSERS[browser]);
try {
  const { id } = await b.send('Extensions.loadUnpacked', { path: EXT });
  await sleep(4000); // the background downloads the shared file on start
  const ext = await openPage(b, `chrome-extension://${id}/dashboard/dashboard.html`);
  await ext.waitFor('!!document.querySelector(".kpis")', 8000);

  const meta = await ext.eval(`chrome.storage.local.get('sharedMeta').then((d) => d.sharedMeta || {})`);
  check('Downloads the shared profiles file from GitHub on start', meta.ok === true, meta.error || '');

  // Scramble Doughnut's bio and campaigns locally, the way an out-of-date copy would look.
  await ext.eval(`(async () => {
    const d = await chrome.storage.local.get(['creators', 'campaigns']);
    d.creators = d.creators.map((c) => c.id === 'demo_iamdoughnutdude' ? Object.assign({}, c, { bio: 'OUT OF DATE' }) : c);
    d.campaigns = d.campaigns.filter((c) => c.creatorId !== 'demo_iamdoughnutdude');
    await chrome.storage.local.set({ creators: d.creators, campaigns: d.campaigns });
    const m = (await chrome.storage.local.get('sharedMeta')).sharedMeta; m.text = ''; await chrome.storage.local.set({ sharedMeta: m });
  })()`);
  const r = await ext.eval(`chrome.runtime.sendMessage({ type: 'sync-now' })`);
  check('"Check now" reaches GitHub', r && r.sync && r.sync.ok === true, JSON.stringify(r && r.sync));
  const after = await ext.eval(`chrome.storage.local.get(['creators', 'campaigns'])`);
  const d = after.creators.find((c) => c.id === 'demo_iamdoughnutdude');
  check("Doughnut's profile matches GitHub again", d.bio === remoteBio, d.bio);
  const camps = after.campaigns.filter((c) => c.creatorId === 'demo_iamdoughnutdude').length;
  const want = remote.creators.find((c) => c.id === 'demo_iamdoughnutdude').campaigns.length;
  check("Doughnut's campaigns match GitHub again", camps === want, camps + ' of ' + want);
  check('Update check finds no newer version than this one', r && r.update === null, JSON.stringify(r && r.update));

  await ext.eval(`location.hash = '#creators'`);
  await ext.waitFor('!!document.querySelector("#syncNote strong")', 8000).catch(() => {});
  const ui = await ext.eval(`({ note: (document.querySelector('#syncNote') || {}).innerText || '', github: [...document.querySelectorAll('a')].filter((a) => a.textContent.includes('Edit on GitHub')).length })`);
  check('Creators page shows the shared-profiles note', /Shared profiles/.test(ui.note), ui.note.slice(0, 80));
  check('Featured creators have "Edit on GitHub" buttons', ui.github === 2, String(ui.github));
} finally {
  await b.close();
}
console.log(failed ? failed + ' failed' : 'All sync checks passed');
process.exit(failed ? 1 : 0);
