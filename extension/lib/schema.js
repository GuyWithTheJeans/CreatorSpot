/* Validation for everything that enters storage (dashboard edits and imported files). */
(function (root) {
  'use strict';
  const CS = root.CreatorSpot;

  const str = (v, max, fallback) => {
    const s = typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim() : '';
    return (s || (fallback == null ? '' : fallback)).slice(0, max);
  };
  const num = (v, lo, hi, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) ? CS.clamp(Math.round(n), lo, hi) : fallback;
  };
  const color = (v, fallback) => (/^#[0-9a-f]{6}$/i.test(v || '') ? v : fallback);
  const idOk = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v);
  const mediaRef = (v) => (typeof v === 'string' && /^media_[A-Za-z0-9_]+$/.test(v) ? v : null);
  const dateOk = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');

  CS.schema = {
    creator(c) {
      if (!c || typeof c !== 'object') return null;
      const platforms = (Array.isArray(c.platforms) ? c.platforms : [])
        .map((p) => CS.platforms.normalise(p))
        .filter(Boolean)
        .slice(0, 10);
      const name = str(c.name, 40);
      if (!name) return null;
      const id = idOk(c.id) ? c.id : CS.uid('cr');
      const featured = CS.isFeatured(id);
      return {
        id,
        name,
        avatar: mediaRef(c.avatar),
        accent: color(c.accent, '#7C5CFF'),
        category: str(c.category, 30, 'Gaming'),
        bio: str(c.bio, 160),
        isOwn: !!c.isOwn,
        participates: featured || c.participates !== false,
        weight: num(c.weight, 1, 5, 1),
        featured,
        platforms,
      };
    },

    campaign(c, creatorIds) {
      if (!c || typeof c !== 'object') return null;
      if (!idOk(c.creatorId) || (creatorIds && !creatorIds.includes(c.creatorId))) return null;
      const formats = CS.FORMATS.map((f) => f.id);
      const sched = c.schedule || {};
      return {
        id: idOk(c.id) ? c.id : CS.uid('cp'),
        creatorId: c.creatorId,
        name: str(c.name, 50, 'Untitled campaign'),
        headline: str(c.headline, 60),
        message: str(c.message, 140),
        cta: str(c.cta, 24),
        format: formats.includes(c.format) ? c.format : 'spotlight',
        platformIndex: num(c.platformIndex, 0, 9, 0),
        priority: num(c.priority, 1, 5, 3),
        enabled: c.enabled !== false,
        schedule: {
          start: dateOk(sched.start),
          end: dateOk(sched.end),
          days: Array.isArray(sched.days) ? [...new Set(sched.days.map(Number).filter((d) => d >= 0 && d <= 6))] : [],
        },
        media: { imageId: mediaRef(c.media && c.media.imageId), videoId: mediaRef(c.media && c.media.videoId) },
        tiktok: CS.tiktok ? CS.tiktok.ids(c.tiktok) : [],
      };
    },

    settings(s) {
      const d = CS.defaultSettings();
      if (!s || typeof s !== 'object') return d;
      const modes = CS.MODES.map((m) => m.id);
      const ids = (a) => (Array.isArray(a) ? a.filter(idOk).slice(0, 5000) : []);
      const circle = s.circle || {};
      const weights = {};
      Object.entries(circle.weights || {}).forEach(([k, v]) => {
        if (idOk(k)) weights[k] = num(v, 1, 5, 1);
      });
      const tw = (s.integrations && s.integrations.twitch) || {};
      return {
        schema: 1,
        enabled: s.enabled !== false,
        theme: ['system', 'light', 'dark'].includes(s.theme) ? s.theme : d.theme,
        mode: modes.includes(s.mode) ? s.mode : d.mode,
        mixedOwnShare: num(s.mixedOwnShare, 0, 100, d.mixedOwnShare),
        circle: { name: str(circle.name, 40, d.circle.name), members: ids(circle.members), weights },
        excluded: ids(s.excluded),
        categories: (Array.isArray(s.categories) ? s.categories : []).map((x) => str(x, 30)).filter(Boolean).slice(0, 20),
        replaceRate: num(s.replaceRate, 0, 100, d.replaceRate),
        maxPerCreatorPerHour: num(s.maxPerCreatorPerHour, 1, 1000, d.maxPerCreatorPerHour),
        maxPerPage: num(s.maxPerPage, 1, 30, d.maxPerPage),
        avoidRepeat: s.avoidRepeat !== false,
        blockAdRequests: s.blockAdRequests === true,
        youtubeCompanion: s.youtubeCompanion !== false,
        compatMode: ['auto', 'on', 'off'].includes(s.compatMode) ? s.compatMode : d.compatMode,
        animations: s.animations !== false,
        tiktokVideos: s.tiktokVideos !== false,
        showLabel: true, // Disclosure label is always on.
        disabledSites: (Array.isArray(s.disabledSites) ? s.disabledSites : [])
          .map((h) => str(h, 253).toLowerCase())
          .filter((h) => /^[a-z0-9.-]+$/.test(h))
          .slice(0, 1000),
        integrations: { twitch: { clientId: str(tw.clientId, 64), token: str(tw.token, 128) } },
        onboarded: !!s.onboarded,
      };
    },
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = CS.schema;
})(typeof globalThis !== 'undefined' ? globalThis : self);
