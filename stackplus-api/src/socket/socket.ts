import { Server, Socket } from 'socket.io'
import http from 'http'
import { verifyToken } from '../utils/jwt'

let io: Server

export function initSocket(server: http.Server): Server {
  io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
      credentials: true,
    },
  })

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token
    if (token) {
      try {
        socket.data.user = verifyToken(token)
      } catch {
        socket.data.user = null
      }
    }
    next()
  })

  io.on('connection', (socket: Socket) => {
    socket.on('session:join', ({ sessionId }: { sessionId: string }) => {
      socket.join(`session:${sessionId}`)
      socket.to(`session:${sessionId}`).emit('player:joined', {
        socketId: socket.id,
        user: socket.data.user,
      })
    })

    socket.on('session:leave', ({ sessionId }: { sessionId: string }) => {
      socket.leave(`session:${sessionId}`)
    })

    socket.on('disconnect', () => {})
  })

  return io
}

export function getIO(): Server {
  if (!io) throw new Error('Socket.io não inicializado')
  return io
}
