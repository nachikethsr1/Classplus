# Phase 1 verification notes

Scope: the three critical Firebase fixes. Nothing here has been deployed.
Nothing here has been tested against a real Firebase project — there is no
configured project in this environment, so every result below is a
**harness result**. Read `.verify/README.md` before quoting these numbers.

Branch `arena/62f31f93-classplus`, PR #4 (open, not merged).

---

## 1. Module-loading race

**Problem.** `js/firebase-service.js` is loaded as `<script type="module">`, so it
executes *after* the classic inline script. `AUTH.gate` was therefore computed while
`window.FirebaseService` was still `undefined`; the app decided the project was
unconfigured and showed "setup pending" with no way back. A reload sometimes worked,
which is the signature of a load-order race rather than a config error.

**Fix.** A real ready handshake, no timers.

- `js/firebase-service.js` gained `announceReady()`, called at the end of **all three**
  `init()` exit paths (no config, `initializeApp` failure, success). It sets
  `window.__firebaseServiceLoaded = true` and invokes `window.__firebaseServiceReady(svc)`
  exactly once, then clears the callback.
- `index.html` publishes `window.__firebaseServiceReady` before the module can run.
  It calls `bootAuth()`; `bootAuth()` is idempotent via `authBooted` and also boots
  immediately if `FS()` already exists (module cached and earlier).
- `renderSetupBanner()` only claims misconfiguration once the module has settled, so a
  pending module never produces a false error message.

**No `setTimeout` in this path.** The handshake is callback-driven; ordering does not
depend on timing.

**Tests** (`t-boot.js`, `t-boot2.js`, 9 assertions):
- classic scripts before the module (the original failing order) -> sign-in appears,
  no setup-pending screen;
- module already ready before the classic script -> boots immediately;
- config placeholder still present -> shows the Kannada setup message naming
  `js/firebase-config.js`, and shows no sign-in button;
- module file missing entirely -> stays on "checking", never claims misconfiguration.

**Not proven:** that a real browser's module pipeline behaves as simulated. jsdom's
`outside-only` mode cannot execute module scripts, so the harness queues them and fires
the callback asynchronously. It reproduces the *ordering*, not the browser. **Do a
hard-refresh smoke test on Netlify before trusting this in production.**

---

## 2. `certificates` rules

**Problem.** `firestore.rules` had no `match /certificates` block. With a deny-all
catch-all, every certificate read and write was refused — student certificates could
not render and the register could not be written.

**Fix.** A block that keeps the existing two issuance paths working:

- `read`: your own certificate (`isSelf(resource.data.studentUid)`) or admin.
- `create`: the document must belong to the caller and carry a non-empty string
  `number`, and the referenced submission must be fetched with `get()` and verified —
  it exists, it is the caller's, `passStatus == true`, and the certificate's
  `marks` / `total` / `pct` equal that submission's `marksObtained` / `totalMarks` /
  `percentage` exactly. This blocks self-awarded certificates and inflated marks.
- `update: if false` — an issued certificate is immutable, for everyone.
- `delete`: admin only.

**Tests** (`t-certs.js`, 17 assertions):
- student issues a certificate from their own passed submission -> allowed;
- refused: empty number, non-string number, another student's uid, unknown submission,
  failed submission, inflated marks, inflated percentage, altered total;
- refused: updating an issued certificate, deleting one, reading another student's;
- allowed: reading your own;
- admin can issue, read, correct and delete.

`t-issue.js` (11 assertions) drives the app's **own** submit -> score -> number ->
certificate code and confirms the document it writes satisfies these rules, including
that marks/total/pct are copied verbatim from the submission.

---

## 3. Query/rule incompatibility

**Problem.** Firestore rules are a pre-filter, not a post-filter. A list query is
rejected outright unless the rules can prove it can only return permitted documents.
The student loaders fetched whole collections and filtered in JavaScript, so live they
would have failed with `permission-denied` — a student would see an empty portal.

**Fix.** A `q(collectionPath, ...constraints)` helper, and every student read now
carries the constraint its rule needs:

| collection | query | rule |
|---|---|---|
| `trainings` | `where('published','==',true)` | `published == true` |
| `submissions` | `where('studentUid','==',<own uid>)` | `isSelf(...)` |
| `certificates` | `where('studentUid','==',<own uid>)` | `isSelf(...)` |

`archived` is still filtered client-side: the published-only rule stays a single
indexable clause, and an archived training that was published remains readable.

Admin loaders are deliberately left unconstrained — `isAdmin()` is unconditional in the
rules, so no constraint is needed — with a comment saying so. The admin-only scans
(`loadStudentAccounts`, `buildBackupPayload`, `publishDefaultTrainingIfEmpty`) are all
behind `authIsAdmin()` guards, so a student never reaches them.

**Tests** (`t-rules.js` 25, `t-guards.js` 12):
- every list read in a student session carries its constraint — zero unconstrained
  scans, zero read of `students`;
- the student loads exactly their own submission and certificate, and the other
  student's data appears nowhere;
- the student sees the published training and not the draft;
- direct attacks denied: read another profile, read another submission, unconstrained
  scan of submissions / trainings, edit marks, edit `passStatus`, edit a training or
  its answer key, edit the certificate design, escalate their own profile
  (`status`/`role`);
- scans of `certificateDesigns` and `settings` remain allowed, because those rules
  say `allow read: if isSignedIn()` and students need them to render;
- the admin session loads all students, trainings, submissions and certificates.

---

## Still open

- **Real-rules run not done.** `@firebase/rules-unit-testing` is installed but no
  emulator was run. The harness re-implements the rule logic in JavaScript; it is a
  model, not the engine. A rules bug the model does not mirror stays hidden, and three
  apparent product bugs during this phase were actually model bugs. Before trusting
  the rules in production, run the emulator and re-check these cases.
- **Admin email is still a placeholder** in three places that must agree:
  `ADMIN_EMAILS` in `js/firebase-config.js`, `adminEmail()` in `firestore.rules`, and
  `storage.rules`. Until it is real, nobody is an admin.
- **Assessment scores are not yet secure** — `answerKey` still ships inside the
  student-readable training document. That is Phase 2. Nothing in this phase improves
  it, and no claim is made that it does.
- **`kgid` is still student-editable after approval** (`protectedProfileFields()` does
  not include it). Phase 3, item 8.
- **`storage.rules` lets any signed-in user read certificate backgrounds.** Low impact,
  worth tightening in Phase 3.
