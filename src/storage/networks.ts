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

async function buildPackedTx(
  rpc: PulseRpc,
  signer: PulseSignatureProvider,
  txSpec: {actions: any[], context_free_actions?: any[], transaction_extensions?: any[]},
  opts: {expireSeconds?: number, useLastIrreversible?: boolean} = {},
): Promise<PackedTransaction> {
  const info = await rpc.get_info()
  const expireSeconds = opts.expireSeconds ?? 120
  const refBlock = opts.useLastIrreversible
    ? await rpc.get_block(info.last_irreversible_block_num)
    : await rpc.get_block(info.head_block_num)

  const actions = txSpec.actions.map((a: any) => Action.from(a))
  const tx = Transaction.from({
    expiration: new Date(Date.now() + expireSeconds * 1000)
      .toISOString()
      .replace(/\.\d+Z$/, ''),
    ref_block_num: (refBlock.block_num ?? refBlock.number) & 0xFFFF,
    ref_block_prefix: refBlock.ref_block_prefix ?? 0,
    max_net_usage_words: 0,
    max_cpu_usage_ms: 0,
    delay_sec: 0,
    context_free_actions: txSpec.context_free_actions ?? [],
    actions,
    transaction_extensions: txSpec.transaction_extensions ?? [],
  } as any)

  const chainId = rpc.chainId
  if (!chainId) throw new Error('PulseRpc missing chain_id — set in constants.ts network entry')

  const digest = (tx as any).signingDigest(chainId)
  const digestU8 = digest instanceof Uint8Array ? digest : new Uint8Array(digest)
  const signatures = signer.signDigest(digestU8)

  const signed = SignedTransaction.from({
    ...(tx as any),
    signatures,
    context_free_data: [],
  } as any)
  return PackedTransaction.fromSigned(signed, 0 /* compression = none */)
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
    args: { endpoint?: string, expireSeconds?: number, useLastIrreversible?: boolean } = {},
  ): Promise<any> {
    const rpc = args.endpoint
      ? new PulseRpc(new PulseAPI(args.endpoint), this.rpc.chainId)
      : this.rpc
    const signer = await this.getSignatureProvider()
    const packed = await buildPackedTx(rpc, signer, transaction, {
      expireSeconds: args.expireSeconds ?? 120,
      useLastIrreversible: args.useLastIrreversible ?? true,
    })
    const apiAny = rpc.api as any
    const result = await apiAny.pushTransaction(packed)
    return {
      transaction_id: typeof result === 'string' ? result : result?.tx_id ?? result,
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
