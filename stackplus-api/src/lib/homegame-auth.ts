import { prisma } from './prisma'

/**
 * Verifica se um usuario tem privilegios de host em um home game.
 * Sao considerados hosts:
 *  - Admins (User.role = ADMIN)
 *  - O dono original do home game (HomeGame.hostId)
 *  - Qualquer co-host (HomeGameMember.role = HOST)
 *
 * Use essa funcao em endpoints que antes faziam `homeGame.hostId === userId`.
 */
export async function isHomeGameHost(userId: string, homeGameId: string): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = prisma as any

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true },
  })
  if (!user) return false
  if (user.role === 'ADMIN') return true

  const homeGame = await db.homeGame.findUnique({
    where: { id: homeGameId },
    select: { hostId: true },
  })
  if (!homeGame) return false
  if (homeGame.hostId === userId) return true

  const member = await db.homeGameMember.findUnique({
    where: { homeGameId_userId: { homeGameId, userId } },
    select: { role: true },
  })
  return member?.role === 'HOST'
}

/**
 * Verifica se o usuario eh o DONO original (imutavel) do home game.
 * Diferente de isHomeGameHost porque co-hosts NAO passam aqui.
 * Use em acoes restritas: promover/rebaixar outros hosts, transferir ownership, deletar home game.
 */
export async function isHomeGameOwner(userId: string, homeGameId: string): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = prisma as any
  const homeGame = await db.homeGame.findUnique({
    where: { id: homeGameId },
    select: { hostId: true },
  })
  return homeGame?.hostId === userId
}

/**
 * Forma compacta para throw-on-fail em services.
 * Lanca Error('Acesso negado') se o usuario nao tem permissao de host.
 */
export async function assertHomeGameHost(userId: string, homeGameId: string): Promise<void> {
  const ok = await isHomeGameHost(userId, homeGameId)
  if (!ok) throw new Error('Acesso negado')
}

export async function assertHomeGameOwner(userId: string, homeGameId: string): Promise<void> {
  const ok = await isHomeGameOwner(userId, homeGameId)
  if (!ok) throw new Error('Acesso negado')
}
