// Native authorization-management actions (updateauth / deleteauth /
// linkauth / unlinkauth). These are implemented by the node itself on the
// system account, so we embed their ABI and serialize the data locally rather
// than depending on whichever contract ABI happens to be on the system account.
//
// Field names/order match PulseVM's genesis system ABI
// (crates/pulsevm_chaindb/src/genesis_pulse_abi.bin) and
// pulse-cdt-rust contracts/pulse_system: linkauth/unlinkauth use `type`
// (Rust struct field `message_type`; binary layout is positional).

import { ABI, Serializer } from '@metalblockchain/pulsevm-js'
import { AuthoritySpec } from './authority'

export const NATIVE_AUTH_ABI = ABI.from({
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
    { name: 'deleteauth', base: '', fields: [
      { name: 'account', type: 'name' },
      { name: 'permission', type: 'name' } ] },
    { name: 'linkauth', base: '', fields: [
      { name: 'account', type: 'name' },
      { name: 'code', type: 'name' },
      { name: 'type', type: 'name' },
      { name: 'requirement', type: 'name' } ] },
    { name: 'unlinkauth', base: '', fields: [
      { name: 'account', type: 'name' },
      { name: 'code', type: 'name' },
      { name: 'type', type: 'name' } ] },
  ],
  actions: [
    { name: 'updateauth', type: 'updateauth', ricardian_contract: '' },
    { name: 'deleteauth', type: 'deleteauth', ricardian_contract: '' },
    { name: 'linkauth', type: 'linkauth', ricardian_contract: '' },
    { name: 'unlinkauth', type: 'unlinkauth', ricardian_contract: '' },
  ],
  tables: [],
})

export type NativeAuthAction = 'updateauth' | 'deleteauth' | 'linkauth' | 'unlinkauth'

export interface UpdateAuthData { account: string; permission: string; parent: string; auth: AuthoritySpec }
export interface DeleteAuthData { account: string; permission: string }
export interface LinkAuthData { account: string; code: string; type: string; requirement: string }
export interface UnlinkAuthData { account: string; code: string; type: string }

export const updateAuthData = (account: string, permission: string, parent: string, auth: AuthoritySpec): UpdateAuthData =>
  ({ account, permission, parent, auth })
export const deleteAuthData = (account: string, permission: string): DeleteAuthData =>
  ({ account, permission })
export const linkAuthData = (account: string, code: string, type: string, requirement: string): LinkAuthData =>
  ({ account, code, type, requirement })
export const unlinkAuthData = (account: string, code: string, type: string): UnlinkAuthData =>
  ({ account, code, type })

/** Serialize native action data to hex with the embedded ABI. */
export function encodeNativeAction(name: NativeAuthAction, data: object): string {
  return (Serializer.encode({ abi: NATIVE_AUTH_ABI, type: name, object: data }) as any).hexString
}

/** Build a ready-to-transact native action on the given system account. */
export function nativeAction(
  system: string,
  name: NativeAuthAction,
  data: object,
  authorization: { actor: string; permission: string }[],
) {
  return { account: system, name, authorization, data: encodeNativeAction(name, data) }
}
