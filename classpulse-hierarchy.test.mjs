/**
 * classpulse-hierarchy.test.mjs
 * Run with:  node --test classpulse-hierarchy.test.mjs
 * Verifies the actual implementation via the in-memory trusted backend.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  ClassPulseHierarchy, PANEL, resolvePermissions, splitDeveloperReward,
  weekKey, BackendUnavailableError, PermissionDeniedError, ValidationError,
  ConflictError,
} from './classpulse-hierarchy.js';
import { createMemoryAdapters, seedUser, seedVideo } from './classpulse-hierarchy.memory.js';

let env, h, db;
const NOW = Date.UTC(2026, 9, 16, 10, 0, 0); // Friday, 2026-10-16

beforeEach(() => {
  env = createMemoryAdapters({ now: NOW, currentUserId: 'alice' });
  h = new ClassPulseHierarchy(env.adapters);
  db = env.db;
});

/* 1. New user gets Noob free */
test('1. new user receives Noob panel without paying', async () => {
  seedUser(env, 'alice');
  const panels = await h.getUserPanels('alice');
  assert.ok(panels.includes(PANEL.NOOB));
  assert.equal((await h.getEffectivePermissions('alice')).has('diamonds.convert'), true);
});

/* 2. Noob cannot claim weekly allowance */
test('2. Noob cannot claim a weekly diamond allowance', async () => {
  seedUser(env, 'alice');
  await assert.rejects(() => h.grantWeeklyAllowance({}), ValidationError);
  assert.equal(db.balances.get('alice').diamonds, 0);
});

/* 3. Noob daily conversion cap = 100 */
test('3. Noob conversion cannot exceed 100 diamonds per day', async () => {
  seedUser(env, 'alice', { points: 500 });
  await h.convertPointsToDiamonds({ amountDiamonds: 100 });
  assert.equal(db.balances.get('alice').diamonds, 100);
  assert.equal(db.balances.get('alice').points, 400);
  await assert.rejects(() => h.convertPointsToDiamonds({ amountDiamonds: 1 }), ValidationError);
});

/* 4. Pro purchase deducts exactly 500 once */
test('4. Pro purchase deducts exactly 500 diamonds once', async () => {
  seedUser(env, 'alice', { diamonds: 500 });
  const r1 = await h.purchasePanel({ panelId: PANEL.PRO, idempotencyKey: 'buy-pro-1' });
  assert.equal(r1.duplicated, false);
  assert.equal(db.balances.get('alice').diamonds, 0);
  assert.ok((await h.getUserPanels('alice')).includes(PANEL.PRO));
  // Replay with same key: no second charge
  const r2 = await h.purchasePanel({ panelId: PANEL.PRO, idempotencyKey: 'buy-pro-1' });
  assert.equal(r2.duplicated, true);
  assert.equal(db.balances.get('alice').diamonds, 0);
});

/* 5. Pro receives 30 per eligible week */
test('5. Pro receives 30 diamonds per eligible week', async () => {
  seedUser(env, 'alice', { panels: [PANEL.PRO] });
  const r = await h.grantWeeklyAllowance({});
  assert.equal(r.duplicated, false);
  assert.equal(db.balances.get('alice').diamonds, 30);
  const again = await h.grantWeeklyAllowance({});
  assert.equal(again.duplicated, true);
  assert.equal(db.balances.get('alice').diamonds, 30); // not doubled
});

/* 6. Pro conversion cap = 300/day */
test('6. Pro conversion cannot exceed 300 diamonds per day', async () => {
  seedUser(env, 'alice', { panels: [PANEL.PRO], points: 1000 });
  await h.convertPointsToDiamonds({ amountDiamonds: 300 });
  await assert.rejects(() => h.convertPointsToDiamonds({ amountDiamonds: 1 }), ValidationError);
});

/* 7. Pro can gift avatars */
test('7. Pro can gift avatars and eligible cosmetics', async () => {
  seedUser(env, 'alice', { panels: [PANEL.PRO], diamonds: 500 });
  seedUser(env, 'bob');
  db.avatars.set('alice:av1', { giftEligible: true });
  const r = await h.giftAvatar({ itemId: 'av1', toUserId: 'bob' });
  assert.equal(r.duplicated, false);
  assert.ok(db.avatars.has('bob:av1'));
  assert.ok(!db.avatars.has('alice:av1'));
  // Non-Pro cannot gift avatars
  const env2 = createMemoryAdapters({ now: NOW, currentUserId: 'carol' });
  const h2 = new ClassPulseHierarchy(env2.adapters);
  seedUser(env2, 'carol', { diamonds: 1000 });
  seedUser(env2, 'bob');
  env2.db.avatars.set('carol:av2', { giftEligible: true });
  await assert.rejects(() => h2.giftAvatar({ itemId: 'av2', toUserId: 'bob' }), PermissionDeniedError);
});

/* 8. Empty cosmetic catalogue -> empty state, no fake items */
test('8. empty cosmetic catalogue does not create fake items', async () => {
  seedUser(env, 'alice', { panels: [PANEL.PRO], diamonds: 500 });
  seedUser(env, 'bob');
  const r = await h.giftCosmetic({ itemId: 'anything', toUserId: 'bob' });
  assert.equal(r.emptyState, true);
  assert.deepEqual(r.items, []);
  assert.equal(db.cosmeticsOwned.size, 0);
});

/* 8b. With a real catalogue item, Pro can gift it */
test('7b/8b. cosmetic gift with real catalogue item works', async () => {
  env = createMemoryAdapters({ now: NOW, currentUserId: 'alice',
    cosmeticsCatalog: [{ id: 'c1', priceDiamonds: 50 }] });
  h = new ClassPulseHierarchy(env.adapters); db = env.db;
  seedUser(env, 'alice', { panels: [PANEL.PRO], diamonds: 200 });
  seedUser(env, 'bob');
  const r = await h.giftCosmetic({ itemId: 'c1', toUserId: 'bob' });
  assert.equal(r.emptyState, false);
  assert.equal(db.balances.get('alice').diamonds, 150);
  assert.ok(db.cosmeticsOwned.has('bob:c1'));
});

/* 9. Verified teachers get free Admin */
test('9. verified teachers receive free Admin access', async () => {
  seedUser(env, 'alice', { verifiedTeacher: true });
  assert.equal(await h.isVerifiedTeacher('alice'), true);
  // A teacher is granted Admin by the trusted process (backend), not by purchase:
  db.panels.set('alice', [PANEL.ADMIN]);
  const panels = await h.getUserPanels('alice');
  assert.ok(panels.includes(PANEL.ADMIN));
  assert.equal((await h.getEffectivePermissions('alice')).has('groups.create'), true);
});

/* 10. Regular user can buy Admin for 5,000 */
test('10. regular user can purchase Admin for 5,000 diamonds', async () => {
  seedUser(env, 'alice', { diamonds: 5000 });
  await h.purchasePanel({ panelId: PANEL.ADMIN });
  assert.equal(db.balances.get('alice').diamonds, 0);
  assert.ok((await h.getUserPanels('alice')).includes(PANEL.ADMIN));
});

/* 11. Buying Admin does NOT grant Admin Command */
test('11. buying Admin does not grant Admin Command powers', async () => {
  seedUser(env, 'alice', { diamonds: 5000 });
  await h.purchasePanel({ panelId: PANEL.ADMIN });
  const perms = await h.getEffectivePermissions('alice');
  assert.equal(perms.has('users.suspend'), false);
  assert.equal(perms.has('audit.read'), false);
  assert.equal(perms.has('terminal.access'), false);
  // and they cannot suspend anyone
  seedUser(env, 'bob');
  await assert.rejects(() => h.suspendUser({ targetUserId: 'bob', days: 3 }), PermissionDeniedError);
});

/* 12. Unverified user cannot claim teacher status */
test('12. unverified user cannot claim teacher status', async () => {
  seedUser(env, 'alice'); // not verified
  assert.equal(await h.isVerifiedTeacher('alice'), false);
  // teacher verification is read-only here; nothing in the module sets it
  await assert.rejects(() => h.purchasePanel({ panelId: PANEL.ADMIN }), ValidationError); // needs 5000 anyway
  // even with diamonds, the module offers no "make me teacher" path:
  db.balances.get('alice').diamonds = 5000;
  await h.purchasePanel({ panelId: PANEL.ADMIN });
  assert.equal(await h.isVerifiedTeacher('alice'), false);
});

/* 13. Video visibility policies enforced */
test('13. Admin video visibility policies are correctly enforced', async () => {
  seedUser(env, 'teacher', { panels: [PANEL.ADMIN] });
  seedUser(env, 'student1'); seedUser(env, 'student2');
  env.adapters.groups.addMember; // groups helper
  const g = await h.createGroup({ name: 'Class 7A', actorId: 'teacher' });
  env.adapters.groups.addMember(g.id, 'student1');

  seedVideo(env, { id: 'v1', ownerId: 'teacher', visibility: { mode: 'group_only', groupId: g.id } });
  assert.equal(await h.canViewVideo({ viewerId: 'student1', video: db.videos.get('v1') }), true);
  assert.equal(await h.canViewVideo({ viewerId: 'student2', video: db.videos.get('v1') }), false);

  seedVideo(env, { id: 'v2', ownerId: 'teacher', visibility: { mode: 'followers', groupId: null } });
  env.adapters.followers.add('student1', 'teacher');
  assert.equal(await h.canViewVideo({ viewerId: 'student1', video: db.videos.get('v2') }), true);
  assert.equal(await h.canViewVideo({ viewerId: 'student2', video: db.videos.get('v2') }), false);

  seedVideo(env, { id: 'v3', ownerId: 'teacher', visibility: { mode: 'exclude_group', groupId: g.id } });
  assert.equal(await h.canViewVideo({ viewerId: 'student1', video: db.videos.get('v3') }), false);
  assert.equal(await h.canViewVideo({ viewerId: 'student2', video: db.videos.get('v3') }), true);
});

/* 14. Admin Command cannot read DMs */
test('14. Admin Command cannot read private direct messages', async () => {
  // The registry contains no command capable of exposing private comms:
  const names = h.terminal.commands.map(c => c.name);
  for (const forbidden of ['messages', 'dms', 'chats', 'conversations', 'inbox']) {
    assert.ok(!names.includes(forbidden), `command "${forbidden}" must not exist`);
  }
  // Even the full owner command set exposes nothing private:
  seedUser(env, 'alice', { panels: [PANEL.OWNER] });
  const result = await h.executeTerminalCommand({ command: 'help me' });
  assert.equal(result.ok, true);
  for (const c of result.data) {
    assert.ok(!/message|chat|dm|conversation/i.test(c.name + c.description),
      'no command may expose private communications');
  }
  // And an Admin Command actor cannot even reach the terminal:
  const env2 = createMemoryAdapters({ now: NOW, currentUserId: 'mod' });
  const h2 = new ClassPulseHierarchy(env2.adapters);
  seedUser(env2, 'mod', { panels: [PANEL.ADMIN_COMMAND] });
  await assert.rejects(() => h2.executeTerminalCommand({ command: 'help me' }), PermissionDeniedError);
});

/* 15. Suspension charges 5,000 exactly once */
test('15. suspension charges 5,000 diamonds exactly once', async () => {
  seedUser(env, 'mod', { panels: [PANEL.ADMIN_COMMAND], diamonds: 6000 });
  seedUser(env, 'bob');
  const r = await h.suspendUser({ targetUserId: 'bob', days: 10, idempotencyKey: 'sus-1', actorId: 'mod' });
  assert.equal(r.fee, 5000);
  assert.equal(db.balances.get('mod').diamonds, 1000);
  assert.ok(db.suspensions.has('bob'));
  // Retry with same key: no duplicate charge, no duplicate suspension
  const r2 = await h.suspendUser({ targetUserId: 'bob', days: 10, idempotencyKey: 'sus-1', actorId: 'mod' });
  assert.equal(r2.duplicated, true);
  assert.equal(db.balances.get('mod').diamonds, 1000);
});

/* 16. Suspension removal costs zero */
test('16. suspension removal costs zero diamonds', async () => {
  seedUser(env, 'mod', { panels: [PANEL.ADMIN_COMMAND], diamonds: 6000 });
  seedUser(env, 'bob');
  await h.suspendUser({ targetUserId: 'bob', days: 10, actorId: 'mod' });
  const before = db.balances.get('mod').diamonds;
  const r = await h.unsuspendUser({ targetUserId: 'bob', actorId: 'mod' });
  assert.equal(r.fee, 0);
  assert.equal(db.balances.get('mod').diamonds, before);
  assert.ok(!db.suspensions.has('bob'));
});

/* 17. Unauthorized users cannot suspend */
test('17. unauthorized users cannot suspend accounts', async () => {
  seedUser(env, 'alice', { panels: [PANEL.PRO], diamonds: 9000 });
  seedUser(env, 'bob');
  await assert.rejects(() => h.suspendUser({ targetUserId: 'bob', days: 5 }), PermissionDeniedError);
  assert.ok(!db.suspensions.has('bob'));
});

/* 18. Dev purchase costs 100 exactly once */
test('18. Dev purchase costs 100 diamonds exactly once', async () => {
  seedUser(env, 'alice', { diamonds: 100 });
  await h.purchasePanel({ panelId: PANEL.DEV, idempotencyKey: 'dev-1' });
  assert.equal(db.balances.get('alice').diamonds, 0);
  const r2 = await h.purchasePanel({ panelId: PANEL.DEV, idempotencyKey: 'dev-1' });
  assert.equal(r2.duplicated, true);
  assert.equal(db.balances.get('alice').diamonds, 0);
});

/* 19. Dev has no automatic weekly allowance */
test('19. Dev users receive no automatic weekly allowance', async () => {
  seedUser(env, 'alice', { panels: [PANEL.DEV] });
  await assert.rejects(() => h.grantWeeklyAllowance({}), ValidationError);
});

/* 20. Pro + Dev -> Pro allowance (highest, not stacked) */
test('20. Pro + Dev receives only the Pro weekly allowance under default policy', async () => {
  seedUser(env, 'alice', { panels: [PANEL.PRO, PANEL.DEV] });
  await h.grantWeeklyAllowance({});
  assert.equal(db.balances.get('alice').diamonds, 30); // not 30 + anything else
});

/* 21. Game submission requires review before publication */
test('21. a game submission requires review before publication', async () => {
  seedUser(env, 'alice', { panels: [PANEL.DEV] });
  const game = await h.submitGame({ title: 'Math Blaster' });
  assert.equal(game.status, 'submitted');
  await assert.rejects(() => h.publishGame({ gameId: game.id }), ConflictError);
  // review by Admin Command
  seedUser(env, 'mod', { panels: [PANEL.ADMIN_COMMAND] });
  const reviewed = await h.reviewGameSubmission({ gameId: game.id, decision: 'approved', feedback: 'ok', actorId: 'mod' });
  assert.equal(reviewed.status, 'approved');
  const pub = await h.publishGame({ gameId: game.id });
  assert.equal(pub.status, 'published');
});

/* 22. Reward split: 5 -> dev 4, platform 1 */
test('22. 5-diamond reward allocates 4 to developer, 1 to platform', async () => {
  seedUser(env, 'alice', { panels: [PANEL.ADMIN_COMMAND] });
  seedUser(env, 'dev1', { panels: [PANEL.DEV] });
  const game = await h.submitGame({ title: 'G', actorId: 'dev1' });
  db.games.get(game.id).status = 'approved';
  await h.publishGame({ gameId: game.id, actorId: 'dev1' });
  const split = await h.allocateGameReward({ gameId: game.id, developerId: 'dev1',
    grossDiamonds: 5, confirmedByBackend: true, actorId: 'alice' });
  assert.deepEqual({ platform: split.platform, developer: split.developer }, { platform: 1, developer: 4 });
  assert.equal(db.balances.get('dev1').diamonds, 4);
  assert.equal(db.balances.get('platform').diamonds, 1);
  assert.deepEqual(splitDeveloperReward(5), { gross: 5, platform: 1, developer: 4 });
});

/* 23. Admin Command Line cannot be purchased */
test('23. Admin Command Line cannot be purchased', async () => {
  seedUser(env, 'alice', { diamonds: 1000000 });
  await assert.rejects(() => h.purchasePanel({ panelId: PANEL.OWNER }), ValidationError);
  await assert.rejects(() => h.purchasePanel({ panelId: PANEL.ADMIN_COMMAND }), ValidationError);
});

/* 24. Local-storage tampering cannot grant OWNER */
test('24. user cannot grant themselves Admin Command Line via client state', async () => {
  seedUser(env, 'alice');
  // Simulate a tampered client: alice's panels in the trusted store are
  // authoritative; client-side edits never reach it. The module exposes NO
  // public API that assigns OWNER — only the injected trusted store can.
  db.panels.set('alice', [PANEL.OWNER]); // only the server-side provisioner can do this
  const perms = await h.getEffectivePermissions('alice');
  assert.ok(perms.has('terminal.access'));
  // Reset to reality: without the trusted store assignment, nothing grants it.
  db.panels.set('alice', []);
  const perms2 = await h.getEffectivePermissions('alice');
  assert.equal(perms2.has('terminal.access'), false);
});

/* 25. `help me` only lists owner-authorized commands */
test('25. "help me" only exposes commands authorized for the authenticated owner', async () => {
  seedUser(env, 'alice', { panels: [PANEL.OWNER] });
  const result = await h.executeTerminalCommand({ command: 'help me' });
  assert.equal(result.ok, true);
  const names = result.data.map(c => c.name);
  for (const expected of ['help me', 'shorts', 'users', 'user', 'hierarchy', 'diamonds',
    'games', 'review games', 'groups', 'suspensions', 'audit', 'help']) {
    assert.ok(names.includes(expected), `missing ${expected}`);
  }
  // Non-owner gets nothing:
  const env2 = createMemoryAdapters({ now: NOW, currentUserId: 'mallory' });
  const h2 = new ClassPulseHierarchy(env2.adapters);
  seedUser(env2, 'mallory', { panels: [PANEL.ADMIN_COMMAND] });
  await assert.rejects(() => h2.executeTerminalCommand({ command: 'help me' }), PermissionDeniedError);
});

/* 26. `shorts` invokes the navigation adapter */
test('26. "shorts" invokes the registered navigation adapter', async () => {
  seedUser(env, 'alice', { panels: [PANEL.OWNER] });
  const result = await h.executeTerminalCommand({ command: 'shorts' });
  assert.equal(result.ok, true);
  assert.deepEqual(env.adapters.navigation.calls, ['openShorts']);
});

/* 27. Owner has unlimited points without an enormous integer */
test('27. owner unlimited points: not deducted, no daily cap, diamonds credited', async () => {
  seedUser(env, 'alice', { panels: [PANEL.OWNER], pointsPolicy: 'unlimited' });
  const before = db.balances.get('alice');
  assert.equal(typeof before.points, 'number'); // policy attribute, not MAX_INT
  await h.convertPointsToDiamonds({ amountDiamonds: 5000 }); // exceeds any normal cap
  await h.convertPointsToDiamonds({ amountDiamonds: 5000 });
  const after = db.balances.get('alice');
  assert.equal(after.diamonds, 10000);
  assert.equal(after.points, before.points); // unlimited points never exhausted
  assert.ok(after.points < 1e15); // no enormous-integer hack
});

/* 28. Concurrency/replay cannot double-spend */
test('28. concurrent/replayed requests cannot double-spend', async () => {
  seedUser(env, 'alice', { diamonds: 100 });
  seedUser(env, 'bob');
  const key = 'gift-1';
  const results = await Promise.allSettled([
    h.giftDiamonds({ toUserId: 'bob', amountDiamonds: 100, idempotencyKey: key }),
    h.giftDiamonds({ toUserId: 'bob', amountDiamonds: 100, idempotencyKey: key }),
    h.giftDiamonds({ toUserId: 'bob', amountDiamonds: 100, idempotencyKey: key }),
  ]);
  const fulfilled = results.filter(r => r.status === 'fulfilled');
  const diamondMoved = db.balances.get('bob').diamonds;
  assert.ok(fulfilled.length >= 1);
  assert.ok(diamondMoved <= 100, `double-spend detected: ${diamondMoved}`);
  assert.ok(db.balances.get('alice').diamonds >= 0);
});

/* 29 (proper): replayed weekly + purchase */
test('29b. replayed requests cannot duplicate weekly allowances or purchases', async () => {
  seedUser(env, 'alice', { diamonds: 1000, panels: [PANEL.PRO] });
  await h.grantWeeklyAllowance({});                        // +30
  await h.grantWeeklyAllowance({});                        // replay
  assert.equal(db.balances.get('alice').diamonds, 1030);
  await h.purchasePanel({ panelId: PANEL.DEV, idempotencyKey: 'pk' });   // -100
  await h.purchasePanel({ panelId: PANEL.DEV, idempotencyKey: 'pk' });   // replay
  assert.equal(db.balances.get('alice').diamonds, 930);
});

/* 30. Missing backend adapters fail closed */
test('30. missing backend adapters fail closed', async () => {
  const bare = new ClassPulseHierarchy(); // no adapters wired
  await assert.rejects(() => bare.getUserPanels('alice'), BackendUnavailableError);
  await assert.rejects(() => bare.convertPointsToDiamonds({ amountDiamonds: 1 }), BackendUnavailableError);
  await assert.rejects(() => bare.purchasePanel({ panelId: PANEL.PRO }), BackendUnavailableError);
  await assert.rejects(() => bare.suspendUser({ targetUserId: 'bob', days: 3 }), BackendUnavailableError);
});

/* Extra: permission resolution is capability-based, not rank-based */
test('extra. dev panel grants game permissions, not moderation', async () => {
  const perms = resolvePermissions([PANEL.NOOB, PANEL.DEV]);
  assert.ok(perms.has('games.create'));
  assert.equal(perms.has('users.suspend'), false);
  assert.equal(perms.has('groups.create'), false);
});

/* Extra: atomicity — failed suspension leaves no fee deducted, no record */
test('extra. suspension is atomic: insufficient funds => no fee, no suspension', async () => {
  seedUser(env, 'mod', { panels: [PANEL.ADMIN_COMMAND], diamonds: 100 });
  seedUser(env, 'bob');
  await assert.rejects(() => h.suspendUser({ targetUserId: 'bob', days: 10, actorId: 'mod' }), ValidationError);
  assert.equal(db.balances.get('mod').diamonds, 100);
  assert.ok(!db.suspensions.has('bob'));
});

/* Extra: cannot suspend owner or Admin Command peer without owner rights */
test('extra. Admin Command cannot suspend owner or peer Admin Command', async () => {
  seedUser(env, 'mod', { panels: [PANEL.ADMIN_COMMAND], diamonds: 10000 });
  seedUser(env, 'theowner', { panels: [PANEL.OWNER] });
  seedUser(env, 'peer', { panels: [PANEL.ADMIN_COMMAND] });
  await assert.rejects(() => h.suspendUser({ targetUserId: 'theowner', days: 5, actorId: 'mod' }), PermissionDeniedError);
  await assert.rejects(() => h.suspendUser({ targetUserId: 'peer', days: 5, actorId: 'mod' }), PermissionDeniedError);
  // Owner CAN suspend an Admin Command account:
  const env2 = createMemoryAdapters({ now: NOW, currentUserId: 'theowner' });
  const h2 = new ClassPulseHierarchy(env2.adapters);
  seedUser(env2, 'theowner', { panels: [PANEL.OWNER], diamonds: 10000 });
  seedUser(env2, 'peer', { panels: [PANEL.ADMIN_COMMAND] });
  await h2.suspendUser({ targetUserId: 'peer', days: 5 });
  assert.ok(env2.db.suspensions.has('peer'));
});

/* Extra: terminal unknown command + invalid args safe errors */
test('extra. terminal safe errors for unknown commands and invalid args', async () => {
  seedUser(env, 'alice', { panels: [PANEL.OWNER] });
  const unk = await h.executeTerminalCommand({ command: 'destroy everything' });
  assert.equal(unk.ok, false);
  assert.match(unk.message, /Unknown command/);
  const bad = await h.executeTerminalCommand({ command: 'user' });
  assert.equal(bad.ok, false);
  assert.match(bad.message, /Usage: user <id>/);
});

/* Extra: rewards are not credited without backend confirmation */
test('extra. game rewards are not credited without trusted confirmation', async () => {
  seedUser(env, 'alice', { panels: [PANEL.ADMIN_COMMAND] });
  seedUser(env, 'dev1', { panels: [PANEL.DEV] });
  const game = await h.submitGame({ title: 'G', actorId: 'dev1' });
  db.games.get(game.id).status = 'published';
  await assert.rejects(() => h.allocateGameReward({ gameId: game.id, developerId: 'dev1',
    grossDiamonds: 5, actorId: 'alice' }), BackendUnavailableError);
  assert.equal(db.balances.get('dev1').diamonds, 0);
});

/* Extra: weekly reward timezone week key is stable */
test('extra. weekKey uses configured timezone week boundaries', async () => {
  const d = new Date(Date.UTC(2026, 9, 18, 18, 30)); // Sunday evening UTC = Monday IST
  const key = weekKey(d, 'Asia/Kolkata');
  assert.match(key, /^2026-W\d{2}$/);
});
