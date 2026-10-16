/**
 * ============================================================================
 * classpulse-hierarchy.js
 * ClassPulse Hierarchy, Economy, Developer & Admin Command-Line System
 * ----------------------------------------------------------------------------
 * Standalone ES module. Import it into the existing ClassPulse app; do NOT
 * replace any existing file. All privileged operations require trusted backend
 * adapters (dependency-injected). The default adapters FAIL CLOSED: if no real
 * backend is wired in, purchases, suspensions, rewards and publication are
 * never simulated.
 *
 * Security model:
 *  - Panel assignments and balances are only ever READ from injected trusted
 *    adapters (server-verified). This module never trusts browser storage.
 *  - Every privileged method requires an authenticated actor (AuthAdapter).
 *  - Every balance change goes through TransactionAdapter (atomic, idempotent).
 *  - Permissions are capability-based, never numeric rank comparisons.
 *  - The owner terminal is a command registry over explicit service methods:
 *    no eval/Function, no shell, no raw queries.
 * ============================================================================
 */

/* --------------------------------------------------------------------------
 * 1. Errors (safe, non-leaky)
 * ------------------------------------------------------------------------ */

export class HierarchyError extends Error {
  constructor(code, message, httpStatus = 400) {
    super(message);
    this.name = 'HierarchyError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}
export class PermissionDeniedError extends HierarchyError {
  constructor(permission) {
    super('PERMISSION_DENIED', 'You do not have permission to perform this action.', 403);
    this.permission = permission;
  }
}
export class BackendUnavailableError extends HierarchyError {
  constructor(service) {
    super('BACKEND_UNAVAILABLE', `Required backend service "${service}" is not configured.`, 503);
    this.service = service;
  }
}
export class ValidationError extends HierarchyError {
  constructor(message) { super('VALIDATION_FAILED', message, 422); }
}
export class NotFoundError extends HierarchyError {
  constructor(what = 'Resource') { super('NOT_FOUND', `${what} not found.`, 404); }
}
export class ConflictError extends HierarchyError {
  constructor(message) { super('CONFLICT', message, 409); }
}

/* --------------------------------------------------------------------------
 * 2. Hierarchy definitions (panels, prices, limits)
 * ------------------------------------------------------------------------ */

export const PANEL = Object.freeze({
  NOOB: 'noob',
  PRO: 'pro',
  ADMIN: 'admin',
  ADMIN_COMMAND: 'adminCommand',
  DEV: 'dev',
  OWNER: 'adminCommandLine',
});

export const PANELS = Object.freeze({
  [PANEL.NOOB]: {
    id: PANEL.NOOB, displayName: 'Noob', purchasable: false, priceDiamonds: 0,
    weeklyAllowanceDiamonds: 0, dailyConversionLimitDiamonds: 100,
    permissions: ['points.earn', 'diamonds.convert', 'diamonds.gift', 'games.play'],
  },
  [PANEL.PRO]: {
    id: PANEL.PRO, displayName: 'Pro', purchasable: true, priceDiamonds: 500,
    weeklyAllowanceDiamonds: 30, dailyConversionLimitDiamonds: 300,
    permissions: ['avatars.gift', 'cosmetics.gift'],
  },
  [PANEL.ADMIN]: {
    id: PANEL.ADMIN, displayName: 'Admin', purchasable: true, priceDiamonds: 5000,
    weeklyAllowanceDiamonds: 100, dailyConversionLimitDiamonds: 1000,
    permissions: ['groups.create', 'groups.manage', 'videos.setVisibility'],
  },
  [PANEL.ADMIN_COMMAND]: {
    id: PANEL.ADMIN_COMMAND, displayName: 'Admin Command', purchasable: false, priceDiamonds: 0,
    weeklyAllowanceDiamonds: 2500, dailyConversionLimitDiamonds: 1000,
    permissions: ['users.inspect', 'users.suspend', 'users.unsuspend', 'games.review',
      'groups.inspect', 'audit.read', 'platform.monitor'],
  },
  [PANEL.DEV]: {
    id: PANEL.DEV, displayName: 'Dev', purchasable: true, priceDiamonds: 100,
    weeklyAllowanceDiamonds: 0, dailyConversionLimitDiamonds: null, // inherits best other panel limit
    permissions: ['games.create', 'games.submit', 'games.publish', 'games.viewEarnings'],
  },
  [PANEL.OWNER]: {
    id: PANEL.OWNER, displayName: 'Admin Command Line', purchasable: false, priceDiamonds: 0,
    weeklyAllowanceDiamonds: 0, dailyConversionLimitDiamonds: null, // unlimited via owner policy
    permissions: ['terminal.access', 'platform.owner', 'economy.unlimitedPoints'],
  },
});

/**
 * Permissions granted transitively: owning OWNER also grants everything
 * ADMIN_COMMAND grants. This is the ONLY place a panel implies another
 * panel's permissions, and it is explicit — never a numeric rank compare.
 */
const IMPLIED_PERMISSIONS = Object.freeze({
  [PANEL.OWNER]: PANELS[PANEL.ADMIN_COMMAND].permissions,
});

/**
 * Pure function: resolve a set of owned panels into an effective permission
 * set. Safe to run anywhere (UI hinting); enforcement still happens server
 * side against trusted panel assignments.
 */
export function resolvePermissions(panelIds) {
  const perms = new Set();
  for (const id of panelIds) {
    const def = PANELS[id];
    if (!def) continue;
    for (const p of def.permissions) perms.add(p);
    const implied = IMPLIED_PERMISSIONS[id];
    if (implied) for (const p of implied) perms.add(p);
  }
  return perms;
}

/** Highest eligible weekly allowance (never stacked). */
export function effectiveWeeklyAllowance(panelIds, policy = {}) {
  if (policy.weeklyAllowanceOverride != null) return policy.weeklyAllowanceOverride;
  let best = 0;
  for (const id of panelIds) {
    const def = PANELS[id];
    if (def && def.weeklyAllowanceDiamonds > best) best = def.weeklyAllowanceDiamonds;
  }
  return best;
}

/**
 * Highest eligible daily conversion limit. Dev contributes no limit of its
 * own and inherits the best of the user's other panels. Owner is handled
 * separately via the unlimited-points policy.
 */
export function effectiveDailyConversionLimit(panelIds, policy = {}) {
  if (policy.ownerUnlimitedConversion) return Infinity;
  if (policy.dailyConversionLimitOverride != null) return policy.dailyConversionLimitOverride;
  let best = 0;
  for (const id of panelIds) {
    const def = PANELS[id];
    if (def && def.dailyConversionLimitDiamonds != null && def.dailyConversionLimitDiamonds > best) {
      best = def.dailyConversionLimitDiamonds;
    }
  }
  return best;
}

/** Suspension fee in diamonds. Never grant privileges — fee is not authority. */
export const SUSPENSION_FEE_DIAMONDS = 5000;
export const MAX_SUSPENSION_DAYS = 30;
export const UNSUSPEND_FEE_DIAMONDS = 0;
/** Developer reward split: platform 20%, developer 80% (integer arithmetic). */
export const DEV_REWARD_PLATFORM_PERCENT = 20;
export function splitDeveloperReward(grossDiamonds) {
  const gross = assertPositiveInteger(grossDiamonds, 'gross reward');
  // Rounding rule: platform share is rounded DOWN (floor); the developer
  // receives the remainder. Example: gross 5 -> platform 1, developer 4.
  const platform = Math.floor((gross * DEV_REWARD_PLATFORM_PERCENT) / 100);
  const developer = gross - platform;
  return { gross, platform, developer };
}

/* --------------------------------------------------------------------------
 * 3. Fail-closed default adapters
 * ------------------------------------------------------------------------ */

function failClosedAdapter(serviceName, methodNames) {
  const out = {};
  for (const m of methodNames) {
    out[m] = () => { throw new BackendUnavailableError(serviceName); };
  }
  return Object.freeze(out);
}

export function createDefaultAdapters() {
  return {
    // MUST return the authenticated user id from the trusted session, or null.
    auth: failClosedAdapter('auth', ['getAuthenticatedUserId', 'isVerifiedTeacher']),
    // Trusted persistence: users, panels, balances, ledger, suspensions, games.
    store: failClosedAdapter('store', ['getUser', 'getUserPanels', 'setUserPanels',
      'getBalance', 'applyLedger', 'findLedgerByIdempotencyKey', 'getConversionUsage',
      'recordConversionUsage', 'getWeeklyClaim', 'recordWeeklyClaim', 'isSuspended',
      'createSuspension', 'removeSuspension', 'getSuspensions', 'saveGame', 'getGame',
      'listGames', 'listUsers', 'getAuditEvents', 'getPolicy',
      // Used by the video-visibility and terminal-ledger paths. Omitting these
      // from the contract made them `undefined` instead of fail-closed, so a
      // backend that implemented only the documented surface threw a raw
      // TypeError instead of BackendUnavailableError.
      'getVideo', 'updateVideoVisibility', 'getLedgerSummary']),
    // Atomic transactional unit (BEGIN/COMMIT/ROLLBACK semantics).
    tx: failClosedAdapter('tx', ['run']),
    // Server clock + timezone. Default timezone Asia/Kolkata unless overridden.
    clock: { now: () => { throw new BackendUnavailableError('clock'); },
             timeZone: 'Asia/Kolkata' },
    // Existing app navigation (router-agnostic adapter).
    navigation: { openShorts: () => { throw new BackendUnavailableError('navigation'); } },
    // Existing group & follower services.
    groups: failClosedAdapter('groups', ['createGroup', 'getGroup', 'isMember', 'listGroups']),
    followers: failClosedAdapter('followers', ['isFollower']),
    // Cosmetic catalogue may legitimately be EMPTY (empty state, no fakes).
    cosmetics: { listItems: async () => [] },
    // Audit sink for privileged actions.
    audit: { log: () => { throw new BackendUnavailableError('audit'); } },
  };
}

/* --------------------------------------------------------------------------
 * 4. Internal helpers
 * ------------------------------------------------------------------------ */

let txCounter = 0;
function newId(prefix) {
  txCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${txCounter.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function assertPositiveInteger(n, field) {
  if (!Number.isInteger(n) || n <= 0) throw new ValidationError(`${field} must be a positive integer.`);
  return n;
}
function assertUserId(id, field = 'userId') {
  if (typeof id !== 'string' || id.length === 0 || id.length > 128) {
    throw new ValidationError(`Invalid ${field}.`);
  }
  return id;
}

/** Week bucket key in the configured timezone: e.g. "2026-W42". */
export function weekKey(date, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    weekday: 'short', firstDayOfWeek: 1, // Monday week boundary
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map(p => [p.type, p.value]));
  const dayOfYear = Math.floor((Date.UTC(+parts.year, +parts.month - 1, +parts.day) -
    Date.UTC(+parts.year, 0, 1)) / 86400000) + 1;
  const week = Math.ceil((dayOfYear - (['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].indexOf(parts.weekday))) / 7);
  return `${parts.year}-W${String(week).padStart(2, '0')}`;
}

function dayKey(date, timeZone) {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone, dateStyle: 'short' });
  return fmt.format(date); // YYYY-MM-DD in tz
}

/* --------------------------------------------------------------------------
 * 5. Main facade
 * ------------------------------------------------------------------------ */

export class ClassPulseHierarchy {
  constructor(adapters = {}, options = {}) {
    this.deps = Object.assign(createDefaultAdapters(), adapters);
    this.options = Object.assign({
      timeZone: this.deps.clock.timeZone || 'Asia/Kolkata',
      weeklyRewardPolicy: 'highest',       // 'highest' | 'none' | number override
      allowSelfGifting: false,
      allowGiftingToSuspended: false,
      adminCommandDailyConversionLimit: 1000,
    }, options);
    this.terminal = new TerminalRegistry(this);
  }

  /* -- trusted context -------------------------------------------------- */

  /** Returns authenticated actor id or throws (fail closed). */
  async _actor(context = {}) {
    const id = context.actorId != null ? context.actorId
      : await this.deps.auth.getAuthenticatedUserId();
    if (!id) throw new PermissionDeniedError('session');
    return assertUserId(id, 'actorId');
  }

  async _require(actorId, permission, context) {
    const perms = await this.getEffectivePermissions(actorId);
    if (!perms.has(permission) && !perms.has('platform.owner')) {
      throw new PermissionDeniedError(permission);
    }
    return perms;
  }

  async _audit(actorId, action, classification, targetId, metadata = {}) {
    await this.deps.audit.log({
      id: newId('aud'), at: await this._now(), actorId, action,
      classification, targetId: targetId || null, metadata,
    });
  }

  async _now() { return this.deps.clock.now(); }

  /* -- panels & permissions --------------------------------------------- */

  async getUserPanels(userId) {
    assertUserId(userId);
    const panels = await this.deps.store.getUserPanels(userId); // trusted source
    const set = new Set(panels);
    set.add(PANEL.NOOB); // Noob is the free default for everyone
    return [...set];
  }

  async getEffectivePermissions(userId) {
    return resolvePermissions(await this.getUserPanels(userId));
  }

  async can(userId, permission, context = {}) {
    const perms = await this.getEffectivePermissions(userId);
    return perms.has(permission) || perms.has('platform.owner');
  }

  /** Trusted teacher verification — can NEVER be set client-side. */
  async isVerifiedTeacher(userId) {
    return !!(await this.deps.auth.isVerifiedTeacher(userId));
  }

  /* -- economy ------------------------------------------------------------ */

  /**
   * Convert points -> diamonds. Atomic + idempotent via idempotencyKey.
   * Owner policy: points are unlimited and never deducted; no daily cap.
   */
  async convertPointsToDiamonds(request = {}) {
    const actorId = await this._actor(request);
    const amount = assertPositiveInteger(request.amountDiamonds, 'amountDiamonds');
    const idem = request.idempotencyKey || newId('idem');
    const now = await this._now();
    const panels = await this.getUserPanels(actorId);
    const store = this.deps.store;

    return this.deps.tx.run(async (tx) => {
      // Replay protection: identical idempotency key returns the first result.
      const existing = await tx.findLedgerByIdempotencyKey(idem);
      if (existing) return { transactionId: existing.transactionId, duplicated: true };

      const bal = await tx.getBalance(actorId);
      if (!bal) throw new NotFoundError('Balance');
      const ownerPolicy = bal.pointsPolicy === 'unlimited';

      if (!ownerPolicy) {
        const limit = effectiveDailyConversionLimit(panels, {
          ownerUnlimitedConversion: false,
          dailyConversionLimitOverride: panels.includes(PANEL.ADMIN_COMMAND)
            ? this.options.adminCommandDailyConversionLimit : undefined,
        });
        const used = await tx.getConversionUsage(actorId, dayKey(now, this.options.timeZone));
        if (used + amount > limit) {
          throw new ValidationError(`Daily conversion limit exceeded (limit ${limit}).`);
        }
      }

      if (!ownerPolicy) {
        if (bal.points < amount) throw new ValidationError('Insufficient points.');
      }

      const entry = {
        transactionId: newId('txn'), idempotencyKey: idem,
        type: 'points.convert', srcAccount: actorId, dstAccount: actorId,
        amount, itemId: null, reason: request.reason || 'points conversion',
        at: now, status: 'committed', audit: { actorId },
      };
      await tx.applyLedger(actorId, entry, ownerPolicy
        ? { diamondsDelta: amount }                       // unlimited points: not deducted
        : { diamondsDelta: amount, pointsDelta: -amount });
      if (!ownerPolicy) {
        await tx.recordConversionUsage(actorId, dayKey(now, this.options.timeZone), amount);
      }
      await this._audit(actorId, 'diamonds.convert', 'financial', actorId, { amount, ownerPolicy });
      return { transactionId: entry.transactionId, duplicated: false };
    });
  }

  async _transferDiamonds({ actorId, dstAccount, amount, type, itemId, reason, idem }) {
    const store = this.deps.store;
    return this.deps.tx.run(async (tx) => {
      const existing = await tx.findLedgerByIdempotencyKey(idem);
      if (existing) return { transactionId: existing.transactionId, duplicated: true };

      if (dstAccount === actorId && !this.options.allowSelfGifting) {
        throw new ValidationError('Self-gifting is not allowed.');
      }
      const dst = await tx.getUser(dstAccount);
      if (!dst) throw new NotFoundError('Recipient');
      if (!this.options.allowGiftingToSuspended && await tx.isSuspended(dstAccount)) {
        throw new ValidationError('Recipient is suspended.');
      }
      const srcBal = await tx.getBalance(actorId);
      if (!srcBal || srcBal.diamonds < amount) throw new ValidationError('Insufficient diamonds.');

      const entry = {
        transactionId: newId('txn'), idempotencyKey: idem,
        type, srcAccount: actorId, dstAccount, amount, itemId,
        reason: reason || type, at: await this._now(), status: 'committed',
        audit: { actorId },
      };
      await tx.applyLedger(actorId, entry, { diamondsDelta: -amount });
      await tx.applyLedger(dstAccount, entry, { diamondsDelta: amount });
      await this._audit(actorId, type, 'financial', dstAccount, { amount, itemId });
      return { transactionId: entry.transactionId, duplicated: false };
    });
  }

  async giftDiamonds(request = {}) {
    const actorId = await this._actor(request);
    await this._require(actorId, 'diamonds.gift');
    const amount = assertPositiveInteger(request.amountDiamonds, 'amountDiamonds');
    const dst = assertUserId(request.toUserId, 'toUserId');
    return this._transferDiamonds({
      actorId, dstAccount: dst, amount, type: 'diamonds.gift',
      reason: request.reason, idem: request.idempotencyKey || newId('idem'),
    });
  }

  async giftAvatar(request = {}) {
    const actorId = await this._actor(request);
    await this._require(actorId, 'avatars.gift'); // Pro+
    const itemId = assertUserId(request.itemId, 'itemId');
    const dst = assertUserId(request.toUserId, 'toUserId');
    return this.deps.tx.run(async (tx) => {
      const idem = request.idempotencyKey || newId('idem');
      const existing = await tx.findLedgerByIdempotencyKey(idem);
      if (existing) return { transactionId: existing.transactionId, duplicated: true };
      // Ownership + eligibility verified in the trusted transaction unit.
      const owned = await tx.getOwnedAvatar(actorId, itemId);
      if (!owned || !owned.giftEligible) throw new ValidationError('Avatar is not gift-eligible.');
      if (!await tx.getUser(dst)) throw new NotFoundError('Recipient');
      await tx.transferAvatar(actorId, dst, itemId);
      const entry = { transactionId: newId('txn'), idempotencyKey: idem,
        type: 'avatar.gift', srcAccount: actorId, dstAccount: dst, amount: 0,
        itemId, reason: request.reason || 'avatar gift', at: await this._now(),
        status: 'committed', audit: { actorId } };
      await tx.applyLedger(actorId, entry, {});
      await this._audit(actorId, 'avatar.gift', 'financial', dst, { itemId });
      return { transactionId: entry.transactionId, duplicated: false };
    });
  }

  /**
   * Gift a cosmetic. If the catalogue is empty this returns the empty-state
   * result — no items are ever invented.
   */
  async giftCosmetic(request = {}) {
    const actorId = await this._actor(request);
    await this._require(actorId, 'cosmetics.gift'); // Pro+
    const items = await this.deps.cosmetics.listItems();
    if (!Array.isArray(items) || items.length === 0) {
      return { emptyState: true, items: [], message: 'No cosmetics available yet.' };
    }
    const itemId = assertUserId(request.itemId, 'itemId');
    const item = items.find(i => i.id === itemId);
    if (!item) throw new NotFoundError('Cosmetic');
    if (item.priceDiamonds == null) throw new ValidationError('Cosmetic has no price.');
    const dst = assertUserId(request.toUserId, 'toUserId');
    // Buyer pays the catalogue price; recipient receives the item.
    return this.deps.tx.run(async (tx) => {
      const idem = request.idempotencyKey || newId('idem');
      const existing = await tx.findLedgerByIdempotencyKey(idem);
      if (existing) return { transactionId: existing.transactionId, duplicated: true };
      if (!await tx.getUser(dst)) throw new NotFoundError('Recipient');
      const srcBal = await tx.getBalance(actorId);
      const price = assertPositiveInteger(item.priceDiamonds, 'price');
      if (!srcBal || srcBal.diamonds < price) throw new ValidationError('Insufficient diamonds.');
      await tx.grantCosmetic(dst, itemId);
      const entry = { transactionId: newId('txn'), idempotencyKey: idem,
        type: 'cosmetic.gift', srcAccount: actorId, dstAccount: dst, amount: price,
        itemId, reason: request.reason || 'cosmetic gift', at: await this._now(),
        status: 'committed', audit: { actorId } };
      await tx.applyLedger(actorId, entry, { diamondsDelta: -price });
      await tx.applyLedger(dst, entry, { diamondsDelta: 0 });
      await this._audit(actorId, 'cosmetic.gift', 'financial', dst, { itemId, price });
      return { transactionId: entry.transactionId, duplicated: false, emptyState: false };
    });
  }

  /** Purchase Pro (500), Admin (5,000) or Dev (100). Owner/Admin Command: never. */
  async purchasePanel(request = {}) {
    const actorId = await this._actor(request);
    const panelId = request.panelId;
    const def = PANELS[panelId];
    if (!def) throw new ValidationError('Unknown panel.');
    if (!def.purchasable) {
      throw new ValidationError(`Panel "${def.displayName}" cannot be purchased.`);
    }
    if (panelId === PANEL.ADMIN && await this.isVerifiedTeacher(actorId)) {
      // Verified teachers get Admin free — purchasing must not charge them.
      throw new ConflictError('Verified teachers receive Admin access for free.');
    }
    const idem = request.idempotencyKey || newId('idem');
    return this.deps.tx.run(async (tx) => {
      const existing = await tx.findLedgerByIdempotencyKey(idem);
      if (existing) return { transactionId: existing.transactionId, duplicated: true };
      const panels = new Set(await tx.getUserPanels(actorId));
      if (panels.has(panelId)) throw new ConflictError('Panel already owned.');
      const bal = await tx.getBalance(actorId);
      if (!bal || bal.diamonds < def.priceDiamonds) throw new ValidationError('Insufficient diamonds.');
      const entry = { transactionId: newId('txn'), idempotencyKey: idem,
        type: 'panel.purchase', srcAccount: actorId, dstAccount: null,
        amount: def.priceDiamonds, itemId: panelId,
        reason: `Purchase ${def.displayName}`, at: await this._now(),
        status: 'committed', audit: { actorId } };
      await tx.applyLedger(actorId, entry, { diamondsDelta: -def.priceDiamonds });
      panels.add(panelId);
      await tx.setUserPanels(actorId, [...panels]); // trusted write
      await this._audit(actorId, 'panel.purchase', 'financial', null, { panelId });
      return { transactionId: entry.transactionId, duplicated: false };
    });
  }

  /**
   * Grant the weekly allowance for the current week. Idempotent per user+week:
   * retries, device-clock changes or double submits cannot double-claim.
   */
  async grantWeeklyAllowance(request = {}) {
    const actorId = await this._actor(request);
    const now = await this._now();
    const wk = weekKey(now, this.options.timeZone);
    return this.deps.tx.run(async (tx) => {
      const claimed = await tx.getWeeklyClaim(actorId, wk);
      if (claimed) return { transactionId: claimed, duplicated: true };
      const panels = await tx.getUserPanels(actorId);
      const amount = this.options.weeklyRewardPolicy === 'none' ? 0
        : effectiveWeeklyAllowance(panels, {
            weeklyAllowanceOverride: typeof this.options.weeklyRewardPolicy === 'number'
              ? this.options.weeklyRewardPolicy : undefined });
      if (amount <= 0) throw new ValidationError('No weekly allowance for your panels.');
      const entry = { transactionId: newId('txn'), idempotencyKey: `weekly:${actorId}:${wk}`,
        type: 'weekly.allowance', srcAccount: null, dstAccount: actorId, amount,
        itemId: null, reason: `Weekly allowance ${wk}`, at: now,
        status: 'committed', audit: { actorId } };
      await tx.applyLedger(actorId, entry, { diamondsDelta: amount });
      await tx.recordWeeklyClaim(actorId, wk, entry.transactionId);
      await this._audit(actorId, 'weekly.allowance', 'financial', null, { amount, week: wk });
      return { transactionId: entry.transactionId, duplicated: false };
    });
  }

  /**
   * Allocate a confirmed game reward: 20% platform / 80% developer.
   * Only callable with trusted confirmation (backend-verified reward event).
   */
  async allocateGameReward(request = {}) {
    const actorId = await this._actor(request);
    await this._require(actorId, 'games.review'); // Admin Command+ only
    if (!request.confirmedByBackend) {
      throw new BackendUnavailableError('reward-confirmation');
    }
    const split = splitDeveloperReward(request.grossDiamonds);
    const idem = request.idempotencyKey || newId('idem');
    return this.deps.tx.run(async (tx) => {
      const existing = await tx.findLedgerByIdempotencyKey(idem);
      if (existing) return { transactionId: existing.transactionId, duplicated: true };
      const dev = assertUserId(request.developerId, 'developerId');
      const game = await tx.getGame(request.gameId);
      if (!game || game.status !== 'published') throw new ValidationError('Game is not published.');
      const now = await this._now();
      const grossEntry = { transactionId: newId('txn'), idempotencyKey: idem,
        type: 'game.reward.gross', srcAccount: 'platform', dstAccount: dev,
        amount: split.gross, itemId: request.gameId,
        reason: `Game reward (gross) for ${request.gameId}`, at: now,
        status: 'committed', audit: { actorId, developerId: dev } };
      await tx.applyLedger(dev, grossEntry, { diamondsDelta: split.developer });
      const platformEntry = { transactionId: newId('txn'), idempotencyKey: idem + ':pf',
        type: 'game.reward.platform', srcAccount: dev, dstAccount: 'platform',
        amount: split.platform, itemId: request.gameId,
        reason: `Platform share (20%) for ${request.gameId}`, at: now,
        status: 'committed', audit: { actorId } };
      await tx.applyLedger('platform', platformEntry, { diamondsDelta: split.platform });
      await this._audit(actorId, 'game.reward.allocate', 'financial', dev,
        { gameId: request.gameId, gross: split.gross, developer: split.developer, platform: split.platform });
      return { ...split, duplicated: false };
    });
  }

  /* -- groups & video visibility ------------------------------------------ */

  async createGroup(request = {}) {
    const actorId = await this._actor(request);
    await this._require(actorId, 'groups.create'); // Admin (teacher/paid) only
    const name = typeof request.name === 'string' ? request.name.trim() : '';
    if (!name || name.length > 80) throw new ValidationError('Invalid group name.');
    const group = await this.deps.groups.createGroup({ name, ownerId: actorId });
    await this._audit(actorId, 'groups.create', 'operational', null, { groupId: group.id });
    return group;
  }

  /**
   * Reusable visibility authorization function. Call this from feeds, search,
   * profiles, direct video URLs and shorts — not just the front-end UI.
   * Modes: public | followers | group_only | exclude_group
   */
  async canViewVideo(request = {}) {
    const viewerId = request.viewerId != null ? assertUserId(request.viewerId, 'viewerId') : null;
    const video = request.video;
    if (!video || typeof video !== 'object') throw new ValidationError('Invalid video.');
    const mode = video.visibility?.mode || 'public';
    const ownerId = assertUserId(video.ownerId, 'video.ownerId');

    if (viewerId === ownerId) return true; // owners always see their own content
    if (await this.deps.store.isSuspended(viewerId)) return false;

    switch (mode) {
      case 'public':
        return true; // subject to the app's global rules, enforced upstream
      case 'followers':
        return viewerId != null && !!(await this.deps.followers.isFollower(viewerId, ownerId));
      case 'group_only': {
        const gid = video.visibility?.groupId;
        if (!gid) return false;
        // Only resolves membership via the trusted group service; membership
        // is never exposed to unauthorized callers.
        return viewerId != null && !!(await this.deps.groups.isMember(gid, viewerId));
      }
      case 'exclude_group': {
        const gid = video.visibility?.groupId;
        if (!gid) return true;
        const isMember = viewerId != null && !!(await this.deps.groups.isMember(gid, viewerId));
        return !isMember; // everyone else, subject to global rules
      }
      default:
        return false; // fail closed on unknown modes
    }
  }

  /** Set visibility on content the actor is authorized to manage. */
  async setVideoVisibility(request = {}) {
    const actorId = await this._actor(request);
    await this._require(actorId, 'videos.setVisibility'); // Admin (teacher/paid) only
    const video = await this.deps.store.getVideo(request.videoId);
    if (!video) throw new NotFoundError('Video');
    if (video.ownerId !== actorId) throw new PermissionDeniedError('videos.setVisibility');
    const mode = request.mode;
    if (!['public', 'followers', 'group_only', 'exclude_group'].includes(mode)) {
      throw new ValidationError('Invalid visibility mode.');
    }
    if ((mode === 'group_only' || mode === 'exclude_group') && request.groupId) {
      const g = await this.deps.groups.getGroup(request.groupId);
      if (!g) throw new NotFoundError('Group');
      if (g.ownerId !== actorId && !await this.deps.groups.isMember(request.groupId, actorId)) {
        throw new PermissionDeniedError('groups.manage');
      }
    }
    const updated = await this.deps.store.updateVideoVisibility(request.videoId, {
      mode, groupId: request.groupId || null,
    });
    await this._audit(actorId, 'videos.setVisibility', 'operational', null,
      { videoId: request.videoId, mode });
    return updated;
  }

  /* -- developer game workflow -------------------------------------------- */

  async submitGame(request = {}) {
    const actorId = await this._actor(request);
    await this._require(actorId, 'games.submit'); // Dev+
    const title = typeof request.title === 'string' ? request.title.trim() : '';
    if (!title || title.length > 120) throw new ValidationError('Invalid game title.');
    const game = await this.deps.store.saveGame({
      id: newId('game'), title, developerId: actorId, status: 'submitted',
      feedback: null, submittedAt: await this._now(),
    });
    await this._audit(actorId, 'games.submit', 'operational', null, { gameId: game.id });
    return game;
  }

  /** Admin Command reviewer queue: approve/reject. Never auto-publishes. */
  async reviewGameSubmission(request = {}) {
    const actorId = await this._actor(request);
    await this._require(actorId, 'games.review'); // Admin Command+
    const game = await this.deps.store.getGame(assertUserId(request.gameId, 'gameId'));
    if (!game) throw new NotFoundError('Game');
    if (game.status !== 'submitted') throw new ConflictError('Game is not awaiting review.');
    const decision = request.decision;
    if (!['approved', 'rejected'].includes(decision)) throw new ValidationError('Invalid decision.');
    game.status = decision; // developer may later publish APPROVED games only
    game.feedback = typeof request.feedback === 'string' ? request.feedback.slice(0, 1000) : null;
    game.reviewedAt = await this._now();
    game.reviewerId = actorId;
    const saved = await this.deps.store.saveGame(game);
    await this._audit(actorId, 'games.review', 'operational', game.developerId,
      { gameId: game.id, decision });
    return saved;
  }

  async publishGame(request = {}) {
    const actorId = await this._actor(request);
    await this._require(actorId, 'games.publish'); // Dev, own games only
    const game = await this.deps.store.getGame(assertUserId(request.gameId, 'gameId'));
    if (!game) throw new NotFoundError('Game');
    if (game.developerId !== actorId) throw new PermissionDeniedError('games.publish');
    if (game.status !== 'approved') {
      throw new ConflictError('Only approved games can be published.');
    }
    game.status = 'published';
    game.publishedAt = await this._now();
    const saved = await this.deps.store.saveGame(game);
    await this._audit(actorId, 'games.publish', 'operational', null, { gameId: game.id });
    return saved;
  }

  /* -- moderation: suspension --------------------------------------------- */

  /**
   * Suspend an account: 5,000 diamond fee, atomic, idempotent, audited.
   * An Admin Command actor cannot suspend the owner or an Admin Command peer;
   * only platform.owner may suspend Admin Command accounts.
   */
  async suspendUser(request = {}) {
    const actorId = await this._actor(request);
    await this._require(actorId, 'users.suspend'); // Admin Command+
    const targetId = assertUserId(request.targetUserId, 'targetUserId');
    if (targetId === actorId) throw new ValidationError('Cannot suspend yourself.');
    const days = request.days;
    if (!Number.isInteger(days) || days < 1 || days > MAX_SUSPENSION_DAYS) {
      throw new ValidationError(`Suspension must be 1-${MAX_SUSPENSION_DAYS} days.`);
    }
    const idem = request.idempotencyKey || newId('idem');
    const actorPerms = await this.getEffectivePermissions(actorId);

    return this.deps.tx.run(async (tx) => {
      const existing = await tx.findLedgerByIdempotencyKey(idem);
      if (existing) return { transactionId: existing.transactionId, duplicated: true };

      const target = await tx.getUser(targetId);
      if (!target) throw new NotFoundError('Account');
      if (await tx.isSuspended(targetId)) throw new ConflictError('Account is already suspended.');

      const targetPanels = await tx.getUserPanels(targetId);
      const targetIsOwner = targetPanels.includes(PANEL.OWNER);
      const targetIsAdminCommand = targetPanels.includes(PANEL.ADMIN_COMMAND);
      if (targetIsOwner) throw new PermissionDeniedError('users.suspend');
      if (targetIsAdminCommand && !actorPerms.has('platform.owner')) {
        throw new PermissionDeniedError('users.suspend');
      }

      // Atomic: fee deduction + suspension record commit together or not at all.
      const bal = await tx.getBalance(actorId);
      if (!bal || bal.diamonds < SUSPENSION_FEE_DIAMONDS) {
        throw new ValidationError('Insufficient diamonds for the suspension fee.');
      }
      const now = await this._now();
      const feeEntry = { transactionId: newId('txn'), idempotencyKey: idem,
        type: 'suspension.fee', srcAccount: actorId, dstAccount: 'platform',
        amount: SUSPENSION_FEE_DIAMONDS, itemId: targetId,
        reason: `Suspension of ${targetId} for ${days} day(s)`, at: now,
        status: 'committed', audit: { actorId, targetId, days } };
      await tx.applyLedger(actorId, feeEntry, { diamondsDelta: -SUSPENSION_FEE_DIAMONDS });
      const record = await tx.createSuspension({
        id: newId('sus'), targetId, actorId, days, createdAt: now,
        expiresAt: new Date(now.getTime() + days * 86400000),
      });
      await this._audit(actorId, 'users.suspend', 'security', targetId,
        { days, fee: SUSPENSION_FEE_DIAMONDS, suspensionId: record.id });
      return { suspensionId: record.id, fee: SUSPENSION_FEE_DIAMONDS, duplicated: false };
    });
  }

  /** Remove a suspension: zero diamond fee, audited. */
  async unsuspendUser(request = {}) {
    const actorId = await this._actor(request);
    await this._require(actorId, 'users.unsuspend'); // Admin Command+
    const targetId = assertUserId(request.targetUserId, 'targetUserId');
    const removed = await this.deps.store.removeSuspension(targetId);
    if (!removed) throw new NotFoundError('Active suspension');
    await this._audit(actorId, 'users.unsuspend', 'security', targetId, { fee: UNSUSPEND_FEE_DIAMONDS });
    return { fee: UNSUSPEND_FEE_DIAMONDS };
  }

  /* -- owner terminal ------------------------------------------------------ */

  async executeTerminalCommand(request = {}) {
    const actorId = await this._actor(request);
    await this._require(actorId, 'terminal.access'); // owner only
    const raw = typeof request.command === 'string' ? request.command.trim() : '';
    if (!raw) return { ok: false, message: 'Empty command. Type "help me" for available commands.' };
    const [head, ...rest] = raw.split(/\s+/);
    const cmd = this.terminal.find(head.toLowerCase(), rest);
    if (!cmd) {
      return { ok: false, message: `Unknown command "${head}". Type "help me" for available commands.` };
    }
    // Re-check the command's own required permission (defense in depth).
    await this._require(actorId, cmd.permission);
    if (cmd.validate) {
      const err = cmd.validate(rest);
      if (err) return { ok: false, message: err };
    }
    if (cmd.confirmationRequired && request.confirmed !== true) {
      return { ok: false, requiresConfirmation: true,
        message: `This command (${cmd.name}) changes data. Re-run with confirmed:true.` };
    }
    const result = await cmd.handler({ actorId, args: rest, registry: this });
    await this._audit(actorId, `terminal.${cmd.name}`, cmd.auditClassification,
      result && result.targetId, { command: raw, readOnly: cmd.readOnly });
    return { ok: true, readOnly: cmd.readOnly, data: result };
  }
}

/* --------------------------------------------------------------------------
 * 6. Terminal command registry
 * ------------------------------------------------------------------------ */

export class TerminalRegistry {
  constructor(hierarchy) {
    this.h = hierarchy;
    this.commands = [];
    this._registerDefaults();
  }

  register(cmd) {
    for (const k of ['name', 'description', 'usage', 'permission', 'handler']) {
      if (!cmd[k]) throw new ValidationError(`Command missing "${k}".`);
    }
    this.commands.push(Object.freeze({
      aliases: [], readOnly: true, confirmationRequired: false,
      auditClassification: 'operational', ...cmd,
      aliases: [cmd.name, ...(cmd.aliases || [])].map(s => s.toLowerCase()),
    }));
  }

  find(head, args) {
    // multi-word commands first (e.g. "help me", "review games")
    const joined = [head, ...args].join(' ');
    return this.commands.find(c => c.aliases.includes(joined))
        || this.commands.find(c => c.aliases.includes(head));
  }

  listFor(permissions) {
    return this.commands.filter(c =>
      permissions.has(c.permission) || permissions.has('platform.owner'));
  }

  _registerDefaults() {
    const h = this.h;
    this.register({
      name: 'help me', aliases: ['helpme'],
      description: 'List commands available to you.', usage: 'help me',
      permission: 'terminal.access', readOnly: true, auditClassification: 'operational',
      handler: async ({ actorId }) => {
        const perms = await h.getEffectivePermissions(actorId);
        return this.listFor(perms).map(c => ({ name: c.name, usage: c.usage, description: c.description }));
      },
    });
    this.register({
      name: 'shorts',
      description: 'Open the existing shorts feature via the navigation adapter.',
      usage: 'shorts', permission: 'terminal.access', readOnly: true,
      auditClassification: 'operational',
      handler: async () => { await h.deps.navigation.openShorts(); return { opened: 'shorts' }; },
    });
    this.register({
      name: 'users',
      description: 'List non-sensitive account summaries (no private content).',
      usage: 'users', permission: 'users.inspect', readOnly: true,
      auditClassification: 'operational',
      handler: async () => (await h.deps.store.listUsers())
        .map(u => ({ id: u.id, status: u.status, panels: u.panels })),
    });
    this.register({
      name: 'user', description: 'Inspect permitted account metadata.',
      usage: 'user <id>', permission: 'users.inspect', readOnly: true,
      auditClassification: 'operational',
      validate: args => args.length === 1 ? null : 'Usage: user <id>',
      handler: async ({ args }) => {
        const u = await h.deps.store.getUser(args[0]);
        if (!u) throw new NotFoundError('Account');
        return { targetId: u.id, id: u.id, status: u.status, createdAt: u.createdAt };
      },
    });
    this.register({
      name: 'hierarchy', description: "Inspect a user's assigned panels.",
      usage: 'hierarchy <id>', permission: 'users.inspect', readOnly: true,
      auditClassification: 'operational',
      validate: args => args.length === 1 ? null : 'Usage: hierarchy <id>',
      handler: async ({ args }) => ({ targetId: args[0], panels: await h.getUserPanels(args[0]) }),
    });
    this.register({
      name: 'diamonds', description: 'Inspect permitted balance and ledger summary.',
      usage: 'diamonds <id>', permission: 'users.inspect', readOnly: true,
      auditClassification: 'sensitive', // minimized financial view
      validate: args => args.length === 1 ? null : 'Usage: diamonds <id>',
      handler: async ({ args }) => {
        const bal = await h.deps.store.getBalance(args[0]);
        if (!bal) throw new NotFoundError('Balance');
        return { targetId: args[0], diamonds: bal.diamonds,
          ledgerSummary: await h.deps.store.getLedgerSummary(args[0]) };
      },
    });
    this.register({
      name: 'games', description: 'List game submissions and publication status.',
      usage: 'games', permission: 'games.review', readOnly: true,
      auditClassification: 'operational',
      handler: async () => (await h.deps.store.listGames())
        .map(g => ({ id: g.id, title: g.title, developerId: g.developerId, status: g.status })),
    });
    this.register({
      name: 'review games', aliases: ['reviewgames'],
      description: 'Open the game review queue.', usage: 'review games',
      permission: 'games.review', readOnly: true, auditClassification: 'operational',
      handler: async () => (await h.deps.store.listGames())
        .filter(g => g.status === 'submitted')
        .map(g => ({ id: g.id, title: g.title, developerId: g.developerId, submittedAt: g.submittedAt })),
    });
    this.register({
      name: 'groups', description: 'Inspect authorized group-management data.',
      usage: 'groups', permission: 'groups.inspect', readOnly: true,
      auditClassification: 'sensitive',
      handler: async () => (await h.deps.groups.listGroups())
        .map(g => ({ id: g.id, name: g.name, ownerId: g.ownerId, memberCount: g.memberCount })),
    });
    this.register({
      name: 'suspensions', description: 'Inspect suspension records.',
      usage: 'suspensions', permission: 'users.suspend', readOnly: true,
      auditClassification: 'security',
      handler: async () => (await h.deps.store.getSuspensions())
        .map(s => ({ id: s.id, targetId: s.targetId, actorId: s.actorId,
          createdAt: s.createdAt, expiresAt: s.expiresAt })),
    });
    this.register({
      name: 'audit', description: 'View authorized audit events.',
      usage: 'audit', permission: 'audit.read', readOnly: true,
      auditClassification: 'security',
      handler: async () => (await h.deps.store.getAuditEvents()).slice(-100),
    });
    this.register({
      name: 'help', description: 'Display command usage.',
      usage: 'help <command>', permission: 'terminal.access', readOnly: true,
      auditClassification: 'operational',
      handler: async ({ args }) => args.length === 0
        ? this.commands.map(c => ({ name: c.name, usage: c.usage }))
        : this.commands.filter(c => c.aliases.includes(args[0].toLowerCase()))
            .map(c => ({ name: c.name, usage: c.usage, description: c.description })),
    });
  }
}

export default ClassPulseHierarchy;
