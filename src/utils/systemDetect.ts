// Pure system-account detection logic (no config / network singletons), so it
// can be unit-tested with a stubbed RPC. See src/storage/systemAccount.ts.

export const SYSTEM_CANDIDATES = ['pulse', 'eosio'] as const

/** Minimal RPC surface needed for detection (lets tests stub it). */
export interface SystemProbeRpc {
  call(method: string, params: any): Promise<any>
}

export interface CandidateProbe {
  name: string
  exists: boolean
  privileged: boolean
  hasAbi: boolean
  hasCode: boolean
}

async function probe(rpc: SystemProbeRpc, name: string): Promise<CandidateProbe> {
  const out: CandidateProbe = { name, exists: false, privileged: false, hasAbi: false, hasCode: false }
  try {
    const acct = await rpc.call('pulsevm.getAccount', { account_name: name })
    if (acct && acct.account_name) {
      out.exists = true
      out.privileged = acct.privileged === true
    }
  } catch {
    // account not found / RPC error — treated as absent
  }
  try {
    const abi = await rpc.call('pulsevm.getABI', { account_name: name })
    const a = abi?.abi ?? abi
    if (a && a.version && ((a.actions?.length ?? 0) > 0 || (a.structs?.length ?? 0) > 0)) {
      out.hasAbi = true
      out.exists = true
    }
  } catch {
    // no ABI
  }
  try {
    // Not served by every node version — absence is not a signal.
    const ch = await rpc.call('pulsevm.getCodeHash', { account_name: name })
    if (ch?.code_hash && !/^0+$/.test(String(ch.code_hash))) {
      out.hasCode = true
      out.exists = true
    }
  } catch {
    // method not found / account not found
  }
  return out
}

/** Pick the system account from probe results; exported for tests. */
export function chooseSystemAccount(probes: CandidateProbe[]): string | undefined {
  const score = (p: CandidateProbe) =>
    (p.hasAbi || p.hasCode ? 4 : 0) + (p.privileged ? 2 : 0) + (p.exists ? 1 : 0)
  // Stable: on equal scores the earlier candidate (pulse) wins.
  const best = probes.reduce<CandidateProbe | undefined>(
    (b, p) => (score(p) > 0 && (!b || score(p) > score(b)) ? p : b), undefined)
  return best?.name
}

export async function detectSystemAccount(rpc: SystemProbeRpc): Promise<{ name?: string; probes: CandidateProbe[] }> {
  const probes = await Promise.all(SYSTEM_CANDIDATES.map(n => probe(rpc, n)))
  return { name: chooseSystemAccount(probes), probes }
}
