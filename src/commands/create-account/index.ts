import { Command, flags } from '@oclif/command'
import { CliUx } from '@oclif/core'
import { green, cyan, yellow } from 'colors'
import { network } from '../../storage/networks'

export default class CreateAccount extends Command {
  static description = 'Create a new account, with RAM + CPU/NET provisioned, via pulse::newaccount + buyrambsys + delegatebw'

  static examples = [
    '$ pulse-ts create-account myapp PUB_K1_8d1vGnk...',
    '$ pulse-ts create-account myapp PUB_K1_owner... PUB_K1_active... --ram-bytes 256000',
  ]

  static args = [
    { name: 'name', required: true, description: 'New account name (a-z, 1-5, max 12 chars)' },
    { name: 'ownerKey', required: true, description: 'Owner public key (PUB_K1_...)' },
    { name: 'activeKey', required: false, description: 'Active public key (defaults to owner key)' },
  ]

  static flags = {
    creator: flags.string({ char: 'c', default: 'pulse', description: 'Creator / payer account (must be in wallet)' }),
    permission: flags.string({ char: 'p', default: 'active', description: 'Creator permission' }),
    'ram-bytes': flags.integer({ default: 8192, description: 'RAM bytes to buy for the new account (bump for contract accounts)' }),
    cpu: flags.string({ default: '1.0000 XPR', description: 'CPU stake to delegate' }),
    net: flags.string({ default: '1.0000 XPR', description: 'NET stake to delegate' }),
    'no-resources': flags.boolean({ default: false, description: 'Only newaccount — skip RAM/CPU/NET (account will be unusable until funded)' }),
  }

  async run() {
    const { args, flags: f } = this.parse(CreateAccount)
    const activeKey = args.activeKey || args.ownerKey
    const creator = f.creator
    const auth = { actor: creator, permission: f.permission }
    const authority = (key: string) => ({ threshold: 1, keys: [{ key, weight: 1 }], accounts: [], waits: [] })

    // A bare newaccount fails — the new account needs RAM to exist and CPU/NET
    // to transact. Bundle newaccount + buyrambsys + delegatebw in one tx, all
    // paid/staked by the creator.
    const actions: any[] = [{
      account: 'pulse',
      name: 'newaccount',
      authorization: [auth],
      data: { creator, name: args.name, owner: authority(args.ownerKey), active: authority(activeKey) },
    }]

    if (!f['no-resources']) {
      actions.push({
        account: 'pulse',
        name: 'buyrambsys',
        authorization: [auth],
        data: { payer: creator, receiver: args.name, bytes: f['ram-bytes'] },
      })
      actions.push({
        account: 'pulse',
        name: 'delegatebw',
        authorization: [auth],
        data: {
          from: creator,
          receiver: args.name,
          stake_net_quantity: f.net,
          stake_cpu_quantity: f.cpu,
          transfer: false,
        },
      })
    }

    CliUx.ux.log(`${yellow('Creating')} ${cyan(args.name)} — creator ${creator}, ` +
      (f['no-resources'] ? 'no resources' : `${f['ram-bytes']}B RAM, ${f.cpu} CPU, ${f.net} NET`))

    const result = await network.transact({ actions })

    CliUx.ux.log(`${green('Created account:')} ${args.name}`)
    CliUx.ux.log(`${cyan('  owner :')} ${args.ownerKey}`)
    CliUx.ux.log(`${cyan('  active:')} ${activeKey}`)
    CliUx.ux.log(`${cyan('  tx_id :')} ${result.transaction_id}`)
  }
}
