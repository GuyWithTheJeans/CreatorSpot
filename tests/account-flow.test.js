// Runs the real background code against a fake Supabase + Twitch, walking through what a creator does:
// sign in with Twitch, edit the profile and a campaign (with an uploaded picture), save, and confirm what
// the server receives and that another install picks it up.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { load } = require('./helpers');

const UID = '22222222-2222-2222-2222-222222222222';
const TWITCH_PIC = 'https://static-cdn.jtvnw.net/jtv_user_pictures/dough.png';

function fakeServer(CS) {
  const db = { profile: null, uploads: {}, requests: [] };
  const png = Buffer.from('89504e470d0a1a0a', 'hex');
  const json = (status, body, headers) => ({
    ok: status < 300,
    status,
    headers: { get: (k) => (headers || {})[k.toLowerCase()] || (k.toLowerCase() === 'content-type' ? 'application/json' : null) },
    text: async () => (body === undefined ? '' : JSON.stringify(body)),
    json: async () => body,
    arrayBuffer: async () => new ArrayBuffer(0),
  });
  globalThis.fetch = async (url, opts = {}) => {
    const u = new URL(url);
    const method = opts.method || 'GET';
    db.requests.push(method + ' ' + u.pathname);
    if (u.hostname === 'static-cdn.jtvnw.net' || u.pathname.startsWith('/storage/v1/object/public/')) {
      return { ok: true, status: 200, headers: { get: () => 'image/png' }, arrayBuffer: async () => png.buffer.slice(png.byteOffset, png.byteOffset + png.length) };
    }
    if (u.pathname === '/rest/v1/rpc/ensure_my_profile') {
      assert.match(opts.headers.Authorization, /^Bearer tok/);
      db.profile = db.profile || { id: UID, twitch_login: 'iamdoughnutdude', name: 'iamDoughnutDude', featured: true, bio: '', accent: '#7C5CFF', category: 'Gaming', avatar_url: TWITCH_PIC, platforms: [{ type: 'twitch', url: 'https://www.twitch.tv/iamdoughnutdude' }], campaigns: [], hidden: false, updated_at: 't0' };
      return json(200, db.profile);
    }
    if (u.pathname === '/rest/v1/profiles' && method === 'PATCH') {
      assert.strictEqual(u.searchParams.get('id'), 'eq.' + UID);
      assert.match(opts.headers.Authorization, /^Bearer tok/);
      const body = JSON.parse(opts.body);
      const allowed = ['name', 'bio', 'accent', 'category', 'platforms', 'campaigns', 'avatar_url'];
      Object.keys(body).forEach((k) => assert.ok(allowed.includes(k), 'column not allowed: ' + k));
      if (body.avatar_url != null) assert.ok(CS.cloud.mediaOk(body.avatar_url), 'avatar must pass the database rule: ' + body.avatar_url);
      Object.assign(db.profile, body, { updated_at: 't' + db.requests.length });
      return json(204);
    }
    if (u.pathname === '/rest/v1/profiles' && method === 'GET') {
      const rows = db.profile ? [db.profile] : [];
      if (u.searchParams.get('select') === 'updated_at') return json(200, rows.map((r) => ({ updated_at: r.updated_at })), { 'content-range': '0-0/' + rows.length });
      return json(200, rows);
    }
    if (u.pathname.startsWith('/storage/v1/object/media/') && method === 'POST') {
      assert.ok(u.pathname.startsWith('/storage/v1/object/media/' + UID + '/'), 'uploads go in your own folder');
      db.uploads[u.pathname] = opts.headers['Content-Type'];
      return json(200, { Key: u.pathname });
    }
    if (u.hostname === 'raw.githubusercontent.com') return json(200, { version: '0.0.1' });
    return json(404, { message: 'not found ' + u.pathname });
  };
  return db;
}

function bootBackground() {
  const { CS, mem } = load();
  const listeners = {};
  const ev = (name) => ({ addListener: (fn) => (listeners[name] = fn) });
  Object.assign(CS.api, {
    runtime: { id: 'ext', onInstalled: ev('installed'), onStartup: ev('startup'), onMessage: ev('message'), getURL: (p) => 'chrome-extension://ext/' + (p || ''), getManifest: () => ({ version: '0.2.1' }) },
    action: { setBadgeBackgroundColor: async () => {}, setBadgeText: async () => {} },
    declarativeNetRequest: { updateEnabledRulesets: async () => {} },
    alarms: { get: async () => null, create: () => {}, onAlarm: ev('alarm') },
    tabs: { create: () => {} },
    identity: {
      getRedirectURL: () => 'https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/',
      launchWebAuthFlow: async ({ url }) => {
        assert.match(url, /\/auth\/v1\/authorize\?provider=twitch&redirect_to=https%3A%2F%2Fabcdefghijklmnopabcdefghijklmnop\.chromiumapp\.org%2F$/);
        return 'https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/#access_token=tok1&refresh_token=r1&expires_in=3600&token_type=bearer';
      },
    },
  });
  CS.api.storage.onChanged = ev('changed');
  globalThis.self = globalThis;
  const bg = path.join(__dirname, '..', 'extension', 'background.js');
  delete require.cache[require.resolve(bg)];
  require(bg);
  const send = (msg) =>
    new Promise((resolve) => {
      const r = listeners.message(msg, { id: 'ext', url: 'chrome-extension://ext/dashboard/dashboard.html' }, resolve);
      if (r !== true) resolve(undefined);
    });
  return { CS, mem, send, listeners };
}

test('a creator signs in, edits everything, saves, and the server gets it', async () => {
  const { CS, send } = bootBackground();
  const db = fakeServer(CS);
  const signed = await send({ type: 'sign-in' });
  assert.strictEqual(signed.ok, true, JSON.stringify(signed));
  assert.strictEqual(signed.account.localId, 'demo_iamdoughnutdude');
  // First sign-in of a featured creator puts his built-in promos online.
  assert.strictEqual(db.profile.campaigns.length, 2);

  let all = await CS.store.getAll();
  const me = all.creators.find((c) => c.id === 'demo_iamdoughnutdude');
  assert.strictEqual(me.isOwn, true, 'marked as yours');
  assert.ok(me.cloudId, 'linked to the online profile');
  assert.ok(me.avatar, 'Twitch picture downloaded');

  // Edit exactly like the dashboard does: change text, add a link, upload a campaign picture.
  const imageId = await CS.store.putMedia('data:image/png;base64,iVBORw0KGgo=');
  const edited = Object.assign({}, me, { bio: 'Doughnut was here', accent: '#123456', platforms: me.platforms.concat({ type: 'youtube', url: 'https://www.youtube.com/@doughnut', handle: '@doughnut' }) });
  const campaigns = all.campaigns.map((c) => (c.id === 'demo_c_idd_stream' ? Object.assign({}, c, { headline: 'New headline!', media: { imageId } }) : c));
  const saved = await send({ type: 'cloud-save', creator: edited, campaigns });
  assert.strictEqual(saved.ok, true, JSON.stringify(saved));

  assert.strictEqual(db.profile.bio, 'Doughnut was here');
  assert.strictEqual(db.profile.accent, '#123456');
  assert.strictEqual(db.profile.platforms.length, 2);
  assert.strictEqual(db.profile.avatar_url, TWITCH_PIC, 'Twitch picture kept');
  const camp = db.profile.campaigns.find((c) => c.id === 'demo_c_idd_stream');
  assert.strictEqual(camp.headline, 'New headline!');
  assert.ok(camp.image && camp.image.startsWith(CS.cloud.MEDIA_PREFIX + UID + '/'), 'picture uploaded and linked');
  assert.strictEqual(Object.keys(db.uploads).length, 1);

  // This install now shows the saved version.
  all = await CS.store.getAll();
  assert.strictEqual(all.creators.find((c) => c.id === 'demo_iamdoughnutdude').bio, 'Doughnut was here');
  assert.strictEqual(all.campaigns.find((c) => c.id === 'demo_c_idd_stream').headline, 'New headline!');

  // Saving again does not upload the same picture twice.
  await send({ type: 'cloud-save', creator: edited, campaigns });
  assert.strictEqual(Object.keys(db.uploads).length, 1);
});

test("another install (the brother's) picks up the change on its next check", async () => {
  // Install A: Doughnut saves.
  const a = bootBackground();
  const db = fakeServer(a.CS);
  await a.send({ type: 'sign-in' });
  const allA = await a.CS.store.getAll();
  const meA = allA.creators.find((c) => c.id === 'demo_iamdoughnutdude');

  // Install B: someone else, not signed in, already synced once.
  const b = bootBackground();
  const shared = db.profile;
  // Point B's fake server at the same profile row.
  const dbB = fakeServer(b.CS);
  dbB.profile = shared;
  await b.send({ type: 'sync-now' });
  assert.strictEqual((await b.CS.store.getAll()).creators.find((c) => c.id === 'demo_iamdoughnutdude').bio, meA.bio);

  // Doughnut changes his bio (simulated directly on the shared row), B opens its dashboard ("sync-soon").
  shared.bio = 'Changed on another computer';
  shared.updated_at = 'later';
  const r = await b.send({ type: 'sync-soon' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual((await b.CS.store.getAll()).creators.find((c) => c.id === 'demo_iamdoughnutdude').bio, 'Changed on another computer');

  // Nothing changed: the quick check skips the full download.
  const before = dbB.requests.length;
  await b.send({ type: 'sync-soon' });
  const after = dbB.requests.slice(before);
  assert.deepStrictEqual(after, ['GET /rest/v1/profiles'], 'only the tiny fingerprint request');
});
