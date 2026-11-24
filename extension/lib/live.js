/* Live-status providers. A creator is only ever shown as LIVE when a provider verifies it.
 * Provider contract: check(handles[], settings) -> Promise<Map<handle, {live, title, game}>> */
(function (root) {
  'use strict';
  const CS = root.CreatorSpot;
  const TTL = 2 * 60 * 1000;
  const cache = new Map(); // key: platform:handle -> {at, value}

  const providers = {
    twitch: {
      origin: 'https://api.twitch.tv/*',
      configured: (s) => !!(s.integrations && s.integrations.twitch.clientId && s.integrations.twitch.token),
      async check(handles, settings) {
        const { clientId, token } = settings.integrations.twitch;
        const qs = handles.map((h) => 'user_login=' + encodeURIComponent(h.toLowerCase())).join('&');
        const res = await fetch('https://api.twitch.tv/helix/streams?' + qs, {
          headers: { 'Client-Id': clientId, Authorization: 'Bearer ' + token.replace(/^Bearer\s+/i, '') },
        });
        if (!res.ok) throw new Error('Twitch returned ' + res.status);
        const body = await res.json();
        const out = new Map(handles.map((h) => [h.toLowerCase(), { live: false }]));
        (body.data || []).forEach((s) => {
          if (s.type === 'live') out.set(String(s.user_login).toLowerCase(), { live: true, title: s.title || '', game: s.game_name || '' });
        });
        return out;
      },
    },
  };

  async function hasOrigin(origin) {
    try {
      return await CS.api.permissions.contains({ origins: [origin] });
    } catch (e) {
      return false;
    }
  }

  /** Returns {live, title, game} or null when the status cannot be verified. */
  async function status(platform, handle, settings) {
    const p = providers[platform.type];
    if (!p || !handle || !p.configured(settings)) return null;
    const key = platform.type + ':' + handle.toLowerCase();
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < TTL) return hit.value;
    if (!(await hasOrigin(p.origin))) return null;
    try {
      const map = await p.check([handle], settings);
      const value = map.get(handle.toLowerCase()) || { live: false };
      cache.set(key, { at: Date.now(), value });
      return value;
    } catch (e) {
      cache.set(key, { at: Date.now(), value: null });
      return null;
    }
  }

  CS.live = { status, providers, clearCache: () => cache.clear() };
})(typeof globalThis !== 'undefined' ? globalThis : self);
