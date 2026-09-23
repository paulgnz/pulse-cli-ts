import { expect } from 'chai'
import { PrivateKey } from '@metalblockchain/pulsevm-js'
import {
  AuthorityLike, PermissionLookup, RequiredKeysRpc, declaredLevels, localRequiredKeys, selectRequiredKeys,
} from '../../src/utils/keySelection'

// Throwaway test-only keys (random, not on any account), generated with pulsevm-js.
const OWNER = { pvt: 'PVT_K1_nxMYiqnwLAWq9saxpJZiDZeZJ4YwvN79QN65ZxK2fy2egfptQ', pub: '' }
const BOT = { pvt: 'PVT_K1_rZUqH6FSqnxvpogLgUFjBhE3ZSH3pBXBh9kfCqSrayvEgjMzY', pub: '' }
const COSIGN = { pvt: 'PVT_K1_tiFDUydAFhmHotSvhjsKyGEbTi8JB3Z5fhQ7WoqVgDE5guPgm', pub: '' }
for (const k of [OWNER, BOT, COSIGN]) k.pub = PrivateKey.from(k.pvt).toPublic().toString()

const single = (key: string, weight = 1, threshold = 1): AuthorityLike =>
  ({ threshold, keys: [{ key, weight }], accounts: [] })

function lookupOf(perms: Record<string, AuthorityLike>): PermissionLookup {
  return async (actor, permission) => perms[`${actor}@${permission}`]
}

const chain: Record<string, AuthorityLike> = {
  'alice@owner': single(OWNER.pub),
  'alice@active': single(OWNER.pub),
  'alice@bot': single(BOT.pub),
  'alice@multi': { threshold: 2, keys: [{ key: OWNER.pub, weight: 1 }, { key: BOT.pub, weight: 1 }], accounts: [] },
  'alice@heavy': { threshold: 2, keys: [{ key: OWNER.pub, weight: 1 }, { key: BOT.pub, weight: 2 }], accounts: [] },
  'alice@either': { threshold: 1, keys: [{ key: OWNER.pub, weight: 1 }, { key: BOT.pub, weight: 1 }], accounts: [] },
  'carol@active': { threshold: 1, keys: [], accounts: [{ permission: { actor: 'dave', permission: 'active' }, weight: 1 }] },
  'dave@active': single(COSIGN.pub),
  'loop@active': { threshold: 1, keys: [{ key: BOT.pub, weight: 1 }],
    accounts: [{ permission: { actor: 'loop', permission: 'other' }, weight: 1 }] },
  'loop@other': { threshold: 1, keys: [], accounts: [{ permission: { actor: 'loop', permission: 'active' }, weight: 1 }] },
}
const L = (actor: string, permission: string) => ({ actor, permission })

describe('key selection: local authority-checker emulation', () => {
  it('signs account@bot with ONLY the bot key even when the owner key is in the wallet', async () => {
    const keys = await localRequiredKeys([L('alice', 'bot')], [OWNER.pub, BOT.pub], lookupOf(chain))
    expect(keys).to.deep.equal([BOT.pub])
  })
  it('does not treat a parent (owner) key as satisfying a declared child permission', async () => {
    let err: any
    try {
      await localRequiredKeys([L('alice', 'bot')], [OWNER.pub], lookupOf(chain))
    } catch (e) {
      err = e
    }
    expect(err?.message).to.match(/No combination of wallet keys satisfies alice@bot/)
  })
  it('uses one key when either would do (threshold 1)', async () => {
    const keys = await localRequiredKeys([L('alice', 'either')], [OWNER.pub, BOT.pub], lookupOf(chain))
    expect(keys).to.have.length(1)
  })
  it('uses both keys when the threshold needs both', async () => {
    const keys = await localRequiredKeys([L('alice', 'multi')], [OWNER.pub, BOT.pub], lookupOf(chain))
    expect(new Set(keys)).to.deep.equal(new Set([OWNER.pub, BOT.pub]))
  })
  it('follows the checker order (heaviest first): a weight-2 key alone meets threshold 2', async () => {
    const keys = await localRequiredKeys([L('alice', 'heavy')], [OWNER.pub, BOT.pub], lookupOf(chain))
    expect(keys).to.deep.equal([BOT.pub])
  })
  it('follows account delegations and survives permission cycles', async () => {
    expect(await localRequiredKeys([L('carol', 'active')], [OWNER.pub, COSIGN.pub], lookupOf(chain))).to.deep.equal([COSIGN.pub])
    expect(await localRequiredKeys([L('loop', 'active')], [BOT.pub, OWNER.pub], lookupOf(chain))).to.deep.equal([BOT.pub])
  })
  it('collects distinct declared levels across actions', () => {
    const levels = declaredLevels([
      { authorization: [{ actor: 'alice', permission: 'bot' }] },
      { authorization: [{ actor: 'alice', permission: 'bot' }, { actor: 'carol', permission: 'active' }] },
    ])
    expect(levels).to.deep.equal([L('alice', 'bot'), L('carol', 'active')])
  })
})

describe('key selection: selectRequiredKeys (node first, local fallback)', () => {
  const actions = [{ account: 'eosio.token', name: 'transfer', authorization: [{ actor: 'alice', permission: 'bot' }], data: '00' }]
  const trx = { expiration: '2026-01-01T00:00:00', max_net_usage_words: 0, max_cpu_usage_ms: 0, actions }
  const accountsRpc = (call: RequiredKeysRpc['call']): RequiredKeysRpc => ({
    call,
    async get_account(actor: string) {
      const permissions = Object.entries(chain).filter(([k]) => k.startsWith(`${actor}@`)).map(([k, a]) => ({
        perm_name: k.split('@')[1], parent: 'owner', required_auth: { ...a, waits: [] },
      }))
      if (!permissions.length) throw new Error('not found')
      return { account_name: actor, permissions }
    },
  })

  it('uses the node\'s pulsevm.getRequiredKeys answer', async () => {
    let asked: any
    const rpc = accountsRpc(async (method, params) => {
      asked = { method, params }
      return [BOT.pub]
    })
    const out = await selectRequiredKeys(rpc, [OWNER.pvt, BOT.pvt], actions, trx)
    expect(out).to.deep.equal([BOT.pvt])
    expect(asked.method).to.equal('pulsevm.getRequiredKeys')
    expect(asked.params.trx).to.equal(trx)
    expect(asked.params.candidate_keys).to.have.members([OWNER.pub, BOT.pub])
  })
  it('falls back to local emulation when the node lacks the method', async () => {
    const rpc = accountsRpc(async () => {
      throw new Error('Method not found')
    })
    expect(await selectRequiredKeys(rpc, [OWNER.pvt, BOT.pvt], actions, trx)).to.deep.equal([BOT.pvt])
  })
  it('reports clearly when the node says the wallet cannot satisfy the authority', async () => {
    const rpc = accountsRpc(async () => {
      throw new Error("authorization error: transaction declares authority 'alice@bot' but does not have signatures for it")
    })
    let err: any
    try {
      await selectRequiredKeys(rpc, [OWNER.pvt], actions, trx)
    } catch (e) {
      err = e
    }
    expect(err?.message).to.match(/No combination of wallet keys satisfies alice@bot/)
    expect(err?.message).to.match(/does not have signatures/)
  })
})
