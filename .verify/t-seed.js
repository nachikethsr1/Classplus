/* t-seed.js — Phase 3, item 10: seed once, never duplicate. */
const {loadPage} = require('./loader');

let pass = 0, fail = 0;
function ok(n, c, d){ c ? (pass++, console.log('PASS — ' + n + (d ? '  [' + d + ']' : '')))
                        : (fail++, console.log('FAIL — ' + n + (d ? '  [' + d + ']' : ''))); }

(async () => {
  console.log('=== empty register: seeds the built-in training ===');
  const h = loadPage({configured:true, adminEmails:['boss@x.com'], db:{
    'students/a1':{uid:'a1',email:'boss@x.com',officialName:'Admin',kgid:'A1',status:'approved',role:'admin'},
  }});
  await h.settle(50);
  h.signIn({uid:'a1', email:'boss@x.com'});
  await h.settle(500);
  const seeded = Object.keys(h.fx.docStore).filter(p => p.startsWith('trainings/'));
  ok('one training was seeded', seeded.length === 1, seeded.join(','));
  ok('it is the built-in t_assembly', seeded[0] === 'trainings/t_assembly', seeded[0]);
  ok('it is visible to students (published)', h.fx.docStore['trainings/t_assembly'].published === true);
  ok('its answer key went to the registry', !!h.fx.docStore['trainingKeys/t_assembly']);

  console.log('\n=== repeat init does not duplicate ===');
  const before = Object.keys(h.fx.docStore).filter(p => p.startsWith('trainings/')).length;
  await h.w.__probe.seed();
  await h.w.__probe.seed();
  await h.settle(200);
  const after = Object.keys(h.fx.docStore).filter(p => p.startsWith('trainings/')).length;
  ok('still exactly one training after two more seeds', after === before, 'before=' + before + ' after=' + after);

  console.log('\n=== populated register: never adds to the admin\'s content ===');
  const h2 = loadPage({configured:true, adminEmails:['boss@x.com'], db:{
    'students/a1':{uid:'a1',email:'boss@x.com',officialName:'Admin',kgid:'A1',status:'approved',role:'admin'},
    'trainings/t_own':{title:'ಅವರದೇ ತರಬೇತಿ',published:true,archived:false,questions:[]},
  }});
  await h2.settle(50);
  h2.signIn({uid:'a1', email:'boss@x.com'});
  await h2.settle(500);
  const list = Object.keys(h2.fx.docStore).filter(p => p.startsWith('trainings/'));
  ok('no seed added to a populated register', list.length === 1 && list[0] === 'trainings/t_own', list.join(','));

  console.log('\n=== a student never seeds ===');
  const h3 = loadPage({configured:true, adminEmails:['boss@x.com'], db:{
    'students/s1':{uid:'s1',email:'s1@x.com',officialName:'A',kgid:'K1',status:'approved',role:'student'},
  }});
  await h3.settle(50);
  h3.signIn({uid:'s1', email:'s1@x.com'});
  await h3.settle(400);
  const list3 = Object.keys(h3.fx.docStore).filter(p => p.startsWith('trainings/'));
  ok('student session seeded nothing', list3.length === 0, list3.join(',') || 'none');

  console.log('\n  failures: ' + fail + '  passes: ' + pass);
  process.exit(fail ? 1 : 0);
})();
