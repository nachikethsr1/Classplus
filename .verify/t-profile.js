/* t-profile.js — Phase 3, item 8: KGID is frozen after approval. */
const {loadPage} = require('./loader');

let pass = 0, fail = 0;
function ok(n, c, d){ c ? (pass++, console.log('PASS — ' + n + (d ? '  [' + d + ']' : '')))
                        : (fail++, console.log('FAIL — ' + n + (d ? '  [' + d + ']' : ''))); }
async function denies(p){ try{ await p; return false; }catch(e){ return e && e.code === 'permission-denied'; } }

const approved = {uid:'s1',email:'s1@x.com',officialName:'ಅನನ್ಯಾ',kgid:'K1',designation:'ಸಹಾಯಕ',
                  department:'ಇಲಾಖೆ',status:'approved',role:'student'};

(async () => {
  const h = loadPage({configured:true, adminEmails:['boss@x.com'], db:{'students/s1': JSON.parse(JSON.stringify(approved))}});
  await h.settle(50);
  h.signIn({uid:'s1', email:'s1@x.com'});
  await h.settle(300);
  const s = h.w.FirebaseService;

  console.log('=== APPROVED account ===');
  ok('denied: student changes own kgid',
     await denies(s.updateDoc(s.doc('students/s1'), {kgid:'K999'})));
  ok('denied: student changes own officialName',
     await denies(s.updateDoc(s.doc('students/s1'), {officialName:'Someone Else'})));
  ok('denied: student changes own status',
     await denies(s.updateDoc(s.doc('students/s1'), {status:'approved', role:'admin'})));
  ok('allowed: student edits an unprotected field (department)',
     !(await denies(s.updateDoc(s.doc('students/s1'), {department:'ಹೊಸ ಇಲಾಖೆ'}))));
  /* the admin runs in their own session */
  const ha = loadPage({configured:true, adminEmails:['boss@x.com'],
    db:{'students/s1': JSON.parse(JSON.stringify(approved))}});
  await ha.settle(50);
  ha.signIn({uid:'a1', email:'boss@x.com'});
  await ha.settle(300);
  const sa = ha.w.FirebaseService;
  ok('allowed: admin changes kgid',
     !(await denies(sa.updateDoc(sa.doc('students/s1'), {kgid:'K2'}))));
  ok('allowed: admin approves a pending account',
     !(await denies(sa.updateDoc(sa.doc('students/s1'), {status:'rejected'}))));

  console.log('\n=== PENDING account may still correct a typo ===');
  const h2 = loadPage({configured:true, adminEmails:['boss@x.com'],
    db:{'students/s2': Object.assign({}, approved, {uid:'s2', email:'s2@x.com', status:'pending'})}});
  await h2.settle(50);
  h2.signIn({uid:'s2', email:'s2@x.com'});
  await h2.settle(300);
  const s2 = h2.w.FirebaseService;
  ok('allowed: pending student corrects kgid',
     !(await denies(s2.updateDoc(s2.doc('students/s2'), {kgid:'K-CORRECTED'}))));
  ok('denied: pending student still cannot self-approve',
     await denies(s2.updateDoc(s2.doc('students/s2'), {status:'approved'})));

  console.log('\n  failures: ' + fail + '  passes: ' + pass);
  process.exit(fail ? 1 : 0);
})();
