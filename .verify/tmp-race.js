const {loadPage} = require('./loader');
(async () => {
  const h = loadPage({configured:true, adminEmails:['boss@x.com'], db:{
    'students/s1':{uid:'s1',email:'s1@x.com',officialName:'A',kgid:'K1',status:'approved',role:'student'},
    'trainings/t1':{title:'T',published:true,archived:false,passing:70,
      questions:[{id:'q1',text:'x',options:['a','b']}], answerKey:{q1:0},
      feedback:{day:'',sessions:[],questions:[{id:'f1',text:'rate?',type:'radio',options:['Good','Bad']}]}},
  }});
  await h.settle(50);
  h.signIn({uid:'s1', email:'s1@x.com'});
  await h.settle(400);
  h.w.__probe.openTraining('t1');
  await h.settle(200);
  h.w.__probe.setStage(2);
  await h.settle(200);
  const r = h.w.document.querySelector('input[data-fbgroup][value="Good"]');
  r.checked = true; r.dispatchEvent(new h.w.Event('change',{bubbles:true}));
  // NO wait: close the tab immediately, before the 250ms debounce fires
  console.log('draft in memory:', JSON.stringify(h.w.__probe.state.draft.feedback.answers));
  console.log('localStorage BEFORE debounce:', h.w.localStorage.getItem('dti_draft_v1_s1_t1'));
})();
