/* trainings/{id} — published / unpublished / archived visibility, and the
   constrained list queries the app actually issues. */

const { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, getDocs, serverTimestamp } = require('firebase/firestore');
const h = require('../harness');
const { session } = require('../env');
const { T_PUB, T_DRAFT, T_ARCH, T_PUB_ARCH } = require('../fixtures');

module.exports = async function run() {
  h.setGroup('trainings/{id}');

  const anon = await session('anon');
  const me = await session('approved');
  const pending = await session('pending');
  const boss = await session('admin');

  /* ---- single document reads ---- */
  await h.deny('T01', 'signed-out visitor reads a published training', () =>
    getDoc(doc(anon.db, 'trainings/' + T_PUB))
  );
  await h.allow('T02', 'approved student reads a PUBLISHED training', () =>
    getDoc(doc(me.db, 'trainings/' + T_PUB))
  );
  await h.deny('T03', 'approved student reads an UNPUBLISHED (draft) training', () =>
    getDoc(doc(me.db, 'trainings/' + T_DRAFT))
  );
  await h.deny('T04', 'approved student reads an ARCHIVED training (archive-training also unpublishes)', () =>
    getDoc(doc(me.db, 'trainings/' + T_ARCH))
  );
  await h.allow(
    'T04b',
    'approved student reads a hand-edited published+archived training (rule allows, loader filters it out)',
    () => getDoc(doc(me.db, 'trainings/' + T_PUB_ARCH))
  );
  await h.deny('T05', 'PENDING student reads a published training', () =>
    getDoc(doc(pending.db, 'trainings/' + T_PUB))
  );
  await h.allow('T06', 'admin reads a draft training', () =>
    getDoc(doc(boss.db, 'trainings/' + T_DRAFT))
  );

  /* ---- list queries: this is where rules-as-pre-filter bites ---- */
  await h.deny('T07', 'approved student scans the whole trainings collection', () =>
    getDocs(collection(me.db, 'trainings'))
  );

  /* The exact query loadTrainingsForStudent() issues in index.html. */
  await h.allow("T08", "approved student runs the app's real query: where('published','==',true)", () =>
    getDocs(query(collection(me.db, 'trainings'), where('published', '==', true)))
  );

  /* A second equality constraint is also provable, if the loader ever
     wants to push the archived filter into the query. Every training
     document must then actually carry the field. */
  await h.allow('T09', "query where published==true AND archived==false", () =>
    getDocs(query(collection(me.db, 'trainings'), where('published', '==', true), where('archived', '==', false)))
  );

  await h.deny('T10', 'PENDING student runs the published query', () =>
    getDocs(query(collection(pending.db, 'trainings'), where('published', '==', true)))
  );
  await h.deny('T11', 'student queries unpublished trainings', () =>
    getDocs(query(collection(me.db, 'trainings'), where('published', '==', false)))
  );
  await h.allow('T12', 'admin scans the whole trainings collection (unconstrained)', () =>
    getDocs(collection(boss.db, 'trainings'))
  );

  /* What does the student's query actually return? Visibility, not just
     permission. Only run when the query is permitted. */
  try {
    const snap = await getDocs(query(collection(me.db, 'trainings'), where('published', '==', true)));
    const ids = snap.docs.map((d) => d.id).sort();
    h.expect('T13', 'published query returns the published training', ids.includes(T_PUB), 'got ' + JSON.stringify(ids));
    h.expect('T14', 'published query never returns the draft', !ids.includes(T_DRAFT), 'got ' + JSON.stringify(ids));
    h.expect(
      'T15',
      'published query never returns an archived (therefore unpublished) training',
      !ids.includes(T_ARCH),
      'ids=' + JSON.stringify(ids)
    );
  } catch (e) {
    h.expect('T13', 'published query returns the published training', false, 'query refused: ' + h.errCode(e));
    h.expect('T14', 'published query never returns the draft', false, 'query refused: ' + h.errCode(e));
    h.expect('T15', 'archived visibility check', false, 'query refused: ' + h.errCode(e));
  }

  /* ---- writes ---- */
  await h.deny('T16', 'student creates a training', () =>
    setDoc(doc(me.db, 'trainings/t_forged'), { title: 'forged', published: true, archived: false })
  );
  await h.deny('T17', 'student edits a training', () =>
    updateDoc(doc(me.db, 'trainings/' + T_PUB), { title: 'hacked' })
  );
  await h.deny("T18", "student rewrites a training's answer key", () =>
    updateDoc(doc(me.db, 'trainings/' + T_PUB), { answerKey: { q1: 0, q2: 0 } })
  );
  await h.deny('T19', 'student publishes a draft training', () =>
    updateDoc(doc(me.db, 'trainings/' + T_DRAFT), { published: true })
  );
  await h.deny('T20', 'student deletes a training', () => deleteDoc(doc(me.db, 'trainings/' + T_PUB)));
  await h.allow('T21', 'admin creates a training', () =>
    setDoc(doc(boss.db, 'trainings/t_admin_new'), {
      title: 'new',
      published: false,
      archived: false,
      questions: [],
      createdAt: serverTimestamp(),
    })
  );
  await h.allow('T22', 'admin publishes / unpublishes / archives', async () => {
    await updateDoc(doc(boss.db, 'trainings/t_admin_new'), { published: true });
    await updateDoc(doc(boss.db, 'trainings/t_admin_new'), { published: false });
    await updateDoc(doc(boss.db, 'trainings/t_admin_new'), { archived: true });
  });
  await h.allow('T23', 'admin deletes a training', () => deleteDoc(doc(boss.db, 'trainings/t_admin_new')));
};
