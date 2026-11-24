/* submissions/{id} — who may create, who may read, and what is immutable. */

const {
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, getDocs, serverTimestamp,
} = require('firebase/firestore');
const h = require('../harness');
const { session, USERS } = require('../env');
const { T_PUB, T_DRAFT, T_ARCH, T_PUB_ARCH, tokens, KEY, SUB_MINE_PASS, SUB_MINE_FAIL, SUB_OTHER } = require('../fixtures');

/* The exact document submitAssessmentToFirestore() writes: answers, and
   nothing about the score. The marks arrive in a second, rule-verified
   write — see 12-scoring-integrity. */
function subDoc(uid, over) {
  return Object.assign(
    {
      studentUid: uid,
      trainingId: T_PUB,
      officialNameSnapshot: 'ಅನನ್ಯಾ',
      kgidSnapshot: 'KG-1001',
      emailSnapshot: 'approved.student@example.com',
      designationSnapshot: 'Officer',
      trainingTitle: 'ಕನ್ನಡ ತರಬೇತಿ',
      trainingTopic: 'Assembly procedures',
      trainingDate: '2026-01-15',
      feedbackResponses: { ratings: { s1: 5 }, answers: { f1: 'ok' } },
      assessmentAnswers: KEY,
      answerTokens: tokens(KEY),
      attemptNo: 1,
      certificateNo: null,
      submittedAt: serverTimestamp(),
    },
    over || {}
  );
}

module.exports = async function run() {
  h.setGroup('submissions/{id}');

  const anon = await session('anon');
  const me = await session('approved');
  const pending = await session('pending');
  const other = await session('other');
  const boss = await session('admin');

  /* ---- reading ---- */
  await h.deny('S01', 'signed-out visitor reads a submission', () =>
    getDoc(doc(anon.db, 'submissions/' + SUB_MINE_PASS))
  );
  await h.allow('S02', 'student reads their OWN submission', () =>
    getDoc(doc(me.db, 'submissions/' + SUB_MINE_PASS))
  );
  await h.deny("S03", "student reads ANOTHER student's submission (their answers)", () =>
    getDoc(doc(me.db, 'submissions/' + SUB_OTHER))
  );
  await h.allow('S04', 'admin reads any submission', () => getDoc(doc(boss.db, 'submissions/' + SUB_OTHER)));

  /* ---- list queries ---- */
  await h.deny('S05', 'student scans the whole submissions collection', () =>
    getDocs(collection(me.db, 'submissions'))
  );
  await h.allow("S06", "student runs the app's real query: where('studentUid','==',own uid)", () =>
    getDocs(query(collection(me.db, 'submissions'), where('studentUid', '==', me.uid)))
  );
  await h.deny("S07", "student queries another student's submissions", () =>
    getDocs(query(collection(me.db, 'submissions'), where('studentUid', '==', USERS.other.uid)))
  );
  await h.allow('S08', 'admin scans all submissions (unconstrained)', () =>
    getDocs(collection(boss.db, 'submissions'))
  );

  try {
    const snap = await getDocs(query(collection(me.db, 'submissions'), where('studentUid', '==', me.uid)));
    const ids = snap.docs.map((d) => d.id).sort();
    h.expect('S09', 'own-submissions query returns only this student', !ids.includes(SUB_OTHER), 'got ' + JSON.stringify(ids));
  } catch (e) {
    h.expect('S09', 'own-submissions query returns only this student', false, 'query refused: ' + h.errCode(e));
  }

  /* ---- creating ---- */
  await h.allow('S10', 'approved student submits their own attempt on a published training', () =>
    setDoc(doc(me.db, 'submissions/' + me.uid + '_' + T_PUB_ARCH), subDoc(me.uid, { trainingId: T_PUB_ARCH }))
  );
  await h.deny('S11', 'PENDING student submits an attempt', () =>
    setDoc(doc(pending.db, 'submissions/' + pending.uid + '_' + T_PUB), subDoc(pending.uid))
  );
  await h.deny("S12", "student submits an attempt under another student's uid", () =>
    setDoc(doc(me.db, 'submissions/' + me.uid + '_' + T_PUB), subDoc(USERS.other.uid))
  );
  await h.deny('S13', 'student submits against an UNPUBLISHED training', () =>
    setDoc(doc(me.db, 'submissions/' + me.uid + '_' + T_ARCH), subDoc(me.uid, { trainingId: T_ARCH }))
  );
  await h.deny('S14', 'student submits against a training that does not exist', () =>
    setDoc(doc(me.db, 'submissions/' + me.uid + '_t_nope'), subDoc(me.uid, { trainingId: 't_nope' }))
  );
  await h.deny('S15', 'student submits a document missing required fields', () =>
    setDoc(doc(me.db, 'submissions/sub_thin'), { studentUid: me.uid, trainingId: T_PUB })
  );
  await h.deny('S16', 'signed-out visitor submits', () =>
    setDoc(doc(anon.db, 'submissions/anon_' + T_PUB), subDoc('stu_approved'))
  );

  /* ---- immutability ---- */
  await h.deny('S17', 'student rewrites the marks on their own submission', () =>
    updateDoc(doc(me.db, 'submissions/' + SUB_MINE_PASS), { marksObtained: 10, percentage: 100 })
  );
  await h.deny('S18', 'student flips passStatus on their own submission', () =>
    updateDoc(doc(me.db, 'submissions/' + SUB_MINE_FAIL), { passStatus: true })
  );
  await h.deny('S19', 'student overwrites their submission with setDoc', () =>
    setDoc(doc(me.db, 'submissions/' + SUB_MINE_FAIL), subDoc(me.uid))
  );
  await h.deny('S20', 'ADMIN rewrites a submission (audit record is immutable for everyone)', () =>
    updateDoc(doc(boss.db, 'submissions/' + SUB_MINE_PASS), { marksObtained: 9 })
  );
  await h.deny('S21', 'student deletes their own submission', () =>
    deleteDoc(doc(me.db, 'submissions/' + SUB_MINE_PASS))
  );
  await h.allow('S22', 'admin deletes a submission', () =>
    deleteDoc(doc(boss.db, 'submissions/' + me.uid + '_' + T_PUB_ARCH))
  );

  /* ---- the hole that client-side scoring used to leave open ---- */
  /* This was the S23 security gap: the create rule validated shape and
     ownership but not the score, so a hostile client could post any marks
     it liked. The rules now refuse a submission that carries a score at
     all, and mark the paper themselves. The full attack set is in
     12-scoring-integrity.js. */
  await h.deny('S23', 'student submits a FIRST attempt carrying their own marks (100%)', () =>
    setDoc(
      doc(other.db, 'submissions/' + other.uid + '_' + T_DRAFT),
      subDoc(other.uid, { trainingId: T_DRAFT, marksObtained: 999, totalMarks: 999, percentage: 100, passStatus: true })
    )
  );
};
