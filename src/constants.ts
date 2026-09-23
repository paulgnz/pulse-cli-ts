// Network presets. The first entry is the default for a fresh config.
//
// chainId here is only the preset's expectation: endpoint:set stores the
// chain_id the endpoint actually reports, and signing always uses the live
// chain_id of the endpoint being used (see src/utils/chainId.ts).
export const networks = [
  {
    // XPR 1:1 demo network — a PulseVM chain imported from an XPR-testnet
    // snapshot (system account `eosio`; chain_id cloned from XPR testnet for
    // 1:1 parity). RPC serves raw pulsevm.* JSON-RPC.
    // Hyperion: https://xpr-hyperion-testnet.pulsevm.dev
    chain: "pulse-1to1",
    endpoints: ["https://xpr-rpc-testnet.pulsevm.dev"],
    chainId:
      "71ee83bcf52142d61019d95f9cc5427ba6a0d7ff8accd9e2088ae2abeaf3d3dd",
  },
  {
    // A-Chain Alpine — XPR Network's Pulse-native PulseVM testnet on Metal
    // Tahoe (system account `pulse`).
    // Blockchain ID: yQUjkpNYeiJZEn1daa7dQJbysxdXLtz1QhTTdu1mwaxoEJwiJ
    chain: "alpine",
    endpoints: [
      "https://a-chain-alpine.metalblockchain.org/ext/bc/yQUjkpNYeiJZEn1daa7dQJbysxdXLtz1QhTTdu1mwaxoEJwiJ/rpc",
    ],
    chainId:
      "8012f12057c8bb99bf99d9aeceb99ad09102ffc6ca07bc98e806d238aeb02c24",
  },
  {
    // Your own MetalGo node tracking Alpine.
    chain: "local",
    endpoints: [
      "http://127.0.0.1:9650/ext/bc/yQUjkpNYeiJZEn1daa7dQJbysxdXLtz1QhTTdu1mwaxoEJwiJ/rpc",
    ],
    chainId:
      "8012f12057c8bb99bf99d9aeceb99ad09102ffc6ca07bc98e806d238aeb02c24",
  },
];

export type ChainDiscoveryService = {
  chain: string;
  service_url: string;
};

export const EP_DISCOVERY: ChainDiscoveryService[] = [];

// System account: NOT a constant. PulseVM chains use `pulse` (Pulse-native,
// e.g. Alpine) or `eosio` (migrated from Antelope; upstream's node setting
// `system_account`). It is resolved per endpoint — --system flag, else the
// cached value (system:set / previous detection), else auto-detected — see
// src/storage/systemAccount.ts.
