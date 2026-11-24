// Verifies self-update: load a copy of the extension, write a newer version into the same folder,
// and confirm the browser picks it up on its own (no clicks), with settings kept.
// Usage: node tools/update-check.mjs [browser]
import path from 'node:path';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { launch, openPage, BROWSERS } from './cdp.mjs';

const browser = process.argv[2] || 'brave';
const dir = mkdtempSync(path.join(tmpdir(), 'cs-update-'));
cpSync(path.resolve('extension'), dir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await launch(BROWSERS[browser]);
let ok = true;
try {
  const { id } = await b.send('Extensions.loadUnpacked', { path: dir });
  await sleep(1500);
  let ext = await openPage(b, `chrome-extension://${id}/popup/popup.html`);
  const v1 = await ext.eval('chrome.runtime.getManifest().version');
  await ext.eval(`CreatorSpot.store.saveSettings({ mode: 'mixed' })`);
  console.log('Installed version:', v1);

  const mf = path.join(dir, 'manifest.json');
  const next = JSON.parse(readFileSync(mf, 'utf8'));
  next.version = '9.9.9';
  writeFileSync(mf, JSON.stringify(next, null, 2));
  console.log('Copied a newer version (9.9.9) into the folder; waiting for the extension to notice…');

  let v2 = v1;
  for (let i = 0; i < 24 && v2 === v1; i++) {
    await sleep(5000);
    try {
      ext = await openPage(b, `chrome-extension://${id}/popup/popup.html`);
      v2 = await ext.eval('chrome.runtime.getManifest().version');
    } catch (e) {
      /* extension reloading */
    }
  }
  console.log('Version after waiting:', v2);
  await sleep(2000);
  ext = await openPage(b, `chrome-extension://${id}/popup/popup.html`);
  await ext.waitFor('typeof CreatorSpot !== "undefined" && !!CreatorSpot.store', 10000);
  v2 = await ext.eval('chrome.runtime.getManifest().version');
  const mode = await ext.eval(`CreatorSpot.store.getAll().then((d) => d.settings.mode)`);
  console.log('Running version now:', v2, '| settings kept:', mode === 'mixed');
  ok = v2 === '9.9.9' && mode === 'mixed';
  console.log(ok ? 'PASS self-update' : 'FAIL self-update');
} finally {
  await b.close();
  rmSync(dir, { recursive: true, force: true });
}
process.exit(ok ? 0 : 1);
