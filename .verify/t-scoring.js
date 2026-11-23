/* t-scoring.js — Phase 3, item 11: computeResult() uses per-question marks.

   The compatibility claim is that an equal-weight paper scores exactly as
   it did before. That is asserted directly by re-running the old formula. */
const {loadPage} = require('./loader');

let pass = 0, fail = 0;
function ok(n, c, d){ c ? (pass++, console.log('PASS — ' + n + (d ? '  [' + d + ']' : '')))
                        : (fail++, console.log('FAIL — ' + n + (d ? '  [' + d + ']' : ''))); }

/* the formula as it was before the change, for the compatibility check */
function oldCompute(training, answers){
  let correct = 0;
  const total = training.questions.length;
  training.questions.forEach(q => {
    const key = training.answerKey ? training.answerKey[q.id] : undefined;
    const given = answers[q.id];
    if(given !== undefined && given !== null && String(given) !== '' && Number(given) === Number(key)) correct++;
  });
  const pct = total ? Math.round((correct / total) * 100) : 0;
  const passing = Number(training.passing) || 70;
  return {correct, wrong: total - correct, total, marks: correct, pct, passed: pct >= passing, passing};
}

(async () => {
  const h = loadPage({configured:true, adminEmails:['boss@x.com'], db:{}});
  await h.settle(50);
  const compute = h.w.__probe.computeResult;

  console.log('=== equal weights: identical to the old formula ===');
  const eq = {passing:70, questions:[
    {id:'a',marks:1},{id:'b',marks:1},{id:'c',marks:1},{id:'d',marks:1}], answerKey:{a:0,b:1,c:0,d:1}};
  [ {a:0,b:1,c:0,d:1}, {a:0,b:1,c:1,d:0}, {a:0}, {}, {a:1,b:0,c:1,d:0} ].forEach(function(answers, i){
    const now = compute(eq, answers), before = oldCompute(eq, answers);
    ok('case ' + (i+1) + ': marks/pct/passed unchanged',
       now.marks === before.marks && now.pct === before.pct && now.passed === before.passed,
       'now=' + now.marks + '/' + now.total + ' ' + now.pct + '%  before=' + before.marks + '/' + before.total + ' ' + before.pct + '%');
  });

  console.log('\n=== weighted questions ===');
  const w = {passing:60, questions:[
    {id:'a',marks:5},{id:'b',marks:3},{id:'c',marks:2}], answerKey:{a:0,b:1,c:0}};
  const r = compute(w, {a:0, b:1, c:1});   // wrong on c only
  ok('total is the sum of question marks', r.total === 10, 'total=' + r.total);
  ok('marks awarded are weighted', r.marks === 8, 'marks=' + r.marks);
  ok('percentage is marks/total', r.pct === 80, 'pct=' + r.pct);
  ok('passing % is preserved', r.passing === 60, 'passing=' + r.passing);
  ok('passed follows the preserved threshold', r.passed === true);
  ok('correct count still counts questions', r.correct === 2, 'correct=' + r.correct);
  ok('totalQuestions is the question count', r.totalQuestions === 3, 'n=' + r.totalQuestions);
  ok('wrong counts questions, not marks', r.wrong === 1, 'wrong=' + r.wrong);

  console.log('\n=== edge cases ===');
  const zero = compute({passing:70, questions:[], answerKey:{}}, {});
  ok('empty paper does not divide by zero', zero.pct === 0 && zero.total === 0, JSON.stringify(zero));
  const missingWeight = compute({passing:70, questions:[{id:'a'}], answerKey:{a:0}}, {a:0});
  ok('a question with no marks defaults to weight 1', missingWeight.total === 1 && missingWeight.marks === 1,
     'total=' + missingWeight.total);
  const allWrong = compute(w, {a:1, b:0, c:1});
  ok('all wrong => 0 marks, still fails', allWrong.marks === 0 && allWrong.passed === false);
  const blank = compute(w, {a:'', b:null});
  ok('blank answers score nothing', blank.marks === 0, 'marks=' + blank.marks);

  console.log('\n  failures: ' + fail + '  passes: ' + pass);
  process.exit(fail ? 1 : 0);
})();
