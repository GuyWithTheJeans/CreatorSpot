/* Background service (Chromium: service worker; Firefox: event page).
 * Routes messages, makes serialised rotation decisions, records analytics, manages the ad-request ruleset. */
/* global importScripts */
if (typeof importScripts === 'function' && !(self.CreatorSpot && self.CreatorSpot.rotation)) {
  importScripts('lib/core.js', 'lib/platforms.js', 'lib/defaults.js', 'lib/schema.js', 'lib/rotation.js', 'lib/store.js', 'lib/live.js', 'lib/payload.js', 'lib/shared.js');
}

(function () {
  'use strict';
  const CS = self.CreatorSpot;
  const api = CS.api;
  const store = CS.store;

  // ---- Ad-network request blocking (declarativeNetRequest static ruleset) ----
  async function applyBlocking(settings) {
    if (!api.declarativeNetRequest) return;
    const on = settings.enabled && settings.blockAdRequests;
    try {
      await api.declarativeNetRequest.updateEnabledRulesets(on ? { enableRulesetIds: ['ad_networks'] } : { disableRulesetIds: ['ad_networks'] });
    } catch (e) {
      console.warn('CreatorSpot: could not update ruleset', e);
    }
  }

  async function applyBadgeStyle() {
    try {
      await api.action.setBadgeBackgroundColor({ color: '#7C5CFF' });
      if (api.action.setBadgeTextColor) await api.action.setBadgeTextColor({ color: '#FFFFFF' });
    } catch (e) {
      /* optional */
    }
  }

  // Initialise once per worker start; every handler waits for it, so a page that loads
  // during installation never sees empty storage.
  const ready = store.init();

  api.runtime.onInstalled.addListener(async (details) => {
    const fresh = await ready;
    const { settings } = await store.getAll();
    await applyBlocking(settings);
    await applyBadgeStyle();
    if (fresh || (details.reason === 'install' && !settings.onboarded)) {
      api.tabs.create({ url: api.runtime.getURL('onboarding/welcome.html') });
    }
  });

  api.runtime.onStartup.addListener(async () => {
    await ready;
    const { settings } = await store.getAll();
    await applyBlocking(settings);
    await applyBadgeStyle();
  });

  // ---- Shared profiles (GitHub) and update check ----
  // Downloads profiles/featured.json from the CreatorSpot GitHub repository every few minutes (checked
  // whenever a page loads), and the newest version number every hour. Nothing about the user is sent.
  const local = api.storage.local;
  let syncing = null;

  function toDataUrl(buf, type) {
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return 'data:' + type + ';base64,' + btoa(bin);
  }

  async function syncShared(force) {
    if (!CS.shared.configured()) return { ok: false, message: 'Not connected to GitHub yet.' };
    if (syncing) return syncing;
    syncing = (async () => {
      const { sharedMeta = {} } = await local.get('sharedMeta');
      if (!force && sharedMeta.checkedAt && Date.now() - sharedMeta.checkedAt < CS.shared.SYNC_EVERY_MS) return { ok: true, skipped: true };
      sharedMeta.checkedAt = Date.now();
      try {
        const res = await fetch(CS.shared.fileUrl() + '?t=' + Date.now(), { cache: 'no-store', credentials: 'omit' });
        if (!res.ok) throw new Error('GitHub answered ' + res.status);
        const text = await res.text();
        if (text.length > 200000) throw new Error('The shared file is too large.');
        if (text !== sharedMeta.text) {
          const parsed = CS.shared.parse(JSON.parse(text));
          if (!parsed) throw new Error('The shared file has no usable profiles.');
          const avatarIds = {};
          const avatarSrc = {};
          for (const [id, file] of Object.entries(parsed.avatars)) {
            try {
              const r = await fetch(CS.shared.rawUrl(file) + '?t=' + Date.now(), { cache: 'no-store', credentials: 'omit' });
              const type = (r.headers.get('content-type') || '').split(';')[0];
              const ext = file.split('.').pop().toLowerCase();
              const mime = /^image\/(png|jpeg|webp|gif)$/.test(type) ? type : { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }[ext];
              if (!r.ok || !mime) continue;
              avatarIds[id] = await store.putMedia(toDataUrl(await r.arrayBuffer(), mime));
              avatarSrc[id] = file;
            } catch (e) {
              /* keep going without this picture */
            }
          }
          await store.applyShared({ creators: parsed.creators, campaigns: parsed.campaigns, avatarIds, avatarSrc });
          sharedMeta.text = text;
          sharedMeta.changedAt = Date.now();
        }
        sharedMeta.ok = true;
        sharedMeta.error = '';
        sharedMeta.syncedAt = Date.now();
        await local.set({ sharedMeta });
        return { ok: true };
      } catch (e) {
        sharedMeta.ok = false;
        sharedMeta.error = String((e && e.message) || e);
        await local.set({ sharedMeta });
        return { ok: false, message: sharedMeta.error };
      }
    })().finally(() => (syncing = null));
    return syncing;
  }

  async function checkForUpdate(force) {
    if (!CS.shared.configured()) return null;
    const { updateMeta = {} } = await local.get('updateMeta');
    if (!force && updateMeta.checkedAt && Date.now() - updateMeta.checkedAt < CS.shared.UPDATE_EVERY_MS) return updateMeta.update || null;
    updateMeta.checkedAt = Date.now();
    try {
      const res = await fetch(CS.shared.manifestUrl() + '?t=' + Date.now(), { cache: 'no-store', credentials: 'omit' });
      if (!res.ok) throw new Error('GitHub answered ' + res.status);
      const latest = String((await res.json()).version || '');
      updateMeta.update =
        latest && CS.shared.compareVersions(latest, api.runtime.getManifest().version) > 0 ? { version: latest, download: CS.shared.downloadUrl() } : null;
    } catch (e) {
      /* offline: try again later */
    }
    await local.set({ updateMeta });
    return updateMeta.update || null;
  }

  function backgroundSync() {
    ready.then(() => Promise.all([syncShared(false), checkForUpdate(false)])).catch(() => {});
  }
  backgroundSync();

  api.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.settings && changes.settings.newValue) applyBlocking(CS.schema.settings(changes.settings.newValue));
  });

  function siteDisabled(settings, host) {
    return settings.disabledSites.some((d) => host === d || host.endsWith('.' + d));
  }

  // ---- Promotion decisions (serialised so concurrent slots never race on rotation state) ----
  function decide(msg) {
    return store.serial(async () => {
      const { settings, creators, campaigns } = await store.getAll();
      if (!settings.enabled) return null;
      const state = await store.getRotation();
      const result = CS.rotation.pick({ settings, creators, campaigns, state, now: Date.now(), shownOnPage: msg.shownOnPage || [] });
      await store.setRotation(result.state);
      if (!result.decision) return null;
      const creator = creators.find((c) => c.id === result.decision.creatorId);
      const campaign = campaigns.find((c) => c.id === result.decision.campaignId);
      return { creator, campaign, settings };
    });
  }

  async function promo(msg) {
    const d = await decide(msg);
    if (!d) return null;
    const platform = d.creator.platforms[d.campaign.platformIndex] || d.creator.platforms[0];
    let live = null;
    if (platform && d.campaign.format === 'live') live = await CS.live.status(platform, platform.handle, d.settings);
    return CS.buildPayload(d.creator, d.campaign, d.settings, store.getMedia, live);
  }

  api.runtime.onMessage.addListener((msg, sender, reply) => {
    if (!msg || typeof msg.type !== 'string') return false;
    const fromTab = sender.tab && typeof sender.tab.id === 'number';
    const fromExtension = sender.id === api.runtime.id;
    if (!fromExtension) return false;

    const respond = (p) => { // p: () => Promise
      ready.then(p).then(reply, (e) => reply({ error: String((e && e.message) || e) }));
      return true; // async response
    };

    switch (msg.type) {
      case 'context':
        backgroundSync();
        return respond(() =>
          store.getAll().then(({ settings }) => {
            const host = String(msg.host || '').toLowerCase();
            const siteEnabled = !siteDisabled(settings, host);
            return {
              enabled: settings.enabled,
              siteEnabled,
              active: settings.enabled && siteEnabled,
              maxPerPage: settings.maxPerPage,
              replaceRate: settings.replaceRate,
              compatMode: settings.compatMode,
              youtubeCompanion: settings.youtubeCompanion,
            };
          })
        );
      case 'promo':
        return respond(() => promo(msg));
      case 'event':
        if (!['impression', 'click'].includes(msg.event) || typeof msg.campaignId !== 'string') return false;
        return respond(() => store.record(msg.event, msg.campaignId, String(msg.creatorId || '')).then(() => true));
      case 'count':
        if (fromTab) {
          const n = Number(msg.count) || 0;
          api.action.setBadgeText({ tabId: sender.tab.id, text: n ? String(n) : '' }).catch(() => {});
        }
        return false;
      case 'sync-now':
        return respond(() => Promise.all([syncShared(true), checkForUpdate(true)]).then(([sync, update]) => ({ sync, update })));
      case 'reset-stats':
        return respond(() => store.resetStats().then(() => true));
      case 'reset-demo':
        return respond(() => store.resetToDemo().then(() => true));
      case 'live-test':
        return respond(() =>
          store.getAll().then(async ({ settings }) => {
            CS.live.clearCache();
            const handle = String(msg.handle || '').trim();
            if (!handle) return { ok: false, message: 'Enter a Twitch channel name to test.' };
            const result = await CS.live.status({ type: 'twitch' }, handle, settings);
            if (!result) return { ok: false, message: 'Could not verify. Check your Client ID, token and permission.' };
            return { ok: true, message: result.live ? handle + ' is live: ' + (result.title || 'no title') : handle + ' is offline right now.' };
          })
        );
      default:
        return false;
    }
  });
})();
