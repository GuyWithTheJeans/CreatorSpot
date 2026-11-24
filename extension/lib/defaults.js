/* Default configuration.
 * FEATURED CREATORS: GuyWithTheJeans and iamDoughnutDude ship with every install and are always part of
 * the rotation (store.js restores them if they go missing). Change the list below to change who is featured;
 * nothing else in the codebase names them. */
(function (root) {
  'use strict';
  const CS = root.CreatorSpot;

  CS.FORMATS = [
    { id: 'spotlight', label: 'Creator Spotlight', description: 'A clean profile card with the creator, platform and message.' },
    { id: 'live', label: 'Live Now', description: 'Shows a LIVE badge, stream title and game when the stream is verified live.' },
    { id: 'gaming', label: 'Gaming Promotion', description: 'Bold, high-energy artwork with your branding and message.' },
    { id: 'motion', label: 'Animated Promotion', description: 'Tasteful motion that draws the eye without flashing.' },
    { id: 'video', label: 'Video Promotion', description: 'Your own short, muted, looping clip with a call to action.' },
  ];

  CS.MODES = [
    { id: 'self', label: 'Promote myself', description: 'Only your own creator profiles are shown.' },
    { id: 'network', label: 'Creator rotation', description: 'Every participating creator gets a fair share of placements.' },
    { id: 'circle', label: 'Creator circle', description: 'Rotate between a group of creators you choose.' },
    { id: 'mixed', label: 'Mixed', description: 'Mostly you, with a share of placements for other creators.' },
  ];

  CS.FEATURED_IDS = ['demo_guywiththejeans', 'demo_iamdoughnutdude'];
  CS.isFeatured = (id) => CS.FEATURED_IDS.includes(id);

  CS.defaultSettings = function defaultSettings() {
    return {
      schema: 1,
      enabled: true,
      theme: 'system',
      mode: 'network',
      mixedOwnShare: 70,
      circle: { name: 'My Creator Circle', members: [], weights: {} },
      excluded: [],
      categories: [],
      replaceRate: 100,
      maxPerCreatorPerHour: 60,
      maxPerPage: 6,
      avoidRepeat: true,
      blockAdRequests: false,
      youtubeCompanion: true,
      compatMode: 'auto',
      animations: true,
      tiktokVideos: true,
      showLabel: true,
      disabledSites: [],
      integrations: { twitch: { clientId: '', token: '' } },
      onboarded: false,
    };
  };

  CS.defaultCreators = function defaultCreators() {
    return [
      {
        id: 'demo_guywiththejeans',
        name: 'GuyWithTheJeans',
        avatar: null,
        accent: '#3B82F6',
        category: 'Gaming',
        bio: 'Laid-back gaming streams, good vibes and great company.',
        isOwn: false,
        participates: true,
        weight: 1,
        featured: true,
        platforms: [{ type: 'twitch', url: 'https://www.twitch.tv/guywiththejeans', handle: 'guywiththejeans' }],
      },
      {
        id: 'demo_iamdoughnutdude',
        name: 'iamDoughnutDude',
        avatar: null,
        accent: '#F472B6',
        category: 'Gaming',
        bio: 'Sweet plays, chaotic fun and a community that always shows up.',
        isOwn: false,
        participates: true,
        weight: 1,
        featured: true,
        platforms: [{ type: 'twitch', url: 'https://www.twitch.tv/iamdoughnutdude', handle: 'iamdoughnutdude' }],
      },
    ];
  };

  CS.defaultCampaigns = function defaultCampaigns() {
    const base = { enabled: true, priority: 3, platformIndex: 0, schedule: { start: '', end: '', days: [] }, media: {} };
    return [
      Object.assign({}, base, {
        id: 'demo_c_gwtj_live',
        creatorId: 'demo_guywiththejeans',
        name: 'Watch me live',
        headline: 'Watch me live on Twitch!',
        message: 'Chill gameplay, real conversations and a chat that feels like home.',
        cta: '',
        format: 'live',
      }),
      Object.assign({}, base, {
        id: 'demo_c_gwtj_gaming',
        creatorId: 'demo_guywiththejeans',
        name: 'Daily gaming content',
        headline: 'Follow for daily gaming content',
        message: 'New streams every week. Hit follow so you never miss one.',
        cta: '',
        format: 'gaming',
      }),
      Object.assign({}, base, {
        id: 'demo_c_idd_community',
        creatorId: 'demo_iamdoughnutdude',
        name: 'Join the community',
        headline: 'Come join our gaming community',
        message: 'Friendly chat, community game nights and plenty of laughs.',
        cta: '',
        format: 'spotlight',
      }),
      Object.assign({}, base, {
        id: 'demo_c_idd_stream',
        creatorId: 'demo_iamdoughnutdude',
        name: 'Next stream',
        headline: 'Catch my next stream!',
        message: 'Grab a snack and come hang out. Doughnuts optional.',
        cta: '',
        format: 'motion',
      }),
    ];
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = CS;
})(typeof globalThis !== 'undefined' ? globalThis : self);
