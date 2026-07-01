import { createHelia } from 'helia'
import { unixfs } from '@helia/unixfs'

export async function initIPFS(){

 const helia = await createHelia()

 const fs = unixfs(helia)

 return {helia,fs}
}
