import { Command, flags } from '@oclif/command'
import { CliUx } from '@oclif/core'
import { green, cyan } from 'colors'
import { network } from '../../storage/networks'

export default class CreateAccount extends Command {
  static description = 'Create a new account via pulse::newaccount (signer must hold creator@active)'

  static examples = [
    '$ pulse-ts create-account myapp PUB_K1_8d1vGnk...',
    '$ pulse-ts create-account myapp PUB_K1_owner... PUB_K1_active... --creator pulse',
  ]

  static args = [
    { name: 'name', required: true, description: 'New account name (a-z, 1-5, max 12 chars)' },
    { name: 'ownerKey', required: true, description: 'Owner public key (PUB_K1_...)' },
    { name: 'activeKey', required: false, description: 'Active public key (defaults to owner key)' },
  ]

  static flags = {
    creator: flags.string({ char: 'c', default: 'pulse', description: 'Creator account (must be in wallet)' }),
    permission: flags.string({ char: 'p', default: 'active', description: 'Creator permission' }),
  }

  async run() {
    const { args, flags: f } = this.parse(CreateAccount)
    const activeKey = args.activeKey || args.ownerKey
    const authority = (key: string) => ({
      threshold: 1,
      keys: [{ key, weight: 1 }],
      accounts: [],
      waits: [],
    })

    CliUx.ux.action.start(`Creating ${cyan(args.name)} (creator ${f.creator})`)

    const result = await network.transact({
      actions: [{
        account: 'pulse',
        name: 'newaccount',
        authorization: [{ actor: f.creator, permission: f.permission }],
        data: {
          creator: f.creator,
          name: args.name,
          owner: authority(args.ownerKey),
          active: authority(activeKey),
        },
      }],
    })

    CliUx.ux.action.stop(green('done'))
    CliUx.ux.log(`${green('Created account:')} ${args.name}`)
    CliUx.ux.log(`${cyan('  owner :')} ${args.ownerKey}`)
    CliUx.ux.log(`${cyan('  active:')} ${activeKey}`)
    CliUx.ux.log(`${cyan('  tx_id :')} ${result.transaction_id}`)
  }
}
