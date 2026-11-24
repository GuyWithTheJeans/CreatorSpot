# Store submission materials

Use these for the Chrome Web Store (which also covers Brave), Microsoft Edge Add-ons and Firefox Add-ons. Build the uploads with `tools/package.ps1`.

## Name
CreatorSpot

## Short description (132 characters max)
Turn web ad slots into promotions for independent streamers and creators. Fair rotation, private by design.

## Detailed description

Tired of the same ads following you around? CreatorSpot replaces standard ad slots on the websites you visit with promotions for independent creators: streamers, YouTubers and community builders worth discovering.

**For viewers**
• Discover new creators while you browse.
• Every promotion is clearly labeled and links straight to the creator's channel.
• Pause CreatorSpot on any site with one click.

**For creators**
• Promote your own Twitch, YouTube, TikTok, Kick or Discord with professional designs.
• Join a fair creator rotation, or build a Creator Circle with friends and promote each other.
• Create campaigns with your own headline, artwork or video, schedule and priority.
• See how often your promotions were displayed and clicked.

**Private by design**
• No accounts and no tracking.
• Settings and statistics stay in your browser.
• CreatorSpot never generates fake ad impressions or clicks.

Note: CreatorSpot does not modify YouTube's video player. While YouTube plays a video ad, CreatorSpot can show a creator card beside the player instead.

## Category
Social & Communication (alternative: Fun)

## Single purpose statement (Chrome Web Store)
CreatorSpot replaces standard advertising placements on web pages with promotions for independent content creators that the user chooses or opts into.

## Permission justifications

| Permission | Justification |
|---|---|
| Host access (`http://*/*`, `https://*/*`) via content scripts | Needed to find standard ad slots on the pages the user visits and render creator promotions in them. Page content is not stored or transmitted. |
| `storage`, `unlimitedStorage` | Stores the user's settings, creator profiles, campaigns and uploaded promotional images or videos locally. |
| `declarativeNetRequest` | Optional feature, off by default: blocks requests to well-known ad networks when the user turns on "Stop ad networks from loading". |
| Optional host `https://api.twitch.tv/*` | Only requested if the user sets up Twitch live status, so a LIVE badge is shown only when verified. |

## Data usage disclosures (Chrome Web Store "Privacy practices")
* Does not collect or transmit personally identifiable information, health, financial, authentication, personal communications, location, web history or user activity data.
* Data is not sold, not used for unrelated purposes, and not used for creditworthiness or lending.
* Privacy policy: host `extension/privacy.html` publicly (for example on the product website) and link to it.

## Screenshots to submit (1280×800)
Take these from a real install (`test-results/` contains reference captures from the automated tests):
1. A news or reference site showing a leaderboard and sidebar promotion.
2. The popup with "2 promotions on this page".
3. The campaign editor with live preview.
4. The rotation page with the fairness preview.
5. The welcome tour.

## Before submitting
* Choose a support email or website for the listing.
* Host the privacy policy at a public URL.
* Give the light theme and Firefox a manual pass (see `CHECKLIST.md`).
