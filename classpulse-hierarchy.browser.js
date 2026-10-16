/**
 * ============================================================================
 * classpulse-hierarchy.browser.js
 * DEV / DEMO ADAPTERS for the browser-only ClassPulse prototype.
 * ----------------------------------------------------------------------------
 * SECURITY — READ THIS BEFORE USING IT ANYWHERE REAL:
 * Every guarantee in classpulse-hierarchy.js (server-verified panels, trusted
 * balances, un-forgeable audit) assumes the adapters run on a SERVER the user
 * cannot touch. This file runs them in the browser and snapshots them to
 * localStorage, which means the "trusted backend" is fully under the user's
 * control: anyone can open devtools and grant themselves Owner.
 *
 * That is acceptable ONLY for the local demo build. Do not ship this. Swap in
 * real server adapters (same interface) before this ever faces students.
 *
 * What it does: builds the in-memory adapters and snapshots them to
 * localStorage after every mutating call, so the demo survives a reload.
 * ============================================================================
 */

import { createMemoryAdapters } from './classpulse-hierarchy.memory.js';

export const HIERARCHY_STORAGE_KEY = 'classpulse.hierarchy.v1';

/** Map-backed tables inside the memory adapter's db. */
const MAP_FIELDS = [
  'users', 'panels', 'balances', 'ledger', 'idemIndex', 'conversions',
  'weeklyClaims', 'suspensions', 'games', 'groups', 'followers', 'avatars',
  'cosmeticsOwned', 'videos',
];

/** Services that mutate db. Everything else is read-only and skipped. */
const PERSISTED_SERVICES = ['store', 'tx', 'groups', 'followers', 'audit'];

/** Sets do not survive JSON, so flatten them on the way out. */
const replacer = (key, value) => (value instanceof Set ? [...value] : value);

function serialize(db) {
  const out = { v: 1 };
  for (const field of MAP_FIELDS) {
    const table = db[field];
    out[field] = table instanceof Map ? [...table.entries()] : [];
  }
  out.audit = Array.isArray(db.audit) ? db.audit.slice(-500) : [];
  return JSON.parse(JSON.stringify(out, replacer));
}

function reviveDates(db) {
  for (const user of db.users.values()) {
    if (user && typeof user.createdAt === 'string') user.createdAt = new Date(user.createdAt);
  }
  for (const entry of db.audit) {
    if (entry && typeof entry.at === 'string') entry.at = new Date(entry.at);
  }
}

function hydrate(db, snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return false;
  for (const field of MAP_FIELDS) {
    const rows = snapshot[field];
    if (!Array.isArray(rows) || !(db[field] instanceof Map)) continue;
    db[field] = new Map(rows);
  }
  if (Array.isArray(snapshot.audit)) db.audit = snapshot.audit;
  // groups.members was a Set before serialisation
  for (const group of db.groups.values()) {
    if (group && Array.isArray(group.members)) group.members = new Set(group.members);
  }
  reviveDates(db);
  return true;
}

/** Idempotent: never clobbers an existing user's panels or balance. */
export function ensureHierarchyUser(db, { id, verifiedTeacher = false, panels = [], points = 0, diamonds = 0 }) {
  if (!id) return null;
  if (!db.users.has(id)) {
    db.users.set(id, { id, status: 'active', createdAt: new Date(), verifiedTeacher: !!verifiedTeacher });
  }
  if (!db.panels.has(id)) db.panels.set(id, [...panels]);
  if (!db.balances.has(id)) db.balances.set(id, { diamonds, points, pointsPolicy: 'standard' });
  return id;
}

function safeStorage(injected) {
  if (injected) return injected;
  try {
    const ls = globalThis.localStorage;
    if (ls) { ls.getItem(HIERARCHY_STORAGE_KEY); return ls; }   // touch it: may throw in private mode
  } catch (_) { /* unavailable */ }
  return null;
}

/**
 * @param {object} [options]
 * @param {object} [options.storage]  localStorage-compatible store (defaults to localStorage)
 * @param {string} [options.storageKey]
 * @param {Array}  [options.users]    users to seed on first sight
 * @param {object} [options.seed]     extra seed for the memory adapters
 * @param {boolean}[options.liveClock] use the real clock (default true)
 */
export function createBrowserAdapters(options = {}) {
  const { users = [], seed = {}, liveClock = true } = options;
  const storageKey = options.storageKey || HIERARCHY_STORAGE_KEY;
  const storage = safeStorage(options.storage);

  const memorySeed = { ...seed, currentUserId: null, cosmeticsCatalog: seed.cosmeticsCatalog || [] };
  const { adapters, db } = createMemoryAdapters(memorySeed);

  let restored = false;
  if (storage) {
    try {
      const raw = storage.getItem(storageKey);
      if (raw) restored = hydrate(db, JSON.parse(raw));
    } catch (_) { restored = false; }
  }
  for (const user of users) ensureHierarchyUser(db, user);

  if (liveClock) {
    adapters.clock = { timeZone: seed.timeZone || 'Asia/Kolkata', now: async () => new Date() };
  }

  let inTransaction = 0;
  function save() {
    if (!storage) return false;
    try { storage.setItem(storageKey, JSON.stringify(serialize(db), replacer)); return true; }
    catch (_) { return false; }
  }

  // Snapshot after each mutating call. Calls made *inside* tx.run() are
  // suppressed: persisting mid-transaction could store a state that the
  // transaction then rolls back. The tx wrapper saves once, on the way out.
  for (const service of PERSISTED_SERVICES) {
    const target = adapters[service];
    if (!target) continue;
    for (const [name, fn] of Object.entries(target)) {
      if (typeof fn !== 'function') continue;
      target[name] = async (...args) => {
        const isTx = service === 'tx';
        if (isTx) inTransaction += 1;
        try {
          const result = await fn.apply(target, args);
          if (isTx) { inTransaction -= 1; save(); } else if (inTransaction === 0) save();
          return result;
        } catch (err) {
          if (isTx) { inTransaction -= 1; save(); }
          throw err;
        }
      };
    }
  }

  return {
    adapters, db,
    restoredFromStorage: restored,
    /** Point the auth adapter at the app's logged-in user. */
    setCurrentUser(id) { memorySeed.currentUserId = id || null; },
    save,
    snapshot() { return serialize(db); },
    reset() {
      if (!storage) return;
      try { storage.removeItem(storageKey); } catch (_) { /* ignore */ }
    },
  };
}
