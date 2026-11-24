/* Rotation engine. Pure and deterministic: no browser APIs, no randomness.
 * Input: settings, creators, campaigns, previous state. Output: a decision plus the next state.
 *
 * Fairness uses start-time fair queuing: every creator carries a virtual counter that grows by
 * 1/weight each time they are shown; the lowest counter goes next. Creators who join later start
 * at the current minimum, so they share placements immediately but cannot flood the rotation. */
(function (root) {
  'use strict';
  const CS = root.CreatorSpot;
  const HOUR = 3600 * 1000;

  function emptyState() {
    return { served: {}, campServed: {}, recent: [], last: null, own: 0, total: 0 };
  }

  function isScheduled(campaign, now) {
    const s = campaign.schedule || {};
    const day = CS.dayKey(now);
    if (s.start && day < s.start) return false;
    if (s.end && day > s.end) return false;
    if (Array.isArray(s.days) && s.days.length && !s.days.includes(new Date(now).getDay())) return false;
    return true;
  }

  /** Creators allowed by the selected mode, before frequency caps. Returns [{creator, weight, group}]. */
  function modePool(settings, creators) {
    const base = basePool(settings, creators);
    // Featured creators are part of every rotation, in every mode, and cannot be excluded.
    const have = new Set(base.map((p) => p.creator.id));
    creators
      .filter((c) => c.featured && !have.has(c.id))
      .forEach((c) => base.push({ creator: c, weight: 1, group: c.isOwn ? 'own' : 'other' }));
    return base;
  }

  function basePool(settings, creators) {
    const excluded = new Set((settings.excluded || []).filter((id) => !creators.some((c) => c.id === id && c.featured)));
    const cats = (settings.categories || []).map((c) => c.toLowerCase());
    const catOk = (c) => c.isOwn || !cats.length || cats.includes(String(c.category || '').toLowerCase());
    const own = creators.filter((c) => c.isOwn);
    const others = creators.filter((c) => !c.isOwn && c.participates && !excluded.has(c.id) && catOk(c));

    switch (settings.mode) {
      case 'self':
        return own.map((c) => ({ creator: c, weight: c.weight || 1, group: 'own' }));
      case 'circle': {
        const members = new Set((settings.circle && settings.circle.members) || []);
        const weights = (settings.circle && settings.circle.weights) || {};
        return creators
          .filter((c) => members.has(c.id) && !excluded.has(c.id))
          .map((c) => ({ creator: c, weight: weights[c.id] || 1, group: c.isOwn ? 'own' : 'other' }));
      }
      case 'mixed':
        return own
          .map((c) => ({ creator: c, weight: c.weight || 1, group: 'own' }))
          .concat(others.map((c) => ({ creator: c, weight: 1, group: 'other' })));
      case 'network':
      default:
        // In the shared network every creator has equal weight, so no one can buy or set dominance.
        return creators
          .filter((c) => c.participates && !excluded.has(c.id) && catOk(c))
          .map((c) => ({ creator: c, weight: 1, group: c.isOwn ? 'own' : 'other' }));
    }
  }

  /**
   * @param {object} input
   *   settings, creators, campaigns, state, now (ms), shownOnPage (creator ids already on this page)
   * @returns {{decision: null | {creatorId, campaignId, reason}, state, reason?: string}}
   */
  function pick(input) {
    const { settings, creators, campaigns } = input;
    const now = input.now || Date.now();
    const shown = new Set(input.shownOnPage || []);
    const state = JSON.parse(JSON.stringify(input.state || emptyState()));
    state.recent = (state.recent || []).filter((r) => now - r.t < HOUR);

    const live = campaigns.filter((c) => c.enabled && isScheduled(c, now));
    const byCreator = new Map();
    live.forEach((c) => {
      if (!byCreator.has(c.creatorId)) byCreator.set(c.creatorId, []);
      byCreator.get(c.creatorId).push(c);
    });

    const cap = settings.maxPerCreatorPerHour || Infinity;
    const hourly = {};
    state.recent.forEach((r) => (hourly[r.c] = (hourly[r.c] || 0) + 1));

    // If the chosen mode has nobody in it (e.g. "Promote myself" before adding your own channel),
    // fall back to the shared rotation instead of silently showing nothing.
    const withCampaigns = modePool(settings, creators).filter((p) => byCreator.has(p.creator.id));
    if (!withCampaigns.length && settings.mode !== 'network') {
      return pick(Object.assign({}, input, { state, settings: Object.assign({}, settings, { mode: 'network' }) }));
    }
    let pool = withCampaigns.filter((p) => (hourly[p.creator.id] || 0) < cap);
    if (!pool.length) return { decision: null, state, reason: 'no-eligible-creators' };

    // Mixed mode: choose the group by deficit so the configured share is met exactly over time.
    let group = null;
    if (settings.mode === 'mixed') {
      const ownPool = pool.filter((p) => p.group === 'own');
      const otherPool = pool.filter((p) => p.group === 'other');
      const share = (settings.mixedOwnShare == null ? 70 : settings.mixedOwnShare) / 100;
      if (ownPool.length && otherPool.length) {
        const wantOwn = state.total === 0 ? share >= 0.5 : state.own / state.total < share;
        group = wantOwn ? 'own' : 'other';
        pool = wantOwn ? ownPool : otherPool;
      } else {
        group = ownPool.length ? 'own' : 'other';
      }
    }

    // Soft preferences: different creators on the same page, and no back-to-back repeats.
    const notOnPage = pool.filter((p) => !shown.has(p.creator.id));
    if (notOnPage.length) pool = notOnPage;
    if (settings.avoidRepeat !== false && pool.length > 1) {
      const notLast = pool.filter((p) => p.creator.id !== state.last);
      if (notLast.length) pool = notLast;
    }

    // Newcomers start at the current minimum virtual time.
    const known = pool.map((p) => state.served[p.creator.id]).filter((v) => v != null);
    const floor = known.length ? Math.min(...known) : 0;
    pool.forEach((p) => {
      if (state.served[p.creator.id] == null || state.served[p.creator.id] < floor) state.served[p.creator.id] = floor;
    });

    pool.sort((a, b) => {
      const va = state.served[a.creator.id] + 1 / a.weight;
      const vb = state.served[b.creator.id] + 1 / b.weight;
      if (va !== vb) return va - vb;
      return a.creator.id < b.creator.id ? -1 : 1; // stable tie-break
    });
    const chosen = pool[0];
    const cid = chosen.creator.id;

    // Campaign within the creator: lowest served/priority.
    const camps = byCreator.get(cid).slice().sort((a, b) => {
      const va = ((state.campServed[a.id] || 0) + 1) / (a.priority || 3);
      const vb = ((state.campServed[b.id] || 0) + 1) / (b.priority || 3);
      if (va !== vb) return va - vb;
      return a.id < b.id ? -1 : 1;
    });
    const campaign = camps[0];

    state.served[cid] += 1 / chosen.weight;
    state.campServed[campaign.id] = (state.campServed[campaign.id] || 0) + 1;
    state.recent.push({ c: cid, t: now });
    state.last = cid;
    if (group) {
      state.total += 1;
      if (group === 'own') state.own += 1;
    }
    return { decision: { creatorId: cid, campaignId: campaign.id }, state };
  }

  /** Creators that will actually be shown right now, and whether the mode fell back to the rotation. */
  function effectivePool(settings, creators, campaigns, now) {
    const ok = new Set(campaigns.filter((c) => c.enabled && isScheduled(c, now || Date.now())).map((c) => c.creatorId));
    const pool = modePool(settings, creators).filter((p) => ok.has(p.creator.id));
    if (pool.length || settings.mode === 'network') return { pool, fallback: false };
    return { pool: modePool(Object.assign({}, settings, { mode: 'network' }), creators).filter((p) => ok.has(p.creator.id)), fallback: true };
  }

  CS.rotation = { pick, emptyState, isScheduled, modePool, effectivePool };
  if (typeof module !== 'undefined' && module.exports) module.exports = CS.rotation;
})(typeof globalThis !== 'undefined' ? globalThis : self);
