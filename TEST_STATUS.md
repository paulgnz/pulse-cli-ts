# pulse-ts — feature test status

End-to-end verification of every command against **A-Chain Alpine**. Goal: green
across the board before recommending pulse-ts as the cross-platform CLI.

Last run: 2026-06-03 (chain live, head ~237k)

## Read path (no key) — ✅ done

| Command | Status | Notes |
|---|---|---|
| `chain:info` | ✅ | returns full getInfo |
| `chain:list` | ✅ | lists configured networks |
| `chain:get` | ⬜ | not yet run |
| `chain:set <chain>` | ⬜ | mutates config — test last |
| `account <name>` | ⚠️ | works, but leaks pulsevm-js debug noise (`ko {…}`) — cosmetic |
| `table <contract> <table> <scope>` | ✅ | NOTE: arg order is contract/table/scope, **not** `table:rows code scope table` |
| `block:get <n>` | ❌ | dumps Serializer internals instead of the block (pulsevm-js `get_block_response` issue) |
| `network` | ✅ | |
| `endpoint` | ✅ | |
| `endpoint:set <url>` / `endpoint:default` | ⬜ | not yet run |
| `version` | ✅ | prints 0.0.1 |

## Key management — ⬜ pending

| Command | Status | Notes |
|---|---|---|
| `key:add` | ⬜ | import a PVT_K1; supports `--no-encrypt` and inline arg |
| `key:get <pub>` | ⬜ | find priv for a pub |
| `key:lock` / `key:unlock` | ⬜ | |
| `key:reset` | ⬜ | destructive — wipes keystore |

## Write path (needs key) — ⬜ pending

| Command | Status | Notes |
|---|---|---|
| `transfer <from> <to> <qty> [memo]` | ✅ | validated end-to-end earlier (heartbeat) |
| `create-account <name> <ownerKey> [activeKey]` | ⬜ | needs `pulse@active` (account creation gated to system account on Alpine) |
| `set-code <account> <wasm>` | ⬜ | needs contract `account@active` |
| `set-abi <account> <abi.json>` | ⬜ | needs contract `account@active` |

## Known cleanups (cosmetic, not blocking)

- **Debug-log leakage from pulsevm-js** — `account` prints `ko {…}` and `transact()`
  prints `b { array: Uint8Array … }`. These are stray `console.log`s inside
  `@metalblockchain/pulsevm-js`, not our code. Fix: filter in our commands, or
  PR pulsevm-js to drop the logs.
- **`block:get`** — pulsevm-js Serializer can't decode `get_block_response`.
  Either fix the decode path or hide the command until it works.

## Definition of done

All read + key + write commands green, debug noise gone, `block:get` either
fixed or removed. Then: offer to Glenn as the recommended cross-platform CLI.
