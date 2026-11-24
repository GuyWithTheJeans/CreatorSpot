/* Platform registry: one adapter per creator platform.
 * Adding a platform = adding one entry here. Nothing else in the codebase hardcodes platforms. */
(function (root) {
  'use strict';
  const CS = root.CreatorSpot;

  // Simplified glyphs (24x24 viewBox), drawn for CreatorSpot, used only to identify the destination.
  const ICONS = {
    twitch:
      '<path fill="currentColor" d="M5 3 3.5 6.5V19h4v2.5h2.4L12.4 19h3.4L20.5 14.3V3H5Zm13.6 10.4-2.8 2.8h-4.1L9.3 18.6v-2.4H6V4.9h12.6v8.5ZM15.6 7.5h-1.8v5h1.8v-5Zm-4.4 0H9.4v5h1.8v-5Z"/>',
    youtube:
      '<path fill="currentColor" d="M21.6 7.2a2.6 2.6 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.6 2.6 0 0 0 2.4 7.2 27 27 0 0 0 2 12a27 27 0 0 0 .4 4.8 2.6 2.6 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.6 2.6 0 0 0 1.8-1.8A27 27 0 0 0 22 12a27 27 0 0 0-.4-4.8ZM10 15V9l5.2 3L10 15Z"/>',
    tiktok:
      '<path fill="currentColor" d="M16.8 3h-3.2v12.3a2.8 2.8 0 1 1-2-2.7V9.3a6 6 0 1 0 5.2 6V9.1a7.6 7.6 0 0 0 4.2 1.3V7.2a4.3 4.3 0 0 1-4.2-4.2Z"/>',
    kick:
      '<path fill="currentColor" d="M4 3h5v5h2V6h2V4h2V3h5v6h-2v2h-2v2h2v2h2v6h-5v-1h-2v-2h-2v-2H9v5H4V3Z"/>',
    discord:
      '<path fill="currentColor" d="M19 5.6A16 16 0 0 0 15 4.4l-.5 1a15 15 0 0 0-5 0l-.5-1A16 16 0 0 0 5 5.6C2.5 9.3 1.8 13 2.1 16.6A16 16 0 0 0 7 19l1-1.6a10 10 0 0 1-1.6-.8l.4-.3a11.5 11.5 0 0 0 10.4 0l.4.3-1.6.8 1 1.6a16 16 0 0 0 4.9-2.4c.4-4.2-.7-7.9-2.9-11ZM8.8 14.4c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Zm6.4 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Z"/>',
    tips:
      '<path fill="currentColor" d="M12 21.2 10.6 20C5.4 15.3 2 12.2 2 8.4 2 5.3 4.4 3 7.5 3c1.7 0 3.4.8 4.5 2.1A6 6 0 0 1 16.5 3C19.6 3 22 5.3 22 8.4c0 3.8-3.4 6.9-8.6 11.6L12 21.2Z"/>',
    website:
      '<path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm6.9 6h-3a15.7 15.7 0 0 0-1.3-3.6A8 8 0 0 1 18.9 8ZM12 4c.8 1.2 1.5 2.5 1.9 4h-3.8c.4-1.5 1.1-2.8 1.9-4ZM4.3 14a8 8 0 0 1 0-4h3.4a16.5 16.5 0 0 0 0 4H4.3Zm.8 2h3c.3 1.3.8 2.5 1.3 3.6A8 8 0 0 1 5.1 16Zm3-8h-3a8 8 0 0 1 4.3-3.6C8.9 5.5 8.4 6.7 8.1 8ZM12 20c-.8-1.2-1.5-2.5-1.9-4h3.8c-.4 1.5-1.1 2.8-1.9 4Zm2.3-6H9.7a14.7 14.7 0 0 1 0-4h4.6a14.7 14.7 0 0 1 0 4Zm.3 5.6c.5-1.1 1-2.3 1.3-3.6h3a8 8 0 0 1-4.3 3.6Zm1.7-5.6a16.5 16.5 0 0 0 0-4h3.4a8 8 0 0 1 0 4h-3.4Z"/>',
  };

  function handleFromPath(hostRe, pathRe) {
    return function parse(url) {
      try {
        const u = new URL(url);
        if (!hostRe.test(u.hostname)) return null;
        const m = u.pathname.match(pathRe);
        return m ? decodeURIComponent(m[1]) : null;
      } catch (e) {
        return null;
      }
    };
  }

  const PLATFORMS = {
    twitch: {
      id: 'twitch',
      label: 'Twitch',
      color: '#9146FF',
      verb: 'Watch on Twitch',
      followVerb: 'Follow on Twitch',
      supportsLive: true,
      placeholder: 'https://www.twitch.tv/yourchannel',
      parseHandle: handleFromPath(/(^|\.)twitch\.tv$/i, /^\/([A-Za-z0-9_]{2,25})\/?$/),
      buildUrl: (h) => 'https://www.twitch.tv/' + encodeURIComponent(h),
    },
    youtube: {
      id: 'youtube',
      label: 'YouTube',
      color: '#FF0033',
      verb: 'Watch on YouTube',
      followVerb: 'Subscribe on YouTube',
      supportsLive: false,
      placeholder: 'https://www.youtube.com/@yourchannel',
      parseHandle: handleFromPath(/(^|\.)youtube\.com$/i, /^\/(@[A-Za-z0-9._-]{3,30}|c\/[^/]+|channel\/[^/]+)\/?$/),
      buildUrl: (h) => 'https://www.youtube.com/' + (h.startsWith('@') ? h : '@' + h),
    },
    tiktok: {
      id: 'tiktok',
      label: 'TikTok',
      color: '#25F4EE',
      verb: 'Watch on TikTok',
      followVerb: 'Follow on TikTok',
      supportsLive: false,
      placeholder: 'https://www.tiktok.com/@yourname',
      parseHandle: handleFromPath(/(^|\.)tiktok\.com$/i, /^\/(@[A-Za-z0-9._]{2,24})\/?$/),
      buildUrl: (h) => 'https://www.tiktok.com/' + (h.startsWith('@') ? h : '@' + h),
    },
    kick: {
      id: 'kick',
      label: 'Kick',
      color: '#53FC18',
      verb: 'Watch on Kick',
      followVerb: 'Follow on Kick',
      supportsLive: false,
      placeholder: 'https://kick.com/yourchannel',
      parseHandle: handleFromPath(/(^|\.)kick\.com$/i, /^\/([A-Za-z0-9_-]{2,25})\/?$/),
      buildUrl: (h) => 'https://kick.com/' + encodeURIComponent(h),
    },
    discord: {
      id: 'discord',
      label: 'Discord',
      color: '#5865F2',
      verb: 'Join the Discord',
      followVerb: 'Join the community',
      supportsLive: false,
      placeholder: 'https://discord.gg/yourinvite',
      parseHandle: handleFromPath(/(^|\.)(discord\.gg|discord\.com)$/i, /^\/(?:invite\/)?([A-Za-z0-9-]{2,32})\/?$/),
      buildUrl: (h) => 'https://discord.gg/' + encodeURIComponent(h),
    },
    // Tip and support pages, so viewers can support a creator straight from a promo.
    tips: {
      id: 'tips',
      label: 'Tips',
      color: '#F472B6',
      verb: 'Send a tip',
      followVerb: 'Support me',
      supportsLive: false,
      placeholder: 'https://streamlabs.com/yourname/tip',
      parseHandle: (url) => {
        try {
          const u = new URL(url);
          const host = u.hostname.replace(/^www./, '').toLowerCase();
          const parts = u.pathname.split('/').filter(Boolean);
          if ((host === 'streamlabs.com' || host === 'streamelements.com') && parts[1] === 'tip') return parts[0];
          if (['ko-fi.com', 'buymeacoffee.com', 'paypal.me', 'patreon.com', 'tiltify.com'].includes(host) && parts[0]) return parts[0];
          return null;
        } catch (e) {
          return null;
        }
      },
      buildUrl: (h) => 'https://streamlabs.com/' + encodeURIComponent(h) + '/tip',
    },
    website: {
      id: 'website',
      label: 'Website',
      color: '#6366F1',
      verb: 'Visit website',
      followVerb: 'Visit website',
      supportsLive: false,
      placeholder: 'https://example.com',
      parseHandle: (url) => {
        try {
          return new URL(url).hostname.replace(/^www\./, '');
        } catch (e) {
          return null;
        }
      },
      buildUrl: (h) => 'https://' + h,
    },
  };

  /** TikTok background videos: IDs from pasted video links, and TikTok's official embed player. */
  CS.tiktok = {
    /** "https://www.tiktok.com/@name/video/7312345678901234567?..." (or just the number) -> "7312345678901234567" */
    idFrom(text) {
      const s = String(text || '').trim();
      const m = s.match(/tiktok\.com\/(?:@[^/\s]+\/video|embed(?:\/v2)?|player\/v1)\/(\d{10,25})/i) || s.match(/^(\d{10,25})$/);
      return m ? m[1] : null;
    },
    ids(list) {
      return [...new Set((Array.isArray(list) ? list : []).map((x) => CS.tiktok.idFrom(x)).filter(Boolean))].slice(0, 10);
    },
    playerUrl(id) {
      return 'https://www.tiktok.com/player/v1/' + encodeURIComponent(id) +
        '?autoplay=1&muted=1&loop=1&controls=0&progress_bar=0&play_button=0&volume_control=0&fullscreen_button=0' +
        '&timestamp=0&music_info=0&description=0&rel=0&native_context_menu=0&closed_caption=0';
    },
    videoUrl: (id) => 'https://www.tiktok.com/video/' + encodeURIComponent(id),
  };

  CS.platforms = {
    all: () => Object.values(PLATFORMS),
    get: (id) => PLATFORMS[id] || PLATFORMS.website,
    icon: (id, size) =>
      '<svg viewBox="0 0 24 24" width="' + (size || 16) + '" height="' + (size || 16) + '" aria-hidden="true">' + (ICONS[id] || ICONS.website) + '</svg>',
    /** Guess the platform from a URL so creators can just paste a link. */
    detect(url) {
      const safe = CS.safeUrl(url);
      if (!safe) return null;
      for (const p of Object.values(PLATFORMS)) {
        if (p.id === 'website') continue;
        const handle = p.parseHandle(safe);
        if (handle) return { type: p.id, url: safe, handle };
      }
      return { type: 'website', url: safe, handle: PLATFORMS.website.parseHandle(safe) };
    },
    /** Normalise a platform link from user input; returns null if it is not a safe URL. */
    normalise(link) {
      if (!link) return null;
      const url = CS.safeUrl(link.url);
      if (!url) return null;
      const type = PLATFORMS[link.type] ? link.type : CS.platforms.detect(url).type;
      const handle = (link.handle && String(link.handle).trim()) || PLATFORMS[type].parseHandle(url) || '';
      return { type, url, handle };
    },
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = CS.platforms;
})(typeof globalThis !== 'undefined' ? globalThis : self);
