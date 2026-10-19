import { flags } from '@oclif/command'
import { CliUx } from '@oclif/core'
import { green, cyan } from 'colors'
import { network } from '../../storage/networks'
import { TxCommand, systemFlag, verboseFlag } from '../../core/txCommand'
import { linkAuthData, nativeAction } from '../../utils/nativeActions'
import { anyActionSentinel } from '../../utils/authority'

export default class LinkAuth extends TxCommand {
  static description = 'Link a contract action to a permission via the native linkauth (the action then requires <account>@<permission> or higher)'

  static examples = [
    '$ pulse-ts link-auth myacct pulse.token transfer transfer   # myacct@transfer can now sign pulse.token::transfer',
    '$ pulse-ts link-auth myacct mycontract "*" ops               # every mycontract action (empty type) -> myacct@ops',
    '$ pulse-ts link-auth myacct mycontract claim ops --sign-permission owner',
  ]

  static args = [
    { name: 'account', required: true, description: 'Account that owns the permission' },
    { name: 'code', required: true, description: 'Contract account the action belongs to' },
    { name: 'action', required: true, description: 'Action name ("*" or "-" = any action of the contract, i.e. empty type)' },
    { name: 'permission', required: true, description: 'Permission of <account> the action is linked to (the requirement)' },
  ]

  static flags = {
    'sign-permission': flags.string({ default: 'active', description: 'Permission of <account> that authorizes the linkauth (the chain requires the actor to be <account>)' }),
    'dry-run': flags.boolean({ default: false, description: 'Print the action (with serialized data) and exit without signing' }),
    ...systemFlag,
    ...verboseFlag,
  }

  async run() {
    const { args, flags: f } = this.parse(LinkAuth)
    const type = anyActionSentinel(args.action)
    const system = await network.systemAccount(f.system)
    const data = linkAuthData(args.account, args.code, type, args.permission)
    const action = nativeAction(system, 'linkauth', data,
      [{ actor: args.account, permission: f['sign-permission'] }])

    if (f['dry-run']) {
      CliUx.ux.styledJSON({ ...action, decoded: data })
      return
    }

    CliUx.ux.action.start(`${system}::linkauth ${cyan(`${args.code}::${type || '*'}`)} → ${cyan(`${args.account}@${args.permission}`)}`)
    const result = await network.transact({ actions: [action] })
    CliUx.ux.action.stop(green('done'))
    CliUx.ux.log(`${cyan('tx_id:')} ${result.transaction_id}`)
  }
}
