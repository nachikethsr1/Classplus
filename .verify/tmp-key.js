const {loadPage} = require('./loader');
(async () => {
  const h = loadPage({configured:true, adminEmails:['boss@x.com'], db:{
    'students/s1':{uid:'s1',email:'s1@x.com',officialName:'A',kgid:'K1',status:'approved',role:'student'},
    'trainings/t1':{title:'T',published:true,archived:false,passing:70,
      questions:[{id:'q1',text:'x',options:['a','b']}], answerKey:{q1:0}},
  }});
  await h.settle(50);
  h.signIn({uid:'s1', email:'s1@x.com'});
  await h.settle(400);
  const t = h.db.trainings[0];
  console.log('answerKey on shaped training:', JSON.stringify(t.answerKey));
  console.log('computeResult:', JSON.stringify(h.w.__probe.computeResult(t, {q1:0})));
})();
