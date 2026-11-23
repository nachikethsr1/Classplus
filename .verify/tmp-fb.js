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
  // open the training
  h.w.__probe.setStage(2);
  await h.settle(200);
  console.log('stage html has feedback?', /data-fbgroup/.test(h.w.document.body.innerHTML));
  const radios = [...h.w.document.querySelectorAll('input[type=radio][data-fbgroup]')];
  console.log('feedback radios:', radios.length);
  if(radios.length){
    const r = radios[0];
    r.checked = true;
    r.dispatchEvent(new h.w.Event('change',{bubbles:true}));
    await h.settle(100);
    console.log('draft feedback:', JSON.stringify(h.w.__probe.state.draft && h.w.__probe.state.draft.feedback));
    console.log('stored draft:', h.w.localStorage.getItem('dti_draft_v1') && JSON.parse(h.w.localStorage.getItem('dti_draft_v1')).feedback);
  }
})();
