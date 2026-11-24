# Changing your CreatorSpot profile

`featured.json` holds the GuyWithTheJeans and iamDoughnutDude profiles. Every copy of CreatorSpot downloads it every few minutes, so a change here reaches everyone automatically.

## How to change it

1. Open `featured.json` on GitHub and click the pencil icon (**Edit**).
2. Change the text between the quotes. Keep the quotes and commas.
3. Click **Commit changes**. Within about 5 minutes every copy of CreatorSpot shows the change. To see it sooner, open the CreatorSpot dashboard, go to **Creators** and click **Check now**.

## What you can change

**Profile**

| Field | What it is |
|---|---|
| `name` | Your display name (up to 40 characters) |
| `bio` | Short description (up to 160 characters) |
| `accent` | Your color, written like `#F472B6` |
| `category` | For example `Gaming` |
| `avatar` | Profile picture. Upload an image (PNG, JPG, WebP or GIF) into this `profiles` folder and put its file name here, for example `"profiles/doughnut.png"`. Leave it as `""` for initials. **When you change the picture, give the new file a new name** so every copy knows it changed. |
| `platforms` | Your channel links. `type` is one of `twitch`, `youtube`, `tiktok`, `kick`, `discord` or `website`. |

**Campaigns** (one entry per promo design)

| Field | What it is |
|---|---|
| `headline` | Big text (up to 60 characters) |
| `message` | Smaller text (up to 140 characters) |
| `cta` | Button text; leave as `""` for the default |
| `format` | Style: `spotlight`, `live`, `gaming`, `motion` or `video` |
| `id` | Leave this alone. To add a campaign, copy one and give it a new id with no spaces. |

Don't change the creator `id` values. CreatorSpot uses them to recognize you two.
