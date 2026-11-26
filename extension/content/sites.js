/* Site adapters. Each adapter describes how ad placements look on a family of sites.
 * When a site changes its markup, only its adapter needs updating. */
(function (root) {
  'use strict';
  const CS = root.CreatorSpot;

  // Industry-standard ad markers. "strong" = certainly an ad slot, even when empty or hidden.
  const STRONG = [
    'ins.adsbygoogle',
    'div[id^="div-gpt-ad"]',
    'div[id^="google_ads_iframe"]',
    'iframe[id^="google_ads_iframe"]',
    'iframe[src*="doubleclick.net"]',
    'iframe[src*="googlesyndication.com"]',
    'iframe[src*="amazon-adsystem.com"]',
    'iframe[id^="aswift_"]',
    '[data-google-query-id]',
    '[data-ad-slot]',
    '[data-ad-unit-path]',
    // Ad iframes from other major exchanges, and Google SafeFrames.
    'iframe[name^="google_ads_iframe"]',
    'iframe[src*="adnxs.com"]',
    'iframe[src*="criteo.com"]',
    'iframe[src*="pubmatic.com"]',
    'iframe[src*="rubiconproject.com"]',
    'iframe[src*="openx.net"]',
    'iframe[title="3rd party ad content"]',
    'iframe[aria-label="Advertisement"]',
    // Ad management platforms used by many independent publishers.
    '[id^="ezoic-pub-ad-placeholder"]', 'span.ezoic-ad', '.ezoic-ad',
    '[id^="AdThrive_"]', '.adthrive-ad',
    '.mv-ad-box', '[data-mv-ad]',
    '[data-freestar-ad]', '.freestar-ad',
    '[data-pw-desk]', '[data-pw-mobi]',
    'div[id^="amzn-assoc-ad"]',
  ];

  // Common naming conventions. Only used when the element is visible and ad-sized (and not full of text).
  const WEAK = [
    '.ad-slot', '.adslot', '.ad-container', '.ad-wrapper', '.ad-unit', '.advertisement', '.ad-banner',
    '.ad-leaderboard', '.ad-sidebar', '.ad-box', '.adbox', '.ad-placement', '.ad-zone', '.sponsored-ad',
    '.top-ad', '.sidebar-ad', '.leaderboard-ad', '.banner-ad', '.sticky-ad', '.adhesion', '.ad-sticky',
    '[id^="ad-slot"]', '[id^="adslot"]', '[id^="ad-container"]', '[id^="ad_container"]',
    '[class*="AdSlot"]', '[class*="AdContainer"]', '[class*="adSlot"]',
    '[aria-label="Advertisement"]', '[aria-label="advertisement"]', '[aria-label="Sponsored"]',
    '[data-ad]', '[data-adunit]', '[data-adslot]', '[data-ad-type]', '[data-ad-placement]', '[data-ad-position]',
  ];

  // Containers that should be claimed instead of the iframe inside them.
  const CONTAINERS =
    'ins.adsbygoogle, div[id^="div-gpt-ad"], [data-ad-slot], [data-google-query-id], [id^="ezoic-pub-ad-placeholder"], ' +
    '[id^="AdThrive_"], .adthrive-ad, .mv-ad-box, [data-freestar-ad], [data-pw-desk], [data-pw-mobi], ' +
    WEAK.join(', ');

  const generic = {
    id: 'generic',
    matches: () => true,
    strong: STRONG,
    weak: WEAK,
    containers: CONTAINERS,
  };

  const youtube = {
    id: 'youtube',
    matches: (host) => /(^|\.)youtube\.com$/.test(host),
    // YouTube display ad renderers (feed, search, sidebar). The video player itself is never touched.
    strong: [
      'ytd-ad-slot-renderer',
      'ytd-in-feed-ad-layout-renderer',
      'ytd-promoted-sparkles-web-renderer',
      'ytd-promoted-video-renderer',
      'ytd-display-ad-renderer',
      'ytd-companion-slot-renderer',
      'ytd-action-companion-ad-renderer',
      'ytd-banner-promo-renderer',
      '#masthead-ad',
      '#player-ads',
      // Newer spots: the "ads" panel above the related videos (companion banners from mid-roll ads).
      'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-ads"]',
      'ytd-ads-engagement-panel-content-renderer',
      'ytd-player-legacy-desktop-watch-ads-renderer',
    ],
    weak: [],
    containers: 'ytd-ad-slot-renderer, ytd-in-feed-ad-layout-renderer, ytd-companion-slot-renderer, #player-ads, #masthead-ad, ' +
      'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-ads"]',
    /**
     * Catch-all for ad boxes YouTube renames: anything in the sidebar wearing YouTube's own "Sponsored"
     * badge component. We claim the whole sidebar block that holds the badge (never the player).
     */
    extra: () => {
      const out = [];
      document.querySelectorAll(
        '#secondary :is(ad-badge-view-model, feed-ad-metadata-view-model, .ytwAdBadgeViewModelHost, .ytwFeedAdMetadataViewModelHost)'
      ).forEach((badge) => {
        if (badge.closest('#movie_player')) return;
        let block = badge;
        while (block.parentElement && !block.parentElement.matches('#secondary-inner, #panels, #related, #items, #contents, #secondary')) {
          block = block.parentElement;
        }
        if (block.parentElement && block !== badge && !block.matches('#related, #items, #contents, #panels')) out.push(block);
      });
      return out;
    },
    /** Video ads: report whether a video ad is playing. We only observe a CSS class; we never modify the player. */
    videoAdPlaying: () => !!document.querySelector('#movie_player.ad-showing'),
    /** Where an adjacent (not replacing) creator card can be shown while a video ad plays. */
    companionAnchor: () => {
      const side = document.querySelector('#secondary-inner, #secondary');
      if (side && side.getBoundingClientRect().width >= 250) return { parent: side, width: side.getBoundingClientRect().width };
      const below = document.querySelector('#below');
      if (below && below.getBoundingClientRect().width >= 250) return { parent: below, width: Math.min(below.getBoundingClientRect().width, 728) };
      return null;
    },
  };

  const ADAPTERS = [youtube, generic];

  CS.sites = {
    forHost(host) {
      const specific = ADAPTERS.find((a) => a !== generic && a.matches(host));
      if (!specific) return generic;
      // Site-specific adapters also get the generic markers (sites often embed standard ad tags too).
      return Object.assign({}, specific, {
        strong: specific.strong.concat(generic.strong),
        weak: specific.weak,
        containers: specific.containers + ', ' + generic.containers,
      });
    },
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
