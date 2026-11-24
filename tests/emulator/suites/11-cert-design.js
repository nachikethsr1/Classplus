/* Certificate design + background artwork, driven through the app's own
   persistCertDesign() against the real Firestore and Storage emulators.

   The interesting case is failure: a 5 MB upload becomes a ~6.7 MB data
   URL, Firestore rejects documents over 1 MiB, and the old code reported
   success anyway. A refused upload must leave the design unsaved and must
   never put a data: URL in Firestore. */

const { doc, getDoc } = require('firebase/firestore');
const { ref, getBytes } = require('firebase/storage');
const h = require('../harness');
const { session, admin, adminSdk } = require('../env');
const { loadApp, makeRealService } = require('../app-loader');

/* a real 1x1 PNG as a data URL */
const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==';

function bigDataUrl(mb) {
  /* base64 of mb megabytes of zeros — over the 5 MB rules ceiling */
  return 'data:image/png;base64,' + Buffer.alloc(mb * 1024 * 1024, 0).toString('base64');
}

async function appFor(key, opts) {
  const sess = await session(key);
  const app = loadApp();
  const svc = makeRealService(sess, opts);
  app.publishService(svc);
  await app.settle(50);
  svc.__setUser({ uid: sess.uid, email: sess.email });
  await app.settle(1200);
  return { app, sess, probe: app.probe };
}

function design(over) {
  return Object.assign(
    { useCustom: true, aspect: 1.414, fields: [{ id: 'f1', type: 'text', key: 'name', x: 10, y: 10, w: 30, fontSize: 3 }] },
    over || {}
  );
}

module.exports = async function run() {
  h.setGroup('certificate design');

  adminSdk();
  const db = admin.firestore();

  /* ---- a design with an already-uploaded URL ---- */
  {
    const a = await appFor('admin');
    const ok = await a.probe.persistDesign(design(), 'https://example.test/already-uploaded.png');
    h.expect('D01', 'admin saves a design that already has a Storage URL', ok === true, 'returned ' + ok);
    const snap = await db.doc('certificateDesigns/current').get();
    h.expect('D02', 'the saved design carries the URL', (snap.data() || {}).backgroundUrl === 'https://example.test/already-uploaded.png', JSON.stringify((snap.data() || {}).backgroundUrl));
  }

  /* ---- a real upload ---- */
  {
    const a = await appFor('admin');
    const ok = await a.probe.persistDesign(design(), PNG_DATA_URL);
    h.expect('D03', 'admin uploads a background and the design saves', ok === true, 'returned ' + ok);
    const d = (await db.doc('certificateDesigns/current').get()).data() || {};
    h.expect('D04', 'Firestore stores a Storage URL, never the base64 image', typeof d.backgroundUrl === 'string' && d.backgroundUrl.indexOf('data:') !== 0 && d.backgroundUrl.length > 0, 'backgroundUrl=' + String(d.backgroundUrl).slice(0, 60));

    const me = await session('approved');
    await h.allow('D05', 'student reads the certificate design document', () =>
      getDoc(doc(me.db, 'certificateDesigns/current'))
    );
    await h.allow('D06', 'student reads the uploaded background out of Storage', () =>
      getBytes(ref(me.storage, 'certificate-backgrounds/current.png'))
    );
  }

  /* ---- Storage switched off ---- */
  {
    await db.doc('certificateDesigns/current').set({ backgroundUrl: 'https://example.test/keep.png' }, { merge: true });
    const a = await appFor('admin', { storageReady: false });
    const ok = await a.probe.persistDesign(design(), PNG_DATA_URL);
    h.expect('D07', 'with Storage unavailable the save is REFUSED, not silently accepted', ok === false, 'returned ' + ok);
    const d = (await db.doc('certificateDesigns/current').get()).data() || {};
    h.expect('D08', 'nothing was written, so the previous URL survives', d.backgroundUrl === 'https://example.test/keep.png', 'backgroundUrl=' + String(d.backgroundUrl).slice(0, 60));
  }

  /* ---- upload refused by storage.rules (over the 5 MB ceiling) ---- */
  {
    await db.doc('certificateDesigns/current').set({ backgroundUrl: 'https://example.test/keep.png' }, { merge: true });
    const a = await appFor('admin');
    const ok = await a.probe.persistDesign(design(), bigDataUrl(6));
    h.expect('D09', 'an upload the rules refuse leaves the design unsaved', ok === false, 'returned ' + ok);
    const d = (await db.doc('certificateDesigns/current').get()).data() || {};
    h.expect(
      'D10',
      'a failed upload never leaves a data: URL in Firestore',
      String(d.backgroundUrl || '').indexOf('data:') !== 0,
      'backgroundUrl=' + String(d.backgroundUrl).slice(0, 60)
    );
  }

  /* ---- a student driving the same code path ---- */
  {
    await db.doc('certificateDesigns/current').set({ backgroundUrl: 'https://example.test/student-must-not-change.png' }, { merge: true });
    const s = await appFor('approved');
    await s.probe.persistDesign(design({ useCustom: false }), PNG_DATA_URL);
    const d = (await db.doc('certificateDesigns/current').get()).data() || {};
    h.expect(
      'D11',
      'a student cannot change the shared certificate design',
      d.backgroundUrl === 'https://example.test/student-must-not-change.png' && d.useCustom !== false,
      JSON.stringify({ backgroundUrl: d.backgroundUrl, useCustom: d.useCustom })
    );
  }
};
