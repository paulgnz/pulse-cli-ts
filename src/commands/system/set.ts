import { Command, flags } from '@oclif/command'
import { CliUx } from '@oclif/core'
import { green } from 'colors'
import { network } from '../../storage/networks'
import { clearCachedSystemAccount, setCachedSystemAccount } from '../../storage/systemAccount'

export default class SystemSet extends Command {
  static description = 'Set the system account (pulse / eosio) used for native actions on the current endpoint, overriding auto-detection'

  static examples = [
    '$ pulse-ts system:set eosio',
    '$ pulse-ts system:set pulse',
    '$ pulse-ts system:set --reset   # forget it; auto-detect again on next use',
  ]

  static args = [
    { name: 'name', required: false, description: 'System account name (usually pulse or eosio)' },
  ]

  static flags = {
    reset: flags.boolean({ default: false, description: 'Clear the cached value for this endpoint' }),
  }

  async run() {
    const { args, flags: f } = this.parse(SystemSet)
    const endpoint = network.endpoint
    if (f.reset) {
      clearCachedSystemAccount(endpoint)
      CliUx.ux.log(`${green('Success:')} system account cleared for ${endpoint} (will auto-detect on next use)`)
      return
    }
    if (!args.name) this.error('give a system account name, or --reset')
    try {
      setCachedSystemAccount(endpoint, args.name)
    } catch (e: any) {
      this.error(e.message)
    }
    CliUx.ux.log(`${green('Success:')} system account for ${endpoint} set to ${args.name}`)
  }
}
