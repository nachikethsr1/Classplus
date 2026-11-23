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
      ],
      /* SCORING.mode === 'client' still mirrors the key here — see the
         answer-key suite, which proves a student can read it. */
      answerKey: { q1: 2, q2: 0 },
      feedback: { day: '', sessions: [], questions: [] },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
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
      assessmentAnswers: { q1: 2, q2: 0 },
      marksObtained: 8,
      totalMarks: 10,
      percentage: 80,
      passStatus: true,
      correctCount: 8,
      wrongCount: 2,
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
      submissionId: 'sub_mine_pass',
      studentUid: USERS.approved.uid,
      studentName: 'ಅನನ್ಯಾ',
      kgid: 'KG-1001',
      trainingId: T_PUB,
      trainingTitle: 'ಕನ್ನಡ ತರಬೇತಿ',
      trainingTopic: 'Assembly procedures',
      date: '2026-01-15',
      marks: 8,
      total: 10,
      pct: 80,
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

  batch.set(db.doc('trainingKeys/' + T_PUB), {
    key: { q1: 2, q2: 0 },
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedBy: 'fixture',
  });

  batch.set(db.doc('submissions/sub_mine_pass'), submission('sub_mine_pass'));
  batch.set(
    db.doc('submissions/sub_mine_fail'),
    submission('sub_mine_fail', { marksObtained: 3, totalMarks: 10, percentage: 30, passStatus: false })
  );
  batch.set(
    db.doc('submissions/sub_other'),
    submission('sub_other', { studentUid: USERS.other.uid, kgidSnapshot: 'KG-3003' })
  );

  batch.set(db.doc('certificates/cert_sub_mine_pass'), certificate());
  batch.set(
    db.doc('certificates/cert_sub_other'),
    certificate({ submissionId: 'sub_other', studentUid: USERS.other.uid, number: 'DTI-BNG-2026-0008' })
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

module.exports = { seed, training, submission, certificate, profile, T_PUB, T_DRAFT, T_ARCH, T_PUB_ARCH };
