/* students/{uid} — registration, approval, KGID freeze, isolation. */

const { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, serverTimestamp } = require('firebase/firestore');
const h = require('../harness');
const { session, USERS } = require('../env');

module.exports = async function run() {
  h.setGroup('students/{uid}');

  const anon = await session('anon');
  const me = await session('approved');
  const pending = await session('pending');
  const other = await session('other');
  const boss = await session('admin');
  const fresh = await session('fresh');

  /* ---- reading ---- */
  await h.deny('P01', 'signed-out visitor reads a student profile', () =>
    getDoc(doc(anon.db, 'students/' + USERS.approved.uid))
  );
  await h.allow('P02', 'approved student reads OWN profile', () =>
    getDoc(doc(me.db, 'students/' + USERS.approved.uid))
  );
  await h.deny("P03", "student reads ANOTHER student's profile", () =>
    getDoc(doc(me.db, 'students/' + USERS.other.uid))
  );
  await h.deny('P04', 'pending student reads another profile', () =>
    getDoc(doc(pending.db, 'students/' + USERS.approved.uid))
  );
  await h.allow('P05', 'pending student reads OWN profile', () =>
    getDoc(doc(pending.db, 'students/' + USERS.pending.uid))
  );
  await h.allow('P06', 'admin reads any profile', () =>
    getDoc(doc(boss.db, 'students/' + USERS.other.uid))
  );

  /* ---- listing ---- */
  await h.deny('P07', 'student lists the students collection', () =>
    getDocs(collection(me.db, 'students'))
  );
  await h.allow('P08', 'admin lists the students collection (unconstrained scan)', () =>
    getDocs(collection(boss.db, 'students'))
  );

  /* ---- registration (the real submitRegistration payload) ---- */
  const regDoc = (over) =>
    Object.assign(
      {
        uid: USERS.fresh.uid,
        email: USERS.fresh.email,
        officialName: 'ಹೊಸ ಅಧಿಕಾರಿ',
        kgid: 'KG-9009',
        designation: 'Officer',
        department: 'Revenue',
        status: 'pending',
        role: 'student',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      over || {}
    );

  await h.deny('P09', 'new user registers themselves as approved', () =>
    setDoc(doc(fresh.db, 'students/' + USERS.fresh.uid), regDoc({ status: 'approved' }))
  );
  await h.deny('P10', 'new user registers with role admin', () =>
    setDoc(doc(fresh.db, 'students/' + USERS.fresh.uid), regDoc({ role: 'admin' }))
  );
  await h.deny("P11", "new user writes a profile at another user's uid", () =>
    setDoc(doc(fresh.db, 'students/' + USERS.other.uid), regDoc({ uid: USERS.other.uid }))
  );
  await h.deny('P12', 'new user registers with a spoofed email', () =>
    setDoc(doc(fresh.db, 'students/' + USERS.fresh.uid), regDoc({ email: 'someone.else@example.com' }))
  );
  await h.allow('P13', 'new user registers as pending (the real registration form)', () =>
    setDoc(doc(fresh.db, 'students/' + USERS.fresh.uid), regDoc())
  );

  /* ---- self-service edits ---- */
  await h.allow('P14', 'PENDING student fixes their KGID before approval', () =>
    updateDoc(doc(pending.db, 'students/' + USERS.pending.uid), { kgid: 'KG-2002-fixed', updatedAt: serverTimestamp() })
  );
  await h.allow('P15', 'PENDING student fixes their official name before approval', () =>
    updateDoc(doc(pending.db, 'students/' + USERS.pending.uid), { officialName: 'ಸರಿಪಡಿಸಿದ ಹೆಸರು' })
  );
  await h.deny('P16', 'APPROVED student changes their KGID', () =>
    updateDoc(doc(me.db, 'students/' + USERS.approved.uid), { kgid: 'KG-FORGED' })
  );
  await h.deny('P17', 'APPROVED student changes their official name', () =>
    updateDoc(doc(me.db, 'students/' + USERS.approved.uid), { officialName: 'ಬೇರೆ ಹೆಸರು' })
  );
  await h.allow('P18', 'APPROVED student updates designation/department (allowed)', () =>
    updateDoc(doc(me.db, 'students/' + USERS.approved.uid), { designation: 'Senior Officer', department: 'Finance' })
  );
  await h.deny('P19', 'student approves themselves (status)', () =>
    updateDoc(doc(pending.db, 'students/' + USERS.pending.uid), { status: 'approved' })
  );
  await h.deny('P20', 'student escalates their own role', () =>
    updateDoc(doc(me.db, 'students/' + USERS.approved.uid), { role: 'admin' })
  );
  await h.deny('P21', 'student back-dates verifiedBy/verifiedAt', () =>
    updateDoc(doc(me.db, 'students/' + USERS.approved.uid), { verifiedBy: 'me', verifiedAt: serverTimestamp() })
  );
  await h.deny("P22", "student edits ANOTHER student's profile", () =>
    updateDoc(doc(me.db, 'students/' + USERS.other.uid), { designation: 'Peon' })
  );
  await h.deny('P23', 'student deletes their own profile', () =>
    deleteDoc(doc(me.db, 'students/' + USERS.approved.uid))
  );

  /* ---- admin actions (the real setStudentStatus payload) ---- */
  await h.allow('P24', 'admin approves a pending student', () =>
    updateDoc(doc(boss.db, 'students/' + USERS.pending.uid), {
      status: 'approved',
      updatedAt: serverTimestamp(),
      verifiedAt: serverTimestamp(),
      verifiedBy: boss.email,
    })
  );
  await h.allow('P25', 'admin corrects the KGID of an approved student', () =>
    updateDoc(doc(boss.db, 'students/' + USERS.approved.uid), { kgid: 'KG-1001-corrected' })
  );
  await h.allow('P26', 'admin disables an account', () =>
    updateDoc(doc(boss.db, 'students/' + USERS.other.uid), { status: 'disabled' })
  );
  await h.allow('P27', 'admin deletes a profile', () =>
    deleteDoc(doc(boss.db, 'students/' + USERS.fresh.uid))
  );
};
