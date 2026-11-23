/* t-guards.js — Phase 1 item 3 follow-through.
   Every whole-collection scan left in the app is admin-only, and the
   rules let a non-admin's scan fail. This proves the app never issues
   one as a student, so a student never trips a permission-denied scan. */
const {loadPage} = require('./loader');

let pass = 0, fail = 0;
function ok(n, c, d){ c ? (pass++, console.log('PASS — ' + n + (d ? '  [' + d + ']' : '')))
                        : (fail++, console.log('FAIL — ' + n + (d ? '  [' + d + ']' : ''))); }

const DB = {
  'students/s1':{uid:'s1',email:'s1@x.com',officialName:'A',kgid:'K1',status:'approved',role:'student'},
  'trainings/t1':{title:'T1',published:true,archived:false,questions:[],answerKey:{}},
  'trainings/t2':{title:'T2',published:false,archived:false,questions:[],answerKey:{}},
  'submissions/sub1':{studentUid:'s1',trainingId:'t1',marksObtained:1,totalMarks:1,percentage:100,passStatus:true},
};

(async () => {
  const h = loadPage({configured:true, adminEmails:['boss@x.com'], db: JSON.parse(JSON.stringify(DB))});
  await h.settle(50);
  h.signIn({uid:'s1', email:'s1@x.com'});
  await h.settle(400);

  const reads = h.fx.calls.reads;
  const lists = reads.filter(r => r.type === 'list');
  console.log('\n=== STUDENT session: list reads issued ===');
  lists.forEach(r => console.log('   list ' + r.col + '  ' + JSON.stringify(r.constraints)));

  ok('no unconstrained list read anywhere',
     lists.every(r => r.constraints.length > 0),
     lists.filter(r => r.constraints.length === 0).map(r => r.col).join(',') || 'none');
  ok('no read of the students collection as a student',
     !lists.some(r => r.col === 'students'));
  ok('trainings read carries published==true',
     lists.filter(r => r.col === 'trainings').every(r => r.constraints.some(c => c.field === 'published')));
  ok('submissions read carries studentUid==s1',
     lists.filter(r => r.col === 'submissions').every(r => r.constraints.some(c => c.field === 'studentUid' && c.value === 's1')));

  console.log('\n=== no permission-denied during the whole student session ===');
  ok('student session produced zero data errors',
     !h.w.__probe.dataStore.error, 'error=' + h.w.__probe.dataStore.error);
  ok('student data loaded',
     h.db.submissions.length === 1 && h.db.trainings.length === 1,
     'subs=' + h.db.submissions.length + ' trainings=' + h.db.trainings.length);

  console.log('\n=== DIRECT: a student cannot scan anything (runs at all) ===');
  const svc = h.w.FirebaseService;
  const cols = ['students','trainings','submissions','certificates','certificateDesigns','settings'];
  for(const col of cols){
    let denied = false;
    try{ await svc.getDocs(svc.collection(col)); }
    catch(e){ denied = e && e.code === 'permission-denied'; }
    if(col === 'certificateDesigns' || col === 'settings'){
      /* rules: allow read: if isSignedIn() — such scans are legitimate */
      ok('scan allowed by design: ' + col, !denied);
    }else{
      ok('scan denied: ' + col, denied);
    }
  }

  console.log('\n  failures: ' + fail + '  passes: ' + pass);
  process.exit(fail ? 1 : 0);
})();
