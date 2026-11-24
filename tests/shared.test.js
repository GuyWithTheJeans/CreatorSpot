// CreatorSpot accounts: profiles saved online by creators show up on every install.
const test = require('node:test');
const assert = require('node:assert');
const { load } = require('./helpers');

const UUID_GUY = '11111111-1111-1111-1111-111111111111';
const UUID_DOUGH = '22222222-2222-2222-2222-222222222222';
const UUID_NEW = '33333333-3333-3333-3333-333333333333';

function rows(CS) {
  return [
    { id: UUID_GUY, twitch_login: 'guywiththejeans', featured: true, name: 'GuyWithTheJeans', bio: 'Jeans', accent: '#3B82F6', category: 'Gaming', avatar_url: 'https://static-cdn.jtvnw.net/jtv_user_pictures/guy.png', platforms: [{ type: 'twitch', url: 'https://www.twitch.tv/guywiththejeans' }], campaigns: [] },
    {
      id: UUID_DOUGH, twitch_login: 'iamdoughnutdude', featured: true, name: 'iamDoughnutDude', bio: 'Updated by Doughnut', accent: '#F472B6', category: 'Gaming', avatar_url: null,
      platforms: [{ type: 'twitch', url: 'https://www.twitch.tv/iamdoughnutdude' }, { type: 'youtube', url: 'https://www.youtube.com/@doughnut' }],
      campaigns: [{ id: 'cp_new1', name: 'Saturday', headline: 'Saturday stream!', message: 'Be there', format: 'gaming', platformIndex: 1, priority: 4, enabled: true, image: CS.cloud.MEDIA_PREFIX + UUID_DOUGH + '/x.png' }],
    },
    { id: UUID_NEW, twitch_login: 'newstreamer', featured: false, name: 'New Streamer', bio: 'Hi', accent: '#00AA00', category: 'Art', avatar_url: 'https://evil.example/tracker.png', platforms: [{ type: 'twitch', url: 'https://www.twitch.tv/newstreamer' }, { type: 'website', url: 'javascript:alert(1)' }], campaigns: [] },
  ];
}

test('online rows become local creators: featured keep their IDs, new creators join the network', () => {
  const { CS } = load();
  const out = CS.cloud.toLocal(rows(CS));
  assert.deepStrictEqual(out.creators.map((c) => c.id), ['demo_guywiththejeans', 'demo_iamdoughnutdude', 'net_' + UUID_NEW.replace(/-/g, '')]);
  // Guy has no online campaigns yet, so his built-in promos are used.
  assert.deepStrictEqual(out.campaigns.filter((c) => c.creatorId === 'demo_guywiththejeans').map((c) => c.id), ['demo_c_gwtj_live', 'demo_c_gwtj_gaming']);
  // Doughnut's edits come through, including links, priority and the destination.
  const d = out.campaigns.find((c) => c.id === 'cp_new1');
  assert.strictEqual(d.headline, 'Saturday stream!');
  assert.strictEqual(d.platformIndex, 1);
  assert.strictEqual(d.priority, 4);
  assert.strictEqual(out.creators[1].platforms.length, 2);
  // A new creator gets an automatic promo; the unsafe link and the non-CreatorSpot picture are dropped.
  assert.strictEqual(out.creators[2].platforms.length, 1);
  assert.ok(out.campaigns.some((c) => c.creatorId === out.creators[2].id));
  assert.deepStrictEqual(out.media.map((m) => m.field).sort(), ['avatar', 'imageId']);
});

test('a creator cannot claim featured status or another creator by name alone', () => {
  const { CS } = load();
  const fake = [{ id: UUID_NEW, twitch_login: 'guywiththejeans', featured: false, name: 'GuyWithTheJeans', platforms: [{ type: 'twitch', url: 'https://www.twitch.tv/guywiththejeans' }] }];
  assert.strictEqual(CS.cloud.toLocal(fake).creators[0].id, 'net_' + UUID_NEW.replace(/-/g, ''));
  assert.strictEqual(CS.cloud.toLocal(fake).creators[0].featured, false);
});

test('synced profiles replace local copies, departed creators disappear, and your own profile is marked as yours', async () => {
  const { CS } = load();
  await CS.store.init();
  const { creators, campaigns } = await CS.store.getAll();
  const localOnly = { id: 'cr_mine', name: 'Local friend', platforms: [{ type: 'twitch', url: 'https://www.twitch.tv/friend' }] };
  await CS.store.saveProfiles(creators.concat(localOnly), campaigns.concat({ id: 'cp_friend', creatorId: 'cr_mine', headline: 'Friend' }));

  const out = CS.cloud.toLocal(rows(CS));
  assert.strictEqual(await CS.store.applyShared({ creators: out.creators, campaigns: out.campaigns, mediaSrc: {}, ownId: 'demo_iamdoughnutdude' }), true);
  let all = await CS.store.getAll();
  const dough = all.creators.find((c) => c.id === 'demo_iamdoughnutdude');
  assert.strictEqual(dough.bio, 'Updated by Doughnut');
  assert.strictEqual(dough.isOwn, true);
  assert.strictEqual(all.creators.find((c) => c.id === 'demo_guywiththejeans').isOwn, false);
  assert.ok(all.creators.some((c) => c.id === 'cr_mine'), 'creators added only on this computer stay');
  assert.ok(all.creators.some((c) => /^net_/.test(c.id)), 'new CreatorSpot member appears');
  assert.deepStrictEqual(all.campaigns.filter((c) => c.creatorId === 'demo_iamdoughnutdude').map((c) => c.id), ['cp_new1']);

  // Local edits to a synced creator never stick: the online version wins.
  const tampered = all.creators.map((c) => (c.id === 'demo_iamdoughnutdude' ? Object.assign({}, c, { bio: 'local edit' }) : c));
  await CS.store.saveProfiles(tampered, all.campaigns);
  assert.strictEqual((await CS.store.getAll()).creators.find((c) => c.id === 'demo_iamdoughnutdude').bio, 'Updated by Doughnut');

  // The new member leaves (or an admin removes them): they disappear on the next sync.
  const fewer = CS.cloud.toLocal(rows(CS).slice(0, 2));
  await CS.store.applyShared({ creators: fewer.creators, campaigns: fewer.campaigns, mediaSrc: {}, ownId: null });
  all = await CS.store.getAll();
  assert.ok(!all.creators.some((c) => /^net_/.test(c.id)));
  assert.ok(!all.campaigns.some((c) => /^net_/.test(c.creatorId)));
  assert.strictEqual(all.creators.find((c) => c.id === 'demo_iamdoughnutdude').isOwn, false, 'signed out: no longer marked as yours');
  // Same data again changes nothing.
  assert.strictEqual(await CS.store.applyShared({ creators: fewer.creators, campaigns: fewer.campaigns, mediaSrc: {}, ownId: null }), false);
});

test('saving your profile sends everything: links, campaigns, schedule and uploaded media URLs', () => {
  const { CS } = load();
  const me = CS.schema.creator({ id: 'demo_iamdoughnutdude', name: 'Doughnut', bio: 'b', accent: '#112233', avatar: 'media_a1', platforms: [{ type: 'twitch', url: 'https://www.twitch.tv/iamdoughnutdude' }] });
  const cp = CS.schema.campaign({ id: 'cp_x', creatorId: me.id, headline: 'H', schedule: { start: '2026-12-01', end: '', days: [6] }, media: { imageId: 'media_img' } });
  const other = CS.schema.campaign({ id: 'cp_other', creatorId: 'cr_someone', headline: 'not mine' });
  const urls = { media_a1: CS.cloud.MEDIA_PREFIX + 'u/a.png', media_img: CS.cloud.MEDIA_PREFIX + 'u/i.png' };
  const body = CS.cloud.toRemote(me, [cp, other], (id) => urls[id]);
  assert.strictEqual(body.avatar_url, urls.media_a1);
  assert.strictEqual(body.campaigns.length, 1);
  assert.strictEqual(body.campaigns[0].image, urls.media_img);
  assert.deepStrictEqual(body.campaigns[0].schedule.days, [6]);
  assert.deepStrictEqual(body.platforms, [{ type: 'twitch', url: 'https://www.twitch.tv/iamdoughnutdude' }]);
  // Round trip: what is saved comes back identical on another computer.
  const back = CS.cloud.toLocal([{ id: UUID_DOUGH, twitch_login: 'iamdoughnutdude', featured: true, ...body }]);
  assert.strictEqual(back.campaigns[0].headline, 'H');
  assert.deepStrictEqual(back.campaigns[0].schedule, cp.schedule);
});

test('version comparison for the update check', () => {
  const { CS } = load();
  assert.strictEqual(CS.shared.compareVersions('0.1.10', '0.1.9'), 1);
  assert.strictEqual(CS.shared.compareVersions('v0.2.0', '0.2.0'), 0);
  assert.strictEqual(CS.shared.compareVersions('0.1.2', '0.1.3'), -1);
});
