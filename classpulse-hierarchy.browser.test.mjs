/**
 * classpulse-hierarchy.browser.test.mjs
 * Run with:  node --test classpulse-hierarchy.browser.test.mjs
 * Verifies the dev/demo localStorage-backed adapters: persistence across
 * "reloads", idempotent seeding, transaction rollback durability, and that
 * Set-valued data survives JSON.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { ClassPulseHierarchy, PANEL, PermissionDeniedError, ValidationError }
  from './classpulse-hierarchy.js';
import { createBrowserAdapters, ensureHierarchyUser } from './classpulse-hierarchy.browser.js';

/** Minimal localStorage stand-in. */
function fakeStorage() {
  const map = new Map();
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: k => { map.delete(k); },
    get size() { return map.size; },
  };
}

let storage, boot;
/** Boot the demo adapters exactly like the page does. */
function bootHierarchy(users) {
  const env = createBrowserAdapters({ storage, users });
  const h = new ClassPulseHierarchy(env.adapters);
  return { env, h };
}

beforeEach(() => { storage = fakeStorage(); });

/* 1. A purchase survives a reload */
test('b1. panel purchase and balance survive a reload', async () => {
  const first = bootHierarchy([{ id: 'alice', points: 0, diamonds: 500 }]);
  first.env.setCurrentUser('alice');
  await first.h.purchasePanel({ panelId: PANEL.PRO });
  assert.equal(first.env.db.balances.get('alice').diamonds, 0);

  // "reload": a brand-new instance reading the same storage
  const second = bootHierarchy([{ id: 'alice', points: 0, diamonds: 500 }]);
  assert.equal(second.env.restoredFromStorage, true);
  assert.equal(second.env.db.balances.get('alice').diamonds, 0, 'balance must not be re-seeded');
  assert.ok((await second.h.getUserPanels('alice')).includes(PANEL.PRO), 'panel must persist');
});

/* 2. Re-seeding is idempotent — never resets a returning user */
test('b2. seeding a returning user does not clobber panels or balance', async () => {
  const first = bootHierarchy([{ id: 'bob', points: 0, diamonds: 900 }]);
  first.env.setCurrentUser('bob');
  await first.h.purchasePanel({ panelId: PANEL.DEV });   // 100 diamonds

  const second = bootHierarchy([{ id: 'bob', points: 0, diamonds: 900 }]);
  assert.equal(second.env.db.balances.get('bob').diamonds, 800);
  assert.ok((await second.h.getUserPanels('bob')).includes(PANEL.DEV));
});

/* 3. A failed transaction is not persisted */
test('b3. a rolled-back transaction leaves no trace on disk', async () => {
  const { env, h } = bootHierarchy([{ id: 'alice', points: 0, diamonds: 100 }]);
  env.setCurrentUser('alice');
  await assert.rejects(() => h.purchasePanel({ panelId: PANEL.ADMIN }), ValidationError);

  const reloaded = bootHierarchy([{ id: 'alice', points: 0, diamonds: 100 }]);
  assert.equal(reloaded.env.db.balances.get('alice').diamonds, 100);
  assert.deepEqual(reloaded.env.db.ledger.size, 0, 'no ledger entry may survive a rollback');
  assert.equal(reloaded.env.snapshot().panels.flatMap(p => p[1]).includes(PANEL.ADMIN), false);
});

/* 4. Set-valued data survives JSON */
test('b4. group membership (a Set) survives serialisation', async () => {
  // verifiedTeacher flags the account; the trusted process grants the panel
  const first = bootHierarchy([
    { id: 'teacher', diamonds: 0, points: 0, verifiedTeacher: true, panels: [PANEL.ADMIN] },
    { id: 'student1', diamonds: 0, points: 0 },
  ]);
  first.env.setCurrentUser('teacher');
  const group = await first.h.createGroup({ name: 'Class 7A' });
  await first.env.adapters.groups.addMember(group.id, 'student1');
  first.env.save();

  const second = bootHierarchy([{ id: 'teacher' }, { id: 'student1' }]);
  assert.equal(await second.env.adapters.groups.isMember(group.id, 'student1'), true);
  assert.equal(await second.env.adapters.groups.isMember(group.id, 'nobody'), false);
});

/* 5. Conversion round-trips, and its daily cap is enforced */
test('b5. points conversion persists and honours the daily cap', async () => {
  const { env, h } = bootHierarchy([{ id: 'alice', points: 500, diamonds: 0 }]);
  env.setCurrentUser('alice');
  await h.convertPointsToDiamonds({ amountDiamonds: 60 });      // Noob cap is 100/day
  assert.equal(env.db.balances.get('alice').diamonds, 60);
  assert.equal(env.db.balances.get('alice').points, 440);

  await assert.rejects(() => h.convertPointsToDiamonds({ amountDiamonds: 60 }), ValidationError);

  const reloaded = bootHierarchy([{ id: 'alice', points: 500, diamonds: 0 }]);
  assert.equal(reloaded.env.db.balances.get('alice').diamonds, 60);
  assert.equal(reloaded.env.db.balances.get('alice').points, 440);
});

/* 6. Identity comes from setCurrentUser, and absent identity fails closed */
test('b6. auth follows the app session and denies when logged out', async () => {
  const { env, h } = bootHierarchy([{ id: 'alice', diamonds: 500, points: 0 }]);
  env.setCurrentUser(null);
  await assert.rejects(() => h.purchasePanel({ panelId: PANEL.PRO }), PermissionDeniedError);
  env.setCurrentUser('alice');
  const ok = await h.purchasePanel({ panelId: PANEL.PRO });
  assert.ok(ok.transactionId);
});

/* 7. Teachers are verified, so Admin is free — never charged */
test('b7. verified teacher gets Admin without being charged', async () => {
  const { env, h } = bootHierarchy([{ id: 'teacher', diamonds: 0, points: 0,
    verifiedTeacher: true, panels: [PANEL.ADMIN] }]);
  env.setCurrentUser('teacher');
  assert.equal(await h.isVerifiedTeacher('teacher'), true);
  assert.ok((await h.getUserPanels('teacher')).includes(PANEL.ADMIN));
  assert.ok((await h.getEffectivePermissions('teacher')).has('videos.setVisibility'));
  await assert.rejects(() => h.purchasePanel({ panelId: PANEL.ADMIN }), /free/i);
  assert.equal(env.db.balances.get('teacher').diamonds, 0);
});

/* 8. Reset clears the snapshot */
test('b8. reset clears the stored snapshot', async () => {
  const first = bootHierarchy([{ id: 'alice', diamonds: 500, points: 0 }]);
  first.env.setCurrentUser('alice');
  await first.h.purchasePanel({ panelId: PANEL.PRO });
  assert.ok(storage.size > 0);

  first.env.reset();
  const after = bootHierarchy([{ id: 'alice', diamonds: 500, points: 0 }]);
  assert.equal(after.env.restoredFromStorage, false);
  assert.equal(after.env.db.balances.get('alice').diamonds, 500, 'seed applies again after reset');
  assert.equal((await after.h.getUserPanels('alice')).includes(PANEL.PRO), false);
});

/* 9. The demo clock is live, not frozen at the module's fixture date */
test('b9. demo clock reports the real date', async () => {
  const { env, h } = bootHierarchy([{ id: 'alice', points: 10, diamonds: 0 }]);
  const now = await env.adapters.clock.now();
  const drift = Math.abs(Date.now() - new Date(now).getTime());
  assert.ok(drift < 60_000, `clock should be live (drift ${drift}ms)`);
  assert.equal(env.adapters.clock.timeZone, 'Asia/Kolkata');
});

/* 10. Corrupt storage degrades to a fresh store instead of crashing */
test('b10. corrupt snapshot falls back to a clean store', async () => {
  storage.setItem('classpulse.hierarchy.v1', '{not json');
  const { env, h } = bootHierarchy([{ id: 'alice', diamonds: 5, points: 0 }]);
  assert.equal(env.restoredFromStorage, false);
  assert.equal(env.db.balances.get('alice').diamonds, 5);
  assert.ok(await h.getUserPanels('alice'));
});

/* 11. Unknown users are seeded on first sight, not invented as panels */
test('b11. ensureHierarchyUser adds every field exactly once', () => {
  const { env } = bootHierarchy([]);
  ensureHierarchyUser(env.db, { id: 'new1', points: 7, verifiedTeacher: true });
  ensureHierarchyUser(env.db, { id: 'new1', points: 999, panels: [PANEL.ADMIN] });
  assert.equal(env.db.balances.get('new1').points, 7, 'second call must not re-seed');
  assert.deepEqual(env.db.panels.get('new1'), [], 'second call must not grant panels');
});
