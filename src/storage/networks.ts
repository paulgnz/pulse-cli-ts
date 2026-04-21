// Networks / RPC shim for pulse-cli.
//
// History: upstream proton-cli uses `@proton/js`'s `JsonRpc` (REST `/v1/chain/*`)
// and `Api` for signing + push. PulseVM doesn't expose REST — only JSON-RPC 2.0
// with `pulsevm.*` methods. This file adapts `PulseAPI` (`@metalblockchain/pulsevm-js`)
// to the method names the rest of the CLI expects (`rpc.get_info`, `rpc.get_account`,
// `rpc.get_table_rows`, etc.), so downstream command code can stay largely unchanged.
//
// What's intentionally NOT shimmed:
//   - `get_accounts_by_authorizers` — no PulseVM equivalent. Commands relying
//     on it must route to Hyperion (`/v2/state/get_key_accounts`) when we have
//     one, or be disabled. Shim throws a clear error.
//   - `api.transact(tx)` — rewritten against pulsevm-js primitives
//     (`Transaction`, `SignedTransaction`, `PackedTransaction`, `PrivateKey`).

import {CliUx} from '@oclif/core'
import {
  PulseAPI,
  Name,
  PrivateKey,
  ABI,
  Action,
  Transaction,
  SignedTransaction,
  PackedTransaction,
} from '@metalblockchain/pulsevm-js'
import {green} from 'colors'
import {networks} from '../constants'
import {config} from './config'
import passwordManager from './passwordManager'

type Endpoints = {
  chain: string;
  endpoints: string[];
  chainId?: string;
};

// ----------------------------------------------------------------------------
// PulseRpc — wraps PulseAPI with old-proton-js-shaped read methods.
// ----------------------------------------------------------------------------
export class PulseRpc {
  constructor(public readonly api: PulseAPI, public chainId?: string) {}

  async get_info(): Promise<any> {
    return toPlain(await this.api.getInfo())
  }

  async get_account(accountName: string): Promise<any> {
    return toPlain(await this.api.getAccount(Name.from(accountName)))
  }

  async get_abi(accountName: string): Promise<any> {
    return toPlain(await this.api.getABI(Name.from(accountName)))
  }

  async get_block(arg: {block_num_or_id: number | string} | number | string): Promise<any> {
    const key = typeof arg === 'object' ? arg.block_num_or_id : arg
    return toPlain(await this.api.getBlock(key as any))
  }

  async get_table_rows(params: any): Promise<any> {
    return toPlain(await this.api.getTableRows(params))
  }

  async get_table_by_scope(params: any): Promise<any> {
    return toPlain(await this.api.getTableByScope(params))
  }

  async get_currency_balance(contract: string, account: string, symbol?: string): Promise<any> {
    return toPlain(
      await this.api.getCurrencyBalance(Name.from(contract), Name.from(account), symbol),
    )
  }

  async get_currency_stats(contract: string, symbol: string): Promise<any> {
    const apiAny = this.api as any
    return toPlain(await apiAny.getCurrencyStats(contract, symbol))
  }

  async get_required_keys(args: {transaction: any, available_keys: string[]}): Promise<any> {
    const apiAny = this.api as any
    return toPlain(await apiAny.getRequiredKeys(args))
  }

  async get_producer_schedule(): Promise<any> {
    const apiAny = this.api as any
    return toPlain(await apiAny.getProducerSchedule())
  }

  async get_accounts_by_authorizers(_params: any): Promise<never> {
    throw new Error(
      'get_accounts_by_authorizers is not exposed by PulseVM JSON-RPC. ' +
      'Route this lookup via Hyperion /v2/state/get_key_accounts once it is available.',
    )
  }

  // proton-js-compatible alias used by a handful of commands.
  get_raw_abi = this.get_abi
}

// ----------------------------------------------------------------------------
// Signing helper
// ----------------------------------------------------------------------------
export class PulseSignatureProvider {
  constructor(private privateKeys: string[]) {}

  async getAvailableKeys(): Promise<string[]> {
    return this.privateKeys.map(k => PrivateKey.from(k).toPublic().toString())
  }

  signDigest(digestBytes: Uint8Array): string[] {
    return this.privateKeys.map(k => PrivateKey.from(k).signDigest(digestBytes).toString())
  }
}

// ABI cache — avoids re-fetching the same contract ABI within one session.
const abiCache: Record<string, any> = {}

async function resolveActions(rpc: PulseRpc, rawActions: any[]): Promise<any[]> {
  // For each action: if data is a plain object (not hex string / Uint8Array),
  // fetch the contract ABI and serialize the data. This matches how proton-cli's
  // Api.transact() auto-serializes — any action, any contract, no hard-coding.
  const resolved: any[] = []
  for (const a of rawActions) {
    if (a.data && typeof a.data === 'object' && !(a.data instanceof Uint8Array)) {
      const account = typeof a.account === 'object' ? a.account.toString() : String(a.account)
      if (!abiCache[account]) {
        try {
          const abiResp = await rpc.get_abi(account)
          if (abiResp?.version) {
            // getABI returns the ABI directly (not wrapped in {abi: ...})
            abiCache[account] = ABI.from(abiResp)
          }
        } catch (e: any) {
          // ABI fetch failed — will fall through to Action.from(a) which
          // requires data to already be serialized. Log for debugging.
          console.error(`ABI fetch failed for ${account}: ${e.message}`)
        }
      }
      const abi = abiCache[account]
      if (abi) {
        resolved.push(Action.from(a, abi))
      } else {
        // No ABI on chain — pass as-is and hope data is already serialized
        resolved.push(Action.from(a))
      }
    } else {
      resolved.push(Action.from(a))
    }
  }
  return resolved
}

// Derive ref_block_prefix from head_block_id hex (proven in heartbeat.mjs).
// The get_block response's ref_block_prefix is sometimes 0 or missing on
// PulseVM, so we compute it ourselves from the block id the same way the
// working heartbeat does.
function refPrefixFromId(headIdHex: string): number {
  const b0 = parseInt(headIdHex.slice(16, 18), 16)
  const b1 = parseInt(headIdHex.slice(18, 20), 16)
  const b2 = parseInt(headIdHex.slice(20, 22), 16)
  const b3 = parseInt(headIdHex.slice(22, 24), 16)
  return ((b3 << 24) | (b2 << 16) | (b1 << 8) | b0) >>> 0
}

async function buildAndSign(
  rpc: PulseRpc,
  signer: PulseSignatureProvider,
  txSpec: {actions: any[], context_free_actions?: any[], transaction_extensions?: any[]},
  opts: {expireSeconds?: number} = {},
): Promise<{hex: string, signatures: string[]}> {
  const info = await rpc.get_info()
  const expireSeconds = opts.expireSeconds ?? 120
  const headIdHex = String(info.head_block_id)
  const headNum = Number(info.head_block_num)

  const actions = await resolveActions(rpc, txSpec.actions)
  const tx = Transaction.from({
    expiration: new Date(Date.now() + expireSeconds * 1000)
      .toISOString()
      .slice(0, 19),
    ref_block_num: headNum & 0xFFFF,
    ref_block_prefix: refPrefixFromId(headIdHex),
    max_net_usage_words: 0,
    max_cpu_usage_ms: 0,
    delay_sec: 0,
    context_free_actions: txSpec.context_free_actions ?? [],
    actions,
    transaction_extensions: txSpec.transaction_extensions ?? [],
  } as any)

  const chainId = rpc.chainId
  if (!chainId) throw new Error('PulseRpc missing chain_id — set in constants.ts network entry')

  const signatures = signer.signDigest((tx as any).signingDigest(chainId))
  const signed = SignedTransaction.from({
    ...(tx as any),
    signatures,
    context_free_data: [],
  } as any)
  const packed = PackedTransaction.fromSigned(signed, 0)
  const hex = Buffer.from((packed as any).packed_trx.array ?? (packed as any).packed_trx).toString('hex')
  return {hex, signatures}
}

// ----------------------------------------------------------------------------
// Network — drop-in replacement for the old `network` singleton.
// ----------------------------------------------------------------------------
class Network {
  rpc!: PulseRpc
  api!: PulseAPI

  constructor() {
    this.initialize()
  }

  get chain(): string {
    return (config.get('currentChain') as string) || 'alpine'
  }

  get network() {
    const chain = this.chain
    const overrides = (config.get('endpoints') as Endpoints[]) || []
    const override = overrides.find(e => e.chain === chain)
    if (override) return override
    const stock = networks.find(n => n.chain === chain)
    if (!stock) {
      throw new Error(`Unknown chain "${chain}". Known: ${networks.map(n => n.chain).join(', ')}`)
    }
    return stock
  }

  initialize() {
    const endpoint = this.network.endpoints[0]
    this.api = new PulseAPI(endpoint)
    this.rpc = new PulseRpc(this.api, (this.network as any).chainId)
  }

  async getSignatureProvider(): Promise<PulseSignatureProvider> {
    const privateKeys = await passwordManager.getPrivateKeys()
    return new PulseSignatureProvider(privateKeys)
  }

  async transact(
    transaction: any,
    args: { endpoint?: string, expireSeconds?: number } = {},
  ): Promise<any> {
    const rpc = args.endpoint
      ? new PulseRpc(new PulseAPI(args.endpoint), this.rpc.chainId)
      : this.rpc
    const signer = await this.getSignatureProvider()
    const {hex, signatures} = await buildAndSign(rpc, signer, transaction, {
      expireSeconds: args.expireSeconds ?? 120,
    })

    // Call pulsevm.issueTx directly (same as heartbeat.mjs). The
    // PulseAPI.pushTransaction() path has a PackedTransaction JSON
    // serialization mismatch; this bypasses it.
    const rpcUrl = this.network.endpoints[0]
    const resp: any = await fetch(rpcUrl, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'pulsevm.issueTx',
        params: {
          signatures,
          compression: 0,
          packed_trx: hex,
          packed_context_free_data: '00',
        },
      }),
    }).then((r: any) => r.json())

    if (resp.error) {
      throw new Error(`Chain rejected: ${JSON.stringify(resp.error)}`)
    }
    return {
      transaction_id: resp.result?.txID ?? resp.result,
    }
  }

  setChain(chain: string) {
    const foundChain = networks.find(n => n.chain === chain)
    if (!foundChain) {
      throw new Error(
        `No chain "${chain}". Known: ${networks.map(n => n.chain).join(', ')}`,
      )
    }
    config.set('currentChain', chain)
    this.initialize()
    CliUx.ux.log(`${green('Success:')} Switched to chain ${chain}`)
  }

  setEndpoint(_endpoint: string) {
    this.initialize()
    CliUx.ux.log(`${green('Success:')} Endpoint refreshed`)
  }

  overrideEndpoint(endpointList: string[]) {
    const chain = this.chain
    const endpoints = (config.get('endpoints') as Endpoints[]) || []
    const filtered = endpoints.filter(ep => ep.chain !== chain)
    filtered.push({chain, endpoints: endpointList})
    config.set('endpoints', filtered)
    CliUx.ux.log(`${green('Success:')} Endpoints set to ${endpointList} for ${chain}`)
  }

  getEndpoint(): Endpoints[] | undefined {
    return config.get('endpoints') as Endpoints[] | undefined
  }

  resetEndpoint() {
    const chain = this.chain
    const endpoints = (config.get('endpoints') as Endpoints[]) || []
    config.set('endpoints', endpoints.filter(ep => ep.chain !== chain))
  }
}

export const network = new Network()

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------
function toPlain<T>(v: T): any {
  if (v === null || v === undefined) return v
  // Round-trip through JSON to collapse every pulsevm-js typed wrapper (Name,
  // Asset, UInt64, BlockTimestamp, ...) into its string / primitive form.
  // Each such class defines its own toJSON so JSON.stringify calls them
  // recursively. This gives us the proton-js-equivalent plain-object shape
  // every downstream command expects.
  return JSON.parse(JSON.stringify(v))
}
