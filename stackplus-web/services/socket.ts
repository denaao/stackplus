import { io, Socket } from 'socket.io-client'

let socket: Socket | null = null

export function getSocket(): Socket {
  if (!socket) {
    const stored = localStorage.getItem('stackplus-auth')
    let token = ''
    if (stored) {
      try { token = JSON.parse(stored)?.state?.token || '' } catch {}
    }

    socket = io(process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001', {
      auth: { token },
      // Keep polling fallback enabled for environments where WebSocket upgrade is blocked.
      transports: ['polling', 'websocket'],
    })
  }
  return socket
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}

export function joinSession(sessionId: string): void {
  getSocket().emit('session:join', { sessionId })
}

export function leaveSession(sessionId: string): void {
  getSocket().emit('session:leave', { sessionId })
}
