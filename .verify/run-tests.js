#!/usr/bin/env node
/* Runs every suite in this folder and fails if any assertion fails. */
const { execFileSync } = require('child_process');

const SUITES = [
  't-boot.js',           // module-loading race
  't-boot2.js',          // module ready / unconfigured / missing
  't-rules.js',          // student isolation + admin access
  't-guards.js',         // no unconstrained scans as a student
  't-certs.js',          // certificates rules: forgery paths
  't-issue.js',          // real submit -> certificate path
  't-registration.js',   // real registration path
];

let bad = [];
for(const s of SUITES){
  let out = '', failed = false;
  try{
    out = execFileSync(process.execPath, [s], {encoding:'utf8', stdio:'pipe'});
  }catch(e){
    out = (e.stdout || '') + (e.stderr || '');
    failed = true;
  }
  const m = out.match(/failures:\s*(\d+)/);
  const failures = m ? Number(m[1]) : null;
  const pm = out.match(/passes:\s*(\d+)/);
  const passes = pm ? Number(pm[1]) : (out.match(/PASS —/g) || []).length;
  const status = (failed || (failures !== null && failures > 0)) ? 'FAIL' : 'ok  ';
  if(status === 'FAIL') bad.push(s);
  console.log(status + '  ' + s.padEnd(20) + ' passes=' + passes + '  failures=' + (failures === null ? '?' : failures));
  if(status === 'FAIL') console.log(out.split('\n').filter(l => /FAIL|Error/.test(l)).map(l => '        ' + l).join('\n'));
}

console.log('\n' + (bad.length ? bad.length + ' suite(s) failing: ' + bad.join(', ') : 'ALL SUITES PASS'));
process.exit(bad.length ? 1 : 0);
