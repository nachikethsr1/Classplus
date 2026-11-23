/* t-feedback.js — Phase 3, item 12: feedback answers must survive. */
const {loadPage} = require('./loader');

let pass = 0, fail = 0;
function ok(n, c, d){ c ? (pass++, console.log('PASS — ' + n + (d ? '  [' + d + ']' : '')))
                        : (fail++, console.log('FAIL — ' + n + (d ? '  [' + d + ']' : ''))); }

const DB = {
  'students/s1':{uid:'s1',email:'s1@x.com',officialName:'A',kgid:'K1',status:'approved',role:'student'},
  'trainings/t1':{title:'T',published:true,archived:false,passing:70,
    questions:[{id:'q1',text:'x',options:['a','b']}], answerKey:{q1:0},
    feedback:{day:'',sessions:[{heading:'S1'}],questions:[
      {id:'f1',text:'rate?',type:'radio',options:['Good','Bad']},
      {id:'f2',text:'again?',type:'radio',options:['Yes','No']},
      {id:'f3',text:'why?',type:'textarea',options:[]}]}},
};

function openFeedbackPage(h){
  h.w.__probe.openTraining('t1');
  h.w.__probe.setStage(2);
}

(async () => {
  const h = loadPage({configured:true, adminEmails:['boss@x.com'], db: JSON.parse(JSON.stringify(DB))});
  await h.settle(50);
  h.signIn({uid:'s1', email:'s1@x.com'});
  await h.settle(400);
  openFeedbackPage(h);
  await h.settle(120);

  console.log('=== an answer is written to storage immediately ===');
  const r = h.w.document.querySelector('input[data-fbgroup][value="Good"]');
  r.checked = true;
  r.dispatchEvent(new h.w.Event('change',{bubbles:true}));
  /* deliberately no wait: the old code needed 250ms before it wrote */
  const key = 'dti_draft_s1_t1';
  const raw = h.w.localStorage.getItem(key);
  ok('persisted with no delay (tab-close safe)', !!raw, raw ? 'written' : 'MISSING');
  ok('the answer is in the persisted draft',
     !!raw && JSON.parse(raw).feedback.answers.f1 === 'Good',
     raw ? JSON.stringify(JSON.parse(raw).feedback.answers) : '—');

  console.log('\n=== textarea and the second radio ===');
  const ta = h.w.document.querySelector('textarea[data-fb]');
  ta.value = 'because'; ta.dispatchEvent(new h.w.Event('input',{bubbles:true}));
  const r2 = h.w.document.querySelector('input[data-fbgroup][value="Yes"]');
  r2.checked = true; r2.dispatchEvent(new h.w.Event('change',{bubbles:true}));
  const saved = JSON.parse(h.w.localStorage.getItem(key));
  ok('textarea answer persisted', saved.feedback.answers.f3 === 'because', JSON.stringify(saved.feedback.answers));
  ok('second radio persisted alongside the first',
     saved.feedback.answers.f1 === 'Good' && saved.feedback.answers.f2 === 'Yes',
     JSON.stringify(saved.feedback.answers));

  console.log('\n=== re-selecting the same group replaces, never duplicates ===');
  const bad = h.w.document.querySelector('input[data-fbgroup][value="Bad"]');
  bad.checked = true; bad.dispatchEvent(new h.w.Event('change',{bubbles:true}));
  const again = JSON.parse(h.w.localStorage.getItem(key));
  ok('latest choice wins', again.feedback.answers.f1 === 'Bad', JSON.stringify(again.feedback.answers));

  console.log('\n=== the choice is still checked after a re-render ===');
  h.w.__probe.render();
  await h.settle(100);
  const restored = h.w.document.querySelector('input[data-fbgroup][value="Bad"]');
  ok('selected radio re-renders as checked', !!restored && restored.checked === true);

  console.log('\n=== a session rating saves too ===');
  const rate = h.w.document.querySelector('input[name="rate_0"]');
  rate.checked = true; rate.dispatchEvent(new h.w.Event('change',{bubbles:true}));
  const rated = JSON.parse(h.w.localStorage.getItem(key));
  ok('rating persisted under its session index', !!rated.feedback.ratings['0'],
     JSON.stringify(rated.feedback.ratings));

  console.log('\n=== the assessment can be reached once feedback is complete ===');
  h.w.__probe.gotoNext();
  await h.settle(120);
  ok('advanced to the assessment stage', h.w.__probe.state.stage === 3,
     'stage=' + h.w.__probe.state.stage);

  console.log('\n=== dropping a draft cancels any pending write ===');
  h.w.__probe.dropDraftNow();
  await h.settle(300);
  ok('draft is gone and stays gone', h.w.localStorage.getItem(key) === null);

  console.log('\n  failures: ' + fail + '  passes: ' + pass);
  process.exit(fail ? 1 : 0);
})();
