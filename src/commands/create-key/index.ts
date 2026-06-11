import { Command, flags } from '@oclif/command'
import { CliUx } from '@oclif/core'
import { green, cyan, yellow } from 'colors'
import { PrivateKey } from '@metalblockchain/pulsevm-js'
import passwordManager from '../../storage/passwordManager'

export default class CreateKey extends Command {
  static description = 'Generate a new keypair offline (Web Crypto secure random)'

  static examples = [
    '$ pulse-ts create-key',
    '$ pulse-ts create-key --add        # also import into the local wallet',
    '$ pulse-ts create-key --type R1',
  ]

  static flags = {
    type: flags.string({ default: 'K1', options: ['K1', 'R1'], description: 'Key type' }),
    add: flags.boolean({ default: false, description: 'Import the generated key into the local wallet' }),
  }

  async run() {
    const { flags: f } = this.parse(CreateKey)

    const priv = PrivateKey.generate(f.type)
    const pub = priv.toPublic()

    CliUx.ux.log(`${cyan('Private key:')} ${priv.toString()}`)
    CliUx.ux.log(`${cyan('Public key:')}  ${pub.toString()}`)

    if (f.add) {
      await passwordManager.addPrivateKey(priv.toString())
    } else {
      CliUx.ux.log(`\n${yellow('Save the private key now')} — it is not stored. Re-run with ${green('--add')} to keep it in the wallet.`)
    }
  }

  async catch(e: Error) {
    CliUx.ux.error(e.message)
  }
}
