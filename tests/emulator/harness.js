/* ============================================================
   Tiny test harness for the Firebase Emulator suite.

   Every result carries an explicit verdict so the final report can
   never be read as "everything is fine":

     pass   the behaviour matched what the rules are supposed to do
     fail   the rules (or the app) do something different
     gap    the call succeeded AND that is a known security hole;
            it is reported separately and never counted as a pass
     skip   not runnable in this environment

   Nothing here re-implements a Firestore rule. Every assertion is the
   result of a real Firebase SDK call against the real emulator.
   ============================================================ */

const results = [];
let group = 'ungrouped';

function setGroup(name) {
  group = name;
}

function record(status, id, desc, detail) {
  results.push({ status, id, group, desc, detail: detail || '' });
  const tag = { pass: 'PASS', fail: 'FAIL', gap: 'GAP ', skip: 'SKIP' }[status];
  const line = `${tag}  ${id.padEnd(6)} ${desc}`;
  console.log(detail ? `${line}\n           ${detail}` : line);
}

function errCode(e) {
  if (!e) return '';
  if (!e.code) return e.message || String(e);
  /* permission-denied is self-explanatory; anything else needs the text */
  if (e.code === 'permission-denied' || e.code === 'storage/unauthorized') return e.code;
  return e.code + ': ' + String(e.message || '').slice(0, 300);
}

function isDenied(e) {
  const c = String(errCode(e));
  return (
    c === 'permission-denied' ||
    c === 'storage/unauthorized' ||
    /PERMISSION_DENIED/i.test(c) ||
    /Missing or insufficient permissions/i.test(String(e && e.message))
  );
}

/* The call must succeed. */
async function allow(id, desc, fn) {
  try {
    await fn();
    record('pass', id, desc + ' — allowed');
  } catch (e) {
    record('fail', id, desc + ' — expected ALLOW', 'got error: ' + errCode(e));
  }
}

/* The call must be refused by the security rules. */
async function deny(id, desc, fn) {
  try {
    await fn();
    record('fail', id, desc + ' — expected DENY', 'the call SUCCEEDED');
  } catch (e) {
    if (isDenied(e)) {
      record('pass', id, desc + ' — denied');
    } else {
      record('fail', id, desc + ' — expected DENY', 'failed for another reason: ' + errCode(e));
    }
  }
}

/* The call succeeds today and that is a security gap we are documenting,
   not a passing test. */
async function gap(id, desc, note, fn) {
  try {
    await fn();
    record('gap', id, desc, note);
  } catch (e) {
    if (isDenied(e)) {
      record('pass', id, desc + ' — denied (gap is closed)', note);
    } else {
      record('fail', id, desc, 'unexpected error: ' + errCode(e));
    }
  }
}

/* A plain boolean assertion (used for non-rule facts, e.g. which
   documents a query actually returned). */
function expect(id, desc, cond, detail) {
  record(cond ? 'pass' : 'fail', id, desc, cond ? '' : detail || '');
}

function skip(id, desc, why) {
  record('skip', id, desc, why);
}

function summary() {
  const by = (s) => results.filter((r) => r.status === s);
  return {
    total: results.length,
    pass: by('pass').length,
    fail: by('fail').length,
    gap: by('gap').length,
    skip: by('skip').length,
    results: results.slice(),
  };
}

module.exports = { setGroup, allow, deny, gap, expect, skip, summary, isDenied, errCode };
