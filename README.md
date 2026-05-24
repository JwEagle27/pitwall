# PitWall

An iRacing stint calculator and pit-strategy tool for endurance races. Plan driver stints, track fuel burn, and log live pit stops — with data synced to a shared Google Sheet so the whole team sees the same numbers.

## Stack

Vanilla HTML, CSS, and JavaScript. No build step. Static-hostable.

## Getting started

Just open `index.html` in a browser, or serve the directory with any static server:

```bash
npx serve .
# or
python -m http.server 8000
```

## Google Sheets setup

PitWall stores all race data in a Google Sheet that you provide. To connect:

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and create a new project.
2. Enable the **Google Sheets API** for that project.
3. Go to **Credentials → Create → API Key** and copy the key.
4. Create a new Google Sheet and share it (Anyone with link → Editor).
5. Open PitWall, click the gear icon, and paste in your Sheet ID and API key.

The Sheet needs these tabs: `Races`, `Config`, `LiveLog`.

## Deploying to Vercel

This is a fully static site, so Vercel deploys it with zero configuration:

1. Push this repo to GitHub.
2. Import the repo at [vercel.com/new](https://vercel.com/new).
3. Accept the defaults — Vercel auto-detects the static site.

No environment variables or build commands required.
