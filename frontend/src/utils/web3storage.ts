"use client"

import * as Client from "@web3-storage/w3up-client"

let clientInstance: Client.Client | null = null

/**
 * Lazy-load and initialize the w3up client.
 * In a browser, this loads the agent from IndexedDB if it exists.
 */
export const getWeb3Client = async () => {
    if (clientInstance) return clientInstance
    clientInstance = await Client.create()
    return clientInstance
}

/**
 * Checks if the user has at least one space registered and selected.
 */
export const isStorageReady = async () => {
    try {
        const client = await getWeb3Client()
        const spaces = client.spaces()
        return spaces.length > 0 && !!client.currentSpace()
    } catch {
        return false
    }
}

/**
 * Trigger email-based login flow.
 * The user must click the link in their email to authorize this device.
 */
export const loginToStorage = async (email: string) => {
    const client = await getWeb3Client()
    await client.login(email as `${string}@${string}`)
}

/**
 * Creates and registers a new space for the user.
 * Usually called after login is confirmed.
 */
export const setupSpace = async (name: string = "DMail-Global-Storage") => {
    const client = await getWeb3Client()
    const space = await client.createSpace(name)
    await space.save()
    await client.setCurrentSpace(space.did())
    return space
}

/**
 * Uploads an object (JSON) to Web3.Storage.
 */
export const uploadDataToWeb3 = async (data: object): Promise<string> => {
    const client = await getWeb3Client()
    if (!client.currentSpace()) {
        throw new Error("Storage not configured. Please go to Settings to connect Web3.Storage.")
    }

    const blob = new Blob([JSON.stringify(data)], { type: "application/json" })
    const file = new File([blob], `dmail_${Date.now()}.json`, { type: "application/json" })
    
    // uploadFile returns a CID object
    const cid = await client.uploadFile(file)
    return cid.toString()
}

/**
 * Uploads a raw File/Blob (for attachments).
 */
export const uploadFileToWeb3 = async (file: File): Promise<string> => {
    const client = await getWeb3Client()
    if (!client.currentSpace()) {
        throw new Error("Storage not configured. Please go to Settings to connect Web3.Storage.")
    }

    const cid = await client.uploadFile(file)
    return cid.toString()
}
