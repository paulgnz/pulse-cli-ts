# pulse-cli-ts

> **The proton-cli migration path.** If you're an XPR Network developer with proton-cli muscle memory, this is your CLI for [PulseVM](https://github.com/MetalBlockchain/pulsevm) / A-Chain — same command shape, same flags, same output style, retargeted at PulseVM's JSON-RPC surface via [`@metalblockchain/pulsevm-js`](https://github.com/MetalBlockchain/pulsevm-js).

## Canonical CLI vs this fork

Metallicus ships an official `pulse` CLI written in Rust as part of every [pulsevm release](https://github.com/MetalBlockchain/pulsevm/releases) ([source: `crates/pulse`](https://github.com/MetalBlockchain/pulsevm/tree/main/crates/pulse)). It's the production / reference tool — only published as **Linux** binaries, and builds from source pull in LLVM 21 + Boost (via the Wasmer/Chainbase deps).

`pulse-ts` is **complementary**, not competing: the **proton-cli-shaped, cross-platform** path. It runs on macOS / Windows / Linux via Node with no build — the canonical Rust CLI's missing cross-platform story. As of today the two are at rough feature parity on the core operator/dev surface:

| Capability | Canonical `pulse` (Rust, Linux) | `pulse-ts` (Node, any OS) |
|---|---|---|
| Chain head / info | `get info` | ✅ `chain:info` |
| Render an account | `get account` | ✅ `account <name>` |
| Transfer tokens | `transfer` | ✅ `transfer` |
| Create account on chain | `create account` | ✅ `create-account` |
| Deploy WASM (`setcode`) | `set code` | ✅ `set-code` |
| Set contract ABI (`setabi`) | `set abi` | ✅ `set-abi` |
| Set a permission (`updateauth`, multi-key / threshold) | `set account permission` | ✅ `update-auth` (`--threshold`, `--key`, `--account`) |
| Link an action to a permission (`linkauth` / `unlinkauth`) | `set action permission` | ✅ `link-auth` / `unlink-auth` |
| Delete a permission (`deleteauth`) | `set account permission … NULL` | ✅ `delete-auth` |
| System account (`pulse` vs `eosio`) | node config | ✅ auto-detected per endpoint; `system:get` / `system:set` / `--system` |
| Read contract tables | — | ✅ `table` |
| Switch network / endpoint | `set url` | ✅ `network` / `endpoint` |
| Generate keypair offline | `create key` | ✅ `create-key` |
| Wallet | keosd daemon (`wallet:*`) | in-process encrypted keystore (`key:*`) — no daemon |
| Native JS scripting | — | ✅ same lib it's built on |
| Install | build from source / Linux binary | `npm i` — Mac/Windows/Linux |

XPR developers porting dapps and scripts, or anyone on a Mac → use `pulse-ts`. Production BP key management with a hardware-backed signing daemon → canonical `pulse` + `pulse-keosd`.

## Install

```bash
git clone https://github.com/paulgnz/pulse-cli-ts
cd pulse-cli-ts
npm install
npx tsc -b
pulse-ts --help
```

(Once stable it'll publish to npm for a one-line `npm i -g` on any OS — final scope TBD with Metallicus, `@metalblockchain/pulse-cli` or a community scope.)

## Quick start

Default network (fresh config) is **`alpine`** (A-Chain Alpine on Tahoe, `https://a-chain-alpine.metalblockchain.org/ext/bc/yQUjkpNYeiJZEn1daa7dQJbysxdXLtz1QhTTdu1mwaxoEJwiJ/rpc`). The other preset is `local` (your own MetalGo node) — switch with `chain:set <name>`, or point at any PulseVM endpoint with `endpoint:set <url>`. (The `pulse-1to1` preset for the XPR 1:1 demo network was removed when that network was retired; XPR→PulseVM cutover testing is in progress.)

`endpoint:set <url>` reads the endpoint's `chain_id` via `pulsevm.getInfo` and stores it (warning if it differs from the preset's), and transactions are always signed for the chain_id the endpoint reports — a custom endpoint never inherits a preset's chain_id.

```bash
pulse-ts chain:info       # fetch chain head
pulse-ts account eosio    # render an account with permissions + resources
pulse-ts network          # show current RPC endpoint
```

## Working subcommands

Reads:
- `chain:info` / `chain:get` — via `pulsevm.getInfo`
- `account <name>` — via `pulsevm.getAccount`; renders permissions + resource table
- `table <contract> <table> <scope>` — via `pulsevm.getTableRows`
- `network` / `endpoint` — config state

Writes (sign in-process from the local keystore, no keosd daemon):
- `transfer <from> <to> <quantity> [memo]` — `pulse.token::transfer`
- `create-account <name> <owner-key> [active-key]` — bundles `newaccount` + `buyrambsys` + `delegatebw` so the new account is usable (has RAM + CPU/NET). Flags: `--ram-bytes`, `--cpu`, `--net`, `--no-resources`.
- `set-code <account> <wasm-file>` — `<system>::setcode` (deploy a WASM contract)
- `set-abi <account> <abi-file>` — `<system>::setabi` (JSON ABI serialized to binary)
- `update-auth <account> <permission> <parent> [key]` — `<system>::updateauth`: a single key / `actor@perm`, or a full threshold authority with `--threshold`, repeatable `--key PUB_…[:weight]` and `--account actor@perm[:weight]`
- `link-auth <account> <code> <action> <permission>` — `<system>::linkauth` (`"*"` = every action of `<code>`)
- `unlink-auth <account> <code> <action>` — `<system>::unlinkauth`
- `delete-auth <account> <permission>` — `<system>::deleteauth` (unlink its actions first)
- `push-action <account> <action> <json-data>` — push any contract action (the catch-all, like `cleos push action`)

System account:
- `system:get [--detect]` — show the system account used for native actions on the current endpoint (`--detect` re-probes and prints what it found)
- `system:set <name>` / `system:set --reset` — pin it for this endpoint, or forget it and auto-detect again

`<system>` above is the chain's system account — see [System account](#system-account-pulse-vs-eosio). Every write command accepts `--verbose`; the ones that send native actions also accept `--system <name>`, and `update-auth` / `link-auth` / `unlink-auth` / `delete-auth` accept `--dry-run` (print the action and its serialized data, sign nothing).

Keys:
- `create-key` — generate a new keypair offline (Web Crypto secure random). `--add` imports it into the wallet; `--type R1` for an R1 key.
- `key:add / key:get / key:lock / key:unlock / key:reset` — local encrypted keystore

## Sending a signed transfer

```bash
# Add your private key (encrypted on disk under your password)
pulse-ts key:add

# Push a transfer — signs in-process, no separate keosd daemon required
pulse-ts transfer alice bob "1.0000 XPR" "gm"
```

Only the keys the chain will actually use are attached: the CLI asks the node (`pulsevm.getRequiredKeys`), or on nodes without it runs the same authority-checker logic locally. So a wallet holding both an account's owner key and a bot key signs `account@bot` with the bot key alone (PulseVM rejects unused signatures as "irrelevant"). A parent's key does not satisfy a declared child permission — declare `@owner` if you mean to sign with the owner key.

## Deploying a contract

```bash
# 1. Create the contract account (signer must hold creator@active — pulse@active
#    on Alpine, where account creation is gated to the system account)
pulse-ts create-account myapp PUB_K1_<owner> [PUB_K1_<active>]

# 2. Build your contract to WASM with pulse-cdt-rust, then deploy:
pulse-ts set-code myapp ./target/wasm32-unknown-unknown/release/myapp.wasm
pulse-ts set-abi  myapp ./target/myapp.abi.json
```

`create-account`, `set-code`, and `set-abi` all go through the auto-ABI `transact()` path — the system account's on-chain ABI defines `newaccount` / `setcode` / `setabi`, so no embedded ABI is needed. (`create-account --creator` defaults to the system account.)

## System account (`pulse` vs `eosio`)

PulseVM chains call their system account either **`pulse`** (Pulse-native chains, e.g. Alpine) or **`eosio`** (chains migrated from an Antelope snapshot — upstream made it the node's `system_account` setting). Native actions (`setcode`, `setabi`, `newaccount`, `updateauth`, `linkauth`, `unlinkauth`, `deleteauth`) must go to that account, so pulse-ts resolves it per endpoint:

1. `--system <name>` on the command, if given (not cached);
2. otherwise the value cached for the current endpoint (`system:set`, or an earlier detection);
3. otherwise auto-detect: probe `pulse` and `eosio` with `pulsevm.getAccount` / `pulsevm.getABI` / `pulsevm.getCodeHash` and pick the one that has an ABI or code (privileged wins ties), then cache it.

```bash
$ pulse-ts system:get --detect        # on a chain migrated from Antelope
pulse  exists=false privileged=false abi=false code=false
eosio  exists=true privileged=true abi=true code=true
detected: eosio  cached: (none)

$ pulse-ts system:get
system account: eosio  (auto-detected, now cached for https://<your-pulsevm-rpc>)

$ pulse-ts system:set pulse            # pin it by hand
$ pulse-ts system:set --reset          # forget it; auto-detect on next use
$ pulse-ts set-code myapp app.wasm --system eosio   # one-off override
```

## Permissions

```bash
# Single key (unchanged form) — rotate myacct@active
pulse-ts update-auth myacct active owner PUB_K1_...

# 2-of-3 active: two keys + a cosigner account, threshold 2
pulse-ts update-auth myacct active owner --threshold 2 \
  --key PUB_K1_aaa... --key PUB_K1_bbb... --account alice@active

# Weighted: key worth 2, two accounts worth 1 each, threshold 3
pulse-ts update-auth treasury active owner --threshold 3 \
  --key PUB_K1_aaa...:2 --account bob@active:1 --account carol@active:1

# Preview the exact action without signing
pulse-ts update-auth treasury active owner --threshold 3 --key PUB_K1_aaa...:2 --account bob@active --dry-run
```

Keys and accounts are sorted the way the chain requires before signing — keys by their binary (packed) form, accounts by `(actor, permission)` name value — duplicates are rejected, and `--threshold` must not exceed the sum of weights (the permission could never be satisfied). Sorting by the text form, as pulsevm-js's `Authority.sort()` does, gets both orders wrong in some cases and the chain refuses the authority as invalid.

Restricting a key to specific actions:

```bash
# create a narrow permission, then link pulse.token::transfer to it
pulse-ts update-auth myacct xfer active PUB_K1_hotkey...
pulse-ts link-auth myacct pulse.token transfer xfer          # signed by myacct@active
pulse-ts link-auth myacct mycontract "*" ops                  # every action of mycontract -> myacct@ops

# undo
pulse-ts unlink-auth myacct pulse.token transfer
pulse-ts delete-auth myacct xfer                              # refused by the chain while links remain
```

`link-auth`, `unlink-auth` and `delete-auth` sign as `<account>@active` by default (`--sign-permission owner` to change it; the chain requires the actor to be `<account>`). The data shapes match the on-chain system ABI: `linkauth {account, code, type, requirement}`, `unlinkauth {account, code, type}`, `deleteauth {account, permission}`.

## When the chain says no

If the node refuses a transaction, pulse-ts prints the chain's own sentence on its own line instead of a JSON-wrapped error:

```
Chain refused the transaction:
link action declares irrelevant authority 'myacct@xfer'; minimum authority is myacct@active
(re-run with --verbose for the full RPC error)
```

Assertion failures (`pulse assert failed: …` / `eosio assert failed: …`) and `missing authority of …` show up the same way. `--verbose` (or `PULSE_DEBUG=1`) also prints the raw JSON-RPC error.

## Tests

```bash
npm run test:unit   # authority sorting/validation, native action data shapes, system-account detection, chain-error extraction — no chain needed
```

## Known gaps

- `block:get` — pulsevm-js's Serializer chokes on the `get_block_response` shape: three fields PulseVM omits (`schedule_version`, `producer_signature`, `ref_block_prefix`) are required in the type. Fixed in [pulsevm-js#4](https://github.com/MetalBlockchain/pulsevm-js/pulls) (made optional); ungated once that's published and the dep is bumped.
- Contract + account management is covered (`create-account`, `set-code`/`set-abi`, `update-auth`, `link-auth`/`unlink-auth`/`delete-auth`, `push-action`). Still not ported from proton-cli: `msig`, `ram` (market buy/sell), `psr`, `faucet`, `scan`, `transaction:get`. Re-add as the use case arises — `push-action` covers most one-off needs in the meantime.

## Architecture

- `src/storage/networks.ts` — the central shim. Wraps `PulseAPI` in a class exposing proton-js-style `rpc.get_info()`, `rpc.get_account()`, etc., and implements `transact()` via pulsevm-js's `Transaction` + `SignedTransaction` + `PackedTransaction` + `PrivateKey.signDigest`. No keosd needed.
- `src/compat/proton-js.ts` — re-exports pulsevm-js types under `@proton/js` names (`Key`, `Numeric`, `Serialize`, `RpcInterfaces`, `ApiInterfaces`) so the upstream proton-cli command files compile unchanged.
- `src/storage/systemAccount.ts` + `src/utils/systemDetect.ts` — per-endpoint system-account resolution (flag → cache → auto-detect).
- `src/utils/authority.ts` / `src/utils/nativeActions.ts` — chain-ordered authority building and the embedded ABI for the native auth actions.
- `src/constants.ts` — network presets (`alpine` default, `local`).

## License

MIT — inherited from upstream proton-cli (Syed Jafri @jafri et al).
