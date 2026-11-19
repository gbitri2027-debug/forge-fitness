# FORGE Fitness 1.2 — private device sync, still free

FORGE is a sporty offline-first workout, body, nutrition, cardio, and sleep tracker. It saves immediately to IndexedDB. Version 1.2 **adds optional private synchronization** between your MacBook and iPhone using Firebase's no-billing Spark plan and Cloud Firestore.

**Read [FREE-SYNC-SETUP.md](FREE-SYNC-SETUP.md) before changing your app.** It contains the exact step-by-step process for creating a no-billing project, publishing secure rules, configuring the public web app, safeguarding backups, updating GitHub Pages, and safely merging existing Mac/iPhone data.

## Absolute €0 rule

- Keep GitHub Pages as your free website host.
- Choose Firebase **Spark (no cost)** only. Do not add a billing account or use a free trial that switches to paid.
- No paid APIs, Cloud Functions, Firebase Storage backup fees, Google Cloud trial, analytics, or subscription is required.
- If a payment is requested, **stop**. Local app functionality remains available; do not proceed.
- A provider's plans can change. There is no promise that third-party free plans will last forever. Without billing enabled, any cloud usage above Spark quota is interrupted rather than charged.

## What stays local?

- Every screen and feature works with no Firebase configuration. The new code is opt-in.
- Existing IndexedDB storage and v1 backup format are preserved.
- Unfinished workout sessions and active GPS recording remain only on the device currently running them.
- JSON exports are still necessary: cloud sync is **not** a replacement for backups.

## What can sync when configured?

Completed workouts, workout plans, custom exercises, favorites, measurements, performance goals, foods and meals, nutrition logs, completed cardio, sleep records, and settings. PRs and charts are derived from these records locally. Records use stable IDs and per-record version checks, with conflict review rather than silent overwriting.

## How to run locally

Unzip. In the `forge-fitness` folder run:

```bash
python3 -m http.server 8080
```

Then browse to <http://localhost:8080>. You can use it normally without cloud configuration. Do not open `index.html` as a `file://` URL if you need reliable browser storage and PWA support.

## Files

- `index.html`, `styles.css`, `app.js`, `sw.js`, `manifest.webmanifest`, `assets/`: existing app (with small additions).
- `sync-client.mjs`: optional Firebase Authentication, Cloud Firestore sync, offline outbox, and conflict review.
- `sync-core.mjs`: framework-independent sync record transformations.
- `firebase-config.js`: **PUBLIC** Firebase browser configuration. `null` by default.
- `firestore.rules`: restricts database access to one user UID, which you **must insert** before publishing.
- `FREE-SYNC-SETUP.md`: the required setup and data migration instructions.
- `smoke-test.cjs`: original v1.1 application test suite.
- `sync-core.test.mjs`: separate sync transformation and data safety tests.

## Run checks (optional; requires Node.js)

```bash
node --check app.js
node --check sync-client.mjs
node --check sync-core.mjs
node smoke-test.cjs
node --test sync-core.test.mjs
```

## Important limits / verification

- The implementation runs entirely on free-capable services, but **cloud sync will not function** until you create and configure your own Firebase Spark project and securely publish the UID-scoped Firestore rules.
- The offline application operates without a configured cloud backend.
- Background synchronization cannot be guaranteed on iPhone when Safari/the installed web app is suspended.
- Very large GPS route documents are kept locally if too large for safe Firestore upload; consult Settings for a warning.
- This release was syntax-checked and the bundled program/data-merge tests passed, but Firebase live integration, GitHub deployment, and real Mac/iPhone end-to-end behavior remain **unverified** until your Firebase account is configured.
- Keep original JSON backups and don't clear local website data before migration.
