/* Storage layer. All persistent data lives in storage.local on this device. */
(function (root) {
  'use strict';
  const CS = root.CreatorSpot;
  const STATS_DAYS = 90;
  const MAX_MEDIA_BYTES = 8 * 1024 * 1024;

  const area = () => CS.api.storage.local;
  const get = (keys) => area().get(keys);
  const set = (obj) => area().set(obj);

  // Serialise writes so concurrent messages never lose an update.
  let chain = Promise.resolve();
  function serial(fn) {
    const run = chain.then(fn, fn);
    chain = run.catch(() => {});
    return run;
  }

  /**
   * Featured creators always run: restore any that are missing, and keep their built-in campaigns present.
   * When CreatorSpot accounts have been downloaded (`sp`), they are the source of truth: every signed-up
   * creator's profile and campaigns are replaced with the online version on every install, creators who
   * left (or were removed by an admin) disappear, and the signed-in person's own profile is marked "You".
   */
  function ensureFeatured(creators, campaigns, sp) {
    let outCreators = creators.slice();
    let outCampaigns = campaigns.slice();
    const managed = new Set();
    if (sp && Array.isArray(sp.creators)) {
      const online = new Set(sp.creators.map((c) => c.id));
      const gone = new Set(outCreators.filter((c) => /^net_/.test(c.id) && !online.has(c.id)).map((c) => c.id));
      outCreators = outCreators.filter((c) => !gone.has(c.id));
      sp.creators.forEach((rc) => {
        managed.add(rc.id);
        const next = Object.assign({}, rc, { isOwn: rc.id === sp.ownId, participates: true });
        const i = outCreators.findIndex((c) => c.id === rc.id);
        if (i === -1) outCreators.push(next);
        else outCreators[i] = next;
      });
      outCampaigns = outCampaigns
        .filter((c) => !managed.has(c.creatorId) && !gone.has(c.creatorId))
        .concat((sp.campaigns || []).filter((c) => managed.has(c.creatorId)));
    }
    CS.defaultCreators()
      .filter((c) => CS.isFeatured(c.id))
      .forEach((def) => {
        if (!outCreators.some((c) => c.id === def.id)) outCreators.unshift(CS.schema.creator(def));
      });
    CS.defaultCampaigns()
      .filter((cp) => CS.isFeatured(cp.creatorId) && !managed.has(cp.creatorId))
      .forEach((def) => {
        const i = outCampaigns.findIndex((c) => c.id === def.id);
        if (i === -1) outCampaigns.push(CS.schema.campaign(def));
        else if (!outCampaigns[i].enabled) outCampaigns[i] = Object.assign({}, outCampaigns[i], { enabled: true });
      });
    return { creators: outCreators, campaigns: outCampaigns };
  }

  async function sharedProfile() {
    const d = await get('shared');
    return d.shared || null;
  }

  const store = {
    serial,
    ensureFeatured,

    async init() {
      const data = await get(['settings', 'creators', 'campaigns']);
      if (!data.settings) {
        await set({
          settings: CS.defaultSettings(),
          creators: CS.defaultCreators(),
          campaigns: CS.defaultCampaigns(),
          rotation: CS.rotation.emptyState(),
          stats: {},
        });
        return true; // fresh install
      }
      // Forward-compatible repair: re-validate whatever is stored and make sure featured creators are present.
      await set({ settings: CS.schema.settings(data.settings) });
      const fixed = ensureFeatured(
        (data.creators || []).map(CS.schema.creator).filter(Boolean),
        (data.campaigns || []).map((c) => CS.schema.campaign(c)).filter(Boolean),
        await sharedProfile()
      );
      await set(fixed);
      return false;
    },

    async getAll() {
      const d = await get(['settings', 'creators', 'campaigns']);
      return {
        settings: CS.schema.settings(d.settings),
        creators: Array.isArray(d.creators) ? d.creators : [],
        campaigns: Array.isArray(d.campaigns) ? d.campaigns : [],
      };
    },

    saveSettings(patch) {
      return serial(async () => {
        const { settings } = await get('settings');
        const next = CS.schema.settings(Object.assign({}, settings, patch));
        await set({ settings: next });
        return next;
      });
    },

    /** Replace creators and campaigns together (keeps them consistent). */
    saveProfiles(creators, campaigns) {
      return serial(async () => {
        const cleanCreators = (creators || []).map(CS.schema.creator).filter(Boolean);
        const ids = cleanCreators.map((c) => c.id);
        const fixed = ensureFeatured(cleanCreators, (campaigns || []).map((c) => CS.schema.campaign(c, ids)).filter(Boolean), await sharedProfile());
        const cleanCampaigns = fixed.campaigns;
        await set(fixed);
        await store.gcMedia(fixed.creators, cleanCampaigns);
        return fixed;
      });
    },

    sharedProfile,

    /** Store a freshly downloaded shared profiles file and apply it. Returns true if anything changed. */
    applyShared(sp) {
      return serial(async () => {
        const d = await get(['creators', 'campaigns']);
        const before = JSON.stringify([d.creators, d.campaigns]);
        const fixed = ensureFeatured(Array.isArray(d.creators) ? d.creators : [], Array.isArray(d.campaigns) ? d.campaigns : [], sp);
        await set({ shared: sp });
        if (JSON.stringify([fixed.creators, fixed.campaigns]) === before) return false;
        await set(fixed);
        await store.gcMedia(fixed.creators, fixed.campaigns);
        return true;
      });
    },

    // ---- Media (uploaded images and videos), stored separately from settings ----
    async putMedia(dataUrl) {
      if (typeof dataUrl !== 'string' || !/^data:(image\/(png|jpeg|webp|gif)|video\/(mp4|webm));base64,/.test(dataUrl)) {
        throw new Error('Unsupported file type. Use PNG, JPEG, WebP, GIF, MP4 or WebM.');
      }
      if (dataUrl.length * 0.75 > MAX_MEDIA_BYTES) throw new Error('That file is too large. The limit is 8 MB.');
      const id = CS.uid('media').replace(/[^A-Za-z0-9_]/g, '');
      await set({ ['media:' + id]: dataUrl });
      return id;
    },
    async getMedia(id) {
      if (!id) return null;
      const key = 'media:' + id;
      const d = await get(key);
      return d[key] || null;
    },
    async gcMedia(creators, campaigns) {
      const all = await get(null);
      const used = new Set();
      creators.forEach((c) => c.avatar && used.add(c.avatar));
      campaigns.forEach((c) => {
        if (c.media && c.media.imageId) used.add(c.media.imageId);
        if (c.media && c.media.videoId) used.add(c.media.videoId);
      });
      const stale = Object.keys(all).filter((k) => k.startsWith('media:') && !used.has(k.slice(6)));
      if (stale.length) await area().remove(stale);
    },

    // ---- Rotation state ----
    async getRotation() {
      const d = await get('rotation');
      return d.rotation || CS.rotation.emptyState();
    },
    setRotation(state) {
      return set({ rotation: state });
    },

    // ---- Analytics: counts only (no URLs, no browsing history) ----
    record(type, campaignId, creatorId) {
      return serial(async () => {
        const { stats = {} } = await get('stats');
        const day = CS.dayKey();
        stats[day] = stats[day] || {};
        const row = (stats[day][campaignId] = stats[day][campaignId] || { i: 0, c: 0, cr: creatorId });
        if (type === 'impression') row.i += 1;
        if (type === 'click') row.c += 1;
        const cutoff = CS.dayKey(Date.now() - STATS_DAYS * 86400000);
        Object.keys(stats).forEach((k) => k < cutoff && delete stats[k]);
        await set({ stats });
      });
    },
    async getStats() {
      const { stats = {} } = await get('stats');
      return stats;
    },
    resetStats() {
      return serial(() => set({ stats: {}, rotation: CS.rotation.emptyState() }));
    },

    // ---- Import / export / reset ----
    async exportConfig() {
      const all = await get(null);
      const media = {};
      Object.keys(all).filter((k) => k.startsWith('media:')).forEach((k) => (media[k.slice(6)] = all[k]));
      const settings = CS.schema.settings(all.settings);
      settings.integrations = { twitch: { clientId: '', token: '' } }; // never export credentials
      return { app: 'CreatorSpot', version: CS.VERSION, exportedAt: new Date().toISOString(), settings, creators: all.creators, campaigns: all.campaigns, media };
    },
    async importConfig(obj) {
      if (!obj || obj.app !== 'CreatorSpot') throw new Error('This file is not a CreatorSpot backup.');
      const writes = {};
      Object.entries(obj.media || {}).forEach(([id, url]) => {
        if (/^media_[A-Za-z0-9_]+$/.test(id) && typeof url === 'string' && /^data:(image|video)\//.test(url) && url.length * 0.75 <= MAX_MEDIA_BYTES) {
          writes['media:' + id] = url;
        }
      });
      await set(writes);
      const current = (await get('settings')).settings || {};
      const settings = CS.schema.settings(Object.assign({}, obj.settings, { integrations: current.integrations, onboarded: true }));
      await set({ settings });
      return store.saveProfiles(obj.creators, obj.campaigns);
    },
    async resetToDemo() {
      const { settings } = await get('settings');
      await set({
        settings: Object.assign(CS.defaultSettings(), { onboarded: true, theme: (settings && settings.theme) || 'system' }),
        rotation: CS.rotation.emptyState(),
      });
      return store.saveProfiles(CS.defaultCreators(), CS.defaultCampaigns());
    },
  };

  CS.store = store;
  if (typeof module !== 'undefined' && module.exports) module.exports = store;
})(typeof globalThis !== 'undefined' ? globalThis : self);
