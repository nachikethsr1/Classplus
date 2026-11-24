/* trainingKeys/{id} — the answer-key registry.

   Admin-only until a student hands their paper in; from that moment that
   one student may read that one key, because their answers are already
   frozen and the rules do the marking. Nothing mirrors a key onto the
   student-readable training document any more. */

const { doc, getDoc, setDoc, collection, getDocs } = require('firebase/firestore');
const h = require('../harness');
const { session } = require('../env');
const { T_PUB, T_ARCH } = require('../fixtures');

module.exports = async function run() {
  h.setGroup('answer keys');

  const me = await session('approved');
  const pending = await session('pending');
  const boss = await session('admin');

  /* The seeded student has already sat T_PUB, so that key is legitimately
     theirs. T_ARCH is a paper they have not sat. */
  await h.deny('K01', 'approved student reads the key for a paper they have NOT sat', () =>
    getDoc(doc(me.db, 'trainingKeys/' + T_ARCH))
  );
  await h.allow('K01b', 'approved student reads the key for the paper they HAVE sat', () =>
    getDoc(doc(me.db, 'trainingKeys/' + T_PUB))
  );
  await h.deny('K02', 'approved student scans the trainingKeys collection', () =>
    getDocs(collection(me.db, 'trainingKeys'))
  );
  await h.deny('K03', 'pending student reads trainingKeys/{id} (not approved, no submission)', () =>
    getDoc(doc(pending.db, 'trainingKeys/' + T_PUB))
  );
  await h.deny('K04', 'student writes an answer key', () =>
    setDoc(doc(me.db, 'trainingKeys/' + T_PUB), { key: { q1: 0, q2: 0 } })
  );
  await h.allow('K05', 'admin reads an answer key', () => getDoc(doc(boss.db, 'trainingKeys/' + T_PUB)));
  await h.allow('K06', 'admin scans the key registry (loadAnswerKeys)', () =>
    getDocs(collection(boss.db, 'trainingKeys'))
  );

  /* The mirror is gone: the key is not on the training document in any
     mode, and the rules refuse to put it back (see 12-scoring-integrity
     V04). This used to be the K07 security gap. */
  {
    const snap = await getDoc(doc(me.db, 'trainings/' + T_PUB));
    const data = snap.data() || {};
    h.expect(
      'K07',
      'no answerKey mirror on the student-readable training document',
      !('answerKey' in data),
      'fields on trainings/' + T_PUB + ': ' + Object.keys(data).join(',')
    );
  }
};
