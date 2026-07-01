import { createLibp2p } from 'libp2p'
import { webSockets } from '@libp2p/websockets'

export async function startNode(){

 const node = await createLibp2p({
  transports:[webSockets()]
 })

 return node
}
