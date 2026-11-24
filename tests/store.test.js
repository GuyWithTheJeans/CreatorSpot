const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers');

test('fresh install seeds the demo creators as ordinary, editable data', async () => {
  const { CS, mem } = load();
  assert.equal(await CS.store.init(), true);
  const { creators, campaigns, settings } = await CS.store.getAll();
  assert.deepEqual(creators.map((c) => c.name), ['GuyWithTheJeans', 'iamDoughnutDude']);
  assert.equal(creators[0].platforms[0].url, 'https://www.twitch.tv/guywiththejeans');
  assert.equal(creators[1].platforms[0].url, 'https://www.twitch.tv/iamdoughnutdude');
  assert.equal(campaigns.length, 4);
  assert.equal(settings.mode, 'network');
  assert.equal(await CS.store.init(), false, 'second init does not overwrite');
  assert.ok(mem.settings);
});

test('new creators are added through settings and rotate alongside the featured creators', async () => {
  const { CS } = load();
  await CS.store.init();
  const mine = { id: 'cr_me', name: 'NewStreamer', platforms: [{ type: 'twitch', url: 'twitch.tv/newstreamer' }], isOwn: true };
  const camp = { id: 'cp_me', creatorId: 'cr_me', headline: 'Watch me!', format: 'gaming' };
  await CS.store.saveProfiles([mine], [camp]); // tries to drop the featured creators
  const { creators, campaigns } = await CS.store.getAll();
  const me = creators.find((c) => c.id === 'cr_me');
  assert.equal(me.platforms[0].url, 'https://twitch.tv/newstreamer');
  assert.equal(me.platforms[0].handle, 'newstreamer');
  assert.deepEqual(creators.filter((c) => c.featured).map((c) => c.name).sort(), ['GuyWithTheJeans', 'iamDoughnutDude']);
  let state = CS.rotation.emptyState();
  const seen = new Set();
  for (let i = 0; i < 6; i++) {
    const r = CS.rotation.pick({ settings: CS.defaultSettings(), creators, campaigns, state, now: Date.now() + i });
    state = r.state;
    seen.add(r.decision.creatorId);
  }
  assert.equal(seen.size, 3, 'all three rotate');
});

test('featured creators cannot be removed, excluded or switched off', async () => {
  const { CS } = load();
  await CS.store.init();
  await CS.store.saveProfiles([], []);
  let { creators, campaigns } = await CS.store.getAll();
  assert.equal(creators.length, 2, 'restored after removal');
  assert.equal(campaigns.length, 4, 'built-in campaigns restored');
  await CS.store.saveProfiles(creators.map((c) => Object.assign({}, c, { participates: false })), campaigns.map((c) => Object.assign({}, c, { enabled: false })));
  ({ creators, campaigns } = await CS.store.getAll());
  assert.ok(creators.every((c) => c.participates), 'always participate');
  assert.ok(campaigns.every((c) => c.enabled), 'built-in campaigns stay on');
  for (const mode of ['self', 'network', 'circle', 'mixed']) {
    const s = Object.assign(CS.defaultSettings(), { mode, excluded: creators.map((c) => c.id) });
    const pool = CS.rotation.effectivePool(s, creators, campaigns, Date.now()).pool.map((p) => p.creator.name).sort();
    assert.deepEqual(pool, ['GuyWithTheJeans', 'iamDoughnutDude'], 'present in ' + mode + ' mode');
  }
  // An imported file cannot mark its own creators as featured.
  assert.equal(CS.schema.creator({ id: 'x1', name: 'Impostor', featured: true }).featured, false);
});

test('campaigns pointing at removed creators are dropped', async () => {
  const { CS } = load();
  await CS.store.init();
  const { creators, campaigns } = await CS.store.getAll();
  const extra = { id: 'cr_x', name: 'Extra', platforms: [{ type: 'kick', url: 'https://kick.com/extra' }] };
  await CS.store.saveProfiles(creators.concat(extra), campaigns.concat({ id: 'cp_x', creatorId: 'cr_x', headline: 'Hi' }));
  await CS.store.saveProfiles(creators, (await CS.store.getAll()).campaigns);
  const after = await CS.store.getAll();
  assert.ok(!after.campaigns.some((c) => c.creatorId === 'cr_x'));
});

test('unsafe links are rejected', async () => {
  const { CS } = load();
  assert.equal(CS.safeUrl('javascript:alert(1)'), null);
  assert.equal(CS.safeUrl('data:text/html,hi'), null);
  assert.equal(CS.safeUrl('ftp://example.com'), null);
  assert.equal(CS.safeUrl('localhost'), null);
  assert.equal(CS.schema.creator({ name: 'X', platforms: [{ type: 'twitch', url: 'javascript:alert(1)' }] }).platforms.length, 0);
});

test('settings are validated and clamped', async () => {
  const { CS } = load();
  const s = CS.schema.settings({ mode: 'evil', replaceRate: 500, maxPerPage: -3, theme: 'neon', disabledSites: ['Example.com', 'bad host!'], showLabel: false });
  assert.equal(s.mode, 'network');
  assert.equal(s.replaceRate, 100);
  assert.equal(s.maxPerPage, 1);
  assert.equal(s.theme, 'system');
  assert.deepEqual(s.disabledSites, ['example.com']);
  assert.equal(s.showLabel, true, 'disclosure label cannot be turned off');
});

test('settings persist across reloads', async () => {
  const { CS } = load();
  await CS.store.init();
  await CS.store.saveSettings({ mode: 'mixed', mixedOwnShare: 40, disabledSites: ['news.example'] });
  const again = await CS.store.getAll();
  assert.equal(again.settings.mode, 'mixed');
  assert.equal(again.settings.mixedOwnShare, 40);
  assert.deepEqual(again.settings.disabledSites, ['news.example']);
});

test('analytics count displays and clicks per campaign per day, without hosts', async () => {
  const { CS, mem } = load();
  await CS.store.init();
  await Promise.all([CS.store.record('impression', 'k1', 'a'), CS.store.record('impression', 'k1', 'a'), CS.store.record('click', 'k1', 'a')]);
  const day = CS.dayKey();
  assert.deepEqual(mem.stats[day].k1, { i: 2, c: 1, cr: 'a' });
  assert.ok(!JSON.stringify(mem.stats).includes('http'));
});

test('media upload validation and garbage collection', async () => {
  const { CS, mem } = load();
  await CS.store.init();
  await assert.rejects(CS.store.putMedia('data:text/html;base64,AAAA'));
  const id = await CS.store.putMedia('data:image/png;base64,iVBORw0KGgo=');
  assert.ok(mem['media:' + id]);
  const { creators, campaigns } = await CS.store.getAll();
  creators[0].avatar = id;
  await CS.store.saveProfiles(creators, campaigns);
  assert.ok(mem['media:' + id], 'referenced media is kept');
  creators[0].avatar = null;
  await CS.store.saveProfiles(creators, campaigns);
  assert.equal(mem['media:' + id], undefined, 'unreferenced media is removed');
});

test('export never includes credentials; import round-trips', async () => {
  const { CS } = load();
  await CS.store.init();
  await CS.store.saveSettings({ integrations: { twitch: { clientId: 'abc', token: 'secret' } } });
  const backup = await CS.store.exportConfig();
  assert.ok(!JSON.stringify(backup).includes('secret'));
  const fresh = load().CS;
  await fresh.store.init();
  await fresh.store.saveProfiles([], []);
  await fresh.store.importConfig(JSON.parse(JSON.stringify(backup)));
  assert.equal((await fresh.store.getAll()).creators.length, 2);
  await assert.rejects(fresh.store.importConfig({ app: 'Other' }));
});

test('platform detection from pasted links', () => {
  const { CS } = load();
  const d = (u) => CS.platforms.detect(u);
  assert.deepEqual([d('https://www.twitch.tv/guywiththejeans').type, d('https://www.twitch.tv/guywiththejeans').handle], ['twitch', 'guywiththejeans']);
  assert.equal(d('youtube.com/@SomeCreator').type, 'youtube');
  assert.equal(d('https://www.tiktok.com/@clips.daily').type, 'tiktok');
  assert.equal(d('https://kick.com/streamer').type, 'kick');
  assert.equal(d('https://discord.gg/abc123').type, 'discord');
  assert.equal(d('https://my-site.example/about').type, 'website');
  assert.equal(d('not a link'), null);
});

test('payload uses the campaign destination and never claims LIVE without verification', async () => {
  const { CS } = load();
  const creators = CS.defaultCreators();
  const p = await CS.buildPayload(creators[0], CS.defaultCampaigns()[0], CS.defaultSettings(), async () => null, null);
  assert.equal(p.platform.url, 'https://www.twitch.tv/guywiththejeans');
  assert.equal(p.live, null);
  const unverified = await CS.buildPayload(creators[0], CS.defaultCampaigns()[0], CS.defaultSettings(), async () => null, { live: false });
  assert.equal(unverified.live, null);
});
