const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./helpers');
const { CS } = load();
const R = CS.rotation;

const NOW = new Date('2026-11-22T12:00:00').getTime();

function creator(id, extra) {
  return Object.assign({ id, name: id, isOwn: false, participates: true, weight: 1, category: 'Gaming', platforms: [{ type: 'twitch', url: 'https://www.twitch.tv/' + id, handle: id }] }, extra);
}
function campaign(id, creatorId, extra) {
  return Object.assign({ id, creatorId, enabled: true, priority: 3, schedule: { start: '', end: '', days: [] }, format: 'spotlight' }, extra);
}
function run(n, input) {
  let state = input.state || R.emptyState();
  const seq = [];
  for (let i = 0; i < n; i++) {
    const r = R.pick(Object.assign({}, input, { state, now: (input.now || NOW) + i * 1000 }));
    state = r.state;
    seq.push(r.decision);
  }
  return { seq, state };
}
const settings = (extra) => Object.assign(CS.defaultSettings(), { maxPerCreatorPerHour: 100000 }, extra);
const count = (seq) => seq.reduce((m, d) => ((m[d && d.creatorId] = (m[d && d.creatorId] || 0) + 1), m), {});

test('demo defaults: the two creators alternate', () => {
  const { seq } = run(10, { settings: CS.defaultSettings(), creators: CS.defaultCreators(), campaigns: CS.defaultCampaigns() });
  const ids = seq.map((d) => d.creatorId);
  for (let i = 1; i < ids.length; i++) assert.notEqual(ids[i], ids[i - 1], 'no back-to-back repeats');
  assert.deepEqual(new Set(ids), new Set(['demo_guywiththejeans', 'demo_iamdoughnutdude']));
});

test('demo defaults: each creator rotates through all of their campaigns', () => {
  const { seq } = run(8, { settings: CS.defaultSettings(), creators: CS.defaultCreators(), campaigns: CS.defaultCampaigns() });
  assert.equal(new Set(seq.map((d) => d.campaignId)).size, 4);
});

test('network mode is fair across 100 creators, even with uneven campaign counts', () => {
  const creators = Array.from({ length: 100 }, (_, i) => creator('c' + i));
  const campaigns = creators.flatMap((c, i) => Array.from({ length: (i % 5) + 1 }, (_, k) => campaign(c.id + '_' + k, c.id)));
  const { seq } = run(10000, { settings: settings(), creators, campaigns });
  const counts = Object.values(count(seq));
  assert.equal(counts.length, 100);
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 1, 'every creator within 1 placement of each other');
});

test('network mode ignores self-assigned weights (no one can dominate)', () => {
  const creators = [creator('a', { weight: 5 }), creator('b')];
  const { seq } = run(100, { settings: settings(), creators, campaigns: [campaign('ca', 'a'), campaign('cb', 'b')] });
  const c = count(seq);
  assert.equal(c.a, 50);
  assert.equal(c.b, 50);
});

test('circle mode respects members and weights', () => {
  const creators = [creator('a'), creator('b'), creator('c')];
  const s = settings({ mode: 'circle', avoidRepeat: false, circle: { name: 'x', members: ['a', 'b'], weights: { a: 3 } } });
  const { seq } = run(400, { settings: s, creators, campaigns: creators.map((c) => campaign('k' + c.id, c.id)) });
  const c = count(seq);
  assert.equal(c.c, undefined, 'non-members never appear');
  assert.equal(c.a, 300);
  assert.equal(c.b, 100);
});

test('self mode only shows own creators; falls back to the rotation when you have none', () => {
  const creators = [creator('me', { isOwn: true }), creator('other')];
  const camps = [campaign('k1', 'me'), campaign('k2', 'other')];
  const { seq } = run(20, { settings: settings({ mode: 'self' }), creators, campaigns: camps });
  assert.ok(seq.every((d) => d.creatorId === 'me'));
  const fb = R.pick({ settings: settings({ mode: 'self' }), creators: [creator('x'), creator('y')], campaigns: [campaign('k', 'x'), campaign('k2', 'y')], now: NOW });
  assert.ok(fb.decision, 'never silently shows nothing');
  const eff = R.effectivePool(settings({ mode: 'self' }), [creator('x')], [campaign('k', 'x')], NOW);
  assert.equal(eff.fallback, true);
  assert.equal(eff.pool.length, 1);
  const empty = R.pick({ settings: settings({ mode: 'circle' }), creators: [creator('x')], campaigns: [campaign('k', 'x', { enabled: false })], now: NOW });
  assert.equal(empty.decision, null, 'no campaigns anywhere: nothing to show');
});

test('mixed mode hits the configured share exactly', () => {
  const creators = [creator('me', { isOwn: true }), creator('o1'), creator('o2')];
  const camps = creators.map((c) => campaign('k' + c.id, c.id));
  for (const share of [70, 25, 50]) {
    const { seq } = run(200, { settings: settings({ mode: 'mixed', mixedOwnShare: share }), creators, campaigns: camps });
    assert.equal(count(seq).me, share * 2, 'share ' + share);
  }
});

test('frequency cap per creator per hour is enforced', () => {
  const creators = [creator('a'), creator('b')];
  const camps = [campaign('ka', 'a'), campaign('kb', 'b')];
  const { seq } = run(10, { settings: settings({ maxPerCreatorPerHour: 3 }), creators, campaigns: camps });
  const c = count(seq);
  assert.equal(c.a, 3);
  assert.equal(c.b, 3);
  assert.equal(c['null'], 4, 'remaining placements are left alone');
  // An hour later the cap resets.
  const later = R.pick({ settings: settings({ maxPerCreatorPerHour: 3 }), creators, campaigns: camps, state: run(10, { settings: settings({ maxPerCreatorPerHour: 3 }), creators, campaigns: camps }).state, now: NOW + 3601 * 1000 + 10000 });
  assert.ok(later.decision);
});

test('schedules: date range and days of week', () => {
  const c = campaign('k', 'a', { schedule: { start: '2026-11-20', end: '2026-11-25', days: [] } });
  assert.equal(R.isScheduled(c, NOW), true);
  assert.equal(R.isScheduled(c, new Date('2026-11-26T10:00:00').getTime()), false);
  assert.equal(R.isScheduled(c, new Date('2026-11-19T10:00:00').getTime()), false);
  const sundayOnly = campaign('k', 'a', { schedule: { start: '', end: '', days: [0] } });
  assert.equal(R.isScheduled(sundayOnly, NOW), true); // 22 Nov 2026 is a Sunday
  assert.equal(R.isScheduled(sundayOnly, NOW + 86400000), false);
});

test('disabled campaigns and excluded creators never appear', () => {
  const creators = [creator('a'), creator('b'), creator('c')];
  const camps = [campaign('ka', 'a', { enabled: false }), campaign('kb', 'b'), campaign('kc', 'c')];
  const { seq } = run(30, { settings: settings({ excluded: ['c'] }), creators, campaigns: camps });
  assert.ok(seq.every((d) => d.creatorId === 'b'));
});

test('campaign priority shares placements within a creator', () => {
  const { seq } = run(80, { settings: settings(), creators: [creator('a')], campaigns: [campaign('hi', 'a', { priority: 3 }), campaign('lo', 'a', { priority: 1 })] });
  const c = seq.reduce((m, d) => ((m[d.campaignId] = (m[d.campaignId] || 0) + 1), m), {});
  assert.equal(c.hi, 60);
  assert.equal(c.lo, 20);
});

test('a newcomer shares placements immediately but cannot flood the rotation', () => {
  const creators = [creator('a'), creator('b')];
  const camps = [campaign('ka', 'a'), campaign('kb', 'b'), campaign('kn', 'n')];
  const { state } = run(1000, { settings: settings(), creators, campaigns: camps });
  const { seq } = run(30, { settings: settings(), creators: creators.concat(creator('n')), campaigns: camps, state });
  const c = count(seq);
  assert.ok(c.n >= 9 && c.n <= 11, 'newcomer gets about a third, got ' + c.n);
});

test('creators already shown on the page are avoided when possible', () => {
  const creators = [creator('a'), creator('b'), creator('c')];
  const camps = creators.map((c) => campaign('k' + c.id, c.id));
  const r = R.pick({ settings: settings(), creators, campaigns: camps, shownOnPage: ['a', 'b'], now: NOW });
  assert.equal(r.decision.creatorId, 'c');
});

test('category filter applies to other creators but never to your own', () => {
  const creators = [creator('me', { isOwn: true, category: 'Art' }), creator('g', { category: 'Gaming' }), creator('m', { category: 'Music' })];
  const camps = creators.map((c) => campaign('k' + c.id, c.id));
  const { seq } = run(30, { settings: settings({ categories: ['music'] }), creators, campaigns: camps });
  const c = count(seq);
  assert.equal(c.g, undefined);
  assert.ok(c.me > 0 && c.m > 0);
});
