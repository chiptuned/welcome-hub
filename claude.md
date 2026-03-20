# Welcome Hub — Vincent Fraillon's Personal Brand Landing Page

## Overview
Minimalist dark glassmorphism personal hub, macOS Tahoe-inspired. Vite + vanilla JS/CSS. Dark/light toggle. Live widgets for GitHub, Spotify, and poker. Deployed on Cloudflare Pages.

## Architecture
```
welcome-hub/
├── index.html              # Single-page HTML structure
├── style.css               # Glassmorphism, bento grid, responsive, theme system
├── main.js                 # Theme, GitHub API, Spotify polling, Calendar, forms
├── public/
│   └── avatar.jpg          # Profile photo (512x512)
├── functions/
│   └── api/
│       ├── now-playing.js  # CF Pages Function — Spotify token refresh + now playing
│       └── poker-events.js # CF Pages Function — iCal proxy + parser for poker calendar
├── scripts/
│   └── get-spotify-token.js # One-time helper to get Spotify refresh token
├── wrangler.toml           # Cloudflare Pages config
├── package.json
├── vite.config.js
├── .gitignore
└── claude.md               # This file
```

## Features

### Hero
- Avatar photo (public/avatar.jpg) with gradient ring + online dot
- Name, tagline

### Bento Grid
- **Building** (wide): Live GitHub commits from `chiptuned` via REST API, 5min refresh
- **Listening**: Spotify Now Playing widget — polls `/api/now-playing`, shows album art + equalizer animation
- **Poker** (wide): Status pill (online/offline) + next live venues from Google Calendar + "Sync Calendar" button
- **Contact**: vincent@fraillon.com + Discord chiptuned02
- **Links**: resume.fraillon.com, LinkedIn, GitHub

### Coming Soon
- YouTube: hand reviews, data breakdowns, grind vlogs
- Masterclass: poker from a data & mental perspective — online to live grind, without going pro
- Email waitlist capture form

### Theme System
- Dark (default): glassmorphism + ambient gradient orbs
- Light: frosted white, subtle shadows
- localStorage persisted, toggle top-right

## Setup & Deployment

### Quick Start
```bash
cd welcome-hub
npm install
npm run dev     # http://localhost:5173
```

### Spotify Integration
1. Go to https://developer.spotify.com/dashboard → Create App
2. Set redirect URI: `http://127.0.0.1:3000/callback`
3. Copy Client ID + Client Secret
4. Get refresh token:
   ```bash
   SPOTIFY_CLIENT_ID=xxx SPOTIFY_CLIENT_SECRET=yyy node scripts/get-spotify-token.js
   ```
5. Add env vars in Cloudflare Pages dashboard: `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REFRESH_TOKEN`
6. Update `CONFIG.spotify.apiUrl` in main.js to your Cloudflare Pages URL

### Google Calendar (Poker Venues)
Uses a Cloudflare Pages Function (`/api/poker-events`) that fetches the public iCal feed and parses it.
No Google API key needed — just the public iCal URL set as `POKER_ICAL_URL` env var in Cloudflare.
The iCal URL is already hardcoded as a fallback in the function.
Set `CONFIG.poker.apiUrl` in main.js after deploying (e.g. `https://welcome-hub.pages.dev/api/poker-events`).

### Deploy (Cloudflare Pages)
1. Cloudflare Dashboard → Pages → Create a project → Connect to Git (or Direct Upload)
2. Build settings: Framework preset = None, Build command = `npm run build`, Output directory = `dist`
3. Cloudflare auto-detects `functions/` directory for Pages Functions
4. Set env vars in Settings → Environment Variables: `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `SPOTIFY_REFRESH_TOKEN`, `POKER_ICAL_URL`
5. Update `CONFIG.spotify.apiUrl` and `CONFIG.poker.apiUrl` in main.js to your `*.pages.dev` URL

## Config
All service configs are in `CONFIG` object at top of main.js:
```js
const CONFIG = {
  github: { user: 'chiptuned' },
  spotify: { apiUrl: null },  // set after Cloudflare deploy
  poker: { apiUrl: null },    // set after Cloudflare deploy
};
```

## Design Tokens
CSS variables in `:root` and `[data-theme="light"]`:
- `--accent`: #7c5cfc (purple)
- `--accent-2`: #00e5ff (cyan)
- `--glass-blur`: 20px
- `--card-radius`: 20px

## Logging
All modules log to console with `[hub]` prefix:
- `[hub] GitHub: loaded 5 commits, 5 repos`
- `[hub] Spotify: playing "Track" by Artist`
- `[hub] Poker: loaded 3 upcoming events`
