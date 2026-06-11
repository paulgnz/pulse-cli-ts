import { Command, flags } from '@oclif/command'
import { CliUx } from '@oclif/core'
import { green, cyan } from 'colors'
import { ABI, Serializer } from '@metalblockchain/pulsevm-js'
import { network } from '../../storage/networks'

// updateauth is a NATIVE action — not in any contract ABI — so we embed its
// definition to serialize it ourselves.
const UPDATEAUTH_ABI = ABI.from({
  version: 'eosio::abi/1.1',
  types: [],
  structs: [
    { name: 'permission_level', base: '', fields: [
      { name: 'actor', type: 'name' }, { name: 'permission', type: 'name' } ] },
    { name: 'key_weight', base: '', fields: [
      { name: 'key', type: 'public_key' }, { name: 'weight', type: 'uint16' } ] },
    { name: 'permission_level_weight', base: '', fields: [
      { name: 'permission', type: 'permission_level' }, { name: 'weight', type: 'uint16' } ] },
    { name: 'wait_weight', base: '', fields: [
      { name: 'wait_sec', type: 'uint32' }, { name: 'weight', type: 'uint16' } ] },
    { name: 'authority', base: '', fields: [
      { name: 'threshold', type: 'uint32' },
      { name: 'keys', type: 'key_weight[]' },
      { name: 'accounts', type: 'permission_level_weight[]' },
      { name: 'waits', type: 'wait_weight[]' } ] },
    { name: 'updateauth', base: '', fields: [
      { name: 'account', type: 'name' },
      { name: 'permission', type: 'name' },
      { name: 'parent', type: 'name' },
      { name: 'auth', type: 'authority' } ] },
  ],
  actions: [{ name: 'updateauth', type: 'updateauth', ricardian_contract: '' }],
  tables: [],
})

export default class UpdateAuth extends Command {
  static description = 'Set an account permission to a single key OR an account authority via pulse::updateauth'

  static examples = [
    '$ pulse-ts update-auth myacct active owner PUB_K1_...',
    '$ pulse-ts update-auth myacct owner "" PUB_K1_...',
    '$ pulse-ts update-auth myacct owner "" protonnz@active   # delegate owner to an account',
  ]

  static args = [
    { name: 'account', required: true, description: 'Account to modify' },
    { name: 'permission', required: true, description: 'Permission to set (e.g. active, owner)' },
    { name: 'parent', required: true, description: 'Parent permission ("owner" for active; use "root" or "-" for the empty owner parent)' },
    { name: 'key', required: true, description: 'New PUB_K1_... key, or an actor@permission account authority (e.g. protonnz@active)' },
  ]

  static flags = {
    'sign-permission': flags.string({ description: 'Permission to authorize with (defaults to the permission being changed)' }),
    code: flags.string({ description: 'Also grant a code authority (actor@permission, e.g. myacct@pulse.code) alongside the key — required for a contract account to send inline actions under its own permission' }),
  }

  async run() {
    const { args, flags: f } = this.parse(UpdateAuth)
    // The owner permission has an empty parent (""), but oclif drops a literal ""
    // positional arg — accept "root"/"-"/"null" as sentinels for the empty parent.
    const parent = ['root', '-', 'null', '""', "''"].includes(args.parent) ? '' : args.parent
    // The new authority is either a single key, a single account permission
    // (actor@permission), or — with --code — a key PLUS a code authority. The
    // accounts array must be sorted by {actor, permission}; we only ever add one.
    const acctAuth = (spec: string) => {
      const [actor, permission = 'active'] = spec.split('@')
      return { permission: { actor, permission }, weight: 1 }
    }
    const auth = args.key.includes('@')
      ? { threshold: 1, keys: [], accounts: [acctAuth(args.key)], waits: [] }
      : {
          threshold: 1,
          keys: [{ key: args.key, weight: 1 }],
          accounts: f.code ? [acctAuth(f.code)] : [],
          waits: [],
        }
    const data = (Serializer.encode({
      abi: UPDATEAUTH_ABI,
      type: 'updateauth',
      object: { account: args.account, permission: args.permission, parent, auth },
    }) as any).hexString

    const signPerm = f['sign-permission'] || args.permission
    CliUx.ux.action.start(`updateauth ${cyan(args.account)}@${args.permission} → ${args.key.slice(0, 16)}…`)

    const result = await network.transact({
      actions: [{
        account: 'pulse',
        name: 'updateauth',
        authorization: [{ actor: args.account, permission: signPerm }],
        data,
      }],
    })

    CliUx.ux.action.stop(green('done'))
    CliUx.ux.log(`${cyan('tx_id:')} ${result.transaction_id}`)
  }
}
