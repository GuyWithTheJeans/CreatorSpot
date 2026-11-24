// Debug helper: load the extension, open the test site, evaluate an expression in the page.
// Usage: node tools/inspect.mjs "<js expression>" [browser]
import http from 'node:http';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { launch, openPage, BROWSERS } from './cdp.mjs';

const server = http.createServer((req, res) => res.writeHead(200, { 'content-type': 'text/html' }).end(readFileSync(path.resolve('test-site/index.html'))));
await new Promise((r) => server.listen(8788, '127.0.0.1', r));
const b = await launch(BROWSERS[process.argv[3] || 'chrome']);
try {
  await b.send('Extensions.loadUnpacked', { path: path.resolve('extension') });
  await new Promise((r) => setTimeout(r, 1500));
  const page = await openPage(b);
  await page.setViewport(1280, 900);
  await page.goto('http://127.0.0.1:8788/');
  await new Promise((r) => setTimeout(r, 3500));
  console.log(JSON.stringify(await page.eval(process.argv[2]), null, 1));
} finally {
  await b.close();
  server.close();
}
