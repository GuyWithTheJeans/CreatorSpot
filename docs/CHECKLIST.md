# Development checklist

Status key: **Done** = implemented *and* verified by an automated test or a recorded real-browser check. **Built, untested** = code exists but has not been verified. **Blocked** = not possible for platform or policy reasons; the compliant alternative is listed.

Last verified: 22 November 2026, with Chrome 157, Edge 158 and Brave 1.100 (Chromium 158) on Windows 11.

## Stage 1: Prove the extension works

| Item | Status | Evidence |
|---|---|---|
| Installable Manifest V3 extension (no build step) | Done | Loads in Chrome, Edge and Brave (`tools/e2e.mjs`) |
| Ad placement detection (AdSense, Google Ad Manager/GPT, ad iframes, `data-ad-*`, common class names) | Done | 8 of 8 slots on the test site |
| Replacement keeps the original slot size | Done | 728×90, 300×250, 160×600, 970×250, 320×50, 300×600, 336×280 |
| Lazy-loaded ads (inserted after page load) | Done | Mutation-observer test |
| Real content is never replaced (ad-like class names with real text) | Done | False-positive test |
| Slots the site itself hides stay hidden | Done | Hidden-slot test |
| Turning off restores the page instantly, without reloading | Done | Live switch-off test |
| Real websites | Done (sample) | Dictionary.com 5, Thesaurus.com 4, IGN 5, Speedtest.net 5 replacements (`tools/real-sites.mjs`). AccuWeather, Merriam-Webster and GameSpot block headless test browsers, so they are untested rather than failing. |
| YouTube display ad slots (sidebar, feed) | Done | Replaced on the real youtube.com page (`tools/youtube-check.mjs`) |
| YouTube **video** (in-player) ad replacement | **Blocked (by design)** | Changing YouTube's player breaks YouTube's Terms of Service. Compliant alternative, implemented and verified: an adjacent creator card, labeled "Shown alongside this ad", appears next to the player while an ad plays and disappears afterwards. The player is not touched. |

## Stage 2: Our two creators

| Item | Status | Evidence |
|---|---|---|
| GuyWithTheJeans and iamDoughnutDude as permanent featured creators on every install (always in rotation, in every mode; cannot be removed, excluded or paused) | Done | Unit tests plus e2e |
| "Promote myself" with no own channel no longer shows nothing (featured creators always run) | Done | Unit test; reproduced and fixed on IGN in Brave at 2000px |
| Full-width banners on large screens (e.g. IGN's 1990px masthead) | Done | `tools/site-check.mjs` |
| Both creators displayed | Done | e2e |
| Clicking opens the correct Twitch channel in a new tab | Done | e2e clicks a promotion and checks the new tab's URL |
| Automatic rotation (on a page and across page loads) | Done | e2e: strict alternation |
| Frequency settings (share of slots replaced, per-page cap, hourly cap per creator) | Done | e2e (50% → 4 of 8; cap of 6) plus unit tests |
| Profiles replaceable without code changes | Done | e2e swaps in a different creator through settings; unit tests |

## Stage 3: Polish

| Item | Status | Evidence |
|---|---|---|
| Five formats: Spotlight, Live Now, Gaming, Animated, Video | Done | Rendered in e2e; Video falls back to Gaming without an upload |
| Size-aware layouts (strip, card, tall, wide) | Done | Layout and overflow checks in e2e |
| Names fit without being cut off; text stays inside the promotion | Done | e2e measurement checks |
| Disclosure label on every promotion ("Creator promo") | Done | e2e |
| Reduced-motion support | Done (code review) | `prefers-reduced-motion` turns off all animation |
| Popup, dashboard, onboarding, privacy policy | Done | Screenshots in `test-results/`, reviewed |
| Dark and light themes | Done (dark verified visually) | The light theme uses the same tokens; give it a visual pass before store screenshots |
| Settings persist | Done | Unit tests plus e2e |
| Brave with Shields on | Done | e2e: "Brave default" check |
| Firefox | **Built, untested** | Manifest declares `background.scripts` and the Gecko ID; Firefox is not installed on the test machine |

## Stage 4: Platform (started only where cheap; the core came first)

| Item | Status | Notes |
|---|---|---|
| Multi-platform links (Twitch, YouTube, TikTok, Kick, Discord, website) | Done | Unit-tested link detection |
| Creator Circle mode with weights; exclusions; categories | Done | Unit tests |
| Mixed mode with an exact share | Done | Unit test |
| Fairness at 100 creators | Done | Unit test: every creator within one placement of the others over 10,000 placements |
| Campaign scheduling (dates, weekdays) | Done | Unit test |
| Image and video uploads | Built, untested | Upload UI and storage are in place, and storage validation is unit-tested; a real file upload has not been tested end to end |
| Verified LIVE badge (Twitch Helix) | Built, untested | Needs a Twitch Client ID and app token; never shows LIVE without verification |
| Analytics (displays, clicks, click rate, CSV export) | Done | e2e records 8 displays and 1 click |
| Shared network across many users (accounts, sync) | Not started | Needs a backend. See `ROADMAP.md`. |
| Paid placements and monetization | Not started | Deliberately deferred |
