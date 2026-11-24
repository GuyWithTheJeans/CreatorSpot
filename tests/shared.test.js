// Shared profiles: the featured creators' profiles come from profiles/featured.json on GitHub.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { load } = require('./helpers');

const FILE = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'profiles', 'featured.json'), 'utf8'));

test('the shared profiles file in the repo is valid and has both featured creators', () => {
  const { CS } = load();
  const p = CS.shared.parse(FILE);
  assert.ok(p);
  assert.deepStrictEqual(p.creators.map((c) => c.id).sort(), CS.FEATURED_IDS.slice().sort());
  assert.strictEqual(p.campaigns.length, 4);
});

test('parse ignores non-featured creators, unsafe links and bad avatar paths', () => {
  const { CS } = load();
  const p = CS.shared.parse({
    creators: [
      { id: 'someone_else', name: 'Intruder', platforms: [{ type: 'twitch', url: 'https://twitch.tv/x' }] },
      { id: 'demo_iamdoughnutdude', name: 'Doughnut v2', avatar: '../../secret.png', platforms: [{ type: 'website', url: 'javascript:alert(1)' }, { type: 'twitch', url: 'https://www.twitch.tv/iamdoughnutdude' }], campaigns: [{ headline: 'Hi' }] },
    ],
  });
  assert.deepStrictEqual(p.creators.map((c) => c.name), ['Doughnut v2']);
  assert.strictEqual(p.creators[0].platforms.length, 1);
  assert.deepStrictEqual(p.avatars, {});
  assert.strictEqual(p.campaigns[0].creatorId, 'demo_iamdoughnutdude');
  assert.strictEqual(CS.shared.parse({ creators: [] }), null);
  assert.strictEqual(CS.shared.parse('nope'), null);
});

test('a shared update replaces the featured profile and campaigns on every install, and keeps local creators', async () => {
  const { CS } = load();
  await CS.store.init();
  const { creators, campaigns } = await CS.store.getAll();
  const mine = { id: 'cr_mine', name: 'Mine', platforms: [{ type: 'twitch', url: 'https://www.twitch.tv/mine' }] };
  await CS.store.saveProfiles(creators.concat(mine), campaigns.concat({ id: 'cp_mine', creatorId: 'cr_mine', headline: 'Mine' }));

  const edited = JSON.parse(JSON.stringify(FILE));
  const d = edited.creators.find((c) => c.id === 'demo_iamdoughnutdude');
  d.bio = 'New bio from GitHub';
  d.campaigns = [{ id: 'idd_new', headline: 'Brand new promo', message: 'Hello', format: 'spotlight' }];
  const p = CS.shared.parse(edited);
  assert.strictEqual(await CS.store.applyShared({ creators: p.creators, campaigns: p.campaigns, avatarIds: {} }), true);

  const after = await CS.store.getAll();
  assert.strictEqual(after.creators.find((c) => c.id === 'demo_iamdoughnutdude').bio, 'New bio from GitHub');
  assert.deepStrictEqual(after.campaigns.filter((c) => c.creatorId === 'demo_iamdoughnutdude').map((c) => c.id), ['idd_new']);
  assert.ok(after.creators.some((c) => c.id === 'cr_mine'));
  assert.ok(after.campaigns.some((c) => c.id === 'cp_mine'));

  // Local edits to a featured creator are overwritten by the shared version when profiles are saved.
  const tampered = after.creators.map((c) => (c.id === 'demo_iamdoughnutdude' ? Object.assign({}, c, { bio: 'local edit' }) : c));
  await CS.store.saveProfiles(tampered, after.campaigns);
  assert.strictEqual((await CS.store.getAll()).creators.find((c) => c.id === 'demo_iamdoughnutdude').bio, 'New bio from GitHub');
  // Applying the same file again changes nothing.
  assert.strictEqual(await CS.store.applyShared({ creators: p.creators, campaigns: p.campaigns, avatarIds: {} }), false);
});

test('version comparison for the update check', () => {
  const { CS } = load();
  assert.strictEqual(CS.shared.compareVersions('0.1.10', '0.1.9'), 1);
  assert.strictEqual(CS.shared.compareVersions('v0.2.0', '0.2.0'), 0);
  assert.strictEqual(CS.shared.compareVersions('0.1.2', '0.1.3'), -1);
});
