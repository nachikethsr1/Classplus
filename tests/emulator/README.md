# Firebase Emulator Suite tests

Real Firebase SDK calls against the real emulator, evaluating the
**committed** `firestore.rules` and `storage.rules`. Nothing here
re-implements a rule: if a test says "denied", a Firestore rules engine
denied it.

This replaces the `.verify/` harness for anything rule-shaped. `.verify/`
re-implemented the rules in JavaScript and, as the first emulator run
proved, its model disagreed with the real engine in three places.

```bash
cd tests/emulator
npm install
./run.sh            # all suites
./run.sh 05         # one suite (substring match on the file name)
```

`run.sh` starts `auth`, `firestore` and `storage` with
`firebase emulators:exec` using the repository's `firebase.json`, then runs
`run-all.js` inside it.

## Requirements

- Node 18+
- **Java** — the Firestore emulator and the Storage rules runtime are JVM
  binaries. If `java` is not on `PATH`, `run.sh` falls back to the JDK that
  ships inside the Python package `jdk4py` (`pip install jdk4py`), which is
  how this suite runs in a sandbox with no system JRE.
- The emulator JARs themselves are downloaded once by `firebase-tools` from
  `storage.googleapis.com`.

## What each file is

| file | purpose |
|---|---|
| `run.sh` | boots the emulators against the committed rules |
| `run-all.js` | wipes + re-seeds Firestore before every suite, prints the report |
| `env.js` | four real signed-in sessions (admin, approved, pending, other) + a signed-out one |
| `fixtures.js` | documents in exactly the shapes `index.html` writes |
| `harness.js` | `allow` / `deny` / `gap` / `expect`, and the summary |
| `app-loader.js` | loads `index.html` in jsdom and gives it a `FirebaseService` backed by the real SDK, so the app's own loaders issue real queries |
| `suites/` | the tests |

## Sessions

Each session is its own `FirebaseApp` with its own signed-in user created in
the **Auth emulator**, so every request carries a real ID token and the rules
see a real `request.auth`:

| session | account | profile |
|---|---|---|
| `admin` | the address in `js/firebase-config.js` → `ADMIN_EMAILS` | — |
| `approved` | approved.student@example.com | `status: 'approved'` |
| `pending` | pending.student@example.com | `status: 'pending'` |
| `other` | other.student@example.com | `status: 'approved'` |
| `fresh` | fresh.student@example.com | no profile yet (first sign-in) |
| `anon` | not signed in | — |

The admin session deliberately signs in **as whatever address the committed
rules name**, so the suite never needs the rules edited to pass — and
`10-config-consistency` fails loudly while that address is still the
placeholder.

## Verdicts

- `pass` — the rules did what they are supposed to do.
- `FAIL` — the rules or the app did something else. Fix the app or the rules,
  not the test.
- `gap` — the call succeeded **and that is a known hole**. Counted and
  reported separately; never counted as a pass.
- `skip` — not runnable here (noted with the reason).

## What this still does not prove

- It does not test the production Firebase project. Emulator rules are the
  same engine, but the project's own settings (authorised domains, Google
  sign-in, App Check, the real admin account, composite indexes) are not.
- Google sign-in itself is not exercised: the emulator uses
  email/password accounts to mint the ID tokens the rules read.
- `../browser/` covers the ES-module load order in a real Chrome; jsdom
  cannot execute `<script type="module">`.
