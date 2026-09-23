import { expect } from 'chai'
import { ChainRejection, extractChainMessage } from '../../src/utils/chainError'

describe('chain refusal extraction', () => {
  it('pulls the irrelevant-authority sentence out of an authorization error', () => {
    const err = { code: -32000, message: "authorization error: link action declares irrelevant authority 'bob@ops'; minimum authority is bob@active" }
    expect(extractChainMessage(err)).to.equal("link action declares irrelevant authority 'bob@ops'; minimum authority is bob@active")
  })
  it('pulls "missing authority of x"', () => {
    expect(extractChainMessage({ code: -32000, message: 'missing authority of alice' })).to.equal('missing authority of alice')
  })
  it('pulls pulse/eosio assert messages through nested wrappers and Debug quoting', () => {
    const err = { code: -32000, message: 'apply error: wasm runtime error: RuntimeError: pulse assert failed: overdrawn balance' }
    expect(extractChainMessage(err)).to.equal('pulse assert failed: overdrawn balance')
    const quoted = { code: -32000, message: 'internal error: "eosio assert failed: symbol precision mismatch"' }
    expect(extractChainMessage(quoted)).to.equal('eosio assert failed: symbol precision mismatch')
  })
  it('prefers a detailed data string over a bare category message', () => {
    const err = { code: 404, message: 'account_error', data: 'internal error: "account metadata not found for account: 123"' }
    expect(extractChainMessage(err)).to.equal('account metadata not found for account: 123')
  })
  it('strips category prefixes for unknown messages', () => {
    expect(extractChainMessage({ code: -32000, message: 'action validation error: cannot delete active authority' }))
      .to.equal('cannot delete active authority')
  })
  it('ChainRejection carries the verbatim message and the raw error', () => {
    const raw = { code: -32000, message: 'transaction error: missing authority of carol' }
    const e = new ChainRejection(raw)
    expect(e.message).to.equal('missing authority of carol')
    expect(e.chainMessage).to.equal('missing authority of carol')
    expect(e.rpcError).to.equal(raw)
  })
})
