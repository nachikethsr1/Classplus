/* t-issue.js — Phase 1 item 2, end to end.
   Drives the app's OWN submission -> certificate code path and checks the
   document it writes actually satisfies the certificates rules. */
const {loadPage} = require('./loader');

let pass = 0, fail = 0;
function ok(n, c, d){ c ? (pass++, console.log('PASS — ' + n + (d ? '  [' + d + ']' : '')))
                        : (fail++, console.log('FAIL — ' + n + (d ? '  [' + d + ']' : ''))); }

const DB = {
  'students/s1':{uid:'s1',email:'s1@x.com',officialName:'ಅನನ್ಯಾ',kgid:'K1',status:'approved',role:'student'},
  'trainings/t1':{title:'ತರಬೇತಿ',topic:'ವಿಷಯ',date:'23-11-2026',published:true,archived:false,
    passing:70,
    questions:[{id:'q1',q:'a',options:['1','2']},{id:'q2',q:'b',options:['1','2']}],
    /* client scoring mode: the key is mirrored on the doc so the browser can
       mark the paper. See SCORING in index.html. */
    answerKey:{q1:0,q2:1}},
};

(async () => {
  const h = loadPage({configured:true, adminEmails:['boss@x.com'], db: JSON.parse(JSON.stringify(DB))});
  await h.settle(50);
  h.signIn({uid:'s1', email:'s1@x.com'});
  await h.settle(300);

  const svc = h.w.FirebaseService;
  /* the shaped object the app really passes around (trainingFromDoc output) */
  const training = h.db.trainings[0];
  ok('training came through trainingFromDoc', !!training && Array.isArray(training.questions),
     'questions=' + (training && training.questions.length));

  // sanity: the probe can reach the real functions
  ok('app exposes its certificate writer', typeof h.w.__probe.issueCertificate === 'function');

  /* A passing run: 2 of 2 correct => 100% */
  await h.w.__probe.issueCertificate(training, {q1:0, q2:1});
  await h.settle(200);

  const subPath = Object.keys(h.fx.docStore).filter(p => p.startsWith('submissions/'));
  const certPath = Object.keys(h.fx.docStore).filter(p => p.startsWith('certificates/'));
  console.log('\n=== what the app wrote ===');
  subPath.forEach(p => console.log('   ' + p));
  certPath.forEach(p => console.log('   ' + p + '  number=' + h.fx.docStore[p].number));

  ok('a submission document was written', subPath.length === 1, 'count=' + subPath.length);
  ok('a certificate document was written', certPath.length === 1, 'count=' + certPath.length);

  if(certPath.length === 1){
    const c = h.fx.docStore[certPath[0]];
    const s = h.fx.docStore[subPath[0]];
    ok('certificate number is a non-empty string', typeof c.number === 'string' && c.number.length > 0, c.number);
    ok('certificate owns the submission', c.submissionId === subPath[0].split("/")[1], c.submissionId);
    ok('certificate studentUid is the caller', c.studentUid === 's1');
    ok('certificate copied marks verbatim', c.marks === s.marksObtained, c.marks + ' vs ' + s.marksObtained);
    ok('certificate copied total verbatim', c.total === s.totalMarks, c.total + ' vs ' + s.totalMarks);
    ok('certificate copied pct verbatim', c.pct === s.percentage, c.pct + ' vs ' + s.percentage);
    ok('passing submission => passStatus true', s.passStatus === true);
  }

  console.log('\n  failures: ' + fail + '  passes: ' + pass);
  process.exit(fail ? 1 : 0);
})();
