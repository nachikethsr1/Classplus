/* t-certs.js — fix 2: certificates collection rules.
   Student issues their own certificate from their own PASSED submission;
   every forgery path must be rejected; admin manages the register. */
const {loadPage} = require('./loader');

const DB = {
  'students/s1':{uid:'s1',email:'s1@x.com',officialName:'ಅನನ್ಯಾ',kgid:'K1',status:'approved',role:'student'},
  'students/s2':{uid:'s2',email:'s2@x.com',officialName:'ರಾಹುಲ್',kgid:'K2',status:'approved',role:'student'},
  'submissions/sub1':{studentUid:'s1',trainingId:'t1',marksObtained:8,totalMarks:10,percentage:80,passStatus:true,submittedAt:'2026-11-20T10:00:00.000Z'},
  'submissions/sub2':{studentUid:'s1',trainingId:'t1',marksObtained:3,totalMarks:10,percentage:30,passStatus:false,submittedAt:'2026-11-21T10:00:00.000Z'},
};

let pass = 0, fail = 0;
function ok(name, cond, detail){
  if(cond){ pass++; console.log('PASS — ' + name + (detail ? '  [' + detail + ']' : '')); }
  else { fail++; console.log('FAIL — ' + name + (detail ? '  [' + detail + ']' : '')); }
}
async function denies(p){ try{ await p; return false; }catch(e){ return e && e.code === 'permission-denied'; } }

const good = (over) => Object.assign({
  number:'DTI-BNG-2026-0001', submissionId:'sub1', studentUid:'s1',
  studentName:'ಅನನ್ಯಾ', kgid:'K1', trainingId:'t1',
  marks:8, total:10, pct:80, issuedAt:'2026-11-22T10:00:00.000Z'
}, over || {});

(async () => {
  const h = loadPage({configured:true, adminEmails:['boss@x.com'], db: JSON.parse(JSON.stringify(DB))});
  await h.settle(50);
  h.signIn({uid:'s1', email:'s1@x.com'});
  await h.settle(300);

  console.log('\n=== STUDENT: may issue own certificate from own passed submission ===');
  const svc = h.w.FirebaseService;
  ok('student can write own certificate',
     !(await denies(svc.setDoc(svc.doc('certificates/cert_sub1'), good()))));

  console.log('\n=== STUDENT: forgery paths are rejected ===');
  ok('denied: no number',        await denies(svc.setDoc(svc.doc('certificates/f1'), good({number:''}))));
  ok('denied: number not string',await denies(svc.setDoc(svc.doc('certificates/f2'), good({number:12345}))));
  ok('denied: someone else\'s uid',
     await denies(svc.setDoc(svc.doc('certificates/f3'), good({studentUid:'s2'}))));
  ok('denied: unknown submission',
     await denies(svc.setDoc(svc.doc('certificates/f4'), good({submissionId:'nope'}))));
  ok('denied: failed submission (sub2)',
     await denies(svc.setDoc(svc.doc('certificates/f5'), good({submissionId:'sub2', marks:3, pct:30}))));
  ok('denied: inflated marks',
     await denies(svc.setDoc(svc.doc('certificates/f6'), good({marks:10, pct:100}))));
  ok('denied: inflated percentage',
     await denies(svc.setDoc(svc.doc('certificates/f7'), good({pct:99}))));
  ok('denied: edited total',
     await denies(svc.setDoc(svc.doc('certificates/f8'), good({total:100}))));

  console.log('\n=== STUDENT: cannot mutate an issued certificate ===');
  ok('denied: update issued certificate',
     await denies(svc.updateDoc(svc.doc('certificates/cert_sub1'), {number:'HACKED'})));
  ok('denied: delete certificate',
     await denies(svc.deleteDoc(svc.doc('certificates/cert_sub1'))));

  console.log('\n=== STUDENT: cannot read another student\'s certificate ===');
  const h2db = JSON.parse(JSON.stringify(DB));
  h2db['certificates/cert_sub1'] = good();                       // s1's own
  h2db['certificates/c2'] = good({number:'DTI-BNG-2026-0002', studentUid:'s2'});  // s2's
  const h2 = loadPage({configured:true, adminEmails:['boss@x.com'], db:h2db});
  await h2.settle(50);
  h2.signIn({uid:'s1', email:'s1@x.com'});
  await h2.settle(300);
  const s2 = h2.w.FirebaseService;
  ok('denied: read other student certificate',
     await denies(s2.getDoc(s2.doc('certificates/c2'))));
  ok('allowed: read own certificate',
     !(await denies(s2.getDoc(s2.doc('certificates/cert_sub1')))));

  console.log('\n=== ADMIN: manages the register ===');
  const h3 = loadPage({configured:true, adminEmails:['boss@x.com'], db: JSON.parse(JSON.stringify(DB))});
  await h3.settle(50);
  h3.signIn({uid:'a1', email:'boss@x.com'});
  await h3.settle(300);
  const s3 = h3.w.FirebaseService;
  ok('admin can issue any certificate',
     !(await denies(s3.setDoc(s3.doc('certificates/admin1'), good({studentUid:'s2'})))));
  ok('admin can read any certificate',
     !(await denies(s3.getDoc(s3.doc('certificates/cert_sub1')))));
  ok('admin can correct a certificate',
     !(await denies(s3.updateDoc(s3.doc('certificates/cert_sub1'), {number:'DTI-BNG-2026-0009'}))));
  ok('admin can delete a certificate',
     !(await denies(s3.deleteDoc(s3.doc('certificates/cert_sub1')))));

  console.log('\n  failures: ' + fail + '  passes: ' + pass);
  process.exit(fail ? 1 : 0);
})();
