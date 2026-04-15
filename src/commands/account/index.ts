import { Command, flags } from '@oclif/command'
import { CliUx } from '@oclif/core'
import { cyan } from 'colors'
import { network } from '../../storage/networks'
import dedent from 'ts-dedent'
import { parsePermissions } from '../../utils/permissions'
import { generateResourceTable } from '../../utils/resources'

export default class GetAccount extends Command {
  static description = 'Get account information from the PulseVM chain'

  static args = [
    { name: 'account', required: true },
  ]

  static flags = {
    raw: flags.boolean({ char: 'r', default: false, description: 'Output raw JSON' }),
  }

  async run() {
    const { args, flags } = this.parse(GetAccount)

    const account = await network.rpc.get_account(args.account)

    if (flags.raw) {
      CliUx.ux.styledJSON(account)
      return
    }

    CliUx.ux.log(dedent`
      ${cyan('Account:')} ${account.account_name}
      ${cyan('Created:')} ${account.created}
      ${cyan('Privileged:')} ${account.privileged ? 'yes' : 'no'}

      ${cyan('Permissions:')}
      ${parsePermissions(account.permissions)}

      ${cyan('Resources:')}
      ${generateResourceTable(account)}

      ${account.voter_info && account.voter_info.producers && account.voter_info.producers.length
        ? dedent`
          ${cyan('Voting For:')}
          ${account.voter_info.producers.join(', ')}
        `
        : ''
      }
    `.trim())
  }
}
