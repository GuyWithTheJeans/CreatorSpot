/* Background service (Chromium: service worker; Firefox: event page).
 * Routes messages, makes serialised rotation decisions, records analytics, manages the ad-request ruleset. */
/* global importScripts */
if (typeof importScripts === 'function' && !(self.CreatorSpot && self.CreatorSpot.rotation)) {
  importScripts('lib/core.js', 'lib/platforms.js', 'lib/defaults.js', 'lib/schema.js', 'lib/rotation.js', 'lib/store.js', 'lib/live.js', 'lib/payload.js', 'lib/shared.js', 'lib/cloud.js');
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

  // ---- CreatorSpot accounts (Supabase) and update check ----
  // Every few minutes (checked whenever a page loads) this downloads all visible creator profiles, plus their
  // pictures, and stores them locally, so web pages never contact CreatorSpot's servers. Signing in with
  // Twitch lets a creator save their own profile online. The newest version number is checked every hour.
  const local = api.storage.local;
  const C = CS.CLOUD;
  let syncing = null;

  function toDataUrl(buf, type) {
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return 'data:' + type + ';base64,' + btoa(bin);
  }

  async function saveSession(j) {
    const expiresAt = Number(j.expires_at) || Math.floor(Date.now() / 1000) + (Number(j.expires_in) || 3600);
    await local.set({ session: { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: expiresAt } });
  }

  async function accessToken() {
    const { session } = await local.get('session');
    if (!session) return null;
    if (session.expires_at * 1000 - Date.now() > 60000) return session.access_token;
    try {
      const r = await fetch(C.url + '/auth/v1/token?grant_type=refresh_token', {
        method: 'POST',
        headers: { apikey: C.key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: session.refresh_token }),
        credentials: 'omit',
      });
      if (r.status === 400 || r.status === 401) {
        await signOutLocal();
        return null;
      }
      if (!r.ok) return null;
      const j = await r.json();
      await saveSession(j);
      return j.access_token;
    } catch (e) {
      return null; // offline
    }
  }

  async function cloudFetch(path, opts, needAuth) {
    const headers = Object.assign({ apikey: C.key }, (opts && opts.headers) || {});
    if (needAuth) {
      const token = await accessToken();
      if (!token) throw new Error('Please sign in with Twitch again.');
      headers.Authorization = 'Bearer ' + token;
    }
    const res = await fetch(C.url + path, Object.assign({}, opts, { headers, cache: 'no-store', credentials: 'omit' }));
    const text = await res.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch (e) {
      body = null;
    }
    if (!res.ok) throw new Error((body && (body.message || body.msg || body.error_description || body.error)) || 'Server answered ' + res.status);
    return body;
  }

  async function downloadMedia(url) {
    try {
      const r = await fetch(url, { cache: 'no-store', credentials: 'omit' });
      if (!r.ok) return null;
      const type = (r.headers.get('content-type') || '').split(';')[0].trim();
      if (!/^(image\/(png|jpeg|webp|gif)|video\/(mp4|webm))$/.test(type)) return null;
      return await store.putMedia(toDataUrl(await r.arrayBuffer(), type));
    } catch (e) {
      return null;
    }
  }

  /** A tiny "has anything changed?" fingerprint: newest edit time plus number of visible creators. */
  async function cloudSignature() {
    const res = await fetch(C.url + '/rest/v1/profiles?select=updated_at&hidden=eq.false&order=updated_at.desc&limit=1', {
      headers: { apikey: C.key, Prefer: 'count=exact' },
      cache: 'no-store',
      credentials: 'omit',
    });
    if (!res.ok) throw new Error('Server answered ' + res.status);
    const rows = await res.json();
    return ((rows[0] && rows[0].updated_at) || '') + '|' + (res.headers.get('content-range') || '');
  }

  /**
   * mode 'auto': at most once a minute, and only downloads everything when something changed (alarm, page loads).
   * mode 'now':  right away, but still skips the download when nothing changed (dashboard or popup opened).
   * mode 'full' (or true): download everything right away (Sync now, after saving, after signing in).
   */
  async function syncCloud(mode) {
    const force = mode === true || mode === 'full';
    if (syncing) {
      if (!force) return syncing;
      await syncing.catch(() => null); // a save must not be answered by an older, in-flight sync
    }
    syncing = (async () => {
      const { sharedMeta = {}, account = null } = await local.get(['sharedMeta', 'account']);
      const ownId = account ? account.localId : null;
      if (!force && mode !== 'now' && sharedMeta.checkedAt && Date.now() - sharedMeta.checkedAt < CS.cloud.SYNC_EVERY_MS) return { ok: true, skipped: true };
      sharedMeta.checkedAt = Date.now();
      try {
        const sig = await cloudSignature();
        if (!force && sig === sharedMeta.sig && ownId === sharedMeta.ownId && sharedMeta.text) {
          Object.assign(sharedMeta, { ok: true, error: '', syncedAt: Date.now() });
          await local.set({ sharedMeta });
          return { ok: true, unchanged: true };
        }
        const rows = await cloudFetch('/rest/v1/profiles?select=' + CS.cloud.COLUMNS + '&hidden=eq.false&order=created_at.asc&limit=2000');
        const text = JSON.stringify(rows);
        if (force || text !== sharedMeta.text || ownId !== sharedMeta.ownId) {
          const parsed = CS.cloud.toLocal(rows);
          const prev = (await store.sharedProfile()) || {};
          const { cloudUploads = {} } = await local.get('cloudUploads');
          const known = Object.assign({}, prev.mediaSrc || {});
          Object.entries(cloudUploads).forEach(([mid, url]) => (known[url] = known[url] || mid));
          const mediaSrc = {};
          for (const m of parsed.media) {
            let mid = mediaSrc[m.url] || known[m.url] || null;
            if (mid && !(await store.getMedia(mid))) mid = null;
            if (!mid) mid = await downloadMedia(m.url);
            if (!mid) continue;
            mediaSrc[m.url] = mid;
            if (m.creatorId) parsed.creators.find((c) => c.id === m.creatorId).avatar = mid;
            else parsed.campaigns.find((c) => c.id === m.campaignId).media[m.field] = mid;
          }
          await store.applyShared({ creators: parsed.creators, campaigns: parsed.campaigns, mediaSrc, ownId });
          sharedMeta.text = text;
          sharedMeta.ownId = ownId;
          sharedMeta.count = parsed.creators.length;
        }
        sharedMeta.sig = sig;
        Object.assign(sharedMeta, { ok: true, error: '', syncedAt: Date.now() });
        await local.set({ sharedMeta });
        return { ok: true };
      } catch (e) {
        Object.assign(sharedMeta, { ok: false, error: String((e && e.message) || e) });
        await local.set({ sharedMeta });
        return { ok: false, message: sharedMeta.error };
      }
    })().finally(() => (syncing = null));
    return syncing;
  }

  async function signIn() {
    if (!api.identity || !api.identity.launchWebAuthFlow) throw new Error('This browser does not support signing in from extensions yet.');
    const redirect = api.identity.getRedirectURL();
    const result = await api.identity.launchWebAuthFlow({
      url: C.url + '/auth/v1/authorize?provider=twitch&redirect_to=' + encodeURIComponent(redirect),
      interactive: true,
    });
    const params = new URLSearchParams(result.split('#')[1] || result.split('?')[1] || '');
    if (params.get('error')) throw new Error(params.get('error_description') || params.get('error'));
    if (!params.get('access_token')) throw new Error('Sign-in did not finish. Please try again.');
    await saveSession({ access_token: params.get('access_token'), refresh_token: params.get('refresh_token'), expires_at: params.get('expires_at'), expires_in: params.get('expires_in') });
    const profile = await cloudFetch('/rest/v1/rpc/ensure_my_profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }, true);
    const account = { id: profile.id, login: profile.twitch_login, name: profile.name, featured: !!profile.featured, localId: CS.cloud.localId(profile) };
    await local.set({ account });
    if (account.featured && !(Array.isArray(profile.campaigns) && profile.campaigns.length)) {
      // First sign-in of a featured creator: put their built-in promos online so they can edit them.
      const def = CS.defaultCreators().find((c) => c.id === account.localId);
      if (def) {
        const body = CS.cloud.toRemote(def, CS.defaultCampaigns(), () => null);
        delete body.avatar_url;
        await cloudFetch('/rest/v1/profiles?id=eq.' + account.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(body) }, true);
      }
    }
    await syncCloud(true);
    return account;
  }

  async function signOutLocal() {
    await local.remove(['session', 'account']);
  }

  async function signOut() {
    try {
      await cloudFetch('/auth/v1/logout', { method: 'POST' }, true);
    } catch (e) {
      /* already signed out on the server */
    }
    await signOutLocal();
    await syncCloud(true);
  }

  /** Save the signed-in creator's own profile and campaigns online (uploading new pictures and videos). */
  async function cloudSave(creator, campaigns) {
    const { account, cloudUploads = {} } = await local.get(['account', 'cloudUploads']);
    if (!account) throw new Error('Sign in with Twitch first.');
    if (!creator || creator.id !== account.localId) throw new Error('You can only change your own profile.');
    const sp = (await store.sharedProfile()) || {};
    const byId = {};
    Object.entries(sp.mediaSrc || {}).forEach(([url, mid]) => (byId[mid] = url));
    Object.assign(byId, cloudUploads);
    const mine = (campaigns || []).filter((c) => c.creatorId === creator.id);
    const ids = [creator.avatar].concat(...mine.map((c) => [c.media && c.media.imageId, c.media && c.media.videoId])).filter(Boolean);
    for (const mid of ids) {
      if (byId[mid]) continue;
      const dataUrl = await store.getMedia(mid);
      const m = dataUrl && dataUrl.match(/^data:([^;]+);base64,(.*)$/);
      if (!m) continue;
      const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'video/mp4': 'mp4', 'video/webm': 'webm' }[m[1]];
      if (!ext) continue;
      const bin = atob(m[2]);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const path = account.id + '/' + mid + '.' + ext;
      await cloudFetch('/storage/v1/object/media/' + path, { method: 'POST', headers: { 'Content-Type': m[1], 'x-upsert': 'true' }, body: bytes }, true);
      byId[mid] = cloudUploads[mid] = CS.cloud.MEDIA_PREFIX + path;
      await local.set({ cloudUploads });
    }
    const body = CS.cloud.toRemote(creator, mine, (mid) => byId[mid] || null);
    await cloudFetch('/rest/v1/profiles?id=eq.' + account.id, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(body) }, true);
    return syncCloud(true);
  }

  async function adminList() {
    return cloudFetch('/rest/v1/profiles?select=id,twitch_login,name&hidden=eq.true&order=updated_at.desc&limit=200', {}, true);
  }

  async function adminHide(cloudId, value) {
    await cloudFetch('/rest/v1/rpc/set_hidden', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ target: cloudId, value: !!value }) }, true);
    return syncCloud(true);
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

  // Check for profile changes every minute, even when no pages are loading.
  function ensureAlarm() {
    if (!api.alarms) return;
    api.alarms.get('cs-sync').then((a) => a || api.alarms.create('cs-sync', { periodInMinutes: 1 })).catch(() => {});
  }
  if (api.alarms) {
    api.alarms.onAlarm.addListener((a) => {
      if (a.name === 'cs-sync') ready.then(() => Promise.all([syncCloud('auto'), checkForUpdate(false)])).catch(() => {});
    });
  }
  ensureAlarm();

  function backgroundSync() {
    ready.then(() => Promise.all([syncCloud('auto'), checkForUpdate(false)])).catch(() => {});
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
    // Account actions only come from CreatorSpot's own pages (dashboard, popup), never from content scripts.
    const fromOwnPage = typeof sender.url === 'string' && sender.url.startsWith(api.runtime.getURL(''));
    if (['sign-in', 'sign-out', 'cloud-save', 'admin-list', 'admin-hide'].includes(msg.type) && !fromOwnPage) return false;

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
      case 'account':
        return respond(() => local.get(['account', 'sharedMeta']).then((d) => ({ account: d.account || null, meta: d.sharedMeta || {} })));
      case 'sign-in':
        return respond(() => signIn().then((account) => ({ ok: true, account }), (e) => ({ ok: false, message: String((e && e.message) || e) })));
      case 'sign-out':
        return respond(() => signOut().then(() => ({ ok: true })));
      case 'cloud-save':
        return respond(() => cloudSave(msg.creator, msg.campaigns).then((r) => r, (e) => ({ ok: false, message: String((e && e.message) || e) })));
      case 'admin-list':
        return respond(() => adminList().then((list) => ({ ok: true, list }), (e) => ({ ok: false, message: String((e && e.message) || e) })));
      case 'admin-hide':
        return respond(() => adminHide(String(msg.cloudId || ''), msg.value).then((r) => r, (e) => ({ ok: false, message: String((e && e.message) || e) })));
      case 'sync-soon':
        return respond(() => syncCloud('now'));
      case 'sync-now':
        return respond(() => Promise.all([syncCloud('full'), checkForUpdate(true)]).then(([sync, update]) => ({ sync, update })));
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
