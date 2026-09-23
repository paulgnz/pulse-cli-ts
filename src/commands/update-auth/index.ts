import { flags } from '@oclif/command'
import { CliUx } from '@oclif/core'
import { green, cyan } from 'colors'
import { network } from '../../storage/networks'
import { TxCommand, systemFlag, verboseFlag } from '../../core/txCommand'
import {
  buildAuthority, describeAuthority, parseAccountSpec, parseKeySpec,
  KeyWeightSpec, AccountWeightSpec,
} from '../../utils/authority'
import { nativeAction, updateAuthData } from '../../utils/nativeActions'

export default class UpdateAuth extends TxCommand {
  static description = 'Set an account permission via the native updateauth: a single key / account, or a full multi-key / multi-account threshold authority'

  static examples = [
    '$ pulse-ts update-auth myacct active owner PUB_K1_...',
    '$ pulse-ts update-auth myacct owner "" PUB_K1_...',
    '$ pulse-ts update-auth myacct owner "" protonnz@active   # delegate owner to an account',
    '$ pulse-ts update-auth myacct active owner --threshold 2 --key PUB_K1_aaa... --key PUB_K1_bbb... --account alice@active',
    '$ pulse-ts update-auth treasury active owner --threshold 3 --key PUB_K1_aaa...:2 --account bob@active:1 --account carol@active:1',
  ]

  static args = [
    { name: 'account', required: true, description: 'Account to modify' },
    { name: 'permission', required: true, description: 'Permission to set (e.g. active, owner)' },
    { name: 'parent', required: true, description: 'Parent permission ("owner" for active; use "root" or "-" for the empty owner parent)' },
    { name: 'key', required: false, description: 'Single-entry form: a PUB_K1_... key or an actor@permission account authority (weight 1). Optional when --key/--account are given' },
  ]

  static flags = {
    'sign-permission': flags.string({ description: 'Permission to authorize with (defaults to the permission being changed)' }),
    code: flags.string({ description: 'Also grant a code authority (actor@permission, e.g. myacct@pulse.code) alongside the key — required for a contract account to send inline actions under its own permission' }),
    threshold: flags.integer({ description: 'Authority threshold (default 1). Must be <= the sum of all weights' }),
    key: flags.string({ multiple: true, description: 'Add a key: PUB_K1_...[:weight] (repeatable, weight defaults to 1)' }),
    account: flags.string({ multiple: true, description: 'Add an account authority: actor@permission[:weight] (repeatable, weight defaults to 1)' }),
    'dry-run': flags.boolean({ default: false, description: 'Print the action (authority + serialized data) and exit without signing' }),
    ...systemFlag,
    ...verboseFlag,
  }

  async run() {
    const { args, flags: f } = this.parse(UpdateAuth)
    // The owner permission has an empty parent (""), but oclif drops a literal ""
    // positional arg — accept "root"/"-"/"null" as sentinels for the empty parent.
    const parent = ['root', '-', 'null', '""', "''"].includes(args.parent) ? '' : args.parent

    const keys: KeyWeightSpec[] = []
    const accounts: AccountWeightSpec[] = []
    const addEntry = (spec: string) => {
      if (spec.includes('@')) accounts.push(parseAccountSpec(spec))
      else keys.push(parseKeySpec(spec))
    }
    if (args.key) addEntry(args.key)
    for (const k of f.key ?? []) keys.push(parseKeySpec(k))
    for (const a of f.account ?? []) accounts.push(parseAccountSpec(a))
    if (f.code) accounts.push(parseAccountSpec(f.code))
    if (keys.length + accounts.length === 0) {
      this.error('give a key / actor@permission positional, or at least one --key / --account')
    }

    let auth
    try {
      // Sorted into chain order (keys by binary key, accounts by name value),
      // duplicates rejected, threshold checked against the weight sum.
      auth = buildAuthority({ threshold: f.threshold ?? 1, keys, accounts })
    } catch (e: any) {
      this.error(e.message)
    }

    const system = await network.systemAccount(f.system)
    const signPerm = f['sign-permission'] || args.permission
    const action = nativeAction(system, 'updateauth',
      updateAuthData(args.account, args.permission, parent, auth),
      [{ actor: args.account, permission: signPerm }])

    if (f['dry-run']) {
      CliUx.ux.styledJSON({ ...action, decoded: updateAuthData(args.account, args.permission, parent, auth) })
      return
    }

    CliUx.ux.action.start(`${system}::updateauth ${cyan(args.account)}@${args.permission} → ${describeAuthority(auth)}`)
    const result = await network.transact({ actions: [action] })
    CliUx.ux.action.stop(green('done'))
    CliUx.ux.log(`${cyan('tx_id:')} ${result.transaction_id}`)
  }
}
