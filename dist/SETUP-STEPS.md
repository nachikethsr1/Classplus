# Firebase setup — one step at a time

Project: **dti-bengaluru-training-portal**
Admin: **savithakh80@gmail.com**
File to upload: **`dist/classplus-portal.zip`** (80 KB)

Your Firebase config and admin email are already inside the ZIP. There is
nothing left to edit in the code.

Do the steps in order. Step 3 is the one that matters most — until it is done
your database is open to anyone on the internet.

---

## Step 1 — Publish the Firestore rules

1. Open https://console.firebase.google.com and pick **dti-bengaluru-training-portal**.
2. Left sidebar → **Firestore Database**.
3. Top tab → **Rules**.
4. Select everything in the editor and delete it.
5. Open `_firebase-rules/firestore.rules` from the ZIP in Notepad, copy all of it,
   paste it into the editor.
6. Click **Publish**.

It should say "Rules published". If it shows a red error, nothing was published —
tell me the error text and stop here.

## Step 2 — Turn on Storage

Needed for the certificate background image.

1. Left sidebar → **Storage** → **Get started**.
2. Choose **Start in production mode** → **Next**.
3. Location: **asia-south1 (Mumbai)** → **Done**.

Wait for the bucket to appear.

## Step 3 — Publish the Storage rules

1. Still in **Storage** → top tab **Rules**.
2. Delete everything in the editor.
3. Paste all of `_firebase-rules/storage.rules` from the ZIP.
4. Click **Publish**.

**Both Step 1 and Step 3 must say published.** Until they do, the default rules
are in force, and on a new project those either block everything or allow
everything — neither is what you want.

## Step 4 — Check Google sign-in is on

1. Left sidebar → **Authentication** → **Sign-in method**.
2. **Google** should say *Enabled*. If not, click it, toggle **Enable**, pick a
   support email, **Save**.

## Step 5 — Deploy the site to Netlify

1. Go to https://app.netlify.com → **Add new site** → **Deploy manually**.
2. Drag **`classplus-portal.zip`** onto the drop zone.
3. Wait for the deploy to finish and copy the address it gives you, e.g.
   `https://something-random-12345.netlify.app`.

Do **not** connect Netlify to the GitHub repository's `main` branch. `main` is an
old state of the repo and does not have this portal on it.

## Step 6 — Authorise the Netlify domain

Google sign-in refuses to run on a domain Firebase does not know.

1. Firebase console → **Authentication** → **Settings** tab → **Authorized domains**.
2. **Add domain** → paste the Netlify host **without** `https://`, e.g.
   `something-random-12345.netlify.app` → **Add**.

If you later add a custom domain, add that here too.

## Step 7 — Sign in as the admin

1. Open the Netlify address.
2. Sign in with **savithakh80@gmail.com**.
3. You should land on the admin side: Trainings, Students, Submissions,
   Certificates, Certificate Designer.

If you see a student registration form instead, the email in the rules does not
match the account you signed in with — tell me and I will fix it.

## Step 8 — Create the first training

1. Admin → **Trainings** → add a training with a few questions, mark the correct
   option for each, set the pass mark, and **Publish** it.

The correct answers are written to a separate, private collection
(`trainingKeys`). They are not in the page a student downloads.

## Step 9 — Test with a real student account

Use a second Google account (any Gmail will do).

1. Open the site in a private window, sign in with the second account.
2. Fill in the registration form → you should be held at **"pending approval"**.
3. Back as the admin → **Students** → approve that account.
4. Reload the student window → **the published training must appear in the list.**
   If the list is empty, Step 1 did not take — redo it.
5. Take the assessment and submit it.
6. Check the result screen shows marks and a percentage.
7. If it passed, the certificate should render with a number.

## Step 10 — Check the register

Admin → **Certificates**. The new certificate should be listed.

If the number looks like `DTI-BNG-2026-PROV-XXXXX-01`, that is a **provisional**
number: the student's browser issued it because only you can advance the official
counter. The register shows a count of these at the top. Re-issue them from the
admin side when you want permanent serials.

---

# What to tell me if something goes wrong

Open the browser console (F12 → Console) and send me the red lines. The most
useful ones say `permission-denied` — that means a rule refused something, and
the message tells me which collection.

---

# About the security fix you asked for

**Students can no longer decide their own marks.** The fix is in the rules, which
run on Google's servers, not in the page.

Before: the browser worked out the score and wrote it to the database, and the
answer key was inside the training document the student downloads. A student
could read the answers before answering, or simply write "100%" to the database
with the browser console.

Now:

1. The answer key is in a separate collection the student cannot read.
2. They can only read it **after** their paper is handed in, and a paper cannot
   be handed in twice.
3. A submission that carries marks is refused outright.
4. The marks are written in a second step and the **rules recompute them** from
   the answers already stored, refusing any value that does not match.

33 attacks were run against this with the real Firebase rules engine — including
an administrator trying to award unearned marks — and every one was refused.

### Do you need the Blaze plan or Cloud Functions?

**No.** This works on the free Spark plan with no Cloud Functions, because
Firestore rules can read documents the user cannot, which is enough to mark a
multiple-choice paper.

A Cloud Function would add two things this design cannot:

- **Free-text answers.** Rules can only compare values, not judge an essay.
- **Hiding the key permanently.** Here the key is readable by a student *after*
  they submit — so one student can finish, read the key, and pass the answers to
  a classmate who has not sat it yet. A Cloud Function would never release the
  key at all.

If that second point matters for your use, the answer is not only a Cloud
Function (Blaze plan, pay-as-you-go, effectively free at your volume but it needs
a card on file) — it is also rotating the question set, because a student can
memorise the questions regardless. For an internal training portal, what is in
place now is the right trade: no student can fake a score, and a determined pair
sharing answers is a people problem, not a software one.

### One thing that is still not perfect

Nothing in the rules can stop two certificates from carrying the same number;
rules cannot enforce uniqueness across documents. In practice the official
numbers come from a counter only you can advance, and provisional ones carry a
per-student marker, so a collision needs deliberate effort. It is listed as gap
C26 in the test report.
