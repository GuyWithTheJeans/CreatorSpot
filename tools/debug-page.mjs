// Debug helper: load the extension, open one extension page, print console errors.
// Usage: node tools/debug-page.mjs <path-inside-extension> [browser]
import path from 'node:path';
import { launch, openPage, BROWSERS } from './cdp.mjs';

const target = process.argv[2] || 'dashboard/dashboard.html#settings';
const b = await launch(BROWSERS[process.argv[3] || 'chrome']);
const { id } = await b.send('Extensions.loadUnpacked', { path: path.resolve('extension') });
await new Promise((r) => setTimeout(r, 1200));
const page = await openPage(b);
const logs = [];
b.on((m) => {
  if (m.sessionId !== page.sessionId) return;
  if (m.method === 'Runtime.exceptionThrown') logs.push('EXCEPTION ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  if (m.method === 'Runtime.consoleAPICalled') logs.push(m.params.type + ' ' + m.params.args.map((a) => a.value ?? a.description).join(' '));
});
const nav = page.send('Page.navigate', { url: `chrome-extension://${id}/${target}` });
const t = await Promise.race([nav.then(() => 'navigated'), new Promise((r) => setTimeout(() => r('navigate timeout'), 8000))]);
console.log(t);
await new Promise((r) => setTimeout(r, 2000));
try {
  console.log('title:', await Promise.race([page.eval('document.title'), new Promise((_, j) => setTimeout(() => j(new Error('eval timeout')), 5000))]));
} catch (e) {
  console.log(e.message);
}
console.log(logs.join('\n') || 'no console output');
await b.close();
