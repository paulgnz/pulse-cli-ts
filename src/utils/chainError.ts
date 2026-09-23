// Surface the chain's own refusal message.
//
// PulseVM answers a rejected pulsevm.issueTx with a JSON-RPC error whose
// `message` is ChainError's Display string, often wrapped in category prefixes
// ("authorization error: …", "apply error: wasm runtime error: …") and, for
// internal errors, Rust Debug-quoted ("internal error: \"…\""). Some nodes put
// a category in `message` and the detail in `data`. Operators want the actual
// sentence the chain said — e.g.
//   action declares irrelevant authority 'x@y'; minimum authority is x@active
//   missing authority of x
//   pulse assert failed: overdrawn balance
// — so we extract it and print it verbatim on its own line.

/** Thrown by network.transact() when the node refuses a transaction. */
export class ChainRejection extends Error {
  readonly rpcError: any
  readonly chainMessage: string

  constructor(rpcError: any) {
    const chainMessage = extractChainMessage(rpcError)
    super(chainMessage)
    this.name = 'ChainRejection'
    this.rpcError = rpcError
    this.chainMessage = chainMessage
  }
}

// Specific, well-known refusal sentences. First match wins.
const SPECIFIC: RegExp[] = [
  /(?:pulse|eosio) assert(?:ion)? failed(?::[^\n"]*)?/,
  /assertion failure with message: [^\n"]*/,
  /(?:[a-z]+ )?action declares irrelevant authority '[^']*'; minimum authority is [a-z1-5.]+(?:@[a-z1-5.]+)?/,
  /transaction declares authority '[^']*', but does not have signatures for it[^\n"]*/,
  /missing authority of [a-z1-5.]+(?:@[a-z1-5.]+)?/,
  /transaction bears irrelevant signatures[^\n"]*/,
  /(?:irrelevant authorization exception|unsatisfied authorization)[^\n"]*/,
]

// Category prefixes produced by ChainError's Display impl (and wrappers).
const PREFIXES = [
  'internal error', 'block error', 'parse error', 'authorization error',
  'signature recover error', 'transaction error', 'network error',
  'wasm runtime error', 'apply error', 'database error', 'invalid argument',
  'serialization error', 'action validation error', 'deadline exceeded',
  'RuntimeError', 'Error',
]

function unescapeDebug(s: string): string {
  return s.replace(/\\"/g, '"').replace(/\\\\/g, '\\').replace(/\\n/g, '\n')
}

function stripWrappers(s: string): string {
  let out = s.trim()
  for (let changed = true; changed;) {
    changed = false
    for (const p of PREFIXES) {
      if (out.toLowerCase().startsWith(p.toLowerCase() + ':')) {
        out = out.slice(p.length + 1).trim()
        changed = true
      }
    }
    // Debug-quoted payload: "…"
    if (out.length >= 2 && out.startsWith('"') && out.endsWith('"')) {
      out = unescapeDebug(out.slice(1, -1)).trim()
      changed = true
    }
  }
  return out
}

function textsOf(err: any): string[] {
  if (err === null || err === undefined) return []
  if (typeof err === 'string') return [err]
  const texts: string[] = []
  if (typeof err.data === 'string') texts.push(err.data)
  else if (err.data && typeof err.data === 'object') {
    if (typeof err.data.message === 'string') texts.push(err.data.message)
    texts.push(JSON.stringify(err.data))
  }
  if (typeof err.message === 'string') texts.push(err.message)
  if (err.error) texts.push(...textsOf(err.error))
  if (texts.length === 0) texts.push(JSON.stringify(err))
  return texts
}

/** Best single-line statement of why the chain refused. */
export function extractChainMessage(err: any): string {
  const texts = textsOf(err)
  for (const re of SPECIFIC) {
    for (const t of texts) {
      const m = unescapeDebug(t).match(re)
      if (m) return m[0].trim()
    }
  }
  // Prefer a detailed `data` string over a bare category `message`
  // (e.g. {message: "account_error", data: "account x not found"}).
  const generic = texts.map(stripWrappers).filter(Boolean)
  const detailed = generic.find(t => /\s/.test(t)) ?? generic[0]
  return detailed || JSON.stringify(err)
}
