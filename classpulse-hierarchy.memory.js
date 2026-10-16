/**
 * classpulse-hierarchy.memory.js
 * In-memory trusted backend double for TESTS and local development ONLY.
 * Implements atomic transactions, idempotency, balances, panels, suspensions,
 * games, groups, followers, cosmetics and audit — fail-closed where the real
 * adapters would be. DO NOT use in production; wire real server adapters.
 */

import { BackendUnavailableError, ConflictError, NotFoundError, ValidationError } from './classpulse-hierarchy.js';

export function createMemoryAdapters(seed = {}) {
  const db = {
    users: new Map(),      // id -> { id, status, createdAt, verifiedTeacher }
    panels: new Map(),     // id -> [panelIds] (noob implicit)
    balances: new Map(),   // id -> { diamonds, points, pointsPolicy }
    ledger: new Map(),     // transactionId -> entry
    idemIndex: new Map(),  // idempotencyKey -> transactionId
    conversions: new Map(),// `${user}:${day}` -> amount
    weeklyClaims: new Map(),// `${user}:${week}` -> transactionId
    suspensions: new Map(),// userId -> record
    games: new Map(),
    groups: new Map(),     // id -> { id, name, ownerId, memberCount, members:Set }
    followers: new Map(),  // `${follower}:${owner}` -> bool
    avatars: new Map(),    // `${user}:${avatarId}` -> { giftEligible }
    cosmeticsOwned: new Map(), // `${user}:${itemId}` -> true
    cosmeticsCatalog: seed.cosmeticsCatalog || [],
    audit: [],
    videos: new Map(),
  };

  function bal(id) {
    if (!db.balances.has(id)) db.balances.set(id, { diamonds: 0, points: 0, pointsPolicy: 'standard' });
    return db.balances.get(id);
  }

  const adapters = {
    auth: {
      getAuthenticatedUserId: async () => seed.currentUserId ?? null,
      isVerifiedTeacher: async (uid) => !!db.users.get(uid)?.verifiedTeacher,
    },

    store: {
      getUser: async (id) => db.users.get(id) || null,
      listUsers: async () => [...db.users.values()].map(u =>
        ({ id: u.id, status: u.status, panels: db.panels.get(u.id) || [] })),
      getUserPanels: async (id) => db.panels.get(id) || [],
      setUserPanels: async (id, panels) => { db.panels.set(id, [...panels]); },
      getBalance: async (id) => bal(id),
      applyLedger: async (accountId, entry, deltas) => {
        const b = bal(accountId);
        const nd = b.diamonds + (deltas.diamondsDelta || 0);
        const np = b.points + (deltas.pointsDelta || 0);
        if (nd < 0) throw new ValidationError('Negative balance prevented.');
        if (np < 0) throw new ValidationError('Negative points prevented.');
        b.diamonds = nd; b.points = np;
        db.ledger.set(entry.transactionId, { ...entry, accountId });
        db.idemIndex.set(entry.idempotencyKey, entry.transactionId);
      },
      findLedgerByIdempotencyKey: async (k) => db.idemIndex.has(k)
        ? db.ledger.get(db.idemIndex.get(k)) : null,
      getConversionUsage: async (userId, day) => db.conversions.get(`${userId}:${day}`) || 0,
      recordConversionUsage: async (userId, day, amount) => {
        db.conversions.set(`${userId}:${day}`, (db.conversions.get(`${userId}:${day}`) || 0) + amount);
      },
      getWeeklyClaim: async (userId, week) => db.weeklyClaims.get(`${userId}:${week}`) || null,
      recordWeeklyClaim: async (userId, week, txnId) => { db.weeklyClaims.set(`${userId}:${week}`, txnId); },
      isSuspended: async (id) => db.suspensions.has(id),
      createSuspension: async (rec) => { db.suspensions.set(rec.targetId, rec); return rec; },
      removeSuspension: async (id) => db.suspensions.delete(id),
      getSuspensions: async () => [...db.suspensions.values()],
      saveGame: async (g) => { db.games.set(g.id, { ...g }); return db.games.get(g.id); },
      getGame: async (id) => db.games.get(id) || null,
      listGames: async () => [...db.games.values()],
      getVideo: async (id) => db.videos.get(id) || null,
      updateVideoVisibility: async (id, vis) => {
        const v = db.videos.get(id); if (!v) return null;
        v.visibility = vis; return v;
      },
      getLedgerSummary: async (id) => [...db.ledger.values()]
        .filter(e => e.srcAccount === id || e.dstAccount === id)
        .map(e => ({ type: e.type, amount: e.amount, at: e.at, status: e.status })),
      getAuditEvents: async () => [...db.audit],
      getOwnedAvatar: async (userId, avatarId) => db.avatars.get(`${userId}:${avatarId}`) || null,
      transferAvatar: async (from, to, avatarId) => {
        db.avatars.delete(`${from}:${avatarId}`);
        db.avatars.set(`${to}:${avatarId}`, { giftEligible: true });
      },
      grantCosmetic: async (userId, itemId) => { db.cosmeticsOwned.set(`${userId}:${itemId}`, true); },
      getPolicy: async () => ({}),
    },

    // Atomic transaction unit: executes the callback; any throw rolls back by
    // checkpoint/restore (single-threaded simulation of BEGIN/COMMIT/ROLLBACK).
    tx: {
      run: async (fn) => {
        const snapshot = structuredClone({
          users: [...db.users], panels: [...db.panels], balances: [...db.balances],
          ledger: [...db.ledger], idemIndex: [...db.idemIndex],
          conversions: [...db.conversions], weeklyClaims: [...db.weeklyClaims],
          suspensions: [...db.suspensions], games: [...db.games],
          avatars: [...db.avatars], cosmeticsOwned: [...db.cosmeticsOwned],
          audit: [...db.audit],
        });
        const txStore = Object.fromEntries(Object.entries(adapters.store).map(([k, v]) => [k, v]));
        try {
          return await fn(txStore);
        } catch (err) {
          // rollback
          db.users = new Map(snapshot.users); db.panels = new Map(snapshot.panels);
          db.balances = new Map(snapshot.balances); db.ledger = new Map(snapshot.ledger);
          db.idemIndex = new Map(snapshot.idemIndex); db.conversions = new Map(snapshot.conversions);
          db.weeklyClaims = new Map(snapshot.weeklyClaims); db.suspensions = new Map(snapshot.suspensions);
          db.games = new Map(snapshot.games); db.avatars = new Map(snapshot.avatars);
          db.cosmeticsOwned = new Map(snapshot.cosmeticsOwned); db.audit = snapshot.audit;
          throw err;
        }
      },
    },

    clock: {
      timeZone: seed.timeZone || 'Asia/Kolkata',
      now: async () => new Date(seed.now ?? Date.UTC(2026, 9, 16, 10, 0, 0)),
    },

    navigation: {
      openShorts: async () => { adapters.navigation.calls.push('openShorts');
        return true; },
      calls: [],
    },

    groups: {
      createGroup: async ({ name, ownerId }) => {
        const id = `grp_${db.groups.size + 1}`;
        db.groups.set(id, { id, name, ownerId, memberCount: 1, members: new Set([ownerId]) });
        return db.groups.get(id);
      },
      getGroup: async (id) => db.groups.get(id) || null,
      isMember: async (gid, uid) => !!db.groups.get(gid)?.members.has(uid),
      listGroups: async () => [...db.groups.values()]
        .map(g => ({ id: g.id, name: g.name, ownerId: g.ownerId, memberCount: g.memberCount })),
      addMember: (gid, uid) => { const g = db.groups.get(gid); g.members.add(uid); g.memberCount = g.members.size; },
    },

    followers: {
      isFollower: async (followerId, ownerId) => !!db.followers.get(`${followerId}:${ownerId}`),
      add: (followerId, ownerId) => db.followers.set(`${followerId}:${ownerId}`, true),
    },

    cosmetics: {
      listItems: async () => db.cosmeticsCatalog,
    },

    audit: {
      log: async (event) => { db.audit.push(event); },
    },
  };

  return { adapters, db };
}

/** Convenience: seed a user and return helpers. */
export function seedUser({ db }, id, { diamonds = 0, points = 0, panels = [],
                           verifiedTeacher = false, pointsPolicy = 'standard' } = {}) {
  db.users.set(id, { id, status: 'active', createdAt: new Date(), verifiedTeacher });
  db.panels.set(id, panels);
  db.balances.set(id, { diamonds, points, pointsPolicy });
  return id;
}

export function seedVideo({ db }, { id, ownerId, visibility }) {
  db.videos.set(id, { id, ownerId, visibility });
}
