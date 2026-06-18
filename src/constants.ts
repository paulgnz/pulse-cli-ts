// A-Chain Alpine = XPR Network's PulseVM testnet on Metal Blockchain (Tahoe)
// Rebooted to v0.4.0 (2026-06-16):
// Subnet ID: xUFn3eJtRSzF3oqJLe3t4xDxWarhbs3nFbMq2k9GjRg6qyMpW
// Blockchain ID: oqo7MbcfygndzzT3wXFQCsPMev2tsxSRUKatvGFMbQLdiqesA
// chain_id: 6a5bdff2ed613954e15c906d8dcc07adb140cd3a70eb8ae587f77417c771672e
export const networks = [
  {
    // 1:1 XPR-migration chain — cpuscale build (CPU_SCALE=143, eosio.14 determinism
    // fixes), fresh-from-704 snapshot. Live 2026-06-19 on Metal Tahoe:
    //   subnet 27qCuxEjUCNo6oGuACiX9mykVyiM5HZsqVKRUveGj4bAge7pzP
    //   blockchain 2R43rJzzRSZNDHaFG7YMeVtPPqnWfMjdv8mDnc53C91zEWdLoC
    //   vmID u4GrN2gLsZrc7emYoe3xMVvBgWqu2MJpNWwFLapki71eCSjsQ
    // chain_id cloned from the real XPR testnet for 1:1 parity. RPC serves raw
    // pulsevm.* at / (Antelope /v1/chain/* via the gateway). Hyperion:
    // https://xpr-hyperion-testnet.pulsevm.dev
    chain: "pulse-1to1",
    endpoints: ["https://xpr-rpc-testnet.pulsevm.dev"],
    chainId:
      "71ee83bcf52142d61019d95f9cc5427ba6a0d7ff8accd9e2088ae2abeaf3d3dd",
  },
  {
    // Self-hosted PulseVM testnet (XPR-testnet snapshot) on Hetzner 5.78.114.28.
    // chain_id verified against pulsevm.getInfo on the REBUILT chain (2026-06-15).
    chain: "pulse-testnet",
    endpoints: ["https://rpc-testnet.pulsevm.dev"],
    chainId:
      "b0f66414aa5b498bcaf099366d92dde9c79b8a40065b43056fb75741e88374bb",
  },
  {
    chain: "alpine",
    // chain-ID-free endpoint (Glenn) — survives chain reboots; only chainId changes
    endpoints: ["https://a-chain-alpine-rpc.metalblockchain.org/rpc"],
    chainId:
      "6a5bdff2ed613954e15c906d8dcc07adb140cd3a70eb8ae587f77417c771672e",
  },
  {
    chain: "local",
    endpoints: [
      "http://127.0.0.1:9650/ext/bc/oqo7MbcfygndzzT3wXFQCsPMev2tsxSRUKatvGFMbQLdiqesA/rpc",
    ],
    chainId:
      "6a5bdff2ed613954e15c906d8dcc07adb140cd3a70eb8ae587f77417c771672e",
  },
];

export type ChainDiscoveryService = {
  chain: string;
  service_url: string;
};

export const EP_DISCOVERY: ChainDiscoveryService[] = [];

// System account name — PulseVM's `eosio` equivalent.
export const SYSTEM_ACCOUNT = "pulse";
