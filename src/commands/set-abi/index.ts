import { flags } from '@oclif/command'
import { CliUx } from '@oclif/core'
import { green, cyan } from 'colors'
import { readFileSync } from 'fs'
import { ABI, Serializer } from '@metalblockchain/pulsevm-js'
import { network } from '../../storage/networks'
import { TxCommand, systemFlag, verboseFlag } from '../../core/txCommand'

export default class SetAbi extends TxCommand {
  static description = 'Set a contract ABI on an account via the system account (pulse/eosio) setabi (signer must hold account@active)'

  static examples = [
    '$ pulse-ts set-abi myapp ./target/myapp.abi.json',
  ]

  static args = [
    { name: 'account', required: true, description: 'Contract account' },
    { name: 'abiFile', required: true, description: 'Path to the .abi.json file' },
  ]

  static flags = {
    permission: flags.string({ char: 'p', default: 'active', description: 'Signing permission' }),
    ...systemFlag,
    ...verboseFlag,
  }

  async run() {
    const { args, flags: f } = this.parse(SetAbi)

    // Parse the JSON ABI and serialize it to the canonical binary ABI format
    // that setabi expects (a `bytes` field).
    const abiJson = JSON.parse(readFileSync(args.abiFile, 'utf8'))
    const abi = ABI.from(abiJson)
    const abiBytes = Serializer.encode({ object: abi })
    const abiHex = (abiBytes as any).hexString

    const system = await network.systemAccount(f.system)
    CliUx.ux.action.start(`${system}::setabi ${cyan(args.account)}`)

    const result = await network.transact({
      actions: [{
        account: system,
        name: 'setabi',
        authorization: [{ actor: args.account, permission: f.permission }],
        data: {
          account: args.account,
          abi: abiHex,
        },
      }],
    })

    CliUx.ux.action.stop(green('done'))
    CliUx.ux.log(`${green('setabi applied to')} ${args.account}  ${cyan('tx_id:')} ${result.transaction_id}`)
  }
}
