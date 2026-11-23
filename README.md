# District Training Institute — Training Portal

ಜಿಲ್ಲಾ ತರಬೇತಿ ಸಂಸ್ಥೆ, ಬೆಂಗಳೂರು ನಗರ · District Training Institute, Bengaluru City

A training feedback, assessment and certification portal for government
officers. Single-page static site, Kannada-first, no build step.

**Live behaviour — Google sign-in, Firestore storage, Firebase Storage for
certificate artwork.** See [FIREBASE_SETUP.md](FIREBASE_SETUP.md) for the
console checklist before the first run.

---

## Running locally

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

Any static server works. `localhost` must be in Firebase → Authentication →
Authorized domains for sign-in to work.

## Deploying

Netlify, straight from this repository. `netlify.toml` sets the publish
directory to the repo root and declares no build command. No environment
variables are needed.

## Files

| File | Purpose |
|---|---|
| `index.html` | the entire app — markup, styles, and application logic |
| `js/firebase-config.js` | public Firebase web config + admin email list |
| `js/firebase-service.js` | modular Firebase SDK wrapper (auth, Firestore, Storage) |
| `firestore.rules` | Firestore access control — the real security boundary |
| `storage.rules` | Storage access control for certificate backgrounds |
| `firebase.json` | rules deployment config for the Firebase CLI |
| `netlify.toml` | Netlify build settings + basic security headers |
| `FIREBASE_SETUP.md` | step-by-step Firebase console setup |
| `legacy/` | earlier unrelated pages, kept for reference and not served |

## How access works

1. Everyone signs in with Google. No passwords are stored anywhere.
2. First sign-in with no profile → registration form asking for the **official**
   name and KGID (the Google display name is never used as the official name).
3. The account starts as `pending`.
4. An administrator approves, rejects or disables it in **ವಿದ್ಯಾರ್ಥಿ ಖಾತೆಗಳು**.
5. Approval is enforced by Firestore rules, not by the UI — a student cannot
   approve themselves, edit their marks, or read another student's submissions.

The administrator is identified by an email allowlist that appears in
**three** places, all of which must match:

- `js/firebase-config.js` → `window.ADMIN_EMAILS`
- `firestore.rules` → `adminEmail()`
- `storage.rules` → `adminEmail()`

The JavaScript copy only decides which menus render. The rules copies decide
what is actually permitted.

## Data model

| Collection | Document | Notes |
|---|---|---|
| `students` | `{uid}` | official name, KGID, designation, department, status |
| `trainings` | `{trainingId}` | questions, answer key, feedback form, published/archived |
| `submissions` | `{submissionId}` | one per attempt; marks computed server-side-shape, immutable |
| `certificates` | `cert_{submissionId}` | serial number, marks, issue time |
| `certificateDesigns` | `current` | field layout + Storage URL |
| `settings` | `portal` | default passing percentage, certificate counter |

## Features

- Google sign-in with approval workflow
- Student registration with official details (KGID)
- Admin student account management (approve / reject / disable / search)
- Training management: create, edit, publish, unpublish, archive
- Feedback forms with session ratings and free-text answers
- MCQ assessment with configurable passing percentage
- Automatic marking, result screen, printable certificate
- Certificate Designer: upload a scanned certificate, drag fields, save the layout
- Data backup: full JSON export, per-table CSV export, validated restore
