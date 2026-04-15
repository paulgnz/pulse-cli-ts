#!/usr/bin/env node
// One-off: create a new account on A-Chain Alpine, signed from hello@active.
// Reads the creator's private key from env so nothing secret hits disk.
//
// Usage:
//   CREATOR_PRIV=PVT_K1_... \
//   NEW_ACCOUNT=protonnz \
//   NEW_PUB=PUB_K1_... \
//   node scripts/create-account.mjs
//
// Defaults assume you're creating `protonnz` from `hello` on A-Chain Alpine.

import {
  PulseAPI,
  PrivateKey,
  Name,
  PublicKey,
  Action,
  Transaction,
  SignedTransaction,
  PackedTransaction,
  Authority,
  ABI,
} from '@metalblockchain/pulsevm-js'

// Hand-rolled ABI for the `pulse` account's native newaccount action.
// PulseVM removed `wait_weight` from the authority struct (PROTOCOL.md:52),
// so `waits[]` is intentionally absent below. Matches the on-chain binary
// format exactly; a trailing empty waits array would mis-align the next
// field and the tx would be rejected.
const PULSE_ABI = ABI.from({
  version: 'eosio::abi/1.1',
  types: [],
  structs: [
    {name: 'permission_level', base: '', fields: [
      {name: 'actor', type: 'name'},
      {name: 'permission', type: 'name'},
    ]},
    {name: 'key_weight', base: '', fields: [
      {name: 'key', type: 'public_key'},
      {name: 'weight', type: 'uint16'},
    ]},
    {name: 'permission_level_weight', base: '', fields: [
      {name: 'permission', type: 'permission_level'},
      {name: 'weight', type: 'uint16'},
    ]},
    {name: 'wait_weight', base: '', fields: [
      {name: 'wait_sec', type: 'uint32'},
      {name: 'weight', type: 'uint16'},
    ]},
    {name: 'authority', base: '', fields: [
      {name: 'threshold', type: 'uint32'},
      {name: 'keys', type: 'key_weight[]'},
      {name: 'accounts', type: 'permission_level_weight[]'},
      {name: 'waits', type: 'wait_weight[]'},  // wire-compat with Antelope, empty in PulseVM
    ]},
    {name: 'newaccount', base: '', fields: [
      {name: 'creator', type: 'name'},
      {name: 'name', type: 'name'},
      {name: 'owner', type: 'authority'},
      {name: 'active', type: 'authority'},
    ]},
  ],
  actions: [
    {name: 'newaccount', type: 'newaccount', ricardian_contract: ''},
  ],
  tables: [],
})

const RPC       = process.env.RPC       || 'https://a-chain-alpine.metalblockchain.org/ext/bc/6v9NieZiX3e8eQz3CyJMtXB6YzV2RtnxcRyLAmSgFWWk5Qs6y/rpc'
const CHAIN_ID  = process.env.CHAIN_ID  || '0d6f033e887fae475d641104b6e87762b6c869e87a101afeeb64d608ab376618'
const CREATOR   = process.env.CREATOR   || 'hello'
const NEW_NAME  = process.env.NEW_ACCOUNT || 'protonnz'
const NEW_PUB   = process.env.NEW_PUB   || 'PUB_K1_8d1vGnkRdmXe8W9fP9okRV5TgBqYKETFATztUwkYdu6Ek15rK2'
const PRIV      = process.env.CREATOR_PRIV

if (!PRIV) {
  console.error('CREATOR_PRIV env var is required (PVT_K1_...)')
  process.exit(2)
}

const api = new PulseAPI(RPC)

const info = await api.getInfo()
console.log('chain head:', info.head_block_num?.toString?.() ?? info.head_block_num)

const auth = Authority.from({
  threshold: 1,
  keys: [{key: NEW_PUB, weight: 1}],
  accounts: [],
  waits: [],
})

let action
try {
  action = Action.from({
    account: 'pulse',
    name: 'newaccount',
    authorization: [{actor: CREATOR, permission: 'active'}],
    data: {
      creator: CREATOR,
      name: NEW_NAME,
      owner: {threshold: 1, keys: [{key: NEW_PUB, weight: 1}], accounts: [], waits: []},
      active: {threshold: 1, keys: [{key: NEW_PUB, weight: 1}], accounts: [], waits: []},
    },
  }, PULSE_ABI)
} catch (e) {
  console.error('ACTION.FROM FAILED:')
  console.error(e?.message ?? e)
  console.error('stack:', e?.stack?.split('\n').slice(0, 6).join('\n'))
  process.exit(1)
}
console.log('action built:', action.account.toString() + '@' + action.name.toString(), '(' + (action.data?.length ?? '?') + ' bytes)')

// Derive TAPoS fields directly from head_block_id (no extra RPC call needed —
// pulsevm-js's getBlock has a Serializer bug that we sidestep here).
// Standard Antelope: ref_block_num = head_block_num & 0xFFFF;
// ref_block_prefix  = uint32LE from bytes 8..11 of block id (hex chars 16..23).
const headIdHex = info.head_block_id?.toString?.() ?? String(info.head_block_id)
const headNum = Number(info.head_block_num?.toString?.() ?? info.head_block_num)
const b0 = parseInt(headIdHex.slice(16, 18), 16)
const b1 = parseInt(headIdHex.slice(18, 20), 16)
const b2 = parseInt(headIdHex.slice(20, 22), 16)
const b3 = parseInt(headIdHex.slice(22, 24), 16)
const refPrefixLE = ((b3 << 24) | (b2 << 16) | (b1 << 8) | b0) >>> 0

const tx = Transaction.from({
  expiration: new Date(Date.now() + 120_000).toISOString().slice(0, 19),
  ref_block_num: headNum & 0xffff,
  ref_block_prefix: refPrefixLE >>> 0,
  max_net_usage_words: 0,
  max_cpu_usage_ms: 0,
  delay_sec: 0,
  context_free_actions: [],
  actions: [action],
  transaction_extensions: [],
})

const digest = tx.signingDigest(CHAIN_ID)
const sig = PrivateKey.from(PRIV).signDigest(digest)

const signed = SignedTransaction.from({
  ...tx,
  signatures: [sig.toString()],
  context_free_data: [],
})

const packed = PackedTransaction.fromSigned(signed, 0)
const packedHex = Buffer.from(packed.packed_trx.array ?? packed.packed_trx).toString('hex')
console.log('packed_trx hex bytes:', packedHex.length / 2)

// Raw issueTx — pulsevm-js's pushTransaction wrapper appears to produce
// a params shape pulsevm.* rejects ("Invalid params"). We send the shape
// the protocol documents: {signatures[], compression, packed_trx(hex)}.
const body = {
  jsonrpc: '2.0',
  id: 1,
  method: 'pulsevm.issueTx',
  params: {
    signatures: [sig.toString()],
    compression: 0,
    packed_trx: packedHex,
    packed_context_free_data: '00',  // varuint32(0) = empty context-free-data array
  },
}
const resp = await fetch(RPC, {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify(body),
}).then(r => r.json())
console.log('issueTx response:', JSON.stringify(resp, null, 2))
if (resp.error) process.exit(1)
const txid = resp.result?.tx_id ?? resp.result
console.log('done — verifying account...')

const acc = await api.getAccount(Name.from(NEW_NAME))
console.log(JSON.stringify(acc, null, 2))
