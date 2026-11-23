const {loadPage} = require('./loader');

const TRAINING = {
  id:'t1', title:'ತರಬೇತಿ', topic:'ವಿಷಯ', date:'23-11-2026', passing:70,
  published:true, archived:false,
  questions:[{id:'q1',text:'ಪ್ರ?',options:['ಎ','ಬಿ','ಸಿ','ಡಿ'],marks:1}],
  answerKey:{q1:0},
  feedback:{day:'',sessions:[{heading:'ಅ',topic:'ವ',lecturer:'ಉ'}],
            questions:[{id:'f1',text:'ಹೌದಾ?',type:'radio',options:['ಹೌದು','ಇಲ್ಲ']}]}
};

function baseDb(){
  return {
    'students/s1':{uid:'s1',email:'s1@x.com',officialName:'ಅನನ್ಯಾ',kgid:'KG1',designation:'ಸಹಾಯಕ',status:'approved',role:'student'},
    'students/s2':{uid:'s2',email:'s2@x.com',officialName:'ರಾಹುಲ್',kgid:'KG2',designation:'ಸಹಾಯಕ',status:'approved',role:'student'},
    'trainings/t1':JSON.parse(JSON.stringify(TRAINING)),
    'trainings/t2':Object.assign({}, TRAINING, {id:'t2', title:'ಕರಡು', published:false}),
    'submissions/sub1':{studentUid:'s1',trainingId:'t1',officialNameSnapshot:'ಅನನ್ಯಾ',kgidSnapshot:'KG1',
      trainingTitle:'ತರಬೇತಿ',marksObtained:1,totalMarks:1,percentage:100,passStatus:true,certificateNo:'C1',
      feedbackResponses:{ratings:{},answers:{}},assessmentAnswers:{q1:0},
      submittedAt:'2026-11-23T10:00:00.000Z'},
    'submissions/sub2':{studentUid:'s2',trainingId:'t1',officialNameSnapshot:'ರಾಹುಲ್',kgidSnapshot:'KG2',
      trainingTitle:'ತರಬೇತಿ',marksObtained:0,totalMarks:1,percentage:0,passStatus:false,
      feedbackResponses:{ratings:{},answers:{}},assessmentAnswers:{q1:1},
      submittedAt:'2026-11-23T10:05:00.000Z'},
    'certificates/c1':{number:'C1',studentUid:'s1',submissionId:'sub1',studentName:'ಅನನ್ಯಾ',
      marks:1,total:1,pct:100,trainingTitle:'ತರಬೇತಿ'},
    'certificates/c2':{number:'C2',studentUid:'s2',submissionId:'sub2',studentName:'ರಾಹುಲ್',
      marks:0,total:1,pct:0,trainingTitle:'ತರಬೇತಿ'}
  };
}

(async () => {
  console.log('=== STUDENT s1: constrained reads are allowed ===');
  let h = loadPage({configured:true, adminEmails:['boss@x.com'], db: baseDb()});
  await h.settle(50);
  h.signIn({uid:'s1', email:'s1@x.com'});
  await h.settle(300);

  const reads = h.fx.calls.reads.filter(r => r.type === 'list');
  const trainingsRead = reads.find(r => r.col === 'trainings');
  const subsRead = reads.find(r => r.col === 'submissions');
  const certsRead = reads.find(r => r.col === 'certificates');

  h.ok('trainings query carries published==true',
       trainingsRead && trainingsRead.constraints.some(c=>c.field==='published'&&c.value===true),
       JSON.stringify(trainingsRead && trainingsRead.constraints));
  h.ok('submissions query carries studentUid==s1',
       subsRead && subsRead.constraints.some(c=>c.field==='studentUid'&&c.value==='s1'),
       JSON.stringify(subsRead && subsRead.constraints));
  h.ok('certificates query carries studentUid==s1',
       certsRead && certsRead.constraints.some(c=>c.field==='studentUid'&&c.value==='s1'),
       JSON.stringify(certsRead && certsRead.constraints));

  h.ok('student dashboard renders', !!h.$('.app-shell'));
  h.ok('sees the published training', h.text().includes('ತರಬೇತಿ'));
  h.ok('does NOT see the draft training', !h.text().includes('ಕರಡು'));

  console.log('\n=== STUDENT ISOLATION: cannot see s2 data ===');
  const subTitles = h.$$('[data-action="open-training"]').length;
  h.ok('only own submission loaded', h.db.submissions.length === 1,
       'count=' + h.db.submissions.length);
  h.ok('own submission only (sub1)', h.db.submissions[0] && h.db.submissions[0].id === 'sub1',
       h.db.submissions[0] && h.db.submissions[0].id);
  h.ok('no s2 submission anywhere', !h.db.submissions.some(s=>s.userId==='s2'));
  h.ok('own certificate only', h.db.certificates.length === 1,
       'count=' + h.db.certificates.length);
  h.ok('cannot read other student profile doc',
       h.fx.calls.reads.filter(r => r.path === 'students/s2').length === 0);

  console.log('\n=== RULE ENFORCEMENT: direct attacks are rejected ===');
  const denied = [];
  await h.w.FirebaseService.getDoc({path:'students/s2'}).catch(e => denied.push('read other profile'));
  await h.w.FirebaseService.getDoc({path:'submissions/sub2'}).catch(e => denied.push('read other submission'));
  await h.w.FirebaseService.getDocs(h.w.FirebaseService.collection('submissions')).catch(e => denied.push('unconstrained submissions scan'));
  await h.w.FirebaseService.getDocs(h.w.FirebaseService.collection('trainings')).catch(e => denied.push('unconstrained trainings scan'));
  await h.w.FirebaseService.updateDoc({path:'submissions/sub1'}, {marksObtained:99}).catch(e => denied.push('edit marks'));
  await h.w.FirebaseService.updateDoc({path:'submissions/sub1'}, {passStatus:true}).catch(e => denied.push('edit passStatus'));
  await h.w.FirebaseService.setDoc({path:'trainings/t1'}, {title:'hacked'}).catch(e => denied.push('edit training/answerKey'));
  await h.w.FirebaseService.setDoc({path:'certificateDesigns/current'}, {useCustom:true}).catch(e => denied.push('edit cert design'));
  await h.w.FirebaseService.updateDoc({path:'students/s1'}, {status:'approved', role:'admin'}).catch(e => denied.push('escalate own profile'));

  const want = ['read other profile','read other submission','unconstrained submissions scan',
                'unconstrained trainings scan','edit marks','edit passStatus','edit training/answerKey',
                'edit cert design','escalate own profile'];
  want.forEach(w => h.ok('denied: ' + w, denied.indexOf(w) > -1));

  console.log('\n=== ADMIN: sees everything, rules allow writes ===');
  const h2 = loadPage({configured:true, adminEmails:['boss@x.com'], db: baseDb()});
  await h2.settle(50);
  h2.signIn({uid:'admin', email:'boss@x.com'});
  await h2.settle(300);
  h2.ok('admin shell', !!h2.$('.sidebar'));
  h2.ok('admin loaded both trainings', h2.db.trainings.length === 2,
       'count=' + h2.db.trainings.length);
  h2.ok('admin loaded both submissions', h2.db.submissions.length === 2,
       'count=' + h2.db.submissions.length);
  h2.ok('admin loaded both certificates', h2.db.certificates.length === 2,
       'count=' + h2.db.certificates.length);
  const adminDenied = [];
  await h2.w.FirebaseService.getDoc({path:'students/s1'}).catch(e => adminDenied.push('read student'));
  h2.ok('admin can read any student profile', adminDenied.length === 0);

  console.log('\n  failures:', h.fails() + h2.fails());
})();
