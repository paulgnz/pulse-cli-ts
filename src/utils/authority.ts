// Authority construction for updateauth / newaccount.
//
// The chain validates an authority strictly (PulseVM
// pulsevm_chain_types::Authority::validate, same rule as Antelope):
//   - threshold > 0 and threshold <= sum of all weights
//   - keys STRICTLY ascending by the key's structured static-variant order:
//     key type index (K1=0, R1=1, WA=2) first, then the 33-byte compressed
//     point, then (WA only) user_presence, then rpid bytes
//   - accounts STRICTLY ascending by (actor, permission) as uint64 name values
//     — NOT by the "actor@permission" string: e.g. "alice1@active" sorts
//     before "alice@active" as a string ('1' < '@'), but alice < alice1 as names
//   - waits strictly ascending by wait_sec, none zero
// pulsevm-js's Authority.sort() uses String.localeCompare on the textual form,
// which is wrong for both keys and accounts, so we sort here ourselves.

import { Name, PublicKey, KeyType } from '@metalblockchain/pulsevm-js'

export interface KeyWeightSpec { key: string; weight: number }
export interface AccountWeightSpec { permission: { actor: string; permission: string }; weight: number }
export interface WaitWeightSpec { wait_sec: number; weight: number }
export interface AuthoritySpec {
  threshold: number;
  keys: KeyWeightSpec[];
  accounts: AccountWeightSpec[];
  waits: WaitWeightSpec[];
}

const MAX_WEIGHT = 0xFFFF

function parseWeight(raw: string | undefined, spec: string): number {
  if (raw === undefined || raw === '') return 1
  if (!/^\d+$/.test(raw)) throw new Error(`invalid weight "${raw}" in "${spec}"`)
  const w = Number(raw)
  if (w < 1 || w > MAX_WEIGHT) throw new Error(`weight ${w} in "${spec}" must be 1..${MAX_WEIGHT}`)
  return w
}

function checkName(value: string, what: string, spec: string) {
  if (!/^[a-z1-5.]{1,12}$/.test(value) || value.endsWith('.')) {
    throw new Error(`invalid ${what} "${value}" in "${spec}"`)
  }
}

/** Parse "PUB_K1_…[:weight]" (legacy EOS…/PUB_R1_/PUB_WA_ also accepted). */
export function parseKeySpec(spec: string): KeyWeightSpec {
  // Public keys never contain ':' so the last ':' separates the weight.
  const idx = spec.lastIndexOf(':')
  const keyStr = idx === -1 ? spec : spec.slice(0, idx)
  const weight = parseWeight(idx === -1 ? undefined : spec.slice(idx + 1), spec)
  let key: PublicKey
  try {
    key = PublicKey.from(keyStr)
  } catch (e: any) {
    throw new Error(`invalid public key "${keyStr}": ${e?.message ?? e}`)
  }
  return { key: key.toString(), weight }
}

/** Parse "actor@permission[:weight]" (permission defaults to active). */
export function parseAccountSpec(spec: string): AccountWeightSpec {
  const idx = spec.lastIndexOf(':')
  const level = idx === -1 ? spec : spec.slice(0, idx)
  const weight = parseWeight(idx === -1 ? undefined : spec.slice(idx + 1), spec)
  const [actor, permission = 'active', ...rest] = level.split('@')
  if (rest.length) throw new Error(`invalid account authority "${spec}" (expected actor@permission[:weight])`)
  checkName(actor, 'actor', spec)
  checkName(permission, 'permission', spec)
  return { permission: { actor, permission }, weight }
}

/** Parse "seconds[:weight]" for a wait weight. */
export function parseWaitSpec(spec: string): WaitWeightSpec {
  const [secs, w] = spec.split(':')
  if (!/^\d+$/.test(secs) || Number(secs) < 1) throw new Error(`invalid wait "${spec}" (seconds must be >= 1)`)
  return { wait_sec: Number(secs), weight: parseWeight(w, spec) }
}

function nameValue(n: string): bigint {
  return BigInt(Name.from(n).value.toString())
}

function cmpBigInt(a: bigint, b: bigint): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function cmpBytes(a: Uint8Array, b: Uint8Array): number {
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) return a[i] - b[i]
  }
  return a.length - b.length
}

function readVarUint32(buf: Uint8Array, offset: number): [number, number] {
  let v = 0
  let shift = 0
  let i = offset
  for (;;) {
    const b = buf[i++]
    v |= (b & 0x7F) << shift
    if (!(b & 0x80)) break
    shift += 7
  }
  return [v >>> 0, i]
}

/** Structured key ordering (matches the chain's derived Ord on AuthorityPublicKey). */
export function compareKeys(a: string, b: string): number {
  const ka = PublicKey.from(a)
  const kb = PublicKey.from(b)
  const ta = KeyType.indexFor(ka.type)
  const tb = KeyType.indexFor(kb.type)
  if (ta !== tb) return ta - tb
  const da: Uint8Array = ka.data.array
  const db: Uint8Array = kb.data.array
  if (ka.type !== KeyType.WA) return cmpBytes(da, db)
  // WA data = point[33] | user_presence u8 | rpid (varuint32 len + bytes)
  const c = cmpBytes(da.subarray(0, 33), db.subarray(0, 33))
  if (c !== 0) return c
  if (da[33] !== db[33]) return da[33] - db[33]
  const [la, oa] = readVarUint32(da, 34)
  const [lb, ob] = readVarUint32(db, 34)
  return cmpBytes(da.subarray(oa, oa + la), db.subarray(ob, ob + lb))
}

/** (actor, permission) ordering by uint64 name value. */
export function comparePermissionLevels(
  a: { actor: string; permission: string },
  b: { actor: string; permission: string },
): number {
  return cmpBigInt(nameValue(a.actor), nameValue(b.actor)) ||
    cmpBigInt(nameValue(a.permission), nameValue(b.permission))
}

/**
 * Build a chain-valid authority: sorts keys/accounts/waits into the canonical
 * order, rejects duplicates, and checks 1 <= threshold <= sum(weights).
 */
export function buildAuthority(input: {
  threshold?: number;
  keys?: KeyWeightSpec[];
  accounts?: AccountWeightSpec[];
  waits?: WaitWeightSpec[];
}): AuthoritySpec {
  const threshold = input.threshold ?? 1
  const keys = [...(input.keys ?? [])].sort((x, y) => compareKeys(x.key, y.key))
  const accounts = [...(input.accounts ?? [])].sort((x, y) => comparePermissionLevels(x.permission, y.permission))
  const waits = [...(input.waits ?? [])].sort((x, y) => x.wait_sec - y.wait_sec)

  if (!Number.isInteger(threshold) || threshold < 1 || threshold > 0xFFFFFFFF) {
    throw new Error(`threshold must be a positive integer (got ${input.threshold})`)
  }
  if (keys.length + accounts.length === 0) {
    throw new Error('authority needs at least one key or account')
  }
  for (let i = 1; i < keys.length; i++) {
    if (compareKeys(keys[i - 1].key, keys[i].key) === 0) throw new Error(`duplicate key ${keys[i].key}`)
  }
  for (let i = 1; i < accounts.length; i++) {
    if (comparePermissionLevels(accounts[i - 1].permission, accounts[i].permission) === 0) {
      const p = accounts[i].permission
      throw new Error(`duplicate account authority ${p.actor}@${p.permission}`)
    }
  }
  for (let i = 1; i < waits.length; i++) {
    if (waits[i - 1].wait_sec === waits[i].wait_sec) throw new Error(`duplicate wait ${waits[i].wait_sec}s`)
  }
  const total = [...keys, ...accounts, ...waits].reduce((s, x) => s + x.weight, 0)
  if (threshold > total) {
    throw new Error(`threshold ${threshold} exceeds the sum of weights (${total}) — the permission could never be satisfied`)
  }
  return { threshold, keys, accounts, waits }
}

/** One-line human summary, e.g. "threshold 2: PUB_K1_…(1), alice@active(1)". */
export function describeAuthority(a: AuthoritySpec): string {
  const parts = [
    ...a.keys.map(k => `${k.key.slice(0, 14)}…(${k.weight})`),
    ...a.accounts.map(x => `${x.permission.actor}@${x.permission.permission}(${x.weight})`),
    ...a.waits.map(w => `wait ${w.wait_sec}s(${w.weight})`),
  ]
  return `threshold ${a.threshold}: ${parts.join(', ')}`
}

/**
 * linkauth/unlinkauth `type`: oclif drops a literal "" positional, so accept
 * "*" / "-" as the empty type (= every action of the contract).
 */
export function anyActionSentinel(action: string): string {
  return ['*', '-', '""', "''"].includes(action) ? '' : action
}
