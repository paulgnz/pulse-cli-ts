import { Command, flags } from '@oclif/command'
import { CliUx } from '@oclif/core'
import { red } from 'colors'
import { config } from '../../storage/config'
import passwordManager from '../../storage/passwordManager'
import LockKey from './lock'

export default class AddPrivateKey extends Command {
  static description = 'Import a private key into the local wallet'

  static args = [
    {name: 'privateKey', required: false, description: 'PVT_K1_... (prompted if omitted)'},
  ]

  static flags = {
    'no-encrypt': flags.boolean({ default: false, description: 'Skip the encrypt-with-password prompt (unattended / CI use)' }),
  }

  async run() {
    const {args, flags} = this.parse(AddPrivateKey)

    // Offer to encrypt — but skip if key was passed inline (non-interactive)
    // or if --no-encrypt was given, or if wallet is already locked.
    if (!config.get('isLocked') && !flags['no-encrypt'] && !args.privateKey) {
      try {
        const toEncrypt = await CliUx.ux.confirm('Would you like to encrypt your stored keys with a password? (yes/no)')
        if (toEncrypt) {
          await LockKey.run()
        }
      } catch {
        // Non-interactive terminal — skip encrypt prompt, proceed unlocked.
      }
    }

    // Prompt for key only if not provided as argument
    if (!args.privateKey) {
      try {
        args.privateKey = await CliUx.ux.prompt('Enter private key (starts with PVT_K1)', { type: 'hide' })
      } catch {
        // read -s not supported (e.g. sh, non-interactive). Try plain prompt.
        args.privateKey = await CliUx.ux.prompt('Enter private key (starts with PVT_K1)')
      }
    }

    await passwordManager.addPrivateKey(args.privateKey)
  }

  async catch(e: Error) {
    CliUx.ux.error(red(e.message))
  }
}
