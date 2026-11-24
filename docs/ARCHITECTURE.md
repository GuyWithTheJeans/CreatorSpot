# CreatorSpot — Phase 1: Feasibility and Architecture

## 1. Feasibility findings

| Question | Finding | Decision |
|---|---|---|
| Can an extension find ad placements on ordinary websites? | Yes. Content scripts can read the DOM of any page they are allowed on. Ad slots carry stable, industry-standard markers (`ins.adsbygoogle`, `div[id^="div-gpt-ad"]`, `iframe[id^="google_ads_iframe"]`, `[data-ad-slot]`, etc.). | Selector-based **placement adapters** plus size checks. |
| Can we render our own content in that slot? | Yes. We hide the slot's original children with CSS and insert a host element that uses **Shadow DOM**, so the site's CSS cannot break our layout and ours cannot leak into the site. | Shadow-DOM renderer with size-aware layouts. |
| Is it honest towards advertisers? | A hidden ad still runs its own viewability measurement, which records it as *not viewed*. Nothing is faked or inflated. | Real-site testing showed that blocking ad networks makes most publishers collapse their slots, which left nothing to replace on Dictionary.com. **Decision:** ads are hidden by default, and an optional **declarativeNetRequest** ruleset ("Stop ad networks from loading") blocks them entirely for users who prefer that. |
| Can we replace YouTube **video** (in-player) ads? | No, not in a compliant way. In-player ads are part of YouTube's player and streaming pipeline. Changing, skipping or covering them means interfering with the player, which YouTube's Terms of Service prohibit and which YouTube actively counters. | **Not implemented, on purpose.** Compliant alternative: while YouTube shows a video ad, a clearly labeled **adjacent creator card** appears next to the player. The video ad itself is left alone. YouTube's *display* slots (feed and sidebar ad renderers) are replaced in the same way as other website ads. |
| Can we show a verified **LIVE** badge? | Twitch Helix `GET /streams` requires a Client ID and an app access token. A client secret can never ship inside an extension. | LIVE is shown **only** when verified. The extension includes an optional Twitch live-status integration, which works with credentials the user provides. A shared backend proxy is the Stage 4 solution. Without verification, the "Live Now" format falls back to "Watch on Twitch" and never claims the creator is live. |
| Profile pictures from Twitch? | Same API restriction. | Creators upload an avatar in the dashboard; a branded monogram is used otherwise. |
| Cross-browser? | Chrome, Brave, Edge and Opera are Chromium-based and run the same MV3 package. Firefox (121+) supports MV3, using `background.scripts` instead of `service_worker` and the `browser.*` namespace. | One codebase: a `browser`/`chrome` shim, a manifest that declares both background keys, and `browser_specific_settings` for Firefox. |
| Brave Shields | Brave hides ad slots itself (cosmetic filtering), so the slot can be invisible before we see it. | **Ad-blocker compatibility mode** (automatic in Brave): for slots with explicit ad markers that were hidden, the promotion is placed beside the hidden slot. |
| Page security policies (CSP) | Some sites block `data:` images. | Images fall back to monogram avatars automatically. |

## 2. Component map (provider-adapter architecture)

```
extension/
  lib/core.js        Namespace, browser API shim, IDs, URL safety, helpers
  lib/platforms.js   PLATFORM REGISTRY: Twitch, YouTube, TikTok, Kick, Discord, Website.
                     Each adapter = { id, label, color, icon, parseUrl(), buildUrl(), cta }
  lib/defaults.js    Default demo configuration (data only, fully editable/removable)
  lib/schema.js      Data validation + migrations
  lib/rotation.js    ROTATION ENGINE (pure, no browser APIs; unit-tested)
  lib/render.js      PROMOTION RENDERER: templates × layouts (shared by pages + dashboard preview)
  lib/store.js       Storage access (chrome.storage.local) + analytics aggregation
  lib/live.js        LIVE-STATUS PROVIDERS (Twitch Helix; pluggable)
  content/sites.js   SITE ADAPTERS: generic, YouTube (+ future adapters)
  content/detector.js PLACEMENT RECOGNITION (size, visibility, nesting, Brave mode)
  content/content.js Orchestration: detect → request promo → render → measure
  background.js      Message router, serialised rotation decisions, DNR toggle, onboarding
  popup/, dashboard/, onboarding/  UI built on ui/design.css (design system)
  rules/ad_networks.json  Static DNR ruleset (ad networks only)
```

Each layer only talks to the next one through plain data:

* **Site adapter** → list of `Placement {element, size, kind}`
* **Content script** → background: `getPromo({size, kind, host, shownOnPage})`
* **Rotation engine** → `{creator, campaign, platform, url, live?}`
* **Renderer** → DOM inside a shadow root
* **Analytics** ← `impression` (≥ 50% visible for ≥ 1 s) and `click` events

If YouTube changes its markup, only `content/sites.js` changes. If Twitch changes its API, only `lib/platforms.js` / `lib/live.js` change. The rotation engine knows nothing about websites or platforms.

## 3. Data model (chrome.storage.local)

```
settings  { enabled, theme, mode: self|network|circle|mixed, mixedOwnShare,
            circle: {name, members[], weights{}}, excluded[], categories[],
            replaceRate, maxPerCreatorPerHour, maxPerPage, avoidRepeat,
            blockAdRequests, youtubeCompanion, compatMode: auto|on|off,
            disabledSites[], animations, integrations{twitch:{clientId, token}}, onboarded }
creators  [{ id, name, avatar?, accent, category, bio, isOwn, participates,
             weight, platforms:[{type, url, handle}] }]
campaigns [{ id, creatorId, name, headline, message, cta, format, platformIndex,
             priority 1–5, enabled, schedule:{start?, end?, days[]}, media:{imageId?, videoId?} }]
media:<id>   data URL (uploads; kept out of the settings object)
rotation  { served{creatorId}, campaignServed{}, recent[{c, t}], last, ownServed, totalServed }
stats     { "YYYY-MM-DD": { campaignId: {i, c} } }   (90-day retention, local only)
```

Stage 4 adds a backend (accounts, OAuth for Twitch/YouTube, shared network pool, live-status proxy). The engine already takes the creator pool as input, so a remote pool plugs in without engine changes.

## 4. Rotation algorithm

1. **Eligibility**: campaign enabled, inside schedule, creator in the active pool for the mode, creator not excluded, category filter, hourly frequency cap not reached.
2. **Mode**: `self` = own creators; `network` = every participating creator; `circle` = circle members; `mixed` = own creators get a target share (e.g. 70%) chosen by deficit, not randomness, so the share is exact over time.
3. **Fair creator choice** — *start-time fair queuing*: each creator has a virtual counter `served / weight`; the lowest wins. New creators start at the current minimum, so they cannot flood the network. The engine avoids back-to-back repeats and creators already shown on the same page.
4. **Campaign choice** within the creator: lowest `served / priority`.
5. The engine is deterministic, so fairness is proven by unit tests (`tests/rotation.test.js`).

## 5. Privacy

* No remote servers in the MVP. Everything stays in local browser storage.
* No browsing history is stored; analytics are counts per campaign per day.
* The only network requests the extension makes are optional Twitch live-status checks, and only after the user enters credentials and grants `api.twitch.tv` access.
