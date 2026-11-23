/* settings/portal, certificateDesigns/current, counters/* and the
   catch-all deny. */

const { doc, getDoc, setDoc, updateDoc, collection, getDocs, runTransaction, serverTimestamp } = require('firebase/firestore');
const h = require('../harness');
const { session } = require('../env');

module.exports = async function run() {
  h.setGroup('settings / designs / counters');

  const anon = await session('anon');
  const me = await session('approved');
  const boss = await session('admin');

  /* ---- settings/portal ---- */
  await h.deny('G01', 'signed-out visitor reads settings/portal', () => getDoc(doc(anon.db, 'settings/portal')));
  await h.allow('G02', 'signed-in student reads settings/portal (needed to render)', () =>
    getDoc(doc(me.db, 'settings/portal'))
  );
  await h.deny('G03', 'student writes settings/portal', () =>
    updateDoc(doc(me.db, 'settings/portal'), { defaultPassing: 1 })
  );
  await h.deny('G04', 'student bumps the certificate counter (nextCertificateNumberRemote)', () =>
    runTransaction(me.db, async (tx) => {
      const ref = doc(me.db, 'settings/portal');
      const snap = await tx.get(ref);
      const n = (snap.exists() ? Number(snap.data().certCounter) || 0 : 0) + 1;
      tx.set(ref, { certCounter: n }, { merge: true });
    })
  );
  await h.allow('G05', 'admin bumps the certificate counter', () =>
    runTransaction(boss.db, async (tx) => {
      const ref = doc(boss.db, 'settings/portal');
      const snap = await tx.get(ref);
      const n = (snap.exists() ? Number(snap.data().certCounter) || 0 : 0) + 1;
      tx.set(ref, { certCounter: n, updatedAt: serverTimestamp() }, { merge: true });
    })
  );

  /* ---- certificateDesigns/current ---- */
  await h.allow('G06', 'student reads the certificate design (needed to render)', () =>
    getDoc(doc(me.db, 'certificateDesigns/current'))
  );
  await h.deny('G07', 'student edits the certificate design', () =>
    setDoc(doc(me.db, 'certificateDesigns/current'), { useCustom: false, fields: [] }, { merge: true })
  );
  await h.allow('G08', 'admin saves the certificate design (saveCertDesignRemote)', () =>
    setDoc(
      doc(boss.db, 'certificateDesigns/current'),
      { useCustom: true, aspect: 1.414, backgroundUrl: 'https://example.test/bg.png', fields: [], updatedAt: serverTimestamp(), updatedBy: boss.email },
      { merge: true }
    )
  );
  await h.deny('G09', 'signed-out visitor reads the certificate design', () =>
    getDoc(doc(anon.db, 'certificateDesigns/current'))
  );

  /* ---- counters/* ---- */
  await h.allow('G10', 'signed-in student reads counters/*', () => getDoc(doc(me.db, 'counters/certificates')));
  await h.deny('G11', 'student writes counters/*', () =>
    setDoc(doc(me.db, 'counters/certificates'), { n: 1 })
  );
  await h.allow('G12', 'admin writes counters/*', () =>
    setDoc(doc(boss.db, 'counters/certificates'), { n: 1 })
  );

  /* ---- catch-all ---- */
  await h.deny('G13', 'student writes an undeclared collection', () =>
    setDoc(doc(me.db, 'anythingElse/doc1'), { x: 1 })
  );
  await h.deny('G14', 'ADMIN writes an undeclared collection (catch-all denies everyone)', () =>
    setDoc(doc(boss.db, 'anythingElse/doc2'), { x: 1 })
  );
  await h.deny('G15', 'student reads an undeclared collection', () => getDocs(collection(me.db, 'anythingElse')));
};
