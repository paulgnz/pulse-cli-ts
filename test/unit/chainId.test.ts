import { expect } from 'chai'
import { mergeEndpointOverride, resolveSigningChainId } from '../../src/utils/chainId'

const ALPINE = { chain: 'alpine', endpoints: ['https://alpine.example/rpc'], chainId: '8012f120' }
const OTHER_ID = '71ee83bcf52142d61019d95f9cc5427ba6a0d7ff8accd9e2088ae2abeaf3d3dd'

describe('chain_id handling', () => {
  it('an endpoint override never inherits the preset chain_id', () => {
    const merged = mergeEndpointOverride(ALPINE, { chain: 'alpine', endpoints: ['https://other.example/rpc'] })
    expect(merged.endpoints).to.deep.equal(['https://other.example/rpc'])
    expect(merged.chainId).to.equal(undefined)
  })
  it('an override carries the chain_id read from its endpoint', () => {
    const merged = mergeEndpointOverride(ALPINE, { chain: 'alpine', endpoints: ['https://other.example/rpc'], chainId: OTHER_ID })
    expect(merged.chainId).to.equal(OTHER_ID)
  })
  it('signing uses the endpoint\'s live chain_id and warns on a stale configured one', () => {
    const warnings: string[] = []
    expect(resolveSigningChainId(OTHER_ID, ALPINE.chainId, 'https://other.example/rpc', m => warnings.push(m))).to.equal(OTHER_ID)
    expect(warnings).to.have.length(1)
    expect(warnings[0]).to.contain(OTHER_ID)
  })
  it('no warning when they agree; falls back to configured when live is missing; errors when neither', () => {
    const warnings: string[] = []
    expect(resolveSigningChainId(OTHER_ID, OTHER_ID, 'x', m => warnings.push(m))).to.equal(OTHER_ID)
    expect(warnings).to.have.length(0)
    expect(resolveSigningChainId(undefined, OTHER_ID, 'x')).to.equal(OTHER_ID)
    expect(() => resolveSigningChainId(undefined, undefined, 'x')).to.throw(/Cannot determine the chain_id/)
  })
})
