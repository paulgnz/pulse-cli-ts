import { expect } from 'chai'
import { chooseSystemAccount, detectSystemAccount, SystemProbeRpc } from '../../src/utils/systemDetect'

// Stub RPC: `chain` maps account -> { account?, abi?, codeHash? } responses.
function stubRpc(chain: Record<string, { account?: any; abi?: any; codeHash?: string }>): SystemProbeRpc {
  return {
    async call(method: string, params: any) {
      const e = chain[params.account_name]
      if (!e) throw new Error(`account ${params.account_name} not found`)
      if (method === 'pulsevm.getAccount') {
        if (!e.account) throw new Error('not found')
        return e.account
      }
      if (method === 'pulsevm.getABI') {
        if (!e.abi) throw new Error('no abi')
        return e.abi
      }
      if (method === 'pulsevm.getCodeHash') {
        if (!e.codeHash) throw new Error('Method not found')
        return { account_name: params.account_name, code_hash: e.codeHash }
      }
      throw new Error(`unexpected ${method}`)
    },
  }
}
const ABI = { version: 'eosio::abi/1.1', structs: [{ name: 'x', base: '', fields: [] }], actions: [{ name: 'setcode' }] }

describe('system account detection', () => {
  it('detects eosio on a migrated (Antelope-snapshot) chain', async () => {
    const rpc = stubRpc({ eosio: { account: { account_name: 'eosio', privileged: true }, abi: ABI, codeHash: 'ab'.repeat(32) } })
    expect((await detectSystemAccount(rpc)).name).to.equal('eosio')
  })
  it('detects pulse on a Pulse-native chain', async () => {
    const rpc = stubRpc({ pulse: { account: { account_name: 'pulse', privileged: true }, abi: ABI } })
    expect((await detectSystemAccount(rpc)).name).to.equal('pulse')
  })
  it('prefers the account with an ABI/code over a bare account of the other name', async () => {
    const rpc = stubRpc({
      pulse: { account: { account_name: 'pulse', privileged: false } },
      eosio: { account: { account_name: 'eosio', privileged: true }, abi: ABI },
    })
    expect((await detectSystemAccount(rpc)).name).to.equal('eosio')
  })
  it('treats an all-zero code hash as no code', async () => {
    const rpc = stubRpc({ eosio: { codeHash: '0'.repeat(64) } })
    const { name, probes } = await detectSystemAccount(rpc)
    expect(name).to.equal(undefined)
    expect(probes.every(p => !p.hasCode)).to.equal(true)
  })
  it('returns undefined when neither exists (RPC errors are not fatal)', async () => {
    expect((await detectSystemAccount(stubRpc({}))).name).to.equal(undefined)
  })
  it('breaks exact ties in favour of pulse', () => {
    const p = { exists: true, privileged: true, hasAbi: true, hasCode: false }
    expect(chooseSystemAccount([{ name: 'pulse', ...p }, { name: 'eosio', ...p }])).to.equal('pulse')
  })
})
