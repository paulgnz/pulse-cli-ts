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

Default network is **A-Chain Alpine** (the PulseVM testnet on Tahoe), public RPC `https://a-chain-alpine.metalblockchain.org/ext/bc/6v9NieZiX3e8eQz3CyJMtXB6YzV2RtnxcRyLAmSgFWWk5Qs6y/rpc`.

```bash
pulse-ts chain:info       # fetch chain head
pulse-ts account pulsebp1 # render an account with permissions + resources
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
- `set-code <account> <wasm-file>` — `pulse::setcode` (deploy a WASM contract)
- `set-abi <account> <abi-file>` — `pulse::setabi` (JSON ABI serialized to binary)
- `update-auth <account> <permission> <parent> <key>` — `pulse::updateauth` (rotate/set a permission's key)
- `push-action <account> <action> <json-data>` — push any contract action (the catch-all, like `cleos push action`)

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

## Deploying a contract

```bash
# 1. Create the contract account (signer must hold creator@active — pulse@active
#    on Alpine, where account creation is gated to the system account)
pulse-ts create-account myapp PUB_K1_<owner> [PUB_K1_<active>]

# 2. Build your contract to WASM with pulse-cdt-rust, then deploy:
pulse-ts set-code myapp ./target/wasm32-unknown-unknown/release/myapp.wasm
pulse-ts set-abi  myapp ./target/myapp.abi.json
```

`create-account`, `set-code`, and `set-abi` all go through the auto-ABI `transact()` path — the on-chain `pulse` ABI defines `newaccount` / `setcode` / `setabi`, so no embedded ABI is needed.

## Known gaps

- `block:get` — pulsevm-js's Serializer chokes on the `get_block_response` shape: three fields PulseVM omits (`schedule_version`, `producer_signature`, `ref_block_prefix`) are required in the type. Fixed in [pulsevm-js#4](https://github.com/MetalBlockchain/pulsevm-js/pulls) (made optional); ungated once that's published and the dep is bumped.
- Contract + account management is covered (`create-account`, `set-code`/`set-abi`, `update-auth`, `push-action`). Still not ported from proton-cli: `msig`, `ram` (market buy/sell), `psr`, `faucet`, `scan`, `transaction:get`. Re-add as the use case arises — `push-action` covers most one-off needs in the meantime.

## Architecture

- `src/storage/networks.ts` — the central shim. Wraps `PulseAPI` in a class exposing proton-js-style `rpc.get_info()`, `rpc.get_account()`, etc., and implements `transact()` via pulsevm-js's `Transaction` + `SignedTransaction` + `PackedTransaction` + `PrivateKey.signDigest`. No keosd needed.
- `src/compat/proton-js.ts` — re-exports pulsevm-js types under `@proton/js` names (`Key`, `Numeric`, `Serialize`, `RpcInterfaces`, `ApiInterfaces`) so the upstream proton-cli command files compile unchanged.
- `src/constants.ts` — network endpoints + chain IDs. Pre-configured for `alpine` (public RPC) and `local` (your own MetalGo node on 127.0.0.1:9650).

## License

MIT — inherited from upstream proton-cli (Syed Jafri @jafri et al).
