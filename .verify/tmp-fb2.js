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
  console.log('trainingId before:', h.w.__probe.state.trainingId);
  h.w.__probe.openTraining('t1');
  await h.settle(200);
  console.log('stage:', h.w.__probe.state.stage, 'trainingId:', h.w.__probe.state.trainingId);
  h.w.__probe.setStage(2);
  await h.settle(200);
  const all = [...h.w.document.querySelectorAll('input[type=radio]')].map(r=>r.name+'|'+r.value);
  console.log('radios:', all);
  console.log('has fbgroup attr:', /data-fbgroup/.test(h.w.document.body.innerHTML));
  console.log('body snippet:', h.w.document.body.innerHTML.replace(/<script[\s\S]*?<\/script>/g,'').slice(0,300));
})();
