import { Command, flags } from '@oclif/command'
import { CliUx } from '@oclif/core'
import { cyan, gray } from 'colors'
import { network } from '../../storage/networks'
import { detectSystemAccount, getCachedSystemAccount } from '../../storage/systemAccount'

export default class SystemGet extends Command {
  static description = 'Show the system account (pulse / eosio) used for native actions on the current endpoint — auto-detects and caches it if not yet known'

  static examples = [
    '$ pulse-ts system:get',
    '$ pulse-ts system:get --detect   # re-probe the chain, ignoring the cache',
  ]

  static flags = {
    detect: flags.boolean({ default: false, description: 'Probe the chain now and show what was found (does not change the cached value)' }),
  }

  async run() {
    const { flags: f } = this.parse(SystemGet)
    const endpoint = network.endpoint
    if (f.detect) {
      const { name, probes } = await detectSystemAccount(network.rpc)
      for (const p of probes) {
        CliUx.ux.log(`${p.name.padEnd(6)} exists=${p.exists} privileged=${p.privileged} abi=${p.hasAbi} code=${p.hasCode}`)
      }
      CliUx.ux.log(`${cyan('detected:')} ${name ?? '(none)'}  ${gray(`cached: ${getCachedSystemAccount(endpoint) ?? '(none)'}`)}`)
      return
    }
    const cached = getCachedSystemAccount(endpoint)
    const system = await network.systemAccount()
    CliUx.ux.log(`${cyan('system account:')} ${system}  ${gray(`(${cached ? 'cached' : 'auto-detected, now cached'} for ${endpoint})`)}`)
  }
}
