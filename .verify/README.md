# Offline verification harness

Tests for the Kannada DTI portal (`index.html`, `firestore.rules`, `js/firebase-service.js`).
They run in Node with jsdom and need no Firebase project, no emulator and no network.

```bash
cd .verify
npm install      # jsdom only
npm test
```

## What this proves

Each suite fails loudly, so a regression in the app breaks the build rather than
silently passing.

| suite | what it covers |
|---|---|
| `t-boot.js` | the module-loading race is gone: the app leaves the "setup pending" screen once the Firebase module reports ready |
| `t-boot2.js` | three orderings — module already ready, project unconfigured, module file missing |
| `t-rules.js` | student isolation, admin access, and direct rule attacks (edit marks, escalate profile, unconstrained scans) |
| `t-guards.js` | no student session ever issues an unconstrained list read |
| `t-certs.js` | the `certificates` rules: 8 forgery paths refused, issued certificates immutable, students cannot read each other's |
| `t-issue.js` | the app's real submit -> score -> number -> certificate chain writes documents the rules accept |
| `t-registration.js` | the real registration form produces a profile the `students` create rule accepts |

## What this does NOT prove

Be careful not to overstate these results.

1. **Not a real Firebase test.** There is no configured project in this environment.
   `loader.js` contains a **hand-written double** of the Firestore API that enforces
   rules by re-implementing their logic in JavaScript. It is a model of the rules, not
   the rules engine itself. A statement in `firestore.rules` that the double does not
   model is therefore untested, and a bug in the double can hide or invent a failure.
   Several apparent product bugs during Phase 1 turned out to be double bugs.

   To test the real rules, run the Firebase emulator against
   `@firebase/rules-unit-testing` and re-check the same cases.

2. **Module loading is simulated.** jsdom's `runScripts: 'outside-only'` mode cannot
   execute `<script type="module">`. The loader queues module scripts and invokes the
   ready callback asynchronously, which reproduces the *ordering* the race depended on
   but is not a real browser's module pipeline. A browser smoke test is still required.

3. **No storage, billing, or network behaviour.** `FirebaseService` is a stub; only the
   methods the app calls exist. Certificate background uploads, download URLs and any
   Cloud Function path are not exercised here.

4. **Timing.** `settle()` waits a fixed number of milliseconds. It is deliberate and
   generous, but it is not a synchronisation primitive; a slow machine could in
   principle produce a flicker that a real browser would not.

## Adding a case

`loader.js` exposes `loadPage(opts)`, which returns a page handle:

```js
const { loadPage } = require('./loader');
const h = loadPage({
  configured: true,                       // false simulates a missing config
  adminEmails: ['boss@x.com'],
  db: { 'students/s1': {...}, 'trainings/t1': {...} },
});

await h.settle(50);                       // let the module ready callback land
h.signIn({ uid:'s1', email:'s1@x.com' }); // mirrors isApproved() from students/s1
await h.settle(300);

h.db.submissions;           // the app's own DB after its loaders ran
h.fx.calls.reads;           // every list/doc read with its constraints
h.fx.calls.writes;          // every write with its payload
h.fx.docStore;              // the raw document store
h.gate;                     // AUTH.gate
```

The app's internals are closed over inside an IIFE, so `loader.js` injects a
`window.__probe` object just before the IIFE's closing `})();`. Add functions to
`PROBE` when a test needs to drive a private code path. `h.w.eval('DB')` will **not**
reach that state — it runs in a fresh lexical scope.

If you assert on a rule, model it in `docAllowed()` / `listAllowed()` in the same
commit, and keep the double's logic visibly parallel to `firestore.rules`.
