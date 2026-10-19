import { expect } from 'chai'
import { Serializer } from '@metalblockchain/pulsevm-js'
import {
  NATIVE_AUTH_ABI, deleteAuthData, encodeNativeAction, linkAuthData, nativeAction, unlinkAuthData, updateAuthData,
} from '../../src/utils/nativeActions'
import { buildAuthority, parseAccountSpec } from '../../src/utils/authority'

const decode = (type: string, hex: string) =>
  JSON.parse(JSON.stringify(Serializer.decode({ abi: NATIVE_AUTH_ABI, type, data: hex })))

describe('native auth actions: data shapes', () => {
  it('linkauth = {account, code, type, requirement} (field `type`, per the on-chain system ABI)', () => {
    const data = linkAuthData('myacct', 'pulse.token', 'transfer', 'xfer')
    expect(Object.keys(data)).to.deep.equal(['account', 'code', 'type', 'requirement'])
    const hex = encodeNativeAction('linkauth', data)
    expect(hex.length).to.equal(4 * 16) // four names, 8 bytes each
    expect(decode('linkauth', hex)).to.deep.equal(data)
  })
  it('unlinkauth = {account, code, type}; empty type = any action', () => {
    const data = unlinkAuthData('myacct', 'mycontract', '')
    expect(Object.keys(data)).to.deep.equal(['account', 'code', 'type'])
    const hex = encodeNativeAction('unlinkauth', data)
    expect(hex.endsWith('0000000000000000')).to.equal(true)
    expect(decode('unlinkauth', hex)).to.deep.equal(data)
  })
  it('deleteauth = {account, permission}', () => {
    const data = deleteAuthData('myacct', 'xfer')
    expect(Object.keys(data)).to.deep.equal(['account', 'permission'])
    expect(encodeNativeAction('deleteauth', data)).to.equal('0000000064848c97000000000070d5ea')
  })
  it('updateauth round-trips a multi-key threshold authority', () => {
    const auth = buildAuthority({
      threshold: 2,
      keys: [{ key: 'PUB_K1_6JUE25vLZPM9rfmcMDS1tfEusNDj416FQX4RfuoRA1NvW5A6g7', weight: 1 },
        { key: 'PUB_K1_55SwgLfr9jkwdr2UDncPESQVs3MdDidcLionvogHvCPHz7rtvc', weight: 2 }],
      accounts: [parseAccountSpec('alice1@active'), parseAccountSpec('alice@active')],
    })
    const data = updateAuthData('myacct', 'active', 'owner', auth)
    expect(decode('updateauth', encodeNativeAction('updateauth', data))).to.deep.equal(data)
  })
  it('targets the resolved system account with the given authorization', () => {
    for (const system of ['pulse', 'eosio']) {
      const a = nativeAction(system, 'deleteauth', deleteAuthData('myacct', 'xfer'), [{ actor: 'myacct', permission: 'active' }])
      expect(a.account).to.equal(system)
      expect(a.name).to.equal('deleteauth')
      expect(a.authorization).to.deep.equal([{ actor: 'myacct', permission: 'active' }])
      expect(a.data).to.be.a('string')
    }
  })
})
