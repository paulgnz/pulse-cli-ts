// Compat layer so legacy proton-cli command code that `import { Key, Numeric,
// Serialize, RpcInterfaces, ApiInterfaces } from '@proton/js'` keeps compiling.
// Re-exports equivalents from pulsevm-js (or shims where no direct analogue
// exists). Delete this file and migrate imports inline once all commands have
// been hand-audited.

export {
  PrivateKey as Key,
  PublicKey,
  Name,
  Asset,
  Checksum256,
  Signature,
  PulseAPI,
} from '@metalblockchain/pulsevm-js'

// Re-export Symbol under a non-conflicting alias. `Symbol` as a top-level
// name collides with the JS built-in, so pulsevm-js doesn't export it. We
// pull it off the Asset namespace (where it lives on pulsevm-js) instead.
import { Asset as _Asset } from '@metalblockchain/pulsevm-js'
export const Symbol = (_Asset as any).Symbol

// Minimal Numeric / Serialize shims — only the handful of members upstream
// proton-cli actually touches. Expand as needed.
import {PrivateKey, PublicKey as PK} from '@metalblockchain/pulsevm-js'

export const Numeric = {
  KeyType: {k1: 0, r1: 1, wa: 2} as const,
  privateKeyToString: (pvt: any) => PrivateKey.from(pvt).toString(),
  publicKeyToString: (pub: any) => (pub instanceof PK ? pub : PK.from(pub)).toString(),
  stringToPrivateKey: (s: string) => PrivateKey.from(s),
  stringToPublicKey: (s: string) => PK.from(s),
}

// We don't (yet) re-export the full @proton/js Serialize namespace — commands
// that need it have been deleted or stubbed. Keeping an empty object so TS
// `import { Serialize } from './compat/proton-js'` at least resolves.
export const Serialize = {} as any

export namespace RpcInterfaces {
  export type Authority = {
    threshold: number
    keys: {key: string, weight: number}[]
    accounts: any[]
    waits: any[]
  }
  export type GetAccountResult = any
  export type GetTableRowsResult = any
  export type PushTransactionArgs = any
  export type ReadOnlyTransactResult = any
}

export namespace ApiInterfaces {
  export type TransactResult = any
}
