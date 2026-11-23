#!/usr/bin/env node
/* ============================================================
   Firebase Emulator Suite test run.

   Expects to be launched by `firebase emulators:exec`, which sets
   FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST /
   FIREBASE_STORAGE_EMULATOR_HOST and GCLOUD_PROJECT.

   Every suite gets a freshly wiped and re-seeded Firestore, so no test
   depends on another test's leftovers.
   ============================================================ */

const fs = require('fs');
const path = require('path');
const h = require('./harness');
const env = require('./env');
const { seed } = require('./fixtures');

const SUITES = [
  ['01-profiles', 'students/{uid}: sessions, registration, KGID freeze, isolation'],
  ['02-trainings', 'trainings/{id}: published / draft / archived visibility + constrained queries'],
  ['03-answer-keys', 'trainingKeys/{id}: answer keys are admin-only'],
  ['04-submissions', 'submissions/{id}: ownership, immutability, marks'],
  ['05-certificates', 'certificates/{id}: forgery paths, isolation, immutability'],
  ['06-settings', 'settings / certificateDesigns / counters / catch-all'],
  ['07-storage', 'storage.rules: certificate background upload, read, delete'],
  ['08-app-against-emulator', "index.html's own loaders and submit chain against the real rules"],
  ['09-cert-numbering', 'certificate numbering, including provisional numbers'],
  ['10-config-consistency', 'the admin allowlist in config + both rules files'],
  ['11-cert-design', 'certificate design + background upload, including failure'],
];

async function main() {
  const started = Date.now();
  console.log('Firebase Emulator Suite — real SDK against the real rules');
  console.log('  project   : ' + env.PROJECT_ID);
  console.log('  firestore : ' + env.FIRESTORE.host + ':' + env.FIRESTORE.port);
  console.log('  auth      : ' + env.AUTH.host + ':' + env.AUTH.port);
  console.log('  storage   : ' + env.STORAGE.host + ':' + env.STORAGE.port);
  console.log('  rules     : firestore.rules, storage.rules (as committed)');
  console.log('');

  await env.createAccounts();

  const only = process.argv[2];
  for (const [file, title] of SUITES) {
    if (only && !file.includes(only)) continue;
    console.log('\n── ' + file + ' — ' + title);
    await env.clearFirestore();
    await seed();
    const run = require('./suites/' + file);
    try {
      await run();
    } catch (e) {
      h.expect(file, 'suite crashed', false, (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : String(e)));
    }
  }

  await env.closeAll();

  const s = h.summary();
  console.log('\n============================================================');
  console.log(`TOTAL ${s.total}   pass ${s.pass}   FAIL ${s.fail}   gap ${s.gap}   skip ${s.skip}`);
  console.log(`elapsed ${((Date.now() - started) / 1000).toFixed(1)}s`);

  if (s.fail) {
    console.log('\nFAILURES');
    s.results.filter((r) => r.status === 'fail').forEach((r) => {
      console.log(`  ${r.id}  [${r.group}] ${r.desc}`);
      if (r.detail) console.log(`        ${r.detail}`);
    });
  }
  if (s.gap) {
    console.log('\nKNOWN SECURITY GAPS CONFIRMED BY THE EMULATOR (not failures, not passes)');
    s.results.filter((r) => r.status === 'gap').forEach((r) => {
      console.log(`  ${r.id}  [${r.group}] ${r.desc}`);
      if (r.detail) console.log(`        ${r.detail}`);
    });
  }

  fs.writeFileSync(path.join(__dirname, 'last-run.json'), JSON.stringify(s, null, 2));
  process.exit(s.fail ? 1 : 0);
}

main().catch((e) => {
  console.error('runner crashed', e);
  process.exit(2);
});
