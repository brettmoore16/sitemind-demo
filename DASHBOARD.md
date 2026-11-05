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

## Field notes → reviewed items

Tap **Add field update**, enter a fictional note, then **Analyze & review**. Nothing is saved at this stage. The review displays the original note exactly as entered. Each proposed item can be unchecked or edited: type, title, contractor, status, date, time, priority, details, and whether it is physical work or a follow-up. You can add a missed item, return to the note, or cancel. **Confirm & save note** saves the original note and only the selected items. You can save just the note by unchecking all proposals. Expand **Original field note** on any derived item to see its source; editing or deleting an item never rewrites that note.

Try this fictional example:

> Apex will deliver steel tomorrow at 10 AM; remind me to call Apex Thursday; review RFI #42 next Monday; schedule the rebar inspection Thursday at 9 AM.

This proposes a contractor commitment, its delivery schedule event, a reminder, an RFI follow-up task, and an inspection event. A dated promise can create both a commitment and an event; they have independent statuses. The rules recognize trade names and common terms such as rough-in, MEP, HVAC, formwork, rebar, punch lists, RFIs, submittals, deliveries, inspections, and pours. Separate actions with sentences, newlines, semicolons, or commas / “and” before a new action. Material lists such as “formwork and rebar” stay together.

Processing is deterministic JavaScript on the device, with no AI service or network calls. It cannot understand arbitrary language reliably. Unclear observations produce unchecked suggestions; cancellations and reported completion produce warnings and pending items. Review every proposal. No message automatically confirms a promise or verifies completion.

### Dates and reminders

Relative dates use the device’s local calendar **at analysis time**, shown in the review and saved with the note. Supported forms include today, tonight, tomorrow, day after tomorrow, Thursday (or any full weekday), next Monday, in 3 days, and YYYY-MM-DD. A bare weekday includes today; “next” means the next occurrence at least one day away. Times support AM/PM, `at 14:30`, noon, and midnight. Ambiguous dates and approximate times are left for review, rather than guessed. Missing dates remain blank. Reminders are visible in-app; they do not send push notifications, SMS, or background alarms.

### Status and item controls

All tasks, commitments, events, and reminders have **Pending**, **Scheduled**, **Confirmed**, or **Completed** status. Scheduled means planned; confirmed means acknowledged, not finished. Only explicitly checking that specific item or selecting Completed changes its completion status. Completing “call Apex” never completes Apex’s steel delivery, even when both came from the same note. Reopening an item returns it to pending. You can use **Edit** to set any status, date, or priority. All four item types support Add, Edit, and Delete; deletion asks for confirmation.

**Top 3 Priorities** ranks unfinished items by high priority first, then earliest date and time. **Open Follow-Ups** combines follow-up tasks and incomplete reminders. These are views of the same items, so checklist changes and counts stay aligned. Completed follow-ups remain available in the main task checklist or Reminders card for editing/reopening. Task filters, contractor confirmations, risk resolution, briefings, and demo reset remain available.

Duplicates in each item type are rejected by normalized title, date, and time (case, punctuation, extra whitespace, and polite filler are ignored). This check covers manual entries, edits, existing completed items, repeated clauses, and the current confirmation batch. Different dates or times remain distinct; this is not semantic similarity detection. Skipped duplicates are reported and the original note is still retained.

### Browser storage

All example people, conditions, and project data are fictional. Seed schedule dates use the device date when the demo is first loaded or reset. New updates use the device’s actual local time. This is not live weather, a real project feed, or verified construction progress.

Changes stay under `sitemind-dashboard-v1` in localStorage, now with schema version 2. Existing tasks, contractor confirmations, risks, briefings, and original notes migrate on load; no reset is required. Deletions survive reloads. Storage is per browser and origin, and does not sync across devices or ports. Clearing site data removes it. Blocked/full storage falls back to session-only operation with a visible notice. Do not enter sensitive project data. There is no login, backend, external API, or SMS integration.

## Validation

```sh
npm test
```

13 Node tests cover extraction, relative-date boundaries, common construction terms, negative/completed wording, multi-item notes, duplicates, schema migration, independent completion, priorities, and validation.

The repeatable browser suite is optional and uses free Playwright (no production dependency). With the server running in a separate terminal:

```sh
# Optional test tooling only; no paid dependencies or accounts.
npm install --no-save --package-lock=false playwright
npx playwright install chromium
PORT=3001 npm start
# In another terminal:
npm run test:browser
```

Use BASE_URL to select another local server. PLAYWRIGHT_MODULE and CHROMIUM_PATH can select preinstalled test tooling. Browser checks cover staged review/cancel/confirm, original note retention, relative dates, all item types, edit/delete, duplicate rejection, explicit statuses, follow-up isolation, counts, priorities, persistence/migration, note-only saves, excluded proposals, blocked storage, escaped input, and six viewport widths (320–1440px). Application requests stay local. Mobile validation uses Chromium emulation; physical iPhone Safari testing remains recommended.

## Files

- `index.html`: accessible landmarks, cards, navigation, and entry dialog.
- `src/styles.css`: responsive layout, touch controls, safe-area navigation, and reduced-motion support.
- `src/state.js`: fictional seed data, schema migration, statuses, duplicate checks, priorities, and derived totals.
- `src/app.js`: rendering, staged review, item management, local persistence, and briefing templates.
- `src/parser.js`: free rule-based construction/date extraction.
- `scripts/browser-check.cjs`: optional browser regression suite.
- `server.mjs`: dependency-free static server; serves HTML/CSS/JS/SVG only.

Each cloud task already has an isolated checkout. Use the existing checkout; a Git worktree is unnecessary unless explicitly requested.


## SaaS foundation

The dashboard now includes compact Today/Tasks/Commitments/Schedule/Risks/Journal navigation, a backup export, delivery preference controls, and reviewable create/correct proposals. Local demo rules remain free. Private server mode and optional AI require a separately configured authenticated server; GitHub Pages never receives credentials or cloud project data. See [phase 1](docs/PHASE_1.md) for exact accounts, keys, acceptance tests and deferred production work. SMS and billing remain disabled.
