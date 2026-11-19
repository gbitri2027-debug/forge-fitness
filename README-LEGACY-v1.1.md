# FORGE Fitness 1.1 — interaction fixes

**Fix in v1.1:** Buttons inside dialogs and exercise pickers now work, including Cancel, selecting an exercise, editing routines, and changing favorites. This was caused by the dialog stopping click events from reaching the app's button handlers. The service worker was also updated to fetch fresh files when online while retaining offline support.

**Upgrading without losing data:** Keep your existing local app address (for example, `http://localhost:8080`) and replace the old app files with these files in the same folder. Never clear site data or change the localhost port if you want to retain the existing IndexedDB records. Before replacing files, use Settings → Export complete JSON backup. Restart the local server if needed, then refresh the page twice to allow the service worker to update. An already installed PWA may also need to be closed and reopened.

---

# FORGE — Personal Fitness Tracker

A complete **local-first**, **single-user**, **100% free** fitness tracking web app. No account, API key, paid service, database server, package manager, or internet connection is required for normal use after installation.

![FORGE icon](assets/icon-192.png)

## Run it on your computer

These are ordinary static website files. The reliable way to run them is with a local server:

1. Unzip the `forge-fitness.zip` download.
2. Open a terminal inside the extracted `forge-fitness` directory.
3. Run: `python3 -m http.server 8080` (Windows may use `py -m http.server 8080`).
4. Open **http://localhost:8080** in Chrome, Safari, Edge or Firefox.
5. In a compatible desktop browser, choose **Install app** from the address bar or browser menu if available.

No Python? Any local static HTTP server works, including VS Code's Live Server extension. The app doesn't need a Node.js installation.

**Important:** Opening `index.html` directly via `file://` may work visually, but IndexedDB and service workers are not consistently supported on `file://` origins. Use localhost or HTTPS for reliable saving and installation.

## Use it on your iPhone

For an iPhone to access it independently, you can publish this static folder on a **free HTTPS static host**, such as GitHub Pages. This hosts only the *app code*, not your personal workout or nutrition data.

1. Create a GitHub repository and upload all files from the `forge-fitness` folder at the repository root.
2. Go to **Settings → Pages → Build and deployment → Deploy from a branch**, choose your main branch and root directory, then save.
3. Open the published HTTPS website on your iPhone in Safari.
4. Tap **Share → Add to Home Screen**, then open FORGE from its icon.
5. Open **Settings → Export complete JSON backup** regularly and save it in Files or another safe location.

A public static website does not make your personal data public: FORGE does not upload any logs and has no backend. **However, your data stays in the browser/app container where you entered it**. It will not automatically appear on another device, or necessarily in Safari if you used a separate Home Screen app. To move records, use JSON export and import.

## Features

- Workout-focused home dashboard; complete workout history
- Manual programs, rule-generated programs, editable training sessions, fixed weekdays or flexible sequences
- Gym/home equipment filters; default four-day training week; choose duration when generating
- Built-in exercise library and custom exercises; favorites and history
- Autosaved live workout logging: sets, reps, kilograms, timed holds, assistance, RPE, RIR, notes, rest timer
- PR detection (heaviest weight, highest reps at a weight, estimated 1RM), training volume and reports
- Body weight, estimated body fat and circumference measurements with trends
- Performance goals, muscle-group set distribution and explainable progression suggestions
- Nutrition: built-in reference foods, custom foods, portions, meals, calorie/protein targets, history
- Sleep: quick or detailed logs, duration and quality charts
- Cardio: manual logs or timer/GPS when the browser permits it, route-shape preview, historical trends
- Offline application shell through a service worker; IndexedDB autosaving
- Versioned JSON backup/restore with validation and confirmation; CSV exports

## What is *not* included

- No remote synchronization or account system. Records stay in the device's IndexedDB.
- No paid generative AI. Workout suggestions come from deterministic, built-in rules.
- No commercial food API. Common food values are approximate, editable through custom entries.
- GPS route drawing shows a shape, **not map tiles**, and can't be relied on while the phone's browser is suspended.
- Generated workout plans are templates, not a personalized medical or professional training assessment.
- No notifications when the app is fully closed. Rest timer displays correct time when you reopen it.

## Data protection — please read

The application saves to the **origin-local IndexedDB** database named `forge-fitness-db`. Clearing the website's data, browser profiles, private browsing data or uninstalling an app can erase records. The application does **not** automatically back up anywhere. Export a JSON backup after meaningful updates and keep copies outside the browser. Import replaces current data only after a warning; export current data before restoring another backup.

The full JSON backup includes optional GPS coordinates, food, sleep and other personally sensitive records. Store and share it with care.

## Testing

With Node.js installed, run the built-in no-dependency smoke test:

```bash
node smoke-test.cjs
```

It verifies all 10 screen renderers and the main program, equipment, macronutrient and workout statistics calculations. It does **not** replace manual testing in a real iOS/browser environment.

## Technical details

- Architecture: standard HTML, CSS and modern JavaScript with modular app sections in one dependency-free source file.
- This deliberately differs from the **preferred** React/TypeScript/Vite stack in the specification: it avoids third-party build dependencies and works as an offline static app without installing packages or paying for services.
- Storage: IndexedDB, one atomic versioned state record in a single object store.
- No network requests are made by the application itself beyond fetching its own static assets when served over HTTP(S).
- Application assets are cached by the `sw.js` service worker on supported origins.
- Responsive dark athletic interface with accessible labels and touch targets.

## Updating the application

Keep the same site URL and upload the new files. The app's storage is associated with that URL; changing the origin does not transfer records. Back up **before any update**. The service worker currently uses `forge-core-v1`; when shipping an updated release, bump the cache version in `sw.js` so users receive fresh files.

## License

For personal use. Application code delivered as part of your requested project; external fitness/exercise and nutrition data are simplified illustrative reference values rather than a licensed commercial database.

---
## Version 1.2 — optional free private cloud sync

The new release adds an optional Firebase Spark/Firestore private sync layer.
Existing local functionality continues without Firebase configuration. Before changing accounts, uploading files, or importing data, export your original JSON backup.

For setup, security rules, merging your current localhost data, and GitHub Pages updates, see **FREE-SYNC-SETUP.md**. Do not enable billing under any circumstances.

Run tests without any npm install:

```sh
node smoke-test.cjs
node --test sync-core.test.mjs
node --check app.js
node --check sync-client.mjs
```

The following statements above refer to v1.1 and are superseded when free sync is configured: version number, "no remote synchronization," and "no network requests." In v1.2, the sync module optionally imports the Firebase Web SDK and sends private records only to your own Firebase project after sign-in and an explicit first-merge confirmation. Unfinished workout and active GPS tracking state remain local.
