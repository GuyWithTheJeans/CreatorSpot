/* CreatorSpot accounts (Supabase). Creators sign in with Twitch and edit their profile in the dashboard;
 * every install downloads all visible profiles every few minutes, so everyone sees the same creators.
 * This file holds the settings and the pure conversions between the online rows and local creators. */
(function (root) {
  'use strict';
  const CS = root.CreatorSpot;

  CS.CLOUD = {
    url: 'https://mofktqetaskhsxfgrmpw.supabase.co',
    // Publishable key: designed to ship inside apps. Access is limited by the database's row-level security.
    key: 'sb_publishable_normQ1lgME-egrTCymYVuw_J2L1lLrx',
  };
  // Featured creators keep their built-in IDs, so their history and settings carry over.
  CS.FEATURED_LOGINS = { guywiththejeans: 'demo_guywiththejeans', iamdoughnutdude: 'demo_iamdoughnutdude' };

  const MEDIA_PREFIX = CS.CLOUD.url + '/storage/v1/object/public/media/';
  const idOk = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v);
  const uuidOk = (v) => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v);

  const cloud = {
    SYNC_EVERY_MS: 50 * 1000,
    MEDIA_PREFIX,
    COLUMNS: 'id,twitch_login,name,bio,accent,category,avatar_url,platforms,campaigns,featured,updated_at',

    /** Pictures and videos may only come from CreatorSpot's own storage or Twitch's image server. */
    mediaOk(u) {
      return typeof u === 'string' && u.length < 600 && (u.startsWith(MEDIA_PREFIX) || /^https:\/\/static-cdn\.jtvnw\.net\//.test(u));
    },

    localId(row) {
      const featured = row.featured && CS.FEATURED_LOGINS[row.twitch_login];
      return featured || 'net_' + String(row.id).replace(/-/g, '');
    },

    /**
     * Online rows -> validated local creators and campaigns, plus the media each one wants downloaded.
     * @returns {creators, campaigns, media: [{url, creatorId?, campaignId?, field}]}
     */
    toLocal(rows) {
      const creators = [];
      const campaigns = [];
      const media = [];
      const usedCampaignIds = new Set();
      (Array.isArray(rows) ? rows : []).slice(0, 2000).forEach((row) => {
        if (!row || !uuidOk(row.id)) return;
        const id = cloud.localId(row);
        if (creators.some((c) => c.id === id)) return;
        const c = CS.schema.creator({
          id,
          name: row.name,
          accent: row.accent,
          category: row.category,
          bio: row.bio,
          platforms: Array.isArray(row.platforms) ? row.platforms : [],
          participates: true,
          isOwn: false,
        });
        if (!c || !c.platforms.length) return;
        c.cloudId = row.id;
        c.twitchLogin = row.twitch_login;
        creators.push(c);
        if (cloud.mediaOk(row.avatar_url)) media.push({ url: row.avatar_url, creatorId: id, field: 'avatar' });

        let list = (Array.isArray(row.campaigns) ? row.campaigns : []).slice(0, 20);
        if (!list.length) {
          // Nothing set up yet: featured creators keep their built-in promos, everyone else gets a simple one.
          const builtIn = CS.defaultCampaigns().filter((d) => d.creatorId === id);
          list = builtIn.length
            ? builtIn
            : [{ id: id + '_auto', name: 'Watch me live', headline: 'Come hang out on ' + CS.platforms.get(c.platforms[0].type).label + '!', message: c.bio, format: 'spotlight' }];
        }
        list.forEach((raw, i) => {
          if (!raw || typeof raw !== 'object') return;
          let cid = idOk(raw.id) ? raw.id : id + '_c' + i;
          if (usedCampaignIds.has(cid)) cid = (id + '_' + cid).slice(0, 64);
          if (usedCampaignIds.has(cid)) return;
          const cp = CS.schema.campaign(Object.assign({}, raw, { id: cid, creatorId: id, media: {} }), [id]);
          if (!cp) return;
          usedCampaignIds.add(cid);
          campaigns.push(cp);
          if (cloud.mediaOk(raw.image)) media.push({ url: raw.image, campaignId: cid, field: 'imageId' });
          if (cloud.mediaOk(raw.video)) media.push({ url: raw.video, campaignId: cid, field: 'videoId' });
        });
      });
      return { creators, campaigns, media };
    },

    /** Local creator + campaigns -> the fields a creator may save online. `urlFor(mediaId)` gives uploaded URLs. */
    toRemote(creator, campaigns, urlFor) {
      const own = campaigns.filter((cp) => cp.creatorId === creator.id).slice(0, 20);
      return {
        name: creator.name,
        bio: creator.bio || '',
        accent: creator.accent,
        category: creator.category || 'Gaming',
        platforms: creator.platforms.map((p) => ({ type: p.type, url: p.url })),
        avatar_url: creator.avatar ? urlFor(creator.avatar) || undefined : null,
        campaigns: own.map((cp) => ({
          id: cp.id,
          name: cp.name,
          headline: cp.headline,
          message: cp.message,
          cta: cp.cta,
          format: cp.format,
          platformIndex: cp.platformIndex,
          priority: cp.priority,
          enabled: cp.enabled,
          schedule: cp.schedule,
          image: (cp.media && cp.media.imageId && urlFor(cp.media.imageId)) || null,
          video: (cp.media && cp.media.videoId && urlFor(cp.media.videoId)) || null,
        })),
      };
    },
  };

  CS.cloud = cloud;
  if (typeof module !== 'undefined' && module.exports) module.exports = cloud;
})(typeof globalThis !== 'undefined' ? globalThis : self);
