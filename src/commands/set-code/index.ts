import { Command, flags } from '@oclif/command'
import { CliUx } from '@oclif/core'
import { green, cyan } from 'colors'
import { readFileSync } from 'fs'
import { network } from '../../storage/networks'

export default class SetCode extends Command {
  static description = 'Deploy a WASM contract to an account via pulse::setcode (signer must hold account@active)'

  static examples = [
    '$ pulse-ts set-code myapp ./target/wasm32-unknown-unknown/release/myapp.wasm',
  ]

  static args = [
    { name: 'account', required: true, description: 'Contract account' },
    { name: 'wasmFile', required: true, description: 'Path to the compiled .wasm file' },
  ]

  static flags = {
    permission: flags.string({ char: 'p', default: 'active', description: 'Signing permission' }),
  }

  async run() {
    const { args, flags: f } = this.parse(SetCode)

    const wasm = readFileSync(args.wasmFile)
    const codeHex = wasm.toString('hex')
    CliUx.ux.action.start(`setcode ${cyan(args.account)} (${(wasm.length / 1024).toFixed(1)} KB)`)

    const result = await network.transact({
      actions: [{
        account: 'pulse',
        name: 'setcode',
        authorization: [{ actor: args.account, permission: f.permission }],
        data: {
          account: args.account,
          vmtype: 0,
          vmversion: 0,
          code: codeHex,
        },
      }],
    })

    CliUx.ux.action.stop(green('done'))
    CliUx.ux.log(`${green('setcode applied to')} ${args.account}  ${cyan('tx_id:')} ${result.transaction_id}`)
  }
}
