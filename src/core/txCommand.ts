// Base class + shared flags for commands that sign and push a transaction.
//
//  - `--system <name>`: override the chain's system account (pulse / eosio)
//    for commands that send native actions.
//  - `--verbose`: on failure also print the full JSON-RPC error / stack.
//  - catch(): when the chain refuses the tx, print the chain's own message
//    verbatim on its own line instead of a JSON-wrapped generic error.

import { Command, flags } from '@oclif/command'
import { CliUx } from '@oclif/core'
import { red, yellow, gray } from 'colors'
import { ChainRejection } from '../utils/chainError'
import { getHintForError } from '../utils/detailsError'

export const systemFlag = {
  system: flags.string({
    description: 'System account that owns the native actions (pulse on Pulse-native chains, eosio on chains migrated from Antelope). Default: auto-detected per endpoint and cached — see system:get / system:set',
  }),
}

export const verboseFlag = {
  verbose: flags.boolean({ default: false, description: 'On failure, also print the full RPC error' }),
}

export abstract class TxCommand extends Command {
  protected isVerbose(): boolean {
    return this.argv.includes('--verbose') || !!process.env.PULSE_DEBUG
  }

  async catch(e: any) {
    if (CliUx.ux.action.running) CliUx.ux.action.stop(red('failed'))
    if (e instanceof ChainRejection) {
      CliUx.ux.log(red('Chain refused the transaction:'))
      CliUx.ux.log(e.chainMessage)
      const hint = getHintForError(e.chainMessage)
      if (hint) CliUx.ux.log(yellow('Hint: ') + hint)
      if (this.isVerbose()) {
        CliUx.ux.log(gray('Full RPC error:'))
        CliUx.ux.log(JSON.stringify(e.rpcError, null, 2))
      } else {
        CliUx.ux.log(gray('(re-run with --verbose for the full RPC error)'))
      }
      // Not this.exit(1): an ExitError thrown from catch() gets printed as
      // "Error: EEXIT: 1" by oclif's handler.
      process.exitCode = 1
      return
    }
    if (this.isVerbose() && e?.stack) CliUx.ux.log(gray(e.stack))
    throw e
  }
}
