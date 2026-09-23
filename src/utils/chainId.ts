// chain_id handling for endpoint overrides and signing.

export interface EndpointEntry {
  chain: string
  endpoints: string[]
  chainId?: string
}

/**
 * Effective network for a chain with an endpoint override. The override's
 * endpoints AND its chainId win; a preset's chainId is never inherited by a
 * custom endpoint, since that endpoint may serve a different chain.
 */
export function mergeEndpointOverride(stock: EndpointEntry | undefined, override: EndpointEntry): EndpointEntry {
  const base = stock ? {...stock} : {chain: override.chain, endpoints: []}
  return {...base, chain: override.chain, endpoints: override.endpoints, chainId: override.chainId}
}

/**
 * chain_id to sign with: always the one the endpoint reports live. A stored
 * value that disagrees only triggers a warning (the endpoint is what receives
 * the transaction). No live value -> fall back to the stored one.
 */
export function resolveSigningChainId(
  live: string | undefined,
  configured: string | undefined,
  endpoint: string,
  warn: (msg: string) => void = () => {},
): string {
  if (live) {
    if (configured && configured !== live) {
      warn(`${endpoint} reports chain_id ${live}, but the configured network says ${configured}. ` +
        `Signing for ${live} (the chain this endpoint serves). Run endpoint:set / chain:set to fix the config.`)
    }
    return live
  }
  if (configured) return configured
  throw new Error(`Cannot determine the chain_id of ${endpoint}: pulsevm.getInfo returned none and none is configured`)
}
