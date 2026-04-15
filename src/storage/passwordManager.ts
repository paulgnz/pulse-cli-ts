import { PrivateKey, PublicKey } from '@metalblockchain/pulsevm-js'
import { CliUx } from '@oclif/core'
import { config } from './config'
import { encryptor } from './encryptor'
import { green } from 'colors'

class PasswordManager {
    password: string = ""

    async lock (password?: string) {
        if (config.get('isLocked')) {
            throw new Error('Wallet is already locked')
        }
        const passwordToLockWith = password || this.password
        const privateKeys = config.get('privateKeys').map(key => encryptor.encrypt(passwordToLockWith, key))
        config.set('privateKeys', privateKeys)
        config.set('isLocked', true)
    }

    async unlock (password?: string) {
        if (!config.get('isLocked')) {
            throw new Error('Wallet is already unlocked')
        }
        const passwordToUnlockWith = password || this.password
        const privateKeys = config.get('privateKeys').map(key => encryptor.decrypt(passwordToUnlockWith, key))
        config.set('privateKeys', privateKeys)
        this.password = passwordToUnlockWith
        config.set('isLocked', false)
    }

    async getPassword() {
        while (!this.password) {
            const enteredPassword = await CliUx.ux.prompt('Please enter your 32 character password', { type: 'hide' })
            this.password = enteredPassword
        }
        return this.password
    }

    async getPrivateKey (publicKey: string): Promise<string | undefined> {
        const target = PublicKey.from(publicKey).toString()
        const privateKeys = await this.getPrivateKeys()
        return privateKeys.find(p => PrivateKey.from(p).toPublic().toString() === target)
    }

    async getPrivateKeys (): Promise<string[]> {
        let privateKeys = config.get('privateKeys')
        if (!privateKeys?.length) return []

        if (config.get('isLocked')) {
            const password = await this.getPassword()
            privateKeys = privateKeys.map((pk: string) => encryptor.decrypt(password, pk))
        }
        return privateKeys
    }

    async getPublicKeys (): Promise<string[]> {
        const privateKeys = await this.getPrivateKeys()
        return privateKeys.map((s: string) => PrivateKey.from(s).toPublic().toString())
    }

    async addPrivateKey (privateKeyStr?: string) {
        if (!privateKeyStr) {
            throw new Error('addPrivateKey requires an explicit PVT_K1_... string. Generate offline (e.g. via 1Password or your existing BP toolchain) and paste it.')
        }
        const pk = PrivateKey.from(privateKeyStr)
        let keyStr = pk.toString()

        if (config.get('isLocked')) {
            const password = await this.getPassword()
            keyStr = encryptor.encrypt(password, keyStr)
        }

        let privateKeys: string[] = await this.getPrivateKeys()
        if (privateKeys.find(k => k === keyStr)) {
            throw new Error('\nPrivate key already exists')
        }
        privateKeys = privateKeys.concat(pk.toString())

        if (config.get('isLocked')) {
            const password = await this.getPassword()
            privateKeys = privateKeys.map(k => encryptor.encrypt(password, k))
        }
        config.set('privateKeys', privateKeys)
        CliUx.ux.log(`${green('Success:')} Added private key for public key: ${pk.toPublic().toString()}\n`)
    }

    async removePrivateKey (privateKey: string) {
        const privateKeys: string[] = await this.getPrivateKeys()
        if (!privateKeys.find(k => k === privateKey)) {
            throw new Error('\nPrivate key does not exist')
        }
        if (privateKeys.length > 0) {
            config.set('privateKeys', privateKeys.filter(k => k !== privateKey))
        } else {
            CliUx.ux.error('You are not allowed to delete your last key')
        }
    }
}

const passwordManager = new PasswordManager()

export default passwordManager
