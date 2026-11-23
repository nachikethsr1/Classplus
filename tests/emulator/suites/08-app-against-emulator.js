/* index.html's own loaders, writers and submit chain, running against the
   real emulator with the real firestore.rules.

   Nothing in this file states what a rule "should" return; it runs the
   app and reports what the rules actually did. */

const { doc, getDoc, collection, getDocs, query, where } = require('firebase/firestore');
const h = require('../harness');
const { session, USERS, admin, adminSdk } = require('../env');
const { T_PUB, T_DRAFT, T_ARCH } = require('../fixtures');
const { loadApp, makeRealService } = require('../app-loader');

function permissionWarnings(app) {
  return app.warnings.filter((w) => /permission-denied|insufficient permissions/i.test(w));
}

module.exports = async function run() {
  h.setGroup('app against emulator');

  /* ---------- approved student session ---------- */
  {
    const sess = await session('approved');
    const app = loadApp();
    const svc = makeRealService(sess);

    h.expect('A01', 'before the module reports in, the app shows no configuration error', app.gate === 'loading' || app.gate === 'signedout', 'gate=' + app.gate);

    app.publishService(svc);
    await app.settle(50);
    svc.__setUser({ uid: sess.uid, email: sess.email });
    await app.settle(1500);

    const p = app.probe;
    h.expect('A02', 'approved student reaches the portal (gate=ready)', p.gate === 'ready', 'gate=' + p.gate);
    h.expect(
      'A03',
      'no permission-denied while the student session loads its data',
      permissionWarnings(app).length === 0,
      permissionWarnings(app).join(' | ')
    );
    h.expect('A04', 'DataStore reports no load error', !p.dataStore.error, 'error=' + p.dataStore.error);

    const tids = (p.db.trainings || []).map((t) => t.id).sort();
    h.expect('A05', 'student portal lists the published training', tids.includes(T_PUB), 'trainings=' + JSON.stringify(tids));
    h.expect('A06', 'student portal hides the draft training', !tids.includes(T_DRAFT), 'trainings=' + JSON.stringify(tids));
    h.expect('A07', 'student portal hides the archived training', !tids.includes(T_ARCH), 'trainings=' + JSON.stringify(tids));

    const subs = (p.db.submissions || []).map((s) => s.userId);
    h.expect(
      'A08',
      "student portal loaded only this student's submissions",
      subs.length > 0 && subs.every((u) => u === sess.uid),
      'owners=' + JSON.stringify(subs)
    );

    const certs = p.db.certificates || [];
    h.expect(
      'A09',
      "student portal loaded only this student's certificates",
      certs.length > 0 && certs.every((c) => c.studentUid === sess.uid),
      'owners=' + JSON.stringify(certs.map((c) => c.studentUid))
    );

    h.expect('A10', 'student session never fetched answer keys', !p.answers.loaded, 'ANSWERS.loaded=' + p.answers.loaded);

    /* the real submit -> score -> number -> certificate chain */
    const training = (p.db.trainings || []).find((t) => t.id === T_PUB);
    if (!training) {
      h.skip('A11', 'real submit -> certificate chain', 'the published training never loaded');
    } else {
      try {
        const out = await p.issueCertificate(training, { q1: 2, q2: 0 }, { name: 'ಅನನ್ಯಾ', kgid: 'KG-1001', email: sess.email });
        h.expect('A11', 'app submitted the attempt and wrote the submission', !!out.id, JSON.stringify(out.result || {}));
        h.expect('A12', 'app issued a certificate number for a pass', !!out.certNo, 'certNo=' + out.certNo);

        adminSdk();
        const certSnap = await admin.firestore().doc('certificates/cert_' + out.id).get();
        h.expect('A13', 'certificate document exists in the register', certSnap.exists, 'id=cert_' + out.id);
        if (certSnap.exists) {
          const c = certSnap.data();
          const subSnap = await admin.firestore().doc('submissions/' + out.id).get();
          const s = subSnap.data() || {};
          h.expect(
            'A14',
            'certificate marks/total/pct copy the submission verbatim',
            c.marks === s.marksObtained && c.total === s.totalMarks && c.pct === s.percentage,
            `cert=${c.marks}/${c.total}/${c.pct} submission=${s.marksObtained}/${s.totalMarks}/${s.percentage}`
          );
          h.expect('A15', 'issued number is a non-empty string', typeof c.number === 'string' && c.number.length > 0, 'number=' + c.number);
        }

        /* another student must not be able to read it */
        const other = await session('other');
        await h.deny('A16', "another student reads the certificate the app just issued", () =>
          getDoc(doc(other.db, 'certificates/cert_' + out.id))
        );
        await h.deny('A17', 'another student reads the submission the app just wrote', () =>
          getDoc(doc(other.db, 'submissions/' + out.id))
        );
      } catch (e) {
        h.expect('A11', 'real submit -> certificate chain', false, 'threw: ' + h.errCode(e));
      }
    }
  }

  /* ---------- pending student session ---------- */
  {
    const sess = await session('pending');
    const app = loadApp();
    const svc = makeRealService(sess);
    app.publishService(svc);
    await app.settle(50);
    svc.__setUser({ uid: sess.uid, email: sess.email });
    await app.settle(1200);

    const p = app.probe;
    h.expect('A18', 'pending student is held at the pending gate', p.gate === 'pending', 'gate=' + p.gate);
    h.expect(
      'A19',
      'pending student session issues no denied reads (it never loads portal data)',
      permissionWarnings(app).length === 0,
      permissionWarnings(app).join(' | ')
    );
    h.expect('A20', 'pending student loaded no trainings', (p.db.trainings || []).length === 0, 'n=' + (p.db.trainings || []).length);
  }

  /* ---------- admin session ---------- */
  {
    const sess = await session('admin');
    const app = loadApp();
    const svc = makeRealService(sess);
    app.publishService(svc);
    await app.settle(50);
    svc.__setUser({ uid: sess.uid, email: sess.email });
    await app.settle(2500);

    const p = app.probe;
    h.expect('A21', 'admin reaches the portal', p.gate === 'ready', 'gate=' + p.gate);
    h.expect(
      'A22',
      'no permission-denied while the admin session loads everything',
      permissionWarnings(app).length === 0,
      permissionWarnings(app).join(' | ')
    );
    const tids = (p.db.trainings || []).map((t) => t.id).sort();
    h.expect('A23', 'admin sees drafts and archives too', tids.includes(T_DRAFT) && tids.includes(T_ARCH), 'trainings=' + JSON.stringify(tids));
    h.expect('A24', 'admin loaded the answer keys', p.answers.loaded === true, 'ANSWERS.loaded=' + p.answers.loaded);
    h.expect(
      'A25',
      'admin loaded every student account',
      (p.accounts.list || []).length >= 3,
      'n=' + (p.accounts.list || []).length
    );
    h.expect(
      'A26',
      'admin loaded all submissions, not just their own',
      (p.db.submissions || []).some((s) => s.userId === USERS.other.uid),
      'owners=' + JSON.stringify((p.db.submissions || []).map((s) => s.userId))
    );

    /* the seed must not duplicate into a populated register */
    try {
      const seeded = await p.seed();
      h.expect('A27', 'default-training seed refuses a populated register', seeded === false, 'returned ' + seeded);
    } catch (e) {
      h.expect('A27', 'default-training seed refuses a populated register', false, 'threw: ' + h.errCode(e));
    }

    /* admin writes a training through the app, and the key lands in the
       admin-only registry */
    try {
      const res = await p.saveTraining({
        isNew: true,
        title: 'ಹೊಸ ತರಬೇತಿ',
        topic: 'topic',
        date: '2026-03-01',
        passing: 70,
        published: true,
        archived: false,
        questions: [{ id: 'q1', text: 'Q', options: ['a', 'b'], correct: 1, marks: 1 }],
        feedback: { day: '', sessions: [], questions: [] },
      });
      h.expect('A28', 'admin saved a training through the app', !!res.id, 'id=' + res.id);
      adminSdk();
      const keySnap = await admin.firestore().doc('trainingKeys/' + res.id).get();
      h.expect('A29', 'the answer key was mirrored into trainingKeys/{id}', keySnap.exists, 'id=' + res.id);
    } catch (e) {
      h.expect('A28', 'admin saved a training through the app', false, 'threw: ' + h.errCode(e));
    }

    /* certificate numbering through the admin path */
    try {
      adminSdk();
      const before = Number(((await admin.firestore().doc('settings/portal').get()).data() || {}).certCounter || 0);
      const n1 = await p.nextCertNo();
      const n2 = await p.nextCertNo();
      const after = Number(((await admin.firestore().doc('settings/portal').get()).data() || {}).certCounter || 0);
      h.expect(
        'A30',
        'admin certificate numbers come from the settings counter and increase',
        /^DTI-BNG-\d{4}-\d{4}$/.test(n1) && !/-PROV-/.test(n1) && n1 !== n2,
        `n1=${n1} n2=${n2}`
      );
      /* the old assertion could not tell a counter serial from the
         provisional fallback, so a refused transaction still "passed" */
      h.expect(
        'A31',
        'issuing those numbers actually advanced settings/portal.certCounter',
        after === before + 2,
        `certCounter ${before} -> ${after}`
      );
      h.expect(
        'A32',
        'the numbers match the counter values they came from',
        n1.endsWith(String(before + 1).padStart(4, '0')) && n2.endsWith(String(before + 2).padStart(4, '0')),
        `n1=${n1} n2=${n2} counter ${before} -> ${after}`
      );
    } catch (e) {
      h.expect('A30', 'admin certificate numbering', false, 'threw: ' + h.errCode(e));
    }
  }
};
