import { expect } from 'chai'
import { Serializer, PublicKey } from '@metalblockchain/pulsevm-js'
import {
  buildAuthority, compareKeys, comparePermissionLevels, parseAccountSpec, parseKeySpec, anyActionSentinel,
} from '../../src/utils/authority'

const K_A = 'PUB_K1_55SwgLfr9jkwdr2UDncPESQVs3MdDidcLionvogHvCPHz7rtvc'
const K_B = 'PUB_K1_6JUE25vLZPM9rfmcMDS1tfEusNDj416FQX4RfuoRA1NvW5A6g7'
// A pair whose base58 string order is the OPPOSITE of their binary order —
// String.localeCompare (what pulsevm-js Authority.sort() uses) gets it wrong.
const K_STR_FIRST = 'PUB_K1_6WmBQpQ7QiCUs5hgsAh18fDetdknSj1RrmzqDQvmQWx8d14bTY'
const K_BIN_FIRST = 'PUB_K1_6q5nZSP81cE2mJaZ1LvQ5F3fZEeL2bNz1cB3M3AQ2uUjdgCdKH'
const K_R1 = 'PUB_R1_7mfCkBA2hHkMR9pW8ZAvbpYMY2XxfQ8swWs44pfbFkddMYxBUK'

const packed = (k: string) => Buffer.from((Serializer.encode({ object: PublicKey.from(k) }) as any).array)

describe('authority: parsing', () => {
  it('parses keys with and without weight', () => {
    expect(parseKeySpec(K_A)).to.deep.equal({ key: K_A, weight: 1 })
    expect(parseKeySpec(`${K_A}:3`)).to.deep.equal({ key: K_A, weight: 3 })
  })
  it('normalizes legacy EOS keys to PUB_K1', () => {
    expect(parseKeySpec('EOS6MRyAjQq8ud7hVNYcfnVPJqcVpscN5So8BhtHuGYqET5GDW5CV').key)
      .to.equal('PUB_K1_6MRyAjQq8ud7hVNYcfnVPJqcVpscN5So8BhtHuGYqET5BoDq63')
  })
  it('parses accounts, defaulting the permission to active', () => {
    expect(parseAccountSpec('alice')).to.deep.equal({ permission: { actor: 'alice', permission: 'active' }, weight: 1 })
    expect(parseAccountSpec('alice@owner:2')).to.deep.equal({ permission: { actor: 'alice', permission: 'owner' }, weight: 2 })
    expect(parseAccountSpec('myapp@pulse.code')).to.deep.equal({ permission: { actor: 'myapp', permission: 'pulse.code' }, weight: 1 })
  })
  it('rejects bad weights, keys and names', () => {
    expect(() => parseKeySpec(`${K_A}:0`)).to.throw(/weight/)
    expect(() => parseKeySpec(`${K_A}:65536`)).to.throw(/weight/)
    expect(() => parseKeySpec('PUB_K1_nope')).to.throw(/invalid public key/)
    expect(() => parseAccountSpec('Alice@active')).to.throw(/invalid actor/)
    expect(() => parseAccountSpec('a@b@c')).to.throw(/invalid account authority/)
  })
  it('maps the any-action sentinel to an empty type', () => {
    expect(anyActionSentinel('*')).to.equal('')
    expect(anyActionSentinel('-')).to.equal('')
    expect(anyActionSentinel('transfer')).to.equal('transfer')
  })
})

describe('authority: chain ordering', () => {
  it('orders keys by packed binary form, not by string', () => {
    expect(K_STR_FIRST.localeCompare(K_BIN_FIRST)).to.be.greaterThan(0) // string order says BIN_FIRST first...
    expect(Buffer.compare(packed(K_BIN_FIRST), packed(K_STR_FIRST))).to.be.greaterThan(0) // ...binary says STR_FIRST
    expect(compareKeys(K_STR_FIRST, K_BIN_FIRST)).to.be.lessThan(0)
    const auth = buildAuthority({ keys: [{ key: K_BIN_FIRST, weight: 1 }, { key: K_STR_FIRST, weight: 1 }] })
    expect(auth.keys.map(k => k.key)).to.deep.equal([K_STR_FIRST, K_BIN_FIRST])
  })
  it('matches packed-byte order for any set of keys, K1 before R1', () => {
    const keys = [K_R1, K_BIN_FIRST, K_A, K_STR_FIRST, K_B]
    const ours = [...keys].sort(compareKeys)
    const byBytes = [...keys].sort((a, b) => Buffer.compare(packed(a), packed(b)))
    expect(ours).to.deep.equal(byBytes)
    expect(ours[ours.length - 1]).to.equal(K_R1)
  })
  it('reproduces the order the chain stored for eosio@owner keys', () => {
    // live pulse-1to1 chain: eosio owner keys as returned by pulsevm.getAccount
    expect([K_B, K_A].sort(compareKeys)).to.deep.equal([K_A, K_B])
  })
  it('orders accounts by (actor, permission) name value, not by "actor@perm" string', () => {
    expect('alice1@active' < 'alice@active').to.equal(true)
    const auth = buildAuthority({ accounts: [parseAccountSpec('alice1@active'), parseAccountSpec('alice@active')] })
    expect(auth.accounts.map(a => a.permission.actor)).to.deep.equal(['alice', 'alice1'])
    expect(comparePermissionLevels({ actor: 'bob', permission: 'owner' }, { actor: 'bob', permission: 'active' })).to.be.greaterThan(0)
  })
  it('reproduces chain-stored account orders (admin.proton@light, eosio.prods@active)', () => {
    const light = ['affiliate@verify', 'cryptolions@active', 'eosusa@active', 'glenn@active', 'lnxcafeblock@active',
      'metaldev1@active', 'protonnz@active', 'teamgreymass@active']
    const prods = ['blocksforge@active', 'bloxprod@active', 'brotonbp@active', 'chaininfra@active', 'eosamsterdam@active',
      'eosusa@active', 'fanblock@active', 'genereos@active', 'jennyruan@active', 'madblocks@active', 'protonmadrid@active',
      'protonnz@active', 'protosxpr@active', 'rockeronebp@active', 'saltant@active', 'snipverse@active', 'testalvosec@active',
      'testenergy@active', 'totalproton@active', 'xprdatatest@active', 'xprlabs@active']
    for (const stored of [light, prods]) {
      const shuffled = [...stored].reverse().map(parseAccountSpec)
      const built = buildAuthority({ accounts: shuffled }).accounts.map(a => `${a.permission.actor}@${a.permission.permission}`)
      expect(built).to.deep.equal(stored)
    }
  })
})

describe('authority: validation', () => {
  it('accepts threshold == sum of weights and rejects threshold > sum', () => {
    const keys = [{ key: K_A, weight: 2 }]
    const accounts = [parseAccountSpec('alice@active:1')]
    expect(buildAuthority({ threshold: 3, keys, accounts }).threshold).to.equal(3)
    expect(() => buildAuthority({ threshold: 4, keys, accounts })).to.throw(/exceeds the sum of weights \(3\)/)
  })
  it('rejects zero threshold, empty authorities and duplicates', () => {
    expect(() => buildAuthority({ threshold: 0, keys: [{ key: K_A, weight: 1 }] })).to.throw(/threshold/)
    expect(() => buildAuthority({ threshold: 1 })).to.throw(/at least one/)
    expect(() => buildAuthority({ keys: [{ key: K_A, weight: 1 }, { key: K_A, weight: 2 }] })).to.throw(/duplicate key/)
    expect(() => buildAuthority({ accounts: [parseAccountSpec('bob'), parseAccountSpec('bob@active:2')] })).to.throw(/duplicate account/)
  })
  it('keeps the legacy single-key shape', () => {
    expect(buildAuthority({ keys: [parseKeySpec(K_A)] })).to.deep.equal({
      threshold: 1, keys: [{ key: K_A, weight: 1 }], accounts: [], waits: [],
    })
  })
})
