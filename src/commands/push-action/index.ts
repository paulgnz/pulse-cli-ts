import { Command, flags } from '@oclif/command'
import { CliUx } from '@oclif/core'
import { green, cyan } from 'colors'
import { network } from '../../storage/networks'

export default class PushAction extends Command {
  static description = 'Push an arbitrary contract action (signs from the local wallet)'

  static examples = [
    `$ pulse-ts push-action paul123 set '{"key":"greeting","value":"hello"}'`,
  ]

  static args = [
    { name: 'account', required: true, description: 'Contract account' },
    { name: 'action', required: true, description: 'Action name' },
    { name: 'data', required: true, description: 'Action data as JSON' },
  ]

  static flags = {
    actor: flags.string({ char: 'a', description: 'Authorizing actor (defaults to the contract account)' }),
    permission: flags.string({ char: 'p', default: 'active', description: 'Signing permission' }),
  }

  async run() {
    const { args, flags: f } = this.parse(PushAction)
    const data = JSON.parse(args.data)
    const actor = f.actor || args.account

    CliUx.ux.action.start(`${cyan(args.account)}::${cyan(args.action)} (auth ${actor}@${f.permission})`)

    const result = await network.transact({
      actions: [{
        account: args.account,
        name: args.action,
        authorization: [{ actor, permission: f.permission }],
        data,
      }],
    })

    CliUx.ux.action.stop(green('done'))
    CliUx.ux.log(`${cyan('tx_id:')} ${result.transaction_id}`)
  }
}
