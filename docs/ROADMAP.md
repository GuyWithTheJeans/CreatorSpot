# Roadmap: from MVP to the CreatorSpot network

The MVP is deliberately serverless: the rotation engine runs in each browser over the creators that user has configured. The next steps turn that into a shared network.

## Next (Stage 4a): the shared network
1. **Backend service** (suggested stack: a small TypeScript API on a managed Postgres, such as Supabase or Neon, plus an edge cache).
   * `creators`, `platform_links`, `campaigns`, `media` (object storage), `circles`, `circle_members`, `network_participation`.
   * Public read API: "the current network pool" as a signed, cacheable JSON feed. The extension's rotation engine already takes a creator pool as input, so a `RemotePoolProvider` slots in beside local profiles without engine changes.
2. **Creator accounts** with Twitch and YouTube OAuth, which proves channel ownership, so creators can only publish promotions for channels they control.
3. **Live-status proxy**: the server holds the Twitch client secret, batches `GET /streams` for every network creator, and publishes the results in the pool feed. This removes the need for users to supply credentials.
4. **Aggregated, privacy-preserving analytics**: the extension sends daily counts per campaign (no URLs, no user IDs), batched and rate-limited, so creators see network-wide exposure. Abuse controls: per-install rate limits, anomaly detection, and no rewards tied to raw impressions.
5. **Moderation**: review queue for new campaigns (text and media), reporting from the promotion card, and category rules.

## Later
* Remote site-adapter updates (signed selector lists) so new ad markup is supported without an extension release.
* QR-code variant for large and video-adjacent placements.
* Geographic and language preferences (creator opt-in only).
* Premium: extra templates, advanced scheduling, multi-channel profiles, private circles at scale.
* Paid placements: sponsored creator campaigns with transparent labelling and spend caps.
* Exchange: creators earn rotation credit by hosting the network in their own viewers' browsers (measured with the same honest viewability rule).
