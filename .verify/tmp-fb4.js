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
  // realistic: user clicks the visible <span> inside the pill label
  const span = h.w.document.querySelector('input[data-fbgroup]').closest('label').querySelector('span');
  console.log('clicking span:', span.textContent);
  span.dispatchEvent(new h.w.MouseEvent('click',{bubbles:true}));
  await h.settle(150);
  console.log('input checked:', h.w.document.querySelector('input[data-fbgroup][value="Good"]').checked);
  console.log('draft answers:', JSON.stringify(h.w.__probe.state.draft.feedback.answers));
  // and the click event on the label itself
  const label = h.w.document.querySelector('input[data-fbgroup][value="Bad"]').closest('label');
  label.dispatchEvent(new h.w.MouseEvent('click',{bubbles:true}));
  await h.settle(150);
  console.log('after label click, checked Bad:', h.w.document.querySelector('input[data-fbgroup][value="Bad"]').checked);
  console.log('draft answers:', JSON.stringify(h.w.__probe.state.draft.feedback.answers));
})();
