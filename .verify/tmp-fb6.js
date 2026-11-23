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
  let r = h.w.document.querySelector('input[data-fbgroup][value="Good"]');
  r.checked = true; r.dispatchEvent(new h.w.Event('change',{bubbles:true}));
  await h.settle(150);
  console.log('1. saved:', JSON.stringify(h.w.__probe.state.draft.feedback.answers));
  // does the DOM survive an unrelated render?
  h.w.__probe.render();
  await h.settle(150);
  console.log('2. after render, checked Good:', !!h.w.document.querySelector('input[data-fbgroup][value="Good"]:checked'));
  // what is in the persisted draft?
  const raw = h.w.localStorage.getItem('dti_draft_v1');
  console.log('3. persisted draft:', raw ? JSON.stringify(JSON.parse(raw).feedback) : '(none)');
  // simulate a reload: reload the draft the way openTraining does
  h.w.__probe.reloadDraft();
  await h.settle(150);
  console.log('4. after reloadDraft:', JSON.stringify(h.w.__probe.state.draft.feedback));
})();
