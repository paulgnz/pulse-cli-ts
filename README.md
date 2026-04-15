# pulse-cli-ts

> **The proton-cli migration path.** If you're an XPR Network developer with proton-cli muscle memory, this is your CLI for [PulseVM](https://github.com/MetalBlockchain/pulsevm) / A-Chain — same command shape, same flags, same output style, retargeted at PulseVM's JSON-RPC surface via [`@metalblockchain/pulsevm-js`](https://github.com/MetalBlockchain/pulsevm-js).

## Canonical CLI vs this fork

Metallicus ships an official `pulse` CLI written in Rust as part of every [pulsevm release](https://github.com/MetalBlockchain/pulsevm/releases) ([source: `crates/pulse`](https://github.com/MetalBlockchain/pulsevm/tree/main/crates/pulse)). Today it's mostly the wallet-management flow against a local `pulse-keosd` daemon — production BP key management lives there.

`pulse-cli-ts` is **complementary**, not competing. The two surfaces today don't overlap:

| Capability | Canonical `pulse` (Rust) | `pulse-cli-ts` |
|---|---|---|
| Generate keypair offline | `create key --to-console` | (use `pulsevm-js` directly) |
| Create account on chain | `create account` | (defer to canonical) |
| Wallet daemon (keosd) | `wallet:*` against `pulse-keosd` | not its lane |
| Read chain head / info | not yet | `chain:info` |
| Render an account | not yet | `account <name>` |
| Read contract tables | not yet | `table:rows` |
| Push `pulse.token::transfer` | not yet | `transfer <from> <to> <qty> [memo]` |
| Native JS scripting | n/a | yes — same lib it's built on |

XPR developers porting dapps and scripts → use this. Production wallet / signing daemon → canonical `pulse` + `pulse-keosd`. As the canonical CLI gains read+transfer parity, this fork can fold down to whatever's still missing upstream.

## Install

```bash
git clone https://github.com/paulgnz/pulse-cli-ts
cd pulse-cli-ts
npm install
npx tsc -b
./bin/run --help
```

(Once stable, this will publish to npm under `@metalblockchain/pulse-cli` so you can `npm i -g` it.)

## Quick start

Default network is **A-Chain Alpine** (the PulseVM testnet on Tahoe), public RPC `https://a-chain-alpine.metalblockchain.org/ext/bc/6v9NieZiX3e8eQz3CyJMtXB6YzV2RtnxcRyLAmSgFWWk5Qs6y/rpc`.

```bash
./bin/run chain:info       # fetch chain head
./bin/run account pulsebp1 # render an account with permissions + resources
./bin/run network          # show current RPC endpoint
```

## Working subcommands

- `chain:info` / `chain:get` — via `pulsevm.getInfo`
- `account <name>` — via `pulsevm.getAccount`; renders permissions + resource table
- `network` / `endpoint` — config state
- `table:rows <code> <scope> <table>` — via `pulsevm.getTableRows`
- `transfer <from> <to> <quantity> [memo]` — pushes `pulse.token::transfer`, validated end-to-end against A-Chain Alpine
- `key:add / key:get / key:lock / key:unlock / key:reset` — local encrypted keystore

## Sending a signed transfer

```bash
# Add your private key (encrypted on disk under your password)
./bin/run key:add

# Push a transfer — signs in-process, no separate keosd daemon required
./bin/run transfer alice bob "1.0000 XPR" "gm"
```

## Known gaps

- `block:get` — pulsevm-js's Serializer chokes on the `get_block_response` shape. Not diagnosed.
- Most legacy proton-cli commands (`msig`, `contract set`, `permission`, `ram`, `psr`, `faucet`, `scan`, `transaction:get`) were dropped to ship a clean compile. Re-add as the use case arises.

## Architecture

- `src/storage/networks.ts` — the central shim. Wraps `PulseAPI` in a class exposing proton-js-style `rpc.get_info()`, `rpc.get_account()`, etc., and implements `transact()` via pulsevm-js's `Transaction` + `SignedTransaction` + `PackedTransaction` + `PrivateKey.signDigest`. No keosd needed.
- `src/compat/proton-js.ts` — re-exports pulsevm-js types under `@proton/js` names (`Key`, `Numeric`, `Serialize`, `RpcInterfaces`, `ApiInterfaces`) so the upstream proton-cli command files compile unchanged.
- `src/constants.ts` — network endpoints + chain IDs. Pre-configured for `alpine` (public RPC) and `local` (your own MetalGo node on 127.0.0.1:9650).

## License

MIT — inherited from upstream proton-cli (Syed Jafri @jafri et al).
