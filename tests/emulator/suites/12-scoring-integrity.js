/* ============================================================
   Can a student decide their own score?

   This is the suite that matters. Everything here is a real attack run
   with the real Firebase SDK against the real rules engine: a student
   trying to award themselves marks, a pass, or a certificate they did not
   earn, from the browser, with full knowledge of the data model.

   The defence has three parts, all in firestore.rules:
     1. the answer key is unreadable until the paper is handed in;
     2. the paper carries no score when it is handed in;
     3. the score is recomputed by the rules from the frozen answers.
   ============================================================ */

const { doc, getDoc, setDoc, updateDoc, deleteDoc } = require('firebase/firestore');
const h = require('../harness');
const { session, admin, adminSdk, USERS } = require('../env');
const { T_PUB, tokens, KEY } = require('../fixtures');

/* a fresh training nobody has sat yet, so the "before you submit" tests
   are not contaminated by the seeded submissions */
const T_FRESH = 't_fresh_paper';

function paper(uid, trainingId, answers, overrides) {
  return Object.assign(
    {
      studentUid: uid,
      trainingId,
      officialNameSnapshot: 'ಅನನ್ಯಾ',
      kgidSnapshot: 'KG-1001',
      emailSnapshot: 'x@example.test',
      designationSnapshot: 'Officer',
      trainingTitle: 'ಕನ್ನಡ ತರಬೇತಿ',
      trainingTopic: 'Assembly procedures',
      trainingDate: '2026-01-15',
      feedbackResponses: { ratings: {}, answers: {} },
      assessmentAnswers: answers,
      answerTokens: tokens(answers),
      attemptNo: 1,
      certificateNo: null,
      submittedAt: new Date(),
    },
    overrides || {}
  );
}

module.exports = async function run() {
  h.setGroup('scoring integrity');

  adminSdk();
  const db = admin.firestore();
  const me = await session('approved');
  const other = await session('other');
  const boss = await session('admin');

  /* a second paper, untouched, for the pre-submission tests */
  const { training, keyDoc } = require('../fixtures');
  await db.doc('trainings/' + T_FRESH).set(training(T_FRESH));
  await db.doc('trainingKeys/' + T_FRESH).set(keyDoc());

  const myFresh = me.uid + '_' + T_FRESH;

  /* ---------- 1. the paper is closed while it is open ---------- */

  await h.deny('V01', 'student reads the answer key BEFORE handing the paper in', () =>
    getDoc(doc(me.db, 'trainingKeys/' + T_FRESH))
  );
  await h.deny('V02', "student reads another student's training key", () =>
    getDoc(doc(other.db, 'trainingKeys/' + T_FRESH))
  );
  {
    const snap = await db.doc('trainings/' + T_PUB).get();
    const d = snap.data() || {};
    h.expect(
      'V03',
      'the student-readable training document carries no answer key',
      !('answerKey' in d) && !(d.questions || []).some((q) => 'correct' in q || 'answer' in q),
      'fields: ' + Object.keys(d).join(',')
    );
  }
  await h.deny('V04', 'admin writes an answerKey back onto a training document', () =>
    setDoc(doc(boss.db, 'trainings/' + T_FRESH), { answerKey: { q1: 2 } }, { merge: true })
  );

  /* ---------- 2. the paper carries no score ---------- */

  await h.deny('V05', 'student hands in a paper with marks on it', () =>
    setDoc(doc(me.db, 'submissions/' + myFresh), paper(me.uid, T_FRESH, KEY, { marksObtained: 4, totalMarks: 4, percentage: 100, passStatus: true }))
  );
  await h.deny('V06', 'student hands in a paper claiming only passStatus', () =>
    setDoc(doc(me.db, 'submissions/' + myFresh), paper(me.uid, T_FRESH, KEY, { passStatus: true }))
  );
  await h.deny('V07', 'student hands in a paper under an id that is not theirs', () =>
    setDoc(doc(me.db, 'submissions/' + other.uid + '_' + T_FRESH), paper(me.uid, T_FRESH, KEY))
  );
  await h.deny('V08', 'student floods the token list to buy marks', () =>
    setDoc(
      doc(me.db, 'submissions/' + myFresh),
      paper(me.uid, T_FRESH, KEY, {
        answerTokens: ['q1:0#1', 'q1:1#1', 'q1:2#1', 'q1:3#1', 'q2:0#1', 'q2:1#1', 'q2:2#1', 'q2:3#1'],
      })
    )
  );

  /* a wrong paper: q1 right (1 mark), q2 wrong, q3 wrong -> 1 of 4 = 25% */
  const wrong = { q1: 2, q2: 3, q3: 3 };
  await h.allow('V09', 'student hands in a paper with answers and no score', () =>
    setDoc(doc(me.db, 'submissions/' + myFresh), paper(me.uid, T_FRESH, wrong))
  );
  await h.allow('V10', 'the key is released once the paper is in', () =>
    getDoc(doc(me.db, 'trainingKeys/' + T_FRESH))
  );
  await h.deny('V11', 'a second attempt at the same training', () =>
    setDoc(doc(me.db, 'submissions/' + myFresh), paper(me.uid, T_FRESH, KEY))
  );

  /* ---------- 3. the rules mark the paper ---------- */

  await h.deny('V12', 'student awards themselves full marks', () =>
    updateDoc(doc(me.db, 'submissions/' + myFresh), { marksObtained: 4, totalMarks: 4, percentage: 100, passStatus: true })
  );
  await h.deny('V13', 'student awards themselves a bare pass', () =>
    updateDoc(doc(me.db, 'submissions/' + myFresh), { marksObtained: 3, totalMarks: 4, percentage: 75, passStatus: true })
  );
  await h.deny('V14', 'student keeps the real marks but flips passStatus', () =>
    updateDoc(doc(me.db, 'submissions/' + myFresh), { marksObtained: 1, totalMarks: 4, percentage: 25, passStatus: true })
  );
  await h.deny('V15', 'student keeps the real marks but inflates the percentage', () =>
    updateDoc(doc(me.db, 'submissions/' + myFresh), { marksObtained: 1, totalMarks: 4, percentage: 100, passStatus: false })
  );
  await h.deny('V16', 'student shrinks the total so one mark becomes 100%', () =>
    updateDoc(doc(me.db, 'submissions/' + myFresh), { marksObtained: 1, totalMarks: 1, percentage: 100, passStatus: true })
  );
  await h.deny('V17', 'student rewrites their answers to the correct ones', () =>
    updateDoc(doc(me.db, 'submissions/' + myFresh), { assessmentAnswers: KEY, answerTokens: tokens(KEY) })
  );
  await h.deny('V18', 'student rewrites the answers and the score together', () =>
    updateDoc(doc(me.db, 'submissions/' + myFresh), {
      answerTokens: tokens(KEY), marksObtained: 4, totalMarks: 4, percentage: 100, passStatus: true,
    })
  );
  await h.deny('V19', "another student marks someone else's paper", () =>
    updateDoc(doc(other.db, 'submissions/' + myFresh), { marksObtained: 1, totalMarks: 4, percentage: 25, passStatus: false })
  );

  await h.allow('V20', 'the honest score the key produces is accepted (1 of 4 = 25%, failed)', () =>
    updateDoc(doc(me.db, 'submissions/' + myFresh), {
      marksObtained: 1, totalMarks: 4, percentage: 25, passStatus: false,
      correctCount: 1, wrongCount: 2, passingPercent: 70, scoredAt: new Date(),
    })
  );
  {
    const d = (await db.doc('submissions/' + myFresh).get()).data() || {};
    h.expect('V21', 'the stored score is the one the key produces', d.marksObtained === 1 && d.percentage === 25 && d.passStatus === false, JSON.stringify({ m: d.marksObtained, p: d.percentage, pass: d.passStatus }));
  }
  await h.deny('V22', 'student re-marks their own paper after it was scored', () =>
    updateDoc(doc(me.db, 'submissions/' + myFresh), { marksObtained: 4, totalMarks: 4, percentage: 100, passStatus: true })
  );

  /* ---------- 4. the admin is held to the same key ---------- */

  await h.deny('V23', 'ADMIN awards marks the answer key does not support', () =>
    updateDoc(doc(boss.db, 'submissions/' + myFresh), { marksObtained: 4, totalMarks: 4, percentage: 100, passStatus: true })
  );
  await h.allow('V24', 'admin re-marks a paper with the honest score (repair path)', () =>
    updateDoc(doc(boss.db, 'submissions/' + myFresh), { marksObtained: 1, totalMarks: 4, percentage: 25, passStatus: false })
  );

  /* ---------- 5. no certificate out of a failed paper ---------- */

  function cert(overrides) {
    return Object.assign(
      {
        number: 'DTI-BNG-2026-9999',
        submissionId: myFresh,
        studentUid: me.uid,
        studentName: 'ಅನನ್ಯಾ',
        kgid: 'KG-1001',
        trainingId: T_FRESH,
        trainingTitle: 'ಕನ್ನಡ ತರಬೇತಿ',
        trainingTopic: 'Assembly procedures',
        date: '2026-01-15',
        marks: 1,
        total: 4,
        pct: 25,
        issuedAt: new Date(),
      },
      overrides || {}
    );
  }

  await h.deny('V25', 'student issues a certificate for the paper they failed', () =>
    setDoc(doc(me.db, 'certificates/cert_fresh_fail'), cert())
  );
  await h.deny('V26', 'student issues a certificate with inflated marks on a failed paper', () =>
    setDoc(doc(me.db, 'certificates/cert_fresh_forge'), cert({ marks: 4, total: 4, pct: 100 }))
  );
  await h.deny('V27', 'ADMIN issues a certificate for the paper the student failed', () =>
    setDoc(doc(boss.db, 'certificates/cert_fresh_admin'), cert())
  );

  /* ---------- 6. the honest route still works end to end ---------- */

  const freshStudent = await session('fresh');
  await db.doc('students/' + USERS.fresh.uid).set({
    uid: USERS.fresh.uid, email: USERS.fresh.email, officialName: 'ಪರೀಕ್ಷಾರ್ಥಿ',
    kgid: 'KG-9', designation: 'Officer', department: 'Revenue', status: 'approved', role: 'student',
  });
  const hisId = USERS.fresh.uid + '_' + T_FRESH;
  await h.allow('V28', 'a student who answers everything correctly hands in', () =>
    setDoc(doc(freshStudent.db, 'submissions/' + hisId), paper(USERS.fresh.uid, T_FRESH, KEY))
  );
  await h.allow('V29', 'and is awarded full marks by the rules (4 of 4 = 100%, passed)', () =>
    updateDoc(doc(freshStudent.db, 'submissions/' + hisId), {
      marksObtained: 4, totalMarks: 4, percentage: 100, passStatus: true,
      correctCount: 3, wrongCount: 0, passingPercent: 70, scoredAt: new Date(),
    })
  );
  await h.allow('V30', 'and can then issue their certificate', () =>
    setDoc(doc(freshStudent.db, 'certificates/cert_fresh_pass'), {
      number: 'DTI-BNG-2026-PROV-ABCDE-01', provisional: true, submissionId: hisId,
      studentUid: USERS.fresh.uid, studentName: 'ಪರೀಕ್ಷಾರ್ಥಿ', kgid: 'KG-9',
      trainingId: T_FRESH, trainingTitle: 'ಕನ್ನಡ ತರಬೇತಿ', trainingTopic: 'x', date: '2026-01-15',
      marks: 4, total: 4, pct: 100, issuedAt: new Date(),
    })
  );

  /* ---------- 7. partial credit is real, not rounded away ---------- */
  {
    const partial = { q1: 2, q2: 0, q3: 3 }; /* q1+q2 right, q3 (2 marks) wrong = 2/4 = 50% */
    const pid = USERS.other.uid + '_' + T_FRESH;
    await h.allow('V31', 'a second student hands in a half-right paper', () =>
      setDoc(doc(other.db, 'submissions/' + pid), paper(USERS.other.uid, T_FRESH, partial))
    );
    await h.deny('V32', 'they cannot round 50% up to a pass', () =>
      updateDoc(doc(other.db, 'submissions/' + pid), { marksObtained: 2, totalMarks: 4, percentage: 50, passStatus: true })
    );
    await h.allow('V33', 'weighted marks come out right (2 of 4 = 50%, failed)', () =>
      updateDoc(doc(other.db, 'submissions/' + pid), { marksObtained: 2, totalMarks: 4, percentage: 50, passStatus: false })
    );
  }

  await db.doc('trainings/' + T_FRESH).delete();
  await db.doc('trainingKeys/' + T_FRESH).delete();
  await deleteDoc(doc(boss.db, 'submissions/' + myFresh)).catch(() => {});
};
