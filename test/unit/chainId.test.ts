import { expect } from 'chai'
import { mergeEndpointOverride, resolveSigningChainId } from '../../src/utils/chainId'

const ALPINE = { chain: 'alpine', endpoints: ['https://alpine.example/rpc'], chainId: '8012f120' }
const DEMO_ID = '71ee83bcf52142d61019d95f9cc5427ba6a0d7ff8accd9e2088ae2abeaf3d3dd'

describe('chain_id handling', () => {
  it('an endpoint override never inherits the preset chain_id', () => {
    const merged = mergeEndpointOverride(ALPINE, { chain: 'alpine', endpoints: ['https://xpr-rpc-testnet.pulsevm.dev'] })
    expect(merged.endpoints).to.deep.equal(['https://xpr-rpc-testnet.pulsevm.dev'])
    expect(merged.chainId).to.equal(undefined)
  })
  it('an override carries the chain_id read from its endpoint', () => {
    const merged = mergeEndpointOverride(ALPINE, { chain: 'alpine', endpoints: ['https://xpr-rpc-testnet.pulsevm.dev'], chainId: DEMO_ID })
    expect(merged.chainId).to.equal(DEMO_ID)
  })
  it('signing uses the endpoint\'s live chain_id and warns on a stale configured one', () => {
    const warnings: string[] = []
    expect(resolveSigningChainId(DEMO_ID, ALPINE.chainId, 'https://xpr-rpc-testnet.pulsevm.dev', m => warnings.push(m))).to.equal(DEMO_ID)
    expect(warnings).to.have.length(1)
    expect(warnings[0]).to.contain(DEMO_ID)
  })
  it('no warning when they agree; falls back to configured when live is missing; errors when neither', () => {
    const warnings: string[] = []
    expect(resolveSigningChainId(DEMO_ID, DEMO_ID, 'x', m => warnings.push(m))).to.equal(DEMO_ID)
    expect(warnings).to.have.length(0)
    expect(resolveSigningChainId(undefined, DEMO_ID, 'x')).to.equal(DEMO_ID)
    expect(() => resolveSigningChainId(undefined, undefined, 'x')).to.throw(/Cannot determine the chain_id/)
  })
})
