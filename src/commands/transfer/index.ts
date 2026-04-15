import { Command, flags } from '@oclif/command'
import { CliUx } from '@oclif/core'
import { green, cyan } from 'colors'
import { network } from '../../storage/networks'

export default class Transfer extends Command {
  static description = 'Transfer tokens via pulse.token::transfer'

  static examples = [
    '$ pulse transfer hello protonnz "10000.0000 XPR"',
    '$ pulse transfer hello protonnz "1.0000 XPR" "gm" --contract pulse.token',
  ]

  static args = [
    { name: 'from', required: true, description: 'Sender account' },
    { name: 'to', required: true, description: 'Recipient account' },
    { name: 'quantity', required: true, description: 'Asset string, e.g. "1.0000 XPR"' },
    { name: 'memo', required: false, default: '', description: 'Optional memo' },
  ]

  static flags = {
    contract: flags.string({ char: 'c', default: 'pulse.token', description: 'Token contract' }),
    permission: flags.string({ char: 'p', default: 'active', description: 'Signing permission' }),
  }

  async run() {
    const { args, flags } = this.parse(Transfer)

    CliUx.ux.action.start(`Transferring ${cyan(args.quantity)} ${args.from} → ${args.to}`)

    const result = await network.transact({
      actions: [{
        account: flags.contract,
        name: 'transfer',
        authorization: [{ actor: args.from, permission: flags.permission }],
        data: {
          from: args.from,
          to: args.to,
          quantity: args.quantity,
          memo: args.memo ?? '',
        },
      }],
    })

    CliUx.ux.action.stop(green('done'))
    CliUx.ux.log(`${cyan('tx_id:')} ${result.transaction_id}`)
  }
}
