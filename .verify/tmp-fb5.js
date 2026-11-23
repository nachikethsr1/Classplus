const {loadPage} = require('./loader');
(async () => {
  const h = loadPage({configured:true, adminEmails:['boss@x.com'], db:{
    'students/s1':{uid:'s1',email:'s1@x.com',officialName:'A',kgid:'K1',status:'approved',role:'student'},
    'trainings/t1':{title:'T',published:true,archived:false,passing:70,
      questions:[{id:'q1',text:'x',options:['a','b']}], answerKey:{q1:0},
      feedback:{day:'',sessions:[{heading:'S1'}],questions:[
        {id:'f1',text:'rate?',type:'radio',options:['Good','Bad']},
        {id:'f2',text:'why?',type:'textarea',options:[]}]}},
  }});
  await h.settle(50);
  h.signIn({uid:'s1', email:'s1@x.com'});
  await h.settle(400);
  h.w.__probe.openTraining('t1');
  await h.settle(200);
  // details stage: fill
  h.w.__probe.state.draft.details = {name:'A', email:'a@x.com', kgid:'K1'};
  h.w.__probe.setStage(2);
  await h.settle(200);
  // select session rating
  const rate = h.w.document.querySelector('input[name="rate_0"]');
  rate.checked = true; rate.dispatchEvent(new h.w.Event('change',{bubbles:true}));
  await h.settle(100);
  // select radio feedback
  let r = h.w.document.querySelector('input[data-fbgroup][value="Good"]');
  r.checked = true; r.dispatchEvent(new h.w.Event('change',{bubbles:true}));
  await h.settle(100);
  // textarea
  const ta = h.w.document.querySelector('textarea[data-fb]');
  ta.value = 'because'; ta.dispatchEvent(new h.w.Event('input',{bubbles:true}));
  await h.settle(100);
  console.log('draft:', JSON.stringify(h.w.__probe.state.draft.feedback));
  // click next
  const next = [...h.w.document.querySelectorAll('[data-action="stage-next"]')][0];
  console.log('next button present:', !!next);
  next.dispatchEvent(new h.w.MouseEvent('click',{bubbles:true}));
  await h.settle(200);
  console.log('stage after next:', h.w.__probe.state.stage);
  const msg = h.w.document.getElementById('stageMsg');
  console.log('stageMsg:', msg && msg.textContent);
})();
