import { flags } from '@oclif/command'
import { CliUx } from '@oclif/core'
import { green, cyan } from 'colors'
import { network } from '../../storage/networks'
import { TxCommand, systemFlag, verboseFlag } from '../../core/txCommand'
import { deleteAuthData, nativeAction } from '../../utils/nativeActions'

export default class DeleteAuth extends TxCommand {
  static description = 'Delete a custom permission via the native deleteauth (unlink its actions first — the chain refuses while links exist)'

  static examples = [
    '$ pulse-ts delete-auth myacct ops',
    '$ pulse-ts delete-auth myacct ops --sign-permission owner',
  ]

  static args = [
    { name: 'account', required: true, description: 'Account that owns the permission' },
    { name: 'permission', required: true, description: 'Permission to delete (not owner/active)' },
  ]

  static flags = {
    'sign-permission': flags.string({ default: 'active', description: 'Permission of <account> that authorizes the deleteauth (must satisfy the deleted permission)' }),
    'dry-run': flags.boolean({ default: false, description: 'Print the action (with serialized data) and exit without signing' }),
    ...systemFlag,
    ...verboseFlag,
  }

  async run() {
    const { args, flags: f } = this.parse(DeleteAuth)
    if (args.permission === 'owner' || args.permission === 'active') {
      this.error(`refusing to delete ${args.permission} — the chain does not allow deleting owner/active`)
    }
    const system = await network.systemAccount(f.system)
    const data = deleteAuthData(args.account, args.permission)
    const action = nativeAction(system, 'deleteauth', data,
      [{ actor: args.account, permission: f['sign-permission'] }])

    if (f['dry-run']) {
      CliUx.ux.styledJSON({ ...action, decoded: data })
      return
    }

    CliUx.ux.action.start(`${system}::deleteauth ${cyan(`${args.account}@${args.permission}`)}`)
    const result = await network.transact({ actions: [action] })
    CliUx.ux.action.stop(green('done'))
    CliUx.ux.log(`${cyan('tx_id:')} ${result.transaction_id}`)
  }
}
