/* t-certno.js — Phase 3, item 9: one numbering scheme, both roles. */
const {loadPage} = require('./loader');

let pass = 0, fail = 0;
function ok(n, c, d){ c ? (pass++, console.log('PASS — ' + n + (d ? '  [' + d + ']' : '')))
                        : (fail++, console.log('FAIL — ' + n + (d ? '  [' + d + ']' : ''))); }

const PATTERN = /^DTI-BNG-\d{4}-\d{4,}$/;
const year = new Date().getFullYear();

(async () => {
  console.log('=== admin: sequential serials from the counter ===');
  const h = loadPage({configured:true, adminEmails:['boss@x.com'], db:{
    'students/a1':{uid:'a1',email:'boss@x.com',officialName:'Admin',kgid:'A1',status:'approved',role:'admin'},
  }});
  await h.settle(50);
  h.signIn({uid:'a1', email:'boss@x.com'});
  await h.settle(400);
  const svc = h.w.FirebaseService;
  const n1 = await h.w.__probe.nextCertNo();
  const n2 = await h.w.__probe.nextCertNo();
  ok('first number matches the format', PATTERN.test(n1), n1);
  ok('second number matches the format', PATTERN.test(n2), n2);
  ok('numbers are sequential', n2 === 'DTI-BNG-' + year + '-0002', n2);
  ok('counter persisted to settings/portal',
     h.fx.docStore['settings/portal'] && h.fx.docStore['settings/portal'].certCounter === 2,
     JSON.stringify(h.fx.docStore['settings/portal']));

  console.log('\n=== student: same format, never a random token ===');
  const h2 = loadPage({configured:true, adminEmails:['boss@x.com'], db:{
    'students/s1':{uid:'s1',email:'s1@x.com',officialName:'A',kgid:'K1',status:'approved',role:'student'},
  }});
  await h2.settle(50);
  h2.signIn({uid:'s1', email:'s1@x.com'});
  await h2.settle(400);
  const s1 = await h2.w.__probe.nextCertNo();
  const s2 = await h2.w.__probe.nextCertNo();
  ok('student number matches the SAME format', PATTERN.test(s1), s1);
  ok('no random uid token in the number', !/[A-Z]{4,}$/.test(s1.replace(/^DTI-BNG-\d{4}-/, '')), s1);
  ok('numbers differ', s1 !== s2, s1 + ' vs ' + s2);
  ok('provisional numbers live in the 9xxx range (never collide with real serials)',
     Number(s1.split('-').pop()) >= 9000, s1);

  console.log('\n=== local/offline path uses the same format and current year ===');
  const h3 = loadPage({configured:false, adminEmails:[], db:{}});
  await h3.settle(50);
  const local = h3.w.__probe.localCertNo();
  ok('offline number matches the format', PATTERN.test(local), local);
  ok('offline number uses the current year, not a hard-coded 2026', local.indexOf('-' + year + '-') > -1, local);

  console.log('\n  failures: ' + fail + '  passes: ' + pass);
  process.exit(fail ? 1 : 0);
})();
