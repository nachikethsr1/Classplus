# Phase 4 — Firebase Emulator Suite

Date: 2026-11-23
Suite: `tests/emulator/` · run with `./tests/emulator/run.sh`
Last run: **195 checks — 191 pass, 1 fail, 3 documented gaps**, 23.5 s

Everything below was produced by the **real Firebase rules engine** running
in the Authentication, Firestore and Storage emulators, loading the
**committed** `firestore.rules` and `storage.rules` unmodified, driven by the
**real Firebase Web SDK v10.12.5**. Four separate signed-in sessions plus a
signed-out one, each its own `FirebaseApp` with a real ID token.

**No production Firebase project was touched, and nothing here says the
production project passes.** See §6 for what still has to be checked there.

---

## 1. Status of the Phase 1 items

Phase 1 was verified with `.verify/`, a hand-written JavaScript re-implementation
of the rules. Two of its three conclusions survive contact with the real engine.
One does not.

| Phase 1 item | Phase 1 said | The emulator says |
|---|---|---|
| (a) Firebase module loading race | fixed | **Confirmed fixed.** A01 — before the module reports in the app shows no configuration error; A02/A18/A21 — all three session types reach their correct gate after `announceReady()`. |
| (b) missing `certificates` rules | fixed | **Confirmed fixed, and stronger than claimed.** C01–C24: all nine forgery paths denied, cross-student reads denied, certificates immutable for the admin too. But see (d). |
| (c) rules / query compatibility | fixed | **WRONG — it was broken.** The student trainings query was refused outright. Fixed in this phase, see §2.1. |
| (d) *not a Phase 1 item* | — | **The admin could not issue a certificate at all.** The create rule had no admin branch. Fixed, §2.3. |

`.verify/` reported (c) as fixed because its Firestore double modelled the
trainings rule as published-only, which is not what the committed rule said.
A hand-written double can only test the rules its author re-implemented. Its
143 passing assertions are not evidence about `firestore.rules` and should not
be cited as such.

---

## 2. Defects the emulator found, and the fixes

### 2.1 Students could not see any training — `permission-denied` (commit `2cec533`)

The rule required `resource.data.archived != true`; the only query a student can
run is `where('published','==',true)`. Firestore applies rules as a **pre-filter**:
a list query is refused unless its own constraints prove every condition the rule
puts on `resource.data`. The query could not prove the `archived` condition, so the
**whole query was refused**. Not "archived trainings were hidden" — *nothing loaded*.
No trainings, no assessment, no certificate. The portal was non-functional for every
student.

Fixed by making the rule exactly what the query can prove. Archived trainings
remain invisible because `archive-training` writes `{archived:true, published:false}`,
and because `loadTrainingsForStudent()` drops `archived === true` client-side for a
hand-edited document that is both. T04/T04b/T15 cover both routes.

*Failing before:* T08, T13, T14, T15, A03, A04, A05. *Now:* 02-trainings 24/24.

### 2.2 The admin could not delete the certificate background (commit `697c3d4`)

`allow write` covers create, update **and** delete. On a delete there is no
`request.resource`, so `isImage()` threw and the rule denied every delete,
including the admin's. `deleteCertificateBg()` and the designer's Reset button
both swallow that error, so the UI reported success while the old artwork stayed
in the bucket and kept being served.

Split into `allow create, update` (validated upload) and `allow delete: if isAdmin()`.

*Failing before:* B13. *Now:* 07-storage 13/13, plus 11-cert-design 11/11.

### 2.3 The admin could not issue a certificate (commit `b014800`)

`certificates` create only had the student branch — `isSelf(studentUid)` and the
submission must be the caller's. An administrator was refused. With
`allow update: if false`, that left **no way at all** to correct or re-issue a
certificate, which is also the only way a provisional number could ever be
replaced by a real one.

The submission-linkage check is now a shared function, so an admin-issued
certificate is validated exactly as hard as a student-issued one: real submission,
passed, marks/total/pct copied verbatim, and the named student must be the one who
sat it (C27, C28, C29 confirm an admin cannot forge any of that).

*Failing before:* C25. *Now:* 05-certificates 28 pass + 1 gap.

### 2.4 Provisional certificate numbers collided (commit `e94a7ac`) — task item 5

Answered in full in §4.

---

## 3. What passed, by area

| Suite | Checks | Result |
|---|---|---|
| 01 `students/{uid}` | 27 | all pass |
| 02 `trainings/{id}` | 24 | all pass |
| 03 answer keys | 7 | 6 pass, **1 gap (K07)** |
| 04 `submissions/{id}` | 23 | 22 pass, **1 gap (S23)** |
| 05 `certificates/{id}` | 29 | 28 pass, **1 gap (C26)** |
| 06 settings / designs / counters | 15 | all pass |
| 07 `storage.rules` | 13 | all pass |
| 08 the real app against the emulator | 32 | all pass |
| 09 certificate numbering | 10 | all pass |
| 10 admin allowlist consistency | 4 | 3 pass, **1 fail (X04, by design — §5)** |
| 11 certificate design + upload | 11 | all pass |

Specifically verified, as the task asked:

- **Each session type separately.** Signed-out, pending student, approved student,
  a second approved student, and the admin — five independent `FirebaseApp`
  instances with real ID tokens.
- **A student cannot read another student's profile** (P01–P06), **submissions**
  (S02, S05, A17) or **certificates** (C03, C07, A16).
- **A student cannot read answer keys.** `trainingKeys/{id}` is denied for students,
  single-document and by query (K01–K06); A10 confirms the student session never
  even requests them.
- **A student cannot change their KGID after approval** (P12–P15), nor their
  official name, status, role or approval timestamp (P16–P22).
- **A student cannot write marks or pass status onto an existing submission**
  (S17–S19), cannot touch the shared certificate design (G06, D11), cannot write
  `settings/` (G04) or `counters/` (G14). Marks on a *first* submission are the
  S23 gap.
- **Published / unpublished / archived visibility** (T01–T15, A05–A07).
- **Certificate read/write and a failing background upload** (05, 07, 11 — D07–D10
  cover Storage being unavailable and an upload the rules refuse; neither may leave
  a `data:` URL in Firestore or report success).
- **Constrained queries against the real rules** (T07–T12, S10–S13, C05–C08):
  every unconstrained scan is denied, every constraint the app actually uses is
  allowed.
- **Real module loading order** — `index.html` is loaded in jsdom, scripts execute
  in document order, and the service module arrives late exactly as
  `announceReady()` delivers it (A01, A02, A18, A21).

---

## 4. Item 5 — the provisional certificate-number scheme

**Question: can a provisional number collide with an admin-issued serial?**
**Before this phase: yes, two different ways. Both are now closed.**

The scheme was `9000 + n`, where `n` came from `DB.certCounter` in **localStorage**,
formatted identically to a register serial.

1. **Provisional numbers collided with each other.** The counter is per browser, not
   per portal. Every student's first certificate was `DTI-BNG-2026-9001`
   (test N04 — two students, same number).
2. **They collided with real serials.** `settings/portal.certCounter` is unbounded;
   when it reaches 9000 the admin mints `DTI-BNG-2026-9001` as a genuine serial
   (test N05).
3. **A third path was worse.** `nextCertificateNumber()`, used when Firebase is off,
   minted `DTI-BNG-<year>-0001` with no offset — a direct collision with the admin's
   very first serial.
4. **Nothing on the document said it was provisional**, so no query could find them.

Fixed: provisional numbers are now
`DTI-BNG-<year>-PROV-<uid token>-<NN>` — unique per student by construction,
structurally incapable of equalling a counter serial, and obvious to a human reading
the certificate. The document carries `provisional: true`, and the admin register
shows a count of certificates still awaiting a real serial.

**Should a provisional number be replaced before a certificate is issued? Yes.**

A provisional number is not a register entry. It is minted by a client with no view
of the register and no ability to reserve anything, so it cannot be audited,
cannot be looked up in sequence, and cannot be proved unique by the rules (C26).
A certificate carrying one should be treated as *issued to the student, not yet
entered in the register*.

The correct end state is that the browser never numbers a certificate at all: a
Cloud Function scores the submission and allocates the serial from the counter in
the same transaction that writes the certificate, and `certificates` becomes
`allow create: if false` for clients. Until that function exists, the honest
intermediate is what is now in place — number it provisionally, mark it, show the
admin how many are outstanding, and let the admin re-issue (now possible, §2.3)
to replace it with a counter-allocated serial.

---

## 5. Still open — not fixed in this phase

| ID | What | Why it is still open |
|---|---|---|
| **X04** | `replace-with-admin-google-account@gmail.com` is still the admin address in `js/firebase-config.js`, `firestore.rules`, `storage.rules`. | Deliberately not changed, per instruction. **This test fails on purpose.** The suite only passes the other admin checks because it signs in *as the placeholder*. In production the real administrator has no admin access until this is replaced in all three files. |
| **K07** | The `answerKey` is mirrored into the student-readable `trainings/{id}` document while `SCORING.mode === 'client'`. The exam is open-book to anyone who opens devtools. | `trainingKeys/{id}` is correctly locked; this is the copy the client needs to score itself. Needs server-side scoring. |
| **S23** | A student's *first* submission can carry any `marksObtained` / `passStatus` it likes. The create rule validates shape and ownership, not the score. | `computeResult()` runs in the browser. Only a Cloud Function plus `allow create: if false` closes it. |
| **C26** | Nothing makes `certificates.number` unique. Two documents can carry the same serial. | Rules cannot express uniqueness without a reserved-document pattern. Uniqueness must come from the counter transaction or a server-side allocator. |

K07, S23 and C26 are the same root cause: **scoring and numbering happen on the
client.** They are reported as `gap` rather than `fail` because the rules behave
as written — the design is what is insufficient. Cloud Functions are explicitly
out of scope here (no build, no deploy, no billing).

---

## 6. What the emulator cannot tell you

These require the real project and have **not** been tested:

1. **The rules are deployed.** The emulator reads the files in this repo. Nobody has
   run `firebase deploy --only firestore:rules,storage` — the production project may
   still be in test mode or on an older version of these files.
2. **The real admin address.** Fix X04 first, then confirm the live account reaches
   the admin UI and that no other account does.
3. **The real Firebase config.** `js/firebase-config.js` is all `REPLACE_WITH_…`.
   The emulator overrides it with a demo project.
4. **Real Google sign-in** — authorised domains, OAuth consent, popup vs redirect.
   The emulator issues tokens without any of that.
5. **Composite indexes.** The emulator serves queries the real backend may refuse
   until an index is built.
6. **`email_verified`.** `isAdmin()` requires it. Google accounts have it; the
   emulator's tokens are set to match, but confirm against the live account.
7. **Storage bucket name and CORS** for certificate-background uploads from the
   deployed origin.
8. **Concurrency.** The counter transaction is tested sequentially, not under real
   contention from several admins.

---

## 7. Running it

```bash
./tests/emulator/run.sh          # everything
./tests/emulator/run.sh 05       # one suite
```

Needs Java (the Firestore and Storage emulators are JVM processes); `run.sh` falls
back to the `jdk4py` runtime if there is no system `java`. Machine-readable results
land in `tests/emulator/last-run.json`. The runner exits non-zero while X04 stands,
which is correct: the portal is not production-ready until the admin address is real.

Details of the harness, the sessions and the fixtures: `tests/emulator/README.md`.
