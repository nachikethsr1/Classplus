# Firebase Setup — District Training Institute portal

This is the console checklist. Nothing here has been deployed; every step is
yours to run once.

Until steps 1–4 are done the site still loads, but shows a clear
"ಸಂರಚನೆ ಬಾಕಿ" (setup pending) banner instead of letting anyone sign in.

---

## 1. Create the Firebase project

1. Open <https://console.firebase.google.com>.
2. **Add project** → name it something like `dti-bengaluru` → continue.
3. Google Analytics is optional; it is not used by this site. You can skip it.

## 2. Register the web app

1. Project settings (gear icon) → **Your apps**.
2. Click the web icon `</>` → nickname: `DTI Bengaluru portal`.
3. Do **not** tick Firebase Hosting — the site stays on Netlify.
4. Firebase shows a `firebaseConfig` object. Copy the six values.

## 3. Paste the config

Open `js/firebase-config.js` and replace each placeholder:

| Placeholder | Where it comes from |
|---|---|
| `REPLACE_WITH_WEB_API_KEY` | `apiKey` |
| `REPLACE_WITH_PROJECT_ID.firebaseapp.com` | `authDomain` |
| `REPLACE_WITH_PROJECT_ID` | `projectId` |
| `REPLACE_WITH_PROJECT_ID.firebasestorage.app` | `storageBucket` |
| `REPLACE_WITH_MESSAGING_SENDER_ID` | `messagingSenderId` |
| `REPLACE_WITH_WEB_APP_ID` | `appId` |

Then set the admin account in the same file:

```js
window.ADMIN_EMAILS = ['your.mothers.google.address@gmail.com'];
```

That list only controls which menus appear. **The real gate is the rules in
step 6 — change the address there too.**

## 4. Turn on the products

**Authentication**
- Get started → Sign-in method → **Google** → Enable → pick a support email → Save.

**Firestore**
- Build → Firestore Database → **Create database** → *Production mode* → region
  `asia-south1` (Mumbai) is closest for Bengaluru.
- Skip the sample rules for now; step 6 publishes the real ones.

**Storage**
- Build → Storage → **Get started** → Production mode → same region.

## 5. Authorize your domains

Authentication → **Settings** → **Authorized domains**:

- `localhost` (already there, for testing)
- `<your-site>.netlify.app`
- any custom domain you attach later

Without this, Google sign-in fails with `auth/unauthorized-domain`.

## 6. Publish the security rules

The two files in the repository root are the real access control:

- `firestore.rules`
- `storage.rules`

**Either** paste them in the console:

- Firestore → Rules → paste `firestore.rules` → Publish
- Storage → Rules → paste `storage.rules` → Publish

**Or** deploy with the CLI:

```bash
npm i -g firebase-tools
firebase login
firebase use --add            # pick your project
firebase deploy --only firestore:rules,storage
```

### Change the admin address in **both** rule files

```
function adminEmail() {
  return 'your.mothers.google.address@gmail.com';
}
```

This is the only thing that grants admin power. A student editing JavaScript in
their browser cannot become an admin, because the rules evaluate the signed-in
email server-side.

## 7. Netlify

`netlify.toml` is already in the repository:

```toml
[build]
  publish = "."
  command = ""
```

Netlify → Site settings → Build & deploy:

- Build command: *(leave empty)*
- Publish directory: `.`

No environment variables are needed — the Firebase web config is public by
design and lives in `js/firebase-config.js`.

**Note:** the site is currently being served from the repository root. If your
Netlify site is bound to a different publish directory, point it at the root
where `index.html` lives.

## 8. First run

1. Open the site. The setup banner disappears once the config is filled in.
2. Sign in with **your mother's** Google account — she lands straight in the
   admin dashboard, because her address is in `ADMIN_EMAILS` + the rules.
3. Go to **ತರಬೇತಿ ನಿರ್ವಹಣೆ** and create the first training (or use
   `publishDefaultTrainingIfEmpty()` from the browser console to seed the
   original Kannada assembly training).
4. Sign out, sign in as a student → registration form → fills official name and
   KGID → status `pending`.
5. Back as admin → **ವಿದ್ಯಾರ್ಥಿ ಖಾತೆಗಳು** → approve. The student's tab updates
   live; they do not need to sign in again.

## 9. Backups

Two levels, both worth doing:

**In-app (already built)** — admin → **ಡೇಟಾ ಬ್ಯಾಕಪ್**:
- full JSON export (students, trainings, submissions, certificates, design, settings)
- four CSV exports for spreadsheets
- certificate background image download
- validated JSON restore with a confirmation summary

**Firebase-level (recommended monthly)**

Firestore → **Import/Export** lets you export to a Cloud Storage bucket. For
automatic backups enable a Google Cloud *scheduled export*:

```bash
gcloud firestore export gs://<your-bucket>/backups/$(date +%Y%m%d) \
  --project <your-project-id>
```

Schedule that with Cloud Scheduler (monthly is plenty for a training portal).
Firestore also keeps point-in-time recovery for 7 days on paid plans.

**Storage** holds only the certificate background — one file. Download it from
the in-app backup screen after any change, or from
Storage → `certificate-backgrounds/`.

## 10. What was NOT done

- **Nothing was deployed.** No `firebase deploy` was run and no Netlify build
  was triggered.
- **No Firebase project was created for you.** All config values are
  placeholders, by design.
- **Real Google sign-in was not tested against a live project** — I have no
  credentials. Everything else (gates, registration, approval, submissions,
  marks, certificates, designer, backup) was tested against a stubbed Firebase
  layer; see the phase notes in the PR for exactly which checks ran.

## Collections created

| Path | Contents |
|---|---|
| `students/{uid}` | profile + approval status (`pending`/`approved`/`rejected`/`disabled`) |
| `trainings/{id}` | content, questions, answer key, published/archived flags |
| `submissions/{id}` | one document per attempt, immutable after write |
| `certificates/{id}` | certificate register (`cert_{submissionId}`) |
| `certificateDesigns/current` | layout + Storage URL of the background |
| `settings/portal` | passing default, certificate counter |

## Indexes

None are required. All queries fetch a whole collection and filter in the
browser, which is fine at this scale (hundreds of students). If the portal ever
grows past a few thousand submissions, add a composite index on
`submissions(studentUid, trainingId)` and switch to `query()` instead.
