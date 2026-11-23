/* submissions/{id} — who may create, who may read, and what is immutable. */

const {
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, getDocs, serverTimestamp,
} = require('firebase/firestore');
const h = require('../harness');
const { session, USERS } = require('../env');
const { T_PUB, T_DRAFT } = require('../fixtures');

/* The exact document submitAssessmentToFirestore() writes. */
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
      assessmentAnswers: { q1: 2, q2: 0 },
      marksObtained: 2,
      totalMarks: 2,
      percentage: 100,
      passStatus: true,
      correctCount: 2,
      wrongCount: 0,
      passingPercent: 70,
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
    getDoc(doc(anon.db, 'submissions/sub_mine_pass'))
  );
  await h.allow('S02', 'student reads their OWN submission', () =>
    getDoc(doc(me.db, 'submissions/sub_mine_pass'))
  );
  await h.deny("S03", "student reads ANOTHER student's submission (their answers)", () =>
    getDoc(doc(me.db, 'submissions/sub_other'))
  );
  await h.allow('S04', 'admin reads any submission', () => getDoc(doc(boss.db, 'submissions/sub_other')));

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
    h.expect('S09', 'own-submissions query returns only this student', !ids.includes('sub_other'), 'got ' + JSON.stringify(ids));
  } catch (e) {
    h.expect('S09', 'own-submissions query returns only this student', false, 'query refused: ' + h.errCode(e));
  }

  /* ---- creating ---- */
  await h.allow('S10', 'approved student submits their own attempt on a published training', () =>
    setDoc(doc(me.db, 'submissions/sub_new_ok'), subDoc(me.uid))
  );
  await h.deny('S11', 'PENDING student submits an attempt', () =>
    setDoc(doc(pending.db, 'submissions/sub_pending'), subDoc(pending.uid))
  );
  await h.deny("S12", "student submits an attempt under another student's uid", () =>
    setDoc(doc(me.db, 'submissions/sub_spoof'), subDoc(USERS.other.uid))
  );
  await h.deny('S13', 'student submits against an UNPUBLISHED training', () =>
    setDoc(doc(me.db, 'submissions/sub_draft'), subDoc(me.uid, { trainingId: T_DRAFT }))
  );
  await h.deny('S14', 'student submits against a training that does not exist', () =>
    setDoc(doc(me.db, 'submissions/sub_ghost'), subDoc(me.uid, { trainingId: 't_nope' }))
  );
  await h.deny('S15', 'student submits a document missing required fields', () =>
    setDoc(doc(me.db, 'submissions/sub_thin'), { studentUid: me.uid, trainingId: T_PUB })
  );
  await h.deny('S16', 'signed-out visitor submits', () =>
    setDoc(doc(anon.db, 'submissions/sub_anon'), subDoc('stu_approved'))
  );

  /* ---- immutability ---- */
  await h.deny('S17', 'student rewrites the marks on their own submission', () =>
    updateDoc(doc(me.db, 'submissions/sub_mine_pass'), { marksObtained: 10, percentage: 100 })
  );
  await h.deny('S18', 'student flips passStatus on their own submission', () =>
    updateDoc(doc(me.db, 'submissions/sub_mine_fail'), { passStatus: true })
  );
  await h.deny('S19', 'student overwrites their submission with setDoc', () =>
    setDoc(doc(me.db, 'submissions/sub_mine_fail'), subDoc(me.uid))
  );
  await h.deny('S20', 'ADMIN rewrites a submission (audit record is immutable for everyone)', () =>
    updateDoc(doc(boss.db, 'submissions/sub_mine_pass'), { marksObtained: 9 })
  );
  await h.deny('S21', 'student deletes their own submission', () =>
    deleteDoc(doc(me.db, 'submissions/sub_mine_pass'))
  );
  await h.allow('S22', 'admin deletes a submission', () => deleteDoc(doc(boss.db, 'submissions/sub_new_ok')));

  /* ---- the hole that client-side scoring leaves open ---- */
  await h.gap(
    'S23',
    'student submits a FIRST attempt carrying their own marks (100%)',
    'The create rule validates shape and ownership but not the score, because computeResult() runs in the browser. A hostile client can post any marksObtained/passStatus it likes. Only server-side scoring (Cloud Function + "allow create: if false") closes this.',
    () =>
      setDoc(
        doc(other.db, 'submissions/sub_inflated'),
        subDoc(other.uid, { marksObtained: 999, totalMarks: 999, percentage: 100, passStatus: true })
      )
  );
};
