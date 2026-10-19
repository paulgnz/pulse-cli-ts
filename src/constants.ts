// Network presets. The first entry is the default for a fresh config.
//
// chainId here is only the preset's expectation: endpoint:set stores the
// chain_id the endpoint actually reports, and signing always uses the live
// chain_id of the endpoint being used (see src/utils/chainId.ts).
//
// The XPR 1:1 demo network preset (`pulse-1to1`) was removed when that
// network was retired (2026-10-19). Point at any other PulseVM endpoint with
// `endpoint:set <url>`.
export const networks = [
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
