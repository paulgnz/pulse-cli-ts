import { config } from "../storage/config"

export function getExplorer () {
	const chain: string = config.get('currentChain')
    if (chain === 'proton') {
        return 'https://explorer.xprnetwork.org'
    } else if (chain === 'proton-test') {
        return 'https://testnet.explorer.xprnetwork.org'
    }

    throw new Error('Chain not supported')
}