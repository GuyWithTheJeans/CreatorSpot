/* Shared profiles: the featured creators' profiles and campaigns live in one file on GitHub
 * (profiles/featured.json). Every install downloads it every few minutes, so when a featured creator
 * updates that file, everyone sees the change. Only data is downloaded; nothing about the user is sent.
 * Also checks the version number on GitHub to tell people when a newer CreatorSpot is out. */
(function (root) {
  'use strict';
  const CS = root.CreatorSpot;

  // The GitHub repository that hosts CreatorSpot. Change this one line if the repository moves.
  CS.GITHUB_REPO = 'GuyWithTheJeans/CreatorSpot';
  const BRANCH = 'main';
  const FILE = 'profiles/featured.json';

  const shared = {
    SYNC_EVERY_MS: 3 * 60 * 1000,
    UPDATE_EVERY_MS: 60 * 60 * 1000,
    configured: () => !/^OWNER\//.test(CS.GITHUB_REPO),
    rawUrl: (file) => 'https://raw.githubusercontent.com/' + CS.GITHUB_REPO + '/' + BRANCH + '/' + file,
    fileUrl: () => shared.rawUrl(FILE),
    editUrl: () => 'https://github.com/' + CS.GITHUB_REPO + '/edit/' + BRANCH + '/' + FILE,
    manifestUrl: () => shared.rawUrl('extension/manifest.json'),
    /** Permanent link to the newest ready-to-install ZIP (works for Chrome, Brave and Edge). */
    downloadUrl: () => 'https://github.com/' + CS.GITHUB_REPO + '/raw/' + BRANCH + '/downloads/CreatorSpot-for-Chrome.zip',

    /**
     * Turn the human-friendly file into validated creators and campaigns.
     * File format: { "creators": [ { id, name, accent, category, bio, avatar?, platforms: [{type, url}], campaigns: [...] } ] }
     * Only featured creators are accepted. Returns null when the file is unusable.
     */
    parse(json) {
      if (!json || !Array.isArray(json.creators)) return null;
      const creators = [];
      const campaigns = [];
      const avatars = {};
      json.creators.forEach((raw) => {
        if (!raw || !CS.isFeatured(raw.id) || creators.some((c) => c.id === raw.id)) return;
        const c = CS.schema.creator(Object.assign({}, raw, { avatar: null, isOwn: false }));
        if (!c) return;
        creators.push(c);
        if (typeof raw.avatar === 'string' && /^[A-Za-z0-9_./-]{1,200}\.(png|jpe?g|webp|gif)$/i.test(raw.avatar) && !raw.avatar.includes('..')) {
          avatars[c.id] = raw.avatar;
        }
        (Array.isArray(raw.campaigns) ? raw.campaigns : []).slice(0, 20).forEach((cp, i) => {
          const id = typeof cp.id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(cp.id) ? cp.id : c.id + '_c' + i;
          const v = CS.schema.campaign(Object.assign({}, cp, { id, creatorId: c.id, enabled: true, media: {} }), [c.id]);
          if (v) campaigns.push(v);
        });
      });
      if (!creators.length) return null;
      return { creators, campaigns, avatars };
    },

    /** Compare dotted versions: 1 if a > b, -1 if a < b, 0 if equal. */
    compareVersions(a, b) {
      const pa = String(a).replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
      const pb = String(b).replace(/^v/i, '').split('.').map((n) => parseInt(n, 10) || 0);
      for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const d = (pa[i] || 0) - (pb[i] || 0);
        if (d) return d > 0 ? 1 : -1;
      }
      return 0;
    },
  };

  CS.shared = shared;
  if (typeof module !== 'undefined' && module.exports) module.exports = shared;
})(typeof globalThis !== 'undefined' ? globalThis : self);
