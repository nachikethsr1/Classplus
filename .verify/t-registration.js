/* t-registration.js — the real registration form must satisfy the
   students create rule (status pending, role student, email match). */
const {loadPage} = require('./loader');

let pass = 0, fail = 0;
function ok(n, c, d){ c ? (pass++, console.log('PASS — ' + n + (d ? '  [' + d + ']' : '')))
                        : (fail++, console.log('FAIL — ' + n + (d ? '  [' + d + ']' : ''))); }

(async () => {
  const h = loadPage({configured:true, adminEmails:['boss@x.com'], db:{}});
  await h.settle(50);
  h.signIn({uid:'new1', email:'new1@x.com'});
  await h.settle(300);

  ok('gate is needs-profile', h.gate === 'needs-profile', 'gate=' + h.gate);

  console.log('\nforms on page:', h.d ? 'n/a' : [...h.w.document.querySelectorAll('form')].length);

  /* no input events: dispatching them makes the app re-render the gate,
     which would rebuild the form node and lose the typed values */
  h.set(h.$('[name="officialName"]'), 'ಹೊಸ ಬಳಕೆದಾರ', []);
  h.set(h.$('[name="kgid"]'), 'KGID999', []);
  h.set(h.$('[name="designation"]'), 'ಸಹಾಯಕ', []);
  h.set(h.$('[name="department"]'), 'ಶಿಕ್ಷಣ', []);

  h.w.__probe.submitRegistrationForm();
  await h.settle(300);

  const doc = h.fx.docStore['students/new1'];
  console.log('\nwritten profile:', JSON.stringify(doc));

  ok('profile document was created', !!doc);
  if(doc){
    ok('uid matches auth', doc.uid === 'new1');
    ok('email matches token', doc.email === 'new1@x.com');
    ok('status starts pending', doc.status === 'pending', doc.status);
    ok('role starts student', doc.role === 'student', doc.role);
    ok('official name captured', doc.officialName === 'ಹೊಸ ಬಳಕೆದಾರ');
    ok('kgid captured', doc.kgid === 'KGID999');
  }
  ok('no permission-denied on registration', !h.w.__probe.dataStore.error,
     'error=' + h.w.__probe.dataStore.error);

  console.log('\n  failures: ' + fail + '  passes: ' + pass);
  process.exit(fail ? 1 : 0);
})();
