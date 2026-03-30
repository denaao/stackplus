import { prisma } from '../../lib/prisma'
import { TransactionType } from '@prisma/client'

interface TransactionInput {
  sessionId: string
  userId: string
  type: TransactionType
  amount: number
  chips: number
  note?: string
  registeredBy: string
}

export async function registerTransaction(input: TransactionInput) {
  const session = await prisma.session.findUniqueOrThrow({
    where: { id: input.sessionId },
    include: { homeGame: true },
  })

  if (session.status !== 'ACTIVE') throw new Error('Sessão não está ativa')

  const chipValue = Number(session.chipValue ?? session.homeGame.chipValue)
  const chips = Number(input.chips)
  if (Number.isNaN(chips)) throw new Error('Informe uma quantidade de fichas válida')
  if (input.type === TransactionType.CASHOUT) {
    if (chips < 0) throw new Error('Cashout não pode ter quantidade negativa')
  } else if (chips <= 0) {
    throw new Error('Quantidade de fichas deve ser maior que zero')
  }

  // Always derive money amount from the session chip value to keep each match consistent.
  const amount = Number((chips * chipValue).toFixed(2))

  let state = await prisma.playerSessionState.findUnique({
    where: { sessionId_userId: { sessionId: input.sessionId, userId: input.userId } },
  })

  if (!state && input.type !== TransactionType.BUYIN) {
    throw new Error('Jogador deve fazer buy-in primeiro')
  }

  if (state && input.type === TransactionType.BUYIN) {
    throw new Error('Buy-in já realizado para este jogador')
  }

  if (state?.hasCashedOut) throw new Error('Jogador já realizou cashout nesta sessão')

  if (input.type === TransactionType.CASHOUT) {
    const allStates = await prisma.playerSessionState.findMany({ where: { sessionId: input.sessionId } })
    const remainingChipsInPlay = allStates.reduce((sum, s) => {
      const chipsIn = Number(s.chipsIn)
      const chipsOut = Number(s.chipsOut)
      return sum + (chipsIn - chipsOut)
    }, 0) / chipValue
    if (chips > remainingChipsInPlay) {
      throw new Error('Cashout não pode exceder o total de fichas em jogo')
    }
  }

  const transaction = await prisma.$transaction(async (tx) => {
    const newTx = await tx.transaction.create({
      data: {
        sessionId: input.sessionId,
        userId: input.userId,
        type: input.type,
        amount,
        chips,
        note: input.note,
        registeredBy: input.registeredBy,
      },
    })

    if (!state) {
      state = await tx.playerSessionState.create({
        data: {
          sessionId: input.sessionId,
          userId: input.userId,
          chipsIn: amount,
          currentStack: chips,
        },
        include: { user: { select: { id: true, name: true, avatarUrl: true } } },
      })
    } else {
      let chipsIn = Number(state.chipsIn)
      let chipsOut = Number(state.chipsOut)
      let currentStack = Number(state.currentStack)
      let hasCashedOut = state.hasCashedOut

      if (input.type === TransactionType.BUYIN || input.type === TransactionType.REBUY || input.type === TransactionType.ADDON) {
        chipsIn += amount
        currentStack += chips
      } else if (input.type === TransactionType.CASHOUT) {
        chipsOut += amount
        currentStack = 0
        hasCashedOut = true
      }

      const result = chipsOut - chipsIn

      state = await tx.playerSessionState.update({
        where: { sessionId_userId: { sessionId: input.sessionId, userId: input.userId } },
        data: { chipsIn, chipsOut, currentStack, result, hasCashedOut },
        include: { user: { select: { id: true, name: true, avatarUrl: true } } },
      })
    }

    return { transaction: newTx, playerState: state }
  })

  return transaction
}

export async function getTransactions(sessionId: string, userId?: string) {
  return prisma.transaction.findMany({
    where: { sessionId, ...(userId ? { userId } : {}) },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  })
}
