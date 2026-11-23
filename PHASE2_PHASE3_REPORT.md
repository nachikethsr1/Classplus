# Phase 2 & 3 report

Branch `arena/62f31f93-classplus`, PR #4. **Nothing merged, nothing deployed.**
Every test result below is a **harness result**, not a real Firebase project run —
please read the caveat at the end before quoting any of it.

---

## Phase 2 — assessment security

### 4. Answer keys are out of the student-readable document ✅ (with a real limitation)

**The problem was worse than "keys are exposed".** `answerKey` sat on
`trainings/{id}`, which every approved student can read, so the answers were
readable from the browser console. But the deeper problem is that
`computeResult()` ran *in the browser* and wrote `marksObtained` and
`passStatus` to Firestore itself. Even with the key hidden, a student who
edits the request can post whatever marks they like — the key was never the
only leak.

**What changed**

- New `trainingKeys/{trainingId}` collection. Rules: `allow read, write: if isAdmin()`. A student cannot read it even with the console open.
- `saveTrainingKeyDoc()` is the single writer. The admin save path calls it, so keys are mirrored into the registry automatically.
- `loadAnswerKeys()` caches keys for admin screens only. `loadPortalData()` fetches keys *before* trainings, never on the student path.
- `trainingFromDoc()` no longer trusts the document's own key; deleting a training deletes its key document too.

**The honest limitation.** The browser still marks the paper, so in the current
build it still needs the key. Removing the key outright would mean students
cannot submit at all. So there is an explicit switch:

```js
const SCORING = { mode: 'client' };   // 'server' once a function is deployed
```

In `client` mode the key is still mirrored onto the training document, because
the key has to be somewhere the browser can read it. **So today, the exam is
still open-book. This item is not a security fix by itself — it is the
groundwork plus an honest label.** Flipping to `server` is a one-line change
*after* the function exists, and the keys are already in place, so there is no
migration step.

### 5. Server-side scoring: investigation only, NOT implemented ⚠️

Per your instruction I did **not** build or deploy a function and did **not**
touch billing. What it would take:

**Requires the Blaze (pay-as-you-go) plan.** Cloud Functions is not available on
Spark at all. Blaze has no monthly fee and keeps the free quotas; you pay only
above them. You need a Google Cloud billing account attached to the project.

| Line item | Free per month | Above the free quota |
|---|---|---|
| Cloud Functions invocations | 2,000,000 (Blaze only) | $0.40 / million |
| Cloud Functions compute | included in the invocation allowance, then per GB-second | ~$0.0000025 / GB-second |
| Cloud Functions outbound data | 5 GB | $0.12 / GB |
| Firestore reads | 50,000/day | $0.06 / 100k |
| Firestore writes | 20,000/day | $0.18 / 100k |

Eligible accounts get $300 of Blaze credit, which at this app's scale would
cover a very long time.

**What this app would actually cost.** A submission is one invocation that does
a handful of reads and one write. At 2M free invocations a month, a centre
running, say, 1,000 exams a month uses about 0.05% of the free invocation
allowance. The realistic bill is **$0.00/month**, and the risk is not volume —
it is that Blaze has **no hard spending cap**. The practical guard is a budget
alert and a capped budget in Google Cloud, plus keeping the function warm-free
and small.

**The design I would build, if you approve it:**

1. Callable function `submitAssessment`, called with `{trainingId, answers, feedback, details}`.
2. Verify `context.auth` exists; read `students/{uid}` server-side and require `status === 'approved'`.
3. Read `trainingKeys/{trainingId}` **in the function** (Admin SDK — bypasses rules, which is the point).
4. Compute marks with the same weighted logic as `computeResult()`, so results match the client exactly.
5. Write `submissions/{id}` **from the function**, including `marksObtained`, `percentage`, `passStatus`.
6. Tighten `submissions` rules to `allow create: if false` — students can then only submit through the function. This is the step that actually closes the hole.
7. Certificates: the function also allocates the number and writes the certificate doc, so numbering becomes a single server-side sequence.

**What it does not fix on its own:** a student can still *see* which answers a
classmate gave; and any content in `trainings/{id}` stays readable. Only the
key and the score become trustworthy.

**Until that is approved and deployed, this is my plain assessment:**
assessment scores are **not** secure. A student who knows how to open a browser
console can read the answers and can post their own marks. Nothing in this
branch changes that.

### 12. Feedback radios ✅

I tested this properly before "fixing" it, and the radios were **not broken in
the normal case** — selecting one saved it correctly, and it survived a
re-render. What was broken is narrower but real:

- `persistDraft()` **debounced by 250 ms**, so a choice lived only in memory for a quarter second. Close the tab in that window and the answer was gone. It now writes synchronously.
- `dropDraft()` did not cancel that pending timer, so a queued write could resurrect a draft after submission. Fixed.
- The per-element bindings only covered elements present when `bindPostRender()` ran. The document-level `change` handler is now the fallback, so a control that renders later still saves instead of merely *looking* selected.
- A full `localStorage` quota used to drop the draft silently; the cached certificate background is now evicted and the write retried once.

---

## Phase 3 — certificate and data correctness

### 6. Portrait/landscape certificate sizing ✅

The base `.cert` rule hard-codes `aspect-ratio: 1.414/1` (landscape) and
`.cert-custom` never overrode it, so a portrait design was letterboxed inside a
landscape box. The design's own aspect now drives both the on-screen box
(`--cert-aspect`) and the printed page, and the background fills that box
exactly instead of being scaled to fit.

### 7. No base64 in Firestore ✅

A 5 MB upload becomes a ~6.7 MB data URL, and Firestore rejects documents over
1 MiB. The old code swallowed that failure and reported success, leaving the
designer pointing at an image no other browser could load. Now only a Storage
URL is persisted; if Storage is unavailable the save is **refused** with a
plain message, and it is never reported as saved.

### 8. KGID protected after approval ✅

`kgid` and `officialName` are frozen once `status == 'approved'`, because they
are what appears on the certificate. A **pending** student may still correct a
typo before an admin approves them; an admin can always change either.

### 9. One certificate numbering scheme ✅

There were two: admin `DTI-BNG-2026-0007` from a counter, student
`DTI-BNG-2026-S1J9NFU` from a uid token. Both looked official and neither could
be reconciled with the other. Now there is one format —
`DTI-BNG-<year>-<NNNN>` — and one source, the `settings/portal` counter.

**Found while testing:** students cannot write `settings/` (correctly), so the
counter transaction fails for them. The first version of this fix left that
failure to blow up the submit flow — a student's certificate step would have
died with permission-denied. The code now checks the role first and issues a
**provisional** number in the 9xxx range instead of pretending to have a real
serial. The stale hard-coded year `2026` is gone.

### 10. Default training seed ✅

`publishDefaultTrainingIfEmpty()` existed but was **never called**. It now runs
on the first admin boot of an empty register, keyed to the fixed `t_assembly`
document id, and it refuses a populated register. Verified idempotent: two
further seed calls create nothing, and a student session never seeds.

### 11. `computeResult()` weighting ✅

Now scores each question by its own `q.marks` and divides by the total marks
available. The passing percentage is unchanged. **Compatibility:** for the
equal-weight papers that exist today, the result is arithmetically identical —
the test asserts this by re-running the old formula alongside the new one on
five answer patterns.

**Migration: none needed.** Existing submissions keep the marks they were given
at the time; nothing is recomputed. `totalQuestions` is exposed as a new field
because one view labelled the marks total as a question count — with weights of
1 the two are the same number, which is why the bug was invisible.

---

## Tests

13 suites, **143 assertions**, all passing (`cd .verify && npm test`):

| suite | covers |
|---|---|
| t-boot, t-boot2 | module-loading race, three load orderings |
| t-rules | student isolation, admin access, 9 rule attacks |
| t-guards | no unconstrained scan in a student session |
| t-certs | 8 certificate forgery paths refused |
| t-keys | keys admin-only; the mode switch |
| t-profile | KGID frozen after approval |
| t-scoring | weighted marks + old-formula compatibility |
| t-seed | seeds once, never duplicates |
| t-certno | one numbering scheme, both roles |
| t-feedback | answers persist immediately |
| t-issue | real submit → score → certificate path |
| t-registration | real registration vs the create rule |

---

## What is still not fixed, and what you should know

1. **Scores are not secure until item 5 is approved and deployed.** Read the section above before telling anyone the exam is closed-book.
2. **No real Firebase test has been run.** There is no configured project here, and no emulator. `.verify/loader.js` is a hand-written double that re-implements the rule logic in JavaScript. Three "product bugs" during this work turned out to be bugs in that double, which is exactly the failure mode to worry about. **Run the emulator with `@firebase/rules-unit-testing` before trusting the rules.**
3. **Module loading is simulated**, not executed. Do a hard-refresh smoke test in a real browser.
4. **Nothing was deployed**, so none of this is live. The rules changes must be published with `firebase deploy --only firestore:rules` when you are ready.
5. **The admin email is still a placeholder** in three places that must agree: `ADMIN_EMAILS`, `adminEmail()` in `firestore.rules`, `storage.rules`. Until it is real, nobody is an admin and the seed will not run.
6. **`storage.rules` still lets any signed-in user read certificate backgrounds.** Low impact; not changed.
7. **A student can still read another student's answers** in `submissions` only if rules allow — they do not (t-rules covers this) — but they *can* read their own, which is correct.
8. **Existing `answerKey` fields are still on old training documents.** They are now harmless in `server` mode but are still readable in `client` mode. When the function goes live, delete that field from each training document as a one-off.
