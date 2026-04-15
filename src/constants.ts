// A-Chain Alpine = XPR Network's PulseVM testnet on Metal Blockchain (Tahoe)
// Subnet ID: zT2upfR4BSC55bvxLSbkuHBAcWL7jeG9aJwo8BdEGvV7NCxLW
// Blockchain ID: 6v9NieZiX3e8eQz3CyJMtXB6YzV2RtnxcRyLAmSgFWWk5Qs6y
// chain_id: 0d6f033e887fae475d641104b6e87762b6c869e87a101afeeb64d608ab376618
export const networks = [
  {
    chain: "alpine",
    endpoints: [
      "https://a-chain-alpine.metalblockchain.org/ext/bc/6v9NieZiX3e8eQz3CyJMtXB6YzV2RtnxcRyLAmSgFWWk5Qs6y/rpc",
    ],
    chainId:
      "0d6f033e887fae475d641104b6e87762b6c869e87a101afeeb64d608ab376618",
  },
  {
    chain: "local",
    endpoints: [
      "http://127.0.0.1:9650/ext/bc/6v9NieZiX3e8eQz3CyJMtXB6YzV2RtnxcRyLAmSgFWWk5Qs6y/rpc",
    ],
    chainId:
      "0d6f033e887fae475d641104b6e87762b6c869e87a101afeeb64d608ab376618",
  },
];

export type ChainDiscoveryService = {
  chain: string;
  service_url: string;
};

export const EP_DISCOVERY: ChainDiscoveryService[] = [];

// System account name — PulseVM's `eosio` equivalent.
export const SYSTEM_ACCOUNT = "pulse";
