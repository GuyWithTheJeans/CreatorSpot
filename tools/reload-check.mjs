// Checks that an extension installed with "Load unpacked" (not through the test API) can reload itself
// after new files are copied into its folder, and that its data survives. This is what "Update CreatorSpot"
// relies on. Usage: node tools/reload-check.mjs [brave|chrome|edge]
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

console.log('=== ' + browser.toUpperCase() + ' (Load unpacked via --load-extension) ===');
const b = await launch(BROWSERS[browser], { extraArgs: ['--load-extension=' + dir, '--disable-extensions-except=' + dir] });
try {
  await sleep(3000);
  const { targetInfos } = await b.send('Target.getTargets');
  const sw = targetInfos.find((t) => /^chrome-extension:\/\/[a-p]{32}\//.test(t.url) && t.type === 'service_worker');
  check('Extension loads like a normal unpacked install', !!sw, sw ? sw.url : JSON.stringify(targetInfos.map((t) => t.type + ' ' + t.url)));
  if (!sw) throw new Error('stop');
  const id = sw.url.split('/')[2];
  let ext = await openPage(b, `chrome-extension://${id}/dashboard/dashboard.html`);
  await ext.eval(`chrome.storage.local.set({ reloadProbe: 'kept' })`);
  check('Running version before update', (await ext.eval('chrome.runtime.getManifest().version')) === '0.0.1');

  setVersion('9.9.9'); // what "Update CreatorSpot" does: new files land in the same folder
  await ext.eval(`setTimeout(() => chrome.runtime.reload(), 50); true`).catch(() => null);
  await sleep(4000);
  const after = (await b.send('Target.getTargets')).targetInfos.filter((t) => t.url.startsWith(`chrome-extension://${id}/`));
  check('Extension is still installed after reloading itself', after.some((t) => t.type === 'service_worker'), after.map((t) => t.type).join(', '));
  ext = await openPage(b, `chrome-extension://${id}/dashboard/dashboard.html`);
  check('New version is running', (await ext.eval('chrome.runtime.getManifest().version')) === '9.9.9');
  check('Data survived the reload', (await ext.eval(`chrome.storage.local.get('reloadProbe').then((d) => d.reloadProbe)`)) === 'kept');
} catch (e) {
  if (e.message !== 'stop') check('Run completed', false, e.message);
} finally {
  await b.close();
  rmSync(path.dirname(dir), { recursive: true, force: true });
}
console.log(failed ? failed + ' failed' : 'Self-reload works');
process.exit(failed ? 1 : 0);
