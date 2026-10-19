// System account resolution.
//
// PulseVM chains name their system account either `pulse` (Pulse-native
// chains, e.g. Alpine) or `eosio` (chains migrated from Antelope — upstream
// made it a node setting, `system_account`). Every native action (setcode,
// setabi, newaccount, updateauth, linkauth, ...) must be sent to that account,
// so the CLI resolves it per endpoint:
//
//   1. an explicit --system <name> flag on the command, else
//   2. the value cached in the CLI config for the current endpoint
//      (set by `system:set`, or by a previous auto-detect), else
//   3. auto-detect: ask the RPC which of `pulse` / `eosio` exists and carries
//      an ABI (privileged account wins ties), then cache the answer.

import { config } from './config'
import { SYSTEM_CANDIDATES, SystemProbeRpc, detectSystemAccount } from '../utils/systemDetect'

export { SYSTEM_CANDIDATES, detectSystemAccount }

const CONFIG_KEY = 'systemAccounts'

function cache(): Record<string, string> {
  return ((config as any).get(CONFIG_KEY) as Record<string, string>) || {}
}

export function getCachedSystemAccount(endpoint: string): string | undefined {
  return cache()[endpoint]
}

export function setCachedSystemAccount(endpoint: string, name: string) {
  assertSystemName(name)
  ;(config as any).set(CONFIG_KEY, { ...cache(), [endpoint]: name })
}

export function clearCachedSystemAccount(endpoint: string) {
  const c = cache()
  delete c[endpoint]
  ;(config as any).set(CONFIG_KEY, c)
}

export function assertSystemName(name: string) {
  if (!/^[a-z1-5.]{1,12}$/.test(name) || name.endsWith('.')) {
    throw new Error(`invalid system account name "${name}" (a-z, 1-5, '.', max 12 chars)`)
  }
}

/**
 * Resolve the system account for `endpoint`. `override` (the --system flag)
 * wins and is NOT cached; otherwise use the cache, else auto-detect + cache.
 */
export async function resolveSystemAccount(
  rpc: SystemProbeRpc,
  endpoint: string,
  override?: string,
): Promise<string> {
  if (override) {
    assertSystemName(override)
    return override
  }
  const cached = getCachedSystemAccount(endpoint)
  if (cached) return cached
  const { name, probes } = await detectSystemAccount(rpc)
  if (!name) {
    throw new Error(
      `Could not detect the system account on ${endpoint} — neither ` +
      `${SYSTEM_CANDIDATES.join(' nor ')} exists (${JSON.stringify(probes)}). ` +
      'Set it with `pulse-ts system:set <name>` or pass --system <name>.')
  }
  setCachedSystemAccount(endpoint, name)
  return name
}
