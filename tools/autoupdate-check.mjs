// End-to-end check of one-click updates, the way a real user has CreatorSpot installed:
// an "old" CreatorSpot folder (with the updater helper registered) is loaded in the browser with Developer mode on,
// "Update now" is pressed in the popup, and the check confirms the new version is running with data kept.
// Uses a local update ZIP (CS_UPDATE_ZIP) so nothing is downloaded and GitHub is untouched.
// Afterwards the updater helper is re-registered for the real Desktop install, if there is one.
// Usage: node tools/autoupdate-check.mjs [chrome|brave|edge]
import path from 'node:path';
import os from 'node:os';
import { cpSync, rmSync, readFileSync, writeFileSync, mkdtempSync, existsSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launch, openPage, BROWSERS } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const browser = process.argv[2] || 'chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const EXPECTED_ID = 'phchmcdididanfibnlljclfkppdjfagh';
let failed = 0;
const check = (name, ok, detail) => {
  if (!ok) failed++;
  console.log('  ' + (ok ? 'PASS' : 'FAIL') + ' ' + name + (detail ? ' — ' + detail : ''));
};
const ps = (file, args) => execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', file, ...args], { encoding: 'utf8' });
const setVersion = (dir, v) => {
  const p = path.join(dir, 'manifest.json');
  const m = JSON.parse(readFileSync(p, 'utf8'));
  m.version = v;
  writeFileSync(p, JSON.stringify(m, null, 2));
};

const work = mkdtempSync(path.join(os.tmpdir(), 'cs-autoupd-'));
// The installed (old) copy: extension + helper files, like the Desktop folder.
const installed = path.join(work, 'Desktop', 'CreatorSpot');
cpSync(path.join(ROOT, 'extension'), installed, { recursive: true });
cpSync(path.join(ROOT, 'tools', 'easy-install'), installed, { recursive: true });
setVersion(installed, '0.0.1');
// The update ZIP (new version), built the same way the real download is.
const stage = path.join(work, 'stage', 'CreatorSpot');
cpSync(installed, stage, { recursive: true });
setVersion(stage, '9.9.9');
mkdirSync(path.join(work, 'zip'), { recursive: true });
const zip = path.join(work, 'zip', 'CreatorSpot-for-Chrome.zip');
execFileSync('powershell.exe', ['-NoProfile', '-Command', `Compress-Archive -Path '${path.dirname(stage)}\\*' -DestinationPath '${zip}'`]);

console.log('=== ' + browser.toUpperCase() + ' ===');
// Remember where the updater points now (the user's real install), and put it back afterwards.
const KEYS = ['Google\\Chrome', 'BraveSoftware\\Brave-Browser', 'Microsoft\\Edge', 'Chromium'];
const saved = {};
for (const k of KEYS) {
  try {
    saved[k] = execFileSync('powershell.exe', ['-NoProfile', '-Command', `(Get-Item 'HKCU:\\Software\\${k}\\NativeMessagingHosts\\com.creatorspot.updater' -ErrorAction Stop).GetValue('')`], { encoding: 'utf8' }).trim();
  } catch (e) {
    saved[k] = '';
  }
}
const restore = () => {
  for (const k of KEYS) {
    const key = `HKCU:\\Software\\${k}\\NativeMessagingHosts\\com.creatorspot.updater`;
    const cmd = saved[k] ? `New-Item -Path '${key}' -Value '${saved[k]}' -Force | Out-Null` : `Remove-Item -Path '${key}' -Force -ErrorAction SilentlyContinue`;
    try { execFileSync('powershell.exe', ['-NoProfile', '-Command', cmd]); } catch (e) { /* keep going */ }
  }
};
process.on('exit', restore);
ps(path.join(installed, 'register-updater.ps1'), ['-Folder', installed]);
process.env.CS_UPDATE_ZIP = zip; // the browser (and so the updater helper) inherits this
const b = await launch(BROWSERS[browser]);
try {
  const mgr = await openPage(b, browser === 'brave' ? 'brave://extensions' : browser === 'edge' ? 'edge://extensions' : 'chrome://extensions');
  await mgr.eval(`chrome.developerPrivate.updateProfileConfiguration({ inDeveloperMode: true })`);
  const { id } = await b.send('Extensions.loadUnpacked', { path: installed });
  check('CreatorSpot has its permanent ID', id === EXPECTED_ID, id);
  await sleep(2000);
  const listed = () => mgr.eval(`chrome.developerPrivate.getExtensionsInfo().then((l) => l.filter((x) => x.id === '${id}').map((x) => x.version + ' ' + x.state))`);

  const waitFor = async (version) => {
    let after = [];
    for (let i = 0; i < 30; i++) {
      after = await listed().catch(() => []);
      if (after[0] === version + ' ENABLED') break;
      await sleep(500);
    }
    return after;
  };
  // 1) Automatic: GitHub says a newer version exists, so CreatorSpot updates itself with no clicks.
  let popup = await openPage(b, `chrome-extension://${id}/popup/popup.html`);
  await popup.eval(`chrome.storage.local.set({ reloadProbe: 'kept' })`).catch(() => null);
  let after = await waitFor('9.9.9');
  check('Updated itself automatically, no clicks', after[0] === '9.9.9 ENABLED', JSON.stringify(after));
  popup = await openPage(b, `chrome-extension://${id}/popup/popup.html`);
  check('Settings and sign-in kept', (await popup.eval(`chrome.storage.local.get('reloadProbe').then((d) => d.reloadProbe)`).catch(() => null)) === 'kept');
  check('Files in the folder were updated', JSON.parse(readFileSync(path.join(installed, 'manifest.json'), 'utf8')).version === '9.9.9');

  // 2) The "Update now" button, with an even newer version waiting.
  setVersion(stage, '9.9.10');
  rmSync(zip);
  execFileSync('powershell.exe', ['-NoProfile', '-Command', `Compress-Archive -Path '${path.join(path.dirname(stage), '*')}' -DestinationPath '${zip}'`]);
  const ping = await popup.eval(`chrome.runtime.sendNativeMessage('com.creatorspot.updater', { cmd: 'ping' })`).catch((e) => ({ error: e.message }));
  check('Updater helper answers', ping && ping.ok && ping.version === '9.9.9', JSON.stringify(ping));
  const r = await popup.eval(`chrome.runtime.sendMessage({ type: 'update-now' })`).catch((e) => ({ error: e.message }));
  check('"Update now" installs the newest version', r && r.ok && r.updated && r.version === '9.9.10', JSON.stringify(r));
  after = await waitFor('9.9.10');
  check('Restarted on it', after[0] === '9.9.10 ENABLED', JSON.stringify(after));
} catch (e) {
  check('Run completed', false, e.message);
} finally {
  await b.close();
  delete process.env.CS_UPDATE_ZIP;
  restore();
  rmSync(work, { recursive: true, force: true });
}
console.log(failed ? failed + ' failed' : 'One-click update works');
process.exit(failed ? 1 : 0);
