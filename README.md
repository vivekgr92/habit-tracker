# Habits

A GitHub-style habit tracker PWA. Vanilla HTML/CSS/JS, no build step, no dependencies, works offline.

## Features

- GitHub-style contribution heatmap per habit (last 12 months) plus an "All habits" overview grid
- Tap any past square to toggle it; big "Mark today" button per habit
- Current streak, best streak, and total counts
- Custom emoji + color per habit
- Light/dark theme (follows system, GitHub palettes)
- Data stored locally (localStorage) with JSON export/import backup
- Installable PWA: offline via service worker, home-screen icon, iOS standalone mode

## Run locally

Any static file server works:

```sh
python3 -m http.server 8642
# open http://localhost:8642
```

## Put it on your iPhone

iOS requires HTTPS for installable PWAs, so host it somewhere public. Easiest free option — GitHub Pages:

```sh
git init && git add -A && git commit -m "Habit tracker PWA"
gh repo create habit-tracker --public --source . --push
gh api repos/{owner}/habit-tracker/pages -X POST -f 'source[branch]=main' -f 'source[path]=/'
```

Then on your iPhone, open `https://<your-username>.github.io/habit-tracker/` in Safari →
Share → **Add to Home Screen**. It launches full-screen like a native app and works offline.

> Note: data lives on-device per browser. Use Settings → Export/Import to move data between devices.

## Files

| File | Purpose |
|---|---|
| `index.html` | App shell, dialogs |
| `styles.css` | GitHub-flavored theme, light + dark |
| `app.js` | State, heatmap rendering, streaks, export/import |
| `sw.js` | Service worker: offline caching |
| `manifest.webmanifest` | PWA manifest |
| `icons/` | App icons (contribution-grid motif) |
