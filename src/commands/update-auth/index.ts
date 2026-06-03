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
  static description = 'Set an account permission to a single key via pulse::updateauth'

  static examples = [
    '$ pulse-ts update-auth myacct active owner PUB_K1_...',
    '$ pulse-ts update-auth myacct owner "" PUB_K1_...',
  ]

  static args = [
    { name: 'account', required: true, description: 'Account to modify' },
    { name: 'permission', required: true, description: 'Permission to set (e.g. active, owner)' },
    { name: 'parent', required: true, description: 'Parent permission ("" for owner, "owner" for active)' },
    { name: 'key', required: true, description: 'New public key (PUB_K1_...)' },
  ]

  static flags = {
    'sign-permission': flags.string({ description: 'Permission to authorize with (defaults to the permission being changed)' }),
  }

  async run() {
    const { args, flags: f } = this.parse(UpdateAuth)
    const auth = { threshold: 1, keys: [{ key: args.key, weight: 1 }], accounts: [], waits: [] }
    const data = (Serializer.encode({
      abi: UPDATEAUTH_ABI,
      type: 'updateauth',
      object: { account: args.account, permission: args.permission, parent: args.parent, auth },
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
