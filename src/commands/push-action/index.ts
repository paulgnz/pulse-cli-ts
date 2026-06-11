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
    actor: flags.string({ char: 'a', description: 'Authorizing actor(s) — comma-separated for multi-auth actions (defaults to the contract account)' }),
    permission: flags.string({ char: 'p', default: 'active', description: 'Signing permission' }),
  }

  async run() {
    const { args, flags: f } = this.parse(PushAction)
    const data = JSON.parse(args.data)
    // accept a comma-separated list of actors for actions needing multiple authorizations
    // Comma-separated authorizations; each entry is "actor" or "actor@permission".
    // --permission is the fallback when an entry omits its own permission.
    //   e.g.  -a protonnz3,pulse                 -> both @active (default)
    //         -a 'protonnz3@owner,pulse@active'  -> mixed permissions
    const auths = (f.actor || args.account).split(',').map((a: string) => a.trim()).filter(Boolean)
      .map((a: string) => {
        const [actor, permission = f.permission] = a.split('@')
        return { actor, permission }
      })

    CliUx.ux.action.start(`${cyan(args.account)}::${cyan(args.action)} (auth ${auths.map((x: {actor: string, permission: string}) => `${x.actor}@${x.permission}`).join(', ')})`)

    const result = await network.transact({
      actions: [{
        account: args.account,
        name: args.action,
        authorization: auths,
        data,
      }],
    })

    CliUx.ux.action.stop(green('done'))
    CliUx.ux.log(`${cyan('tx_id:')} ${result.transaction_id}`)
  }
}
