import { flags } from '@oclif/command'
import { CliUx } from '@oclif/core'
import { green, cyan } from 'colors'
import { network } from '../../storage/networks'
import { TxCommand, systemFlag, verboseFlag } from '../../core/txCommand'
import { nativeAction, unlinkAuthData } from '../../utils/nativeActions'
import { anyActionSentinel } from '../../utils/authority'

export default class UnlinkAuth extends TxCommand {
  static description = 'Remove a linkauth mapping via the native unlinkauth (the action falls back to the default active requirement)'

  static examples = [
    '$ pulse-ts unlink-auth myacct pulse.token transfer',
    '$ pulse-ts unlink-auth myacct mycontract "*"',
  ]

  static args = [
    { name: 'account', required: true, description: 'Account that owns the link' },
    { name: 'code', required: true, description: 'Contract account the action belongs to' },
    { name: 'action', required: true, description: 'Action name ("*" or "-" = the any-action link, i.e. empty type)' },
  ]

  static flags = {
    'sign-permission': flags.string({ default: 'active', description: 'Permission of <account> that authorizes the unlinkauth' }),
    'dry-run': flags.boolean({ default: false, description: 'Print the action (with serialized data) and exit without signing' }),
    ...systemFlag,
    ...verboseFlag,
  }

  async run() {
    const { args, flags: f } = this.parse(UnlinkAuth)
    const type = anyActionSentinel(args.action)
    const system = await network.systemAccount(f.system)
    const data = unlinkAuthData(args.account, args.code, type)
    const action = nativeAction(system, 'unlinkauth', data,
      [{ actor: args.account, permission: f['sign-permission'] }])

    if (f['dry-run']) {
      CliUx.ux.styledJSON({ ...action, decoded: data })
      return
    }

    CliUx.ux.action.start(`${system}::unlinkauth ${cyan(`${args.account}: ${args.code}::${type || '*'}`)}`)
    const result = await network.transact({ actions: [action] })
    CliUx.ux.action.stop(green('done'))
    CliUx.ux.log(`${cyan('tx_id:')} ${result.transaction_id}`)
  }
}
