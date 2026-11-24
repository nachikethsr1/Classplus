/* Certificate numbering, including the provisional range.

   This suite drives the app's own allocator (index.html:
   nextCertificateNumberRemote / nextLocalCertSeq) in real student and
   admin sessions against the emulator, and then asks the only question
   that matters: can two certificates end up carrying the same serial? */

const h = require('../harness');
const { SUB_MINE_PASS } = require('../fixtures');
const { session, admin, adminSdk } = require('../env');
const { loadApp, makeRealService } = require('../app-loader');


async function appFor(key) {
  const sess = await session(key);
  const app = loadApp();
  const svc = makeRealService(sess);
  app.publishService(svc);
  await app.settle(50);
  svc.__setUser({ uid: sess.uid, email: sess.email });
  await app.settle(1200);
  return { app, sess, probe: app.probe };
}

module.exports = async function run() {
  h.setGroup('certificate numbering');

  /* ---- what a student actually gets ---- */
  const a = await appFor('approved');
  const studentFirst = await a.probe.nextCertNo();
  const studentSecond = await a.probe.nextCertNo();
  h.expect('N01', 'student numbers keep one house format (DTI-BNG-<year>-…)', /^DTI-BNG-\d{4}-/.test(studentFirst), 'got ' + studentFirst);
  h.expect('N01b', 'a student number is visibly provisional', /-PROV-/.test(studentFirst), 'got ' + studentFirst);
  h.expect('N02', 'the student allocator does not repeat itself on one device', studentFirst !== studentSecond, `${studentFirst} ${studentSecond}`);

  /* ---- a student cannot touch the real counter ---- */
  adminSdk();
  const before = (await admin.firestore().doc('settings/portal').get()).data() || {};
  await a.probe.nextCertNo();
  const after = (await admin.firestore().doc('settings/portal').get()).data() || {};
  h.expect(
    'N03',
    'issuing a student number never moves settings/portal.certCounter',
    (before.certCounter || 0) === (after.certCounter || 0),
    `before=${before.certCounter} after=${after.certCounter}`
  );

  /* ---- two different students on two different devices ---- */
  const b = await appFor('other');
  const otherFirst = await b.probe.nextCertNo();
  h.expect(
    'N04',
    'two students issuing their FIRST certificate get DIFFERENT numbers',
    otherFirst !== studentFirst,
    `student A first=${studentFirst}   student B first=${otherFirst}`
  );

  /* ---- can a student number ever equal an admin serial? ----
     Push the counter to the edge of the provisional range and ask the
     admin allocator for the next serial. */
  await admin.firestore().doc('settings/portal').set({ certCounter: 9000 }, { merge: true });
  const c = await appFor('admin');
  const adminNo = await c.probe.nextCertNo();
  h.expect(
    'N05',
    'an admin serial can never collide with a student-issued number',
    adminNo !== studentFirst,
    `counter at 9000 -> admin serial ${adminNo}; a student's first number is ${studentFirst}`
  );
  h.expect(
    'N06',
    'a student-issued number is distinguishable from an admin serial by shape alone',
    !new RegExp('^' + studentFirst.replace(/\d{4}$/, '\\d{4}') + '$').test(adminNo),
    `admin serial ${adminNo} and student number ${studentFirst} share the same shape, so the register cannot tell them apart`
  );

  /* ---- is a provisional number marked as such on the document? ---- */
  const certs = await admin.firestore().collection('certificates').get();
  const issuedByStudent = certs.docs.map((d) => d.data()).filter((d) => /-(9\d{3})$/.test(String(d.number || '')) || d.provisional === true);
  h.expect(
    'N07',
    'a certificate carrying a provisional number says so on the document',
    issuedByStudent.length === 0 || issuedByStudent.every((d) => d.provisional === true),
    'certificates with a provisional-looking number and no provisional flag: ' +
      JSON.stringify(issuedByStudent.filter((d) => d.provisional !== true).map((d) => d.number))
  );

  /* The flag has to survive the app's real issuing path, not just the
     allocator. */
  const sess = await session('approved');
  const fresh = loadApp();
  const svc = makeRealService(sess);
  fresh.publishService(svc);
  await fresh.settle(50);
  svc.__setUser({ uid: sess.uid, email: sess.email });
  await fresh.settle(1200);
  const training = (fresh.probe.db.trainings || []).find((t) => t.id === 't_published');
  if (!training) {
    h.skip('N08', 'app-issued certificate is flagged provisional', 'no published training loaded');
  } else {
    await admin.firestore().doc('submissions/' + SUB_MINE_PASS).delete();
    const out = await fresh.probe.issueCertificate(training, { q1: 2, q2: 0, q3: 1 }, { name: 'ಅನನ್ಯಾ', kgid: 'KG-1001', email: sess.email });
    const c = (await admin.firestore().doc('certificates/cert_' + out.id).get()).data() || {};
    h.expect('N08', 'a certificate the student app issues is flagged provisional', c.provisional === true, 'number=' + c.number + ' provisional=' + c.provisional);
    h.expect('N09', 'that number cannot be confused with a register serial', /-PROV-/.test(String(c.number)), 'number=' + c.number);
  }

  /* restore */
  await admin.firestore().doc('settings/portal').set({ certCounter: 7 }, { merge: true });
};
