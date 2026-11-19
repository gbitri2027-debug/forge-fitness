# FORGE Fitness 1.2 — Private synchronization setup (no payment)

**Do not upload your workout JSON backup to GitHub or Firebase Storage.** Keep it in a safe private place until you have confirmed both devices show your history.

The app runs normally offline and with no Firebase account if `firebase-config.js` contains `null`. The update cannot automatically create a Firebase project or activate sync: you must do that once through your own account.

## Zero-payment rule

Use only the **Firebase Spark (no-cost)** plan. Do not start a Google Cloud free trial, attach any billing account, enter a credit card, upgrade to Blaze, enable Cloud Functions, or enable paid features. If Firebase presents a required payment screen, **stop**. GitHub Pages stays your free web host.

Official references: https://firebase.google.com/docs/projects/billing/firebase-pricing-plans and https://firebase.google.com/docs/firestore/quotas

## Step 0 — Make backups BEFORE updating GitHub

1. On the **MacBook**, open the same original site where your records were entered (`http://localhost:8080` if that's where you logged them). Go to **Settings → Export complete JSON backup**.
2. On the **iPhone**, export another backup if the phone has any records not already in the MacBook backup. Save backups in private Files/iCloud Drive or another location you control.
3. Confirm both files open as valid JSON and keep the originals. No personal JSON belongs in your public GitHub repository.
4. If anything during setup looks destructive, **do not confirm**. Your original v1.1 app and private backups are your recovery path.

## Step 1 — Create a no-billing Firebase project

1. Visit https://console.firebase.google.com/ and sign in with your own Google account.
2. Choose **Add project**. Name it `forge-fitness-private` (or another name).
3. **Disable Google Analytics** if offered; you don't need it.
4. Confirm that your project is on **Spark — No cost**. Do not enable billing or a trial.
5. In the project, open **Authentication → Sign-in method → Email/Password**; enable standard **Email/Password** (not phone authentication). Save.
6. Open **Authentication → Users → Add user**; create one private email/password account for yourself. Save the password privately. Do not share it here or commit it to source control.
7. From the Users table, copy the user's **UID** (not the email). You will insert it into the Firestore rules in Step 2.

## Step 2 — Create Firestore and restrict it to only your UID

1. In Firebase Console select **Firestore Database → Create database**.
2. Choose **Standard/Native**, the **default** database, and the recommended free-eligible region. If a screen demands billing, **stop**.
3. Use production/locked rules (never open test rules that let everyone read your data).
4. Open the **Rules** tab and copy the entire contents of the bundled `firestore.rules` file.
5. In those rules replace **`REPLACE_WITH_YOUR_FIREBASE_USER_UID`** with your actual UID from Authentication → Users. Keep the single quotes.
6. Click **Publish**. Never use `allow read, write: if true` for this app.
7. In Firebase Console → Project settings → General, open **Your apps → Add app → Web** (`</>`). Register a web app. You do **not** need Firebase Hosting because you have GitHub Pages.
8. Copy the public **Firebase configuration** object shown, containing `apiKey`, `authDomain`, `projectId`, `appId`, and optionally `messagingSenderId`/`storageBucket`.
9. In **Authentication → Settings → Authorized domains**, add `gbitri2027-debug.github.io` if it is not already listed. For localhost development, also allow `localhost` if Firebase requires it. Do not include `https://` or a path in the domain field.

## Step 3 — Add the PUBLIC web configuration to FORGE

In the included `firebase-config.js` change:

```js
window.FORGE_FIREBASE_CONFIG = null;
```

to (replace every example value with your own **web app's public config**):

```js
window.FORGE_FIREBASE_CONFIG = {
  apiKey: 'YOUR_PUBLIC_WEB_API_KEY',
  authDomain: 'YOUR_PROJECT_ID.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
  appId: 'YOUR_FIREBASE_WEB_APP_ID'
};
```

Firebase web `apiKey` is a **public project identifier**. Keeping data private relies on Firebase Authentication and the UID-restricted Firestore rules. Do **not** add admin credentials, service-account JSON, private API keys, passwords, or personal fitness backups to GitHub.

## Step 4 — Update your existing GitHub Pages site

1. Download the FORGE v1.2 ZIP and unzip it.
2. Open your existing GitHub repository: https://github.com/gbitri2027-debug/forge-fitness
3. Upload the **contents** of the new `forge-fitness` folder to the repository root, replacing the files there. In particular ensure `index.html`, `app.js`, `styles.css`, `sync-client.mjs`, `sync-core.mjs`, `firebase-config.js`, `sw.js`, and `manifest.webmanifest` appear at the top level. Do **not** upload the ZIP itself, your private JSON backup, or service credentials.
4. Keep Settings → Pages → `main` branch → `/(root)`.
5. Open https://gbitri2027-debug.github.io/forge-fitness/ and refresh. Close and reopen an installed iPhone Home Screen web app if it shows the old version. Some updates may require refreshing twice because the service worker cache changed to v1.2.
6. **Do not clear site data or uninstall the PWA before exporting backups**. Device storage is associated with each website origin.

## Step 5 — Safely link the MacBook first

Your MacBook's `http://localhost:8080` storage is a **different origin** from `https://gbitri2027-debug.github.io/forge-fitness/`. Updating GitHub does not migrate MacBook localhost data automatically.

1. On the MacBook, copy the v1.2 files into the same local `forge-fitness` folder you were using before, including the configured `firebase-config.js`. Keep the same URL **`http://localhost:8080`** and browser.
2. Restart the Python server if needed: `python3 -m http.server 8080`.
3. Open FORGE → **Settings → Private device synchronization**.
4. Sign in using the one private email/password user you created in Firebase Console.
5. Click **Review & safely merge my data**. The app exports an additional JSON backup and shows the number of local/cloud records. Carefully review and confirm the merge.
6. Wait until the status says **Synced**. If it says **Sync error**, **pending**, or **conflict**, do not delete local records. Review and retry; re-check the Firebase rules.
7. In Firestore Console, confirm records appeared under `users / YOUR_UID / items` and the rules are locked to your UID.

## Step 6 — Link iPhone to the same account

1. In Safari on the iPhone open the GitHub Pages FORGE website or your installed app.
2. Go to **Settings → Private device synchronization**, sign in to the **same** Firebase user.
3. Click **Review & safely merge my data**. If the phone has its own separate workouts, they should be added to the cloud rather than discarded. If the same record has different versions, both are kept as separate entries.
4. Verify a few workout names, body measurements, meals, and history entries match on both devices.
5. Test with a small new entry on iPhone. Reopen FORGE on MacBook; its records should download on connection. Then test in the other direction.

## Important sync behavior

- All completed training plans, workouts, logs, goals, preferences, and custom library entries are synced per record. Personal records and statistics recalculate locally.
- **An unfinished live workout or GPS session stays on the originating device.** It is not meant to be edited simultaneously on two devices. Finishing the session adds it to syncable history.
- Offline edits are saved immediately to IndexedDB and queued; cloud sync resumes when the app reconnects **and can run JavaScript**. iPhone background execution cannot be guaranteed.
- If two devices edit the same record while offline, the app offers **Use cloud**, **Keep mine**, or **Keep both** (when safe), rather than silently overwriting one version.
- Cloud quota errors do not trigger payments on Spark; the app continues locally. Export frequent JSON backups.
- The sync metadata database is a separate local IndexedDB database named `forge-sync-metadata`; don't clear website storage.
- On restoring a JSON backup, syncing is automatically paused until you review a new merge, to prevent unexpected deletions.
- Large GPS records above the 700 KB safety limit stay local and produce a sync warning rather than being uploaded unsafely.
- The app does not activate automatic scheduled downloads of private JSON files: browsers generally require user interaction for downloads. Use Settings → Export JSON after important training sessions.

## Safety / troubleshooting

- **Not configured:** Check the public web config in `firebase-config.js` and refresh.
- **Not signed in:** Create the single Firebase user in Console, then use its email/password to sign in.
- **Permission denied:** Check UID in the published Firestore rules, `projectId`, and authentication account.
- **Offline:** Your entries remain local. Reconnect and keep the app open briefly or select Sync now.
- **Conflicts:** Export a backup and review the choices in Settings. Choose **Keep both** to preserve both versions of a history record.
- **Account mismatch:** Your device was linked to another UID. No cross-account upload will occur. Preserve backups and sign into the original account.
- **Local data needs review:** Most previously synced items are missing locally. No mass deletion will be uploaded until reviewed.
- **Billing prompt anywhere:** STOP. Do not enable the paid plan.

## Verification status of this ZIP

The JavaScript syntax checks, original app smoke suite, and standalone synchronization data-merge tests were run locally. **Actual Firebase sign-in, database security, GitHub deployment, MacBook/iPhone sync, and iOS PWA behavior must still be verified with your Firebase project and devices.** The ZIP alone cannot establish a cloud account or synchronize until you complete the setup above.
