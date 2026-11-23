/* t-keys.js — Phase 2, item 4: answer keys must not be readable by students.

   In client scoring mode the key still has to be readable, so this suite
   pins the exact boundary: what a student can read, what the admin can
   read, and which mode the app is in. When the scoring function lands and
   SCORING.mode flips to 'server', the "student cannot read the key"
   assertions below are the acceptance test for the switch. */
const {loadPage} = require('./loader');

let pass = 0, fail = 0;
function ok(n, c, d){ c ? (pass++, console.log('PASS — ' + n + (d ? '  [' + d + ']' : '')))
                        : (fail++, console.log('FAIL — ' + n + (d ? '  [' + d + ']' : ''))); }
async function denies(p){ try{ await p; return false; }catch(e){ return e && e.code === 'permission-denied'; } }

const DB = {
  'students/s1':{uid:'s1',email:'s1@x.com',officialName:'A',kgid:'K1',status:'approved',role:'student'},
  'trainings/t1':{title:'T',published:true,archived:false,passing:70,
    questions:[{id:'q1',text:'x',options:['a','b']}], answerKey:{q1:0}},
  'trainingKeys/t1':{key:{q1:0}},
};

(async () => {
  console.log('=== mode ===');
  const h = loadPage({configured:true, adminEmails:['boss@x.com'], db: JSON.parse(JSON.stringify(DB))});
  await h.settle(50);
  ok('app reports its scoring mode', typeof h.w.__probe.scoringMode === 'function', h.w.__probe.scoringMode());
  ok('mode is client-side (no Cloud Function deployed yet)',
     h.w.__probe.scoringMode() === 'client', 'mode=' + h.w.__probe.scoringMode());

  console.log('\n=== STUDENT: cannot read the key registry ===');
  h.signIn({uid:'s1', email:'s1@x.com'});
  await h.settle(300);
  const s = h.w.FirebaseService;
  ok('denied: read trainingKeys/t1',
     await denies(s.getDoc(s.doc('trainingKeys/t1'))));
  ok('denied: scan trainingKeys',
     await denies(s.getDocs(s.collection('trainingKeys'))));
  ok('student loaded no keys into memory',
     Object.keys(h.w.__probe.answers.keys).length === 0,
     'keys=' + JSON.stringify(h.w.__probe.answers.keys));

  console.log('\n=== ADMIN: can read the key registry ===');
  const h2 = loadPage({configured:true, adminEmails:['boss@x.com'], db: JSON.parse(JSON.stringify(DB))});
  await h2.settle(50);
  h2.signIn({uid:'a1', email:'boss@x.com'});
  await h2.settle(400);
  const s2 = h2.w.FirebaseService;
  ok('admin can read trainingKeys/t1',
     !(await denies(s2.getDoc(s2.doc('trainingKeys/t1')))));
  ok('admin loaded the key into memory',
     h2.w.__probe.answers.keys.t1 && h2.w.__probe.answers.keys.t1.q1 === 0,
     JSON.stringify(h2.w.__probe.answers.keys));
  const shaped = h2.db.trainings.find(t => t.id === 't1');
  ok('admin-shaped training carries its key', !!shaped && shaped.answerKey.q1 === 0,
     JSON.stringify(shaped && shaped.answerKey));

  console.log('\n=== the admin save path writes the key to the registry ===');
  h2.w.__probe.forceServerScoring();
  await h2.w.__probe.saveTrainingKey('t1', {q1:1});
  await h2.settle(100);
  const written = h2.fx.docStore['trainingKeys/t1'];
  ok('trainingKeys/t1 written by the admin save path', !!written && written.key.q1 === 1,
     JSON.stringify(written && written.key));

  console.log('\n  failures: ' + fail + '  passes: ' + pass);
  process.exit(fail ? 1 : 0);
})();
