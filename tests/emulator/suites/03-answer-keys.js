/* trainingKeys/{id} — the admin-only answer-key registry, and the mirror
   that client-side scoring still leaves on the training document. */

const { doc, getDoc, setDoc, collection, getDocs } = require('firebase/firestore');
const h = require('../harness');
const { session } = require('../env');
const { T_PUB } = require('../fixtures');

module.exports = async function run() {
  h.setGroup('answer keys');

  const me = await session('approved');
  const pending = await session('pending');
  const boss = await session('admin');

  await h.deny('K01', 'approved student reads trainingKeys/{id}', () =>
    getDoc(doc(me.db, 'trainingKeys/' + T_PUB))
  );
  await h.deny('K02', 'approved student scans the trainingKeys collection', () =>
    getDocs(collection(me.db, 'trainingKeys'))
  );
  await h.deny('K03', 'pending student reads trainingKeys/{id}', () =>
    getDoc(doc(pending.db, 'trainingKeys/' + T_PUB))
  );
  await h.deny('K04', 'student writes an answer key', () =>
    setDoc(doc(me.db, 'trainingKeys/' + T_PUB), { key: { q1: 0, q2: 0 } })
  );
  await h.allow('K05', 'admin reads an answer key', () => getDoc(doc(boss.db, 'trainingKeys/' + T_PUB)));
  await h.allow('K06', 'admin scans the key registry (loadAnswerKeys)', () =>
    getDocs(collection(boss.db, 'trainingKeys'))
  );

  /* The honest part. While SCORING.mode === 'client' the browser has to
     mark the paper, so the key is mirrored onto trainings/{id}, which every
     approved student may read. This is NOT a pass. */
  await h.gap(
    'K07',
    'approved student reads the answerKey MIRROR on trainings/{id}',
    'SCORING.mode === "client": the key is still inside the student-readable training document, so the exam is open-book. Closing this needs server-side scoring (Cloud Function) — see PHASE2_PHASE3_REPORT.md item 5.',
    async () => {
      const snap = await getDoc(doc(me.db, 'trainings/' + T_PUB));
      const data = snap.data() || {};
      if (!data.answerKey || !Object.keys(data.answerKey).length) {
        throw Object.assign(new Error('no key on the training document'), { code: 'permission-denied' });
      }
    }
  );
};
