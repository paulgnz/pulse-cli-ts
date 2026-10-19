// Which wallet keys to sign with.
//
// PulseVM rejects a transaction that carries any signature its authority
// checker did not use ("transaction bears irrelevant signatures" —
// AuthorizationManager::check_authorization -> all_keys_used). So we must sign
// with exactly the keys the checker will consume, no more.
//
// Preferred: ask the node (pulsevm.getRequiredKeys {trx, candidate_keys}) —
// it runs the same AuthorityChecker as validation and returns its used_keys.
// Fallback (older nodes without the method): emulate that checker locally
// against permissions read with pulsevm.getAccount.
//
// The checker evaluates ONLY the declared permission (plus account
// delegations inside it). A parent permission's keys (e.g. owner) do NOT
// satisfy a declared child like account@bot, so we never add them; if the
// wallet can't satisfy the declared permission we say so instead.

import { PrivateKey, PublicKey } from '@metalblockchain/pulsevm-js'
import { extractChainMessage } from './chainError'

export interface AuthorityLike {
  threshold: number
  keys: { key: string; weight: number }[]
  accounts: { permission: { actor: string; permission: string }; weight: number }[]
  waits?: { wait_sec: number; weight: number }[]
}

/** Returns the authority of actor@permission, or undefined if it doesn't exist. */
export type PermissionLookup = (actor: string, permission: string) => Promise<AuthorityLike | undefined>

export interface Level { actor: string; permission: string }

export function normalizeKey(k: string): string {
  try {
    return PublicKey.from(k).toString()
  } catch {
    return k
  }
}

type CacheStatus = 'evaluating' | 'satisfied' | 'unsatisfied'

/**
 * Emulates pulsevm_core AuthorityChecker (same factor order: weight
 * descending, then waits > keys > accounts at equal weight; stop as soon as
 * the threshold is reached; keys from failed branches don't count as used;
 * cycles count 0; depth-limited).
 */
export class LocalAuthorityChecker {
  readonly usedKeys = new Set<string>()
  private readonly provided: Set<string>
  private readonly authCache = new Map<string, AuthorityLike | undefined>()

  constructor(providedKeys: string[], private lookup: PermissionLookup, private maxDepth = 6) {
    this.provided = new Set(providedKeys.map(normalizeKey))
  }

  private async authority(level: Level): Promise<AuthorityLike | undefined> {
    const tag = `${level.actor}@${level.permission}`
    if (!this.authCache.has(tag)) this.authCache.set(tag, await this.lookup(level.actor, level.permission))
    return this.authCache.get(tag)
  }

  /** Is the declared permission level satisfied by the provided keys? */
  async satisfiedLevel(level: Level): Promise<boolean> {
    const auth: AuthorityLike = { threshold: 1, keys: [], accounts: [{ permission: level, weight: 1 }] }
    return this.satisfied(auth, 0, new Map())
  }

  private async satisfied(auth: AuthorityLike, depth: number, cache: Map<string, CacheStatus>): Promise<boolean> {
    const snapshot = new Set(this.usedKeys)
    type Factor = { weight: number; kind: number; run: () => Promise<number> }
    const factors: Factor[] = [
      ...auth.accounts.map(a => ({ weight: a.weight, kind: 1, run: () => this.visitLevel(a, depth, cache) })),
      ...auth.keys.map(k => ({ weight: k.weight, kind: 2, run: async () => this.visitKey(k) })),
      // No delay is ever provided by the CLI, so waits never contribute.
      ...(auth.waits ?? []).map(w => ({ weight: w.weight, kind: 3, run: async () => 0 })),
    ]
    // Stable sort, weight desc then kind desc (matches Rust sort_by).
    factors.sort((a, b) => (b.weight - a.weight) || (b.kind - a.kind))
    let total = 0
    for (const f of factors) {
      total += await f.run()
      if (total >= auth.threshold) return true
    }
    this.usedKeys.clear()
    snapshot.forEach(k => this.usedKeys.add(k))
    return false
  }

  private visitKey(k: { key: string; weight: number }): number {
    const key = normalizeKey(String(k.key))
    if (this.provided.has(key)) {
      this.usedKeys.add(key)
      return k.weight
    }
    return 0
  }

  private async visitLevel(
    a: { permission: Level; weight: number },
    depth: number,
    cache: Map<string, CacheStatus>,
  ): Promise<number> {
    const tag = `${a.permission.actor}@${a.permission.permission}`
    const status = cache.get(tag)
    if (status === 'evaluating' || status === 'unsatisfied') return 0
    if (status === 'satisfied') return a.weight
    if (depth >= this.maxDepth) return 0
    const auth = await this.authority(a.permission)
    if (!auth) return 0
    cache.set(tag, 'evaluating')
    const ok = await this.satisfied(auth, depth + 1, cache)
    cache.set(tag, ok ? 'satisfied' : 'unsatisfied')
    return ok ? a.weight : 0
  }
}

/** Distinct declared actor@permission pairs across a transaction's actions. */
export function declaredLevels(actions: any[]): Level[] {
  const seen = new Map<string, Level>()
  for (const a of actions ?? []) {
    for (const az of a.authorization ?? []) {
      const actor = String(az.actor)
      const permission = String(az.permission)
      seen.set(`${actor}@${permission}`, { actor, permission })
    }
  }
  return [...seen.values()]
}

/**
 * Local fallback: which of `walletPubKeys` the chain would use for the
 * declared levels. Throws if some declared level can't be satisfied.
 */
export async function localRequiredKeys(
  levels: Level[],
  walletPubKeys: string[],
  lookup: PermissionLookup,
): Promise<string[]> {
  const checker = new LocalAuthorityChecker(walletPubKeys, lookup)
  const missing: string[] = []
  for (const level of levels) {
    if (!(await checker.satisfiedLevel(level))) missing.push(`${level.actor}@${level.permission}`)
  }
  if (missing.length) {
    throw new Error(
      `No combination of wallet keys satisfies ${missing.join(', ')}. ` +
      `Wallet holds: ${walletPubKeys.map(normalizeKey).join(', ')}. ` +
      'Add the key with "key:add". (A parent permission\'s key, e.g. owner, does not satisfy a declared child permission — declare the parent instead.)')
  }
  return [...checker.usedKeys]
}

/** Build a PermissionLookup from a get_account-style fetcher. */
export function lookupFromAccounts(getAccount: (actor: string) => Promise<any>): PermissionLookup {
  const accounts = new Map<string, Promise<any>>()
  return async (actor, permission) => {
    if (!accounts.has(actor)) accounts.set(actor, getAccount(actor).catch(() => undefined))
    const acct = await accounts.get(actor)
    const perm = (acct?.permissions ?? []).find((p: any) => p.perm_name === permission)
    if (!perm) return undefined
    const ra = perm.required_auth
    return {
      threshold: Number(ra.threshold),
      keys: (ra.keys ?? []).map((k: any) => ({ key: String(k.key), weight: Number(k.weight) })),
      accounts: (ra.accounts ?? []).map((x: any) => ({
        permission: { actor: String(x.permission.actor), permission: String(x.permission.permission) },
        weight: Number(x.weight),
      })),
      waits: (ra.waits ?? []).map((w: any) => ({ wait_sec: Number(w.wait_sec), weight: Number(w.weight) })),
    }
  }
}

/** RPC surface selectRequiredKeys needs (PulseRpc satisfies it; tests stub it). */
export interface RequiredKeysRpc {
  call(method: string, params: any): Promise<any>
  get_account(actor: string): Promise<any>
}

// ----------------------------------------------------------------------------
// Required-key selection
// ----------------------------------------------------------------------------
// PulseVM rejects a transaction carrying any signature its authority checker
// didn't use ("transaction bears irrelevant signatures"), and the wallet may
// hold several keys for the same account (owner + a bot key, ...). Sign with
// exactly the keys the checker will use: ask the node (pulsevm.getRequiredKeys
// runs the same checker), else emulate it locally — see utils/keySelection.ts.
export async function selectRequiredKeys(
  rpc: RequiredKeysRpc,
  privateKeys: string[],
  actions: any[],
  trxJson?: any,
): Promise<string[]> {
  if (privateKeys.length === 0) return privateKeys
  const levels = declaredLevels(actions)
  if (levels.length === 0) return privateKeys
  const byPub = new Map<string, string>()
  for (const pk of privateKeys) byPub.set(normalizeKey(PrivateKey.from(pk).toPublic().toString()), pk)
  const pubs = [...byPub.keys()]

  let required: string[] | undefined
  if (trxJson) {
    try {
      const res = await rpc.call('pulsevm.getRequiredKeys', {trx: trxJson, candidate_keys: pubs})
      if (Array.isArray(res)) required = res.map((k: any) => normalizeKey(String(k)))
    } catch (e: any) {
      const msg = extractChainMessage(e?.rpcError ?? e)
      if (/does not have signatures/i.test(msg)) {
        throw new Error(
          `No combination of wallet keys satisfies ${levels.map(l => `${l.actor}@${l.permission}`).join(', ')} ` +
          `(node: ${msg}). Wallet holds: ${pubs.join(', ')}. Add the key with "key:add".`)
      }
      // Method not served / other RPC problem -> local emulation below.
    }
  }
  if (!required) {
    required = await localRequiredKeys(levels, pubs, lookupFromAccounts(a => rpc.get_account(a)))
  }
  const out = required.map(k => byPub.get(k)).filter((k): k is string => Boolean(k))
  if (out.length === 0) {
    throw new Error(`No wallet key is required for ${levels.map(l => `${l.actor}@${l.permission}`).join(', ')}`)
  }
  return out
}

