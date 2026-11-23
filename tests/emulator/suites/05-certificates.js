/* certificates/{id} — the issued register: forgery paths, isolation,
   immutability, and the queries the app issues. */

const {
  doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, getDocs, serverTimestamp,
} = require('firebase/firestore');
const h = require('../harness');
const { session, USERS } = require('../env');
const { T_PUB } = require('../fixtures');

/* The exact document saveCertificateToFirestore() writes. */
function certDoc(over) {
  return Object.assign(
    {
      number: 'DTI-BNG-2026-9001',
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
      issuedAt: serverTimestamp(),
    },
    over || {}
  );
}

module.exports = async function run() {
  h.setGroup('certificates/{id}');

  const anon = await session('anon');
  const me = await session('approved');
  const other = await session('other');
  const boss = await session('admin');

  /* ---- reading ---- */
  await h.deny('C01', 'signed-out visitor reads a certificate', () =>
    getDoc(doc(anon.db, 'certificates/cert_sub_mine_pass'))
  );
  await h.allow('C02', 'student reads their OWN certificate', () =>
    getDoc(doc(me.db, 'certificates/cert_sub_mine_pass'))
  );
  await h.deny("C03", "student reads ANOTHER student's certificate", () =>
    getDoc(doc(me.db, 'certificates/cert_sub_other'))
  );
  await h.allow('C04', 'admin reads any certificate', () => getDoc(doc(boss.db, 'certificates/cert_sub_other')));

  /* ---- list queries ---- */
  await h.deny('C05', 'student scans the certificate register', () =>
    getDocs(collection(me.db, 'certificates'))
  );
  await h.allow("C06", "student runs the app's real query: where('studentUid','==',own uid)", () =>
    getDocs(query(collection(me.db, 'certificates'), where('studentUid', '==', me.uid)))
  );
  await h.deny("C07", "student queries another student's certificates", () =>
    getDocs(query(collection(me.db, 'certificates'), where('studentUid', '==', USERS.other.uid)))
  );
  await h.allow('C08', 'admin scans the whole register', () => getDocs(collection(boss.db, 'certificates')));

  /* ---- issuing: the happy path the app drives ---- */
  await h.allow('C09', 'student issues a certificate from their own PASSED submission', () =>
    setDoc(doc(me.db, 'certificates/cert_ok'), certDoc())
  );

  /* ---- forgery paths ---- */
  await h.deny('C10', 'certificate with inflated marks', () =>
    setDoc(doc(me.db, 'certificates/cert_f1'), certDoc({ marks: 10 }))
  );
  await h.deny('C11', 'certificate with an altered total', () =>
    setDoc(doc(me.db, 'certificates/cert_f2'), certDoc({ total: 8 }))
  );
  await h.deny('C12', 'certificate with an inflated percentage', () =>
    setDoc(doc(me.db, 'certificates/cert_f3'), certDoc({ pct: 100 }))
  );
  await h.deny('C13', 'certificate for a FAILED submission', () =>
    setDoc(
      doc(me.db, 'certificates/cert_f4'),
      certDoc({ submissionId: 'sub_mine_fail', marks: 3, total: 10, pct: 30 })
    )
  );
  await h.deny('C14', 'certificate pointing at a submission that does not exist', () =>
    setDoc(doc(me.db, 'certificates/cert_f5'), certDoc({ submissionId: 'sub_ghost' }))
  );
  await h.deny("C15", "certificate built on ANOTHER student's submission", () =>
    setDoc(doc(me.db, 'certificates/cert_f6'), certDoc({ submissionId: 'sub_other' }))
  );
  await h.deny('C16', 'certificate issued in another student\'s name', () =>
    setDoc(doc(me.db, 'certificates/cert_f7'), certDoc({ studentUid: USERS.other.uid }))
  );
  await h.deny('C17', 'certificate with an empty number', () =>
    setDoc(doc(me.db, 'certificates/cert_f8'), certDoc({ number: '' }))
  );
  await h.deny('C18', 'certificate with a non-string number', () =>
    setDoc(doc(me.db, 'certificates/cert_f9'), certDoc({ number: 9001 }))
  );
  await h.deny('C19', 'signed-out visitor issues a certificate', () =>
    setDoc(doc(anon.db, 'certificates/cert_f10'), certDoc())
  );

  /* ---- immutability ---- */
  await h.deny('C20', 'student rewrites an issued certificate', () =>
    updateDoc(doc(me.db, 'certificates/cert_sub_mine_pass'), { marks: 10 })
  );
  await h.deny('C21', 'student overwrites their certificate with setDoc', () =>
    setDoc(doc(me.db, 'certificates/cert_sub_mine_pass'), certDoc({ marks: 10 }))
  );
  await h.deny('C22', 'ADMIN edits an issued certificate (immutable for everyone)', () =>
    updateDoc(doc(boss.db, 'certificates/cert_sub_mine_pass'), { marks: 9 })
  );
  await h.deny('C23', 'student deletes a certificate', () =>
    deleteDoc(doc(me.db, 'certificates/cert_sub_mine_pass'))
  );
  await h.allow('C24', 'admin deletes a certificate', () => deleteDoc(doc(boss.db, 'certificates/cert_ok')));

  /* ---- numbering: can a student mint a number that collides? ---- */
  await h.allow('C25', 'admin issues a certificate for a student (admin path)', () =>
    setDoc(doc(boss.db, 'certificates/cert_admin_issued'), certDoc({ number: 'DTI-BNG-2026-0008' }))
  );
  await h.deny('C27', 'admin issues a certificate with marks the submission does not support', () =>
    setDoc(doc(boss.db, 'certificates/cert_admin_bad'), certDoc({ number: 'DTI-BNG-2026-0009', marks: 10 }))
  );
  await h.deny('C28', 'admin issues a certificate for a FAILED submission', () =>
    setDoc(
      doc(boss.db, 'certificates/cert_admin_fail'),
      certDoc({ number: 'DTI-BNG-2026-0010', submissionId: 'sub_mine_fail', marks: 3, total: 10, pct: 30 })
    )
  );
  await h.deny('C29', 'admin issues a certificate naming a student who did not sit that submission', () =>
    setDoc(
      doc(boss.db, 'certificates/cert_admin_wrong_owner'),
      certDoc({ number: 'DTI-BNG-2026-0011', studentUid: USERS.other.uid })
    )
  );
  await h.gap(
    'C26',
    'student issues a certificate whose number duplicates an existing one',
    'Nothing in firestore.rules makes `number` unique. Two certificates can carry the same serial; the rules only bind marks to the submission. Uniqueness has to come from the counter (admin) or from a server-side allocator.',
    () =>
      setDoc(doc(other.db, 'certificates/cert_dup'), {
        number: 'DTI-BNG-2026-0008',
        submissionId: 'sub_other',
        studentUid: USERS.other.uid,
        studentName: 'other',
        kgid: 'KG-3003',
        trainingId: T_PUB,
        trainingTitle: 'x',
        trainingTopic: 'x',
        date: '2026-01-15',
        marks: 8,
        total: 10,
        pct: 80,
        issuedAt: serverTimestamp(),
      })
  );
};
