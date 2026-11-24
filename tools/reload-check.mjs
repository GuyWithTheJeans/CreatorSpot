// Checks whether an unpacked CreatorSpot can reload itself after new files land in its folder, and that its
// data survives. Verifies through Chrome's own extensions page (chrome://extensions), waiting long enough
// for the extension to come back. Usage: node tools/reload-check.mjs [brave|chrome|edge]
import path from 'node:path';
import { cpSync, rmSync, readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { launch, openPage, BROWSERS } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const browser = process.argv[2] || 'brave';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name, ok, detail) => {
  if (!ok) failed++;
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' — ' + detail : ''));
};

const dir = path.join(mkdtempSync(path.join(tmpdir(), 'cs-reload-')), 'CreatorSpot');
cpSync(path.join(ROOT, 'extension'), dir, { recursive: true });
const manifestPath = path.join(dir, 'manifest.json');
const setVersion = (v) => {
  const m = JSON.parse(readFileSync(manifestPath, 'utf8'));
  m.version = v;
  writeFileSync(manifestPath, JSON.stringify(m, null, 2));
};
setVersion('0.0.1');

console.log('=== ' + browser.toUpperCase() + ' ===');
const b = await launch(BROWSERS[browser]);
try {
  const { id } = await b.send('Extensions.loadUnpacked', { path: dir });
  await sleep(2500);
  const mgr = await openPage(b, browser === 'brave' ? 'brave://extensions' : browser === 'edge' ? 'edge://extensions' : 'chrome://extensions');
  const listed = async () => mgr.eval(`chrome.developerPrivate.getExtensionsInfo().then((l) => l.filter((x) => x.id === '${id}').map((x) => x.version + ' ' + x.state + ' ' + JSON.stringify(x.disableReasons) + ' ' + x.location + ' ' + JSON.stringify((x.manifestErrors||[]).map(e=>e.message))))`);
  await mgr.eval(`chrome.developerPrivate.updateProfileConfiguration({ inDeveloperMode: true })`); // real users have this on: it is required to install
  check('Installed', (await listed()).length === 1, JSON.stringify(await listed()));

  let ext = await openPage(b, `chrome-extension://${id}/popup/popup.html`);
  await ext.eval(`chrome.storage.local.set({ reloadProbe: 'kept' })`);

  setVersion('9.9.9'); // what the updater does: new files land in the same folder
  await ext.eval(`setTimeout(() => chrome.runtime.reload(), 50); true`).catch(() => null);
  let after = [];
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    after = await listed().catch(() => []);
    if (after.length && after[0].startsWith('9.9.9')) break;
  }
  check('Still installed after reloading itself (checked in the extensions list)', after.length === 1, JSON.stringify(after));
  check('Running the new version', after.length === 1 && after[0].startsWith('9.9.9'), JSON.stringify(after));
  ext = await openPage(b, `chrome-extension://${id}/popup/popup.html`);
  const probe = await ext.eval(`chrome.storage.local.get('reloadProbe').then((d) => d.reloadProbe)`).catch((e) => 'error: ' + e.message);
  check('Data (sign-in, settings) survived', probe === 'kept', String(probe));
} catch (e) {
  check('Run completed', false, e.message);
} finally {
  await b.close();
  rmSync(path.dirname(dir), { recursive: true, force: true });
}
console.log(failed ? failed + ' failed' : 'Self-reload works');
process.exit(failed ? 1 : 0);
