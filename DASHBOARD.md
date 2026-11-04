# SiteMind

A mobile-first field dashboard for construction superintendents, in navy, white, and teal. Built with plain HTML, CSS, JavaScript, and a small Node static server. No packages to install, external APIs, paid services, API keys, or remote fonts.

## Run locally

Use Node.js 20 or newer:

```sh
cd /workspace/sitemind-demo
npm start
```

The server listens on all interfaces on port 3000. On your own computer, open `http://localhost:3000`. Use `PORT=3001 npm start` if port 3000 is occupied. Stop it with Ctrl+C. There is no build step; refresh after editing files.

## Easiest free iPhone preview: GitHub Pages

For a **public GitHub repository**, GitHub Pages can host this static dashboard for free. No Node server, API keys, or hosting subscription are needed on the phone. Private repositories may require a paid GitHub plan for Pages; use the same-Wi-Fi method below if Pages is unavailable on your plan.

After the dashboard files have been merged into your repository:

1. On GitHub, open the repository → **Settings** → **Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**.
3. Select the branch containing the dashboard (usually **main**) and **/(root)**, then click **Save**. If the dashboard was uploaded into a subfolder, still publish **/(root)** and append that subfolder to the resulting site URL.
4. Wait for GitHub’s **pages build and deployment** workflow to finish. Return to **Settings → Pages** and click **Visit site** to obtain the actual published URL.
5. Open that URL in iPhone Safari. Optionally choose **Share → Add to Home Screen**.

The HTML uses relative asset paths, so repository Pages URLs and subfolder uploads both work. Everything is public on a public Pages site; use fictional data only. Each visitor’s changes stay in their own browser. The Node server and tests are development tools and are not needed by Pages.

## Preview on an iPhone over your own Wi-Fi

1. Copy or clone this repository onto your Mac or PC with Node.js 20+ installed.
2. In that repository folder, run `npm start`.
3. Connect the computer and iPhone to the same Wi-Fi network.
4. Find the computer’s local IPv4 address: on macOS, System Settings → Wi-Fi → Details → TCP/IP; on Windows, run `ipconfig` and look for the Wi-Fi IPv4 address.
5. In iPhone Safari, enter `http://YOUR-COMPUTER-IP:3000` (replace the placeholder with that IPv4 address). Keep the computer awake and the server running. Allow Node through the computer’s firewall on your private network if prompted. Guest Wi-Fi may prevent devices from connecting to one another.
6. Optionally choose Safari’s Share → Add to Home Screen for a shortcut. This is a browser app, not an offline-installed app.

`localhost` on the iPhone refers to the phone, not your computer. A cloud environment’s private address generally cannot be reached over your home Wi-Fi; run the repository on your computer for these steps. For a quick desktop approximation, use your browser’s responsive device mode at 390 × 844. Physical iPhone Safari testing remains recommended.

## Try the dashboard

- Check or reopen tasks; filter by all, to do, or completed; add tasks with normal or high priority.
- Confirm or unconfirm contractor commitments.
- Resolve and reopen watch-list risks.
- Add field updates to the activity feed.
- Switch morning/evening briefings. They summarize the current local checklist, commitments, and risks using templates; mark either briefing read or unread.
- Review the fictional upcoming schedule. Schedule events are read-only.
- Use **Reset demo data** at the bottom to restore the original fictional project after confirmation.

The demo uses a fixed project day (October 26, 2026). Site conditions, people, schedule, and weather are fictional, not live. New updates show the device’s actual local time.

Changes are stored under `sitemind-dashboard-v1` in browser localStorage. They persist after a reload on the same browser and origin; they do not sync between devices or ports. Private browsing or clearing site data may remove them. If storage is blocked or full, the dashboard continues for the current session and displays a session-only message. Do not enter sensitive project data. There is no login, backend, SMS integration, or server-side storage.

## Validation

```sh
npm test
```

Three Node tests check live summary calculations, persisted-data validation, and reset isolation. Browser validation also covered task filters/additions, contractor and risk toggles, field updates, both briefings, reload persistence, reset, malformed/blocked storage, user-input escaping, and layout widths of 320, 375, 390, 768, 1024, and 1440 pixels. No external requests were made. Mobile checks used Chromium emulation, not a physical iPhone.

## Files

- `index.html`: accessible landmarks, cards, navigation, and entry dialog.
- `src/styles.css`: responsive layout, touch controls, safe-area navigation, and reduced-motion support.
- `src/state.js`: fictional seed data, validation, and derived totals.
- `src/app.js`: rendering, interactions, local persistence, and briefing templates.
- `server.mjs`: dependency-free static server; serves HTML/CSS/JS/SVG only.

Each cloud task already has an isolated checkout. Use the existing checkout; a Git worktree is unnecessary unless explicitly requested.
