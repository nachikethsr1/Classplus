/* ============================================================
   Fixture data.

   Every document here has the same shape the app writes in index.html
   (trainingToDoc, submitAssessmentToFirestore, saveCertificateToFirestore,
   submitRegistration, saveTrainingKeyDoc). If a shape drifts, the rules
   tests drift with it, which is the point.
   ============================================================ */

const { admin, adminSdk, USERS } = require('./env');

const T_PUB = 't_published';
const T_DRAFT = 't_draft';
/* what 'archive-training' in index.html actually writes:
   { archived: true, published: false } */
const T_ARCH = 't_archived';
/* the hand-edited combination the UI cannot produce: published AND
   archived. Kept as a fixture so the visibility tests cover it. */
const T_PUB_ARCH = 't_published_archived';

/* <uid>_<trainingId>, the only submission id the rules accept */
const SUB_MINE_PASS = USERS.approved.uid + '_' + T_PUB;
const SUB_MINE_FAIL = USERS.approved.uid + '_' + T_DRAFT;
const SUB_OTHER = USERS.other.uid + '_' + T_PUB;

function training(id, overrides) {
  return Object.assign(
    {
      title: 'ಕನ್ನಡ ತರಬೇತಿ ' + id,
      topic: 'Assembly procedures',
      date: '2026-01-15',
      description: '',
      category: 'general',
      accent: '#1D3557',
      institute: 'District Training Institute',
      passing: 70,
      published: true,
      archived: false,
      questions: [
        { id: 'q1', text: 'Q1', options: ['a', 'b', 'c', 'd'], marks: 1 },
        { id: 'q2', text: 'Q2', options: ['a', 'b', 'c', 'd'], marks: 1 },
        { id: 'q3', text: 'Q3 (worth 2)', options: ['a', 'b', 'c', 'd'], marks: 2 },
      ],
      /* NO answerKey here. trainings/{id} is readable by every approved
         student, so the key lives only in trainingKeys/{id}. The rules
         refuse a training document that carries one at all. */
      feedback: { day: '', sessions: [], questions: [] },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: 'fixture',
    },
    overrides || {}
  );
}

/* the correct answers for the fixture paper */
const KEY = { q1: 2, q2: 0, q3: 1 };
/* a realistic pass: everything but q2 */
const PASS_ANSWERS = { q1: 2, q2: 3, q3: 1 };
const WEIGHTS = { q1: 1, q2: 1, q3: 2 };
const TOTAL_MARKS = 4;

/* the same token format index.html and firestore.rules agree on */
function tokens(answers) {
  const out = [];
  Object.keys(WEIGHTS).forEach((qid) => {
    const chosen = answers[qid];
    if (chosen === undefined || chosen === null || chosen === '') return;
    for (let i = 1; i <= WEIGHTS[qid]; i++) out.push(qid + ':' + Number(chosen) + '#' + i);
  });
  return out;
}

function keyDoc(overrides) {
  return Object.assign(
    {
      key: KEY,
      tokens: tokens(KEY),
      totalMarks: TOTAL_MARKS,
      questionCount: 3,
      passing: 70,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedBy: 'fixture',
    },
    overrides || {}
  );
}

function submission(id, overrides) {
  return Object.assign(
    {
      studentUid: USERS.approved.uid,
      trainingId: T_PUB,
      officialNameSnapshot: 'ಅನನ್ಯಾ',
      kgidSnapshot: 'KG-1001',
      emailSnapshot: USERS.approved.email,
      designationSnapshot: 'Officer',
      trainingTitle: 'ಕನ್ನಡ ತರಬೇತಿ',
      trainingTopic: 'Assembly procedures',
      trainingDate: '2026-01-15',
      feedbackResponses: { ratings: {}, answers: {} },
      /* q1 right (1), q2 wrong, q3 right (2) -> 3 of 4 = 75%, a pass */
      assessmentAnswers: PASS_ANSWERS,
      answerTokens: tokens(PASS_ANSWERS),
      marksObtained: 3,
      totalMarks: 4,
      percentage: 75,
      passStatus: true,
      correctCount: 2,
      wrongCount: 1,
      passingPercent: 70,
      attemptNo: 1,
      certificateNo: null,
      submittedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    overrides || {}
  );
}

function certificate(overrides) {
  return Object.assign(
    {
      number: 'DTI-BNG-2026-0007',
      submissionId: SUB_MINE_PASS,
      studentUid: USERS.approved.uid,
      studentName: 'ಅನನ್ಯಾ',
      kgid: 'KG-1001',
      trainingId: T_PUB,
      trainingTitle: 'ಕನ್ನಡ ತರಬೇತಿ',
      trainingTopic: 'Assembly procedures',
      date: '2026-01-15',
      marks: 3,
      total: 4,
      pct: 75,
      issuedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    overrides || {}
  );
}

function profile(user, overrides) {
  return Object.assign(
    {
      uid: user.uid,
      email: user.email,
      officialName: 'ಅಧಿಕೃತ ಹೆಸರು',
      kgid: 'KG-' + user.uid,
      designation: 'Officer',
      department: 'Revenue',
      status: 'approved',
      role: 'student',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    overrides || {}
  );
}

/* Seed a clean world. Called before every suite. */
async function seed() {
  adminSdk();
  const db = admin.firestore();
  const batch = db.batch();

  batch.set(db.doc('students/' + USERS.approved.uid), profile(USERS.approved, { status: 'approved', kgid: 'KG-1001' }));
  batch.set(db.doc('students/' + USERS.pending.uid), profile(USERS.pending, { status: 'pending', kgid: 'KG-2002' }));
  batch.set(db.doc('students/' + USERS.other.uid), profile(USERS.other, { status: 'approved', kgid: 'KG-3003' }));

  batch.set(db.doc('trainings/' + T_PUB), training(T_PUB));
  batch.set(db.doc('trainings/' + T_DRAFT), training(T_DRAFT, { published: false, archived: false }));
  batch.set(db.doc('trainings/' + T_ARCH), training(T_ARCH, { published: false, archived: true }));
  batch.set(db.doc('trainings/' + T_PUB_ARCH), training(T_PUB_ARCH, { published: true, archived: true }));

  /* One token per MARK, exactly as keyTokensFor() in index.html builds it.
     q3 is worth 2 marks, so it contributes two tokens. Total 4 marks. */
  [T_PUB, T_DRAFT, T_ARCH, T_PUB_ARCH].forEach((tid) => {
    batch.set(db.doc('trainingKeys/' + tid), keyDoc());
  });

  /* Submission ids are <uid>_<trainingId> now: that is what makes a second
     attempt impossible and what the trainingKeys release rule looks up. */
  batch.set(db.doc('submissions/' + SUB_MINE_PASS), submission(SUB_MINE_PASS));
  batch.set(
    db.doc('submissions/' + SUB_MINE_FAIL),
    submission(SUB_MINE_FAIL, {
      trainingId: T_DRAFT,
      assessmentAnswers: { q1: 0, q2: 1, q3: 3 },
      answerTokens: tokens({ q1: 0, q2: 1, q3: 3 }),
      marksObtained: 0,
      totalMarks: 4,
      percentage: 0,
      passStatus: false,
      correctCount: 0,
      wrongCount: 3,
    })
  );
  batch.set(
    db.doc('submissions/' + SUB_OTHER),
    submission(SUB_OTHER, { studentUid: USERS.other.uid, kgidSnapshot: 'KG-3003' })
  );

  batch.set(db.doc('certificates/cert_sub_mine_pass'), certificate());
  batch.set(
    db.doc('certificates/cert_sub_other'),
    certificate({ submissionId: SUB_OTHER, studentUid: USERS.other.uid, number: 'DTI-BNG-2026-0008' })
  );

  batch.set(db.doc('settings/portal'), {
    defaultPassing: 70,
    certCounter: 7,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  batch.set(db.doc('certificateDesigns/current'), {
    useCustom: true,
    aspect: 1.414,
    backgroundUrl: 'https://example.test/bg.png',
    fields: [],
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedBy: 'fixture',
  });

  await batch.commit();
}

module.exports = {
  seed, training, submission, certificate, profile, keyDoc, tokens,
  T_PUB, T_DRAFT, T_ARCH, T_PUB_ARCH,
  SUB_MINE_PASS, SUB_MINE_FAIL, SUB_OTHER,
  KEY, PASS_ANSWERS, WEIGHTS, TOTAL_MARKS,
};
