import { Server, Socket } from 'socket.io'
import http from 'http'
import { verifyToken } from '../utils/jwt'
import { canJoinPrivateSession, canJoinPublicSession } from '../modules/session/session.service'

let io: Server

export function getPrivateSessionRoom(sessionId: string): string {
  return `session:${sessionId}`
}

export function getPublicSessionRoom(sessionId: string): string {
  return `session-public:${sessionId}`
}

export function emitSessionRankingUpdated(sessionId: string, ranking: unknown): void {
  const socketServer = getIO()
  socketServer.to(getPrivateSessionRoom(sessionId)).emit('ranking:updated', ranking)
  socketServer.to(getPublicSessionRoom(sessionId)).emit('ranking:updated', ranking)
}

export function emitSessionFinished(sessionId: string): void {
  const socketServer = getIO()
  socketServer.to(getPrivateSessionRoom(sessionId)).emit('session:finished', { sessionId })
  socketServer.to(getPublicSessionRoom(sessionId)).emit('session:finished', { sessionId })
}

export function initSocket(server: http.Server): Server {
  const configuredOrigins = (process.env.FRONTEND_URL || '')
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean)
  const allowedOrigins = Array.from(new Set([
    ...configuredOrigins,
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ]))

  io = new Server(server, {
    cors: {
      origin: (origin, callback) => {
        if (!origin) return callback(null, true)
        const normalized = origin.replace(/\/$/, '')
        if (allowedOrigins.includes(normalized)) return callback(null, true)
        return callback(null, false)
      },
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
    socket.on('session:join', async ({ sessionId, scope = 'private' }: { sessionId: string; scope?: 'private' | 'public' }) => {
      if (!sessionId) {
        socket.emit('session:join:error', { error: 'Sessão inválida' })
        return
      }

      try {
        if (scope === 'public') {
          const allowed = await canJoinPublicSession(sessionId)
          if (!allowed) {
            socket.emit('session:join:error', { sessionId, scope, error: 'Acesso negado' })
            return
          }

          socket.join(getPublicSessionRoom(sessionId))
          return
        }

        const userId = typeof socket.data.user?.userId === 'string' ? socket.data.user.userId : ''
        if (!userId) {
          socket.emit('session:join:error', { sessionId, scope, error: 'Token não fornecido' })
          return
        }

        const allowed = await canJoinPrivateSession(sessionId, userId)
        if (!allowed) {
          socket.emit('session:join:error', { sessionId, scope, error: 'Acesso negado' })
          return
        }

        const room = getPrivateSessionRoom(sessionId)
        socket.join(room)
        socket.to(room).emit('player:joined', {
          socketId: socket.id,
          user: socket.data.user,
        })
      } catch (error) {
        socket.emit('session:join:error', {
          sessionId,
          scope,
          error: error instanceof Error ? error.message : 'Erro ao entrar na sessão',
        })
      }
    })

    socket.on('session:leave', ({ sessionId, scope = 'private' }: { sessionId: string; scope?: 'private' | 'public' }) => {
      socket.leave(scope === 'public' ? getPublicSessionRoom(sessionId) : getPrivateSessionRoom(sessionId))
    })

    socket.on('disconnect', () => {})
  })

  return io
}

export function getIO(): Server {
  if (!io) throw new Error('Socket.io não inicializado')
  return io
}
