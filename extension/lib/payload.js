/* Builds the render payload for a creator + campaign. Used by the background (real placements)
 * and by the dashboard (previews), so previews always match what users will see. */
(function (root) {
  'use strict';
  const CS = root.CreatorSpot;

  /**
   * @param creator, campaign  stored records
   * @param settings           current settings
   * @param getMedia           async (id) => dataUrl|null
   * @param live               {live,title,game}|null  (only from a verified provider)
   */
  CS.buildPayload = async function buildPayload(creator, campaign, settings, getMedia, live) {
    const platforms = creator.platforms || [];
    const platform = platforms[campaign.platformIndex] || platforms[0];
    if (!platform || !CS.safeUrl(platform.url)) return null;
    const media = campaign.media || {};
    return {
      creator: {
        id: creator.id,
        name: creator.name,
        accent: creator.accent,
        category: creator.category,
        bio: creator.bio,
        avatarUrl: creator.avatar ? await getMedia(creator.avatar) : null,
      },
      campaign: {
        id: campaign.id,
        format: campaign.format,
        headline: campaign.headline,
        message: campaign.message,
        cta: campaign.cta,
        imageUrl: media.imageId ? await getMedia(media.imageId) : null,
        videoUrl: media.videoId ? await getMedia(media.videoId) : null,
      },
      platform: { type: platform.type, url: CS.safeUrl(platform.url), handle: platform.handle },
      live: live && live.live ? live : null,
      tiktok: settings.tiktokVideos !== false && Array.isArray(campaign.tiktok) && campaign.tiktok.length
        ? campaign.tiktok[Math.floor(Math.random() * campaign.tiktok.length)]
        : null,
      animations: settings.animations !== false,
    };
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
